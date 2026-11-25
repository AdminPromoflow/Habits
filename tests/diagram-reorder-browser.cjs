// Uses only the isolated database served by tests/.runtime/colors-server.py.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require(process.argv[2] || 'playwright');
const base='http://127.0.0.1:8785';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const created=[];
  let page,api;
  try {
    const context=await browser.newContext({viewport:{width:1600,height:1100},hasTouch:true});
    page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    let csrf=(await (await page.request.get(`${base}/api.php?action=bootstrap`)).json()).result.csrf;
    api=async(action,data)=>{
      const response=await page.request.post(`${base}/api.php?action=${action}`,{data,headers:{'X-CSRF-Token':csrf}});
      assert.equal(response.status(),200,await response.text()); return (await response.json()).result;
    };
    csrf=(await api('login',{email:'aleinarossui@gmail.com',password:'Test-only-password-2026'})).csrf;
    const [a,b,c,d,child,leaf,dChild]=Array.from({length:7},()=>randomUUID());
    const nodes=[{id:'root',parent_id:null,text:'Mis ideas',layout:{mode:'horizontal',direction:'right'}},
      ...[a,b,c,d].map((id,index)=>({id,parent_id:'root',text:`Hermano ${index+1}`})),
      {id:child,parent_id:a,text:'Hijo que cambia de padre'}, {id:leaf,parent_id:child,text:'Su descendiente'},
      {id:dChild,parent_id:d,text:'Hijo del hermano 4'}];
    const diagram=await api('saveDiagram',{client_key:randomUUID(),name:'Prueba de ordenar',nodes,color_theme:'rainbow',
      connections:[{from:child,to:d}],connection_styles:[{from:a,to:child,label:'Anterior',arrows:'end'}]});
    created.push(diagram.id);
    const node=id=>page.locator(`#diagram-node${id==='root'?'':`-${id}`}`);
    const settled=()=>page.waitForFunction(()=>!pageControllers.home.saving && !pageControllers.home.hasChanges());
    const overview=()=>page.evaluate(()=>pageControllers.home.viewport.focusElement(document.getElementById('diagram-scene'),{overview:true}));
    const state=()=>page.evaluate(()=>({nodes:pageControllers.home.snapshot(),version:pageControllers.home.active.version}));
    const rootOrder=data=>data.nodes.filter(n=>n.parent_id==='root').map(n=>n.id).join(',');
    const center=async id=>{const box=await node(id).boundingBox();return{x:box.x+box.width/2,y:box.y+box.height/2};};
    const start=async id=>{await node(id).click();const point=await center(id);await page.mouse.move(point.x,point.y);await page.mouse.down();};
    const finish=async()=>{await page.mouse.up();await settled();};
    await page.goto(`${base}/?diagram=${diagram.id}`); await node('root').waitFor(); await overview();
    const original=await state();
    const second=await node(b).boundingBox(),third=await node(c).boundingBox();
    await start(d); await page.mouse.move(second.x+second.width/2,(second.y+second.height+third.y)/2,{steps:8});
    assert.equal(await page.locator('.diagram-reorder-guide.is-active').count(),1);
    assert.equal(await page.locator('.diagram-spacing-guide,#diagram-alignment-guides > line').count(),0);
    assert.deepEqual((await state()).nodes,original.nodes,'preset drag previews never change coordinates');
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-reorder-insertion.png'});
    await finish();
    assert.equal(rootOrder(await state()),[a,b,d,c].join(','));
    assert.ok((await state()).nodes.every(n=>n.x===null && n.y===null));
    await page.reload(); await node('root').waitFor(); await overview();
    assert.equal(rootOrder(await state()),[a,b,d,c].join(','),'sibling order survives reload');
    const reparent=async()=>{
      await overview();
      const target=await center(d);
      await start(child); await page.mouse.move(target.x,target.y,{steps:8});
      assert.equal(await node(d).evaluate(el=>el.classList.contains('is-drop-parent')),true);
      assert.equal(await page.locator('.diagram-spacing-guide,#diagram-alignment-guides > line').count(),0);
      await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-reorder-parent.png'});
      await finish();
    };
    await page.locator(`#diagram-branch-${d}`).click();
    await reparent();
    assert.equal((await state()).nodes.find(n=>n.id===child).parent_id,d);
    assert.equal((await state()).nodes.find(n=>n.id===leaf).parent_id,child);
    assert.equal(await page.locator(`#diagram-branch-${d}`).getAttribute('aria-expanded'),'true','destination opens to reveal the moved branch');
    assert.equal(await page.evaluate(()=>pageControllers.home.connections.length),0,'new parent link replaces the former extra connection');
    await page.keyboard.press('Control+z'); await settled();
    assert.equal((await state()).nodes.find(n=>n.id===child).parent_id,a,'undo restores its previous parent');
    assert.equal(await page.evaluate(()=>pageControllers.home.connections.length),1);
    await reparent();
    await page.reload(); await node('root').waitFor(); await overview();
    assert.equal((await state()).nodes.find(n=>n.id===child).parent_id,d,'new parent survives reload');
    const unchanged=await state();
    const stage=await page.locator('#mindmap-stage').boundingBox();
    await start(b); await page.mouse.move(stage.x+8,stage.y+8,{steps:6}); await finish();
    assert.deepEqual(await state(),unchanged,'dropping on empty canvas makes no edit');
    const target=await center(c);
    await start(b); await page.mouse.move(target.x,target.y,{steps:6}); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await state(),unchanged,'Escape cancels a pending parent change');

    const peer=randomUUID();
    const free=await api('saveDiagram',{client_key:randomUUID(),name:'Prueba libre',nodes:[
      {id:'root',parent_id:null,text:'Libre',layout:{mode:'free'},x:0,y:0},
      {id:peer,parent_id:null,text:'Referencia',layout:{mode:'free'},x:400,y:200}]});
    created.push(free.id);
    await page.goto(`${base}/?diagram=${free.id}`); await node('root').waitFor(); await overview();
    const scale=await page.evaluate(()=>pageControllers.home.viewport.scale),origin=await center('root');
    await start('root'); await page.mouse.move(origin.x+40*scale,origin.y+200*scale,{steps:8});
    assert.ok(await page.locator('#diagram-alignment-guides > line').count()>0,'free form retains red alignment guides');
    assert.equal(await page.locator('.diagram-reorder-guide').count(),0);
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-reorder-free.png'});
    await finish();
    const moved=(await state()).nodes.find(n=>n.id==='root');
    assert.ok(Math.abs(moved.x-40)<1 && Math.abs(moved.y-200)<1);
    assert.deepEqual(errors,[]);
    console.log('Passed: sibling order, parent changes with descendants, unchanged coordinates, reload, undo, cancel, hidden destination, connector cleanup and free-form guides.');
  } finally {
    if(api && page) for(const id of created) {
      const current=(await (await page.request.get(`${base}/api.php?action=diagrams`)).json()).result.find(item=>item.id===id);
      if(current) await api('deleteDiagram',{id,version:current.version});
    }
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
