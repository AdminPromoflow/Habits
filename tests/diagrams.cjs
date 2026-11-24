const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const { test } = require('node:test');

function editor({ draft = true, state = { user: { name: 'Aleina' }, data: { diagrams: [] } }, url = 'http://localhost/MyRemarkableMind/' } = {}) {
  const timers = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  let nextTimer = 0;
  const navigations = [];
  const location = { href: url, assign: (url) => navigations.push(url) };
  const history = { replaceState: (state, unused, url) => { location.href = url; } };
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
  const title = element('diagram-title', 'diagram-title', stage);
  const titleLabel = element('diagram-title-label', '', title);
  const titleInput = Object.assign(element('diagram-title-input', '', title), {
    value: '', hidden: true,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  });
  stage.insertAdjacentHTML = () => {};
  const root = element('diagram-root', 'diagram-root', stage);
  root.dataset.nodeKey = 'root';
  const node = element('diagram-node', 'diagram-node', root);
  const controls = element('diagram-controls', 'diagram-controls', root);
  const tool = element('diagram-tool', 'diagram-tool', controls);
  const more = element('diagram-more', 'diagram-handle diagram-handle-more', controls);
  const widthHandle = element('diagram-width', 'diagram-handle diagram-handle-arrows', controls);
  const menu = element('diagram-menu', 'diagram-menu diagram-popover', root);
  const menuItem = element('diagram-menu-item', 'diagram-menu-item', menu);
  const checkbox = element('diagram-checkbox', 'diagram-task-checkbox', node);
  const checkboxTool = element('diagram-checkbox-tool', '', menu);
  const checkboxMenu = element('diagram-checkbox-menu', 'diagram-checkbox-menu', menu);
  const checkboxOptions = Object.fromEntries(['none', 'toggle', 'unchecked', 'checked'].map((state) => {
    const option = element(`diagram-checkbox-${state}`, '', checkboxMenu);
    option.dataset.state = state;
    return [state, option];
  }));
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
      const view = value ? JSON.parse(value) : {};
      if (view.template === 'diagram-node') field.value = view.name;
    },
  });
  const context = vm.createContext({
    URL, location, history,
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
    toast: () => {},
    renderTemplate: (template, values) => JSON.stringify({ template, ...values }),
    setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(fs.readFileSync('view/home/diagram-node-tools.js', 'utf8'), context);
  const HomePage = vm.runInContext(fs.readFileSync('view/home/home.js', 'utf8') + '\nHomePage;', context);
  const home = new HomePage();
  if (draft) {
    home.draft = { client_key: 'b15dcc74-7f1a-4d39-974e-ab2828e3e72f' };
    home.diagramTitle = 'Nuevo diagrama';
  }
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
    checkbox, checkboxTool, checkboxMenu, checkboxOptions,
    change: (target) => dispatch('change', target),
    home, state, timers, stage, field, root, node, controls, tool, more, widthHandle, menu, menuItem, outside, document, windowListeners, location, navigations, title, titleLabel, titleInput,
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
    typeName(value, target = field) {
      target.value = value;
      documentListeners.get('input')({ target });
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

test('leaving the editor saves its node text without renaming the diagram', async () => {
  const { home, field, controls, doubleClick, typeName } = savedEditor();
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    assert.equal(data.id, 51);
    assert.equal(data.version, 1);
    assert.equal(data.name, 'Idea guardada');
    assert.equal(data.nodes[0].text, 'Nombre editado\nSegunda línea');
    return { id: 51, name: data.name, version: 2 };
  };
  doubleClick();
  typeName('Nombre editado\nSegunda línea');
  field.blur();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(home.active.nodes[0].text, 'Nombre editado\nSegunda línea');
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
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(home.active.nodes[0].text, 'Texto conservado al salir');
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
  assert.equal(requests[0].name, 'Nuevo diagrama');
  assert.equal(requests[0].nodes[0].text, 'Primera línea\nSegunda línea');
  await new Promise(setImmediate);
  assert.equal(home.active.name, 'Nuevo diagrama');
  assert.equal(home.active.nodes[0].text, 'Primera línea\nSegunda línea');
});

test('saved multiline node text preserves leading, internal and trailing line breaks after reload', async () => {
  const { home, state, timers, windowListeners } = editor();
  const name = '\nMi plan\nSegunda idea\n';
  home.name = name;
  home.makeRequest = async (action, data) => {
    assert.equal(data.name, 'Nuevo diagrama');
    assert.equal(data.nodes[0].text, name);
    return { id: 32, name: data.name, version: 1 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, 'Nuevo diagrama');
  assert.equal(state.data.diagrams[0].nodes[0].text, name);
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
    assert.equal(data.name, 'Idea guardada');
    assert.equal(data.nodes[0].text, 'Idea guardada\n');
    return { id: 33, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(requests, 1);
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(home.active.nodes[0].text, 'Idea guardada\n');
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

test('typing while the initial creation is pending saves new node text afterward', async () => {
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
    assert.equal(data.name, 'Nuevo diagrama');
    assert.equal(data.nodes[0].text, 'Mi plan de hoy');
    return { id: 22, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, 'Nuevo diagrama');
  assert.equal(state.data.diagrams[0].nodes[0].text, 'Mi plan de hoy');
  assert.equal(timers.size, 0);
});

test('repeated clicks during creation are ignored, and a later click creates a separate diagram', async () => {
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
  const second = home.handleAction('create-diagram');
  await new Promise(setImmediate);
  assert.equal(requests, 2);
  assert.notEqual(home.draft.client_key, key);
  finish({ id: 24, name: 'Nuevo diagrama', version: 1 });
  await second;
  assert.equal(state.data.diagrams.length, 2);
  assert.equal(home.active.id, 24);
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

test('typing during a save queues the latest node text with the returned version', async () => {
  const { home, state, timers } = editor();
  let finish;
  home.name = 'First name';
  home.makeRequest = () => new Promise((resolve) => { finish = resolve; });
  const pending = home.save();
  home.name = 'Newest name';
  finish({ id: 1, name: 'Nuevo diagrama', version: 1 });
  await pending;
  assert.equal(home.name, 'Newest name');
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(action, 'saveDiagram');
    assert.equal(data.id, 1);
    assert.equal(data.version, 1);
    assert.equal(data.name, 'Nuevo diagrama');
    assert.equal(data.nodes[0].text, 'Newest name');
    return { id: 1, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(state.data.diagrams[0].name, 'Nuevo diagrama');
  assert.equal(state.data.diagrams[0].nodes[0].text, 'Newest name');
  assert.equal(state.data.diagrams.length, 1);
  assert.equal(timers.size, 0);
});

test('a lost create response can be retried without losing a later edit', async () => {
  const { home, timers } = editor();
  home.name = 'Original';
  const key = home.draft.client_key;
  const originallySavedNodes = JSON.parse(JSON.stringify(home.snapshot()));
  home.makeRequest = async () => { throw new Error('Connection lost'); };
  await home.save();
  assert.equal(home.draft.client_key, key);
  assert.equal(home.error, 'Connection lost');
  home.name = 'Edited while offline';
  home.makeRequest = async (action, data) => {
    assert.equal(data.client_key, key);
    return { id: 7, name: 'Nuevo diagrama', nodes: originallySavedNodes, version: 1 };
  };
  await home.save();
  assert.equal(home.active.id, 7);
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    assert.equal(data.id, 7);
    assert.equal(data.name, 'Nuevo diagrama');
    assert.equal(data.nodes[0].text, 'Edited while offline');
    return { id: 7, name: data.name, version: 2 };
  };
  await home.save();
  assert.equal(home.active.name, 'Nuevo diagrama');
  assert.equal(home.active.nodes[0].text, 'Edited while offline');
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
  home.diagramTitle = 'Saved';
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
  assert.equal(child.text, '');
  assert.equal(snapshot, undefined, 'a blank child is not sent to the database');
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
  home.name = 'Idea hija';
  await home.save();
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
  home.name = 'Idea hija';
  await home.save();
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

test('resizing one selected node accounts for zoom, preserves its branch, and persists after reload', async () => {
  const { home, state, branch, click, pointer } = branchDragEditor();
  home.viewport.scale = 2;
  const otherNodes = JSON.parse(JSON.stringify(home.nodes.filter((node) => node.id !== 'branch')));
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
  };
  click(branch.node);
  pointer('pointerdown', branch.widthHandle);
  pointer('pointermove', branch.widthHandle, { clientX: 180, clientY: 160 });
  assert.equal(home.nodes.find((node) => node.id === 'branch').width, 260);
  assert.equal(home.nodes.find((node) => node.id === 'branch').x, 100);
  assert.equal(home.nodes.find((node) => node.id === 'branch').y, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.filter((node) => node.id !== 'branch'))), otherNodes);
  assert.equal(branch.root.classList.contains('is-resizing'), true);
  assert.equal(home.drag, null, 'the width handle must not start moving the node');
  assert.equal(home.viewport.options.canInteract(), false, 'camera gestures wait for the resize to finish');
  assert.equal(home.isEditing(), true, 'polling cannot replace the node during a resize');
  assert.equal(branch.field.readOnly, true);
  assert.equal(requests, 0, 'pointer moves do not save on every frame');
  pointer('pointerup', branch.widthHandle);
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(home.resizing, null);
  assert.equal(home.selectedKey, 'branch');
  assert.equal(home.selected, true);
  assert.equal(branch.root.classList.contains('is-resizing'), false);
  assert.equal(branch.widthHandle.hasPointerCapture(1), false);
  assert.equal(branch.root.hasPointerCapture(1), false);
  assert.equal(home.hasChanges(), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes.find((node) => node.id === 'branch').width, 260);
});

test('width resize clamps to readable limits and ignores unrelated pointers', async () => {
  const { home, widthHandle, click, pointer } = savedEditor();
  home.positionTree = () => {};
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
  };
  click();
  pointer('pointerdown', widthHandle);
  pointer('pointermove', widthHandle, { pointerId: 2, clientX: 2000 });
  assert.equal(home.nodes[0].width ?? null, null);
  pointer('pointermove', widthHandle, { clientX: -2000 });
  assert.equal(home.nodes[0].width, 100);
  pointer('pointermove', widthHandle, { clientX: 2000 });
  assert.equal(home.nodes[0].width, 600);
  pointer('pointerup', widthHandle, { pointerId: 2 });
  assert.notEqual(home.resizing, null);
  assert.equal(requests, 0);
  pointer('pointerup', widthHandle);
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(home.active.nodes[0].width, 600);
});

test('width controls require selection and do not compete with editing, layout, or camera gestures', () => {
  const { home, widthHandle, click, pointer } = savedEditor();
  home.makeRequest = () => { throw new Error('Unavailable resizing must not save'); };
  pointer('pointerdown', widthHandle);
  assert.equal(home.resizing, null);
  click();
  for (const [object, field] of [[home, 'editing'], [home, 'layoutOpen'], [home.viewport, 'interacting']]) {
    object[field] = true;
    pointer('pointerdown', widthHandle);
    assert.equal(home.resizing, null, field);
    object[field] = false;
  }
  home.drag = { key: 'root' };
  pointer('pointerdown', widthHandle);
  assert.equal(home.resizing, null, 'node drag');
  home.drag = null;
  pointer('pointerdown', widthHandle, { button: 2 });
  assert.equal(home.resizing, null);
  pointer('pointerdown', widthHandle, { isPrimary: false });
  assert.equal(home.resizing, null);
});

test('clicking the width handle without changing its width does not save', async () => {
  const { home, widthHandle, click, pointer } = savedEditor();
  home.positionTree = () => {};
  home.makeRequest = () => { throw new Error('An unchanged width must not save'); };
  click();
  pointer('pointerdown', widthHandle);
  pointer('pointermove', widthHandle, { clientY: 180 });
  pointer('pointerup', widthHandle);
  await new Promise(setImmediate);
  assert.equal(home.resizing, null);
  assert.equal(home.hasChanges(), false);
});

test('width handle keyboard controls resize in steps and retain the selected node', async () => {
  const { home, widthHandle, handleKey, click } = savedEditor();
  let requests = 0;
  home.makeRequest = async (action, data) => {
    requests++;
    return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
  };
  click();
  for (const [key, shiftKey, expected] of [
    ['ArrowRight', false, 230], ['ArrowLeft', true, 180], ['Home', false, 100], ['End', false, 600],
  ]) {
    const event = handleKey(key, widthHandle, { shiftKey });
    await new Promise(setImmediate);
    assert.equal(event.prevented, true, key);
    assert.equal(home.active.nodes[0].width, expected, key);
    assert.equal(home.selectedKey, 'root', key);
    assert.equal(home.selected, true, key);
  }
  assert.equal(requests, 4);
  handleKey('ArrowRight');
  await new Promise(setImmediate);
  assert.equal(requests, 4, 'the upper boundary is already reached');
});

test('pointer cancellation and focus loss finish width resizing and save once', async () => {
  for (const ending of ['pointercancel', 'lostpointercapture', 'blur']) {
    const { home, root, widthHandle, click, pointer, windowListeners } = savedEditor();
    home.positionTree = () => {};
    let requests = 0;
    home.makeRequest = async (action, data) => {
      requests++;
      return { id: data.id, name: data.name, nodes: JSON.parse(JSON.stringify(data.nodes)), version: data.version + 1 };
    };
    click();
    pointer('pointerdown', widthHandle);
    pointer('pointermove', widthHandle, { clientX: 160 });
    if (ending === 'blur') windowListeners.get('blur')();
    else pointer(ending, widthHandle);
    pointer('pointerup', widthHandle);
    await new Promise(setImmediate);
    assert.equal(home.resizing, null, ending);
    assert.equal(root.classList.contains('is-resizing'), false, ending);
    assert.equal(root.hasPointerCapture(1), false, ending);
    assert.equal(widthHandle.hasPointerCapture(1), false, ending);
    assert.equal(requests, 1, ending);
    assert.equal(home.active.nodes[0].width, 280, ending);
  }
});

test('account reset cancels unfinished width resizing without saving to another account', () => {
  const { home, root, widthHandle, click, pointer } = savedEditor();
  home.positionTree = () => {};
  home.makeRequest = () => { throw new Error('Account reset must not save an unfinished resize'); };
  click();
  pointer('pointerdown', widthHandle);
  pointer('pointermove', widthHandle, { clientX: 160 });
  home.reset();
  pointer('pointerup', widthHandle);
  assert.equal(home.resizing, null);
  assert.equal(root.classList.contains('is-resizing'), false);
  assert.equal(root.hasPointerCapture(1), false);
  assert.equal(widthHandle.hasPointerCapture(1), false);
  assert.equal(home.active, null);
});

test('changing a branch or entire diagram layout preserves each individual node width', async () => {
  const { home, state } = branchDragEditor();
  home.nodes.forEach((node, index) => { node.width = index === 0 ? null : 100 + index * 70; });
  home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
  const widths = home.nodes.map(({ id, width }) => ({ id, width }));
  const layout = { mode: 'matrix', direction: 'auto', vertical: 'bottom', horizontal: 'rtl' };
  for (const scope of ['branch', 'diagram']) {
    home.applyLayout('branch', layout, scope);
    await new Promise(setImmediate);
    assert.deepEqual(home.nodes.map(({ id, width }) => ({ id, width })), widths);
    assert.equal(home.hasChanges(), false);
  }
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes.map(({ id, width }) => ({ id, width })))), widths);
});

function blankChildEditor() {
  const fixture = savedEditor();
  const fields = new Map();
  const draw = fixture.home.drawStage.bind(fixture.home);
  fixture.home.drawStage = () => {
    for (const node of fixture.home.ensureTree()) {
      if (node.id !== 'root' && !fields.has(node.id)) fields.set(node.id, fixture.addNodeElement(node.id, node.text));
    }
    draw();
  };
  return { ...fixture, fields };
}

test('a new child is empty, focused and editable, then Enter saves only its typed text', async () => {
  const { home, fields, document, typeName, handleKey } = blankChildEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { id: data.id, name: data.name, nodes: data.nodes, version: data.version + 1 };
  };
  await home.addChild();
  const key = home.selectedKey;
  const child = fields.get(key);
  assert.equal(document.activeElement, child.field);
  assert.equal(child.field.value, '');
  assert.equal(child.field.readOnly, false);
  assert.equal(child.field.selectionStart, 0);
  assert.equal(child.field.selectionEnd, 0);
  assert.equal(JSON.parse(home.nodeContent(home.nodes.find((n) => n.id === key))).placeholder, '');
  assert.equal(requests.length, 0);
  assert.equal(home.error, '');
  typeName('Mi idea\nCon detalle', child.field);
  handleKey('Enter', child.field);
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].nodes.find((n) => n.id === key).text, 'Mi idea\nCon detalle');
  assert.equal(home.childDrafts.has(key), false);
  assert.equal(home.editing, false);
  assert.equal(home.hasChanges(), false);
});

test('leaving an empty new child removes only the draft and saves other node changes', async () => {
  const { home, fields } = blankChildEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { id: data.id, name: data.name, nodes: data.nodes, version: data.version + 1 };
  };
  await home.addChild();
  const key = home.selectedKey;
  home.nodes[0].width = 270;
  fields.get(key).field.blur();
  await new Promise(setImmediate);
  assert.equal(home.nodes.length, 1);
  assert.equal(home.nodes[0].width, 270);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].nodes.length, 1);
  assert.equal(home.selectedKey, 'root');
  assert.equal(home.error, '');
});

test('Escape cancels an unsent named child and an empty draft cannot own another child', async () => {
  const { home, fields, typeName, handleKey } = blankChildEditor();
  home.makeRequest = () => { throw new Error('Unsent drafts must not save'); };
  await home.addChild();
  const key = home.selectedKey;
  await home.addChild();
  assert.equal(home.nodes.length, 2);
  assert.equal(home.selectedKey, key);
  typeName('Todavía sin guardar', fields.get(key).field);
  handleKey('Escape', fields.get(key).field);
  await new Promise(setImmediate);
  assert.equal(home.nodes.length, 1);
  assert.equal(home.selectedKey, 'root');
  assert.equal(home.nodes[0].text, 'Idea guardada');
  assert.equal(home.hasChanges(), false);
});

test('a blank child does not block an unrelated pending save or later queued changes', async () => {
  const { home, fields } = blankChildEditor();
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => {
    const copy = JSON.parse(JSON.stringify(data));
    finish = () => resolve({ id: copy.id, name: copy.name, nodes: copy.nodes, version: copy.version + 1 });
  });
  home.name = 'Nombre actualizado';
  const pending = home.save();
  await home.addChild();
  const key = home.selectedKey;
  home.nodes[0].width = 310;
  finish();
  await pending;
  assert.equal(home.childDrafts.has(key), true);
  assert.equal(fields.get(key).field.readOnly, false);
  let sent;
  home.makeRequest = async (action, data) => {
    sent = JSON.parse(JSON.stringify(data));
    return { id: data.id, name: data.name, nodes: data.nodes, version: data.version + 1 };
  };
  await home.save();
  assert.equal(sent.nodes.length, 1);
  assert.equal(sent.nodes[0].width, 310);
  assert.equal(home.nodes.length, 2);
  assert.equal(home.error, '');
});

test('Escape never discards a child once its creation request has been submitted', async () => {
  const { home, fields, typeName, handleKey } = blankChildEditor();
  await home.addChild();
  const key = home.selectedKey;
  const field = fields.get(key).field;
  typeName('Idea enviada', field);
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => {
    const copy = JSON.parse(JSON.stringify(data));
    finish = () => resolve({ id: copy.id, name: copy.name, nodes: copy.nodes, version: copy.version + 1 });
  });
  const pending = home.save();
  handleKey('Escape', field);
  assert.ok(home.nodes.some((n) => n.id === key));
  finish();
  await pending;
  typeName('Cambio posterior', field);
  handleKey('Escape', field);
  assert.equal(home.nodes.find((n) => n.id === key).text, 'Idea enviada');
  assert.equal(home.childDrafts.has(key), false);
  assert.equal(home.hasChanges(), false);
});


test('the URL selects an older diagram and reload keeps its own complete tree', () => {
  const state = { user: { name: 'Aleina' }, data: { diagrams: [
    { id: 52, name: 'Reciente', version: 1 },
    { id: 51, name: 'Elegido', version: 3, nodes: [
      { id: 'root', parent_id: null, text: 'Elegido', width: 310 },
      { id: 'child', parent_id: 'root', text: 'Idea hija', width: 140 },
    ] },
  ] } };
  const { home, location } = editor({ draft: false, state, url: 'http://localhost/MyRemarkableMind/?diagram=51' });
  home.render();
  assert.equal(home.active.id, 51);
  assert.equal(home.nodes.length, 2);
  assert.equal(home.nodes[1].width, 140);
  assert.equal(new URL(location.href).searchParams.get('diagram'), '51');
  const toolbar = JSON.parse(home.toolbarContent());
  assert.match(toolbar.options, /value="51" selected/);
  assert.match(toolbar.options, /value="52"/);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)), url: location.href });
  restored.home.render();
  assert.equal(restored.home.active.id, 51);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes)), state.data.diagrams[1].nodes);
});

test('unknown or inaccessible diagram URLs fall back to an owned diagram', async () => {
  const state = { user: { name: 'Aleina' }, data: { diagrams: [{ id: 51, name: 'Privado', version: 1 }] } };
  const { home, location, navigations } = editor({ draft: false, state, url: 'http://localhost/?diagram=999' });
  home.render();
  assert.equal(home.active.id, 51);
  assert.equal(new URL(location.href).searchParams.get('diagram'), '51');
  await home.openDiagram('999');
  assert.equal(navigations.length, 0);
});

test('selecting another diagram triggers document navigation and preserves the installation path', async () => {
  const { home, state, navigations, windowListeners } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  home.makeRequest = () => { throw new Error('No changes to save'); };
  await home.openDiagram('52');
  assert.deepEqual(navigations, ['http://localhost/MyRemarkableMind/?diagram=52']);
  assert.equal(home.active.id, 51, 'the current tree is replaced only by the new document');
  const event = { preventDefault() { this.prevented = true; } };
  windowListeners.get('beforeunload')(event);
  assert.equal(event.prevented, undefined);
});

test('switching waits for a pending save and flushes edits made during that request', async () => {
  const { home, state, navigations } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  const requests = [];
  const resolvers = [];
  home.makeRequest = (action, data) => new Promise((resolve) => {
    const snapshot = JSON.parse(JSON.stringify(data));
    requests.push(snapshot);
    resolvers.push(() => resolve({ ...snapshot, version: snapshot.version + 1 }));
  });
  home.name = 'Primera edición';
  const save = home.save();
  home.name = 'Edición más reciente';
  const switching = home.openDiagram('52');
  await home.openDiagram('51');
  assert.equal(navigations.length, 0);
  assert.equal(requests.length, 1);
  resolvers[0]();
  await save;
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].version, 2);
  assert.equal(requests[1].nodes[0].text, 'Edición más reciente');
  assert.equal(navigations.length, 0);
  resolvers[1]();
  await switching;
  assert.equal(navigations.length, 1);
  assert.equal(home.hasChanges(), false);
});

test('a failed save prevents both switching and creating until it can be saved', async () => {
  const { home, state, navigations } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  home.name = 'Cambio pendiente';
  home.makeRequest = async () => { throw new Error('Connection lost'); };
  await home.openDiagram('52');
  await home.handleAction('create-diagram');
  assert.equal(navigations.length, 0);
  assert.equal(home.active.id, 51);
  assert.equal(home.name, 'Cambio pendiente');
  assert.equal(state.data.diagrams.length, 2);
  assert.equal(home.switching, false);
  home.makeRequest = async (action, data) => ({ ...data, version: data.version + 1 });
  await home.openDiagram('52');
  assert.equal(navigations.length, 1);
});

test('empty text in a saved node blocks navigation without losing the current edit', async () => {
  const { home, state, navigations } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  home.name = '   ';
  home.makeRequest = () => { throw new Error('Invalid edits must not be submitted'); };
  await home.openDiagram('52');
  assert.equal(navigations.length, 0);
  assert.equal(home.active.id, 51);
  assert.equal(home.error, 'diagram_name_required');
});

test('switching cannot navigate after the account is reset during a save', async () => {
  const { home, state, navigations } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => { finish = () => resolve({ ...data, version: data.version + 1 }); });
  home.name = 'Pendiente';
  const switching = home.openDiagram('52');
  home.reset();
  finish();
  await switching;
  assert.equal(navigations.length, 0);
  assert.equal(home.active, null);
});

test('creating many diagrams preserves every earlier tree and starts with a clean canvas', async () => {
  const { home, state, location } = savedEditor();
  const original = JSON.parse(JSON.stringify(state.data.diagrams[0]));
  const keys = new Set();
  home.makeRequest = async (action, data) => {
    assert.equal(data.id, undefined);
    assert.equal(data.nodes.length, 1);
    assert.equal(data.nodes[0].parent_id, null);
    assert.equal(keys.has(data.client_key), false);
    keys.add(data.client_key);
    return { id: 51 + keys.size, name: data.name, nodes: data.nodes, version: 1 };
  };
  for (let i = 0; i < 12; i++) {
    home.viewport.x = 150;
    home.viewport.scale = 2;
    await home.handleAction('create-diagram');
    assert.equal(home.viewport.x, 0);
    assert.equal(home.viewport.scale, 1);
    assert.equal(new URL(location.href).searchParams.get('diagram'), String(home.active.id));
  }
  assert.equal(state.data.diagrams.length, 13);
  assert.deepEqual(state.data.diagrams.find((d) => d.id === 51), original);
});

function titledEditor() {
  const fixture = editor({ draft: false, state: {
    user: { name: 'Aleina' }, data: { diagrams: [{
      id: 51, name: 'Mi proyecto', version: 1,
      nodes: [{ id: 'root', parent_id: null, text: 'Idea central', layout: null, x: null, y: null, width: 310 }],
    }] },
  } });
  fixture.home.render();
  fixture.home.drawStage();
  return fixture;
}

test('the diagram title uses a separate editor opened by double click with the caret at the end', () => {
  const { home, titleLabel, titleInput, field, click, doubleClick, document } = titledEditor();
  home.makeRequest = () => { throw new Error('Opening the title editor must not save'); };
  assert.equal(home.diagramTitle, 'Mi proyecto');
  assert.equal(home.name, 'Idea central');
  assert.equal(titleLabel.textContent, 'Mi proyecto');
  assert.equal(titleInput.hidden, true);
  click(titleLabel);
  assert.equal(titleInput.hidden, true);
  doubleClick(titleLabel);
  assert.equal(titleInput.hidden, false);
  assert.equal(titleLabel.hidden, true);
  assert.equal(document.activeElement, titleInput);
  assert.equal(titleInput.value, 'Mi proyecto');
  assert.equal(titleInput.selectionStart, titleInput.value.length);
  assert.equal(titleInput.selectionEnd, titleInput.value.length);
  assert.equal(field.readOnly, true);
  assert.equal(home.editing, false);
});

test('Enter saves a trimmed diagram title independently of its root text and reload restores both', async () => {
  const { home, state, titleLabel, titleInput, doubleClick, handleKey } = titledEditor();
  const originalNodes = JSON.parse(JSON.stringify(home.nodes));
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...data, version: data.version + 1 };
  };
  doubleClick(titleLabel);
  titleInput.value = '  Mi nuevo proyecto  ';
  assert.equal(handleKey('Enter', titleInput).prevented, true);
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, 'Mi nuevo proyecto');
  assert.deepEqual(requests[0].nodes, originalNodes);
  assert.equal(home.active.name, 'Mi nuevo proyecto');
  assert.equal(home.active.nodes[0].text, 'Idea central');
  assert.equal(home.name, 'Idea central');
  assert.equal(titleInput.hidden, true);
  assert.equal(titleLabel.hidden, false);
  assert.equal(titleLabel.textContent, 'Mi nuevo proyecto');
  assert.equal(home.hasChanges(), false);

  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  const page = JSON.parse(restored.home.render());
  restored.home.drawStage();
  assert.equal(JSON.parse(page.content).name, 'Idea central');
  assert.equal(page.title, undefined, 'the canvas does not repeat the diagram title');
  assert.match(JSON.parse(page.diagramToolbar).options, /Mi nuevo proyecto/);
  assert.equal(restored.home.diagramTitle, 'Mi nuevo proyecto');
  assert.equal(restored.titleLabel.textContent, 'Mi nuevo proyecto');
  assert.equal(restored.field.value, 'Idea central');
});

test('Enter and F2 open the title editor, and blur saves changes only once', async () => {
  const { home, titleLabel, titleInput, handleKey, outside } = titledEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...data, version: data.version + 1 };
  };
  titleLabel.focus();
  assert.equal(handleKey('Enter', titleLabel).prevented, true);
  assert.equal(titleInput.hidden, false);
  outside.focus();
  await new Promise(setImmediate);
  assert.equal(requests.length, 0);
  assert.equal(handleKey('F2', titleLabel).prevented, true);
  titleInput.value = 'Título al salir';
  outside.focus();
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, 'Título al salir');
  assert.equal(requests[0].nodes[0].text, 'Idea central');
  assert.equal(home.hasChanges(), false);
});

test('Escape and an empty title restore the previous title without changing saved content', async () => {
  const { home, titleLabel, titleInput, doubleClick, handleKey, document } = titledEditor();
  home.makeRequest = () => { throw new Error('Cancelled or empty titles must not save'); };
  for (const [value, key] of [['No guardar', 'Escape'], [' \t ', 'Enter']]) {
    doubleClick(titleLabel);
    titleInput.value = value;
    assert.equal(handleKey(key, titleInput).prevented, true);
    await new Promise(setImmediate);
    assert.equal(home.diagramTitle, 'Mi proyecto');
    assert.equal(home.active.name, 'Mi proyecto');
    assert.equal(home.name, 'Idea central');
    assert.equal(titleInput.hidden, true);
    assert.equal(titleLabel.textContent, 'Mi proyecto');
    assert.equal(document.activeElement, titleLabel);
    assert.equal(home.hasChanges(), false);
  }
});

test('renaming a title during an earlier save queues the newest title with the returned version', async () => {
  const { home, titleLabel, titleInput, doubleClick, handleKey, timers } = titledEditor();
  const requests = [];
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => {
    const copy = JSON.parse(JSON.stringify(data));
    requests.push(copy);
    finish = () => resolve({ ...copy, version: copy.version + 1 });
  });
  doubleClick(titleLabel);
  titleInput.value = 'Primer título';
  handleKey('Enter', titleInput);
  const pending = home.savePromise;
  doubleClick(titleLabel);
  titleInput.value = 'Título más reciente';
  handleKey('Enter', titleInput);
  assert.equal(requests.length, 1);
  finish();
  await pending;
  assert.equal(home.diagramTitle, 'Título más reciente');
  assert.equal(home.active.name, 'Primer título');
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...data, version: data.version + 1 };
  };
  await home.save();
  assert.equal(requests[1].name, 'Título más reciente');
  assert.equal(requests[1].version, 2);
  assert.equal(requests[1].nodes[0].text, 'Idea central');
  assert.equal(home.active.name, 'Título más reciente');
  assert.equal(home.hasChanges(), false);
});

test('account reset clears title editing and a late title response cannot restore private state', async () => {
  const { home, state, titleLabel, titleInput, doubleClick, handleKey } = titledEditor();
  let finish;
  home.makeRequest = (action, data) => new Promise((resolve) => {
    finish = () => resolve({ ...data, version: data.version + 1 });
  });
  doubleClick(titleLabel);
  titleInput.value = 'Título privado';
  handleKey('Enter', titleInput);
  const pending = home.savePromise;
  doubleClick(titleLabel);
  assert.equal(titleInput.hidden, false);
  home.reset();
  state.data.diagrams = [];
  finish();
  await pending;
  assert.equal(home.active, null);
  assert.equal(home.diagramTitle, '');
  assert.equal(home.titleEditing, false);
  assert.equal(home.name, '');
  assert.equal(state.data.diagrams.length, 0);
});

test('switching diagrams commits an active title edit before navigating', async () => {
  const { home, state, titleLabel, titleInput, doubleClick, navigations } = titledEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...data, version: data.version + 1 };
  };
  doubleClick(titleLabel);
  titleInput.value = 'Título antes de salir';
  await home.openDiagram('52');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, 'Título antes de salir');
  assert.equal(requests[0].nodes[0].text, 'Idea central');
  assert.equal(navigations.length, 1);
  assert.equal(home.hasChanges(), false);
});

test('checkbox submenu reflects all three states, supports Escape and saves only the chosen state', async () => {
  const { home, checkbox, checkboxTool, checkboxMenu, checkboxOptions, document, pressKey, state } = savedEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...data, version: data.version + 1 };
  };
  await home.handleAction('toggle-diagram-menu');
  await home.handleAction('diagram-checkbox-menu');
  assert.equal(checkboxMenu.hidden, false);
  assert.equal(checkboxOptions.none.getAttribute('aria-checked'), 'true');
  assert.equal(checkboxOptions.toggle.disabled, true);
  assert.equal(checkbox.hidden, true);
  assert.equal(requests.length, 0);
  pressKey('ArrowDown', { target: checkboxOptions.none });
  assert.equal(document.activeElement, checkboxOptions.unchecked, 'keyboard skips disabled toggle');
  pressKey('Escape', { target: checkboxOptions.unchecked });
  assert.equal(home.menuOpen, true);
  assert.equal(checkboxMenu.hidden, true);
  assert.equal(document.activeElement, checkboxTool);
  for (const [option, value] of [['unchecked', false], ['checked', true], ['toggle', false], ['none', null]]) {
    await home.handleAction('diagram-checkbox-menu');
    await home.handleAction('diagram-checkbox-state', checkboxOptions[option]);
    assert.equal(home.nodes[0].checkbox, value);
    assert.equal(home.active.nodes[0].checkbox, value);
    assert.equal(checkbox.hidden, value === null);
    assert.equal(checkbox.checked, value === true);
    assert.equal(home.menuOpen, false);
    assert.equal(home.hasChanges(), false);
    const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
    restored.home.render();
    restored.home.drawStage();
    assert.equal(restored.home.nodes[0].checkbox, value);
    assert.equal(restored.checkbox.hidden, value === null);
    assert.equal(restored.checkbox.checked, value === true);
  }
  assert.equal(requests.length, 4);
});

test('direct checkbox changes survive selection and do not start dragging or text editing', async () => {
  const { home, checkbox, node, change, click, doubleClick, pointer } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...data, version: data.version + 1 });
  await home.setCheckbox(false);
  home.selected = false;
  checkbox.checked = true;
  change(checkbox);
  await home.save();
  assert.equal(home.active.nodes[0].checkbox, true);
  assert.equal(checkbox.checked, true);
  assert.equal(node.getAttribute('role'), 'group');
  pointer('pointerdown', checkbox);
  pointer('pointermove', checkbox, { clientX: 200 });
  assert.equal(home.drag, null);
  click(checkbox);
  doubleClick(checkbox);
  assert.equal(home.editing, false);
  checkbox.checked = false;
  change(checkbox);
  await home.save();
  assert.equal(home.active.nodes[0].checkbox, false);
});

test('rapid checkbox changes queue the latest state and preserve sibling task states', async () => {
  const { home, timers } = savedEditor();
  home.nodes.push({ id: 'child', parent_id: 'root', text: 'Child', checkbox: false });
  home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
  let finish;
  const requests = [];
  home.makeRequest = (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return new Promise((resolve) => { finish = resolve; });
  };
  const pending = home.setCheckbox(true);
  home.setCheckbox(false);
  finish({ ...requests[0], version: 2 });
  await pending;
  assert.equal(home.nodes[0].checkbox, false);
  assert.equal(home.nodes[1].checkbox, false);
  assert.equal(timers.size, 1);
  home.makeRequest = async (action, data) => ({ ...data, version: data.version + 1 });
  await home.save();
  assert.equal(home.active.nodes[0].checkbox, false);
  assert.equal(home.active.nodes[1].checkbox, false);
  assert.equal(home.active.version, 3);
  assert.equal(home.hasChanges(), false);
});
