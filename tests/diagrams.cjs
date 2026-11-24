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
  const document = {
    activeElement: null,
    addEventListener: (name, callback) => documentListeners.set(name, callback),
    getElementById: (id) => elements.find((element) => element.id === id) || null,
    querySelector: (selector) => elements.find((element) => element.matches(selector)) || null,
  };
  function element(id, className = '', parentElement = null) {
    const classes = new Set(className.split(' ').filter(Boolean));
    const attributes = new Map();
    const item = {
      id, parentElement, style: {}, hidden: false, tabIndex: 0,
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
  const node = element('diagram-node', 'diagram-node', root);
  const controls = element('diagram-controls', 'diagram-controls', root);
  const tool = element('diagram-tool', 'diagram-tool', controls);
  const more = element('diagram-more', 'diagram-handle diagram-handle-more', controls);
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
    window: { addEventListener: (name, callback) => windowListeners.set(name, callback) },
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
      ...options,
    };
    documentListeners.get(name)(event);
    return event;
  }
  return {
    home, state, timers, stage, field, root, node, controls, tool, more, menu, menuItem, outside, document, windowListeners,
    typeName(value) {
      field.value = value;
      documentListeners.get('input')({ target: field });
    },
    click: (target = node) => dispatch('click', target),
    doubleClick: (target = node) => dispatch('dblclick', target),
    pressKey: (key, modifiers = {}) => dispatch('keydown', field, {
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
