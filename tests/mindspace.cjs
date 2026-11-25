const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Sheet = vm.runInNewContext(fs.readFileSync('view/mindspace/sheet.js','utf8')+'\nMindSpaceSheet;');
const evaluate = cells => new Sheet({rows:30,columns:10,cells});

test('ledger balances, live totals and formulas use cents and recalculate after edits', () => {
  const data={template:'ledger',rows:200,columns:6,cells:{A1:'Date',F1:'Balance',A2:'2026-01-31',D2:'1000.10',A3:'01/02/2026',E3:'200.20',D4:'0.10',D5:'0.20',B200:'Last row',E200:'50'}};
  Sheet.prepare(data);
  let sheet=new Sheet(data);
  assert.equal(sheet.display('F2'),'1000.10');assert.equal(sheet.display('F3'),'799.90');assert.equal(sheet.display('F5'),'800.20');
  assert.equal(sheet.display('F6'),'');assert.equal(sheet.display('F200'),'750.20');
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.ledgerSummary())),{income:100040,expense:25020,balance:75020});
  assert.equal(sheet.display('F1'),'Balance');assert.equal(data.cells.F200,'=SUM(D2:D200)-SUM(E2:E200)');
  data.cells.E3='100';sheet=new Sheet(data);assert.equal(sheet.display('F200'),'850.40');
  data.cells.D4='1.005';assert.equal(new Sheet(data).display('F4'),'901.11');assert.equal(new Sheet(data).display('D4'),'1.01');
});
test('ledger rejects invalid amounts and unsafe totals instead of silently treating them as zero',()=>{
  const data={template:'ledger',rows:5,columns:6,cells:{D2:'100',E3:'oops',D4:'=1/0'}};Sheet.prepare(data);
  let sheet=new Sheet(data);
  assert.equal(sheet.display('F2'),'100.00');assert.equal(sheet.display('F3'),'#VALUE!');
  assert.equal(sheet.ledgerSummary().expense,'#VALUE!');assert.equal(sheet.ledgerSummary().income,'#DIV/0!');
  data.cells={D2:'90071992547410'};Sheet.prepare(data);sheet=new Sheet(data);assert.equal(sheet.display('F2'),'#NUM!');
  data.cells={D2:'=F2'};Sheet.prepare(data);sheet=new Sheet(data);assert.equal(sheet.display('F2'),'#CYCLE!');
});
test('month colors use validated dates across month and year changes',()=>{
  assert.equal(Sheet.month('2026-01-31').key,'2026-01');assert.equal(Sheet.month('1/2/2026').key,'2026-02');
  assert.equal(Sheet.month('2026-12-31').month,12);assert.equal(Sheet.month('2027-01-01').month,1);
  assert.equal(Sheet.month('2028-02-29').key,'2028-02');
  for(const value of ['2026-02-29','31/04/2026','2026-00-10','2026-13-10','','=A3','text']) assert.equal(Sheet.month(value),null);
});
test('templates protect headers and calculated columns, extend formulas and keep blank sheets editable',()=>{
  for(const [template,col,formula] of [['ledger','F','=SUM(D2:D32)-SUM(E2:E32)'],['budget','D','=B32-C32'],['inventory','E','=C32*D32']]) {
    const data={template,rows:32,columns:6,cells:{B32:'10',C32:'3',D32:'2'}};Sheet.prepare(data);
    assert.equal(data.cells[`${col}32`],formula);assert.equal(Sheet.locked(data,`${col}32`),true);
    assert.equal(Sheet.locked(data,'A1'),true);assert.equal(Sheet.locked(data,'A2'),false);
  }
  assert.equal(new Sheet({template:'budget',rows:3,columns:4,cells:{B2:'300',C2:'125',D2:'=B2-C2'}}).display('D2'),'175');
  assert.equal(new Sheet({template:'inventory',rows:3,columns:5,cells:{C2:'3',D2:'12.50',E2:'=C2*D2'}}).display('E2'),'37.5');
  assert.equal(Sheet.locked({rows:2,columns:6,cells:{}},'F2'),false);
});

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

test('cell style rendering accepts safe formatting and rejects CSS injection and unsupported values',()=>{
  const formatted=Sheet.format({background:'#eee8f6',color:'#493663',bold:true,italic:false,font_size:18,align:'center',borders:'all',border_color:'#b39bce'});
  assert.match(formatted.text,/background-color:#eee8f6/);assert.match(formatted.text,/font-weight:700/);
  assert.match(formatted.text,/font-size:1.125rem/);assert.equal(formatted.border,'border:1px solid #b39bce');
  const invalid=Sheet.format({background:'red;position:fixed',color:'url(https://example.test)',font_size:'18;display:none',align:'left;display:none',borders:'all',border_color:'#000000;display:none'});
  assert.equal(invalid.text,'');assert.equal(invalid.border,'border:1px solid var(--line)');
});

const LinkTargets = vm.runInNewContext(fs.readFileSync('view/mindspace/link-targets.js','utf8')+'\nMindSpaceLinkTargets;', {
  MindSpaceSheet:Sheet,S:{data:{habits:[]}},t:key=>key,esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
});
test('link targets validate cell boundaries, typed IDs and live card/habit membership', () => {
  const sheet={kind:'spreadsheet',content:{rows:200,columns:52,cells:{}}};
  for(const id of ['A1','B3','AA100','AZ200']) assert.equal(LinkTargets.valid(sheet,{type:'cell',id}),true);
  for(const id of ['A0','A01','a1','A201','BA1','A1:B2','B3<script>']) assert.equal(LinkTargets.valid(sheet,{type:'cell',id}),false);
  assert.equal(LinkTargets.valid(sheet,null),true);
  assert.equal(LinkTargets.valid(sheet,undefined),false);
  assert.equal(LinkTargets.valid({kind:'diagram'},null),false);
  const board={kind:'kanban',content:{cards:[{id:'card-id',title:'Task'}]}};
  assert.equal(LinkTargets.valid(board,{type:'card',id:'card-id'}),true);
  assert.equal(LinkTargets.valid(board,{type:'card',id:'missing'}),false);
  const habits={kind:'habits',content:{habit_ids:[7,8]}};
  const catalog=[{id:7,name:'Read',permission:'owner'},{id:8,name:'Private',permission:'viewer'}];
  assert.equal(LinkTargets.valid(habits,{type:'habit',id:'7'},catalog),true);
  assert.equal(LinkTargets.valid(habits,{type:'habit',id:'8'},catalog),false);
  assert.equal(LinkTargets.valid(habits,{type:'habit',id:'9'},catalog),false);
});
test('spreadsheet preview includes blank selectable cells and safely renders values', () => {
  const html=LinkTargets.preview({kind:'spreadsheet',name:'Sheet',content:{rows:3,columns:2,cells:{A1:'3',B1:'=A1*2',A2:'<script>bad</script>'}}});
  assert.match(html,/data-link-target="B3"/);
  assert.match(html,/data-link-target="B1"[^>]+>6<\/button>/);
  assert.match(html,/&lt;script>/);
  assert.doesNotMatch(html,/<script>/);
});

test('board previews group cards under their status and keep empty columns selectable',()=>{
  const board={kind:'scrum',content:{cards:[{id:'working',title:'Working card',description:'<script>literal</script>',status:'doing'},
    {id:'pending',title:'Pending card',status:'todo'},{id:'finished',title:'Finished card',status:'done'}]}};
  const html=LinkTargets.preview(board);
  const columns=[...html.matchAll(/<section class="ms-link-column"[^>]*>(.*?)<\/section>/gs)].map(match=>match[1]);
  assert.equal(columns.length,4);
  assert.match(columns[0],/data-link-type="column" data-link-target="backlog"/);assert.match(columns[0],/ms_link_column_empty/);
  assert.match(columns[1],/Pending card/);assert.doesNotMatch(columns[1],/Working card|Finished card/);
  assert.match(columns[2],/Working card/);assert.match(columns[2],/&lt;script>/);assert.doesNotMatch(columns[2],/<script>/);
  assert.match(columns[3],/Finished card/);
  for(const id of ['backlog','todo','doing','done']) assert.equal(LinkTargets.valid(board,{type:'column',id}),true);
  assert.equal(LinkTargets.valid({...board,kind:'kanban'},{type:'column',id:'backlog'}),true);
  assert.equal(LinkTargets.valid(board,{type:'column',id:'In progress'}),false);
  assert.equal(LinkTargets.valid({kind:'notes',content:{text:''}},{type:'column',id:'todo'}),false);
  assert.equal(LinkTargets.label(board,{type:'column',id:'doing'}),'ms_status_doing');
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

test('document backlinks save pending edits and return to the linked source topic',async()=>{
  const {space,home,state,location}=setup('http://localhost/?item=3&cell=B3');
  const diagrams=[{id:10,name:'Map',nodes:[{id:'root',text:'Source topic',link:{item_id:3,target:null}}]}];
  state.data.diagrams=diagrams;
  assert.match(space.linkedFrom(),/Source topic/);
  space.draft.text='Pending edit';
  const calls=[];
  home.makeRequest=async(action,data)=>{calls.push(action);return action==='diagrams'?diagrams:{...space.active,content:data.content,version:2};};
  await space.returnToLink({dataset:{diagram:'10',node:'root'}});
  assert.deepEqual(calls,['saveMindSpaceItem','diagrams']);
  const url=new URL(location.assigned);
  assert.equal(url.searchParams.get('diagram'),'10');
  assert.equal(url.searchParams.get('topic'),'root');
  assert.equal(url.searchParams.has('cell'),false);
  assert.equal(space.dirty(),false);
});
test('removed backlinks and late replies after account reset cannot navigate',async()=>{
  const {space,home,location}=setup();
  home.makeRequest=async()=>[{id:10,nodes:[{id:'root',link:null}]}];
  await assert.rejects(space.returnToLink({dataset:{diagram:'10',node:'root'}}),/error_diagram_link_missing/);
  assert.equal(location.assigned,undefined);
  let release;home.makeRequest=()=>new Promise(resolve=>release=resolve);
  const pending=space.returnToLink({dataset:{diagram:'10',node:'root'}});
  await new Promise(setImmediate);space.reset();release([]);await pending;
  assert.equal(location.assigned,undefined);
});
test('cell deep links focus and highlight exactly their selected cell once',()=>{
  const {space,context,state}=setup('http://localhost/?item=3&cell=B3');
  state.data.mindspace.items.find(i=>i.id===3).kind='spreadsheet';
  state.data.mindspace.items.find(i=>i.id===3).content={rows:3,columns:2,cells:{}};
  space.resolve();
  let focused=0,scrolled=0;const classes=new Set();
  const cell={getAttribute:()=> 'B3',classList:{add:value=>classes.add(value)},scrollIntoView:()=>scrolled++,focus:()=>focused++};
  context.document.querySelectorAll=selector=>selector.includes('data-ms-cell')?[cell]:[];
  context.MindSpaceSheet=Sheet;
  const Targets=vm.runInContext(fs.readFileSync('view/mindspace/link-targets.js','utf8')+'\nMindSpaceLinkTargets;',context);
  Targets.arrive(space);Targets.arrive(space);
  assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(classes.has('ms-link-target'),true);
});

function cellReturnFixture() {
  const fixture=setup('http://localhost/?item=3&cell=B3'),{space,state,context,home}=fixture;
  context.MindSpaceSheet=Sheet;
  vm.runInContext(fs.readFileSync('view/mindspace/link-targets.js','utf8'),context);
  home.links=vm.runInContext(fs.readFileSync('view/home/diagram-links.js','utf8')+'\nObject.create(DiagramLinks.prototype);',context);
  const Editors=vm.runInContext(fs.readFileSync('view/mindspace/editors.js','utf8')+'\nMindSpaceEditors;',context);
  space.editor=new Editors(space);
  const sheet=state.data.mindspace.items.find(item=>item.id===3);
  sheet.kind='spreadsheet';sheet.content={rows:3,columns:2,cells:{B3:'42'}};space.resolve();
  state.data.diagrams=[{id:10,name:'Source map',nodes:[{id:'root',text:'Budget topic',link:{item_id:3,target:{type:'cell',id:'B3'}}}]}];
  return fixture;
}
test('cell formatting preserves formulas, backlinks and editor permissions',async()=>{
  const {space,context}=cellReturnFixture();
  space.draft.cells.B3='=2*21';space.draft.cell_styles={B3:{background:'#eee8f6',bold:true,borders:'bottom',border_color:'#493663'}};
  const html=space.editor.sheet();
  assert.match(html,/data-ms-cell="B3"[^>]*style="background-color:#eee8f6;font-weight:700"[^>]*value="42"/);
  assert.match(html,/border-bottom:2px solid #493663/);assert.match(html,/data-action="ms-link-return"/);
  assert.match(html,/data-action="ms-sheet-settings"/);assert.doesNotMatch(html,/data-action="ms-sheet-(row|column|export)"/);
  assert.equal(space.draft.cells.B3,'=2*21');
  space.can=()=>false;
  assert.doesNotMatch(space.editor.sheet(),/data-action="ms-sheet-settings"/);
  context.openModal=()=>{throw new Error('A viewer must not open cell settings');};
  await space.editor.cellSettings();
  await assert.rejects(space.handleAction('ms-sheet-settings',{}),/error_forbidden/);
});
test('ledger renders editable entries, protected balances, month bands and right-side totals',()=>{
  const {space}=cellReturnFixture();
  space.draft={template:'ledger',rows:4,columns:6,cells:{A1:'Date',B1:'Description',C1:'Category',D1:'Income',E1:'Expense',F1:'Balance',A2:'2026-01-31',D2:'1000',A3:'2026-02-01',E3:'250'}};
  Sheet.prepare(space.draft);
  const html=space.editor.sheet();
  assert.match(html,/data-ms-cell="F3"[^>]*readonly[^>]*value="750.00"/);
  assert.match(html,/data-ms-cell="D2"[^>]*inputmode="decimal"/);
  assert.match(html,/--ms-month-hue:210/);assert.match(html,/--ms-month-hue:35/);
  assert.match(html,/class="ms-ledger-summary"/);assert.match(html,/ms_ledger_balance<\/dt><dd>750.00/);
  assert.doesNotMatch(html,/data-ms-cell="D2"[^>]*readonly/);
});
test('only the linked cell receives a return arrow, with the source tooltip and no duplicate header link',()=>{
  const {space,state}=cellReturnFixture();
  const html=space.editor.sheet();
  assert.match(html,/<div class="ms-sheet-cell has-return"><input data-ms-cell="B3"[^>]*value="42">.*data-action="ms-link-return"/s);
  assert.equal((html.match(/data-action="ms-link-return"/g)||[]).length,1);
  assert.match(html,/data-target-id="B3"/);assert.match(html,/Budget topic/);assert.match(html,/Source map/);
  assert.equal(space.linkedFrom(),'');
  state.data.diagrams[0].nodes[0].link.target=null;
  assert.doesNotMatch(space.editor.sheet(),/data-action="ms-link-return"/);
  assert.match(space.linkedFrom(),/Budget topic/);
  state.data.diagrams[0].nodes[0].link=null;
  assert.equal(space.linkedFrom(),'');assert.equal(space.targetReturnLinks().size,0);
});
test('multiple sources on one cell open a chooser limited to that exact cell',()=>{
  const {space,state,context}=cellReturnFixture();
  state.data.diagrams[0].nodes.push({id:'second',text:'Second source',link:{item_id:3,target:{type:'cell',id:'B3'}}},
    {id:'other',text:'Different cell',link:{item_id:3,target:{type:'cell',id:'A1'}}});
  const arrow=space.targetReturnLinks().get('B3');
  assert.match(arrow,/data-action="ms-link-returns"/);assert.match(arrow,/aria-haspopup="dialog"/);
  let modal;context.openModal=(title,html)=>{modal={title,html};};
  space.chooseLinkReturn({dataset:{targetType:'cell',targetId:'B3'}});
  assert.equal(modal.title,'diagram_link_returns');
  assert.match(modal.html,/Budget topic/);assert.match(modal.html,/Second source/);assert.doesNotMatch(modal.html,/Different cell/);
  assert.equal((modal.html.match(/data-action="ms-link-return"/g)||[]).length,2);
});
test('cell return arrows save edits and reject sources that moved to another cell',async()=>{
  const {space,state,home,location}=cellReturnFixture();const calls=[];
  space.draft.cells.B3='99';
  home.makeRequest=async(action,data)=>{calls.push(action);return action==='diagrams'?state.data.diagrams:{...space.active,content:data.content,version:2};};
  const button={dataset:{diagram:'10',node:'root',targetType:'cell',targetId:'B3'}};
  await space.returnToLink(button);
  assert.deepEqual(calls,['saveMindSpaceItem','diagrams']);
  assert.equal(space.active.content.cells.B3,'99');
  assert.equal(new URL(location.assigned).searchParams.get('topic'),'root');
  delete location.assigned;
  state.data.diagrams[0].nodes[0].link.target.id='A1';
  await assert.rejects(space.returnToLink(button),/error_diagram_link_missing/);
  assert.equal(location.assigned,undefined);
});
test('cell return failures preserve edits and do not navigate',async()=>{
  const {space,home,location}=cellReturnFixture();space.draft.cells.B3='Keep me';
  home.makeRequest=async()=>{throw new Error('Offline');};
  await space.returnToLink({dataset:{diagram:'10',node:'root',targetType:'cell',targetId:'B3'}});
  assert.equal(space.draft.cells.B3,'Keep me');assert.equal(location.assigned,undefined);assert.equal(space.error,'Offline');
});
test('card and habit return arrows stay attached to the exact linked target',()=>{
  const {space,state}=cellReturnFixture();
  for(const kind of ['kanban','scrum']) {
    space.active.kind=kind;space.draft={cards:[{id:'card',title:'Linked card',status:'todo',points:0}],sprint:{}};
    state.data.diagrams[0].nodes[0].link.target={type:'card',id:'card'};
    assert.match(space.editor.board(),/data-ms-card="card"[^]*data-target-id="card"/);
  }
  space.active.kind='habits';space.draft={habit_ids:[7]};state.data.habits=[{id:7,name:'Read',permission:'owner'}];
  state.data.diagrams[0].nodes[0].link.target={type:'habit',id:'7'};
  assert.match(space.targetReturnLinks().get('7'),/data-target-type="habit"/);
  space.draft.habit_ids=[];assert.equal(space.targetReturnLinks().size,0);
});

test('column links focus the column and keep their return arrow separate from its cards',async()=>{
  const {space,state,context,location}=cellReturnFixture();
  location.href='http://localhost/?item=3&column=todo';
  space.active.kind='scrum';space.draft={cards:[{id:'card',title:'Task',status:'todo'}],sprint:{}};
  state.data.diagrams[0].nodes[0].link.target={type:'column',id:'todo'};
  state.data.diagrams[0].nodes.push({id:'card-source',text:'Card source',link:{item_id:3,target:{type:'card',id:'card'}}});
  const html=space.editor.board(),header=html.match(/data-ms-column="todo"[^]*?<header>(.*?)<\/header>/s)[1];
  assert.match(header,/data-target-type="column" data-target-id="todo"/);
  assert.doesNotMatch(header,/Card source/);
  assert.match(space.targetReturnLinks().get('card'),/data-target-type="card"/);
  let focused=0,scrolled=0,tabindex;const classes=new Set();
  const column={getAttribute:()=> 'todo',setAttribute:(key,value)=>{tabindex=value;},classList:{add:key=>classes.add(key)},scrollIntoView:()=>scrolled++,focus:()=>focused++};
  context.document.querySelectorAll=selector=>selector.includes('data-ms-column')?[column]:[];
  const Targets=vm.runInContext('MindSpaceLinkTargets;',context);Targets.arrive(space);
  assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(tabindex,'-1');assert.equal(classes.has('ms-link-target'),true);
  await space.go(state.data.mindspace.items.find(item=>item.kind==='diagram'),undefined,{type:'topic',id:'root'});
  assert.equal(new URL(location.assigned).searchParams.has('column'),false);
});

test('creation offers one unified board and both legacy board kinds use four default columns',()=>{
  const {space}=setup();
  assert.equal(space.kinds().filter(kind=>['kanban','scrum'].includes(kind)).join(','),'kanban');
  for(const kind of ['kanban','scrum']) {
    assert.equal(LinkTargets.statuses({kind,content:{cards:[]}}).join(','),'backlog,todo,doing,done');
  }
});
test('custom columns appear in the editor, card moves, link previews and return arrows',()=>{
  const {space,state}=cellReturnFixture();
  const id='12345678-1234-1234-1234-123456789abc';
  space.active.kind='kanban';
  space.draft={cards:[{id:'card',title:'Check the work',status:'todo',points:2}],sprint:{},
    columns:[...LinkTargets.columns({kind:'kanban'}),{id,name:'Review'}]};
  state.data.diagrams[0].nodes[0].link.target={type:'column',id};
  space.editor.refresh=()=>{};
  space.editor.moveCard('card',id);
  assert.equal(space.draft.cards[0].status,id);
  const html=space.editor.board();
  assert.match(html,new RegExp(`data-ms-column="${id}"`));assert.match(html,/data-action="ms-column-new"/);
  assert.match(html,new RegExp(`data-target-type="column" data-target-id="${id}"`));
  const item={...space.active,content:space.draft};
  assert.equal(LinkTargets.label(item,{type:'column',id}),'Review');
  assert.match(LinkTargets.preview(item),/Review/);assert.match(LinkTargets.preview(item),/Check the work/);
  assert.equal(LinkTargets.valid({...item,content:{...item.content,columns:item.content.columns.slice(0,4)}},{type:'column',id}),false);
});
test('adding a column saves its name and stable ID and rejects a duplicate name',async()=>{
  const {space,context,home}=cellReturnFixture();
  space.active.kind='kanban';space.draft={cards:[],sprint:{},columns:[...LinkTargets.columns({kind:'kanban'})]};
  space.baseline=JSON.stringify(space.draft);
  const form={addEventListener(type,handler){this[type]=handler;}};
  context.document.getElementById=id=>id==='ms-column-form'?form:null;
  context.document.querySelector=()=>null;
  let modal,closed=false,pending,value='Review',sent;
  context.openModal=(title,html)=>{modal={title,html};};context.closeModal=()=>{closed=true;};context.formFooter=()=>'';
  context.crypto={randomUUID:()=> '12345678-1234-1234-1234-123456789abc'};
  space.submit=(form,task)=>pending=task(new Map([['name',value]]));
  space.editor.refresh=()=>{};
  home.makeRequest=async(action,data)=>{sent=data;return {...space.active,content:data.content,version:space.active.version+1};};
  await space.editor.newColumn();assert.equal(modal.title,'ms_add_column');
  form.submit({preventDefault(){}});await pending;
  assert.equal(sent.content.columns.length,5);assert.equal(sent.content.columns[4].name,'Review');
  assert.equal(sent.content.columns[4].id,'12345678-1234-1234-1234-123456789abc');assert.equal(closed,true);assert.equal(space.dirty(),false);
  value=' review ';await space.editor.newColumn();form.submit({preventDefault(){}});
  await assert.rejects(pending,/ms_column_exists/);assert.equal(space.draft.columns.length,5);
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
test('Home lists only spaces without selecting a document or showing its contents',()=>{
  const {space,context,state}=multiple('http://localhost/');
  context.renderTemplate=(name,values)=>values;
  space.active=null;
  const html=space.homeList().spaces;
  assert.equal((html.match(/data-action="ms-space-open"/g)||[]).length,2);
  assert.match(html,/>MindSpace<\/span>/); assert.match(html,/>Work<\/span>/);
  assert.doesNotMatch(html,/Note|Map|Parent|Work folder|ms-entry-menu|ms-new/);
  assert.equal(space.active,null);
  state.data.mindspace.spaces=[];
  assert.match(space.homeList().spaces,/ms_no_spaces/);
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

test('All main spaces includes documents in every space, nested folders and contextual Add buttons',()=>{
  const {space}=multiple(); const html=space.directory();
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

test('Create opens the template chooser before any request, preserving name and destination',async()=>{
  const f=modalFixture(), create=f.form('ms-create-form'), select=f.form('ms-sheet-template-form');let request;
  f.context.MindSpaceSheet=Sheet;f.state.language='es';
  f.home.makeRequest=async(action,data)=>{request={action,...data};return {id:7,...data,content:{rows:31,columns:6,cells:{},template:data.template}};};
  await f.space.newForm('spreadsheet',{spaceId:100,parent:2});
  f.values={name:'My ledger',parent:'2'};create.submit({preventDefault(){}});await f.pending;
  assert.equal(request,undefined);assert.equal(f.modal.title,'ms_sheet_templates');
  for(const template of Sheet.templates) assert.match(f.modal.html,new RegExp(`value="${template}"`));
  f.values={template:'ledger'};select.submit({preventDefault(){}});await f.pending;
  assert.equal(request.name,'My ledger');assert.equal(request.mindspace_id,100);assert.equal(request.parent_id,2);
  assert.equal(request.template,'ledger');assert.equal(request.language,'es');
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

function inlineTitleFixture(url) {
  const f=modalFixture(url), input={value:'',setAttribute(){},addEventListener(type,fn){this[type]=fn;},focus(){this.focused=true;},select(){this.selection=[0,this.value.length];}};
  f.context.document.createElement=()=>input;
  f.context.document.querySelector=()=>null;
  f.context.toast=message=>{f.error=message;};
  f.heading={dataset:{msTitle:'item'},isConnected:true,replaceChildren(child){this.input=child;}};
  f.input=input;return f;
}
test('inline names select all, save pending content first and preserve the editor draft',async()=>{
  const f=inlineTitleFixture(),calls=[];
  f.home.makeRequest=async(action,data)=>{calls.push(data);return {...f.space.active,...data,content:data.content||f.space.active.content,version:data.version+1};};
  await f.space.beginTitleEditing(f.heading);
  assert.deepEqual(f.input.selection,[0,'Work note'.length]);assert.equal(f.input.focused,true);
  assert.equal(f.space.isEditing(),true);
  f.space.draft.text='unsaved content';f.input.value='Renamed inline';
  assert.equal(await f.space.finishTitleEditing(),true);
  assert.equal(calls.length,2);assert.equal(calls[0].content.text,'unsaved content');
  assert.equal(calls[1].version,calls[0].version+1);assert.equal(calls[1].name,'Renamed inline');
  assert.equal(f.space.draft.text,'unsaved content');assert.equal(f.space.dirty(),false);
  assert.equal(f.heading.textContent,'Renamed inline');assert.equal(f.space.titleEdit,null);
});
test('Escape, empty names and read-only access cannot rename a workspace heading',async()=>{
  const f=inlineTitleFixture();let calls=0;f.home.makeRequest=async()=>{calls++;};
  await f.space.beginTitleEditing(f.heading);f.input.value='Discard this';await f.space.finishTitleEditing(false);
  assert.equal(f.heading.textContent,'Work note');assert.equal(calls,0);
  await f.space.beginTitleEditing(f.heading);f.input.value='   ';await f.space.finishTitleEditing();
  assert.equal(f.heading.textContent,'Work note');assert.equal(calls,0);
  f.state.sharedWorkspace={permissions:{edit:false}};
  await f.space.beginTitleEditing(f.heading);assert.equal(f.space.titleEdit,null);
});
test('failed inline renames retain their text and block navigation until saved or cancelled',async()=>{
  const f=inlineTitleFixture();await f.space.beginTitleEditing(f.heading);
  f.input.value='Keep this name';f.home.makeRequest=async()=>{throw new Error('offline');};
  await f.space.go(null);assert.equal(f.location.assigned,undefined);
  assert.equal(f.error,'offline');assert.equal(f.input.value,'Keep this name');assert.equal(f.input.readOnly,false);
  f.home.makeRequest=async(action,data)=>({...f.space.active,name:data.name,version:2});
  await f.space.go(null);assert.equal(f.space.active.name,'Keep this name');assert.ok(f.location.assigned);
});
test('inline diagram titles use the latest diagram version and synchronize its catalog',async()=>{
  const f=inlineTitleFixture('http://localhost/?diagram=10');let request;
  f.home.active={id:10,name:'Map',version:7};
  f.home.makeRequest=async(action,data)=>{request=data;return {...f.space.active,name:data.name,version:2,diagram_version:8};};
  await f.space.beginTitleEditing(f.heading);f.input.value='Mind map';await f.space.finishTitleEditing();
  assert.equal(request.diagram_version,7);assert.equal(f.home.diagramTitle,'Mind map');
  assert.equal(f.home.active.version,8);assert.equal(f.state.data.diagrams[0].name,'Mind map');
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
