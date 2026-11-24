const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {user:{id:1}, sharingTab:'all', sharePerson:null, shareFilter:{search:''}, data:{habits:[], incoming:[], outgoing:[], mindspace_shares:{incoming:[],outgoing:[]}}};
  const context = vm.createContext({S:state, PageController:class{}, esc, t:(key,values={})=>key+Object.values(values).join(''), icon:()=>'', badge:key=>key,
    heading:()=>'', empty:(title,hint)=>title+hint, renderTemplate:(name,values)=>values,
    pageControllers:{home:{mindspace:{kindIcon:()=>'',explorer:()=>'<div>Workspace files</div>',flush:async()=>true}}},
    document:{body:{classList:{remove:()=>{}}}}, window:{scrollTo:()=>{}}, render:()=>{context.rendered=true;},
    leaveSharedWorkspace:()=>{state.sharedWorkspace=null;},openSharedWorkspace:async id=>{context.opened=id;},
    openModal:(title,html)=>{context.modal=html;}, formFooter:()=>''});
  vm.runInContext(fs.readFileSync('view/sharing/sharing.js','utf8')+'\nthis.page=sharingPage;this.entries=sharingEntries;this.people=sharingPeople;this.fields=mindSpacePermissionFields;this.manage=manageMindSpaceShare;this.sidebar=sharingSidebar;this.selectPerson=selectSharingPerson;', context);
  return {state,context};
}

test('All includes pending outgoing invitations and accepted incoming resources, grouped by person',()=>{
  const {state,context}=fixture();
  state.data.incoming=[{id:1,status:'accepted',owner_user_id:2,owner_name:'Alex',owner_email:'alex@example.test',resource_name:'Habit'}, {id:2,status:'pending',owner_email:'pending@example.test',owner_name:'Pending'}];
  state.data.mindspace_shares.outgoing=[{id:1,status:'accepted',recipient_email:'ALEX@example.test',recipient_name:'Alex',resource_name:'Workspace'}, {id:2,status:'pending',recipient_email:'waiting@example.test'}];
  const entries=context.entries(); assert.equal(entries.length,3);
  const people=context.people(entries); assert.equal(people.length,2); assert.equal(people[0].name,'Alex');assert.equal(people[0].entries.length,2);
  state.sharingTab='with_me';assert.equal(context.entries().length,1);assert.equal(context.entries()[0].mine,false);
  state.sharingTab='by_me';assert.equal(context.entries().length,2);assert.ok(context.entries().every(entry=>entry.mine));
  state.sharingTab='invitations';assert.equal(context.entries().length,4);
});

test('pending recipients stay visible with an editable workspace link while revoked invitations are excluded',()=>{
  const {state,context}=fixture();state.sharingTab='by_me';state.sharePerson='waiting@example.test';
  state.data.mindspace_shares.outgoing=[{id:7,status:'pending',recipient_email:'waiting@example.test',resource_name:'Pending workspace',kind:'space',permissions:{}},{id:8,status:'revoked',recipient_email:'revoked@example.test'}];
  const page=context.page();assert.match(page.people,/waiting@example.test/);assert.doesNotMatch(page.people,/revoked@example.test/);
  assert.match(page.cards,/sharing-resource-list/);assert.match(page.cards,/data-action="ms-share-preview" data-id="7"/);assert.match(page.cards,/pending/);
});

test('sidebar groups both directions, includes pending people and displays the selected workspace tree',()=>{
  const {state,context}=fixture();state.view='sharing';state.sharingSidebarExpanded=true;state.sharePerson='alex@example.test';state.sharedWorkspace={id:7};
  state.data.mindspace_shares={outgoing:[{id:7,status:'pending',recipient_email:'alex@example.test',resource_name:'Workspace',kind:'space'}],incoming:[{id:8,status:'pending',owner_email:'bea@example.test',owner_name:'Bea <img>',resource_name:'Incoming',kind:'notes'},{id:9,status:'revoked',owner_email:'removed@example.test'}]};
  const html=context.sidebar(1);assert.match(html,/aria-expanded="true"/);assert.match(html,/data-person="alex@example.test"/);assert.match(html,/Bea &lt;img&gt;/);assert.match(html,/Workspace files/);assert.doesNotMatch(html,/removed@example.test/);
  state.sharePerson='bea@example.test';state.sharedWorkspace=null;
  const incoming=context.sidebar();assert.match(incoming,/data-invitations="true"/);assert.doesNotMatch(incoming,/data-action="ms-share-preview" data-id="8"/);
});

test('selecting one pending outgoing workspace opens the editor; incoming pending invitations stay in Invitations',async()=>{
  const {state,context}=fixture();state.view='sharing';state.sharingTab='by_me';
  state.data.mindspace_shares.outgoing=[{id:7,status:'pending',recipient_email:'waiting@example.test',resource_name:'Workspace',kind:'space'}];
  await context.selectPerson('waiting@example.test');assert.equal(context.opened,7);assert.equal(state.sharingTab,'by_me');assert.equal(state.sharingSidebarExpanded,true);
  context.opened=null;state.sharedWorkspace={id:7};state.data.mindspace_shares.incoming=[{id:8,status:'pending',owner_email:'new@example.test',owner_name:'New'}];
  await context.selectPerson('new@example.test',{sidebar:true});assert.equal(context.opened,null);assert.equal(state.sharedWorkspace,null);assert.equal(state.sharingTab,'invitations');assert.equal(state.sharePerson,'new@example.test');
});

test('switching participants waits for autosave and stops if saving fails',async()=>{
  const {state,context}=fixture();state.view='sharing';state.sharePerson='current@example.test';state.sharedWorkspace={id:3};
  context.pageControllers.home.mindspace.flush=async()=>false;
  await context.selectPerson('next@example.test',{sidebar:true});assert.equal(state.sharePerson,'current@example.test');assert.equal(state.sharedWorkspace.id,3);assert.equal(context.opened,undefined);
});

test('sidebar selection combines both directions regardless of the previously selected tab',async()=>{
  const {state,context}=fixture();state.view='sharing';state.sharingTab='by_me';
  state.data.mindspace_shares={outgoing:[{id:7,status:'pending',recipient_email:'alex@example.test',resource_name:'Sent',kind:'space'}],incoming:[{id:8,status:'accepted',owner_email:'alex@example.test',owner_name:'Alex',resource_name:'Received',kind:'space'}]};
  await context.selectPerson('alex@example.test',{sidebar:true});assert.equal(state.sharingTab,'all');assert.equal(context.opened,undefined);
  const page=context.page();assert.match(page.cards,/Sent/);assert.match(page.cards,/Received/);
});

test('only four ordered tabs appear and selecting a person limits the displayed resources',()=>{
  const {state,context}=fixture();
  state.data.mindspace_shares.outgoing=[{id:7,status:'accepted',recipient_email:'a@example.test',recipient_name:'Alex',resource_name:'Alex notes',kind:'notes',permissions:{edit:true}}, {id:8,status:'accepted',recipient_email:'b@example.test',recipient_name:'Bea',resource_name:'Bea board',kind:'kanban',permissions:{move:true}}];
  const first=context.page();
  assert.deepEqual([...first.tabs.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['all','with_me','by_me','invitations']);
  assert.match(first.people,/Alex/);assert.match(first.people,/Bea/);assert.match(first.cards,/sharing_choose_person/);
  state.sharePerson='a@example.test';const selected=context.page();
  assert.match(selected.cards,/Alex notes/);assert.doesNotMatch(selected.cards,/Bea board/);
});

test('Invitations shows sent and received requests and escapes participant and resource names',()=>{
  const {state,context}=fixture(); state.sharingTab='invitations';state.sharePerson='alex@example.test';
  state.data.mindspace_shares={outgoing:[{id:1,status:'pending',recipient_email:'alex@example.test',resource_name:'<script>bad</script>',kind:'notes',permissions:{}}], incoming:[{id:2,status:'pending',owner_email:'alex@example.test',owner_name:'Alex <img>',resource_name:'Incoming',kind:'notes',permissions:{share:true}}]};
  const page=context.page();assert.match(page.cards,/sharing_sent/);assert.match(page.cards,/sharing_received/);
  assert.match(page.cards,/ms-share-accept/);assert.match(page.cards,/ms-share-manage/);
  assert.doesNotMatch(page.cards,/<script>/);assert.match(page.cards,/&lt;script&gt;/);assert.match(page.people,/&lt;img&gt;/);
});

test('permissions have independent checkboxes and delegation cannot enable unavailable permissions',()=>{
  const {context}=fixture();
  const html=context.fields({edit:true,move:true,delete:false,share:true},{edit:true,move:false,delete:true,share:false});
  assert.match(html,/name="can_edit"[^>]*checked/);
  assert.match(html,/name="can_move"[^>]*disabled/);assert.doesNotMatch(html,/name="can_move"[^>]*checked/);
  assert.match(html,/name="can_share"[^>]*disabled/);assert.doesNotMatch(html,/name="can_delete"[^>]*checked/);
});

test('shared editor requests use the scoped gateway and refresh retains the private catalog',async()=>{
  const state={sharedWorkspace:{id:9},data:{},csrf:'token'};
  const calls=[];
  const responses={sharedMindSpace:{permissions:{edit:true},workspace:{mindspace:{id:20},diagrams:[{id:22}]}},data:{mindspace:{id:1},diagrams:[{id:2}],notifications:[]},sharedMindSpaceAction:{id:22}};
  const context=vm.createContext({S:state,URLSearchParams,t:key=>key,document:{getElementById:()=>({textContent:JSON.stringify({sharedMindSpace:'sharing',sharedMindSpaceAction:'sharing',data:'dashboard',saveDiagram:'diagrams'})})},
    sharedOwnCatalog:data=>({mindspace:data.mindspace,diagrams:data.diagrams}),fetch:async(url,options)=>{const action=new URL('http://test/'+url).searchParams.get('action');calls.push({action,body:options.body&&JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true,result:responses[action]})};}});
  vm.runInContext(fs.readFileSync('view/global/request.js','utf8')+'\nthis.request=ajaxRequest;',context);
  await context.request.makeRequest('saveDiagram',{id:22,version:3});
  assert.equal(calls[0].action,'sharedMindSpaceAction');assert.equal(calls[0].body.share_id,9);assert.equal(calls[0].body.action,'saveDiagram');
  const data=await context.request.makeRequest('data');assert.equal(data.mindspace.id,20);assert.equal(state.ownedWorkspace.mindspace.id,1);
});
