"""HTTP checks for persisted mindmap trees; called with isolated test clients."""
import copy
import uuid


def run(owner, other, guest, diagram_id, check):
    def saved():
        return next(item for item in owner.request('diagrams', module='diagrams') if item['id'] == diagram_id)

    def persist(nodes, expected=200, version=None, client=owner, name=None):
        current = saved()
        return client.request('saveDiagram', {
            'id': diagram_id, 'version': current['version'] if version is None else version,
            'name': current['name'] if name is None else name, 'nodes': nodes,
        }, expected, module='diagrams')

    current = saved()
    check(len(current['nodes']) == 1 and current['nodes'][0]['id'] == 'root' and current['nodes'][0]['text'] == current['name'], 'Existing name-only creation returns a matching root node')
    a, b, c = (str(uuid.uuid4()) for _ in range(3))
    root = current['nodes'][0]
    root['layout'] = dict(mode='horizontal', direction='left', vertical='auto', horizontal='auto')
    nodes = [root,
             dict(id=a, parent_id='root', text='Rama uno\nSegunda línea', layout=None, x=None, y=None),
             dict(id=b, parent_id=a, text='Subrama', layout=dict(mode='vertical', direction='bottom', vertical='auto', horizontal='auto'), x=41.25, y=-73.5),
             dict(id=c, parent_id=b, text='Nieto', layout=None, x=None, y=None)]
    first = persist(nodes)
    check(first['nodes'] == nodes, 'Root style, inherited children, branch override, line breaks and positions round-trip exactly')
    reloaded = owner.boot()['data']['diagrams'][0]
    check(reloaded['nodes'] == nodes, 'Layout choices and branch inheritance survive a fresh bootstrap')
    persist(nodes, 404, client=other)
    guest.request('saveDiagram', dict(id=diagram_id, version=first['version'], name=first['name'], nodes=nodes), 401, module='diagrams')
    check(not other.request('diagrams', module='diagrams'), 'Other accounts cannot read or overwrite private tree nodes')
    owner.request('saveDiagram', dict(id=diagram_id, version=first['version'], name='Legacy rename'), module='diagrams')
    renamed = saved()
    check(renamed['nodes'][0]['text'] == 'Legacy rename' and renamed['nodes'][1:] == nodes[1:] and renamed['nodes'][0]['layout'] == root['layout'], 'Name-only clients preserve descendants and all layout overrides')
    nodes = renamed['nodes']
    nodes[1]['layout'] = dict(mode='matrix', direction='auto', vertical='bottom', horizontal='rtl')
    changed = persist(nodes)
    persist(renamed['nodes'], 409, version=renamed['version'])
    check(saved()['nodes'] == changed['nodes'], 'Optimistic locking prevents stale trees from overwriting newer branch styles')
    before = saved()

    def reject(mutator):
        bad = copy.deepcopy(before['nodes'])
        mutator(bad)
        persist(bad, 422)
        assert saved() == before, 'Rejected snapshot modified persisted data'

    reject(lambda n: n.append(copy.deepcopy(n[1])))
    reject(lambda n: n[1].update(parent_id=c))
    reject(lambda n: n[1].update(parent_id=str(uuid.uuid4())))
    reject(lambda n: n[1].update(parent_id=None))
    reject(lambda n: n.pop(0))
    reject(lambda n: n[0].update(parent_id=a))
    check(True, 'Duplicate IDs, cycles, orphan nodes, multiple roots and absent roots are rejected atomically')
    reject(lambda n: n[1].update(text='   \n '))
    reject(lambda n: n[1].update(text='x' * 121))
    reject(lambda n: n[1].update(id='unsafe-id'))
    reject(lambda n: n[0].update(text='Mismatch'))
    check(True, 'Node names, root-name consistency and node identifiers are validated')
    for field in ['mode', 'direction', 'vertical', 'horizontal']:
        reject(lambda n, field=field: n[0]['layout'].update({field: 'bad-value'}))
    reject(lambda n: n[1].update(x='10'))
    reject(lambda n: n[1].update(x=1000001))
    reject(lambda n: n[1].update(y=[]))
    check(True, 'Unknown layout values and invalid or unbounded positions are rejected')
    too_many = [copy.deepcopy(before['nodes'][0])] + [dict(id=str(uuid.uuid4()), parent_id='root', text='Node') for _ in range(200)]
    persist(too_many, 422)
    deep = [copy.deepcopy(before['nodes'][0])]
    for i in range(31):
        deep.append(dict(id=str(uuid.uuid4()), parent_id=deep[-1]['id'], text='Depth'))
    persist(deep, 422)
    check(saved() == before, 'Trees over 200 nodes or 30 ancestry levels are rejected without changing the version')
    deep.pop()
    deep_saved = persist(deep)
    check(len(deep_saved['nodes']) == 31, 'Thirty ancestry levels can be stored and replaced with immediate SQL foreign keys')
    restored = persist(before['nodes'])
    check(restored['nodes'] == before['nodes'], 'Replacing a deep tree removes obsolete nodes while restoring the requested branch hierarchy')
    creation_key = str(uuid.uuid4())
    created = owner.request('saveDiagram', dict(client_key=creation_key, name='Second tree', nodes=[dict(id='root', parent_id=None, text='Second tree', layout=None)]), module='diagrams')
    repeated = owner.request('saveDiagram', dict(client_key=creation_key, name='Different retry', nodes=[dict(id='root', parent_id=None, text='Different retry', layout=None)]), module='diagrams')
    check(created == repeated, 'Idempotent creation retries cannot replace an existing root or its style')
