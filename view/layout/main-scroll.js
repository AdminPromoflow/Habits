'use strict';

// Follow the page's main content, or the same document when it is expanded.
class MainScrollNavigation {
  constructor() {
    this.frame = null;
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    this.mutationObserver = new MutationObserver(() => this.schedule());
    document.addEventListener('scroll', () => this.schedule(), {capture:true,passive:true});
    document.addEventListener('load', () => this.schedule(), true);
    window.addEventListener('resize', () => this.schedule());
    window.visualViewport?.addEventListener('resize', () => this.schedule());
  }

  sync() {
    const main = document.getElementById('main');
    if (main !== this.main) {
      this.resizeObserver.disconnect();
      this.mutationObserver.disconnect();
      this.main = main;
      if (main) {
        this.resizeObserver.observe(main);
        this.mutationObserver.observe(main, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});
      }
    }
    if (main && !this.controls) {
      this.controls = document.createElement('nav');
      this.controls.className = 'main-scroll-navigation';
      this.controls.hidden = true;
      for (const end of ['top','bottom']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `main-scroll-${end}`;
        button.innerHTML = icon('chevronDown');
        button.addEventListener('click', () => this.go(end));
        this.controls.append(button);
        this[end] = button;
      }
      document.body.append(this.controls);
    }
    if (this.controls) {
      this.controls.setAttribute('aria-label', t('scroll_navigation'));
      for (const end of ['top','bottom']) {
        const label = t(`scroll_to_${end}`);
        this[end].setAttribute('aria-label', label);
        this[end].title = label;
      }
    }
    this.schedule();
  }

  target() {
    if (!this.main?.isConnected) return null;
    const expanded = this.main.querySelector('.mobile-document-surface');
    if (expanded) return /auto|scroll/.test(getComputedStyle(expanded).overflowY) ? expanded : null;
    for (let element = this.main; element && element !== document.body; element = element.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 2) return element;
    }
    return document.scrollingElement;
  }

  schedule() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.update(); });
  }

  maximum(target) {
    const end = target.scrollHeight - target.clientHeight;
    // The footer alone should not create arrows on an otherwise short page.
    return target === document.scrollingElement
      ? Math.max(0,Math.min(end,this.main.getBoundingClientRect().bottom + target.scrollTop - target.clientHeight))
      : end;
  }

  update() {
    if (!this.controls) return;
    const target = this.target();
    const maximum = target ? this.maximum(target) : 0;
    this.controls.hidden = maximum <= 2;
    this.top.hidden = !target || target.scrollTop <= 2;
    this.bottom.hidden = !target || target.scrollTop >= maximum - 2;
  }

  go(end) {
    const target = this.target();
    if (!target) return;
    target.scrollTo({
      top:end === 'top' ? 0 : this.maximum(target),
      behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
}

const mainScrollNavigation = new MainScrollNavigation();
