const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({Intl,Date,document:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+'\nthis.testApi={scheduled,plannerEntries,plannerNotePages,plannerNoteTurn,plannerNoteRow,plannerNoteMonth,CalendarPage,plannerCategoryOptions,plannerCategoryFields,plannerPendingEntries,plannerPendingsPage,plannerPickerTime,S};',context);
const {scheduled,plannerEntries,plannerNotePages,plannerNoteTurn,plannerNoteRow,plannerNoteMonth,CalendarPage,S}=context.testApi;
const base={id:1,name:'<Task>',start_date:'2024-01-31',end_date:null,schedule_days:[1,3,5],recurrence:'monthly'};
test('time picker preserves minutes and distinguishes midnight, noon and AM/PM',()=>{
  for(const [hour,minute,period,expected] of [[12,0,'AM','00:00'],[12,0,'PM','12:00'],[1,7,'AM','01:07'],[1,7,'PM','13:07'],[11,59,'AM','11:59'],[11,59,'PM','23:59']]) {
    assert.equal(context.testApi.plannerPickerTime(String(hour),String(minute),period),expected);
  }
});
test('pending activities stay outside every calendar date and appear together by category',()=>{
  S.data={today:'2024-02-29',categories:[{id:1,name:'Work',color:'#AABBCC'}],habits:[
    {...base,id:10,name:'Pending habit',recurrence:'pending',start_date:null,schedule_days:[],status:'active',permission:'owner',category_id:1},
    {...base,id:11,recurrence:'pending',status:'archived',permission:'owner'},
    {...base,id:12,recurrence:'pending',status:'active',permission:'viewer'},
  ],completions:[],calendar:{tasks:[
    {...base,id:2,name:'<Pending task>',recurrence:'pending',start_date:null,schedule_days:[],category_id:1},
    {...base,id:3,name:'Scheduled task'},
  ],completions:[]}};
  for(const date of ['2020-01-01','2024-02-29','2099-12-31']) {
    assert.equal(scheduled(S.data.calendar.tasks[0],date),false);
    assert.equal(scheduled(S.data.habits[0],date),false);
    assert.ok(plannerEntries(date).every(entry=>entry.recurrence!=='pending'));
  }
  assert.deepEqual(Array.from(context.testApi.plannerPendingEntries(),entry=>`${entry.kind}:${entry.id}`).sort(),['habit:10','task:2']);
  context.renderTemplate=(name,values)=>values.content;
  const html=context.testApi.plannerPendingsPage();
  assert.match(html,/&lt;Pending task&gt;/);assert.ok(!html.includes('<Pending task>'));
  assert.match(html,/data-action="planner-edit-habit"/);assert.match(html,/data-action="planner-edit"/);
  assert.equal((html.match(/class="planner-pending-group"/g)||[]).length,1);
  assert.ok(!html.includes('Scheduled task'));
});
test('calendar recurrence preserves anchors and short-month semantics',()=>{
  for(const [entry,dates] of [
    [base,{'2024-01-30':false,'2024-01-31':true,'2024-02-29':true,'2025-02-28':true,'2024-03-30':false,'2024-03-31':true}],
    [{...base,recurrence:'yearly',start_date:'2024-02-29'},{'2025-02-28':true,'2025-03-01':false,'2028-02-28':false,'2028-02-29':true}],
    [{...base,recurrence:'weekly'},{'2024-02-05':true,'2024-02-06':false,'2024-02-07':true}],
    [{...base,recurrence:'daily',end_date:'2024-02-02'},{'2024-02-01':true,'2024-02-02':true,'2024-02-03':false}],
    [{...base,recurrence:'once'},{'2024-01-31':true,'2024-02-01':false}],
    [{...base,tracking_start:'2024-03-01'},{'2024-02-29':false,'2024-03-31':true}]
  ]) for(const [date,expected] of Object.entries(dates)) assert.equal(scheduled(entry,date),expected,`${entry.recurrence}: ${date}`);
  assert.equal(scheduled({...base,recurrence:undefined},'2024-02-05'),true,'legacy schedules stay weekly');
});
test('daily task rows retain their exact time, completion, category and safe literal title',()=>{
  S.date='2024-02-29';S.data={today:'2024-02-29',categories:[{id:7,color:'#CBE8DD'}],habits:[{...base,kind:'habit',permission:'owner',status:'active',scheduled_time:'10:30:00',category_id:7}],completions:[],calendar:{tasks:[
    {...base,id:2,scheduled_time:null},
    {...base,id:3,name:'Midnight',scheduled_time:'00:00:00'},
    {...base,id:4,name:'Late night',scheduled_time:'23:59:00'},
  ],completions:[{task_id:2,completed_on:S.date}]}};
  const entries=plannerEntries(S.date);
  assert.equal(entries.length,4);
  assert.equal(entries[0].completed,true);
  const rows=entries.map(entry=>plannerNoteRow(entry,S.date)).join('');
  assert.ok(rows.includes('&lt;Task&gt;'));assert.ok(!rows.includes('<Task>'));
  assert.match(rows,/--planner-color:#CBE8DD/);
  assert.match(rows,/aria-pressed="true"/);assert.match(rows,/is-done/);
  assert.match(rows,/00:00/);assert.match(rows,/23:59/);assert.match(rows,/10:30/);
  assert.match(plannerNoteRow(entries[2],'2024-03-01'),/disabled/);
  assert.match(plannerNoteRow({...entries[2],permission:'viewer'},S.date),/disabled/);
});
test('task pagination keeps every task once and reserves extra lines for long names',()=>{
  const entries=Array.from({length:31},(_,id)=>({id}));
  for(const [counts,expected] of [[[],[15,15,1]],[entries.map(()=>2),[7,7,7,7,3]]]) {
    const pages=plannerNotePages(entries,counts);
    assert.deepEqual(Array.from(pages,page=>page.length),expected);
    assert.deepEqual(Array.from(pages.flat(),item=>item.entry.id),entries.map(entry=>entry.id));
    assert.ok(pages.every(page=>page.reduce((sum,item)=>sum+item.lines,0)<=15));
  }
  assert.equal(plannerNotePages([]).length,1);
  assert.equal(plannerNotePages(entries.slice(0,15)).length,1);
});
test('page arrows finish the selected day before moving to another date and reverse to the previous final sheet',()=>{
  assert.deepEqual({...plannerNoteTurn('2024-12-31',0,2,1)},{date:'2024-12-31',page:1});
  assert.deepEqual({...plannerNoteTurn('2024-12-31',1,2,1)},{date:'2025-01-01',page:0});
  assert.deepEqual({...plannerNoteTurn('2025-01-01',1,2,-1)},{date:'2025-01-01',page:0});
  assert.deepEqual({...plannerNoteTurn('2025-01-01',0,2,-1)},{date:'2024-12-31',page:-1});
  assert.deepEqual({...plannerNoteTurn('2024-03-01',0,1,-1)},{date:'2024-02-29',page:-1});
});
test('month selection opens the selected day and Today resets to its first sheet',async()=>{
  context.render=()=>{};context.document.querySelector=()=>null;
  const controller=new CalendarPage();
  S.date='2024-12-31';S.plannerPage=2;S.data={today:'2024-02-29',habits:[],calendar:{tasks:[]}};
  await controller.handleAction('planner-calendar-toggle',{},0);
  assert.equal(S.plannerMode,'month');assert.equal(S.plannerMonth,'2024-12');
  await controller.handleAction('planner-month-next',{},0);
  assert.equal(S.plannerMonth,'2025-01');assert.equal(S.date,'2024-12-31');
  await controller.handleAction('planner-note-date',{dataset:{date:'2025-01-06'}},0);
  assert.equal(S.date,'2025-01-06');assert.equal(S.plannerMode,'note');assert.equal(S.plannerPage,0);
  await controller.handleAction('today',{},0);
  assert.equal(S.date,'2024-02-29');assert.equal(S.plannerPage,0);
  S.plannerMonth='2024-02';
  const month=plannerNoteMonth();
  assert.match(month,/data-date="2024-02-29"/);
  assert.equal((month.match(/data-action="planner-note-date"/g)||[]).length,42);
});
test('monthly date lists, month intervals, selected annual months and ordinal weekdays match',()=>{
  const monthly={...base,start_date:'2024-01-01',recurrence_rule:{month_mode:'dates',month_days:[5,20],interval:2}};
  for(const [date,expected] of Object.entries({'2024-01-05':true,'2024-01-20':true,'2024-02-05':false,'2024-03-20':true,'2024-03-21':false})) assert.equal(scheduled(monthly,date),expected,date);
  const annual={...monthly,recurrence:'yearly',recurrence_rule:{month_mode:'dates',month_days:[5,20],months:[2,5,11]}};
  for(const [date,expected] of Object.entries({'2024-02-05':true,'2024-03-05':false,'2024-11-20':true,'2025-05-05':true})) assert.equal(scheduled(annual,date),expected,date);
  const ordinal={...monthly,recurrence_rule:{month_mode:'weekdays',positions:[1,-1],weekdays:[1],interval:1}};
  for(const [date,expected] of Object.entries({'2024-02-05':true,'2024-02-12':false,'2024-02-26':true,'2024-02-27':false,'2024-04-29':true})) assert.equal(scheduled(ordinal,date),expected,date);
});
test('category choices prioritize current and parent folders, distinguish paths, and restore saved categories',()=>{
  S.data={categories:[{id:1,name:'Existing'},{id:2,name:'Child',source_folder_id:11}],category_catalog:[],mindspace:{spaces:[{id:1,name:'Home'},{id:2,name:'Other'}],items:[
    {id:10,kind:'folder',name:'Parent',mindspace_id:1,parent_id:null},
    {id:11,kind:'folder',name:'Child',mindspace_id:1,parent_id:10},
    {id:12,kind:'folder',name:'Child',mindspace_id:2,parent_id:null},
    {id:13,kind:'diagram',diagram_id:7,mindspace_id:1,parent_id:11}
  ]}};
  const options=context.testApi.plannerCategoryOptions({source_diagram_id:7});
  assert.equal(options.selected,'folder:11');
  assert.deepEqual(Array.from(options.groups[1][1],pair=>pair[0]),['folder:11','folder:10']);
  assert.ok(options.groups[2][1].some(([key,label])=>key==='folder:12' && label==='Other / Child'));
  assert.equal(context.testApi.plannerCategoryOptions({category_id:2,kind:'habit'},true).selected,'folder:11');
  assert.equal(context.testApi.plannerCategoryOptions({category_id:1,kind:'habit'},true).selected,'category:1');
  assert.equal(context.testApi.plannerCategoryOptions({kind:'task'},true).selected,'none');
  S.data.categories[0].name='<unsafe>';
  assert.ok(context.testApi.plannerCategoryFields({},false).includes('&lt;unsafe&gt;'));
  S.ownedWorkspace={categories:[{id:3,name:'Personal'}],mindspace:{spaces:[],items:[]}}; S.sharedWorkspace={};
  assert.equal(context.testApi.plannerCategoryOptions({category_id:3},true).selected,'category:3');
  assert.ok(!context.testApi.plannerCategoryFields({},false).includes('folder:11'));
  S.sharedWorkspace=null; S.ownedWorkspace=null;
});
