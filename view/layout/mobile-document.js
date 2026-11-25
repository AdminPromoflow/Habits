'use strict';

// Expand the existing editor in place, preserving its draft, selection and camera.
class MobileDocumentView {
  constructor() {
    this.media = window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
    this.ancestors = [];
    this.dismissedKey = null;
    window.addEventListener('resize', () => this.sync());
    window.visualViewport?.addEventListener('resize', () => this.size());
    window.visualViewport?.addEventListener('scroll', () => this.size());
  }

  sync() {
    const surface = document.querySelector('[data-mobile-document]:not([data-mobile-document=""])');
    const key = surface?.dataset.mobileDocument || null;
    if (key !== this.key) this.dismissedKey = null;
    this.key = key;
    const active = !!surface && this.media.matches && this.dismissedKey !== key;
    const wasActive = this.active;
    this.surface?.classList.remove('mobile-document-surface');
    this.ancestors.forEach(element => element.classList.remove('mobile-document-ancestor'));
    this.ancestors = [];
    this.surface = surface;
    this.active = active;
    document.body.classList.toggle('mobile-document-fullscreen', active);
    if (active) {
      if (!wasActive) this.scrollY = window.scrollY;
      document.body.classList.remove('menu-open');
      surface.classList.add('mobile-document-surface');
      for (let parent = surface.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        parent.classList.add('mobile-document-ancestor');
        this.ancestors.push(parent);
      }
    }
    if (!this.button && surface) {
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.className = 'mobile-document-toggle';
      this.button.addEventListener('click', () => this.toggle());
      document.body.append(this.button);
    }
    if (this.button) {
      this.button.hidden = !surface || !this.media.matches;
      const label = t(active ? 'ms_exit_fullscreen' : 'ms_enter_fullscreen');
      this.button.setAttribute('aria-label', label);
      this.button.title = label;
      this.button.setAttribute('aria-pressed', String(active));
      this.button.innerHTML = active ? icon('close') : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
    }
    this.size();
    if (wasActive && !active) window.scrollTo({top: this.scrollY || 0, behavior: 'instant'});
  }

  size() {
    const viewport = window.visualViewport;
    const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
    const top = viewport && viewport.scale === 1 ? viewport.offsetTop : 0;
    document.body.style.setProperty('--mobile-document-height', `${height}px`);
    document.body.style.setProperty('--mobile-document-top', `${top}px`);
  }

  toggle() {
    this.dismissedKey = this.active ? this.key : null;
    this.sync();
    // Re-measure diagram bounds after expanding or restoring the same DOM.
    window.dispatchEvent(new Event('resize'));
  }
}

const mobileDocumentView = new MobileDocumentView();
