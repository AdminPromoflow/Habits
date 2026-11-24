'use strict';

// Layout coordinates are local to the diagram; the returned origin translates
// them into the positive canvas area. Persist drag positions before that offset.
const DiagramLayout = (() => {
  const MODES = ['free', 'horizontal', 'vertical', 'list', 'topdown', 'linear', 'radial', 'matrix'];
  const DIRECTIONS = ['auto', 'clockwise', 'left', 'right', 'top', 'bottom', 'manual'];
  const VERTICAL = ['auto', 'compact', 'alternating', 'top', 'bottom'];
  const HORIZONTAL = ['auto', 'ltr', 'rtl'];
  const PADDING = 72;
  const GAP = 64;
  const ROW_GAP = 32;

  function defaults(mode = 'horizontal') {
    return {
      mode: MODES.includes(mode) ? mode : 'horizontal',
      direction: 'auto',
      vertical: mode === 'linear' ? 'compact' : mode === 'matrix' ? 'bottom' : 'auto',
      horizontal: 'auto',
    };
  }

  function normalize(value) {
    const result = defaults(value?.mode);
    if (DIRECTIONS.includes(value?.direction)) result.direction = value.direction;
    if (VERTICAL.includes(value?.vertical)) result.vertical = value.vertical;
    if (HORIZONTAL.includes(value?.horizontal)) result.horizontal = value.horizontal;
    return result;
  }

  function indexNodes(nodes) {
    if (!Array.isArray(nodes) || nodes.length > 200) throw new TypeError('Invalid diagram nodes');
    const index = new Map();
    for (const node of nodes) {
      if (!node || typeof node.id !== 'string' || !node.id || index.has(node.id)) {
        throw new TypeError('Duplicate or invalid node identifier');
      }
      index.set(node.id, { node, children: [] });
    }
    const roots = [];
    for (const item of index.values()) {
      if (item.node.parent_id == null) roots.push(item);
      else {
        const parent = index.get(item.node.parent_id);
        if (!parent) throw new TypeError('Missing parent node');
        parent.children.push(item);
      }
    }
    if (nodes.length && !roots.length) throw new TypeError('A diagram needs a root');
    // Keep the original root as the canvas anchor even when another root is
    // encountered first in the stored node order.
    const primary = roots.findIndex((item) => item.node.id === 'root');
    if (primary > 0) roots.unshift(...roots.splice(primary, 1));
    const visited = new Set();
    function visit(item, depth, inherited) {
      if (depth > 30 || visited.has(item.node.id)) throw new TypeError('Invalid diagram hierarchy');
      visited.add(item.node.id);
      item.layout = item.node.layout ? normalize(item.node.layout) : { ...inherited };
      item.children.forEach((child) => visit(child, depth + 1, item.layout));
    }
    roots.forEach((root) => visit(root, 0, defaults()));
    if (visited.size !== nodes.length) throw new TypeError('Invalid diagram hierarchy');
    return { index, roots };
  }

  function effective(nodes, id) {
    const item = indexNodes(nodes).index.get(id);
    if (!item) throw new RangeError('Unknown diagram node');
    return { ...item.layout };
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function dimension(value, fallback, min, max) {
    return finite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }

  function measure(item, sizes) {
    const supplied = sizes instanceof Map ? sizes.get(item.node.id) : sizes?.[item.node.id];
    const preferredWidth = dimension(item.node.width, item.node.parent_id == null ? 220 : 180, 100, 600);
    const width = dimension(supplied?.width, preferredWidth, 80, 600);
    const lines = String(item.node.text || '').split('\n').reduce((count, line) =>
      count + Math.max(1, Math.ceil(line.length / Math.max(8, Math.floor((width - 24) / 8)))), 0);
    return { width, height: dimension(supplied?.height, Math.max(48, lines * 24 + 24), 40, 3000) };
  }

  function bounds(entries) {
    return {
      minX: Math.min(...entries.map((entry) => entry.x)),
      minY: Math.min(...entries.map((entry) => entry.y)),
      maxX: Math.max(...entries.map((entry) => entry.x + entry.width)),
      maxY: Math.max(...entries.map((entry) => entry.y + entry.height)),
    };
  }

  function blockWidth(block) { return block.maxX - block.minX; }
  function blockHeight(block) { return block.maxY - block.minY; }
  function move(block, x, y) {
    return block.entries.map((entry) => ({ ...entry, x: entry.x + x, y: entry.y + y }));
  }
  function overlap(a, b, gap = 0) {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
      a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  }

  function arrange(nodes, sizes = {}, connections = []) {
    const { roots } = indexNodes(nodes);
    if (!roots.length) return { nodes: [], edges: [], width: 0, height: 0, origin: { x: 0, y: 0 } };

    function build(item, flow = { x: 'right', y: 'bottom' }) {
      const layout = item.layout;
      const box = measure(item, sizes);
      const self = { id: item.node.id, x: 0, y: 0, ...box, layout: { ...layout } };
      // A linear group has one horizontal axis. Its inherited descendants form
      // indented columns extending away from that axis, rather than more axes.
      const linearBranch = layout.mode === 'linear' && !item.node.layout && flow.linearSide;
      if (layout.mode === 'linear') Object.assign(self, {
        linearRole: linearBranch ? 'branch' : 'axis',
        linearSide: linearBranch || null,
        linearReverse: linearBranch ? flow.linearReverse : layout.horizontal === 'rtl',
      });
      let entries = [self];
      let childItems = [...item.children];
      if (layout.horizontal === 'rtl' && ['list', 'topdown', 'matrix'].includes(layout.mode)) {
        childItems.reverse();
      }
      const isRoot = item.node.parent_id == null;
      const direction = layout.direction;

      // Keep each child's complete bounding box together, including mixed layouts.
      function verticalStack(children, side, gap = ROW_GAP) {
        if (!children.length) return;
        const blocks = children.map((child) => build(child, { ...flow, x: side }));
        const total = blocks.reduce((sum, block) => sum + blockHeight(block), 0) + gap * (blocks.length - 1);
        let top = (self.height - total) / 2;
        const placed = [];
        const centers = [];
        for (const block of blocks) {
          const left = side === 'left' ? -GAP - blockWidth(block) : self.width + GAP;
          const branch = move(block, left - block.minX, top - block.minY);
          centers.push(branch[0].y + branch[0].height / 2);
          placed.push(...branch);
          top += blockHeight(block) + gap;
        }
        const shift = self.height / 2 - (Math.min(...centers) + Math.max(...centers)) / 2;
        entries.push(...placed.map(entry => ({ ...entry, y: entry.y + shift })));
      }

      function horizontalRow(children, side, gap = ROW_GAP) {
        if (!children.length) return;
        const blocks = children.map((child) => build(child, { ...flow, y: side }));
        const total = blocks.reduce((sum, block) => sum + blockWidth(block), 0) + gap * (blocks.length - 1);
        let left = (self.width - total) / 2;
        const placed = [];
        const centers = [];
        for (const block of blocks) {
          const top = side === 'top' ? -GAP - blockHeight(block) : self.height + GAP;
          const branch = move(block, left - block.minX, top - block.minY);
          centers.push(branch[0].x + branch[0].width / 2);
          placed.push(...branch);
          left += blockWidth(block) + gap;
        }
        const shift = self.width / 2 - (Math.min(...centers) + Math.max(...centers)) / 2;
        entries.push(...placed.map(entry => ({ ...entry, x: entry.x + shift })));
      }

      if (layout.mode === 'horizontal') {
        if (direction === 'left' || direction === 'right') verticalStack(childItems, direction);
        else if (isRoot && childItems.length > 1) {
          const split = Math.ceil(childItems.length / 2);
          verticalStack(childItems.slice(0, split), 'right');
          const left = childItems.slice(split);
          verticalStack(direction === 'clockwise' ? left.reverse() : left, 'left');
        } else verticalStack(childItems, flow.x);
      } else if (layout.mode === 'vertical') {
        if (direction === 'top' || direction === 'bottom') horizontalRow(childItems, direction);
        else if (isRoot && childItems.length > 1) {
          const split = Math.ceil(childItems.length / 2);
          horizontalRow(childItems.slice(0, split), 'bottom');
          horizontalRow(childItems.slice(split), 'top');
        } else horizontalRow(childItems, flow.y);
      } else if (layout.mode === 'topdown') {
        horizontalRow(childItems, layout.vertical === 'top' ? 'top' : 'bottom');
      } else if (layout.mode === 'list' || linearBranch) {
        const side = linearBranch || (layout.vertical === 'top' ? 'top' : 'bottom');
        const reverse = linearBranch ? flow.linearReverse : layout.horizontal === 'rtl';
        const indent = Math.min(48, self.width / 3);
        let next = side === 'top' ? -ROW_GAP : self.height + ROW_GAP;
        for (const child of childItems) {
          const block = build(child, flow);
          const left = reverse ? self.width - indent - blockWidth(block) : indent;
          const top = side === 'top' ? next - blockHeight(block) : next;
          entries.push(...move(block, left - block.minX, top - block.minY));
          next += (side === 'top' ? -1 : 1) * (blockHeight(block) + ROW_GAP);
        }
      } else if (layout.mode === 'linear') {
        const reverse = layout.horizontal === 'rtl';
        const compact = layout.vertical === 'compact';
        let next = (reverse ? 0 : self.width) + GAP;
        const sideEnds = { top: next, bottom: next };
        let lastCenter = null, lastWidth = 0;
        childItems.forEach((child, index) => {
          const side = layout.vertical === 'top' ? 'top' : layout.vertical === 'bottom' ? 'bottom'
            : index % 2 === 0 ? 'top' : 'bottom';
          const block = build(child, { ...flow, linearSide: side, linearReverse: reverse });
          // Work in distance along the axis so right-to-left is a true mirror.
          const min = reverse ? -block.maxX : block.minX;
          const max = reverse ? -block.minX : block.maxX;
          const childWidth = block.entries[0].width;
          const center = (reverse ? -1 : 1) * childWidth / 2;
          let offset = (compact ? sideEnds[side] : next) - min;
          if (compact && lastCenter !== null) {
            offset = Math.max(offset, lastCenter + Math.max(ROW_GAP * 2, (lastWidth + childWidth) / 4) - center);
          }
          const top = side === 'top' ? self.height / 2 - ROW_GAP - block.maxY
            : self.height / 2 + ROW_GAP - block.minY;
          entries.push(...move(block, reverse ? -offset : offset, top));
          lastCenter = offset + center;
          lastWidth = childWidth;
          next = offset + max + GAP;
          sideEnds[side] = offset + max + ROW_GAP;
        });
      } else if (layout.mode === 'matrix') {
        const blocks = childItems.map((child) => build(child, flow));
        if (blocks.length) {
          const total = blocks.reduce((sum, block) => sum + blockHeight(block), 0) + 8 * (blocks.length - 1);
          if (isRoot) {
            // An explicit node width remains adjustable even in a matrix header.
            if (!finite(item.node.width)) self.width = Math.max(self.width, ...blocks.map(blockWidth));
            let top = self.height + 8;
            for (const block of blocks) {
              entries.push(...move(block, -block.minX, top - block.minY));
              top += blockHeight(block) + 8;
            }
          } else {
            self.height = Math.max(self.height, total);
            let top = (self.height - total) / 2;
            for (const block of blocks) {
              const left = layout.horizontal === 'rtl' ? -8 - blockWidth(block) : self.width + 8;
              entries.push(...move(block, left - block.minX, top - block.minY));
              top += blockHeight(block) + 8;
            }
          }
        }
      } else {
        // Free form starts with a loose radial distribution, then retains drags.
        const blocks = childItems.map((child) => build(child, flow));
        if (blocks.length) {
          let radius = Math.max(self.width, self.height) / 2 + GAP +
            Math.max(...blocks.map((block) => Math.hypot(blockWidth(block), blockHeight(block)))) / 2;
          let placements;
          for (let pass = 0; pass < 32; pass++) {
            placements = blocks.map((block, index) => {
              const angle = 2 * Math.PI * index / blocks.length + (layout.mode === 'free' ? -0.3 : -Math.PI / 2);
              return {
                x: self.width / 2 + Math.cos(angle) * radius - blockWidth(block) / 2,
                y: self.height / 2 + Math.sin(angle) * radius - blockHeight(block) / 2,
                width: blockWidth(block), height: blockHeight(block),
              };
            });
            const collides = placements.some((a, index) => overlap(a, self, ROW_GAP) ||
              placements.slice(index + 1).some((b) => overlap(a, b, ROW_GAP)));
            if (!collides) break;
            radius *= 1.25;
          }
          blocks.forEach((block, index) => entries.push(...move(block,
            placements[index].x - block.minX, placements[index].y - block.minY)));
        }
      }
      return { entries, ...bounds(entries) };
    }

    // Pack complete automatic trees without creating a synthetic parent or
    // connectors between roots. Each root keeps its own layout and inheritance.
    const raw = [];
    let bottom = 0;
    roots.forEach((root, index) => {
      const block = build(root);
      const top = index ? bottom + GAP - block.minY : 0;
      raw.push(...move(block, 0, top));
      bottom = block.maxY + top;
    });
    const byId = new Map(raw.map((entry) => [entry.id, entry]));
    function manualPositions(item, inheritedX = 0, inheritedY = 0) {
      const entry = byId.get(item.node.id);
      entry.x += inheritedX;
      entry.y += inheritedY;
      let dx = inheritedX;
      let dy = inheritedY;
      // A direct drag is an explicit position, independent of the chosen layout.
      // Unpositioned descendants follow the branch; positioned ones retain theirs.
      if (finite(item.node.x) && finite(item.node.y)) {
        const wantedX = Math.max(-1000000, Math.min(1000000, item.node.x));
        const wantedY = Math.max(-1000000, Math.min(1000000, item.node.y));
        dx += wantedX - entry.x;
        dy += wantedY - entry.y;
        entry.x = wantedX;
        entry.y = wantedY;
      }
      item.children.forEach((child) => manualPositions(child, dx, dy));
    }
    roots.forEach((root) => manualPositions(root));
    // Keep the drag anchor separate from centering: moving a whole branch then
    // translates its automatic and explicitly positioned descendants equally.
    raw.forEach(entry => { entry.baseX = entry.x; entry.baseY = entry.y; });
    function centerParent(item) {
      item.children.forEach(centerParent);
      if (!item.children.length) return;
      const entry = byId.get(item.node.id);
      const axis = entry.layout.mode === 'horizontal' ? 'y'
        : ['vertical', 'topdown'].includes(entry.layout.mode) ? 'x' : null;
      if (!axis) return;
      const size = axis === 'x' ? 'width' : 'height';
      const centers = item.children.map(child => {
        const box = byId.get(child.node.id);
        return box[axis] + box[size] / 2;
      });
      entry[axis] = (Math.min(...centers) + Math.max(...centers)) / 2 - entry[size] / 2;
    }
    roots.forEach(centerParent);
    const frame = bounds(raw);
    const origin = { x: PADDING - frame.minX, y: PADDING - frame.minY };
    raw.forEach((entry) => { entry.x += origin.x; entry.y += origin.y; });
    const children = new Map();
    for (const node of nodes) {
      if (node.parent_id == null) continue;
      if (!children.has(node.parent_id)) children.set(node.parent_id, []);
      children.get(node.parent_id).push(byId.get(node.id));
    }
    const edges = nodes.filter((node) => node.parent_id != null).map((node) => {
      const from = byId.get(node.parent_id);
      const to = byId.get(node.id);
      const points = simplifyPoints(edgePoints(from, to, raw, children.get(from.id), true));
      const cornerRadius = from.linearRole ? 0 : 6;
      return { from: from.id, to: to.id, points, cornerRadius, path: roundedOrthogonal(points, cornerRadius) };
    });
    for (const edge of connections) {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to || from === to) continue;
      const points = simplifyPoints(edgePoints(from, to, raw, [to]));
      edges.push({ from: from.id, to: to.id, points, path: roundedOrthogonal(points) });
    }
    return {
      nodes: raw,
      edges,
      width: frame.maxX - frame.minX + PADDING * 2,
      height: frame.maxY - frame.minY + PADDING * 2,
      origin,
    };
  }

  function horizontalConnection(from, to) {
    const ax = from.x + from.width / 2;
    const ay = from.y + from.height / 2;
    const bx = to.x + to.width / 2;
    const by = to.y + to.height / 2;
    const separatedX = Math.abs(bx - ax) >= (from.width + to.width) / 2;
    const separatedY = Math.abs(by - ay) >= (from.height + to.height) / 2;
    // A tall stack of horizontal children must not switch its lower branches
    // to the parent's bottom edge just because they are farther away vertically.
    if (from.layout.mode === 'horizontal' && separatedX) return true;
    if (['vertical', 'topdown'].includes(from.layout.mode) && separatedY) return false;
    return separatedX && !separatedY || separatedX === separatedY &&
      Math.abs(bx - ax) / ((from.width + to.width) / 2) >=
      Math.abs(by - ay) / ((from.height + to.height) / 2);
  }

  function edgePoints(from, to, nodes, siblings, hierarchy = false) {
    const ax = from.x + from.width / 2;
    const ay = from.y + from.height / 2;
    const bx = to.x + to.width / 2;
    const by = to.y + to.height / 2;
    if (hierarchy && from.linearRole === 'axis') {
      const startX = from.linearReverse ? from.x : from.x + from.width;
      if ((from.linearReverse ? bx <= startX : bx >= startX) && (to.y >= ay || to.y + to.height <= ay)) {
        // Every topic shares this exact baseline, then has its own vertical stem.
        return [[startX, ay], [bx, ay], [bx, by < ay ? to.y + to.height : to.y]];
      }
    }
    if (hierarchy && from.linearRole === 'branch') {
      const reverse = from.linearReverse;
      const indent = Math.min(48, from.width / 3);
      const trunkX = reverse ? from.x + from.width - indent / 2 : from.x + indent / 2;
      const upwards = from.linearSide === 'top';
      if ((upwards ? to.y + to.height <= from.y : to.y >= from.y + from.height) &&
          (reverse ? to.x + to.width < trunkX : to.x > trunkX)) {
        return [[trunkX, upwards ? from.y : from.y + from.height], [trunkX, by],
          [reverse ? to.x + to.width : to.x, by]];
      }
    }
    const horizontal = horizontalConnection(from, to);
    // All siblings on one side share a junction halfway across the nearest
    // gap, even when individual widths or manual positions differ.
    const side = Math.sign(horizontal ? bx - ax : by - ay);
    const sameSide = siblings.filter((node) => horizontalConnection(from, node) === horizontal &&
      Math.sign(horizontal ? node.x + node.width / 2 - ax : node.y + node.height / 2 - ay) === side);
    const facing = sameSide.map((node) => horizontal
      ? side > 0 ? node.x : node.x + node.width
      : side > 0 ? node.y : node.y + node.height);
    const nearest = side > 0 ? Math.min(...facing) : Math.max(...facing);
    if (horizontal) {
      const sign = bx >= ax ? 1 : -1;
      const startX = ax + sign * from.width / 2;
      const endX = bx - sign * to.width / 2;
      const middle = (startX + (sign * (nearest - startX) > 0 ? nearest : endX)) / 2;
      const direct = [[startX, ay], [middle, ay], [middle, by], [endX, by]];
      const frame = bounds(nodes);
      const lanes = [frame.minY - 16, frame.maxY + 16].map((lane) => [
        [startX, ay], [startX + sign * 4, ay], [startX + sign * 4, lane],
        [endX - sign * 4, lane], [endX - sign * 4, by], [endX, by],
      ]);
      return clearRoute(direct, lanes, nodes, from, to);
    }
    const sign = by >= ay ? 1 : -1;
    const startY = ay + sign * from.height / 2;
    const endY = by - sign * to.height / 2;
    const middle = (startY + (sign * (nearest - startY) > 0 ? nearest : endY)) / 2;
    const direct = [[ax, startY], [ax, middle], [bx, middle], [bx, endY]];
    const frame = bounds(nodes);
    const lanes = [frame.minX - 16, frame.maxX + 16].map((lane) => [
      [ax, startY], [ax, startY + sign * 4], [lane, startY + sign * 4],
      [lane, endY - sign * 4], [bx, endY - sign * 4], [bx, endY],
    ]);
    return clearRoute(direct, lanes, nodes, from, to);
  }

  function connectionPath(from, to, nodes = [from, to]) {
    return roundedOrthogonal(edgePoints(from, to, nodes, [to]));
  }

  function clearRoute(direct, alternatives, nodes, from, to) {
    const obstacles = nodes.filter((node) => node.id !== from.id && node.id !== to.id);
    const clear = (points) => points.slice(1).every((b, index) => {
      const a = points[index];
      return obstacles.every((node) => {
        if (a[0] === b[0]) return !(a[0] > node.x - 2 && a[0] < node.x + node.width + 2 &&
          Math.max(a[1], b[1]) > node.y - 2 && Math.min(a[1], b[1]) < node.y + node.height + 2);
        return !(a[1] > node.y - 2 && a[1] < node.y + node.height + 2 &&
          Math.max(a[0], b[0]) > node.x - 2 && Math.min(a[0], b[0]) < node.x + node.width + 2);
      });
    });
    if (clear(direct)) return direct;
    const length = (points) => points.slice(1).reduce((total, b, index) =>
      total + Math.abs(b[0] - points[index][0]) + Math.abs(b[1] - points[index][1]), 0);
    return alternatives.filter(clear).sort((a, b) => length(a) - length(b))[0] || direct;
  }

  function simplifyPoints(waypoints) {
    const points = [];
    for (const point of waypoints) {
      const previous = points[points.length - 1];
      if (previous && point[0] === previous[0] && point[1] === previous[1]) continue;
      while (points.length > 1) {
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        if (!(a[0] === b[0] && b[0] === point[0]) && !(a[1] === b[1] && b[1] === point[1])) break;
        points.pop();
      }
      points.push(point);
    }
    return points;
  }

  function roundedOrthogonal(waypoints, cornerRadius = 6) {
    const points = simplifyPoints(waypoints);
    if (cornerRadius === 0) return points.map((point, index) => `${index ? 'L' : 'M'}${point[0]},${point[1]}`).join(' ');
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1];
      const corner = points[index];
      const next = points[index + 1];
      const beforeLength = Math.hypot(corner[0] - previous[0], corner[1] - previous[1]);
      const afterLength = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
      const radius = Math.min(cornerRadius, beforeLength / 2, afterLength / 2);
      const before = [corner[0] + (previous[0] - corner[0]) * radius / beforeLength,
        corner[1] + (previous[1] - corner[1]) * radius / beforeLength];
      const after = [corner[0] + (next[0] - corner[0]) * radius / afterLength,
        corner[1] + (next[1] - corner[1]) * radius / afterLength];
      path += ` L${before[0]},${before[1]} Q${corner[0]},${corner[1]} ${after[0]},${after[1]}`;
    }
    const end = points[points.length - 1];
    return `${path} L${end[0]},${end[1]}`;
  }

  function preview(mode) {
    const demo = [{ id: 'root', parent_id: null, text: '', layout: defaults(mode) }];
    for (let index = 0; index < 4; index++) {
      demo.push({ id: `b${index}`, parent_id: 'root', text: '', layout: null });
      for (let child = 0; child < 2; child++) demo.push({
        id: `b${index}-${child}`, parent_id: `b${index}`, text: '', layout: null,
      });
    }
    const dimensions = Object.fromEntries(demo.map((node) => [node.id, { width: 100, height: 40 }]));
    const plan = arrange(demo, dimensions);
    const paths = plan.edges.map((edge) => `<path d="${edge.path}"/>`).join('');
    const boxes = plan.nodes.map((node) => `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${mode === 'matrix' ? 5 : 14}" fill="${node.id === 'root' ? '#237aa0' : '#c8e8f4'}"/><path d="M${node.x + 15},${node.y + node.height / 2}h${Math.max(10, node.width - 30)}" stroke="${node.id === 'root' ? '#e5f5fb' : '#73abc1'}"/>`).join('');
    return `<svg viewBox="0 0 ${plan.width} ${plan.height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g fill="none" stroke="#a8cede" stroke-width="3">${paths}</g><g stroke="#83bad1" stroke-width="2">${boxes}</g></svg>`;
  }

  return Object.freeze({ modes: Object.freeze([...MODES]), defaults, effective, arrange, connectionPath, preview,
    simplifyPoints, orthogonalPath: roundedOrthogonal });
})();
