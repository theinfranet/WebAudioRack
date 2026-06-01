/* ============================================================
   Selection — marquee (rectángulo de selección) por Shift+arrastre
   desde el vacío del lienzo. Suma a la selección existente.
   ------------------------------------------------------------
   La intersección se calcula en coordenadas de PANTALLA
   (getBoundingClientRect de cada módulo vs el rectángulo del
   marquee), así funciona con cualquier zoom/pan sin convertir
   coordenadas. Plano izquierdo: pan normal; con Shift: marquee
   (ver Viewport._down, que cede ante Shift).
   ============================================================ */

const Selection = {
  rack: null,
  box: null,
  sx: 0, sy: 0,
  base: null,

  init(rackEl) {
    this.rack = rackEl || document.querySelector(".rack");
    if (this.rack) this.rack.addEventListener("mousedown", (e) => this._down(e));
  },

  _down(e) {
    if (e.button !== 0 || !e.shiftKey) return;
    // solo desde el vacío
    if (e.target.closest(".module") || e.target.closest(".jack") ||
        e.target.closest(".cable") || e.target.closest(".zoom-bar")) return;
    e.preventDefault();
    e.stopPropagation();

    this.sx = e.clientX; this.sy = e.clientY;
    this.base = window.Rack ? new Set(Rack.selectionList()) : new Set();   // Shift = aditivo
    this.box = document.createElement("div");
    this.box.className = "marquee";
    document.body.appendChild(this.box);
    this._update(e);

    const move = (ev) => this._update(ev);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (this.box) { this.box.remove(); this.box = null; }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  },

  _rect(e) {
    return {
      x: Math.min(this.sx, e.clientX),
      y: Math.min(this.sy, e.clientY),
      w: Math.abs(e.clientX - this.sx),
      h: Math.abs(e.clientY - this.sy),
    };
  },

  _overlap(r, b) {
    return !(b.right < r.x || b.left > r.x + r.w || b.bottom < r.y || b.top > r.y + r.h);
  },

  _update(e) {
    if (!this.box) return;
    const r = this._rect(e);
    this.box.style.left = r.x + "px";
    this.box.style.top = r.y + "px";
    this.box.style.width = r.w + "px";
    this.box.style.height = r.h + "px";

    if (!window.Rack) return;
    const sel = new Set(this.base);
    for (const m of Rack.modules) {
      if (this._overlap(r, m.el.getBoundingClientRect())) sel.add(m);
    }
    Rack.selection = sel;
    Rack.selected = [...sel][sel.size - 1] || null;
    Rack._applySel();
  },
};

window.Selection = Selection;
