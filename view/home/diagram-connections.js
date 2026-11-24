'use strict';

class DiagramConnections {
  constructor(home) {
    this.home = home;
    this.drag = null;
    this.selected = null;
    document.addEventListener('pointerdown', (event) => this.start(event));
    document.addEventListener('pointermove', (event) => this.move(event));
    document.addEventListener('pointerup', (event) => this.finish(event, true));
    document.addEventListener('pointercancel', (event) => this.finish(event, false));
    document.addEventListener('lostpointercapture', (event) => this.finish(event, false));
    document.addEventListener('focusin', (event) => {
      const line = event.target.closest?.('.diagram-connection');
      if (line) this.select(line);
      else this.clearSelection();
    });
    document.addEventListener('keydown', (event) => this.keydown(event));
    window.addEventListener('blur', () => this.cancel());
  }

  same(a, b) {
    return !!a && !!b && (a.from === b.from && a.to === b.to || a.from === b.to && a.to === b.from);
  }

  available() {
    const home = this.home;
    return !this.drag && !home.drag && !home.resizing && !home.editing && !home.titleEditing &&
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
  }

  clearSelection() {
    if (!this.selected) return;
    this.selected = null;
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
    this.selected = { from: edge.from, to: edge.to };
    this.syncSelection();
    return true;
  }

  click(event) {
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
    if (event.key === 'Escape' && this.drag) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
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
    svg.innerHTML = visible.map(edge => {
      const selected = this.same(edge, this.selected);
      const label = t('diagram_connection_label', { from: names.get(edge.from), to: names.get(edge.to) });
      return `<g class="diagram-connection${selected ? ' is-selected' : ''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}"
        tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(label)}">
        <path class="diagram-connection-hit" d="${edge.path}"/><path class="diagram-connection-line" d="${edge.path}"/></g>`;
    }).join('');
    if (focusKey) this.elements().find(line => this.same(line.dataset, focusKey))?.focus({ preventScroll: true });
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
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const to = commit && drag.moving ? this.targetAt(event) : null;
    this.cancel();
    if (to) void this.connect(drag.from, to);
  }

  cancel() {
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
