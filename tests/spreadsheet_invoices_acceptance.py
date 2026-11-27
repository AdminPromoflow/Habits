"""Invoice storage, authorization and accounting preservation over real HTTP."""
import uuid

IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='

def run(owner, stranger, guest, check):
 sheet = owner.request('createMindSpaceItem', {'kind':'spreadsheet','name':'Invoice QA','template':'ledger','language':'en','client_key':str(uuid.uuid4())})
 assert sheet['content']['cells']['G1'] == 'Invoice' and sheet['content']['invoice_column'] == 'G'
 data = {'id':sheet['id'],'version':sheet['version'],'cell':'G2','image':IMAGE,'name':'Invoice.png'}
 guest.request('saveSpreadsheetInvoice', data, 401)
 owner.request('saveSpreadsheetInvoice', data, 419, csrf=False)
 stranger.request('saveSpreadsheetInvoice', data, 404)
 stranger.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G2'}, expected=404)
 for cell in ['G1','G32','H2','g2','G02']:
  owner.request('saveSpreadsheetInvoice', dict(data,cell=cell), 422)
 for image in ['', 'https://example.com/invoice.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/jpeg;base64,AAAA']:
  owner.request('saveSpreadsheetInvoice', dict(data,image=image), 422)
 check(True, 'Invoice uploads require authentication, CSRF, ownership, valid images and an existing G data cell')
 sheet = owner.request('saveSpreadsheetInvoice', data)
 assert sheet['content']['invoices'] == {'G2':{'name':'Invoice.png'}}
 assert 'data:image' not in str(sheet)
 assert owner.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G2'}) == {'image':IMAGE,'name':'Invoice.png'}
 owner.request('saveSpreadsheetInvoice', data, 409)
 check(True, 'Invoice image persists separately from sheet metadata and stale writes cannot replace it')
 content = dict(sheet['content'], cells={'B2':'Office supplies','D2':'100','E2':'25'},invoices={})
 sheet = owner.request('saveMindSpaceItem', {'id':sheet['id'],'version':sheet['version'],'content':content})
 assert sheet['content']['invoices']['G2']['name'] == 'Invoice.png'
 assert sheet['content']['cells']['F2'] == '=SUM(D2:D2)-SUM(E2:E2)'
 assert owner.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G2'})['image'] == IMAGE
 current = next(row for row in owner.data()['mindspace']['items'] if row['id']==sheet['id'])
 assert current == sheet
 check(True, 'Reload and ordinary cell edits preserve invoice attachments, descriptions and balance formulas')
 for content in [dict(sheet['content'],rows=1,cells={}),dict(sheet['content'],cells={'G2':'hidden text'})]:
  owner.request('saveMindSpaceItem', {'id':sheet['id'],'version':sheet['version'],'content':content}, 422)
 sheet = owner.request('saveSpreadsheetInvoice', dict(data,version=sheet['version'],cell='G31',name='Last row.png'))
 owner.request('saveMindSpaceItem', {'id':sheet['id'],'version':sheet['version'],'content':dict(sheet['content'],rows=30,cells={})}, 422)
 sheet = owner.request('saveSpreadsheetInvoice', dict(data,version=sheet['version'],name='Replacement.png'))
 assert owner.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G2'})['name'] == 'Replacement.png'
 sheet = owner.request('saveSpreadsheetInvoice', dict(data,version=sheet['version'],image=None))
 owner.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G2'}, expected=404)
 assert sheet['content']['invoices'] == {'G31':{'name':'Last row.png'}}
 check(True, 'Replace and remove affect only the chosen row; shrinking a sheet cannot discard attached invoices')
 owner.request('deleteMindSpaceItem', {'id':sheet['id'],'version':sheet['version']})
 owner.request('getSpreadsheetInvoice', params={'id':sheet['id'],'cell':'G31'}, expected=404)
 check(True, 'Deleting a spreadsheet removes access to its invoices')
