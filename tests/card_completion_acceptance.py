"""Completing a linked activity moves only its own card to its sprint's Done column."""
import copy
import datetime
import uuid


def run(owner, other, guest, check):
    today = owner.data()['today']
    board = owner.request('createMindSpaceItem', dict(kind='kanban', name='Completion sync board', client_key=str(uuid.uuid4())))
    key, other_key, custom = [str(uuid.uuid4()) for _ in range(3)]
    content = dict(board['content'],
                   columns=board['content']['columns'] + [dict(id=custom, name='Review')],
                   cards=[dict(id=key, title='Finish proposal', description='Keep these details', status=custom, points=5),
                          dict(id=other_key, title='Finish proposal', description='A different card', status='doing', points=2)],
                   sprint=dict(name='Launch', goal='Keep the sprint', start=today, end=today))
    board = owner.request('saveMindSpaceItem', dict(id=board['id'], version=board['version'], content=content))

    def current():
        return next(item for item in owner.data()['mindspace']['items'] if item['id'] == board['id'])

    def save_content(value):
        latest = current()
        return owner.request('saveMindSpaceItem', dict(id=board['id'], version=latest['version'], content=value))

    task = dict(kind='task', name='Finish proposal', recurrence='once', start_date=today,
                source_item_id=board['id'], source_card_key=key)
    created = owner.request('saveCalendarEntry', task)['id']
    complete = dict(id=created, date=today, completed=True)
    guest.request('completeCalendarTask', complete, 401)
    owner.request('completeCalendarTask', complete, 419, csrf=False)
    other.request('completeCalendarTask', complete, 404)
    future = (datetime.date.fromisoformat(today) + datetime.timedelta(days=1)).isoformat()
    owner.request('completeCalendarTask', dict(complete, date=future), 422)
    owner.request('completeCalendarTask', dict(complete, completed='true'), 422)
    check(current() == board, 'Rejected task completions cannot move a linked card or change its board')

    unrelated = owner.request('saveCalendarEntry', {name:value for name,value in task.items() if not name.startswith('source_')})['id']
    owner.request('completeCalendarTask', dict(complete, id=unrelated))
    check(current() == board, 'Matching task titles alone never move a card without an explicit source link')

    owner.request('completeCalendarTask', complete, module='calendar')
    moved = current()
    expected = copy.deepcopy(board['content'])
    expected['cards'][0]['status'] = 'done'
    logs = owner.boot()['data']['calendar']['completions']
    check(moved['content'] == expected and moved['version'] == board['version'] + 1
          and any(log['task_id'] == created and log['completed_on'] == today for log in logs),
          'Completing a linked task persists Done and its completion together, preserving other cards, columns, points and sprint details')
    owner.request('saveMindSpaceItem', dict(id=board['id'], version=board['version'], content=board['content']), 409)
    owner.request('completeCalendarTask', complete)
    check(current()['version'] == moved['version'], 'Duplicate completion is idempotent and stale board saves cannot overwrite Done')
    owner.request('completeCalendarTask', dict(complete, completed=False))
    check(current()['content'] == expected, 'Undoing a personal completion does not move a board card backwards')

    content = copy.deepcopy(moved['content'])
    content['cards'][0]['status'] = 'doing'
    save_content(content)
    habit = owner.request('saveCalendarEntry', dict(task, kind='habit', recurrence='daily', goal=3))['id']
    owner.request('complete', dict(habit_id=habit, date=today, amount=1))
    check(current()['content']['cards'][0]['status'] == 'doing', 'Partial habit progress does not complete its linked card')
    owner.request('share', dict(email=other.boot()['user']['email'], habit_ids=[habit], permission='participant'))
    invitation = next(invite for invite in other.data()['incoming'] if invite['habit_id'] == habit)
    other.request('respond', dict(id=invitation['id'], status='accepted'))
    other.request('complete', dict(habit_id=habit, date=today, amount=3))
    check(current()['content']['cards'][0]['status'] == 'doing', 'A participant completing a shared habit cannot move a card in the owner’s board')
    owner.request('saveCalendarEntry', dict(task, id=habit, kind='habit', recurrence='daily', goal=10))
    owner.request('complete', dict(habit_id=habit, date=today, amount=3))
    check(current()['content']['cards'][0]['status'] == 'done', 'Reaching the owner’s recorded goal moves its card to Done even if the habit goal changed later')

    sprint_columns = [dict(id=str(uuid.uuid4()), name=name) for name in ['Pending', 'In Progress', 'Done']]
    content = copy.deepcopy(current()['content'])
    content['sprints'] = [dict(id=str(uuid.uuid4()), name='Second sprint', goal='', start=None, end=None, columns=sprint_columns)]
    content['cards'][0]['status'] = sprint_columns[1]['id']
    save_content(content)
    owner.request('completeCalendarTask', complete)
    check(current()['content']['cards'][0]['status'] == sprint_columns[2]['id'], 'A card in another sprint moves to that sprint’s Done column')

    missing = owner.request('saveCalendarEntry', dict(task, source_card_key=other_key))['id']
    content = copy.deepcopy(current()['content'])
    content['cards'] = [card for card in content['cards'] if card['id'] != other_key]
    after_delete = save_content(content)
    owner.request('completeCalendarTask', dict(complete, id=missing))
    check(current() == after_delete, 'A deleted source card does not block completion or recreate a card')
    owner.request('deleteMindSpaceItem', dict(id=board['id'], version=current()['version']))
    owner.request('completeCalendarTask', complete)
    owner.request('complete', dict(habit_id=habit, date=today, amount=3))
    check(not any(item['id'] == board['id'] for item in owner.data()['mindspace']['items']), 'Deleted boards do not block linked activity completion or reappear')
    for task_id in [created, unrelated, missing]:
        owner.request('deleteCalendarTask', dict(id=task_id))
    owner.request('deleteHabit', dict(id=habit))
