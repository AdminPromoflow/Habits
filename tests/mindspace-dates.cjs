const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Sheet = vm.runInNewContext(fs.readFileSync('view/mindspace/sheet.js','utf8')+'\nMindSpaceSheet;');

test('date columns accept ISO and local dates, including leap years, without treating headers or formulas as dates', () => {
  assert.equal(Sheet.date('29/02/2028').iso,'2028-02-29');
  for (const value of ['2026-02-29','31/04/2026','2026-13-01','=A2','2026-00-01']) assert.equal(Sheet.date(value),null);
  const sheet={rows:10,columns:6,cells:{B1:' Date ',C1:'Fecha',D1:'Description'}};
  assert.equal(Sheet.dateCell(sheet,'B2'),true);assert.equal(Sheet.dateCell(sheet,'C10'),true);
  for (const key of ['B1','D2','B11']) assert.equal(Sheet.dateCell(sheet,key),false);
  assert.equal(Sheet.dateCell({...sheet,template:'ledger'},'A2'),true);
  assert.equal(Sheet.dateCell({...sheet,template:'projects'},'E2'),true);
});

function fixture(value='') {
  const fields={year:{value:''},month:{value:''}}, nodes=new Map(), handlers={};
  const node=selector=>{
    if(!nodes.has(selector)) nodes.set(selector,{setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}});
    return nodes.get(selector);
  };
  const form={isConnected:true,elements:{namedItem:name=>fields[name]},querySelector:node,addEventListener(type,handler){handlers[type]=handler;}};
  const modal={addEventListener(type,handler){this[type]=handler;}},input={isConnected:true,value};
  const state={writes:0,opened:0,closed:0,fields,form,handlers,input};
  const draft={template:'ledger',rows:3,columns:6,cells:{A1:'Date',A2:value,B2:'Keep description',F2:'=SUM(D2:D2)-SUM(E2:E2)'},cell_styles:{A2:{bold:true}}};
  const space={active:{id:4,kind:'spreadsheet'},generation:1,draft,can:()=>true,flush:async()=>true,changed(){},
    async save(){state.writes++;state.saved=structuredClone(draft);return true;},
    submit(form,task){state.pending=task().catch(error=>{state.error=error.message;});return state.pending;}};
  // At this UTC instant it is still December 31 in the application's time zone.
  class Clock extends Date { constructor(...args){super(...(args.length?args:['2031-01-01T04:30:00Z']));} }
  const context=vm.createContext({Date:Clock,Intl,MindSpaceSheet:Sheet,S:{language:'es'},t:key=>key,esc:String,icon:()=>'',formFooter:()=>'',
    document:{activeElement:input,addEventListener(){},getElementById:id=>id==='modal'?modal:form},
    openModal(){state.opened++;},closeModal(){state.closed++;modal.close();}});
  const Editor=vm.runInContext(fs.readFileSync('view/mindspace/editors.js','utf8')+'\nMindSpaceEditors;',context);
  const editor=new Editor(space);editor.recalculate=()=>{};
  return {...state,state,editor,space,node};
}

test('opening a blank date uses the current Bogota day without saving until OK',async()=>{
  const f=fixture();await f.editor.datePickerForm('A2',f.input);
  assert.equal(f.editor.datePicker.selected,'2030-12-31');assert.equal(f.fields.year.value,2030);
  assert.equal(f.state.writes,0);assert.equal(f.space.draft.cells.A2,'');
  f.handlers.submit({preventDefault(){}});await f.state.pending;
  assert.equal(f.state.saved.cells.A2,'2030-12-31');assert.equal(f.state.closed,1);
  assert.equal(f.editor.datePicker,null);
});

test('changing the year updates the calendar immediately and selecting a leap day saves without OK',async()=>{
  const f=fixture('24/02/2026');await f.editor.datePickerForm('A2',f.input);
  assert.equal(f.editor.datePicker.selected,'2026-02-24');
  f.fields.year.value='2028';f.handlers.input({target:{name:'year'}});
  assert.match(f.node('[data-ms-date-calendar]').innerHTML,/data-ms-date-day="2028-02-29"/);
  assert.equal(f.state.writes,0);
  f.handlers.click({target:{closest:selector=>selector==='[data-ms-date-day]'?{dataset:{msDateDay:'2028-02-29'}}:null}});
  await f.state.pending;
  assert.equal(f.state.writes,1);assert.equal(f.state.saved.cells.A2,'2028-02-29');
  assert.equal(f.state.saved.cells.B2,'Keep description');assert.equal(f.state.saved.cells.F2,'=SUM(D2:D2)-SUM(E2:E2)');
  assert.deepEqual(f.state.saved.cell_styles,{A2:{bold:true}});
});

test('date selection respects read-only access and keeps a failed save available for retry',async()=>{
  const f=fixture();f.space.can=()=>false;await f.editor.datePickerForm('A2',f.input);
  assert.equal(f.state.opened,0);
  f.space.can=()=>true;await f.editor.datePickerForm('A2',f.input);
  f.space.save=async()=>{f.space.error='Offline';return false;};
  f.handlers.submit({preventDefault(){}});await f.state.pending;
  assert.equal(f.state.error,'Offline');assert.equal(f.state.closed,0);
  assert.equal(f.editor.datePicker.saving,false);assert.equal(f.space.draft.cells.A2,'2030-12-31');
});
