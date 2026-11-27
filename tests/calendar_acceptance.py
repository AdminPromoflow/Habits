"""Planner persistence, ownership and recurrence through real HTTP endpoints."""
import datetime


def run(owner, other, guest, check):
    today = owner.data()['today']
    task = {'kind': 'task', 'name': 'Planner task <literal>', 'description': 'Private notes', 'recurrence': 'once', 'start_date': today, 'scheduled_time': '09:30'}
    guest.request('saveCalendarEntry', task, 401, module='calendar')
    owner.request('saveCalendarEntry', task, 419, csrf=False, module='calendar')
    created = owner.request('saveCalendarEntry', task, module='calendar')
    task_id = created['id']
    stored = next(t for t in owner.boot()['data']['calendar']['tasks'] if t['id'] == task_id)
    check(stored['name'] == task['name'] and stored['scheduled_time'] == '09:30:00' and stored['recurrence'] == 'once', 'Planner task persists its literal title, time and date through bootstrap')
    check(task_id not in [t['id'] for t in other.data()['calendar']['tasks']], 'Private calendar tasks are never returned to another account')
    other.request('saveCalendarEntry', dict(task, id=task_id), 404)
    other.request('deleteCalendarTask', {'id': task_id}, 404)
    other.request('completeCalendarTask', {'id': task_id, 'date': today, 'completed': True}, 404)
    check(True, 'Task editing, deletion and completion enforce ownership')
    owner.request('completeCalendarTask', {'id': task_id, 'date': today, 'completed': True})
    owner.request('completeCalendarTask', {'id': task_id, 'date': today, 'completed': True})
    check(len([c for c in owner.data()['calendar']['completions'] if c['task_id'] == task_id]) == 1, 'Completing an occurrence is idempotent and persists')
    owner.request('completeCalendarTask', {'id': task_id, 'date': today, 'completed': False})
    check(not any(c['task_id'] == task_id for c in owner.data()['calendar']['completions']), 'Undo completion removes only the selected occurrence')
    owner.request('saveCalendarEntry', dict(task, id=task_id, name='Updated task'))
    check(next(t for t in owner.data()['calendar']['tasks'] if t['id'] == task_id)['name'] == 'Updated task', 'Editing a task updates the saved record')
    for change in [{'recurrence':'invalid'}, {'recurrence':'weekly','schedule_days':[]}, {'recurrence':'weekly','schedule_days':[8]}, {'start_date':'2026-02-30'}, {'end_date':'2000-01-01'}, {'scheduled_time':'25:00'}]:
        owner.request('saveCalendarEntry', dict(task, **change), 422)
    check(True, 'Invalid recurrence, empty weekdays, dates and times are rejected on the server')
    weekly = owner.request('saveCalendarEntry', dict(task, recurrence='weekly', start_date='2020-01-06', schedule_days=[1,3,5]))['id']
    owner.request('completeCalendarTask', {'id':weekly,'date':'2020-01-07','completed':True},422)
    owner.request('completeCalendarTask', {'id':weekly,'date':'2020-01-08','completed':True})
    monthly = owner.request('saveCalendarEntry', dict(task, recurrence='monthly', start_date='2024-01-31'))['id']
    owner.request('completeCalendarTask', {'id':monthly,'date':'2024-02-29','completed':True})
    owner.request('completeCalendarTask', {'id':monthly,'date':'2024-03-30','completed':True},422)
    owner.request('completeCalendarTask', {'id':monthly,'date':'2024-03-31','completed':True})
    yearly = owner.request('saveCalendarEntry', dict(task, recurrence='yearly', start_date='2024-02-29'))['id']
    owner.request('completeCalendarTask', {'id':yearly,'date':'2025-02-28','completed':True})
    owner.request('completeCalendarTask', {'id':yearly,'date':'2025-03-01','completed':True},422)
    check(True, 'Weekly weekdays, short months, original month anchors and leap years agree with completion validation')
    future = (datetime.date.fromisoformat(today)+datetime.timedelta(days=1)).isoformat()
    owner.request('completeCalendarTask', {'id':weekly,'date':future,'completed':True},422)
    habit = owner.request('saveCalendarEntry', dict(task, kind='habit', recurrence='monthly', start_date='2024-01-31', goal=2))['id']
    saved = next(h for h in owner.data()['habits'] if h['id']==habit)
    check(saved['recurrence']=='monthly' and saved['goal']=='2.00' and saved['permission']=='owner', 'Planner habits become real habits with a personal category and recurrence')
    owner.request('complete', {'habit_id':habit,'date':'2024-02-29','amount':2})
    owner.request('complete', {'habit_id':habit,'date':'2024-02-28','amount':2},422)
    other.request('saveCalendarEntry', dict(task, kind='habit', id=habit, category_id=saved['category_id']),404)
    check(True, 'Habit completion honors recurrence and existing habit permissions remain enforced')
    owner.request('archiveHabit', {'id':habit})
    rules = [
        ('monthly', {'month_mode':'dates','month_days':[5,20],'interval':2}, ['2024-01-05','2024-03-20'], ['2024-02-05','2024-03-21']),
        ('yearly', {'month_mode':'dates','month_days':[5,20],'months':[2,5,11]}, ['2024-02-05','2025-05-20'], ['2024-03-05','2025-05-21']),
        ('monthly', {'month_mode':'weekdays','positions':[1,-1],'weekdays':[1],'interval':1}, ['2024-02-05','2024-02-26','2024-04-29'], ['2024-02-12','2024-02-27'])
    ]
    for frequency,rule,yes,no in rules:
        rid = owner.request('saveCalendarEntry',dict(task,kind='habit',recurrence=frequency,start_date='2024-01-01',recurrence_rule=rule))['id']
        check(next(h for h in owner.data()['habits'] if h['id']==rid)['recurrence_rule']=={k:sorted(v) if isinstance(v,list) else v for k,v in rule.items()},'Custom recurrence survives saving and bootstrap')
        for date in yes: owner.request('complete',{'habit_id':rid,'date':date,'amount':1})
        for date in no: owner.request('complete',{'habit_id':rid,'date':date,'amount':1},422)
        owner.request('deleteHabit',{'id':rid})
    for bad in [{'months':[]},{'months':[13]},{'month_days':[]},{'month_mode':'weekdays','positions':[],'weekdays':[1]},{'month_mode':'weekdays','positions':[1],'weekdays':[8]}]:
        owner.request('saveCalendarEntry',dict(task,kind='habit',recurrence='yearly',recurrence_rule=bad),422)
    check(True,'Custom month and ordinal schedules reject invalid selections and enforce dates')
    import uuid
    diagram = owner.request('saveDiagram',{'name':'Planner source','client_key':str(uuid.uuid4())})
    linked = owner.request('saveCalendarEntry',dict(task,kind='habit',recurrence='daily',source_diagram_id=diagram['id'],source_node_key='root'))['id']
    saved_link = next(h for h in owner.data()['habits'] if h['id']==linked)
    check(saved_link['source_diagram_id']==diagram['id'] and saved_link['source_node_key']=='root','A saved habit remembers its diagram node for editing and deletion')
    other.request('saveCalendarEntry',dict(task,source_diagram_id=diagram['id'],source_node_key='root'),404)
    owner.request('saveCalendarEntry',dict(task,source_diagram_id=diagram['id'],source_node_key='missing'),404)
    guest.request('deleteHabit',{'id':linked},401)
    owner.request('deleteHabit',{'id':linked},419,csrf=False)
    other.request('deleteHabit',{'id':linked},404)
    owner.request('complete',{'habit_id':linked,'date':today,'amount':1})
    owner.request('share',{'email':other.boot()['user']['email'],'habit_ids':[linked],'permission':'editor'})
    invitation=next(i for i in other.data()['incoming'] if i['habit_id']==linked)
    other.request('respond',{'id':invitation['id'],'status':'accepted'})
    other.request('deleteHabit',{'id':linked},403)
    item=owner.request('createMindSpaceItem',{'kind':'habits','name':'Linked habits','client_key':str(uuid.uuid4())})
    owner.request('saveMindSpaceItem',{'id':item['id'],'version':item['version'],'content':{'habit_ids':[linked]}})
    owner.request('deleteHabit',{'id':linked})
    check(linked not in owner.ids() and linked not in other.ids() and not any(c['habit_id']==linked for c in owner.data()['completions']),'Only the owner can delete a habit, its completions and shared access')
    check(next(i for i in owner.data()['mindspace']['items'] if i['id']==item['id'])['content']['habit_ids']==[],'Deleting a habit clears document references without deleting the document')
    owner.request('complete',{'habit_id':linked,'date':today,'amount':1},404)
    owner.request('deleteDiagram',{'id':diagram['id'],'version':diagram['version']})
    for tid in [task_id, weekly, monthly, yearly]: owner.request('deleteCalendarTask', {'id':tid})
    check(not any(c['task_id'] in [task_id,weekly,monthly,yearly] for c in owner.data()['calendar']['completions']), 'Deleting recurring tasks also removes their completion records')
    test_schedule_range(owner, check)
    test_categories(owner, other, task, check)


def test_schedule_range(owner, check):
    start, end = '2024-02-01', '2024-02-02'
    for kind in ['task', 'habit']:
        payload = dict(kind=kind, name=f'{kind} with start and end', recurrence='once' if kind == 'task' else 'daily', start_date=start, scheduled_time='09:30', end_date=end, end_time='10:45')
        created = owner.request('saveCalendarEntry', payload)['id']
        payload['id'] = created
        def saved():
            data = owner.boot()['data']
            return next(e for e in (data['calendar']['tasks'] if kind == 'task' else data['habits']) if e['id'] == created)
        entry = saved()
        check((entry['start_date'], entry['scheduled_time'], entry['end_date'], entry['end_time']) == (start, '09:30:00', end, '10:45:00'), f'{kind} start/end dates and times persist through bootstrap')
        complete_action = 'completeCalendarTask' if kind == 'task' else 'complete'
        complete_data = {'id':created, 'completed':True} if kind == 'task' else {'habit_id':created, 'amount':1}
        owner.request(complete_action, dict(complete_data, date=end), 422 if kind == 'task' else 200)
        owner.request(complete_action, dict(complete_data, date='2024-02-03'), 422)
        check(True, f'{kind} end fields preserve its one-off or recurring schedule')
        owner.request('saveCalendarEntry', {key:value for key,value in payload.items() if key != 'end_time'})
        check(saved()['end_time'] == '10:45:00', f'An older client omitting end_time preserves the saved {kind} end time')
        for date, time in [('', '10:45'), (end, ''), ('', ''), (start, '09:30:00'), (end, '00:00')]:
            owner.request('saveCalendarEntry', dict(payload, end_date=date, end_time=time))
            entry = saved()
            check(entry['end_date'] == (date or None) and entry['end_time'] == (time[:5]+':00' if time else None), f'{kind} accepts independent optional end fields ({date!r}, {time!r})')
        for change in [dict(end_date=start, end_time='09:29'), dict(end_date='2024-01-31'), dict(end_time='24:00'), dict(end_time='12:60'), dict(end_time=False), dict(end_time='10:45:01')]:
            owner.request('saveCalendarEntry', dict(payload, **change), 422)
        check(saved()['end_time'] == '00:00:00', f'Invalid {kind} end dates/times are rejected without changing its saved schedule')
        owner.request('saveCalendarEntry', dict(payload, scheduled_time='', end_date='', end_time='10:45'))
        check(saved()['scheduled_time'] is None and saved()['end_time'] == '10:45:00', f'{kind} end time can be saved without a start time or end date')
        # The separate habit editor uses saveHabit, which must share the same validation/persistence.
        if kind == 'habit':
            owner.request('saveHabit', dict(payload, category_id=saved()['category_id'], end_time='11:15'))
            check(saved()['end_time'] == '11:15:00', 'The full habit editor saves end times too')
        owner.request('saveCalendarEntry', dict(payload, recurrence='pending'))
        entry = saved()
        check(all(entry[key] is None for key in ['start_date','end_date','scheduled_time','end_time']), f'Moving {kind} to Pendings clears the full date/time range')
        owner.request('deleteCalendarTask' if kind == 'task' else 'deleteHabit', {'id':created})


def test_categories(owner, other, task, check):
    import uuid
    def folder(client, name, parent=None):
        return client.request('createMindSpaceItem',dict(kind='folder',name=name,parent_id=parent,client_key=str(uuid.uuid4())))
    parent=folder(owner,'Planner parent')
    child=folder(owner,'Planner child',parent['id'])
    foreign=folder(other,'Private folder')
    first=owner.request('saveCalendarEntry',dict(task,category_choice=f"folder:{child['id']}"))['id']
    stored=next(t for t in owner.data()['calendar']['tasks'] if t['id']==first)
    category=next(c for c in owner.data()['categories'] if c['id']==stored['category_id'])
    check(category['source_folder_id']==child['id'] and category['name']=='Planner child','Task category persists as a reference to the selected folder')
    habit=owner.request('saveCalendarEntry',dict(task,kind='habit',recurrence='daily',category_choice=f"folder:{child['id']}"))['id']
    check(next(h for h in owner.data()['habits'] if h['id']==habit)['category_id']==category['id'],'Tasks and habits reuse the same folder category')
    owner.request('saveCalendarEntry',dict(task,id=first,name='Edited categorized task'))
    check(next(t for t in owner.data()['calendar']['tasks'] if t['id']==first)['category_id']==category['id'],'Older clients preserve a task category when omitting the new field')
    owner.request('deleteCategory',{'id':category['id']},422)
    child=owner.request('saveMindSpaceItem',dict(id=child['id'],version=child['version'],name='Renamed planner folder'))
    check(next(c for c in owner.data()['categories'] if c['id']==category['id'])['name']=='Renamed planner folder','Renaming a folder keeps its category and existing activities together')
    owner.request('saveCalendarEntry',dict(task,id=first,category_choice=f"folder:{parent['id']}"))
    parent_category=next(t for t in owner.data()['calendar']['tasks'] if t['id']==first)['category_id']
    check(parent_category!=category['id'],'An existing task can move to its parent folder category')
    root=owner.request('saveCalendarEntry',dict(task,category_choice=f"space:{parent['mindspace_id']}"))['id']
    root_category=next(t for t in owner.data()['calendar']['tasks'] if t['id']==root)['category_id']
    check(next(c for c in owner.data()['categories'] if c['id']==root_category)['source_mindspace_id']==parent['mindspace_id'],'A main space is selectable as a root folder category')
    owner.request('saveCalendarEntry',dict(task,category_choice=f"folder:{foreign['id']}"),404)
    other.request('saveCalendarEntry',dict(task,category_choice=f"category:{category['id']}"),404)
    other.request('saveCalendarEntry',dict(task,category_choice=f"space:{parent['mindspace_id']}"),404)
    other.request('saveCalendarEntry',dict(task,category_id=category['id']),404)
    for bad in ['invalid','folder:0','folder:1 OR 1=1']:
        owner.request('saveCalendarEntry',dict(task,category_choice=bad),422)
    check(True,'Category and folder selection enforces ownership and validates the submitted choice')
    before=len(owner.data()['categories'])
    owner.request('saveCalendarEntry',dict(task,category_choice='new',new_category_name='Rollback category',start_date='invalid'),422)
    owner.request('saveCalendarEntry',dict(task,category_choice='new',new_category_name='  '),422)
    owner.request('saveCalendarEntry',dict(task,category_choice='new',new_category_name='Invalid color',new_category_color='red'),422)
    check(len(owner.data()['categories'])==before,'A failed activity save does not leave an orphan category')
    custom=owner.request('saveCalendarEntry',dict(task,category_choice='new',new_category_name='Planner new category',new_category_color='#2874A6'))['id']
    custom_category=next(t for t in owner.data()['calendar']['tasks'] if t['id']==custom)['category_id']
    check(next(c for c in owner.data()['categories'] if c['id']==custom_category)['color']=='#2874A6','Inline category creation preserves the selected color')
    second=owner.request('saveCalendarEntry',dict(task,category_choice='new',new_category_name='Planner new category',new_category_color='#CC3366'))['id']
    check(next(t for t in owner.data()['calendar']['tasks'] if t['id']==second)['category_id']==custom_category,'Inline category creation saves atomically and reuses an existing private name')
    check(next(c for c in owner.data()['categories'] if c['id']==custom_category)['color']=='#2874A6','Reusing a category name does not recolor its other activities')
    owner.request('saveCalendarEntry',dict(task,kind='habit',id=habit,category_choice=f'category:{custom_category}'))
    check(next(h for h in owner.data()['habits'] if h['id']==habit)['category_id']==custom_category,'Existing habits can change category from the planner')
    global_category=next(c for c in owner.data()['category_catalog'] if not c['selected'])['id']
    owner.request('saveCalendarEntry',dict(task,id=second,category_choice=f'category:{global_category}'))
    check(any(c['id']==global_category for c in owner.data()['categories']),'Explicitly choosing a catalog category enrolls the current user')
    owner.request('leaveCategory',{'id':global_category},422)
    owner.request('saveCalendarEntry',dict(task,id=first,category_choice=f"folder:{child['id']}"))
    owner.request('deleteMindSpaceItem',dict(id=parent['id'],version=parent['version']))
    after=owner.data()
    check(next(t for t in after['calendar']['tasks'] if t['id']==first)['category_id']==category['id'] and next(c for c in after['categories'] if c['id']==category['id'])['source_folder_id'] is None,'Deleting a folder preserves its category and planned activities')
    today = owner.data()['today']
    for kind in ['task', 'habit']:
        pending = {'kind': kind, 'name': f'Pending {kind}', 'recurrence': 'pending', 'category_choice': 'default'}
        created = owner.request('saveCalendarEntry', dict(pending, start_date='invalid', end_date='invalid', scheduled_time='25:99', end_time='invalid', schedule_days=[9], recurrence_rule={'invalid': True}))['id']
        def saved():
            data = owner.boot()['data']
            return next(e for e in (data['calendar']['tasks'] if kind == 'task' else data['habits']) if e['id'] == created)
        entry = saved()
        check(entry['recurrence'] == 'pending' and entry['start_date'] is None and entry['end_date'] is None and entry['scheduled_time'] is None and entry['end_time'] is None and entry['schedule_days'] == [] and not entry['recurrence_rule'], f'Pending {kind} persists without dates, times, weekdays or recurrence rules, even if stale fields are submitted')
        other.request('saveCalendarEntry', dict(pending, id=created), 404)
        complete_action = 'completeCalendarTask' if kind == 'task' else 'complete'
        complete_data = {'id':created, 'date':today, 'completed':True} if kind == 'task' else {'habit_id':created, 'date':today, 'amount':1}
        owner.request(complete_action, complete_data, 422)
        owner.request('saveCalendarEntry', {'id':created, 'kind':kind, 'name':f'Renamed pending {kind}'})
        check(saved()['recurrence'] == 'pending' and saved()['start_date'] is None, f'Editing a pending {kind} without schedule fields does not silently schedule it')
        scheduled = dict(pending, id=created, recurrence='once' if kind == 'task' else 'weekly', start_date=today, schedule_days=[datetime.date.fromisoformat(today).isoweekday()])
        owner.request('saveCalendarEntry', scheduled)
        owner.request(complete_action, complete_data)
        check(saved()['start_date'] == today and saved()['recurrence'] != 'pending', f'Pending {kind} can be scheduled and completed normally')
        owner.request('saveCalendarEntry', dict(pending, id=created))
        check(saved()['start_date'] is None and saved()['recurrence'] == 'pending', f'A scheduled {kind} can return to Pendings without a placeholder date')
