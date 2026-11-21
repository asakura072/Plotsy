/*
 * Plotsy · Canvas 绘图引擎
 * 自适应网格、隐函数轮廓、参数/极坐标曲线，以及完整的平移缩放交互。
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const geometry = Plotsy.geometry;

  const PALETTE = [
    { name: '海蓝', value: '#2563eb' },
    { name: '朱红', value: '#e11d48' },
    { name: '松绿', value: '#059669' },
    { name: '鸢尾', value: '#7c3aed' },
    { name: '琥珀', value: '#ea580c' },
    { name: '湖水', value: '#0891b2' },
    { name: '山茶', value: '#db2777' },
    { name: '墨灰', value: '#475569' }
  ];

  const THEME = {
    background: '#fdfcf8',
    backgroundEdge: '#faf7ef',
    gridMinor: 'rgba(36, 35, 31, 0.045)',
    gridMajor: 'rgba(36, 35, 31, 0.10)',
    axis: 'rgba(36, 35, 31, 0.56)',
    tick: 'rgba(36, 35, 31, 0.28)',
    label: 'rgba(36, 35, 31, 0.62)',
    labelHalo: 'rgba(253, 252, 248, 0.92)',
    crosshair: 'rgba(36, 35, 31, 0.22)',
    crosshairDot: '#1f1e1a'
  };

  const SCALE_MIN = 4;
  const SCALE_MAX = 5000;
  const DEFAULT_SCALE = 64;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hexToRgb(hex) {
    let value = String(hex || '').replace('#', '').trim();
    if (value.length === 3) value = value.split('').map((ch) => ch + ch).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) value = '2563eb';
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
  }

  function useMinus(text) {
    return String(text).replace(/-/g, '−');
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    if (absolute !== 0 && (absolute >= 1e6 || absolute < 1e-5)) {
      return useMinus(value.toExponential(2).replace('e+', 'e'));
    }
    const precision = digits === undefined ? 2 : digits;
    const rounded = Number(value.toFixed(precision));
    return useMinus(String(rounded));
  }

  function formatCoordinate(value, scale) {
    if (!Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    if (absolute !== 0 && (absolute >= 1e7 || absolute < 1e-4)) {
      return useMinus(value.toExponential(2).replace('e+', 'e'));
    }
    let digits = 2;
    if (scale >= 120) digits = 3;
    if (scale >= 800) digits = 4;
    if (scale >= 3500) digits = 5;
    return useMinus(Number(value.toFixed(digits)).toString());
  }

  function niceStep(raw) {
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / power;
    let factor;
    if (normalized < 1.5) factor = 1;
    else if (normalized < 3.5) factor = 2;
    else if (normalized < 7.5) factor = 5;
    else factor = 10;
    return factor * power;
  }

  function decimalsForStep(step) {
    const exponent = Math.floor(Math.log10(step));
    let digits = Math.max(0, -exponent);
    const scaled = step / Math.pow(10, -digits);
    if (Math.abs(scaled - Math.round(scaled)) > 1e-8) digits += 1;
    return Math.min(digits, 8);
  }

  function formatTick(value, step) {
    if (Math.abs(value) < step * 1e-8) return '0';
    const absolute = Math.abs(value);
    if (absolute >= 1e6 || absolute < 1e-5) {
      return useMinus(value.toExponential(1).replace('e+', 'e'));
    }
    const digits = decimalsForStep(step);
    return useMinus(value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  class Graph {
    constructor(options) {
      const opts = options || {};
      this.canvas = opts.canvas;
      this.overlay = opts.overlay;
      if (!this.canvas || !this.overlay) throw new Error('Graph 需要两个 canvas');
      this.ctx = this.canvas.getContext('2d');
      this.octx = this.overlay.getContext('2d');
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.drawables = [];
      this.settings = {
        grid: true,
        minorGrid: true,
        axes: true,
        labels: true,
        angleMode: 'rad',
        ...(opts.settings || {})
      };
      this.view = { x: 0, y: 0, scale: DEFAULT_SCALE };
      this.onViewChange = typeof opts.onViewChange === 'function' ? opts.onViewChange : null;
      this.onCursor = typeof opts.onCursor === 'function' ? opts.onCursor : null;
      this.onSelection = opts.onSelection;
      this.onInteract = typeof opts.onInteract === 'function' ? opts.onInteract : null;
      this.pointers = new Map();
      this.pinch = null;
      this.hover = null;
      this.hoverPosition = null;
      this.traceEntries = [];
      this.selectedId = null;
      this.interests = [];
      this.pinnedPoint = null;
      this.raf = 0;
      this.overlayRaf = 0;
      this.hasInteracted = false;
      this.regionCanvas = document.createElement('canvas');

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
      this.onWasmReady = () => this.requestDraw();
      global.addEventListener('plotsy-wasm-ready', this.onWasmReady);

      this.bindEvents();
      this.resize();
    }

    destroy() {
      this.resizeObserver.disconnect();
      global.removeEventListener('plotsy-wasm-ready', this.onWasmReady);
      cancelAnimationFrame(this.raf);
      cancelAnimationFrame(this.overlayRaf);
    }

    bindEvents() {
      this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
      this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
      this.canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
      this.canvas.addEventListener('pointerleave', (event) => this.onPointerLeave(event));
      this.canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
      this.canvas.addEventListener('keydown', (event) => this.onKeyDown(event));
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = clamp(global.devicePixelRatio || 1, 1, 2);
      if (width === this.w && height === this.h && dpr === this.dpr) return;

      this.w = width;
      this.h = height;
      this.dpr = dpr;

      for (const canvas of [this.canvas, this.overlay]) {
        const pixelWidth = Math.max(1, Math.round(width * dpr));
        const pixelHeight = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      }

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.requestDraw();
      this.requestOverlay();
    }

    setDrawables(drawables) {
      this.drawables = Array.isArray(drawables) ? drawables : [];
      if (!this.drawables.some((drawable) => drawable.id === this.selectedId && !drawable.hidden)) {
        this.setSelection(null);
      }
      this.requestDraw();
    }

    setSelection(id) {
      if (id === this.selectedId) return;
      this.selectedId = id;
      this.interests = [];
      this.pinnedPoint = null;
      if (this.onSelection) this.onSelection(id);
      this.requestDraw();
      this.requestOverlay();
    }

    setSettings(settings) {
      this.settings = { ...this.settings, ...(settings || {}) };
      this.requestDraw();
    }

    setView(view, notify) {
      if (!view) return;
      const scale = Number(view.scale);
      const x = Number(view.x);
      const y = Number(view.y);
      let changed = false;

      if (Number.isFinite(x) && x !== this.view.x) {
        this.view.x = x;
        changed = true;
      }
      if (Number.isFinite(y) && y !== this.view.y) {
        this.view.y = y;
        changed = true;
      }
      if (Number.isFinite(scale)) {
        const nextScale = clamp(scale, SCALE_MIN, SCALE_MAX);
        if (nextScale !== this.view.scale) {
          this.view.scale = nextScale;
          changed = true;
        }
      }

      if (changed) {
        this.requestDraw();
        if (notify) this.emitViewChange();
      }
    }

    getView() {
      return { x: this.view.x, y: this.view.y, scale: this.view.scale };
    }

    defaultScale() {
      return clamp(Math.min(DEFAULT_SCALE, Math.max(36, this.h / 11)), 32, DEFAULT_SCALE);
    }

    resetView() {
      this.view.x = 0;
      this.view.y = 0;
      this.view.scale = this.defaultScale();
      this.hover = null;
      this.hoverPosition = null;
      this.requestDraw();
      this.requestOverlay();
      this.markInteracted();
      this.emitViewChange();
      if (this.onCursor) this.onCursor(null);
    }

    zoomBy(factor, anchor) {
      const point = anchor || { x: this.w / 2, y: this.h / 2 };
      this.zoomAt(point.x, point.y, factor);
      this.markInteracted();
      this.emitViewChange();
    }

    zoomAt(px, py, factor) {
      const before = this.screenToWorld(px, py);
      const nextScale = clamp(this.view.scale * factor, SCALE_MIN, SCALE_MAX);
      if (nextScale === this.view.scale) return;
      this.view.scale = nextScale;
      this.view.x = before.x - (px - this.w / 2) / nextScale;
      this.view.y = before.y + (py - this.h / 2) / nextScale;
      this.requestDraw();
    }

    markInteracted() {
      if (this.hasInteracted) return;
      this.hasInteracted = true;
      if (this.onInteract) this.onInteract();
    }

    emitViewChange() {
      if (this.onViewChange) this.onViewChange(this.getView());
    }

    screenToWorld(px, py) {
      return {
        x: this.view.x + (px - this.w / 2) / this.view.scale,
        y: this.view.y - (py - this.h / 2) / this.view.scale
      };
    }

    worldToScreen(x, y) {
      return {
        x: (x - this.view.x) * this.view.scale + this.w / 2,
        y: (this.view.y - y) * this.view.scale + this.h / 2
      };
    }

    eventPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const point = this.eventPoint(event);
      this.canvas.focus({ preventScroll: true });
      try { this.canvas.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ }

      const marker = this.interestAt(point);
      const hit = marker ? this.selectedId : this.hitTest(point, event.pointerType === 'touch' ? 20 : 11);
      this.pointers.set(event.pointerId, {
        ...point, moved: this.pointers.size > 0, hit, marker,
        tracing: hit !== null || (event.pointerType === 'touch' && this.selectedId !== null)
      });
      this.pinch = null;
      this.hover = null;
      this.hoverPosition = null;
      this.requestOverlay();
      if (this.onCursor) this.onCursor(null);
      this.canvas.classList.add('is-grabbing');
      this.markInteracted();

      if (this.pointers.size === 2) this.beginPinch();
      event.preventDefault();
    }

    onPointerMove(event) {
      const point = this.eventPoint(event);

      if (this.pointers.has(event.pointerId)) {
        const previous = this.pointers.get(event.pointerId);
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        if (this.pointers.size === 1 && !previous.moved && Math.hypot(dx, dy) < 4) return;
        this.pointers.set(event.pointerId, { ...previous, ...point, moved: true });

        if (this.pointers.size === 1) {
          if (previous.tracing) {
            if (this.selectedId === null && previous.hit !== null) this.setSelection(previous.hit);
            this.updateHoverAt(point.x, point.y);
          } else {
            this.view.x -= dx / this.view.scale;
            this.view.y += dy / this.view.scale;
            this.requestDraw();
            this.emitViewChange();
            this.markInteracted();
          }
        } else if (this.pointers.size >= 2) {
          this.hover = this.hoverPosition = null;
          if (this.onCursor) this.onCursor(null);
          this.requestOverlay();
          this.updatePinch();
          this.emitViewChange();
          this.markInteracted();
        }
        event.preventDefault();
        return;
      }

      if (event.pointerType === 'mouse') this.updateHoverAt(point.x, point.y);
    }

    onPointerUp(event) {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      this.pointers.delete(event.pointerId);
      try { this.canvas.releasePointerCapture(event.pointerId); } catch (error) { /* 忽略 */ }

      if (this.pointers.size === 0) {
        this.canvas.classList.remove('is-grabbing');
        this.pinch = null;
        if (event.type === 'pointerup' && (!pointer.moved || pointer.tracing || event.pointerType === 'mouse')) {
          const point = this.eventPoint(event);
          if (!pointer.moved) {
            const marker = pointer.marker;
            if (marker) {
              const pinned = this.pinnedPoint;
              const position = pinned && this.worldToScreen(pinned.x, pinned.y);
              this.pinnedPoint = position && Math.hypot(marker.x - position.x, marker.y - position.y) < 3
                ? null : this.screenToWorld(marker.x, marker.y);
            } else {
              this.setSelection(pointer.hit === this.selectedId ? null : pointer.hit);
              this.pinnedPoint = null;
            }
          }
          if (pointer.moved || this.selectedId !== null) this.updateHoverAt(point.x, point.y);
        }
      } else if (this.pointers.size === 1) {
        this.pinch = null;
        for (const remaining of this.pointers.values()) {
          remaining.moved = true;
          remaining.tracing = false;
        }
        this.canvas.classList.remove('is-grabbing');
      } else {
        this.pinch = null;
        this.beginPinch();
      }
      this.emitViewChange();
    }

    onPointerLeave(event) {
      if (event.pointerType !== 'mouse' || this.pointers.size > 0) return;
      this.hover = null;
      this.hoverPosition = null;
      this.requestOverlay();
      if (this.onCursor) this.onCursor(null);
    }

    onWheel(event) {
      event.preventDefault();
      const point = this.eventPoint(event);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      this.zoomAt(point.x, point.y, factor);
      this.markInteracted();
      this.emitViewChange();
    }

    onKeyDown(event) {
      const step = event.shiftKey ? 120 : 40;
      let handled = true;
      switch (event.key) {
        case 'ArrowLeft':
          this.view.x -= step / this.view.scale;
          break;
        case 'ArrowRight':
          this.view.x += step / this.view.scale;
          break;
        case 'ArrowUp':
          this.view.y += step / this.view.scale;
          break;
        case 'ArrowDown':
          this.view.y -= step / this.view.scale;
          break;
        case '+':
        case '=':
          this.zoomAt(this.w / 2, this.h / 2, 1.25);
          break;
        case '-':
        case '_':
          this.zoomAt(this.w / 2, this.h / 2, 0.8);
          break;
        case '0':
          this.resetView();
          return;
        case 'Escape':
          this.setSelection(null);
          event.preventDefault();
          return;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        this.requestDraw();
        this.markInteracted();
        this.emitViewChange();
      }
    }

    beginPinch() {
      const points = Array.from(this.pointers.values());
      if (points.length < 2) return;
      const first = points[0];
      const second = points[1];
      const midX = (first.x + second.x) / 2;
      const midY = (first.y + second.y) / 2;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const world = this.screenToWorld(midX, midY);
      this.pinch = {
        distance: Math.max(distance, 1),
        scale: this.view.scale,
        midX,
        midY,
        worldX: world.x,
        worldY: world.y
      };
    }

    updatePinch() {
      const points = Array.from(this.pointers.values());
      if (points.length < 2) return;
      if (!this.pinch) this.beginPinch();
      if (!this.pinch) return;
      const first = points[0];
      const second = points[1];
      const midX = (first.x + second.x) / 2;
      const midY = (first.y + second.y) / 2;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const nextScale = clamp(this.pinch.scale * (distance / this.pinch.distance), SCALE_MIN, SCALE_MAX);
      this.view.scale = nextScale;
      this.view.x = this.pinch.worldX - (midX - this.w / 2) / nextScale;
      this.view.y = this.pinch.worldY + (midY - this.h / 2) / nextScale;
      this.requestDraw();
    }

    updateHoverAt(px, py) {
      this.hoverPosition = { px, py };
      const marker = this.interestAt({ x: px, y: py });
      const trace = marker ? { px: marker.x, py: marker.y, showLabel: true } : this.traceAt(px, py);
      const position = trace || this.hoverPosition;
      this.hover = {
        ...position,
        ...this.screenToWorld(position.px, position.py)
      };
      this.requestOverlay();
      if (this.onCursor) this.onCursor({ ...this.hover });
    }

    traceAt(px, py) {
      const entry = this.traceEntries.find(({ drawable }) => drawable.id === this.selectedId);
      if (!entry) return null;
      const point = geometry.nearest(entry, { x: px, y: py }, Infinity, entry.drawable.type === 'explicit');
      if (!point || !this.inside(point)) return null;
      return { px: point.x, py: point.y, color: entry.color, showLabel: entry.drawable.type !== 'point' };
    }

    inside(point) {
      return point.x >= 0 && point.x <= this.w && point.y >= 0 && point.y <= this.h;
    }

    hitTest(point, radius) {
      let id = null;
      let distance = radius;
      for (const entry of this.traceEntries) {
        const nearest = geometry.nearest(entry, point, distance);
        if (!nearest) continue;
        const gap = Math.hypot(nearest.x - point.x, nearest.y - point.y);
        if (gap <= distance) {
          id = entry.drawable.id;
          distance = gap;
        }
      }
      return id;
    }

    interestAt(point) {
      let closest = null;
      let distance = 8;
      for (const marker of this.interests) {
        const gap = Math.hypot(marker.x - point.x, marker.y - point.y);
        if (gap <= distance) {
          distance = gap;
          closest = marker;
        }
      }
      return closest;
    }

    requestDraw() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.render();
      });
    }

    requestOverlay() {
      if (this.overlayRaf) return;
      this.overlayRaf = requestAnimationFrame(() => {
        this.overlayRaf = 0;
        this.drawOverlay();
      });
    }

    render() {
      if (!this.w || !this.h) return;
      this.traceEntries = this.paint(this.ctx, this.w, this.h, { exporting: false }).map((entry) => this.interactiveEntry(entry));
      const selected = this.traceEntries.find(({ drawable }) => drawable.id === this.selectedId);
      this.interests = geometry.interests(selected, this.traceEntries, this.worldToScreen(0, 0), this.w, this.h);
      if (this.hoverPosition) this.updateHoverAt(this.hoverPosition.px, this.hoverPosition.py);
      else this.requestOverlay();
    }

    paint(ctx, width, height, options) {
      const opts = options || {};
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = THEME.background;
      ctx.fillRect(0, 0, width, height);

      this.paintGrid(ctx, width, height);

      const entries = this.drawables.filter((drawable) => drawable && !drawable.hidden)
        .map((drawable) => this.sampleEntry(drawable, width, height, opts));

      for (const entry of entries) this.paintFill(ctx, entry, width, height, opts);
      for (const entry of entries) {
        if (entry.drawable.type === 'point') continue;
        this.paintStroke(ctx, entry, !opts.exporting && entry.drawable.id === this.selectedId);
      }
      for (const entry of entries) {
        if (entry.drawable.type === 'point') this.paintPoint(ctx, entry, width, height, opts);
      }

      if (opts.watermark) this.paintWatermark(ctx, width, height);
      ctx.restore();
      return entries;
    }

    sampleEntry(drawable, width, height, options) {
      const entry = { drawable, color: drawable.color || PALETTE[0].value };
      if (drawable.type === 'explicit') {
        entry.segments = this.sampleExplicit(drawable, width, height);
      } else if (drawable.type === 'parametric') {
        entry.segments = this.sampleParametric(drawable, width, height);
      } else if (drawable.type === 'polar') {
        entry.segments = this.samplePolar(drawable, width, height);
      } else if (drawable.type === 'implicit') {
        entry.segments = this.implicitSegments(this.getImplicitField(entry, width, height, options));
      } else if (drawable.type === 'vertical') {
        const x = this.worldToScreenFor(drawable.x, 0, width, height).x;
        entry.segments = [[{ x, y: 0 }, { x, y: height }]];
      } else if (drawable.type === 'point') {
        entry.position = this.worldToScreenFor(drawable.x, drawable.y, width, height);
      }
      return entry;
    }

    interactiveEntry(entry) {
      const { drawable, position } = entry;
      const { w: width, h: height } = this;
      if (position && !this.inside(position)) entry.position = null;
      let edges;
      Object.defineProperty(entry, 'edges', {
        get: () => (edges ||= geometry.edgesFor(entry.segments || [], width, height))
      });
      entry.at = (edge, t) => this.pointOnCurve(drawable, edge, t);
      if (drawable.type === 'explicit') {
        entry.residual = (point) => {
          const x = this.screenToWorld(point.x, point.y).x;
          return point.y - this.worldToScreen(x, drawable.fn(x)).y;
        };
      } else if (drawable.type === 'implicit') {
        entry.residual = (point) => {
          const { value, dx, dy } = this.implicitGradient(drawable, point);
          if (value === 0) return 0;
          return value / Math.hypot(dx, dy);
        };
      } else if (drawable.type === 'vertical') {
        const x = this.worldToScreen(drawable.x, 0).x;
        entry.residual = (point) => point.x - x;
      }
      return entry;
    }

    implicitGradient(drawable, point) {
      const { x, y } = this.screenToWorld(point.x, point.y);
      const step = 0.2 / this.view.scale;
      return {
        value: drawable.fn(x, y),
        dx: (drawable.fn(x + step, y) - drawable.fn(x - step, y)) / 0.4,
        dy: (drawable.fn(x, y - step) - drawable.fn(x, y + step)) / 0.4
      };
    }

    pointOnCurve(drawable, edge, t) {
      const { a, b } = edge;
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (drawable.type === 'implicit') {
        for (let i = 0; i < 3; i += 1) {
          const { value, dx, dy } = this.implicitGradient(drawable, point);
          const norm = dx * dx + dy * dy;
          if (!Number.isFinite(value) || !norm) return null;
          const step = value / norm;
          if (Math.abs(value) / Math.sqrt(norm) < 1e-9) break;
          if (Math.abs(value) / Math.sqrt(norm) > 2) return null;
          point.x -= step * dx;
          point.y -= step * dy;
        }
        return point;
      }
      let result = point;
      if (drawable.type === 'explicit') {
        const x = this.screenToWorld(point.x, point.y).x;
        result = this.worldToScreen(x, drawable.fn(x));
      } else if (drawable.type === 'parametric' || drawable.type === 'polar') {
        const u = a.u + (b.u - a.u) * t;
        if (drawable.type === 'parametric') {
          result = this.worldToScreen(drawable.xFn(u), drawable.yFn(u));
        } else {
          const r = drawable.rFn(u);
          result = this.worldToScreen(r * Math.cos(u), r * Math.sin(u));
        }
      }
      return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
    }

    worldToScreenFor(x, y, width, height) {
      return {
        x: (x - this.view.x) * this.view.scale + width / 2,
        y: (this.view.y - y) * this.view.scale + height / 2
      };
    }

    paintGrid(ctx, width, height) {
      const settings = this.settings;
      const scale = this.view.scale;
      const step = niceStep(78 / scale);
      const minor = step / 5;
      const left = this.view.x - width / 2 / scale;
      const right = this.view.x + width / 2 / scale;
      const top = this.view.y + height / 2 / scale;
      const bottom = this.view.y - height / 2 / scale;

      if (settings.grid) {
        if (settings.minorGrid && minor * scale >= 7) {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = THEME.gridMinor;
          const startX = Math.ceil(left / minor) * minor;
          for (let x = startX; x <= right; x += minor) {
            const px = Math.round((x - this.view.x) * scale + width / 2) + 0.5;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, height);
          }
          const startY = Math.ceil(bottom / minor) * minor;
          for (let y = startY; y <= top; y += minor) {
            const py = Math.round((this.view.y - y) * scale + height / 2) + 0.5;
            ctx.moveTo(0, py);
            ctx.lineTo(width, py);
          }
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = THEME.gridMajor;
        const startMajorX = Math.ceil(left / step) * step;
        for (let x = startMajorX; x <= right; x += step) {
          const px = Math.round((x - this.view.x) * scale + width / 2) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
        }
        const startMajorY = Math.ceil(bottom / step) * step;
        for (let y = startMajorY; y <= top; y += step) {
          const py = Math.round((this.view.y - y) * scale + height / 2) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
        }
        ctx.stroke();
      }

      const axisY = (this.view.y - 0) * scale + height / 2;
      const axisX = (0 - this.view.x) * scale + width / 2;
      const xVisible = axisY >= 0 && axisY <= height;
      const yVisible = axisX >= 0 && axisX <= width;

      if (settings.axes) {
        ctx.beginPath();
        ctx.strokeStyle = THEME.axis;
        ctx.lineWidth = 1.25;
        if (xVisible) {
          const py = Math.round(axisY) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
        }
        if (yVisible) {
          const px = Math.round(axisX) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
        }
        ctx.stroke();
      }

      if (settings.axes && settings.labels) {
        this.paintTickLabels(ctx, width, height, step, axisX, axisY, xVisible, yVisible, left, right, top, bottom);
      }

      if (settings.axes && xVisible && yVisible) {
        ctx.fillStyle = THEME.label;
        ctx.font = '500 12px "Iowan Old Style", "Palatino Linotype", Georgia, serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('x', width - 12, axisY - 7);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('y', axisX + 8, 10);
      }
    }

    paintTickLabels(ctx, width, height, step, axisX, axisY, xVisible, yVisible, left, right, top, bottom) {
      ctx.save();
      ctx.font = '11.5px "Segoe UI Variable Text", "Segoe UI", "PingFang SC", sans-serif';
      ctx.fillStyle = THEME.label;
      ctx.lineWidth = 3;
      ctx.strokeStyle = THEME.labelHalo;

      const labelXAbove = axisY > height - 24;
      const xLabelY = labelXAbove ? axisY - 8 : axisY + 8;
      ctx.textAlign = 'center';
      ctx.textBaseline = labelXAbove ? 'bottom' : 'top';

      const startX = Math.ceil(left / step) * step;
      for (let x = startX; x <= right; x += step) {
        if (Math.abs(x) < step * 0.001) continue;
        const px = (x - this.view.x) * this.view.scale + width / 2;
        if (px < 8 || px > width - 8) continue;
        const label = formatTick(x, step);
        ctx.strokeText(label, px, xLabelY);
        ctx.fillText(label, px, xLabelY);
      }

      const labelYRight = axisX < 42;
      const yLabelX = labelYRight ? axisX + 8 : axisX - 8;
      ctx.textAlign = labelYRight ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const startY = Math.ceil(bottom / step) * step;
      for (let y = startY; y <= top; y += step) {
        if (Math.abs(y) < step * 0.001) continue;
        const py = (this.view.y - y) * this.view.scale + height / 2;
        if (py < 10 || py > height - 10) continue;
        const label = formatTick(y, step);
        ctx.strokeText(label, yLabelX, py);
        ctx.fillText(label, yLabelX, py);
      }

      ctx.restore();
    }

    sampleExplicit(drawable, width, height) {
      if (drawable.wasmProgram && Plotsy.wasm && Plotsy.wasm.ready) {
        const accelerated = this.sampleExplicitWasm(drawable, width, height);
        if (accelerated) return accelerated;
      }
      return this.sampleExplicitJS(drawable, width, height);
    }

    sampleExplicitWasm(drawable, width, height) {
      const scale = this.view.scale;
      const subpixel = 0.35;
      const count = Math.ceil((width + 4) / subpixel) + 1;
      if (count <= 2) return null;
      const xs = new Float64Array(count);
      for (let index = 0; index < count; index += 1) {
        const px = -2 + index * subpixel;
        xs[index] = this.view.x + (px - width / 2) / scale;
      }
      const ys = Plotsy.wasm.evalMany(drawable.wasmProgram, xs, null);
      if (!ys) return null;

      const segments = [];
      let current = [];
      let previousY = null;
      const jumpLimit = Math.max(height * 1.6, 900);

      for (let index = 0; index < count; index += 1) {
        const y = ys[index];
        if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
          if (current.length > 1) segments.push(current);
          current = [];
          previousY = null;
          continue;
        }
        const px = -2 + index * subpixel;
        const py = (this.view.y - y) * scale + height / 2;
        if (previousY !== null && Math.abs(py - previousY) > jumpLimit) {
          if (current.length > 1) segments.push(current);
          current = [];
        }
        current.push({ x: px, y: py });
        previousY = py;
      }
      if (current.length > 1) segments.push(current);
      return segments;
    }

    sampleExplicitJS(drawable, width, height) {
      const scale = this.view.scale;
      const segments = [];
      let current = [];
      let previousY = null;
      const jumpLimit = Math.max(height * 1.6, 900);

      for (let px = -2; px <= width + 2; px += 1) {
        const x = this.view.x + (px - width / 2) / scale;
        const y = drawable.fn(x);
        if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
          if (current.length > 1) segments.push(current);
          current = [];
          previousY = null;
          continue;
        }
        const py = (this.view.y - y) * scale + height / 2;
        if (previousY !== null && Math.abs(py - previousY) > jumpLimit) {
          if (current.length > 1) segments.push(current);
          current = [];
        }
        current.push({ x: px, y: py });
        previousY = py;
      }
      if (current.length > 1) segments.push(current);
      return segments;
    }

    sampleParametric(drawable, width, height) {
      if (
        drawable.wasmProgram &&
        drawable.wasmProgramY &&
        Plotsy.wasm &&
        Plotsy.wasm.ready
      ) {
        const accelerated = this.sampleParametricWasm(drawable, width, height);
        if (accelerated) return accelerated;
      }
      const steps = 1800;
      return this.sampleCurve(steps, (index) => {
        const t = drawable.min + (drawable.max - drawable.min) * index / steps;
        return { x: drawable.xFn(t), y: drawable.yFn(t), u: t };
      }, width, height);
    }

    sampleParametricWasm(drawable, width, height) {
      const steps = 3600;
      const ts = new Float64Array(steps + 1);
      for (let index = 0; index <= steps; index += 1) {
        ts[index] = drawable.min + (drawable.max - drawable.min) * index / steps;
      }
      const xs = Plotsy.wasm.evalMany(drawable.wasmProgram, ts, null);
      const ys = Plotsy.wasm.evalMany(drawable.wasmProgramY, ts, null);
      if (!xs || !ys) return null;
      return this.sampleWorldPoints(xs, ys, width, height, drawable.min, drawable.max);
    }

    samplePolar(drawable, width, height) {
      if (drawable.wasmProgram && Plotsy.wasm && Plotsy.wasm.ready) {
        const accelerated = this.samplePolarWasm(drawable, width, height);
        if (accelerated) return accelerated;
      }
      const steps = 2200;
      return this.sampleCurve(steps, (index) => {
        const theta = drawable.min + (drawable.max - drawable.min) * index / steps;
        const r = drawable.rFn(theta);
        return { x: r * Math.cos(theta), y: r * Math.sin(theta), u: theta };
      }, width, height);
    }

    samplePolarWasm(drawable, width, height) {
      const steps = 4400;
      const ts = new Float64Array(steps + 1);
      for (let index = 0; index <= steps; index += 1) {
        ts[index] = drawable.min + (drawable.max - drawable.min) * index / steps;
      }
      const rs = Plotsy.wasm.evalMany(drawable.wasmProgram, ts, null);
      if (!rs) return null;
      const xs = new Float64Array(steps + 1);
      const ys = new Float64Array(steps + 1);
      for (let index = 0; index <= steps; index += 1) {
        const theta = ts[index];
        xs[index] = rs[index] * Math.cos(theta);
        ys[index] = rs[index] * Math.sin(theta);
      }
      return this.sampleWorldPoints(xs, ys, width, height, drawable.min, drawable.max);
    }

    sampleWorldPoints(worldX, worldY, width, height, min, max) {
      const segments = [];
      let current = [];
      let previous = null;
      const scale = this.view.scale;
      const jumpLimit = Math.max(height * 1.8, 1200);
      const count = Math.min(worldX.length, worldY.length);

      for (let index = 0; index < count; index += 1) {
        const x = worldX[index];
        const y = worldY[index];
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e12 || Math.abs(y) > 1e12) {
          if (current.length > 1) segments.push(current);
          current = [];
          previous = null;
          continue;
        }
        const px = (x - this.view.x) * scale + width / 2;
        const py = (this.view.y - y) * scale + height / 2;
        if (previous && Math.abs(px - previous.x) + Math.abs(py - previous.y) > jumpLimit) {
          if (current.length > 1) segments.push(current);
          current = [];
        }
        current.push({ x: px, y: py, u: min + (max - min) * index / (count - 1) });
        previous = { x: px, y: py };
      }
      if (current.length > 1) segments.push(current);
      return segments;
    }

    sampleCurve(steps, valueAt, width, height) {
      const segments = [];
      let current = [];
      let previous = null;
      const scale = this.view.scale;
      const jumpLimit = Math.max(height * 1.8, 1200);

      for (let index = 0; index <= steps; index += 1) {
        const point = valueAt(index);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e12 || Math.abs(point.y) > 1e12) {
          if (current.length > 1) segments.push(current);
          current = [];
          previous = null;
          continue;
        }
        const px = (point.x - this.view.x) * scale + width / 2;
        const py = (this.view.y - point.y) * scale + height / 2;
        if (previous && Math.abs(px - previous.x) + Math.abs(py - previous.y) > jumpLimit) {
          if (current.length > 1) segments.push(current);
          current = [];
        }
        current.push({ x: px, y: py, u: point.u });
        previous = { x: px, y: py };
      }
      if (current.length > 1) segments.push(current);
      return segments;
    }

    implicitCell(options) {
      return options && options.exporting ? 2 : 3;
    }

    getImplicitField(entry, width, height, options) {
      if (entry.field) return entry.field;
      const cell = this.implicitCell(options);
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const count = (cols + 1) * (rows + 1);
      const values = new Float64Array(count);
      const step = this.view.scale * cell;

      if (
        entry.drawable.wasmProgram &&
        Plotsy.wasm &&
        Plotsy.wasm.ready
      ) {
        const xs = new Float64Array(count);
        const ys = new Float64Array(count);
        let index = 0;
        for (let row = 0; row <= rows; row += 1) {
          const y = this.view.y + (height / 2 - row * cell) / this.view.scale;
          for (let col = 0; col <= cols; col += 1) {
            xs[index] = this.view.x + (col * cell - width / 2) / this.view.scale;
            ys[index] = y;
            index += 1;
          }
        }
        const sampled = Plotsy.wasm.evalMany(entry.drawable.wasmProgram, xs, ys);
        if (sampled) {
          for (let i = 0; i < count; i += 1) {
            values[i] = Number.isFinite(sampled[i]) ? sampled[i] : NaN;
          }
          entry.field = { cols, rows, cell, values, step };
          return entry.field;
        }
      }

      for (let row = 0; row <= rows; row += 1) {
        const y = this.view.y + (height / 2 - row * cell) / this.view.scale;
        for (let col = 0; col <= cols; col += 1) {
          const x = this.view.x + (col * cell - width / 2) / this.view.scale;
          let value;
          try {
            value = entry.drawable.fn(x, y);
          } catch (error) {
            value = NaN;
          }
          values[row * (cols + 1) + col] = Number.isFinite(value) ? value : NaN;
        }
      }

      entry.field = { cols, rows, cell, values, step };
      return entry.field;
    }

    paintFill(ctx, entry, width, height, options) {
      const drawable = entry.drawable;
      const relation = drawable.relation;

      if (drawable.type === 'explicit' && relation && relation !== '=') {
        const below = relation === '<' || relation === '<=';
        const edgeY = below ? height : 0;
        ctx.save();
        ctx.fillStyle = rgba(entry.color, 0.11);
        for (const segment of entry.segments) {
          if (segment.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(segment[0].x, segment[0].y);
          for (let i = 1; i < segment.length; i += 1) ctx.lineTo(segment[i].x, segment[i].y);
          ctx.lineTo(segment[segment.length - 1].x, edgeY);
          ctx.lineTo(segment[0].x, edgeY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      if (drawable.type === 'vertical' && relation && relation !== '=') {
        const px = (drawable.x - this.view.x) * this.view.scale + width / 2;
        const toRight = relation === '>' || relation === '>=';
        ctx.save();
        ctx.fillStyle = rgba(entry.color, 0.11);
        if (toRight) ctx.fillRect(px, 0, Math.max(0, width - px), height);
        else ctx.fillRect(0, 0, clamp(px, 0, width), height);
        ctx.restore();
        return;
      }

      if (drawable.type === 'implicit' && relation && relation !== '=') {
        const field = this.getImplicitField(entry, width, height, options);
        this.paintImplicitRegion(ctx, field, entry.color, relation, width, height);
      }
    }

    paintImplicitRegion(ctx, field, color, relation, width, height) {
      const { cols, rows, values } = field;
      if (!cols || !rows) return;
      const rgb = hexToRgb(color);
      const image = ctx.createImageData(cols, rows);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const value = values[row * (cols + 1) + col];
          let inside = false;
          if (Number.isFinite(value)) {
            if (relation === '>' || relation === '>=') inside = value > 0;
            else if (relation === '<' || relation === '<=') inside = value < 0;
          }
          const index = (row * cols + col) * 4;
          image.data[index] = rgb.r;
          image.data[index + 1] = rgb.g;
          image.data[index + 2] = rgb.b;
          image.data[index + 3] = inside ? 34 : 0;
        }
      }

      const offscreen = this.regionCanvas;
      if (offscreen.width !== cols) offscreen.width = cols;
      if (offscreen.height !== rows) offscreen.height = rows;
      const offctx = offscreen.getContext('2d');
      offctx.putImageData(image, 0, 0);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, cols, rows, 0, 0, width, height);
      ctx.restore();
    }

    paintStroke(ctx, entry, selected) {
      const drawable = entry.drawable;
      const relation = drawable.relation;
      const strict = relation === '<' || relation === '>';

      ctx.save();
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = 2.35;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (strict) ctx.setLineDash([7, 5]);

      ctx.beginPath();
      for (const segment of entry.segments) {
        ctx.moveTo(segment[0].x, segment[0].y);
        for (let i = 1; i < segment.length; i += 1) ctx.lineTo(segment[i].x, segment[i].y);
      }
      if (selected) {
        ctx.save();
        ctx.strokeStyle = rgba(entry.color, 0.14);
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.restore();
      }
      ctx.stroke();
      ctx.restore();
    }

    implicitSegments(field) {
      const { cols, rows, values, cell } = field;
      const segments = [];

      const pointOnEdge = (x1, y1, v1, x2, y2, v2) => {
        const denominator = v1 - v2;
        let t = Math.abs(denominator) < 1e-14 ? 0.5 : v1 / denominator;
        t = clamp(t, 0, 1);
        return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
      };

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i00 = row * (cols + 1) + col;
          const i10 = i00 + 1;
          const i01 = (row + 1) * (cols + 1) + col;
          const i11 = i01 + 1;
          const v00 = values[i00];
          const v10 = values[i10];
          const v11 = values[i11];
          const v01 = values[i01];
          if (!Number.isFinite(v00) || !Number.isFinite(v10) || !Number.isFinite(v11) || !Number.isFinite(v01)) {
            continue;
          }

          const s00 = v00 >= 0;
          const s10 = v10 >= 0;
          const s11 = v11 >= 0;
          const s01 = v01 >= 0;
          if (s00 === s10 && s10 === s11 && s11 === s01) continue;

          const x0 = col * cell;
          const x1 = (col + 1) * cell;
          const y0 = row * cell;
          const y1 = (row + 1) * cell;

          const crossings = [];
          if (s00 !== s10) crossings.push(pointOnEdge(x0, y0, v00, x1, y0, v10));
          if (s10 !== s11) crossings.push(pointOnEdge(x1, y0, v10, x1, y1, v11));
          if (s01 !== s11) crossings.push(pointOnEdge(x0, y1, v01, x1, y1, v11));
          if (s00 !== s01) crossings.push(pointOnEdge(x0, y0, v00, x0, y1, v01));

          if (crossings.length === 2) {
            segments.push(crossings);
          } else if (crossings.length === 4) {
            const center = (v00 + v10 + v11 + v01) / 4;
            const adjacent = (center >= 0) === s00;
            const [top, right, bottom, left] = crossings;
            if (adjacent) segments.push([top, right], [bottom, left]);
            else segments.push([top, left], [right, bottom]);
          }
        }
      }

      return segments;
    }

    paintPoint(ctx, entry, width, height, options) {
      const drawable = entry.drawable;
      const position = entry.position;
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
      if (position.x < -40 || position.x > width + 40 || position.y < -40 || position.y > height + 40) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(position.x, position.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = rgba(entry.color, 0.13);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(position.x, position.y, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = entry.color;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = THEME.background;
      ctx.stroke();

      ctx.restore();
      this.paintCoordinateLabel(ctx, position.x, position.y, drawable.x, drawable.y, width);
    }

    paintCoordinateLabel(ctx, px, py, x, y, width) {
      ctx.save();
      const label = '(' + formatCoordinate(x, this.view.scale) + ', ' + formatCoordinate(y, this.view.scale) + ')';
      ctx.font = '11.5px "Segoe UI Variable Text", "Segoe UI", "PingFang SC", sans-serif';
      const metrics = ctx.measureText(label);
      const padding = 6;
      const boxWidth = metrics.width + padding * 2;
      const boxHeight = 22;
      let boxX = px + 12;
      if (boxX + boxWidth > width - 8) boxX = px - 12 - boxWidth;
      let boxY = py - boxHeight - 8;
      if (boxY < 8) boxY = py + 12;

      ctx.fillStyle = 'rgba(253, 252, 248, 0.92)';
      ctx.strokeStyle = 'rgba(36, 35, 31, 0.12)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, boxX, boxY, boxWidth, boxHeight, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(36, 35, 31, 0.78)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + padding, boxY + boxHeight / 2 + 0.5);
      ctx.restore();
    }

    paintWatermark(ctx, width, height) {
      ctx.save();
      ctx.font = '600 10.5px "Segoe UI Variable Text", "Segoe UI", "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(36, 35, 31, 0.34)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Plotsy', width - 14, height - 11);
      ctx.restore();
    }

    drawOverlay() {
      if (!this.w || !this.h) return;
      const ctx = this.octx;
      ctx.clearRect(0, 0, this.w, this.h);
      for (const marker of this.interests) {
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#44413b';
        ctx.fill();
        ctx.strokeStyle = THEME.background;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (this.pinnedPoint) {
        const { x, y } = this.pinnedPoint;
        const expected = this.worldToScreen(x, y);
        const marker = this.interestAt(expected);
        if (marker && (!this.hover || Math.hypot(marker.x - this.hover.px, marker.y - this.hover.py) > 3)) {
          const current = this.screenToWorld(marker.x, marker.y);
          this.paintCoordinateLabel(ctx, marker.x, marker.y, current.x, current.y, this.w);
        }
      }
      if (!this.hover) return;

      const { px, py } = this.hover;
      ctx.save();
      ctx.strokeStyle = THEME.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, 0);
      ctx.lineTo(Math.round(px) + 0.5, this.h);
      ctx.moveTo(0, Math.round(py) + 0.5);
      ctx.lineTo(this.w, Math.round(py) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = THEME.background;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.hover.color || THEME.crosshairDot;
      ctx.stroke();
      ctx.restore();
      if (this.hover.showLabel) {
        this.paintCoordinateLabel(ctx, px, py, this.hover.x, this.hover.y, this.w);
      }
    }

    exportPNG() {
      return new Promise((resolve, reject) => {
        if (!this.w || !this.h) {
          reject(new Error('画布还没有准备好'));
          return;
        }
        const ratio = Math.min(2.5, 4200 / Math.max(this.w, this.h));
        const output = document.createElement('canvas');
        output.width = Math.max(1, Math.round(this.w * ratio));
        output.height = Math.max(1, Math.round(this.h * ratio));
        const ctx = output.getContext('2d');
        if (!ctx) {
          reject(new Error('无法导出图片'));
          return;
        }
        ctx.scale(ratio, ratio);
        ctx.imageSmoothingEnabled = true;
        this.paint(ctx, this.w, this.h, { exporting: true, watermark: true });
        output.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('图片生成失败'));
        }, 'image/png');
      });
    }
  }

  Plotsy.Graph = Graph;
  Plotsy.graphUtils = {
    PALETTE,
    formatNumber,
    formatCoordinate,
    formatTick,
    hexToRgb,
    rgba
  };
})(typeof window !== 'undefined' ? window : globalThis);
