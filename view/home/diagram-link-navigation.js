'use strict';

// Backlinks are derived from the saved outgoing links. They never replace a
// destination's own link, and disappear automatically with their source.
class DiagramLinkNavigation {
  constructor(home) {
    this.home = home;
    this.memory = new Map();
    this.orders = new Map();
  }

  catalog() {
    const home = this.home;
    const diagrams = [...(S.data.diagrams || [])];
    if (home.active) {
      const current = { ...home.active, name: home.titleName(), nodes: home.nodes || home.active.nodes || [] };
      const index = diagrams.findIndex(diagram => diagram.id === current.id);
      if (index === -1) diagrams.push(current); else diagrams[index] = current;
    }
    return diagrams;
  }

  edges(diagrams = this.catalog()) {
    const byId = new Map(diagrams.map(diagram => [diagram.id, diagram]));
    return diagrams.flatMap(diagram => (diagram.nodes || []).flatMap(node => {
      const link = node.link, target = byId.get(link?.diagram_id);
      if (!link || !target || (link.node_id !== null && !target.nodes?.some(topic => topic.id === link.node_id))) return [];
      return [{ diagram_id: diagram.id, node_id: node.id, diagram_name: diagram.name, text: node.text,
        target_diagram: target.id, target_node: link.node_id }];
    })).sort((a, b) => a.diagram_id - b.diagram_id || a.node_id.localeCompare(b.node_id));
  }

  incoming(node, diagrams = this.catalog()) {
    const current = this.home.active?.id;
    return this.edges(diagrams).filter(edge => edge.target_diagram === current &&
      edge.target_node === node.id &&
      !(edge.diagram_id === current && edge.node_id === node.id) &&
      // An explicit reciprocal link already provides this return destination.
      !(node.link?.diagram_id === edge.diagram_id && node.link?.node_id === edge.node_id));
  }

  diagramEdges(diagrams = this.catalog()) {
    return this.edges(diagrams).filter(edge => edge.target_node === null && edge.diagram_id !== edge.target_diagram);
  }

  key(id) {
    return `diagram-trail:v2:${JSON.stringify([new URL(location.href).pathname, String(S.user?.id || ''), String(id)])}`;
  }

  read(id) {
    if (this.memory.has(id)) return this.memory.get(id);
    try { return JSON.parse(sessionStorage.getItem(this.key(id)) || 'null'); }
    catch { return null; }
  }

  write(trail) {
    const id = trail.at(-1)?.diagram_id;
    if (!id) return;
    this.memory.set(id, trail.map(entry => ({ ...entry })));
    try { sessionStorage.setItem(this.key(id), JSON.stringify(trail)); }
    catch { /* Navigation still works when session storage is disabled. */ }
  }

  valid(trail, id, diagrams, edges) {
    if (!Array.isArray(trail) || !trail.length || trail.length > diagrams.length || trail.at(-1)?.diagram_id !== id) return false;
    const seen = new Set();
    return trail.every((entry, index) => {
      if (!entry || !Number.isInteger(entry.diagram_id) || seen.has(entry.diagram_id) ||
          !diagrams.some(diagram => diagram.id === entry.diagram_id) ||
          (entry.node_id !== null && typeof entry.node_id !== 'string')) return false;
      seen.add(entry.diagram_id);
      if (index === trail.length - 1) return true;
      return edges.some(edge => edge.diagram_id === entry.diagram_id && edge.node_id === entry.node_id &&
        edge.target_diagram === trail[index + 1].diagram_id);
    });
  }

  trail(id = this.home.active?.id, diagrams = this.catalog()) {
    if (!diagrams.some(diagram => diagram.id === id)) return [];
    const edges = this.diagramEdges(diagrams);
    const saved = this.read(id);
    if (this.valid(saved, id, diagrams, edges)) return saved.map(entry => ({ ...entry }));
    const trail = [{ diagram_id: id, node_id: null }], seen = new Set([id]);
    // Direct visits can recover a parent chain from persisted links. Multiple
    // parents use the actual visited trail when available; cycles never repeat.
    let cursor = id;
    while (true) {
      const edge = edges.find(item => item.target_diagram === cursor && !seen.has(item.diagram_id));
      if (!edge) break;
      trail.unshift({ diagram_id: edge.diagram_id, node_id: edge.node_id });
      seen.add(edge.diagram_id);
      cursor = edge.diagram_id;
    }
    return trail;
  }

  direction(link) {
    const trail = this.trail();
    return trail.slice(0, -1).some(entry => entry.diagram_id === link?.diagram_id) ? 'back' : 'forward';
  }

  prepare(link, sourceKey, { returning = false, trail = null } = {}) {
    if (link.node_id !== null || link.diagram_id === this.home.active?.id) return;
    let next = trail?.map(entry => ({ ...entry }));
    if (!next) {
      const current = this.trail();
      const ancestor = current.findIndex(entry => entry.diagram_id === link.diagram_id);
      if (ancestor !== -1) next = current.slice(0, ancestor + 1);
      else if (returning) next = this.trail(link.diagram_id);
      else {
        if (current.length) current[current.length - 1].node_id = sourceKey;
        next = [...current, { diagram_id: link.diagram_id, node_id: link.node_id }];
      }
    }
    if (next.length) next[next.length - 1].node_id = link.node_id;
    this.write(next);
  }

  orderKey(parentId) {
    return `diagram-child-order:v1:${JSON.stringify([new URL(location.href).pathname, String(S.user?.id || ''), String(parentId)])}`;
  }

  readOrder(parentId) {
    const key = this.orderKey(parentId);
    if (this.orders.has(key)) return this.orders.get(key);
    try {
      const ids = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(ids) ? [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))] : [];
    } catch { return []; }
  }

  writeOrder(parentId, ids) {
    const key = this.orderKey(parentId);
    this.orders.set(key, [...ids]);
    try { localStorage.setItem(key, JSON.stringify(ids)); }
    catch { /* Reordering remains available for this session. */ }
  }

  childrenFor(parentId, diagrams = this.catalog(), trail = []) {
    const seen = new Set(trail.map(entry => entry.diagram_id));
    seen.add(parentId);
    const order = this.readOrder(parentId), names = new Map(diagrams.map(diagram => [diagram.id, diagram.name]));
    const rank = id => { const index = order.indexOf(id); return index === -1 ? Infinity : index; };
    return this.diagramEdges(diagrams).filter(edge => {
      if (edge.diagram_id !== parentId || seen.has(edge.target_diagram)) return false;
      seen.add(edge.target_diagram);
      return true;
    }).sort((a, b) => (rank(a.target_diagram) - rank(b.target_diagram)) ||
      names.get(a.target_diagram).localeCompare(names.get(b.target_diagram), undefined, { sensitivity: 'base', numeric: true }) || a.target_diagram - b.target_diagram);
  }

  children(diagrams = this.catalog(), trail = this.trail(this.home.active?.id, diagrams)) {
    return this.childrenFor(this.home.active?.id, diagrams, trail);
  }

  branches(diagrams = this.catalog()) {
    const trail = this.trail(this.home.active?.id, diagrams);
    const branches = trail.map((entry, index) => {
      const prefix = trail.slice(0, index);
      return { entry, prefix, current: index === trail.length - 1, preview: false,
        choices: index ? this.childrenFor(prefix.at(-1).diagram_id, diagrams, prefix) : [] };
    });
    const children = this.children(diagrams, trail);
    if (children.length) branches.push({ entry: { diagram_id: children[0].target_diagram, node_id: null },
      prefix: trail, current: false, preview: true, choices: children });
    return branches;
  }

  html() {
    const diagrams = this.catalog(), branches = this.branches(diagrams);
    if (branches.length < 2) return '';
    const items = branches.map(({ entry, prefix, current, preview, choices }, index) => {
      const name = diagrams.find(diagram => diagram.id === entry.diagram_id).name;
      const parentName = diagrams.find(diagram => diagram.id === prefix.at(-1)?.diagram_id)?.name;
      return `<li>${index ? '<span class="diagram-trail-separator" aria-hidden="true">›</span>' : ''}<span class="diagram-trail-level"><button type="button"
        ${preview ? `data-action="diagram-link-branch" data-branch-index="${index}" data-branch-diagram="${entry.diagram_id}"`
          : `data-action="diagram-link-ancestor" data-trail-index="${index}"`} ${current ? 'aria-current="page"' : ''}
        title="${esc(name)}">${esc(name)}</button>${choices.length > 1 ? `<button type="button" class="diagram-trail-toggle"
          data-action="diagram-link-menu" data-branch-index="${index}" aria-haspopup="menu" aria-expanded="false"
          aria-label="${esc(t('diagram_link_choose_child', { name: parentName }))}"><span aria-hidden="true">▾</span></button>` : ''}</span></li>`;
    }).join('');
    return `<nav class="diagram-link-trail" aria-label="${esc(t('diagram_link_path'))}"><ol>${items}</ol></nav>`;
  }

  async visit(index) {
    const trail = this.trail(), target = trail[index];
    if (!target) return;
    this.closeMenu();
    return this.home.links.follow({ diagram_id: target.diagram_id, node_id: null },
      { returning: true, trail: trail.slice(0, index + 1) });
  }

  async visitChild(id) {
    return this.visitBranch(this.trail().length, id);
  }

  async visitBranch(index, id) {
    const branch = this.branches()[index];
    const edge = branch?.choices.find(item => item.target_diagram === id);
    if (!edge) return;
    const trail = branch.prefix.map(entry => ({ ...entry }));
    trail[trail.length - 1].node_id = edge.node_id;
    trail.push({ diagram_id: id, node_id: null });
    this.closeMenu();
    return this.home.links.follow({ diagram_id: id, node_id: null }, { trail });
  }

  openMenu(button) {
    if (this.menuButton === button) { this.closeMenu(true); return; }
    this.closeMenu();
    const index = Number(button.dataset.branchIndex), diagrams = this.catalog(), branch = this.branches(diagrams)[index];
    if (!branch || branch.choices.length < 2) return;
    const menu = document.createElement('div');
    menu.className = 'diagram-branch-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('diagram_link_children'));
    menu.innerHTML = branch.choices.map(edge => `<button type="button" role="menuitemradio" tabindex="-1"
      aria-checked="${edge.target_diagram === branch.entry.diagram_id}" data-action="diagram-link-branch"
      data-branch-index="${index}" data-branch-diagram="${edge.target_diagram}">${esc(diagrams.find(item => item.id === edge.target_diagram).name)}</button>`).join('') +
      `<hr><button type="button" role="menuitem" tabindex="-1" data-action="diagram-link-order" data-branch-index="${index}">${esc(t('diagram_link_reorder'))}</button>`;
    document.body.append(menu);
    this.menu = menu;
    this.menuButton = button;
    button.setAttribute('aria-expanded', 'true');
    const anchor = button.getBoundingClientRect(), box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${anchor.bottom + box.height + 6 <= window.innerHeight ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6)}px`;
    this.dismissMenu = event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) this.closeMenu();
    };
    this.resizeMenu = () => this.closeMenu();
    document.addEventListener('pointerdown', this.dismissMenu);
    window.addEventListener('resize', this.resizeMenu);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeMenu(true); return; }
      if (event.key === 'Tab') { this.closeMenu(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('button')], position = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (position + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  closeMenu(restoreFocus = false) {
    if (!this.menu) return;
    this.menu.remove();
    this.menuButton?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.dismissMenu);
    window.removeEventListener('resize', this.resizeMenu);
    if (restoreFocus) this.menuButton?.focus({ preventScroll: true });
    this.menu = null;
    this.menuButton = null;
  }

  moveChild(parentId, childId, step, prefix = []) {
    if (![1, -1].includes(step)) return false;
    const ids = this.childrenFor(parentId, this.catalog(), prefix).map(edge => edge.target_diagram), index = ids.indexOf(childId), next = index + step;
    if (index < 0 || next < 0 || next >= ids.length) return false;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    this.writeOrder(parentId, ids);
    return true;
  }

  openOrder(index) {
    const branch = this.branches()[index], parentId = branch?.prefix.at(-1)?.diagram_id;
    if (!parentId) return;
    this.closeMenu();
    openModal('diagram_link_reorder', `<p class="muted">${esc(t('diagram_link_order_hint'))}</p><div id="diagram-child-order"></div>
      <div class="form-footer"><button type="button" class="btn secondary" id="diagram-child-order-reset">${esc(t('diagram_link_order_alpha'))}</button>
      <button type="button" class="btn primary" data-action="close-modal">${esc(t('close'))}</button></div>`);
    const list = document.getElementById('diagram-child-order');
    const draw = () => {
      const diagrams = this.catalog(), children = this.childrenFor(parentId, diagrams, branch.prefix);
      list.innerHTML = children.map((edge, position) => {
        const name = diagrams.find(item => item.id === edge.target_diagram).name;
        return `<div class="diagram-child-order-row"><span>${esc(name)}</span><button type="button" class="btn ghost" data-order-id="${edge.target_diagram}" data-step="-1"
          aria-label="${esc(t('diagram_link_order_up', { name }))}" ${position === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn ghost" data-order-id="${edge.target_diagram}" data-step="1" aria-label="${esc(t('diagram_link_order_down', { name }))}"
          ${position === children.length - 1 ? 'disabled' : ''}>↓</button></div>`;
      }).join('');
      this.home.syncToolbar();
    };
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-order-id]');
      if (!button) return;
      const id = Number(button.dataset.orderId), step = Number(button.dataset.step);
      if (!this.moveChild(parentId, id, step, branch.prefix)) return;
      draw();
      (list.querySelector(`[data-order-id="${id}"][data-step="${step}"]:not(:disabled)`) || list.querySelector(`[data-order-id="${id}"]:not(:disabled)`))?.focus();
    });
    document.getElementById('diagram-child-order-reset').addEventListener('click', () => { this.writeOrder(parentId, []); draw(); });
    draw();
  }
}
