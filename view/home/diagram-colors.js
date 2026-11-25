'use strict';

class DiagramColors {
  static themes = [
    // Distinct color families share the app's muted accents and purple undertones.
    // Stable IDs preserve the combinations already saved in existing diagrams.
    {id:'default', background:'#fbf7ef', root:'#e8dff1', colors:['#e8dff1']},
    {id:'rainbow', background:'#fffdf5', root:'#e8dcf0', colors:['#f4ccd0','#f4dcc2','#f4edc8','#d5e7d9','#cce6ec','#d9daed','#e6cce4']},
    {id:'pastel', background:'#fcf0f4', root:'#e4b9cc', colors:['#f0d5df','#e7c5d5','#e2cadf','#eed9cf','#d6bdd3','#f1e2dc','#d9c2ce']},
    {id:'vivid', background:'#2c2336', root:'#e9d9ba', colors:['#bca7d5','#d5acbd','#b4c8bd','#dcc7a7','#aebfcd','#cab9cf']},
    {id:'ocean', background:'#edf3f5', root:'#4c6578', colors:['#bdd1dd','#d4e3e8','#b3c7ce','#d5d0e3','#c5d9d1','#c5cede']},
    {id:'forest', background:'#f1f3e9', root:'#5d705e', colors:['#c6d5ba','#d8ddbd','#bfd2c9','#e5ddbf','#cfc9d9','#d4dfc8']},
    {id:'sunset', background:'#fbf1e8', root:'#98695e', colors:['#e9c3ae','#e8d4b5','#d9b8b4','#e6d8c7','#d6c2da','#e8cfb9']},
    {id:'mono', background:'#f6f4f7', root:'#3e3549', colors:['#dfdce3','#eeebef','#cdc7d1','#e7e1dc','#d9d5dd']},
  ];
  static valid(color) { return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color); }
  static theme(id) { return this.themes.find(theme => theme.id === id) || this.themes[0]; }
  static luminance(color) {
    return color.match(/[\da-f]{2}/gi).map(value => {
      const n=parseInt(value,16)/255; return n<=.04045 ? n/12.92 : ((n+.055)/1.055)**2.4;
    }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  }
  static contrast(a,b) {
    const values=[this.luminance(a),this.luminance(b)];
    return (Math.max(...values)+.05)/(Math.min(...values)+.05);
  }
  static stroke(paint,background) {
    return [paint.border,paint.fill,paint.text].find(color=>this.contrast(color,background)>=3) || paint.text;
  }
  static paint(fill) {
    const rgb = fill.match(/[\da-f]{2}/gi).map(value => parseInt(value,16));
    const luminance = this.luminance(fill);
    return {fill, text:luminance>.33 ? '#343044' : luminance>.179 ? '#000000' : '#ffffff',
      border:'#'+rgb.map(value=>Math.round(luminance>.179 ? value*.58 : value+(255-value)*.4).toString(16).padStart(2,'0')).join('')};
  }
  static color(nodes, node, themeId, diagramColor = null) {
    if (this.valid(diagramColor)) return this.paint(diagramColor);
    if (!node) return null;
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
    const paint=this.node(child);
    if (!paint) return '';
    // Keep connections visible on Night and on custom backgrounds as well.
    const background=this.background();
    return DiagramColors.stroke(paint,background);
  }
  background() { return this.home.canvasColor || DiagramColors.theme(this.home.colorTheme).background; }
  preview(theme) {
    const samples=Array.from({length:4},(_,index)=>theme.colors[Math.round(index*(theme.colors.length-1)/3)]);
    const nodes = [[104,54,theme.root],[13,17,samples[0]],[195,17,samples[1]],
      [13,91,samples[2]],[195,91,samples[3]]];
    return `<svg viewBox="0 0 280 130" aria-hidden="true"><rect width="280" height="130" rx="10" fill="${theme.background}"/>${nodes.slice(1).map(([x,y,color])=>`<path d="M140 65 Q${x<100?95:185} 65 ${x+36} ${y+11}" fill="none" stroke="${DiagramColors.stroke(DiagramColors.paint(color),theme.background)}" stroke-width="2"/>`).join('')}${nodes.map(([x,y,color])=>`<rect x="${x}" y="${y}" width="72" height="22" rx="8" fill="${color}" stroke="${DiagramColors.paint(color).border}"/><path d="M${x+18} ${y+11}h36" stroke="${DiagramColors.paint(color).text}" stroke-opacity=".45" stroke-linecap="round"/>`).join('')}</svg>`;
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
    dialog.querySelector('[data-colors-preview]').style.backgroundColor=this.canvasColor || theme.background;
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
