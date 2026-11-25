"""Diagram colors persist without changing its nodes or bypassing edit permissions."""
import uuid


def run(owner, other, guest, check):
    key = str(uuid.uuid4())
    created = owner.request('saveDiagram', dict(client_key=key, name='Colors', color_theme='pastel',
        diagram_color=None, canvas_color='#FFF4DD'), module='diagrams')

    def current():
        return next(item for item in owner.request('diagrams', module='diagrams') if item['id'] == created['id'])

    def save(fields, expected=200):
        fresh = current()
        return owner.request('saveDiagram', dict(id=fresh['id'], version=fresh['version'], name=fresh['name'], **fields), expected, module='diagrams')

    check(current()['color_theme'] == 'pastel' and current()['canvas_color'] == '#fff4dd', 'Diagram palette and canvas color persist through reload')
    original_nodes = created['nodes']
    changed = save(dict(diagram_color='#354052'))
    check(changed['color_theme'] == 'pastel' and changed['canvas_color'] == '#fff4dd' and changed['nodes'] == original_nodes,
          'Changing only the diagram color preserves the background, palette and nodes')
    legacy = save(dict(nodes=changed['nodes']))
    check(legacy['diagram_color'] == '#354052' and legacy['canvas_color'] == '#fff4dd', 'Older clients preserve omitted color fields')
    for fields in [dict(color_theme='bad'), dict(color_theme=[]), dict(diagram_color='red'), dict(canvas_color='#fff'), dict(canvas_color='url(bad)'), dict(diagram_color=['#ffffff'])]:
        before = current()
        save(fields, 422)
        assert current() == before
    check(True, 'Invalid palettes and non-hex color values are rejected atomically')
    owner.request('saveDiagram', dict(client_key=key, name='Retry', color_theme='forest', canvas_color='#000000'), module='diagrams')
    check(current()['color_theme'] == 'pastel' and current()['canvas_color'] == '#fff4dd', 'Repeated creation cannot replace saved colors')
    fresh = current()
    body = dict(id=fresh['id'], version=fresh['version'], name=fresh['name'], color_theme='forest')
    guest.request('saveDiagram', body, 401, module='diagrams')
    other.request('saveDiagram', body, 404, module='diagrams')
    owner.request('saveDiagram', body, 419, csrf=False, module='diagrams')
    owner.request('saveDiagram', dict(body, version=fresh['version']-1), 409, module='diagrams')
    check(current() == fresh, 'Color updates enforce authentication, ownership, CSRF and version control')
    reset = save(dict(color_theme=None, diagram_color=None, canvas_color=None))
    check(all(reset[field] is None for field in ['color_theme', 'diagram_color', 'canvas_color']) and reset['nodes'] == original_nodes,
          'Resetting colors keeps the diagram content intact')
    owner.request('deleteDiagram', dict(id=reset['id'],version=reset['version']), module='diagrams')
