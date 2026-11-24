"""Generalized diagram links through real HTTP and MySQL persistence."""
import copy
import uuid


def run(owner, other, guest, check):
    def create(kind, client=owner):
        return client.request('createMindSpaceItem', dict(kind=kind, name='Link QA ' + kind,
            client_key=str(uuid.uuid4())), module='mindspaces')

    def content(item, value):
        return owner.request('saveMindSpaceItem', dict(id=item['id'], version=item['version'],
            content=value), module='mindspaces')

    source = create('diagram')

    def current():
        return next(d for d in owner.request('diagrams', module='diagrams') if d['id'] == source['diagram_id'])

    def save(link, expected=200):
        fresh = current()
        nodes = copy.deepcopy(fresh['nodes'])
        nodes[0]['link'] = link
        return owner.request('saveDiagram', dict(id=fresh['id'], version=fresh['version'],
            name=fresh['name'], nodes=nodes), expected, module='diagrams')

    def link(item, type=None, key=None):
        return dict(item_id=item['id'], target=dict(type=type, id=key) if type else None)

    targets = {kind: create(kind) for kind in ['folder', 'notes', 'spreadsheet', 'kanban', 'scrum', 'habits']}
    for item in targets.values():
        saved = save(link(item))
        assert saved['nodes'][0]['link'] == current()['nodes'][0]['link'] == link(item)
    check(True, 'Diagram links to every non-diagram item type persist and reload')

    sheet = targets['spreadsheet'] = content(targets['spreadsheet'], dict(rows=200, columns=52,
        cells={'A1': '2', 'B3': '=A1*3'}))
    for address in ['A1', 'B3', 'AA100', 'AZ200']:
        target = link(sheet, 'cell', address)
        assert save(target)['nodes'][0]['link'] == current()['nodes'][0]['link'] == target
    check(True, 'Cell links persist formulas, empty cells and the AZ200 sheet boundary')

    for kind in ['kanban', 'scrum']:
        card_id = str(uuid.uuid4())
        board = targets[kind] = content(targets[kind], dict(cards=[dict(id=card_id,
            title='Specific card', description='', status='todo', points=2)]))
        target = link(board, 'card', card_id)
        assert save(target)['nodes'][0]['link'] == current()['nodes'][0]['link'] == target
    check(True, 'Kanban and Scrum links keep the selected card ID')

    for kind, statuses in [('kanban', ['backlog', 'todo', 'doing', 'done']), ('scrum', ['backlog', 'todo', 'doing', 'done'])]:
        for status in statuses:
            target = link(targets[kind], 'column', status)
            assert save(target)['nodes'][0]['link'] == current()['nodes'][0]['link'] == target
    check(True, 'All Scrum and Kanban columns persist as link targets, including empty columns')
    target = link(targets['scrum'], 'column', 'todo')
    save(target)
    updated = copy.deepcopy(targets['scrum']['content'])
    updated['cards'][0]['status'] = 'doing'
    targets['scrum'] = content(targets['scrum'], updated)
    assert current()['nodes'][0]['link'] == target
    assert save(target)['nodes'][0]['link'] == target
    check(True, 'Moving cards between columns does not change a saved column destination')
    custom_id = str(uuid.uuid4())
    updated['columns'].append(dict(id=custom_id, name='Review'))
    updated['cards'][0]['status'] = custom_id
    targets['scrum'] = content(targets['scrum'], updated)
    target = link(targets['scrum'], 'column', custom_id)
    assert save(target)['nodes'][0]['link'] == current()['nodes'][0]['link'] == target
    check(True, 'Links to custom board columns persist by stable ID alongside their cards')

    habits = targets['habits'] = owner.request('addMindSpaceHabit', dict(id=targets['habits']['id'],
        version=targets['habits']['version'], habit=dict(name='Link target habit', category_id=0,
        goal=1, unit='session')), module='mindspaces')
    habit_id = str(habits['content']['habit_ids'][0])
    target = link(habits, 'habit', habit_id)
    assert save(target)['nodes'][0]['link'] == current()['nodes'][0]['link'] == target
    check(True, 'A link selects a real owned habit within its habit document')

    private = create('spreadsheet', other)
    private_board = create('scrum', other)
    before = current()
    invalid = [link(private), link(source), dict(item_id=987654321, target=None),
        dict(item_id=True, target=None), dict(item_id=str(sheet['id']), target=None),
        dict(item_id=sheet['id']), dict(item_id=sheet['id'], diagram_id=before['id'], target=None),
        dict(item_id=sheet['id'], target=[]), link(sheet, 'cell', 3),
        link(sheet, 'card', str(uuid.uuid4())), link(targets['notes'], 'cell', 'A1'),
        link(targets['kanban'], 'card', str(uuid.uuid4())), link(habits, 'habit', '987654321'),
        link(targets['folder'], 'unknown', 'anything'), link(private_board, 'column', 'todo'),
        link(sheet, 'column', 'todo'), link(targets['notes'], 'column', 'todo'),
        link(targets['kanban'], 'column', custom_id), link(targets['scrum'], 'column', 'archived'),
        link(targets['scrum'], 'column', 'In progress'), link(targets['scrum'], 'column', 'todo<script>')]
    invalid += [link(sheet, 'cell', address) for address in ['A0', 'A01', 'a1', 'BA1', 'A201', 'A1:B3', 'A1<script>']]
    for value in invalid:
        save(value, 422)
        assert current() == before
    check(True, 'Foreign, missing, wrong-kind, out-of-bounds and malformed targets fail atomically')

    payload = dict(id=before['id'], version=before['version'], name=before['name'], nodes=before['nodes'])
    other.request('saveDiagram', payload, 404, module='diagrams')
    guest.request('saveDiagram', payload, 401, module='diagrams')
    owner.request('saveDiagram', payload, 419, csrf=False, module='diagrams')
    owner.request('saveDiagram', dict(payload, version=before['version']-1), 409, module='diagrams')
    check(current() == before, 'Item link edits retain authentication, ownership, CSRF and version protection')

    saved = save(link(sheet, 'cell', 'B3'))
    legacy = copy.deepcopy(saved['nodes'])
    legacy[0].pop('link')
    retained = owner.request('saveDiagram', dict(id=saved['id'], version=saved['version'],
        name=saved['name'], nodes=legacy), module='diagrams')
    check(retained['nodes'][0]['link'] == link(sheet, 'cell', 'B3'), 'Older clients preserve generalized links when omitting link')

    owner.request('deleteMindSpaceItem', dict(id=sheet['id'], version=sheet['version']), module='mindspaces')
    saved = save(link(sheet, 'cell', 'B3'))
    check(saved['nodes'][0]['link'] == link(sheet, 'cell', 'B3'), 'An unchanged link to a deleted document does not block saving the source')
    save(link(sheet, 'cell', 'A1'), 422)
    card_id = targets['kanban']['content']['cards'][0]['id']
    save(link(targets['kanban'], 'card', card_id))
    targets['kanban'] = content(targets['kanban'], dict(cards=[]))
    save(link(targets['kanban'], 'card', card_id))
    save(None)
    save(link(targets['kanban'], 'card', card_id), 422)
    save(link(habits, 'habit', habit_id))
    content(habits, dict(habit_ids=[]))
    save(None)
    save(link(habits, 'habit', habit_id), 422)
    check(current()['nodes'][0].get('link') is None, 'Removed cards or detached habits cannot receive new links, and existing links can be removed')
