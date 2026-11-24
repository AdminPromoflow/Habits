let previousFocus = null;

function openModal(title, html, wide = false) {
  previousFocus = document.activeElement;
  const d = $('#modal');
  d.className = wide ? 'wide' : '';
  d.innerHTML = `<div class="modal-header"><h2>${esc(t(title))}</h2><button class="icon-btn" data-action="close-modal" aria-label="${t('close')}">${icon('close')}</button></div><div class="modal-body">${html}</div>`;
  if (!d.open) d.showModal();
  d.setAttribute('aria-label', t(title));
  setTimeout(() => $('input:not([type=hidden]),select,textarea', d)?.focus(), 30);
}

function closeModal() {
  const d = $('#modal');
  d.close();
  d.innerHTML = '';
  previousFocus?.focus();
}

function formFooter(label = 'save', other = '') {
  return `<div class="form-error" role="alert"></div><div class="form-footer">${other}<button type="button" class="btn ghost" data-action="close-modal">${t('cancel')}</button><button type="submit" class="btn primary">${t(label)}</button></div>`;
}

function confirmAction(message, fn) {
  openModal(
    'confirm',
    `<p>${t(message)}</p><div class="form-footer">${button('cancel', 'close-modal', 'ghost')}${button('confirm', 'confirm-action', 'primary')}</div>`
  );
  S.confirmAction = fn;
}
