"""Daily display order persists without modifying task content or other accounts."""
import datetime


def run(owner, other, guest, check):
    date = owner.data()['today']
    tomorrow = (datetime.date.fromisoformat(date) + datetime.timedelta(days=1)).isoformat()
    base = {'kind': 'task', 'name': 'Order first task', 'recurrence': 'daily', 'start_date': date, 'scheduled_time': '09:00'}
    first = owner.request('saveCalendarEntry', base)['id']
    second = owner.request('saveCalendarEntry', dict(base, name='Order second task'))['id']
    habit = owner.request('saveCalendarEntry', dict(base, kind='habit', name='Order habit'))['id']
    order = [f'task:{second}', f'habit:{habit}', f'task:{first}']
    payload = {'date': date, 'order': order}
    guest.request('saveCalendarOrder', payload, 401, module='calendar')
    owner.request('saveCalendarOrder', payload, 419, csrf=False, module='calendar')
    owner.request('saveCalendarOrder', payload, module='calendar')
    check(owner.boot()['data']['calendar']['orders'][date] == order, 'Manual task/habit order survives bootstrap with typed IDs')
    other.request('saveCalendarOrder', payload, 404)
    check(not other.data()['calendar']['orders'].get(date), 'Daily order is private to its account')
    owner.request('saveCalendarOrder', {'date': tomorrow, 'order': list(reversed(order))})
    saved = owner.data()['calendar']['orders']
    check(saved[date] == order and saved[tomorrow] == list(reversed(order)), 'Reordering tomorrow leaves today unchanged')
    for invalid in [order + [order[0]], ['task:0'], ['task:1 OR 1=1'], [1], {'first': order[0]}]:
        owner.request('saveCalendarOrder', {'date': date, 'order': invalid}, 422)
    owner.request('saveCalendarOrder', {'date': '2026-02-30', 'order': order}, 422)
    owner.request('saveCalendarOrder', {'date': '2020-01-01', 'order': order}, 404)
    check(owner.data()['calendar']['orders'][date] == order, 'Invalid, duplicate and unscheduled entries leave the saved order intact')
    owner.request('completeCalendarTask', {'id': second, 'date': date, 'completed': True})
    data = owner.data()['calendar']
    check(data['orders'][date] == order and next(task for task in data['tasks'] if task['id'] == first)['scheduled_time'] == '09:00:00', 'Completion and task times remain independent of manual ordering')
