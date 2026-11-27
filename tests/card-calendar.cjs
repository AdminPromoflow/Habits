const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const forms = [], state = {data:{calendar:{tasks:[]},habits:[]}};
  const context = vm.createContext({S:state,document:{addEventListener(){}},plannerForm:(...args)=>forms.push(args)});
  const Editors = vm.runInContext(fs.readFileSync('view/mindspace/editors.js','utf8')+'\nMindSpaceEditors;',context);
  const space = {active:{id:7,kind:'kanban'},generation:1,can:()=>true,flush:async()=>true,
    draft:{cards:[{id:'card-a',title:'Plan the launch',description:'Call the team'}]}};
  return {editor:new Editors(space),space,state,forms};
}

test('card scheduling waits for saving and uses the saved card name and description',async()=>{
  const {editor,space,forms} = fixture(); let release;
  space.flush=()=>new Promise(resolve=>release=resolve);
  const pending=editor.action('ms-card-calendar',{dataset:{id:'card-a'}});
  assert.equal(forms.length,0);
  space.draft.cards[0].title='Saved title';release(true);await pending;
  assert.equal(forms[0][0],null);
  assert.deepEqual({...forms[0][1]},{source_item_id:7,source_card_key:'card-a',name:'Saved title',description:'Call the team'});
});

test('the calendar reopens only the activity belonging to this board and card',async()=>{
  const {editor,state,forms} = fixture();
  state.data.calendar.tasks=[{id:1,source_item_id:8,source_card_key:'card-a'},{id:2,source_item_id:7,source_card_key:'card-b'},
    {id:3,name:'Scheduled title',source_item_id:'7',source_card_key:'card-a'}];
  await editor.scheduleCard('card-a');assert.equal(forms[0][0].id,3);assert.equal(forms[0][0].kind,'task');
  state.data.calendar.tasks=[];
  state.data.habits=[{id:4,source_item_id:7,source_card_key:'card-a',permission:'viewer',status:'active'},
    {id:5,source_item_id:7,source_card_key:'card-a',permission:'owner',status:'archived'},
    {id:6,source_item_id:7,source_card_key:'card-a',permission:'owner',status:'active'}];
  await editor.scheduleCard('card-a');assert.equal(forms[1][0].id,6);assert.equal(forms[1][0].kind,'habit');
});

test('failed saves, deleted cards, navigation and missing edit access cannot open scheduling',async()=>{
  for (const change of [
    space=>{space.can=()=>false;},
    space=>{space.flush=async()=>false;},
    space=>{space.flush=async()=>{space.generation++;return true;};},
    space=>{space.flush=async()=>{space.active.id=8;return true;};},
    space=>{space.draft.cards=[];},
    space=>{space.active.kind='notes';},
  ]) {
    const {editor,space,forms}=fixture();change(space);await editor.scheduleCard('card-a');assert.equal(forms.length,0);
  }
});

test('a shared board schedules a personal activity without claiming the other owner’s source',async()=>{
  const {editor,state,forms}=fixture();state.sharedWorkspace={permissions:{edit:true}};
  await editor.scheduleCard('card-a');
  assert.deepEqual({...forms[0][1]},{name:'Plan the launch',description:'Call the team'});
});

test('board category defaults use its own folder and parent folder',()=>{
  const context=vm.createContext({document:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('view/global/ui.js','utf8')+'\nclass PageController {}\n'+fs.readFileSync('view/calendar/calendar.js','utf8')+`
    S.data={categories:[],category_catalog:[],mindspace:{spaces:[{id:1,name:'Home'}],items:[
      {id:10,kind:'folder',name:'Projects',mindspace_id:1,parent_id:null},
      {id:11,kind:'kanban',name:'Launch',mindspace_id:1,parent_id:10}]}};
    this.options=plannerCategoryOptions({source_item_id:11});`,context);
  assert.equal(context.options.selected,'folder:10');
  assert.deepEqual(Array.from(context.options.groups[1][1],option=>option[0]),['folder:10','space:1']);
});
