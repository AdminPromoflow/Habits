'use strict';

class DiagramLinks {
  constructor(home) {
    this.home = home;
    this.busy = false;
    this.arrival = null;
  }

  badge(node) {
    return node.link ? `<button type="button" class="diagram-topic-link" data-action="open-diagram-link"
      aria-label="${esc(t('diagram_link_open'))}" title="${esc(t('diagram_link_open'))}">${icon('link')}</button>` : '';
  }

  async open() {
    const home = this.home, generation = home.generation, key = home.selectedKey;
    if (this.busy) return;
    this.busy = true;
    try {
      if (!await home.finishBeforeSwitch() || generation !== home.generation) return;
      const node = home.ensureTree().find(item => item.id === key);
      if (!node) return;
      home.menuOpen = false;
      home.syncNodeState();
      const diagrams = await home.makeRequest('diagrams');
      if (generation !== home.generation) return;
      // Use the current editor snapshot for targets in this same diagram.
      const current = { ...home.active, nodes: home.snapshot(), connections: home.connections,
        hidden_connections: home.hiddenConnections, connection_styles: home.connectionStyles };
      const items = diagrams.map(item => item.id === current.id ? current : item);
      this.showPicker(node, items, generation);
    } catch (error) {
      if (generation === home.generation) home.showStatus(error.message, true);
    } finally { this.busy = false; }
  }

  showPicker(node, diagrams, generation) {
    const home = this.home;
    let target = diagrams.find(item => item.id === node.link?.diagram_id) || diagrams.find(item => item.id === home.active.id) || diagrams[0];
    if (!target) return;
    let key = target.nodes.some(item => item.id === node.link?.node_id) ? node.link.node_id : null;
    let scope = key ? 'node' : 'diagram';
    let scale = 1, plan;
    openModal('diagram_option_link', `<form id="diagram-link-form">
      <label class="field"><span>${esc(t('diagram_link_diagram'))}</span><select id="diagram-link-diagram">
        ${diagrams.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label>
      <fieldset class="diagram-link-scope"><legend>${esc(t('diagram_link_destination'))}</legend>
        <label><input type="radio" name="link-scope" value="diagram">${esc(t('diagram_link_whole'))}</label>
        <label><input type="radio" name="link-scope" value="node">${esc(t('diagram_link_topic'))}</label>
      </fieldset>
      <p class="muted">${esc(t('diagram_link_hint'))}</p>
      <div class="diagram-link-preview-tools">
        <span>${esc(t('diagram_link_preview'))}</span><div>
        <button type="button" class="btn ghost" data-preview-zoom="out" aria-label="${esc(t('diagram_link_zoom_out'))}">−</button>
        <button type="button" class="btn ghost" data-preview-zoom="in" aria-label="${esc(t('diagram_link_zoom_in'))}">+</button>
        <button type="button" class="btn ghost" data-preview-zoom="fit">${esc(t('diagram_link_fit'))}</button></div>
      </div>
      <div class="diagram-link-preview" tabindex="0" aria-label="${esc(t('diagram_link_preview'))}"></div>
      <label class="field diagram-link-topic-field"><span>${esc(t('diagram_link_topic'))}</span><select id="diagram-link-node"></select></label>
      <p class="diagram-link-selection" role="status"></p>
      ${formFooter('save', node.link ? `<button type="button" class="btn danger" id="diagram-link-remove">${esc(t('diagram_link_remove'))}</button>` : '')}
    </form>`, true);
    const form = document.getElementById('diagram-link-form');
    const select = form.querySelector('#diagram-link-diagram');
    const topic = form.querySelector('#diagram-link-node');
    const preview = form.querySelector('.diagram-link-preview');
    const valid = () => generation === home.generation && home.nodes.includes(node) && form.isConnected;
    const update = () => {
      form.querySelectorAll('[name="link-scope"]').forEach(radio => { radio.checked = radio.value === scope; });
      form.querySelector('.diagram-link-topic-field').hidden = scope !== 'node';
      topic.value = key || '';
      preview.querySelectorAll('[data-link-target]').forEach(item => {
        item.setAttribute('aria-pressed', String(scope === 'node' && item.dataset.linkTarget === key));
      });
      const selected = target.nodes.find(item => item.id === key);
      form.querySelector('.diagram-link-selection').textContent = scope === 'diagram'
        ? `${t('diagram_link_whole')}: ${target.name}`
        : selected ? `${target.name} → ${selected.text || t('diagram_link_untitled')}` : t('diagram_link_choose_topic');
      form.querySelector('[type="submit"]').disabled = scope === 'node' && !selected;
    };
    const zoom = (value) => {
      scale = value;
      const svg = preview.querySelector('svg');
      svg.style.width = `${plan.width * scale}px`;
      svg.style.height = `${plan.height * scale}px`;
    };
    const fit = () => zoom(Math.min(1, Math.max(1, preview.clientWidth - 24) / plan.width, 280 / plan.height));
    const draw = () => {
      const result = this.preview(target);
      plan = result.plan;
      preview.innerHTML = result.html;
      topic.innerHTML = `<option value="">${esc(t('diagram_link_choose_topic'))}</option>` + target.nodes.map((item, index) =>
        `<option value="${esc(item.id)}">${esc(item.text || `${t('diagram_link_untitled')} ${index + 1}`)}</option>`).join('');
      fit(); update();
      preview.scrollLeft = 0; preview.scrollTop = 0;
    };
    select.value = String(target.id);
    select.addEventListener('change', () => {
      target = diagrams.find(item => String(item.id) === select.value);
      key = null; draw();
    });
    form.querySelectorAll('[name="link-scope"]').forEach(radio => radio.addEventListener('change', () => { scope = radio.value; update(); }));
    topic.addEventListener('change', () => { key = topic.value || null; update(); });
    const choose = (event) => {
      const item = event.target.closest('[data-link-target]');
      if (!item || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
      event.preventDefault();
      key = item.dataset.linkTarget; scope = 'node'; update();
    };
    preview.addEventListener('click', choose);
    preview.addEventListener('keydown', choose);
    form.querySelectorAll('[data-preview-zoom]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.previewZoom;
      if (action === 'fit') fit();
      else zoom(Math.max(0.001, Math.min(2, scale * (action === 'in' ? 1.5 : 1 / 1.5))));
    }));
    const apply = async (link) => {
      if (!valid()) { closeModal(); return; }
      node.link = link;
      closeModal();
      home.selectedKey = node.id;
      home.name = node.text;
      home.selected = true;
      home.drawStage();
      await home.save();
    };
    form.addEventListener('submit', event => { event.preventDefault(); if (scope === 'node' && !key) return;
      void apply({ diagram_id: target.id, node_id: scope === 'node' ? key : null }); });
    form.querySelector('#diagram-link-remove')?.addEventListener('click', () => void apply(null));
    draw();
  }

  preview(diagram) {
    const nodes = diagram.nodes;
    const sizes = Object.fromEntries(nodes.map(node => {
      const width = this.home.nodeWidth(node);
      const lines = this.lines(node.text || '', width);
      return [node.id, { width, height: Math.max(48, lines.length * 24 + 24) + (node.image ? 100 : 0) }];
    }));
    const plan = DiagramLayout.arrange(nodes, sizes, diagram.connections || []);
    const hidden = diagram.hidden_connections || [];
    const paths = plan.edges.filter(edge => !hidden.some(item => this.home.connectionTool.same(item, edge)))
      .map(edge => `<path d="${esc(edge.path)}"/>`).join('');
    const topics = plan.nodes.map(box => {
      const node = nodes.find(item => item.id === box.id);
      const lines = this.lines(node.text || '', box.width);
      return `<g data-link-target="${esc(node.id)}" tabindex="0" role="button" aria-pressed="false"
        aria-label="${esc(node.text || t('diagram_link_untitled'))}" transform="translate(${box.x} ${box.y})">
        <title>${esc(node.text || t('diagram_link_untitled'))}</title><rect width="${box.width}" height="${box.height}" rx="16"/>
        ${node.image ? `<image href="${esc(node.image)}" x="10" y="10" width="${box.width - 20}" height="90"/>` : ''}
        <text x="${box.width / 2}" y="${node.image ? 128 : 28}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${box.width / 2}" dy="${i ? 24 : 0}">${esc(line)}</tspan>`).join('')}</text>
      </g>`;
    }).join('');
    return { plan, html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.width} ${plan.height}" aria-label="${esc(diagram.name)}">
      <g class="diagram-link-preview-edges">${paths}</g>${topics}</svg>` };
  }

  lines(text, width) {
    const length = Math.max(5, Math.floor((width - 24) / 10));
    return text.split('\n').flatMap(line => {
      const chars = Array.from(line), result = [];
      do { result.push(chars.splice(0, length).join('')); } while (chars.length);
      return result;
    });
  }

  async follow(link) {
    const home = this.home, generation = home.generation;
    if (!link || this.busy || home.switching) return;
    this.busy = true;
    try {
      let diagrams;
      do {
        if (!await home.finishBeforeSwitch() || generation !== home.generation) return;
        diagrams = await home.makeRequest('diagrams');
        if (generation !== home.generation) return;
      } while (home.saving || home.hasChanges());
      const target = diagrams.find(item => item.id === link.diagram_id);
      if (!target || (link.node_id !== null && !target.nodes.some(node => node.id === link.node_id))) throw new Error(t('error_diagram_link_missing'));
      S.data.diagrams = diagrams;
      if (target.id === home.active.id) {
        // Refresh a clean snapshot so removed/moved targets from another tab
        // cannot direct the camera to stale coordinates.
        home.active = target;
        home.nodes = home.treeFor(target);
        home.connections = home.connectionsFor(target);
        home.hiddenConnections = home.connectionsFor(target, 'hidden_connections');
        home.connectionStyles = home.stylesFor(target);
        home.diagramTitle = target.name;
        home.selectedKey = link.node_id || 'root';
        home.name = home.nodes.find(node => node.id === home.selectedKey)?.text || '';
        home.editing = false; home.menuOpen = false;
        home.drawStage();
        this.focus(link.node_id);
      } else {
        await home.openDiagram(target.id, link.node_id);
      }
    } catch (error) {
      if (generation === home.generation) home.showStatus(error.message, true);
    } finally { this.busy = false; }
  }

  focus(nodeId) {
    const home = this.home;
    if (nodeId !== null) {
      if (!home.ensureTree().some(node => node.id === nodeId)) {
        home.showStatus(t('error_diagram_link_missing'), true); return false;
      }
      home.selectNode(nodeId);
      const element = home.element('node', nodeId);
      home.viewport.focusElement(element);
      element?.focus({ preventScroll: true });
      this.refocusAfterImages(nodeId);
      return true;
    }
    home.selected = false; home.menuOpen = false; home.syncNodeState();
    const focused = home.viewport.focusElement(document.getElementById('diagram-scene') || home.element('node', 'root'), { overview: true });
    this.refocusAfterImages(nodeId);
    return focused;
  }

  refocusAfterImages(nodeId) {
    const home = this.home, generation = home.generation;
    const images = [...(document.getElementById('mindmap-stage')?.querySelectorAll?.('img') || [])].filter(image => !image.complete);
    if (!images.length) return;
    const camera = [home.viewport.x, home.viewport.y, home.viewport.scale];
    const selected = home.selectedKey;
    Promise.all(images.map(image => image.decode().catch(() => {}))).then(() => {
      if (generation !== home.generation || selected !== home.selectedKey ||
          camera.some((value, index) => value !== [home.viewport.x, home.viewport.y, home.viewport.scale][index])) return;
      home.positionTree();
      const element = nodeId === null ? document.getElementById('diagram-scene') || home.element('node', 'root') : home.element('node', nodeId);
      home.viewport.focusElement(element, { overview: nodeId === null });
    });
  }

  arrive() {
    const url = new URL(location.href);
    const target = url.searchParams.get('topic');
    if (!target || String(this.home.active?.id) !== url.searchParams.get('diagram') || this.arrival === url.href) return;
    this.arrival = url.href;
    this.focus(target === 'overview' ? null : target);
    // The target is a one-time arrival instruction. Subsequent reloads retain
    // the user's own pan and zoom rather than jumping back to the link target.
    url.searchParams.delete('topic');
    history.replaceState(null, '', url.href);
  }
}
