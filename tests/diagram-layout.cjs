const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const Layout = vm.runInNewContext(fs.readFileSync('view/home/diagram-layout.js', 'utf8') + '\nDiagramLayout;');
const plain = (value) => JSON.parse(JSON.stringify(value));
const node = (id, parent_id = null, layout = null, extra = {}) => ({ id, parent_id, layout, text: id, ...extra });

function fixture(mode = 'horizontal') {
  return [
    node('root', null, Layout.defaults(mode)),
    node('a', 'root'), node('b', 'root'), node('c', 'root'), node('d', 'root'),
    node('a1', 'a'), node('a2', 'a'), node('a11', 'a1'),
    node('b1', 'b'), node('c1', 'c'), node('c2', 'c'), node('d1', 'd'),
  ];
}

function noOverlaps(plan) {
  for (let index = 0; index < plan.nodes.length; index++) {
    const a = plan.nodes[index];
    for (const b of plan.nodes.slice(index + 1)) {
      assert.ok(!(a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y), `${a.id} overlaps ${b.id}`);
    }
  }
}

test('a descendant inherits its closest explicit layout without altering sibling branches', () => {
  const nodes = fixture('horizontal');
  nodes.find((item) => item.id === 'a').layout = { mode: 'vertical', direction: 'top' };
  nodes.find((item) => item.id === 'a1').layout = { mode: 'list', horizontal: 'rtl' };
  assert.equal(Layout.effective(nodes, 'b1').mode, 'horizontal');
  assert.equal(Layout.effective(nodes, 'a2').mode, 'vertical');
  assert.equal(Layout.effective(nodes, 'a2').direction, 'top');
  assert.equal(Layout.effective(nodes, 'a11').mode, 'list');
  assert.equal(Layout.effective(nodes, 'a11').horizontal, 'rtl');
  nodes.find((item) => item.id === 'a1').layout = null;
  assert.equal(Layout.effective(nodes, 'a11').mode, 'vertical');
  assert.equal(Layout.effective(nodes, 'root').mode, 'horizontal');
});

test('defaults and resolved configurations are fresh values', () => {
  const first = Layout.defaults('linear');
  assert.equal(first.vertical, 'compact');
  first.mode = 'list';
  assert.equal(Layout.defaults('linear').mode, 'linear');
  assert.equal(Layout.defaults('unknown').mode, 'horizontal');
  assert.equal(Layout.effective([node('root')], 'root').mode, 'horizontal');
});

for (const mode of Layout.modes) {
  test(`${mode} produces finite connected positions without overlapping automatic nodes`, () => {
    const nodes = fixture(mode);
    const untouched = JSON.stringify(nodes);
    const plan = Layout.arrange(nodes);
    assert.equal(plan.nodes.length, nodes.length);
    assert.equal(plan.edges.length, nodes.length - 1);
    assert.ok(Number.isFinite(plan.width) && plan.width > 0);
    assert.ok(Number.isFinite(plan.height) && plan.height > 0);
    for (const box of plan.nodes) {
      assert.ok(Number.isFinite(box.x) && box.x >= 71.99);
      assert.ok(Number.isFinite(box.y) && box.y >= 71.99);
      assert.ok(box.x + box.width <= plan.width - 71.99);
      assert.ok(box.y + box.height <= plan.height - 71.99);
    }
    for (const edge of plan.edges) {
      assert.ok(edge.path.startsWith('M'));
      assert.ok(!/NaN|Infinity|undefined/.test(edge.path));
    }
    noOverlaps(plan);
    assert.equal(JSON.stringify(nodes), untouched);
  });
}

test('mixed subtree modes retain their own arrangement without overlap', () => {
  const nodes = fixture();
  nodes.find((item) => item.id === 'a').layout = Layout.defaults('vertical');
  nodes.find((item) => item.id === 'b').layout = Layout.defaults('matrix');
  nodes.find((item) => item.id === 'c').layout = Layout.defaults('list');
  nodes.find((item) => item.id === 'd').layout = Layout.defaults('linear');
  const plan = Layout.arrange(nodes);
  noOverlaps(plan);
  assert.equal(plan.nodes.find((item) => item.id === 'a2').layout.mode, 'vertical');
  assert.equal(plan.nodes.find((item) => item.id === 'c1').layout.mode, 'list');
});

test('horizontal and vertical directions position all branches on the chosen side', () => {
  for (const [mode, direction, axis, sign] of [
    ['horizontal', 'left', 'x', -1], ['horizontal', 'right', 'x', 1],
    ['vertical', 'top', 'y', -1], ['vertical', 'bottom', 'y', 1],
  ]) {
    const nodes = fixture(mode);
    nodes[0].layout.direction = direction;
    const plan = Layout.arrange(nodes);
    const root = plan.nodes.find((item) => item.id === 'root');
    assert.ok(plan.nodes.filter((item) => item.id !== 'root').every((item) =>
      Math.sign(item[axis] - root[axis]) === sign), `${mode} ${direction}`);
    noOverlaps(plan);
  }
});

test('topdown, list, linear and matrix honor their direction controls', () => {
  for (const mode of ['topdown', 'list', 'linear']) {
    const nodes = fixture(mode);
    nodes[0].layout.vertical = 'top';
    const plan = Layout.arrange(nodes);
    const root = plan.nodes[0];
    assert.ok(plan.nodes.slice(1).every((item) => item.y < root.y), mode);
    noOverlaps(plan);
  }
  const nodes = fixture('matrix');
  nodes[0].layout.horizontal = 'rtl';
  const plan = Layout.arrange(nodes);
  const a = plan.nodes.find((item) => item.id === 'a');
  const a1 = plan.nodes.find((item) => item.id === 'a1');
  assert.ok(a1.x < a.x);
  noOverlaps(plan);
});

test('manual positions use raw graph coordinates and round-trip without offset drift', () => {
  const nodes = fixture('free');
  nodes.find((item) => item.id === 'a').x = -320;
  nodes.find((item) => item.id === 'a').y = 210;
  const first = Layout.arrange(nodes);
  const a = first.nodes.find((item) => item.id === 'a');
  assert.equal(a.x - first.origin.x, -320);
  assert.equal(a.y - first.origin.y, 210);
  nodes.find((item) => item.id === 'a').x = a.x - first.origin.x + 57;
  nodes.find((item) => item.id === 'a').y = a.y - first.origin.y - 91;
  const second = Layout.arrange(nodes);
  const moved = second.nodes.find((item) => item.id === 'a');
  assert.equal(moved.x - second.origin.x, -263);
  assert.equal(moved.y - second.origin.y, 119);
  const saved = plain(nodes);
  assert.deepEqual(plain(Layout.arrange(saved)), plain(second));
});

test('moving a free-form branch carries descendants that have no explicit position', () => {
  const nodes = fixture('free');
  const first = Layout.arrange(nodes);
  const branch = nodes.find((item) => item.id === 'a');
  const before = first.nodes.find((item) => item.id === 'a');
  branch.x = before.x - first.origin.x + 100;
  branch.y = before.y - first.origin.y + 50;
  const second = Layout.arrange(nodes);
  for (const id of ['a', 'a1', 'a2', 'a11']) {
    const old = first.nodes.find((item) => item.id === id);
    const moved = second.nodes.find((item) => item.id === id);
    assert.ok(Math.abs((moved.x - second.origin.x) - (old.x - first.origin.x) - 100) < 0.001);
    assert.ok(Math.abs((moved.y - second.origin.y) - (old.y - first.origin.y) - 50) < 0.001);
  }
});

for (const mode of Layout.modes) {
  test(`${mode} retains a directly dragged node and carries its unpositioned descendants`, () => {
    const nodes = fixture(mode);
    const before = Layout.arrange(nodes);
    const a = before.nodes.find((item) => item.id === 'a');
    Object.assign(nodes.find((item) => item.id === 'a'), {
      x: a.x - before.origin.x + 113, y: a.y - before.origin.y - 57,
    });
    const after = Layout.arrange(nodes);
    for (const id of ['a', 'a1', 'a2', 'a11']) {
      const old = before.nodes.find((item) => item.id === id);
      const moved = after.nodes.find((item) => item.id === id);
      assert.ok(Math.abs(moved.x - after.origin.x - (old.x - before.origin.x) - 113) < 0.001);
      assert.ok(Math.abs(moved.y - after.origin.y - (old.y - before.origin.y) + 57) < 0.001);
    }
    const sibling = after.nodes.find((item) => item.id === 'b');
    const oldSibling = before.nodes.find((item) => item.id === 'b');
    assert.ok(Math.abs(sibling.x - after.origin.x - (oldSibling.x - before.origin.x)) < 0.001);
    assert.ok(Math.abs(sibling.y - after.origin.y - (oldSibling.y - before.origin.y)) < 0.001);
    assert.deepEqual(plain(Layout.arrange(plain(nodes))), plain(after));
  });
}

test('moving the root remains visible in raw coordinates and preserves branch geometry', () => {
  const nodes = fixture('topdown');
  const before = Layout.arrange(nodes);
  nodes[0].x = -385;
  nodes[0].y = 177;
  const after = Layout.arrange(nodes);
  for (const old of before.nodes) {
    const moved = after.nodes.find((item) => item.id === old.id);
    assert.ok(Math.abs(moved.x - after.origin.x - (old.x - before.origin.x) + 385) < 0.001);
    assert.ok(Math.abs(moved.y - after.origin.y - (old.y - before.origin.y) - 177) < 0.001);
  }
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.equal(after.nodes[0].x - after.origin.x, -385);
  assert.equal(after.nodes[0].y - after.origin.y, 177);
});

test('explicit descendant positions remain fixed when a parent is dragged', () => {
  const nodes = fixture('horizontal');
  Object.assign(nodes.find((item) => item.id === 'a1'), { x: 1234, y: -256 });
  Object.assign(nodes.find((item) => item.id === 'a'), { x: -430, y: 610 });
  const plan = Layout.arrange(nodes);
  const child = plan.nodes.find((item) => item.id === 'a1');
  assert.equal(child.x - plan.origin.x, 1234);
  assert.equal(child.y - plan.origin.y, -256);
});

test('node size measurements include multiline names and measured values', () => {
  const nodes = [node('root', null, null, { text: 'First\nSecond\nThird' })];
  let plan = Layout.arrange(nodes);
  assert.equal(plan.nodes[0].height, 96);
  plan = Layout.arrange(nodes, { root: { width: 240, height: 123 } });
  assert.equal(plan.nodes[0].width, 240);
  assert.equal(plan.nodes[0].height, 123);
  plan = Layout.arrange(nodes, { root: { width: Infinity, height: NaN } });
  assert.ok(Number.isFinite(plan.width) && Number.isFinite(plan.height));
});

for (const mode of Layout.modes) {
  test(`${mode} respects individual widths and keeps nodes and connectors aligned`, () => {
    const nodes = fixture(mode);
    nodes.forEach((item, index) => { item.width = index % 2 ? 600 : 100; });
    const saved = JSON.stringify(nodes);
    const plan = Layout.arrange(nodes);
    for (const item of nodes) {
      assert.equal(plan.nodes.find((box) => box.id === item.id).width, item.width);
    }
    noOverlaps(plan);
    for (const edge of plan.edges) {
      const endpoints = assertRoundedOrthogonal(edge.path);
      assert.ok(onBoundary(endpoints.start, plan.nodes.find((item) => item.id === edge.from)));
      assert.ok(onBoundary(endpoints.end, plan.nodes.find((item) => item.id === edge.to)));
    }
    assert.equal(JSON.stringify(nodes), saved);
  });
}

test('saved widths are used without DOM measurements and measured widths may override them', () => {
  const nodes = [node('root', null, null, { width: 350.5 }), node('child', 'root')];
  let plan = Layout.arrange(nodes);
  assert.equal(plan.nodes[0].width, 350.5);
  assert.equal(plan.nodes[1].width, 180);
  plan = Layout.arrange(nodes, { root: { height: 144 } });
  assert.equal(plan.nodes[0].width, 350.5);
  assert.equal(plan.nodes[0].height, 144);
  plan = Layout.arrange(nodes, { root: { width: 600 } });
  assert.equal(plan.nodes[0].width, 600);
  nodes[0].width = null;
  assert.equal(Layout.arrange(nodes).nodes[0].width, 220);
  nodes[0].width = 10;
  assert.equal(Layout.arrange(nodes).nodes[0].width, 100);
  nodes[0].width = 700;
  assert.equal(Layout.arrange(nodes).nodes[0].width, 600);
});

test('matrix auto headers expand, while a resized header retains its own width', () => {
  const nodes = [node('root', null, Layout.defaults('matrix')), node('branch', 'root', null, { width: 600 }), node('leaf', 'branch')];
  let plan = Layout.arrange(nodes);
  assert.ok(plan.nodes[0].width > 600);
  assert.equal(plan.nodes[1].width, 600);
  nodes[0].width = 100;
  plan = Layout.arrange(nodes);
  assert.equal(plan.nodes[0].width, 100);
  assert.equal(plan.nodes[1].width, 600);
  noOverlaps(plan);
  nodes[0].width = null;
  assert.ok(Layout.arrange(nodes).nodes[0].width > 600);
});

test('invalid trees are rejected instead of looping or leaking partial layouts', () => {
  const bad = [
    [node('root'), node('root')],
    [node('root'), node('other')],
    [node('root'), node('a', 'missing')],
    [node('root'), node('a', 'b'), node('b', 'a')],
    [node('a', 'a')],
  ];
  for (const nodes of bad) assert.throws(() => Layout.arrange(nodes), /node|root|hierarchy|identifier/);
  const deep = [node('root')];
  for (let index = 0; index < 32; index++) deep.push(node(`n${index}`, index ? `n${index - 1}` : 'root'));
  assert.throws(() => Layout.arrange(deep), /hierarchy/);
  assert.deepEqual(plain(Layout.arrange([])), { nodes: [], edges: [], width: 0, height: 0, origin: { x: 0, y: 0 } });
});

test('each preview is a distinct safe standalone SVG with no external assets', () => {
  const previews = Layout.modes.map((mode) => Layout.preview(mode));
  assert.equal(new Set(previews).size, 8);
  for (const svg of previews) {
    assert.ok(svg.startsWith('<svg '));
    assert.ok(svg.includes('<rect '));
    assert.ok(!/<script|onload=|href=|NaN|Infinity/.test(svg));
  }
  assert.ok(!Layout.preview('<script>alert(1)</script>').includes('<script>'));
});

function pathCommands(path) {
  return [...path.matchAll(/([MLQ])([^MLQ]*)/g)].map((match) => ({
    command: match[1], numbers: (match[2].match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []).map(Number),
  }));
}

function assertRoundedOrthogonal(path) {
  assert.ok(!/[CHVASTZ]/i.test(path));
  const commands = pathCommands(path);
  assert.equal(commands[0].command, 'M');
  let current = commands[0].numbers;
  for (const { command, numbers } of commands.slice(1)) {
    if (command === 'L') {
      assert.ok(Math.abs(current[0] - numbers[0]) < 0.001 || Math.abs(current[1] - numbers[1]) < 0.001);
      current = numbers;
    } else {
      assert.equal(command, 'Q');
      const control = numbers.slice(0, 2);
      const end = numbers.slice(2);
      const first = [control[0] - current[0], control[1] - current[1]];
      const last = [end[0] - control[0], end[1] - control[1]];
      assert.ok(Math.abs(first[0] * last[0] + first[1] * last[1]) < 0.001, 'curve joins perpendicular legs');
      assert.ok(Math.hypot(...first) <= 6.001 && Math.hypot(...last) <= 6.001, 'corners use at most 6px radius');
      current = end;
    }
  }
  return { start: commands[0].numbers, end: current };
}

function onBoundary(point, box) {
  const [x, y] = point;
  return (Math.abs(x - box.x) < 0.001 || Math.abs(x - box.x - box.width) < 0.001) && y >= box.y && y <= box.y + box.height ||
    (Math.abs(y - box.y) < 0.001 || Math.abs(y - box.y - box.height) < 0.001) && x >= box.x && x <= box.x + box.width;
}

test('connectors have horizontal/vertical segments, gently rounded turns and boundary endpoints', () => {
  for (const mode of Layout.modes) {
    const plan = Layout.arrange(fixture(mode));
    for (const edge of plan.edges) {
      const endpoints = assertRoundedOrthogonal(edge.path);
      assert.ok(onBoundary(endpoints.start, plan.nodes.find((item) => item.id === edge.from)));
      assert.ok(onBoundary(endpoints.end, plan.nodes.find((item) => item.id === edge.to)));
    }
  }
});

test('aligned nodes connect with a straight segment, while offset nodes get small rounded elbows', () => {
  const nodes = [node('root'), node('a', 'root', null, { x: 400, y: 0 })];
  let path = Layout.arrange(nodes).edges[0].path;
  assert.deepEqual(pathCommands(path).map((part) => part.command), ['M', 'L']);
  nodes[1].x = 20;
  nodes[1].y = 200;
  path = Layout.arrange(nodes).edges[0].path;
  assert.deepEqual(pathCommands(path).map((part) => part.command), ['M', 'L']);
  nodes[1].x = 228;
  nodes[1].y = 30;
  path = Layout.arrange(nodes).edges[0].path;
  assert.ok(path.includes('Q'));
  assertRoundedOrthogonal(path);
});

test('matrix connections route around earlier rows instead of crossing their node interiors', () => {
  const plan = Layout.arrange(fixture('matrix'));
  for (const edge of plan.edges) {
    const others = plan.nodes.filter((item) => item.id !== edge.from && item.id !== edge.to);
    const commands = pathCommands(edge.path);
    let current = commands[0].numbers;
    for (const part of commands.slice(1)) {
      const end = part.command === 'Q' ? part.numbers.slice(2) : part.numbers;
      const control = part.numbers.slice(0, 2);
      for (let step = 0; step <= 50; step++) {
        const t = step / 50;
        const point = part.command === 'Q'
          ? current.map((value, axis) => (1 - t) ** 2 * value + 2 * (1 - t) * t * control[axis] + t ** 2 * end[axis])
          : current.map((value, axis) => value + (end[axis] - value) * t);
        for (const box of others) assert.ok(!(point[0] > box.x + 0.001 && point[0] < box.x + box.width - 0.001 &&
          point[1] > box.y + 0.001 && point[1] < box.y + box.height - 0.001), `${edge.from} -> ${edge.to} crosses ${box.id}`);
      }
      current = end;
    }
  }
});
