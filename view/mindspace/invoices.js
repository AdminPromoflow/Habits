'use strict';

class MindSpaceInvoice {
  static async encode(file) {
    if (!file.type.startsWith('image/') || file.size > 20971520) throw new Error(t('ms_invoice_file_error'));
    const url = URL.createObjectURL(file), image = new Image();
    try {
      image.src = url;
      await image.decode();
      return this.compress(image, image.naturalWidth, image.naturalHeight);
    } catch { throw new Error(t('ms_invoice_file_error')); }
    finally { URL.revokeObjectURL(url); }
  }
  static compress(image, width, height) {
    if (!width || !height) throw new Error(t('ms_invoice_invalid'));
    const canvas = document.createElement('canvas'), scale = Math.min(1, 2400 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.9, .8, .7, .6, .5]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 1398100) return data;
    }
    throw new Error(t('ms_invoice_invalid'));
  }
  static async open(editor, key) {
    const space = editor.space, id = space.active?.id, generation = space.generation;
    if (space.active?.kind !== 'spreadsheet' || !MindSpaceSheet.invoiceCell(space.draft, key)) return;
    if (!await space.flush() || space.active?.id !== id || space.generation !== generation) return;
    const editable = space.can('edit'), existing = space.draft.invoices?.[key];
    if (!editable && !existing) return;
    openModal('ms_invoice', `<form id="ms-invoice-form"><p class="ms-invoice-context">${esc(key)}${space.draft.cells[`B${key.slice(1)}`] ? ` · ${esc(space.draft.cells[`B${key.slice(1)}`])}` : ''}</p>
      <p data-invoice-loading ${existing ? '' : 'hidden'}>${esc(t('loading'))}</p>
      <img class="ms-invoice-preview" data-invoice-preview alt="${esc(t('ms_invoice'))}" hidden>
      <p data-invoice-name class="ms-invoice-name"></p><a class="text-btn" data-invoice-download hidden>${esc(t('ms_invoice_download'))}</a>
      ${editable ? `<div class="ms-invoice-choices"><button type="button" class="btn secondary" data-invoice-camera>${icon('camera')}${esc(t('ms_invoice_camera'))}</button><button type="button" class="btn secondary" data-invoice-upload>${icon('image')}${esc(t('ms_invoice_upload'))}</button></div>
      <input type="file" accept="image/*" data-invoice-file hidden><input type="file" accept="image/*" capture="environment" data-invoice-capture hidden>
      <div data-invoice-live hidden><video autoplay playsinline muted aria-label="${esc(t('ms_invoice_camera'))}"></video><button type="button" class="btn primary" data-invoice-snap>${esc(t('ms_invoice_capture'))}</button><button type="button" class="btn ghost" data-invoice-stop>${esc(t('cancel'))}</button></div><p class="muted">${esc(t('ms_invoice_hint'))}</p>
      ${formFooter('save', existing ? `<button type="button" class="text-btn danger" data-invoice-remove>${esc(t('ms_invoice_remove'))}</button>` : '')}` : `<div class="form-error" role="alert"></div><div class="form-footer"><button type="button" class="btn secondary" data-action="close-modal">${esc(t('close'))}</button></div>`}</form>`, true);
    const form = document.getElementById('ms-invoice-form'), modal = document.getElementById('modal');
    const find = selector => form.querySelector(selector), valid = () => form.isConnected && space.active?.id === id && space.generation === generation;
    let image = null, name = '', changed = false, processing = false, saving = false, stream = null, cameraRequest = 0;
    const error = message => { if (valid()) find('.form-error').textContent = message; };
    const stop = () => {
      cameraRequest++;
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      if (find('video')) find('video').srcObject = null;
      if (find('[data-invoice-live]')) find('[data-invoice-live]').hidden = true;
    };
    const draw = () => {
      const preview = find('[data-invoice-preview]'), download = find('[data-invoice-download]');
      preview.hidden = !image;
      if (image) preview.src = image; else preview.removeAttribute('src');
      find('[data-invoice-name]').textContent = name;
      download.hidden = !image;
      if (image) { download.href = image; download.download = name; }
    };
    const controls = busy => {
      processing = busy;
      form.querySelectorAll('button:not([data-action="close-modal"])').forEach(button => { button.disabled = busy; });
    };
    modal.addEventListener('close', stop, {once:true});
    const cancel = event => { if (saving) event.preventDefault(); };
    modal.addEventListener('cancel', cancel);
    // Switching accounts/documents or replacing a modal must also release the camera.
    const observer = new MutationObserver(() => { if (!valid()) { stop(); observer.disconnect(); } });
    observer.observe(modal, {childList:true});
    modal.addEventListener('close', () => { observer.disconnect(); modal.removeEventListener('cancel', cancel); }, {once:true});
    if (editable) {
      const choose = async input => {
        const file = input.files?.[0];
        if (!file || processing || saving) return;
        stop(); controls(true); error('');
        try {
          const data = await this.encode(file);
          if (!valid()) return;
          image = data; name = `${file.name.replace(/\.[^.]*$/, '').slice(0, 180) || 'Invoice'}.jpg`; changed = true; draw();
        } catch (failure) { error(failure.message); }
        finally { input.value = ''; if (valid()) controls(false); }
      };
      for (const selector of ['[data-invoice-file]', '[data-invoice-capture]']) find(selector).addEventListener('change', event => void choose(event.target));
      find('[data-invoice-upload]').addEventListener('click', () => find('[data-invoice-file]').click());
      find('[data-invoice-camera]').addEventListener('click', async () => {
        if (processing || saving) return;
        if (window.matchMedia('(pointer: coarse)').matches || !navigator.mediaDevices?.getUserMedia) { find('[data-invoice-capture]').click(); return; }
        stop(); error(''); const request = cameraRequest;
        try {
          const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2400}},audio:false});
          if (!valid() || request !== cameraRequest) { acquired.getTracks().forEach(track => track.stop()); return; }
          stream = acquired; find('[data-invoice-live]').hidden = false; find('video').srcObject = stream;
          await find('video').play();
        } catch { if (request === cameraRequest) { stop(); error(t('ms_invoice_camera_error')); } }
      });
      find('[data-invoice-stop]').addEventListener('click', stop);
      find('[data-invoice-snap]').addEventListener('click', () => {
        try {
          const video = find('video'); image = this.compress(video, video.videoWidth, video.videoHeight);
          name = `Invoice-${key}.jpg`; changed = true; stop(); draw(); error('');
        } catch (failure) { error(failure.message); }
      });
      find('[data-invoice-remove]')?.addEventListener('click', () => { stop(); image = null; name = ''; changed = true; draw(); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (processing || saving) return;
        void space.submit(form, async () => {
          if (!valid() || !space.can('edit')) throw new Error(t('error_forbidden'));
          if (!changed) { if (existing) closeModal(); else throw new Error(t('ms_invoice_choose')); return; }
          saving = true; stop(); controls(true);
          modal.querySelectorAll('[data-action="close-modal"]').forEach(button => { button.disabled = true; });
          try {
            if (!await space.flush() || !valid()) throw new Error(space.error || t('ms_unsaved'));
            const saved = await space.home.makeRequest('saveSpreadsheetInvoice', {id, version:space.active.version, cell:key, image, name});
            if (space.active?.id !== id || space.generation !== generation) return;
            space.active = saved; space.draft = JSON.parse(JSON.stringify(saved.content)); space.upsert(saved); space.baseline = JSON.stringify(saved.content); space.error = '';
            if (valid()) closeModal(); editor.refresh();
          } finally {
            saving = false;
            if (valid()) { controls(false); modal.querySelectorAll('[data-action="close-modal"]').forEach(button => { button.disabled = false; }); }
          }
        });
      });
    }
    if (existing) {
      controls(true);
      try {
        const invoice = await space.home.makeRequest('getSpreadsheetInvoice', null, {id, cell:key});
        if (!valid()) return;
        image = invoice.image; name = invoice.name; draw();
      } catch (failure) { error(failure.message); }
      finally { if (valid()) { find('[data-invoice-loading]').hidden = true; controls(false); } }
    }
  }
}
