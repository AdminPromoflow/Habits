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
      (edge.target_node === node.id || (edge.target_node === null && node.id === 'root')) &&
      !(edge.diagram_id === current && edge.node_id === node.id) &&
      // An explicit reciprocal link already provides this return destination.
      !(node.link?.diagram_id === edge.diagram_id && node.link?.node_id === edge.node_id));
  }

  key(id) {
    return `diagram-trail:v1:${JSON.stringify([new URL(location.href).pathname, String(S.user?.id || ''), String(id)])}`;
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
    const edges = this.edges(diagrams);
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
    if (link.diagram_id === this.home.active?.id) return;
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

  html() {
    const diagrams = this.catalog(), trail = this.trail(this.home.active?.id, diagrams);
    if (trail.length < 2) return '';
    const items = trail.map((entry, index) => {
      const name = diagrams.find(diagram => diagram.id === entry.diagram_id).name;
      const current = index === trail.length - 1;
      return `<li>${index ? '<span class="diagram-trail-separator" aria-hidden="true">›</span>' : ''}${current
        ? `<span aria-current="page" title="${esc(name)}">${esc(name)}</span>`
        : `<button type="button" data-action="diagram-link-ancestor" data-trail-index="${index}" title="${esc(name)}">${esc(name)}</button>`}</li>`;
    }).join('');
    return `<nav class="diagram-link-trail" aria-label="${esc(t('diagram_link_path'))}"><ol>${items}</ol></nav>`;
  }

  async visit(index) {
    const trail = this.trail(), target = trail[index];
    if (!target || index === trail.length - 1) return;
    return this.home.links.follow({ diagram_id: target.diagram_id, node_id: target.node_id },
      { returning: true, trail: trail.slice(0, index + 1) });
  }
}
