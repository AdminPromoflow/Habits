'use strict';

class HomePage extends PageController {
  constructor() {
    super(['create-diagram', 'retry-diagram', 'toggle-diagram-menu', 'diagram-layout', 'add-diagram-child']);
    this.generation = 0;
    this.viewport = new DiagramViewport({
      canInteract: () => !this.drag && !this.layoutOpen,
      onInteractionStart: () => {
        this.menuOpen = false;
        this.syncNodeState();
      },
    });
    this.reset();
    document.addEventListener('click', (event) => {
      if (this.suppressNodeClick) {
        this.suppressNodeClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const node = event.target.closest?.('.diagram-node');
      if (node) {
        this.menuOpen = false;
        this.selectNode(this.keyFor(node));
        if (!this.editing) node.focus({ preventScroll: true });
      } else if (this.selected && !event.target.closest?.('.diagram-root')) {
        this.element('name')?.blur();
        this.selected = false;
        this.menuOpen = false;
        this.syncNodeState();
      }
    });
    document.addEventListener('dblclick', (event) => {
      if (!event.target.closest?.('.diagram-node') || this.editing) return;
      event.preventDefault();
      this.selectNode(this.keyFor(event.target));
      this.beginEditing();
    });
    document.addEventListener('input', (event) => {
      if (!this.isNameField(event.target) || event.target.readOnly) return;
      this.name = event.target.value;
      this.resizeNode(event.target);
      this.scheduleSave();
    });
    document.addEventListener('focusin', (event) => {
      if (event.target.classList?.contains('diagram-node')) {
        this.selectNode(this.keyFor(event.target));
        if (event.target.matches?.(':focus-visible')) this.viewport.reveal(event.target);
      }
      if (this.isNameField(event.target) && !event.target.readOnly) {
        this.selected = true;
        this.editing = true;
        this.syncNodeState();
      }
    });
    document.addEventListener('focusout', (event) => {
      if (!this.isNameField(event.target) || !this.editing) return;
      this.editing = false;
      this.syncNodeState();
      void this.save();
    });
    document.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && this.menuOpen) {
        event.preventDefault();
        this.menuOpen = false;
        this.syncNodeState();
        this.element('more')?.focus({ preventScroll: true });
        return;
      }
      if (event.target.classList?.contains('diagram-node')) {
        if (event.key === 'Enter' || event.key === 'F2') {
          event.preventDefault();
          this.beginEditing();
        } else if (event.key === ' ') {
          event.preventDefault();
          this.selectNode();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.selected = false;
          this.syncNodeState();
        }
        return;
      }
      if (!this.isNameField(event.target) || event.target.readOnly) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!this.name.trim()) this.showStatus(t('diagram_name_required'), true);
        else {
          event.target.blur();
          this.element('node')?.focus({ preventScroll: true });
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearTimeout(this.timer);
        if (this.saving) return;
        this.name = this.savedNode()?.text || this.active?.name || '';
        this.commitName();
        this.draft = null;
        this.selected = !!this.active;
        this.editing = false;
        this.error = '';
        this.drawStage();
        const target = this.element('node') ||
          document.querySelector('[data-action="create-diagram"]');
        target?.focus({ preventScroll: true });
      }
    });
    window.addEventListener('resize', () => { this.resizeNode(); this.positionTree(); });
    this.bindDragging();
    window.addEventListener('beforeunload', (event) => {
      if (this.saving || this.hasChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  reset() {
    clearTimeout(this.timer);
    this.generation++;
    this.finishNodeDrag(false);
    this.viewport?.reset();
    this.suppressNodeClick = false;
    this.layoutPanel?.close();
    this.layoutPanel = null;
    this.layoutOpen = false;
    this.nodes = null;
    this.selectedKey = 'root';
    this.plan = null;
    this.drag = null;
    this.active = null;
    this.draft = null;
    this.name = '';
    this.selected = false;
    this.menuOpen = false;
    this.editing = false;
    this.saving = false;
    this.error = '';
  }

  render() {
    if (!this.isEditing()) {
      this.active =
        S.data.diagrams?.find((item) => item.id === this.active?.id) ||
        S.data.diagrams?.[0] ||
        null;
      this.selectedKey = 'root';
      this.nodes = this.treeFor(this.active);
      this.name = this.active?.name || '';
    }
    return renderTemplate('home', {
      greeting: t('greeting', { name: esc(S.user.name.split(' ')[0]) }),
      plus: icon('plus'),
      newHabit: t('new_habit'),
      diagramLabel: t('diagram_canvas'),
      content: this.stageContent(),
    });
  }

  stageContent() {
    if (!this.active && !this.draft)
      return renderTemplate('diagram-start', { label: t('create_diagram') });
    this.commitName();
    const nodes = this.ensureTree();
    if (nodes.length > 1) return renderTemplate('diagram-tree', {
      nodes: nodes.map((node) => this.nodeContent(node)).join(''),
    });
    return this.nodeContent(nodes[0]);
  }

  nodeContent(node) {
    const options = ['copy', 'cut', 'paste', 'trash', 'image', 'format',
      'link', 'checkbox', 'calendar', 'tag', 'branch', 'resize'];
    const menuFields = Object.fromEntries(options.flatMap((name) => [
      [`${name}Label`, esc(t(`diagram_option_${name}`))],
      [`${name}Icon`, icon(name)],
    ]));
    return renderTemplate('diagram-node', {
      ...menuFields,
      nodeKey: esc(node.id),
      suffix: node.id === 'root' ? '' : `-${esc(node.id)}`,
      addChildLabel: esc(t('diagram_add_child')),
      label: t('diagram_name'),
      placeholder: t('diagram_name'),
      hint: t('diagram_interaction_hint'),
      nodeLabel: esc(`${t('diagram_name')}: ${node.text}`),
      menuLabel: t('diagram_options'),
      name: esc(node.text),
    });
  }

  mount() {
    this.syncNodeState();
    for (const node of this.ensureTree()) this.resizeNode(this.element('name', node.id), false);
    this.positionTree();
    if (this.error) this.showStatus(this.error, true);
  }

  keyFor(target) {
    return target.closest?.('.diagram-root')?.dataset?.nodeKey || 'root';
  }

  element(part, key = this.selectedKey) {
    return document.getElementById(`diagram-${part}${key === 'root' ? '' : `-${key}`}`);
  }

  isNameField(target) {
    return target.id === 'diagram-name' || target.id?.startsWith('diagram-name-');
  }

  treeFor(diagram) {
    return diagram?.nodes?.length ? JSON.parse(JSON.stringify(diagram.nodes)) : [{
      id: 'root', parent_id: null, text: diagram?.name || '', layout: null, x: null, y: null,
    }];
  }

  ensureTree() {
    if (!this.nodes) this.nodes = this.treeFor(this.active);
    return this.nodes;
  }

  commitName() {
    const node = this.ensureTree().find((item) => item.id === this.selectedKey);
    if (node) node.text = this.name;
  }

  savedNode() {
    return this.treeFor(this.active).find((item) => item.id === this.selectedKey);
  }

  snapshot() {
    this.commitName();
    return this.ensureTree().map((node) => ({ ...node, text: this.normalizedName(node.text) }));
  }

  hasChanges() {
    if (!this.active && !this.draft) return false;
    const nodes = this.snapshot();
    if (nodes.some((node) => !node.text.trim())) return false;
    return !!this.draft || this.fingerprint(nodes) !== this.fingerprint(this.treeFor(this.active));
  }

  fingerprint(nodes) {
    return JSON.stringify(nodes.map((node) => ({
      id: node.id, parent_id: node.parent_id, text: node.text,
      layout: node.layout ? {
        mode: node.layout.mode, direction: node.layout.direction,
        vertical: node.layout.vertical, horizontal: node.layout.horizontal,
      } : null,
      x: node.x ?? null, y: node.y ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id)));
  }

  selectNode(key = this.selectedKey) {
    if (!this.active && !this.draft) return;
    if (key !== this.selectedKey) {
      this.element('name')?.blur();
      this.commitName();
      this.selectedKey = key;
      this.name = this.ensureTree().find((node) => node.id === key)?.text || '';
      this.editing = false;
      this.menuOpen = false;
    }
    this.selected = true;
    this.syncNodeState();
  }

  beginEditing() {
    if (!this.active && !this.draft) return;
    this.selected = true;
    this.menuOpen = false;
    this.editing = true;
    this.syncNodeState();
    const input = this.element('name');
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }

  syncNodeState() {
    for (const item of this.ensureTree()) {
      const selected = this.selected && item.id === this.selectedKey;
      const editing = selected && this.editing;
      const root = this.element('root', item.id);
      const node = this.element('node', item.id);
      const input = this.element('name', item.id);
      const controls = this.element('controls', item.id);
      const menu = this.element('menu', item.id);
      const more = this.element('more', item.id);
      const menuVisible = selected && this.menuOpen;
      root?.classList.toggle('is-selected', selected);
      root?.classList.toggle('is-editing', editing);
      if (controls) controls.hidden = !selected;
      if (menu) menu.hidden = !menuVisible;
      more?.setAttribute('aria-expanded', String(menuVisible));
      if (node) {
        node.tabIndex = editing ? -1 : 0;
        node.setAttribute('role', editing ? 'group' : 'button');
        node.setAttribute('aria-label', `${t('diagram_name')}: ${item.text}`);
        if (editing) node.removeAttribute('aria-pressed');
        else node.setAttribute('aria-pressed', String(selected));
      }
      if (input) {
        input.readOnly = !editing;
        input.tabIndex = editing ? 0 : -1;
        input.setAttribute('aria-hidden', String(!editing));
      }
    }
  }

  resizeNode(input = this.element('name'), relayout = true) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
    if (relayout && (this.active || this.draft)) this.positionTree();
  }

  normalizedName(value = this.name) {
    // Keep intentional newlines, including an empty first or last line.
    return value.replace(/^[^\S\r\n]+|[^\S\r\n]+$/g, '');
  }

  drawStage() {
    const stage = document.getElementById('mindmap-stage');
    if (stage) stage.innerHTML = this.stageContent();
    this.mount();
  }

  positionTree() {
    const stage = document.getElementById('mindmap-stage');
    const scene = document.getElementById('diagram-scene');
    const enabled = !!(this.active || this.draft);
    stage?.classList.toggle('has-diagram', enabled);
    stage?.classList.toggle('has-tree', this.ensureTree().length > 1);
    if (!scene) {
      const root = this.element('root', 'root');
      const node = this.ensureTree().find((item) => item.id === 'root');
      this.viewport.mount(stage, enabled ? root : null, {
        anchorX: (root?.offsetWidth || 220) / 2 - (node?.x || 0),
        anchorY: (root?.offsetHeight || 48) / 2 - (node?.y || 0),
      });
      return;
    }
    this.commitName();
    const sizes = Object.fromEntries(this.nodes.map((node) => {
      const input = this.element('name', node.id);
      return [node.id, { width: 220, height: Math.max(48, (input?.scrollHeight || 24) + 24) }];
    }));
    this.plan = DiagramLayout.arrange(this.nodes, sizes);
    scene.style.width = `${this.plan.width}px`;
    scene.style.height = `${this.plan.height}px`;
    const connections = document.getElementById('diagram-connections');
    if (connections) {
      connections.setAttribute('width', this.plan.width);
      connections.setAttribute('height', this.plan.height);
      connections.innerHTML = this.plan.edges.map((edge) => `<path d="${edge.path}"/>`).join('');
    }
    for (const position of this.plan.nodes) {
      const root = this.element('root', position.id);
      if (!root) continue;
      root.style.transform = `translate(${position.x}px, ${position.y}px)`;
      const box = this.element('node', position.id);
      if (box) {
        box.style.width = `${position.width}px`;
        box.style.minHeight = `${position.height}px`;
      }
    }
    const rootPosition = this.plan.nodes.find((node) => node.id === 'root');
    this.viewport.mount(stage, scene, {
      anchorX: this.plan.origin.x + rootPosition.width / 2,
      anchorY: this.plan.origin.y + rootPosition.height / 2,
    });
  }

  async addChild() {
    this.commitName();
    const nodes = this.ensureTree();
    if (nodes.length >= 200) {
      this.showStatus(t('diagram_node_limit'), true);
      return;
    }
    let ancestor = nodes.find((node) => node.id === this.selectedKey);
    let depth = 0;
    while (ancestor?.parent_id) {
      depth++;
      ancestor = nodes.find((node) => node.id === ancestor.parent_id);
    }
    if (depth >= 29) {
      this.showStatus(t('diagram_depth_limit'), true);
      return;
    }
    const child = {
      id: crypto.randomUUID(), parent_id: this.selectedKey,
      text: t('diagram_child_name'), layout: null, x: null, y: null,
    };
    nodes.push(child);
    this.selectedKey = child.id;
    this.name = child.text;
    this.selected = true;
    this.editing = false;
    this.menuOpen = false;
    this.drawStage();
    this.element('node')?.focus({ preventScroll: true });
    this.viewport.reveal(this.element('root'));
    await this.save();
  }

  openLayout() {
    if (!this.active && !this.draft) return;
    this.element('name')?.blur();
    this.commitName();
    const node = this.nodes.find((item) => item.id === this.selectedKey);
    const key = node.id;
    const generation = this.generation;
    this.menuOpen = false;
    this.layoutOpen = true;
    this.syncNodeState();
    this.layoutPanel = new DiagramLayoutPanel({
      onApply: (layout) => {
        if (this.generation !== generation) return;
        this.applyLayout(key, layout);
      },
      onClose: () => {
        this.layoutOpen = false;
        this.element('more')?.focus({ preventScroll: true });
      },
    });
    this.layoutPanel.open({
      layout: node.layout,
      inherited: node.parent_id
        ? DiagramLayout.effective(this.nodes, node.parent_id)
        : DiagramLayout.defaults('horizontal'),
      isRoot: !node.parent_id,
    });
  }

  applyLayout(key, layout) {
    const node = this.ensureTree().find((item) => item.id === key);
    if (!node) return;
    node.layout = layout ? { ...layout } : null;
    // Choosing a distribution arranges this branch again; nested styles remain.
    for (const item of this.branchNodes(key)) { item.x = null; item.y = null; }
    this.positionTree();
    void this.save();
  }

  branchNodes(key) {
    const ids = new Set([key]);
    const nodes = this.ensureTree();
    let added;
    do {
      added = false;
      for (const node of nodes) {
        if (ids.has(node.parent_id) && !ids.has(node.id)) { ids.add(node.id); added = true; }
      }
    } while (added);
    return nodes.filter((node) => ids.has(node.id));
  }

  finishNodeDrag(save = true) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.root.classList.remove('is-dragging');
    if (drag.root.hasPointerCapture?.(drag.pointerId)) drag.root.releasePointerCapture(drag.pointerId);
    if (drag.moving && save) {
      this.suppressNodeClick = true;
      void this.save();
    }
  }

  bindDragging() {
    document.addEventListener('pointerdown', (event) => {
      this.suppressNodeClick = false;
      const box = event.target.closest?.('.diagram-node');
      const root = box?.closest('.diagram-root');
      if (event.button !== 0 || event.isPrimary === false || !root || this.editing ||
          this.layoutOpen || this.viewport.isInteracting()) return;
      const key = this.keyFor(root);
      if (!this.selected || key !== this.selectedKey) return;
      const node = this.ensureTree().find((item) => item.id === key);
      const position = this.plan?.nodes.find((item) => item.id === key);
      this.drag = {
        key, root, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY,
        x: position ? position.x - this.plan.origin.x : node.x || 0,
        y: position ? position.y - this.plan.origin.y : node.y || 0,
        scale: this.viewport.scale,
        descendants: this.branchNodes(key).filter((item) => item.id !== key &&
          Number.isFinite(item.x) && Number.isFinite(item.y)).map((item) => ({ id: item.id, x: item.x, y: item.y })),
        moving: false,
      };
    });
    document.addEventListener('pointermove', (event) => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moving && Math.hypot(dx, dy) < 5) return;
      event.preventDefault();
      if (!drag.moving) drag.root.setPointerCapture(event.pointerId);
      drag.moving = true;
      this.menuOpen = false;
      this.syncNodeState();
      drag.root.classList.add('is-dragging');
      const node = this.nodes.find((item) => item.id === drag.key);
      const limit = (value) => Math.round(Math.max(-1000000, Math.min(1000000, value)) * 100) / 100;
      node.x = limit(drag.x + dx / drag.scale);
      node.y = limit(drag.y + dy / drag.scale);
      for (const old of drag.descendants) {
        const child = this.nodes.find((item) => item.id === old.id);
        child.x = limit(old.x + node.x - drag.x);
        child.y = limit(old.y + node.y - drag.y);
      }
      this.positionTree();
    });
    const finish = (event) => {
      if (this.drag && event.pointerId === this.drag.pointerId) this.finishNodeDrag();
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    document.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', () => this.finishNodeDrag());
  }

  async handleAction(action, button) {
    if (action === 'retry-diagram') return this.save();
    if (button?.closest?.('.diagram-root')) this.selectNode(this.keyFor(button));
    if (action === 'diagram-layout') return this.openLayout();
    if (action === 'add-diagram-child') return this.addChild();
    if (action === 'toggle-diagram-menu') {
      if (!this.active && !this.draft) return;
      this.selected = true;
      this.menuOpen = !this.menuOpen;
      this.syncNodeState();
      return;
    }
    if (action !== 'create-diagram' || this.active || this.draft) return;
    this.draft = { client_key: crypto.randomUUID() };
    this.name = t('diagram_default_name');
    this.error = '';
    this.selected = true;
    this.editing = false;
    this.drawStage();
    this.element('node')?.focus({ preventScroll: true });
    // Persist the creation itself, even when the user has not named it yet.
    await this.save();
  }

  isEditing() {
    return !!(
      this.draft ||
      this.selected ||
      this.editing ||
      this.saving ||
      this.error ||
      this.layoutOpen ||
      this.drag ||
      this.viewport.isInteracting() ||
      this.hasChanges()
    );
  }

  scheduleSave() {
    clearTimeout(this.timer);
    if (this.name.trim()) this.timer = setTimeout(() => void this.save(), 700);
  }

  async save() {
    clearTimeout(this.timer);
    const nodes = this.snapshot();
    const name = nodes.find((node) => node.id === 'root').text;
    const invalid = nodes.some((node) => !node.text.trim());
    if (invalid || this.saving || (!this.active && !this.draft)) {
      if (invalid && this.active) this.showStatus(t('diagram_name_required'), true);
      return;
    }
    if (!this.hasChanges()) {
      this.showStatus(t('diagram_saved'));
      return;
    }
    const generation = this.generation;
    const data = this.active
      ? { id: this.active.id, version: this.active.version, name, nodes }
      : { client_key: this.draft.client_key, name, nodes };
    this.saving = true;
    this.error = '';
    this.showStatus(t('diagram_saving'));
    let saved = false;
    try {
      const diagram = await this.makeRequest('saveDiagram', data);
      if (generation !== this.generation) return;
      diagram.nodes ||= nodes.map((node) => node.id === 'root' ? { ...node, text: diagram.name } : node);
      this.active = diagram;
      this.draft = null;
      S.data.diagrams = [
        diagram,
        ...(S.data.diagrams || []).filter((item) => item.id !== diagram.id),
      ];
      this.showStatus(t('diagram_saved'));
      saved = true;
    } catch (error) {
      if (generation === this.generation) this.showStatus(error.message, true);
    } finally {
      if (generation === this.generation) {
        this.saving = false;
        // Serialize typing during a request so the newest name always wins.
        if (saved && this.hasChanges()) this.scheduleSave();
      }
    }
  }

  showStatus(message, error = false) {
    this.error = error ? message : '';
    const status = this.element('status');
    if (!status) return;
    status.className = error ? 'diagram-status is-error' : 'diagram-status sr-only';
    status.textContent = message;
    if (error && this.name.trim()) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'text-btn';
      retry.dataset.action = 'retry-diagram';
      retry.textContent = t('diagram_retry');
      status.append(' ', retry);
    }
  }
}

function homePage() {
  return pageControllers.home.render();
}
