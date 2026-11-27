const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({Intl,Date});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/goals/goals.js','utf8')+'\nthis.api={S,goalsReport,goalCard,goalPicker,goalIdsForEntry};',context);
const {S,goalsReport,goalCard,goalPicker,goalIdsForEntry} = context.api;
function fixture() {
  S.data = {today:'2026-11-27',goals:{items:[{id:1,name:'Health',status:'active'},{id:2,name:'Learning',status:'completed'}],links:[]},habits:[],completions:[],calendar:{tasks:[],completions:[]},mindspace:{items:[]}};
  return S.data;
}
test('goals count actual completions, multiple dates, and only fulfilled habit targets',()=>{
  const data = fixture();
  data.calendar.tasks=[{id:1,name:'Exercise',category_id:2},{id:2,name:'Pending'}];
  data.calendar.completions=[{task_id:1,completed_on:'2026-11-26'},{task_id:1,completed_on:'2026-11-27'}];
  data.habits=[{id:3,name:'Read',permission:'owner',status:'archived',category_id:2}];
  data.completions=[{habit_id:3,completed_on:'2026-11-26',amount:2,goal_at_time:5},{habit_id:3,completed_on:'2026-11-27',amount:5,goal_at_time:5}];
  data.goals.links=[{goal_id:1,kind:'task',id:1},{goal_id:1,kind:'task',id:2},{goal_id:1,kind:'habit',id:3},{goal_id:2,kind:'task',id:1}];
  const [health,learning] = goalsReport();
  assert.equal(health.total,3);assert.equal(health.completed,2);assert.equal(health.contributions,3);
  assert.equal(learning.contributions,2);
  const selected = goalsReport({start:'2026-11-27',end:'2026-11-27',category:'2'})[0];
  assert.equal(selected.total,2);assert.equal(selected.contributions,2);
  assert.equal(goalsReport({start:'2026-12-01',end:'2026-12-31'})[0].contributions,0);
});
test('a scheduled board card contributes once, based on recorded task dates',()=>{
  const data=fixture();
  data.calendar.tasks=[{id:1,name:'Scheduled exercise',source_item_id:5,source_card_key:'card'}];
  data.calendar.completions=[{task_id:1,completed_on:'2026-11-27'}];
  data.mindspace.items=[{id:5,kind:'kanban',content:{cards:[{id:'card',title:'Board exercise',status:'done'},{id:'other',title:'Only on board',status:'done'}]}}];
  data.goals.links=[{goal_id:1,kind:'task',id:1},{goal_id:1,kind:'card',item_id:5,card_key:'card',completed_on:'2026-11-27'},{goal_id:1,kind:'card',item_id:5,card_key:'other',completed_on:'2026-11-26'}];
  const goal=goalsReport()[0];assert.equal(goal.total,2);assert.equal(goal.contributions,2);
  assert.equal(goalsReport({start:'2026-11-27',end:'2026-11-27'})[0].contributions,1);
  data.calendar.completions=[];
  assert.equal(goalsReport()[0].contributions,1,'Done status cannot replace the missing recurring completion');
  assert.deepEqual(Array.from(goalIdsForEntry({kind:'task',id:1,source_item_id:5,source_card_key:'card'})),[1]);
});
test('empty, removed and inaccessible activities do not contribute; user text is escaped',()=>{
  const data=fixture();
  data.goals.items[0].name='<script>bad</script>';
  data.habits=[{id:3,name:'Hidden',permission:'viewer'}];
  data.goals.links=[{goal_id:1,kind:'task',id:999},{goal_id:1,kind:'habit',id:3},{goal_id:1,kind:'card',item_id:8,card_key:'removed'}];
  data.completions=[{habit_id:3,completed_on:'2026-11-27',amount:1,goal_at_time:1}];
  const goal=goalsReport()[0];assert.equal(goal.total,0);assert.equal(goal.contributions,0);
  assert.ok(goalCard(goal).includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!goalPicker().includes('<script>'));
});
