'use strict';

class HomePage extends PageController {
  constructor() {
    super(['create-diagram', 'retry-diagram']);
    this.generation = 0;
    this.reset();
    document.addEventListener('input', (event) => {
      if (event.target.id !== 'diagram-name') return;
      this.name = event.target.value;
      this.scheduleSave();
    });
    document.addEventListener('focusin', (event) => {
      if (event.target.id === 'diagram-name') this.editing = true;
    });
    document.addEventListener('focusout', (event) => {
      if (event.target.id !== 'diagram-name') return;
      this.editing = false;
      void this.save();
    });
    document.addEventListener('keydown', (event) => {
      if (event.target.id !== 'diagram-name' || event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!this.name.trim()) this.showStatus(t('diagram_name_required'), true);
        else event.target.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearTimeout(this.timer);
        if (this.saving) return;
        this.name = this.active?.name || '';
        this.draft = null;
        this.editing = false;
        this.error = '';
        this.drawStage();
        document.querySelector('[data-action="create-diagram"]')?.focus();
      }
    });
    window.addEventListener('beforeunload', (event) => {
      if (this.saving || (this.name.trim() && this.name.trim() !== this.active?.name)) {
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
      name: esc(this.name),
    });
  }

  mount() {
    if (this.error) this.showStatus(this.error, true);
  }

  drawStage() {
    const stage = document.getElementById('mindmap-stage');
    if (stage) stage.innerHTML = this.stageContent();
    this.mount();
  }

  async handleAction(action) {
    if (action === 'retry-diagram') return this.save();
    this.draft = { client_key: crypto.randomUUID() };
    this.name = '';
    this.error = '';
    this.editing = true;
    this.drawStage();
    document.getElementById('diagram-name')?.focus();
  }

  isEditing() {
    return !!(
      this.draft ||
      this.editing ||
      this.saving ||
      this.error ||
      (this.active && this.name.trim() !== this.active.name)
    );
  }

  scheduleSave() {
    clearTimeout(this.timer);
    if (this.name.trim()) this.timer = setTimeout(() => void this.save(), 700);
  }

  async save() {
    clearTimeout(this.timer);
    const name = this.name.trim();
    if (!name || this.saving || (!this.active && !this.draft)) {
      if (!name && this.active) this.showStatus(t('diagram_name_required'), true);
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
        if (saved && this.name.trim() !== this.active.name) this.scheduleSave();
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
