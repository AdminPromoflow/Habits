'use strict';

// Backlinks are derived from the saved outgoing links. They never replace a
// destination's own link, and disappear automatically with their source.
class DiagramLinkNavigation {
  constructor(home) {
    this.home = home;
    this.memory = new Map();
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

  children(diagrams = this.catalog(), trail = this.trail(this.home.active?.id, diagrams)) {
    const seen = new Set(trail.map(entry => entry.diagram_id));
    return this.diagramEdges(diagrams).filter(edge => {
      if (edge.diagram_id !== this.home.active?.id || seen.has(edge.target_diagram)) return false;
      seen.add(edge.target_diagram);
      return true;
    });
  }

  html() {
    const diagrams = this.catalog(), trail = this.trail(this.home.active?.id, diagrams);
    const children = this.children(diagrams, trail);
    if (trail.length < 2 && !children.length) return '';
    const items = trail.map((entry, index) => {
      const name = diagrams.find(diagram => diagram.id === entry.diagram_id).name;
      const current = index === trail.length - 1;
      return `<li>${index ? '<span class="diagram-trail-separator" aria-hidden="true">›</span>' : ''}<button type="button"
        data-action="diagram-link-ancestor" data-trail-index="${index}" ${current ? 'aria-current="page"' : ''}
        title="${esc(name)}">${esc(name)}</button></li>`;
    }).join('');
    const descendants = children.length ? `<li class="diagram-trail-children"><span class="diagram-trail-separator" aria-hidden="true">›</span>
      <ul aria-label="${esc(t('diagram_link_children'))}">${children.map(edge => {
        const name = diagrams.find(diagram => diagram.id === edge.target_diagram).name;
        return `<li><button type="button" data-action="diagram-link-child" data-child-diagram="${edge.target_diagram}" title="${esc(name)}">${esc(name)}</button></li>`;
      }).join('')}</ul></li>` : '';
    return `<nav class="diagram-link-trail" aria-label="${esc(t('diagram_link_path'))}"><ol>${items}${descendants}</ol></nav>`;
  }

  async visit(index) {
    const trail = this.trail(), target = trail[index];
    if (!target) return;
    return this.home.links.follow({ diagram_id: target.diagram_id, node_id: null },
      { returning: true, trail: trail.slice(0, index + 1) });
  }

  async visitChild(id) {
    const edge = this.children().find(item => item.target_diagram === id);
    if (!edge) return;
    const trail = this.trail();
    trail[trail.length - 1].node_id = edge.node_id;
    trail.push({ diagram_id: id, node_id: null });
    return this.home.links.follow({ diagram_id: id, node_id: null }, { trail });
  }
}
