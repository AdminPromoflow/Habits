'use strict';

// The camera is view state only. Diagram coordinates and saved layouts stay intact.
class DiagramViewport {
  constructor({ canInteract = () => true, onInteractionStart = () => {} } = {}) {
    this.canInteract = canInteract;
    this.onInteractionStart = onInteractionStart;
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.persistenceKey = null;
    this.lastSavedView = null;
    this.stage = null;
    this.content = null;
    this.bounds = [];
    this.anchorX = 0;
    this.anchorY = 0;
    this.pan = null;
    this.gesture = null;
    this.lastPoint = null;
    this.suppressClickUntil = 0;
    this.nativeGestureUntil = 0;
    this.handlers = {
      pointerdown: (event) => this.pointerDown(event),
      pointermove: (event) => this.pointerMove(event),
      pointerup: (event) => this.pointerFinish(event),
      pointercancel: (event) => this.pointerFinish(event),
      lostpointercapture: (event) => this.pointerFinish(event),
      wheel: (event) => this.wheel(event),
      gesturestart: (event) => this.gestureStart(event),
      gesturechange: (event) => this.gestureChange(event),
      gestureend: (event) => this.gestureEnd(event),
      click: (event) => this.suppressClick(event),
    };
    this.onBlur = () => this.cancelInteraction();
  }

  mount(stage, content, { anchorX = 0, anchorY = 0, bounds = [] } = {}) {
    if (stage !== this.stage) {
      this.detach();
      this.stage = stage || null;
      if (this.stage) {
        for (const [type, handler] of Object.entries(this.handlers)) {
          this.stage.addEventListener(type, handler, this.listenerOptions(type));
        }
        window.addEventListener('blur', this.onBlur);
      }
    }
    this.content = content || null;
    this.anchorX = Number.isFinite(anchorX) ? anchorX : 0;
    this.anchorY = Number.isFinite(anchorY) ? anchorY : 0;
    this.bounds = bounds.filter(box => [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
      box.width > 0 && box.height > 0);
    this.render();
  }

  listenerOptions(type) {
    return type === 'click' ? { capture: true }
      : ['wheel', 'gesturestart', 'gesturechange', 'gestureend'].includes(type)
        ? { passive: false } : false;
  }

  detach() {
    this.cancelInteraction();
    if (this.stage) {
      for (const [type, handler] of Object.entries(this.handlers)) {
        this.stage.removeEventListener(type, handler, this.listenerOptions(type));
      }
      window.removeEventListener('blur', this.onBlur);
    }
    this.stage = null;
    this.content = null;
    this.bounds = [];
    this.lastPoint = null;
  }

  reset() {
    const content = this.content;
    this.detach();
    if (content) content.style.transform = '';
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    // Forget the active binding without erasing the previous diagram's view.
    this.persistenceKey = null;
    this.lastSavedView = null;
    this.anchorX = 0;
    this.anchorY = 0;
    this.suppressClickUntil = 0;
    this.nativeGestureUntil = 0;
  }

  isInteracting() {
    return !!(this.pan || this.gesture);
  }

  setPersistenceKey(key, { keepView = false } = {}) {
    if (key === this.persistenceKey) return;
    if (!keepView) this.cancelInteraction();
    this.persistenceKey = key;
    this.lastSavedView = null;
    if (!keepView) {
      // The next mount supplies this diagram's geometry, which may differ from the old one.
      this.bounds = [];
      this.x = 0;
      this.y = 0;
      this.scale = 1;
      try {
        const view = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
        if (view && Number.isFinite(view.x) && Number.isFinite(view.y) &&
            Number.isFinite(view.scale) && view.scale >= (view.overview === true ? 0.000001 : 0.2) && view.scale <= 3) {
          this.x = view.x;
          this.y = view.y;
          this.scale = view.scale;
        }
      } catch { /* Unavailable storage or invalid saved data uses the default view. */ }
    }
    this.render();
  }

  saveView() {
    if (!this.persistenceKey) return;
    const serialized = JSON.stringify({ x: this.x, y: this.y, scale: this.scale,
      ...(this.scale < 0.2 ? { overview: true } : {}) });
    if (serialized === this.lastSavedView) return;
    try {
      // Save each changed view immediately: even a reload during a gesture is safe.
      localStorage.setItem(this.persistenceKey, serialized);
      this.lastSavedView = serialized;
    } catch { /* Storage restrictions must not interrupt navigation or gestures. */ }
  }

  render() {
    if (!this.stage || !this.content) return;
    this.keepDiagramVisible();
    const left = this.stage.clientWidth / 2 + this.x - this.scale * this.anchorX;
    const top = this.stage.clientHeight / 2 + this.y - this.scale * this.anchorY;
    this.content.style.transformOrigin = '0 0';
    this.content.style.transform = `translate(${left}px, ${top}px) scale(${this.scale})`;
    // Hidden overflow is still scrollable by focus; camera state owns this viewport.
    this.stage.scrollLeft = 0;
    this.stage.scrollTop = 0;
    this.saveView();
  }

  keepDiagramVisible() {
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    if (!width || !height || !this.bounds.length) return;
    const marginX = Math.min(24, width / 8), marginY = Math.min(24, height / 8);
    let nearest = null;
    for (const box of this.bounds) {
      const left = width / 2 + (box.x - this.anchorX) * this.scale;
      const top = height / 2 + (box.y - this.anchorY) * this.scale;
      const boxWidth = box.width * this.scale, boxHeight = box.height * this.scale;
      const visibleWidth = Math.min(64, boxWidth, width - 2 * marginX);
      const visibleHeight = Math.min(32, boxHeight, height - 2 * marginY);
      const x = Math.max(marginX + visibleWidth - left - boxWidth,
        Math.min(width - marginX - visibleWidth - left, this.x));
      const y = Math.max(marginY + visibleHeight - top - boxHeight,
        Math.min(height - marginY - visibleHeight - top, this.y));
      const distance = (x - this.x) ** 2 + (y - this.y) ** 2;
      if (!distance) return;
      if (!nearest || distance < nearest.distance) nearest = { x, y, distance };
    }
    // Use an actual node: the overall bounding box can contain large empty gaps.
    this.x = nearest.x;
    this.y = nearest.y;
  }

  ignoredTarget(target) {
    return !!target.closest?.('.diagram-title, .diagram-menu, .diagram-controls, .diagram-connection-tools, textarea:not([readonly]), button, input, select, a, [data-action], [contenteditable="true"]');
  }

  allowed(event) {
    return !!this.stage && !!this.content && this.canInteract() && !this.ignoredTarget(event.target);
  }

  point(event, fallback = null) {
    const box = this.stage.getBoundingClientRect();
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        x: event.clientX - box.left - (this.stage.clientLeft || 0),
        y: event.clientY - box.top - (this.stage.clientTop || 0),
      };
    }
    return fallback || this.lastPoint || {
      x: this.stage.clientWidth / 2,
      y: this.stage.clientHeight / 2,
    };
  }

  gesturePoint(event, fallback = null) {
    // Some Safari trackpads report a synthetic (0, 0) instead of a centroid.
    // Keep the last point on this canvas when that origin is outside it.
    const box = this.stage.getBoundingClientRect();
    if (event.clientX === 0 && event.clientY === 0 && (box.left > 0 || box.top > 0)) {
      return this.point({}, fallback);
    }
    return this.point(event, fallback);
  }

  pointerDown(event) {
    // A fresh press must never be swallowed by an earlier drag's click guard.
    this.suppressClickUntil = 0;
    this.lastPoint = this.point(event);
    if (event.button !== 0 || this.pan || this.gesture || !this.allowed(event) ||
        event.target.closest?.('.diagram-root') || event.target.closest?.('.diagram-connection')) return;
    event.preventDefault();
    this.pan = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: this.x,
      y: this.y,
      moving: false,
    };
    this.stage.setPointerCapture?.(event.pointerId);
  }

  pointerMove(event) {
    this.lastPoint = this.point(event);
    const pan = this.pan;
    if (!pan || event.pointerId !== pan.id) return;
    if (!this.canInteract()) {
      this.cancelInteraction();
      return;
    }
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.moving && Math.hypot(dx, dy) < 4) return;
    event.preventDefault();
    if (!pan.moving) {
      pan.moving = true;
      this.onInteractionStart();
      if (!this.stage || this.pan !== pan) return;
      this.stage.classList.add('is-panning');
    }
    this.x = pan.x + dx;
    this.y = pan.y + dy;
    this.render();
    // Consume overshoot so reversing direction at the edge moves immediately.
    pan.x = this.x;
    pan.y = this.y;
    pan.startX = event.clientX;
    pan.startY = event.clientY;
  }

  pointerFinish(event) {
    if (!this.pan || event.pointerId !== this.pan.id) return;
    this.finishPan();
  }

  finishPan() {
    const pan = this.pan;
    this.pan = null;
    this.stage?.classList.remove('is-panning');
    if (!pan) return;
    if (pan.moving) this.suppressClickUntil = Date.now() + 300;
    if (this.stage?.hasPointerCapture?.(pan.id)) this.stage.releasePointerCapture(pan.id);
  }

  suppressClick(event) {
    if (event.detail === 0 || Date.now() > this.suppressClickUntil) return;
    this.suppressClickUntil = 0;
    event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    else event.stopPropagation();
  }

  wheel(event) {
    if (!this.allowed(event) || event.metaKey) return;
    if (this.gesture || this.pan || (event.ctrlKey && Date.now() < this.nativeGestureUntil)) {
      event.preventDefault();
      return;
    }
    const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.stage.clientWidth : 1;
    const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.stage.clientHeight : 1;
    let dx = Number(event.deltaX || 0) * unitX;
    let dy = Number(event.deltaY || 0) * unitY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
    event.preventDefault();
    const point = this.point(event);
    this.lastPoint = point;
    this.onInteractionStart();
    if (!this.stage || !this.content) return;
    if (event.ctrlKey) {
      this.zoomAt(this.scale * Math.exp(-dy * 0.008), point);
    } else {
      if (event.shiftKey && !dx) { dx = dy; dy = 0; }
      this.x -= dx;
      this.y -= dy;
      this.render();
    }
  }

  zoomAt(scale, point) {
    const next = Math.max(Math.min(0.2, this.scale), Math.min(3, scale));
    if (!Number.isFinite(next)) return;
    const ratio = next / this.scale;
    const cx = point.x - this.stage.clientWidth / 2;
    const cy = point.y - this.stage.clientHeight / 2;
    this.x = cx - (cx - this.x) * ratio;
    this.y = cy - (cy - this.y) * ratio;
    this.scale = next;
    this.render();
  }

  gestureStart(event) {
    if (!this.allowed(event)) return;
    event.preventDefault();
    this.finishPan();
    const point = this.gesturePoint(event);
    this.gesture = {
      scale: this.scale,
      point,
      worldX: (point.x - this.stage.clientWidth / 2 - this.x) / this.scale,
      worldY: (point.y - this.stage.clientHeight / 2 - this.y) / this.scale,
    };
    this.onInteractionStart();
  }

  gestureChange(event) {
    const gesture = this.gesture;
    if (!gesture) return;
    event.preventDefault();
    if (!this.canInteract()) {
      this.cancelInteraction();
      return;
    }
    if (!Number.isFinite(event.scale) || event.scale <= 0) return;
    const point = this.gesturePoint(event, gesture.point);
    const scale = Math.max(Math.min(0.2, gesture.scale), Math.min(3, gesture.scale * event.scale));
    this.x = point.x - this.stage.clientWidth / 2 - gesture.worldX * scale;
    this.y = point.y - this.stage.clientHeight / 2 - gesture.worldY * scale;
    this.scale = scale;
    this.render();
    gesture.worldX = (point.x - this.stage.clientWidth / 2 - this.x) / scale;
    gesture.worldY = (point.y - this.stage.clientHeight / 2 - this.y) / scale;
  }

  gestureEnd(event) {
    if (!this.gesture) return;
    event.preventDefault();
    this.gestureChange(event);
    this.gesture = null;
    this.nativeGestureUntil = Date.now() + 150;
  }

  cancelInteraction() {
    this.finishPan();
    this.gesture = null;
    this.nativeGestureUntil = 0;
  }

  reveal(element) {
    if (!element || !this.stage || !this.content || this.isInteracting()) return;
    const frame = this.stage.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const left = frame.left + (this.stage.clientLeft || 0);
    const top = frame.top + (this.stage.clientTop || 0);
    const marginX = Math.min(48, this.stage.clientWidth / 4);
    const marginY = Math.min(48, this.stage.clientHeight / 4);
    const shift = (start, size, viewStart, viewSize, margin) => {
      if (size > viewSize - 2 * margin) return viewStart + (viewSize - size) / 2 - start;
      if (start < viewStart + margin) return viewStart + margin - start;
      if (start + size > viewStart + viewSize - margin) return viewStart + viewSize - margin - start - size;
      return 0;
    };
    this.x += shift(box.left, box.width, left, this.stage.clientWidth, marginX);
    this.y += shift(box.top, box.height, top, this.stage.clientHeight, marginY);
    this.render();
  }

  focusElement(element, { overview = false } = {}) {
    if (!element || !this.stage || !this.content) return false;
    this.cancelInteraction();
    const frame = this.stage.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    const centerX = frame.left + (this.stage.clientLeft || 0) + this.stage.clientWidth / 2;
    const centerY = frame.top + (this.stage.clientTop || 0) + this.stage.clientHeight / 2;
    const worldX = (box.left + box.width / 2 - centerX - this.x) / this.scale;
    const worldY = (box.top + box.height / 2 - centerY - this.y) / this.scale;
    const room = overview ? 0.86 : 0.65;
    const fit = Math.min(this.stage.clientWidth * room / (box.width / this.scale),
      this.stage.clientHeight * room / (box.height / this.scale));
    this.scale = Math.max(overview ? 0.000001 : 0.2, Math.min(overview ? 1 : 1.6, fit));
    this.x = -worldX * this.scale;
    this.y = -worldY * this.scale;
    this.render();
    return true;
  }
}
