#!/usr/bin/env python3
"""HTTP acceptance tests. Standard library only; never uses the live application database."""
import os,sys,json,time,secrets,subprocess,urllib.request,urllib.error,http.cookiejar,datetime,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
PHP=os.environ.get('PHP_BIN','php')
DB='mi_rutina_test_'+secrets.token_hex(5)
PORT=int(os.environ.get('RUTINA_TEST_PORT','8783'))
BASE=f'http://127.0.0.1:{PORT}'
env=dict(os.environ,RUTINA_DB_NAME=DB,RUTINA_DB_USER=os.environ.get('RUTINA_TEST_DB_USER','root'),RUTINA_DB_PASSWORD=os.environ.get('RUTINA_TEST_DB_PASSWORD',''),RUTINA_APP_URL=BASE,RUTINA_SESSION_PATH=str(ROOT/'tests/.runtime/sessions'),RUTINA_SECURE_COOKIES='0')
(ROOT/'tests/.runtime').mkdir(exist_ok=True)
PASSWORD='Test-only-password-2026'
checks=0

def check(value,message):
 global checks
 if not value: raise AssertionError(message)
 checks+=1
 print(f'PASS {checks:02d}: {message}',flush=True)

class Client:
 def __init__(self):
  self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf=None;self.boot()
 def request(self,action,body=None,expected=200,params=None,csrf=True):
  from urllib.parse import urlencode
  url=BASE+'/api.php?'+urlencode(dict(action=action,**(params or {})))
  headers={};data=None
  if body is not None:
   data=json.dumps(body).encode();headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf if csrf else 'invalid'}
  req=urllib.request.Request(url,data=data,headers=headers)
  try:
   res=self.opener.open(req);status=res.status;raw=res.read()
  except urllib.error.HTTPError as e:status=e.code;raw=e.read()
  if status!=expected:raise AssertionError(f'{action}: expected {expected}, got {status}: {raw[:500]!r}')
  j=json.loads(raw)
  if status==200:return j['result']
  return j
 def boot(self):
  r=self.request('bootstrap');self.csrf=r['csrf'];return r
 def login(self,email):
  r=self.request('login',{'email':email,'password':PASSWORD});self.csrf=r['csrf'];return self.boot()
 def register(self,email,name):
  r=self.request('register',{'email':email,'name':name,'password':PASSWORD,'language':'en'});self.csrf=r['csrf'];return self.boot()
 def data(self):return self.request('data')
 def ids(self):return {h['id'] for h in self.data()['habits']}

server=None
try:
 subprocess.run([PHP,'tests/provision.php'],cwd=ROOT,env=env,check=True)
 subprocess.run([PHP,'bin/import-routine.php'],cwd=ROOT,env=env,check=True)
 subprocess.run([PHP,'bin/import-routine.php'],cwd=ROOT,env=env,check=True)
 subprocess.run([PHP,'bin/migrate.php'],cwd=ROOT,env=env,check=True)
 log=open(ROOT/'tests/.runtime/server.log','w')
 server=subprocess.Popen([PHP,'-S',f'127.0.0.1:{PORT}','router.php'],cwd=ROOT,env=env,stdout=log,stderr=log)
 for _ in range(50):
  try:urllib.request.urlopen(BASE,timeout=1);break
  except (OSError,urllib.error.URLError):time.sleep(.1)
 owner=Client();guest=Client();bob=Client();eve=Client();viewer=Client()
 check(guest.boot()['language']=='en','Anonymous default language is English')
 guest.request('language',{'language':'es'});check(guest.boot()['language']=='es','Visitor language persists in a cookie')
 check(guest.request('language',{'language':'en'},419,csrf=False)['error']=='error_csrf','CSRF is enforced before mutation')
 guest.request('admin',expected=401);check(True,'Anonymous administrator access is denied')
 a=owner.login('aleinaroseroy@gmail.com');check(set(a['user']['roles'])=={'admin','user'},'Aleina has both roles in one account')
 check(len(a['data']['habits'])==40 and len(a['data']['routines'])==1,'Routine import is idempotent: 40 exercises, one routine')
 check(not a['data']['completions'],'PDF import does not fabricate completion history')
 bob.register('bob@example.test','Bob');eve.register('eve@example.test','Eve');viewer.register('viewer@example.test','Viewer')
 bob.request('admin',expected=403);check(True,'Normal users cannot read administration data')
 check(not bob.data()['habits'],'New users cannot see Aleina’s private routine')
 owner.request('language',{'language':'es'});check(owner.boot()['language']=='es','Spanish is stored for the signed-in account')
 device=Client();device.request('language',{'language':'en'});check(device.login('aleinaroseroy@gmail.com')['language']=='es','Database language overrides another device’s cookie')
 r=owner.request('logout',{});owner.csrf=r['csrf'];check(owner.boot()['language']=='es','Spanish remains selected after logout')
 owner.request('language',{'language':'en'});check(owner.login('aleinaroseroy@gmail.com')['language']=='es','Guest selection does not overwrite the account preference')
 owner.request('language',{'language':'en'});check(device.boot()['language']=='en','English preference persists across existing device sessions')
 r=owner.request('logout',{});owner.csrf=r['csrf'];check(owner.login('aleinaroseroy@gmail.com')['language']=='en','English remains selected after logout and login')
 check(set(owner.boot()['translations']['en'])==set(owner.boot()['translations']['es']),'Both centralized dictionaries cover identical interface keys')
 td=owner.data()['today'];past=(datetime.date.fromisoformat(td)-datetime.timedelta(days=10)).isoformat()
 category=owner.request('saveCategory',{'name':'Private exercise test','description':'Only Aleina','icon':'dumbbell','color':'#CBE8DD'})['id']
 other_category=owner.request('saveCategory',{'name':'Another private category','description':'','icon':'book','color':'#D4E5F7'})['id']
 bobcat=bob.request('saveCategory',{'name':'Bob private','description':'','color':'#F5C8D8'})['id']
 check(all(c['id']!=category for c in bob.data()['categories']),'Private category IDs cannot reveal category data')
 def newhabit(name,cat=category,client=owner):
  return client.request('saveHabit',{'name':name,'description':'2 x 12 — preserved','category_id':cat,'goal':10,'unit':'minutes','schedule_days':[1,2,3,4,5,6,7],'start_date':past})['id']
 def edit(hid,**changes):
  h=next(h for h in owner.data()['habits'] if h['id']==hid)
  h.update(changes);return owner.request('saveHabit',h)
 h1=newhabit('Práctica de inglés <script>test</script>');h2=newhabit('Read pages');h3=newhabit('Never shared')
 check(next(h for h in owner.data()['habits'] if h['id']==h1)['name']=='Práctica de inglés <script>test</script>','Personal content remains exact, independently of interface language')
 bob.request('saveHabit',{'name':'Guess category','category_id':category,'schedule_days':[7],'start_date':td},404);check(True,'Guessing a private category cannot create or read habits there')
 bob.request('share',{'email':'eve@example.test','habit_ids':[h1],'permission':'editor'},404);check(True,'Users cannot share habits they do not own')
 owner.request('share',{'email':'bob@example.test','habit_ids':[h1],'permission':'participant','progress_visibility':'detailed','invitation_message':'Let’s grow'})
 check(h1 not in bob.ids(),'Pending invitations do not activate access')
 invite=bob.data()['incoming'][0];bob.request('respond',{'id':invite['id'],'status':'accepted'})
 check(h1 in bob.ids() and h2 not in bob.ids(),'Accepted individual invitation exposes only the selected habit')
 owner.request('share',{'email':'bob@example.test','habit_ids':[h1],'permission':'participant'})
 check(len([r for r in owner.data()['outgoing'] if r['habit_id']==h1 and r['recipient_email']=='bob@example.test'])==1,'Duplicate active invitations are prevented')
 owner.request('share',{'email':'nobody@example.test','habit_ids':[h2],'permission':'viewer'})
 check(any(r['recipient_email']=='nobody@example.test' and r['status']=='pending' and 'share_id' not in r for r in owner.data()['outgoing']),'Opaque pending receipts do not disclose account existence')
 owner.request('share',{'email':'viewer@example.test','habit_ids':[h1],'permission':'viewer','progress_visibility':'detailed'})
 vi=viewer.data()['incoming'][0];viewer.request('respond',{'id':vi['id'],'status':'accepted'})
 viewer.request('complete',{'habit_id':h1,'date':td,'amount':10},403);check(True,'Viewers cannot record completions')
 h=next(h for h in bob.data()['habits'] if h['id']==h1);h['name']='Illegal edit';bob.request('saveHabit',h,403);check(True,'Participants cannot edit habit details')
 bob.request('complete',{'habit_id':h1,'user_id':a['user']['id'],'date':td,'amount':10},403);check(True,'A participant cannot write another user’s completion record')
 owner.request('complete',{'habit_id':h1,'date':td,'amount':8,'note':'Private owner note'})
 bob.request('complete',{'habit_id':h1,'date':td,'amount':6,'note':'Private Bob note'})
 check(next(c for c in owner.data()['completions'] if c['habit_id']==h1)['amount']=='8.00','Participant progress does not overwrite owner progress')
 g=owner.request('group',params={'habit_id':h1,'start':td,'end':td});check(g['average']==80 and any(m['visibility']=='none' for m in g['members']),'Collaborator progress is hidden until their explicit consent')
 bob.request('consent',{'habit_id':h1,'progress_consent':'summary'})
 g=owner.request('group',params={'habit_id':h1,'start':td,'end':td});check(g['average']==70 and g['visible_count']==2,'Group average correctly combines 80% and 60% as 70%')
 bm=next(m for m in g['members'] if m['name']=='Bob');check('history' not in bm,'Summary consent never exposes detailed history')
 check('Private owner note' not in json.dumps(viewer.request('group',params={'habit_id':h1,'start':td,'end':td})),'Personal notes never appear in shared progress')
 receipt=next(r for r in owner.data()['outgoing'] if r['habit_id']==h1 and r['recipient_email']=='bob@example.test')
 owner.request('changeShare',{'id':receipt['id'],'permission':'editor','progress_visibility':'detailed'})
 h=next(h for h in bob.data()['habits'] if h['id']==h1);h['name']='Práctica colaborativa';h['owner_user_id']=999;bob.request('saveHabit',h)
 check(next(h for h in owner.data()['habits'] if h['id']==h1)['owner_user_id']==a['user']['id'],'Editors can edit details without transferring ownership')
 bob.request('archiveHabit',{'id':h1},403);bob.request('changeShare',{'id':receipt['id'],'status':'revoked'},404);check(True,'Editors cannot delete originals or change permissions')
 owner.request('changeShare',{'id':receipt['id'],'status':'revoked'})
 check(h1 not in bob.ids(),'Revoked access disappears on the next request')
 bob.request('complete',{'habit_id':h1,'date':td,'amount':10},404);bob.request('group',params={'habit_id':h1},expected=404);check(True,'Revocation immediately blocks progress writes and reads')
 check(owner.request('group',params={'habit_id':h1,'start':td,'end':td})['average']==80,'Revoked members are excluded from group averages')
 owner.request('share',{'email':'eve@example.test','habit_ids':[h1,h2],'permission':'participant'})
 for inv in eve.data()['incoming']:eve.request('respond',{'id':inv['id'],'status':'accepted'})
 check(h1 in eve.ids() and h2 in eve.ids() and h3 not in eve.ids(),'Selected habits share only checked items, not the full category')
 owner.request('share',{'email':'bob@example.test','category_id':category,'permission':'participant','include_future':False})
 inv=next(x for x in bob.data()['incoming'] if x['category_id']==category);bob.request('respond',{'id':inv['id'],'status':'accepted'})
 check({h1,h2,h3}.issubset(bob.ids()),'Category sharing includes current owner habits')
 h4=newhabit('Future category habit');check(h4 not in bob.ids(),'Future category habits are excluded by default')
 cr=next(x for x in owner.data()['outgoing'] if x['category_id']==category)
 owner.request('changeShare',{'id':cr['id'],'permission':'participant','include_future':True})
 check(h4 in bob.ids(),'Future habits appear only after explicit owner opt-in')
 edit(h4,category_id=other_category);check(h4 not in bob.ids(),'Moving a habit out of a shared category revokes inherited access')
 owner.request('changeShare',{'id':cr['id'],'permission':'participant','include_future':False})
 edit(h3,category_id=other_category);edit(h3,category_id=category)
 check(h3 not in bob.ids(),'A removed habit does not silently regain snapshot access when moved back')
 bob.request('requestCategory',{'name':'Creative practice','description':'Make things','icon':'music','color':'#F5C8D8','reason':'Useful for all members'})
 req=owner.request('admin')['requests'][0];owner.request('reviewCategory',{'id':req['id'],'status':'approved','feedback':'Welcome'})
 check(any(c['name']=='Creative practice' and c['owner_user_id'] is None for c in bob.data()['categories']),'Administrator approval creates a global category')
 check(any(n['message_key']=='notification_category_approved' for n in bob.data()['notifications']),'Approved requests notify their author')
 bob.request('requestCategory',{'name':'Duplicate proposal','description':'Test','reason':'Review please','color':'#B8A4D4'})
 req=owner.request('admin')['requests'][0];owner.request('reviewCategory',{'id':req['id'],'status':'rejected','feedback':''},422)
 owner.request('reviewCategory',{'id':req['id'],'status':'rejected','feedback':'Please use an existing category'})
 check(any(r['status']=='rejected' and r['feedback'] for r in bob.data()['requests']),'Rejected requests preserve feedback and notify the requester')
 bob.request('requestCategory',{'name':'Creative practice','description':'','reason':'Same','color':'#B8A4D4'},422);check(True,'Duplicate global categories are prevented')
 bh=newhabit('Bob secret habit',bobcat,bob)
 check(bh not in owner.ids() and 'Bob secret habit' not in json.dumps(owner.request('admin')),'Administrator privileges do not expose private habit contents')
 future=(datetime.date.fromisoformat(td)+datetime.timedelta(days=1)).isoformat()
 owner.request('complete',{'habit_id':h1,'date':future,'amount':10},422);check(True,'Future completions cannot be fabricated')
 gc=next(c for c in owner.data()['categories'] if c['owner_user_id'] is None)
 owner.request('saveTemplate',{'category_id':gc['id'],'name':'A test template','description':'','goal':1,'schedule_days':[1,3,5],'active':True})
 check(any(x['name']=='A test template' for x in bob.data()['templates']),'Published administrator templates are available to users')
 bobid=bob.boot()['user']['id'];owner.request('manageUser',{'id':bobid,'status':'suspended','admin':False})
 check(bob.boot()['user'] is None,'Suspension invalidates existing sessions')
 owner.request('manageUser',{'id':a['user']['id'],'status':'suspended','admin':False},422);check(True,'The active administrator cannot remove their own access')
 owner.request('platform',{'platform_name':'MI RUTINA','registration_enabled':False})
 guest.request('register',{'name':'Disabled','email':'disabled@example.test','password':PASSWORD},403)
 owner.request('platform',{'platform_name':'MI RUTINA','registration_enabled':True});check(True,'Registration settings are enforced on the server')
 owner.request('weight',{'date':td,'weight_kg':60.5});check(not eve.data()['weights'],'Weight entries remain private')
 newpwd='Changed-test-password-2026';owner.request('password',{'current_password':PASSWORD,'password':newpwd});check(device.boot()['user'] is None,'Changing password invalidates other devices')
 owner.request('password',{'current_password':newpwd,'password':PASSWORD})
 for path in ['config/local.php','storage/initial-access.txt','database/routine-nov-dec-2026.json','.git/config','app/Habits.php','tests/provision.php']:
  try:urllib.request.urlopen(BASE+'/'+path);raise AssertionError('Private path exposed: '+path)
  except urllib.error.HTTPError as e:check(e.code==404,'HTTP denies '+path)
 subprocess.run([PHP,'tests/constraints.php'],cwd=ROOT,env=env,check=True)
 (ROOT/'tests/.runtime/environment.json').write_text(json.dumps({'database':DB,'base_url':BASE,'env':{k:v for k,v in env.items() if k.startswith('RUTINA_')}},indent=2))
 check(True,'All tests ran against a dedicated MySQL database, without touching Aleina’s real data')
 print(f'\n{checks} HTTP assertions passed. Database retained for browser QA: {DB}',flush=True)
except Exception:
 if (ROOT/'tests/.runtime/server.log').exists():print((ROOT/'tests/.runtime/server.log').read_text()[-3000:],file=sys.stderr)
 raise
finally:
 if server:server.terminate();server.wait(timeout=10)
