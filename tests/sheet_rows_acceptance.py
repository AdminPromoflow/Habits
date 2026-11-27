"""Row ordering is one versioned transaction, with private/share edit permissions."""
import uuid


def run(owner, other, guest, check):
    sheet = owner.request('createMindSpaceItem', dict(kind='spreadsheet', name='Row movement', client_key=str(uuid.uuid4())))
    content = dict(rows=5, columns=4, cells={'A1': 'Header', 'A2': 'Second', 'A3': 'Third', 'A4': 'Fourth', 'B2': '10', 'B3': '20', 'B4': '30', 'C3': '=B3*2', 'D1': '=SUM(B2:B4)'}, cell_styles={'A3': {'bold': True}})
    sheet = owner.request('saveMindSpaceItem', dict(id=sheet['id'], version=sheet['version'], content=content))
    payload = dict(id=sheet['id'], version=sheet['version'], **{'from': 3, 'to': 2})
    guest.request('moveSpreadsheetRow', payload, 401, module='mindspaces')
    owner.request('moveSpreadsheetRow', payload, 419, csrf=False, module='mindspaces')
    other.request('moveSpreadsheetRow', payload, 404, module='mindspaces')
    for start, end in [(0, 2), (3, 6), ('3', 2), (3, None)]:
        owner.request('moveSpreadsheetRow', dict(payload, **{'from': start, 'to': end}), 422)
    moved = owner.request('moveSpreadsheetRow', payload, module='mindspaces')
    cells = moved['content']['cells']
    check(cells['A2'] == 'Third' and cells['A3'] == 'Second' and cells['C2'] == '=B2*2' and moved['content']['cell_styles']['A2']['bold'], 'Dragging row 3 to 2 moves all cells, formulas and styles, with authentication and validation')
    loaded = next(item for item in owner.data()['mindspace']['items'] if item['id'] == sheet['id'])
    check(loaded == moved, 'Reordered rows persist through a fresh dashboard read')
    owner.request('moveSpreadsheetRow', payload, 409)
    unchanged = owner.request('moveSpreadsheetRow', dict(payload, version=moved['version'], **{'from': 2, 'to': 2}))
    check(unchanged == moved, 'Old versions cannot overwrite row changes; a no-op does not change version')

    owner.request('shareMindSpace', dict(target='item', id=sheet['id'], email=other.boot()['user']['email'], permissions={}))
    share = next(row for row in other.data()['mindspace_shares']['incoming'] if row['item_id'] == sheet['id'])
    other.request('respondMindSpaceShare', dict(id=share['id'], status='accepted'))
    request = dict(share_id=share['id'], action='moveSpreadsheetRow', data=dict(payload, version=moved['version'], **{'from': 2, 'to': 4}))
    other.request('sharedMindSpaceAction', request, 403)
    owner.request('changeMindSpaceShare', dict(id=share['id'], permissions={'edit': True}))
    moved = other.request('sharedMindSpaceAction', request)
    check(moved['content']['cells']['A4'] == 'Third' and moved['content']['cells']['A2'] == 'Second', 'Shared sheets require Edit permission to reorder rows')

    ledger = owner.request('createMindSpaceItem', dict(kind='spreadsheet', template='ledger', name='Ledger row movement', client_key=str(uuid.uuid4())))
    content = dict(ledger['content']); content['cells'].update({'A2': '2026-11-01', 'B2': 'First receipt', 'D2': '10', 'A3': '2026-11-02', 'B3': 'Second receipt', 'D3': '20'})
    ledger = owner.request('saveMindSpaceItem', dict(id=ledger['id'], version=ledger['version'], content=content))
    # Current ledger templates can attach receipt images. Both metadata and blobs
    # must move together, even when two occupied attachment keys trade places.
    if ledger['content'].get('invoice_column') == 'G':
        image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII='
        for cell, name in [('G2', 'First receipt'), ('G3', 'Second receipt')]:
            ledger = owner.request('saveSpreadsheetInvoice', dict(id=ledger['id'], version=ledger['version'], cell=cell, image=image, name=name))
    payload = dict(id=ledger['id'], version=ledger['version'], **{'from': 3, 'to': 2})
    owner.request('moveSpreadsheetRow', dict(payload, **{'from': 1}), 422)
    moved = owner.request('moveSpreadsheetRow', payload)
    check(moved['content']['cells']['B2'] == 'Second receipt' and moved['content']['cells']['F2'] == '=SUM(D2:D2)-SUM(E2:E2)', 'Template headers stay fixed and running balances are rebuilt after a move')
    if moved['content'].get('invoices'):
        receipts = [owner.request('getSpreadsheetInvoice', params=dict(id=ledger['id'], cell=cell)) for cell in ['G2', 'G3']]
        check([receipt['name'] for receipt in receipts] == ['Second receipt', 'First receipt'] and all(receipt['image'] == image for receipt in receipts), 'Receipt names and stored images follow their rows without collisions')
