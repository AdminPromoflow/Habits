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
  const Sheet=vm.runInContext('MindSpaceSheet',context);
  return {editor,space,document,cell,pointer,listeners,Sheet,context};
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

function editFixture() {
  const f=fixture();f.changes=0;f.errors=[];
  f.space.changed=()=>f.changes++;
  f.editor.refresh=()=>{};
  f.context.toast=message=>f.errors.push(message);
  f.editor.sheet();
  return f;
}
function clipboard(text='') {
  const values=new Map([['text/plain',text]]);
  return {get types(){return [...values.keys()];},getData:type=>values.get(type)||'',setData:(type,value)=>values.set(type,value)};
}
function clipEvent(f,data,key=f.editor.cell) {
  return {target:f.cell(key),clipboardData:data,preventDefault(){this.prevented=true;}};
}

test('Delete and Mac Backspace empty only selected editable cells and retain formatting and protected formulas',()=>{
  for(const pressed of ['Delete','Backspace']) {
    const f=editFixture(),{editor,space,Sheet}=f;
    space.draft.template='budget';space.draft.cell_styles={B2:{bold:true}};
    Sheet.prepare(space.draft);const protectedFormula=space.draft.cells.D2;
    editor.selectCell('B1');editor.selectCell('D2',{extend:true});
    const event={target:f.cell('D2'),key:pressed,preventDefault(){this.prevented=true;}};
    editor.event('keydown',event);
    assert.equal(event.prevented,true);assert.equal(f.changes,1);
    assert.equal(space.draft.cells.B2,undefined);assert.equal(space.draft.cells.C2,undefined);
    assert.equal(space.draft.cells.A2,'2026-11-24');assert.equal(space.draft.cells.D2,protectedFormula);
    assert.equal(space.draft.cell_styles.B2.bold,true);assert.equal(editor.selectedCells.size,6);
  }
});

test('copy uses the visual rectangle order, includes empty cells and formulas, and never mutates the document',()=>{
  const f=editFixture(),{editor,space}=f,data=clipboard();const before=JSON.stringify(space.draft);
  editor.selectCell('C3');editor.selectCell('B2',{extend:true});
  const event=clipEvent(f,data);editor.event('copy',event);
  assert.equal(event.prevented,true);assert.equal(data.getData('text/plain'),'4\t=B2*2\n\t');
  assert.equal(JSON.stringify(space.draft),before);assert.equal(f.changes,0);
});

test('copied cells paste from the destination top-left, replace blanks and keep destination styles',()=>{
  const f=editFixture(),{editor,space}=f,data=clipboard();
  space.draft.cells.B3='line 1\nline 2';space.draft.cell_styles={D4:{bold:true}};
  editor.selectCell('B2');editor.selectCell('C3',{extend:true});editor.event('copy',clipEvent(f,data));
  space.draft.cells.E5='replace this with blank';
  editor.selectCell('D4');editor.selectCell('E5',{extend:true});editor.event('paste',clipEvent(f,data));
  assert.equal(space.draft.cells.D4,'4');assert.equal(space.draft.cells.E4,'=B2*2');
  assert.equal(space.draft.cells.D5,'line 1\nline 2');assert.equal(space.draft.cells.E5,undefined);
  assert.equal(space.draft.cell_styles.D4.bold,true);assert.equal(editor.cell,'D4');
  assert.equal(editor.selectionLabel(),'D4:E5 · 4 cells');assert.equal(f.changes,1);
});

test('sparse copy omits unselected data and preserves destination gaps; one value fills separate selected cells',()=>{
  const f=editFixture(),{editor,space,Sheet}=f,data=clipboard();
  space.draft.cells.B3='Unselected private text';space.draft.cells.C3='last';
  editor.selectCell('B2');editor.selectCell('C3',{add:true});editor.event('copy',clipEvent(f,data));
  assert.equal(data.getData('text/plain'),'4\t\n\tlast');assert.doesNotMatch(data.getData(Sheet.clipboardType),/private/);
  space.draft.cells.E4='keep gap';space.draft.cells.D5='keep gap too';editor.selectCell('D4');
  editor.event('paste',clipEvent(f,data));
  assert.equal(space.draft.cells.D4,'4');assert.equal(space.draft.cells.E5,'last');
  assert.equal(space.draft.cells.E4,'keep gap');assert.equal(space.draft.cells.D5,'keep gap too');
  editor.event('paste',clipEvent(f,clipboard('same')));
  assert.equal(space.draft.cells.D4,'same');assert.equal(space.draft.cells.E5,'same');assert.equal(space.draft.cells.E4,'keep gap');
  const before=JSON.stringify(space.draft);editor.event('paste',clipEvent(f,clipboard('a\tb')));
  assert.equal(JSON.stringify(space.draft),before);assert.equal(f.errors.at(-1),'ms_paste_contiguous');
});

test('standard clipboard text handles quoted tabs, multiline cells, quotes and CRLF from Excel',()=>{
  const {Sheet}=fixture(), rows=[['with\ttab','"quoted"'],['two\nlines','']];
  assert.equal(JSON.stringify(Sheet.clipboardRows(Sheet.clipboardText(rows))),JSON.stringify(rows));
  assert.equal(JSON.stringify(Sheet.clipboardRows('one\ttwo\r\nthree\tfour\r\n')),JSON.stringify([['one','two'],['three','four']]));
  const external=clipboard('"one\ttwo"\t"three\nfour"\n"""quoted"""\tlast');
  assert.equal(JSON.stringify(Sheet.clipboardData(external)),JSON.stringify([['one\ttwo','three\nfour'],['"quoted"','last']]));
});

test('invalid and oversized pastes reject atomically, while valid pastes expand within the sheet limits',()=>{
  const f=editFixture(),{editor,space,Sheet}=f;editor.selectCell('E6');
  for(const value of ['x'.repeat(2001),Array(53).fill('x').join('\t'),Array(201).fill('x').join('\n'),'"unterminated']) {
    const before=JSON.stringify(space.draft);editor.event('paste',clipEvent(f,clipboard(value)));
    assert.equal(JSON.stringify(space.draft),before);assert.equal(f.changes,0);
  }
  editor.event('paste',clipEvent(f,clipboard('x\ty\nz\tw')));
  assert.equal(space.draft.rows,7);assert.equal(space.draft.columns,6);assert.equal(space.draft.cells.F7,'w');
  space.draft.rows=200;space.draft.columns=52;editor.selectCell('AZ200');
  const before=JSON.stringify(space.draft);editor.event('paste',clipEvent(f,clipboard('x\ty')));
  assert.equal(JSON.stringify(space.draft),before);
  const bad=clipboard('safe');bad.setData(Sheet.clipboardType,'{"version":1,"rows":[[{"html":"bad"}]]}');
  editor.selectCell('B2');editor.event('paste',clipEvent(f,bad));assert.equal(space.draft.cells.B2,'safe');
});

test('pasting respects protected cells and read-only permissions, and ignores image-only clipboards',()=>{
  const f=editFixture(),{editor,space,Sheet}=f;space.draft.template='budget';Sheet.prepare(space.draft);
  editor.selectCell('C1');editor.event('paste',clipEvent(f,clipboard('header\tformula\n12\twrong')));
  assert.equal(space.draft.cells.C1,undefined);assert.equal(space.draft.cells.C2,'12');assert.equal(space.draft.cells.D2,'=B2-C2');
  const before=JSON.stringify(space.draft);space.can=()=>false;editor.clearCells();editor.pasteCells(clipEvent(f,clipboard('blocked')));
  assert.equal(JSON.stringify(space.draft),before);space.can=()=>true;
  editor.pasteCells(clipEvent(f,{types:['image/png'],getData:()=>''}));assert.equal(JSON.stringify(space.draft),before);
});

test('text editing and the formula bar retain native deletion, copy and paste behavior',()=>{
  const f=editFixture(),{editor}=f;editor.selectCell('B2');
  editor.event('keydown',{target:f.cell('B2'),key:'F2',preventDefault(){}});
  for(const type of ['copy','paste']) {
    const event=clipEvent(f,clipboard('partial'));editor.event(type,event);assert.equal(event.prevented,undefined);
    const formula={...event,target:{dataset:{},matches:()=>false}};editor.event(type,formula);assert.equal(formula.prevented,undefined);
  }
  const deletion={target:f.cell('B2'),key:'Backspace',preventDefault(){this.prevented=true;}};
  editor.event('keydown',deletion);assert.equal(deletion.prevented,undefined);assert.equal(f.changes,0);
  editor.event('keydown',{target:f.cell('B2'),key:'Escape',preventDefault(){}});
  editor.event('copy',clipEvent(f,clipboard()));assert.equal(editor.editingCell,null);
});
