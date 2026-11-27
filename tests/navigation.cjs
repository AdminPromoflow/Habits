const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(url = 'http://localhost/?space=1&item=2&cell=B3') {
  const events = [], location = {href:url};
  const S = {view:'mindspaces',mode:'personal',filter:{routine:''}};
  const home = {reset(){events.push('reset');},mindspace:{enabled:()=>true,flush:async()=>true}};
  const context = vm.createContext({S,URL,location,pageControllers:{home},
    history:{replaceState(a,b,url){location.href=url;events.push('url');}},
    document:{body:{classList:{remove(){}}}},window:{scrollTo(){}},
    leaveSharedWorkspace(){S.sharedWorkspace=null;events.push('leave-shared');},
  });
  vm.runInContext(fs.readFileSync('view/layout/layout.js','utf8'),context);
  context.render=()=>events.push('render');
  return {context,S,home,location,events};
}

test('reload restores a space or document link and keeps Home separate from All main spaces',()=>{
  for (const query of ['?space=1&folder=0','?folder=2','?item=3&cell=B3','?diagram=4&topic=root','?view=mindspaces']) {
    assert.equal(fixture(`http://localhost/${query}`).context.initialPersonalView(),'mindspaces');
  }
  assert.equal(fixture('http://localhost/').context.initialPersonalView(),'home');
  assert.equal(fixture('http://localhost/?view=pendings').context.initialPersonalView(),'pendings');
});

test('Home waits for pending edits before clearing the document URL and editor',async()=>{
  const f=fixture(); let finish;
  f.home.mindspace.flush=()=>new Promise(resolve=>{finish=resolve;});
  const navigation=f.context.navigate('home');
  assert.equal(f.S.view,'mindspaces'); assert.deepEqual(f.events,[]);
  finish(true); await navigation;
  assert.equal(f.S.view,'home'); assert.equal(f.location.href,'http://localhost/');
  assert.deepEqual(f.events,['url','reset','render']);
  assert.equal(f.context.initialPersonalView(),'home');
});

test('a failed save keeps the current document and URL for every navigation destination',async()=>{
  for (const destination of ['home','mindspaces','calendar','pendings']) {
    const f=fixture(), original=f.location.href;
    f.home.mindspace.flush=async()=>false;
    await f.context.navigate(destination);
    assert.equal(f.S.view,'mindspaces'); assert.equal(f.location.href,original);
    assert.deepEqual(f.events,[]);
  }
});

test('Pendings remains selected after navigation and reload',async()=>{
  const f=fixture();await f.context.navigate('pendings');
  assert.equal(f.S.view,'pendings');assert.equal(f.location.href,'http://localhost/?view=pendings');
  assert.equal(f.context.initialPersonalView(),'pendings');
});

test('entering My Day Today selects all categories and starts the category strip at the left',async()=>{
  const f=fixture();f.context.today=()=> '2026-11-26';
  f.S.plannerHiddenCategories=['1','2'];f.S.plannerCategoryScroll=400;
  await f.context.navigate('calendar');
  assert.equal(f.S.view,'calendar');assert.equal(f.S.plannerHiddenCategories.length,0);
  assert.equal(f.S.plannerCategoryScroll,0);assert.equal(f.S.plannerPage,0);
});

test('All main spaces returns to the directory and persists the directory on reload',async()=>{
  const f=fixture(); await f.context.navigate('mindspaces');
  assert.equal(f.location.href,'http://localhost/?view=mindspaces');
  assert.equal(f.context.hasMindSpaceTarget(),false);
  assert.equal(f.context.initialPersonalView(),'mindspaces');
});

test('returning Home from a shared workspace saves before restoring the private catalog',async()=>{
  const f=fixture('http://localhost/?shared=8&item=2');
  f.S.view='sharing'; f.S.sharedWorkspace={id:8};
  f.context.leaveSharedWorkspace=()=>{f.S.sharedWorkspace=null;f.location.href='http://localhost/?item=5';f.events.push('leave-shared');};
  f.home.mindspace.flush=async()=>{f.events.push('save');return true;};
  await f.context.navigate('home');
  assert.deepEqual(f.events,['save','leave-shared','url','reset','render']);
  assert.equal(f.location.href,'http://localhost/'); assert.equal(f.S.view,'home');
});
