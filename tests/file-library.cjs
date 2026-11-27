const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch) {
  const context = {FormData, Blob, URLSearchParams, fetch, S:{csrf:'test-csrf'}, t:key=>key};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('view/mindspace/files.js','utf8'),context);
  return {Files:vm.runInContext('MindSpaceFiles',context), Book:vm.runInContext('FileBookReader',context)};
}

test('multipart upload preserves destination, share scope, idempotency key and actual bytes',async()=>{
  let calls=0;
  const {Files}=setup(async(url,options)=>{
    calls++;
    assert.equal(url,'controller/files/index.php?action=uploadLibraryFile');
    assert.equal(options.headers['X-CSRF-Token'],'test-csrf');
    assert.equal(options.headers['Content-Type'],undefined);
    assert.equal(options.body.get('id'),'7');
    assert.equal(options.body.get('share_id'),'5');
    assert.equal(options.body.get('parent_id'),'13');
    assert.equal(options.body.get('client_key'),'stable-retry-key');
    assert.equal(options.body.get('file').name,'Document.pdf');
    assert.equal(await options.body.get('file').text(),'%PDF-fixture');
    return {ok:true,json:async()=>({ok:true,result:{id:99}})};
  });
  const files=new Files({});files.limit=1000;
  const result=await files.upload(new Blob(['%PDF-fixture']),'Document.pdf',{id:7,share_id:5},13,'stable-retry-key');
  assert.equal(result.id,99);assert.equal(calls,1);
});

test('oversized uploads are rejected before sending and server errors remain readable',async()=>{
  let calls=0;
  const {Files}=setup(async()=>{calls++;return {ok:false,status:413,json:async()=>{throw new Error('HTML error page');}};});
  const files=new Files({});files.limit=2;
  await assert.rejects(files.upload(new Blob(['large']),'test.pdf',{id:1},null,'key'),/files_too_large/);
  assert.equal(calls,0);files.limit=100;
  await assert.rejects(files.upload(new Blob(['small']),'test.pdf',{id:1},null,'key'),/files_too_large/);
});

test('date order is stable for simultaneous uploads without mutating the saved listing',()=>{
  const {Files}=setup();const entries=[{id:1,created_at:'2026-11-27 12:00:00'},{id:3,created_at:'2026-11-27 13:00:00'},{id:2,created_at:'2026-11-27 13:00:00'}];
  assert.equal(Files.sorted(entries).map(e=>e.id).join(','),'3,2,1');
  assert.equal(Files.sorted(entries,'oldest').map(e=>e.id).join(','),'1,2,3');
  assert.equal(entries.map(e=>e.id).join(','),'1,3,2');
});

test('book navigation reaches an odd final page and adapts to one page on a narrow display',()=>{
  const {Book}=setup();const reader=Object.create(Book.prototype);
  Object.assign(reader,{page:1,spread:true,viewport:{clientWidth:1000},pdf:{numPages:5},render:()=>Promise.resolve()});
  reader.turn(1);assert.equal(reader.page,3);reader.turn(1);assert.equal(reader.page,5);
  reader.turn(1);assert.equal(reader.page,5);reader.turn(-1);assert.equal(reader.page,3);
  reader.viewport.clientWidth=390;reader.turn(-1);assert.equal(reader.page,2);reader.turn(-1);assert.equal(reader.page,1);
});
