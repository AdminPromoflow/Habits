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
    check(len(current['nodes']) == 1 and current['nodes'][0]['id'] == 'root' and current['nodes'][0]['text'] == 'My first diagram', 'Title-only updates preserve the original root text')
    check(current['nodes'][0]['width'] is None, 'New and existing nodes without a custom width use the default')
    a, b, c = (str(uuid.uuid4()) for _ in range(3))
    root = current['nodes'][0]
    root['text'] = 'Idea central independiente'
    root['layout'] = dict(mode='horizontal', direction='left', vertical='auto', horizontal='auto')
    root['width'] = 320.75
    nodes = [root,
             dict(id=a, parent_id='root', text='Rama uno\nSegunda línea', layout=None, x=None, y=None, width=160.25),
             dict(id=b, parent_id=a, text='Subrama', layout=dict(mode='vertical', direction='bottom', vertical='auto', horizontal='auto'), x=41.25, y=-73.5, width=None),
             dict(id=c, parent_id=b, text='Nieto', layout=None, x=None, y=None, width=440)]
    for node in nodes:
        node.setdefault('image', None)
        node.setdefault('labels', [])
        node.setdefault('checkbox', None)
    first = persist(nodes, name='Mi mapa independiente')
    check(first['name'] == 'Mi mapa independiente' and first['nodes'] == nodes, 'Independent title, root text, styles, line breaks, positions and widths round-trip exactly')
    reloaded = owner.boot()['data']['diagrams'][0]
    check(reloaded['name'] == first['name'] and reloaded['nodes'] == nodes, 'The title and central idea remain independent after a fresh bootstrap')
    persist(nodes, 404, client=other)
    guest.request('saveDiagram', dict(id=diagram_id, version=first['version'], name=first['name'], nodes=nodes), 401, module='diagrams')
    check(not other.request('diagrams', module='diagrams'), 'Other accounts cannot read or overwrite private tree nodes')
    owner.request('saveDiagram', dict(id=diagram_id, version=first['version'], name='Legacy rename'), module='diagrams')
    renamed = saved()
    check(renamed['name'] == 'Legacy rename' and renamed['nodes'] == nodes, 'Title-only updates preserve every node, text, style, position and width')
    nodes = renamed['nodes']
    nodes[0]['text'] = 'Idea central revisada\nDetalle propio'
    edited_root = persist(nodes)
    check(edited_root['name'] == 'Legacy rename' and edited_root['nodes'][0]['text'] == nodes[0]['text'], 'Editing the central idea does not overwrite the diagram title')
    renamed_with_tree = persist(nodes, name='Proyecto de aprendizaje')
    check(renamed_with_tree['name'] == 'Proyecto de aprendizaje' and renamed_with_tree['nodes'] == nodes, 'Renaming with a full snapshot preserves the central idea and its descendants')
    title_snapshot = saved()
    for invalid_title in ['', '   \n ', 'x' * 121]:
        persist(nodes, 422, name=invalid_title)
        assert saved() == title_snapshot, 'Invalid title changed persisted data'
    check(True, 'Empty and oversized diagram titles are rejected without changing the tree or version')
    legacy_nodes = copy.deepcopy(nodes)
    for node in legacy_nodes:
        node.pop('width')
    legacy_saved = persist(legacy_nodes)
    check(legacy_saved['nodes'] == nodes, 'Older tree snapshots that omit width preserve every existing custom width')
    legacy_child = dict(id=str(uuid.uuid4()), parent_id='root', text='Legacy child', layout=None, x=None, y=None)
    legacy_added = persist(legacy_nodes + [legacy_child])
    check(legacy_added['nodes'][:-1] == nodes and legacy_added['nodes'][-1]['width'] is None, 'An older client can add a default-width node without clearing existing widths')
    nodes[0]['width'] = 100
    nodes[1]['width'] = 600
    nodes[2]['width'] = 234.567
    resized = persist(nodes)
    check(resized['name'] == 'Proyecto de aprendizaje' and [node['width'] for node in resized['nodes']] == [100, 600, 234.57, 440], 'Width limits and rounding preserve the independent diagram title')
    nodes = resized['nodes']
    nodes[1]['width'] = None
    reset = persist(nodes)
    check(reset['nodes'][1]['width'] is None and reset['nodes'][0]['width'] == 100 and reset['nodes'][2]['width'] == 234.57, 'Explicit null resets only the selected width to its default')
    renamed = saved()
    nodes = renamed['nodes']
    nodes[1]['layout'] = dict(mode='matrix', direction='auto', vertical='bottom', horizontal='rtl')
    changed = persist(nodes)
    persist(renamed['nodes'], 409, version=renamed['version'])
    check(saved()['name'] == 'Proyecto de aprendizaje' and saved()['nodes'] == changed['nodes'], 'Style changes preserve the title and optimistic locking rejects stale snapshots')
    nodes = saved()['nodes']
    nodes[0]['checkbox'] = True
    nodes[1]['checkbox'] = False
    nodes[2]['checkbox'] = None
    checked = persist(nodes)
    check([node['checkbox'] for node in checked['nodes']] == [True, False, None, None], 'Checked, unchecked and absent checkboxes persist independently on root and child nodes')
    check(owner.boot()['data']['diagrams'][0]['nodes'] == checked['nodes'], 'Checkbox states survive a fresh bootstrap with text, layout and widths intact')
    legacy = copy.deepcopy(nodes)
    for node in legacy:
        node.pop('checkbox')
    check(persist(legacy)['nodes'] == checked['nodes'], 'Older clients omitting checkbox preserve all existing task states')
    nodes[0]['checkbox'] = False
    nodes[1]['checkbox'] = True
    toggled = persist(nodes)
    persist(checked['nodes'], 409, version=checked['version'])
    check(saved()['nodes'] == toggled['nodes'], 'Toggling task states persists and stale snapshots cannot undo completion')
    nodes[1]['checkbox'] = None
    removed = persist(nodes)
    check(removed['nodes'][1]['checkbox'] is None and removed['nodes'][0]['checkbox'] is False, 'Removing one checkbox leaves other task states intact')
    before = saved()

    def reject(mutator):
        bad = copy.deepcopy(before['nodes'])
        mutator(bad)
        persist(bad, 422)
        assert saved() == before, 'Rejected snapshot modified persisted data'

    for value in [0, 1, -1, 2, 'true', 'false', '', [], {}]:
        reject(lambda n, value=value: n[1].update(checkbox=value))
    check(True, 'Checkbox validation rejects non-boolean values atomically')

    reject(lambda n: n.append(copy.deepcopy(n[1])))
    reject(lambda n: n[1].update(parent_id=c))
    reject(lambda n: n[1].update(parent_id=str(uuid.uuid4())))
    reject(lambda n: n[1].update(parent_id=False))
    reject(lambda n: n.pop(0))
    reject(lambda n: n[0].update(parent_id=a))
    check(True, 'Duplicate IDs, cycles, missing parents, invalid parent types and absent canonical roots are rejected atomically')
    reject(lambda n: n[1].update(text='   \n '))
    reject(lambda n: n[1].update(text='x' * 121))
    reject(lambda n: n[1].update(id='unsafe-id'))
    reject(lambda n: n[0].update(text='   \n '))
    reject(lambda n: n[0].update(text='x' * 121))
    check(True, 'Root and child names remain non-empty and bounded independently of the title')
    for field in ['mode', 'direction', 'vertical', 'horizontal']:
        reject(lambda n, field=field: n[0]['layout'].update({field: 'bad-value'}))
    reject(lambda n: n[1].update(x='10'))
    reject(lambda n: n[1].update(x=1000001))
    reject(lambda n: n[1].update(y=[]))
    check(True, 'Unknown layout values and invalid or unbounded positions are rejected')
    for width in [99.99, 600.01, 0, -120, '220', True, [], {}, 'NaN', 'Infinity']:
        reject(lambda n, width=width: n[1].update(width=width))
    check(True, 'Out-of-range and non-numeric widths are rejected atomically without changing nodes or version')
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
    created = owner.request('saveDiagram', dict(client_key=creation_key, name='Second tree', nodes=[dict(id='root', parent_id=None, text='Another central idea', layout=None)]), module='diagrams')
    check(created['name'] == 'Second tree' and created['nodes'][0]['text'] == 'Another central idea', 'A new diagram can start with a title different from its central idea')
    repeated = owner.request('saveDiagram', dict(client_key=creation_key, name='Different retry', nodes=[dict(id='root', parent_id=None, text='Different retry', layout=None)]), module='diagrams')
    check(created == repeated, 'Idempotent creation retries cannot replace an existing root or its style')
    test_forest(owner, other, guest, a, check)
    from diagram_content_acceptance import run as test_content
    test_content(owner, other, guest, check)


def test_forest(owner, other, guest, foreign_node, check):
    """Multiple parentless topics stay in one private, versioned diagram."""
    main, child = str(uuid.uuid4()), str(uuid.uuid4())
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    primary = dict(id='root', parent_id=None, text='Primera idea principal',
                   layout=dict(mode='radial', direction='auto', vertical='auto', horizontal='auto'),
                   x=None, y=None, width=310, image=png, labels=[dict(text='Etiqueta', position='inside')], checkbox=True)
    sibling = copy.deepcopy(primary)
    sibling.update(id=main, text='Otra idea principal', x=120.25, y=-80.5)
    descendant = dict(id=child, parent_id='root', text='Hijo de la primera idea', layout=None,
                      x=None, y=None, width=None, image=None, labels=[], checkbox=None)
    nodes = [primary, descendant, sibling]
    key = str(uuid.uuid4())
    forest = owner.request('saveDiagram', dict(client_key=key, name='Ideas independientes', nodes=nodes), module='diagrams')

    def current():
        return next(item for item in owner.request('diagrams', module='diagrams') if item['id'] == forest['id'])

    def save(tree, expected=200, client=owner, version=None):
        fresh = current()
        return client.request('saveDiagram', dict(id=fresh['id'], version=fresh['version'] if version is None else version,
                                                  name=fresh['name'], nodes=tree), expected, module='diagrams')

    check(forest['nodes'] == nodes and sum(node['parent_id'] is None for node in forest['nodes']) == 2,
          'Creation accepts two independent main ideas and preserves styles, widths, positions, images, labels and checkbox states')
    check(next(item for item in owner.boot()['data']['diagrams'] if item['id'] == forest['id']) == forest,
          'A complete forest reloads with the second main idea childless and the original descendants unchanged')
    retry = owner.request('saveDiagram', dict(client_key=key, name='Ignored retry', nodes=[primary]), module='diagrams')
    check(retry == forest, 'Idempotent creation cannot remove additional main ideas on retry')
    renamed = owner.request('saveDiagram', dict(id=forest['id'], version=forest['version'], name='Título del conjunto'), module='diagrams')
    check(renamed['nodes'] == nodes, 'Renaming a multi-root diagram preserves all independent ideas and descendants')
    moved = copy.deepcopy(nodes)
    moved[1]['parent_id'] = main
    moved[2]['layout'] = dict(mode='vertical', direction='bottom', vertical='auto', horizontal='auto')
    changed = save(moved)
    save(nodes, 409, version=renamed['version'])
    check(current()['nodes'] == moved and changed['name'] == 'Título del conjunto',
          'Moving a branch between main ideas preserves independent styles and rejects stale snapshots')
    before = current()
    save(moved, 404, client=other)
    guest.request('saveDiagram', dict(id=forest['id'], version=before['version'], name=before['name'], nodes=moved), 401, module='diagrams')
    check(current() == before and not other.request('diagrams', module='diagrams'),
          'Additional main ideas remain private and cannot be changed by another account or guest')

    for field in [dict(parent_id=child), dict(parent_id=foreign_node), dict(parent_id=17)]:
        bad = copy.deepcopy(moved)
        bad[2].update(field)
        save(bad, 422)
        assert current() == before, 'Invalid secondary tree changed persisted data'
    bad = copy.deepcopy(moved)
    bad[2]['parent_id'] = main
    save(bad, 422)
    check(current() == before, 'Cycles, self-parenting, foreign-diagram parents and invalid parent types are rejected in every tree')

    deep = [copy.deepcopy(primary), copy.deepcopy(sibling)]
    for _ in range(31):
        deep.append(dict(id=str(uuid.uuid4()), parent_id=deep[-1]['id'], text='Nivel'))
    save(deep, 422)
    many_roots = [copy.deepcopy(primary)] + [dict(id=str(uuid.uuid4()), parent_id=None, text='Principal') for _ in range(200)]
    save(many_roots, 422)
    check(current() == before, 'The depth limit covers secondary trees and the 200-node limit covers the entire forest')
    deep.pop()
    deep_saved = save(deep)
    check(len(deep_saved['nodes']) == 32 and deep_saved['nodes'][1]['parent_id'] is None,
          'Thirty ancestry levels are supported under an independent main idea')
    check(save(nodes)['nodes'] == nodes, 'Replacing a deep forest restores the requested independent trees without leftover descendants')
