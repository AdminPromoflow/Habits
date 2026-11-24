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
  return {space,home,state,location,listeners,context};
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


function modalFixture(url='http://localhost/?item=6') {
  const fixture=multiple(url), {space,context}=fixture;
  const forms=new Map();
  context.openModal=(title,html)=>{ fixture.modal={title,html}; };
  context.closeModal=()=>{fixture.closed=true;};
  context.render=()=>{fixture.rendered=true;};
  context.formFooter=()=>'';
  context.crypto={randomUUID:()=> '12345678-1234-1234-1234-123456789abc'};
  context.document.getElementById=id=>forms.get(id) || null;
  fixture.form=id=>{
    const form={addEventListener(type,handler){this[type]=handler;}};
    forms.set(id,form); return form;
  };
  space.submit=(form,task)=>fixture.pending=task(new Map(Object.entries(fixture.values || {})));
  fixture.state.data.diagrams=[{id:10,name:'Map',version:1}];
  fixture.state.data.mindspace.items.find(item=>item.id===4).diagram_version=1;
  return fixture;
}

test('sidebar includes documents in every space, nested folders and contextual Add buttons',()=>{
  const {space}=multiple(); const html=space.sidebar();
  for (const name of ['Note','Map','Work note','Parent','Child','Work folder']) assert.ok(html.includes(`>${name}</span>`), name);
  assert.ok(html.includes('data-space="100" data-parent="2"'));
  assert.ok(html.includes('data-space="200" data-parent="5"'));
  assert.equal((html.match(/data-action="ms-entry-menu"/g)||[]).length,8);
});

test('creation from a different space retains the requested destination through form submission',async()=>{
  const f=modalFixture(), form=f.form('ms-create-form'); let request;
  f.home.makeRequest=async(action,data)=>{request={action,...data};return {id:7,...data,content:{text:''}};};
  await f.space.newForm('notes',{spaceId:100,parent:2});
  assert.match(f.modal.html, /value="2" selected/);
  assert.ok(!f.modal.html.includes('Work folder'));
  f.values={name:'New child',parent:'2'};form.submit({preventDefault(){}});await f.pending;
  assert.equal(request.mindspace_id,100);assert.equal(request.parent_id,2);
  assert.equal(new URL(f.location.assigned).searchParams.get('space'),'100');
});

test('renaming an inactive diagram preserves the active editor and updates only that diagram',async()=>{
  const f=modalFixture(), form=f.form('ms-rename-form');
  f.home.active={id:20,name:'Other map',version:9};f.home.diagramTitle='Other map';
  f.home.makeRequest=async(action,data)=>({...f.space.allItems().find(i=>i.id===data.id),name:data.name,version:2,diagram_version:2});
  await f.space.rename(4);
  f.values={name:'Renamed map'};form.submit({preventDefault(){}});await f.pending;
  assert.equal(f.space.active.id,6);assert.equal(f.space.draft.text,'work');
  assert.equal(f.home.active.name,'Other map');assert.equal(f.home.diagramTitle,'Other map');
  assert.equal(f.state.data.diagrams[0].name,'Renamed map');
});

test('renaming a space updates its catalog without selecting it',async()=>{
  const f=modalFixture(), form=f.form('ms-rename-form');
  f.home.makeRequest=async(action,data)=>({id:data.id,name:data.name});
  await f.space.rename(100,true);f.values={name:'Personal'};form.submit({preventDefault(){}});await f.pending;
  assert.equal(f.space.spaceName(100),'Personal');assert.equal(f.state.data.mindspace.name,'Personal');
  assert.equal(f.space.active.id,6);assert.equal(f.space.spaceId(),200);
});

test('deleting the current nondefault space at its root navigates to a surviving space',async()=>{
  const f=modalFixture('http://localhost/?space=200&folder=0'), form=f.form('ms-delete-form');
  f.home.makeRequest=async()=>({id:200});
  await f.space.deleteForm(200,true);form.submit({preventDefault(){}});await f.pending;
  assert.equal(new URL(f.location.assigned).searchParams.get('space'),'100');
  assert.equal(f.space.allItems().some(item=>item.id===5||item.id===6),false);
});

test('deleting a folder containing the open document navigates to its parent',async()=>{
  const f=modalFixture(), form=f.form('ms-delete-form');f.home.makeRequest=async()=>({id:5,deleted_ids:[5,6]});
  await f.space.deleteForm(5);form.submit({preventDefault(){}});await f.pending;
  const url=new URL(f.location.assigned);assert.equal(url.searchParams.get('space'),'200');assert.equal(url.searchParams.get('folder'),'0');
  assert.equal(f.space.allItems().some(item=>item.id===5||item.id===6),false);assert.equal(f.space.active,null);
});

test('failed deletion keeps the editor and item catalog intact',async()=>{
  const f=modalFixture(), form=f.form('ms-delete-form');f.home.makeRequest=async()=>{throw new Error('offline');};
  await f.space.deleteForm(5);form.submit({preventDefault(){}});await assert.rejects(f.pending,/offline/);
  assert.equal(f.space.active.id,6);assert.equal(f.space.allItems().length,6);assert.equal(f.location.assigned,undefined);
});

test('drag and drop cannot silently move an item to a different space root',()=>{
  const {space}=multiple();
  assert.equal(space.canDrop(6,{dataset:{msDrop:'0',msSpace:'100'}}),false);
  assert.equal(space.canDrop(6,{dataset:{msDrop:'0',msSpace:'200'}}),true);
  assert.equal(space.canDrop(6,{dataset:{msDrop:'1'}}),false);
});


test('deleting the final space clears its URL and leaves no synthetic replacement in the sidebar',async()=>{
  const f=modalFixture('http://localhost/?space=200&folder=0'), form=f.form('ms-delete-form');
  f.state.data.mindspace.spaces=[{id:200,name:'Work'}];f.state.data.mindspace.id=200;
  f.state.data.mindspace.items=f.space.allItems().filter(item=>item.mindspace_id===200);
  f.home.makeRequest=async()=>({id:200});
  await f.space.deleteForm(200,true);form.submit({preventDefault(){}});await f.pending;
  const url=new URL(f.location.assigned);assert.equal(url.searchParams.has('space'),false);assert.equal(url.searchParams.get('folder'),'0');
  assert.equal(f.space.spaces().length,0);assert.equal(f.space.allItems().length,0);assert.equal(f.space.explorer(),'');
});
