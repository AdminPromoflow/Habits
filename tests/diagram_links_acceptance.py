"""Private topic links survive saves and reject inaccessible destinations."""
import copy
import uuid


def run(owner, other, guest, check):
    def create(client, name):
        return client.request('saveDiagram', dict(client_key=str(uuid.uuid4()), name=name, nodes=[
            dict(id='root', parent_id=None, text=name),
            dict(id=str(uuid.uuid4()), parent_id='root', text='Linked topic'),
        ]), module='diagrams')

    source = create(owner, 'Link source')
    destination = create(owner, 'Link destination')
    private = create(other, 'Other account target')

    def current():
        return next(item for item in owner.request('diagrams', module='diagrams') if item['id'] == source['id'])

    def save(link, expected=200):
        fresh = current()
        nodes = copy.deepcopy(fresh['nodes'])
        nodes[0]['link'] = link
        return owner.request('saveDiagram', dict(id=fresh['id'], version=fresh['version'], name=fresh['name'], nodes=nodes), expected, module='diagrams')

    whole = dict(diagram_id=destination['id'], node_id=None)
    saved = save(whole)
    check(saved['nodes'][0]['link'] == whole and current() == saved, 'A link to an entire owned diagram persists and reloads')
    topic = dict(diagram_id=destination['id'], node_id=destination['nodes'][1]['id'])
    saved = save(topic)
    check(current()['nodes'][0]['link'] == topic, 'A link to a particular topic in another diagram persists')
    legacy = copy.deepcopy(saved['nodes'])
    legacy[0].pop('link')
    result = owner.request('saveDiagram', dict(id=saved['id'], version=saved['version'], name=saved['name'], nodes=legacy), module='diagrams')
    check(result['nodes'][0]['link'] == topic, 'Clients omitting link preserve the saved destination')
    same = dict(diagram_id=source['id'], node_id=source['nodes'][1]['id'])
    check(save(same)['nodes'][0]['link'] == same, 'Links to another topic inside the same diagram are valid')
    before = current()
    for invalid in [dict(diagram_id=private['id'], node_id=None), dict(diagram_id=987654321, node_id=None),
                    dict(diagram_id=destination['id'], node_id=str(uuid.uuid4())),
                    dict(diagram_id=source['id'], node_id=str(uuid.uuid4())),
                    dict(diagram_id=True, node_id=None), dict(diagram_id='1', node_id=None),
                    dict(diagram_id=destination['id']), dict(diagram_id=destination['id'], node_id=[]),
                    dict(diagram_id=destination['id'], node_id='javascript:alert(1)'), [], 'https://example.com']:
        save(invalid, 422)
        assert current() == before
    check(True, 'Private, missing and malformed link targets are rejected atomically')
    payload = dict(id=before['id'], version=before['version'], name=before['name'], nodes=before['nodes'])
    other.request('saveDiagram', payload, 404, module='diagrams')
    guest.request('saveDiagram', payload, 401, module='diagrams')
    owner.request('saveDiagram', payload, 419, csrf=False, module='diagrams')
    owner.request('saveDiagram', dict(payload, version=before['version'] - 1), 409, module='diagrams')
    check(current() == before, 'Link edits enforce ownership, authentication, CSRF and version checks')
    saved = save(topic)
    owner.request('deleteDiagram', dict(id=destination['id'], version=destination['version']), module='diagrams')
    edited = copy.deepcopy(saved['nodes'])
    edited[0]['text'] = 'Still editable after destination deletion'
    result = owner.request('saveDiagram', dict(id=saved['id'], version=saved['version'], name=saved['name'], nodes=edited), module='diagrams')
    check(result['nodes'][0]['text'] == edited[0]['text'], 'A removed link destination does not block unrelated edits')
    cleared = save(None)
    check(not cleared['nodes'][0].get('link') and not current()['nodes'][0].get('link'), 'Removing a link persists without deleting either topic')
    for client, diagram in [(owner, current()), (other, private)]:
        client.request('deleteDiagram', dict(id=diagram['id'], version=diagram['version']), module='diagrams')
