// Run against the isolated test database served by tests/.runtime/colors-server.py.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require(process.argv[2] || 'playwright');
const base='http://127.0.0.1:8785';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  let page,api; const created=[];
  try {
    const context=await browser.newContext({viewport:{width:1280,height:1100},hasTouch:true});
    page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let csrf=(await (await page.request.get(`${base}/api.php?action=bootstrap`)).json()).result.csrf;
    api=async(action,data)=>{
      const response=await page.request.post(`${base}/api.php?action=${action}`,{data,headers:{'X-CSRF-Token':csrf}});
      assert.equal(response.status(),200,await response.text());return (await response.json()).result;
    };
    csrf=(await api('login',{email:'aleinarossui@gmail.com',password:'Test-only-password-2026'})).csrf;
    await api('language',{language:'es'});
    const child=randomUUID();
    const nodes=[{id:'root',parent_id:null,text:'Mis ideas'},
      {id:child,parent_id:'root',text:'Proyecto principal'},
      ...Array.from({length:7},(_,i)=>({id:randomUUID(),parent_id:'root',text:`Idea ${i+2}`}))];
    const diagram=await api('saveDiagram',{client_key:randomUUID(),name:'Vista previa con gestos',nodes});created.push(diagram.id);
    const second=await api('saveDiagram',{client_key:randomUUID(),name:'Otra vista',nodes:[{id:'root',parent_id:null,text:'Otra idea'}]});created.push(second.id);
    await page.goto(`${base}/?diagram=${diagram.id}`);await page.locator('#diagram-node').waitFor();
    const mainBefore=await page.evaluate(()=>{
      const home=pageControllers.home;
      return {x:home.viewport.x,y:home.viewport.y,scale:home.viewport.scale,nodes:home.snapshot(),version:home.active.version};
    });
    const open=async()=>{
      await page.locator('#diagram-node').click();await page.locator('#diagram-more').click();
      await page.locator('#diagram-root [data-action="link-diagram-node"]').click();
      await page.locator('.diagram-link-preview.is-diagram-preview').waitFor();
    };
    const camera=()=>page.evaluate(()=>{const v=pageControllers.home.links.previewCamera;return{x:v.x,y:v.y,scale:v.scale};});
    await open();
    const preview=page.locator('.diagram-link-preview'),box=await preview.boundingBox();
    const point={x:box.x+box.width/2,y:box.y+box.height/2};
    const initial=await camera(),scroll=await page.locator('#modal').evaluate(el=>el.scrollTop);
    await page.mouse.move(point.x,point.y);await page.mouse.wheel(35,20);
    await page.waitForFunction(x=>pageControllers.home.links.previewCamera.x!==x,initial.x);
    const panned=await camera();
    assert.ok(Math.abs(panned.x-initial.x+35)<1 && Math.abs(panned.y-initial.y+20)<1);
    assert.equal(await page.locator('#modal').evaluate(el=>el.scrollTop),scroll,'trackpad pan stays inside the preview');
    const cdp=await context.newCDPSession(page);
    const wheel=deltaY=>cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY,modifiers:2});
    await wheel(-55);await page.waitForFunction(s=>pageControllers.home.links.previewCamera.scale>s,panned.scale);
    const zoomed=await camera();
    await wheel(30);await page.waitForFunction(s=>pageControllers.home.links.previewCamera.scale<s,zoomed.scale);
    assert.equal(await page.evaluate(()=>window.visualViewport.scale),1,'pinch zooms the diagram, not the browser page');
    assert.equal(await page.locator('[name="link-scope"]:checked').inputValue(),'whole','gestures do not choose a topic');
    await page.locator('[data-preview-zoom="fit"]').click();
    assert.ok(Math.abs((await camera()).scale-initial.scale)<.001);
    const finger=(id,x,y)=>({id,x,y,radiusX:3,radiusY:3,force:1});
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    const beforeTouch=await camera();
    await touch('touchStart',[finger(1,point.x-45,point.y),finger(2,point.x+45,point.y)]);
    await touch('touchMove',[finger(1,point.x-75,point.y+12),finger(2,point.x+75,point.y+12)]);
    const during=await camera();assert.ok(during.scale>beforeTouch.scale*1.4);
    await touch('touchEnd',[]);
    assert.deepEqual(await camera(),during,'lifting fingers does not cause another zoom');
    await preview.screenshot({path:'tests/.runtime/diagram-link-preview-gestures.png'});
    await page.locator('[data-preview-zoom="fit"]').click();
    const topic=preview.locator(`[data-link-target="${child}"]`);
    await topic.click();
    assert.equal(await page.locator('#diagram-link-node').inputValue(),child,'a normal click still selects a topic');
    await page.locator('#diagram-link-diagram').click();
    await page.locator('[data-link-expand="true"]').click();
    await page.locator(`[data-link-document="diagram:${second.id}"]`).click();
    assert.equal(await preview.locator('[data-link-target]').count(),1);
    await page.mouse.move(point.x,point.y);const switched=await camera();await page.mouse.wheel(-15,-10);
    await page.waitForFunction(x=>pageControllers.home.links.previewCamera.x!==x,switched.x);
    assert.ok(Math.abs((await camera()).x-switched.x-15)<1,'switching diagrams does not duplicate gesture handlers');
    await page.evaluate(()=>{window.testPreviewCamera=pageControllers.home.links.previewCamera;});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>pageControllers.home.links.previewCamera===null);
    assert.equal(await page.evaluate(()=>window.testPreviewCamera.stage),null,'closing detaches gesture handlers');
    const mainAfter=await page.evaluate(()=>{const h=pageControllers.home;return{x:h.viewport.x,y:h.viewport.y,scale:h.viewport.scale,nodes:h.snapshot(),version:h.active.version};});
    assert.deepEqual(mainAfter,mainBefore,'preview navigation never edits or moves the main diagram');
    await open();await preview.locator(`[data-link-target="${child}"]`).click();
    await page.locator('#diagram-link-form [type="submit"]').click();
    await page.waitForFunction(()=>!pageControllers.home.saving && !pageControllers.home.hasChanges());
    assert.equal(await page.evaluate(()=>pageControllers.home.savedNode().link.node_id),child);
    assert.deepEqual(errors,[]);
    console.log('Passed: two-axis trackpad pan, pinch in/out, touch pinch, stable gesture end, fit, topic selection, target switching, cleanup, main-camera isolation and link saving.');
  } finally {
    if(page && api) for(const id of created) {
      const current=(await (await page.request.get(`${base}/api.php?action=diagrams`)).json()).result.find(item=>item.id===id);
      if(current) await api('deleteDiagram',{id,version:current.version});
    }
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
