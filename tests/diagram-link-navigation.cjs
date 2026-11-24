const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const topic = (id, link = null) => ({ id, parent_id: id === 'root' ? null : 'root', text: id, ...(link ? { link } : {}) });
const diagram = (id, nodes) => ({ id, name: `Diagram ${id}`, nodes });
const target = (diagram_id, node_id = null) => ({ diagram_id, node_id });
const plain = value => JSON.parse(JSON.stringify(value));

function harness(diagrams, id, { storage = new Map(), user = 7, path = '/app/' } = {}) {
  const S = { user: { id: user }, data: { diagrams: structuredClone(diagrams) } };
  const home = { titleName() { return this.active.name; } };
  const context = vm.createContext({ S, URL, location: { href: `https://example.test${path}` },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    t: key => key, esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  });
  const Navigation = vm.runInContext(fs.readFileSync('view/home/diagram-link-navigation.js', 'utf8') + '\nDiagramLinkNavigation;', context);
  const choose = id => { home.active = S.data.diagrams.find(item => item.id === id); home.nodes = home.active.nodes; };
  choose(id);
  return { nav: new Navigation(home), home, S, storage, choose };
}

test('topic destinations gain return links without modifying their outgoing link', () => {
  const fixture = [diagram(1, [topic('root', target(2, 'child'))]),
    diagram(2, [topic('root'), topic('child', target(3, 'root'))]), diagram(3, [topic('root')])];
  const { nav, home, S } = harness(fixture, 2);
  const before = JSON.stringify(S.data);
  const returns = nav.incoming(home.nodes[1]);
  assert.equal(returns.length, 1);
  assert.equal(returns[0].diagram_id, 1);
  assert.equal(returns[0].node_id, 'root');
  assert.equal(JSON.stringify(S.data), before);
  assert.deepEqual(home.nodes[1].link, target(3, 'root'));
});

test('existing links produce multiple returns and removing a source removes its return', () => {
  const fixture = [diagram(1, [topic('root', target(3, 'root')), topic('second', target(3, 'root'))]),
    diagram(2, [topic('root', target(3, 'root'))]), diagram(3, [topic('root')])];
  const { nav, home, S } = harness(fixture, 3);
  assert.equal(nav.incoming(home.nodes[0]).length, 3);
  S.data.diagrams[0].nodes[0].link = null;
  S.data.diagrams.splice(1, 1);
  assert.equal(nav.incoming(home.nodes[0]).length, 1);
});

test('same-diagram returns work and explicit reciprocal or self links are not duplicated', () => {
  const { nav, home } = harness([diagram(1, [topic('root', target(1, 'child')), topic('child')])], 1);
  assert.equal(nav.incoming(home.nodes[1]).length, 1);
  home.nodes[1].link = target(1, 'root');
  assert.equal(nav.incoming(home.nodes[1]).length, 0);
  home.nodes[0].link = target(1, 'root');
  home.nodes[1].link = null;
  assert.equal(nav.incoming(home.nodes[0]).length, 0);
});

test('whole-diagram links add their return to the destination root', () => {
  const { nav, home } = harness([diagram(1, [topic('root', target(2))]), diagram(2, [topic('root'), topic('child')])], 2);
  assert.equal(nav.incoming(home.nodes[0]).length, 1);
  assert.equal(nav.incoming(home.nodes[1]).length, 0);
});

test('opening a child directly reconstructs its parent chain from saved links', () => {
  const { nav } = harness([diagram(1, [topic('root', target(2))]), diagram(2, [topic('root'), topic('exit', target(3))]), diagram(3, [topic('root')])], 3);
  assert.deepEqual(plain(nav.trail()), [target(1, 'root'), target(2, 'exit'), target(3)]);
  assert.match(nav.html(), /data-trail-index="0"/);
  assert.match(nav.html(), /aria-current="page"/);
  assert.equal(nav.direction(target(1, 'root')), 'back');
  assert.equal(nav.direction(target(4)), 'forward');
});

test('the visited parent wins for a child with multiple parents and survives reload', () => {
  const fixture = [diagram(1, [topic('root', target(3))]), diagram(2, [topic('root', target(3))]), diagram(3, [topic('root', target(4))]), diagram(4, [topic('root')])];
  const { nav, choose, storage } = harness(fixture, 2);
  nav.prepare(target(3), 'root'); choose(3);
  assert.deepEqual(plain(nav.trail()).map(item => item.diagram_id), [2, 3]);
  nav.prepare(target(4), 'root'); choose(4);
  assert.deepEqual(plain(nav.trail()).map(item => item.diagram_id), [2, 3, 4]);
  const reloaded = harness(fixture, 4, { storage });
  assert.deepEqual(plain(reloaded.nav.trail()).map(item => item.diagram_id), [2, 3, 4]);
  reloaded.nav.prepare(target(2, 'root'), 'root', { returning: true }); reloaded.choose(2);
  assert.deepEqual(plain(reloaded.nav.trail()), [target(2, 'root')]);
});

test('breadcrumb navigation returns to the source topic through the normal save-protected flow', async () => {
  const { nav, home } = harness([diagram(1, [topic('root'), topic('exit', target(2))]), diagram(2, [topic('root')])], 2);
  let received;
  home.links = { follow: async (...args) => { received = args; } };
  await nav.visit(0);
  assert.deepEqual(plain(received), [target(1, 'exit'), { returning: true, trail: [target(1, 'exit')] }]);
});

test('removed, invalid and inaccessible destinations cannot generate breadcrumbs or returns', () => {
  const { nav, home, S } = harness([diagram(1, [topic('root', target(2)), topic('bad', target(999))]), diagram(2, [topic('root')])], 2);
  nav.write([target(999, 'root'), target(2)]);
  assert.deepEqual(plain(nav.trail()).map(item => item.diagram_id), [1, 2]);
  S.data.diagrams[0].nodes[0].link = null;
  assert.deepEqual(plain(nav.trail()).map(item => item.diagram_id), [2]);
  assert.equal(nav.incoming(home.nodes[0]).length, 0);
});

test('cycles never repeat a diagram and display names are escaped', () => {
  const fixture = [diagram(1, [topic('root', target(2))]), diagram(2, [topic('root', target(1))])];
  fixture[0].name = '<script>private</script>';
  const { nav } = harness(fixture, 2);
  const path = plain(nav.trail()).map(item => item.diagram_id);
  assert.equal(new Set(path).size, path.length);
  assert.match(nav.html(), /&lt;script>/);
  assert.doesNotMatch(nav.html(), /<script>/);
});

test('stored paths are isolated by account and installation', () => {
  const fixture = [diagram(1, [topic('root', target(3))]), diagram(2, [topic('root', target(3))]), diagram(3, [topic('root')])];
  const { nav, storage } = harness(fixture, 2);
  nav.prepare(target(3), 'root');
  assert.deepEqual(plain(harness(fixture, 3, { storage }).nav.trail()).map(item => item.diagram_id), [2, 3]);
  for (const options of [{ user: 8 }, { path: '/other/' }]) {
    assert.deepEqual(plain(harness(fixture, 3, { storage, ...options }).nav.trail()).map(item => item.diagram_id), [1, 3]);
  }
});
