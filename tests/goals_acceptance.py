"""Private goal CRUD and atomic links across activities and board cards."""
import copy
import uuid


def run(owner, other, guest, check):
    today = owner.data()['today']
    guest.request('saveGoal', {'name': 'Private'}, 401)
    owner.request('saveGoal', {'name': 'Private'}, 419, csrf=False)
    owner.request('saveGoal', {'name': '   '}, 422)
    first = owner.request('saveGoal', {'name': 'Exercise regularly', 'description': 'Five exercises', 'target_date': today})['id']
    second = owner.request('saveGoal', {'name': 'Feel stronger'})['id']
    foreign = other.request('saveGoal', {'name': 'Private other goal'})['id']
    check({g['id'] for g in owner.data()['goals']['items']} == {first, second}, 'Goal reads are private; create validates name, login and CSRF')
    other.request('saveGoal', {'id': first, 'name': 'Stolen'}, 404)
    other.request('deleteGoal', {'id': first}, 404)
    owner.request('saveGoal', {'id': first, 'name': 'Exercise consistently', 'description': 'Updated', 'status': 'completed', 'target_date': today})
    saved = next(g for g in owner.data()['goals']['items'] if g['id'] == first)
    check(saved['name'] == 'Exercise consistently' and saved['status'] == 'completed' and saved['target_date'] == today, 'Owned goals can be updated with status and optional target date')

    task_data = dict(kind='task', name='Do five exercises', recurrence='once', start_date=today, goal_ids=[first, second, first])
    task = owner.request('saveCalendarEntry', task_data)['id']

    def goal_ids(kind, id):
        return {row['goal_id'] for row in owner.data()['goals']['links'] if row['kind'] == kind and row.get('id') == id}

    check(goal_ids('task', task) == {first, second}, 'An activity can contribute to multiple goals without duplicate links')
    owner.request('saveCalendarEntry', dict(task_data, id=task, name='Must roll back', goal_ids=[foreign]), 404)
    owner.request('saveCalendarEntry', dict(task_data, id=task, goal_ids='1'), 422)
    check(goal_ids('task', task) == {first, second} and next(t for t in owner.data()['calendar']['tasks'] if t['id'] == task)['name'] == task_data['name'], 'Foreign or invalid goal links roll back the entire activity update')
    owner.request('saveCalendarEntry', {k: v for k, v in dict(task_data, id=task).items() if k != 'goal_ids'})
    check(goal_ids('task', task) == {first, second}, 'Older clients that omit goal selection preserve activity associations')
    owner.request('completeCalendarTask', dict(id=task, date=today, completed=True))
    check(any(c['task_id'] == task for c in owner.data()['calendar']['completions']), 'Linked task completions are available to goal progress')
    category = owner.request('saveCategory', {'name': 'Goal exercises'})['id']
    habit_data = dict(name='Stretch', category_id=category, recurrence='daily', start_date=today, goal=5, goal_ids=[second])
    habit = owner.request('saveHabit', habit_data)['id']
    check(goal_ids('habit', habit) == {second}, 'Full habit forms support goals independently of the numeric habit target')

    board = owner.request('createMindSpaceItem', dict(kind='kanban', name='Goals board', client_key=str(uuid.uuid4())))
    key = str(uuid.uuid4())
    content = dict(board['content'], cards=[dict(id=key, title='Five exercises on board', description='', status='backlog', points=1, goal_ids=[first])])
    board = owner.request('saveMindSpaceItem', dict(id=board['id'], version=board['version'], content=content))
    check('goal_ids' not in board['content']['cards'][0], 'Private goal assignments are stored outside shared board content')

    def current_board():
        return next(item for item in owner.data()['mindspace']['items'] if item['id'] == board['id'])

    def save_board(content):
        return owner.request('saveMindSpaceItem', dict(id=board['id'], version=current_board()['version'], content=content))

    linked = owner.request('saveCalendarEntry', dict(kind='task', name='Scheduled exercises', recurrence='once', start_date=today, source_item_id=board['id'], source_card_key=key))['id']
    check(goal_ids('task', linked) == {first}, 'Scheduling a card inherits its goals without requiring the client to resend them')
    content = copy.deepcopy(current_board()['content'])
    content['cards'][0]['goal_ids'] = [second]
    content['cards'][0]['status'] = 'done'
    save_board(content)
    link = next(l for l in owner.data()['goals']['links'] if l['kind'] == 'card' and l['item_id'] == board['id'])
    check(goal_ids('task', linked) == {second} and link['completed_on'] == today, 'Board goal changes synchronize the scheduled activity and record Done dates')
    owner.request('saveCalendarEntry', dict(kind='task', id=linked, name='Scheduled exercises', recurrence='once', start_date=today, goal_ids=[first, second]))
    card_goals = {l['goal_id'] for l in owner.data()['goals']['links'] if l['kind'] == 'card' and l['item_id'] == board['id']}
    check(card_goals == {first, second}, 'Editing goals from the scheduled task also updates its card associations')
    content = copy.deepcopy(current_board()['content']); content['cards'][0]['status'] = 'doing'; save_board(content)
    check(all(l['completed_on'] is None for l in owner.data()['goals']['links'] if l['kind'] == 'card' and l['item_id'] == board['id']), 'Moving a card out of Done clears its board completion')
    content = copy.deepcopy(current_board()['content']); content['cards'][0]['goal_ids'] = [foreign]
    before = current_board()
    owner.request('saveMindSpaceItem', dict(id=board['id'], version=before['version'], content=content), 404)
    check(current_board() == before, 'Unauthorized goals roll back card changes and board version atomically')
    owner.request('saveCalendarEntry', dict(task_data, id=task, goal_ids=[]))
    check(not goal_ids('task', task), 'Clearing all selected goals removes associations')
    owner.request('deleteGoal', {'id': second})
    data = owner.data()
    check(not any(l['goal_id'] == second for l in data['goals']['links']) and any(t['id'] == linked for t in data['calendar']['tasks']) and any(h['id'] == habit for h in data['habits']), 'Deleting a goal clears links while preserving tasks, habits and board cards')
    owner.request('deleteCalendarTask', {'id': linked})
    check(not goal_ids('task', linked), 'Deleting an activity cascades its goal associations')
    content = copy.deepcopy(current_board()['content']); content['cards'] = []; save_board(content)
    check(not any(l['kind'] == 'card' and l['item_id'] == board['id'] for l in owner.data()['goals']['links']), 'Deleting a board card removes stale goal links')

