'use strict';

class DiagramLayoutPanel {
  constructor({ onApply = () => {}, onClose = () => {} } = {}) {
    this.onApply = onApply;
    this.onClose = onClose;
    this.dialog = null;
  }

  open({ layout = null, inherited = DiagramLayout.defaults('horizontal'), isRoot = false } = {}) {
    if (this.dialog) this.close();
    this.returnFocus = document.activeElement;
    this.inherited = { ...inherited };
    this.isRoot = isRoot;
    this.scope = 'branch';
    this.mode = layout?.mode || 'inherit';
    this.choices = {};
    if (layout) this.choices[layout.mode] = { ...DiagramLayout.defaults(layout.mode), ...layout };
    const dialog = document.createElement('dialog');
    this.dialog = dialog;
    dialog.id = 'diagram-layout-dialog';
    dialog.className = 'diagram-layout-dialog';
    dialog.setAttribute('aria-labelledby', 'diagram-layout-title');
    dialog.setAttribute('aria-describedby', 'diagram-layout-scope');
    dialog.innerHTML = `
      <header class="diagram-layout-header">
        <h2 id="diagram-layout-title">${esc(t('diagram_layout_title'))}</h2>
        <button type="button" class="diagram-layout-close" data-layout-close aria-label="${esc(t('diagram_layout_close'))}">×</button>
      </header>
      <div class="diagram-layout-body">
        <h3 class="diagram-layout-heading">${esc(t('diagram_layout_mode'))}</h3>
        <div class="diagram-layout-grid" role="group" aria-label="${esc(t('diagram_layout_mode'))}">
          ${['inherit', 'free', 'horizontal', 'vertical', 'list', 'topdown', 'linear', 'radial', 'matrix'].map((mode) => this.modeCard(mode)).join('')}
        </div>
        <div class="diagram-layout-directions" id="diagram-layout-directions"></div>
        <fieldset class="diagram-layout-apply-scope" aria-describedby="diagram-layout-scope">
          <legend>${esc(t('diagram_layout_scope_label'))}</legend>
          <label><input type="radio" name="diagram-layout-scope" data-layout-scope value="diagram"><span>${esc(t('diagram_layout_scope_diagram'))}</span></label>
          <label><input type="radio" name="diagram-layout-scope" data-layout-scope value="branch" checked><span>${esc(t('diagram_layout_scope_branch'))}</span></label>
          <p class="diagram-layout-scope" id="diagram-layout-scope">${esc(t('diagram_layout_scope_branch_help'))}</p>
        </fieldset>
      </div>
      <footer class="diagram-layout-footer">
        <button type="button" class="btn secondary" data-layout-close>${esc(t('cancel'))}</button>
        <button type="button" class="btn primary" id="diagram-layout-apply">${esc(t('diagram_layout_apply'))}</button>
      </footer>`;

    dialog.addEventListener('click', (event) => {
      // Keep selection on the diagram while using its modal controls.
      event.stopPropagation();
      const modeButton = event.target.closest('[data-layout-mode]');
      if (modeButton && !modeButton.disabled) {
        this.mode = modeButton.dataset.layoutMode;
        this.updateSelection();
      } else if (event.target.closest('[data-layout-close]')) {
        this.close();
      } else if (event.target.closest('#diagram-layout-apply')) {
        const choice = this.mode === 'inherit' ? null : { ...this.selectedSettings() };
        const scope = this.scope;
        this.close();
        this.onApply(choice, scope);
      } else if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.close();
      }
    });
    dialog.addEventListener('change', (event) => {
      event.stopPropagation();
      const input = event.target;
      if (input.matches('input[data-layout-setting]') && input.checked && this.mode !== 'inherit') {
        this.selectedSettings()[input.dataset.layoutSetting] = input.value;
      } else if (input.matches('input[data-layout-scope]') && input.checked) {
        this.scope = input.value;
        this.dialog.querySelector('#diagram-layout-scope').textContent = t(`diagram_layout_scope_${this.scope}_help`);
        // The whole diagram inherits the root default, not the selected node's parent.
        this.dialog.querySelector('[data-layout-mode="inherit"]').outerHTML = this.modeCard('inherit');
      }
    });
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener('close', () => this.finishClose(dialog));
    document.body.append(dialog);
    this.updateSelection();
    dialog.showModal();
    dialog.querySelector(`[data-layout-mode="${this.mode}"]`)?.focus();
  }

  modeCard(mode) {
    const selected = mode === this.mode;
    const fromRoot = this.isRoot || this.scope === 'diagram';
    const inherited = fromRoot ? DiagramLayout.defaults('horizontal') : this.inherited;
    const label = mode === 'inherit'
      ? t(fromRoot ? 'diagram_layout_default' : 'diagram_layout_inherit')
      : t(`diagram_layout_${mode}`);
    const preview = mode === 'inherit'
      ? `<span class="diagram-layout-inherited">${esc(label)}<small>(${esc(t(`diagram_layout_${inherited.mode}`))})</small></span>`
      : `<span class="diagram-layout-preview" aria-hidden="true">${DiagramLayout.preview(mode)}</span><span class="diagram-layout-label">${esc(label)}</span>`;
    return `<button type="button" class="diagram-layout-card${selected ? ' is-selected' : ''}" data-layout-mode="${mode}" aria-pressed="${selected}">${preview}<span class="diagram-layout-tick" aria-hidden="true">✓</span></button>`;
  }

  selectedSettings() {
    if (!this.choices[this.mode]) this.choices[this.mode] = { ...DiagramLayout.defaults(this.mode) };
    return this.choices[this.mode];
  }

  updateSelection() {
    for (const card of this.dialog.querySelectorAll('[data-layout-mode]')) {
      const selected = card.dataset.layoutMode === this.mode;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    const panel = this.dialog.querySelector('#diagram-layout-directions');
    const options = this.directionGroups();
    panel.innerHTML = options.map(({ field, title, values }) => this.directionGroup(field, title, values)).join('');
    panel.hidden = !options.length;
  }

  directionGroups() {
    const group = (field, title, values) => ({ field, title, values });
    const horizontal = () => group('horizontal', 'horizontal', ['auto', 'ltr', 'rtl']);
    switch (this.mode) {
      case 'horizontal': return [group('direction', 'direction', ['auto', 'clockwise', 'left', 'right', 'manual'])];
      case 'vertical': return [group('direction', 'direction', ['auto', 'top', 'bottom', 'manual'])];
      case 'list':
      case 'topdown': return [group('vertical', 'vertical', ['auto', 'top', 'bottom']), horizontal()];
      case 'linear': return [group('vertical', 'vertical', ['compact', 'alternating', 'top', 'bottom']), horizontal()];
      case 'matrix': return [group('vertical', 'vertical', ['bottom']), horizontal()];
      default: return [];
    }
  }

  directionGroup(field, title, values) {
    const settings = this.selectedSettings();
    if (!values.includes(settings[field])) settings[field] = values[0];
    return `<fieldset class="diagram-layout-direction-group"><legend>${esc(t(`diagram_layout_${title}_label`))}</legend>${values.map((value) => `
      <label><input type="radio" name="diagram-layout-${field}" data-layout-setting="${field}" value="${value}"${settings[field] === value ? ' checked' : ''}><span>${esc(t(`diagram_layout_direction_${value}`))}</span></label>`).join('')}</fieldset>`;
  }

  close() {
    if (!this.dialog) return;
    const dialog = this.dialog;
    if (dialog.open) dialog.close();
    this.finishClose(dialog);
  }

  finishClose(dialog) {
    if (this.dialog !== dialog) return;
    this.dialog = null;
    dialog.remove();
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.onClose();
  }
}
