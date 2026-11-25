const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({Intl,Date,document:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+'\nthis.testApi={scheduled,plannerEntries,plannerDay,plannerWeek,plannerMonth,plannerYear,S};',context);
const {scheduled,plannerEntries,plannerDay,plannerWeek,plannerMonth,plannerYear,S}=context.testApi;
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
test('all calendar views combine habits and tasks without leaking markup and preserve full days',()=>{
  S.date='2024-02-29';S.data={today:'2024-02-29',habits:[{...base,kind:'habit',permission:'owner',status:'active',scheduled_time:'10:30:00'}],completions:[],calendar:{tasks:[{...base,id:2,scheduled_time:null}],completions:[{task_id:2,completed_on:S.date}]}};
  assert.equal(plannerEntries(S.date).length,2);
  assert.equal(plannerEntries(S.date)[0].completed,true);
  assert.equal((plannerDay().match(/class="planner-hour"/g)||[]).length,24);
  assert.equal((plannerWeek().match(/class="card planner-week-day/g)||[]).length,7);
  assert.equal((plannerMonth().match(/class="planner-month-day/g)||[]).length,42);
  assert.equal((plannerYear().match(/class="card planner-year-month/g)||[]).length,12);
  assert.ok(plannerDay().includes('&lt;Task&gt;'));
  assert.ok(!plannerDay().includes('<Task>'));
});
test('monthly date lists, month intervals, selected annual months and ordinal weekdays match',()=>{
  const monthly={...base,start_date:'2024-01-01',recurrence_rule:{month_mode:'dates',month_days:[5,20],interval:2}};
  for(const [date,expected] of Object.entries({'2024-01-05':true,'2024-01-20':true,'2024-02-05':false,'2024-03-20':true,'2024-03-21':false})) assert.equal(scheduled(monthly,date),expected,date);
  const annual={...monthly,recurrence:'yearly',recurrence_rule:{month_mode:'dates',month_days:[5,20],months:[2,5,11]}};
  for(const [date,expected] of Object.entries({'2024-02-05':true,'2024-03-05':false,'2024-11-20':true,'2025-05-05':true})) assert.equal(scheduled(annual,date),expected,date);
  const ordinal={...monthly,recurrence_rule:{month_mode:'weekdays',positions:[1,-1],weekdays:[1],interval:1}};
  for(const [date,expected] of Object.entries({'2024-02-05':true,'2024-02-12':false,'2024-02-26':true,'2024-02-27':false,'2024-04-29':true})) assert.equal(scheduled(ordinal,date),expected,date);
});
