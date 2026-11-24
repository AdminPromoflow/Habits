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
  content={'cards':[{'id':str(uuid.uuid4()),'title':'Planificar','description':'Primera tarea','status':'todo','points':3}], 'sprint':{'name':'Sprint 1','goal':'Entregar','start':'2026-11-24','end':'2026-11-30'}}
  board=save(board,content); content['cards'][0]['status']='done'; board=save(board,content)
  check(current(board['id'])['content']==content, kind+' cards, status changes and sprint details persist')
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
