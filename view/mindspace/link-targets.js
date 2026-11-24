'use strict';

// Shared by the link picker, its tooltip and the destination editor.
class MindSpaceLinkTargets {
  static type(item) { return {spreadsheet:'cell', kanban:'card', scrum:'card', habits:'habit'}[item?.kind] || null; }
  static choices(item, habits = S.data?.habits || []) {
    if (['kanban','scrum'].includes(item?.kind)) return (item.content.cards || []).map(card => ({id:card.id, label:card.title}));
    if (item?.kind === 'habits') return habits.filter(habit => habit.permission === 'owner' && item.content.habit_ids.includes(habit.id)).map(habit => ({id:String(habit.id), label:habit.name}));
    return [];
  }
  static valid(item, target, habits = S.data?.habits || []) {
    if (!item || item.kind === 'diagram') return false;
    if (target === null) return true;
    if (!target || target.type !== this.type(item) || typeof target.id !== 'string') return false;
    if (target.type === 'cell') {
      if (!/^[A-Z]{1,2}[1-9][0-9]{0,2}$/.test(target.id)) return false;
      const [row, column] = MindSpaceSheet.address(target.id);
      return row < item.content.rows && column < item.content.columns;
    }
    return this.choices(item, habits).some(choice => choice.id === target.id);
  }
  static label(item, target) {
    if (!target) return t('ms_link_whole');
    if (!this.valid(item, target)) return t('diagram_link_unavailable');
    if (target.type === 'cell') return `${t('ms_link_cell')} ${target.id}`;
    return this.choices(item).find(choice => choice.id === target.id)?.label || t('diagram_link_unavailable');
  }
  static preview(item) {
    if (item.kind === 'spreadsheet') {
      const sheet = item.content, evaluator = new MindSpaceSheet(sheet);
      return `<table class="ms-link-sheet" aria-label="${esc(item.name)}"><thead><tr><th></th>${Array.from({length:sheet.columns}, (_,column) => `<th scope="col">${MindSpaceSheet.column(column)}</th>`).join('')}</tr></thead><tbody>
        ${Array.from({length:sheet.rows}, (_,row) => `<tr><th scope="row">${row + 1}</th>${Array.from({length:sheet.columns}, (_,column) => {
          const key = `${MindSpaceSheet.column(column)}${row + 1}`, value = evaluator.display(key);
          return `<td><button type="button" data-link-target="${key}" aria-label="${key}${value ? `: ${esc(value)}` : ''}" aria-pressed="false" title="${key}${value ? `: ${esc(value)}` : ''}">${esc(value) || '&nbsp;'}</button></td>`;
        }).join('')}</tr>`).join('')}</tbody></table>`;
    }
    if (this.type(item)) {
      const choices = this.choices(item);
      return choices.length ? `<div class="ms-link-choices">${choices.map(choice => `<button type="button" data-link-target="${esc(choice.id)}" aria-pressed="false">${esc(choice.label)}</button>`).join('')}</div>` : `<p class="muted">${esc(t('ms_link_empty'))}</p>`;
    }
    if (item.kind === 'notes') return `<div class="ms-link-note">${esc(item.content.text || t('ms_note_placeholder'))}</div>`;
    const children = (S.data?.mindspace?.items || []).filter(child => child.parent_id === item.id);
    return `<div class="ms-link-children">${children.length ? children.map(child => `<p>${esc(child.name)}</p>`).join('') : `<p class="muted">${esc(t('ms_folder_empty'))}</p>`}</div>`;
  }
  static arrive(space) {
    if (!space.active || space.isDiagram()) return;
    const url = new URL(location.href), type = this.type(space.active);
    if (!type || !url.searchParams.has(type)) return;
    const target = {type, id:url.searchParams.get(type)}, marker = `${space.active.id}:${type}:${target.id}`;
    if (space.linkArrival === marker) return;
    space.linkArrival = marker;
    if (!this.valid({...space.active, content:space.draft}, target)) { toast(t('error_diagram_link_missing'), true); return; }
    const attr = {cell:'data-ms-cell', card:'data-ms-card', habit:'data-ms-habit'}[type];
    const element = [...document.querySelectorAll(`#mindspace-panel [${attr}]`)].find(el => el.getAttribute(attr) === target.id);
    if (!element) return;
    document.querySelectorAll('.ms-link-target').forEach(el => el.classList.remove('ms-link-target'));
    element.classList.add('ms-link-target');
    if (type !== 'cell') element.setAttribute('tabindex', '-1');
    element.scrollIntoView({block:'center', inline:'center'});
    element.focus({preventScroll:true});
  }
}
