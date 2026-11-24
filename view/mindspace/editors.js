'use strict';

class MindSpaceEditors {
  constructor(space) {
    this.space = space; this.cell = 'A1';
    document.addEventListener('dragstart', event => {
      const card = event.target.closest?.('[data-ms-card]');
      if (!card) return;
      this.dragCard = card.dataset.msCard;
      event.dataTransfer.setData('text/plain', this.dragCard);
      event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', event => {
      if (this.dragCard && event.target.closest?.('[data-ms-column]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    });
    document.addEventListener('drop', event => {
      const column = event.target.closest?.('[data-ms-column]');
      if (!this.dragCard || !column) return;
      event.preventDefault(); this.moveCard(this.dragCard, column.dataset.msColumn); this.dragCard = null;
    });
    document.addEventListener('dragend', () => { this.dragCard = null; });
  }
  render() {
    const space = this.space, kind = space.active.kind;
    if (kind === 'notes') return `<div class="ms-notes"><textarea data-ms-notes aria-label="${esc(t('ms_note_body'))}" placeholder="${esc(t('ms_note_placeholder'))}" maxlength="200000">${esc(space.draft.text || '')}</textarea></div>`;
    if (kind === 'spreadsheet') return this.sheet();
    if (kind === 'habits') return this.habits();
    return this.board();
  }
  refresh() {
    const panel = document.getElementById('mindspace-panel');
    if (panel) panel.innerHTML = this.render();
    this.space.status();
  }
  statuses() { return this.space.active.kind === 'scrum' ? ['backlog','todo','doing','done'] : ['todo','doing','done']; }
  board() {
    const draft = this.space.draft, scrum = this.space.active.kind === 'scrum', sprint = draft.sprint || {};
    return `<div class="ms-board-editor">${scrum ? `<div class="ms-sprint"><div><h3>${esc(sprint.name || t('ms_sprint'))}</h3><p>${esc(sprint.goal || t('ms_sprint_hint'))}</p>
      ${sprint.start || sprint.end ? `<small>${esc(sprint.start || '')} — ${esc(sprint.end || '')}</small>` : ''}</div><button class="btn secondary" data-action="ms-sprint">${esc(t('ms_edit_sprint'))}</button></div>` : ''}
      <div class="ms-board">${this.statuses().map(status => {
        const cards = draft.cards.filter(card => card.status === status);
        return `<section class="ms-column" data-ms-column="${status}" aria-label="${esc(t(`ms_status_${status}`))}"><header><h3>${esc(t(`ms_status_${status}`))}</h3><span>${cards.length}</span></header>
          ${cards.map(card => `<article class="ms-card" draggable="true" data-ms-card="${card.id}"><button type="button" class="ms-card-title" data-action="ms-card-edit" data-id="${card.id}">${esc(card.title)}</button>
            ${card.description ? `<p>${esc(card.description)}</p>` : ''}${scrum ? `<small>${esc(t('ms_points'))}: ${card.points}</small>` : ''}
            <label class="sr-only" for="ms-card-${card.id}">${esc(t('ms_card_status'))}: ${esc(card.title)}</label><select id="ms-card-${card.id}" data-ms-card-status="${card.id}">${this.statuses().map(value => `<option value="${value}" ${value === status ? 'selected' : ''}>${esc(t(`ms_status_${value}`))}</option>`).join('')}</select></article>`).join('')}
          <button type="button" class="ms-add-card" data-action="ms-card-new" data-status="${status}">${icon('plus')}${esc(t('ms_add_card'))}</button></section>`;
      }).join('')}</div></div>`;
  }
  async cardForm(id, status) {
    const space = this.space;
    if (!await space.flush()) return;
    const card = space.draft.cards.find(item => item.id === id) || { id:crypto.randomUUID(), title:'', description:'', status:status || 'todo', points:0 };
    openModal(id ? 'ms_edit_card' : 'ms_add_card', `<form id="ms-card-form"><label class="field"><span>${esc(t('name'))}</span><input name="title" required maxlength="190" value="${esc(card.title)}"></label>
      <label class="field"><span>${esc(t('description'))}</span><textarea name="description" maxlength="5000">${esc(card.description)}</textarea></label>
      <div class="form-grid"><label class="field"><span>${esc(t('ms_card_status'))}</span><select name="status">${this.statuses().map(value => `<option value="${value}" ${value === card.status ? 'selected' : ''}>${esc(t(`ms_status_${value}`))}</option>`).join('')}</select></label>
      ${space.active.kind === 'scrum' ? `<label class="field"><span>${esc(t('ms_points'))}</span><input type="number" name="points" value="${card.points}" min="0" max="999" step="1"></label>` : ''}</div>${formFooter()}</form>`);
    const form = document.getElementById('ms-card-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const updated = { ...card, title:String(values.get('title')).trim(), description:String(values.get('description')), status:String(values.get('status')), points:Number(values.get('points') || 0) };
      const index = space.draft.cards.findIndex(item => item.id === card.id);
      if (index < 0) space.draft.cards.push(updated); else space.draft.cards[index] = updated;
      space.changed(); closeModal(); this.refresh(); await space.save();
    }); });
  }
  moveCard(id, status) {
    const card = this.space.draft?.cards?.find(item => item.id === id);
    if (!card || !this.statuses().includes(status)) return;
    card.status = status; this.space.changed(); this.refresh();
  }
  async sprintForm() {
    const space = this.space;
    if (!await space.flush()) return;
    const sprint = space.draft.sprint;
    openModal('ms_edit_sprint', `<form id="ms-sprint-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" value="${esc(sprint.name)}"></label>
      <label class="field"><span>${esc(t('ms_sprint_goal'))}</span><textarea name="goal" maxlength="5000">${esc(sprint.goal)}</textarea></label>
      <div class="form-grid"><label class="field"><span>${esc(t('start_date'))}</span><input type="date" name="start" value="${esc(sprint.start || '')}"></label>
      <label class="field"><span>${esc(t('end_date'))}</span><input type="date" name="end" value="${esc(sprint.end || '')}"></label></div>${formFooter()}</form>`);
    const form = document.getElementById('ms-sprint-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const start = values.get('start') || null, end = values.get('end') || null;
      if (start && end && end < start) throw new Error(t('error_date'));
      space.draft.sprint = { name:String(values.get('name')), goal:String(values.get('goal')), start, end };
      space.changed(); closeModal(); this.refresh(); await space.save();
    }); });
  }

  habits() {
    const date = S.date || today(), ids = new Set(this.space.draft.habit_ids);
    const habits = (S.data.habits || []).filter(habit => ids.has(habit.id) && habit.permission === 'owner');
    return `<div class="ms-habits"><div class="ms-editor-toolbar"><label>${esc(t('date'))}<input type="date" data-ms-habit-date value="${esc(date)}" max="${today()}"></label>
      <button type="button" class="btn secondary" data-action="ms-habits-select">${esc(t('ms_choose_habits'))}</button><button type="button" class="btn primary" data-action="ms-habit-new">${icon('plus')}${esc(t('new_habit'))}</button></div>
      ${habits.length ? `<div class="ms-habit-list">${habits.map(habit => {
        const complete = done(habit, date), enabled = habit.status === 'active' && date <= today() && scheduled(habit, date);
        return `<article class="ms-habit"><button type="button" role="checkbox" aria-checked="${complete}" aria-label="${esc(t('diagram_checkbox_task', { name:habit.name }))}" data-action="toggle-habit" data-id="${habit.id}" data-date="${date}" ${enabled ? '' : 'disabled'}>${complete ? icon('check') : ''}</button>
          <div><button type="button" class="ms-habit-name" data-action="habit-detail" data-id="${habit.id}" data-date="${date}">${esc(habit.name)}</button><small>${esc(goalLabel(habit))} · ${esc(habitCategory(habit))}</small></div></article>`;
      }).join('')}</div>` : `<div class="ms-empty">${icon('habits')}<p>${esc(t('ms_habits_empty'))}</p></div>`}</div>`;
  }
  async chooseHabits() {
    const space = this.space;
    if (!await space.flush()) return;
    const own = S.data.habits.filter(habit => habit.permission === 'owner');
    openModal('ms_choose_habits', `<form id="ms-habits-form"><div class="ms-habit-choices">${own.length ? own.map(habit => `<label><input type="checkbox" name="habits" value="${habit.id}" ${space.draft.habit_ids.includes(habit.id) ? 'checked' : ''}><span>${esc(habit.name)}</span></label>`).join('') : `<p>${esc(t('ms_habits_empty'))}</p>`}</div>${formFooter()}</form>`);
    const form = document.getElementById('ms-habits-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      space.draft.habit_ids = values.getAll('habits').map(Number); space.changed(); closeModal(); this.refresh(); await space.save();
    }); });
  }
  async newHabit() {
    const space = this.space;
    if (!await space.flush()) return;
    openModal('new_habit', `<form id="ms-habit-form"><label class="field"><span>${esc(t('habit_name'))}</span><input name="name" required maxlength="190"></label>
      <label class="field"><span>${esc(t('category'))}</span><select name="category_id">${S.data.categories.length ? S.data.categories.map(category => `<option value="${category.id}">${esc(categoryName(category))}</option>`).join('') : `<option value="0">${esc(t('ms_habit_category'))}</option>`}</select></label>
      <div class="form-grid"><label class="field"><span>${esc(t('goal'))}</span><input type="number" name="goal" min="0.01" max="999999" step="0.01" value="1" required></label>
      <label class="field"><span>${esc(t('unit'))}</span><input name="unit" maxlength="40"></label></div><p class="muted">${esc(t('ms_daily_habit'))}</p>${formFooter('create')}</form>`);
    const form = document.getElementById('ms-habit-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const saved = await space.home.makeRequest('addMindSpaceHabit', { id:space.active.id, version:space.active.version,
        habit:{ name:values.get('name'), category_id:Number(values.get('category_id')), goal:Number(values.get('goal')), unit:values.get('unit'), start_date:today(), schedule_days:[1,2,3,4,5,6,7] } });
      space.active = saved; space.draft = saved.content; space.baseline = JSON.stringify(saved.content); space.upsert(saved);
      closeModal(); await refresh();
    }); });
  }

  sheet() {
    const sheet = this.space.draft, evaluator = new MindSpaceSheet(sheet);
    return `<div class="ms-sheet"><div class="ms-editor-toolbar"><button class="btn secondary" data-action="ms-sheet-row" ${sheet.rows >= 200 ? 'disabled' : ''}>${esc(t('ms_add_row'))}</button>
      <button class="btn secondary" data-action="ms-sheet-column" ${sheet.columns >= 52 ? 'disabled' : ''}>${esc(t('ms_add_column'))}</button>
      <button class="btn ghost" data-action="ms-sheet-export">${esc(t('ms_export_csv'))}</button></div>
      <div class="ms-formula-bar"><span id="ms-cell-address">${this.cell}</span><span aria-hidden="true">ƒx</span><input data-ms-formula aria-label="${esc(t('ms_formula'))}" maxlength="2000" value="${esc(sheet.cells?.[this.cell] || '')}"></div>
      <div class="ms-sheet-scroll"><table aria-label="${esc(this.space.active.name)}"><thead><tr><th></th>${Array.from({ length:sheet.columns }, (_,col) => `<th scope="col">${MindSpaceSheet.column(col)}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({ length:sheet.rows }, (_,row) => `<tr><th scope="row">${row + 1}</th>${Array.from({ length:sheet.columns }, (_,col) => {
        const key = `${MindSpaceSheet.column(col)}${row + 1}`;
        return `<td><input data-ms-cell="${key}" aria-label="${key}" autocomplete="off" spellcheck="false" maxlength="2000" value="${esc(evaluator.display(key))}"></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div><p class="ms-sheet-hint">${esc(t('ms_sheet_hint'))}</p></div>`;
  }
  recalculate() {
    const evaluator = new MindSpaceSheet(this.space.draft);
    document.querySelectorAll('[data-ms-cell]').forEach(input => { if (input !== document.activeElement) input.value = evaluator.display(input.dataset.msCell); });
  }
  event(type, event) {
    const input = event.target, space = this.space;
    if (type === 'input' && input.matches?.('[data-ms-notes]')) { space.draft.text = input.value; space.changed(); }
    if (type === 'change' && input.dataset.msCardStatus) this.moveCard(input.dataset.msCardStatus, input.value);
    if (type === 'change' && input.matches?.('[data-ms-habit-date]')) { S.date = input.value || today(); this.refresh(); }
    const key = input.dataset.msCell;
    if (type === 'focusin' && key) {
      this.cell = key; input.value = space.draft.cells?.[key] || '';
      document.getElementById('ms-cell-address').textContent = key;
      document.querySelector('[data-ms-formula]').value = input.value;
    }
    if (type === 'input' && (key || input.matches?.('[data-ms-formula]'))) {
      const address = key || this.cell;
      space.draft.cells = { ...space.draft.cells, [address]:input.value };
      if (!input.value) delete space.draft.cells[address];
      if (key) document.querySelector('[data-ms-formula]').value = input.value;
      space.changed(); this.recalculate();
    }
    if (type === 'focusout' && key) input.value = new MindSpaceSheet(space.draft).display(key);
    if (type === 'keydown' && key && event.key === 'Enter') {
      event.preventDefault();
      const [row,col] = MindSpaceSheet.address(key), next = `${MindSpaceSheet.column(col)}${Math.max(1, Math.min(space.draft.rows, row + (event.shiftKey ? 0 : 2)))}`;
      document.querySelector(`[data-ms-cell="${next}"]`)?.focus();
    }
    if (type === 'paste' && key) {
      const text = event.clipboardData.getData('text/plain');
      if (!text.includes('\t') && !text.includes('\n')) return;
      event.preventDefault();
      const values = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(row => row.split('\t'));
      const [startRow,startCol] = MindSpaceSheet.address(key), rows = startRow + values.length, columns = startCol + Math.max(...values.map(row => row.length));
      if (rows > 200 || columns > 52 || values.some(row => row.some(value => value.length > 2000))) { toast(t('ms_sheet_limit'), true); return; }
      space.draft.rows = Math.max(space.draft.rows, rows); space.draft.columns = Math.max(space.draft.columns, columns);
      values.forEach((row,r) => row.forEach((value,c) => { space.draft.cells[`${MindSpaceSheet.column(startCol + c)}${startRow + r + 1}`] = value; }));
      space.changed(); this.refresh(); document.querySelector(`[data-ms-cell="${key}"]`)?.focus();
    }
  }
  exportSheet() {
    const sheet = this.space.draft, evaluator = new MindSpaceSheet(sheet);
    const csv = Array.from({ length:sheet.rows }, (_,row) => Array.from({ length:sheet.columns }, (_,col) => {
      let value = evaluator.display(`${MindSpaceSheet.column(col)}${row + 1}`);
      if (/^[=+@-]/.test(value) && !Number.isFinite(Number(value))) value = `'${value}`;
      return `"${value.replaceAll('"','""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${this.space.active.name.replace(/[^\p{L}\p{N} _-]/gu, '') || 'MindSpace'}.csv`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async action(action, button) {
    if (action === 'ms-card-new') return this.cardForm(null, button.dataset.status);
    if (action === 'ms-card-edit') return this.cardForm(button.dataset.id);
    if (action === 'ms-sprint') return this.sprintForm();
    if (action === 'ms-habits-select') return this.chooseHabits();
    if (action === 'ms-habit-new') return this.newHabit();
    if (action === 'ms-sheet-export') return this.exportSheet();
    if (action === 'ms-sheet-row' && this.space.draft.rows < 200) this.space.draft.rows++;
    else if (action === 'ms-sheet-column' && this.space.draft.columns < 52) this.space.draft.columns++;
    else return;
    this.space.changed(); this.refresh();
  }
}
