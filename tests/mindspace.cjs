const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Sheet = vm.runInNewContext(fs.readFileSync('view/mindspace/sheet.js','utf8')+'\nMindSpaceSheet;');
const evaluate = cells => new Sheet({rows:30,columns:10,cells});

test('spreadsheet evaluates dependencies, precedence, bilingual functions and ranges', () => {
  const sheet = evaluate({A1:'10',A2:'20',A3:'text',B1:'=SUMA(A1:A3)',B2:'=AVERAGE(A1:A2)',B3:'=B1+B2*2',C1:'=CONTAR(A1:A3)',C2:'=MAX(A1:A2)-MIN(A1:A2)',C3:'=-(2+3)*.5'});
  assert.equal(sheet.display('B1'),'30'); assert.equal(sheet.display('B2'),'15'); assert.equal(sheet.display('B3'),'60');
  assert.equal(sheet.display('C1'),'2'); assert.equal(sheet.display('C2'),'10'); assert.equal(sheet.display('C3'),'-2.5');
});
test('spreadsheet reports invalid references, cycles and division without evaluating code', () => {
  const sheet = evaluate({A1:'=A2',A2:'=A1',B1:'=1/0',B2:'=Z999',B3:'=globalThis.process.exit()',C1:'=SUM(A1:A2)',C2:'<script>alert(1)</script>'});
  assert.equal(sheet.display('A1'),'#CYCLE!'); assert.equal(sheet.display('C1'),'#CYCLE!');
  assert.equal(sheet.display('B1'),'#DIV/0!'); assert.equal(sheet.display('B2'),'#REF!');
  assert.equal(sheet.display('B3'),'#NAME?'); assert.equal(sheet.display('C2'),'<script>alert(1)</script>');
});
test('spreadsheet supports column boundaries and recalculation after a cell edit', () => {
  assert.equal(Sheet.column(25),'Z'); assert.equal(Sheet.column(26),'AA'); assert.equal(Sheet.column(51),'AZ');
  const cells={A1:'2',B1:'=A1*3'}; assert.equal(evaluate(cells).display('B1'),'6');
  cells.A1='4'; assert.equal(evaluate(cells).display('B1'),'12');
});

function setup(url='http://localhost/?item=3') {
  const items=[{id:1,kind:'folder',name:'Parent',parent_id:null,content:{}},{id:2,kind:'folder',name:'Child',parent_id:1,content:{}},
    {id:3,kind:'notes',name:'Note',parent_id:2,version:1,content:{text:'before'}},{id:4,kind:'diagram',name:'Map',parent_id:null,diagram_id:10,content:{}}];
  const location={href:url,assign(href){this.assigned=href;}};
  const state={data:{mindspace:{items}}};
  const listeners={};
  const context=vm.createContext({URL,location,S:state,PageController:class{},MindSpaceEditors:class{constructor(){}},
    document:{addEventListener(type,callback){(listeners[type]||=[]).push(callback);},getElementById(){return null;},querySelectorAll(){return[];}},
    clearTimeout(){},setTimeout(){return 1;},t:key=>key,icon:()=>'',esc:String});
  const Space=vm.runInContext(fs.readFileSync('view/mindspace/mindspace.js','utf8')+'\nMindSpace;',context);
  const home={makeRequest:async(action,data)=>({...items.find(i=>i.id===data.id),version:data.version+1,content:data.content}),finishBeforeSwitch:async()=>true};
  const space=new Space(home); space.resolve();
  return {space,home,state,location,listeners};
}
test('folder root, nested documents and diagram deep links resolve independently',()=>{
  assert.equal(setup('http://localhost/?folder=0').space.active,null);
  const {space}=setup(); assert.equal(space.active.id,3);
  assert.equal(space.pathTo(space.folderId()).map(i=>i.name).join('/'),'Parent/Child');
  assert.equal(space.folders(1).length,0);
  assert.equal(setup('http://localhost/?diagram=10').space.active.id,4);
});
test('autosave serializes edits typed during a request using the returned version',async()=>{
  const {space,home}=setup(); let release; const calls=[];
  home.makeRequest=async(action,data)=>{calls.push(data); if(calls.length===1) await new Promise(resolve=>release=resolve); return {...space.active,version:data.version+1,content:data.content};};
  space.draft.text='first'; const pending=space.save(); space.draft.text='latest'; release(); await pending;
  assert.equal(calls.length,2); assert.equal(calls[1].version,2); assert.equal(calls[1].content.text,'latest'); assert.equal(space.dirty(),false);
});
test('failed save preserves edits and prevents folder navigation until retry succeeds',async()=>{
  const {space,home,location}=setup(); space.draft.text='keep me';
  home.makeRequest=async()=>{throw new Error('offline');}; await space.go(null);
  assert.equal(location.assigned,undefined); assert.equal(space.draft.text,'keep me'); assert.equal(space.error,'offline');
  home.makeRequest=async(action,data)=>({...space.active,version:2,content:data.content});
  space.busy=true; await space.go(null);
  assert.equal(location.assigned,'http://localhost/?folder=0'); assert.equal(space.busy,false); assert.equal(space.dirty(),false);
});
test('late saves from a reset account never update the next account',async()=>{
  const {space,home,state}=setup(); let release; home.makeRequest=()=>new Promise(resolve=>release=resolve);
  space.draft.text='old account'; const pending=space.save(); space.reset(); state.data.mindspace.items=[];
  release({id:3,kind:'notes',version:2,content:{text:'old account'}}); await pending;
  assert.equal(state.data.mindspace.items.length,0); assert.equal(space.active,null);
});

function multiple(url='http://localhost/?space=200&folder=0') {
  const fixture = setup(url), data = fixture.state.data.mindspace;
  data.id = 100; data.name = 'MindSpace';
  data.spaces = [{id:100,name:'MindSpace'},{id:200,name:'Work'}];
  data.items.push({id:5,kind:'folder',name:'Work folder',mindspace_id:200,parent_id:null,content:{}},
    {id:6,kind:'notes',name:'Work note',mindspace_id:200,parent_id:5,version:1,content:{text:'work'}});
  fixture.space.resolve(); return fixture;
}
test('MindSpace selection scopes tabs and folders, while document deep links identify their own space',()=>{
  const {space}=multiple();
  assert.equal(space.spaceName(),'Work'); assert.equal(space.active,null);
  assert.equal(space.items().map(i=>i.id).join(','),'5,6');
  assert.equal(space.folders().map(i=>i.name).join(','),'Work folder');
  assert.ok(space.tabs().includes('Work note')); assert.ok(!space.tabs().includes('Note</span>'));
  const linked=multiple('http://localhost/?space=100&item=6').space;
  assert.equal(linked.spaceId(),200); assert.equal(linked.active.id,6); assert.equal(linked.pathTo(5)[0].name,'Work folder');
});
test('switching spaces saves the open document and preserves the other spaces in the shared catalog',async()=>{
  const {space,home,location,state}=multiple('http://localhost/?item=6'); let request;
  home.makeRequest=async(action,data)=>{request=data; return {...space.active,version:2,content:data.content};};
  space.draft.text='new work'; await space.go(null,100);
  assert.equal(request.id,6); assert.equal(request.content.text,'new work');
  const params=new URL(location.assigned).searchParams;
  assert.equal(params.get('space'),'100'); assert.equal(params.get('folder'),'0'); assert.equal(params.has('item'),false);
  assert.equal(state.data.mindspace.items.length,6); assert.equal(state.data.mindspace.items.find(i=>i.id===6).content.text,'new work');
});
test('sidebar collapse leaves the active editor and unsaved draft intact',()=>{
  const {space}=multiple('http://localhost/?item=6'); space.draft.text='still typing';
  assert.equal(space.sidebarOpen(),true); space.toggleSidebar(); assert.equal(space.sidebarOpen(),false);
  assert.equal(space.draft.text,'still typing'); assert.equal(space.dirty(),true);
  space.toggleSidebar(); assert.equal(space.sidebarOpen(),true); assert.equal(space.active.id,6);
});
