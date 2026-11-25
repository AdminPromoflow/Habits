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
          type,
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
      contains(target) {
        for (let element = target; element; element = element.parentElement) if (element === this) return true;
        return false;
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

function boundedHarness(bounds = [{ x: 0, y: 0, width: 220, height: 48 }], options) {
  const fixture = harness(options);
  fixture.camera.mount(fixture.surface, fixture.content, { anchorX: 110, anchorY: 24, bounds });
  return fixture;
}

function assertDiagramVisible({ camera, surface }) {
  const width = surface.clientWidth, height = surface.clientHeight;
  const marginX = Math.min(24, width / 8), marginY = Math.min(24, height / 8);
  assert.ok(camera.bounds.some(box => {
    const left = width / 2 + camera.x + (box.x - camera.anchorX) * camera.scale;
    const top = height / 2 + camera.y + (box.y - camera.anchorY) * camera.scale;
    const boxWidth = box.width * camera.scale, boxHeight = box.height * camera.scale;
    const visibleWidth = Math.min(left + boxWidth, width - marginX) - Math.max(left, marginX);
    const visibleHeight = Math.min(top + boxHeight, height - marginY) - Math.max(top, marginY);
    return visibleWidth + 0.00001 >= Math.min(64, boxWidth, width - 2 * marginX) &&
      visibleHeight + 0.00001 >= Math.min(32, boxHeight, height - 2 * marginY);
  }), 'at least part of one actual node must remain inside the canvas');
}

test('background drags stop before the diagram disappears in every direction', () => {
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const fixture = boundedHarness();
    const { camera, surface } = fixture;
    surface.emit('pointerdown');
    surface.emit('pointermove', { clientX: 400 + dx * 10000, clientY: 250 + dy * 10000 });
    assertDiagramVisible(fixture);
    const edge = { x: camera.x, y: camera.y };
    surface.emit('pointermove', { clientX: 400 + dx * 9990, clientY: 250 + dy * 9990 });
    almost(camera.x, edge.x - dx * 10);
    almost(camera.y, edge.y - dy * 10);
    assertDiagramVisible(fixture);
    surface.emit('pointerup');
  }
});

test('wheel pan, pointer zoom and Safari gestures retain visible content at their limits', () => {
  const fixture = boundedHarness();
  const { camera, surface } = fixture;
  surface.emit('wheel', { deltaX: 20, deltaY: -30 });
  assert.equal(camera.x, -20, 'ordinary navigation remains unchanged');
  assert.equal(camera.y, 30);
  for (const delta of [-10000, 10000]) {
    surface.emit('wheel', { deltaX: delta, deltaY: -delta });
    assertDiagramVisible(fixture);
    surface.emit('wheel', { deltaY: delta, shiftKey: true, deltaMode: 2 });
    assertDiagramVisible(fixture);
    surface.emit('wheel', { deltaY: delta, ctrlKey: true, clientX: 100, clientY: 50 });
    assertDiagramVisible(fixture);
  }
  surface.emit('gesturestart');
  surface.emit('gesturechange', { scale: 3, clientX: 10000, clientY: 10000 });
  assertDiagramVisible(fixture);
  const edge = { x: camera.x, y: camera.y };
  surface.emit('gesturechange', { scale: 3, clientX: 9990, clientY: 9990 });
  almost(camera.x, edge.x - 10);
  almost(camera.y, edge.y - 10);
  surface.emit('gesturechange', { scale: 0.01, clientX: -10000, clientY: -10000 });
  assertDiagramVisible(fixture);
  surface.emit('gestureend', { scale: 0.01 });
  assertDiagramVisible(fixture);
});

test('sparse diagrams and extreme zoom never leave only the empty space between nodes visible', () => {
  const bounds = [{ x: 0, y: 0, width: 220, height: 48 }, { x: 3000, y: 4000, width: 300, height: 80 }];
  const fixture = boundedHarness(bounds);
  const { camera } = fixture;
  const original = JSON.stringify(bounds);
  for (const scale of [0.0001, 0.2, 1, 3]) {
    camera.scale = scale;
    for (const x of [-10000, -1500, 0, 10000]) {
      for (const y of [-10000, -2000, 0, 10000]) {
        camera.x = x; camera.y = y;
        camera.render();
        assertDiagramVisible(fixture);
      }
    }
  }
  assert.equal(JSON.stringify(bounds), original, 'camera constraints never alter node positions');
});

test('resize and removing distant nodes bring existing content back into view', () => {
  const bounds = [{ x: 0, y: 0, width: 220, height: 48 }, { x: 3000, y: 2000, width: 220, height: 48 }];
  const fixture = boundedHarness(bounds);
  const { camera, surface, content } = fixture;
  camera.x = -3000; camera.y = -2000;
  camera.render();
  assert.equal(camera.x, -3000, 'any node can be the visible part, not just the root');
  camera.mount(surface, content, { anchorX: 110, anchorY: 24, bounds: [bounds[0]] });
  assertDiagramVisible(fixture);
  for (const [width, height] of [[240,120], [48,48], [1200,800]]) {
    surface.clientWidth = width; surface.clientHeight = height;
    camera.render();
    assertDiagramVisible(fixture);
  }
});

test('offscreen saved views recover on mount using the correct diagram geometry', () => {
  const storage = new Map([
    ['lost', JSON.stringify({ x: 100000, y: -100000, scale: 0.5 })],
    ['other', JSON.stringify({ x: -3000, y: -2000, scale: 1 })],
  ]);
  const fixture = boundedHarness(undefined, { storage });
  const { camera, surface, content } = fixture;
  camera.setPersistenceKey('lost');
  camera.mount(surface, content, { anchorX: 110, anchorY: 24, bounds: [{ x: 0, y: 0, width: 220, height: 48 }] });
  assertDiagramVisible(fixture);
  const recovered = { x: camera.x, y: camera.y, scale: camera.scale };
  assert.deepEqual(JSON.parse(storage.get('lost')), recovered);
  camera.setPersistenceKey('other');
  camera.mount(surface, content, { anchorX: 110, anchorY: 24, bounds: [{ x: 3000, y: 2000, width: 220, height: 48 }] });
  assert.deepEqual({ x: camera.x, y: camera.y, scale: camera.scale }, { x: -3000, y: -2000, scale: 1 });
  assert.deepEqual(JSON.parse(storage.get('lost')), recovered);
});

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

test('lifting fingers keeps the last Safari zoom even when the final event resets its scale and centroid', () => {
  const {camera, surface} = harness();
  surface.emit('gesturestart', {clientX:600, clientY:220});
  surface.emit('gesturechange', {scale:1.7, clientX:630, clientY:240});
  const final = [camera.x, camera.y, camera.scale];
  surface.emit('gestureend', {scale:1, clientX:0, clientY:0});
  assert.deepEqual([camera.x, camera.y, camera.scale], final);
  assert.equal(camera.isInteracting(), false);
});

test('a full-screen Safari canvas retains its latest centroid when coordinates become synthetic', () => {
  const {camera, surface} = harness();
  surface.getBoundingClientRect = () => ({left:0, top:0, width:800, height:500});
  surface.emit('gesturestart', {clientX:300, clientY:200});
  surface.emit('gesturechange', {scale:1.2, clientX:350, clientY:230});
  const expected = worldAt(camera, surface, 350, 230);
  surface.emit('gesturechange', {scale:1.8, clientX:0, clientY:0});
  const actual = worldAt(camera, surface, 350, 230);
  almost(actual[0], expected[0]); almost(actual[1], expected[1]);
});

test('two-finger touch zoom follows the midpoint and ends without a second zoom or a remaining-finger pan', () => {
  const {camera, surface} = harness();
  const finger = (identifier, clientX, clientY = 250) => ({identifier,clientX,clientY,target:surface});
  surface.emit('pointerdown', {pointerType:'touch',pointerId:1,clientX:350});
  surface.emit('pointermove', {pointerType:'touch',pointerId:1,clientX:370});
  const expected = worldAt(camera, surface, 350, 200);
  assert.equal(surface.emit('touchstart', {touches:[finger(1,350),finger(2,550)]}).prevented, true);
  assert.equal(camera.pan, null);
  surface.emit('touchmove', {touches:[finger(1,270,280),finger(2,670,280)]});
  assert.equal(camera.scale, 2);
  const actual = worldAt(camera, surface, 370, 230);
  almost(actual[0],expected[0]); almost(actual[1],expected[1]);
  const final = [camera.x,camera.y,camera.scale];
  surface.emit('gesturestart');
  surface.emit('gesturechange', {scale:2});
  surface.emit('gestureend', {scale:1});
  surface.emit('wheel', {ctrlKey:true,deltaY:-30});
  assert.deepEqual([camera.x,camera.y,camera.scale],final);
  surface.emit('touchend', {touches:[finger(1,270,280)]});
  surface.emit('pointermove', {pointerType:'touch',pointerId:1,clientX:280,clientY:285});
  surface.emit('touchend', {touches:[]});
  surface.emit('gesturestart');
  assert.deepEqual([camera.x,camera.y,camera.scale],final);
  assert.equal(camera.isInteracting(),false);
  assert.equal(surface.emit('click').prevented,true);
});

test('touch zoom handles cancellation and limits, releases a pending node drag and ignores editor controls', () => {
  const {camera, surface, element, setAllowed} = harness();
  const node = element({classes:['diagram-root'],parent:surface});
  const touch = (identifier,clientX,target=node) => ({identifier,clientX,clientY:250,target});
  setAllowed(false);
  let released = 0;
  camera.onPinchStart = () => {released++;setAllowed(true);};
  surface.emit('touchstart', {touches:[touch(1,400),touch(2,500)]});
  assert.equal(released,1);
  surface.emit('touchmove', {touches:[touch(1,0),touch(2,900)]});
  assert.equal(camera.scale,3);
  surface.emit('touchmove', {touches:[touch(1,449),touch(2,451)]});
  assert.equal(camera.scale,.2);
  const final = [camera.x,camera.y,camera.scale];
  surface.emit('touchcancel', {touches:[]});
  assert.equal(camera.isInteracting(),false);
  assert.deepEqual([camera.x,camera.y,camera.scale],final);
  const input = element({tag:'textarea',parent:node});
  assert.equal(surface.emit('touchstart', {touches:[touch(1,400,input),touch(2,500)]}).prevented,false);
  assert.equal(released,1);
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
