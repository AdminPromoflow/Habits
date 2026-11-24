'use strict';

// Temporary visual guides use rendered box coordinates; saved positions stay intact.
const DiagramAlignment = (() => {
  const TOLERANCE = 4;
  const EXTENSION = 12;
  const EPSILON = 0.000001;

  function valid(box) {
    return box && [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
      box.width > 0 && box.height > 0;
  }

  function anchors(box, axis) {
    const size = axis === 'x' ? box.width : box.height;
    return [box[axis], box[axis] + size / 2, box[axis] + size];
  }

  function guides(boxes, movingId, excludedIds = new Set(), scale = 1) {
    if (!Array.isArray(boxes)) return [];
    const moving = boxes.find(box => box?.id === movingId);
    if (!valid(moving)) return [];
    const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const tolerance = TOLERANCE / zoom;
    const extension = EXTENSION / zoom;
    const targets = boxes.filter(box => valid(box) && box.id !== movingId && !excludedIds.has(box.id));
    const result = [];

    for (const axis of ['x', 'y']) {
      const across = axis === 'x' ? 'y' : 'x';
      const acrossSize = axis === 'x' ? 'height' : 'width';
      const movingAnchors = anchors(moving, axis);
      const matches = [];
      movingAnchors.forEach((position, anchor) => {
        const candidates = [];
        for (const target of targets) {
          anchors(target, axis).forEach((targetPosition, targetAnchor) => {
            // A center is meaningful against another center; edges may meet either edge.
            if ((anchor === 1) !== (targetAnchor === 1)) return;
            const distance = Math.abs(position - targetPosition);
            if (distance > tolerance + EPSILON) return;
            const gap = Math.max(0, target[across] - moving[across] - moving[acrossSize],
              moving[across] - target[across] - target[acrossSize]);
            candidates.push({ target, position: targetPosition, distance, gap,
              sameAnchor: anchor === targetAnchor });
          });
        }
        candidates.sort((a, b) => a.distance - b.distance || Number(b.sameAnchor) - Number(a.sameAnchor) ||
          a.gap - b.gap || a.position - b.position);
        const nearest = candidates[0];
        if (!nearest) return;
        // Several boxes on the same line share one guide instead of overlapping strokes.
        const aligned = candidates.filter(candidate => Math.abs(candidate.position - nearest.position) < EPSILON);
        matches.push({ axis, position: nearest.position,
          start: Math.min(moving[across], ...aligned.map(candidate => candidate.target[across])) - extension,
          end: Math.max(moving[across] + moving[acrossSize],
            ...aligned.map(candidate => candidate.target[across] + candidate.target[acrossSize])) + extension,
          kind: anchor === 1 ? 'center' : 'edge' });
      });
      for (const match of matches) {
        const existing = result.find(guide => guide.axis === axis && Math.abs(guide.position - match.position) < EPSILON);
        if (existing) {
          existing.start = Math.min(existing.start, match.start);
          existing.end = Math.max(existing.end, match.end);
          if (match.kind === 'center') existing.kind = 'center';
        } else result.push(match);
      }
    }
    return result;
  }

  function spacing(boxes, movingId, excludedIds = new Set(), scale = 1) {
    if (!Array.isArray(boxes)) return [];
    const moving = boxes.find(box => box?.id === movingId);
    if (!valid(moving)) return [];
    const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const tolerance = TOLERANCE / zoom;
    const siblings = boxes.filter(box => valid(box) && box.parent_id === moving.parent_id &&
      (box.id === movingId || !excludedIds.has(box.id)));
    const result = [];

    for (const axis of ['x', 'y']) {
      const size = axis === 'x' ? 'width' : 'height';
      const across = axis === 'x' ? 'y' : 'x';
      const acrossSize = axis === 'x' ? 'height' : 'width';
      const previous = new Map(), next = new Map();
      const nearer = (candidate, current) => !current || candidate.gap < current.gap - EPSILON ||
        (Math.abs(candidate.gap - current.gap) < EPSILON && candidate.offset < current.offset);
      for (const first of siblings) {
        for (const second of siblings) {
          if (first === second) continue;
          const gap = second[axis] - first[axis] - first[size];
          if (gap <= EPSILON) continue;
          const overlap = Math.min(first[across] + first[acrossSize], second[across] + second[acrossSize]) -
            Math.max(first[across], second[across]);
          // Keep diagonally separated boxes out of row/column measurements.
          if (overlap < Math.min(first[acrossSize], second[acrossSize]) / 4) continue;
          const candidate = { first, second, gap,
            offset: Math.abs(first[across] + first[acrossSize] / 2 - second[across] - second[acrossSize] / 2) };
          if (nearer(candidate, next.get(first.id))) next.set(first.id, candidate);
          if (nearer(candidate, previous.get(second.id))) previous.set(second.id, candidate);
        }
      }
      // Mutual neighbors prevent references from skipping an intervening sibling.
      const pairs = [...next.values()].filter(pair => previous.get(pair.second.id)?.first.id === pair.first.id);
      const incident = pairs.filter(pair => pair.first.id === movingId || pair.second.id === movingId);
      const shown = new Set(incident), matched = new Set();
      for (const pair of incident) {
        const references = pairs.filter(other => other !== pair && Math.abs(other.gap - pair.gap) <= tolerance + EPSILON);
        references.sort((a, b) => Math.abs(a.gap - pair.gap) - Math.abs(b.gap - pair.gap) ||
          Math.hypot(a.first.x - moving.x, a.first.y - moving.y) - Math.hypot(b.first.x - moving.x, b.first.y - moving.y));
        const reference = references[0];
        if (reference) {
          matched.add(pair);
          matched.add(reference);
          shown.add(reference);
        }
      }
      for (const pair of shown) {
        result.push({ axis,
          position: Math.min(pair.first[across], pair.second[across]) - 18 / zoom,
          start: pair.first[axis] + pair.first[size], end: pair.second[axis], gap: pair.gap,
          matched: matched.has(pair), from: pair.first.id, to: pair.second.id });
      }
    }
    return result;
  }

  return { guides, spacing };
})();
