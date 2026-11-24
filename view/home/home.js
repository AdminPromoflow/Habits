'use strict';

class HomePage extends PageController {
  constructor() {
    super(['create-diagram', 'retry-diagram']);
    this.generation = 0;
    this.reset();
    document.addEventListener('click', (event) => {
      const node = event.target.closest?.('.diagram-node');
      if (node) {
        this.selectNode();
        if (!this.editing) node.focus();
      } else if (this.selected && !event.target.closest?.('.diagram-root')) {
        document.getElementById('diagram-name')?.blur();
        this.selected = false;
        this.syncNodeState();
      }
    });
    document.addEventListener('dblclick', (event) => {
      if (!event.target.closest?.('.diagram-node') || this.editing) return;
      event.preventDefault();
      this.beginEditing();
    });
    document.addEventListener('input', (event) => {
      if (event.target.id !== 'diagram-name' || event.target.readOnly) return;
      this.name = event.target.value;
      this.resizeNode(event.target);
      this.scheduleSave();
    });
    document.addEventListener('focusin', (event) => {
      if (event.target.id === 'diagram-node') this.selectNode();
      if (event.target.id === 'diagram-name' && !event.target.readOnly) {
        this.selected = true;
        this.editing = true;
        this.syncNodeState();
      }
    });
    document.addEventListener('focusout', (event) => {
      if (event.target.id !== 'diagram-name' || !this.editing) return;
      this.editing = false;
      this.syncNodeState();
      void this.save();
    });
    document.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.target.id === 'diagram-node') {
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
      if (event.target.id !== 'diagram-name' || event.target.readOnly) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!this.name.trim()) this.showStatus(t('diagram_name_required'), true);
        else {
          event.target.blur();
          document.getElementById('diagram-node')?.focus();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearTimeout(this.timer);
        if (this.saving) return;
        this.name = this.active?.name || '';
        this.draft = null;
        this.selected = !!this.active;
        this.editing = false;
        this.error = '';
        this.drawStage();
        const target = document.getElementById('diagram-node') ||
          document.querySelector('[data-action="create-diagram"]');
        target?.focus();
      }
    });
    window.addEventListener('resize', () => this.resizeNode());
    window.addEventListener('beforeunload', (event) => {
      if (this.saving || (this.name.trim() && this.normalizedName() !== this.active?.name)) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  reset() {
    clearTimeout(this.timer);
    this.generation++;
    this.active = null;
    this.draft = null;
    this.name = '';
    this.selected = false;
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
    return renderTemplate('diagram-node', {
      label: t('diagram_name'),
      placeholder: t('diagram_name'),
      hint: t('diagram_interaction_hint'),
      nodeLabel: esc(`${t('diagram_name')}: ${this.name}`),
      name: esc(this.name),
    });
  }

  mount() {
    this.syncNodeState();
    this.resizeNode();
    if (this.error) this.showStatus(this.error, true);
  }

  selectNode() {
    if (!this.active && !this.draft) return;
    this.selected = true;
    this.syncNodeState();
  }

  beginEditing() {
    if (!this.active && !this.draft) return;
    this.selected = true;
    this.editing = true;
    this.syncNodeState();
    const input = document.getElementById('diagram-name');
    input?.focus();
    input?.select();
  }

  syncNodeState() {
    const root = document.getElementById('diagram-root');
    const node = document.getElementById('diagram-node');
    const input = document.getElementById('diagram-name');
    const controls = document.getElementById('diagram-controls');
    root?.classList.toggle('is-selected', this.selected);
    root?.classList.toggle('is-editing', this.editing);
    if (controls) controls.hidden = !this.selected;
    if (node) {
      node.tabIndex = this.editing ? -1 : 0;
      node.setAttribute('role', this.editing ? 'group' : 'button');
      node.setAttribute('aria-label', `${t('diagram_name')}: ${this.name}`);
      if (this.editing) node.removeAttribute('aria-pressed');
      else node.setAttribute('aria-pressed', String(this.selected));
    }
    if (input) {
      input.readOnly = !this.editing;
      input.tabIndex = this.editing ? 0 : -1;
      input.setAttribute('aria-hidden', String(!this.editing));
    }
  }

  resizeNode(input = document.getElementById('diagram-name')) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  normalizedName() {
    // Keep intentional newlines, including an empty first or last line.
    return this.name.replace(/^[^\S\r\n]+|[^\S\r\n]+$/g, '');
  }

  drawStage() {
    const stage = document.getElementById('mindmap-stage');
    if (stage) stage.innerHTML = this.stageContent();
    this.mount();
  }

  async handleAction(action) {
    if (action === 'retry-diagram') return this.save();
    if (this.active || this.draft) return;
    this.draft = { client_key: crypto.randomUUID() };
    this.name = t('diagram_default_name');
    this.error = '';
    this.selected = true;
    this.editing = false;
    this.drawStage();
    document.getElementById('diagram-node')?.focus();
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
      (this.active && this.normalizedName() !== this.active.name)
    );
  }

  scheduleSave() {
    clearTimeout(this.timer);
    if (this.name.trim()) this.timer = setTimeout(() => void this.save(), 700);
  }

  async save() {
    clearTimeout(this.timer);
    const name = this.normalizedName();
    if (!name.trim() || this.saving || (!this.active && !this.draft)) {
      if (!name.trim() && this.active) this.showStatus(t('diagram_name_required'), true);
      return;
    }
    if (this.active?.name === name) {
      this.showStatus(t('diagram_saved'));
      return;
    }
    const generation = this.generation;
    const data = this.active
      ? { id: this.active.id, version: this.active.version, name }
      : { client_key: this.draft.client_key, name };
    this.saving = true;
    this.error = '';
    this.showStatus(t('diagram_saving'));
    let saved = false;
    try {
      const diagram = await this.makeRequest('saveDiagram', data);
      if (generation !== this.generation) return;
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
        if (saved && this.normalizedName() !== this.active.name) this.scheduleSave();
      }
    }
  }

  showStatus(message, error = false) {
    this.error = error ? message : '';
    const status = document.getElementById('diagram-status');
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
