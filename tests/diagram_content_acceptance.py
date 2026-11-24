"""Image, label and deletion coverage on disposable diagrams."""
import copy
import uuid


def run(owner, other, guest, check):
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    child = str(uuid.uuid4())
    diagram = owner.request('saveDiagram', dict(client_key=str(uuid.uuid4()), name='Content checks', nodes=[
        dict(id='root', parent_id=None, text='Main idea', image=png, labels=[dict(text='Outside <label>', position='outside'), dict(text='Dentro 🌿', position='inside')]),
        dict(id=child, parent_id='root', text='Child', image=png, labels=[]),
    ]), module='diagrams')

    def current():
        return next(item for item in owner.request('diagrams', module='diagrams') if item['id'] == diagram['id'])

    def save(nodes, expected=200):
        fresh = current()
        return owner.request('saveDiagram', dict(id=fresh['id'], version=fresh['version'], name=fresh['name'], nodes=nodes), expected, module='diagrams')

    check(current() == diagram and diagram['nodes'][0]['image'] == png and len(diagram['nodes'][0]['labels']) == 2, 'Images and both label positions round-trip with private diagram data')
    legacy = copy.deepcopy(diagram['nodes'])
    for node in legacy:
        del node['image']
        del node['labels']
    check(save(legacy)['nodes'] == diagram['nodes'], 'Older clients preserve images and labels when their fields are omitted')
    before = current()
    invalid = [dict(image='https://example.com/private.png'), dict(image='data:image/svg+xml;base64,PHN2Zy8+'), dict(image='data:image/png;base64,bm90YW5pbWFnZQ=='), dict(image='x' * 350001), dict(labels=[dict(text='', position='inside')]), dict(labels=[dict(text='x' * 81, position='outside')]), dict(labels=[dict(text='Tag', position='unknown')]), dict(labels=[dict(text='Tag', position='inside')] * 11)]
    for fields in invalid:
        nodes = copy.deepcopy(before['nodes'])
        nodes[0].update(fields)
        save(nodes, 422)
        assert current() == before
    check(True, 'Invalid image payloads, label positions, empty labels and content limits are rejected atomically')
    nodes = copy.deepcopy(before['nodes'])
    nodes[0].update(image=None, labels=[])
    cleared = save(nodes)
    check(cleared['nodes'][0]['image'] is None and cleared['nodes'][0]['labels'] == [] and cleared['nodes'][1]['image'] == png, 'Removing an image and labels leaves other topics unchanged')
    payload = dict(id=diagram['id'], version=cleared['version'])
    guest.request('deleteDiagram', payload, 401, module='diagrams')
    other.request('deleteDiagram', payload, 404, module='diagrams')
    owner.request('deleteDiagram', payload, 419, csrf=False, module='diagrams')
    owner.request('deleteDiagram', dict(payload, version=cleared['version'] - 1), 409, module='diagrams')
    check(current() == cleared, 'Diagram deletion enforces ownership, authentication, CSRF and current version')
    owner.request('deleteDiagram', payload, module='diagrams')
    check(all(item['id'] != diagram['id'] for item in owner.request('diagrams', module='diagrams')), 'Deleting a diagram safely removes its tree including images and labels')
