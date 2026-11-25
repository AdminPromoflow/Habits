'use strict';

// Generated in the browser from the currently authorized document. Vendor files
// are served locally and loaded only when an export is requested.
class MindSpacePDF {
  static loadScript(file) {
    this.scripts ||= new Map();
    if (!this.scripts.has(file)) {
      this.scripts.set(file, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `assets/vendor/pdf/${file}`;
        script.onload = resolve;
        script.onerror = () => { this.scripts.delete(file); script.remove(); reject(new Error(t('ms_pdf_error'))); };
        document.head.append(script);
      }));
    }
    return this.scripts.get(file);
  }

  static async libraries(diagram) {
    await this.loadScript('jspdf-4.2.1.umd.min.js');
    await Promise.all([
      this.loadScript('jspdf-autotable-5.0.7.min.js'),
      this.loadScript('noto-sans-regular.js'),
      ...(diagram ? [this.loadScript('html2canvas-1.4.1.min.js')] : []),
    ]);
  }

  static filename(name) {
    return (String(name || '').normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '-').replace(/[.\s]+$/g, '').slice(0, 120) || 'MindSpace') + '.pdf';
  }

  static async download(space, button) {
    if (space.pdfBusy || !space.active || space.active.kind === 'folder') return;
    const generation = space.generation, id = space.active.id;
    const current = () => generation === space.generation && space.active?.id === id;
    const label = button.textContent;
    space.pdfBusy = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
    button.textContent = t('ms_pdf_preparing');
    try {
      await this.libraries(space.isDiagram());
      if (!current() || !await space.flush() || !current()) return;
      const item = JSON.parse(JSON.stringify({...space.active, content:space.draft}));
      if (item.kind === 'diagram') item.name = space.home.titleName();
      const pdf = new MindSpacePDF(item, space.spaceName());
      if (item.kind === 'diagram') await pdf.diagram(space.home);
      else if (item.kind === 'spreadsheet') pdf.sheet();
      else if (item.kind === 'notes') pdf.text(item.content.text || t('ms_pdf_empty'));
      else if (item.kind === 'habits') pdf.habits();
      else pdf.board();
      if (!current()) return;
      pdf.finish();
      pdf.doc.save(this.filename(item.name));
    } catch (error) {
      if (current()) toast(t('ms_pdf_error'), true);
      console.error('MindSpace PDF export failed', error);
    } finally {
      space.pdfBusy = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = label;
    }
  }

  constructor(item, spaceName) {
    this.item = item; this.spaceName = spaceName;
    this.doc = new window.jspdf.jsPDF({orientation:['spreadsheet','diagram'].includes(item.kind) ? 'landscape' : 'portrait', unit:'mm', format:'a4', compress:true, putOnlyUsedFonts:true});
    this.doc.addFileToVFS('NotoSans-Regular.ttf', window.MindSpacePDFFont);
    this.doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    this.doc.setFont('NotoSans', 'normal');
    this.doc.setProperties({title:item.name, subject:t(`ms_kind_${item.kind}`), creator:'MyRemarkable Mind'});
    this.width = this.doc.internal.pageSize.getWidth();
    this.height = this.doc.internal.pageSize.getHeight();
    this.margin = 16; this.bottom = this.height - 18;
    this.y = 20;
    this.doc.setTextColor(112, 87, 149);
    this.text(item.name, 20, 3);
    this.doc.setTextColor(100, 95, 110);
    this.text(`${spaceName} · ${t(`ms_kind_${item.kind}`)}`, 10, 7);
    this.doc.setTextColor(52, 48, 68);
  }

  newPage() { this.doc.addPage(); this.y = 20; }
  space(height) { if (this.y + height > this.bottom) this.newPage(); }
  text(value, size = 11, gap = 4) {
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(String(value).replace(/\r\n?/g, '\n').replace(/\t/g, '    '), this.width - this.margin * 2);
    const lineHeight = size * 0.5;
    for (const line of lines) {
      this.space(lineHeight);
      this.doc.text(line, this.margin, this.y);
      this.y += lineHeight;
    }
    this.y += gap;
  }

  table(head, body, columnStyles = {}) {
    this.space(22);
    this.doc.autoTable({
      head, body, startY:this.y, margin:{top:20, bottom:20, left:this.margin, right:this.margin},
      theme:'grid', rowPageBreak:'avoid',
      styles:{font:'NotoSans', fontStyle:'normal', fontSize:9, cellPadding:3, overflow:'linebreak', textColor:[52,48,68], lineColor:[232,226,239], lineWidth:0.2},
      headStyles:{fontStyle:'normal', fillColor:[112,87,149], textColor:[255,255,255]},
      alternateRowStyles:{fillColor:[248,246,251]}, columnStyles,
    });
    this.y = this.doc.lastAutoTable.finalY + 8;
  }

  sheet() {
    const sheet = this.item.content, evaluator = new MindSpaceSheet(sheet);
    const values = Array.from({length:sheet.rows}, (_, row) => Array.from({length:sheet.columns}, (_, col) => evaluator.display(`${MindSpaceSheet.column(col)}${row + 1}`)));
    let rows = 1, columns = 1;
    values.forEach((row, r) => row.forEach((value, c) => { if (String(value).trim()) { rows = Math.max(rows, r + 1); columns = Math.max(columns, c + 1); } }));
    if (sheet.template === 'ledger') {
      const format = new Intl.NumberFormat(S.language === 'es' ? 'es-CO' : 'en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      for (const [key, amount] of Object.entries(evaluator.ledgerSummary())) this.text(`${t(`ms_ledger_${key}`)}: ${typeof amount === 'number' ? format.format(amount / 100) : amount}`, 11, 1);
      this.y += 5;
    }
    // Split wide sheets into legible column groups; never squeeze 52 columns
    // onto one page. Repeated row numbers preserve each cell's address.
    for (let first = 0; first < columns; first += 6) {
      if (first) this.newPage();
      const count = Math.min(6, columns - first);
      const labels = Array.from({length:count}, (_, i) => MindSpaceSheet.column(first + i));
      const head = [['#', ...labels]];
      if (sheet.template) head.push(['1', ...values[0].slice(first, first + count)]);
      const body = values.slice(sheet.template ? 1 : 0, rows).map((row, i) => [String(i + (sheet.template ? 2 : 1)), ...row.slice(first, first + count)]);
      const columnStyles = {0:{cellWidth:12, textColor:[112,87,149]}};
      for (let i = 1; i <= count; i++) columnStyles[i] = {cellWidth:(this.width - 2 * this.margin - 12) / count};
      this.table(head, body, columnStyles);
    }
  }

  board() {
    const {content} = this.item, sprint = content.sprint || {};
    if (sprint.name) this.text(sprint.name, 15);
    if (sprint.goal) this.text(`${t('ms_sprint_goal')}: ${sprint.goal}`);
    if (sprint.start || sprint.end) this.text(`${sprint.start || ''} - ${sprint.end || ''}`, 10, 6);
    for (const column of MindSpaceLinkTargets.columns(this.item)) {
      this.space(32); this.text(column.name, 14, 3);
      const cards = content.cards.filter(card => card.status === column.id);
      if (!cards.length) this.text(t('ms_pdf_empty'), 10, 6);
      else this.table([[t('name'), t('description'), t('ms_points')]], cards.map(card => [card.title, card.description || '', String(card.points || 0)]), {0:{cellWidth:48}, 2:{cellWidth:20}});
    }
  }

  habits() {
    const date = S.date || today(), ids = new Set(this.item.content.habit_ids);
    const habits = (S.data.habits || []).filter(habit => ids.has(habit.id) && (habit.permission === 'owner' || S.sharedWorkspace));
    this.text(`${t('date')}: ${date}`, 11, 6);
    if (!habits.length) { this.text(t('ms_pdf_empty')); return; }
    this.table([[t('habit_name'), t('category'), t('goal'), t('status')]], habits.map(habit => [
      habit.name, habitCategory(habit), goalLabel(habit), t(done(habit, date) ? 'completed' : 'pending'),
    ]));
  }

  async diagram(home) {
    const source = document.getElementById('diagram-scene') || home.element('root', 'root');
    if (!source) throw new Error('Diagram is not mounted');
    const clone = source.cloneNode(true), host = document.createElement('div');
    const width = Math.ceil(source.offsetWidth + 40), height = Math.ceil(source.offsetHeight + 40);
    host.id = 'ms-pdf-diagram';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:absolute;left:-100000px;top:0;width:${width}px;height:${height}px;background:white;padding:20px;--ink:#343044;--surface:#fff;--purple-dark:#705795;--lavender:#b8a4d4;--lavender-wash:#f1ecf7;`;
    host.style.backgroundColor = home.colors.background() || '#ffffff';
    clone.style.position = 'relative'; clone.style.left = '0'; clone.style.top = '0'; clone.style.transform = 'none'; clone.style.margin = '0';
    clone.querySelectorAll('.diagram-controls,.diagram-branch-toggle,.diagram-menu,.diagram-status,.sr-only,.diagram-alignment-guides,.diagram-connection-tools,.diagram-topic-link,.diagram-topic-return').forEach(el => el.remove());
    clone.querySelectorAll('.is-selected,.is-editing').forEach(el => el.classList.remove('is-selected','is-editing'));
    clone.classList.remove('is-selected','is-editing');
    // Textareas otherwise paint only their scroll viewport, losing wrapped text.
    clone.querySelectorAll('textarea').forEach(input => {
      const text = document.createElement('div'); text.textContent = input.value;
      text.style.cssText = 'width:100%;min-height:24px;font:16px/24px system-ui,sans-serif;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--diagram-node-text,#343044);';
      input.replaceWith(text);
    });
    // Inline SVG images need resolved colors; CSS variables are lost when the
    // SVG is serialized by html2canvas into an image.
    clone.querySelectorAll('svg path').forEach(path => {
      const edge = path.closest('.diagram-connection');
      path.style.stroke = path.classList.contains('diagram-connection-hit') ? 'transparent'
        : edge ? home.colors.line(edge.dataset) || '#b8a4d4' : path.style.stroke || '#b8a4d4';
      path.style.fill = 'none';
    });
    clone.querySelectorAll('svg text').forEach(text => { text.style.fill = '#343044'; text.style.stroke = '#fff'; });
    host.append(clone); document.body.append(host);
    try {
      await document.fonts.ready;
      const canvas = await window.html2canvas(host, {
        backgroundColor:'#ffffff', logging:false, width, height,
        // Keep even large diagrams within browser canvas limits.
        scale:Math.min(2, 12000 / width, 12000 / height, Math.sqrt(16000000 / (width * height))),
        onclone:doc => { doc.getElementById(host.id).style.left = '0'; },
      });
      const availableWidth = this.width - this.margin * 2, availableHeight = this.bottom - this.y;
      const scale = Math.min(25.4 / 96, availableWidth / width, availableHeight / height);
      this.doc.addImage(canvas, 'PNG', this.margin + (availableWidth - width * scale) / 2, this.y, width * scale, height * scale);
    } finally { host.remove(); }
  }

  finish() {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      this.doc.setPage(page); this.doc.setFontSize(8); this.doc.setTextColor(100,95,110);
      this.doc.text('MyRemarkable Mind', this.margin, this.height - 9);
      this.doc.text(`${t('ms_pdf_page')} ${page} / ${pages}`, this.width - this.margin, this.height - 9, {align:'right'});
    }
  }
}
