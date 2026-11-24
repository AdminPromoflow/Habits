const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const Alignment = vm.runInNewContext(fs.readFileSync('view/home/diagram-alignment.js', 'utf8') + '\nDiagramAlignment;');
const plain = value => JSON.parse(JSON.stringify(value));
const box = (id, x, y, width = 100, height = 40) => ({ id, x, y, width, height });
const guides = (...args) => plain(Alignment.guides(...args));
const spacing = (...args) => plain(Alignment.spacing(...args));
const sibling = (id, x, y, width = 100, height = 40, parent_id = 'parent') =>
  ({ ...box(id, x, y, width, height), parent_id });

test('unequal boxes align at centers, matching edges and opposing edges', () => {
  const moving = box('moving', 100, 100, 100, 40);
  const centered = guides([moving, box('other', 50, 300, 200, 80)], 'moving');
  assert.deepEqual(centered, [{ axis: 'x', position: 150, start: 88, end: 392, kind: 'center' }]);
  assert.deepEqual(guides([moving, box('other', 100, 300, 160, 80)], 'moving'),
    [{ axis: 'x', position: 100, start: 88, end: 392, kind: 'edge' }]);
  assert.deepEqual(guides([moving, box('other', 200, 300, 160, 80)], 'moving'),
    [{ axis: 'x', position: 200, start: 88, end: 392, kind: 'edge' }]);
});

test('horizontal and vertical guides appear together without treating an edge as a center', () => {
  const result = guides([box('moving', 100, 100), box('above', 100, 300), box('beside', 400, 100)], 'moving');
  assert.equal(result.filter(guide => guide.axis === 'x').length, 3);
  assert.equal(result.filter(guide => guide.axis === 'y').length, 3);
  assert.ok(result.some(guide => guide.axis === 'x' && guide.position === 150 && guide.kind === 'center'));
  assert.ok(result.some(guide => guide.axis === 'y' && guide.position === 120 && guide.kind === 'center'));
  assert.deepEqual(guides([box('moving', 0, 0), box('other', 50, 300, 170)], 'moving'), []);
});

test('the selected node and its moving descendants never produce guides', () => {
  const boxes = [box('moving', 10, 10), box('child', 10, 200), box('grandchild', 300, 10)];
  assert.deepEqual(guides(boxes, 'moving', new Set(['moving', 'child', 'grandchild'])), []);
  assert.ok(guides(boxes, 'moving', new Set(['child'])).every(guide => guide.axis === 'y'));
});

test('the tolerance and endpoint extension remain constant in screen pixels at different zoom levels', () => {
  const boxes = [box('moving', 100, 100), box('other', 103, 300)];
  assert.equal(guides(boxes, 'moving', new Set(), 1).length, 3);
  assert.equal(guides(boxes, 'moving', new Set(), 2).length, 0);
  const zoomedOut = guides(boxes, 'moving', new Set(), 0.5);
  assert.equal(zoomedOut.length, 3);
  assert.equal(zoomedOut[0].start, 76);
  assert.equal(zoomedOut[0].end, 364);
  assert.equal(guides([boxes[0], box('other', 104, 300)], 'moving').length, 3);
  assert.equal(guides([boxes[0], box('other', 104.1, 300)], 'moving').length, 0);
});

test('distant unaligned nodes produce no guides and the closest matching coordinate wins', () => {
  assert.deepEqual(guides([box('moving', 0, 0), box('far', 1000, 1000)], 'moving'), []);
  const result = guides([box('moving', 100, 100), box('near', 101, 300), box('farther', 103, 500)], 'moving');
  assert.deepEqual(result.map(guide => guide.position), [101, 151, 201]);
  assert.ok(result.every(guide => guide.end === 352));
});

test('ties prefer matching edge type and equal coordinates merge into a single spanning guide', () => {
  const result = guides([box('moving', 100, 100), box('opposite', 1, 300), box('same', 99, 500)], 'moving');
  assert.equal(result.find(guide => guide.kind === 'edge').position, 99);
  const merged = guides([box('moving', 100, 100), box('above', 100, -200), box('below', 100, 400)], 'moving');
  assert.equal(merged.length, 3);
  assert.ok(merged.every(guide => guide.start === -212 && guide.end === 452));
});

test('geometry and exclusions remain immutable and malformed boxes are ignored', () => {
  const boxes = [box('moving', 0, 0), box('other', 0, 200), box('invalid', NaN, 300), box('empty', 0, 100, 0)];
  boxes.forEach(Object.freeze);
  Object.freeze(boxes);
  const excluded = new Set(['unrelated']);
  const before = plain(boxes);
  const result = guides(boxes, 'moving', excluded);
  assert.equal(result.length, 3);
  assert.deepEqual(plain(boxes), before);
  assert.deepEqual([...excluded], ['unrelated']);
  assert.deepEqual(guides(boxes, 'missing'), []);
  assert.deepEqual(guides(boxes, 'invalid'), []);
  assert.deepEqual(guides(null, 'moving'), []);
  assert.deepEqual(guides(boxes, 'moving', excluded, 0), result);
});

test('sibling gaps use visible edges of unequal boxes and match existing consecutive spacing', () => {
  const result = spacing([sibling('a', 0, 0, 80), sibling('b', 120, 0, 120), sibling('moving', 280, 0, 60)], 'moving');
  assert.deepEqual(result, [
    { axis: 'x', position: -18, start: 240, end: 280, gap: 40, matched: true, from: 'b', to: 'moving' },
    { axis: 'x', position: -18, start: 80, end: 120, gap: 40, matched: true, from: 'a', to: 'b' },
  ]);
});

test('a node placed between two siblings detects equal gaps on both sides', () => {
  const result = spacing([sibling('a', 0, 0), sibling('moving', 150, 0), sibling('c', 300, 0)], 'moving');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => [item.from, item.to, item.gap, item.matched]),
    [['a', 'moving', 50, true], ['moving', 'c', 50, true]]);
  assert.ok(result.every(item => item.axis === 'x'));
});

test('vertical gaps and unequal heights match with the same screen-space tolerance', () => {
  const boxes = [sibling('a', 100, 0, 100, 30), sibling('b', 100, 60, 100, 60), sibling('moving', 100, 153)];
  const result = spacing(boxes, 'moving');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => [item.axis, item.gap, item.matched]), [['y', 33, true], ['y', 30, true]]);
  const zoomed = spacing(boxes, 'moving', new Set(), 2);
  assert.deepEqual(zoomed, [{ axis: 'y', position: 91, start: 120, end: 153, gap: 33, matched: false, from: 'b', to: 'moving' }]);
  assert.equal(spacing(boxes, 'moving', new Set(), 0.5)[0].position, 64);
});

test('only same-parent siblings participate, including independent root siblings', () => {
  const boxes = [sibling('root-a', 0, 0, 100, 40, null), sibling('moving', 160, 0, 100, 40, null),
    sibling('child', 320, 0, 100, 40, 'different')];
  assert.deepEqual(spacing(boxes, 'moving').map(item => [item.from, item.to, item.matched]), [['root-a', 'moving', false]]);
  assert.deepEqual(spacing(boxes, 'child'), []);
});

test('distance measurements remain visible when gaps differ without false equal marks', () => {
  const result = spacing([sibling('a', 0, 0), sibling('moving', 140, 0), sibling('c', 360, 0)], 'moving');
  assert.deepEqual(result.map(item => [item.gap, item.matched]), [[40, false], [120, false]]);
});

test('overlapping boxes, diagonal neighbors and intervening siblings do not create false reference gaps', () => {
  assert.deepEqual(spacing([sibling('moving', 0, 0), sibling('overlap', 50, 10)], 'moving'), []);
  assert.deepEqual(spacing([sibling('moving', 0, 0), sibling('diagonal', 130, 80)], 'moving'), []);
  const boxes = [sibling('a', 0, 0), sibling('between', 120, 0), sibling('b', 240, 0), sibling('moving', 480, 0)];
  const result = spacing(boxes, 'moving');
  assert.deepEqual(result.map(item => [item.from, item.to, item.gap, item.matched]), [['b', 'moving', 140, false]]);
});

test('matching distances in another sibling row are valid references, with bounded clutter', () => {
  const boxes = [sibling('moving', 0, 0), sibling('peer', 150, 0)];
  for (let row = 1; row <= 20; row++) boxes.push(sibling(`a-${row}`, 0, row * 200), sibling(`b-${row}`, 150, row * 200));
  const result = spacing(boxes, 'moving');
  const horizontal = result.filter(item => item.axis === 'x');
  assert.equal(horizontal.length, 2);
  assert.ok(horizontal.every(item => item.matched && item.gap === 50));
  assert.ok(result.length <= 8);
});

test('spacing excludes moving companions, ignores invalid geometry and does not mutate inputs', () => {
  const boxes = [sibling('moving', 0, 0), sibling('excluded', 150, 0), sibling('peer', 0, 100),
    sibling('bad', NaN, 100), sibling('empty', 0, 100, 0)];
  const excluded = new Set(['moving', 'excluded']);
  boxes.forEach(Object.freeze); Object.freeze(boxes);
  const before = plain(boxes);
  const result = spacing(boxes, 'moving', excluded);
  assert.deepEqual(result.map(item => [item.from, item.to]), [['moving', 'peer']]);
  assert.deepEqual(plain(boxes), before);
  assert.deepEqual([...excluded], ['moving', 'excluded']);
  assert.deepEqual(spacing(boxes, 'moving', excluded, 0), result);
  assert.deepEqual(spacing(boxes, 'missing'), []);
  assert.deepEqual(spacing(boxes, 'bad'), []);
  assert.deepEqual(spacing(null, 'moving'), []);
});
