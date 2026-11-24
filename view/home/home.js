'use strict';

class HomePage extends PageController {
  constructor() {
    super(['create-diagram', 'retry-diagram', 'toggle-diagram-menu', 'diagram-layout', 'add-diagram-child', 'add-diagram-sibling',
      'diagram-checkbox-menu', 'diagram-checkbox-state', 'toggle-diagram-picker', 'select-diagram',
      'copy-diagram-node', 'cut-diagram-node', 'paste-diagram-node', 'delete-diagram-node', 'image-diagram-node', 'labels-diagram-node']);
    this.nodeTools = new DiagramNodeTools(this);
    this.generation = 0;
    this.viewport = new DiagramViewport({
      canInteract: () => !this.drag && !this.resizing && !this.layoutOpen && !this.titleEditing,
      onInteractionStart: () => {
        this.menuOpen = false;
        this.syncNodeState();
      },
    });
    this.reset();
    document.addEventListener('load', (event) => {
      if (event.target.classList?.contains('diagram-node-image')) this.positionTree();
    }, true);
    document.addEventListener('change', (event) => {
      if (event.target.classList?.contains('diagram-checkbox-scope-option') && event.target.checked &&
          this.checkboxMenuOpen && ['node', 'branch'].includes(event.target.value)) {
        this.checkboxScope = event.target.value;
        this.syncNodeState();
      }
      if (event.target.classList?.contains('diagram-task-checkbox')) {
        const checked = event.target.checked;
        this.selectNode(this.keyFor(event.target));
        void this.setCheckbox(checked);
      }
    });
    document.addEventListener('click', (event) => {
      if (this.pickerOpen && !event.target.closest?.('.diagram-picker')) this.closeDiagramPicker();
      if (this.suppressNodeClick) {
        this.suppressNodeClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const node = event.target.closest?.('.diagram-node');
      if (node) {
        if (event.target.closest?.('.diagram-task-checkbox')) return;
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
      if (event.target.closest?.('#diagram-title-label')) {
        event.preventDefault();
        this.beginTitleEditing();
        return;
      }
      if (!event.target.closest?.('.diagram-node') || event.target.closest?.('.diagram-task-checkbox') || this.editing) return;
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
      if (this.pickerOpen && !event.target.closest?.('.diagram-picker')) this.closeDiagramPicker();
      if (event.target.classList?.contains('diagram-task-checkbox')) this.selectNode(this.keyFor(event.target));
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
      if (event.target.id === 'diagram-title-input') {
        this.finishTitleEditing();
        return;
      }
      if (!this.isNameField(event.target) || !this.editing || this.keyFor(event.target) !== this.selectedKey) return;
      this.commitName();
      this.editing = false;
      this.syncNodeState();
      void this.save();
    });
    document.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.target.closest?.('.diagram-picker')) {
        this.handlePickerKey(event);
        return;
      }
      if (event.target.id === 'diagram-title-label' && ['Enter', 'F2', ' '].includes(event.key)) {
        event.preventDefault();
        this.beginTitleEditing();
        return;
      }
      if (event.target.id === 'diagram-title-input') {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          this.finishTitleEditing(event.key === 'Enter');
          document.getElementById('diagram-title-label')?.focus({ preventScroll: true });
        }
        return;
      }
      if (event.key === 'Escape' && this.menuOpen) {
        event.preventDefault();
        if (this.checkboxMenuOpen) {
          this.checkboxMenuOpen = false;
          this.syncNodeState();
          this.element('checkbox-tool')?.focus({ preventScroll: true });
          return;
        }
        this.menuOpen = false;
        this.syncNodeState();
        this.element('more')?.focus({ preventScroll: true });
        return;
      }
      if (this.checkboxMenuOpen && event.target.closest?.('.diagram-checkbox-menu') &&
          !event.target.classList?.contains('diagram-checkbox-scope-option') &&
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const options = ['none', 'toggle', 'unchecked', 'checked']
          .map((state) => this.element(`checkbox-${state}`)).filter((button) => button && !button.disabled);
        const index = options.indexOf(event.target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus({ preventScroll: true });
        return;
      }
      if (event.target.classList?.contains('diagram-node')) {
        if (['Delete', 'Backspace'].includes(event.key) &&
            !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
            this.selected && this.keyFor(event.target) === this.selectedKey &&
            !this.editing && !this.titleEditing && !this.layoutOpen && !this.switching &&
            !this.drag && !this.resizing && !this.viewport.isInteracting()) {
          event.preventDefault();
          // Holding Delete must not continue deleting the newly selected parent.
          if (!event.repeat && !this.nodeTools.busy) void this.nodeTools.remove();
        } else if (event.key === 'Enter' || event.key === 'F2') {
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
        event.target.blur();
        this.element('node')?.focus({ preventScroll: true });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearTimeout(this.timer);
        if (this.discardChildDraft()) {
          this.element('node')?.focus({ preventScroll: true });
          void this.save();
          return;
        }
        if (this.saving) return;
        this.name = this.savedNode()?.text ?? this.submittedChildren.get(this.selectedKey) ?? this.active?.name ?? '';
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
    this.bindResizing();
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
    this.finishNodeResize(false);
    this.viewport?.reset();
    this.suppressNodeClick = false;
    this.layoutPanel?.close();
    this.layoutPanel = null;
    this.layoutOpen = false;
    this.nodes = null;
    this.childDrafts = new Set();
    this.draftOrigins = new Map();
    this.submittedChildren = new Map();
    this.selectedKey = 'root';
    this.plan = null;
    this.drag = null;
    this.resizing = null;
    this.active = null;
    this.draft = null;
    this.name = '';
    this.diagramTitle = '';
    this.titleEditing = false;
    this.selected = false;
    this.menuOpen = false;
    this.checkboxMenuOpen = false;
    this.checkboxScope = 'node';
    this.editing = false;
    this.saving = false;
    this.savePromise = null;
    this.switching = false;
    this.pickerOpen = false;
    this.error = '';
  }

  render() {
    if (!this.isEditing()) {
      this.active =
        S.data.diagrams?.find((item) => item.id === this.active?.id) ||
        S.data.diagrams?.find((item) => String(item.id) === new URL(location.href).searchParams.get('diagram')) ||
        S.data.diagrams?.[0] ||
        null;
      this.selectedKey = 'root';
      this.nodes = this.treeFor(this.active);
      this.name = this.nodes.find((node) => node.id === 'root')?.text || '';
      this.diagramTitle = this.active?.name || '';
      this.rememberDiagram();
    }
    return renderTemplate('home', {
      greeting: t('greeting', { name: esc(S.user.name.split(' ')[0]) }),
      plus: icon('plus'),
      createLabel: t('create_diagram'),
      createDisabled: this.switching ? 'disabled' : '',
      diagramLabel: t('diagram_canvas'),
      diagramToolbar: this.toolbarContent(),
      content: this.stageContent(),
    });
  }

  stageContent() {
    if (!this.active && !this.draft) return '';
    this.commitName();
    const nodes = this.ensureTree();
    if (nodes.length > 1) return renderTemplate('diagram-tree', {
      nodes: nodes.map((node) => this.nodeContent(node)).join(''),
    });
    return this.nodeContent(nodes[0]);
  }

  titleName() {
    return this.diagramTitle || this.active?.name ||
      this.ensureTree().find((node) => node.id === 'root')?.text || t('diagram_default_name');
  }

  titleContent() {
    if (!this.active && !this.draft) return '';
    return renderTemplate('diagram-title', {
      name: esc(this.titleName()),
      label: esc(t('diagram_title')),
      hint: esc(t('diagram_title_hint')),
    });
  }

  syncTitleState() {
    const label = document.getElementById('diagram-title-label');
    const input = document.getElementById('diagram-title-input');
    const name = this.titleName();
    if (label) {
      label.textContent = name;
      label.setAttribute('aria-label', `${t('diagram_title')}: ${name}`);
      label.hidden = this.titleEditing;
    }
    if (input) {
      input.hidden = !this.titleEditing;
      if (!this.titleEditing) input.value = name;
    }
  }

  beginTitleEditing() {
    if ((!this.active && !this.draft) || this.titleEditing || this.layoutOpen || this.drag || this.resizing) return;
    this.element('name')?.blur();
    this.commitName();
    this.menuOpen = false;
    this.selected = false;
    this.syncNodeState();
    this.diagramTitle = this.titleName();
    this.titleEditing = true;
    this.syncTitleState();
    const input = document.getElementById('diagram-title-input');
    if (input) {
      input.value = this.diagramTitle;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  finishTitleEditing(commit = true) {
    if (!this.titleEditing) return;
    const value = document.getElementById('diagram-title-input')?.value.trim() || '';
    const changed = commit && !!value && value !== this.diagramTitle;
    this.titleEditing = false;
    if (changed) this.diagramTitle = value;
    this.syncTitleState();
    if (changed) void this.save();
  }

  toolbarContent() {
    const diagrams = S.data.diagrams || [];
    if (!diagrams.length && !this.draft) return '';
    const options = diagrams.map((diagram) =>
      `<button type="button" class="diagram-picker-option" role="menuitemradio" data-action="select-diagram" data-id="${esc(diagram.id)}" aria-checked="${diagram.id === this.active?.id}" tabindex="-1">${esc(diagram.name.replace(/\s+/g, ' ').trim())}</button>`).join('');
    const selectedName = this.draft ? t('diagram_default_name') : this.active?.name || t('my_diagrams');
    return renderTemplate('diagram-toolbar', {
      label: t('my_diagrams'),
      selectedName: esc(selectedName.replace(/\s+/g, ' ').trim()),
      triggerLabel: esc(`${t('my_diagrams')}: ${selectedName}`),
      expanded: String(this.pickerOpen),
      hidden: this.pickerOpen ? '' : 'hidden',
      disabled: this.switching ? 'disabled' : '',
      options,
    });
  }

  syncToolbar() {
    const create = document.getElementById('create-diagram');
    if (create) create.disabled = this.switching;
    const toolbar = document.getElementById('diagram-toolbar');
    if (toolbar && !this.pickerOpen) toolbar.innerHTML = this.toolbarContent();
  }

  openDiagramPicker(last = false) {
    if (this.switching || !(S.data.diagrams || []).length) return;
    this.syncToolbar();
    this.pickerOpen = true;
    const menu = document.getElementById('diagram-picker-options');
    if (menu) menu.hidden = false;
    document.getElementById('diagram-select')?.setAttribute('aria-expanded', 'true');
    const options = [...(menu?.querySelectorAll('[role="menuitemradio"]') || [])];
    (last ? options.at(-1) : options.find(option => option.getAttribute('aria-checked') === 'true') || options[0])?.focus();
  }

  closeDiagramPicker(restoreFocus = false) {
    this.pickerOpen = false;
    const menu = document.getElementById('diagram-picker-options');
    if (menu) menu.hidden = true;
    const trigger = document.getElementById('diagram-select');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  handlePickerKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDiagramPicker(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!this.pickerOpen) { this.openDiagramPicker(event.key === 'ArrowUp' || event.key === 'End'); return; }
      const menu = document.getElementById('diagram-picker-options');
      const options = [...(menu?.querySelectorAll('[role="menuitemradio"]') || [])];
      const index = options.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Tab') this.closeDiagramPicker(true);
  }

  rememberDiagram() {
    const url = new URL(location.href);
    if (this.active) url.searchParams.set('diagram', this.active.id);
    else url.searchParams.delete('diagram');
    if (url.href !== location.href) history.replaceState(null, '', url.href);
  }

  async finishBeforeSwitch() {
    const generation = this.generation;
    this.finishTitleEditing();
    this.element('name')?.blur();
    this.finishNodeDrag();
    this.finishNodeResize();
    do {
      await this.save();
      if (generation !== this.generation || this.error) return false;
    } while (this.hasChanges());
    return true;
  }

  async openDiagram(id) {
    if (this.switching || !S.data.diagrams?.some((item) => String(item.id) === String(id))) return;
    this.closeDiagramPicker();
    this.switching = true;
    this.syncToolbar();
    const generation = this.generation;
    try {
      if (!await this.finishBeforeSwitch()) return;
      const url = new URL(location.href);
      url.searchParams.set('diagram', id);
      // A document navigation reloads the editor and reads the selected tree afresh.
      location.assign(url.href);
    } finally {
      if (generation === this.generation) {
        this.switching = false;
        this.syncToolbar();
      }
    }
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
      ...this.nodeTools.content(node),
      pasteDisabled: this.nodeTools.clipboard() ? '' : 'disabled',
      checkboxNoneLabel: esc(t('diagram_checkbox_none')),
      checkboxToggleLabel: esc(t('diagram_checkbox_toggle')),
      checkboxUncheckedLabel: esc(t('diagram_checkbox_unchecked')),
      checkboxCheckedLabel: esc(t('diagram_checkbox_checked')),
      checkboxTaskLabel: esc(t('diagram_checkbox_task', { name: node.text })),
      checkboxScopeLabel: esc(t('diagram_checkbox_scope')),
      checkboxScopeNodeLabel: esc(t('diagram_checkbox_scope_node')),
      checkboxScopeBranchLabel: esc(t('diagram_checkbox_scope_branch')),
      nodeKey: esc(node.id),
      suffix: node.id === 'root' ? '' : `-${esc(node.id)}`,
      addChildLabel: esc(t('diagram_add_child')),
      addSiblingLabel: esc(t('diagram_add_sibling')),
      widthLabel: esc(t('diagram_node_width')),
      widthHint: esc(t('diagram_node_width_hint')),
      width: this.nodeWidth(node),
      label: t('diagram_name'),
      placeholder: '',
      hint: t('diagram_interaction_hint'),
      nodeLabel: esc(`${t('diagram_name')}: ${node.text}`),
      menuLabel: t('diagram_options'),
      name: esc(node.text),
    });
  }

  mount() {
    this.syncToolbar();
    this.syncTitleState();
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
      id: 'root', parent_id: null, text: diagram?.name || '', layout: null, x: null, y: null, width: null,
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

  discardChildDraft(key = this.selectedKey) {
    if (!this.childDrafts.has(key) || this.submittedChildren.has(key)) return false;
    const node = this.ensureTree().find((item) => item.id === key);
    if (!node) return false;
    clearTimeout(this.timer);
    this.childDrafts.delete(key);
    this.nodes = this.nodes.filter((item) => item.id !== key);
    const origin = this.draftOrigins.get(key) || node.parent_id || 'root';
    this.draftOrigins.delete(key);
    this.selectedKey = this.nodes.some((item) => item.id === origin) ? origin : 'root';
    this.name = this.nodes.find((item) => item.id === this.selectedKey)?.text || '';
    this.selected = true;
    this.editing = false;
    this.menuOpen = false;
    this.error = '';
    this.drawStage();
    return true;
  }

  hasChanges() {
    if (!this.active && !this.draft) return false;
    const nodes = this.snapshot();
    return !!this.draft || this.titleName() !== this.active.name ||
      this.fingerprint(nodes) !== this.fingerprint(this.treeFor(this.active));
  }

  fingerprint(nodes) {
    return JSON.stringify(nodes.map((node) => ({
      id: node.id, parent_id: node.parent_id, text: node.text,
      layout: node.layout ? {
        mode: node.layout.mode, direction: node.layout.direction,
        vertical: node.layout.vertical, horizontal: node.layout.horizontal,
      } : null,
      x: node.x ?? null, y: node.y ?? null,
      width: node.width ?? null,
      checkbox: node.checkbox ?? null,
      image: node.image ?? null,
      labels: node.labels || [],
    })).sort((a, b) => a.id.localeCompare(b.id)));
  }

  selectNode(key = this.selectedKey) {
    if (!this.active && !this.draft) return;
    if (!this.ensureTree().some((node) => node.id === key)) return false;
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
    return true;
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
    if (!this.menuOpen) this.checkboxMenuOpen = false;
    for (const item of this.ensureTree()) {
      const selected = this.selected && item.id === this.selectedKey;
      const editing = selected && this.editing;
      const root = this.element('root', item.id);
      const node = this.element('node', item.id);
      const input = this.element('name', item.id);
      const controls = this.element('controls', item.id);
      const menu = this.element('menu', item.id);
      const more = this.element('more', item.id);
      const widthHandle = this.element('width', item.id);
      const menuVisible = selected && this.menuOpen;
      const paste = this.element('paste', item.id);
      if (paste) paste.disabled = !this.nodeTools.clipboard();
      const checkboxMenuVisible = menuVisible && this.checkboxMenuOpen;
      const checkbox = this.element('checkbox', item.id);
      const checkboxState = item.checkbox ?? null;
      const checkboxMenu = this.element('checkbox-menu', item.id);
      if (checkboxMenu) checkboxMenu.hidden = !checkboxMenuVisible;
      menu?.classList.toggle('is-checkbox-menu', checkboxMenuVisible);
      menu?.setAttribute('role', checkboxMenuVisible ? 'group' : 'menu');
      for (const scope of ['node', 'branch']) {
        const radio = this.element(`checkbox-scope-${scope}`, item.id);
        if (radio) radio.checked = this.checkboxScope === scope;
      }
      this.element('checkbox-tool', item.id)?.setAttribute('aria-expanded', String(checkboxMenuVisible));
      for (const [state, value] of [['none', null], ['unchecked', false], ['checked', true]]) {
        this.element(`checkbox-${state}`, item.id)?.setAttribute('aria-checked', String(checkboxState === value));
      }
      const toggle = this.element('checkbox-toggle', item.id);
      if (toggle) toggle.disabled = checkboxState === null;
      node?.classList.toggle('has-checkbox', checkboxState !== null);
      if (checkbox) {
        checkbox.hidden = checkboxState === null;
        checkbox.checked = checkboxState === true;
        checkbox.setAttribute('aria-label', t('diagram_checkbox_task', { name: item.text }));
      }
      root?.classList.toggle('is-selected', selected);
      root?.classList.toggle('is-editing', editing);
      if (controls) controls.hidden = !selected;
      if (menu) menu.hidden = !menuVisible;
      more?.setAttribute('aria-expanded', String(menuVisible));
      widthHandle?.setAttribute('aria-valuenow', String(this.nodeWidth(item)));
      if (node) {
        node.tabIndex = editing ? -1 : 0;
        node.setAttribute('role', editing || checkboxState !== null ? 'group' : 'button');
        node.setAttribute('aria-label', `${t('diagram_name')}: ${item.text}`);
        if (editing || checkboxState !== null) node.removeAttribute('aria-pressed');
        else node.setAttribute('aria-pressed', String(selected));
      }
      if (input) {
        input.readOnly = !editing;
        input.tabIndex = editing ? 0 : -1;
        input.setAttribute('aria-hidden', String(!editing));
      }
    }
  }

  setCheckbox(value, scope = 'node') {
    const node = this.ensureTree().find((item) => item.id === this.selectedKey);
    if (!node || ![null, false, true].includes(value) || !['node', 'branch'].includes(scope)) return;
    const affected = scope === 'branch' ? this.branchNodes(node.id) : [node];
    for (const item of affected) item.checkbox = value;
    this.menuOpen = false;
    this.syncNodeState();
    this.positionTree();
    return this.save();
  }

  resizeNode(input = this.element('name'), relayout = true) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
    if (relayout && (this.active || this.draft)) this.positionTree();
  }

  nodeWidth(node) {
    return Number.isFinite(node?.width) ? Math.max(100, Math.min(600, node.width)) : 220;
  }

  setNodeWidth(key, width) {
    const node = this.ensureTree().find((item) => item.id === key);
    if (!node || !Number.isFinite(width)) return false;
    const next = Math.round(Math.max(100, Math.min(600, width)) * 100) / 100;
    if (node.width === next) return false;
    const box = this.element('node', key);
    const before = box?.getBoundingClientRect?.();
    node.width = next;
    this.positionTree();
    // Keep the node's upper-left corner in place while the layout reflows.
    const after = box?.getBoundingClientRect?.();
    if (before && after) {
      this.viewport.x += before.left - after.left;
      this.viewport.y += before.top - after.top;
      this.viewport.render();
    }
    this.syncNodeState();
    return true;
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
    const sizes = Object.fromEntries(this.ensureTree().map((node) => {
      const box = this.element('node', node.id);
      const input = this.element('name', node.id);
      const width = this.nodeWidth(node);
      if (box) { box.style.width = `${width}px`; box.style.minHeight = '0px'; }
      this.resizeNode(input, false);
      const root = this.element('root', node.id);
      if (root) root.style.width = `${width}px`;
      return [node.id, { width, height: Math.max(48, root?.offsetHeight || 0, (input?.scrollHeight || 24) + 24) }];
    }));
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
        box.style.minHeight = '0px';
      }
    }
    const rootPosition = this.plan.nodes.find((node) => node.id === 'root');
    this.viewport.mount(stage, scene, {
      anchorX: this.plan.origin.x + rootPosition.width / 2,
      anchorY: this.plan.origin.y + rootPosition.height / 2,
    });
  }

  addChild() {
    return this.addNode('child');
  }

  addSibling() {
    return this.addNode('sibling');
  }

  async addNode(relation) {
    if (!this.active && !this.draft) return;
    this.commitName();
    const source = this.ensureTree().find((node) => node.id === this.selectedKey);
    if (!source) return;
    const sibling = relation === 'sibling';
    const parentKey = sibling ? source.parent_id : source.id;
    // A parent must be persisted before it can own another local draft.
    if (!sibling && this.childDrafts.has(source.id)) {
      const generation = this.generation;
      await this.save();
      if (generation !== this.generation || this.selectedKey !== source.id || this.childDrafts.has(source.id)) return;
    }
    const nodes = this.ensureTree();
    if (nodes.length >= 200) {
      this.showStatus(t('diagram_node_limit'), true);
      return;
    }
    let ancestor = nodes.find((node) => node.id === parentKey);
    let depth = parentKey === null ? 0 : 1;
    while (ancestor?.parent_id) {
      depth++;
      ancestor = nodes.find((node) => node.id === ancestor.parent_id);
    }
    if (depth > 29) {
      this.showStatus(t('diagram_depth_limit'), true);
      return;
    }
    const child = sibling ? {
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(), parent_id: parentKey,
      text: '', x: null, y: null,
    } : {
      id: crypto.randomUUID(), parent_id: parentKey,
      text: '', layout: null, x: null, y: null, width: null,
    };
    if (nodes.reduce((total, node) => total + (node.image?.length || 0), child.image?.length || 0) > 2097152) {
      this.showStatus(t('error_diagram_image_limit'), true);
      return;
    }
    if (sibling) {
      const branch = new Set(this.branchNodes(source.id).map((node) => node.id));
      const last = nodes.reduce((index, node, i) => branch.has(node.id) ? i : index, -1);
      nodes.splice(last + 1, 0, child);
    } else nodes.push(child);
    this.childDrafts.add(child.id);
    this.draftOrigins.set(child.id, source.id);
    this.selectedKey = child.id;
    this.name = child.text;
    this.selected = true;
    this.editing = true;
    this.menuOpen = false;
    this.drawStage();
    this.viewport.reveal(this.element('root'));
    this.beginEditing();
    this.scheduleSave();
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
      onApply: (layout, scope) => {
        if (this.generation !== generation) return;
        this.applyLayout(key, layout, scope);
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

  applyLayout(key, layout, scope = 'branch') {
    const nodes = this.ensureTree();
    if (!nodes.some((item) => item.id === key)) return;
    const targets = scope === 'diagram'
      ? nodes.filter((item) => item.parent_id === null)
      : nodes.filter((item) => item.id === key);
    const affected = scope === 'diagram' ? nodes : this.branchNodes(key);
    // Every node in the chosen scope uses the new layout through inheritance.
    for (const item of affected) { item.layout = null; item.x = null; item.y = null; }
    for (const node of targets) node.layout = layout ? { ...layout } : null;
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
      if (event.target.closest?.('.diagram-task-checkbox')) return;
      const root = box?.closest('.diagram-root');
      if (event.button !== 0 || event.isPrimary === false || !root || this.editing || this.resizing ||
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

  finishNodeResize(save = true) {
    const resize = this.resizing;
    if (!resize) return;
    this.resizing = null;
    resize.root.classList.remove('is-resizing');
    if (resize.handle.hasPointerCapture?.(resize.pointerId)) resize.handle.releasePointerCapture(resize.pointerId);
    if (resize.changed && save) {
      this.suppressNodeClick = true;
      void this.save();
    }
  }

  bindResizing() {
    document.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest?.('.diagram-handle-arrows');
      if (!handle || event.button !== 0 || event.isPrimary === false || this.editing ||
          this.layoutOpen || this.drag || this.resizing || this.viewport.isInteracting()) return;
      const key = this.keyFor(handle);
      if (!this.selected || key !== this.selectedKey) return;
      event.preventDefault();
      clearTimeout(this.timer);
      this.menuOpen = false;
      this.syncNodeState();
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      const node = this.ensureTree().find((item) => item.id === key);
      this.resizing = {
        key, handle, root: this.element('root', key), pointerId: event.pointerId,
        startX: event.clientX, width: this.element('node', key)?.offsetWidth || this.nodeWidth(node),
        originalWidth: node.width ?? null, scale: this.viewport.scale, changed: false,
      };
      this.resizing.root.classList.add('is-resizing');
    });
    document.addEventListener('pointermove', (event) => {
      const resize = this.resizing;
      if (!resize || event.pointerId !== resize.pointerId) return;
      const delta = event.clientX - resize.startX;
      if (!resize.changed && Math.abs(delta) < 3) return;
      event.preventDefault();
      this.setNodeWidth(resize.key, resize.width + delta / resize.scale);
      resize.changed = this.nodes.find((node) => node.id === resize.key).width !== resize.originalWidth;
    });
    const finish = (event) => {
      if (this.resizing && event.pointerId === this.resizing.pointerId) this.finishNodeResize();
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    document.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', () => this.finishNodeResize());
    document.addEventListener('keydown', (event) => {
      const handle = event.target.closest?.('.diagram-handle-arrows');
      if (!handle || event.isComposing || this.editing || this.layoutOpen || this.drag ||
          this.resizing || this.viewport.isInteracting()) return;
      const key = this.keyFor(handle);
      if (!this.selected || key !== this.selectedKey) return;
      const node = this.ensureTree().find((item) => item.id === key);
      const width = this.element('node', key)?.offsetWidth || this.nodeWidth(node);
      const step = event.shiftKey ? 50 : 10;
      const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: 100, End: 600 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      if (this.setNodeWidth(key, next)) void this.save();
    });
  }

  async handleAction(action, button) {
    if (action === 'toggle-diagram-picker') return this.pickerOpen ? this.closeDiagramPicker(true) : this.openDiagramPicker();
    if (action === 'select-diagram') return this.openDiagram(button.dataset.id);
    if (action === 'retry-diagram') return this.save();
    if (button?.closest?.('.diagram-root') && this.selectNode(this.keyFor(button)) === false) return;
    if (this.nodeTools.busy) return;
    if (action === 'copy-diagram-node') return this.nodeTools.copy();
    if (action === 'cut-diagram-node') return this.nodeTools.copy(true);
    if (action === 'paste-diagram-node') return this.nodeTools.paste();
    if (action === 'delete-diagram-node') return this.nodeTools.remove();
    if (action === 'image-diagram-node') return this.nodeTools.openImage();
    if (action === 'labels-diagram-node') return this.nodeTools.openLabels();
    if (action === 'diagram-layout') return this.openLayout();
    if (action === 'add-diagram-child') return this.addChild();
    if (action === 'add-diagram-sibling') return this.addSibling();
    if (action === 'diagram-checkbox-menu') {
      this.menuOpen = true;
      this.checkboxMenuOpen = true;
      this.checkboxScope = 'node';
      this.syncNodeState();
      this.viewport.reveal(this.element('menu'));
      const value = this.ensureTree().find((item) => item.id === this.selectedKey)?.checkbox ?? null;
      this.element(`checkbox-${value === null ? 'none' : value ? 'checked' : 'unchecked'}`)?.focus({ preventScroll: true });
      return;
    }
    if (action === 'diagram-checkbox-state') {
      const current = this.ensureTree().find((item) => item.id === this.selectedKey)?.checkbox ?? null;
      const state = button?.dataset.state;
      if (state === 'toggle' && current === null) return;
      const value = { none: null, unchecked: false, checked: true, toggle: !current }[state];
      const pending = this.setCheckbox(value, this.checkboxScope);
      this.element('node')?.focus({ preventScroll: true });
      return pending;
    }
    if (action === 'toggle-diagram-menu') {
      if (!this.active && !this.draft) return;
      this.selected = true;
      this.menuOpen = !this.menuOpen;
      this.syncNodeState();
      if (this.menuOpen) this.viewport.reveal(this.element('menu'));
      return;
    }
    if (action !== 'create-diagram' || this.switching) return;
    this.switching = true;
    this.syncToolbar();
    if (this.active || this.draft) {
      const generation = this.generation;
      if (!await this.finishBeforeSwitch()) {
        if (generation === this.generation) {
          this.switching = false;
          this.syncToolbar();
        }
        return;
      }
    }
    this.reset();
    this.switching = true;
    const generation = this.generation;
    this.draft = { client_key: crypto.randomUUID() };
    this.name = t('diagram_default_name');
    this.diagramTitle = this.name;
    this.error = '';
    this.selected = true;
    this.editing = false;
    this.drawStage();
    this.element('node')?.focus({ preventScroll: true });
    // Persist the creation itself, even when the user has not named it yet.
    await this.save();
    if (generation === this.generation) {
      this.switching = false;
      this.syncToolbar();
    }
  }

  isEditing() {
    return !!(
      this.draft ||
      this.selected ||
      this.editing ||
      this.titleEditing ||
      this.saving ||
      this.switching ||
      this.pickerOpen ||
      this.nodeTools.busy ||
      this.error ||
      this.layoutOpen ||
      this.drag ||
      this.resizing ||
      this.viewport.isInteracting() ||
      this.hasChanges()
    );
  }

  scheduleSave() {
    clearTimeout(this.timer);
    if (this.hasChanges()) this.timer = setTimeout(() => void this.save(), 700);
  }

  save() {
    if (this.savePromise) return this.savePromise;
    const pending = this.persist();
    this.savePromise = pending;
    void pending.then(() => {
      if (this.savePromise === pending) this.savePromise = null;
    }, () => {
      if (this.savePromise === pending) this.savePromise = null;
    });
    return pending;
  }

  async persist() {
    clearTimeout(this.timer);
    const nodes = this.snapshot();
    const name = this.titleName();
    this.diagramTitle = name;
    if (this.saving || (!this.active && !this.draft)) return;
    if (!this.hasChanges()) {
      if (!this.childDrafts.has(this.selectedKey)) this.showStatus(t('diagram_saved'));
      return;
    }
    const generation = this.generation;
    const data = this.active
      ? { id: this.active.id, version: this.active.version, name, nodes }
      : { client_key: this.draft.client_key, name, nodes };
    this.saving = true;
    for (const node of nodes) {
      if (this.childDrafts.has(node.id)) this.submittedChildren.set(node.id, node.text);
    }
    this.error = '';
    this.showStatus(t('diagram_saving'));
    let saved = false;
    try {
      const diagram = await this.makeRequest('saveDiagram', data);
      if (generation !== this.generation) return;
      diagram.nodes ||= nodes.map((node) => ({ ...node }));
      this.active = diagram;
      for (const node of diagram.nodes) {
        this.childDrafts.delete(node.id);
        this.draftOrigins.delete(node.id);
        this.submittedChildren.delete(node.id);
      }
      this.draft = null;
      S.data.diagrams = [
        diagram,
        ...(S.data.diagrams || []).filter((item) => item.id !== diagram.id),
      ];
      this.rememberDiagram();
      this.syncToolbar();
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
    if (error) {
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
