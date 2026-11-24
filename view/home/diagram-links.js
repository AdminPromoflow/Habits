'use strict';

class DiagramLinks {
  constructor(home) {
    this.home = home;
    this.busy = false;
    this.arrival = null;
    this.navigation = new DiagramLinkNavigation(home);
    const show = event => {
      if (this.tooltip?.contains(event.target)) { clearTimeout(this.tooltipTimer); return; }
      const button = event.target.closest?.('[data-topic-link-details]');
      if (button) this.showTooltip(button);
    };
    const leave = event => {
      if (!this.tooltip) return;
      if (this.tooltip?.contains(event.relatedTarget) || this.tooltipButton?.contains(event.relatedTarget)) return;
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = setTimeout(() => this.hideTooltip(), 150);
    };
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusout', leave);
    document.addEventListener('pointerdown', () => this.hideTooltip());
    document.addEventListener('click', () => this.hideTooltip());
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.hideTooltip(); });
    window.addEventListener('resize', () => this.positionTooltip());
    window.addEventListener('scroll', event => { if (!this.tooltip?.contains(event.target)) this.positionTooltip(); }, true);
  }

  badge(node) {
    const returns = this.navigation.incoming(node);
    const forward = node.link ? this.arrowButton('open-diagram-link', this.navigation.direction(node.link),
      t('diagram_link_open'), [this.targetDetails(node.link)]) : '';
    const details = returns.map(edge => ({ diagram: edge.diagram_name, topic: edge.text || t('diagram_link_untitled') }));
    const back = returns.length === 1 ? this.arrowButton('open-diagram-return', 'back', this.returnLabel(returns[0]), details,
      `data-return-diagram="${returns[0].diagram_id}" data-return-node="${esc(returns[0].node_id)}"`)
      : returns.length ? this.arrowButton('choose-diagram-return', 'back', t('diagram_link_returns'), details) : '';
    return forward || back ? `<div class="diagram-topic-links">${forward}${back}</div>` : '';
  }

  targetDetails(link) {
    if (link.item_id) {
      const item = this.home.mindspace.allItems().find(entry => entry.id === link.item_id);
      return {diagram:item?.name || t('diagram_link_unavailable'), topic:item ? MindSpaceLinkTargets.label(item, link.target) : t('diagram_link_unavailable'),
        kindLabel:item ? t(`ms_kind_${item.kind}`) : t('ms_link_element'), partLabel:t(`ms_link_${link.target?.type || 'destination'}`)};
    }
    const diagram = this.navigation.catalog().find(item => item.id === link.diagram_id);
    if (link.node_id === null) return { diagram: diagram?.name || t('diagram_link_unavailable'), topic: null };
    const node = diagram?.nodes?.find(item => item.id === link.node_id);
    return { diagram: diagram?.name || t('diagram_link_unavailable'),
      topic: node ? node.text || t('diagram_link_untitled') : t('diagram_link_unavailable') };
  }

  arrowButton(action, direction, label, details, attributes = '') {
    const description = details.map(item => `${item.kindLabel || t('diagram_link_diagram')}: ${item.diagram}. ${item.topic === null ? t('diagram_link_whole') : `${item.partLabel || t('diagram_link_topic_name')}: ${item.topic}`}`).join('\n');
    return `<button type="button" class="diagram-topic-link" data-action="${action}" ${attributes}
      data-topic-link-details="${esc(JSON.stringify(details))}" aria-label="${esc(label)}" aria-description="${esc(description)}">
      <span class="diagram-link-direction" aria-hidden="true">${direction === 'back' ? '←' : '→'}</span></button>`;
  }

  detailsHtml(details) {
    return details.map(item => `<span class="diagram-link-detail"><span class="diagram-link-detail-label">${esc(item.kindLabel || t('diagram_link_diagram'))}</span>
      <strong>${esc(item.diagram)}</strong>${item.topic === null ? `<span>${esc(t('diagram_link_whole'))}</span>`
        : `<span class="diagram-link-detail-label">${esc(item.partLabel || t('diagram_link_topic_name'))}</span>
          <span class="diagram-link-detail-topic">${esc(item.topic)}</span>`}</span>`).join('');
  }

  showTooltip(button) {
    clearTimeout(this.tooltipTimer);
    if (this.tooltipButton === button) return;
    this.hideTooltip();
    const details = JSON.parse(button.dataset.topicLinkDetails);
    const tooltip = document.createElement('div');
    tooltip.id = 'diagram-topic-tooltip';
    tooltip.className = 'diagram-link-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.innerHTML = this.detailsHtml(details);
    document.body.append(tooltip);
    button.setAttribute('aria-describedby', tooltip.id);
    this.tooltip = tooltip;
    this.tooltipButton = button;
    this.positionTooltip();
  }

  positionTooltip() {
    const tooltip = this.tooltip, button = this.tooltipButton;
    if (!tooltip || !button) return;
    if (!button.isConnected) { this.hideTooltip(); return; }
    const anchor = button.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8));
    const top = anchor.bottom + 8 + box.height <= window.innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    clearTimeout(this.tooltipTimer);
    this.tooltipButton?.removeAttribute('aria-describedby');
    this.tooltip?.remove();
    this.tooltip = null;
    this.tooltipButton = null;
  }

  returnLabel(edge) {
    return t('diagram_link_return_to', { name: `${edge.diagram_name} · ${edge.text || t('diagram_link_untitled')}` });
  }

  chooseReturn(node) {
    if (!node) return;
    const returns = this.navigation.incoming(node);
    openModal('diagram_link_returns', `<div class="diagram-return-list">${returns.map(edge =>
      `<button type="button" class="btn secondary" data-action="open-diagram-return" data-return-diagram="${edge.diagram_id}"
        data-return-node="${esc(edge.node_id)}" aria-label="${esc(this.returnLabel(edge))}"><span aria-hidden="true">←</span>
        ${this.detailsHtml([{ diagram: edge.diagram_name, topic: edge.text || t('diagram_link_untitled') }])}</button>`).join('')}</div>`);
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
      const mindspace = home.mindspace.enabled() ? await home.makeRequest('mindspace') : null;
      if (generation !== home.generation) return;
      if (mindspace) S.data.mindspace = mindspace;
      // Use the current editor snapshot for targets in this same diagram.
      const current = { ...home.active, nodes: home.snapshot(), connections: home.connections,
        hidden_connections: home.hiddenConnections, connection_styles: home.connectionStyles };
      const items = diagrams.map(item => item.id === current.id ? current : item);
      this.showPicker(node, items, generation, mindspace?.items || []);
    } catch (error) {
      if (generation === home.generation) home.showStatus(error.message, true);
    } finally { this.busy = false; }
  }

  showPicker(node, diagrams, generation, items = []) {
    const home = this.home;
    const documents = [...diagrams.map(item => ({...item, kind:'diagram', key:`diagram:${item.id}`})),
      ...items.filter(item => item.kind !== 'diagram').map(item => ({...item, key:`item:${item.id}`}))];
    const savedKey = node.link?.item_id ? `item:${node.link.item_id}` : `diagram:${node.link?.diagram_id}`;
    let target = documents.find(item => item.key === savedKey) || documents.find(item => item.key === `diagram:${home.active.id}`) || documents[0];
    if (!target) return;
    let key = target.key === savedKey ? (target.kind === 'diagram' ? node.link.node_id : node.link.target?.id) : null;
    let scope = key ? 'part' : 'whole', scale = 1, plan;
    const targetType = () => target.kind === 'diagram' ? 'topic' : MindSpaceLinkTargets.type(target);
    const choices = () => target.kind === 'diagram' ? target.nodes.map((item, index) => ({id:item.id, label:item.text || `${t('diagram_link_untitled')} ${index + 1}`})) : MindSpaceLinkTargets.choices(target);
    const linkValue = () => target.kind === 'diagram' ? {diagram_id:target.id, node_id:scope === 'part' ? key : null}
      : {item_id:target.id, target:scope === 'part' ? {type:targetType(), id:key} : null};
    const validTarget = () => scope === 'whole' || (target.kind === 'diagram' ? choices().some(item => item.id === key) : MindSpaceLinkTargets.valid(target, linkValue().target));
    const optionLabel = item => {
      const entry = item.kind === 'diagram' ? items.find(file => file.diagram_id === item.id) : item;
      const path = entry && home.mindspace.enabled() ? [home.mindspace.spaceName(entry.mindspace_id), ...home.mindspace.pathTo(entry.parent_id, entry.mindspace_id).map(folder => folder.name)].join(' / ') : '';
      return [path, t(`ms_kind_${item.kind}`), item.name].filter(Boolean).join(' · ');
    };
    openModal('diagram_option_link', `<form id="diagram-link-form">
      <label class="field"><span>${esc(t('ms_link_element'))}</span><select id="diagram-link-diagram">
        ${documents.map(item => `<option value="${item.key}">${esc(optionLabel(item))}</option>`).join('')}</select></label>
      <fieldset class="diagram-link-scope"><legend>${esc(t('diagram_link_destination'))}</legend>
        <label><input type="radio" name="link-scope" value="whole"><span id="diagram-link-whole-label"></span></label>
        <label id="diagram-link-part-option"><input type="radio" name="link-scope" value="part"><span id="diagram-link-part-label"></span></label>
      </fieldset>
      <p class="muted">${esc(t('ms_link_hint'))}</p>
      <div class="diagram-link-preview-tools">
        <span>${esc(t('ms_link_preview'))}</span><div id="diagram-link-zoom-tools">
        <button type="button" class="btn ghost" data-preview-zoom="out" aria-label="${esc(t('diagram_link_zoom_out'))}">−</button>
        <button type="button" class="btn ghost" data-preview-zoom="in" aria-label="${esc(t('diagram_link_zoom_in'))}">+</button>
        <button type="button" class="btn ghost" data-preview-zoom="fit">${esc(t('diagram_link_fit'))}</button></div>
      </div>
      <div class="diagram-link-preview" tabindex="0" aria-label="${esc(t('ms_link_preview'))}"></div>
      <label class="field diagram-link-topic-field"><span id="diagram-link-part-field-label"></span><select id="diagram-link-node"></select></label>
      <label class="field diagram-link-cell-field"><span>${esc(t('ms_link_cell'))}</span><input id="diagram-link-cell" placeholder="B3" maxlength="5" autocomplete="off" spellcheck="false"><small>${esc(t('ms_link_cell_hint'))}</small></label>
      <p class="diagram-link-selection" role="status"></p>
      ${formFooter('save', node.link ? `<button type="button" class="btn danger" id="diagram-link-remove">${esc(t('diagram_link_remove'))}</button>` : '')}
    </form>`, true);
    const form = document.getElementById('diagram-link-form'), select = form.querySelector('#diagram-link-diagram');
    const topic = form.querySelector('#diagram-link-node'), cell = form.querySelector('#diagram-link-cell'), preview = form.querySelector('.diagram-link-preview');
    const valid = () => generation === home.generation && home.nodes.includes(node) && form.isConnected;
    const update = () => {
      const type = targetType(), selected = choices().find(item => item.id === key);
      if (!type) scope = 'whole';
      form.querySelectorAll('[name="link-scope"]').forEach(radio => { radio.checked = radio.value === scope; });
      form.querySelector('#diagram-link-whole-label').textContent = t(target.kind === 'diagram' ? 'diagram_link_whole' : 'ms_link_whole');
      form.querySelector('#diagram-link-part-option').hidden = !type;
      form.querySelector('#diagram-link-part-label').textContent = t(type === 'topic' ? 'diagram_link_topic' : `ms_link_${type}`);
      form.querySelector('#diagram-link-part-field-label').textContent = t(type === 'topic' ? 'diagram_link_topic' : `ms_link_${type}`);
      form.querySelector('.diagram-link-topic-field').hidden = scope !== 'part' || type === 'cell';
      form.querySelector('.diagram-link-cell-field').hidden = scope !== 'part' || type !== 'cell';
      form.querySelector('#diagram-link-zoom-tools').hidden = target.kind !== 'diagram';
      topic.value = key || ''; cell.value = type === 'cell' ? key || '' : '';
      preview.querySelectorAll('[data-link-target]').forEach(item => item.setAttribute('aria-pressed', String(scope === 'part' && item.dataset.linkTarget === key)));
      form.querySelector('.diagram-link-selection').textContent = scope === 'whole'
        ? `${t(target.kind === 'diagram' ? 'diagram_link_whole' : 'ms_link_whole')}: ${target.name}`
        : validTarget() ? `${target.name} → ${type === 'cell' ? key : selected.label}` : t(type === 'cell' ? 'ms_link_cell_invalid' : 'ms_link_choose_part');
      form.querySelector('[type="submit"]').disabled = !validTarget();
    };
    const zoom = value => {
      if (!plan) return;
      scale = value; const svg = preview.querySelector('svg');
      svg.style.width = `${plan.width * scale}px`; svg.style.height = `${plan.height * scale}px`;
    };
    const fit = () => { if (plan) zoom(Math.min(1, Math.max(1, preview.clientWidth - 24) / plan.width, 280 / plan.height)); };
    const draw = () => {
      const result = target.kind === 'diagram' ? this.preview(target) : {html:MindSpaceLinkTargets.preview(target), plan:null};
      plan = result.plan; preview.innerHTML = result.html;
      preview.classList.toggle('is-sheet-preview', target.kind === 'spreadsheet');
      topic.innerHTML = `<option value="">${esc(t('ms_link_choose_part'))}</option>` + choices().map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('');
      fit(); update(); preview.scrollLeft = 0; preview.scrollTop = 0;
    };
    select.value = target.key;
    select.addEventListener('change', () => { target = documents.find(item => item.key === select.value); key = null; scope = 'whole'; draw(); });
    form.querySelectorAll('[name="link-scope"]').forEach(radio => radio.addEventListener('change', () => { scope = radio.value; update(); }));
    topic.addEventListener('change', () => { key = topic.value || null; update(); });
    cell.addEventListener('input', () => { key = cell.value.trim().toUpperCase(); update(); });
    const choose = event => {
      const item = event.target.closest('[data-link-target]');
      if (!item || (event.type === 'keydown' && !['Enter',' '].includes(event.key))) return;
      event.preventDefault(); key = item.dataset.linkTarget; scope = 'part'; update();
    };
    preview.addEventListener('click', choose); preview.addEventListener('keydown', choose);
    form.querySelectorAll('[data-preview-zoom]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.previewZoom;
      if (action === 'fit') fit(); else zoom(Math.max(0.001, Math.min(2, scale * (action === 'in' ? 1.5 : 1 / 1.5))));
    }));
    const apply = async link => {
      if (!valid()) { closeModal(); return; }
      node.link = link; closeModal(); home.selectedKey = node.id; home.name = node.text; home.selected = true; home.drawStage(); await home.save();
    };
    form.addEventListener('submit', event => { event.preventDefault(); if (validTarget()) void apply(linkValue()); });
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
    const length = Math.max(5, Math.floor((width - 24) / 9));
    return text.split('\n').flatMap(line => {
      const chars = Array.from(line), result = [];
      while (chars.length > length) {
        const space = chars.slice(0, length + 1).lastIndexOf(' ');
        result.push(chars.splice(0, space > 0 ? space : length).join(''));
        if (chars[0] === ' ') chars.shift();
      }
      result.push(chars.join(''));
      return result;
    });
  }

  async follow(link, navigation = {}) {
    const home = this.home, generation = home.generation;
    const sourceKey = home.selectedKey;
    if (!link || this.busy || home.switching) return;
    if (link.item_id) return this.followItem(link);
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
      this.navigation.prepare(link, sourceKey, navigation);
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

  async followItem(link) {
    const home = this.home, generation = home.generation;
    this.busy = true;
    try {
      let data;
      do {
        if (!await home.finishBeforeSwitch() || generation !== home.generation) return;
        data = await home.makeRequest('data');
        if (generation !== home.generation) return;
      } while (home.saving || home.hasChanges());
      const item = data.mindspace?.items.find(entry => entry.id === link.item_id);
      if (!MindSpaceLinkTargets.valid(item, link.target, data.habits || [])) throw new Error(t('error_diagram_link_missing'));
      S.data.mindspace = data.mindspace; S.data.diagrams = data.diagrams; S.data.habits = data.habits;
      await home.mindspace.go(item, item.mindspace_id, link.target);
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
