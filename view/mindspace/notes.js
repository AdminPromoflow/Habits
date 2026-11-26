'use strict';

// Physical pages are reflowed within each uninterrupted passage. Manual pages
// and dated pages start a new passage, so editing earlier text cannot erase them.
class MindSpaceNotes {
  static LIMIT = 200000;
  static MAX_PAGES = 20000;
  constructor(space) { this.space = space; this.index = 0; this.pages = []; }
  static pages(content) {
    return content.pages?.length ? content.pages.map(page => ({...page}))
      : [{text:content.text || '', date:null, manual:true}];
  }
  static text(pages) {
    return pages.reduce((text,page,index) => text + (index && page.manual && (!text.endsWith('\n') || !pages[index-1].text) && !page.text.startsWith('\n') ? '\n' : '') + page.text, '');
  }
  static paginate(text, fits) {
    if (!text) return [''];
    const pages = [];
    while (text) {
      let low = 0, high = Math.min(1024, text.length);
      while (fits(text.slice(0,high)) && high < text.length) { low = high; high = Math.min(high * 2, text.length); }
      if (high === text.length && fits(text)) { pages.push(text); break; }
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(text.slice(0,middle))) low = middle; else high = middle - 1;
      }
      let end = Math.max(1,low);
      // Keep the browser's word wrap instead of splitting the last word in half.
      if (end < text.length && !/\s/u.test(text[end]) && !/\s/u.test(text[end-1])) {
        const boundary = text.slice(0,end).search(/\s+\S*$/u);
        if (boundary >= 0) end = boundary + (text.slice(boundary).match(/^\s+/u)?.[0].length || 0);
      }
      if (text[end] === '\n') end++;
      // Never split a surrogate pair or a combining character from its base.
      if (/^[\uDC00-\uDFFF]$/u.test(text[end] || '')) end--;
      while (end > 1 && /\p{Mark}/u.test(text[end] || '')) end--;
      if (end < 1) end = [...text][0].length;
      pages.push(text.slice(0,end)); text = text.slice(end);
      if (!text) pages.push(''); // The caret after the last ruled line belongs to a fresh page.
    }
    return pages;
  }
  render() {
    if (this.itemId !== this.space.active.id) { this.index = 0; this.itemId = this.space.active.id; }
    this.pages = MindSpaceNotes.pages(this.space.draft);
    this.index = Math.min(this.index, this.pages.length - 1);
    const editable = this.space.can('edit'), font = this.space.draft.font || 'edwardian';
    return `<div class="ms-notebook" data-note-font="${font}">
      <div class="ms-notebook-toolbar"><label for="ms-note-font">${esc(t('ms_note_font'))}</label>
        <select id="ms-note-font" data-note-font-choice ${editable ? '' : 'disabled'}><option value="edwardian" ${font === 'edwardian' ? 'selected' : ''}>Edwardian Script ITC</option><option value="roboto" ${font === 'roboto' ? 'selected' : ''}>Roboto</option></select>
        <span class="ms-notebook-hint">${esc(t('ms_note_auto_pages'))}</span>
      </div>
      <div class="planner-paper-stage"><section class="planner-note ms-note-paper" aria-label="${esc(t('ms_kind_notes'))}">
        <img class="planner-note-art" src="assets/planner/notepaper.png" alt="" aria-hidden="true" width="902" height="1272">
        <h2 class="sr-only">${esc(t('ms_kind_notes'))}</h2>
        <div class="ms-note-date-area"></div>
        <textarea class="ms-note-writing" data-ms-notes aria-label="${esc(t('ms_note_body'))}" placeholder="${esc(t('ms_note_placeholder'))}" spellcheck="true" ${editable ? '' : 'readonly'}></textarea>
        <div class="ms-note-writing ms-note-measure" aria-hidden="true"></div>
        <button type="button" class="planner-note-arrow previous" data-note-action="previous" aria-label="${esc(t('ms_note_previous'))}">${icon('chevron','flip')}</button>
        <div class="ms-note-right"><button type="button" class="planner-note-arrow next" data-note-action="next" aria-label="${esc(t('ms_note_next'))}">${icon('chevron')}</button>
          ${editable ? `<button type="button" class="ms-note-add" data-note-action="add" aria-label="${esc(t('ms_note_add'))}" title="${esc(t('ms_note_add'))}">${icon('plus')}</button>` : ''}</div>
        <span class="planner-note-page" aria-live="polite"></span>
      </section></div>
    </div>`;
  }
  mount() {
    this.observer?.disconnect();
    this.root = document.querySelector('.ms-notebook');
    if (!this.root || this.space.active?.kind !== 'notes') return;
    this.input = this.root.querySelector('[data-ms-notes]');
    this.measure = this.root.querySelector('.ms-note-measure');
    this.reflow(); this.show();
    if (this.historyItem !== this.itemId) { this.historyItem = this.itemId; this.history = [this.snapshot()]; this.historyIndex = 0; }
    const root = this.root;
    this.afterFonts();
    if (typeof ResizeObserver !== 'undefined') {
      let width = this.input.clientWidth;
      this.observer = new ResizeObserver(() => {
        if (!root.isConnected || this.root !== root || this.composing || width === this.input.clientWidth) return;
        width = this.input.clientWidth; this.reflow(this.anchor()); this.show();
      });
      this.observer.observe(this.input);
    }
  }
  anchor() {
    const focus = document.activeElement === this.input;
    return {page:this.index, start:focus ? this.input.selectionStart : 0, end:focus ? this.input.selectionEnd : 0,
      direction:this.input?.selectionDirection || 'none', focus};
  }
  afterFonts(save = false) {
    const root = this.root;
    document.fonts?.ready.then(() => {
      if (root.isConnected && this.root === root && !this.composing) {
        this.reflow(this.anchor()); this.show();
        if (save && this.space.can('edit')) this.commit();
      }
    });
  }
  reflow(anchor = {page:this.index, start:0, end:0}) {
    if (!this.input.clientWidth) return;
    const rule = parseFloat(getComputedStyle(this.input).lineHeight), height = rule * 15;
    const fits = text => { this.measure.textContent = text + '\u200b'; return this.measure.getBoundingClientRect().height <= height + 1; };
    const groups = [];
    this.pages.forEach((page,index) => {
      if (!groups.length || page.manual || page.date) groups.push({text:'', date:page.date, manual:page.manual, start:index});
      const group = groups[groups.length-1];
      if (index === anchor.page) { group.anchor = {...anchor, start:group.text.length + anchor.start, end:group.text.length + anchor.end}; }
      group.text += page.text;
    });
    const pages = []; let nextAnchor;
    for (const group of groups) {
      const parts = MindSpaceNotes.paginate(group.text, fits); let offset = 0;
      parts.forEach((text,index) => {
        if (group.anchor && !nextAnchor && (group.anchor.start < offset + text.length || index === parts.length - 1)) {
          nextAnchor = {...group.anchor, page:pages.length, start:group.anchor.start-offset, end:Math.min(text.length,group.anchor.end-offset)};
        }
        pages.push({text, date:index ? null : group.date, manual:index ? false : group.manual}); offset += text.length;
      });
    }
    this.measure.textContent = '';
    this.pages = pages;
    if (nextAnchor) { this.index = nextAnchor.page; this.selection = nextAnchor; }
    this.index = Math.min(this.index,this.pages.length-1);
  }
  show() {
    const page = this.pages[this.index], editable = this.space.can('edit');
    if (this.input.value !== page.text) this.input.value = page.text;
    this.input.readOnly = !editable;
    this.root.querySelector('[data-note-action="previous"]').disabled = this.index === 0;
    this.root.querySelector('[data-note-action="next"]').disabled = this.index === this.pages.length - 1;
    this.root.querySelector('.planner-note-page').textContent = t('planner_sheet_count',{page:this.index+1,count:this.pages.length});
    const date = this.root.querySelector('.ms-note-date-area');
    const signature = `${this.index}:${page.date}:${editable}`;
    if (date.dataset.state !== signature) {
      date.dataset.state = signature;
      date.innerHTML = page.date ? `<label class="sr-only" for="ms-note-date">${esc(t('date'))}</label><input type="date" id="ms-note-date" data-note-date value="${esc(page.date)}" min="1000-01-01" max="9998-12-31" ${editable ? '' : 'readonly'}>${editable ? `<button type="button" data-note-action="remove-date" aria-label="${esc(t('ms_note_remove_date'))}" title="${esc(t('ms_note_remove_date'))}">×</button>` : ''}`
        : editable ? `<button type="button" data-note-action="date">${icon('calendar')}<span>${esc(t('ms_note_add_date'))}</span></button>` : '';
    }
    this.input.maxLength = Math.max(page.text.length, MindSpaceNotes.LIMIT - MindSpaceNotes.text(this.pages).length + page.text.length);
    if (this.selection?.focus) {
      this.input.focus({preventScroll:true});
      this.input.setSelectionRange(this.selection.start,this.selection.end,this.selection.direction);
    }
    this.selection = null; this.input.scrollTop = 0;
  }
  commit() {
    this.space.draft = {...this.space.draft, font:this.space.draft.font || 'edwardian', pages:this.pages.map(page => ({...page})), text:MindSpaceNotes.text(this.pages)};
    const snapshot = this.snapshot();
    if (snapshot !== this.history?.[this.historyIndex]) {
      this.history = (this.history || []).slice(0,(this.historyIndex || 0)+1);
      this.history.push(snapshot); if (this.history.length > 40) this.history.shift();
      this.historyIndex = this.history.length-1;
    }
    this.space.changed();
  }
  snapshot() { return JSON.stringify({pages:this.pages, font:this.space.draft.font || 'edwardian', index:this.index}); }
  undo(direction) {
    const index = this.historyIndex + direction;
    if (!this.history?.[index]) return;
    this.historyIndex = index;
    const saved = JSON.parse(this.history[index]); this.pages = saved.pages; this.index = saved.index;
    this.space.draft.font = saved.font; this.root.dataset.noteFont = saved.font;
    this.root.querySelector('[data-note-font-choice]').value = saved.font;
    const end = this.pages[this.index].text.length;
    this.reflow({page:this.index,start:end,end,focus:true}); this.show();
    this.space.draft = {...this.space.draft, pages:this.pages.map(page => ({...page})), text:MindSpaceNotes.text(this.pages)};
    this.space.changed();
  }
  edit() {
    const anchor = this.anchor(), previous = this.pages[this.index].text;
    this.pages[this.index].text = this.input.value;
    if (MindSpaceNotes.text(this.pages).length > MindSpaceNotes.LIMIT) {
      this.pages[this.index].text = previous; this.show(); toast(t('ms_note_limit'),true); return;
    }
    this.reflow(anchor); this.show(); this.commit();
  }
  turn(index, offset = null) {
    this.index = Math.max(0,Math.min(index,this.pages.length-1));
    this.selection = offset === null ? null : {start:offset,end:offset,focus:true}; this.show();
  }
  event(type,event) {
    if (!event.target.closest?.('.ms-notebook')) return;
    const editable = this.space.can('edit'), target = event.target;
    if (type === 'click') {
      const action = target.closest('[data-note-action]')?.dataset.noteAction;
      if (action === 'previous') this.turn(this.index-1);
      if (action === 'next') this.turn(this.index+1);
      if (!editable) return;
      if (action === 'add') {
        if (this.pages.length >= MindSpaceNotes.MAX_PAGES || MindSpaceNotes.text(this.pages).length >= MindSpaceNotes.LIMIT) { toast(t('ms_note_limit'),true); return; }
        this.pages.splice(this.index+1,0,{text:'',date:null,manual:true});
        if (this.pages[this.index+2]) this.pages[this.index+2].manual = true;
        this.turn(this.index+1,0); this.commit();
      }
      if (action === 'date' || action === 'remove-date') {
        this.pages[this.index].date = action === 'date' ? today() : null;
        this.pages[this.index].manual = true; this.show(); this.commit();
        if (action === 'date') this.root.querySelector('[data-note-date]')?.focus();
      }
    }
    if (!editable) return;
    if (type === 'beforeinput' && ['historyUndo','historyRedo'].includes(event.inputType)) {
      event.preventDefault(); this.undo(event.inputType === 'historyUndo' ? -1 : 1); return;
    }
    if (type === 'compositionstart') this.composing = true;
    if (type === 'compositionend') { this.composing = false; this.edit(); }
    if (type === 'input' && target === this.input) {
      if (event.isComposing || this.composing) { this.pages[this.index].text = target.value; this.commit(); }
      else this.edit();
    }
    if (type === 'change' && target.matches('[data-note-font-choice]')) {
      const anchor = this.anchor(); this.space.draft.font = target.value;
      this.root.dataset.noteFont = target.value; this.reflow(anchor); this.show(); this.commit();
      this.afterFonts(true);
    }
    if (type === 'change' && target.matches('[data-note-date]') && target.validity.valid) {
      this.pages[this.index].date = target.value || null; this.pages[this.index].manual = true; this.show(); this.commit();
    }
    if (type === 'keydown' && target === this.input && !event.isComposing && !this.composing) {
      if ((event.metaKey || event.ctrlKey) && ['z','y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); this.undo(event.shiftKey || event.key.toLowerCase() === 'y' ? 1 : -1); return;
      }
      const start = target.selectionStart, end = target.selectionEnd;
      if (start !== end) return;
      if (event.key === 'ArrowLeft' && start === 0 && this.index) { event.preventDefault(); this.turn(this.index-1,this.pages[this.index-1].text.length); }
      if (event.key === 'ArrowRight' && end === target.value.length && this.index < this.pages.length-1) { event.preventDefault(); this.turn(this.index+1,0); }
      if (event.key === 'Backspace' && start === 0 && this.index) {
        event.preventDefault();
        const previous = this.pages[this.index-1], offset = previous.text.length;
        const manual = this.pages[this.index].manual || this.pages[this.index].date;
        previous.text += this.pages[this.index].text; this.pages.splice(this.index,1); this.index--;
        // Removing a page break takes one keystroke; an automatic boundary behaves like continuous text.
        if (!manual && offset) {
          const before = previous.text.slice(0,offset), length = [...new Intl.Segmenter().segment(before)].at(-1)?.segment.length || 1;
          previous.text = before.slice(0,-length) + previous.text.slice(offset);
          this.reflow({page:this.index,start:offset-length,end:offset-length,focus:true});
        } else this.reflow({page:this.index,start:offset,end:offset,focus:true});
        this.show(); this.commit();
      }
    }
  }
}
