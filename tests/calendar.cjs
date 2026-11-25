const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({Intl,Date,document:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+'\nthis.testApi={scheduled,plannerEntries,plannerWeek,CalendarPage,plannerCategoryOptions,plannerCategoryFields,S};',context);
const {scheduled,plannerEntries,plannerWeek,CalendarPage,S}=context.testApi;
const base={id:1,name:'<Task>',start_date:'2024-01-31',end_date:null,schedule_days:[1,3,5],recurrence:'monthly'};
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
test('weekly timetable places habits and tasks in their date and hour, including midnight and late night',()=>{
  S.date='2024-02-29';S.data={today:'2024-02-29',habits:[{...base,kind:'habit',permission:'owner',status:'active',scheduled_time:'10:30:00'}],completions:[],calendar:{tasks:[
    {...base,id:2,scheduled_time:null},
    {...base,id:3,name:'Midnight',scheduled_time:'00:00:00'},
    {...base,id:4,name:'Late night',scheduled_time:'23:59:00'},
    {...base,id:5,name:'Same hour',scheduled_time:'10:45:00'},
  ],completions:[{task_id:2,completed_on:S.date}]}};
  assert.equal(plannerEntries(S.date).length,5);
  assert.equal(plannerEntries(S.date)[0].completed,true);
  const html=plannerWeek();
  assert.match(html,/data-week="2024-02-26"/);
  for(const name of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) assert.ok(html.includes(name));
  const slots=[...html.matchAll(/data-slot-date="([^"]+)" data-slot-time="([^"]*)">([\s\S]*?)(?=<div class="planner-slot |<\/div>\s*<\/div>)/g)];
  const slot=time=>slots.find(match=>match[1]===S.date && match[2]===time)?.[3] || '';
  assert.match(slot(''),/is-done/);
  assert.match(slot('00:00'),/Midnight/);
  assert.match(slot('23:00'),/Late night/);
  assert.match(slot('10:00'),/10:30 · planner_habit/);
  assert.match(slot('10:00'),/Same hour/);
  assert.ok(html.includes('&lt;Task&gt;'));
  assert.ok(!html.includes('<Task>'));
  assert.equal((html.match(/data-hour="/g)||[]).length,24);
  assert.equal((html.match(/data-slot-date="/g)||[]).length,25*7);
});
test('week navigation crosses year boundaries and Today returns to the current week',async()=>{
  context.render=()=>{};context.document.querySelector=()=>null;
  const controller=new CalendarPage();
  S.date='2024-12-30'; S.data={today:'2024-02-29'};
  await controller.handleAction('planner-next',{},0);
  assert.equal(S.date,'2025-01-06');assert.equal(S.month,'2025-01');
  await controller.handleAction('planner-prev',{},0);
  assert.equal(S.date,'2024-12-30');
  controller.scrollPosition={week:'2024-12-30',top:1200,left:0};
  await controller.handleAction('today',{},0);
  assert.equal(S.date,'2024-02-29');assert.equal(controller.scrollPosition,null);
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
