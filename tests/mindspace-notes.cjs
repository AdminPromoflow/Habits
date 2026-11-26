const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Notes = vm.runInNewContext(fs.readFileSync('view/mindspace/notes.js','utf8')+'\nMindSpaceNotes;', {Intl});
const plain = value => JSON.parse(JSON.stringify(value));
const linesFit = text => text.split('\n').length <= 15;

test('legacy notes retain literal whitespace and Unicode without a migration', () => {
  const text = '\n <script>literal</script>\n\n  acción, año, 👩🏽‍💻  ';
  assert.deepEqual(plain(Notes.pages({text})),[{text,date:null,manual:true}]);
  assert.equal(Notes.text(Notes.pages({text})),text);
});
test('overflow preserves all text and places the caret after the last line on a fresh page', () => {
  const text = Array.from({length:31},(_,i)=>`Línea ${i+1}`).join('\n');
  const pages = Notes.paginate(text,linesFit);
  assert.equal(pages.length,3); assert.equal(pages.join(''),text);
  assert.equal(pages[1].split('\n')[0],'Línea 16'); assert.equal(pages[2],'Línea 31');
  assert.deepEqual(plain(Notes.paginate('x\n'.repeat(15),linesFit)),['x\n'.repeat(15),'']);
  assert.deepEqual(plain(Notes.paginate('',linesFit)),['']);
});
test('wrapped words, long words, accents, emoji and tabs are never dropped by pagination', () => {
  const values = ['palabra '.repeat(700), 'x'.repeat(9000), '😀'.repeat(300), 'e\u0301'.repeat(300), '\t idea \n\n'.repeat(70)];
  for (const text of values) {
    const pages = Notes.paginate(text,value=>value.length<=121);
    assert.equal(pages.join(''),text);
    assert.ok(pages.every(page=>!/^\p{Mark}/u.test(page) && !/^[\uDC00-\uDFFF]/u.test(page)));
    assert.ok(pages.every(page=>page.length<=122));
  }
});
test('manual pages remain separate in previews while automatic continuations stay joined', () => {
  assert.equal(Notes.text([{text:'Una idea',manual:true},{text:' continúa.',manual:false},{text:'',manual:true},{text:'Otra idea',manual:true}]),'Una idea continúa.\n\nOtra idea');
});
test('stored pages are copied before editing', () => {
  const content={pages:[{text:'Original',date:'2026-11-25',manual:true}]};
  const pages=Notes.pages(content); pages[0].text='Changed';
  assert.equal(content.pages[0].text,'Original');
});
