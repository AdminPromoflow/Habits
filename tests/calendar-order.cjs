const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture() {
  const context=vm.createContext({Intl,Date,document:{addEventListener(){},querySelector(){return null;}}});
  vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+'\nthis.api={S,CalendarPage,plannerEntries,plannerNoteEntries,plannerMovedOrder,plannerCategoryColors,plannerEntryCategory,plannerCategoryFilters,plannerNoteRow};',context);
  const {S}=context.api;
  S.user={id:1};S.view='calendar';S.date='2026-11-26';
  S.data={today:S.date,categories:[{id:1,name:'Work',color:'#B8A4D4'},{id:2,name:'Home',color:'#B8A4D4'}],habits:[],completions:[],calendar:{tasks:[
    {id:1,name:'A',category_id:1},{id:2,name:'B',category_id:2},{id:3,name:'C',category_id:1},{id:4,name:'D',category_id:2}
  ].map(task=>({...task,recurrence:'daily',start_date:S.date,scheduled_time:'09:00:00',schedule_days:[]})),completions:[],orders:{}}};
  context.render=()=>{};context.toast=()=>{};
  return {...context.api,context};
}
test('flags never repeat colors, including duplicate, missing and shared categories beyond the palette',()=>{
  const {S,plannerCategoryColors,plannerEntryCategory,plannerCategoryFilters,plannerNoteRow}=fixture();
  S.data.categories=Array.from({length:200},(_,id)=>({id:id+1,name:`Category ${id+1}`,color:'#B8A4D4'}));
  S.data.habits=[{id:90,category_id:901,category_name:'Shared',color:'#b8a4d4'}];
  S.data.calendar.tasks.push({id:12,name:'Uncategorized',recurrence:'daily',start_date:S.date});
  const colors=plannerCategoryColors();
  assert.equal(colors.size,202);assert.equal(new Set(colors.values()).size,202);
  assert.ok([...colors.values()].every(color=>/^#[0-9A-F]{6}$/.test(color)));
  assert.ok(![...colors.values()].includes('#87947A'));
  const before=JSON.stringify([...colors]);S.date='2027-01-02';S.plannerHiddenCategories=['2'];S.data.categories.reverse();
  assert.equal(JSON.stringify([...plannerCategoryColors()]),before);
  S.data.categories.push({id:1000,name:'New',color:'#B8A4D4'});
  for(const [key,color] of colors) assert.equal(plannerCategoryColors().get(key),color);
  const entry={kind:'task',...S.data.calendar.tasks[0]};
  const color=plannerEntryCategory(entry).color;
  assert.ok(plannerNoteRow(entry,S.date).includes(`--planner-color:${color}`));
  assert.ok(plannerCategoryFilters().includes(`data-category="1" style="--planner-color:${color}"`));
});
test('manual ordering is per day, survives a fresh snapshot and keeps completion and times',()=>{
  const {S,plannerEntries}=fixture();
  S.data.calendar.orders[S.date]=['task:4','task:1','task:3','task:2'];
  S.data.calendar.completions=[{task_id:4,completed_on:S.date}];
  S.data=JSON.parse(JSON.stringify(S.data));
  const entries=plannerEntries(S.date);
  assert.deepEqual(Array.from(entries,e=>e.id),[4,1,3,2]);
  assert.equal(entries[0].completed,true);assert.equal(entries[0].scheduled_time,'09:00:00');
  assert.deepEqual(Array.from(plannerEntries('2026-11-27'),e=>e.id),[1,2,3,4]);
  S.data.calendar.tasks=S.data.calendar.tasks.filter(task=>task.id!==1);
  S.data.calendar.tasks.push({id:5,name:'New',recurrence:'daily',start_date:S.date});
  assert.deepEqual(Array.from(plannerEntries(S.date),e=>e.id),[4,3,2,5]);
});
test('category filters start all selected without All, toggle independently and allow none selected',async()=>{
  const {S,CalendarPage,plannerNoteEntries,plannerCategoryFilters}=fixture(),page=new CalendarPage();
  const html=plannerCategoryFilters();
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,2);
  assert.doesNotMatch(html,/data-category=""|planner_all_tasks/);
  const visible=()=>Array.from(plannerNoteEntries(S.date),entry=>entry.id);
  assert.deepEqual(visible(),[1,2,3,4]);
  S.plannerPage=3;
  await page.handleAction('planner-filter-category',{dataset:{category:'1'}});
  assert.deepEqual(visible(),[2,4]);assert.equal(S.plannerPage,0);
  await page.handleAction('planner-filter-category',{dataset:{category:'2'}});
  assert.deepEqual(visible(),[]);
  assert.equal((plannerCategoryFilters().match(/aria-pressed="false"/g)||[]).length,2);
  await page.handleAction('planner-filter-category',{dataset:{category:'1'}});
  assert.deepEqual(visible(),[1,3]);
  await page.handleAction('planner-filter-category',{dataset:{category:''}});
  await page.handleAction('planner-filter-category',{dataset:{category:'unknown'}});
  assert.deepEqual(visible(),[1,3]);
});
test('new and uncategorized tasks start visible, and category choices survive date changes and rendering',async()=>{
  const {S,CalendarPage,plannerNoteEntries,plannerCategoryFilters}=fixture(),page=new CalendarPage();
  await page.handleAction('planner-filter-category',{dataset:{category:'1'}});
  S.data.categories.push({id:3,name:'New category'});
  S.data.calendar.tasks.push({...S.data.calendar.tasks[0],id:5,category_id:3},{...S.data.calendar.tasks[0],id:6,category_id:null});
  plannerCategoryFilters();S.date='2026-11-27';
  assert.deepEqual(Array.from(plannerNoteEntries(S.date),entry=>entry.id),[5,6,2,4]);
  await page.handleAction('planner-filter-category',{dataset:{category:'none'}});
  assert.deepEqual(Array.from(plannerNoteEntries(S.date),entry=>entry.id),[5,2,4]);
  S.plannerHiddenCategories.push('deleted');plannerCategoryFilters();
  assert.deepEqual(Array.from(S.plannerHiddenCategories),['1','none']);
});
test('category arrows follow overflow and both ends; toggling retains scroll position and focus',async()=>{
  const {S,CalendarPage,context}=fixture(),page=new CalendarPage();
  let overflowing,scrolled,focused=false,renders=0;
  const left={},right={},filters={scrollWidth:900,clientWidth:250,scrollLeft:0,scrollBy:options=>{scrolled=options;}};
  const bar={clientWidth:300,classList:{toggle:(name,value)=>{overflowing=value;}},querySelector:selector=>selector.includes('-left')?left:right};
  context.document.querySelector=selector=>selector==='.planner-category-bar'?bar:selector==='.planner-category-filters'?filters:{focus:()=>{focused=true;}};
  context.render=()=>renders++;
  page.updateCategoryArrows();assert.equal(overflowing,true);assert.equal(left.hidden,true);assert.equal(right.hidden,false);
  filters.scrollLeft=200;page.updateCategoryArrows();assert.equal(left.hidden,false);assert.equal(right.hidden,false);
  await page.handleAction('planner-filter-category',{dataset:{category:'2'}});
  assert.equal(S.plannerCategoryScroll,200);assert.equal(focused,true);assert.equal(renders,1);
  await page.handleAction('planner-categories-right',{});assert.equal(scrolled.left,187.5);
  await page.handleAction('planner-categories-left',{});assert.equal(scrolled.left,-187.5);
  assert.equal(renders,1);
  filters.scrollLeft=650;page.updateCategoryArrows();assert.equal(right.hidden,true);assert.equal(left.hidden,false);
  bar.clientWidth=1000;filters.clientWidth=1000;filters.scrollWidth=1000;filters.scrollLeft=0;
  page.updateCategoryArrows();assert.equal(overflowing,false);assert.equal(right.hidden,true);assert.equal(left.hidden,true);
});
test('moving up, down or across sheets preserves hidden category slots and distinct habit IDs',()=>{
  const {plannerMovedOrder}=fixture();
  const entries=[{id:1,kind:'task'},{id:1,kind:'habit'},...Array.from({length:20},(_,i)=>({id:i+2,kind:'task'}))];
  const keys=entries.map(e=>`${e.kind}:${e.id}`);
  const moved=Array.from(plannerMovedOrder(entries,keys,'task:1','task:20',true));
  assert.equal(moved[moved.indexOf('task:20')+1],'task:1');assert.equal(new Set(moved).size,entries.length);
  const filtered=Array.from(plannerMovedOrder(entries,['task:1','task:2','task:3'],'task:3','task:1'));
  assert.deepEqual(filtered.slice(0,4),['task:3','habit:1','task:1','task:2']);
  assert.deepEqual(Array.from(plannerMovedOrder(entries,keys,'missing','task:1')),keys);
});
test('reordering saves the complete daily list and restores it after a failed request',async()=>{
  const {S,CalendarPage,plannerEntries}=fixture(),page=new CalendarPage();let sent;
  page.makeRequest=async(action,data)=>{sent={action,data};};
  S.plannerHiddenCategories=['2'];await page.reorder('task:3','task:1',false);
  assert.equal(sent.action,'saveCalendarOrder');assert.equal(sent.data.date,S.date);
  assert.deepEqual(Array.from(sent.data.order),['task:3','task:2','task:1','task:4']);
  page.makeRequest=async()=>{throw new Error('offline');};
  await page.reorder('task:1','task:3',false);
  assert.deepEqual(Array.from(plannerEntries(S.date),entry=>entry.id),[3,2,1,4]);
  assert.equal(page.savingOrder,false);assert.equal(S.busy,false);
});
test('a late failed save never changes another account’s task order',async()=>{
  const {S,CalendarPage}=fixture(),page=new CalendarPage();let reject;
  page.makeRequest=()=>new Promise((resolve,fail)=>reject=fail);
  const pending=page.reorder('task:4','task:1',false);
  S.user={id:2};S.data={calendar:{orders:{[S.date]:['task:99']}}};
  reject(new Error('offline'));await pending;
  assert.deepEqual(S.data.calendar.orders[S.date],['task:99']);
});
