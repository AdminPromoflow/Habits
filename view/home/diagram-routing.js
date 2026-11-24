'use strict';

const DiagramRouting = (() => {
  const copy = points => points.map(point => [...point]);
  const length = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

  function nearest(points, point) {
    let best = null;
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index], b = points[index + 1];
      if (!length(a, b)) continue;
      const projected = [Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), point[0])),
        Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), point[1]))];
      const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
      if (!best || distance < best.distance) best = { index, horizontal: a[1] === b[1], point: projected, distance };
    }
    return best;
  }

  function midpoint(points) {
    const lengths = points.slice(1).map((point, index) => length(points[index], point));
    let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2;
    for (let index = 0; index < lengths.length; index++) {
      if (remaining <= lengths[index] && lengths[index]) {
        const a = points[index], b = points[index + 1], t = remaining / lengths[index];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      remaining -= lengths[index];
    }
    return [...points[0]];
  }

  function anchored(saved, automatic, origin) {
    if (!saved?.length) return copy(automatic);
    const inner = saved.slice(1, -1).map(p => [p[0] + origin.x, p[1] + origin.y]);
    const start = automatic[0], end = automatic.at(-1);
    if (!inner.length) return copy(automatic);
    const first = inner[0], last = inner.at(-1);
    const startHorizontal = start[1] === automatic[1][1];
    const endHorizontal = end[1] === automatic.at(-2)[1];
    const lead = startHorizontal ? [first[0], start[1]] : [start[0], first[1]];
    const tail = endHorizontal ? [last[0], end[1]] : [end[0], last[1]];
    return DiagramLayout.simplifyPoints([[...start], lead, ...inner, tail, [...end]]);
  }

  function moveSegment(points, index, delta) {
    const a = points[index], b = points[index + 1];
    const horizontal = a[1] === b[1], axis = horizontal ? 1 : 0, along = 1 - axis;
    const sign = Math.sign(b[along] - a[along]);
    const pad = Math.min(20, length(a, b) / 4);
    const shiftedA = [...a], shiftedB = [...b];
    shiftedA[axis] += delta; shiftedB[axis] += delta;
    const leading = copy(points.slice(0, index)), trailing = copy(points.slice(index + 2));
    if (index === 0) {
      const stub = [...a]; stub[along] += sign * pad;
      shiftedA[along] = stub[along];
      leading.push([...a], stub);
    }
    if (index === points.length - 2) {
      const stub = [...b]; stub[along] -= sign * pad;
      shiftedB[along] = stub[along];
      trailing.unshift(stub, [...b]);
    }
    return DiagramLayout.simplifyPoints([...leading, shiftedA, shiftedB, ...trailing]);
  }

  function splitSegment(points, index, point) {
    const a = points[index], b = points[index + 1];
    const horizontal = a[1] === b[1], axis = horizontal ? 1 : 0, along = 1 - axis;
    const sign = Math.sign(b[along] - a[along]);
    const span = Math.min(20, length(a, b) / 4);
    const middle = Math.max(Math.min(a[along], b[along]) + span,
      Math.min(Math.max(a[along], b[along]) - span, point[along]));
    const entry = [...a], exit = [...a];
    entry[along] = middle - sign * span / 2;
    exit[along] = middle + sign * span / 2;
    const turnA = [...entry], turnB = [...exit];
    turnA[axis] += 24; turnB[axis] += 24;
    return DiagramLayout.simplifyPoints([...copy(points.slice(0, index + 1)), entry, turnA, turnB, exit,
      ...copy(points.slice(index + 1))]);
  }

  return Object.freeze({ nearest, midpoint, anchored, moveSegment, splitSegment });
})();
