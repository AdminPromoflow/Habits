"""MindSpace invitations use real HTTP sessions and an isolated database."""
import uuid


def run(owner, recipient, outsider, guest, check):
 def call(action, data=None, expected=200, client=owner, params=None, csrf=True):
  return client.request(action, data, expected, params=params, csrf=csrf, module='sharing')
 def create(kind, name, parent=None):
  return owner.request('createMindSpaceItem', {'kind':kind, 'name':name, 'parent_id':parent, 'mindspace_id':space['id'], 'client_key':str(uuid.uuid4())})
 def incoming(client=recipient):
  return client.data()['mindspace_shares']['incoming']
 def outgoing():
  return owner.data()['mindspace_shares']['outgoing']
 def invite(target, id, email=None):
  call('shareMindSpace', {'target':target, 'id':id, 'email':email or recipient_email, 'invitation_message':'Review this project'})
  return next(row for row in outgoing() if row['recipient_email']==(email or recipient_email) and row['space_id' if target=='space' else 'item_id']==id)
 def preview(share, item=None, client=recipient, expected=200):
  return call('sharedMindSpace', client=client, expected=expected, params={'id':share['id'], **({'item_id':item} if item else {})})

 recipient_email=recipient.boot()['user']['email']
 space=owner.request('createMindSpace', {'name':'Shared project', 'client_key':str(uuid.uuid4())})
 folder=create('folder','Project folder')
 nested=create('folder','Nested',folder['id'])
 note=create('notes','Project notes',nested['id'])
 note=owner.request('saveMindSpaceItem', {'id':note['id'],'version':note['version'],'content':{'text':'Shared text <script>literal</script>'}})
 private=create('notes','Private sibling')
 data={'target':'item','id':folder['id'],'email':recipient_email}
 call('shareMindSpace',data,401,client=guest)
 call('shareMindSpace',data,419,csrf=False)
 call('shareMindSpace',data,404,client=recipient)
 call('shareMindSpace',dict(data,permission='editor'),422)
 check(True,'MindSpace invitations require authentication, CSRF, ownership and supported permissions')

 share=invite('item',folder['id'])
 count=len(outgoing());again=invite('item',folder['id'])
 assert share['id']==again['id'] and len(outgoing())==count
 assert any(row['id']==share['id'] and row['status']=='pending' for row in incoming())
 assert all('content' not in row for row in incoming())
 preview(share,expected=404)
 call('respondMindSpaceShare',{'id':share['id'],'status':'accepted'},404)
 call('respondMindSpaceShare',{'id':share['id'],'status':'accepted'},404,client=outsider)
 check(True,'Duplicate invitations are idempotent; only the recipient can accept and pending invitations expose no content')

 call('respondMindSpaceShare',{'id':share['id'],'status':'accepted'},client=recipient)
 result=preview(share)
 assert {item['id'] for item in result['items']}=={folder['id'],nested['id'],note['id']}
 assert preview(share,note['id'])['selected']['content']['text']==note['content']['text']
 preview(share,private['id'],expected=404)
 preview(share,client=outsider,expected=404)
 assert not any(item['id']==note['id'] for item in recipient.data()['mindspace']['items'])
 recipient.request('saveMindSpaceItem',{'id':note['id'],'version':note['version'],'content':{'text':'Forbidden'}},404)
 recipient.request('deleteMindSpaceItem',{'id':note['id'],'version':note['version']},404)
 call('shareMindSpace',dict(data,id=note['id']),404,client=recipient)
 check(True,'Accepted folder access is restricted to its subtree and cannot edit, delete, re-share or expose private siblings')

 note=owner.request('saveMindSpaceItem',{'id':note['id'],'version':note['version'],'content':{'text':'Updated text'}})
 assert preview(share,note['id'])['selected']['content']['text']=='Updated text'
 added=create('notes','Added later',folder['id'])
 assert any(item['id']==added['id'] for item in preview(share)['items'])
 moved=owner.request('moveMindSpaceItem',{'id':note['id'],'version':note['version'],'parent_id':None})
 preview(share,note['id'],expected=404)
 check(True,'Shared folders show current and future children, and moving a document outside removes its inherited access')

 call('revokeMindSpaceShare',{'id':share['id']},404,client=recipient)
 call('leaveMindSpaceShare',{'id':share['id']},404,client=outsider)
 call('revokeMindSpaceShare',{'id':share['id']})
 preview(share,expected=404)
 assert next(row for row in incoming() if row['id']==share['id'])['resource_name'] is None
 share=invite('item',folder['id'])
 call('respondMindSpaceShare',{'id':share['id'],'status':'declined'},client=recipient)
 preview(share,expected=404)
 share=invite('item',folder['id'])
 call('respondMindSpaceShare',{'id':share['id'],'status':'accepted'},client=recipient)
 call('leaveMindSpaceShare',{'id':share['id']},client=recipient)
 preview(share,expected=404)
 check(True,'Revoke, decline and leave stop access immediately; renewed invitations require fresh acceptance')

 sheet=create('spreadsheet','Budget')
 board=create('kanban','Tasks')
 diagram=create('diagram','Project map')
 habits=create('habits','Project habits')
 habits=owner.request('addMindSpaceHabit',{'id':habits['id'],'version':habits['version'],'habit':{'name':'Read daily','category_id':0,'goal':1,'unit':'session'}})
 all_share=invite('space',space['id'])
 call('respondMindSpaceShare',{'id':all_share['id'],'status':'accepted'},client=recipient)
 assert preview(all_share)['selected'] is None
 assert preview(all_share,sheet['id'])['selected']['content']['cells']=={}
 assert len(preview(all_share,board['id'])['selected']['content']['columns'])==4
 diagram_preview=preview(all_share,diagram['id'])['selected']['diagram']
 assert diagram_preview['id']==diagram['diagram_id'] and len(diagram_preview['nodes'])==1
 assert all('link' not in node for node in diagram_preview['nodes'])
 public_habits=preview(all_share,habits['id'])['selected']['habits']
 assert public_habits[0]['name']=='Read daily' and set(public_habits[0])=={'id','name','description','goal','unit'}
 check(True,'Space invitations support notes, spreadsheets, unified boards, diagrams and habit details without personal progress')

 single=invite('item',private['id'])
 call('respondMindSpaceShare',{'id':single['id'],'status':'accepted'},client=recipient)
 assert len(preview(single)['items'])==1 and preview(single)['selected']['id']==private['id']
 preview(single,sheet['id'],expected=404)
 unknown=invite('item',private['id'],'missing-mindspace@example.test')
 assert unknown['status']=='pending' and set(unknown)==set(single)
 self_share=invite('item',private['id'],owner.boot()['user']['email'])
 assert self_share['status']=='pending'
 check(True,'Individual document shares remain scoped, and invitation responses do not reveal whether an email has an account')

 owner.request('deleteMindSpaceItem',{'id':private['id'],'version':private['version']})
 preview(single,expected=404)
 assert not any(row['id']==single['id'] for row in outgoing())
 owner.request('deleteMindSpace',{'id':space['id']})
 preview(all_share,expected=404)
 assert not any(row['id']==all_share['id'] for row in incoming())
 check(True,'Deleting shared documents or spaces removes their invitations and access')
