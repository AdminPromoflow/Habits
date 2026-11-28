"""Priority persistence, validation, personal preferences and linked board activities."""
import copy
import uuid


def run(owner, other, guest, check):
    today = owner.data()['today']
    check(owner.boot()['user']['priority_scale'] == 10, 'The default priority scale is 1–10')
    before = owner.boot()['user']
    for scale in [5,100,1000,37,1,10]:
        owner.request('settings', {'priority_scale':scale})
        user = owner.boot()['user']
        check(user['priority_scale'] == scale and user['language'] == before['language'] and user['timezone'] == before['timezone'], 'Priority preferences persist independently of other settings: '+str(scale))
    check(other.boot()['user']['priority_scale'] == 10, 'Priority preferences are private to each account')
    for invalid in [0,-1,1.5,1000001,True,[], '1e2']:
        owner.request('settings', {'priority_scale':invalid},422)
    base = dict(kind='task',name='Priority task',recurrence='once',start_date=today,scheduled_time='09:15',importance=7,urgency=9,priority_scale=10)
    task = owner.request('saveCalendarEntry',base)['id']
    def read_task(): return next(t for t in owner.data()['calendar']['tasks'] if t['id'] == task)
    check((read_task()['importance'],read_task()['urgency'],read_task()['scheduled_time']) == (7,9,'09:15:00'), 'Both priorities save alongside dates and times')
    owner.request('saveCalendarEntry', {k:v for k,v in dict(base,id=task).items() if k not in ['importance','urgency','priority_scale']})
    check(read_task()['importance'] == 7 and read_task()['urgency'] == 9, 'Older clients preserve existing priority fields')
    owner.request('settings',{'priority_scale':100})
    check(read_task()['importance'] == 7 and read_task()['priority_scale'] == 10, 'Changing the display scale preserves the original stored rating')
    for patch in [dict(importance=-1),dict(urgency=11),dict(importance=2.5),dict(urgency=True),dict(priority_scale=0)]:
        previous = read_task()
        owner.request('saveCalendarEntry',dict(base,id=task,name='Must roll back',**patch),422)
        check(read_task()==previous,'Invalid priorities roll back the entire task edit')
    owner.request('saveCalendarEntry',dict(base,id=task,importance=None,urgency=1,priority_scale=1))
    check(read_task()['importance'] is None and read_task()['urgency']==1, 'Important can be cleared while Urgent stays checked in binary mode')
    owner.request('saveCalendarEntry',dict(base,id=task,importance=0,urgency=0,priority_scale=1))
    check(read_task()['importance'] is None and read_task()['urgency'] is None, 'Zero represents unchecked in binary mode')
    other.request('saveCalendarEntry',dict(base,id=task),404)
    guest.request('saveCalendarEntry',base,401)
    owner.request('saveCalendarEntry',base,419,csrf=False)
    category = owner.request('saveCategory',{'name':'Priority test category'})['id']
    habit_data = dict(name='Priority pending habit',category_id=category,recurrence='pending',importance=8,urgency=None,priority_scale=10)
    habit = owner.request('saveHabit',habit_data)['id']
    saved = next(h for h in owner.data()['habits'] if h['id']==habit)
    check(saved['importance']==8 and saved['urgency'] is None and saved['recurrence']=='pending', 'Pending habits persist independent ratings')
    goal = owner.request('saveGoal',{'name':'Priority goal','importance':6,'urgency':5,'priority_scale':10})['id']
    saved_goal = next(g for g in owner.data()['goals']['items'] if g['id']==goal)
    check(saved_goal['importance']==6 and saved_goal['urgency']==5, 'Goals persist both ratings')
    space = owner.request('createMindSpace',{'name':'Priority QA','client_key':str(uuid.uuid4())})
    board = owner.request('createMindSpaceItem',{'mindspace_id':space['id'],'kind':'scrum','name':'Priority board','client_key':str(uuid.uuid4())})
    key = str(uuid.uuid4())
    content = copy.deepcopy(board['content']);content['cards']=[dict(id=key,title='Priority card',description='',status='backlog',points=0,importance=4,urgency=9,priority_scale=10)]
    board = owner.request('saveMindSpaceItem',{'id':board['id'],'version':board['version'],'content':content})
    def read_board(): return next(i for i in owner.data()['mindspace']['items'] if i['id']==board['id'])
    linked = owner.request('saveCalendarEntry',dict(kind='task',name='Linked priority',recurrence='once',start_date=today,source_item_id=board['id'],source_card_key=key))['id']
    def read_link(): return next(t for t in owner.data()['calendar']['tasks'] if t['id']==linked)
    check(read_link()['importance']==4 and read_link()['urgency']==9,'Scheduling a card inherits its priorities')
    owner.request('saveCalendarEntry',dict(kind='task',id=linked,name='Linked priority',recurrence='once',start_date=today,importance=2,urgency=None,priority_scale=5))
    card = read_board()['content']['cards'][0]
    check(card['importance']==2 and card['urgency'] is None and card['priority_scale']==5,'Editing the scheduled task synchronizes its card and version')
    previous = read_board(); content = copy.deepcopy(previous['content']);content['cards'][0].update(importance=3,urgency=5)
    owner.request('saveMindSpaceItem',dict(id=board['id'],version=previous['version'],content=content))
    check(read_link()['importance']==3 and read_link()['urgency']==5,'Editing a card synchronizes its scheduled activities')
    previous = read_board();content = copy.deepcopy(previous['content'])
    for k in ['importance','urgency','priority_scale']: content['cards'][0].pop(k)
    owner.request('saveMindSpaceItem',dict(id=board['id'],version=previous['version'],content=content))
    check(read_link()['importance']==3 and read_board()['content']['cards'][0]['urgency']==5,'Older board clients preserve ratings during card moves')
    owner.request('settings',{'priority_scale':10})
