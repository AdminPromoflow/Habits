'use strict';

class DiagramConnections {
  constructor(home) {
    this.home = home;
    this.drag = null;
    this.selected = null;
    this.editingRoute = null;
    this.menuOpen = false;
    this.labelEditing = false;
    this.drawn = [];
    document.addEventListener('pointerdown', (event) => this.start(event));
    document.addEventListener('pointermove', (event) => this.move(event));
    document.addEventListener('pointerup', (event) => this.finish(event, true));
    document.addEventListener('pointercancel', (event) => this.finish(event, false));
    document.addEventListener('lostpointercapture', (event) => this.finish(event, false));
    document.addEventListener('focusin', (event) => {
      if (event.target.closest?.('.diagram-connection-tools')) return;
      const line = event.target.closest?.('.diagram-connection');
      if (line) this.select(line);
      else this.clearSelection();
    });
    document.addEventListener('keydown', (event) => this.keydown(event));
    document.addEventListener('dblclick', (event) => this.split(event));
    window.addEventListener('blur', () => this.cancel());
  }

  same(a, b) {
    return !!a && !!b && (a.from === b.from && a.to === b.to || a.from === b.to && a.to === b.from);
  }

  available() {
    const home = this.home;
    return !this.drag && !this.editingRoute && !home.drag && !home.resizing && !home.editing && !home.titleEditing &&
      !home.layoutOpen && !home.switching && !home.nodeTools.busy && !home.viewport.isInteracting();
  }

  visibleEdges() {
    const home = this.home;
    return [...home.ensureTree().filter(node => node.parent_id !== null)
      .map(node => ({ from: node.parent_id, to: node.id })), ...home.connections]
      .filter(edge => !home.hiddenConnections.some(hidden => this.same(edge, hidden)));
  }

  elements() {
    return [...(document.getElementById('diagram-connections')?.querySelectorAll('.diagram-connection') || [])];
  }

  syncSelection() {
    for (const line of this.elements()) {
      const selected = this.same(line.dataset, this.selected);
      line.classList.toggle('is-selected', selected);
      line.setAttribute('aria-pressed', String(selected));
    }
    this.renderTools();
  }

  clearSelection() {
    if (!this.selected) return;
    this.selected = null;
    this.menuOpen = false;
    this.labelEditing = false;
    this.syncSelection();
  }

  select(line) {
    if (!this.available()) return false;
    const edge = this.visibleEdges().find(edge => this.same(edge, line.dataset));
    if (!edge) return false;
    const home = this.home;
    home.selected = false;
    home.menuOpen = false;
    home.syncNodeState();
    if (!this.same(this.selected, edge)) { this.menuOpen = false; this.labelEditing = false; }
    this.selected = { from: edge.from, to: edge.to };
    this.syncSelection();
    return true;
  }

  click(event) {
    if (event.target.closest?.('.diagram-connection-tools')) {
      const button = event.target.closest?.('[data-connection-action]');
      if (button) { event.preventDefault(); this.action(button.dataset.connectionAction, button); }
      return true;
    }
    const line = event.target.closest?.('.diagram-connection');
    if (!line) {
      this.clearSelection();
      if (document.activeElement?.closest?.('.diagram-connection')) {
        document.getElementById('mindmap-stage')?.focus({ preventScroll: true });
      }
      return false;
    }
    if (this.select(line)) line.focus({ preventScroll: true });
    return true;
  }

  keydown(event) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && (this.drag || this.editingRoute)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
      return;
    }
    if (event.target.closest?.('.diagram-connection-tools')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.menuOpen = false;
        this.labelEditing = false;
        this.renderTools();
        this.elements().find(line => this.same(line.dataset, this.selected))?.focus({ preventScroll: true });
      } else if (event.key === 'Enter' && event.target.id === 'diagram-connection-label-input') {
        event.preventDefault();
        this.action('save-label');
      }
      return;
    }
    const line = event.target.closest?.('.diagram-connection');
    if (!line || !this.available()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.clearSelection();
      document.getElementById('mindmap-stage')?.focus({ preventScroll: true });
    } else if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.select(line);
    } else if (['Delete', 'Backspace'].includes(event.key) &&
        !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && this.same(line.dataset, this.selected)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) void this.remove();
    }
  }

  remove() {
    if (!this.available() || !this.selected) return;
    const home = this.home, edge = this.visibleEdges().find(edge => this.same(edge, this.selected));
    if (!edge) { this.clearSelection(); return; }
    const extra = home.connections.findIndex(item => this.same(item, edge));
    if (extra >= 0) home.connections.splice(extra, 1);
    else home.hiddenConnections.push({ ...edge });
    home.connectionStyles = home.connectionStyles.filter(style => !this.same(style, edge));
    this.clearSelection();
    home.positionTree();
    document.getElementById('mindmap-stage')?.focus({ preventScroll: true });
    return home.save();
  }

  render(svg, edges) {
    const focused = document.activeElement?.closest?.('.diagram-connection');
    const focusKey = focused && { ...focused.dataset };
    const visible = edges.filter(edge => !this.home.hiddenConnections.some(hidden => this.same(edge, hidden)));
    if (!visible.some(edge => this.same(edge, this.selected))) this.selected = null;
    const names = new Map(this.home.ensureTree().map(node => [node.id, node.text]));
    this.drawn = visible.map(edge => {
      const style = this.style(edge);
      const points = this.same(this.editingRoute, edge) && this.editingRoute.preview
        ? this.editingRoute.preview : edge.points && DiagramRouting.anchored(style.points, edge.points, this.home.plan.origin);
      return { ...edge, points, path: points ? DiagramLayout.orthogonalPath(points) : edge.path, style };
    });
    svg.innerHTML = `<defs><marker id="diagram-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="diagram-arrow" d="M1 1 L9 5 L1 9"/></marker>
      <marker id="diagram-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="diagram-arrow" d="M9 1 L1 5 L9 9"/></marker></defs>` + this.drawn.map(edge => {
      const selected = this.same(edge, this.selected);
      const label = t('diagram_connection_label', { from: names.get(edge.from), to: names.get(edge.to) });
      const arrows = edge.style.arrows;
      const markers = `${['start', 'both'].includes(arrows) ? ' marker-start="url(#diagram-arrow-start)"' : ''}${['end', 'both'].includes(arrows) ? ' marker-end="url(#diagram-arrow-end)"' : ''}`;
      const middle = edge.points && DiagramRouting.midpoint(edge.points);
      const text = edge.style.label && middle ? `<text class="diagram-connection-label" x="${middle[0]}" y="${middle[1]}" dy=".35em">${esc(edge.style.label)}</text>` : '';
      return `<g class="diagram-connection${selected ? ' is-selected' : ''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}"
        tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(label)}">
        <path class="diagram-connection-hit" d="${edge.path}"/><path class="diagram-connection-line" d="${edge.path}"${markers}/>${text}</g>`;
    }).join('');
    if (focusKey) this.elements().find(line => this.same(line.dataset, focusKey))?.focus({ preventScroll: true });
    this.renderTools();
  }

  style(edge = this.selected) {
    return this.home.connectionStyles.find(style => this.same(style, edge)) || { points: null, label: '', arrows: 'none' };
  }

  setStyle(changes) {
    if (!this.selected || !this.available()) return;
    const edge = this.visibleEdges().find(edge => this.same(edge, this.selected));
    if (!edge) return;
    const previous = this.style(edge);
    this.home.connectionStyles = this.home.connectionStyles.filter(style => !this.same(style, edge));
    this.home.connectionStyles.push({ from: edge.from, to: edge.to, points: previous.points || null,
      label: previous.label || '', arrows: previous.arrows || 'none', ...changes });
    this.home.positionTree();
    return this.home.save();
  }

  renderTools() {
    const scene = document.getElementById('diagram-scene');
    if (!scene) return;
    let tools = document.getElementById('diagram-connection-tools');
    const edge = this.drawn.find(edge => this.same(edge, this.selected));
    if (!edge?.points || this.editingRoute) { tools?.remove(); return; }
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'diagram-connection-tools';
      tools.className = 'diagram-connection-tools';
      scene.append(tools);
    }
    const middle = DiagramRouting.midpoint(edge.points);
    tools.style.left = `${middle[0]}px`;
    tools.style.top = `${middle[1]}px`;
    // Preserve a label draft while unrelated geometry is refreshed.
    const input = document.getElementById('diagram-connection-label-input');
    const draft = input?.value ?? this.style().label;
    const focused = tools.contains(document.activeElement) ? document.activeElement.id : null;
    const option = (action, label, checked = null) => `<button type="button" data-connection-action="${action}"${checked === null ? '' : ` role="menuitemradio" aria-checked="${checked}"`}>${checked ? '✓ ' : ''}${esc(label)}</button>`;
    const arrows = this.style().arrows || 'none';
    const right = this.rightEndpoint(edge.points);
    tools.innerHTML = `<button type="button" id="diagram-connection-more" class="diagram-handle diagram-connection-more" data-connection-action="menu" aria-label="${esc(t('diagram_connection_options'))}" aria-haspopup="menu" aria-expanded="${this.menuOpen}">⋯</button>` +
      (this.menuOpen ? `<div id="diagram-connection-menu" class="diagram-connection-menu" role="${this.labelEditing ? 'group' : 'menu'}" aria-label="${esc(t('diagram_connection_options'))}">${this.labelEditing ?
        `<label for="diagram-connection-label-input">${esc(t('diagram_connection_text'))}</label><input id="diagram-connection-label-input" maxlength="120" value="${esc(draft || '')}"/>
        <div class="diagram-connection-label-actions">${option('save-label', t('save'))}${option('cancel-label', t('cancel'))}</div>` :
        option('delete', t('delete')) + option('label', t('diagram_connection_text')) + '<hr/>' +
        option('arrows-none', t('diagram_connection_no_arrows'), arrows === 'none') +
        option('arrows-right', t('diagram_connection_arrow_right'), arrows === right) +
        option('arrows-left', t('diagram_connection_arrow_left'), arrows === (right === 'end' ? 'start' : 'end')) +
        option('arrows-both', t('diagram_connection_arrow_both'), arrows === 'both')}
        </div>` : '');
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }

  rightEndpoint(points) {
    const first = points[0], last = points.at(-1);
    return last[0] > first[0] || last[0] === first[0] && last[1] >= first[1] ? 'end' : 'start';
  }

  action(action) {
    if (!this.selected || !this.available()) return;
    if (action === 'delete') { void this.remove(); return; }
    if (action === 'menu') { this.menuOpen = !this.menuOpen; this.labelEditing = false; }
    if (action === 'label') this.labelEditing = true;
    if (action === 'cancel-label') this.labelEditing = false;
    if (action === 'save-label') {
      const label = document.getElementById('diagram-connection-label-input')?.value || '';
      this.labelEditing = false;
      this.menuOpen = false;
      void this.setStyle({ label: label.trim() });
    }
    if (action.startsWith('arrows-')) {
      const edge = this.drawn.find(edge => this.same(edge, this.selected));
      if (!edge?.points) return;
      const right = this.rightEndpoint(edge.points);
      const arrows = { 'arrows-none': 'none', 'arrows-both': 'both', 'arrows-right': right,
        'arrows-left': right === 'end' ? 'start' : 'end' }[action];
      this.menuOpen = false;
      void this.setStyle({ arrows });
    }
    this.renderTools();
    if (action === 'label') document.getElementById('diagram-connection-label-input')?.focus({ preventScroll: true });
    if (this.menuOpen) this.home.viewport.reveal(document.getElementById('diagram-connection-menu'));
  }

  point(event) {
    const frame = document.getElementById('diagram-scene').getBoundingClientRect();
    return [(event.clientX - frame.left) / this.home.viewport.scale, (event.clientY - frame.top) / this.home.viewport.scale];
  }

  savePoints(points) {
    if (points.length > 64) { this.home.showStatus(t('diagram_connection_point_limit'), true); return; }
    const origin = this.home.plan.origin;
    const values = points.map(p => [p[0] - origin.x, p[1] - origin.y].map(value => Math.round(value * 100) / 100));
    if (values.some(p => p.some(value => !Number.isFinite(value) || Math.abs(value) > 1000000))) return;
    return this.setStyle({ points: values });
  }

  split(event) {
    const line = event.target.closest?.('.diagram-connection');
    if (!line || !this.available() || !this.select(line)) return;
    const edge = this.drawn.find(edge => this.same(edge, this.selected));
    if (!edge?.points) return;
    const segment = DiagramRouting.nearest(edge.points, this.point(event));
    if (!segment) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.savePoints(DiagramRouting.splitSegment(edge.points, segment.index, segment.point));
  }

  startRoute(event, line) {
    if (event.button !== 0 || event.isPrimary === false || !this.available() || !this.same(line.dataset, this.selected)) return;
    const edge = this.drawn.find(edge => this.same(edge, this.selected));
    if (!edge?.points) return;
    const segment = DiagramRouting.nearest(edge.points, this.point(event));
    if (!segment) return;
    this.menuOpen = false;
    line.focus({ preventScroll: true });
    this.editingRoute = { ...this.selected, points: edge.points.map(p => [...p]), index: segment.index,
      horizontal: segment.horizontal, x: event.clientX, y: event.clientY, pointerId: event.pointerId,
      scale: this.home.viewport.scale, stage: document.getElementById('mindmap-stage'), moving: false };
  }

  moveRoute(event) {
    const edit = this.editingRoute;
    if (event.pointerId !== edit.pointerId) return;
    const delta = edit.horizontal ? event.clientY - edit.y : event.clientX - edit.x;
    if (!edit.moving && Math.abs(delta) < 5) return;
    event.preventDefault();
    if (!edit.moving) edit.stage.setPointerCapture?.(edit.pointerId);
    edit.moving = true;
    edit.preview = DiagramRouting.moveSegment(edit.points, edit.index, delta / edit.scale);
    this.render(document.getElementById('diagram-connections'), this.home.plan.edges);
  }

  finishRoute(commit) {
    const edit = this.editingRoute;
    if (!edit) return;
    this.editingRoute = null;
    if (edit.stage.hasPointerCapture?.(edit.pointerId)) edit.stage.releasePointerCapture(edit.pointerId);
    if (edit.moving) {
      this.home.suppressNodeClick = true;
      if (commit) void this.savePoints(edit.preview);
      else this.home.positionTree();
    }
  }

  canConnect(from, to) {
    const home = this.home;
    const source = home.ensureTree().find((node) => node.id === from);
    const target = home.ensureTree().find((node) => node.id === to);
    if (source && target && home.hiddenConnections.some(edge => this.same(edge, { from, to }))) return true;
    return !!source && !!target && from !== to && source.parent_id !== to && target.parent_id !== from &&
      !home.connections.some((edge) => edge.from === from && edge.to === to || edge.from === to && edge.to === from);
  }

  connect(from, to) {
    const home = this.home;
    if (!this.canConnect(from, to)) return;
    const hidden = home.hiddenConnections.findIndex(edge => this.same(edge, { from, to }));
    if (hidden >= 0) home.hiddenConnections.splice(hidden, 1);
    else {
      if (home.connections.length >= 1000) { home.showStatus(t('diagram_connection_limit'), true); return; }
      home.connections.push({ from, to });
    }
    home.positionTree();
    return home.save();
  }

  start(event) {
    const line = event.target.closest?.('.diagram-connection');
    if (line) { this.startRoute(event, line); return; }
    const home = this.home;
    const handle = event.target.closest?.('.diagram-handle-add');
    if (!handle || event.button !== 0 || event.isPrimary === false || this.drag || home.drag || home.resizing ||
        home.editing || home.titleEditing || home.layoutOpen || home.switching || home.nodeTools.busy ||
        home.viewport.isInteracting()) return;
    const from = home.keyFor(handle);
    if (!home.selected || home.selectedKey !== from) return;
    this.drag = { handle, from, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moving: false, target: null };
  }

  targetAt(event) {
    const box = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.diagram-node');
    const to = box && this.home.keyFor(box);
    return to && this.canConnect(this.drag.from, to) ? to : null;
  }

  move(event) {
    if (this.editingRoute) { this.moveRoute(event); return; }
    const drag = this.drag, home = this.home;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    event.preventDefault();
    if (!drag.moving) {
      drag.moving = true;
      drag.handle.setPointerCapture?.(drag.pointerId);
      home.menuOpen = false;
      home.syncNodeState();
      document.getElementById('mindmap-stage')?.classList.add('is-connecting');
    }
    home.element('node', drag.target)?.classList.remove('is-connection-target');
    drag.target = this.targetAt(event);
    home.element('node', drag.target)?.classList.add('is-connection-target');
    this.preview(event);
  }

  preview(event) {
    const home = this.home, drag = this.drag;
    const stage = document.getElementById('mindmap-stage');
    if (!stage) return;
    if (!drag.svg) {
      drag.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      drag.svg.setAttribute('class', 'diagram-connections diagram-connection-preview');
      drag.svg.setAttribute('aria-hidden', 'true');
      drag.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      drag.svg.append(drag.path);
      stage.append(drag.svg);
    }
    const frame = stage.getBoundingClientRect(), scale = home.viewport.scale;
    drag.svg.setAttribute('viewBox', `0 0 ${stage.clientWidth / scale} ${stage.clientHeight / scale}`);
    const rect = (key) => {
      const box = home.element('node', key).getBoundingClientRect();
      return { id: key, x: (box.left - frame.left - stage.clientLeft) / scale,
        y: (box.top - frame.top - stage.clientTop) / scale, width: box.width / scale, height: box.height / scale,
        layout: DiagramLayout.defaults('free') };
    };
    const from = rect(drag.from);
    const to = drag.target ? rect(drag.target) : { id: 'pointer',
      x: (event.clientX - frame.left - stage.clientLeft) / scale,
      y: (event.clientY - frame.top - stage.clientTop) / scale, width: 0, height: 0 };
    drag.path.setAttribute('d', DiagramLayout.connectionPath(from, to));
  }

  finish(event, commit) {
    if (this.editingRoute?.pointerId === event.pointerId) { this.finishRoute(commit); return; }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const to = commit && drag.moving ? this.targetAt(event) : null;
    this.cancel();
    if (to) void this.connect(drag.from, to);
  }

  cancel() {
    this.finishRoute(false);
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.home.element('node', drag.target)?.classList.remove('is-connection-target');
    drag.svg?.remove();
    document.getElementById('mindmap-stage')?.classList.remove('is-connecting');
    if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    // The click emitted after a drag must not create an extra child.
    if (drag.moving) this.home.suppressNodeClick = true;
  }
}
