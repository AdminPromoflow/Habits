const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({document:{addEventListener(){}},Intl,Date});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\n'+fs.readFileSync('view/global/priority.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+'\nthis.api={S,activityPriorityFields,activityPriorityFlags,activityPriorityValue,activityPrioritySettings,activityPriorityData,bindActivityPriority,plannerNoteRow,plannerPendingsPage};',context);
const api = context.api;
test('independent priority flags appear beside the schedule for tasks and habits', () => {
  api.S.user = {priority_scale:10}; api.S.data = {categories:[],habits:[],calendar:{tasks:[]}};
  for (const kind of ['task','habit']) for (const [importance,urgency] of [[null,null],[7,null],[null,9],[7,9]]) {
    const entry = {id:1,kind,name:'Example',permission:'owner',scheduled_time:'09:15',importance,urgency,priority_scale:10};
    const html = api.plannerNoteRow(entry,'2026-11-27');
    assert.equal(html.includes('priority-flag-importance'),importance !== null);
    assert.equal(html.includes('priority-flag-urgency'),urgency !== null);
    if (importance || urgency) assert.ok(html.indexOf('priority-flags') > html.indexOf('planner-note-schedule'));
    if (importance) assert.match(html,/7\/10/);
    if (urgency) assert.match(html,/9\/10/);
  }
});
test('pending tasks and habits retain both flags without nested interactive controls', () => {
  api.S.user = {priority_scale:10};
  const base = {id:1,name:'Pending',recurrence:'pending',importance:8,urgency:9,priority_scale:10};
  api.S.data = {categories:[],habits:[{...base,status:'active',permission:'owner'}],calendar:{tasks:[base]}};
  context.renderTemplate = (name,values) => values.content;
  const html = api.plannerPendingsPage();
  assert.equal((html.match(/priority-flag-urgency/g)||[]).length,2);
  assert.equal((html.match(/priority-flag-importance/g)||[]).length,2);
  assert.ok(!html.includes('tabindex="0"'));
});
test('settings support defaults, binary and custom scales without changing saved scores', () => {
  api.S.user = {};
  assert.match(api.activityPriorityFields(),/name="priority_scale" value="10"/);
  const entry = {importance:7,urgency:null,priority_scale:10};
  for (const [scale,value] of [[5,4],[100,70],[1000,700],[37,26],[1,1]]) {
    api.S.user.priority_scale = scale;
    assert.equal(api.activityPriorityValue(entry,'importance'),value);
    assert.equal(api.activityPriorityValue(entry,'urgency'),null);
  }
  assert.equal(entry.importance,7);
  assert.ok(!api.activityPriorityFlags(entry).includes('1/1'));
  assert.match(api.activityPriorityFields(entry),/data-priority-rating="importance" hidden/);
  api.S.user.priority_scale = 37;
  assert.match(api.activityPrioritySettings(),/value="custom" selected/);
});
test('checking either priority enables its score; clearing and binary mode serialize independently', () => {
  const listeners = {}, elements = new Map();
  const field = (selector,value={}) => {elements.set(selector,value);return value;};
  const scale = field('[name=priority_scale]',{value:'10'});
  for (const key of ['importance','urgency']) {
    field(`[data-priority-toggle="${key}"]`,{checked:false});
    field(`[data-priority-rating="${key}"]`,{hidden:true});
    field(`[name="${key}"]`,{value:key === 'importance' ? '7' : '9',disabled:true});
    field(`[data-priority-slider="${key}"]`,{disabled:true});
  }
  const root = {querySelector:selector=>elements.get(selector)}, form = {querySelector:()=>root,addEventListener:(type,listener)=>{listeners[type]=listener;}};
  api.bindActivityPriority(form);
  const important = elements.get('[data-priority-toggle="importance"]'); important.checked=true;
  listeners.change({target:{...important,dataset:{priorityToggle:'importance'}}});
  assert.equal(elements.get('[name="importance"]').disabled,false);
  assert.equal(elements.get('[name="urgency"]').disabled,true);
  assert.deepEqual({...api.activityPriorityData(form)},{priority_scale:10,importance:7,urgency:null});
  elements.get('[data-priority-toggle="urgency"]').checked=true;
  assert.deepEqual({...api.activityPriorityData(form)},{priority_scale:10,importance:7,urgency:9});
  important.checked=false;
  listeners.change({target:{...important,dataset:{priorityToggle:'importance'}}});
  assert.equal(elements.get('[data-priority-rating="importance"]').hidden,true);
  scale.value='1';
  assert.deepEqual({...api.activityPriorityData(form)},{priority_scale:1,importance:null,urgency:1});
});
