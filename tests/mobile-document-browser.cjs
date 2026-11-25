// Run with: node tests/mobile-document-browser.cjs /path/to/node_modules/playwright
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.argv[2] || 'playwright');

const template = (file, name, values) => fs.readFileSync(file,'utf8')
  .match(new RegExp(`<template id="view-${name}">([\\s\\S]*?)</template>`))[1]
  .replace(/\{\{(\w+)\}\}/g, (_,key) => values[key] || '');
const styles = [...fs.readFileSync('controller/config/assets.php','utf8').matchAll(/'([^']+\.css)'/g)]
  .map(match => fs.readFileSync(match[1],'utf8')).join('\n');
const node = template('view/home/home.php','diagram-node', {name:'Mi próxima idea',nodeKey:'root',width:'220'});
const contents = {
  diagram:template('view/mindspace/mindspace.php','mindspace-diagram', {content:node,diagramLabel:'Diagrama'}),
  spreadsheet:`<div class="ms-sheet"><div class="ms-formula-bar"><span>A1</span><input aria-label="Fórmula" value="Mi presupuesto"></div><div class="ms-sheet-scroll"><table><thead><tr><th></th>${['A','B','C','D','E'].map(col=>`<th>${col}</th>`).join('')}</tr></thead><tbody>${Array.from({length:25},(_,i)=>`<tr><th>${i+1}</th>${Array.from({length:5},(_,j)=>`<td><input aria-label="${String.fromCharCode(65+j)}${i+1}" value="${i===0 ? ['Fecha','Descripción','Entrada','Salida','Saldo'][j] : j===1 ? 'Mi proyecto' : ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="ms-sheet-settings"><button>Ajustes</button></div></div>`,
  notes:'<div class="ms-notes"><textarea aria-label="Notas">Una idea para mañana</textarea></div>',
  scrum:'<div class="ms-board-editor"><div class="ms-board"><section class="ms-column"><h3>Pendiente</h3><button class="ms-add-card">Añadir tarjeta</button></section><section class="ms-column"><h3>En curso</h3></section><section class="ms-column"><h3>Listo</h3></section></div></div>',
  habits:'<div class="ms-habits"><div class="ms-editor-toolbar"><button>Añadir hábito</button></div><div class="ms-habit"><button role="checkbox">✓</button>Leer cada día</div></div>',
  folder:'<div class="mindspace-directory"><button class="ms-file">Mis documentos</button></div>',
};
const markup = (kind, key=kind) => template('view/layout/layout.php','layout', {
  brandIcon:'✳',brandCaption:'Mi espacio',navigation:'<button>Inicio</button>',pageTitle:'MindSpace',
  content:template('view/mindspace/mindspace.php','mindspace', {
    spaceHeading:'<h1>Mi espacio</h1>',spaceName:'Mi espacio',intro:'Documentos e ideas',
    tabs:'<button role="tab">Mi documento</button>',name:'Mi documento',itemHeading:'<h2>Mi documento</h2>',
    path:'Mis documentos',content:contents[kind],documentKey:kind==='folder'?'':key,documentKind:kind,
    download:'<footer class="mindspace-item-footer"><button>Descargar PDF</button></footer>',
  }),
});

(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page = await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style><div id="app"></div><dialog id="modal"><button>Guardar</button></dialog>`);
    await page.addScriptTag({content:`window.t=key=>({ms_exit_fullscreen:'Salir de pantalla completa',ms_enter_fullscreen:'Ver documento en pantalla completa'}[key]||key);window.icon=()=>'<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2"/></svg>';`});
    await page.addScriptTag({path:'view/layout/mobile-document.js'});
    await page.addScriptTag({path:'view/home/diagram-viewport.js'});
    const open=async(kind,key=kind)=>{
      await page.evaluate(html=>{document.getElementById('app').innerHTML=html;mobileDocumentView.sync();},markup(kind,key));
    };
    const frame=()=>page.locator('#mindspace-panel').boundingBox();
    for(const kind of ['diagram','spreadsheet','notes','scrum','habits']) {
      await open(kind);
      assert.deepEqual(await frame(),{x:0,y:0,width:390,height:844},`${kind} fills the viewport`);
      for(const selector of ['.topbar','.sidebar','.workspace-footer','.home-heading','.mindspace-tabbar','.mindspace-item-header','.mindspace-item-footer']) {
        assert.equal(await page.locator(selector).isVisible(),false,`${kind}: ${selector} is hidden`);
      }
      const close = page.getByRole('button',{name:'Salir de pantalla completa'});
      assert.equal(await close.isVisible(),true);
      const box=await close.boundingBox();assert.ok(box.x>=330 && box.y<=12 && box.width>=44);
      if(kind==='spreadsheet' || kind==='notes') {
        const input=page.locator('#mindspace-panel input, #mindspace-panel textarea').first();
        await input.fill('Edición pendiente');
        await input.evaluate(el=>window.originalInput=el);
        await close.click();
        assert.equal(await input.inputValue(),'Edición pendiente');
        assert.equal(await input.evaluate(el=>el===window.originalInput),true,'exit preserves the editor DOM');
        assert.equal(await page.locator('.topbar').isVisible(),true);
        await page.evaluate(()=>mobileDocumentView.sync());
        assert.equal(await page.locator('.topbar').isVisible(),true,'refresh does not undo an explicit exit');
        await page.getByRole('button',{name:'Ver documento en pantalla completa'}).click();
        assert.equal(await input.inputValue(),'Edición pendiente');
      }
      await page.evaluate(()=>document.getElementById('modal').showModal());
      assert.equal(await page.getByRole('button',{name:'Guardar',exact:true}).isVisible(),true);
      await page.evaluate(()=>document.getElementById('modal').close());
      if(['diagram','spreadsheet'].includes(kind)) await page.screenshot({path:`tests/.runtime/mobile-fullscreen-${kind}.png`});
    }
    await open('notes');
    await page.setViewportSize({width:844,height:390});
    await page.waitForFunction(()=>document.getElementById('mindspace-panel').getBoundingClientRect().height===390);
    assert.deepEqual(await frame(),{x:0,y:0,width:844,height:390},'landscape remains full screen');
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.getElementById('mindspace-panel').getBoundingClientRect().height===844);
    await page.evaluate(()=>{
      window.originalViewport = Object.getOwnPropertyDescriptor(window,'visualViewport');
      const viewport=new EventTarget();Object.assign(viewport,{height:410,offsetTop:25,scale:1});
      Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
      mobileDocumentView.size();
    });
    assert.deepEqual(await frame(),{x:0,y:25,width:390,height:410},'virtual keyboard leaves the document and exit reachable');
    await page.evaluate(()=>{Object.defineProperty(window,'visualViewport',window.originalViewport);mobileDocumentView.size();});
    await open('folder');
    assert.equal(await page.locator('.topbar').isVisible(),true);
    assert.equal(await page.locator('.mobile-document-toggle').isVisible(),false);
    await page.setViewportSize({width:1280,height:800});
    await open('notes');
    assert.equal(await page.locator('.topbar').isVisible(),true);
    assert.equal(await page.locator('.mobile-document-toggle').isVisible(),false);
    await page.setViewportSize({width:390,height:844});
    await open('diagram');
    await page.evaluate(()=>{
      const stage=document.getElementById('mindmap-stage'),root=document.getElementById('diagram-root');
      stage.classList.add('has-diagram');window.camera=new DiagramViewport();
      camera.mount(stage,root,{anchorX:110,anchorY:24});
    });
    // Real Chromium touch events exercise the pointer/touch interaction, not synthetic mouse zoom.
    const cdp=await context.newCDPSession(page);
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
    await touch('touchStart',[[1,120,250]]);
    await touch('touchStart',[[1,120,250],[2,260,250]]);
    await touch('touchMove',[[1,70,270],[2,310,270]]);
    const before=await page.evaluate(()=>[camera.x,camera.y,camera.scale]);
    assert.ok(before[2]>1.5,'two fingers zoom the diagram');
    await touch('touchEnd',[[1,70,270]]);
    await touch('touchMove',[[1,80,275]]);
    await touch('touchEnd',[]);
    assert.deepEqual(await page.evaluate(()=>[camera.x,camera.y,camera.scale]),before,'lifting fingers does not jump');
    assert.equal(await page.evaluate(()=>window.visualViewport.scale),1,'the page itself is not zoomed');
    assert.deepEqual(errors,[]);
    console.log('Passed: mobile documents, exit/re-entry, desktop, landscape, keyboard geometry, dialogs and two-finger zoom.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
