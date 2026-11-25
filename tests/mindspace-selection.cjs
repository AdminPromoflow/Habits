const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const cells = new Map(), listeners = {}, labels = {}, sheetScroll = {classList:{add(){},remove(){}}};
  let editor;
  const document = {
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelectorAll() { return []; },
    getElementById(id) { return labels[id] ||= {}; },
    querySelector(selector) {
      const key = /data-ms-cell="([A-Z]+\d+)"/.exec(selector)?.[1];
      return key ? cell(key) : (labels[selector] ||= {});
    },
    elementFromPoint() { return document.hit; }
  };
  const space = {active:{id:1,kind:'spreadsheet',name:'Sheet'},generation:1,can:()=>true,
    draft:{rows:6,columns:5,cells:{A1:'Date',A2:'2026-11-24',B2:'4',C2:'=B2*2'}},
    targetReturnLinks:()=>new Map(),changed(){throw new Error('Selection must not change content');}};
  const context = vm.createContext({document, t:(key,values)=>values?.count ? `${values.count} cells` : key, esc:String,icon:()=>'',S:{}});
  vm.runInContext(fs.readFileSync('view/mindspace/sheet.js','utf8'),context);
  const Editors=vm.runInContext(fs.readFileSync('view/mindspace/editors.js','utf8')+'\nMindSpaceEditors;',context);
  editor=new Editors(space);
  function cell(key) {
    if (!cells.has(key)) cells.set(key, {dataset:{msCell:key},value:'',matches:()=>false,
      closest(selector){return selector==='[data-ms-cell]' ? this : selector==='.ms-sheet-scroll' ? sheetScroll : {};},
      focus(){if(document.activeElement!==this){document.activeElement=this;editor.event('focusin',{target:this});}},
      setPointerCapture(){},hasPointerCapture:()=>false,scrollIntoView(){}});
    return cells.get(key);
  }
  const pointer=(key, extra={})=>({target:cell(key),pointerId:1,button:0,buttons:1,detail:1,preventDefault(){this.prevented=true;},...extra});
  return {editor,space,document,cell,pointer,listeners};
}

test('ranges work in both directions; additive selection toggles cells and a plain click collapses it',()=>{
  const {editor,space}=fixture(), before=JSON.stringify(space.draft);
  editor.selectCell('D4');editor.selectCell('B2',{extend:true});
  assert.equal(editor.selectedCells.size,9);assert.equal(editor.selectionLabel(),'B2:D4 · 9 cells');
  editor.selectCell('A6',{add:true,toggle:true});assert.equal(editor.selectedCells.size,10);
  assert.equal(editor.selectionLabel(),'10 cells');
  editor.selectCell('A6',{add:true,toggle:true});assert.equal(editor.selectedCells.has('A6'),false);
  editor.selectCell('C3');assert.deepEqual([...editor.selectedCells],['C3']);
  editor.selectCell('C3',{add:true,toggle:true});assert.equal(editor.selectedCells.size,1);
  assert.equal(JSON.stringify(space.draft),before);
});

test('pointer dragging keeps the whole range after focus, suppresses date popups, and ends outside the grid',()=>{
  const f=fixture(),{editor,document,pointer,cell}=f;
  editor.datePickerForm=()=>{throw new Error('Dragging must not open a calendar');};
  editor.startCellSelection(pointer('A2'));
  document.hit=cell('C4');editor.dragCellSelection(pointer('C4'));
  assert.equal(editor.selectionLabel(),'A2:C4 · 9 cells');assert.equal(editor.cell,'C4');
  editor.endCellSelection({pointerId:1});assert.equal(editor.cellDrag,null);
  editor.event('click',pointer('A2'));assert.equal(editor.selectedCells.size,9);
  editor.startCellSelection(pointer('A2',{ctrlKey:true}));editor.endCellSelection({pointerId:1});
  editor.event('click',pointer('A2',{ctrlKey:true}));assert.equal(editor.selectedCells.has('A2'),false);
  editor.startCellSelection(pointer('B2'));editor.endCellSelection({pointerId:1});
  document.hit=cell('E6');editor.dragCellSelection(pointer('E6'));
  assert.deepEqual([...editor.selectedCells],['B2']);
});

test('Shift arrows expand and shrink within sheet limits; select all and Escape are scoped to the sheet',()=>{
  const {editor,cell}=fixture();editor.selectCell('D4');
  const key=value=>editor.event('keydown',{target:cell(editor.cell),key:value,shiftKey:true,preventDefault(){}});
  key('ArrowRight');key('ArrowRight');assert.equal(editor.cell,'E4');assert.equal(editor.selectedCells.size,2);
  key('ArrowDown');assert.equal(editor.selectedCells.size,4);
  key('ArrowLeft');assert.equal(editor.selectedCells.size,2);
  editor.event('keydown',{target:cell(editor.cell),key:'a',metaKey:true,preventDefault(){}});
  assert.equal(editor.selectedCells.size,30);
  editor.event('keydown',{target:cell(editor.cell),key:'Escape',preventDefault(){}});
  assert.equal(editor.selectedCells.size,1);
});

test('bulk style changes preserve unrelated formats and formulas; presets and reset affect only selected cells',()=>{
  const {editor,space}=fixture();
  space.draft.cell_styles={B2:{background:'#ffffff',bold:true},C2:{color:'#123456',bold:true},E6:{italic:true}};
  const keys=['B2','C2'];assert.equal(JSON.stringify(editor.selectionStyle(keys)),JSON.stringify({bold:true}));
  editor.applyCellStyle(keys,{italic:true},new Set(['italic']));
  assert.equal(space.draft.cell_styles.B2.background,'#ffffff');assert.equal(space.draft.cell_styles.C2.color,'#123456');
  assert.equal(space.draft.cell_styles.B2.italic,true);assert.equal(space.draft.cell_styles.C2.italic,true);
  editor.applyCellStyle(keys,{},new Set(['italic']));assert.equal('italic' in space.draft.cell_styles.B2,false);
  editor.applyCellStyle(keys,{background:'#eee8f6'},new Set(),true);
  assert.equal(space.draft.cell_styles.C2.color,undefined);
  editor.applyCellStyle(keys,{},new Set(),true);
  assert.equal(Object.keys(space.draft.cell_styles).join(','),'E6');assert.equal(space.draft.cells.C2,'=B2*2');
});

test('selection resets on document/account changes, remains after redraw, and cannot start in read-only sheets',()=>{
  const {editor,space,pointer}=fixture();editor.sheet();editor.selectCell('B2');editor.selectCell('D4',{extend:true});
  editor.sheet();assert.equal(editor.selectedCells.size,9);
  space.active.id=2;editor.sheet();assert.deepEqual([...editor.selectedCells],['A1']);
  editor.selectCell('B2');space.generation++;editor.sheet();assert.deepEqual([...editor.selectedCells],['A1']);
  space.can=()=>false;editor.startCellSelection(pointer('D4'));assert.equal(editor.cellDrag,undefined);
});
