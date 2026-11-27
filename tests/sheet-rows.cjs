const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const classes = () => ({values:new Set(),add(...names){names.forEach(name=>this.values.add(name));},remove(...names){names.forEach(name=>this.values.delete(name));},toggle(){}});
  const rows = new Map(), handles = new Map(), labels = {}, calls = [], toasts = [];
  const scroll = {classList:classes(),scrollTop:100,scrollLeft:20,getBoundingClientRect:()=>({left:0,right:600,top:0,bottom:400}),querySelectorAll:()=>[...rows.values()],querySelector:selector=>rows.get(Number(/"(\d+)"/.exec(selector)?.[1]))};
  const panel = {setAttribute(){},removeAttribute(){}};
  for(let row=1;row<=5;row++) {
    rows.set(row,{dataset:{msSheetRow:String(row)},classList:classes(),closest(selector){return selector==='[data-ms-sheet-row]' ? this : selector==='.ms-sheet-scroll' ? scroll : null;}});
    handles.set(row,{dataset:{msRowHandle:String(row)},isConnected:true,focus(){},setAttribute(){},setPointerCapture(){},hasPointerCapture:()=>false,closest(selector){return selector==='[data-ms-row-handle]' ? this : selector==='tr' ? rows.get(row) : selector==='.ms-sheet-scroll' ? scroll : selector==='#mindspace-panel' ? panel : null;}});
  }
  const document = {addEventListener(){},querySelectorAll:()=>[],getElementById:id=>(labels[id]||={}),
    querySelector(selector){if(selector==='.ms-sheet-scroll')return scroll;if(selector==='.ms-sheet')return panel;if(selector.startsWith('[data-ms-row-handle'))return handles.get(Number(/"(\d+)"/.exec(selector)[1]));return labels[selector]||={};},
    elementFromPoint:()=>document.hit};
  const space = {active:{id:9,version:1,kind:'spreadsheet'},draft:{rows:5,columns:2,cells:{A2:'Second',A3:'Third'}},generation:1,can:()=>true,busy:false,
    flushContent:async()=>true,upsert(saved){this.catalog=saved;},home:{async makeRequest(action,data){calls.push({action,data});return {id:9,version:2,kind:'spreadsheet',content:{...space.draft,cells:{A2:'Third',A3:'Second'}}};}}};
  const context = vm.createContext({document,structuredClone,requestAnimationFrame:()=>1,cancelAnimationFrame(){},t:(key,params)=>key,toast:message=>toasts.push(message),esc:String,icon:()=>'',S:{}});
  vm.runInContext(fs.readFileSync('view/mindspace/sheet.js','utf8'),context);
  const Editor=vm.runInContext(fs.readFileSync('view/mindspace/editors.js','utf8')+'\nMindSpaceEditors;',context);
  const editor=new Editor(space);editor.refresh=()=>{};
  const pointer=(row,extra={})=>({target:handles.get(row),pointerId:1,button:0,buttons:1,clientX:10,clientY:100,preventDefault(){this.prevented=true;},...extra});
  return {editor,space,document,rows,handles,scroll,calls,toasts,pointer,panel};
}

test('click selects the entire row; dragging 3 to 2 inserts it and shows the drop marker',async()=>{
  const f=fixture();f.editor.startRowDrag(f.pointer(3));
  assert.deepEqual([...f.editor.selectedCells],['A3','B3']);
  f.document.hit=f.rows.get(2);f.editor.dragRow(f.pointer(3,{clientY:60}));
  assert.equal(f.rows.get(2).classList.values.has('is-row-drop-before'),true);
  const scrolled = f.scroll.scrollTop;
  f.editor.endRowDrag(f.pointer(3,{clientY:60}));await f.editor.rowSavePromise;
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'moveSpreadsheetRow');
  assert.equal(f.calls[0].data.from,3);assert.equal(f.calls[0].data.to,2);
  assert.equal(f.space.draft.cells.A2,'Third');assert.equal(f.space.draft.cells.A3,'Second');
  assert.deepEqual([...f.editor.selectedCells],['A2','B2']);assert.equal(f.space.busy,false);
  assert.equal(f.scroll.scrollTop,scrolled);assert.equal(f.space.baseline,JSON.stringify(f.space.draft));
});
test('plain clicks, cancelled drags, outside drops, lost permission and switched documents do not reorder',()=>{
  for(const scenario of ['click','cancel','outside','permission','switch']) {
    const f=fixture();f.editor.startRowDrag(f.pointer(3));f.document.hit=f.rows.get(2);
    if(scenario!=='click') f.editor.dragRow(f.pointer(3,{clientY:60}));
    if(scenario==='cancel')f.editor.cancelRowDrag();
    if(scenario==='outside')f.document.hit=null;
    if(scenario==='permission')f.space.can=()=>false;
    if(scenario==='switch')f.space.generation++;
    f.editor.endRowDrag(f.pointer(3,{clientY:60}));
    assert.equal(f.calls.length,0,scenario);assert.equal(f.space.draft.cells.A3,'Third',scenario);
  }
});
test('failed saves retain the original data, release the busy state and never submit a move',async()=>{
  const f=fixture();f.space.flushContent=async()=>false;
  assert.equal(await f.editor.moveSheetRow(3,2),false);assert.equal(f.calls.length,0);assert.equal(f.space.busy,false);assert.equal(f.panel.inert,false);
  f.space.flushContent=async()=>true;f.space.home.makeRequest=async()=>{throw new Error('Conflict');};
  assert.equal(await f.editor.moveSheetRow(3,2),false);assert.equal(f.space.draft.cells.A3,'Third');assert.equal(f.toasts.at(-1),'Conflict');
});
test('moves flush edits first and block overlapping moves until the server responds',async()=>{
  const f=fixture();let release;
  f.space.flushContent=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.editor.moveSheetRow(3,2);
  assert.equal(f.calls.length,0);assert.equal(f.space.busy,true);
  assert.equal(await f.editor.moveSheetRow(4,2),false);
  release(true);assert.equal(await pending,true);assert.equal(f.calls.length,1);
});
test('Alt arrows move rows from keyboard; template row 1 and read-only sheets are protected',async()=>{
  const f=fixture();f.space.draft.template='ledger';
  f.editor.event('keydown',{target:f.handles.get(3),key:'ArrowUp',altKey:true,preventDefault(){}});await f.editor.rowSavePromise;
  assert.equal(f.calls[0].data.to,2);
  assert.equal(await f.editor.moveSheetRow(2,1),false);
  f.space.can=()=>false;f.editor.startRowDrag(f.pointer(3));assert.equal(f.editor.rowDrag,undefined);
  assert.equal(await f.editor.moveSheetRow(2,3),false);
});
