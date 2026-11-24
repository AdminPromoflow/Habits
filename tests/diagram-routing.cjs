const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('view/home/diagram-layout.js', 'utf8'), context);
const Routing = vm.runInContext(fs.readFileSync('view/home/diagram-routing.js', 'utf8') + '\nDiagramRouting;', context);
const plain = value => JSON.parse(JSON.stringify(value));
function orthogonal(points) {
  for (let i = 1; i < points.length; i++) assert.ok(points[i][0] === points[i-1][0] || points[i][1] === points[i-1][1], JSON.stringify(points));
}

test('dragging horizontal and vertical segments preserves ports and moves only the perpendicular coordinate', () => {
  for (const points of [[[0,0],[200,0]], [[0,0],[0,200]], [[0,0],[80,0],[80,100],[200,100]]]) {
    const before = plain(points);
    for (let index = 0; index < points.length - 1; index++) {
      for (const delta of [-50, 50]) {
        const next = plain(Routing.moveSegment(points,index,delta));
        orthogonal(next);
        assert.deepEqual(next[0],points[0]);
        assert.deepEqual(next.at(-1),points.at(-1));
        const axis = points[index][1] === points[index+1][1] ? 1 : 0;
        assert.ok(next.some(p=>p[axis] === points[index][axis] + delta));
      }
    }
    assert.deepEqual(points,before);
  }
});

test('double-click breaks create editable orthogonal bends on both orientations, including near endpoints', () => {
  for (const points of [[[0,0],[200,0]], [[0,200],[0,0]], [[0,0],[0,8]]]) {
    for (const click of [points[0],points[1],Routing.midpoint(points)]) {
      const next = plain(Routing.splitSegment(points,0,click));
      orthogonal(next);
      assert.ok(next.length > points.length);
      assert.deepEqual(next[0],points[0]);
      assert.deepEqual(next.at(-1),points.at(-1));
    }
  }
});

test('saved bends stay in diagram coordinates while endpoints follow moved or resized nodes', () => {
  const saved = [[0,0],[20,0],[20,40],[180,40],[180,0],[200,0]];
  const automatic = [[100,200],[400,200]], origin={x:80,y:100};
  const route = plain(Routing.anchored(saved,automatic,origin));
  orthogonal(route);
  assert.deepEqual(route[0],automatic[0]);
  assert.deepEqual(route.at(-1),automatic.at(-1));
  assert.ok(route.some(p=>p[0]===260&&p[1]===140));
  const vertical = plain(Routing.anchored(saved,[[50,70],[50,300]],origin));
  orthogonal(vertical);
  assert.deepEqual(vertical[0],[50,70]);
  assert.deepEqual(vertical.at(-1),[50,300]);
});

test('line midpoint follows distance along the route and nearest segment identifies the drag axis', () => {
  const points=[[0,0],[100,0],[100,200],[200,200]];
  assert.deepEqual(plain(Routing.midpoint(points)),[100,100]);
  assert.equal(Routing.nearest(points,[104,100]).horizontal,false);
  assert.equal(Routing.nearest(points,[45,2]).horizontal,true);
  assert.deepEqual(plain(Routing.nearest(points,[-10,-5]).point),[0,0]);
});
