const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({existing = false, editable = true} = {}) {
  const nodes = new Map(), requests = [], listeners = {};
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {hidden:true,disabled:false,value:'',handlers:{},
      addEventListener(type, fn){this.handlers[type]=fn;},removeAttribute(name){delete this[name];},async play(){}});
    return nodes.get(key);
  };
  const form = {isConnected:true,querySelector:node,querySelectorAll:()=>[node('button')],
    addEventListener(type,fn){listeners[type]=fn;}};
  const modalListeners = {};
  const modal = {querySelectorAll:()=>[node('close')],addEventListener(type,fn){(modalListeners[type] ||= []).push(fn);},removeEventListener(){}};
  const space = {active:{id:7,kind:'spreadsheet',version:3},generation:1,can:()=>editable,
    draft:{template:'ledger',invoice_column:'G',rows:3,columns:7,cells:{B2:'Supplies'},...(existing?{invoices:{G2:{name:'old.png'}}}:{})},
    flush:async()=>true,upsert(item){this.stored=item;},
    submit(form,fn){space.pending=fn().catch(error=>{node('.form-error').textContent=error.message;});},
    home:{async makeRequest(action,body,params){requests.push({action,body,params});
      if(action==='getSpreadsheetInvoice') return {image:'data:image/png;base64,old',name:'old.png'};
      if(space.fail) throw Error('Offline');
      return {id:7,kind:'spreadsheet',version:4,content:{...space.draft,invoices:{G2:{name:body.name}}}};
    }}};
  const context = vm.createContext({document:{getElementById:id=>id==='modal'?modal:form},t:key=>key,esc:String,icon:()=>'',formFooter:()=>'',
    MutationObserver:class{observe(){}disconnect(){}},window:{matchMedia:()=>({matches:false})},navigator:{mediaDevices:{}},
    openModal(title,html){context.html=html;},closeModal(){form.isConnected=false;modalListeners.close?.forEach(fn=>fn());}});
  vm.runInContext(fs.readFileSync('view/mindspace/sheet.js','utf8'),context);
  const Invoice = vm.runInContext(fs.readFileSync('view/mindspace/invoices.js','utf8')+'\nMindSpaceInvoice;',context);
  Invoice.encode=async()=> 'data:image/jpeg;base64,new';
  const editor={space,refresh(){editor.refreshed=true;}};
  return {Invoice,space,editor,context,form,node,listeners,requests,modalListeners};
}

test('a photo selection stays local until save, failures retain it for retry, and success advances the sheet version',async()=>{
  const f=fixture();await f.Invoice.open(f.editor,'G2');
  assert.match(f.context.html,/capture="environment"/);assert.match(f.context.html,/data-invoice-camera/);
  const input=f.node('[data-invoice-file]');input.files=[{name:'Receipt.png'}];
  input.handlers.change({target:input});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.requests.length,0);assert.equal(f.node('[data-invoice-preview]').src,'data:image/jpeg;base64,new');
  f.space.fail=true;f.listeners.submit({preventDefault(){}});await f.space.pending;
  assert.equal(f.node('.form-error').textContent,'Offline');assert.equal(f.form.isConnected,true);
  assert.equal(f.space.active.version,3);assert.equal(f.node('close').disabled,false);
  f.space.fail=false;f.listeners.submit({preventDefault(){}});await f.space.pending;
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests.at(-1).body)),{id:7,version:3,cell:'G2',image:'data:image/jpeg;base64,new',name:'Receipt.jpg'});
  assert.equal(f.space.active.version,4);assert.equal(f.space.baseline,JSON.stringify(f.space.draft));assert.equal(f.editor.refreshed,true);
});

test('viewers can read an existing invoice but cannot upload or open an empty cell',async()=>{
  const f=fixture({existing:true,editable:false});await f.Invoice.open(f.editor,'G2');
  assert.doesNotMatch(f.context.html,/data-invoice-upload|data-invoice-camera|type="file"/);
  assert.equal(f.requests[0].action,'getSpreadsheetInvoice');assert.equal(f.requests[0].body,null);
  assert.equal(f.requests[0].params.cell,'G2');assert.equal(f.node('[data-invoice-preview]').src,'data:image/png;base64,old');
  const empty=fixture({editable:false});await empty.Invoice.open(empty.editor,'G2');assert.equal(empty.context.html,undefined);
});

test('switching documents while a selected photo is processing cannot attach it to the next sheet',async()=>{
  const f=fixture();await f.Invoice.open(f.editor,'G2');let resolve;
  f.Invoice.encode=()=>new Promise(done=>resolve=done);
  const input=f.node('[data-invoice-file]');input.files=[{name:'Receipt.png'}];input.handlers.change({target:input});
  f.space.generation++;f.space.active.id=8;resolve('data:image/jpeg;base64,new');await new Promise(done=>setImmediate(done));
  assert.equal(f.requests.length,0);assert.equal(f.node('[data-invoice-preview]').src,undefined);
});

test('closing during camera permission releases a late stream and never saves a photo',async()=>{
  const f=fixture();await f.Invoice.open(f.editor,'G2');let resolve,stopped=0;
  f.context.navigator.mediaDevices.getUserMedia=()=>new Promise(done=>resolve=done);
  const pending=f.node('[data-invoice-camera]').handlers.click();
  f.context.closeModal();resolve({getTracks:()=>[{stop(){stopped++;}}]});await pending;
  assert.equal(stopped,1);assert.equal(f.requests.length,0);
});
