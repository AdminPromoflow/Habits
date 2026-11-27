"""Real multipart uploads, downloads, scope checks and cascading folder removal."""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Y9sAAAAASUVORK5CYII=')


def run(owner, other, guest, check, base):
    def create(name):
        return owner.request('createMindSpaceItem', {'kind': 'files', 'name': name, 'client_key': str(uuid.uuid4())})

    library = create('File library acceptance')
    sibling = create('Private sibling library')
    identity = {'id': library['id']}

    def folder(name, parent=None, client=owner, extra=None, expected=200):
        return client.request('createLibraryFolder', dict(identity, name=name, parent_id=parent, client_key=str(uuid.uuid4()), **(extra or {})), expected)

    def upload(content=PNG, name='Photo.png', mime='image/png', client=owner, expected=200, parent=None, key=None, extra=None, csrf=True):
        boundary = '----mrm' + uuid.uuid4().hex
        values = dict(identity, name=name, parent_id=parent or '', client_key=key or str(uuid.uuid4()), **(extra or {}))
        body = b''
        for field, value in values.items():
            body += f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"\r\n\r\n{value}\r\n'.encode()
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode()
        request = urllib.request.Request(base + '/controller/files/index.php?action=uploadLibraryFile', data=body, headers={'Content-Type': 'multipart/form-data; boundary=' + boundary, 'X-CSRF-Token': client.csrf if csrf else 'invalid'})
        try:
            response = client.opener.open(request); status = response.status; raw = response.read()
        except urllib.error.HTTPError as error:
            status = error.code; raw = error.read()
        assert status == expected, (status, expected, raw[:300])
        result = json.loads(raw)
        return result.get('result', result)

    def download(entry, client=owner, expected=200, extra=None):
        query = urllib.parse.urlencode(dict(identity, action='libraryFile', entry_id=entry['id'], **(extra or {})))
        try:
            response = client.opener.open(base + '/controller/files/index.php?' + query); status = response.status; raw = response.read()
        except urllib.error.HTTPError as error:
            status = error.code; raw = error.read()
        assert status == expected, (status, expected, raw[:300])
        return raw

    guest.request('libraryEntries', params=identity, expected=401)
    other.request('libraryEntries', params=identity, expected=404)
    folder('Rejected', client=other, expected=404)
    upload(client=guest, expected=401)
    upload(csrf=False, expected=419)
    check(True, 'File libraries enforce authentication, ownership and CSRF on multipart uploads')

    parent = folder('Photos'); nested = folder('Scans', parent['id'])
    key = str(uuid.uuid4())
    photo = upload(parent=nested['id'], key=key)
    assert upload(parent=nested['id'], key=key)['id'] == photo['id']
    assert download(photo) == PNG
    download(photo, client=other, expected=404)
    download(photo, client=guest, expected=401)
    listing = owner.request('libraryEntries', params=identity)
    assert [entry['id'] for entry in listing['entries']] == [photo['id'], nested['id'], parent['id']]
    assert all('bytes' not in entry for entry in listing['entries'])
    check(True, 'Nested folders, newest-first dates and upload retries persist without duplicate files or inline binary catalog data')

    large = PNG + b'\0' * 600000
    chunked = upload(large, 'Large.png')
    assert download(chunked) == large
    upload(b'<?php echo "unsafe"; ?>', 'fake.pdf', 'application/pdf', expected=422)
    upload(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'fake.png', 'image/png', expected=422)
    upload(b'%PDF-1.7\ntruncated', 'broken.pdf', 'application/pdf', expected=422)
    upload(parent=photo['id'], expected=422)
    upload(name='../bad.png', expected=422)
    owner.request('createLibraryFolder', {'id': sibling['id'], 'name': 'Wrong folder', 'parent_id': parent['id'], 'client_key': str(uuid.uuid4())}, 404)
    check(True, 'Files span multiple database chunks intact; forged types, invalid PDFs and cross-library parents are rejected')

    renamed = owner.request('renameLibraryEntry', dict(identity, entry_id=photo['id'], name='New photo.png'))
    assert renamed['created_at'] == photo['created_at'] and renamed['name'] == 'New photo.png'
    email = other.boot()['user']['email']
    owner.request('shareMindSpace', {'target': 'item', 'id': library['id'], 'email': email, 'permissions': {}})
    share = next(row for row in other.data()['mindspace_shares']['incoming'] if row['item_id'] == library['id'])
    download(photo, client=other, extra={'share_id': share['id']}, expected=404)
    other.request('respondMindSpaceShare', {'id': share['id'], 'status': 'accepted'})
    shared = {'share_id': share['id']}
    assert download(photo, client=other, extra=shared) == PNG
    other.request('libraryEntries', params=dict(identity, **shared))
    folder('No edit', client=other, extra=shared, expected=403)
    upload(client=other, extra=shared, expected=403)
    other.request('deleteLibraryEntry', dict(identity, entry_id=photo['id'], **shared), 403)
    other.request('libraryEntries', params={'id': sibling['id'], **shared}, expected=404)
    check(True, 'Accepted viewers can read and download shared files, with no editing, deletion or access outside the shared library')

    owner.request('changeMindSpaceShare', {'id': share['id'], 'permissions': {'edit': True}})
    shared_photo = upload(client=other, extra=shared, name='Shared.png')
    assert download(shared_photo) == PNG
    other.request('deleteLibraryEntry', dict(identity, entry_id=photo['id'], **shared), 403)
    owner.request('revokeMindSpaceShare', {'id': share['id']})
    download(photo, client=other, extra=shared, expected=404)
    check(True, 'Edit permission allows shared uploads; revocation immediately blocks file downloads')

    owner.request('deleteLibraryEntry', dict(identity, entry_id=parent['id']))
    remaining = owner.request('libraryEntries', params=identity)['entries']
    assert not {parent['id'], nested['id'], photo['id']} & {entry['id'] for entry in remaining}
    download(photo, expected=404)
    owner.request('deleteMindSpaceItem', {'id': library['id'], 'version': library['version']})
    download(chunked, expected=404)
    check(True, 'Deleting folders removes descendants, and deleting the Files item removes access to every stored file')
