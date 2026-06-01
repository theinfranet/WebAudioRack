/* ============================================================
   Minimap — vista general del rack (esquina inferior izquierda).
   Cada módulo = rectángulo escalado; el viewport = rectángulo con
   borde acento. Click/arrastre dentro = Viewport.centerOn.
   La intersección/escala se calcula sobre el bounding box de todos
   los módulos + el viewport actual (para que el indicador siempre
   sea visible aunque te alejes).
   ============================================================ */

const Minimap = {
  W: 200, H: 140,
  el: null, cv: null, ctx: null,
  _lastB: null, _lastSc: null,

  init() {
    if (this.el) return;
    const rack = document.querySelector(".rack");
    if (!rack) return;
    const box = document.createElement("div");
    box.className = "minimap";
    const cv = document.createElement("canvas");
    cv.width = this.W * 2; cv.height = this.H * 2;          // retina
    cv.style.width = this.W + "px"; cv.style.height = this.H + "px";
    box.appendChild(cv);
    rack.appendChild(box);
    this.el = box; this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.ctx.scale(2, 2);

    const nav = (e) => {
      const r = this.cv.getBoundingClientRect();
      const w = this._world(e.clientX - r.left, e.clientY - r.top);
      if (w && window.Viewport) Viewport.centerOn(w.x, w.y);
    };
    cv.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      nav(e);
      const mv = (ev) => nav(ev);
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    });

    setInterval(() => this.draw(), 250);
    this.draw();
  },

  _viewRect() {
    const r = Viewport.rack.getBoundingClientRect();
    const z = Viewport.zoom || 1;
    return { x: -Viewport.panX / z, y: -Viewport.panY / z, w: r.width / z, h: r.height / z };
  },

  _bounds() {
    const mods = Rack.modules;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of mods) {
      const x = parseFloat(m.el.style.left) || 0, y = parseFloat(m.el.style.top) || 0;
      const w = m.el.offsetWidth || 150, h = m.el.offsetHeight || 340;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    const vp = this._viewRect();
    minX = Math.min(minX, vp.x); minY = Math.min(minY, vp.y);
    maxX = Math.max(maxX, vp.x + vp.w); maxY = Math.max(maxY, vp.y + vp.h);
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = this.W; maxY = this.H; }
    const mx = (maxX - minX) * 0.06 + 30, my = (maxY - minY) * 0.06 + 30;
    return { minX: minX - mx, minY: minY - my, maxX: maxX + mx, maxY: maxY + my };
  },

  _scale(b) {
    const s = Math.min(this.W / (b.maxX - b.minX), this.H / (b.maxY - b.minY));
    const offX = (this.W - (b.maxX - b.minX) * s) / 2;
    const offY = (this.H - (b.maxY - b.minY) * s) / 2;
    return { s, offX, offY };
  },
  _map(b, sc, wx, wy) { return { x: sc.offX + (wx - b.minX) * sc.s, y: sc.offY + (wy - b.minY) * sc.s }; },
  _world(mx, my) {
    const b = this._lastB, sc = this._lastSc;
    if (!b || !sc) return null;
    return { x: b.minX + (mx - sc.offX) / sc.s, y: b.minY + (my - sc.offY) / sc.s };
  },

  draw() {
    if (!this.ctx || document.hidden || !window.Rack || !window.Viewport) return;
    const b = this._bounds(), sc = this._scale(b);
    this._lastB = b; this._lastSc = sc;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, this.W, this.H);

    for (const m of Rack.modules) {
      const x = parseFloat(m.el.style.left) || 0, y = parseFloat(m.el.style.top) || 0;
      const w = m.el.offsetWidth || 150, h = m.el.offsetHeight || 340;
      const p = this._map(b, sc, x, y), p2 = this._map(b, sc, x + w, y + h);
      ctx.fillStyle = Rack.isSelected(m) ? "#36d39a" : "#3a3a3a";
      ctx.fillRect(p.x, p.y, Math.max(1, p2.x - p.x), Math.max(1, p2.y - p.y));
    }

    const vp = this._viewRect();
    const v1 = this._map(b, sc, vp.x, vp.y), v2 = this._map(b, sc, vp.x + vp.w, vp.y + vp.h);
    ctx.strokeStyle = "#36d39a"; ctx.lineWidth = 1;
    ctx.strokeRect(v1.x + 0.5, v1.y + 0.5, Math.max(1, v2.x - v1.x), Math.max(1, v2.y - v1.y));
  },
};

window.Minimap = Minimap;
