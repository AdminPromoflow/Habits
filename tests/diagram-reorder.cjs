const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('view/home/diagram-layout.js','utf8'),context);
const reorder = vm.runInContext(fs.readFileSync('view/home/diagram-reorder.js','utf8')+'\nDiagramReorder;',context);
const layout = vm.runInContext('DiagramLayout',context);
const tree = mode => [{id:'root',parent_id:null,text:'Root',layout:{mode}},
  ...['a','b','c','d'].map(id=>({id,parent_id:'root',text:id})),
  {id:'child',parent_id:'a',text:'Child',image:'image',labels:[{text:'tag'}]},
  {id:'leaf',parent_id:'child',text:'Leaf'}];

test('every preset reorders sibling branches and preserves their complete content', () => {
  for (const mode of ['horizontal','vertical','list','topdown','linear','radial','matrix']) {
    const nodes = tree(mode), plan = layout.arrange(nodes);
    const choices = reorder.slots(nodes,plan,'d');
    const slot = choices.find(item=>item.index===2);
    assert.ok(slot,mode);
    assert.equal(reorder.target(choices,{x:(slot.x1+slot.x2)/2,y:(slot.y1+slot.y2)/2}).index,2,mode);
    const moved = reorder.apply(nodes,'d',2);
    assert.equal(moved.filter(node=>node.parent_id==='root').map(node=>node.id).join(','),'a,b,d,c',mode);
    assert.equal(moved.find(node=>node.id==='child').parent_id,'a');
    assert.equal(moved.find(node=>node.id==='leaf').parent_id,'child');
    assert.equal(moved.find(node=>node.id==='child').image,'image');
    assert.ok(moved.filter(node=>node.id!=='root').every(node=>node.x===null && node.y===null));
    assert.equal(layout.arrange(moved).nodes.length,nodes.length);
  }
});

test('dropping a child over sibling four reparents its entire branch and keeps sibling order', () => {
  const nodes = tree('horizontal'), plan = layout.arrange(nodes);
  const target = plan.nodes.find(node=>node.id==='d');
  const drop = reorder.dropTarget(nodes,plan,'child',{
    x:target.x-plan.origin.x+target.width/2,y:target.y-plan.origin.y+target.height/2});
  assert.equal(drop.kind,'parent'); assert.equal(drop.parentId,'d');
  const moved = reorder.apply(nodes,'child',drop.index,drop.parentId);
  assert.equal(moved.find(node=>node.id==='child').parent_id,'d');
  assert.equal(moved.find(node=>node.id==='leaf').parent_id,'child');
  assert.equal(moved.filter(node=>node.parent_id==='root').map(node=>node.id).join(','),'a,b,c,d');
  assert.equal(nodes.find(node=>node.id==='child').parent_id,'a','dragging is nonmutating until applied');
});

test('invalid drops, cycles, excessive depth and unchanged orders preserve the tree', () => {
  const nodes = tree('horizontal');
  for (const [id,parent] of [['root','d'],['child','leaf'],['child','child'],['child','missing']]) {
    assert.equal(reorder.canMove(nodes,id,parent),false);
    assert.equal(reorder.apply(nodes,id,0,parent),nodes);
  }
  assert.equal(reorder.apply(nodes,'b',1,'root'),nodes);
  assert.equal(reorder.dropTarget(nodes,layout.arrange(nodes),'child',{x:1e6,y:1e6}),null);
  const deep = [{id:'root',parent_id:null}, ...Array.from({length:30},(_,i)=>({id:`n${i}`,parent_id:i?`n${i-1}`:'root'})),
    {id:'a',parent_id:'root'},{id:'child',parent_id:'a'}];
  assert.equal(reorder.canMove(deep,'a','n28'),false);
  assert.equal(reorder.canMove(deep,'a','n27'),true);
});

test('free form has no automatic sibling insertion slots', () => {
  const nodes = tree('free');
  assert.equal(reorder.slots(nodes,layout.arrange(nodes),'d').length,0);
});
