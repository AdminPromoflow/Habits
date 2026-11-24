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
    hidden = [{'from': 'root', 'to': a}, {'from': a, 'to': child}]
    before = current()
    removed_lines = save(hidden_connections=hidden)
    check(removed_lines['nodes'] == before['nodes'] and removed_lines['connections'] == [] and removed_lines['hidden_connections'] == hidden,
          'Deleting parent-child lines preserves every node, position and parent')
    check(next(d for d in owner.boot()['data']['diagrams'] if d['id'] == initial['id']) == removed_lines,
          'Removed parent-child lines stay removed after bootstrap reload')
    save(409, version=before['version'], hidden_connections=[])
    save(404, client=other, hidden_connections=[])
    save(401, client=guest, hidden_connections=[])
    check(current() == removed_lines, 'Hidden parent lines obey owner, authentication and version protections')
    for bad in [None, 'invalid', {'bad': hidden}, [None], [{'from': a}], [{'from': a, 'to': a}],
                [{'from': a, 'to': foreign}], [{'from': a, 'to': b}], [hidden[0], {'from': a, 'to': 'root'}], hidden * 101]:
        save(422, name='Must roll back', hidden_connections=bad, connections=links)
        assert current() == removed_lines, 'Invalid hidden lines changed the saved graph'
    check(True, 'Invalid hidden connections reject the entire edit without altering other lines or nodes')
    check(save(nodes=nodes, connections=links)['hidden_connections'] == hidden,
          'Older clients preserve removed parent lines while saving additional connections')
    check(save(hidden_connections=hidden[:1])['connections'] == links,
          'Restoring a parent line preserves unrelated additional connections')
    save(hidden_connections=hidden)
    remaining = save(nodes=[n for n in nodes if n['id'] != child])
    check(remaining['hidden_connections'] == hidden[:1], 'Node deletion removes obsolete hidden connections')
    changed = copy.deepcopy(remaining['nodes'])
    next(n for n in changed if n['id'] == a)['parent_id'] = b
    check(save(nodes=changed)['hidden_connections'] == [], 'Reparenting removes obsolete hidden parent edges')
    save(nodes=nodes, connections=links, hidden_connections=[])
    styles = [dict(**{'from': 'root', 'to': a}, label='Depende de <otra tarea>', arrows='both',
                   points=[[0, 0], [20.25, 0], [20.25, 40.5], [180, 40.5], [180, 0], [200, 0]]),
              dict(**links[0], label='Conexión adicional', arrows='end', points=None)]
    before = current()
    styled = save(connection_styles=styles)
    check(styled['connection_styles'] == styles and styled['nodes'] == before['nodes'] and styled['connections'] == links,
          'Bends, literal labels and arrows persist for both tree and extra lines without altering nodes')
    check(next(d for d in owner.boot()['data']['diagrams'] if d['id'] == initial['id']) == styled,
          'Connection geometry, labels and arrows round-trip through bootstrap')
    save(409, version=before['version'], connection_styles=[])
    save(404, client=other, connection_styles=[])
    save(401, client=guest, connection_styles=[])
    check(current() == styled, 'Line formatting follows owner, authentication and stale-version protections')
    malformed = [None, 'bad', [None], [styles[0], styles[0]], [dict(styles[0], to=foreign)],
                 [dict(styles[0], label='x' * 121)], [dict(styles[0], arrows='invalid')]]
    for points in [[], [[0, 0]], [[0, 0], [1, 1]], [[0, 0], ['x', 0]], [[0, 0], [1000001, 0]], [[0, 0, 0], [20, 0]], [[0, 0]] * 65]:
        malformed.append([dict(styles[0], points=points)])
    for bad in malformed:
        save(422, name='Must roll back', connection_styles=bad)
        assert current() == styled, 'Invalid connector style changed the diagram'
    check(True, 'Invalid routes, labels, arrows, duplicate and foreign styles reject atomically')
    check(save(nodes=nodes, connections=links)['connection_styles'] == styles,
          'Older clients retain connection styles when editing nodes or extra lines')
    for arrows in ['none', 'start', 'end', 'both']:
        styles[0]['arrows'] = arrows
        assert save(connection_styles=styles)['connection_styles'][0]['arrows'] == arrows
    check(True, 'Every arrow-end combination persists independently of the label and geometry')
    check(save(connections=[])['connection_styles'] == styles[:1],
          'Deleting an extra line prunes its style without affecting other lines')
    check(save(hidden_connections=[hidden[0]])['connection_styles'] == [],
          'Deleting a parent line also removes its saved label, arrows and custom route')
    for diagram in [current(), foreign_diagram]:
        owner.request('deleteDiagram', dict(id=diagram['id'], version=diagram['version']), module='diagrams')
