"""Additional connections stay independent of ancestry and private/versioned."""
import copy
import uuid


def run(owner, other, guest, check):
    a, b, child, foreign = (str(uuid.uuid4()) for _ in range(4))
    nodes = [dict(id='root', parent_id=None, text='Root'),
             dict(id=a, parent_id='root', text='A'),
             dict(id=b, parent_id='root', text='B'),
             dict(id=child, parent_id=a, text='Child')]
    key = str(uuid.uuid4())
    initial = owner.request('saveDiagram', dict(name='Connection checks', client_key=key, nodes=nodes), module='diagrams')
    check(initial['connections'] == [], 'Diagrams without additional connections expose an empty list')

    def current():
        return next(d for d in owner.request('diagrams', module='diagrams') if d['id'] == initial['id'])

    def save(expected=200, client=owner, **changes):
        fresh = current()
        payload = dict(id=fresh['id'], version=fresh['version'], name=fresh['name'])
        payload.update(changes)
        return client.request('saveDiagram', payload, expected, module='diagrams')

    links = [dict(from_=a, to=b), dict(from_=child, to=b)]
    links = [{'from': e['from_'], 'to': e['to']} for e in links]
    connected = save(nodes=nodes, connections=links)
    check(connected['nodes'] == initial['nodes'] and connected['connections'] == links,
          'Additional connections persist without changing node ancestry or geometry')
    check(next(d for d in owner.boot()['data']['diagrams'] if d['id'] == initial['id']) == connected,
          'Bootstrap reloads saved additional connections')
    save(409, version=initial['version'], connections=[])
    save(404, client=other, connections=[])
    save(401, client=guest, connections=[])
    check(current() == connected, 'Stale, foreign-account and anonymous connection writes are rejected')

    foreign_diagram = owner.request('saveDiagram', dict(name='Other graph', client_key=str(uuid.uuid4()),
        nodes=[dict(id='root', parent_id=None, text='Other'), dict(id=foreign, parent_id='root', text='Foreign')]), module='diagrams')
    invalid = [None, 'invalid', {'bad': links}, [None], [{'from': a}], [{'from': 12, 'to': b}],
               [{'from': a, 'to': a}], [{'from': a, 'to': foreign}], [{'from': a, 'to': str(uuid.uuid4())}],
               [{'from': 'root', 'to': a}], [links[0], links[0]],
               [links[0], {'from': b, 'to': a}], links * 501]
    for bad in invalid:
        changed_nodes = copy.deepcopy(nodes)
        changed_nodes[0]['text'] = 'Must roll back'
        save(422, nodes=changed_nodes, name='Must roll back', connections=bad)
        assert current() == connected, 'Invalid connections changed title, version or nodes'
    check(True, 'Malformed, self, foreign, missing, tree-duplicate and repeated connections reject the entire edit atomically')
    retry = owner.request('saveDiagram', dict(name='Ignored retry', client_key=key, nodes=nodes, connections=[]), module='diagrams')
    check(retry == connected, 'An idempotent creation retry cannot overwrite saved connections')
    renamed = save(name='Renamed')
    legacy = save(nodes=nodes)
    check(renamed['connections'] == links and legacy['connections'] == links,
          'Title-only edits and older clients preserve additional connections')
    remaining = save(nodes=[n for n in nodes if n['id'] != child])
    check(remaining['connections'] == links[:1] and any(n['id'] == b for n in remaining['nodes']),
          'Deleting an endpoint prunes its connections while preserving connected neighbors')
    changed = copy.deepcopy(remaining['nodes'])
    next(n for n in changed if n['id'] == b)['parent_id'] = a
    check(save(nodes=changed)['connections'] == [], 'Reparenting prunes a connection that becomes a tree edge')
    save(nodes=nodes, connections=links)
    check(save(connections=[])['connections'] == [], 'Explicit empty connections remove saved extra lines')
    for diagram in [current(), foreign_diagram]:
        owner.request('deleteDiagram', dict(id=diagram['id'], version=diagram['version']), module='diagrams')
