const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('linked topic focus centers its midpoint regardless of the previous pan and zoom', () => {
  const { camera, surface, element } = harness();
  camera.x = 125; camera.y = -70; camera.scale = 0.5;
  const target = element();
  // World midpoint relative to the camera anchor: (600, -200).
  target.getBoundingClientRect = () => ({ left: 100 + 400 + camera.x + (600 - 110) * camera.scale,
    top: 50 + 250 + camera.y + (-200 - 24) * camera.scale, width: 220 * camera.scale, height: 48 * camera.scale });
  camera.focusElement(target);
  const rect = target.getBoundingClientRect(), frame = surface.getBoundingClientRect();
  assert.equal(rect.left + rect.width / 2, frame.left + surface.clientWidth / 2);
  assert.equal(rect.top + rect.height / 2, frame.top + surface.clientHeight / 2);
  assert.equal(camera.scale, 1.6);
});

test('whole-diagram link fits large diagrams and retains that overview on reload', () => {
  const { camera, element, storage } = harness();
  camera.setPersistenceKey('overview');
  const diagram = element();
  diagram.getBoundingClientRect = () => ({ left: 100, top: 50, width: 12000, height: 8000 });
  camera.focusElement(diagram, { overview: true });
  assert.ok(camera.scale < 0.2);
  assert.ok(camera.scale * 12000 <= 800);
  assert.ok(camera.scale * 8000 <= 500);
  const restored = harness({ storage });
  restored.camera.setPersistenceKey('overview');
  assert.equal(restored.camera.scale, camera.scale);
  const before = camera.scale;
  camera.zoomAt(before * 1.1, { x: 400, y: 250 });
  assert.equal(camera.scale, before * 1.1);
});

function harness({ storage = new Map(), storageError = false } = {}) {
  let now = 1000;
  let allowed = true;
  let starts = 0;
  function emitter() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, handler, options) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ handler, options });
      },
      removeEventListener(type, handler) {
        listeners.set(type, (listeners.get(type) || []).filter((item) => item.handler !== handler));
      },
      emit(type, input = {}) {
        const event = {
          target: this,
          pointerId: 7, button: 0, clientX: 400, clientY: 250,
          deltaX: 0, deltaY: 0, deltaMode: 0,
          detail: 1, prevented: false, stopped: false,
          preventDefault() { this.prevented = true; },
          stopPropagation() { this.stopped = true; },
          stopImmediatePropagation() { this.stopped = true; },
          ...input,
        };
        for (const item of listeners.get(type) || []) {
          item.handler(event);
          if (event.stopped) break;
        }
        return event;
      },
    };
  }
  function element({ classes = [], tag = 'div', parent = null, readOnly = false, action = false } = {}) {
    const classNames = new Set(classes);
    return {
      ...emitter(), style: {}, parentElement: parent,
      tag, readOnly, action,
      classList: {
        add: (name) => classNames.add(name),
        remove: (name) => classNames.delete(name),
        contains: (name) => classNames.has(name),
      },
      matches(selector) {
        if (selector.startsWith('.')) return classNames.has(selector.slice(1));
        if (selector === 'textarea:not([readonly])') return tag === 'textarea' && !this.readOnly;
        if (selector === '[data-action]') return action;
        return selector === tag;
      },
      closest(selectors) {
        for (let candidate = this; candidate; candidate = candidate.parentElement) {
          if (selectors.split(',').some((selector) => candidate.matches(selector.trim()))) return candidate;
        }
        return null;
      },
    };
  }
  function stage() {
    const captured = new Set();
    return Object.assign(element(), {
      clientWidth: 800, clientHeight: 500, clientLeft: 0, clientTop: 0,
      scrollLeft: 0, scrollTop: 0,
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 500, right: 900, bottom: 550 }),
      setPointerCapture: (id) => captured.add(id),
      hasPointerCapture: (id) => captured.has(id),
      releasePointerCapture: (id) => captured.delete(id),
    });
  }
  const win = emitter();
  let writes = 0;
  const context = vm.createContext({ window: win, Date: { now: () => now }, localStorage: {
    getItem(key) { if (storageError) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageError) throw new Error('Storage blocked'); writes++; storage.set(key, value); },
  } });
  const Viewport = vm.runInContext(fs.readFileSync('view/home/diagram-viewport.js', 'utf8') + '\nDiagramViewport;', context);
  const camera = new Viewport({ canInteract: () => allowed, onInteractionStart: () => starts++ });
  const surface = stage();
  const content = element();
  camera.mount(surface, content, { anchorX: 110, anchorY: 24 });
  return {
    camera, surface, content, win, element, stage, storage, writes: () => writes,
    advance: (ms) => now += ms,
    setAllowed: (value) => allowed = value,
    starts: () => starts,
  };
}

function almost(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
}

function worldAt(camera, surface, localX, localY) {
  return [(localX - surface.clientWidth / 2 - camera.x) / camera.scale,
    (localY - surface.clientHeight / 2 - camera.y) / camera.scale];
}

test('background dragging pans both ways and suppresses only the drag-generated click', () => {
  const { camera, surface, starts } = harness();
  surface.emit('pointerdown');
  assert.equal(camera.isInteracting(), true);
  assert.equal(surface.hasPointerCapture(7), true);
  surface.emit('pointermove', { clientX: 402, clientY: 251 });
  assert.equal(starts(), 0);
  surface.emit('pointermove', { clientX: 470, clientY: 205 });
  assert.equal(camera.x, 70);
  assert.equal(camera.y, -45);
  assert.equal(starts(), 1);
  assert.equal(surface.classList.contains('is-panning'), true);
  surface.emit('pointerup');
  assert.equal(camera.isInteracting(), false);
  assert.equal(surface.hasPointerCapture(7), false);
  assert.equal(surface.classList.contains('is-panning'), false);
  assert.equal(surface.emit('click').stopped, true);
  surface.emit('pointerdown');
  surface.emit('pointerup');
  assert.equal(surface.emit('click').stopped, false);
});

test('nodes, tools, actions, edited text, and secondary mouse buttons keep their own gestures', () => {
  const { camera, surface, element } = harness();
  const root = element({ classes: ['diagram-root'], parent: surface });
  const node = element({ classes: ['diagram-node'], parent: root });
  const tool = element({ tag: 'button', parent: surface });
  const action = element({ action: true, parent: surface });
  const connector = element({ classes: ['diagram-connection'], parent: surface });
  const line = element({ tag: 'path', parent: connector });
  for (const target of [node, tool, action, line]) {
    assert.equal(surface.emit('pointerdown', { target }).prevented, false);
    assert.equal(camera.isInteracting(), false);
  }
  surface.emit('pointerdown', { button: 2 });
  assert.equal(camera.isInteracting(), false);
  const textarea = element({ tag: 'textarea', parent: root });
  assert.equal(surface.emit('wheel', { target: textarea, deltaY: 20 }).prevented, false);
  assert.equal(camera.y, 0);
  textarea.readOnly = true;
  assert.equal(surface.emit('wheel', { target: textarea, deltaY: 20 }).prevented, true);
  assert.equal(camera.y, -20);
});

test('trackpad scrolling pans diagonally and normalizes line/page wheel events', () => {
  const { camera, surface } = harness();
  surface.emit('wheel', { deltaX: 32, deltaY: -18 });
  assert.equal(camera.x, -32);
  assert.equal(camera.y, 18);
  surface.emit('wheel', { deltaX: -2, deltaY: 1, deltaMode: 1 });
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 2);
  surface.emit('wheel', { deltaX: 1, deltaY: 1, deltaMode: 2 });
  assert.equal(camera.x, -800);
  assert.equal(camera.y, -498);
  surface.emit('wheel', { deltaY: 20, shiftKey: true });
  assert.equal(camera.x, -820);
  assert.equal(camera.y, -498);
  assert.equal(surface.listeners.get('wheel')[0].options.passive, false);
});

test('pinching zooms around the pointer after panning without drifting at zoom limits', () => {
  const { camera, surface } = harness();
  surface.emit('wheel', { deltaX: 90, deltaY: -50 });
  const expected = worldAt(camera, surface, 650, 100);
  for (const deltaY of [-50, -10000, -10000, 10000, 10000, -100]) {
    surface.emit('wheel', { ctrlKey: true, deltaY, clientX: 750, clientY: 150 });
    const actual = worldAt(camera, surface, 650, 100);
    almost(actual[0], expected[0]);
    almost(actual[1], expected[1]);
    assert.ok(camera.scale >= 0.2 && camera.scale <= 3);
  }
});

test('Safari gestures use cumulative scale, support moving the center, and ignore duplicate wheel zoom', () => {
  const { camera, surface, advance } = harness();
  surface.emit('gesturestart', { clientX: 750, clientY: 150 });
  const expected = worldAt(camera, surface, 650, 100);
  assert.equal(camera.isInteracting(), true);
  surface.emit('gesturechange', { scale: 1.5, clientX: 760, clientY: 160 });
  surface.emit('gesturechange', { scale: 2, clientX: 780, clientY: 180 });
  assert.equal(camera.scale, 2);
  const actual = worldAt(camera, surface, 680, 130);
  almost(actual[0], expected[0]);
  almost(actual[1], expected[1]);
  assert.equal(surface.emit('wheel', { ctrlKey: true, deltaY: -50 }).prevented, true);
  assert.equal(camera.scale, 2);
  surface.emit('gestureend', { scale: 2, clientX: 780, clientY: 180 });
  assert.equal(camera.isInteracting(), false);
  surface.emit('wheel', { ctrlKey: true, deltaY: -50 });
  assert.equal(camera.scale, 2);
  advance(151);
  surface.emit('wheel', { ctrlKey: true, deltaY: -50 });
  assert.ok(camera.scale > 2);
});

test('Safari falls back to the last pointer when gesture coordinates are absent', () => {
  const { camera, surface } = harness();
  surface.emit('pointermove', { clientX: 700, clientY: 200 });
  const expected = worldAt(camera, surface, 600, 150);
  surface.emit('gesturestart', { clientX: undefined, clientY: undefined });
  surface.emit('gesturechange', { scale: 1.8, clientX: undefined, clientY: undefined });
  const actual = worldAt(camera, surface, 600, 150);
  almost(actual[0], expected[0]);
  almost(actual[1], expected[1]);
  surface.emit('gesturechange', { scale: 2, clientX: 0, clientY: 0 });
  const syntheticOrigin = worldAt(camera, surface, 600, 150);
  almost(syntheticOrigin[0], expected[0]);
  almost(syntheticOrigin[1], expected[1]);
});

test('cancellation, capture loss, and window blur end gestures without resetting the view', () => {
  const { camera, surface, win } = harness();
  for (const end of ['pointercancel', 'lostpointercapture']) {
    surface.emit('pointerdown');
    surface.emit('pointermove', { clientX: 420 });
    surface.emit(end);
    assert.equal(camera.isInteracting(), false);
    assert.equal(surface.hasPointerCapture(7), false);
  }
  const x = camera.x;
  surface.emit('gesturestart');
  surface.emit('gesturechange', { scale: 2 });
  const zoomed = { x: camera.x, y: camera.y, scale: camera.scale };
  win.emit('blur');
  assert.equal(camera.isInteracting(), false);
  assert.equal(camera.x, zoomed.x);
  assert.equal(camera.y, zoomed.y);
  assert.equal(camera.scale, zoomed.scale);
  assert.notEqual(camera.x, x);
});

test('camera remains independent of mounted content and survives rerenders', () => {
  const { camera, surface, content, element } = harness();
  surface.emit('wheel', { deltaX: 40, deltaY: -80 });
  surface.emit('wheel', { ctrlKey: true, deltaY: -40 });
  const before = { x: camera.x, y: camera.y, scale: camera.scale };
  const replacement = element();
  camera.mount(surface, replacement, { anchorX: 600, anchorY: 200 });
  assert.equal(camera.x, before.x);
  assert.equal(camera.y, before.y);
  assert.equal(camera.scale, before.scale);
  assert.equal(surface.listeners.get('pointerdown').length, 1);
  assert.equal(surface.listeners.get('wheel').length, 1);
  assert.match(replacement.style.transform, /translate\(.+\) scale\(/);
  assert.equal(content.parentElement, null);
});

test('remounting on another surface detaches all old listeners and reset clears view state', () => {
  const { camera, surface, stage, element, win } = harness();
  surface.emit('wheel', { deltaX: 30 });
  surface.emit('pointerdown');
  const next = stage();
  const content = element();
  camera.mount(next, content, { anchorX: 10, anchorY: 10 });
  assert.equal(surface.hasPointerCapture(7), false);
  assert.equal(surface.listeners.get('pointerdown').length, 0);
  assert.equal(win.listeners.get('blur').length, 1);
  assert.equal(camera.x, -30);
  camera.reset();
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  assert.equal(camera.scale, 1);
  assert.equal(next.listeners.get('wheel').length, 0);
  assert.equal(win.listeners.get('blur').length, 0);
  assert.equal(content.style.transform, '');
});

test('reveal shifts the camera in screen pixels to make a newly added node accessible', () => {
  const { camera, surface, element } = harness();
  surface.emit('wheel', { ctrlKey: true, deltaY: -50 });
  const before = { x: camera.x, y: camera.y, scale: camera.scale };
  const node = element();
  node.getBoundingClientRect = () => ({ left: 920, top: 530, width: 220, height: 48 });
  camera.reveal(node);
  assert.equal(camera.x - before.x, -288);
  assert.equal(camera.y - before.y, -76);
  assert.equal(camera.scale, before.scale);
});

test('external editing constraints and modified browser gestures are left alone', () => {
  const { camera, surface, setAllowed, starts } = harness();
  setAllowed(false);
  assert.equal(surface.emit('pointerdown').prevented, false);
  assert.equal(surface.emit('wheel', { deltaY: 50 }).prevented, false);
  assert.equal(surface.emit('gesturestart').prevented, false);
  setAllowed(true);
  assert.equal(surface.emit('wheel', { deltaY: 50, metaKey: true }).prevented, false);
  assert.equal(starts(), 0);
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  assert.equal(camera.scale, 1);
});

test('pan and pinch zoom restore in a new page session with the same diagram key', () => {
  const first = harness();
  first.camera.setPersistenceKey('account-7:diagram-11');
  first.surface.emit('wheel', { deltaX: 125, deltaY: -70 });
  first.surface.emit('wheel', { ctrlKey: true, deltaY: -60, clientX: 600, clientY: 300 });
  const expected = { x: first.camera.x, y: first.camera.y, scale: first.camera.scale };
  const transform = first.content.style.transform;
  const reopened = harness({ storage: first.storage });
  reopened.camera.setPersistenceKey('account-7:diagram-11');
  assert.deepEqual({ x: reopened.camera.x, y: reopened.camera.y, scale: reopened.camera.scale }, expected);
  assert.equal(reopened.content.style.transform, transform);
});

test('reload during a background drag or Safari gesture keeps the latest visible frame', () => {
  const first = harness();
  first.camera.setPersistenceKey('diagram');
  first.surface.emit('pointerdown');
  first.surface.emit('pointermove', { clientX: 510, clientY: 315 });
  const dragging = harness({ storage: first.storage });
  dragging.camera.setPersistenceKey('diagram');
  assert.equal(dragging.camera.x, 110);
  assert.equal(dragging.camera.y, 65);
  first.surface.emit('pointerup');
  first.surface.emit('gesturestart');
  first.surface.emit('gesturechange', { scale: 1.8, clientX: 450, clientY: 280 });
  const gesturing = harness({ storage: first.storage });
  gesturing.camera.setPersistenceKey('diagram');
  assert.equal(gesturing.content.style.transform, first.content.style.transform);
  assert.equal(gesturing.camera.scale, 1.8);
});

test('each diagram keeps its view and a fresh diagram starts centered at 100 percent', () => {
  const { camera, surface, storage, content } = harness();
  camera.setPersistenceKey('first');
  surface.emit('wheel', { deltaX: 100, deltaY: 90 });
  surface.emit('wheel', { ctrlKey: true, deltaY: -40 });
  const firstTransform = content.style.transform;
  camera.setPersistenceKey('second');
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  assert.equal(camera.scale, 1);
  surface.emit('wheel', { deltaX: -50, deltaY: 20 });
  camera.setPersistenceKey('first');
  assert.equal(content.style.transform, firstTransform);
  assert.deepEqual(JSON.parse(storage.get('second')), { x: 50, y: -20, scale: 1 });
});

test('sign-out reset forgets the current binding without clearing its saved view', () => {
  const { camera, surface, content, storage } = harness();
  camera.setPersistenceKey('user-a');
  surface.emit('wheel', { deltaX: 200 });
  const saved = storage.get('user-a');
  camera.reset();
  assert.equal(camera.persistenceKey, null);
  assert.equal(storage.get('user-a'), saved);
  camera.setPersistenceKey('user-b');
  camera.mount(surface, content);
  assert.equal(camera.x, 0);
  camera.reset();
  camera.setPersistenceKey('user-a');
  camera.mount(surface, content);
  assert.equal(camera.x, -200);
});

test('newly created diagram retains zoom and an active drag when its server ID arrives', () => {
  const { camera, surface, storage } = harness();
  surface.emit('wheel', { ctrlKey: true, deltaY: -50 });
  surface.emit('pointerdown');
  surface.emit('pointermove', { clientX: 510 });
  const before = { x: camera.x, y: camera.y, scale: camera.scale };
  camera.setPersistenceKey('new-id', { keepView: true });
  assert.deepEqual(JSON.parse(storage.get('new-id')), before);
  assert.equal(camera.isInteracting(), true);
  surface.emit('pointermove', { clientX: 520 });
  assert.equal(JSON.parse(storage.get('new-id')).x, before.x + 10);
});

test('reflow and unchanged renders do not overwrite or repeatedly save the view', () => {
  const { camera, surface, storage, element, writes } = harness();
  camera.setPersistenceKey('map');
  surface.emit('wheel', { deltaY: -50 });
  const before = storage.get('map'), count = writes();
  camera.setPersistenceKey('map');
  camera.render();
  camera.mount(surface, element(), { anchorX: 500, anchorY: 300 });
  assert.equal(storage.get('map'), before);
  assert.equal(writes(), count);
});

test('malformed or unsupported stored views safely fall back to the default camera', () => {
  for (const raw of ['{bad', 'null', '[]', '{}', '{"x":"0","y":0,"scale":1}', '{"x":1e400,"y":0,"scale":1}', '{"x":20,"y":10,"scale":0.1}', '{"x":20,"y":10,"scale":3.1}']) {
    const { camera } = harness({ storage: new Map([['map', raw]]) });
    camera.setPersistenceKey('map');
    assert.equal(camera.x, 0);
    assert.equal(camera.y, 0);
    assert.equal(camera.scale, 1);
  }
  const { camera, surface } = harness({ storageError: true });
  camera.setPersistenceKey('map');
  surface.emit('wheel', { deltaX: 35 });
  surface.emit('wheel', { ctrlKey: true, deltaY: -50 });
  assert.notEqual(camera.x, 0);
  assert.ok(camera.scale > 1);
});
