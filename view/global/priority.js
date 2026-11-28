function activityPriorityScale() {
  const scale = Number(S.user?.priority_scale || 10);
  return Number.isInteger(scale) && scale >= 1 && scale <= 1000000 ? scale : 10;
}

function activityPriorityValue(entry, key, scale = activityPriorityScale()) {
  const value = Number(entry?.[key]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const previous = Number(entry.priority_scale) || 10;
  return Math.min(scale, Math.max(1, Math.round(value * scale / previous)));
}

function activityPriorityFields(entry = {}) {
  const scale = activityPriorityScale();
  return `<fieldset class="activity-priority" data-activity-priority><legend>${t('priority_heading')} <small>${t('optional')}</small></legend>
    <input type="hidden" name="priority_scale" value="${scale}"><div class="priority-options">${['importance','urgency'].map(key => {
      const value = activityPriorityValue(entry,key,scale), enabled = value !== null;
      return `<div class="priority-option"><label class="priority-toggle"><input type="checkbox" data-priority-toggle="${key}" ${enabled ? 'checked' : ''}><span>${t('priority_'+key)}</span></label>
        <div class="priority-rating" data-priority-rating="${key}" ${!enabled || scale === 1 ? 'hidden' : ''}>
          <input type="range" min="1" max="${scale}" step="1" value="${value || 1}" data-priority-slider="${key}" aria-label="${esc(t('priority_'+key+'_score'))}" ${enabled && scale > 1 ? '' : 'disabled'}>
          <label><span class="sr-only">${t('priority_'+key+'_score')}</span><input type="number" name="${key}" min="1" max="${scale}" step="1" value="${value || 1}" ${enabled && scale > 1 ? 'required' : 'disabled'}><span> / ${scale}</span></label>
        </div></div>`;
    }).join('')}</div><p class="field-help">${t(scale === 1 ? 'priority_binary_hint' : 'priority_hint',{max:scale})}</p></fieldset>`;
}

function bindActivityPriority(form) {
  const root = form.querySelector('[data-activity-priority]');
  if (!root) return;
  const scale = Number(root.querySelector('[name=priority_scale]').value);
  form.addEventListener('change', event => {
    const key = event.target.dataset.priorityToggle;
    if (!key) return;
    const show = event.target.checked && scale > 1;
    root.querySelector(`[data-priority-rating="${key}"]`).hidden = !show;
    const number = root.querySelector(`[name="${key}"]`), slider = root.querySelector(`[data-priority-slider="${key}"]`);
    number.disabled = !show; number.required = show; slider.disabled = !show;
  });
  form.addEventListener('input', event => {
    const key = event.target.dataset.prioritySlider;
    if (key) root.querySelector(`[name="${key}"]`).value = event.target.value;
    else if (['importance','urgency'].includes(event.target.name) && event.target.validity.valid) root.querySelector(`[data-priority-slider="${event.target.name}"]`).value = event.target.value;
  });
}

function activityPriorityData(form) {
  const root = form.querySelector('[data-activity-priority]');
  if (!root) return {};
  const scale = Number(root.querySelector('[name=priority_scale]').value);
  return Object.fromEntries([['priority_scale',scale],...['importance','urgency'].map(key => [key,
    root.querySelector(`[data-priority-toggle="${key}"]`).checked ? (scale === 1 ? 1 : Number(root.querySelector(`[name="${key}"]`).value)) : null])]);
}

function activityPriorityFlags(entry, focusable = true) {
  const scale = activityPriorityScale();
  const flags = ['urgency','importance'].map(key => {
    const value = activityPriorityValue(entry,key,scale);
    if (value === null) return '';
    const label = t('priority_'+key) + (scale === 1 ? '' : `: ${value}/${scale}`);
    return `<span class="priority-flag priority-flag-${key}" role="img" aria-label="${esc(label)}" title="${esc(label)}"${focusable ? ' tabindex="0"' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 18V2m0 1c4-3 7 3 12 0v9c-5 3-8-3-12 0"/></svg><span class="priority-flag-tooltip" aria-hidden="true">${esc(label)}</span></span>`;
  }).join('');
  return flags ? `<span class="priority-flags">${flags}</span>` : '';
}

function activityPrioritySettings() {
  const scale = activityPriorityScale(), presets = [1,5,10,100,1000], custom = !presets.includes(scale);
  return `<section class="card priority-settings"><h2>${t('priority_heading')}</h2><p>${t('priority_settings_hint')}</p><form data-form="settings">
    <div class="form-grid"><label class="field"><span>${t('priority_scale')}</span><select data-priority-scale-preset>${presets.map(max => `<option value="${max}" ${scale === max ? 'selected' : ''}>${esc(max === 1 ? t('priority_binary') : t('priority_range',{max}))}</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>${t('priority_custom')}</option></select></label>
    <label class="field" data-priority-custom ${custom ? '' : 'hidden'}><span>${t('priority_max')}</span><input type="number" name="priority_scale" min="1" max="1000000" step="1" required value="${scale}"></label></div>
    <p class="field-help">${t('priority_scale_hint')}</p><div class="form-error" role="alert"></div><button type="submit" class="btn primary">${t('save')}</button></form></section>`;
}
