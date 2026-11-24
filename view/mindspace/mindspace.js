'use strict';

class MindSpace extends PageController {
  constructor(home) {
    super(['ms-new','ms-new-kind','ms-open','ms-folder','ms-rename','ms-move','ms-retry',
      'ms-link-return','ms-link-returns','ms-sidebar-toggle','ms-sidebar-add','ms-space-open','ms-space-new','ms-entry-menu','ms-space-rename','ms-share','ms-delete','ms-space-delete',
      'ms-card-new','ms-card-edit','ms-column-new','ms-sprint','ms-habits-select','ms-habit-new','ms-sheet-row','ms-sheet-column','ms-sheet-export']);
    this.home = home;
    this.editor = new MindSpaceEditors(this);
    this.reset();
    for (const type of ['input','change','focusin','focusout','keydown','paste']) document.addEventListener(type, event => {
      if (this.enabled() && this.can('edit') && event.target.closest?.('#mindspace-panel')) this.editor.event(type, event);
      if (type === 'keydown' && event.target.closest?.('[role="tablist"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        const tabs = [...document.querySelectorAll('#mindspace-tabs [role="tab"]')];
        const index = tabs.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]?.focus();
      }
    });
    document.addEventListener('toggle', event => {
      const key = event.target.dataset?.msTree;
      if (key && event.target.isConnected) this.rememberTree(key, event.target.open);
    }, true);
    document.addEventListener('click', event => {
      if (!event.target.closest?.('#ms-context-menu,[data-action="ms-entry-menu"]')) this.closeMenu();
    });
    document.addEventListener('keydown', event => this.menuKeydown(event));
    document.defaultView?.addEventListener('resize', () => this.closeMenu());
    document.addEventListener('scroll', event => {
      if (!event.target.closest?.('#ms-context-menu')) this.closeMenu();
    }, true);
    document.addEventListener('dragstart', event => {
      const entry = event.target.closest?.('[data-ms-draggable]');
      if (!entry) return;
      this.draggingId = Number(entry.dataset.msDraggable);
      event.dataTransfer.setData('application/x-mindspace-item', String(this.draggingId));
      event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', event => {
      const target = event.target.closest?.('[data-ms-drop]');
      if (!this.draggingId || !target || !this.canDrop(this.draggingId, target)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.ms-drop-target').forEach(el => el.classList.remove('ms-drop-target'));
      target.classList.add('ms-drop-target');
    });
    document.addEventListener('dragend', () => this.clearDrag());
    document.addEventListener('drop', event => {
      const target = event.target.closest?.('[data-ms-drop]'), id = this.draggingId;
      if (!id || !target) return;
      event.preventDefault();
      if (!this.canDrop(id, target)) { this.clearDrag(); return; }
      const parent = Number(target.dataset.msDrop) || null;
      this.clearDrag();
      void this.move(id, parent).catch(error => toast(error.message, true));
    });
  }

  reset() {
    this.closeMenu();
    clearTimeout(this.timer);
    this.generation = (this.generation || 0) + 1;
    this.active = null; this.draft = null; this.baseline = ''; this.busy = false;
    this.error = ''; this.savePromise = null; this.draggingId = null;
    this.sidebarExpanded = undefined; this.treeExpanded = undefined; this.linkArrival = null;
  }
  enabled() { return !!S.data?.mindspace; }
  can(right, item = this.active) { return !S.sharedWorkspace || !!(item?.permissions || S.sharedWorkspace.permissions)[right]; }
  allItems() { return S.data?.mindspace?.items || []; }
  spaces() { return S.data?.mindspace?.spaces || (this.enabled() ? [{ id:S.data.mindspace.id, name:S.data.mindspace.name || 'MindSpace' }] : []); }
  spaceId() {
    const params = new URL(location.href).searchParams;
    const target = params.has('folder') ? this.allItems().find(item => item.kind === 'folder' && item.id === Number(params.get('folder')))
      : params.has('item') ? this.allItems().find(item => item.id === Number(params.get('item')))
      : this.allItems().find(item => item.kind === 'diagram' && item.diagram_id === Number(params.get('diagram')));
    return target?.mindspace_id || this.spaces().find(space => space.id === Number(params.get('space')))?.id || S.data?.mindspace?.id;
  }
  spaceName(spaceId = this.spaceId()) { return this.spaces().find(space => space.id === spaceId)?.name || 'MindSpace'; }
  items(spaceId = this.spaceId()) { return this.allItems().filter(item => (item.mindspace_id || S.data?.mindspace?.id) === spaceId); }
  kindIcon(kind) { return icon({ folder:'folder', diagram:'branch', spreadsheet:'table', kanban:'overview', scrum:'overview', habits:'habits', notes:'book' }[kind] || 'book'); }
  kindLabel(kind) { return t(`ms_kind_${kind}`); }
  folderId() { return this.active?.kind === 'folder' ? this.active.id : this.active?.parent_id || null; }
  isDiagram() { return this.enabled() && this.active?.kind === 'diagram'; }
  dirty() { return !!this.active && !['diagram','folder'].includes(this.active.kind) && JSON.stringify(this.draft) !== this.baseline; }
  isEditing() { return this.busy || !!this.savePromise || this.dirty() || !!this.error; }

  resolve() {
    const url = new URL(location.href), items = this.items();
    const chosen = url.searchParams.has('folder') ? items.find(item => item.kind === 'folder' && item.id === Number(url.searchParams.get('folder')))
      : url.searchParams.has('item') ? items.find(item => item.id === Number(url.searchParams.get('item')))
      : items.find(item => item.diagram_id === Number(url.searchParams.get('diagram'))) || items.find(item => item.kind === 'diagram') || items[0];
    if (!this.active || this.active.id !== chosen?.id || !this.isEditing()) {
      this.active = chosen ? JSON.parse(JSON.stringify(chosen)) : null;
      this.draft = chosen ? JSON.parse(JSON.stringify(chosen.content)) : null;
      if (chosen?.kind === 'spreadsheet') this.draft.cells = { ...this.draft.cells };
      this.baseline = JSON.stringify(this.draft);
    }
  }

  pathTo(id, spaceId = this.spaceId()) {
    const path = [], seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const folder = this.items(spaceId).find(item => item.id === id && item.kind === 'folder');
      if (!folder) break;
      path.unshift(folder); id = folder.parent_id;
    }
    return path;
  }

  tabs() {
    const docs = this.items().filter(item => item.kind !== 'folder');
    return docs.map((item, index) => `<button type="button" role="tab" id="ms-tab-${item.id}" aria-controls="mindspace-panel"
      aria-selected="${item.id === this.active?.id}" tabindex="${item.id === this.active?.id || (!this.active && index === 0) ? 0 : -1}"
      draggable="true" data-ms-draggable="${item.id}" data-action="ms-open" data-id="${item.id}" title="${esc(item.name)}">
      ${this.kindIcon(item.kind)}<span>${esc(item.name)}</span></button>`).join('');
  }

  sidebarKey() { return `mindspace-sidebar:${new URL(location.href).pathname}:${S.user?.id || 'guest'}`; }
  sidebarOpen() {
    if (this.sidebarExpanded === undefined) {
      try { this.sidebarExpanded = localStorage.getItem(this.sidebarKey()) !== 'closed'; }
      catch { this.sidebarExpanded = true; }
    }
    return this.sidebarExpanded;
  }
  toggleSidebar() {
    const open = !this.sidebarOpen(); this.sidebarExpanded = open;
    try { localStorage.setItem(this.sidebarKey(), open ? 'open' : 'closed'); } catch {}
    document.getElementById('mindspace-sidebar-toggle')?.setAttribute('aria-expanded', String(open));
    const list = document.getElementById('mindspace-sidebar-list');
    if (list) list.hidden = !open;
  }
  treeState() {
    if (this.treeExpanded === undefined) {
      try { this.treeExpanded = JSON.parse(localStorage.getItem(`${this.sidebarKey()}:tree`) || '{}') || {}; }
      catch { this.treeExpanded = {}; }
    }
    return this.treeExpanded;
  }
  rememberTree(key, open) {
    this.treeState()[key] = open;
    try { localStorage.setItem(`${this.sidebarKey()}:tree`, JSON.stringify(this.treeExpanded)); } catch {}
  }
  addButton(spaceId, parent = null) {
    if (S.sharedWorkspace && !this.can('edit', parent ? this.allItems().find(item => item.id === parent) : this.spaces().find(space => space.id === spaceId))) return '';
    return `<button type="button" class="ms-sidebar-add" data-action="ms-sidebar-add" data-space="${spaceId}" data-parent="${parent || 0}" title="${esc(t('ms_add_in', {name:this.allItems().find(item => item.id === parent)?.name || this.spaceName(spaceId)}))}">${icon('plus')}<span>${esc(t('ms_sidebar_add'))}</span></button>`;
  }
  moreButton(target, id, name) {
    const entry = (target === 'space' ? this.spaces() : this.allItems()).find(item => item.id === id);
    if (S.sharedWorkspace && !['edit','delete','share'].some(right => this.can(right, entry))) return '';
    return `<button type="button" class="ms-entry-more" data-action="ms-entry-menu" data-target="${target}" data-id="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('ms_options_for', {name}))}" title="${esc(t('more'))}"><span aria-hidden="true">⋯</span></button>`;
  }
  sidebar() {
    if (S.sharedWorkspace) return '';
    if (!this.enabled()) return '';
    return `<section class="mindspace-sidebar"><button type="button" id="mindspace-sidebar-toggle" class="nav-item ms-sidebar-toggle"
      data-action="ms-sidebar-toggle" aria-expanded="${this.sidebarOpen()}" aria-controls="mindspace-sidebar-list">${icon('overview')}<span>All MindSpace</span><span class="ms-sidebar-chevron" aria-hidden="true">›</span></button>
      <div id="mindspace-sidebar-list" class="mindspace-explorer" ${this.sidebarOpen() ? '' : 'hidden'}>${this.explorer()}
        <button type="button" class="ms-sidebar-add ms-sidebar-add-global" data-action="ms-sidebar-add" data-global="true" aria-label="${esc(t('ms_new_space'))}" title="${esc(t('ms_new_space'))}">${icon('plus')}<span>${esc(t('ms_sidebar_add'))}</span></button>
      </div></section>`;
  }
  explorer() {
    const ancestors = new Set(this.pathTo(this.folderId()).map(item => item.id));
    const expanded = this.treeState();
    const tree = (spaceId, parent, seen = new Set()) => this.items(spaceId).filter(item => item.parent_id === parent && !seen.has(item.id))
      .sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name)).map(item => {
        const folder = item.kind === 'folder', current = item.id === this.active?.id && S.view === 'home';
        const row = `<button type="button" class="ms-entry-label ${current ? 'is-current' : ''}" data-action="${folder ? 'ms-folder' : 'ms-open'}" data-id="${item.id}"
          ${folder ? `data-ms-drop="${item.id}"` : ''} draggable="true" data-ms-draggable="${item.id}" ${current ? 'aria-current="page"' : ''} title="${esc(item.name)}">${this.kindIcon(item.kind)}<span>${esc(item.name)}</span></button>${this.moreButton('item', item.id, item.name)}`;
        if (!folder) return `<div class="ms-tree-row ms-tree-document">${row}</div>`;
        return `<details data-ms-tree="item-${item.id}" ${expanded[`item-${item.id}`] ?? ancestors.has(item.id) ? 'open' : ''}><summary class="ms-tree-row">${row}</summary>
          <div class="ms-tree-children">${tree(spaceId, item.id, new Set([...seen, item.id]))}${this.addButton(spaceId, item.id)}</div></details>`;
      }).join('');
    return this.spaces().map(space => {
      const selected = space.id === this.spaceId(), current = selected && !this.active && S.view === 'home';
      return `<details class="ms-sidebar-space" data-ms-tree="space-${space.id}" ${expanded[`space-${space.id}`] ?? selected ? 'open' : ''}><summary class="ms-tree-row">
        <button type="button" class="ms-entry-label ms-explorer-root ${current ? 'is-current' : ''}" data-action="ms-space-open" data-space="${space.id}"
        data-ms-drop="0" data-ms-space="${space.id}" ${current ? 'aria-current="page"' : ''} title="${esc(space.name)}">${this.kindIcon('folder')}<span>${esc(space.name)}</span></button>${this.moreButton('space', space.id, space.name)}</summary>
        <div class="ms-tree-children ms-sidebar-folders">${tree(space.id, null)}${this.addButton(space.id)}</div></details>`;
    }).join('');
  }

  closeMenu(restoreFocus = false) {
    document.getElementById('ms-context-menu')?.remove();
    this.menuTrigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && this.menuTrigger?.isConnected) this.menuTrigger.focus();
    this.menuTrigger = null;
  }
  entryMenu(button) {
    const wasOpen = this.menuTrigger === button;
    this.closeMenu();
    if (wasOpen) return;
    const isSpace = button.dataset.target === 'space', id = Number(button.dataset.id);
    const target = (isSpace ? this.spaces() : this.allItems()).find(item => item.id === id);
    if (!target) return;
    const spaceId = isSpace ? id : target.mindspace_id || this.spaceId();
    const parent = isSpace ? 0 : target.kind === 'folder' ? id : target.parent_id || 0;
    const context = `data-space="${spaceId}" data-parent="${parent}"`;
    const canNew = this.can('edit', target) && (!S.sharedWorkspace || parent || this.spaces().find(space => space.id === spaceId)?.permissions?.edit);
    const option = (action, label, attrs = '', symbol = '', extra = '') => `<button type="button" role="menuitem" tabindex="-1" data-action="${action}" ${attrs} class="${extra}">${symbol}<span>${esc(label)}</span></button>`;
    const menu = document.createElement('div');
    menu.id = 'ms-context-menu'; menu.className = 'ms-context-menu'; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('ms_options_for', {name:target.name}));
    menu.innerHTML = `<p class="ms-context-title">${esc(target.name)}</p><div class="ms-context-new" role="none" ${canNew ? '' : 'hidden'}>
      <button type="button" role="menuitem" tabindex="-1" id="ms-context-new" aria-haspopup="menu" aria-expanded="false" aria-controls="ms-context-submenu">${icon('plus')}<span>${esc(t('ms_menu_new'))}</span><span class="ms-context-chevron" aria-hidden="true">›</span></button>
      <div id="ms-context-submenu" class="ms-context-submenu" role="menu" aria-labelledby="ms-context-new" hidden>`
      + this.kinds().map(kind => option('ms-new-kind', t('ms_create_kind', {kind:this.kindLabel(kind)}), `${context} data-kind="${kind}"`, this.kindIcon(kind))).join('')
      + (isSpace && !S.sharedWorkspace ? '<hr role="separator">' + option('ms-space-new', t('ms_new_space'), '', icon('plus')) : '')
      + '</div></div><hr role="separator">'
      + (this.can('edit', target) ? option(isSpace ? 'ms-space-rename' : 'ms-rename', t('ms_rename'), `data-id="${id}"`) : '')
      + (this.can('share', target) ? option('ms-share', t('ms_share'), `data-target="${isSpace ? 'space' : 'item'}" data-id="${id}"`) : '')
      + (this.can('delete', target) ? option(isSpace ? 'ms-space-delete' : 'ms-delete', t('delete'), `data-id="${id}"`, '', 'is-danger') : '');
    document.body.append(menu); this.menuTrigger = button;
    button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', menu.id);
    const branch = menu.querySelector('.ms-context-new'), newButton = menu.querySelector('#ms-context-new');
    branch.addEventListener('mouseenter', () => this.newSubmenu(true));
    branch.addEventListener('mouseleave', () => this.newSubmenu(false));
    newButton.addEventListener('click', () => this.newSubmenu(true, true));
    menu.addEventListener('focusin', event => {
      if (!branch.contains(event.target)) this.newSubmenu(false);
    });
    this.positionMenu();
    (canNew ? newButton : menu.querySelector('[data-action="ms-rename"],[data-action="ms-space-rename"],[data-action="ms-share"],[data-action="ms-delete"],[data-action="ms-space-delete"]'))?.focus();
  }
  positionMenu() {
    const menu = document.getElementById('ms-context-menu');
    if (!menu || !this.menuTrigger) return;
    const rect = this.menuTrigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right + 6, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - menu.offsetHeight - 8))}px`;
  }
  newSubmenu(open, focusFirst = false) {
    const submenu = document.getElementById('ms-context-submenu'), button = document.getElementById('ms-context-new');
    if (!submenu || !button) return;
    if (!open && submenu.contains(document.activeElement)) button.focus();
    submenu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    this.positionMenu();
    if (!open) return;
    const menu = document.getElementById('ms-context-menu'), rect = menu.getBoundingClientRect();
    const left = rect.right + submenu.offsetWidth <= window.innerWidth - 8 ? rect.right - 1 : rect.left - submenu.offsetWidth + 1;
    submenu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - submenu.offsetWidth - 8))}px`;
    submenu.style.top = `${Math.max(8, Math.min(button.getBoundingClientRect().top - 6, window.innerHeight - submenu.offsetHeight - 8))}px`;
    if (focusFirst) submenu.querySelector('[role="menuitem"]')?.focus();
  }
  menuKeydown(event) {
    const menu = document.getElementById('ms-context-menu');
    if (!menu) return;
    const submenu = document.getElementById('ms-context-submenu'), newButton = document.getElementById('ms-context-new');
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (submenu && !submenu.hidden) { this.newSubmenu(false); newButton.focus(); }
      else this.closeMenu(true);
      return;
    }
    if (event.key === 'Tab') { this.closeMenu(true); return; }
    if (event.key === 'ArrowRight' && event.target === newButton) {
      event.preventDefault(); this.newSubmenu(true, true); return;
    }
    if (event.key === 'ArrowLeft' && submenu?.contains(event.target)) {
      event.preventDefault(); this.newSubmenu(false); newButton.focus(); return;
    }
    if (!menu.contains(event.target) || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const currentMenu = event.target.closest('[role="menu"]');
    const options = [...currentMenu.querySelectorAll('[role="menuitem"]')].filter(option => option.closest('[role="menu"]') === currentMenu && !option.closest('[hidden]')), index = options.indexOf(event.target);
    options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length]?.focus();
  }

  folderContent() {
    const children = this.items().filter(item => item.parent_id === this.folderId()).sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name));
    return `<div class="mindspace-directory" data-ms-drop="${this.folderId() || 0}">${children.length ? `<div class="ms-file-grid">${children.map(item =>
      `<button type="button" class="ms-file" data-action="ms-open" data-id="${item.id}" draggable="true" data-ms-draggable="${item.id}" ${item.kind === 'folder' ? `data-ms-drop="${item.id}"` : ''}>
        ${this.kindIcon(item.kind)}<strong>${esc(item.name)}</strong><small>${esc(this.kindLabel(item.kind))}</small></button>`).join('')}</div>`
      : `<div class="ms-empty">${this.kindIcon('folder')}<p>${esc(t('ms_folder_empty'))}</p><button type="button" class="btn primary" data-action="ms-new">${icon('plus')}${esc(t('ms_add'))}</button></div>`}</div>`;
  }

  frame(content) {
    const parent = this.folderId();
    const path = `<button type="button" data-action="ms-folder" data-id="0" data-ms-drop="0">${esc(this.spaceName())}</button>` + this.pathTo(parent).map(folder =>
      `<span aria-hidden="true">/</span><button type="button" data-action="ms-folder" data-id="${folder.id}" data-ms-drop="${folder.id}">${esc(folder.name)}</button>`).join('');
    return renderTemplate('mindspace', {
      spaceName:esc(this.spaceName()), intro:t('ms_intro'), tabsLabel:t('ms_tabs'), tabs:this.tabs(), plus:icon('plus'), addLabel:t('ms_add'),
      pathLabel:t('ms_folder_path'), path, linkedFrom:this.linkedFrom(),
      name:esc(this.active?.name || t('ms_files')),
      actions:this.active ? `${this.can('edit') ? `<button type="button" class="text-btn" data-action="ms-rename">${esc(t('ms_rename'))}</button>` : ''}${this.can('move') ? `<button type="button" class="text-btn" data-action="ms-move">${esc(t('ms_move'))}</button>` : ''}` : '', content,
    });
  }

  linkSources() {
    if (!this.active || this.isDiagram()) return [];
    return (S.data.diagrams || []).flatMap(diagram => (diagram.nodes || []).filter(node => node.link?.item_id === this.active.id).map(node => ({diagram, node})));
  }
  linkedFrom() {
    const sources = this.linkSources().filter(({node}) => node.link.target === null);
    if (!sources.length) return '';
    return `<nav class="ms-linked-from" aria-label="${esc(t('ms_link_sources'))}"><span>${esc(t('ms_link_sources'))}</span>${sources.map(({diagram, node}) => `<button type="button" data-action="ms-link-return" data-diagram="${diagram.id}" data-node="${esc(node.id)}">← ${esc(diagram.name)} · ${esc(node.text || t('diagram_link_untitled'))}</button>`).join('')}</nav>`;
  }
  targetReturnLinks(type = MindSpaceLinkTargets.type(this.active)) {
    const grouped = new Map();
    for (const source of this.linkSources()) {
      const target = source.node.link.target;
      if (!target || target.type !== type || !MindSpaceLinkTargets.valid({...this.active, content:this.draft}, target)) continue;
      if (!grouped.has(target.id)) grouped.set(target.id, []);
      grouped.get(target.id).push(source);
    }
    return new Map([...grouped].map(([id, sources]) => {
      const details = sources.map(({diagram, node}) => ({diagram:diagram.name, topic:node.text || t('diagram_link_untitled')}));
      const attributes = `data-target-type="${type}" data-target-id="${esc(id)}"`;
      const single = sources.length === 1, {diagram, node} = sources[0];
      const label = single ? t('diagram_link_return_to', {name:`${diagram.name} · ${node.text || t('diagram_link_untitled')}`}) : t('diagram_link_returns');
      const button = this.home.links.arrowButton(single ? 'ms-link-return' : 'ms-link-returns', 'back', label, details,
        `${attributes}${single ? ` data-diagram="${diagram.id}" data-node="${esc(node.id)}"` : ' aria-haspopup="dialog"'}`);
      return [id, `<span class="ms-target-return">${button}</span>`];
    }));
  }
  chooseLinkReturn(button) {
    const type = button.dataset.targetType, id = button.dataset.targetId;
    const sources = this.linkSources().filter(({node}) => node.link.target?.type === type && node.link.target.id === id);
    if (!sources.length) throw new Error(t('error_diagram_link_missing'));
    openModal('diagram_link_returns', `<div class="diagram-return-list">${sources.map(({diagram, node}) =>
      `<button type="button" class="btn secondary" data-action="ms-link-return" data-diagram="${diagram.id}" data-node="${esc(node.id)}" data-target-type="${esc(type)}" data-target-id="${esc(id)}">
        <span aria-hidden="true">←</span>${this.home.links.detailsHtml([{diagram:diagram.name, topic:node.text || t('diagram_link_untitled')}])}</button>`).join('')}</div>`);
  }
  async returnToLink(button) {
    const generation = this.generation, id = this.active?.id;
    if (!await this.flush() || generation !== this.generation) return;
    const diagrams = await this.home.makeRequest('diagrams');
    if (generation !== this.generation) return;
    const diagram = diagrams.find(entry => entry.id === Number(button.dataset.diagram));
    const source = diagram?.nodes.find(node => node.id === button.dataset.node && node.link?.item_id === id);
    if (!source || (button.dataset.targetType && (source.link.target?.type !== button.dataset.targetType || source.link.target.id !== button.dataset.targetId))) throw new Error(t('error_diagram_link_missing'));
    const item = this.allItems().find(entry => entry.diagram_id === diagram.id);
    if (!item) throw new Error(t('error_diagram_link_missing'));
    S.data.diagrams = diagrams;
    if (button.closest?.('#modal')) closeModal();
    await this.go(item, item.mindspace_id, {type:'topic', id:button.dataset.node});
  }
  render() { return this.frame(!this.active || this.active.kind === 'folder' ? this.folderContent() : this.editor.render()); }
  renderDiagram(values) { return this.frame(renderTemplate('mindspace-diagram', values)); }
  mount() {
    this.status();
    MindSpaceLinkTargets.arrive(this);
    document.querySelector('#mindspace-tabs [aria-selected="true"]')?.scrollIntoView({ block:'nearest', inline:'nearest' });
  }
  syncTabs() {
    if (!this.enabled()) return;
    const tabs = document.getElementById('mindspace-tabs');
    if (tabs) tabs.innerHTML = this.tabs();
    const name = document.getElementById('mindspace-item-name');
    if (name && this.isDiagram()) name.textContent = this.home.titleName();
  }

  adoptDiagram(diagram) {
    if (!this.enabled() || !diagram.mindspace_item_id) return;
    const old = this.allItems().find(item => item.diagram_id === diagram.id);
    const item = { ...old, id:diagram.mindspace_item_id, diagram_id:diagram.id, diagram_version:diagram.version, kind:'diagram', name:diagram.name,
      mindspace_id:old?.mindspace_id || this.spaceId(), parent_id:old?.parent_id || null, content:{}, version:old?.version || 1 };
    this.upsert(item);
    this.active = item;
  }
  upsert(item) {
    const items = this.allItems(), index = items.findIndex(entry => entry.id === item.id);
    if (index < 0) items.push(item); else items[index] = item;
  }
  changed() { this.error = ''; this.status(); clearTimeout(this.timer); this.timer = setTimeout(() => void this.save(), 600); }
  status() {
    const el = document.getElementById('mindspace-save-status');
    if (!el) return;
    el.innerHTML = this.isDiagram() || !this.active || this.active.kind === 'folder' ? '' : this.error
      ? `${esc(this.error)} <button type="button" class="text-btn" data-action="ms-retry">${esc(t('retry'))}</button>`
      : esc(t(this.savePromise ? 'ms_saving' : this.dirty() ? 'ms_unsaved' : 'ms_saved'));
    el.classList.toggle('is-error', !!this.error);
  }

  save() {
    clearTimeout(this.timer);
    if (this.savePromise) return this.savePromise;
    const generation = this.generation;
    const run = async () => {
      try {
        while (this.dirty() && generation === this.generation) {
          const sent = JSON.stringify(this.draft), item = this.active;
          const saved = await this.home.makeRequest('saveMindSpaceItem', { id:item.id, version:item.version, content:JSON.parse(sent) });
          if (generation !== this.generation) return false;
          if (JSON.stringify(this.draft) === sent) this.draft = saved.content;
          this.active = saved; this.upsert(saved); this.baseline = JSON.stringify(saved.content);
        }
        this.error = ''; return true;
      } catch (error) { if (generation === this.generation) this.error = error.message; return false; }
    };
    this.savePromise = run(); this.status();
    const pending = this.savePromise;
    void pending.finally(() => { if (this.savePromise === pending) { this.savePromise = null; this.status(); } });
    return pending;
  }

  async flush() { return this.isDiagram() ? this.home.finishBeforeSwitch() : await this.save(); }
  async go(item, spaceId = this.spaceId(), target = null) {
    if (!await this.flush()) return;
    const url = new URL(location.href);
    for (const key of ['diagram','topic','item','folder','space','cell','card','column','habit']) url.searchParams.delete(key);
    if (item?.mindspace_id || spaceId) url.searchParams.set('space', item?.mindspace_id || spaceId);
    if (!item || item.kind === 'folder') url.searchParams.set('folder', String(item?.id || 0));
    else if (item.kind === 'diagram') url.searchParams.set('diagram', item.diagram_id);
    else url.searchParams.set('item', item.id);
    if (spaceId) this.rememberTree(`space-${item?.mindspace_id || spaceId}`, true);
    for (const folder of this.pathTo(item?.kind === 'folder' ? item.id : item?.parent_id, item?.mindspace_id || spaceId)) this.rememberTree(`item-${folder.id}`, true);
    if (target && ['cell','card','column','habit','topic'].includes(target.type)) url.searchParams.set(target.type, target.id);
    // The creation request has finished; do not trigger beforeunload for its form.
    this.busy = false;
    if (S.sharedWorkspace) {
      history.replaceState(null, '', url.href);
      this.home.reset(); render(); return;
    }
    location.assign(url.href);
  }

  folders(exclude = null, spaceId = this.spaceId()) {
    return this.items(spaceId).filter(item => item.kind === 'folder' && item.id !== exclude && !this.pathTo(item.parent_id, spaceId).some(folder => folder.id === exclude));
  }
  folderOptions(selected, exclude = null, spaceId = this.spaceId()) {
    return (S.sharedWorkspace?.root_id ? '' : `<option value="0">${esc(this.spaceName(spaceId))}</option>`) + this.folders(exclude, spaceId).map(folder => `<option value="${folder.id}" ${folder.id === selected ? 'selected' : ''}>${esc(this.spaceName(spaceId))} / ${esc(this.pathTo(folder.id, spaceId).map(item => item.name).join(' / '))}</option>`).join('');
  }
  async submit(form, task) {
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true; this.busy = true;
    try { await task(new FormData(form)); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; this.busy = false; }
  }

  kinds() { return ['folder','diagram','spreadsheet','kanban','habits','notes']; }
  creationContext(button) {
    return {spaceId:Number(button.dataset.space) || this.spaceId(), parent:button.dataset.parent !== undefined ? Number(button.dataset.parent) || null : this.folderId()};
  }
  async newMenu(includeSpaces = false, {spaceId = this.spaceId(), parent = this.folderId()} = {}) {
    if (!await this.flush()) return;
    this.closeMenu();
    const name = this.allItems().find(item => item.id === parent)?.name || this.spaceName(spaceId);
    openModal(includeSpaces ? 'ms_sidebar_add' : 'ms_add', `${includeSpaces || !this.spaces().length ? `<button type="button" class="ms-create-space-option" data-action="ms-space-new">${icon('plus')}<span><strong>${esc(t('ms_new_space'))}</strong><small>${esc(t('ms_new_space_hint'))}</small></span></button>` : ''}<p class="ms-add-context">${esc(t('ms_add_in', { name }))}</p><div class="ms-kind-grid">${this.kinds().map(kind =>
      `<button type="button" data-action="ms-new-kind" data-kind="${kind}" data-space="${spaceId || 0}" data-parent="${parent || 0}">${this.kindIcon(kind)}<strong>${esc(this.kindLabel(kind))}</strong><small>${esc(t(`ms_hint_${kind}`))}</small></button>`).join('')}</div>`);
  }
  async newForm(kind, {spaceId = this.spaceId(), parent = this.folderId()} = {}) {
    if (!this.kinds().includes(kind) || !await this.flush()) return;
    this.closeMenu();
    openModal('ms_create', `<form id="ms-create-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" required value="${esc(t(`ms_default_${kind}`))}"></label>
      <label class="field"><span>${esc(t('ms_location'))}</span><select name="parent">${this.folderOptions(parent, null, spaceId)}</select></label>${formFooter('create')}</form>`);
    const form = document.getElementById('ms-create-form'), key = crypto.randomUUID();
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => {
      const item = await this.home.makeRequest('createMindSpaceItem', { kind, name:values.get('name'), mindspace_id:spaceId, parent_id:Number(values.get('parent')) || null, client_key:key });
      this.upsert(item); closeModal(); await this.go(item);
    }); });
  }
  async newSpace() {
    if (!await this.flush()) return;
    openModal('ms_new_space', `<form id="ms-space-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" required value="${esc(t('ms_new_space'))}"></label>${formFooter('create')}</form>`);
    const form = document.getElementById('ms-space-form'), key = crypto.randomUUID();
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => {
      const space = await this.home.makeRequest('createMindSpace', { name:values.get('name'), client_key:key });
      S.data.mindspace.spaces ||= this.spaces();
      if (!S.data.mindspace.spaces.some(item => item.id === space.id)) S.data.mindspace.spaces.push(space);
      closeModal(); await this.go(null, space.id);
    }); });
  }
  diagramVersion(item) { return item.kind === 'diagram' && this.home.active?.id === item.diagram_id ? this.home.active.version : item.diagram_version; }
  async rename(id = this.active?.id, isSpace = false) {
    if (!id || !await this.flush()) return;
    this.closeMenu();
    const item = (isSpace ? this.spaces() : this.allItems()).find(entry => entry.id === id);
    if (!item) return;
    openModal('ms_rename', `<form id="ms-rename-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" required value="${esc(item.name)}"></label>${formFooter()}</form>`);
    const form = document.getElementById('ms-rename-form');
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => {
      const saved = await this.home.makeRequest(isSpace ? 'renameMindSpace' : 'saveMindSpaceItem', { id:item.id, version:item.version, name:values.get('name'), diagram_version:this.diagramVersion(item) });
      if (isSpace) {
        Object.assign(item, saved);
        if (S.data.mindspace.id === id) S.data.mindspace.name = saved.name;
      } else {
        if (this.active?.id === id) this.active = saved;
        this.upsert(saved);
        if (saved.kind === 'diagram') {
          if (this.home.active?.id === saved.diagram_id) {
            this.home.diagramTitle = saved.name;
            Object.assign(this.home.active, { name:saved.name, version:saved.diagram_version });
          }
          const diagram = S.data.diagrams.find(entry => entry.id === saved.diagram_id);
          if (diagram) Object.assign(diagram, { name:saved.name, version:saved.diagram_version });
        }
      }
      closeModal(); render();
    }); });
  }
  async deleteForm(id, isSpace = false) {
    if (!await this.flush()) return;
    this.closeMenu();
    const item = (isSpace ? this.spaces() : this.allItems()).find(entry => entry.id === id);
    if (!item) return;
    const container = isSpace || item.kind === 'folder';
    openModal('delete', `<form id="ms-delete-form"><p>${esc(t(container ? 'ms_delete_container_confirm' : 'ms_delete_item_confirm', {name:item.name}))}</p>${item.kind === 'habits' ? `<p>${esc(t('ms_delete_habits_hint'))}</p>` : ''}${formFooter('delete')}</form>`);
    const form = document.getElementById('ms-delete-form');
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async () => {
      // Save any edits completed while the confirmation was open before deleting.
      if (!await this.flush()) throw new Error(this.error || t('ms_unsaved'));
      const fresh = isSpace ? item : this.allItems().find(entry => entry.id === id);
      const result = await this.home.makeRequest(isSpace ? 'deleteMindSpace' : 'deleteMindSpaceItem', {id, version:fresh.version, diagram_version:this.diagramVersion(fresh)});
      const currentSpace = this.spaceId();
      const deleted = new Set(isSpace ? this.items(id).map(entry => entry.id) : result.deleted_ids);
      const diagramIds = new Set(this.allItems().filter(entry => deleted.has(entry.id)).map(entry => entry.diagram_id));
      S.data.diagrams = S.data.diagrams.filter(entry => !diagramIds.has(entry.id));
      S.data.mindspace.items = this.allItems().filter(entry => !deleted.has(entry.id));
      if (isSpace) S.data.mindspace.spaces = this.spaces().filter(entry => entry.id !== id);
      const removedActive = deleted.has(this.active?.id);
      if (removedActive) { this.active = null; this.draft = null; this.baseline = 'null'; }
      if (isSpace && S.data.mindspace.id === id) {
        const next = this.spaces()[0]; S.data.mindspace.id = next?.id || null; S.data.mindspace.name = next?.name || 'MindSpace';
      }
      closeModal();
      if (S.sharedWorkspace && (isSpace || deleted.has(S.sharedWorkspace.root_id))) {
        leaveSharedWorkspace(); await refresh(); return;
      }
      if (removedActive || (isSpace && currentSpace === id)) {
        const nextSpace = isSpace ? this.spaces()[0]?.id : item.mindspace_id || this.spaceId();
        await this.go(isSpace ? null : this.allItems().find(entry => entry.id === item.parent_id) || null, nextSpace);
      } else render();
    }); });
  }
  async move(id, parent) {
    if (!this.can('move')) throw new Error(t('error_forbidden'));
    if (!await this.flush()) return;
    const item = this.allItems().find(entry => entry.id === id);
    if (!item || item.parent_id === parent) return;
    const saved = await this.home.makeRequest('moveMindSpaceItem', { id, version:item.version, parent_id:parent });
    this.upsert(saved);
    if (this.active?.id === id) this.active = saved;
    render();
  }
  async moveForm() {
    if (!this.active || !await this.flush()) return;
    const item = this.active;
    openModal('ms_move', `<form id="ms-move-form"><p>${esc(item.name)}</p><label class="field"><span>${esc(t('ms_location'))}</span>
      <select name="parent">${this.folderOptions(item.parent_id, item.id)}</select></label>${formFooter('ms_move')}</form>`);
    const form = document.getElementById('ms-move-form');
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => { await this.move(item.id, Number(values.get('parent')) || null); closeModal(); }); });
  }
  canDrop(id, target) {
    if (!this.can('move')) return false;
    const item = this.allItems().find(entry => entry.id === id);
    const parent = this.allItems().find(entry => entry.id === Number(target.dataset.msDrop));
    const spaceId = Number(target.dataset.msSpace) || (parent ? parent.mindspace_id || S.data.mindspace.id : this.spaceId());
    return !!item && (item.mindspace_id || S.data.mindspace.id) === spaceId;
  }
  clearDrag() {
    this.draggingId = null;
    document.querySelectorAll('.ms-drop-target').forEach(el => el.classList.remove('ms-drop-target'));
  }
  async handleAction(action, button) {
    const right = ['ms-delete','ms-space-delete'].includes(action) ? 'delete' : action === 'ms-share' ? 'share' : action === 'ms-move' ? 'move'
      : ['ms-new','ms-new-kind','ms-rename','ms-space-rename','ms-card-new','ms-card-edit','ms-column-new','ms-sprint','ms-habits-select','ms-habit-new','ms-sheet-row','ms-sheet-column'].includes(action) ? 'edit' : null;
    if (right && !this.can(right)) throw new Error(t('error_forbidden'));
    if (action === 'ms-share') {
      if (!await this.flush()) return;
      this.closeMenu();
      return mindSpaceShareForm(button.dataset.target, Number(button.dataset.id));
    }
    if (action === 'ms-link-return') return this.returnToLink(button);
    if (action === 'ms-link-returns') return this.chooseLinkReturn(button);
    if (action === 'ms-sidebar-toggle') return this.toggleSidebar();
    if (action === 'ms-entry-menu') return this.entryMenu(button);
    if (action === 'ms-sidebar-add') {
      if (button.dataset.global === 'true') { this.closeMenu(); return this.newSpace(); }
      return this.newMenu(false, this.creationContext(button));
    }
    if (action === 'ms-space-rename') return this.rename(Number(button.dataset.id), true);
    if (action === 'ms-space-delete') return this.deleteForm(Number(button.dataset.id), true);
    if (action === 'ms-delete') return this.deleteForm(Number(button.dataset.id));
    if (action === 'ms-space-new') { this.closeMenu(); return this.newSpace(); }
    if (action === 'ms-space-open') return this.go(null, Number(button.dataset.space));
    if (action === 'ms-new') return this.newMenu();
    if (action === 'ms-new-kind') return this.newForm(button.dataset.kind, this.creationContext(button));
    if (action === 'ms-open' || action === 'ms-folder') return this.go(this.allItems().find(item => item.id === Number(button.dataset.id)) || null);
    if (action === 'ms-rename') return this.rename(Number(button.dataset.id) || this.active?.id);
    if (action === 'ms-move') return this.moveForm();
    if (action === 'ms-retry') return this.save();
    return this.editor.action(action, button);
  }
}
