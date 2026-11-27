'use strict';

class MindSpaceEditors {
  constructor(space) {
    this.space = space; this.cell = 'A1';
    this.selectedCells = new Set(['A1']); this.selectionAnchor = 'A1';
    document.addEventListener('pointerdown', event => this.startCellSelection(event));
    document.addEventListener('pointermove', event => this.dragCellSelection(event));
    document.addEventListener('pointerup', event => this.endCellSelection(event));
    document.addEventListener('pointercancel', event => this.endCellSelection(event));
    document.defaultView?.addEventListener('blur', () => this.endCellSelection());
    document.addEventListener('dragstart', event => {
      const card = event.target.closest?.('[data-ms-card]');
      if (!card || !this.space.can('edit')) return;
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
    if (kind === 'notes') { this.notes ||= new MindSpaceNotes(space); return this.notes.render(); }
    if (kind === 'spreadsheet') return this.sheet();
    if (kind === 'habits') return this.habits();
    return this.board();
  }
  refresh() {
    const panel = document.getElementById('mindspace-panel');
    if (panel) panel.innerHTML = this.render();
    if (this.space.active?.kind === 'notes') this.notes?.mount();
    this.space.status();
    if (S.sharedWorkspace) mountSharedWorkspace();
  }
  sprints() { return MindSpaceLinkTargets.sprints({...this.space.active, content:this.space.draft}); }
  columns(sprintId = null) { return sprintId ? this.sprints().find(sprint => sprint.id === sprintId)?.columns || [] : MindSpaceLinkTargets.columns({...this.space.active, content:this.space.draft}); }
  statuses() { return this.columns().map(column => column.id); }
  columnName(id) { return MindSpaceLinkTargets.choices({...this.space.active, content:this.space.draft}, [], 'column').find(column => column.id === id)?.label || id; }
  collapseState() {
    const key = `mindspace-sprints:${typeof location === 'undefined' ? '' : new URL(location.href).pathname}:${S.user?.id || 'guest'}:${this.space.active?.id}`;
    this.collapsedBoards ||= new Map();
    if (!this.collapsedBoards.has(key)) {
      let value;
      try { value = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
      this.collapsedBoards.set(key, value && typeof value === 'object' && !Array.isArray(value) ? value : {});
    }
    return {key, values:this.collapsedBoards.get(key)};
  }
  toggleSprint(id, collapsed = undefined) {
    if (!this.sprints().some(sprint => sprint.id === id)) return;
    const state = this.collapseState();
    state.values[id] = collapsed ?? !state.values[id];
    try { localStorage.setItem(state.key, JSON.stringify(state.values)); } catch {}
    const section = document.querySelector?.(`[data-ms-sprint="${id}"]`);
    const button = section?.querySelector('[data-action="ms-sprint-toggle"]'), content = section?.querySelector('.ms-board');
    if (content) content.hidden = state.values[id];
    button?.setAttribute('aria-expanded', String(!state.values[id]));
  }
  board() {
    const draft = this.space.draft, sprints = this.sprints(), collapsed = this.collapseState().values, editable = this.space.can('edit');
    const returns = this.space.targetReturnLinks(), columnReturns = this.space.targetReturnLinks('column');
    return `<div class="ms-board-editor">${sprints.map((sprint,index) => `<section class="ms-sprint-section" data-ms-sprint="${sprint.id}"><header class="ms-sprint"><div class="ms-sprint-summary"><h3><button type="button" class="ms-sprint-toggle" data-action="ms-sprint-toggle" data-sprint="${sprint.id}" aria-expanded="${!collapsed[sprint.id]}" aria-controls="ms-sprint-content-${sprint.id}">${icon('chevron')}<span>${esc(sprint.name || t('ms_sprint_number',{number:index+1}))}</span></button></h3>${sprint.goal ? `<p>${esc(sprint.goal)}</p>` : ''}
      ${sprint.start || sprint.end ? `<small>${esc(sprint.start || '')} — ${esc(sprint.end || '')}</small>` : ''}</div>${editable ? `<div class="ms-sprint-actions"><button type="button" class="btn secondary" data-action="ms-column-new" data-sprint="${sprint.id}" ${sprint.columns.length >= 50 ? 'disabled' : ''}>${icon('plus')}${esc(t('ms_add_column'))}</button><button type="button" class="text-btn" data-action="ms-sprint" data-sprint="${sprint.id}">${esc(t('ms_edit_sprint'))}</button></div>` : ''}</header>
      <div class="ms-board" id="ms-sprint-content-${sprint.id}" ${collapsed[sprint.id] ? 'hidden' : ''}>${sprint.columns.map(({id:status,name}) => {
        const cards = draft.cards.filter(card => MindSpaceLinkTargets.status(card) === status);
        return `<section class="ms-column" data-ms-column="${esc(status)}" aria-label="${esc(name)}"><header><h3>${esc(name)}</h3><span>${cards.length}</span>${columnReturns.get(status) || ''}</header>
          ${cards.map(card => `<article class="ms-card" draggable="${editable}" data-ms-card="${card.id}"><div class="ms-card-heading"><button type="button" class="ms-card-title" data-action="ms-card-edit" data-id="${card.id}">${esc(card.title)}</button>
            <button type="button" class="ms-card-calendar" data-action="ms-card-calendar" data-id="${card.id}" aria-label="${esc(t('diagram_option_calendar') + ': ' + card.title)}" title="${esc(t('diagram_option_calendar'))}" ${this.space.can('edit') ? '' : 'disabled'}>${icon('calendar')}</button></div>
            ${card.description ? `<p>${esc(card.description)}</p>` : ''}${card.points ? `<small>${esc(t('ms_points'))}: ${card.points}</small>` : ''}
            <label class="sr-only" for="ms-card-${card.id}">${esc(t('ms_card_status'))}: ${esc(card.title)}</label><select id="ms-card-${card.id}" data-ms-card-status="${card.id}">${this.statuses().map(value => `<option value="${esc(value)}" ${value === status ? 'selected' : ''}>${esc(this.columnName(value))}</option>`).join('')}</select>${returns.get(card.id) || ''}</article>`).join('')}
          ${editable ? `<button type="button" class="ms-add-card" data-action="ms-card-new" data-status="${esc(status)}">${icon('plus')}${esc(t('ms_add_card'))}</button>` : ''}</section>`;
      }).join('')}</div></section>`).join('') || `<p class="ms-empty">${esc(t('ms_sprints_empty'))}</p>`}<div class="ms-board-footer">${editable ? `<button type="button" class="btn secondary" data-action="ms-sprint-new" aria-label="${esc(t('ms_add_sprint'))}" title="${esc(t('ms_add_sprint'))}" ${sprints.length >= 50 ? 'disabled' : ''}>${icon('plus')}${esc(t('ms_new_sprint'))}</button>` : ''}</div></div>`;
  }
  async newColumn(sprintId = 'main') {
    const space = this.space;
    if (!await space.flush()) return;
    if (!this.sprints().some(sprint => sprint.id === sprintId)) return;
    if (this.columns(sprintId).length >= 50) throw new Error(t('ms_column_limit'));
    openModal('ms_add_column', `<form id="ms-column-form"><label class="field"><span>${esc(t('ms_column_name'))}</span><input name="name" required maxlength="80" autocomplete="off"></label>${formFooter('create')}</form>`);
    const form = document.getElementById('ms-column-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const name = String(values.get('name')).trim(), columns = this.columns(sprintId);
      if (!name) throw new Error(t('error_validation'));
      if (columns.length >= 50) throw new Error(t('ms_column_limit'));
      if (columns.some(column => column.name.toLowerCase() === name.toLowerCase())) throw new Error(t('ms_column_exists'));
      const id = crypto.randomUUID();
      const sprint = sprintId === 'main' ? space.draft : space.draft.sprints.find(sprint => sprint.id === sprintId);
      sprint.columns = [...columns, {id, name}];
      this.toggleSprint(sprintId, false);
      space.changed(); closeModal(); this.refresh();
      const column = document.querySelector(`[data-ms-column="${id}"]`);
      column?.scrollIntoView({block:'nearest', inline:'end'});
      column?.querySelector('.ms-add-card')?.focus({preventScroll:true});
      await space.save();
    }); });
  }
  async newSprint() {
    const space = this.space, generation = space.generation;
    if (this.creatingSprint || !space.can('edit')) return;
    this.creatingSprint = true;
    try {
      if (!await space.flush() || generation !== space.generation) return;
      if (this.sprints().length >= 50) throw new Error(t('ms_sprint_limit'));
      const sprint = {id:crypto.randomUUID(),name:t('ms_sprint_number',{number:this.sprints().length+1}),goal:'',start:null,end:null,
        columns:['backlog','doing','done'].map(status => ({id:crypto.randomUUID(),name:t(`ms_status_${status}`)}))};
      space.draft.sprints ||= []; space.draft.sprints.push(sprint);
      space.changed(); this.refresh();
      const section = document.querySelector(`[data-ms-sprint="${sprint.id}"]`);
      section?.scrollIntoView({block:'nearest',inline:'nearest'});
      section?.querySelector('[data-action="ms-sprint-toggle"]')?.focus({preventScroll:true});
      await space.save();
    } finally { this.creatingSprint = false; }
  }
  async cardForm(id, status) {
    const space = this.space;
    if (!await space.flush()) return;
    const found = space.draft.cards.find(item => item.id === id);
    const card = found ? {...found, status:MindSpaceLinkTargets.status(found)} : { id:crypto.randomUUID(), title:'', description:'', status:status || 'backlog', points:0 };
    openModal(id ? 'ms_edit_card' : 'ms_add_card', `<form id="ms-card-form"><label class="field"><span>${esc(t('name'))}</span><input name="title" required maxlength="190" value="${esc(card.title)}"></label>
      <label class="field"><span>${esc(t('description'))}</span><textarea name="description" maxlength="5000">${esc(card.description)}</textarea></label>
      <div class="form-grid"><label class="field"><span>${esc(t('ms_card_status'))}</span><select name="status">${this.statuses().map(value => `<option value="${esc(value)}" ${value === card.status ? 'selected' : ''}>${esc(this.columnName(value))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('ms_points'))}</span><input type="number" name="points" value="${card.points}" min="0" max="999" step="1"></label></div>${formFooter()}</form>`);
    const form = document.getElementById('ms-card-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const updated = { ...card, title:String(values.get('title')).trim(), description:String(values.get('description')), status:String(values.get('status')), points:Number(values.get('points') || 0) };
      const index = space.draft.cards.findIndex(item => item.id === card.id);
      if (index < 0) space.draft.cards.push(updated); else space.draft.cards[index] = updated;
      space.changed(); closeModal(); this.refresh(); await space.save();
    }); });
  }
  async scheduleCard(id) {
    const space = this.space, itemId = space.active?.id, generation = space.generation;
    if (!['kanban','scrum'].includes(space.active?.kind) || !space.can('edit')) return;
    if (!await space.flush() || space.generation !== generation || space.active?.id !== itemId) return;
    const card = space.draft.cards.find(card => card.id === id);
    if (!card) return;
    const source = S.sharedWorkspace ? {} : {source_item_id:itemId, source_card_key:id};
    const matching = [...(S.data.calendar?.tasks || []).map(entry => ({...entry,kind:'task'})),
      ...(S.data.habits || []).filter(habit => habit.permission === 'owner' && habit.status === 'active').map(habit => ({...habit,kind:'habit'}))]
      .find(entry => source.source_item_id && Number(entry.source_item_id) === itemId && entry.source_card_key === id);
    return plannerForm(matching || null, {...source, name:card.title, description:card.description || ''});
  }
  moveCard(id, status) {
    if (!this.space.can('edit')) return;
    const card = this.space.draft?.cards?.find(item => item.id === id);
    if (!card || !this.statuses().includes(status)) return;
    card.status = status;
    const sprint = this.sprints().find(sprint => sprint.columns.some(column => column.id === status));
    if (sprint) this.toggleSprint(sprint.id, false);
    this.space.changed(); this.refresh();
  }
  async sprintForm(sprintId = 'main') {
    const space = this.space;
    if (!space.can('edit')) return;
    if (!await space.flush()) return;
    const sprint = this.sprints().find(sprint => sprint.id === sprintId);
    if (!sprint) return;
    openModal('ms_edit_sprint', `<form id="ms-sprint-form"><label class="field"><span>${esc(t('name'))}</span><input name="name" maxlength="120" value="${esc(sprint.name)}"></label>
      <label class="field"><span>${esc(t('ms_sprint_goal'))}</span><textarea name="goal" maxlength="5000">${esc(sprint.goal)}</textarea></label>
      <div class="form-grid"><label class="field"><span>${esc(t('start_date'))}</span><input type="date" name="start" value="${esc(sprint.start || '')}"></label>
      <label class="field"><span>${esc(t('end_date'))}</span><input type="date" name="end" value="${esc(sprint.end || '')}"></label></div>${formFooter('save', `<button type="button" class="text-btn danger" data-action="ms-sprint-delete" data-sprint="${sprintId}">${esc(t('ms_delete_sprint'))}</button>`)}</form>`);
    const form = document.getElementById('ms-sprint-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async values => {
      const start = values.get('start') || null, end = values.get('end') || null;
      if (start && end && end < start) throw new Error(t('error_date'));
      const details = { name:String(values.get('name')), goal:String(values.get('goal')), start, end };
      if (sprintId === 'main') space.draft.sprint = details;
      else Object.assign(space.draft.sprints.find(sprint => sprint.id === sprintId), details);
      space.changed(); closeModal(); this.refresh(); await space.save();
    }); });
  }

  async deleteSprintForm(sprintId) {
    const space = this.space, generation = space.generation;
    if (!space.can('edit') || !await space.flush() || generation !== space.generation) return;
    const sprints = this.sprints(), index = sprints.findIndex(sprint => sprint.id === sprintId);
    if (index < 0) return;
    const sprint = sprints[index], columns = new Set(sprint.columns.map(column => column.id));
    const count = space.draft.cards.filter(card => columns.has(MindSpaceLinkTargets.status(card))).length;
    const name = sprint.name || t('ms_sprint_number', {number:index+1});
    openModal('ms_delete_sprint', `<form id="ms-sprint-delete-form"><p>${esc(t('ms_delete_sprint_confirm', {name, count}))}</p>${formFooter('delete')}</form>`);
    const form = document.getElementById('ms-sprint-delete-form');
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async () => {
      if (!space.can('edit') || generation !== space.generation) return;
      if (!await space.flush()) throw new Error(space.error || t('ms_unsaved'));
      if (generation !== space.generation || !this.sprints().some(sprint => sprint.id === sprintId)) return;
      const before = space.draft, next = JSON.parse(JSON.stringify(before));
      next.cards = next.cards.filter(card => !columns.has(MindSpaceLinkTargets.status(card)));
      if (sprintId === 'main') { next.sprint = null; next.columns = []; }
      else next.sprints = next.sprints.filter(sprint => sprint.id !== sprintId);
      space.draft = next;
      if (!await space.save()) {
        if (generation === space.generation) { space.draft = before; space.status(); }
        throw new Error(space.error || t('ms_unsaved'));
      }
      const state = this.collapseState();
      delete state.values[sprintId];
      try { localStorage.setItem(state.key, JSON.stringify(state.values)); } catch {}
      closeModal(); this.refresh();
      document.querySelector('[data-action="ms-sprint-new"]')?.focus({preventScroll:true});
    }); });
  }

  habits() {
    const date = S.date || today(), ids = new Set(this.space.draft.habit_ids);
    const returns = this.space.targetReturnLinks();
    const habits = (S.data.habits || []).filter(habit => ids.has(habit.id) && (habit.permission === 'owner' || S.sharedWorkspace));
    return `<div class="ms-habits"><div class="ms-editor-toolbar"><label>${esc(t('date'))}<input type="date" data-ms-habit-date value="${esc(date)}" max="${today()}"></label>
      <button type="button" class="btn secondary" data-action="ms-habits-select">${esc(t('ms_choose_habits'))}</button><button type="button" class="btn primary" data-action="ms-habit-new">${icon('plus')}${esc(t('new_habit'))}</button></div>
      ${habits.length ? `<div class="ms-habit-list">${habits.map(habit => {
        const complete = done(habit, date), enabled = habit.status === 'active' && date <= today() && scheduled(habit, date);
        return `<article class="ms-habit" data-ms-habit="${habit.id}"><button type="button" role="checkbox" aria-checked="${complete}" aria-label="${esc(t('diagram_checkbox_task', { name:habit.name }))}" data-action="toggle-habit" data-id="${habit.id}" data-date="${date}" ${enabled ? '' : 'disabled'}>${complete ? icon('check') : ''}</button>
          <div><button type="button" class="ms-habit-name" data-action="habit-detail" data-id="${habit.id}" data-date="${date}">${esc(habit.name)}</button><small>${esc(goalLabel(habit))} · ${esc(habitCategory(habit))}</small></div>${returns.get(String(habit.id)) || ''}</article>`;
      }).join('')}</div>` : `<div class="ms-empty">${icon('habits')}<p>${esc(t('ms_habits_empty'))}</p></div>`}</div>`;
  }
  async chooseHabits() {
    const space = this.space;
    if (!await space.flush()) return;
    const own = S.data.habits.filter(habit => habit.permission === 'owner' || S.sharedWorkspace);
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

  cellRange(start, end) {
    const [r1,c1] = MindSpaceSheet.address(start), [r2,c2] = MindSpaceSheet.address(end), keys = [];
    for (let row = Math.min(r1,r2); row <= Math.max(r1,r2); row++) {
      for (let col = Math.min(c1,c2); col <= Math.max(c1,c2); col++) keys.push(`${MindSpaceSheet.column(col)}${row+1}`);
    }
    return keys;
  }
  selectionKeys() {
    const sheet = this.space.draft;
    const keys = [...this.selectedCells].filter(key => {
      const [row,col] = MindSpaceSheet.address(key);
      return row < sheet.rows && col < sheet.columns;
    });
    return keys.length ? keys : [this.cell];
  }
  selectionLabel(keys = this.selectionKeys()) {
    if (keys.length === 1) return keys[0];
    const points = keys.map(MindSpaceSheet.address), rows = points.map(point => point[0]), cols = points.map(point => point[1]);
    const first = `${MindSpaceSheet.column(Math.min(...cols))}${Math.min(...rows)+1}`;
    const last = `${MindSpaceSheet.column(Math.max(...cols))}${Math.max(...rows)+1}`;
    const rectangle = (Math.max(...rows)-Math.min(...rows)+1)*(Math.max(...cols)-Math.min(...cols)+1) === keys.length;
    return `${rectangle ? `${first}:${last} · ` : ''}${t('ms_selected_cells', {count:keys.length})}`;
  }
  selectCell(key, {extend = false, add = false, toggle = false} = {}) {
    const [row,col] = MindSpaceSheet.address(key), sheet = this.space.draft;
    if (row >= sheet.rows || col >= sheet.columns) return;
    this.editingCell = null;
    const next = add ? new Set(this.selectedCells) : new Set();
    if (extend) this.cellRange(this.selectionAnchor || this.cell, key).forEach(cell => next.add(cell));
    else if (toggle && next.has(key) && next.size > 1) next.delete(key);
    else next.add(key);
    this.selectedCells = next;
    this.cell = next.has(key) ? key : [...next].at(-1);
    if (!extend) this.selectionAnchor = this.cell;
    this.syncCellSelection();
  }
  syncCellSelection() {
    document.querySelectorAll('[data-ms-grid-cell]').forEach(cell => {
      const selected = this.selectedCells.has(cell.dataset.msGridCell);
      cell.classList.toggle('is-selected', selected);
      cell.setAttribute('aria-selected', String(selected));
    });
    const label = document.querySelector('[data-ms-style-address]');
    if (label) label.textContent = this.selectionLabel();
  }
  focusCell(key) {
    this.keepCellSelection = true;
    try { document.querySelector(`[data-ms-cell="${key}"]`)?.focus({preventScroll:true}); }
    finally { this.keepCellSelection = false; }
  }
  startCellSelection(event) {
    const input = event.target.closest?.('[data-ms-cell]');
    if (!input?.closest('#mindspace-panel') || event.button !== 0 || this.space.active?.kind !== 'spreadsheet' || !this.space.can('edit')) return;
    // A double click still allows normal caret placement and text selection.
    if (event.detail > 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey) return;
    this.endCellSelection(); this.skipCellClick = false;
    const key = input.dataset.msCell, add = event.ctrlKey || event.metaKey;
    const base = add ? new Set(this.selectedCells) : new Set();
    this.selectCell(key, {extend:event.shiftKey, add, toggle:add && !event.shiftKey});
    this.cellDrag = {pointer:event.pointerId, input, start:key, end:key, anchor:this.selectionAnchor, base,
      modified:Boolean(add || event.shiftKey), moved:false, id:this.space.active.id, generation:this.space.generation};
    event.preventDefault(); this.focusCell(this.cell);
    input.setPointerCapture?.(event.pointerId);
    input.closest('.ms-sheet-scroll')?.classList.add('is-selecting');
  }
  dragCellSelection(event) {
    const drag = this.cellDrag;
    if (!drag || event.pointerId !== drag.pointer) return;
    if (this.space.active?.id !== drag.id || this.space.generation !== drag.generation || !event.buttons) { this.endCellSelection(event); return; }
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const input = hit?.closest?.('[data-ms-cell]') || hit?.closest?.('td')?.querySelector('[data-ms-cell]');
    if (!input?.closest('#mindspace-panel') || input.dataset.msCell === drag.end) return;
    drag.end = input.dataset.msCell; drag.moved = true;
    this.selectedCells = new Set([...drag.base, ...this.cellRange(drag.anchor, drag.end)]);
    this.cell = drag.end; this.syncCellSelection(); this.focusCell(this.cell);
    event.preventDefault();
  }
  endCellSelection(event) {
    const drag = this.cellDrag;
    if (!drag || (event && event.pointerId !== drag.pointer)) return;
    this.skipCellClick = drag.moved || drag.modified;
    if (drag.input.hasPointerCapture?.(drag.pointer)) drag.input.releasePointerCapture(drag.pointer);
    drag.input.closest('.ms-sheet-scroll')?.classList.remove('is-selecting');
    this.cellDrag = null;
  }
  selectionStyle(keys) {
    const style = {...this.space.draft.cell_styles?.[keys[0]]};
    for (const property of Object.keys(style)) {
      if (keys.some(key => this.space.draft.cell_styles?.[key]?.[property] !== style[property])) delete style[property];
    }
    return style;
  }
  applyCellStyle(keys, value, properties, replace = false) {
    const styles = {...this.space.draft.cell_styles};
    for (const key of keys) {
      const style = replace ? {...value} : {...styles[key]};
      if (!replace) for (const property of properties) {
        if (Object.hasOwn(value, property)) style[property] = value[property]; else delete style[property];
      }
      if (Object.keys(style).length) styles[key] = style; else delete styles[key];
    }
    this.space.draft.cell_styles = styles;
  }
  selectionBounds(keys = this.selectionKeys()) {
    const points = keys.map(MindSpaceSheet.address), rows = points.map(point => point[0]), columns = points.map(point => point[1]);
    return {top:Math.min(...rows),bottom:Math.max(...rows),left:Math.min(...columns),right:Math.max(...columns)};
  }
  copyCells(event) {
    if (!event.clipboardData) return;
    const keys = new Set(this.selectionKeys()), {top,bottom,left,right} = this.selectionBounds(), rows = [];
    for (let row = top; row <= bottom; row++) {
      const values = [];
      for (let column = left; column <= right; column++) {
        const key = `${MindSpaceSheet.column(column)}${row+1}`;
        values.push(keys.has(key) ? this.space.draft.cells[key] || '' : null);
      }
      rows.push(values);
    }
    event.clipboardData.setData('text/plain', MindSpaceSheet.clipboardText(rows));
    // Keep gaps in a non-contiguous selection without copying unselected contents.
    try { event.clipboardData.setData(MindSpaceSheet.clipboardType, JSON.stringify({version:1,rows})); } catch {}
    event.preventDefault();
  }
  clearCells() {
    const space = this.space;
    if (!space.can('edit')) return;
    const cells = {...space.draft.cells};
    let changed = false;
    for (const key of this.selectionKeys()) {
      if (!MindSpaceSheet.locked(space.draft, key) && Object.hasOwn(cells, key)) { delete cells[key]; changed = true; }
    }
    if (!changed) return;
    space.draft.cells = cells; this.editingCell = null;
    space.changed(); this.refresh(); this.focusCell(this.cell);
  }
  pasteCells(event) {
    if (!event.clipboardData) return;
    const types = Array.from(event.clipboardData.types || []);
    if (types.length && !types.includes('text/plain') && !types.includes(MindSpaceSheet.clipboardType)) return;
    event.preventDefault();
    const space = this.space;
    if (!space.can('edit')) return;
    let values;
    try { values = MindSpaceSheet.clipboardData(event.clipboardData); }
    catch (error) { toast(t(error.message), true); return; }
    const keys = this.selectionKeys(), bounds = this.selectionBounds(keys), sheet = space.draft;
    const scalar = values.length === 1 && values[0].length === 1;
    if (!scalar && keys.length > 1 && (bounds.bottom-bounds.top+1)*(bounds.right-bounds.left+1) !== keys.length) {
      toast(t('ms_paste_contiguous'), true); return;
    }
    const rows = scalar ? sheet.rows : Math.max(sheet.rows, bounds.top + values.length);
    const columns = scalar ? sheet.columns : Math.max(sheet.columns, bounds.left + Math.max(...values.map(row => row.length)));
    if (rows > 200 || columns > 52) { toast(t('ms_sheet_limit'), true); return; }
    const cells = {...sheet.cells}, pasted = [], resized = {...sheet, rows, columns};
    const write = (key, value) => {
      if (value === null) return;
      pasted.push(key);
      if (MindSpaceSheet.locked(resized, key)) return;
      if (value) cells[key] = value; else delete cells[key];
    };
    if (scalar) keys.forEach(key => write(key, values[0][0]));
    else values.forEach((row,r) => row.forEach((value,c) => write(`${MindSpaceSheet.column(bounds.left+c)}${bounds.top+r+1}`, value)));
    if (!pasted.some(key => !MindSpaceSheet.locked(resized, key))) return;
    sheet.rows = rows; sheet.columns = columns; sheet.cells = cells;
    MindSpaceSheet.prepare(sheet);
    this.selectedCells = new Set(pasted); this.cell = pasted[0]; this.selectionAnchor = this.cell; this.editingCell = null;
    space.changed(); this.refresh(); this.focusCell(this.cell);
  }
  sheet() {
    const sheet = this.space.draft, evaluator = new MindSpaceSheet(sheet);
    if (this.sheetItemId !== this.space.active.id || this.sheetGeneration !== this.space.generation) {
      this.endCellSelection(); this.cell = 'A1'; this.selectionAnchor = 'A1'; this.selectedCells = new Set(['A1']); this.editingCell = null;
      this.sheetItemId = this.space.active.id; this.sheetGeneration = this.space.generation;
    }
    const returns = this.space.targetReturnLinks(), ledger = sheet.template === 'ledger', bands = this.sheetBands();
    return `<div class="ms-sheet${ledger ? ' ms-ledger' : ''}">
      <div class="ms-sheet-layout"><div class="ms-sheet-main"><div class="ms-formula-bar"><span id="ms-cell-address">${this.cell}</span><span aria-hidden="true">ƒx</span><input data-ms-formula aria-label="${esc(t('ms_formula'))}" maxlength="2000" ${MindSpaceSheet.locked(sheet, this.cell) ? 'readonly' : ''} value="${esc(sheet.cells?.[this.cell] || '')}"></div>
      <div class="ms-sheet-scroll"><table role="grid" aria-multiselectable="true" aria-label="${esc(this.space.active.name)}"><thead><tr><th></th>${Array.from({ length:sheet.columns }, (_,col) => `<th scope="col">${MindSpaceSheet.column(col)}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({ length:sheet.rows }, (_,row) => `<tr data-ms-sheet-row="${row + 1}" class="${row === 0 && sheet.template ? 'ms-template-header' : bands[row + 1]?.className || ''}" ${bands[row + 1]?.style || ''}><th scope="row">${row + 1}</th>${Array.from({ length:sheet.columns }, (_,col) => {
        const key = `${MindSpaceSheet.column(col)}${row + 1}`;
        const back = returns.get(key) || '', locked = MindSpaceSheet.locked(sheet, key), date = MindSpaceSheet.dateCell(sheet, key);
        const error = this.sheetCellError(key, evaluator);
        const format = MindSpaceSheet.format(sheet.cell_styles?.[key]);
        return `<td role="gridcell" data-ms-grid-cell="${key}" aria-selected="${this.selectedCells.has(key)}" class="${this.selectedCells.has(key) ? 'is-selected' : ''}"${format.border ? ` style="${esc(format.border)}"` : ''}><div class="ms-sheet-cell${back ? ' has-return' : ''}"><input data-ms-cell="${key}" aria-label="${key}${sheet.template && row > 0 ? ` · ${esc(sheet.cells[`${MindSpaceSheet.column(col)}1`] || '')}` : ''}" autocomplete="off" spellcheck="false" maxlength="2000" ${locked ? 'readonly' : ''} ${date ? `aria-haspopup="dialog" title="${esc(error || t('select_date'))}"` : ''} ${ledger && row > 0 && [3,4].includes(col) ? 'inputmode="decimal"' : ''} ${error ? `aria-invalid="true"${date ? '' : ` title="${esc(error)}"`}` : ''} ${format.text ? `style="${esc(format.text)}"` : ''} value="${esc(evaluator.display(key))}">${back}</div></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>${this.space.can('edit') ? `<div class="ms-sheet-settings"><span>${esc(t('ms_selection'))} <strong data-ms-style-address>${esc(this.selectionLabel())}</strong></span><button type="button" class="btn secondary" data-action="ms-sheet-settings" aria-haspopup="dialog">${icon('settings')}${esc(t('settings'))}</button></div><p class="ms-sheet-hint">${esc(t('ms_selection_hint'))}</p><p class="ms-sheet-hint">${esc(t('ms_clipboard_hint'))}</p>` : ''}<p class="ms-sheet-hint">${esc(t(ledger ? 'ms_ledger_hint' : 'ms_sheet_hint'))}</p>${sheet.template ? `<p class="ms-sheet-hint">${esc(t('ms_template_calculated_hint'))}</p>` : ''}</div>
      ${ledger ? `<aside class="ms-ledger-summary" aria-label="${esc(t('ms_ledger_totals'))}"><h3>${esc(t('ms_ledger_totals'))}</h3><p>${esc(t('ms_ledger_totals_hint'))}</p><dl aria-live="polite" aria-atomic="true" data-ms-ledger-totals>${this.ledgerTotals(evaluator)}</dl><p class="ms-ledger-error" data-ms-ledger-error ${Object.values(evaluator.ledgerSummary()).every(value => typeof value === 'number') ? 'hidden' : ''}>${esc(t('ms_ledger_amount_error'))}</p><span class="ms-ledger-live">${esc(t('ms_ledger_live'))}</span></aside>` : ''}</div></div>`;
  }
  async datePickerForm(key, input) {
    const space = this.space, id = space.active?.id, generation = space.generation;
    if (space.active?.kind !== 'spreadsheet' || !space.can('edit') || !MindSpaceSheet.dateCell(space.draft, key)) return;
    if (this.datePicker?.generation === generation) return;
    const picker = this.datePicker = {id, generation, key};
    if (!await space.flush() || space.active?.id !== id || space.generation !== generation || !input.isConnected || document.activeElement !== input) {
      if (this.datePicker === picker) this.datePicker = null;
      return;
    }
    // Calculate today when opening, so a tab left open overnight uses the new day.
    picker.today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
    picker.selected = MindSpaceSheet.date(space.draft.cells[key])?.iso || picker.today;
    const lang = S.language === 'es' ? 'es-CO' : 'en-US';
    const monthName = month => new Intl.DateTimeFormat(lang, {month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2000,month-1,1)));
    const fullDate = value => new Intl.DateTimeFormat(lang, {dateStyle:'full',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
    openModal('select_date', `<form id="ms-date-form" class="ms-date-picker"><p class="ms-date-context">${esc(key)} · ${esc(t('ms_date_picker_hint'))}</p>
      <fieldset><div class="ms-date-navigation"><button type="button" class="icon-btn" data-ms-date-prev aria-label="${esc(t('previous'))}">${icon('chevron','flip')}</button>
        <label><span class="sr-only">${esc(t('month'))}</span><select name="month">${Array.from({length:12}, (_,index) => `<option value="${index+1}">${esc(monthName(index+1))}</option>`).join('')}</select></label>
        <label><span class="sr-only">${esc(t('ms_date_year'))}</span><input type="number" name="year" min="1000" max="9999" step="1" required></label>
        <button type="button" class="icon-btn" data-ms-date-next aria-label="${esc(t('next'))}">${icon('chevron')}</button></div>
      <p class="ms-date-selected" data-ms-date-selected aria-live="polite"></p><div data-ms-date-calendar class="ms-date-calendar" role="group"></div></fieldset>
      ${formFooter('ms_date_ok', `<button type="button" class="btn ghost" data-ms-date-today>${esc(t('today'))}</button>`)}</form>`);
    const form = document.getElementById('ms-date-form'), calendar = form.querySelector('[data-ms-date-calendar]');
    document.getElementById('modal').addEventListener('close', () => { if (this.datePicker === picker) this.datePicker = null; }, {once:true});
    const paint = () => {
      const {year,month} = MindSpaceSheet.date(picker.selected);
      form.elements.namedItem('month').value = month; form.elements.namedItem('year').value = year;
      form.querySelector('[data-ms-date-selected]').textContent = fullDate(picker.selected);
      form.querySelector('[data-ms-date-prev]').disabled = year === 1000 && month === 1;
      form.querySelector('[data-ms-date-next]').disabled = year === 9999 && month === 12;
      const offset = (new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7, count = new Date(Date.UTC(year,month,0)).getUTCDate();
      calendar.setAttribute('aria-label', `${monthName(month)} ${year}`);
      calendar.innerHTML = Array.from({length:7}, (_,day) => `<span class="ms-date-weekday">${esc(new Intl.DateTimeFormat(lang, {weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2000,0,3+day))))}</span>`).join('')
        + '<span aria-hidden="true"></span>'.repeat(offset)
        + Array.from({length:count}, (_,index) => {
          const value = `${year}-${String(month).padStart(2,'0')}-${String(index+1).padStart(2,'0')}`;
          return `<button type="button" data-ms-date-day="${value}" aria-label="${esc(fullDate(value))}" aria-pressed="${value === picker.selected}" ${value === picker.today ? 'aria-current="date"' : ''}>${index+1}</button>`;
        }).join('');
    };
    const changeMonth = (year, month) => {
      if (!Number.isInteger(year) || year < 1000 || year > 9999 || month < 1 || month > 12) return;
      const day = Math.min(MindSpaceSheet.date(picker.selected).day, new Date(Date.UTC(year,month,0)).getUTCDate());
      picker.selected = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      paint();
    };
    const commit = value => {
      if (picker.saving) return;
      void space.submit(form, async () => {
        if (space.active?.id !== id || space.generation !== generation || !space.can('edit') || !MindSpaceSheet.dateCell(space.draft,key)) throw new Error(t('error_forbidden'));
        if (!MindSpaceSheet.date(value)) throw new Error(t('ms_ledger_date_error'));
        picker.saving = true; form.querySelector('fieldset').disabled = true;
        try {
          picker.selected = value; paint();
          space.draft.cells = {...space.draft.cells, [key]:value};
          space.changed();
          if (!await space.save()) throw new Error(space.error);
          if (space.active?.id !== id || space.generation !== generation) return;
          if (this.datePicker === picker && form.isConnected) closeModal();
          if (input.isConnected) input.value = value;
          this.recalculate();
        } finally { picker.saving = false; form.querySelector('fieldset')?.removeAttribute('disabled'); }
      });
    };
    form.addEventListener('submit', event => { event.preventDefault(); commit(picker.selected); });
    const updateMonth = event => {
      if (['year','month'].includes(event.target.name)) changeMonth(Number(form.elements.namedItem('year').value), Number(form.elements.namedItem('month').value));
    };
    form.addEventListener('input', updateMonth);
    form.addEventListener('change', updateMonth);
    form.addEventListener('click', event => {
      if (picker.saving) return;
      const day = event.target.closest('[data-ms-date-day]');
      if (day) { commit(day.dataset.msDateDay); return; }
      if (event.target.closest('[data-ms-date-today]')) { picker.selected = picker.today; paint(); }
      const previous = event.target.closest('[data-ms-date-prev]'), next = event.target.closest('[data-ms-date-next]');
      if (previous || next) {
        const {year,month} = MindSpaceSheet.date(picker.selected), date = new Date(Date.UTC(year,month-1+(previous ? -1 : 1),1));
        changeMonth(date.getUTCFullYear(),date.getUTCMonth()+1);
      }
    });
    paint();
  }
  async cellSettings() {
    const space = this.space, id = space.active?.id, generation = space.generation, key = this.cell;
    if (space.active?.kind !== 'spreadsheet' || !space.can('edit')) return;
    const keys = this.selectionKeys(), label = this.selectionLabel(keys);
    if (!await space.flush() || space.active?.id !== id || space.generation !== generation) return;
    const style = this.selectionStyle(keys), changed = new Set();
    let replaceStyle = false;
    const choices = (values, prefix) => values.map(value => `<option value="${value}">${esc(t(`${prefix}${value}`))}</option>`).join('');
    const colors = ['background','color','border_color'];
    openModal('ms_cell_style', `<form id="ms-cell-style-form"><p class="ms-style-context">${esc(t('ms_selection'))} <strong>${esc(label)}</strong></p>${keys.length > 1 ? `<p class="ms-sheet-hint">${esc(t('ms_style_multiple_hint'))}</p>` : ''}
      <label class="field"><span>${esc(t('ms_style_preset'))}</span><select name="preset"><option value="custom">${esc(t('ms_style_custom'))}</option>${choices(Object.keys(MindSpaceSheet.stylePresets), 'ms_style_')}</select></label>
      <div class="ms-style-colors">${colors.map(name => `<div class="ms-style-color"><label for="ms-style-${name}">${esc(t(`ms_style_${name}`))}</label><input type="color" id="ms-style-${name}" name="${name}" value="#ffffff"><label class="ms-style-auto"><input type="checkbox" name="${name}_auto">${esc(t('ms_style_auto'))}</label></div>`).join('')}</div>
      <div class="form-grid"><label class="field"><span>${esc(t('ms_style_size'))}</span><select name="font_size"><option value="">${esc(t('ms_style_auto'))}</option>${[12,13,14,16,18,20,24].map(size => `<option value="${size}">${size}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('ms_style_align'))}</span><select name="align"><option value="">${esc(t('ms_style_auto'))}</option>${choices(['left','center','right'], 'ms_style_')}</select></label></div>
      <div class="ms-style-emphasis"><label><input type="checkbox" name="bold">${esc(t('ms_style_bold'))}</label><label><input type="checkbox" name="italic">${esc(t('ms_style_italic'))}</label></div>
      <label class="field"><span>${esc(t('ms_style_borders'))}</span><select name="borders">${choices(['grid','all','bottom','none'], 'ms_style_border_')}</select></label>
      <div class="ms-style-preview" aria-label="${esc(t('ms_style_preview'))}"><span data-ms-style-preview>${esc(new MindSpaceSheet(space.draft).display(key) || 'Aa · 123')}</span></div>
      ${formFooter('save', `<button type="button" class="btn ghost" data-ms-style-reset>${esc(t('ms_style_reset'))}</button>`)}</form>`);
    const form = document.getElementById('ms-cell-style-form'), field = name => form.elements.namedItem(name);
    let emphasis = {bold:style.bold, italic:style.italic};
    const read = () => {
      const value = {};
      for (const name of colors) if (!field(`${name}_auto`).checked) value[name] = field(name).value;
      for (const name of ['bold','italic']) if (emphasis[name] !== undefined) value[name] = field(name).checked;
      if (field('font_size').value) value.font_size = Number(field('font_size').value);
      if (field('align').value) value.align = field('align').value;
      if (field('borders').value !== 'grid') value.borders = field('borders').value;
      return value;
    };
    const preview = () => {
      for (const name of colors) field(name).disabled = field(`${name}_auto`).checked;
      const formatted = MindSpaceSheet.format(read());
      form.querySelector('[data-ms-style-preview]').style.cssText = `${formatted.text};${formatted.border}`;
    };
    const fill = value => {
      emphasis = {bold:value.bold, italic:value.italic};
      for (const name of colors) { field(name).value = value[name] || ({background:'#ffffff',color:'#292534',border_color:'#9f93b6'}[name]); field(`${name}_auto`).checked = !value[name]; }
      for (const name of ['bold','italic']) field(name).checked = value[name] === true;
      field('font_size').value = value.font_size || ''; field('align').value = value.align || ''; field('borders').value = value.borders || 'grid';
      preview();
    };
    fill(style);
    form.addEventListener('input', event => {
      if (event.target.name === 'preset') {
        if (Object.hasOwn(MindSpaceSheet.stylePresets, field('preset').value)) { replaceStyle = true; fill(MindSpaceSheet.stylePresets[field('preset').value]); }
        return;
      }
      changed.add(event.target.name.replace(/_auto$/, ''));
      if (['bold','italic'].includes(event.target.name)) emphasis[event.target.name] = event.target.checked;
      field('preset').value = 'custom'; preview();
    });
    form.querySelector('[data-ms-style-reset]').addEventListener('click', () => { replaceStyle = true; field('preset').value = 'default'; fill({}); });
    form.addEventListener('submit', event => { event.preventDefault(); void space.submit(form, async () => {
      if (space.active?.id !== id || space.generation !== generation || !space.can('edit')) throw new Error(t('error_forbidden'));
      this.applyCellStyle(keys, read(), changed, replaceStyle);
      space.changed();
      if (!await space.save()) throw new Error(space.error);
      if (space.active?.id !== id || space.generation !== generation) return;
      closeModal(); this.refresh(); this.focusCell(key);
    }); });
  }
  sheetBands() {
    const sheet = this.space.draft, bands = {};
    if (sheet.template !== 'ledger') return bands;
    let previous = '';
    for (let row = 2; row <= sheet.rows; row++) {
      const month = MindSpaceSheet.month(sheet.cells[`A${row}`]);
      if (!month) continue;
      const hue = [210,35,155,275,350,185,55,235,15,305,125,65][month.month - 1];
      bands[row] = {className:`ms-month-row${previous !== month.key ? ' ms-month-start' : ''}`, hue, style:`style="--ms-month-hue:${hue}"`};
      previous = month.key;
    }
    return bands;
  }
  sheetCellError(key, evaluator) {
    if (this.space.draft.template !== 'ledger') return '';
    const [row, col] = MindSpaceSheet.address(key), raw = this.space.draft.cells[key] || '';
    if (!row || !raw.trim()) return '';
    if (col === 0 && !MindSpaceSheet.month(raw)) return t('ms_ledger_date_error');
    if ([3,4].includes(col)) {
      try { MindSpaceSheet.cents(evaluator.value(key)); }
      catch { return t('ms_ledger_amount_error'); }
    }
    return '';
  }
  ledgerTotals(evaluator) {
    return Object.entries(evaluator.ledgerSummary()).map(([name, value]) => `<div class="ms-ledger-total-${name}"><dt>${esc(t(`ms_ledger_${name}`))}</dt><dd>${esc(typeof value === 'number' ? new Intl.NumberFormat(S.language === 'es' ? 'es-CO' : 'en-US', {minimumFractionDigits:2, maximumFractionDigits:2}).format(value / 100) : value)}</dd></div>`).join('');
  }
  recalculate() {
    const evaluator = new MindSpaceSheet(this.space.draft), bands = this.sheetBands();
    document.querySelectorAll('[data-ms-cell]').forEach(input => {
      if (input !== document.activeElement) input.value = evaluator.display(input.dataset.msCell);
      const error = this.sheetCellError(input.dataset.msCell, evaluator);
      input.toggleAttribute('aria-invalid', Boolean(error));
      if (error) input.setAttribute('aria-invalid', 'true');
      input.title = error || (MindSpaceSheet.dateCell(this.space.draft, input.dataset.msCell) ? t('select_date') : '');
    });
    document.querySelectorAll('[data-ms-sheet-row]').forEach(row => {
      if (Number(row.dataset.msSheetRow) === 1) return;
      const band = bands[row.dataset.msSheetRow]; row.className = band?.className || '';
      row.style.setProperty('--ms-month-hue', String(band?.hue || 0));
    });
    const totals = document.querySelector('[data-ms-ledger-totals]');
    if (totals) totals.innerHTML = this.ledgerTotals(evaluator);
    const error = document.querySelector('[data-ms-ledger-error]');
    if (error) error.hidden = Object.values(evaluator.ledgerSummary()).every(value => typeof value === 'number');
  }
  event(type, event) {
    const input = event.target, space = this.space;
    if (type === 'change' && input.dataset.msCardStatus) this.moveCard(input.dataset.msCardStatus, input.value);
    if (type === 'change' && input.matches?.('[data-ms-habit-date]')) { S.date = input.value || today(); this.refresh(); }
    const key = input.dataset.msCell;
    if (key && type === 'copy') {
      if (this.selectedCells.size > 1 || this.editingCell !== key) this.copyCells(event);
      return;
    }
    if (key && type === 'dblclick') { this.selectCell(key); this.editingCell = key; return; }
    if (type === 'click' && input.closest?.('.ms-sheet-scroll') && this.skipCellClick) { this.skipCellClick = false; event.preventDefault(); return; }
    if (type === 'keydown' && key) {
      const editing = this.editingCell === key && this.selectedCells.size === 1;
      if (['Delete','Backspace'].includes(event.key) && !editing) { event.preventDefault(); this.clearCells(); return; }
      if (event.key === 'F2' && !MindSpaceSheet.locked(space.draft,key)) {
        event.preventDefault(); this.selectCell(key); this.editingCell = key;
        input.setSelectionRange?.(input.value.length,input.value.length); return;
      }
      if (editing && event.key !== 'Escape' && event.key !== 'Enter') return;
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !MindSpaceSheet.locked(space.draft,key)) {
        this.selectCell(key); this.editingCell = key; input.select?.(); return;
      }
      const direction = {ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];
      if (event.shiftKey && direction) {
        event.preventDefault();
        const [row,col] = MindSpaceSheet.address(this.cell);
        const next = `${MindSpaceSheet.column(Math.max(0,Math.min(space.draft.columns-1,col+direction[1])))}${Math.max(0,Math.min(space.draft.rows-1,row+direction[0]))+1}`;
        this.selectCell(next, {extend:true}); this.focusCell(next);
        document.querySelector(`[data-ms-cell="${next}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); this.selectedCells = new Set(this.cellRange('A1', `${MindSpaceSheet.column(space.draft.columns-1)}${space.draft.rows}`));
        this.selectionAnchor = 'A1'; this.syncCellSelection(); return;
      }
      if (event.key === 'Escape') { event.preventDefault(); this.selectCell(key); return; }
    }
    if (key && this.selectedCells.size === 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey && MindSpaceSheet.dateCell(space.draft, key) && (type === 'click' || (type === 'keydown' && event.key === 'Enter'))) {
      event.preventDefault();
      void this.datePickerForm(key, input).catch(error => { this.datePicker = null; toast(error.message, true); });
      return;
    }
    if (type === 'focusin' && key) {
      this.cell = key;
      if (!this.keepCellSelection) this.selectCell(key);
      if (!MindSpaceSheet.locked(space.draft, key)) input.value = space.draft.cells?.[key] || '';
      document.getElementById('ms-cell-address').textContent = key;
      const selected = document.querySelector('[data-ms-style-address]');
      if (selected) selected.textContent = this.selectionLabel();
      const formula = document.querySelector('[data-ms-formula]');
      formula.value = space.draft.cells?.[key] || '';
      formula.readOnly = MindSpaceSheet.locked(space.draft, key);
    }
    if (type === 'input' && (key || input.matches?.('[data-ms-formula]'))) {
      const address = key || this.cell;
      if (MindSpaceSheet.locked(space.draft, address)) return;
      if (key) {
        if (this.selectedCells.size > 1) this.selectCell(key);
        this.editingCell = key;
      }
      space.draft.cells = { ...space.draft.cells, [address]:input.value };
      if (!input.value) delete space.draft.cells[address];
      if (key) document.querySelector('[data-ms-formula]').value = input.value;
      space.changed(); this.recalculate();
    }
    if (type === 'focusout' && key) {
      input.value = new MindSpaceSheet(space.draft).display(key);
      if (this.editingCell === key) this.editingCell = null;
    }
    if (type === 'keydown' && key && event.key === 'Enter') {
      event.preventDefault();
      const [row,col] = MindSpaceSheet.address(key), next = `${MindSpaceSheet.column(col)}${Math.max(1, Math.min(space.draft.rows, row + (event.shiftKey ? 0 : 2)))}`;
      document.querySelector(`[data-ms-cell="${next}"]`)?.focus();
    }
    if (type === 'paste' && key) {
      if (this.selectedCells.size === 1 && this.editingCell === key && !MindSpaceSheet.locked(space.draft,key)) return;
      this.pasteCells(event);
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
    if (action === 'ms-sheet-settings') return this.cellSettings();
    if (action === 'ms-column-new') return this.newColumn(button.dataset.sprint || 'main');
    if (action === 'ms-sprint-new') return this.newSprint();
    if (action === 'ms-sprint-toggle') return this.toggleSprint(button.dataset.sprint);
    if (action === 'ms-card-new') return this.cardForm(null, button.dataset.status);
    if (action === 'ms-card-edit') return this.cardForm(button.dataset.id);
    if (action === 'ms-card-calendar') return this.scheduleCard(button.dataset.id);
    if (action === 'ms-sprint') return this.sprintForm(button.dataset.sprint || 'main');
    if (action === 'ms-sprint-delete') return this.deleteSprintForm(button.dataset.sprint);
    if (action === 'ms-habits-select') return this.chooseHabits();
    if (action === 'ms-habit-new') return this.newHabit();
    if (action === 'ms-sheet-export') return this.exportSheet();
    if (action === 'ms-sheet-row' && this.space.draft.rows < 200) this.space.draft.rows++;
    else if (action === 'ms-sheet-column' && this.space.draft.columns < 52) this.space.draft.columns++;
    else return;
    MindSpaceSheet.prepare(this.space.draft);
    this.space.changed(); this.refresh();
  }
}
