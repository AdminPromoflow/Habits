const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({Intl,Date,document:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('view/global/ui.js','utf8'),context);
const Links=vm.runInContext(fs.readFileSync('view/home/diagram-links.js','utf8')+'\nDiagramLinks;',context);
const documents=items=>items.map(item=>({...item,key:item.kind==='diagram'?`diagram:${item.diagram_id}`:`item:${item.id}`}));
const flatten=tree=>tree.flatMap(node=>[node,...flatten(node.children)]);

test('destinations follow their actual space and folder ancestry, with folders first',()=>{
  const items=[
    {id:10,kind:'folder',name:'Projects',mindspace_id:1,parent_id:null},
    {id:11,kind:'folder',name:'Planning',mindspace_id:1,parent_id:10},
    {id:12,kind:'diagram',diagram_id:90,name:'Map',mindspace_id:1,parent_id:11},
    {id:13,kind:'notes',name:'Agenda',mindspace_id:1,parent_id:10},
    {id:14,kind:'folder',name:'Projects',mindspace_id:2,parent_id:null},
    {id:15,kind:'files',name:'Photos',mindspace_id:2,parent_id:14}
  ];
  const tree=Links.destinationTree(documents(items),items,[{id:1,name:'Home'},{id:2,name:'Work'}]);
  assert.equal(tree[0].children[0].key,'item:10');
  assert.equal(tree[0].children[0].children[0].key,'item:11');
  assert.equal(tree[0].children[0].children[0].children[0].key,'diagram:90');
  assert.equal(tree[0].children[0].children[1].key,'item:13');
  assert.equal(tree[1].children[0].children[0].key,'item:15');
  assert.equal(flatten(tree).filter(node=>node.kind!=='space').length,items.length);
});

test('legacy and partially shared destinations remain available without an accessible ancestor',()=>{
  const items=[{id:10,kind:'folder',name:'Private',mindspace_id:1,parent_id:null},
    {id:11,kind:'notes',name:'Shared note',mindspace_id:2,parent_id:10},
    {id:12,kind:'notes',name:'Orphan note',mindspace_id:2,parent_id:999}];
  const docs=[...documents(items),{id:90,kind:'diagram',name:'Legacy',key:'diagram:90'}];
  const tree=Links.destinationTree(docs,items,[{id:2,name:'Shared'}]);
  const shared=tree.find(node=>node.key==='space:2');
  assert.deepEqual(Array.from(shared.children,node=>node.key).sort(),['item:11','item:12']);
  assert.ok(tree.some(node=>node.key==='diagram:90'));
  assert.ok(tree.some(node=>node.key==='item:10'));
});

test('a folder cycle cannot hide or repeat destinations',()=>{
  const items=[{id:10,kind:'folder',name:'A',mindspace_id:1,parent_id:11},
    {id:11,kind:'folder',name:'B',mindspace_id:1,parent_id:10},
    {id:12,kind:'notes',name:'Note',mindspace_id:1,parent_id:11}];
  const tree=Links.destinationTree(documents(items),items,[{id:1,name:'Home'}]);
  assert.deepEqual(Array.from(flatten(tree),node=>node.key).sort(),['item:10','item:11','item:12','space:1']);
});

test('folder disclosures and destination selection remain separate and names are escaped',()=>{
  const items=[{id:10,kind:'folder',name:'<Folder>',mindspace_id:1,parent_id:null},
    {id:11,kind:'notes',name:'<Note>',mindspace_id:1,parent_id:10}];
  const tree=Links.destinationTree(documents(items),items,[{id:1,name:'<Space>'}]);
  const picker=Object.create(Links.prototype);picker.home={mindspace:{kindIcon:()=>''}};
  const html=picker.destinationTreeHtml(tree,'item:11',item=>`Home / "${item.name}"`);
  assert.equal((html.match(/<details data-link-branch>/g)||[]).length,2);
  assert.match(html,/data-link-document="item:10" aria-pressed="false"/);
  assert.match(html,/data-link-document="item:11" aria-pressed="true"/);
  assert.ok(!html.includes('data-link-document="space:1"'));
  assert.match(html,/&lt;Space&gt;/);assert.match(html,/&lt;Folder&gt;/);assert.match(html,/&lt;Note&gt;/);
  assert.ok(!html.includes('<Note>'));assert.match(html,/&quot;/);
});
