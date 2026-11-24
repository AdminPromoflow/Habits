'use strict';

const sharedWorkspaceFields = ['mindspace', 'diagrams', 'habits', 'categories', 'routines', 'completions'];
function sharedCan(right) { return !S.sharedWorkspace || !!S.sharedWorkspace.permissions[right]; }
function sharedOwnCatalog(data) { return Object.fromEntries(sharedWorkspaceFields.map(key => [key, data[key]])); }
function sharedApply(result) {
  S.sharedWorkspace.permissions = result.permissions;
  S.sharedWorkspace.name = result.name;
  S.sharedWorkspace.root_id = result.root_id;
  S.sharedWorkspace.space_id = result.space_id;
  Object.assign(S.data, result.workspace);
}
async function openSharedWorkspace(id, preserveUrl = false) {
  if (!await pageControllers.home.mindspace.flush()) return;
  const userId = S.user.id;
  const result = await api('sharedMindSpace', null, {id});
  if (S.user?.id !== userId) return;
  const previousUrl = S.sharedWorkspace?.previousUrl || (preserveUrl ? location.origin + location.pathname : location.href);
  if (!S.sharedWorkspace) S.ownedWorkspace = sharedOwnCatalog(S.data);
  S.sharedWorkspace = {id, previousUrl, ...result};
  sharedApply(result);
  S.view = 'sharing'; S.mode = 'personal';
  const url = new URL(location.href);
  url.searchParams.set('shared', id);
  if (!preserveUrl) {
    for (const key of ['diagram','topic','item','folder','space','cell','card','column','habit']) url.searchParams.delete(key);
    url.searchParams.set('space', result.space_id);
    const root = result.workspace.mindspace.items.find(item => item.id === result.root_id);
    if (!root || root.kind === 'folder') url.searchParams.set('folder', result.root_id || 0);
    else if (root.kind === 'diagram') url.searchParams.set('diagram', root.diagram_id);
    else url.searchParams.set('item', root.id);
  }
  history.replaceState(null, '', url.href);
  pageControllers.home.reset(); closeModal(); render();
}
function leaveSharedWorkspace() {
  if (!S.sharedWorkspace) return;
  const previousUrl = new URL(S.sharedWorkspace.previousUrl);
  previousUrl.searchParams.delete('shared');
  Object.assign(S.data, S.ownedWorkspace);
  S.sharedWorkspace = null; S.ownedWorkspace = null;
  pageControllers.home.reset(); history.replaceState(null, '', previousUrl.href);
}
function sharedWorkspacePage() {
  const space = pageControllers.home.mindspace;
  const content = homePage();
  return `<div class="shared-workspace-header"><button class="btn secondary" data-action="shared-workspace-back">← ${esc(t('sharing'))}</button><span>${sharingPermissionsText(S.sharedWorkspace.permissions)}</span></div>
    <div class="shared-workspace-layout${sharedCan('edit') ? '' : ' is-readonly'}"><aside class="mindspace-explorer shared-explorer">${space.explorer()}</aside><div class="shared-workspace-editor">${content}</div></div>`;
}
function mountSharedWorkspace() {
  if (!S.sharedWorkspace) return;
  const space = pageControllers.home.mindspace;
  const panel = document.getElementById('mindspace-panel');
  if (!sharedCan('edit')) {
    panel?.querySelectorAll('textarea,input').forEach(input => { input.readOnly = true; });
    panel?.querySelectorAll('[id^="diagram-interaction-hint"]').forEach(hint => { hint.textContent = t('ms_no_edit_hint'); });
    panel?.querySelectorAll('select,[data-action^="ms-card"],[data-action="ms-column-new"],[data-action="ms-sprint"],[data-action="ms-sheet-row"],[data-action="ms-sheet-column"],[data-action="ms-habit-new"],[data-action="ms-habits-select"],[data-action="toggle-habit"],.diagram-controls,.diagram-task-checkbox').forEach(control => { if ('disabled' in control) control.disabled = true; else control.hidden = true; });
    panel?.querySelectorAll('[draggable="true"]').forEach(control => { control.draggable = false; });
  }
  if (!sharedCan('move')) document.querySelectorAll('[data-ms-draggable]').forEach(control => { control.draggable = false; });
  const add = document.querySelector('.mindspace-add');
  if (add) add.hidden = !sharedCan('edit') || (!S.sharedWorkspace.workspace?.mindspace?.spaces?.[0]?.permissions?.edit && !space.folderId());
}

for (const type of ['pointerdown', 'click', 'dblclick', 'keydown']) document.addEventListener(type, event => {
  if (!S.sharedWorkspace || sharedCan('edit') || !event.target.closest?.('#mindmap-stage')) return;
  if (type === 'keydown' && !['Delete','Backspace','Enter','F2'].includes(event.key) && !((event.ctrlKey || event.metaKey) && ['v','x','z','y'].includes(event.key.toLowerCase()))) return;
  if (type === 'click' && !event.target.closest?.('.diagram-controls,.diagram-menu,.diagram-task-checkbox,.diagram-connection-tools')) return;
  if (type !== 'keydown' && !event.target.closest?.('.diagram-node,.diagram-controls,.diagram-menu,.diagram-task-checkbox,.diagram-connection,.diagram-connection-tools')) return;
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
