'use strict';

class MindSpaceFiles {
  static accept = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
  static sorted(entries, order = 'newest') {
    return [...entries].sort((a, b) => (order === 'oldest' ? 1 : -1) * (a.created_at.localeCompare(b.created_at) || a.id - b.id));
  }
  static size(bytes) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
  constructor(space) { this.space = space; this.folders = new Map(); this.order = 'newest'; }
  render() { return `<section class="ms-files" aria-label="${esc(t('ms_kind_files'))}"><p role="status">${esc(t('files_loading'))}</p></section>`; }
  context() { return {id:this.space.active.id, ...(S.sharedWorkspace ? {share_id:S.sharedWorkspace.id} : {})}; }
  request(action, body = null, context = this.ctx) { return ajaxRequest.makeRequest(action, body === null ? null : {...context, ...body}, body === null ? context : {}, false); }
  url(entry, download = false, context = this.ctx) {
    return `controller/files/index.php?${new URLSearchParams({...context, action:'libraryFile', entry_id:entry.id, ...(download ? {download:1} : {})})}`;
  }
  async mount() {
    const root = document.querySelector('.ms-files');
    if (!root) return;
    this.root = root; this.ctx = this.context(); this.key = `${S.user.id}:${this.ctx.share_id || 0}:${this.ctx.id}`;
    this.folderId = this.folders.get(this.key) || null;
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-files-action]');
      if (button) void this.action(button).catch(error => toast(error.message, true));
    });
    root.addEventListener('change', event => {
      if (event.target.matches('[data-files-sort]')) { this.order = event.target.value; this.paint(); }
      if (event.target.matches('[data-files-upload]')) {
        const files = [...event.target.files]; event.target.value = '';
        if (files.length) void this.uploadBatch(files);
      }
    });
    await this.refresh();
  }
  async refresh() {
    const root = this.root, ctx = this.ctx;
    try {
      const result = await this.request('libraryEntries', null, ctx);
      if (root !== this.root || !root.isConnected) return;
      this.entries = result.entries; this.limit = result.upload_limit;
      if (this.folderId && !this.entries.some(entry => entry.id === this.folderId)) this.folderId = null;
      this.paint();
    } catch (error) {
      if (root === this.root && root.isConnected) root.innerHTML = `<div class="ms-empty"><p role="alert">${esc(error.message)}</p><button class="btn secondary" data-files-action="refresh">${esc(t('files_retry'))}</button></div>`;
    }
  }
  path() {
    const path = []; let current = this.entries.find(entry => entry.id === this.folderId);
    while (current && path.length < 12) { path.unshift(current); current = this.entries.find(entry => entry.id === current.parent_id); }
    return path;
  }
  paint() {
    const edit = this.space.can('edit'), remove = this.space.can('delete');
    const entries = MindSpaceFiles.sorted(this.entries.filter(entry => entry.parent_id === this.folderId), this.order);
    const date = value => new Intl.DateTimeFormat(S.language === 'es' ? 'es-CO' : 'en-US', {dateStyle:'medium',timeStyle:'short',timeZone:S.user?.timezone || 'America/Bogota'}).format(new Date(value.replace(' ', 'T') + 'Z'));
    this.folders.set(this.key, this.folderId);
    this.root.innerHTML = `<div class="files-toolbar"><div class="files-tools">${edit ? `
      <button class="btn primary" data-files-action="upload">${icon('plus')}${esc(t('files_upload'))}</button>
      <button class="btn secondary" data-files-action="pdf">${esc(t('files_create_pdf'))}</button>
      <button class="btn secondary" data-files-action="folder">${icon('folder')}${esc(t('files_new_folder'))}</button>
      <input type="file" data-files-upload accept="${MindSpaceFiles.accept}" multiple hidden>` : ''}</div>
      <label class="files-sort"><span>${esc(t('files_sort'))}</span><select data-files-sort><option value="newest" ${this.order === 'newest' ? 'selected' : ''}>${esc(t('files_newest'))}</option><option value="oldest" ${this.order === 'oldest' ? 'selected' : ''}>${esc(t('files_oldest'))}</option></select></label></div>
      <nav class="files-path" aria-label="${esc(t('ms_folder_path'))}"><button data-files-action="open" data-entry="0">${esc(t('ms_kind_files'))}</button>${this.path().map(entry => `<span aria-hidden="true">/</span><button data-files-action="open" data-entry="${entry.id}">${esc(entry.name)}</button>`).join('')}</nav>
      <p class="files-hint">${esc(t('files_supported', {size:MindSpaceFiles.size(this.limit)}))}</p>
      ${entries.length ? `<div class="files-grid">${entries.map(entry => `<article class="files-card files-card-${entry.kind}">
        <button class="files-open" data-files-action="open" data-entry="${entry.id}"><span class="files-preview">${entry.kind === 'image' ? `<img src="${esc(this.url(entry))}" alt="" loading="lazy">` : `${icon(entry.kind === 'folder' ? 'folder' : 'book')}${entry.kind === 'pdf' ? '<b>PDF</b>' : ''}`}</span><strong>${esc(entry.name)}</strong><span class="files-meta"><time datetime="${entry.created_at.replace(' ', 'T')}Z">${esc(date(entry.created_at))}</time>${entry.kind !== 'folder' ? `<span>${MindSpaceFiles.size(entry.size_bytes)}</span>` : ''}</span></button>
        <div class="files-card-tools">${entry.kind !== 'folder' ? `<a class="text-btn" href="${esc(this.url(entry, true))}" download>${esc(t('files_download'))}</a>` : ''}${edit ? `<button class="text-btn" data-files-action="rename" data-entry="${entry.id}" aria-label="${esc(t('ms_rename') + ': ' + entry.name)}">${esc(t('ms_rename'))}</button>` : ''}${remove ? `<button class="text-btn danger" data-files-action="delete" data-entry="${entry.id}" aria-label="${esc(t('delete') + ': ' + entry.name)}">${esc(t('delete'))}</button>` : ''}</div>
      </article>`).join('')}</div>` : `<div class="ms-empty files-empty">${icon('folder')}<h3>${esc(t('files_empty'))}</h3><p>${esc(t('files_empty_hint'))}</p></div>`}`;
  }
  async action(button) {
    const action = button.dataset.filesAction;
    const entry = this.entries?.find(item => item.id === Number(button.dataset.entry));
    if (action === 'refresh') return this.refresh();
    if (action === 'open') {
      if (!entry || entry.kind === 'folder') { this.folderId = entry?.id || null; this.paint(); return; }
      return this.reader(entry);
    }
    if (action === 'delete') {
      if (!this.space.can('delete')) return;
      const ctx = this.ctx, root = this.root;
      confirmAction(entry.kind === 'folder' ? 'files_delete_folder' : 'files_delete_file', async () => {
        await this.request('deleteLibraryEntry', {entry_id:entry.id}, ctx);
        closeModal();
        if (root === this.root && root.isConnected) await this.refresh();
      }); return;
    }
    if (!this.space.can('edit')) return;
    if (action === 'upload') return this.root.querySelector('[data-files-upload]').click();
    if (action === 'pdf') return this.pdfComposer();
    if (action === 'folder' || action === 'rename') return this.nameForm(entry, action === 'folder');
  }
  nameForm(entry, folder) {
    const ctx = this.ctx, parent = this.folderId, key = crypto.randomUUID(), root = this.root;
    openModal(folder ? 'files_new_folder' : 'ms_rename', `<form id="files-name-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="180" required value="${esc(folder ? '' : entry.name)}"></label>${formFooter(folder ? 'create' : 'save')}</form>`);
    const form = document.getElementById('files-name-form');
    form.addEventListener('submit', event => {
      event.preventDefault(); void this.space.submit(form, async values => {
        await this.request(folder ? 'createLibraryFolder' : 'renameLibraryEntry', {name:values.get('name'), ...(folder ? {parent_id:parent, client_key:key} : {entry_id:entry.id})}, ctx);
        closeModal(); if (root === this.root && root.isConnected) await this.refresh();
      });
    });
  }
  async upload(file, name, ctx, parent, key) {
    if (file.size > this.limit) throw new Error(t('files_too_large'));
    const form = new FormData();
    for (const [key,value] of Object.entries({...ctx, parent_id:parent || '', name, client_key:key})) form.append(key, value);
    form.append('file', file, name);
    let response;
    try { response = await fetch('controller/files/index.php?action=uploadLibraryFile', {method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':S.csrf},body:form}); }
    catch { throw new Error(t('connection_error')); }
    let result;
    try { result = await response.json(); } catch { throw new Error(t(response.status === 413 ? 'files_too_large' : 'files_upload_error')); }
    if (!response.ok || !result.ok) throw new Error(t(result.error || 'files_upload_error'));
    return result.result;
  }
  async uploadBatch(files) {
    const ctx = this.ctx, parent = this.folderId, root = this.root;
    const queue = files.map(file => ({file,key:crypto.randomUUID(),done:false}));
    openModal('files_upload', `<div id="files-upload-status"><p>${esc(t('files_upload_hint'))}</p><ul class="files-upload-list">${queue.map((item,i) => `<li><strong>${esc(item.file.name)}</strong><span data-upload-row="${i}"></span></li>`).join('')}</ul><p role="status" data-upload-summary></p><button class="btn primary" data-upload-retry hidden>${esc(t('files_retry'))}</button></div>`, true);
    const status = document.getElementById('files-upload-status');
    const run = async () => {
      status.querySelector('[data-upload-retry]').hidden = true;
      for (const [index, item] of queue.entries()) {
        if (item.done) continue;
        const row = status.querySelector(`[data-upload-row="${index}"]`); row.textContent = t('files_uploading');
        try {
          await this.upload(item.file, item.file.name, ctx, parent, item.key);
          item.done = true; row.textContent = t('files_saved'); row.className = '';
        } catch (error) { row.textContent = error.message; row.className = 'danger'; }
      }
      const count = queue.filter(item => item.done).length;
      status.querySelector('[data-upload-summary]').textContent = t('files_uploaded_count', {count,total:queue.length});
      status.querySelector('[data-upload-retry]').hidden = count === queue.length;
      if (root === this.root && root.isConnected) await this.refresh();
    };
    status.querySelector('[data-upload-retry]').addEventListener('click', () => void run());
    await run();
  }
  pdfComposer() {
    const ctx = this.ctx, parent = this.folderId, root = this.root, key = crypto.randomUUID();
    const pages = []; let busy = false, adding = false, disposed = false;
    openModal('files_create_pdf', `<form id="files-pdf-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" required maxlength="170" value="${esc(t('files_pdf_name'))}"></label>
      <p>${esc(t('files_pdf_hint'))}</p><div class="files-tools"><button type="button" class="btn secondary" data-add-photos>${esc(t('files_add_images'))}</button><button type="button" class="btn secondary" data-take-photo>${esc(t('files_take_photo'))}</button></div>
      <input type="file" data-photo-input accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden><input type="file" data-camera-input accept="image/*" capture="environment" hidden>
      <ol class="files-photo-list"></ol><p role="status" data-pdf-status></p>${formFooter('files_create_pdf')}</form>`, true);
    const form = document.getElementById('files-pdf-form'), dialog = form.closest('dialog');
    const cleanup = () => { disposed = true; pages.forEach(page => URL.revokeObjectURL(page.url)); };
    dialog.addEventListener('close', cleanup, {once:true});
    const status = message => { form.querySelector('[data-pdf-status]').textContent = message; };
    const paint = () => {
      form.querySelector('.files-photo-list').innerHTML = pages.map((page,i) => `<li><img src="${page.url}" alt="${esc(t('files_page', {page:i+1}))}"><span>${esc(t('files_page', {page:i+1}))}</span><div><button type="button" data-photo-move="${i}" data-step="-1" ${i ? '' : 'disabled'} aria-label="${esc(t('files_move_up'))}">↑</button><button type="button" data-photo-move="${i}" data-step="1" ${i === pages.length - 1 ? 'disabled' : ''} aria-label="${esc(t('files_move_down'))}">↓</button><button type="button" data-photo-remove="${i}" aria-label="${esc(t('delete'))}">×</button></div></li>`).join('');
      form.querySelector('[type=submit]').disabled = !pages.length || busy || adding;
    };
    const add = async input => {
      if (busy || adding) return;
      adding = true; paint();
      try {
        for (const file of input.files) {
          if (pages.length >= 50) throw new Error(t('files_page_limit'));
          if (file.size > 20971520) throw new Error(t('files_too_large'));
          status(t('files_preparing'));
          const photo = await MindSpaceFiles.photo(file);
          if (disposed || !form.isConnected) return;
          pages.push({blob:photo, url:URL.createObjectURL(photo)});
        }
        status(t('files_photo_count', {count:pages.length}));
      } catch (error) { status(error.message); }
      finally { adding = false; input.value = ''; paint(); }
    };
    form.querySelector('[data-add-photos]').onclick = () => { if (!busy && !adding) form.querySelector('[data-photo-input]').click(); };
    form.querySelector('[data-take-photo]').onclick = () => { if (!busy && !adding) form.querySelector('[data-camera-input]').click(); };
    form.querySelectorAll('input[type=file]').forEach(input => input.addEventListener('change', () => void add(input)));
    form.addEventListener('click', event => {
      if (busy || adding) return;
      const move = event.target.closest('[data-photo-move]'), remove = event.target.closest('[data-photo-remove]');
      if (move) { const from = Number(move.dataset.photoMove), to = from + Number(move.dataset.step); [pages[from],pages[to]] = [pages[to],pages[from]]; paint(); }
      if (remove) { URL.revokeObjectURL(pages.splice(Number(remove.dataset.photoRemove),1)[0].url); paint(); }
    });
    form.addEventListener('submit', event => {
      event.preventDefault(); if (busy || adding || !pages.length) return;
      busy = true; paint(); status(t('files_preparing'));
      void (async () => {
        try {
          await MindSpacePDF.loadScript('jspdf-4.2.1.umd.min.js');
          const doc = new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
          const name = MindSpacePDF.filename(new FormData(form).get('name').replace(/\.pdf$/i, ''));
          doc.setProperties({title:name,creator:'MyRemarkable Mind'});
          for (const [index,page] of pages.entries()) {
            if (disposed || !form.isConnected) return;
            const bytes = new Uint8Array(await page.blob.arrayBuffer());
            const info = doc.getImageProperties(bytes), landscape = info.width > info.height;
            if (index) doc.addPage('a4', landscape ? 'landscape' : 'portrait');
            else if (landscape) { doc.deletePage(1); doc.addPage('a4','landscape'); }
            const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
            const ratio = Math.min((width-16)/info.width,(height-16)/info.height);
            doc.addImage(bytes,'JPEG',(width-info.width*ratio)/2,(height-info.height*ratio)/2,info.width*ratio,info.height*ratio,undefined,'FAST');
          }
          if (disposed || !form.isConnected) return;
          status(t('files_uploading'));
          const saved = await this.upload(doc.output('blob'), name, ctx, parent, key);
          if (form.isConnected) closeModal();
          if (root === this.root && root.isConnected) { await this.refresh(); await this.reader(saved); }
        } catch (error) { status(error.message); }
        finally { busy = false; paint(); }
      })();
    });
    paint();
  }
  static async photo(file) {
    const url = URL.createObjectURL(file), image = new Image();
    try {
      image.src = url;
      try { await image.decode(); } catch { throw new Error(t('files_photo_error')); }
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 50000000) throw new Error(t('files_type'));
      const ratio = Math.min(1, 2200 / Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject) => canvas.toBlob(blob => { canvas.width=0; canvas.height=0; blob ? resolve(blob) : reject(new Error(t('files_photo_error'))); }, 'image/jpeg', 0.88));
    } finally { URL.revokeObjectURL(url); }
  }
  async reader(entry) {
    const ctx = {...this.ctx};
    openModal('files_preview', `<div class="files-reader-content"><div class="files-reader-heading"><strong>${esc(entry.name)}</strong><a class="btn secondary" href="${esc(this.url(entry,true,ctx))}" download>${esc(t('files_download'))}</a></div><div class="files-reader-body"><p role="status">${esc(t('files_loading'))}</p></div></div>`,true);
    const dialog = document.getElementById('modal'), host = dialog.querySelector('.files-reader-body');
    dialog.classList.add('files-reader');
    if (entry.kind === 'image') { host.innerHTML = `<img class="files-image-full" src="${esc(this.url(entry,false,ctx))}" alt="${esc(entry.name)}">`; return; }
    const reader = new FileBookReader(host, this.url(entry,false,ctx));
    dialog.addEventListener('close', () => reader.destroy(), {once:true});
    await reader.open();
  }
}

class FileBookReader {
  constructor(host,url) { this.host=host; this.url=url; this.page=1; this.zoom=1; this.serial=0; this.tasks=[]; this.closed=false; this.spread=matchMedia('(min-width: 760px)').matches; }
  async open() {
    try {
      const pdfjs = await import('../../assets/vendor/pdfjs/legacy/build/pdf.mjs');
      if (!this.host.isConnected || this.closed) return;
      const base = new URL('assets/vendor/pdfjs/',document.baseURI).href;
      pdfjs.GlobalWorkerOptions.workerSrc = base + 'legacy/build/pdf.worker.mjs';
      this.loading = pdfjs.getDocument({url:this.url, withCredentials:true, cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/',isEvalSupported:false,enableXfa:false});
      this.pdf = await this.loading.promise;
      if (!this.host.isConnected || this.closed) { this.destroy(); return; }
      this.host.innerHTML = `<div class="files-reader-controls"><button class="btn secondary" data-book="mode">${esc(t('files_view_mode'))}</button><button class="btn secondary" data-book="zoom-out" aria-label="${esc(t('files_zoom_out'))}">−</button><button class="btn secondary" data-book="zoom-in" aria-label="${esc(t('files_zoom_in'))}">+</button><button class="text-btn" data-book="fit">${esc(t('files_fit'))}</button></div><div class="files-book-viewport" tabindex="0" aria-label="${esc(t('files_book_hint'))}"><div class="files-book"></div></div><div class="files-book-nav"><button class="btn secondary" data-book="prev">${esc(t('files_previous'))}</button><form class="files-page-form"><label>${esc(t('ms_pdf_page'))} <input type="number" min="1" max="${this.pdf.numPages}" value="1" aria-label="${esc(t('ms_pdf_page'))}"></label><span>/ ${this.pdf.numPages}</span><button class="text-btn" type="submit">${esc(t('files_go'))}</button></form><button class="btn secondary" data-book="next">${esc(t('files_next'))}</button></div><p class="files-reader-status" role="status" aria-live="polite"></p>`;
      this.viewport=this.host.querySelector('.files-book-viewport'); this.book=this.host.querySelector('.files-book');
      this.host.addEventListener('click', event => {
        const action=event.target.closest('[data-book]')?.dataset.book;
        if (action === 'prev' || action === 'next') this.turn(action === 'prev' ? -1 : 1);
        if (action === 'mode') { this.spread=!this.spread; void this.render(); }
        if (['zoom-in','zoom-out','fit'].includes(action)) { this.zoom=action === 'fit' ? 1 : Math.max(0.5,Math.min(2.5,this.zoom+(action==='zoom-in' ? .25 : -.25))); void this.render(); }
      });
      this.host.querySelector('form').addEventListener('submit',event=>{event.preventDefault();this.page=Math.max(1,Math.min(this.pdf.numPages,Number(this.host.querySelector('input').value)||1));void this.render();});
      this.viewport.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();this.turn(event.key==='ArrowLeft'?-1:1);}});
      this.viewport.addEventListener('touchstart',event=>{if(event.touches.length===1)this.touch={x:event.touches[0].clientX,y:event.touches[0].clientY};else this.touch=null;},{passive:true});
      this.viewport.addEventListener('touchend',event=>{if(!this.touch||this.zoom>1)return;const dx=event.changedTouches[0].clientX-this.touch.x,dy=event.changedTouches[0].clientY-this.touch.y;this.touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)this.turn(dx>0?-1:1);},{passive:true});
      this.observer=new ResizeObserver(()=>{clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>void this.render(),100);}); this.observer.observe(this.viewport);
      await this.render();
    } catch(error) {
      if (!this.closed && this.host.isConnected) this.host.innerHTML=`<p role="alert">${esc(t(error.name==='PasswordException'?'files_pdf_password':'files_pdf_error'))}</p>`;
      this.loading?.destroy();
    }
  }
  count() { return this.spread && this.viewport.clientWidth>=600 ? 2 : 1; }
  turn(direction) {
    const next=this.page+direction*this.count();
    if(direction>0 && this.page+this.count()>this.pdf.numPages)return;
    this.page=Math.max(1,Math.min(this.pdf.numPages,next)); void this.render();
  }
  async render() {
    if(this.closed||!this.book?.isConnected)return;
    const serial=++this.serial; this.tasks.forEach(task=>task.cancel());this.tasks=[];
    const count=this.count(), pages=Array.from({length:Math.min(count,this.pdf.numPages-this.page+1)},(_,i)=>this.page+i);
    this.host.querySelector('[data-book=prev]').disabled=this.page===1;
    this.host.querySelector('[data-book=next]').disabled=pages.at(-1)===this.pdf.numPages;
    this.host.querySelector('input').value=this.page;
    const mode=this.host.querySelector('[data-book=mode]'); mode.textContent=t(count===2?'files_single_page':'files_double_page');mode.setAttribute('aria-pressed',String(count===2));
    const status=this.host.querySelector('[role=status]');status.textContent=t('files_loading');
    const sheetWidth=Math.max(180,(this.viewport.clientWidth-48)/count),sheetHeight=Math.max(220,this.viewport.clientHeight-32);
    const fragment=document.createDocumentFragment();
    try {
      for(const number of pages){
        const page=await this.pdf.getPage(number);if(serial!==this.serial||this.closed)return;
        const natural=page.getViewport({scale:1}),scale=Math.min(sheetWidth/natural.width,sheetHeight/natural.height)*this.zoom;
        const view=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(8000000/(view.width*view.height)));
        const figure=document.createElement('figure'),canvas=document.createElement('canvas');
        canvas.width=Math.ceil(view.width*ratio);canvas.height=Math.ceil(view.height*ratio);canvas.style.width=`${view.width}px`;canvas.style.height=`${view.height}px`;
        canvas.setAttribute('aria-label',t('files_page',{page:number}));canvas.setAttribute('role','img');
        figure.append(canvas);const caption=document.createElement('figcaption');caption.textContent=number;figure.append(caption);fragment.append(figure);
        const task=page.render({canvas,viewport:view,transform:[ratio,0,0,ratio,0,0]});this.tasks.push(task);await task.promise;
        const text=await page.getTextContent();const readable=document.createElement('p');readable.className='sr-only';readable.textContent=text.items.map(item=>item.str||'').join(' ');figure.append(readable);
      }
      if(serial!==this.serial||this.closed)return;
      this.book.replaceChildren(fragment);this.book.classList.toggle('is-spread',count===2);
      this.book.classList.remove('is-turning');void this.book.offsetWidth;this.book.classList.add('is-turning');
      status.textContent=t('files_page_range',{first:this.page,last:pages.at(-1),total:this.pdf.numPages});
    }catch(error){if(serial===this.serial&&!this.closed&&error.name!=='RenderingCancelledException')status.textContent=t('files_pdf_error');}
  }
  destroy(){this.closed=true;this.serial++;clearTimeout(this.resizeTimer);this.observer?.disconnect();this.tasks.forEach(task=>task.cancel());void this.loading?.destroy();}
}
