// Run against tests/.runtime/colors-server.py (isolated test DB), with a Playwright module path.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require(process.argv[2] || 'playwright');
const base='http://127.0.0.1:8785';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:950},hasTouch:true});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let csrf=(await (await page.request.get(`${base}/api.php?action=bootstrap`)).json()).result.csrf;
    const api=async(action,body)=>{
      const response=await page.request.post(`${base}/api.php?action=${action}`,{data:body,headers:{'X-CSRF-Token':csrf}});
      assert.equal(response.status(),200,await response.text());return (await response.json()).result;
    };
    csrf=(await api('login',{email:'aleinarossui@gmail.com',password:'Test-only-password-2026'})).csrf;
    await api('language',{language:'es'});
    const nodes=[{id:'root',parent_id:null,text:'Mis ideas'}];
    for(const text of ['Trabajo','Familia','Bienestar','Relaciones','Proyectos','Aprender','Organización']) {
      const id=randomUUID();nodes.push({id,parent_id:'root',text});
      if(text==='Trabajo' || text==='Familia') nodes.push({id:randomUUID(),parent_id:id,text:'Próximo paso'});
    }
    const diagram=await api('saveDiagram',{client_key:randomUUID(),name:'Prueba de colores',nodes});
    await page.goto(`${base}/?diagram=${diagram.id}`);
    await page.locator('#diagram-node').click();
    const open=async()=>{
      await page.locator('#diagram-node').click();
      await page.locator('#diagram-root [data-action="diagram-colors"]').click();
      await page.locator('.diagram-colors-dialog').waitFor();
    };
    const settled=()=>page.waitForFunction(()=>!pageControllers.home.saving && !pageControllers.home.hasChanges());
    await open();
    assert.equal(await page.locator('[data-color-theme]').count(),8);
    assert.equal(await page.locator('.diagram-colors-dialog input[type=color]').count(),2);
    await page.locator('[data-color-theme=rainbow]').click();
    assert.equal(await page.evaluate(()=>pageControllers.home.colorTheme),null,'preview leaves the document unchanged');
    await page.locator('.diagram-colors-dialog').screenshot({path:'tests/.runtime/diagram-colors-dialog-desktop.png'});
    await page.locator('[data-colors-apply]').click();await settled();
    assert.equal(await page.locator('#mindmap-stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 253, 245)');
    assert.equal(await page.locator('#diagram-node').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 220, 240)');
    await page.reload();await page.locator('#diagram-node').waitFor();
    assert.equal(await page.evaluate(()=>pageControllers.home.colorTheme),'rainbow');
    const colors=await page.locator('.diagram-node').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));
    assert.ok(new Set(colors).size>=7);
    await page.evaluate(()=>pageControllers.home.viewport.focusElement(document.getElementById('diagram-scene'),{overview:true}));
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-colors-rainbow.png'});
    await open();
    const custom=async(field,color)=>page.locator(`[data-custom-color=${field}]`).evaluate((input,color)=>{input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));},color);
    await custom('diagram','#245e9a');await custom('canvas','#edf6ff');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>pageControllers.home.diagramColor),null,'cancel discards custom colors');
    await open();await custom('diagram','#245e9a');await custom('canvas','#edf6ff');
    await page.locator('[data-colors-apply]').click();await settled();
    assert.equal(await page.locator('#diagram-node textarea').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
    await page.reload();await page.locator('#diagram-node').waitFor();
    assert.equal(await page.evaluate(()=>pageControllers.home.diagramColor),'#245e9a');
    assert.equal(await page.evaluate(()=>pageControllers.home.canvasColor),'#edf6ff');
    await open();await page.locator('[data-color-theme=pastel]').click();
    await page.locator('[data-colors-apply]').click();await settled();
    await page.keyboard.press('Control+z');await settled();
    assert.equal(await page.evaluate(()=>pageControllers.home.diagramColor),'#245e9a','undo restores both custom colors');
    await page.evaluate(async()=>{
      await MindSpacePDF.libraries(true);const render=window.html2canvas;
      window.html2canvas=async(host,options)=>{
        window.exportColors={background:getComputedStyle(host).backgroundColor,nodes:[...host.querySelectorAll('.diagram-node')].map(el=>getComputedStyle(el).backgroundColor)};
        return render(host,options);
      };
    });
    const download=page.waitForEvent('download');
    assert.equal(await page.locator('.topbar').isVisible(),true,'documents open in normal view');
    await page.locator('[data-action=ms-download-pdf]').click();
    await (await download).saveAs('tests/.runtime/diagram-colors-export.pdf');
    const exported=await page.evaluate(()=>window.exportColors);
    assert.equal(exported.background,'rgb(237, 246, 255)');
    assert.ok(exported.nodes.every(color=>color==='rgb(36, 94, 154)'));
    await page.setViewportSize({width:390,height:844});
    await page.reload();await page.locator('#diagram-node').waitFor();
    await open();
    const bounds=await page.locator('.diagram-colors-dialog').boundingBox();
    assert.ok(bounds.x>=0 && bounds.width<=390 && bounds.height<=844);
    const footer=await page.locator('.diagram-colors-dialog .diagram-layout-footer').boundingBox();
    for(const field of ['diagram','canvas']) {
      const control=await page.locator(`[data-custom-color=${field}]`).boundingBox();
      assert.ok(control.y+control.height<footer.y,'both color controls are visible above the footer on mobile');
    }
    await page.locator('[data-color-theme=rainbow]').click();
    await page.locator('.diagram-colors-dialog').screenshot({path:'tests/.runtime/diagram-colors-dialog-mobile.png'});
    await page.locator('[data-colors-apply]').click();await settled();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('mobile-document-fullscreen')),false);
    assert.deepEqual(errors,[]);
    const current=await (await page.request.get(`${base}/api.php?action=diagrams`)).json();
    const saved=current.result.find(item=>item.id===diagram.id);
    await api('deleteDiagram',{id:diagram.id,version:saved.version});
    console.log('Passed: palette previews, cancel/apply, both custom colors, reload, undo, PDF colors and mobile dialog.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
