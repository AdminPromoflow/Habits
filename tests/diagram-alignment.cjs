const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const Alignment = vm.runInNewContext(fs.readFileSync('view/home/diagram-alignment.js', 'utf8') + '\nDiagramAlignment;');
const plain = value => JSON.parse(JSON.stringify(value));
const box = (id, x, y, width = 100, height = 40) => ({ id, x, y, width, height });
const guides = (...args) => plain(Alignment.guides(...args));

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
