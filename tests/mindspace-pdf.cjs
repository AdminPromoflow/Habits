const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const words = {ms_kind_notes:'Notas', ms_kind_spreadsheet:'Hoja de cálculo', ms_kind_kanban:'Kanban - Scrum', ms_kind_habits:'Hábitos', ms_pdf_page:'Página', ms_pdf_empty:'Sin contenido.', name:'Nombre', description:'Descripción', ms_points:'Puntos', ms_sprint_goal:'Objetivo del sprint', date:'Fecha', habit_name:'Hábito', category:'Categoría', goal:'Meta', status:'Estado', completed:'Completado', pending:'Pendiente'};
  const context = {console, Blob, atob, btoa, TextEncoder, TextDecoder, navigator:{userAgent:''}, setTimeout, clearTimeout,
    t:key => words[key] || key, S:{language:'es', data:{habits:[]}}, today:() => '2026-11-24', habitCategory:h=>h.category,
    goalLabel:h=>`${h.goal} ${h.unit}`, done:h=>h.complete, toast:()=>{}};
  context.window = context; context.self = context;
  vm.createContext(context);
  for (const file of ['assets/vendor/pdf/jspdf-4.2.1.umd.min.js', 'assets/vendor/pdf/jspdf-autotable-5.0.7.min.js', 'assets/vendor/pdf/noto-sans-regular.js', 'view/mindspace/sheet.js', 'view/mindspace/link-targets.js', 'view/mindspace/pdf.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
  const PDF = vm.runInContext('MindSpacePDF', context);
  return {PDF, context};
}

function capture(pdf) {
  const text = [], draw = pdf.doc.text.bind(pdf.doc);
  pdf.doc.text = (value, ...args) => { text.push(Array.isArray(value) ? value.join(' ') : value); return draw(value, ...args); };
  return text;
}
function artifact(pdf, name) {
  pdf.finish();
  const bytes = Buffer.from(pdf.doc.output('arraybuffer'));
  assert.equal(bytes.subarray(0,5).toString(), '%PDF-');
  if (process.env.MRM_PDF_ARTIFACTS) {
    fs.mkdirSync('tests/.runtime/pdf', {recursive:true});
    fs.writeFileSync(`tests/.runtime/pdf/${name}.pdf`, bytes);
  }
}

test('long notes paginate, preserve accents, blank lines and the final paragraph', () => {
  const {PDF} = setup(), pdf = new PDF({name:'Ideas y planificación', kind:'notes'}, 'Mi MindSpace');
  const text = capture(pdf);
  pdf.text('Primera línea: acción, año, pingüino.\n\n' + 'Una idea con espacio para reflexionar.\n'.repeat(160) + 'ÚLTIMO PÁRRAFO');
  assert.ok(pdf.doc.getNumberOfPages() >= 4);
  assert.equal(text.filter(line => line === 'Una idea con espacio para reflexionar.').length,160);
  assert.ok(text.includes('')); assert.ok(text.includes('ÚLTIMO PÁRRAFO'));
  artifact(pdf, 'notes');
});

test('wide spreadsheets include the last column and calculated values across pages', () => {
  const {PDF} = setup(), item = {name:'Hoja de 52 columnas', kind:'spreadsheet', content:{rows:2, columns:52, cells:{A1:'Importe',A2:'12.50',B2:'=A2*2',AZ1:'Última columna',AZ2:'FINAL AZ2'}}};
  const pdf = new PDF(item, 'Mi MindSpace'), text = capture(pdf);
  pdf.sheet();
  assert.equal(pdf.doc.getNumberOfPages(),9);
  assert.ok(text.includes('25')); assert.ok(text.includes('AZ')); assert.ok(text.includes('FINAL AZ2'));
  artifact(pdf, 'wide-sheet');
});

test('notebook exports every displayed page with artwork and styled text, without generic headers or footers', async () => {
  const {PDF,context} = setup(), item={name:'Cuaderno',kind:'notes',content:{text:'Legacy text is not the displayed pagination'}};
  context.Image=class { async decode() {} };
  context.document={fonts:{load:async()=>{}}};
  const pdf = new PDF(item,'Mi espacio'), rendered=[], images=[];
  const snapshot={width:620,height:620*1272/902,image:'assets/planner/notepaper.png',writingStyle:"font-family:'MRM Edwardian'",pages:[
    {text:'Primera idea',date:'2026-11-25'}, {text:'',date:null}, {text:'Última idea',date:'2026-12-01'},
  ]};
  pdf.noteCanvas=async (layout,page,index)=>{rendered.push({layout,page,index});return {width:1804,height:2544};};
  pdf.doc.addImage=(image,format,x,y,width,height,alias)=>images.push({image,format,x,y,width,height,alias});
  const text = capture(pdf); await pdf.notes(snapshot); pdf.finish();
  assert.equal(pdf.doc.getNumberOfPages(),3);
  assert.deepEqual(rendered.map(entry=>entry.page),snapshot.pages);
  assert.ok(rendered.every(entry=>entry.layout.writingStyle.includes('MRM Edwardian')));
  assert.deepEqual(images.map(image=>image.alias),['note-paper','note-text-0','note-paper','note-text-1','note-paper','note-text-2']);
  assert.ok(images.every(image=>image.x===0 && image.y===0 && image.width===pdf.width && image.height===pdf.height));
  assert.ok(Math.abs(pdf.height/pdf.width - 1272/902)<0.001);
  assert.deepEqual(text,[]);
  assert.ok(images.filter(image=>image.alias.startsWith('note-text')).every(image=>image.image.width===0),'Canvases are released after each page');
});

test('long table cells split without dropping subsequent rows', () => {
  const {PDF} = setup(), pdf = new PDF({name:'Filas largas',kind:'spreadsheet',content:{rows:3,columns:6,cells:{A1:'Descripción',A2:'Información '.repeat(160),A3:'FILA FINAL',F1:'Total',F3:'=2+3'}}}, 'Mi MindSpace');
  const text = capture(pdf); pdf.sheet();
  assert.ok(pdf.doc.getNumberOfPages() > 1);
  assert.ok(text.some(line=>line.includes('FILA FINAL'))); assert.ok(text.includes('5'));
  artifact(pdf, 'long-cell');
});

test('boards retain sprint details, custom columns, full descriptions and empty columns', () => {
  const {PDF} = setup(), item = {name:'Plan de trabajo',kind:'kanban',content:{columns:[{id:'todo',name:'Por hacer'},{id:'review',name:'Revisión'},{id:'done',name:'Completado'}],cards:[{title:'Revisar propuesta',description:'Descripción detallada. '.repeat(200)+' FIN DE TARJETA',status:'review',points:8}],sprint:{name:'Sprint de noviembre',goal:'Entregar el proyecto',start:'2026-11-24',end:'2026-11-30'}}};
  const pdf = new PDF(item, 'Mi MindSpace'), text = capture(pdf); pdf.board();
  const all = text.join(' ');
  for (const phrase of ['Sprint de noviembre','Revisión','Completado','FIN DE TARJETA','Sin contenido.']) assert.ok(all.includes(phrase));
  artifact(pdf, 'board');
});

test('habit exports use the chosen date and only accessible selected habits', () => {
  const {PDF,context} = setup(); context.S.date='2026-11-23';
  context.S.data.habits=[{id:1,name:'Leer',category:'Aprendizaje',goal:20,unit:'min',permission:'owner',complete:true},{id:2,name:'PRIVATE',permission:'viewer'},{id:3,name:'UNSELECTED',permission:'owner'}];
  const pdf = new PDF({name:'Mis hábitos',kind:'habits',content:{habit_ids:[1,2]}}, 'Mi MindSpace'), text = capture(pdf); pdf.habits();
  const all = text.join(' '); assert.match(all,/2026-11-23/); assert.match(all,/Leer/); assert.match(all,/Completado/); assert.doesNotMatch(all,/PRIVATE|UNSELECTED/);
  artifact(pdf, 'habits');
});

test('failed saves and navigation during preparation prevent exporting the wrong document', async () => {
  const {PDF} = setup(); PDF.libraries=async()=>{};
  const button={textContent:'Download PDF',disabled:false,setAttribute(){},removeAttribute(){}};
  const space={generation:1,active:{id:1,kind:'notes'},isDiagram:()=>false,flush:async()=>false};
  await PDF.download(space,button); assert.equal(button.disabled,false); assert.equal(space.pdfBusy,false);
  space.flush=async()=>{space.active.id=2;return true;};
  await PDF.download(space,button); assert.equal(button.disabled,false);
  let release; PDF.libraries=()=>new Promise(resolve=>{release=resolve;});
  const pending=PDF.download(space,button); assert.equal(button.disabled,true);
  await PDF.download(space,button); space.generation++; release(); await pending;
  assert.equal(button.textContent,'Download PDF'); assert.equal(space.pdfBusy,false);
  assert.equal(PDF.filename('Plan / acción: noviembre?'), 'Plan - acción- noviembre-.pdf');
});
