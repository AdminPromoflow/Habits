'use strict';

class MindSpace extends PageController {
  constructor(home) {
    super(['ms-new','ms-new-kind','ms-open','ms-folder','ms-rename','ms-move','ms-retry',
      'ms-sidebar-toggle','ms-sidebar-add','ms-space-open','ms-space-new',
      'ms-card-new','ms-card-edit','ms-sprint','ms-habits-select','ms-habit-new','ms-sheet-row','ms-sheet-column','ms-sheet-export']);
    this.home = home;
    this.editor = new MindSpaceEditors(this);
    this.reset();
    for (const type of ['input','change','focusin','focusout','keydown','paste']) document.addEventListener(type, event => {
      if (this.enabled() && event.target.closest?.('#mindspace-panel')) this.editor.event(type, event);
      if (type === 'keydown' && event.target.closest?.('[role="tablist"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        const tabs = [...document.querySelectorAll('#mindspace-tabs [role="tab"]')];
        const index = tabs.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]?.focus();
      }
    });
    document.addEventListener('dragstart', event => {
      const entry = event.target.closest?.('[data-ms-draggable]');
      if (!entry) return;
      this.draggingId = Number(entry.dataset.msDraggable);
      event.dataTransfer.setData('application/x-mindspace-item', String(this.draggingId));
      event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', event => {
      const target = event.target.closest?.('[data-ms-drop]');
      if (!this.draggingId || !target) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.ms-drop-target').forEach(el => el.classList.remove('ms-drop-target'));
      target.classList.add('ms-drop-target');
    });
    document.addEventListener('dragend', () => this.clearDrag());
    document.addEventListener('drop', event => {
      const target = event.target.closest?.('[data-ms-drop]'), id = this.draggingId;
      if (!id || !target) return;
      event.preventDefault();
      const parent = Number(target.dataset.msDrop) || null;
      this.clearDrag();
      void this.move(id, parent).catch(error => toast(error.message, true));
    });
  }

  reset() {
    clearTimeout(this.timer);
    this.generation = (this.generation || 0) + 1;
    this.active = null; this.draft = null; this.baseline = ''; this.busy = false;
    this.error = ''; this.savePromise = null; this.draggingId = null;
    this.sidebarExpanded = undefined;
  }
  enabled() { return !!S.data?.mindspace; }
  allItems() { return S.data?.mindspace?.items || []; }
  spaces() { return S.data?.mindspace?.spaces || (this.enabled() ? [{ id:S.data.mindspace.id, name:S.data.mindspace.name || 'MindSpace' }] : []); }
  spaceId() {
    const params = new URL(location.href).searchParams;
    const target = params.has('folder') ? this.allItems().find(item => item.kind === 'folder' && item.id === Number(params.get('folder')))
      : params.has('item') ? this.allItems().find(item => item.id === Number(params.get('item')))
      : this.allItems().find(item => item.kind === 'diagram' && item.diagram_id === Number(params.get('diagram')));
    return target?.mindspace_id || this.spaces().find(space => space.id === Number(params.get('space')))?.id || S.data?.mindspace?.id;
  }
  spaceName() { return this.spaces().find(space => space.id === this.spaceId())?.name || 'MindSpace'; }
  items(spaceId = this.spaceId()) { return this.allItems().filter(item => (item.mindspace_id || S.data?.mindspace?.id) === spaceId); }
  kindIcon(kind) { return icon({ folder:'folder', diagram:'branch', spreadsheet:'table', kanban:'overview', scrum:'briefcase', habits:'habits', notes:'book' }[kind] || 'book'); }
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

  pathTo(id) {
    const path = [], seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const folder = this.items().find(item => item.id === id && item.kind === 'folder');
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
  sidebar() {
    if (!this.enabled()) return '';
    return `<section class="mindspace-sidebar"><button type="button" id="mindspace-sidebar-toggle" class="nav-item ms-sidebar-toggle"
      data-action="ms-sidebar-toggle" aria-expanded="${this.sidebarOpen()}" aria-controls="mindspace-sidebar-list">${icon('overview')}<span>All MindSpace</span><span class="ms-sidebar-chevron" aria-hidden="true">›</span></button>
      <div id="mindspace-sidebar-list" class="mindspace-explorer" ${this.sidebarOpen() ? '' : 'hidden'}>${this.explorer()}
        <button type="button" class="ms-sidebar-add" data-action="ms-sidebar-add" aria-label="${esc(t('ms_sidebar_add'))}" title="${esc(t('ms_sidebar_add'))}">${icon('plus')}<span>${esc(t('ms_sidebar_add'))}</span></button>
      </div></section>`;
  }
  explorer() {
    const ancestors = new Set(this.pathTo(this.folderId()).map(item => item.id));
    const tree = (parent, depth, seen = new Set()) => this.items().filter(item => item.kind === 'folder' && item.parent_id === parent && !seen.has(item.id))
      .sort((a,b) => a.name.localeCompare(b.name)).map(folder => {
        const visited = new Set([...seen, folder.id]);
        return `<details ${ancestors.has(folder.id) ? 'open' : ''}><summary><button type="button" data-action="ms-folder" data-id="${folder.id}"
          data-ms-drop="${folder.id}" draggable="true" data-ms-draggable="${folder.id}" class="${this.folderId() === folder.id ? 'is-current' : ''}">${this.kindIcon('folder')}<span>${esc(folder.name)}</span></button></summary>
          <div class="ms-tree-children">${tree(folder.id, depth + 1, visited)}</div></details>`;
      }).join('');
    return this.spaces().map(space => {
      const selected = space.id === this.spaceId(), current = selected && S.view === 'home';
      return `<div class="ms-sidebar-space"><button type="button" class="ms-explorer-root ${current ? 'is-current' : ''}" data-action="ms-space-open" data-space="${space.id}"
        ${selected ? 'data-ms-drop="0"' : ''} ${current ? 'aria-current="page"' : ''} title="${esc(space.name)}">${this.kindIcon('folder')}<span>${esc(space.name)}</span></button>
        ${selected ? `<div class="ms-sidebar-folders">${tree(null, 0)}</div>` : ''}</div>`;
    }).join('');
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
      pathLabel:t('ms_folder_path'), path,
      name:esc(this.active?.name || t('ms_files')),
      actions:this.active ? `<button type="button" class="text-btn" data-action="ms-rename">${esc(t('ms_rename'))}</button><button type="button" class="text-btn" data-action="ms-move">${esc(t('ms_move'))}</button>` : '', content,
    });
  }

  render() { return this.frame(!this.active || this.active.kind === 'folder' ? this.folderContent() : this.editor.render()); }
  renderDiagram(values) { return this.frame(renderTemplate('mindspace-diagram', values)); }
  mount() {
    this.status();
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
  async go(item, spaceId = this.spaceId()) {
    if (!await this.flush()) return;
    const url = new URL(location.href);
    for (const key of ['diagram','topic','item','folder','space']) url.searchParams.delete(key);
    if (item?.mindspace_id || spaceId) url.searchParams.set('space', item?.mindspace_id || spaceId);
    if (!item || item.kind === 'folder') url.searchParams.set('folder', String(item?.id || 0));
    else if (item.kind === 'diagram') url.searchParams.set('diagram', item.diagram_id);
    else url.searchParams.set('item', item.id);
    // The creation request has finished; do not trigger beforeunload for its form.
    this.busy = false;
    location.assign(url.href);
  }

  folders(exclude = null, spaceId = this.spaceId()) {
    return this.items(spaceId).filter(item => item.kind === 'folder' && item.id !== exclude && !this.pathTo(item.parent_id).some(folder => folder.id === exclude));
  }
  folderOptions(selected, exclude = null) {
    return `<option value="0">${esc(this.spaceName())}</option>` + this.folders(exclude).map(folder => `<option value="${folder.id}" ${folder.id === selected ? 'selected' : ''}>${esc(this.spaceName())} / ${esc(this.pathTo(folder.id).map(item => item.name).join(' / '))}</option>`).join('');
  }
  async submit(form, task) {
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true; this.busy = true;
    try { await task(new FormData(form)); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; this.busy = false; }
  }

  async newMenu(includeSpaces = false) {
    if (!await this.flush()) return;
    openModal(includeSpaces ? 'ms_sidebar_add' : 'ms_add', `${includeSpaces ? `<button type="button" class="ms-create-space-option" data-action="ms-space-new">${icon('plus')}<span><strong>${esc(t('ms_new_space'))}</strong><small>${esc(t('ms_new_space_hint'))}</small></span></button><p class="ms-add-context">${esc(t('ms_add_in', { name:this.spaceName() }))}</p>` : ''}<div class="ms-kind-grid">${['folder','diagram','spreadsheet','kanban','scrum','habits','notes'].map(kind =>
      `<button type="button" data-action="ms-new-kind" data-kind="${kind}">${this.kindIcon(kind)}<strong>${esc(this.kindLabel(kind))}</strong><small>${esc(t(`ms_hint_${kind}`))}</small></button>`).join('')}</div>`);
  }
  async newForm(kind) {
    if (!['folder','diagram','spreadsheet','kanban','scrum','habits','notes'].includes(kind) || !await this.flush()) return;
    openModal('ms_create', `<form id="ms-create-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" required value="${esc(t(`ms_default_${kind}`))}"></label>
      <label class="field"><span>${esc(t('ms_location'))}</span><select name="parent">${this.folderOptions(this.folderId())}</select></label>${formFooter('create')}</form>`);
    const form = document.getElementById('ms-create-form'), key = crypto.randomUUID();
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => {
      const item = await this.home.makeRequest('createMindSpaceItem', { kind, name:values.get('name'), mindspace_id:this.spaceId(), parent_id:Number(values.get('parent')) || null, client_key:key });
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
  async rename() {
    if (!this.active || !await this.flush()) return;
    const item = this.active;
    openModal('ms_rename', `<form id="ms-rename-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" required value="${esc(item.name)}"></label>${formFooter()}</form>`);
    const form = document.getElementById('ms-rename-form');
    form.addEventListener('submit', event => { event.preventDefault(); void this.submit(form, async values => {
      const saved = await this.home.makeRequest('saveMindSpaceItem', { id:item.id, version:item.version, name:values.get('name'), diagram_version:this.home.active?.id === item.diagram_id ? this.home.active.version : item.diagram_version });
      this.active = saved; this.upsert(saved);
      if (saved.kind === 'diagram') {
        this.home.diagramTitle = saved.name;
        Object.assign(this.home.active, { name:saved.name, version:saved.diagram_version });
        const diagram = S.data.diagrams.find(entry => entry.id === saved.diagram_id);
        if (diagram) Object.assign(diagram, { name:saved.name, version:saved.diagram_version });
      }
      closeModal(); render();
    }); });
  }
  async move(id, parent) {
    if (!await this.flush()) return;
    const item = this.items().find(entry => entry.id === id);
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
  clearDrag() {
    this.draggingId = null;
    document.querySelectorAll('.ms-drop-target').forEach(el => el.classList.remove('ms-drop-target'));
  }
  async handleAction(action, button) {
    if (action === 'ms-sidebar-toggle') return this.toggleSidebar();
    if (action === 'ms-sidebar-add') return this.newMenu(true);
    if (action === 'ms-space-new') return this.newSpace();
    if (action === 'ms-space-open') return this.go(null, Number(button.dataset.space));
    if (action === 'ms-new') return this.newMenu();
    if (action === 'ms-new-kind') return this.newForm(button.dataset.kind);
    if (action === 'ms-open' || action === 'ms-folder') return this.go(this.items().find(item => item.id === Number(button.dataset.id)) || null);
    if (action === 'ms-rename') return this.rename();
    if (action === 'ms-move') return this.moveForm();
    if (action === 'ms-retry') return this.save();
    return this.editor.action(action, button);
  }
}
