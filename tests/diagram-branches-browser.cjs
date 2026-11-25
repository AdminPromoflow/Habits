// Run against tests/.runtime/colors-server.py (isolated test DB), with a Playwright module path.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {chromium} = require(process.argv[2] || 'playwright');
const base = 'http://127.0.0.1:8785';

(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  let diagram, api, page;
  try {
    const context = await browser.newContext({viewport:{width:1280,height:950},hasTouch:true});
    page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    let csrf = (await (await page.request.get(`${base}/api.php?action=bootstrap`)).json()).result.csrf;
    api = async (action,body) => {
      const response = await page.request.post(`${base}/api.php?action=${action}`,{data:body,headers:{'X-CSRF-Token':csrf}});
      assert.equal(response.status(),200,await response.text());
      return (await response.json()).result;
    };
    csrf = (await api('login',{email:'aleinarossui@gmail.com',password:'Test-only-password-2026'})).csrf;
    await api('language',{language:'es'});
    const [a,child,grandchild,b,other] = Array.from({length:5},()=>randomUUID());
    const nodes = [{id:'root',parent_id:null,text:'Mis ideas'},
      {id:a,parent_id:'root',text:'Proyectos'}, {id:child,parent_id:a,text:'Próximos pasos'},
      {id:grandchild,parent_id:child,text:'Primera tarea'}, {id:b,parent_id:'root',text:'Bienestar'},
      {id:other,parent_id:null,text:'Otra idea'}];
    diagram = await api('saveDiagram',{client_key:randomUUID(),name:'Prueba de ramas',nodes,
      color_theme:'rainbow',connections:[{from:grandchild,to:b}]});
    await page.goto(`${base}/?diagram=${diagram.id}`);
    const node = id=>page.locator(`#diagram-node${id==='root'?'':`-${id}`}`);
    const toggle = id=>page.locator(`#diagram-branch${id==='root'?'':`-${id}`}`);
    const visible = ()=>page.locator('.diagram-node').count();
    const snapshot = ()=>page.evaluate(()=>JSON.stringify(pageControllers.home.snapshot()));
    const saved = async ()=>(await (await page.request.get(`${base}/api.php?action=diagrams`)).json()).result.find(item=>item.id===diagram.id);
    await node('root').waitFor();
    assert.equal(await page.locator('.diagram-branch-toggle').count(),3,'only parents have arrows');
    assert.equal(await toggle(a).getAttribute('aria-expanded'),'true');
    assert.equal(await toggle(a).isVisible(),true,'arrow is visible before selecting a node');
    const original = await snapshot();
    const version = (await saved()).version;
    await page.evaluate(id=>pageControllers.home.viewport.focusElement(document.getElementById(`diagram-node-${id}`)),a);
    const before = await node(a).boundingBox();
    const scale = await page.evaluate(()=>pageControllers.home.viewport.scale);
    await toggle(a).click();
    assert.equal(await toggle(a).getAttribute('aria-expanded'),'false');
    assert.equal(await visible(),4);
    assert.equal(await node(child).count(),0);
    assert.equal(await page.locator(`.diagram-connection[data-from="${grandchild}"],.diagram-connection[data-to="${grandchild}"]`).count(),0);
    assert.equal(await node(b).isVisible(),true);
    assert.equal(await snapshot(),original);
    const after = await node(a).boundingBox();
    assert.ok(Math.abs(before.x-after.x)<1 && Math.abs(before.y-after.y)<1,'folding keeps the clicked node in place');
    assert.equal(await page.evaluate(()=>pageControllers.home.viewport.scale),scale);
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-branch-collapsed.png'});
    await page.reload(); await node(a).waitFor();
    assert.equal(await toggle(a).getAttribute('aria-expanded'),'false','folded view survives reload');
    assert.equal(await visible(),4);
    await toggle(a).focus(); await page.keyboard.press('Space');
    assert.equal(await visible(),6);
    assert.equal(await toggle(a).getAttribute('aria-expanded'),'true');
    assert.equal(await page.evaluate(()=>pageControllers.home.editing),false,'keyboard toggles do not start text editing');
    await toggle(child).click(); await toggle(a).click(); await toggle(a).click();
    assert.equal(await visible(),6,'expanding a parent opens its whole branch');
    assert.equal(await toggle(child).getAttribute('aria-expanded'),'true');
    assert.equal((await saved()).version,version,'folding never writes document changes');
    await toggle(a).click();
    await page.evaluate(id=>pageControllers.home.links.focus(id),grandchild);
    assert.equal(await node(grandchild).isVisible(),true,'links reveal hidden targets');
    await toggle('root').click();
    assert.equal(await visible(),2,'independent roots stay visible');
    await toggle('root').focus(); await page.keyboard.press('Enter');
    assert.equal(await visible(),6);
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-branch-expanded.png'});
    await toggle(a).click();
    await page.locator(`#diagram-root-${a} [data-action="add-diagram-child"]`).click();
    assert.equal(await toggle(a).getAttribute('aria-expanded'),'true','adding a child expands its parent');
    await page.locator('.diagram-root.is-editing textarea').fill('Nueva idea visible');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!pageControllers.home.saving && !pageControllers.home.hasChanges());
    assert.equal((await saved()).nodes.length,7,'hidden descendants remain stored when adding a child');
    await page.setViewportSize({width:390,height:844});
    await page.reload(); await node('root').waitFor();
    await page.evaluate(()=>pageControllers.home.viewport.focusElement(document.getElementById('diagram-node')));
    await toggle('root').tap();
    assert.equal(await visible(),2);
    assert.equal(await toggle('root').getAttribute('aria-expanded'),'false');
    await page.locator('#mindmap-stage').screenshot({path:'tests/.runtime/diagram-branch-mobile.png'});
    await toggle('root').tap();
    assert.equal(await visible(),7);
    assert.deepEqual(errors,[]);
    console.log('Passed: parent-only arrows, nested folding, connections, stable camera, persistence, keyboard, links, child creation and mobile taps.');
  } finally {
    if (diagram && page && api) {
      const current = (await (await page.request.get(`${base}/api.php?action=diagrams`)).json()).result.find(item=>item.id===diagram.id);
      if (current) await api('deleteDiagram',{id:diagram.id,version:current.version});
    }
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
