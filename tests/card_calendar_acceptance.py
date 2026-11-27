"""Card-to-planner links persist independently of the board and enforce ownership."""
import uuid


def run(owner, other, guest, check):
    board = owner.request('createMindSpaceItem', dict(kind='kanban', name='Card calendar board', client_key=str(uuid.uuid4())))
    key = str(uuid.uuid4())
    content = dict(board['content'], cards=[dict(id=key, title='Plan the launch', description='Call the team', status='todo', points=2)])
    board = owner.request('saveMindSpaceItem', dict(id=board['id'], version=board['version'], content=content))
    task = dict(kind='task', name='Plan the launch', description='Call the team', recurrence='once', start_date=owner.data()['today'],
                source_item_id=board['id'], source_card_key=key)
    guest.request('saveCalendarEntry', task, 401)
    owner.request('saveCalendarEntry', task, 419, csrf=False)
    other.request('saveCalendarEntry', task, 404)
    owner.request('saveCalendarEntry', dict(task, source_card_key='missing'), 404)
    owner.request('saveCalendarEntry', dict(task, source_diagram_id=1, source_node_key='root'), 422)
    check(True, 'Card scheduling rejects guests, missing CSRF, foreign boards, absent cards and conflicting sources')
    created = owner.request('saveCalendarEntry', task)['id']
    stored = next(entry for entry in owner.boot()['data']['calendar']['tasks'] if entry['id'] == created)
    check(stored['source_item_id'] == board['id'] and stored['source_card_key'] == key and stored['description'] == task['description'],
          'Card tasks persist their board, card, description and date through reload')
    check(not any(entry['id'] == created for entry in other.data()['calendar']['tasks']), 'Scheduled card tasks stay in their owner’s personal planner')
    habit = owner.request('saveCalendarEntry', dict(task, kind='habit', recurrence='daily'))['id']
    linked_habit = next(entry for entry in owner.data()['habits'] if entry['id'] == habit)
    check(linked_habit['source_item_id'] == board['id'] and linked_habit['source_card_key'] == key, 'The same card calendar can create a linked habit')
    updated = {key:value for key,value in task.items() if not key.startswith('source_')}
    owner.request('saveCalendarEntry', dict(updated, id=created, name='Updated planned task'))
    saved = next(entry for entry in owner.data()['calendar']['tasks'] if entry['id'] == created)
    check(saved['name'] == 'Updated planned task' and saved['source_card_key'] == key, 'Editing an activity preserves its card link without creating another task')
    content['cards'] = []
    board = owner.request('saveMindSpaceItem', dict(id=board['id'], version=board['version'], content=content))
    owner.request('saveCalendarEntry', task, 404)
    owner.request('saveCalendarEntry', dict(updated, id=created))
    owner.request('deleteMindSpaceItem', dict(id=board['id'], version=board['version']))
    data = owner.data()
    check(next(entry for entry in data['calendar']['tasks'] if entry['id'] == created)['source_item_id'] is None
          and next(entry for entry in data['habits'] if entry['id'] == habit)['source_item_id'] is None,
          'Deleting a card or board preserves its tasks and habits, and removes the deleted board reference')
    owner.request('deleteCalendarTask', dict(id=created))
    owner.request('deleteHabit', dict(id=habit))
