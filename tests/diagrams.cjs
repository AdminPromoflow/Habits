const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const { test } = require('node:test');

test('topic links are included in dirty detection, saved snapshots and their visible open button', async () => {
  const { home } = savedEditor();
  home.nodes[0].link = { diagram_id: 52, node_id: 'root' };
  assert.equal(home.hasChanges(), true);
  assert.match(JSON.parse(home.nodeContent(home.nodes[0])).topicLink, /data-action="open-diagram-link"/);
  let sent;
  home.makeRequest = async (action, data) => { sent = data; return { ...data, version: 2 }; };
  await home.save();
  assert.equal(sent.nodes[0].link.diagram_id, 52);
  assert.equal(home.hasChanges(), false);
  home.nodes[0].link = null;
  assert.equal(home.hasChanges(), true);
  assert.equal(JSON.parse(home.nodeContent(home.nodes[0])).topicLink, '');
});

test('whole-diagram sources keep their arrow and describe the diagram instead of an unavailable topic', () => {
  const { home, state } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Destination diagram', nodes: [{ id: 'root', text: 'Specific topic' }] });
  home.nodes[0].link = { diagram_id: 52, node_id: null };
  const wholeBadge = home.links.badge(home.nodes[0]);
  assert.match(wholeBadge, /data-action="open-diagram-link"/);
  assert.match(wholeBadge, /Destination diagram/);
  assert.match(wholeBadge, /diagram_link_whole/);
  assert.doesNotMatch(wholeBadge, /diagram_link_unavailable/);
  home.nodes[0].link.node_id = 'root';
  const badge = home.links.badge(home.nodes[0]);
  assert.match(badge, /→/);
  assert.match(badge, /Destination diagram/);
  assert.match(badge, /Specific topic/);
  assert.doesNotMatch(badge, /<svg/);
});

test('links navigate to a topic or the overview with the source saved first', async () => {
  for (const nodeId of ['root', null]) {
    const { home, state, navigations } = savedEditor();
    const target = { id: 52, name: 'Target', version: 1, nodes: [{ id: 'root', parent_id: null, text: 'Target' }] };
    home.name = 'Pending source edit';
    const calls = [];
    home.makeRequest = async (action, data) => {
      calls.push(action);
      return action === 'saveDiagram' ? { ...data, version: data.version + 1 } : [...state.data.diagrams, target];
    };
    await home.links.follow({ diagram_id: 52, node_id: nodeId });
    assert.deepEqual(calls, ['saveDiagram', 'diagrams']);
    assert.equal(home.active.nodes[0].text, 'Pending source edit');
    assert.equal(new URL(navigations[0]).searchParams.get('topic'), nodeId || 'overview');
  }
});

test('same-diagram links focus and select the destination without a document navigation', async () => {
  const { home, node, navigations } = savedEditor();
  home.active.nodes = home.snapshot();
  home.makeRequest = async () => [JSON.parse(JSON.stringify(home.active))];
  await home.links.follow({ diagram_id: 51, node_id: 'root' });
  assert.equal(navigations.length, 0);
  assert.equal(home.viewport.focused, node);
  assert.equal(home.selected, true);
  await home.links.follow({ diagram_id: 51, node_id: null });
  assert.equal(home.viewport.focusOptions.overview, true);
  assert.equal(home.selected, false);
});

test('automatic return actions save pending edits and navigate to the original source topic', async () => {
  const { home, state, navigations } = savedEditor();
  const parent = { id: 52, name: 'Parent', version: 1,
    nodes: [{ id: 'root', parent_id: null, text: 'Original', link: { diagram_id: 51, node_id: 'root' } }] };
  state.data.diagrams.push(parent);
  assert.match(home.links.badge(home.nodes[0]), /data-action="open-diagram-return"/);
  home.name = 'Pending destination edit';
  const calls = [];
  home.makeRequest = async (action, data) => {
    calls.push(action);
    return action === 'saveDiagram' ? { ...data, version: data.version + 1 } : state.data.diagrams;
  };
  await home.handleAction('open-diagram-return', { dataset: { returnDiagram: '52', returnNode: 'root' } });
  assert.deepEqual(calls, ['saveDiagram', 'diagrams']);
  assert.equal(home.active.nodes[0].text, 'Pending destination edit');
  assert.equal(new URL(navigations[0]).searchParams.get('diagram'), '52');
  assert.equal(new URL(navigations[0]).searchParams.get('topic'), 'root');
});

test('missing link destinations and failed source saves do not navigate', async () => {
  for (const failSave of [false, true]) {
    const { home, navigations } = savedEditor();
    if (failSave) home.name = 'Unsaved';
    home.makeRequest = async () => { if (failSave) throw new Error('Offline'); return []; };
    await home.links.follow({ diagram_id: 52, node_id: 'root' });
    assert.equal(navigations.length, 0);
    assert.equal(home.active.id, 51);
    assert.equal(home.error, failSave ? 'Offline' : 'error_diagram_link_missing');
  }
});

test('edits made while resolving a link are saved before replacing the current tree', async () => {
  const { home, state, navigations } = savedEditor();
  home.active.nodes = home.snapshot();
  let resolveLookup;
  let lookups = 0;
  home.makeRequest = async (action, data) => {
    if (action === 'saveDiagram') return { ...data, version: data.version + 1 };
    if (++lookups === 1) return new Promise(resolve => { resolveLookup = resolve; });
    return JSON.parse(JSON.stringify(state.data.diagrams));
  };
  const following = home.links.follow({ diagram_id: 51, node_id: 'root' });
  await new Promise(setImmediate);
  home.name = 'Typed during destination lookup';
  resolveLookup(JSON.parse(JSON.stringify(state.data.diagrams)));
  await following;
  assert.equal(home.nodes[0].text, 'Typed during destination lookup');
  assert.equal(home.active.version, 2);
  assert.equal(lookups, 2);
  assert.equal(navigations.length, 0);
});

test('a linked arrival overrides the remembered camera once and clears its URL instruction', () => {
  const { home, location, node } = editor({ draft: false, url: 'http://localhost/?diagram=51&topic=root',
    state: { user: { name: 'Aleina' }, data: { diagrams: [{ id: 51, name: 'Target', version: 1 }] } } });
  home.render(); home.mount();
  assert.equal(home.viewport.focused, node);
  assert.equal(home.selectedKey, 'root');
  assert.equal(new URL(location.href).searchParams.has('topic'), false);
  home.viewport.focused = null; home.mount();
  assert.equal(home.viewport.focused, null);
});

test('preview includes every selectable topic and respects hidden connections', () => {
  const { home } = savedEditor();
  const diagram = { nodes: [{ id: 'root', parent_id: null, text: 'One' }, { id: 'child', parent_id: 'root', text: 'Two' }],
    hidden_connections: [{ from: 'root', to: 'child' }] };
  const preview = home.links.preview(diagram);
  assert.equal(preview.plan.nodes.length, 2);
  assert.match(preview.html, /data-link-target="child"/);
  assert.doesNotMatch(preview.html, /<path /);
});

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
    elementFromPoint: () => null,
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
          : selector === '[data-connection-action]' ? Object.hasOwn(this.dataset, 'connectionAction')
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
  const addHandle = element('diagram-add', 'diagram-handle diagram-handle-add', controls);
  const menu = element('diagram-menu', 'diagram-menu diagram-popover', root);
  const menuItem = element('diagram-menu-item', 'diagram-menu-item', menu);
  const checkbox = element('diagram-checkbox', 'diagram-task-checkbox', node);
  const checkboxTool = element('diagram-checkbox-tool', '', menu);
  const checkboxMenu = element('diagram-checkbox-menu', 'diagram-checkbox-menu', menu);
  function scopeInputs(menu, suffix = '') {
    return Object.fromEntries(['node', 'branch'].map((scope) => [scope, Object.assign(
      element(`diagram-checkbox-scope-${scope}${suffix}`, 'diagram-checkbox-scope-option', menu),
      { value: scope, checked: scope === 'node' },
    )]));
  }
  const checkboxScopes = scopeInputs(checkboxMenu);
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
      setPersistenceKey(key, options) { this.persistenceKey = key; this.persistenceOptions = options; }
      reveal(target) { this.revealed = target; }
      focusElement(target, options) { this.focused = target; this.focusOptions = options; return true; }
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
  vm.runInContext(fs.readFileSync('view/home/diagram-link-navigation.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-links.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-layout.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-alignment.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-routing.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-connections.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('view/home/diagram-history.js', 'utf8'), context);
  for (const file of ['sheet', 'editors', 'mindspace']) vm.runInContext(fs.readFileSync(`view/mindspace/${file}.js`, 'utf8'), context);
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
    checkbox, checkboxTool, checkboxMenu, checkboxOptions, checkboxScopes, addHandle,
    change: (target) => dispatch('change', target),
    home, state, timers, stage, field, root, node, controls, tool, more, widthHandle, menu, menuItem, outside, document, windowListeners, location, navigations, title, titleLabel, titleInput,
    addAlignmentLayer() {
      const scene = element('diagram-scene', 'diagram-scene', stage);
      return element('diagram-alignment-guides', 'diagram-alignment-guides', scene);
    },
    addConnectionElement(from, to) {
      const svg = document.getElementById('diagram-connections') || element('diagram-connections', 'diagram-connections', stage);
      const group = element(`connection-${from}-${to}`, 'diagram-connection', svg);
      group.dataset = { from, to };
      const hit = element(`hit-${from}-${to}`, 'diagram-connection-hit', group);
      svg.querySelectorAll = () => elements.filter(item => item.parentElement === svg);
      return { group, hit, svg };
    },
    addConnectionTools() {
      const tools = element('diagram-connection-tools', 'diagram-connection-tools', stage);
      const actions = Object.fromEntries(['menu', 'label', 'save-label', 'arrows-both', 'delete'].map(action => {
        const button = element(`connection-action-${action}`, '', tools);
        button.dataset.connectionAction = action;
        return [action, button];
      }));
      const input = element('diagram-connection-label-input', '', tools);
      input.value = '';
      return { tools, actions, input };
    },
    addPicker() {
      const picker = element('diagram-picker', 'diagram-picker');
      const trigger = element('diagram-select', '', picker);
      const menu = element('diagram-picker-options', '', picker);
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      const options = state.data.diagrams.map(diagram => {
        const option = element(`picker-option-${diagram.id}`, '', menu);
        option.dataset.id = String(diagram.id);
        option.setAttribute('aria-checked', String(diagram.id === home.active?.id));
        return option;
      });
      menu.querySelectorAll = () => options;
      return { picker, trigger, menu, options };
    },
    addNodeElement(id, value = '') {
      const root = element(`diagram-root-${id}`, 'diagram-root', stage);
      root.dataset.nodeKey = id;
      const node = element(`diagram-node-${id}`, 'diagram-node', root);
      const checkbox = element(`diagram-checkbox-${id}`, 'diagram-task-checkbox', node);
      const menu = element(`diagram-checkbox-menu-${id}`, 'diagram-checkbox-menu', root);
      const checkboxScopes = scopeInputs(menu, `-${id}`);
      const checkboxOptions = Object.fromEntries(['none', 'toggle', 'unchecked', 'checked'].map((state) => {
        const option = element(`diagram-checkbox-${state}-${id}`, '', menu);
        option.dataset.state = state;
        return [state, option];
      }));
      const controls = element(`diagram-controls-${id}`, 'diagram-controls', root);
      const widthHandle = element(`diagram-width-${id}`, 'diagram-handle diagram-handle-arrows', controls);
      const addHandle = element(`diagram-add-${id}`, 'diagram-handle diagram-handle-add', controls);
      const field = Object.assign(element(`diagram-name-${id}`, '', node), {
        value, readOnly: true, scrollHeight: 24,
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
      });
      return { root, node, field, widthHandle, checkbox, checkboxScopes, checkboxOptions, addHandle };
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
    releaseKey: (key, target = widthHandle) => dispatch('keyup', target, { key }),
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
  assert.equal(home.viewport.revealed, menu, 'opening the menu reveals clipped top-row tools');
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

test('blank node text and intentional line breaks are saved without changing the diagram title', async () => {
  const { home } = savedEditor();
  home.name = ' \n\t\n ';
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.save();
  assert.equal(home.error, '');
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(home.active.nodes[0].text, '\n\t\n');
  assert.equal(home.hasChanges(), false);
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

test('clearing a saved idea persists an empty string and Escape restores that empty text', async () => {
  const { home, doubleClick, typeName, pressKey } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  home.name = '  ';
  await home.save();
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(home.active.nodes[0].text, '');
  assert.equal(home.error, '');
  home.drawStage();
  doubleClick();
  typeName('No guardar');
  pressKey('Escape');
  assert.equal(home.name, '');
  assert.equal(home.nodes[0].text, '');
  assert.equal(home.hasChanges(), false);
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

test('alignment guides appear during an aligned drag and clear for every drag ending', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'reset']) {
    const { home, node, click, pointer, addNodeElement, addAlignmentLayer, windowListeners } = savedEditor();
    const layer = addAlignmentLayer();
    home.nodes = [
      { id: 'root', parent_id: null, text: home.name, x: 0, y: 0 },
      { id: 'peer', parent_id: null, text: 'Peer', x: 400, y: 200 },
    ];
    addNodeElement('peer', 'Peer');
    home.positionTree();
    let saves = 0;
    home.save = () => { saves++; };
    click();
    pointer('pointerdown');
    pointer('pointermove', node, { clientX: 102, clientY: 101 });
    assert.equal(layer.innerHTML, '', 'selection or a tiny movement shows no guides');
    pointer('pointermove', node, { clientX: 140, clientY: 300 });
    assert.match(layer.innerHTML, /class="is-center"/);
    assert.equal(saves, 0, 'guides do not write on each frame');
    assert.equal(home.nodes[0].x, 40, 'guides do not snap or change the pointer movement');
    assert.equal(home.nodes[0].y, 200);
    if (ending === 'blur') windowListeners.get('blur')();
    else if (ending === 'reset') home.reset();
    else pointer(ending);
    assert.equal(layer.innerHTML, '', ending);
    assert.equal(saves, ending === 'reset' ? 0 : 1, ending);
  }
});

test('drag guides ignore the full moving branch and vanish when alignment is lost', () => {
  const { home, node, click, pointer, addNodeElement, addAlignmentLayer } = savedEditor();
  const layer = addAlignmentLayer();
  home.nodes = [
    { id: 'root', parent_id: null, text: home.name, x: 0, y: 0 },
    { id: 'manual', parent_id: 'root', text: 'Manual', x: 400, y: 0 },
    { id: 'automatic', parent_id: 'root', text: 'Automatic', x: null, y: null },
    { id: 'peer', parent_id: null, text: 'Peer', x: 600, y: 200 },
  ];
  for (const item of home.nodes.slice(1)) addNodeElement(item.id, item.text);
  home.positionTree();
  click();
  pointer('pointerdown');
  assert.deepEqual([...home.drag.movingIds], ['root', 'manual', 'automatic']);
  pointer('pointermove', node, { clientX: 140, clientY: 300 });
  assert.match(layer.innerHTML, /<line /);
  pointer('pointermove', node, { clientX: 150, clientY: 380 });
  assert.equal(layer.innerHTML, '', 'moving descendants do not keep a false guide visible');
  home.finishNodeDrag(false);
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

test('dragging a centered parent repeatedly translates its full branch without a position jump', async () => {
  const { home, branch, pointer, click } = branchDragEditor();
  const layout = vm.runInNewContext(fs.readFileSync('view/home/diagram-layout.js', 'utf8') + '\nDiagramLayout;');
  home.positionTree = () => { home.plan = layout.arrange(home.nodes); };
  home.positionTree();
  home.viewport.scale = 2;
  click(branch.node);
  const before = JSON.parse(JSON.stringify(home.plan));
  const parent = before.nodes.find(item => item.id === 'branch');
  assert.notEqual(parent.y - before.origin.y, parent.baseY, 'fixture includes a recentered parent');
  for (let drag = 1; drag <= 2; drag++) {
    pointer('pointerdown', branch.node);
    pointer('pointermove', branch.node, { clientX: 180, clientY: 140 });
    for (const id of ['branch', 'leaf', 'inherited', 'sibling']) {
      const old = before.nodes.find(item => item.id === id);
      const current = home.plan.nodes.find(item => item.id === id);
      const moves = id !== 'sibling';
      assert.equal(current.x - home.plan.origin.x - (old.x - before.origin.x), moves ? 40 * drag : 0, id);
      assert.equal(current.y - home.plan.origin.y - (old.y - before.origin.y), moves ? 20 * drag : 0, id);
    }
    pointer('pointerup', branch.node);
    await new Promise(setImmediate);
  }
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

test('width alignment guides follow the resized edge and clear on every pointer ending', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'reset']) {
    const { home, widthHandle, click, pointer, addNodeElement, addAlignmentLayer, windowListeners } = savedEditor();
    const layer = addAlignmentLayer();
    home.nodes = [
      { id: 'root', parent_id: null, text: home.name, x: 0, y: 0, width: 220 },
      { id: 'peer', parent_id: null, text: 'Peer', x: 0, y: 200, width: 260 },
    ];
    addNodeElement('peer', 'Peer');
    home.positionTree();
    let saves = 0;
    home.save = () => { saves++; };
    click();
    pointer('pointerdown', widthHandle);
    pointer('pointermove', widthHandle, { clientX: 102 });
    assert.equal(layer.innerHTML, '', 'pressing without a width change shows no guides');
    pointer('pointermove', widthHandle, { clientX: 140, pointerId: 2 });
    assert.equal(layer.innerHTML, '', 'unrelated pointers cannot activate guides');
    pointer('pointermove', widthHandle, { clientX: 140 });
    const peer = home.plan.nodes.find(item => item.id === 'peer');
    const edge = peer.x + peer.width;
    assert.match(layer.innerHTML, new RegExp(`x1="${edge}"[^>]+x2="${edge}"`));
    assert.doesNotMatch(layer.innerHTML, /diagram-spacing-guide/, 'gap measurements are reserved for moving nodes');
    assert.equal(home.nodes[0].width, 260);
    assert.equal(saves, 0);
    pointer('pointermove', widthHandle, { clientX: 160 });
    assert.doesNotMatch(layer.innerHTML, new RegExp(`x1="${edge}"[^>]+x2="${edge}"`), 'a formerly aligned edge clears immediately');
    pointer('pointermove', widthHandle, { clientX: 140 });
    if (ending === 'blur') windowListeners.get('blur')();
    else if (ending === 'reset') home.reset();
    else pointer(ending, widthHandle);
    assert.equal(layer.innerHTML, '', ending);
    assert.equal(saves, ending === 'reset' ? 0 : 1, ending);
  }
});

test('keyboard width adjustments show alignment until key release or loss of focus', () => {
  for (const ending of ['keyup', 'focusout', 'blur', 'reset']) {
    const { home, widthHandle, click, handleKey, releaseKey, addNodeElement, addAlignmentLayer, windowListeners } = savedEditor();
    const layer = addAlignmentLayer();
    home.nodes = [
      { id: 'root', parent_id: null, text: home.name, x: 0, y: 0, width: 220 },
      { id: 'peer', parent_id: null, text: 'Peer', x: 0, y: 200, width: 230 },
    ];
    addNodeElement('peer', 'Peer');
    home.positionTree();
    let saves = 0;
    home.save = () => { saves++; };
    click();
    widthHandle.focus();
    handleKey('ArrowRight');
    assert.equal(home.nodes[0].width, 230);
    assert.match(layer.innerHTML, /class="is-center"/);
    assert.equal(saves, 1);
    if (ending === 'keyup') releaseKey('ArrowRight');
    else if (ending === 'focusout') widthHandle.blur();
    else if (ending === 'blur') windowListeners.get('blur')();
    else home.reset();
    assert.equal(layer.innerHTML, '', ending);
    assert.equal(saves, 1, 'clearing a visual guide does not save again');
  }
});

test('moving a sibling measures the current gap and highlights matching sibling gaps', () => {
  for (const parentId of [null, 'root']) {
    const fixture = savedEditor();
    const { home, click, pointer, addNodeElement, addAlignmentLayer } = fixture;
    const layer = addAlignmentLayer();
    const movingId = parentId === null ? 'root' : 'moving';
    home.nodes = [
      ...(parentId ? [{ id: 'root', parent_id: null, text: home.name, x: -500, y: -500 }] : []),
      { id: movingId, parent_id: parentId, text: parentId ? 'Moving' : home.name, x: 0, y: 0, width: 100 },
      { id: 'peer', parent_id: parentId, text: 'Peer', x: 180, y: 0, width: 100 },
      { id: 'last', parent_id: parentId, text: 'Last', x: 340, y: 0, width: 100 },
    ];
    const nodes = new Map([['root', fixture.node]]);
    for (const item of home.nodes.filter(item => item.id !== 'root')) nodes.set(item.id, addNodeElement(item.id, item.text).node);
    const moving = nodes.get(movingId);
    home.positionTree();
    let saves = 0;
    home.save = () => { saves++; };
    click(moving);
    pointer('pointerdown', moving);
    pointer('pointermove', moving, { clientX: 120 });
    const dimensions = [...layer.innerHTML.matchAll(/<g\b[^>]*class="diagram-spacing-guide[^>]*>/g)].map(match => match[0]);
    assert.equal(dimensions.length, 2, 'both equal adjacent gaps are shown');
    assert.ok(dimensions.every(markup => markup.includes('is-equal') && markup.includes('data-gap="60"')));
    assert.match(layer.innerHTML, /60 px/);
    assert.equal(home.nodes.find(item => item.id === movingId).x, 20, 'measurement never snaps the node');
    assert.equal(saves, 0, 'moving only updates the view');
    pointer('pointermove', moving, { clientX: 140 });
    assert.match(layer.innerHTML, /data-gap="40"/);
    assert.doesNotMatch(layer.innerHTML, /is-equal/);
    assert.doesNotMatch(layer.innerHTML, /data-from="peer" data-to="last"/, 'unmatched reference gap is removed');
    pointer('pointermove', moving, { clientX: 150, clientY: 350 });
    assert.doesNotMatch(layer.innerHTML, /diagram-spacing-guide/, 'diagonal boxes do not retain a misleading gap');
    pointer('pointerup', moving);
    assert.equal(layer.innerHTML, '');
    assert.equal(saves, 1);
  }
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

test('leaving an empty new child preserves it, saves other changes and restores both after reload', async () => {
  const { home, state, fields } = blankChildEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...JSON.parse(JSON.stringify(data)), version: data.version + 1 };
  };
  await home.addChild();
  const key = home.selectedKey;
  home.nodes[0].width = 270;
  fields.get(key).field.blur();
  await new Promise(setImmediate);
  assert.equal(home.nodes.length, 2);
  assert.equal(home.nodes[0].width, 270);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].nodes.find(node => node.id === key).text, '');
  assert.equal(home.selectedKey, key);
  assert.equal(home.error, '');
  assert.equal(home.hasChanges(), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes.find(node => node.id === key).text, '');
  assert.equal(restored.home.nodes[0].width, 270);
});

test('an empty idea can own another empty child and Enter persists both', async () => {
  const { home, fields, handleKey } = blankChildEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addChild();
  const parent = home.selectedKey;
  await home.addChild();
  const child = home.selectedKey;
  assert.notEqual(child, parent);
  handleKey('Enter', fields.get(child).field);
  await new Promise(setImmediate);
  assert.equal(home.active.nodes.length, 3);
  assert.equal(home.active.nodes.find(node => node.id === parent).text, '');
  assert.equal(home.active.nodes.find(node => node.id === child).parent_id, parent);
  assert.equal(home.active.nodes.find(node => node.id === child).text, '');
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
  assert.equal(sent.nodes.length, 2);
  assert.equal(sent.nodes.find(node => node.id === key).text, '');
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
  assert.match(toolbar.options, /data-id="51" aria-checked="true"/);
  assert.match(toolbar.options, /data-id="52" aria-checked="false"/);
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

test('empty text is saved before navigating to another diagram', async () => {
  const { home, state, navigations } = savedEditor();
  state.data.diagrams.push({ id: 52, name: 'Otro', version: 1 });
  home.name = '';
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.openDiagram('52');
  assert.equal(navigations.length, 1);
  assert.equal(home.active.nodes[0].text, '');
  assert.equal(home.error, '');
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

test('copy and paste clone a complete branch with new IDs, labels, image and width', async () => {
  const { home } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addChild();
  const sourceId = home.selectedKey;
  home.name = 'Source';
  Object.assign(home.nodes.find(n => n.id === sourceId), { image: 'data:image/png;base64,fixture', labels: [{ text: 'Inside', position: 'inside' }, { text: 'Outside', position: 'outside' }], width: 310, checkbox: true });
  await home.save();
  await home.addChild();
  home.name = 'Grandchild';
  await home.save();
  home.selectNode(sourceId);
  await home.handleAction('copy-diagram-node');
  home.selectNode('root');
  await home.handleAction('paste-diagram-node');
  const pasted = home.nodes.find(n => n.id === home.selectedKey);
  assert.notEqual(pasted.id, sourceId);
  assert.equal(pasted.parent_id, 'root');
  assert.equal(pasted.width, 310);
  assert.equal(pasted.checkbox, true);
  assert.equal(pasted.image, 'data:image/png;base64,fixture');
  assert.equal(pasted.labels.length, 2);
  assert.equal(home.nodes.find(n => n.parent_id === pasted.id).text, 'Grandchild');
  pasted.labels[0].text = 'Changed';
  assert.equal(home.nodes.find(n => n.id === sourceId).labels[0].text, 'Inside');
  assert.equal(home.nodes.length, 5);
});

test('cut removes the selected branch and paste restores its contents under a new parent', async () => {
  const { home } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addChild(); home.name = 'Move me'; await home.save();
  const source = home.selectedKey;
  await home.addChild(); home.name = 'Nested'; await home.save();
  home.selectNode(source);
  await home.handleAction('cut-diagram-node');
  assert.equal(home.nodes.length, 1);
  assert.equal(home.active.nodes.length, 1);
  await home.handleAction('paste-diagram-node');
  assert.equal(home.nodes.length, 3);
  assert.equal(home.nodes.find(n => n.id === home.selectedKey).text, 'Move me');
  assert.equal(home.hasChanges(), false);
});

test('deleting a child keeps its siblings and flushes an earlier in-flight save', async () => {
  const { home } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addChild(); home.name = 'Delete me'; await home.save();
  const removed = home.selectedKey;
  home.selectNode('root');
  await home.addChild(); home.name = 'Keep me'; await home.save();
  const kept = home.selectedKey;
  let complete;
  home.makeRequest = (action, data) => new Promise(resolve => { complete = () => resolve({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 }); });
  home.name = 'Keep newest';
  const saving = home.save();
  home.selectNode(removed);
  const deleting = home.handleAction('delete-diagram-node');
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  complete(); await saving; await deleting;
  assert.equal(home.nodes.some(n => n.id === removed), false);
  assert.equal(home.active.nodes.find(n => n.id === kept).text, 'Keep newest');
  assert.equal(home.hasChanges(), false);
});

test('image and label edits participate in versioned saving and survive reload', async () => {
  const { home, state } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  home.nodes[0].image = 'data:image/png;base64,test';
  home.nodes[0].labels = [{ text: 'Label', position: 'outside' }];
  assert.equal(home.hasChanges(), true);
  await home.save();
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes[0].image, 'data:image/png;base64,test');
  assert.equal(restored.home.nodes[0].labels[0].position, 'outside');
  assert.equal(restored.home.hasChanges(), false);
});

test('paste refuses node and image limits without altering the existing tree', async () => {
  const { home } = savedEditor();
  const branch = Array.from({ length: 200 }, (_, i) => ({ id: String(i), parent_id: i ? '0' : null, text: 'Copied' }));
  home.nodeTools.setClipboard(branch, '0');
  await home.nodeTools.paste();
  assert.equal(home.nodes.length, 1);
  assert.equal(home.error, 'diagram_node_limit');
  home.nodeTools.setClipboard([{ id: 'copy', parent_id: null, text: 'Image', image: 'x'.repeat(2097153) }], 'copy');
  await home.nodeTools.paste();
  assert.equal(home.nodes.length, 1);
  assert.equal(home.error, 'error_diagram_image_limit');
});

test('cutting the root deletes the diagram and retains its clipboard for another diagram', async () => {
  const { home, state } = savedEditor();
  const requests = [];
  home.makeRequest = async (action, data) => { requests.push({ action, data }); return { id: data.id }; };
  await home.handleAction('cut-diagram-node');
  assert.equal(requests[0].action, 'deleteDiagram');
  assert.equal(requests[0].data.version, 1);
  assert.equal(home.active, null);
  assert.equal(state.data.diagrams.length, 0);
  assert.equal(home.nodeTools.clipboard().nodes[0].text, 'Idea guardada');
});

test('a failed root deletion keeps the diagram and account changes cannot reuse its clipboard', async () => {
  const { home, state } = savedEditor();
  state.user.id = 7;
  home.makeRequest = async () => { throw new Error('Conflict'); };
  await home.handleAction('cut-diagram-node');
  assert.equal(home.active.id, 51);
  assert.equal(home.error, 'Conflict');
  assert.ok(home.nodeTools.clipboard());
  state.user.id = 8;
  assert.equal(home.nodeTools.clipboard(), null);
});

function siblingEditor() {
  const fixture = blankChildEditor();
  const base = { layout: null, x: null, y: null, width: null, image: null, labels: [], checkbox: null };
  const nodes = [
    { ...base, id: 'root', parent_id: null, text: 'Idea guardada',
      layout: { mode: 'horizontal', direction: 'right', vertical: 'auto', horizontal: 'auto' } },
    { ...base, id: 'source', parent_id: 'root', text: 'Fuente', width: 310, x: 72, y: -45,
      layout: { mode: 'radial', direction: 'auto', vertical: 'auto', horizontal: 'auto' },
      image: 'data:image/png;base64,fixture', checkbox: true,
      labels: [{ text: 'Etiqueta interior', position: 'inside' }, { text: 'Etiqueta exterior', position: 'outside' }] },
    { ...base, id: 'descendant', parent_id: 'source', text: 'Hijo que no se copia', width: 185 },
    { ...base, id: 'other', parent_id: 'root', text: 'Otro hermano', width: 260 },
  ];
  fixture.home.active.nodes = JSON.parse(JSON.stringify(nodes));
  fixture.home.nodes = JSON.parse(JSON.stringify(nodes));
  fixture.home.drawStage();
  fixture.home.selectNode('source');
  return fixture;
}

test('the asterisk creates exactly one empty sibling with its own copies of the selected characteristics', async () => {
  const { home, fields, document } = siblingEditor();
  const before = JSON.parse(JSON.stringify(home.nodes));
  home.makeRequest = () => { throw new Error('A blank sibling must not be submitted'); };
  await home.handleAction('add-diagram-sibling');
  const sibling = home.nodes.find(node => node.id === home.selectedKey);
  const source = home.nodes.find(node => node.id === 'source');
  assert.notEqual(sibling.id, source.id);
  assert.equal(home.nodes.length, before.length + 1);
  assert.equal(sibling.parent_id, source.parent_id);
  assert.equal(sibling.text, '');
  assert.equal(sibling.x, null);
  assert.equal(sibling.y, null);
  assert.equal(home.nodes.filter(node => node.parent_id === sibling.id).length, 0);
  for (const key of ['layout', 'width', 'checkbox', 'image', 'labels']) {
    assert.deepEqual(JSON.parse(JSON.stringify(sibling[key])), JSON.parse(JSON.stringify(source[key])));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.filter(node => node.id !== sibling.id))), before);
  const field = fields.get(sibling.id).field;
  assert.equal(document.activeElement, field);
  assert.equal(field.readOnly, false);
  assert.equal(field.value, '');
  assert.equal(field.selectionStart, 0);
  assert.equal(field.selectionEnd, 0);
  sibling.layout.mode = 'vertical';
  sibling.labels[0].text = 'Solo del nuevo hermano';
  assert.equal(source.layout.mode, 'radial');
  assert.equal(source.labels[0].text, 'Etiqueta interior');
});

test('a sibling keeps inherited layout rather than introducing a new override', async () => {
  const { home } = siblingEditor();
  home.nodes.find(node => node.id === 'source').layout = null;
  await home.addSibling();
  const sibling = home.nodes.find(node => node.id === home.selectedKey);
  assert.equal(sibling.parent_id, 'root');
  assert.equal(sibling.layout, null);
  assert.equal(home.nodes.find(node => node.id === 'root').layout.direction, 'right');
});

test('typing and saving a sibling preserves its parent and characteristics after reload', async () => {
  const { home, state, fields, typeName, handleKey } = siblingEditor();
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(JSON.parse(JSON.stringify(data)));
    return { ...JSON.parse(JSON.stringify(data)), version: data.version + 1 };
  };
  await home.addSibling();
  const key = home.selectedKey;
  typeName('Hermano nuevo\nDetalle', fields.get(key).field);
  handleKey('Enter', fields.get(key).field);
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].nodes.length, 5);
  assert.equal(home.childDrafts.has(key), false);
  assert.equal(home.hasChanges(), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  const sibling = restored.home.nodes.find(node => node.id === key);
  assert.equal(sibling.parent_id, 'root');
  assert.equal(sibling.text, 'Hermano nuevo\nDetalle');
  assert.equal(sibling.layout.mode, 'radial');
  assert.equal(sibling.width, 310);
  assert.equal(sibling.checkbox, true);
  assert.equal(sibling.image, 'data:image/png;base64,fixture');
  assert.equal(sibling.labels[1].position, 'outside');
  assert.equal(restored.home.nodes.find(node => node.id === 'descendant').parent_id, 'source');
  assert.equal(restored.home.nodes.some(node => node.parent_id === key), false);
});

test('consecutive empty siblings keep their characteristics and persist when focus leaves', async () => {
  const { home, fields } = siblingEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addSibling();
  const first = home.selectedKey;
  await home.addSibling();
  const second = home.selectedKey;
  assert.notEqual(second, first);
  fields.get(second).field.blur();
  await new Promise(setImmediate);
  await home.save();
  for (const key of [first, second]) {
    const node = home.active.nodes.find(item => item.id === key);
    assert.equal(node.text, '');
    assert.equal(node.parent_id, 'root');
    assert.equal(node.width, 310);
    assert.equal(node.checkbox, true);
  }
  assert.equal(home.hasChanges(), false);
});

test('a deepest permitted node can still receive a sibling without creating a deeper child', async () => {
  const { home } = blankChildEditor();
  home.nodes = Array.from({ length: 30 }, (_, index) => ({
    id: index ? `level-${index}` : 'root',
    parent_id: index === 0 ? null : index === 1 ? 'root' : `level-${index - 1}`,
    text: index === 0 ? 'Idea guardada' : `Nivel ${index}`,
    layout: null, x: null, y: null, width: null,
  }));
  home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
  home.drawStage();
  home.selectNode('level-29');
  await home.addSibling();
  assert.equal(home.nodes.length, 31);
  const sibling = home.nodes.find(node => node.id === home.selectedKey);
  assert.equal(sibling.parent_id, 'level-28');
  assert.equal(home.error, '');
});

test('adding a sibling respects the total node limit without changing the tree', async () => {
  const { home } = blankChildEditor();
  home.nodes = Array.from({ length: 200 }, (_, index) => ({
    id: index ? `idea-${index}` : 'root', parent_id: index ? 'root' : null,
    text: index ? `Idea ${index}` : 'Idea guardada', layout: null, x: null, y: null, width: null,
  }));
  home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
  home.drawStage();
  home.selectNode('idea-10');
  const before = JSON.parse(JSON.stringify(home.nodes));
  await home.addSibling();
  assert.equal(home.error, 'diagram_node_limit');
  assert.equal(home.selectedKey, 'idea-10');
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), before);
});

test('the central idea can create an independent sibling root that survives saving and can have its own child', async () => {
  const { home, state, fields, typeName, handleKey } = siblingEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  home.selectNode('root');
  await home.addSibling();
  const key = home.selectedKey;
  const sibling = home.nodes.find(node => node.id === key);
  assert.notEqual(key, 'root');
  assert.equal(sibling.parent_id, null);
  assert.equal(home.nodes.find(node => node.id === 'root').parent_id, null);
  assert.equal(home.nodes.filter(node => node.parent_id === null).length, 2);
  assert.equal(JSON.parse(home.nodeContent(sibling)).placeholder, '');
  typeName('Otra idea central', fields.get(key).field);
  handleKey('Enter', fields.get(key).field);
  await new Promise(setImmediate);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.equal(restored.home.nodes.find(node => node.id === key).text, 'Otra idea central');
  assert.equal(restored.home.nodes.find(node => node.id === key).parent_id, null);
  assert.equal(restored.home.nodes.filter(node => node.parent_id === null).length, 2);
  assert.equal(restored.home.active.name, 'Idea guardada');
  await home.addChild();
  assert.equal(home.nodes.find(node => node.id === home.selectedKey).parent_id, key);
});

test('cancelling an empty sibling root restores the central idea without a null selection', async () => {
  const { home, fields, handleKey } = siblingEditor();
  home.selectNode('root');
  home.makeRequest = () => { throw new Error('Cancelling an empty root sibling must not save'); };
  await home.addSibling();
  const key = home.selectedKey;
  handleKey('Escape', fields.get(key).field);
  await new Promise(setImmediate);
  assert.equal(home.nodes.some(node => node.id === key), false);
  assert.equal(home.selectedKey, 'root');
  assert.equal(home.name, 'Idea guardada');
  assert.equal(home.hasChanges(), false);
});

test('copying sibling characteristics respects the total image limit without changing the tree', async () => {
  const { home } = siblingEditor();
  for (let index = 0; index < 4; index++) {
    home.nodes.push({ id: `extra-${index}`, parent_id: 'root', text: `Idea ${index}`, layout: null, x: null, y: null, width: null });
  }
  for (const node of home.nodes) node.image = 'data:image/png;base64,' + 'a'.repeat(250000);
  const before = JSON.parse(JSON.stringify(home.nodes));
  assert.ok(home.nodes.reduce((sum, node) => sum + node.image.length, 0) < 2097152);
  await home.addSibling();
  assert.equal(home.error, 'error_diagram_image_limit');
  assert.equal(home.selectedKey, 'source');
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), before);
});

function forestEditor() {
  const fixture = siblingEditor();
  fixture.home.nodes.push(
    { id: 'orphan', parent_id: null, text: 'Segunda raíz', width: 345, x: 90, y: 120,
      layout: { mode: 'vertical', direction: 'bottom', vertical: 'auto', horizontal: 'auto' },
      checkbox: false, image: null, labels: [{ text: 'Su etiqueta', position: 'outside' }] },
    { id: 'orphan-child', parent_id: 'orphan', text: 'Hijo de segunda raíz', width: 130, x: 50, y: 25,
      layout: { mode: 'list', direction: 'auto', vertical: 'top', horizontal: 'ltr' } },
  );
  fixture.home.active.nodes = JSON.parse(JSON.stringify(fixture.home.nodes));
  fixture.home.drawStage();
  fixture.home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  return fixture;
}

test('whole-diagram layout updates every root while branch layout only changes its selected tree', async () => {
  const { home } = forestEditor();
  const primaryTree = JSON.parse(JSON.stringify(home.branchNodes('root')));
  const branchStyle = { mode: 'topdown', direction: 'auto', vertical: 'bottom', horizontal: 'rtl' };
  home.applyLayout('orphan', branchStyle, 'branch');
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(home.branchNodes('root'))), primaryTree);
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.find(node => node.id === 'orphan').layout)), branchStyle);
  assert.equal(home.nodes.find(node => node.id === 'orphan-child').layout, null);
  const allStyle = { mode: 'linear', direction: 'auto', vertical: 'compact', horizontal: 'ltr' };
  home.applyLayout('orphan-child', allStyle, 'diagram');
  await new Promise(setImmediate);
  const roots = home.nodes.filter(node => node.parent_id === null);
  assert.equal(roots.length, 2);
  for (const root of roots) assert.deepEqual(JSON.parse(JSON.stringify(root.layout)), allStyle);
  assert.notEqual(roots[0].layout, roots[1].layout);
  for (const node of home.nodes) {
    if (node.parent_id !== null) assert.equal(node.layout, null);
    assert.equal(node.x, null);
    assert.equal(node.y, null);
  }
  assert.equal(home.nodes.find(node => node.id === 'orphan').width, 345);
  assert.equal(home.hasChanges(), false);
});

test('paste can attach a copied branch to an independent sibling root', async () => {
  const { home } = forestEditor();
  home.nodeTools.setClipboard(home.branchNodes('source'), 'source');
  home.selectNode('orphan');
  await home.handleAction('paste-diagram-node');
  const pasted = home.nodes.find(node => node.id === home.selectedKey);
  assert.notEqual(pasted.id, 'orphan');
  assert.equal(pasted.parent_id, 'orphan');
  assert.equal(pasted.text, 'Fuente');
  assert.equal(pasted.width, 310);
  assert.equal(home.nodes.find(node => node.parent_id === pasted.id).text, 'Hijo que no se copia');
  assert.equal(home.nodes.length, 8);
  assert.equal(home.hasChanges(), false);
});

test('deleting a noncanonical root removes only its tree and returns to the canonical root', async () => {
  const { home } = forestEditor();
  const primaryTree = JSON.parse(JSON.stringify(home.branchNodes('root')));
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(action);
    return { ...JSON.parse(JSON.stringify(data)), version: data.version + 1 };
  };
  home.selectNode('orphan');
  await home.handleAction('delete-diagram-node');
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), primaryTree);
  assert.equal(home.selectedKey, 'root');
  assert.equal(home.name, 'Idea guardada');
  assert.equal(home.active.id, 51);
  assert.equal(requests.includes('deleteDiagram'), false);
  assert.equal(home.hasChanges(), false);
});

test('deleting the canonical root preserves sibling trees and promotes a remaining root with its characteristics', async () => {
  const { home } = forestEditor();
  const remainingRoot = JSON.parse(JSON.stringify(home.nodes.find(node => node.id === 'orphan')));
  const requests = [];
  home.makeRequest = async (action, data) => {
    requests.push(action);
    return { ...JSON.parse(JSON.stringify(data)), version: data.version + 1 };
  };
  home.selectNode('root');
  await home.handleAction('delete-diagram-node');
  assert.equal(home.nodes.length, 2);
  assert.equal(home.nodes.some(node => ['source', 'descendant', 'other', 'orphan'].includes(node.id)), false);
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes.find(node => node.id === 'root'))), { ...remainingRoot, id: 'root' });
  assert.equal(home.nodes.find(node => node.id === 'orphan-child').parent_id, 'root');
  assert.equal(home.selectedKey, 'root');
  assert.equal(home.name, 'Segunda raíz');
  assert.equal(home.active.id, 51);
  assert.equal(home.active.name, 'Idea guardada');
  assert.equal(requests.includes('deleteDiagram'), false);
  assert.equal(home.hasChanges(), false);
});


test('an untouched empty child is autosaved and remains available for copying and pasting', async () => {
  const { home, timers } = blankChildEditor();
  home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  await home.addChild();
  const key = home.selectedKey;
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await home.save();
  assert.equal(home.active.nodes.find(node => node.id === key).text, '');
  await home.nodeTools.copy();
  await home.nodeTools.paste();
  assert.equal(home.active.nodes.length, 3);
  assert.equal(home.active.nodes.filter(node => node.text === '').length, 2);
});

test('checkbox scope radios choose one target without saving and reset on reopening the menu', async () => {
  const { home, checkboxScopes, checkboxOptions, change, pressKey } = savedEditor();
  home.makeRequest = () => { throw new Error('Choosing a scope must not change the diagram'); };
  await home.handleAction('diagram-checkbox-menu');
  assert.equal(checkboxScopes.node.checked, true);
  assert.equal(checkboxScopes.branch.checked, false);
  checkboxScopes.branch.checked = true;
  change(checkboxScopes.branch);
  assert.equal(home.checkboxScope, 'branch');
  assert.equal(checkboxScopes.node.checked, false);
  assert.equal(checkboxScopes.branch.checked, true);
  assert.equal(home.menuOpen, true);
  assert.equal(home.hasChanges(), false);
  assert.equal(pressKey('ArrowDown', { target: checkboxScopes.branch }).prevented, false,
    'native radio keyboard navigation must not be intercepted by the action menu');
  pressKey('Escape', { target: checkboxOptions.none });
  await home.handleAction('diagram-checkbox-menu');
  assert.equal(home.checkboxScope, 'node');
  assert.equal(checkboxScopes.node.checked, true);
  assert.equal(checkboxScopes.branch.checked, false);
});

test('checkbox branch actions apply the same state to every descendant while preserving ancestors and other branches', async () => {
  const { home, branch, change, state } = branchDragEditor();
  home.nodes.push({ id: 'grandchild', parent_id: 'leaf', text: 'Deep task', checkbox: true, width: 190 });
  home.nodes.push({ id: 'other-root', parent_id: null, text: 'Separate tree', checkbox: false });
  home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
  const initial = JSON.parse(JSON.stringify(home.nodes));
  home.selectNode('branch');
  for (const [action, value] of [['unchecked', false], ['checked', true], ['toggle', false], ['none', null]]) {
    await home.handleAction('diagram-checkbox-menu');
    branch.checkboxScopes.branch.checked = true;
    change(branch.checkboxScopes.branch);
    await home.handleAction('diagram-checkbox-state', branch.checkboxOptions[action]);
    const expected = initial.map((node) => ['branch', 'leaf', 'inherited', 'grandchild'].includes(node.id)
      ? { ...node, checkbox: value } : node);
    assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), expected);
    assert.equal(home.menuOpen, false);
    assert.equal(home.hasChanges(), false);
    const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
    restored.home.render();
    assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes)), expected);
  }
});

test('individual scope and direct checkbox clicks update only the selected child even after using branch scope', async () => {
  const { home, branch, change } = branchDragEditor();
  home.selectNode('branch');
  await home.handleAction('diagram-checkbox-menu');
  await home.handleAction('diagram-checkbox-state', branch.checkboxOptions.checked);
  assert.equal(home.nodes.find(n => n.id === 'branch').checkbox, true);
  assert.equal(home.nodes.find(n => n.id === 'leaf').checkbox, undefined);
  await home.handleAction('diagram-checkbox-menu');
  branch.checkboxScopes.branch.checked = true;
  change(branch.checkboxScopes.branch);
  await home.handleAction('diagram-checkbox-state', branch.checkboxOptions.checked);
  branch.checkbox.checked = false;
  change(branch.checkbox);
  await home.save();
  assert.equal(home.active.nodes.find(n => n.id === 'branch').checkbox, false);
  assert.equal(home.active.nodes.find(n => n.id === 'leaf').checkbox, true);
  assert.equal(home.active.nodes.find(n => n.id === 'inherited').checkbox, true);
  assert.equal(home.active.nodes.find(n => n.id === 'sibling').checkbox, undefined);
});

function pickerEditor() {
  const fixture = savedEditor();
  fixture.state.data.diagrams.push({ id: 52, name: 'Segundo', version: 1 }, { id: 53, name: 'Tercero', version: 1 });
  return { ...fixture, picker: fixture.addPicker() };
}

test('the diagram picker supports arrow keys, Home, End and Escape without changing diagrams', async () => {
  const { home, picker, handleKey, document, navigations } = pickerEditor();
  home.makeRequest = () => { throw new Error('Opening the picker must not save'); };
  handleKey('ArrowDown', picker.trigger);
  assert.equal(picker.menu.hidden, false);
  assert.equal(picker.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, picker.options[0]);
  handleKey('ArrowDown', document.activeElement);
  assert.equal(document.activeElement, picker.options[1]);
  handleKey('End', document.activeElement);
  assert.equal(document.activeElement, picker.options[2]);
  handleKey('Home', document.activeElement);
  assert.equal(document.activeElement, picker.options[0]);
  handleKey('ArrowUp', document.activeElement);
  assert.equal(document.activeElement, picker.options[2]);
  handleKey('Escape', document.activeElement);
  assert.equal(picker.menu.hidden, true);
  assert.equal(picker.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, picker.trigger);
  assert.equal(navigations.length, 0);
});

test('the diagram picker closes on outside click, outside focus and Tab', async () => {
  const { home, picker, click, outside, handleKey, document } = pickerEditor();
  for (const dismiss of [() => click(outside), () => outside.focus(), () => handleKey('Tab', document.activeElement)]) {
    await home.handleAction('toggle-diagram-picker', picker.trigger);
    assert.equal(home.pickerOpen, true);
    dismiss();
    assert.equal(home.pickerOpen, false);
    assert.equal(picker.menu.hidden, true);
  }
});

test('a diagram option closes its menu and preserves the full-page selection navigation', async () => {
  const { home, picker, navigations } = pickerEditor();
  home.openDiagramPicker();
  await home.handleAction('select-diagram', picker.options[1]);
  assert.equal(home.pickerOpen, false);
  assert.equal(picker.menu.hidden, true);
  assert.deepEqual(navigations, ['http://localhost/MyRemarkableMind/?diagram=52']);
});

test('the picker pauses background redraws and cannot open during a diagram switch', () => {
  const { home, picker } = pickerEditor();
  assert.equal(home.isEditing(), false);
  home.openDiagramPicker();
  assert.equal(home.isEditing(), true);
  home.closeDiagramPicker();
  assert.equal(home.isEditing(), false);
  home.switching = true;
  home.openDiagramPicker();
  assert.equal(home.pickerOpen, false);
  assert.equal(picker.menu.hidden, true);
});

test('Delete and the Mac Backspace key remove the selected branch and persist its deletion', async () => {
  for (const key of ['Delete', 'Backspace']) {
    const { home, branch, handleKey, state, node, document } = branchDragEditor();
    home.nodes.push({ id: 'deep', parent_id: 'leaf', text: 'Deep task' });
    home.active.nodes = JSON.parse(JSON.stringify(home.nodes));
    home.selectNode('branch');
    branch.node.focus();
    const kept = JSON.parse(JSON.stringify(home.nodes.filter(n => ['root', 'sibling'].includes(n.id))));
    assert.equal(handleKey(key, branch.node).prevented, true);
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), kept);
    assert.equal(home.selectedKey, 'root');
    assert.equal(document.activeElement, node);
    assert.equal(home.hasChanges(), false);
    const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
    restored.home.render();
    assert.deepEqual(JSON.parse(JSON.stringify(restored.home.nodes)), kept);
  }
});

test('Delete ignores text editing, unselected nodes, key repeats and competing gestures', async () => {
  const { home, branch, handleKey, titleInput, outside, node } = branchDragEditor();
  let calls = 0;
  home.nodeTools.remove = () => { calls++; };
  home.selectNode('branch');
  handleKey('Delete', branch.field);
  handleKey('Backspace', titleInput);
  handleKey('Delete', outside);
  handleKey('Delete', node);
  for (const flag of ['editing', 'titleEditing', 'layoutOpen', 'switching', 'drag', 'resizing']) {
    home[flag] = true;
    handleKey('Delete', branch.node);
    home[flag] = false;
  }
  for (const modifier of ['repeat', 'isComposing', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    handleKey('Delete', branch.node, { [modifier]: true });
  }
  home.nodeTools.busy = true;
  handleKey('Delete', branch.node);
  home.nodeTools.busy = false;
  home.selected = false;
  handleKey('Delete', branch.node);
  assert.equal(calls, 0);
  home.selectNode('branch');
  handleKey('Delete', branch.node);
  assert.equal(calls, 1);
});

test('viewport storage is scoped by account, diagram and application installation', () => {
  const { home, state, location } = savedEditor();
  state.user.id = 10;
  home.positionTree();
  const first = home.viewport.persistenceKey;
  assert.ok(first.includes('"10","51"'));
  home.mount();
  assert.equal(home.viewport.persistenceKey, first);
  home.active = { ...home.active, id: 52 };
  home.positionTree();
  const second = home.viewport.persistenceKey;
  assert.notEqual(second, first);
  state.user.id = 11;
  home.positionTree();
  const otherAccount = home.viewport.persistenceKey;
  assert.notEqual(otherAccount, second);
  location.href = 'http://localhost/another-installation/?diagram=52';
  home.positionTree();
  assert.notEqual(home.viewport.persistenceKey, otherAccount);
  home.reset();
  home.positionTree();
  assert.equal(home.viewport.persistenceKey, null);
});

test('initial save binds the viewport to the new diagram while retaining draft camera movements', async () => {
  const { home, state } = editor();
  state.user.id = 10;
  let resolve;
  home.makeRequest = (action, data) => new Promise(done => { resolve = () => done({ ...data, id: 53, version: 1 }); });
  const pending = home.save();
  home.viewport.x = 83;
  home.viewport.y = -45;
  home.viewport.scale = 1.7;
  resolve();
  await pending;
  assert.ok(home.viewport.persistenceKey.includes('"10","53"'));
  assert.equal(home.viewport.persistenceOptions.keepView, true);
  assert.equal(home.viewport.x, 83);
  assert.equal(home.viewport.y, -45);
  assert.equal(home.viewport.scale, 1.7);
});

test('dragging plus to an existing node creates one persisted connection without changing parents or creating a child', async () => {
  const { home, branch, pointer, click, document, addNodeElement, state } = branchDragEditor();
  const target = addNodeElement('sibling', 'Otra rama');
  home.connectionTool.preview = () => {};
  home.selectNode('branch');
  const before = JSON.parse(JSON.stringify(home.nodes));
  document.elementFromPoint = () => target.node;
  pointer('pointerdown', branch.addHandle);
  assert.ok(home.connectionTool.drag);
  pointer('pointermove', branch.addHandle, { clientX: 230 });
  assert.equal(home.connectionTool.drag.target, 'sibling');
  assert.equal(target.node.classList.contains('is-connection-target'), true);
  assert.equal(home.viewport.options.canInteract(), false, 'camera gestures pause while connecting');
  pointer('pointerup', branch.addHandle, { clientX: 230 });
  assert.equal(click(branch.addHandle).prevented, true, 'the post-drag click must not create a child');
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(home.connections)), [{ from: 'branch', to: 'sibling' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), before);
  assert.equal(home.connectionTool.drag, null);
  assert.equal(target.node.classList.contains('is-connection-target'), false);
  assert.equal(branch.addHandle.hasPointerCapture(1), false);
  assert.equal(home.hasChanges(), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.connections)), [{ from: 'branch', to: 'sibling' }]);
});

test('plus clicks still create children and canceled or invalid drags never create connections', async () => {
  const { home, branch, pointer, click, handleKey, document, windowListeners, node } = branchDragEditor();
  home.connectionTool.preview = () => {};
  home.selectNode('branch');
  pointer('pointerdown', branch.addHandle);
  pointer('pointerup', branch.addHandle);
  assert.equal(click(branch.addHandle).prevented, false);
  await home.handleAction('add-diagram-child', branch.addHandle);
  assert.equal(home.nodes.length, 6);
  home.editing = false;
  home.selectNode('branch');
  for (const ending of ['blank', 'self', 'parent', 'pointercancel', 'blur', 'Escape']) {
    document.elementFromPoint = () => ending === 'self' ? branch.node : ending === 'parent' ? node : null;
    pointer('pointerdown', branch.addHandle);
    pointer('pointermove', branch.addHandle, { clientX: 250 });
    if (ending === 'pointercancel') pointer('pointercancel', branch.addHandle);
    else if (ending === 'blur') windowListeners.get('blur')();
    else if (ending === 'Escape') handleKey('Escape', branch.addHandle);
    else pointer('pointerup', branch.addHandle, { clientX: 250 });
    assert.equal(click(branch.addHandle).prevented, true, ending);
    assert.equal(home.connectionTool.drag, null);
    assert.equal(home.connections.length, 0);
    assert.equal(home.nodes.length, 6);
  }
});

test('additional connections reject self, missing, parent-child and reversed duplicates', async () => {
  const { home } = branchDragEditor();
  for (const pair of [['root', 'root'], ['missing', 'branch'], ['branch', 'leaf'], ['leaf', 'branch']]) {
    await home.connectionTool.connect(...pair);
  }
  assert.equal(home.connections.length, 0);
  await home.connectionTool.connect('leaf', 'sibling');
  const version = home.active.version;
  await home.connectionTool.connect('sibling', 'leaf');
  assert.equal(home.connections.length, 1);
  assert.equal(home.active.version, version);
});

test('deleting a branch removes only its additional connections and leaves connected neighbors intact', async () => {
  const { home } = branchDragEditor();
  await home.connectionTool.connect('leaf', 'sibling');
  await home.connectionTool.connect('root', 'leaf');
  home.nodes.push({ id: 'other', parent_id: null, text: 'Other tree' });
  await home.connectionTool.connect('sibling', 'other');
  home.selectNode('branch');
  await home.handleAction('delete-diagram-node');
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.connections)), [{ from: 'sibling', to: 'other' }]);
  assert.deepEqual(home.nodes.map(n => n.id), ['root', 'sibling', 'other']);
});

test('copying a branch remaps its internal connections and omits external connections', async () => {
  const { home } = branchDragEditor();
  await home.connectionTool.connect('leaf', 'inherited');
  await home.connectionTool.connect('leaf', 'sibling');
  home.selectNode('branch');
  await home.handleAction('copy-diagram-node');
  home.selectNode('root');
  await home.handleAction('paste-diagram-node');
  const copied = new Set(home.branchNodes(home.selectedKey).map(n => n.id));
  const internal = home.connections.filter(edge => copied.has(edge.from) && copied.has(edge.to));
  assert.equal(internal.length, 1);
  assert.equal(home.connections.length, 3);
  assert.equal(home.connections.filter(edge => copied.has(edge.from) !== copied.has(edge.to)).length, 0);
});

test('clicking a connector highlights only that line and Delete preserves all nodes and other lines', async () => {
  for (const key of ['Delete', 'Backspace']) {
    const { home, addConnectionElement, click, handleKey, branch, state, document, stage } = branchDragEditor();
    await home.connectionTool.connect('branch', 'sibling');
    await home.connectionTool.connect('leaf', 'sibling');
    const chosen = addConnectionElement('branch', 'sibling');
    const other = addConnectionElement('leaf', 'sibling');
    const before = JSON.parse(JSON.stringify(home.nodes));
    home.selectNode('branch');
    branch.node.focus();
    click(chosen.hit);
    assert.equal(home.selected, false);
    assert.equal(chosen.group.classList.contains('is-selected'), true);
    assert.equal(chosen.group.getAttribute('aria-pressed'), 'true');
    assert.equal(other.group.getAttribute('aria-pressed'), 'false');
    assert.equal(document.activeElement, chosen.group);
    assert.equal(home.isEditing(), true, 'background refresh cannot replace the selected line');
    assert.equal(handleKey(key, chosen.group).prevented, true);
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), before);
    assert.deepEqual(JSON.parse(JSON.stringify(home.active.connections)), [{ from: 'leaf', to: 'sibling' }]);
    assert.equal(home.hiddenConnections.length, 0);
    assert.equal(home.connectionTool.selected, null);
    assert.equal(document.activeElement, stage);
    assert.equal(home.hasChanges(), false);
    handleKey(key, stage, { repeat: true });
    assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), before);
    const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
    restored.home.render();
    assert.deepEqual(JSON.parse(JSON.stringify(restored.home.connections)), [{ from: 'leaf', to: 'sibling' }]);
  }
});

test('deleting a parent connector persists only its visibility and plus can reconnect it', async () => {
  const { home, click, handleKey, addConnectionElement, state } = branchDragEditor();
  const line = addConnectionElement('root', 'branch');
  const before = JSON.parse(JSON.stringify(home.nodes));
  click(line.hit);
  handleKey('Delete', line.group);
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), before);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.hidden_connections)), [{ from: 'root', to: 'branch' }]);
  assert.equal(home.connectionTool.visibleEdges().some(edge => edge.from === 'root' && edge.to === 'branch'), false);
  const restored = editor({ draft: false, state: JSON.parse(JSON.stringify(state)) });
  restored.home.render();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.hiddenConnections)), [{ from: 'root', to: 'branch' }]);
  assert.equal(restored.home.connectionTool.visibleEdges().some(edge => edge.to === 'branch'), false);
  assert.equal(home.connectionTool.canConnect('branch', 'root'), true);
  await home.connectionTool.connect('branch', 'root');
  assert.equal(home.active.hidden_connections.length, 0);
  assert.equal(home.connections.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.nodes)), before);
});

test('connector selection clears on other lines, nodes, background, Escape and reset', async () => {
  const { home, click, handleKey, addConnectionElement, branch, stage } = branchDragEditor();
  const a = addConnectionElement('root', 'branch');
  const b = addConnectionElement('branch', 'leaf');
  click(a.hit);
  click(b.hit);
  assert.equal(a.group.classList.contains('is-selected'), false);
  assert.equal(b.group.classList.contains('is-selected'), true);
  click(branch.node);
  assert.equal(home.connectionTool.selected, null);
  assert.equal(home.selected, true);
  click(a.hit);
  click(stage);
  assert.equal(home.connectionTool.selected, null);
  a.group.focus();
  assert.equal(a.group.classList.contains('is-selected'), true, 'Tab focus selects the connector');
  handleKey('Escape', a.group);
  assert.equal(home.connectionTool.selected, null);
  click(a.hit);
  home.reset();
  assert.equal(home.connectionTool.selected, null);
});

test('connector Delete ignores editing, unrelated focus, repeats, modifiers and active gestures', () => {
  const { home, addConnectionElement, click, handleKey, branch, titleInput, outside } = branchDragEditor();
  const { group, hit } = addConnectionElement('root', 'branch');
  click(hit);
  let calls = 0;
  home.connectionTool.remove = () => { calls++; };
  handleKey('Delete', branch.field);
  handleKey('Backspace', titleInput);
  handleKey('Delete', outside);
  for (const flag of ['editing', 'titleEditing', 'layoutOpen', 'switching', 'drag', 'resizing']) {
    home[flag] = true;
    handleKey('Delete', group);
    home[flag] = false;
  }
  for (const modifier of ['repeat', 'isComposing', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey']) handleKey('Delete', group, { [modifier]: true });
  home.nodeTools.busy = true;
  handleKey('Delete', group);
  home.nodeTools.busy = false;
  assert.equal(calls, 0);
  handleKey('Delete', group);
  assert.equal(calls, 1);
});

test('a failed line deletion remains retryable and saves without deleting or changing nodes', async () => {
  const { home, click, handleKey, addConnectionElement } = branchDragEditor();
  const { group, hit } = addConnectionElement('root', 'branch');
  const before = JSON.parse(JSON.stringify(home.nodes));
  const savedRequest = home.makeRequest;
  home.makeRequest = async () => { throw new Error('Offline'); };
  click(hit);
  handleKey('Delete', group);
  await new Promise(setImmediate);
  assert.equal(home.hasChanges(), true);
  assert.equal(home.error, 'Offline');
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), before);
  home.makeRequest = savedRequest;
  await home.save();
  assert.equal(home.hasChanges(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(home.active.hidden_connections)), [{ from: 'root', to: 'branch' }]);
});

test('rendering connectors excludes only hidden edges and keeps selectable paths for the others', () => {
  const { home, addConnectionElement } = branchDragEditor();
  const { svg } = addConnectionElement('root', 'branch');
  home.hiddenConnections = [{ from: 'root', to: 'branch' }];
  const edges = [{ from: 'root', to: 'branch', path: 'M 1 2 H 30' }, { from: 'branch', to: 'leaf', path: 'M 30 2 H 60' }];
  home.connectionTool.render(svg, edges);
  assert.equal(svg.innerHTML.includes('data-from="root"'), false);
  assert.ok(svg.innerHTML.includes('data-from="branch" data-to="leaf"'));
  assert.ok(svg.innerHTML.includes('tabindex="0" role="button"'));
  assert.ok(svg.innerHTML.includes('class="diagram-connection-hit"'));
  assert.ok(svg.innerHTML.includes('class="diagram-connection-line"'));
  assert.deepEqual(edges.map(edge => edge.path), ['M 1 2 H 30', 'M 30 2 H 60']);
});

test('copying and removing branches preserve or prune hidden parent lines along with their endpoints', async () => {
  const { home } = branchDragEditor();
  home.hiddenConnections = [{ from: 'root', to: 'branch' }, { from: 'branch', to: 'leaf' }];
  home.selectNode('branch');
  await home.nodeTools.copy();
  home.selectNode('root');
  await home.nodeTools.paste();
  const pasted = home.selectedKey;
  assert.equal(home.hiddenConnections.filter(edge => edge.from === pasted).length, 1);
  assert.equal(home.hiddenConnections.some(edge => edge.to === pasted), false);
  home.selectNode('branch');
  await home.nodeTools.remove();
  assert.equal(home.hiddenConnections.length, 1);
  assert.equal(home.hiddenConnections[0].from, pasted);
});

function routeEditor(points = [[0,0],[200,0]]) {
  const fixture = branchDragEditor();
  const line = fixture.addConnectionElement('root', 'branch');
  fixture.home.plan = { origin: {x:0,y:0}, edges: [{ from:'root', to:'branch', points, path:'M0,0 L200,0' }] };
  fixture.home.positionTree = () => fixture.home.connectionTool.render(line.svg, fixture.home.plan.edges);
  fixture.home.connectionTool.point = event => [event.clientX / fixture.home.viewport.scale, event.clientY / fixture.home.viewport.scale];
  fixture.home.positionTree();
  fixture.click(line.hit);
  return {...fixture, ...line};
}

test('connector menu buttons retain selection across Safari pointer focus and repeated clicks', () => {
  const {home, pointer, click, group, stage, document, outside, addConnectionTools} = routeEditor();
  const {actions, input} = addConnectionTools();
  const press = target => {
    const down = pointer('pointerdown', target);
    // Safari focuses the containing canvas when a button's pointer default is allowed.
    if (!down.prevented) stage.focus();
    pointer('pointerup', target);
    click(target);
  };
  for (const open of [true, false, true]) {
    press(actions.menu);
    assert.equal(group.classList.contains('is-selected'), true);
    assert.equal(home.connectionTool.menuOpen, open);
    assert.equal(document.activeElement, actions.menu);
    assert.equal(home.connectionTool.editingRoute, null);
    assert.equal(home.drag, null);
  }
  press(actions.label);
  assert.equal(home.connectionTool.labelEditing, true);
  assert.equal(document.activeElement, input);
  assert.equal(pointer('pointerdown', input).prevented, false, 'text selection keeps its native behavior');
  click(input);
  assert.equal(group.classList.contains('is-selected'), true);
  outside.focus();
  assert.equal(home.connectionTool.selected, null, 'keyboard focus outside still dismisses the tools');
});

test('connector menu clicks save labels and arrows and delete only the line', async () => {
  const {home, pointer, click, group, stage, addConnectionTools} = routeEditor();
  const {actions, input} = addConnectionTools();
  const press = async target => {
    const down = pointer('pointerdown', target);
    if (!down.prevented) stage.focus();
    pointer('pointerup', target);
    click(target);
    await new Promise(setImmediate);
  };
  const nodes = JSON.parse(JSON.stringify(home.nodes));
  await press(actions.menu);
  await press(actions.label);
  input.value = 'Texto del conector';
  await press(actions['save-label']);
  assert.equal(home.active.connection_styles[0]?.label, 'Texto del conector');
  await press(actions.menu);
  await press(actions['arrows-both']);
  assert.equal(home.active.connection_styles[0]?.arrows, 'both');
  assert.equal(group.classList.contains('is-selected'), true);
  await press(actions.menu);
  await press(actions.delete);
  assert.equal(home.connectionTool.selected, null);
  assert.equal(home.hiddenConnections.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)), nodes);
});

test('dragging a selected connector saves its bends without moving nodes and retains them after reload', async () => {
  const {home,pointer,hit,group,state,stage} = routeEditor();
  const nodes = JSON.parse(JSON.stringify(home.nodes));
  home.viewport.scale = 2;
  pointer('pointerdown',hit,{clientX:200,clientY:0});
  pointer('pointermove',hit,{clientX:200,clientY:80});
  assert.equal(stage.hasPointerCapture(1),true);
  assert.equal(home.viewport.options.canInteract(),false);
  pointer('pointerup',stage,{clientX:200,clientY:80});
  await new Promise(setImmediate);
  assert.equal(stage.hasPointerCapture(1),false);
  assert.equal(home.connectionTool.editingRoute,null);
  const points=home.active.connection_styles[0].points;
  assert.ok(points.some(p=>p[1]===40),'drag respects diagram zoom');
  assert.deepEqual(JSON.parse(JSON.stringify(home.nodes)),nodes);
  assert.equal(home.hasChanges(),false);
  const restored=editor({draft:false,state:JSON.parse(JSON.stringify(state))});
  restored.home.render();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.home.connectionStyles)),JSON.parse(JSON.stringify(home.connectionStyles)));
});

test('route Escape and pointer cancellation discard previews and release pointer capture without saving', () => {
  for(const end of ['Escape','pointercancel']) {
    const {home,pointer,hit,handleKey,stage}=routeEditor();
    let calls=0;home.makeRequest=async()=>{calls++;};
    pointer('pointerdown',hit,{clientX:100,clientY:0});
    pointer('pointermove',hit,{clientX:100,clientY:30});
    if(end==='Escape')handleKey('Escape',hit);else pointer(end,stage);
    assert.equal(home.connectionTool.editingRoute,null);
    assert.equal(stage.hasPointerCapture(1),false);
    assert.equal(home.connectionStyles.length,0);
    assert.equal(calls,0);
  }
});

test('double-click inserts bends, and arrow settings and a label survive subsequent route edits', async () => {
  const {home,hit,doubleClick}=routeEditor();
  home.connectionTool.point=()=>[100,0];
  doubleClick(hit);
  await new Promise(setImmediate);
  assert.ok(home.connectionStyles[0].points.length>2);
  await home.connectionTool.setStyle({label:'Depende de <otra tarea>',arrows:'both'});
  assert.equal(home.active.connection_styles[0].label,'Depende de <otra tarea>');
  assert.equal(home.active.connection_styles[0].arrows,'both');
  const points=JSON.parse(JSON.stringify(home.connectionStyles[0].points));
  home.connectionTool.action('arrows-left');
  await new Promise(setImmediate);
  assert.equal(home.active.connection_styles[0].arrows,'start');
  assert.deepEqual(JSON.parse(JSON.stringify(home.connectionStyles[0].points)),points);
  home.connectionTool.action('arrows-right');
  await new Promise(setImmediate);
  assert.equal(home.active.connection_styles[0].arrows,'end');
  home.connectionTool.action('arrows-both');
  await new Promise(setImmediate);
  assert.equal(home.active.connection_styles[0].arrows,'both');
  home.connectionTool.action('arrows-none');
  await new Promise(setImmediate);
  assert.equal(home.active.connection_styles[0].arrows,'none');
  home.connectionTool.action('delete');
  await new Promise(setImmediate);
  assert.equal(home.connectionStyles.length,0);
  assert.equal(home.hiddenConnections.length,1);
  assert.equal(home.nodes.length,5);
});

test('linear connectors keep square baseline junctions when rendered and when labelled', () => {
  const { home, addConnectionElement } = branchDragEditor();
  const { svg } = addConnectionElement('root', 'branch');
  const edge = { from: 'root', to: 'branch', points: [[100,100],[300,100],[300,50]], cornerRadius: 0, path: 'M100,100 L300,100 L300,50' };
  home.plan = { origin: { x: 0, y: 0 }, edges: [edge] };
  home.connectionStyles = [{ from: 'root', to: 'branch', points: null, label: 'Semana', arrows: 'none' }];
  home.connectionTool.render(svg, [edge]);
  assert.equal(home.connectionTool.drawn[0].path, edge.path);
  assert.ok(svg.innerHTML.includes('M100,100 L300,100 L300,50'));
  assert.ok(svg.innerHTML.includes('Semana'));
  home.connectionTool.render(svg, [{ ...edge, cornerRadius: 6 }]);
  assert.ok(home.connectionTool.drawn[0].path.includes('Q'), 'other layouts retain their rounded turns');
});

function undoEditor() {
  const fixture = branchDragEditor();
  fixture.home.history.reconcile();
  fixture.home.makeRequest = async (action, data) => ({ ...JSON.parse(JSON.stringify(data)), version: data.version + 1 });
  return fixture;
}

const plain = value => JSON.parse(JSON.stringify(value));

test('Command Z and Control Z undo one edit per press and persist with the latest version', async () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const { home, node, handleKey } = savedEditor();
    const requests = [];
    home.makeRequest = async (action, data) => {
      requests.push(plain(data));
      return { ...plain(data), version: data.version + 1 };
    };
    for (const text of ['First edit', 'Second edit']) { home.name = text; await home.save(); }
    assert.equal(handleKey('z', node, { [modifier]: true }).prevented, true);
    await new Promise(setImmediate);
    assert.equal(home.name, 'First edit');
    assert.equal(home.active.version, 4);
    assert.equal(handleKey('Z', node, { [modifier]: true }).prevented, true);
    await new Promise(setImmediate);
    assert.equal(home.name, 'Idea guardada');
    assert.equal(home.hasChanges(), false);
    assert.deepEqual(requests.map(item => item.version), [1, 2, 3, 4]);
    assert.equal(await home.history.undo(), false);
    assert.equal(requests.length, 4);
  }
});

test('undo leaves Shift combinations, native text undo, other pages and dialogs alone', async () => {
  const { home, node, field, titleInput, state, handleKey, document } = savedEditor();
  home.name = 'Pending';
  const nativeTargets = [
    { tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { isContentEditable: true }, titleInput,
  ];
  for (const target of nativeTargets) assert.equal(handleKey('z', target, { metaKey: true }).prevented, false);
  home.beginEditing();
  assert.equal(handleKey('z', field, { ctrlKey: true }).prevented, false);
  home.editing = false;
  for (const modifiers of [{ metaKey: true, shiftKey: true }, { ctrlKey: true, shiftKey: true },
    { ctrlKey: true, altKey: true }, { metaKey: true, isComposing: true }, {}]) {
    assert.equal(handleKey('z', node, modifiers).prevented, false);
  }
  state.view = 'profile';
  assert.equal(handleKey('z', node, { ctrlKey: true }).prevented, false);
  state.view = 'home';
  const query = document.querySelector;
  document.querySelector = selector => selector === 'dialog[open]' ? {} : query(selector);
  assert.equal(handleKey('z', node, { metaKey: true }).prevented, false);
  assert.equal(home.name, 'Pending');
  assert.equal(home.history.past.length, 0);
});

test('undo ignores held keys and active gestures but works from the background and checkboxes', async () => {
  const { home, outside, checkbox, handleKey } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...plain(data), version: data.version + 1 });
  home.name = 'Edit';
  await home.save();
  for (const flag of ['drag', 'resizing', 'layoutOpen', 'switching']) {
    home[flag] = true;
    assert.equal(handleKey('z', outside, { ctrlKey: true }).prevented, true);
    assert.equal(home.name, 'Edit');
    home[flag] = false;
  }
  handleKey('z', outside, { metaKey: true, repeat: true });
  assert.equal(home.name, 'Edit');
  checkbox.tagName = 'INPUT'; checkbox.type = 'checkbox';
  handleKey('z', checkbox, { ctrlKey: true });
  await new Promise(setImmediate);
  assert.equal(home.name, 'Idea guardada');
  home.name = 'Another'; await home.save();
  handleKey('z', outside, { metaKey: true });
  await new Promise(setImmediate);
  assert.equal(home.name, 'Idea guardada');
});

test('undo captures edits before the autosave debounce without creating a redundant request', async () => {
  const { home, timers } = savedEditor();
  home.makeRequest = () => { throw new Error('Nothing changed on the server'); };
  home.name = 'Not saved yet';
  home.scheduleSave();
  assert.ok(timers.size);
  assert.equal(await home.history.undo(), true);
  assert.equal(home.name, 'Idea guardada');
  assert.equal(home.hasChanges(), false);
  assert.equal(timers.size, 0);
});

test('undo restores all node content, positions, styles and the independent diagram title', async () => {
  const { home } = undoEditor();
  const initial = plain(home.history.capture());
  const changes = [
    () => { home.nodes[1].x = 500; home.nodes[2].y = -250; },
    () => { home.nodes[1].width = 320; },
    () => { home.nodes[1].layout = { mode: 'linear', direction: 'up', vertical: 'top', horizontal: 'ltr' }; },
    () => { home.nodes[1].checkbox = true; },
    () => { home.nodes[1].image = 'data:image/png;base64,aGVsbG8='; },
    () => { home.nodes[1].labels = [{ text: 'Outside', position: 'outside' }, { text: 'Inside', position: 'inside' }]; },
    () => { home.nodes[1].link = { diagram_id: 52, node_id: 'root' }; },
    () => { home.diagramTitle = 'New title'; },
  ];
  const snapshots = [];
  for (const change of changes) { snapshots.push(plain(home.history.capture())); change(); await home.save(); }
  for (const before of snapshots.reverse()) {
    await home.history.undo();
    assert.equal(home.history.same(home.history.capture(), before), true);
    assert.equal(home.hasChanges(), false);
  }
  assert.equal(home.history.same(home.history.capture(), initial), true);
});

test('undo restores deleted branches with their original identifiers and complete connections', async () => {
  const { home } = undoEditor();
  home.connections = [{ from: 'leaf', to: 'sibling' }];
  home.hiddenConnections = [{ from: 'branch', to: 'inherited' }];
  home.connectionStyles = [{ from: 'leaf', to: 'sibling', points: [[10, 20], [50, 20]], label: 'Link', arrows: 'both' }];
  await home.save();
  const before = plain(home.history.capture());
  home.selectNode('branch');
  await home.nodeTools.deleteNode('branch');
  assert.equal(home.nodes.length, 2);
  await home.history.undo();
  assert.equal(home.history.same(home.history.capture(), before), true);
  assert.equal(home.selectedKey, 'branch');
  assert.equal(home.active.nodes.length, 5);
  home.connectionStyles[0].points[0][0] = 999;
  assert.equal(home.history.present.connectionStyles[0].points[0][0], 10, 'restored data never aliases history');
});

test('undo removes a pasted branch as one operation and preserves the clipboard', async () => {
  const { home } = undoEditor();
  const before = plain(home.nodes);
  home.selectNode('branch');
  await home.nodeTools.copy();
  home.selectNode('sibling');
  await home.nodeTools.paste();
  assert.equal(home.nodes.length, 8);
  await home.history.undo();
  assert.deepEqual(plain(home.nodes), before);
  assert.equal(home.nodeTools.clipboard().nodes.length, 3);
});

test('undo restores multiple roots after canonical-root deletion and promotion', async () => {
  const { home } = forestEditor();
  home.history.reconcile();
  const before = plain(home.nodes);
  await home.nodeTools.deleteNode('root');
  assert.equal(home.nodes[0].text, 'Segunda raíz');
  await home.history.undo();
  assert.deepEqual(plain(home.nodes), before);
  assert.deepEqual(plain(home.active.nodes), before);
});

test('undo restores line visibility, extra connections, labels, arrows and bends independently', async () => {
  const { home } = undoEditor();
  const snapshots = [];
  const changes = [
    () => home.connections.push({ from: 'leaf', to: 'sibling' }),
    () => home.hiddenConnections.push({ from: 'root', to: 'branch' }),
    () => home.connectionStyles.push({ from: 'leaf', to: 'sibling', label: 'Connection', arrows: 'both', points: [[1, 2], [4, 2]] }),
    () => { home.connectionStyles[0].points[0][0] = 50; home.connectionStyles[0].label = 'Edited'; },
  ];
  for (const change of changes) { snapshots.push(home.history.capture()); change(); await home.save(); }
  for (const before of snapshots.reverse()) {
    await home.history.undo();
    assert.equal(home.history.same(home.history.capture(), before), true);
    assert.equal(home.hasChanges(), false);
  }
});

test('rapid undo during a pending request saves the final restored document with the returned version', async () => {
  const { home } = savedEditor();
  const requests = [];
  let resolve;
  home.makeRequest = async (action, data) => {
    requests.push(plain(data));
    if (requests.length === 1) await new Promise(done => { resolve = done; });
    return { ...plain(data), version: data.version + 1 };
  };
  home.name = 'First';
  const pending = home.save();
  home.name = 'Second';
  home.save();
  const undoFirst = home.history.undo();
  assert.equal(home.name, 'First');
  const undoSecond = home.history.undo();
  assert.equal(home.name, 'Idea guardada');
  resolve();
  await Promise.all([pending, undoFirst, undoSecond]);
  assert.equal(home.active.nodes[0].text, 'Idea guardada');
  assert.equal(home.active.version, 3);
  assert.deepEqual(requests.map(item => item.version), [1, 2]);
  assert.equal(home.history.past.length, 0);
  assert.equal(home.hasChanges(), false);
});

test('failed undo save remains editable and retryable without reintroducing the undone edit', async () => {
  const { home } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...plain(data), version: data.version + 1 });
  home.name = 'Edit'; await home.save();
  home.makeRequest = async () => { throw new Error('Offline'); };
  await home.history.undo();
  assert.equal(home.name, 'Idea guardada');
  assert.equal(home.error, 'Offline');
  assert.equal(home.hasChanges(), true);
  home.makeRequest = async (action, data) => ({ ...plain(data), version: data.version + 1 });
  await home.save();
  assert.equal(home.hasChanges(), false);
  assert.equal(home.history.past.length, 0);
});

test('new edits after undo replace the abandoned future and camera changes do not add steps', async () => {
  const { home } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...plain(data), version: data.version + 1 });
  home.name = 'A'; await home.save();
  home.name = 'B'; await home.save();
  await home.history.undo();
  home.viewport.x = 157; home.viewport.y = -42; home.viewport.scale = 1.6;
  home.name = 'C'; await home.save();
  await home.history.undo();
  assert.equal(home.name, 'A');
  await home.history.undo();
  assert.equal(home.name, 'Idea guardada');
  assert.deepEqual([home.viewport.x, home.viewport.y, home.viewport.scale], [157, -42, 1.6]);
  assert.equal(await home.history.undo(), false);
});

test('history is capped at 50 steps and is cleared for external changes, another diagram or account reset', async () => {
  const { home, state } = savedEditor();
  home.makeRequest = async (action, data) => ({ ...plain(data), version: data.version + 1 });
  for (let i = 1; i <= 55; i++) { home.name = String(i); await home.save(); }
  assert.equal(home.history.past.length, 50);
  home.selected = false;
  home.render();
  assert.equal(home.history.past.length, 50, 'ordinary redraws retain local history');
  state.data.diagrams[0] = { ...plain(home.active), nodes: [{ id: 'root', parent_id: null, text: 'Remote edit' }] };
  home.render();
  assert.equal(home.name, 'Remote edit');
  assert.equal(await home.history.undo(), false);
  home.name = 'Local edit'; await home.save();
  home.active = { id: 99, name: 'Another diagram', version: 1 };
  home.nodes = home.treeFor(home.active); home.name = 'Another diagram'; home.diagramTitle = home.name;
  home.history.ensure();
  assert.equal(await home.history.undo(), false);
  home.name = 'Another edit'; await home.save();
  home.reset();
  assert.equal(home.history.past.length, 0);
  assert.equal(home.history.present, null);
});

test('first-save ID assignment preserves draft edit history and late saves cannot undo account reset', async () => {
  const { home } = editor();
  home.name = 'Nuevo diagrama'; home.drawStage();
  let resolve;
  let calls = 0;
  home.makeRequest = async (action, data) => {
    if (++calls === 1) await new Promise(done => { resolve = done; });
    return { ...plain(data), id: 51, version: (data.version || 0) + 1 };
  };
  const first = home.save();
  home.name = 'Draft edit'; home.save();
  resolve(); await first;
  await home.save();
  await home.history.undo();
  assert.equal(home.name, 'Nuevo diagrama');
  assert.equal(home.active.nodes[0].text, 'Nuevo diagrama');
  home.name = 'Pending old account edit';
  home.makeRequest = async (action, data) => {
    await new Promise(done => { resolve = done; });
    return { ...plain(data), version: data.version + 1 };
  };
  const pending = home.save();
  const undo = home.history.undo();
  home.reset();
  resolve(); await Promise.all([pending, undo]);
  assert.equal(home.active, null);
  assert.equal(home.nodes, null);
  assert.equal(home.history.present, null);
});
