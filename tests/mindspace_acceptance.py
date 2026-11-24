"""MindSpace persistence, folder hierarchy and ownership through the real API."""
import uuid

def run(owner, stranger, guest, check):
 def call(action, body=None, expected=200, client=owner):
  return client.request(action, body, expected, module='mindspaces')
 def create(kind, name, parent=None):
  return call('createMindSpaceItem', {'kind':kind,'name':name,'parent_id':parent,'client_key':str(uuid.uuid4())})
 def save(item, content):
  return call('saveMindSpaceItem', {'id':item['id'],'version':item['version'],'content':content})
 def move(item, parent, expected=200):
  return call('moveMindSpaceItem', {'id':item['id'],'version':item['version'],'parent_id':parent}, expected)
 def current(id):
  return next(i for i in call('mindspace')['items'] if i['id']==id)

 owner.request('saveDiagram',{'name':'Existing editor document','client_key':str(uuid.uuid4())},module='diagrams')
 existing=owner.data()['diagrams']
 space=call('mindspace')
 check({i['diagram_id'] for i in space['items'] if i['kind']=='diagram'}=={d['id'] for d in existing}, 'MindSpace adopts existing diagram IDs without rebuilding their trees')
 guest.request('mindspace', expected=401, module='mindspaces')
 owner.request('createMindSpaceItem', {'kind':'folder'},419,csrf=False,module='mindspaces')
 call('createMindSpaceItem', expected=405)
 call('mindspace', {},405)
 check(True, 'MindSpace enforces authentication, CSRF and HTTP methods')
 root=create('folder','Proyectos')
 child=create('folder','Diseño',root['id'])
 deep=create('folder','Referencias',child['id'])
 note=create('notes','Borrador',deep['id'])
 check(current(note['id'])['parent_id']==deep['id'] and current(deep['id'])['parent_id']==child['id'], 'Folders can contain files and arbitrarily nested subfolders')
 key=str(uuid.uuid4())
 payload={'kind':'notes','name':'Retry safely','parent_id':root['id'],'client_key':key}
 first=call('createMindSpaceItem',payload); again=call('createMindSpaceItem',payload)
 check(first['id']==again['id'], 'Creation retries return the same item instead of duplicating it')
 literal='\nIdeas <script>literal</script>\n\n  con espacios  '
 saved=save(note,{'text':literal})
 check(current(note['id'])['content']['text']==literal and saved['version']==2, 'Notes preserve text and whitespace across reloads')
 call('saveMindSpaceItem',{'id':note['id'],'version':1,'content':{'text':'stale'}},409)
 check(current(note['id'])['content']['text']==literal, 'Concurrent stale edits cannot overwrite newer content')
 for dest in [root['id'],child['id'],deep['id']]: move(root,dest,422)
 move(child,note['id'],422)
 check(current(root['id'])['parent_id'] is None, 'Moving a folder into itself, descendants or a document is rejected without changing the tree')
 moved=move(saved,root['id'])
 moved=move(moved,None)
 check(moved['parent_id'] is None and moved['content']['text']==literal, 'Moving documents between folders and the root preserves content')
 moved_child=move(child,None)
 check(current(deep['id'])['parent_id']==moved_child['id'], 'Moving a folder keeps its nested subtree attached')
 foreign=call('createMindSpaceItem',{'kind':'folder','name':'Private','client_key':str(uuid.uuid4())},client=stranger)
 move(root,foreign['id'],404)
 call('saveMindSpaceItem',{'id':note['id'],'version':moved['version'],'name':'stolen'},404,client=stranger)
 call('moveMindSpaceItem',{'id':note['id'],'version':moved['version'],'parent_id':None},404,client=stranger)
 check(all(i['id']!=note['id'] for i in call('mindspace',client=stranger)['items']), 'Other accounts cannot read, edit or move private items or use private destination folders')
 sheet=create('spreadsheet','Presupuesto',root['id'])
 check(isinstance(sheet['content']['cells'],dict), 'Empty spreadsheet cells are returned as an object, not an array')
 sheet=save(sheet,{'rows':30,'columns':10,'cells':{'A1':'10','A2':'20','B1':'=SUM(A1:A2)'}})
 check(current(sheet['id'])['content']['cells']['B1']=='=SUM(A1:A2)', 'Spreadsheets persist raw cells and formulas')
 for bad in [{'rows':201,'columns':10,'cells':{}},{'rows':2,'columns':2,'cells':{'C1':'x'}},{'rows':2,'columns':2,'cells':{'A1':'x'*2001}}]:
  call('saveMindSpaceItem',{'id':sheet['id'],'version':sheet['version'],'content':bad},422)
 check(current(sheet['id'])['version']==sheet['version'], 'Spreadsheet size and cell limits reject invalid writes atomically')
 for kind in ['kanban','scrum']:
  board=create(kind,kind,root['id'])
  assert board['kind']=='kanban' and [c['name'] for c in board['content']['columns']]==['Pending','To Do','In Progress','Done']
  content={'cards':[{'id':str(uuid.uuid4()),'title':'Planificar','description':'Primera tarea','status':'todo','points':3}], 'columns':board['content']['columns'], 'sprint':{'name':'Sprint 1','goal':'Entregar','start':'2026-11-24','end':'2026-11-30'}}
  board=save(board,content); content['cards'][0]['status']='done'; board=save(board,content)
  check(current(board['id'])['content']==content, kind+' cards, status changes and sprint details persist')
 custom={'id':str(uuid.uuid4()),'name':'Review'}
 content['columns']=content['columns']+[custom]
 content['cards'][0]['status']=custom['id']
 prior_version=board['version'];board=save(board,content)
 check(current(board['id'])['content']==content and board['kind']=='kanban', 'Unified boards persist custom columns, cards in those columns and sprint metadata')
 legacy={'cards':content['cards'],'sprint':content['sprint']}
 board=save(board,legacy)
 check(current(board['id'])['content']['columns']==content['columns'], 'Clients omitting columns cannot erase custom columns')
 call('saveMindSpaceItem',{'id':board['id'],'version':prior_version,'content':content},409)
 call('saveMindSpaceItem',{'id':board['id'],'version':board['version'],'content':content},404,client=stranger)
 invalid_columns=[None,[],content['columns'][1:],content['columns']+[custom],content['columns']+[{'id':str(uuid.uuid4()),'name':'review'}],
  content['columns']+[{'id':'not-a-uuid','name':'Invalid'}],content['columns']+[{'id':str(uuid.uuid4()),'name':' '}],
  content['columns']+[{'id':str(uuid.uuid4()),'name':'x'*81}],content['columns']+[{'id':str(uuid.uuid4()),'name':'pending'}],
  content['columns']+[{'id':str(uuid.uuid4()),'name':f'Extra {i}'} for i in range(46)]]
 for columns in invalid_columns:
  call('saveMindSpaceItem',{'id':board['id'],'version':board['version'],'content':dict(content,columns=columns)},422)
 call('saveMindSpaceItem',{'id':board['id'],'version':board['version'],'content':dict(content,cards=[dict(content['cards'][0],status=str(uuid.uuid4()))])},422)
 check(current(board['id'])==board, 'Invalid columns, unknown card states, stale writes and other users cannot corrupt a board')
 alias_key=str(uuid.uuid4())
 alias=call('createMindSpaceItem',{'kind':'scrum','name':'Unified retry','client_key':alias_key})
 alias_retry=call('createMindSpaceItem',{'kind':'kanban','name':'Unified retry','client_key':alias_key})
 check(alias==alias_retry and alias['kind']=='kanban', 'Legacy Scrum creation and unified Kanban creation share one idempotent board type')
 habits=create('habits','Hábitos del proyecto',root['id'])
 habits=call('addMindSpaceHabit',{'id':habits['id'],'version':habits['version'],'habit':{'name':'Leer','category_id':0,'goal':1,'unit':'sesión'}})
 habit_id=habits['content']['habit_ids'][0]
 check(any(h['id']==habit_id and h['name']=='Leer' for h in owner.data()['habits']), 'A habit space can create real tracked habits and its own private category')
 diagram=create('diagram','Mapa del proyecto',deep['id'])
 before=next(d for d in owner.data()['diagrams'] if d['id']==diagram['diagram_id'])
 check(before['nodes'][0]['text']=='', 'Creating a diagram in a folder supports an empty central topic')
 diagram=move(diagram,root['id'])
 renamed=call('saveMindSpaceItem',{'id':diagram['id'],'version':diagram['version'],'diagram_version':diagram['diagram_version'],'name':'Mapa actualizado'})
 after=next(d for d in owner.data()['diagrams'] if d['id']==diagram['diagram_id'])
 check(after['nodes']==before['nodes'] and after['name']==renamed['name'] and after['id']==before['id'], 'Moving and renaming diagram tabs preserve the original diagram ID and nodes')
 call('createMindSpaceItem',{'kind':'unknown','name':'Invalid','client_key':str(uuid.uuid4())},422)
 check(True, 'Unsupported MindSpace item types are rejected')

 space_key=str(uuid.uuid4())
 work=call('createMindSpace',{'name':'Trabajo','client_key':space_key})
 repeat=call('createMindSpace',{'name':'Retry','client_key':space_key})
 check(work==repeat and work['name']=='Trabajo', 'Creating another MindSpace is idempotent and preserves its chosen name')
 guest.request('createMindSpace',{'name':'Private','client_key':str(uuid.uuid4())},401,module='mindspaces')
 owner.request('createMindSpace',{'name':'Private','client_key':str(uuid.uuid4())},419,csrf=False,module='mindspaces')
 call('createMindSpace',{'name':'','client_key':str(uuid.uuid4())},422)
 check(True, 'MindSpace creation requires authentication, CSRF and a nonempty name')
 def work_item(kind,name,parent=None,key=None):
  return call('createMindSpaceItem',{'kind':kind,'name':name,'mindspace_id':work['id'],'parent_id':parent,'client_key':key or str(uuid.uuid4())})
 work_folder=work_item('folder','Proyectos')
 work_note=work_item('notes','Notas de trabajo',work_folder['id'])
 work_key=str(uuid.uuid4()); work_diagram=work_item('diagram','Mapa de trabajo',work_folder['id'],work_key)
 work_diagram_retry=work_item('diagram','Retry',work_folder['id'],work_key)
 check(work_diagram_retry['id']==work_diagram['id'] and work_note['mindspace_id']==work['id'] and work_diagram['mindspace_id']==work['id'], 'New folders, notes and diagrams belong to the selected MindSpace, including creation retries')
 before_diagrams=owner.data()['diagrams']
 call('createMindSpaceItem',{'kind':'diagram','name':'Wrong space retry','mindspace_id':space['id'],'client_key':work_key},422)
 check(owner.data()['diagrams']==before_diagrams and current(work_diagram['id'])['mindspace_id']==work['id'], 'Reusing a diagram creation key in a different MindSpace cannot move or overwrite it')
 moved=move(work_note,None)
 check(moved['mindspace_id']==work['id'] and moved['parent_id'] is None, 'Moving to the root stays in the selected MindSpace')
 move(work_folder,root['id'],422)
 call('createMindSpaceItem',{'kind':'notes','name':'Wrong folder','mindspace_id':work['id'],'parent_id':root['id'],'client_key':str(uuid.uuid4())},422)
 call('createMindSpaceItem',{'kind':'notes','name':'Wrong owner','mindspace_id':work['id'],'client_key':str(uuid.uuid4())},404,client=stranger)
 check(all(s['id']!=work['id'] for s in call('mindspace',client=stranger)['spaces']), 'Space ownership and folder boundaries are enforced on the server')
 reloaded=owner.boot()['data']['mindspace']
 check(any(s==work for s in reloaded['spaces']) and any(i['id']==work_diagram['id'] for i in reloaded['items']) and any(i['id']==root['id'] for i in reloaded['items']), 'Reload returns every owned MindSpace and preserves all existing folders and documents')

 # Context-menu mutations use the same ownership and HTTP boundaries.
 for action, payload in [('renameMindSpace',{'id':work['id'],'name':'Renamed'}), ('deleteMindSpace',{'id':work['id']}), ('deleteMindSpaceItem',{'id':work_folder['id'],'version':work_folder['version']})]:
  call(action,payload,404,client=stranger)
  call(action,payload,401,client=guest)
  owner.request(action,payload,419,csrf=False,module='mindspaces')
  call(action,expected=405)
 check(True, 'Sidebar rename and delete actions enforce ownership, authentication, CSRF and POST')
 call('createMindSpace',{'name':'Nested space','client_key':str(uuid.uuid4()),'parent_id':work_folder['id']},422)
 call('createMindSpace',{'name':'Nested space','client_key':str(uuid.uuid4()),'mindspace_id':work['id']},422)
 renamed_space=call('renameMindSpace',{'id':work['id'],'name':'Trabajo actualizado'})
 call('renameMindSpace',{'id':work['id'],'name':'  '},422)
 check(renamed_space in owner.boot()['data']['mindspace']['spaces'] and current(work_folder['id'])['mindspace_id']==work['id'], 'Space renaming persists without moving contents, and nested spaces are rejected')
 renamed_folder=call('saveMindSpaceItem',{'id':work_folder['id'],'version':work_folder['version'],'name':'Carpeta actualizada'})
 call('deleteMindSpaceItem',{'id':work_folder['id'],'version':work_folder['version']},409)
 call('deleteMindSpaceItem',{'id':work_diagram['id'],'version':work_diagram['version'],'diagram_version':0},409)
 check(current(work_folder['id'])['name']=='Carpeta actualizada' and current(work_diagram['id']), 'Stale folder and diagram deletes leave current content intact')
 nested=work_item('folder','Nested',work_folder['id'])
 nested_note=work_item('notes','Nested note',nested['id'])
 deleted=call('deleteMindSpaceItem',{'id':work_folder['id'],'version':renamed_folder['version']})
 remaining=call('mindspace')
 check(set(deleted['deleted_ids'])=={work_folder['id'],work_diagram['id'],nested['id'],nested_note['id']} and current(work_note['id']) and current(root['id']), 'Deleting a folder removes its complete subtree while preserving siblings and other spaces')
 check(all(d['id']!=work_diagram['diagram_id'] for d in owner.data()['diagrams']) and all(i['id']!=work_diagram['id'] for i in owner.boot()['data']['mindspace']['items']), 'Deleted folder diagrams are removed from storage and never reappear during bootstrap')
 call('deleteMindSpaceItem',{'id':sheet['id'],'version':sheet['version']})
 call('deleteMindSpaceItem',{'id':renamed['id'],'version':renamed['version'],'diagram_version':renamed['diagram_version']})
 check(all(i['id'] not in [sheet['id'],renamed['id']] for i in call('mindspace')['items']), 'Individual spreadsheets and diagrams can be deleted')
 call('deleteMindSpace',{'id':space['id']})
 remaining=owner.boot()['data']['mindspace']
 check(remaining['id']==work['id'] and all(s['id']!=space['id'] for s in remaining['spaces']) and current(work_note['id']), 'Deleting the default space preserves siblings and does not recreate the removed default')
 check(any(h['id']==habit_id for h in owner.data()['habits']), 'Deleting a habit document preserves the separately tracked habits')
 call('deleteMindSpace',{'id':work['id']})
 empty=owner.boot()['data']['mindspace']
 check(empty['spaces']==[] and empty['items']==[] and empty['id'] is None and owner.data()['diagrams']==[], 'Deleting the final space stays empty after reload without orphan diagrams')
 fresh=call('createMindSpace',{'name':'Start again','client_key':str(uuid.uuid4())})
 check(call('mindspace')['spaces']==[fresh], 'A new space can be created after deleting every space, without a duplicate default')
