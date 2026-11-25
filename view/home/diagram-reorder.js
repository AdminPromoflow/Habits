'use strict';

// Insertion targets stay in diagram-local coordinates throughout a drag, even
// when moving a branch changes the scene's bounding box and origin.
const DiagramReorder = (() => {
  function slots(nodes, plan, movingId) {
    const moving = nodes.find(node => node.id === movingId);
    if (!moving?.parent_id || !plan) return [];
    const parent = plan.nodes.find(box => box.id === moving.parent_id);
    if (!parent) return [];
    const layout = DiagramLayout.effective(nodes, moving.parent_id);
    if (layout.mode === 'free') return [];
    const siblings = nodes.filter(node => node.parent_id === moving.parent_id);
    if (siblings.length < 2) return [];
    const remaining = siblings.filter(node => node.id !== movingId);
    const boxes = new Map(plan.nodes.map(box => [box.id, {
      ...box, x: box.x - plan.origin.x, y: box.y - plan.origin.y,
    }]));
    const groups = [];
    const group = (items, axis, reverse = false) => groups.push({ items, axis, sign: reverse ? -1 : 1 });
    const root = nodes.find(node => node.id === parent.id)?.parent_id == null;
    const rtl = layout.horizontal === 'rtl';
    if (layout.mode === 'horizontal') {
      if (root && !['left', 'right'].includes(layout.direction)) {
        const split = Math.ceil(siblings.length / 2);
        group(siblings.slice(0, split), 'y');
        group(siblings.slice(split), 'y', layout.direction === 'clockwise');
      } else group(siblings, 'y');
    } else if (layout.mode === 'vertical') {
      if (root && !['top', 'bottom'].includes(layout.direction)) {
        const split = Math.ceil(siblings.length / 2);
        group(siblings.slice(0, split), 'x');
        group(siblings.slice(split), 'x');
      } else group(siblings, 'x');
    } else if (layout.mode === 'topdown') group(siblings, 'x', rtl);
    else if (layout.mode === 'list') group(siblings, 'y', rtl !== (layout.vertical === 'top'));
    else if (layout.mode === 'matrix') group(siblings, 'y', rtl);
    else if (layout.mode === 'linear') {
      if (parent.linearRole === 'branch') group(siblings, 'y', parent.linearSide === 'top');
      else group(siblings, 'x', rtl);
    } else group(siblings, 'radial');

    const children = new Map();
    for (const node of nodes) {
      if (!children.has(node.parent_id)) children.set(node.parent_id, []);
      children.get(node.parent_id).push(node.id);
    }
    function branchBoxes(id) {
      return [boxes.get(id), ...(children.get(id) || []).flatMap(branchBoxes)].filter(Boolean);
    }
    const result = [];
    const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    for (const { items, axis, sign } of groups) {
      const peers = items.filter(node => node.id !== movingId && boxes.has(node.id));
      if (!peers.length) continue;
      for (let at = 0; at <= peers.length; at++) {
        const before = peers[at - 1], after = peers[at];
        const a = boxes.get(before?.id), b = boxes.get(after?.id);
        const index = after ? remaining.indexOf(after) : remaining.indexOf(before) + 1;
        if (axis === 'radial') {
          const origin = center(boxes.get(parent.id));
          const angle = box => {
            const point = center(box);
            return (Math.atan2(point.y - origin.y, point.x - origin.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
          };
          const step = Math.PI * 2 / siblings.length;
          const theta = (a && b ? (angle(a) + angle(b)) / 2 : a ? angle(a) + step / 2 : angle(b) - step / 2) - Math.PI / 2;
          const refs = [a, b].filter(Boolean);
          const radius = refs.reduce((sum, box) => {
            const point = center(box);
            return sum + Math.hypot(point.x - origin.x, point.y - origin.y);
          }, 0) / refs.length;
          const length = Math.max(...refs.map(box => Math.min(220, Math.max(box.width, box.height)))) / 2;
          result.push({ index,
            x1: origin.x + Math.cos(theta) * (radius - length), y1: origin.y + Math.sin(theta) * (radius - length),
            x2: origin.x + Math.cos(theta) * (radius + length), y2: origin.y + Math.sin(theta) * (radius + length) });
          continue;
        }
        const size = axis === 'x' ? 'width' : 'height';
        const across = axis === 'x' ? 'y' : 'x', acrossSize = axis === 'x' ? 'height' : 'width';
        const edge = (node, end) => {
          const branch = branchBoxes(node.id);
          return end ? Math.max(...branch.map(box => box[axis] + box[size])) : Math.min(...branch.map(box => box[axis]));
        };
        const from = before ? edge(before, sign > 0) : null;
        const to = after ? edge(after, sign < 0) : null;
        const position = a && b ? (from + to) / 2 : a ? from + sign * 16 : to - sign * 16;
        const refs = [a, b].filter(Boolean);
        const start = Math.min(...refs.map(box => box[across])) - 12;
        const end = Math.max(...refs.map(box => box[across] + box[acrossSize])) + 12;
        result.push(axis === 'x' ? { index, x1: position, y1: start, x2: position, y2: end }
          : { index, x1: start, y1: position, x2: end, y2: position });
      }
    }
    return result;
  }

  function target(slots, point, scale = 1) {
    if (!point) return null;
    let nearest = null, distance = 24 / scale;
    for (const slot of slots) {
      const dx = slot.x2 - slot.x1, dy = slot.y2 - slot.y1;
      const t = Math.max(0, Math.min(1, ((point.x - slot.x1) * dx + (point.y - slot.y1) * dy) / (dx * dx + dy * dy)));
      const gap = Math.hypot(point.x - slot.x1 - t * dx, point.y - slot.y1 - t * dy);
      if (gap < distance) { nearest = slot; distance = gap; }
    }
    return nearest;
  }

  function apply(nodes, movingId, index) {
    const moving = nodes.find(node => node.id === movingId);
    if (!moving?.parent_id || DiagramLayout.effective(nodes, moving.parent_id).mode === 'free') return nodes;
    const siblings = nodes.filter(node => node.parent_id === moving.parent_id && node !== moving);
    siblings.splice(Math.max(0, Math.min(siblings.length, index)), 0, moving);
    const affected = new Set(siblings.map(node => node.id));
    // Restore automatic placement for the complete sibling branches, including
    // folded descendants. Their hierarchy, content and layout choices stay intact.
    for (let added = true; added;) {
      added = false;
      for (const node of nodes) if (affected.has(node.parent_id) && !affected.has(node.id)) {
        affected.add(node.id); added = true;
      }
    }
    let at = 0;
    return nodes.map(node => {
      const next = node.parent_id === moving.parent_id ? siblings[at++] : node;
      return affected.has(next.id) ? { ...next, x: null, y: null } : next;
    });
  }

  return { slots, target, apply };
})();
