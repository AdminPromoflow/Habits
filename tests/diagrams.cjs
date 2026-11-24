const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const { test } = require('node:test');

function editor({ draft = true, state = { user: { name: 'Aleina' }, data: { diagrams: [] } } } = {}) {
  const timers = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  let nextTimer = 0;
  const elements = [];
  function listen(listeners, name, callback) {
    const previous = listeners.get(name);
    listeners.set(name, (event) => {
      previous?.(event);
      if (!event?.immediatePropagationStopped) callback(event);
    });
  }
  const document = {
    activeElement: null,
    addEventListener: (name, callback) => listen(documentListeners, name, callback),
    getElementById: (id) => elements.find((element) => element.id === id) || null,
    querySelector: (selector) => elements.find((element) => element.matches(selector)) || null,
  };
  function element(id, className = '', parentElement = null) {
    const classes = new Set(className.split(' ').filter(Boolean));
    const attributes = new Map();
    const pointers = new Set();
    const item = {
      id, parentElement, style: {}, dataset: {}, hidden: false, tabIndex: 0,
      isConnected: true, offsetHeight: 48,
      get offsetWidth() { return parseFloat(this.style.width) || 220; },
      setPointerCapture: (id) => pointers.add(id),
      hasPointerCapture: (id) => pointers.has(id),
      releasePointerCapture: (id) => pointers.delete(id),
      classList: {
        contains: (name) => classes.has(name),
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle(name, force = !classes.has(name)) {
          if (force) classes.add(name); else classes.delete(name);
          return force;
        },
      },
      setAttribute: (name, value) => attributes.set(name, String(value)),
      getAttribute: (name) => attributes.get(name) ?? null,
      removeAttribute: (name) => attributes.delete(name),
      matches(selector) {
        return selector.startsWith('#') ? selector.slice(1) === id
          : selector.startsWith('.') ? classes.has(selector.slice(1))
          : selector === '[data-action="create-diagram"]' && id === 'create-diagram';
      },
      closest(selector) {
        for (let current = this; current; current = current.parentElement) {
          if (current.matches(selector)) return current;
        }
        return null;
      },
      focus() {
        if (document.activeElement === this) return;
        document.activeElement?.blur();
        document.activeElement = this;
        documentListeners.get('focusin')?.({ target: this });
      },
      blur() {
        this.blurred = true;
        if (document.activeElement !== this) return;
        document.activeElement = null;
        documentListeners.get('focusout')?.({ target: this });
      },
    };
    elements.push(item);
    return item;
  }
  const stage = element('mindmap-stage');
  const root = element('diagram-root', 'diagram-root', stage);
  root.dataset.nodeKey = 'root';
  const node = element('diagram-node', 'diagram-node', root);
  const controls = element('diagram-controls', 'diagram-controls', root);
  const tool = element('diagram-tool', 'diagram-tool', controls);
  const more = element('diagram-more', 'diagram-handle diagram-handle-more', controls);
  const widthHandle = element('diagram-width', 'diagram-handle diagram-handle-arrows', controls);
  const menu = element('diagram-menu', 'diagram-menu diagram-popover', root);
  const menuItem = element('diagram-menu-item', 'diagram-menu-item', menu);
  const outside = element('outside');
  element('create-diagram', '', stage);
  const field = Object.assign(element('diagram-name', '', node), {
    value: '',
    style: { height: '24px' },
    scrollHeight: 24,
    readOnly: true,
    blurred: false,
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  });
  let html = '';
  Object.defineProperty(stage, 'innerHTML', {
    get: () => html,
    set(value) {
      html = value;
      const view = JSON.parse(value);
      if (view.template === 'diagram-node') field.value = view.name;
    },
  });
  const context = vm.createContext({
    PageController: class {}, document,
    DiagramViewport: class {
      constructor(options) { this.options = options; this.reset(); }
      reset() { this.x = 0; this.y = 0; this.scale = 1; this.interacting = false; }
      mount(stage, content, anchor) { this.stage = stage; this.content = content; this.anchor = anchor; }
      reveal(target) { this.revealed = target; }
      isInteracting() { return this.interacting; }
    },
    window: { addEventListener: (name, callback) => listen(windowListeners, name, callback) },
    crypto: { randomUUID },
    S: state,
    t: (key) => key === 'diagram_default_name' ? 'Nuevo diagrama' : key,
    esc: String,
    icon: () => '',
    renderTemplate: (template, values) => JSON.stringify({ template, ...values }),
    setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const HomePage = vm.runInContext(fs.readFileSync('view/home/home.js', 'utf8') + '\nHomePage;', context);
  const home = new HomePage();
  if (draft) home.draft = { client_key: 'b15dcc74-7f1a-4d39-974e-ab2828e3e72f' };
  function dispatch(name, target, options = {}) {
    const event = {
      target, prevented: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.propagationStopped = true; this.immediatePropagationStopped = true; },
      ...options,
    };
    documentListeners.get(name)(event);
    return event;
  }
  return {
    home, state, timers, stage, field, root, node, controls, tool, more, widthHandle, menu, menuItem, outside, document, windowListeners,
    addNodeElement(id, value = '') {
      const root = element(`diagram-root-${id}`, 'diagram-root', stage);
      root.dataset.nodeKey = id;
      const node = element(`diagram-node-${id}`, 'diagram-node', root);
      const controls = element(`diagram-controls-${id}`, 'diagram-controls', root);
      const widthHandle = element(`diagram-width-${id}`, 'diagram-handle diagram-handle-arrows', controls);
      const field = Object.assign(element(`diagram-name-${id}`, '', node), {
        value, readOnly: true, scrollHeight: 24,
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
      });
      return { root, node, field, widthHandle };
    },
    pointer: (name, target = node, options = {}) => dispatch(name, target, {
      button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: 100, clientY: 100, ...options,
    }),
    typeName(value) {
      field.value = value;
      documentListeners.get('input')({ target: field });
    },
    click: (target = node) => dispatch('click', target),
    doubleClick: (target = node) => dispatch('dblclick', target),
    pressKey: (key, modifiers = {}) => dispatch('keydown', field, {
      key, shiftKey: false, isComposing: false, ...modifiers,
    }),
    handleKey: (key, target = widthHandle, modifiers = {}) => dispatch('keydown', target, {
      key, shiftKey: false, isComposing: false, ...modifiers,
    }),
  };
}

function savedEditor() {
  const fixture = editor({
    draft: false,
    state: { user: { name: 'Aleina' }, data: { diagrams: [{ id: 51, name: 'Idea guardada', version: 1 }] } },
  });
  fixture.home.render();
  fixture.home.drawStage();
  return fixture;
}

test('the more action toggles its panel without editing or saving the diagram', async () => {
  const { home, field, more, menu, controls } = savedEditor();
  home.makeRequest = () => { throw new Error('Opening the panel must not save'); };
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(more.getAttribute('aria-expanded'), 'false');

  await home.handleAction('toggle-diagram-menu');
  assert.equal(home.menuOpen, true);
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);
  assert.equal(field.readOnly, true);
  assert.equal(menu.hidden, false);
  assert.equal(controls.hidden, false);
  assert.equal(more.getAttribute('aria-expanded'), 'true');

  await home.handleAction('toggle-diagram-menu');
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(home.selected, true);
});

test('the panel closes on outside or node clicks and when editing begins', async () => {
  const { home, menu, menuItem, field, outside, click, doubleClick } = savedEditor();
  home.makeRequest = () => { throw new Error('Panel interactions must not save'); };
  await home.handleAction('toggle-diagram-menu');
  click(menuItem);
  assert.equal(home.menuOpen, true);
  assert.equal(menu.hidden, false);
  click(outside);
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(home.selected, false);

  await home.handleAction('toggle-diagram-menu');
  click();
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);

  await home.handleAction('toggle-diagram-menu');
  doubleClick();
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(home.editing, true);
  assert.equal(field.readOnly, false);
  assert.equal(field.selectionStart, field.value.length);
  assert.equal(field.selectionEnd, field.value.length);
});

test('Escape closes the panel and restores the more button focus before deselecting', async () => {
  const { home, node, more, menu, menuItem, controls, document, pressKey } = savedEditor();
  await home.handleAction('toggle-diagram-menu');
  menuItem.focus();
  assert.equal(pressKey('Escape', { target: menuItem }).prevented, true);
  assert.equal(home.menuOpen, false);
  assert.equal(menu.hidden, true);
  assert.equal(home.selected, true);
  assert.equal(document.activeElement, more);
  assert.equal(more.getAttribute('aria-expanded'), 'false');

  node.focus();
  assert.equal(pressKey('Escape', { target: node }).prevented, true);
  assert.equal(home.selected, false);
  assert.equal(controls.hidden, true);
});

test('account reset and reload never restore an open diagram panel', async () => {
  const { home, state } = savedEditor();
  await home.handleAction('toggle-diagram-menu');
  assert.equal(home.menuOpen, true);
  home.reset();
  assert.equal(home.menuOpen, false);
  assert.equal(home.selected, false);

  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  restored.home.drawStage();
  assert.equal(restored.home.menuOpen, false);
  assert.equal(restored.menu.hidden, true);
  assert.equal(restored.more.getAttribute('aria-expanded'), 'false');
});

test('a single click selects the node and reveals controls without editing or saving', () => {
  const { home, node, field, controls, root, document, click } = savedEditor();
  home.makeRequest = () => { throw new Error('Selection must not save'); };
  assert.equal(controls.hidden, true);
  assert.equal(field.readOnly, true);
  click();
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);
  assert.equal(controls.hidden, false);
  assert.equal(root.classList.contains('is-selected'), true);
  assert.equal(field.readOnly, true);
  assert.equal(document.activeElement, node);
  assert.equal(home.isEditing(), true, 'selection protects the node from polling redraws');
});

test('double click edits with the caret at the end, and clicking inside keeps its position', () => {
  const { home, field, controls, document, click, doubleClick } = savedEditor();
  click();
  click();
  assert.equal(field.readOnly, true);
  const event = doubleClick();
  assert.equal(event.prevented, true);
  assert.equal(home.editing, true);
  assert.equal(home.selected, true);
  assert.equal(controls.hidden, false);
  assert.equal(field.readOnly, false);
  assert.equal(document.activeElement, field);
  assert.equal(field.selectionStart, field.value.length);
  assert.equal(field.selectionEnd, field.value.length);
  field.selectionStart = 3;
  field.selectionEnd = 3;
  click(field);
  assert.equal(field.selectionStart, 3);
  assert.equal(field.selectionEnd, 3);
});

test('clicking outside deselects while decorative controls do not start actions', () => {
  const { home, field, controls, tool, outside, click } = savedEditor();
  home.makeRequest = () => { throw new Error('Decorative symbols must not save'); };
  click();
  click(tool);
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);
  assert.equal(field.readOnly, true);
  assert.equal(controls.hidden, false);
  click(outside);
  assert.equal(home.selected, false);
  assert.equal(home.editing, false);
  assert.equal(controls.hidden, true);
  assert.equal(home.isEditing(), false);
});

test('leaving the editor saves its current name and returns to readonly selection', async () => {
  const { home, field, controls, doubleClick, typeName } = savedEditor();
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    assert.equal(data.id, 51);
    assert.equal(data.version, 1);
    assert.equal(data.name, 'Nombre editado\nSegunda línea');
    return { id: 51, name: data.name, version: 2 };
  };
  doubleClick();
  typeName('Nombre editado\nSegunda línea');
  field.blur();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(home.active.name, 'Nombre editado\nSegunda línea');
  assert.equal(home.editing, false);
  assert.equal(home.selected, true);
  assert.equal(field.readOnly, true);
  assert.equal(controls.hidden, false);
});

test('clicking outside an active editor saves and hides its controls', async () => {
  const { home, field, controls, outside, click, doubleClick, typeName } = savedEditor();
  home.makeRequest = async (action, data) => ({ id: 51, name: data.name, version: 2 });
  doubleClick();
  typeName('Texto conservado al salir');
  click(outside);
  await new Promise(setImmediate);
  assert.equal(home.active.name, 'Texto conservado al salir');
  assert.equal(home.selected, false);
  assert.equal(home.editing, false);
  assert.equal(field.readOnly, true);
  assert.equal(controls.hidden, true);
  assert.equal(home.isEditing(), false);
});

test('keyboard selection and editing preserve Enter, F2 and Escape behavior', () => {
  const { home, node, field, controls, document, pressKey, typeName } = savedEditor();
  node.focus();
  assert.equal(pressKey(' ', { target: node }).prevented, true);
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);
  assert.equal(pressKey('F2', { target: node }).prevented, true);
  assert.equal(document.activeElement, field);
  assert.equal(field.readOnly, false);
  typeName('Cambio pendiente');
  assert.equal(pressKey('Escape').prevented, true);
  assert.equal(home.name, 'Idea guardada');
  assert.equal(field.value, 'Idea guardada');
  assert.equal(home.editing, false);
  assert.equal(field.readOnly, true);
  assert.equal(document.activeElement, node);
  assert.equal(pressKey('Escape', { target: node }).prevented, true);
  assert.equal(home.selected, false);
  assert.equal(controls.hidden, true);
  assert.equal(pressKey('Enter', { target: node }).prevented, true);
  assert.equal(home.editing, true);
  assert.equal(field.readOnly, false);
});

test('account reset and reload do not retain a previous node selection or editing state', () => {
  const { home, state, doubleClick } = savedEditor();
  doubleClick();
  assert.equal(home.selected, true);
  assert.equal(home.editing, true);
  home.reset();
  assert.equal(home.selected, false);
  assert.equal(home.editing, false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  restored.home.drawStage();
  assert.equal(restored.home.selected, false);
  assert.equal(restored.controls.hidden, true);
  assert.equal(restored.field.readOnly, true);
});

test('Shift Enter allows a native line break while Enter alone saves and leaves editing', async () => {
  const { home, field, typeName, pressKey } = editor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push({ action, ...data });
    return { id: 31, name: data.name, version: 1 };
  };
  home.beginEditing();
  typeName('Primera línea');
  const newline = pressKey('Enter', { shiftKey: true });
  assert.equal(newline.prevented, false);
  assert.equal(field.blurred, false);
  assert.equal(home.editing, true);
  assert.equal(requests.length, 0);

  // The browser inserts the newline and dispatches input when keydown is not cancelled.
  field.scrollHeight = 48;
  typeName('Primera línea\nSegunda línea');
  assert.equal(field.style.height, '48px');
  const save = pressKey('Enter');
  assert.equal(save.prevented, true);
  assert.equal(field.blurred, true);
  assert.equal(home.editing, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, 'Primera línea\nSegunda línea');
  await new Promise(setImmediate);
  assert.equal(home.active.name, 'Primera línea\nSegunda línea');
});

test('saved multiline names preserve leading, internal and trailing line breaks after reload', async () => {
  const { home, state, timers, windowListeners } = editor();
  const name = '\nMi plan\nSegunda idea\n';
  home.name = name;
  home.makeRequest = async (action, data) => {
    assert.equal(data.name, name);
    return { id: 32, name: data.name, version: 1 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, name);
  assert.equal(home.isEditing(), false);
  assert.equal(timers.size, 0);
  const beforeUnload = { preventDefault() { this.prevented = true; } };
  windowListeners.get('beforeunload')(beforeUnload);
  assert.equal(beforeUnload.prevented, undefined);

  const { home: restored } = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  const node = JSON.parse(JSON.parse(restored.render()).content);
  assert.equal(node.name, name);
});

test('adding only a final line break is an unsaved change and gets persisted', async () => {
  const { home, windowListeners } = editor({ draft: false });
  home.active = { id: 33, name: 'Idea guardada', version: 1 };
  home.name = 'Idea guardada\n';
  assert.equal(home.isEditing(), true);
  const beforeUnload = { preventDefault() { this.prevented = true; } };
  windowListeners.get('beforeunload')(beforeUnload);
  assert.equal(beforeUnload.prevented, true);
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    assert.equal(data.name, 'Idea guardada\n');
    return { id: 33, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(requests, 1);
  assert.equal(home.active.name, 'Idea guardada\n');
  assert.equal(home.isEditing(), false);
});

test('text area grows and shrinks on mount, input and viewport resizing', () => {
  const { home, field, typeName, windowListeners } = editor();
  field.scrollHeight = 72;
  home.mount();
  assert.equal(field.style.height, '72px');
  home.beginEditing();
  field.scrollHeight = 24;
  typeName('Breve');
  assert.equal(field.style.height, '24px');
  field.scrollHeight = 96;
  typeName('Una idea\nDos ideas\nTres ideas\nCuatro ideas');
  assert.equal(field.style.height, '96px');
  field.scrollHeight = 120;
  windowListeners.get('resize')();
  assert.equal(field.style.height, '120px');
});

test('names containing only whitespace and line breaks are never submitted', async () => {
  const { home } = editor({ draft: false });
  home.active = { id: 34, name: 'Nombre válido', version: 1 };
  home.name = ' \n\t\n ';
  home.makeRequest = () => { throw new Error('No request expected'); };
  await home.save();
  assert.equal(home.error, 'diagram_name_required');
  assert.equal(home.active.name, 'Nombre válido');
});

test('creating a diagram saves immediately without typing and restores after reload', async () => {
  const { home, state, stage, field, controls, windowListeners } = editor({ draft: false });
  let finish;
  const requests = [];
  home.makeRequest = (action, data) => {
    requests.push({ action, ...data });
    return new Promise((resolve) => { finish = resolve; });
  };
  const pending = home.handleAction('create-diagram');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, 'saveDiagram');
  assert.equal(requests[0].name, 'Nuevo diagrama');
  assert.match(requests[0].client_key, /^[a-f0-9-]{36}$/);
  assert.equal(JSON.parse(stage.innerHTML).template, 'diagram-node');
  assert.equal(home.saving, true);
  assert.equal(home.selected, true);
  assert.equal(home.editing, false);
  assert.equal(field.readOnly, true);
  assert.equal(controls.hidden, false);
  const beforeUnload = { preventDefault() { this.prevented = true; } };
  windowListeners.get('beforeunload')(beforeUnload);
  assert.equal(beforeUnload.prevented, true);
  finish({ id: 21, name: requests[0].name, version: 1 });
  await pending;
  assert.equal(home.draft, null);
  assert.equal(state.data.diagrams.length, 1);

  const { home: restored } = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  const page = JSON.parse(restored.render());
  const node = JSON.parse(page.content);
  assert.equal(node.template, 'diagram-node');
  assert.equal(node.name, 'Nuevo diagrama');
  assert.equal(restored.active.id, 21);
});

test('typing while the initial creation is pending saves the new name afterward', async () => {
  const { home, state, timers, typeName } = editor({ draft: false });
  let finish;
  home.makeRequest = () => new Promise((resolve) => { finish = resolve; });
  const pending = home.handleAction('create-diagram');
  home.beginEditing();
  typeName('Mi plan de hoy');
  finish({ id: 22, name: 'Nuevo diagrama', version: 1 });
  await pending;
  assert.equal(home.name, 'Mi plan de hoy');
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(data.id, 22);
    assert.equal(data.version, 1);
    assert.equal(data.name, 'Mi plan de hoy');
    return { id: 22, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, 'Mi plan de hoy');
  assert.equal(timers.size, 0);
});

test('repeated create clicks do not duplicate a pending or saved diagram', async () => {
  const { home, state } = editor({ draft: false });
  let finish;
  let requests = 0;
  home.makeRequest = () => {
    requests++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const pending = home.handleAction('create-diagram');
  const key = home.draft.client_key;
  await home.handleAction('create-diagram');
  assert.equal(requests, 1);
  assert.equal(home.draft.client_key, key);
  finish({ id: 23, name: 'Nuevo diagrama', version: 1 });
  await pending;
  await home.handleAction('create-diagram');
  assert.equal(requests, 1);
  assert.equal(state.data.diagrams.length, 1);
  assert.equal(home.active.id, 23);
});

test('failed initial creation retains its key and can be retried without typing', async () => {
  const { home, state } = editor({ draft: false });
  let originalKey;
  home.makeRequest = async (action, data) => {
    originalKey = data.client_key;
    throw new Error('Connection lost');
  };
  await home.handleAction('create-diagram');
  assert.equal(home.error, 'Connection lost');
  assert.equal(home.draft.client_key, originalKey);
  assert.equal(home.name, 'Nuevo diagrama');
  home.makeRequest = async (action, data) => {
    assert.equal(data.client_key, originalKey);
    assert.equal(data.name, 'Nuevo diagrama');
    return { id: 24, name: data.name, version: 1 };
  };
  await home.handleAction('retry-diagram');
  assert.equal(home.error, '');
  assert.equal(home.draft, null);
  assert.equal(state.data.diagrams.length, 1);
});

test('typing during a save queues the latest name with the returned version', async () => {
  const { home, state, timers } = editor();
  let finish;
  home.name = 'First name';
  home.makeRequest = () => new Promise((resolve) => { finish = resolve; });
  const pending = home.save();
  home.name = 'Newest name';
  finish({ id: 1, name: 'First name', version: 1 });
  await pending;
  assert.equal(home.name, 'Newest name');
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(action, 'saveDiagram');
    assert.equal(data.id, 1);
    assert.equal(data.version, 1);
    assert.equal(data.name, 'Newest name');
    return { id: 1, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, 'Newest name');
  assert.equal(state.data.diagrams.length, 1);
  assert.equal(timers.size, 0);
});

test('a lost create response can be retried without losing a later edit', async () => {
  const { home, timers } = editor();
  home.name = 'Original';
  const key = home.draft.client_key;
  home.makeRequest = async () => { throw new Error('Connection lost'); };
  await home.save();
  assert.equal(home.draft.client_key, key);
  assert.equal(home.error, 'Connection lost');
  home.name = 'Edited while offline';
  home.makeRequest = async (action, data) => {
    assert.equal(data.client_key, key);
    return { id: 7, name: 'Original', version: 1 };
  };
  await home.save();
  assert.equal(home.active.id, 7);
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(data.id, 7);
    assert.equal(data.name, 'Edited while offline');
    return { id: 7, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(home.active.name, 'Edited while offline');
  assert.equal(home.error, '');
});

test('a late response from a signed-out account cannot enter another account state', async () => {
  const { home, state, timers } = editor();
  let finish;
  home.name = 'Private old account';
  home.makeRequest = () => new Promise((resolve) => { finish = resolve; });
  const pending = home.save();
  home.reset();
  finish({ id: 99, name: 'Private old account', version: 1 });
  await pending;
  assert.equal(home.active, null);
  assert.equal(home.name, '');
  assert.equal(state.data.diagrams.length, 0);
  assert.equal(timers.size, 0);
});

test('empty edits keep the saved name and restoring it clears validation errors', async () => {
  const { home } = editor();
  home.active = { id: 1, name: 'Saved', version: 2 };
  home.draft = null;
  home.makeRequest = () => { throw new Error('No request expected'); };
  home.name = '  ';
  await home.save();
  assert.equal(home.active.name, 'Saved');
  assert.equal(home.error, 'diagram_name_required');
  home.name = ' Saved ';
  await home.save();
  assert.equal(home.error, '');
  assert.equal(home.isEditing(), false);
});

test('children persist their parent and inherit layout without changing the root name', async () => {
  const { home } = savedEditor();
  let snapshot;
  home.makeRequest = async (action, data) => {
    snapshot = JSON.parse(JSON.stringify(data));
    return { id: data.id, name: data.name, nodes: snapshot.nodes, version: data.version + 1 };
  };
  await home.addChild();
  const child = home.nodes.find((node) => node.id !== 'root');
  assert.equal(child.parent_id, 'root');
  assert.equal(child.layout, null);
  assert.equal(home.selectedKey, child.id);
  assert.equal(snapshot.name, 'Idea guardada');
  home.name = 'Idea hija\nDetalle';
  await home.save();
  assert.equal(snapshot.name, 'Idea guardada');
  assert.equal(snapshot.nodes.find((node) => node.id === child.id).text, 'Idea hija\nDetalle');
  assert.equal(home.hasChanges(), false);
});

test('applying a root layout replaces child overrides and persists the result after reload', async () => {
  const { home, state } = savedEditor();
  home.makeRequest = async (action, data) => ({
    id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1,
  });
  await home.addChild();
  const childKey = home.selectedKey;
  const childStyle = { mode: 'vertical', direction: 'bottom', vertical: 'auto', horizontal: 'auto' };
  const rootStyle = { mode: 'linear', direction: 'auto', vertical: 'compact', horizontal: 'ltr' };
  home.applyLayout(childKey, childStyle);
  await new Promise(setImmediate);
  home.applyLayout('root', rootStyle);
  await new Promise(setImmediate);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes.find((node) => node.id === childKey).layout, null);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes.find((node) => node.id === 'root').layout)), rootStyle);
  home.applyLayout(childKey, childStyle);
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes.find((node) => node.id === childKey).layout)), childStyle);
  home.applyLayout(childKey, null);
  await new Promise(setImmediate);
  assert.equal(home.active.nodes.find((node) => node.id === childKey).layout, null);
});

test('layout changes during a request are queued with the returned version', async () => {
  const { home, timers } = savedEditor();
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => {
    finish = () => resolve({ id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: 2 });
  });
  home.name = 'Nombre nuevo';
  const pending = home.save();
  const layout = { mode: 'matrix', direction: 'auto', vertical: 'bottom', horizontal: 'rtl' };
  home.applyLayout('root', layout);
  finish();
  await pending;
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(data.version, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(data.nodes[0].layout)), layout);
    return { id: data.id, name: data.name, nodes: data.nodes, version: 3 };
  };
  await home.save();
  assert.equal(home.hasChanges(), false);
});

test('server node ordering does not create a perpetual save loop', async () => {
  const { home, timers } = savedEditor();
  home.makeRequest = async (action, data) => ({
    id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)).reverse(), version: data.version + 1,
  });
  await home.addChild();
  assert.equal(home.hasChanges(), false);
  assert.equal(timers.size, 0);
});

test('moving or zooming the camera is not a diagram edit and survives a redraw', () => {
  const { home, windowListeners } = savedEditor();
  home.makeRequest = () => { throw new Error('Camera movement must not save diagram data'); };
  home.viewport.x = 140;
  home.viewport.y = -85;
  home.viewport.scale = 1.75;
  home.drawStage();
  assert.equal(home.viewport.x, 140);
  assert.equal(home.viewport.y, -85);
  assert.equal(home.viewport.scale, 1.75);
  assert.equal(home.hasChanges(), false);
  const beforeUnload = { preventDefault() { this.prevented = true; } };
  windowListeners.get('beforeunload')(beforeUnload);
  assert.equal(beforeUnload.prevented, undefined);
  home.viewport.interacting = true;
  assert.equal(home.isEditing(), true, 'polling must not replace the canvas during a gesture');
  home.viewport.interacting = false;
  assert.equal(home.isEditing(), false);
  home.reset();
  assert.equal(home.viewport.x, 0);
  assert.equal(home.viewport.y, 0);
  assert.equal(home.viewport.scale, 1);
});

test('a node must be selected before dragging, and a click without movement never saves', () => {
  const { home, node, root, pointer, click } = savedEditor();
  home.makeRequest = () => { throw new Error('Selection and clicks must not save'); };
  pointer('pointerdown');
  pointer('pointermove', node, { clientX: 180, clientY: 150 });
  assert.equal(home.drag, null);
  assert.equal(home.nodes[0].x, null);
  click();
  pointer('pointerdown');
  assert.equal(home.drag.key, 'root');
  pointer('pointermove', node, { clientX: 102, clientY: 101 });
  assert.equal(home.drag.moving, false);
  pointer('pointerup');
  assert.equal(home.drag, null);
  assert.equal(root.hasPointerCapture(1), false);
  assert.equal(root.classList.contains('is-dragging'), false);
  assert.equal(home.hasChanges(), false);
});

test('a selected root moves by screen distance divided by zoom and persists after reload', async () => {
  const { home, state, node, root, field, click, pointer } = savedEditor();
  home.viewport.scale = 2;
  home.positionTree = () => {};
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
  };
  click();
  pointer('pointerdown');
  pointer('pointermove', node, { clientX: 180, clientY: 60 });
  assert.equal(root.classList.contains('is-dragging'), true);
  assert.equal(root.hasPointerCapture(1), true);
  assert.equal(field.readOnly, true);
  assert.equal(home.viewport.options.canInteract(), false, 'panning must not compete with a node drag');
  assert.equal(home.nodes[0].x, 40);
  assert.equal(home.nodes[0].y, -20);
  assert.equal(requests, 0, 'pointermove updates the view without writing on every frame');
  pointer('pointerup');
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(root.classList.contains('is-dragging'), false);
  assert.equal(root.hasPointerCapture(1), false);
  assert.equal(home.viewport.options.canInteract(), true);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes[0].x, 40);
  assert.equal(restored.home.nodes[0].y, -20);
});

test('editing, a modal, or an active camera gesture prevents node dragging', () => {
  const { home, pointer, click, doubleClick } = savedEditor();
  click();
  home.layoutOpen = true;
  pointer('pointerdown');
  assert.equal(home.drag, null);
  home.layoutOpen = false;
  home.viewport.interacting = true;
  pointer('pointerdown');
  assert.equal(home.drag, null);
  home.viewport.interacting = false;
  doubleClick();
  pointer('pointerdown');
  assert.equal(home.drag, null);
});

function branchDragEditor() {
  const fixture = savedEditor();
  const layout = { mode: 'horizontal', direction: 'auto', vertical: 'auto', horizontal: 'auto' };
  fixture.home.nodes = [
    { id: 'root', parent_id: null, text: 'Idea guardada', layout, x: 0, y: 0 },
    { id: 'branch', parent_id: 'root', text: 'Rama', layout: null, x: 100, y: 50 },
    { id: 'leaf', parent_id: 'branch', text: 'Idea', layout: { ...layout, mode: 'vertical' }, x: 300, y: 100 },
    { id: 'inherited', parent_id: 'branch', text: 'Automática', layout: null, x: null, y: null },
    { id: 'sibling', parent_id: 'root', text: 'Otra rama', layout: null, x: -80, y: 20 },
  ];
  fixture.home.active.nodes = JSON.parse(JSON.stringify(fixture.home.nodes));
  fixture.home.plan = { origin: { x: 72, y: 72 }, nodes: [{ id: 'branch', x: 172, y: 122 }] };
  const branch = fixture.addNodeElement('branch', 'Rama');
  fixture.home.positionTree = () => {};
  fixture.home.makeRequest = async (action, data) => ({
    id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1,
  });
  return { ...fixture, branch };
}

test('moving a branch carries its manually positioned descendants without changing sibling branches', async () => {
  const { home, branch, pointer, click } = branchDragEditor();
  home.viewport.scale = 2;
  click(branch.node);
  pointer('pointerdown', branch.node);
  pointer('pointermove', branch.node, { clientX: 120, clientY: 110 });
  pointer('pointermove', branch.node, { clientX: 180, clientY: 140 });
  const byId = (id) => home.nodes.find((node) => node.id === id);
  assert.equal(byId('branch').x, 140);
  assert.equal(byId('branch').y, 70);
  assert.equal(byId('leaf').x, 340);
  assert.equal(byId('leaf').y, 120);
  assert.equal(byId('inherited').x, null, 'automatic descendants are placed by the layout engine');
  assert.equal(byId('sibling').x, -80);
  assert.equal(byId('sibling').y, 20);
  pointer('pointerup', branch.node);
  await new Promise(setImmediate);
  assert.equal(home.hasChanges(), false);
});

test('applying a branch layout replaces descendant styles and positions without changing ancestors or siblings', async () => {
  const { home } = branchDragEditor();
  home.nodes.push({ id: 'deep', parent_id: 'leaf', text: 'Más profundo', layout: { mode: 'matrix' }, x: 400, y: 150 });
  const outsideBefore = JSON.parse(JSON.stringify(home.nodes.filter((node) => ['root', 'sibling'].includes(node.id))));
  const layout = { mode: 'list', direction: 'auto', vertical: 'bottom', horizontal: 'ltr' };
  home.applyLayout('branch', layout, 'branch');
  await new Promise(setImmediate);
  for (const id of ['branch', 'leaf', 'inherited', 'deep']) {
    const node = home.nodes.find((node) => node.id === id);
    assert.equal(node.x, null);
    assert.equal(node.y, null);
    if (id !== 'branch') assert.equal(node.layout, null);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.find((node) => node.id === 'branch').layout)), layout);
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.filter((node) => ['root', 'sibling'].includes(node.id)))), outsideBefore);
  assert.equal(home.hasChanges(), false);
});

test('applying to the whole diagram from a child replaces all styles and positions in one saved update', async () => {
  const { home, state } = branchDragEditor();
  const layout = { mode: 'horizontal', direction: 'right', vertical: 'auto', horizontal: 'auto' };
  let requests = 0;
  let snapshot;
  home.makeRequest = async (action, data) => {
    requests++;
    snapshot = JSON.parse(JSON.stringify(data));
    return { id: data.id, name: data.name, nodes: snapshot.nodes, version: data.version + 1 };
  };
  home.applyLayout('leaf', layout, 'diagram');
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(snapshot.name, 'Idea guardada');
  for (const node of snapshot.nodes) {
    assert.equal(node.x, null);
    assert.equal(node.y, null);
    if (node.id === 'root') assert.deepEqual(node.layout, layout);
    else assert.equal(node.layout, null);
  }
  assert.equal(home.hasChanges(), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes)), snapshot.nodes);
});

test('restoring inheritance in a branch clears every descendant override and leaves other branches intact', async () => {
  const { home } = branchDragEditor();
  const rootBefore = JSON.parse(JSON.stringify(home.nodes.find((node) => node.id === 'root')));
  const siblingBefore = JSON.parse(JSON.stringify(home.nodes.find((node) => node.id === 'sibling')));
  home.nodes.find((node) => node.id === 'branch').layout = { mode: 'list' };
  home.applyLayout('branch', null, 'branch');
  await new Promise(setImmediate);
  for (const id of ['branch', 'leaf', 'inherited']) {
    const node = home.active.nodes.find((node) => node.id === id);
    assert.equal(node.layout, null);
    assert.equal(node.x, null);
    assert.equal(node.y, null);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes.find((node) => node.id === 'root'))), rootBefore);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes.find((node) => node.id === 'sibling'))), siblingBefore);
  assert.equal(home.hasChanges(), false);
});

test('restoring the diagram default from a child removes all styles and manual positions', async () => {
  const { home } = branchDragEditor();
  home.applyLayout('leaf', null, 'diagram');
  await new Promise(setImmediate);
  for (const node of home.active.nodes) {
    assert.equal(node.layout, null);
    assert.equal(node.x, null);
    assert.equal(node.y, null);
  }
  assert.equal(home.hasChanges(), false);
});

test('pointer cancellation and window blur release node capture and save the final moved position once', async () => {
  for (const ending of ['pointercancel', 'lostpointercapture', 'blur']) {
    const { home, node, root, pointer, click, windowListeners } = savedEditor();
    home.positionTree = () => {};
    let requests = 0;
    home.makeRequest = async (action, data) => {
      requests++;
      return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
    };
    click();
    pointer('pointerdown');
    pointer('pointermove', node, { clientX: 130, clientY: 120 });
    if (ending === 'blur') windowListeners.get('blur')();
    else pointer(ending);
    pointer('pointerup');
    await new Promise(setImmediate);
    assert.equal(home.drag, null, ending);
    assert.equal(root.hasPointerCapture(1), false, ending);
    assert.equal(root.classList.contains('is-dragging'), false, ending);
    assert.equal(requests, 1, ending);
    assert.equal(home.active.nodes[0].x, 30, ending);
    assert.equal(home.active.nodes[0].y, 20, ending);
  }
});

test('account reset cancels an unfinished drag without saving it to the next account', () => {
  const { home, node, root, pointer, click } = savedEditor();
  home.positionTree = () => {};
  home.makeRequest = () => { throw new Error('Account reset must not save an in-progress drag'); };
  click();
  pointer('pointerdown');
  pointer('pointermove', node, { clientX: 130, clientY: 120 });
  home.reset();
  pointer('pointerup');
  assert.equal(home.drag, null);
  assert.equal(root.hasPointerCapture(1), false);
  assert.equal(home.active, null);
});
