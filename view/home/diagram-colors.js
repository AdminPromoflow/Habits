'use strict';

class DiagramColors {
  static themes = [
    {id:'default', background:'#ffffff', root:'#f1ecf7', colors:['#f1ecf7']},
    {id:'pastel', background:'#fff9e9', root:'#efd2b8', colors:['#e8dc69','#f6bdca','#e5b5e7','#acd1c0','#f2ca60','#cfc0e4','#9fc9d9']},
    {id:'vivid', background:'#fffafa', root:'#29364b', colors:['#f6ca48','#f17e9c','#a995e8','#52bfa5','#ef9a52','#68b3e3']},
    {id:'ocean', background:'#f1f8fc', root:'#194b66', colors:['#a9d6e5','#86c5d8','#b8e3dc','#8eb8de','#bed5f0']},
    {id:'forest', background:'#f5f8ef', root:'#315a43', colors:['#b7d4a0','#d3df9b','#9bc7b3','#dce5bf','#9dbb98']},
    {id:'sunset', background:'#fff5ed', root:'#7e4357', colors:['#f5be91','#f0a6ab','#e8b6d0','#f3d28a','#d6b5dd']},
    {id:'mono', background:'#f5f6f8', root:'#354052', colors:['#dce1e9','#c7d0df','#e9ecf2','#b9c3d4']},
  ];
  static valid(color) { return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color); }
  static theme(id) { return this.themes.find(theme => theme.id === id) || this.themes[0]; }
  static paint(fill) {
    const rgb = fill.match(/[\da-f]{2}/gi).map(value => parseInt(value,16));
    const luminance = rgb.map(value => { const n=value/255; return n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4; })
      .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    return {fill, text:luminance>.179 ? '#000000' : '#ffffff',
      border:'#'+rgb.map(value=>Math.round(luminance>.179 ? value*.58 : value+(255-value)*.4).toString(16).padStart(2,'0')).join('')};
  }
  static color(nodes, node, themeId, diagramColor = null) {
    if (this.valid(diagramColor)) return this.paint(diagramColor);
    if (!themeId || themeId === 'default' || !node) return null;
    const theme = this.theme(themeId), byId = new Map(nodes.map(item=>[item.id,item]));
    if (node.parent_id === null) return this.paint(theme.root);
    let branch = node;
    const visited = new Set();
    while (byId.get(branch.parent_id)?.parent_id != null && !visited.has(branch.id)) {
      visited.add(branch.id); branch = byId.get(branch.parent_id);
    }
    const branches = nodes.filter(item=>item.parent_id !== null && byId.get(item.parent_id)?.parent_id === null);
    const index = Math.max(0,branches.findIndex(item=>item.id===branch.id));
    return this.paint(theme.colors[index % theme.colors.length]);
  }
  constructor(home) { this.home=home; this.dialog=null; }
  node(node) { return DiagramColors.color(this.home.ensureTree(),node,this.home.colorTheme,this.home.diagramColor); }
  css(node) {
    const paint=this.node(node);
    return paint ? `--diagram-node-bg:${paint.fill};--diagram-node-border:${paint.border};--diagram-node-text:${paint.text}` : '';
  }
  line(edge) {
    const nodes=this.home.ensureTree(), to=nodes.find(node=>node.id===edge.to), from=nodes.find(node=>node.id===edge.from);
    // Tree lines take the child's color; cross-links take the destination color.
    const child=from?.parent_id===to?.id ? from : to;
    return this.node(child)?.border || '';
  }
  background() { return this.home.canvasColor || (this.home.colorTheme ? DiagramColors.theme(this.home.colorTheme).background : ''); }
  preview(theme) {
    const nodes = [[104,54,theme.root],[13,17,theme.colors[0]],[195,17,theme.colors[1%theme.colors.length]],
      [13,91,theme.colors[2%theme.colors.length]],[195,91,theme.colors[3%theme.colors.length]]];
    return `<svg viewBox="0 0 280 130" aria-hidden="true"><rect width="280" height="130" rx="10" fill="${theme.background}"/>${nodes.slice(1).map(([x,y,color])=>`<path d="M140 65 Q${x<100?95:185} 65 ${x+36} ${y+11}" fill="none" stroke="${DiagramColors.paint(color).border}" stroke-width="2"/>`).join('')}${nodes.map(([x,y,color])=>`<rect x="${x}" y="${y}" width="72" height="22" rx="8" fill="${color}" stroke="${DiagramColors.paint(color).border}"/><path d="M${x+18} ${y+11}h36" stroke="${DiagramColors.paint(color).text}" stroke-opacity=".45" stroke-linecap="round"/>`).join('')}</svg>`;
  }
  open() {
    const home=this.home;
    if ((!home.active && !home.draft) || !home.mindspace.can('edit') || home.layoutOpen) return;
    this.generation=home.generation;
    this.choice=home.colorTheme || 'default';
    this.diagramColor=home.diagramColor || null;
    this.canvasColor=home.canvasColor || null;
    this.returnFocus=document.activeElement;
    home.menuOpen=false; home.layoutOpen=true; home.syncNodeState();
    const dialog=document.createElement('dialog'); this.dialog=dialog;
    dialog.className='diagram-colors-dialog'; dialog.setAttribute('aria-labelledby','diagram-colors-title');
    dialog.innerHTML=`<header class="diagram-layout-header"><div><h2 id="diagram-colors-title">${esc(t('diagram_colors'))}</h2><p>${esc(t('diagram_colors_intro'))}</p></div><button type="button" class="diagram-layout-close" data-colors-close aria-label="${esc(t('close'))}">×</button></header>
      <div class="diagram-colors-body"><div class="diagram-color-themes" role="group" aria-label="${esc(t('diagram_color_combinations'))}">${DiagramColors.themes.map(theme=>`<button type="button" class="diagram-color-card" data-color-theme="${theme.id}" aria-pressed="false">${this.preview(theme)}<span>${esc(t(`diagram_theme_${theme.id}`))}</span><span class="diagram-color-check" aria-hidden="true">✓</span></button>`).join('')}</div>
      <div class="diagram-color-custom"><label>${esc(t('diagram_color_diagram'))}<input type="color" data-custom-color="diagram"></label><label>${esc(t('diagram_color_background'))}<input type="color" data-custom-color="canvas"></label></div>
      <div class="diagram-color-preview" data-colors-preview></div>
      <button type="button" class="text-btn" data-colors-reset>${esc(t('diagram_color_reset'))}</button></div>
      <footer class="diagram-layout-footer"><button type="button" class="btn secondary" data-colors-close>${esc(t('cancel'))}</button><button type="button" class="btn primary" data-colors-apply>${esc(t('diagram_layout_apply'))}</button></footer>`;
    dialog.addEventListener('click',event=>{
      event.stopPropagation();
      const theme=event.target.closest('[data-color-theme]');
      if(theme) {this.choice=theme.dataset.colorTheme;this.diagramColor=this.canvasColor=null;this.update();}
      else if(event.target.closest('[data-colors-reset]')) {this.choice='default';this.diagramColor=this.canvasColor=null;this.update();}
      else if(event.target.closest('[data-colors-close]')) this.close();
      else if(event.target.closest('[data-colors-apply]')) {
        const current=this.generation===home.generation;
        const selection={theme:this.choice,diagramColor:this.diagramColor,canvasColor:this.canvasColor};
        this.close(); if(current) void this.apply(selection);
      }
    });
    dialog.addEventListener('input',event=>{
      const field=event.target.dataset.customColor;
      if(field==='diagram') this.diagramColor=event.target.value;
      if(field==='canvas') this.canvasColor=event.target.value;
      if(field) this.update();
    });
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    dialog.addEventListener('close',()=>this.close());
    document.body.append(dialog); this.update(); dialog.showModal();
    dialog.querySelector(`[data-color-theme="${this.choice}"]`)?.focus();
  }
  update() {
    const dialog=this.dialog, theme=DiagramColors.theme(this.choice);
    dialog.querySelectorAll('[data-color-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.colorTheme===this.choice && !this.diagramColor && !this.canvasColor)));
    dialog.querySelector('[data-custom-color="diagram"]').value=this.diagramColor || theme.root;
    dialog.querySelector('[data-custom-color="canvas"]').value=this.canvasColor || theme.background;
    dialog.querySelector('[data-colors-preview]').innerHTML=this.preview({...theme,background:this.canvasColor || theme.background,
      root:this.diagramColor || theme.root,colors:this.diagramColor?[this.diagramColor]:theme.colors});
  }
  async apply({theme,diagramColor=null,canvasColor=null}) {
    const home=this.home;
    if ((!home.active && !home.draft) || !home.mindspace.can('edit') || !DiagramColors.themes.some(item=>item.id===theme) ||
        [diagramColor,canvasColor].some(color=>color!==null && !DiagramColors.valid(color))) return;
    home.colorTheme=theme==='default'?null:theme;
    home.diagramColor=diagramColor?.toLowerCase() || null;
    home.canvasColor=canvasColor?.toLowerCase() || null;
    home.menuOpen=false;home.drawStage();
    home.element('node')?.focus({preventScroll:true});
    await home.save();
  }
  close() {
    if(!this.dialog) return;
    const dialog=this.dialog;this.dialog=null;
    if(dialog.open) dialog.close();dialog.remove();this.home.layoutOpen=false;
    if(this.returnFocus?.isConnected) this.returnFocus.focus({preventScroll:true});
  }
}
