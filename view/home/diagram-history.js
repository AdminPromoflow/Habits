'use strict';

// Document history stays in this tab; the camera and server version are independent.
class DiagramHistory {
  constructor(home, limit = 50) {
    this.home = home;
    this.limit = limit;
    this.reset();
  }

  reset() {
    this.identity = null;
    this.present = null;
    this.past = [];
  }

  key() {
    const home = this.home;
    const document = home.active ? `saved:${home.active.id}` : home.draft ? `draft:${home.draft.client_key}` : null;
    return document && `${S.user?.id ?? ''}:${document}`;
  }

  clone(value) {
    if (Array.isArray(value)) return value.map(item => this.clone(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.clone(item)]));
    }
    return value;
  }

  capture(saved = false) {
    const home = this.home;
    const diagram = saved ? home.active : null;
    return this.clone({
      name: diagram ? diagram.name : home.titleName(),
      colorTheme: diagram ? diagram.color_theme || null : home.colorTheme || null,
      diagramColor: diagram ? diagram.diagram_color || null : home.diagramColor || null,
      canvasColor: diagram ? diagram.canvas_color || null : home.canvasColor || null,
      nodes: diagram ? home.treeFor(diagram) : home.snapshot(),
      connections: diagram ? home.connectionsFor(diagram) : home.connections,
      hiddenConnections: diagram ? home.connectionsFor(diagram, 'hidden_connections') : home.hiddenConnections,
      connectionStyles: diagram ? home.stylesFor(diagram) : home.connectionStyles,
      selectedKey: home.selectedKey,
    });
  }

  same(left, right) {
    const home = this.home;
    return left.name === right.name && left.colorTheme === right.colorTheme && left.diagramColor === right.diagramColor && left.canvasColor === right.canvasColor && home.fingerprint(left.nodes) === home.fingerprint(right.nodes) &&
      home.connectionFingerprint(left.connections) === home.connectionFingerprint(right.connections) &&
      home.connectionFingerprint(left.hiddenConnections) === home.connectionFingerprint(right.hiddenConnections) &&
      home.styleFingerprint(left.connectionStyles) === home.styleFingerprint(right.connectionStyles);
  }

  ensure() {
    const key = this.key();
    if (key === this.identity) return;
    this.reset();
    this.identity = key;
    if (key) this.present = this.capture(!!this.home.active);
  }

  reconcile() {
    this.ensure();
    if (!this.present) return;
    const current = this.capture();
    // A refresh from another tab starts a new history, rather than undoing its edits.
    if (!this.same(this.present, current)) this.past = [];
    this.present = current;
  }

  adopt() {
    // The first save gives a draft an ID without discarding edits made during it.
    this.identity = this.key();
  }

  checkpoint() {
    this.ensure();
    if (!this.present) return;
    const current = this.capture();
    if (!this.same(this.present, current)) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.present = current;
  }

  handleKey(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== 'z') return false;
    const home = this.home, target = event.target;
    if ((S.view && S.view !== 'mindspaces' && !S.sharedWorkspace) || S.mode === 'admin' || (!home.active && !home.draft) ||
        document.querySelector('dialog[open]') || target.isContentEditable ||
        target.closest?.('[contenteditable="true"]') ||
        (home.isNameField(target) && !target.readOnly) || target.id === 'diagram-title-input' ||
        target.id === 'diagram-connection-label-input' ||
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !['checkbox', 'button', 'radio'].includes(target.type))) return false;
    event.preventDefault();
    if (event.repeat || home.switching || home.links.busy || home.nodeTools.busy || home.layoutOpen ||
        home.drag || home.resizing || home.connectionTool.drag || home.connectionTool.editingRoute ||
        home.viewport.isInteracting()) return true;
    const generation = home.generation;
    void this.undo().catch(error => {
      if (generation === home.generation) home.showStatus(error.message, true);
    });
    return true;
  }

  async undo() {
    this.checkpoint();
    if (!this.past.length) return false;
    const home = this.home, generation = home.generation;
    this.present = this.past.pop();
    const restored = this.clone(this.present);
    clearTimeout(home.timer);
    home.nodes = restored.nodes;
    home.connections = restored.connections;
    home.hiddenConnections = restored.hiddenConnections;
    home.connectionStyles = restored.connectionStyles;
    home.diagramTitle = restored.name;
    home.colorTheme = restored.colorTheme || null;
    home.diagramColor = restored.diagramColor || null;
    home.canvasColor = restored.canvasColor || null;
    home.selectedKey = home.nodes.some(node => node.id === restored.selectedKey) ? restored.selectedKey : 'root';
    home.name = home.nodes.find(node => node.id === home.selectedKey)?.text || '';
    home.childDrafts.clear();
    home.draftOrigins.clear();
    home.submittedChildren.clear();
    home.editing = home.titleEditing = home.menuOpen = home.checkboxMenuOpen = home.pickerOpen = false;
    home.selected = true;
    home.error = '';
    home.connectionTool.clearSelection();
    home.drawStage();
    home.element('node')?.focus({ preventScroll: true });
    // A pending request may finish with the pre-undo content. Send the restored
    // document next, using that response's version, without replacing the local tree.
    do {
      await home.save();
    } while (generation === home.generation && !home.error && home.hasChanges());
    return true;
  }
}
