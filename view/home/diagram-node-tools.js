'use strict';

class DiagramNodeTools {
  constructor(home) {
    this.home = home;
    this.busy = false;
  }

  clipboard() {
    try {
      const saved = this.memory || JSON.parse(sessionStorage.getItem('diagram-clipboard') || 'null');
      return saved?.userId === S.user?.id && saved?.nodes?.length ? saved : null;
    } catch { return this.memory?.userId === S.user?.id ? this.memory : null; }
  }

  setClipboard(nodes, root) {
    const keys = new Set(nodes.map((node) => node.id));
    const connections = this.home.connections.filter((edge) => keys.has(edge.from) && keys.has(edge.to));
    const hidden = this.home.hiddenConnections.filter((edge) => keys.has(edge.from) && keys.has(edge.to));
    const styles = this.home.connectionStyles.filter(style => keys.has(style.from) && keys.has(style.to));
    this.memory = { userId: S.user?.id, nodes: JSON.parse(JSON.stringify(nodes)), root,
      connections: connections.map((edge) => ({ ...edge })), hidden_connections: hidden.map(edge => ({ ...edge })),
      connection_styles: JSON.parse(JSON.stringify(styles)) };
    try { sessionStorage.setItem('diagram-clipboard', JSON.stringify(this.memory)); } catch { /* In-memory fallback. */ }
  }

  clearClipboard() {
    this.memory = null;
    try { sessionStorage.removeItem('diagram-clipboard'); } catch { /* Storage may be unavailable. */ }
  }

  async copy(cut = false) {
    const home = this.home;
    home.commitName();
    const branch = home.branchNodes(home.selectedKey);
    this.setClipboard(branch, home.selectedKey);
    if (cut) return this.remove(true);
    home.syncNodeState();
    toast(t('diagram_copied'));
  }

  async paste() {
    const home = this.home, clipboard = this.clipboard();
    if (!clipboard) { toast(t('diagram_clipboard_empty')); return; }
    home.commitName();
    const nodes = home.ensureTree();
    if (nodes.length + clipboard.nodes.length > 200) { home.showStatus(t('diagram_node_limit'), true); return; }
    const keys = new Map(clipboard.nodes.map((node) => [node.id, crypto.randomUUID()]));
    const copies = clipboard.nodes.map((node) => ({
      ...JSON.parse(JSON.stringify(node)), id: keys.get(node.id),
      parent_id: node.id === clipboard.root ? home.selectedKey : keys.get(node.parent_id),
      x: null, y: null,
    }));
    const combined = [...nodes, ...copies];
    const connections = (clipboard.connections || []).filter((edge) => keys.has(edge.from) && keys.has(edge.to))
      .map((edge) => ({ from: keys.get(edge.from), to: keys.get(edge.to) }));
    const hidden = (clipboard.hidden_connections || []).filter(edge => keys.has(edge.from) && keys.has(edge.to))
      .map(edge => ({ from: keys.get(edge.from), to: keys.get(edge.to) }));
    const styles = (clipboard.connection_styles || []).filter(edge => keys.has(edge.from) && keys.has(edge.to))
      .map(edge => ({ ...edge, from: keys.get(edge.from), to: keys.get(edge.to), points: null }));
    if (home.connections.length + connections.length > 1000) { home.showStatus(t('diagram_connection_limit'), true); return; }
    const byId = new Map(combined.map((node) => [node.id, node]));
    for (const node of copies) {
      let cursor = node, depth = 0;
      while (cursor?.parent_id) {
        if (++depth > 29) { home.showStatus(t('diagram_depth_limit'), true); return; }
        cursor = byId.get(cursor.parent_id);
      }
      if (!cursor || cursor.parent_id !== null) { toast(t('error_validation'), true); return; }
    }
    if (combined.reduce((size, node) => size + (node.image?.length || 0), 0) > 2097152) {
      home.showStatus(t('error_diagram_image_limit'), true); return;
    }
    home.nodes = combined;
    home.connections.push(...connections);
    home.hiddenConnections.push(...hidden);
    home.connectionStyles.push(...styles);
    home.selectedKey = keys.get(clipboard.root);
    home.name = copies.find((node) => node.id === home.selectedKey).text;
    home.editing = false;
    home.selected = true;
    home.menuOpen = false;
    home.drawStage();
    home.viewport.reveal(home.element('root'));
    await home.save();
  }

  remove(cut = false) {
    const home = this.home, key = home.selectedKey, generation = home.generation;
    // Explain whole-diagram deletion only when there is a single main idea.
    if (key === 'root' && home.ensureTree().filter((node) => node.parent_id === null).length === 1 && !cut) {
      confirmAction('diagram_delete_confirm', async () => {
        closeModal();
        if (generation === home.generation) await this.deleteNode(key);
      });
      return;
    }
    return this.deleteNode(key);
  }

  async deleteNode(key) {
    if (this.busy) return;
    const home = this.home, generation = home.generation;
    this.busy = true;
    try {
      if (!await home.finishBeforeSwitch()) return;
      const node = home.ensureTree().find((item) => item.id === key);
      if (!node) return;
      const deleteDiagram = key === 'root' && home.nodes.filter((item) => item.parent_id === null).length === 1;
      if (deleteDiagram) {
        const id = home.active.id;
        await home.makeRequest('deleteDiagram', { id, version: home.active.version });
        if (generation !== home.generation) return;
        if (S.sharedWorkspace) {
          const deleted = S.data.mindspace.items.find(item => item.diagram_id === id);
          if (deleted?.id === S.sharedWorkspace.root_id) { leaveSharedWorkspace(); await refresh(); return; }
          S.data.diagrams = S.data.diagrams.filter(item => item.id !== id);
          S.data.mindspace.items = S.data.mindspace.items.filter(item => item.diagram_id !== id);
          home.reset();
          await home.mindspace.go(S.data.mindspace.items.find(item => item.id === S.sharedWorkspace.root_id) || null, S.sharedWorkspace.space_id);
          return;
        }
        S.data.diagrams = S.data.diagrams.filter((item) => item.id !== id);
        if (S.data.mindspace) S.data.mindspace.items = S.data.mindspace.items.filter(item => item.diagram_id !== id);
        home.reset();
        home.active = S.data.diagrams[0] || null;
        home.nodes = home.treeFor(home.active);
        home.connections = home.connectionsFor(home.active);
        home.hiddenConnections = home.connectionsFor(home.active, 'hidden_connections');
        home.connectionStyles = home.stylesFor(home.active);
        home.name = home.nodes[0].text;
        home.rememberDiagram();
      } else {
        const removed = new Set(home.branchNodes(key).map((item) => item.id));
        home.nodes = home.nodes.filter((item) => !removed.has(item.id));
        home.connections = home.connections.filter((edge) => !removed.has(edge.from) && !removed.has(edge.to));
        home.hiddenConnections = home.hiddenConnections.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
        home.connectionStyles = home.connectionStyles.filter(edge => !removed.has(edge.from) && !removed.has(edge.to));
        for (const id of removed) { home.childDrafts.delete(id); home.submittedChildren.delete(id); home.draftOrigins.delete(id); }
        if (key === 'root') {
          // Keep the stable canvas anchor while preserving the other trees.
          const nextRoot = home.nodes.find((item) => item.parent_id === null);
          const previousKey = nextRoot.id;
          nextRoot.id = 'root';
          for (const field of ['connections', 'hiddenConnections', 'connectionStyles']) {
            home[field] = home[field].map(edge => ({
              ...edge,
              from: edge.from === previousKey ? 'root' : edge.from,
              to: edge.to === previousKey ? 'root' : edge.to,
            }));
          }
          for (const item of home.nodes) if (item.parent_id === previousKey) item.parent_id = 'root';
        }
        home.selectedKey = node.parent_id || 'root';
        home.name = home.nodes.find((item) => item.id === home.selectedKey).text;
        home.selected = true;
        home.editing = false;
        home.menuOpen = false;
      }
      home.drawStage();
      if (!deleteDiagram) await home.save();
      home.element('node')?.focus({ preventScroll: true });
    } catch (error) {
      if (generation === home.generation) home.showStatus(error.message, true);
    } finally { this.busy = false; }
  }

  content(node) {
    const labels = (position) => (node.labels || []).filter((label) => label.position === position)
      .map((label) => `<span class="diagram-label">${esc(label.text)}</span>`).join('');
    const inside = labels('inside'), outside = labels('outside');
    return {
      image: node.image ? `<img class="diagram-node-image" src="${esc(node.image)}" alt="${esc(t('diagram_node_image'))}" draggable="false">` : '',
      insideLabels: inside ? `<div class="diagram-node-labels">${inside}</div>` : '',
      outsideLabels: outside ? `<div class="diagram-node-labels diagram-node-labels-outside">${outside}</div>` : '',
    };
  }

  openLabels() {
    const home = this.home, key = home.selectedKey, generation = home.generation;
    const node = home.ensureTree().find((item) => item.id === key);
    home.menuOpen = false;
    home.syncNodeState();
    openModal('diagram_labels', `<form id="diagram-label-form">
      <div id="diagram-label-rows"></div>
      <div class="diagram-label-add"><button type="button" class="btn secondary" data-label-add="outside">${esc(t('diagram_add_label'))}</button>
      <button type="button" class="btn secondary" data-label-add="inside">${esc(t('diagram_add_label_inside'))}</button></div>
      ${formFooter()}</form>`);
    const form = document.getElementById('diagram-label-form');
    const rows = form.querySelector('#diagram-label-rows');
    const add = (label = { text: '', position: 'outside' }) => {
      if (rows.children.length >= 10) return;
      const row = document.createElement('div');
      row.className = 'diagram-label-row';
      row.innerHTML = `<input aria-label="${esc(t('diagram_label_text'))}" value="${esc(label.text)}" maxlength="80" required>
        <select aria-label="${esc(t('diagram_label_position'))}"><option value="outside">${esc(t('diagram_label_outside'))}</option><option value="inside">${esc(t('diagram_label_inside'))}</option></select>
        <button type="button" class="icon-btn" aria-label="${esc(t('diagram_remove_label'))}" title="${esc(t('diagram_remove_label'))}">${icon('trash')}</button>`;
      row.querySelector('select').value = label.position;
      row.querySelector('button').addEventListener('click', () => { row.remove(); update(); });
      rows.append(row);
      update();
      return row;
    };
    const update = () => form.querySelectorAll('[data-label-add]').forEach((button) => { button.disabled = rows.children.length >= 10; });
    for (const label of node.labels || []) add(label);
    form.querySelectorAll('[data-label-add]').forEach((button) => button.addEventListener('click', () => {
      add({ text: '', position: button.dataset.labelAdd })?.querySelector('input').focus();
    }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (generation !== home.generation || !home.nodes.includes(node)) { closeModal(); return; }
      const labels = [...rows.children].map((row) => ({ text: row.querySelector('input').value.trim(), position: row.querySelector('select').value }));
      if (labels.some((label) => !label.text)) { form.querySelector('.form-error').textContent = t('diagram_label_required'); return; }
      node.labels = labels;
      closeModal();
      home.drawStage();
      await home.save();
    });
  }

  openImage() {
    const home = this.home, key = home.selectedKey, generation = home.generation;
    const node = home.ensureTree().find((item) => item.id === key);
    home.menuOpen = false;
    home.syncNodeState();
    openModal('diagram_option_image', `<form id="diagram-image-form">
      ${node.image ? `<img class="diagram-image-preview" src="${esc(node.image)}" alt="${esc(t('diagram_node_image'))}">` : ''}
      <label class="field"><span>${esc(t('diagram_image_choose'))}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ${node.image ? '' : 'required'}></label>
      <p class="muted">${esc(t('diagram_image_hint'))}</p>
      ${formFooter('save', node.image ? `<button type="button" class="btn danger" id="diagram-image-remove">${esc(t('diagram_image_remove'))}</button>` : '')}</form>`);
    const form = document.getElementById('diagram-image-form');
    const valid = () => generation === home.generation && home.nodes.includes(node) && form.isConnected;
    const apply = async (image) => {
      if (!valid()) return;
      if (home.nodes.reduce((size, item) => size + (item.id === key ? image?.length || 0 : item.image?.length || 0), 0) > 2097152) throw new Error(t('error_diagram_image_limit'));
      node.image = image;
      closeModal();
      home.drawStage();
      await home.save();
    };
    form.querySelector('#diagram-image-remove')?.addEventListener('click', () => void apply(null));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = form.querySelector('input').files[0];
      if (!file) { closeModal(); return; }
      const submit = form.querySelector('[type=submit]');
      if (submit.disabled) return;
      submit.disabled = true;
      form.querySelector('.form-error').textContent = '';
      try { await apply(await this.prepareImage(file)); }
      catch (error) { if (valid()) form.querySelector('.form-error').textContent = error.message; }
      finally { submit.disabled = false; }
    });
  }

  async prepareImage(file) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10485760) throw new Error(t('error_diagram_image_file'));
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(t('error_diagram_image')));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = source;
    try { await image.decode(); } catch { throw new Error(t('error_diagram_image')); }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/webp', 0.82 - attempt * 0.12);
      if (result.length <= 349000) return result;
      canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
    }
    throw new Error(t('error_diagram_image'));
  }
}
