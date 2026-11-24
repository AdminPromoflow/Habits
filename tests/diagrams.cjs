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
  const stage = { innerHTML: '' };
  const field = {
    id: 'diagram-name',
    value: '',
    style: { height: '24px' },
    scrollHeight: 24,
    blurred: false,
    focus() { documentListeners.get('focusin')?.({ target: this }); },
    blur() {
      this.blurred = true;
      documentListeners.get('focusout')?.({ target: this });
    },
    select() {},
  };
  const context = vm.createContext({
    PageController: class {},
    document: {
      addEventListener: (name, callback) => documentListeners.set(name, callback),
      getElementById: (id) => ({ 'mindmap-stage': stage, 'diagram-name': field })[id] || null,
      querySelector: () => null,
    },
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
  return {
    home, state, timers, stage, field, windowListeners,
    typeName(value) {
      field.value = value;
      documentListeners.get('input')({ target: field });
    },
    pressKey(key, modifiers = {}) {
      const event = {
        target: field,
        key,
        shiftKey: false,
        isComposing: false,
        prevented: false,
        preventDefault() { this.prevented = true; },
        ...modifiers,
      };
      documentListeners.get('keydown')(event);
      return event;
    },
  };
}

test('Shift Enter allows a native line break while Enter alone saves and leaves editing', async () => {
  const { home, field, typeName, pressKey } = editor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push({ action, ...data });
    return { id: 31, name: data.name, version: 1 };
  };
  field.focus();
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
  const { home, state, stage, windowListeners } = editor({ draft: false });
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
