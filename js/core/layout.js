/* ============================================================
   Layout — grilla "magnética" estilo eurorack.
   - Los módulos se alinean a filas (rows) y a una grilla horizontal.
   - Filas a tope (sin espacio extra): ROW_H = alto del módulo.
   - Superficie enorme con un origen central → sensación de infinito.
   - No se permiten solapes: al colocar/arrastrar empuja a los vecinos.
   ============================================================ */

const Layout = {
  GRID: 6,            // paso horizontal de la grilla
  ROW_H: 340,         // alto de fila = alto del módulo (sin gap entre filas)
  GAP: 2,             // separación horizontal entre módulos (casi a tope)
  SURF_W: 12000,
  SURF_H: 8000,
  ORIGIN_X: 5500,     // punto "home" cerca del centro de la superficie
  ORIGIN_Y: 3800,

  snapX(x) { return Math.max(0, Math.round(x / this.GRID) * this.GRID); },
  snapRow(y) {
    const k = Math.round((y - this.ORIGIN_Y) / this.ROW_H);   // filas arriba y abajo del origen
    return this.ORIGIN_Y + k * this.ROW_H;
  },

  // helpers de geometría de un módulo
  L(m) { return parseFloat(m.el.style.left) || 0; },
  W(m) { return m.el.offsetWidth; },
  R(m) { return this.L(m) + this.W(m); },
  C(m) { return this.L(m) + this.W(m) / 2; },

  modulesInRow(row, except) {
    return Rack.modules.filter((m) => m !== except && m.__row === row);
  },

  /** Arrastre en vivo: ancla = el módulo que mueve el usuario. */
  drag(mod, x, y) {
    const row = this.snapRow(y);
    mod.el.style.left = this.snapX(x) + "px";
    mod.el.style.top = row + "px";
    mod.__row = row;
    this.resolve(row, mod);
  },

  /** Coloca un módulo en una posición concreta (con snap) y resuelve solapes. */
  place(mod, x, y) {
    const row = this.snapRow(y);
    mod.el.style.left = this.snapX(x) + "px";
    mod.el.style.top = row + "px";
    mod.__row = row;
    this.resolve(row, mod);
  },

  /** Coloca un módulo nuevo en el primer hueco libre desde el origen. */
  placeNew(mod) {
    const w = this.W(mod);
    for (let i = 0; i < 24; i++) {
      const row = this.ORIGIN_Y + i * this.ROW_H;
      const inRow = this.modulesInRow(row, mod);
      const edge = inRow.length ? Math.max(...inRow.map((m) => this.R(m))) + this.GAP : this.ORIGIN_X;
      if (inRow.length === 0 || edge + w <= this.ORIGIN_X + this.SURF_W) {
        mod.__row = row;
        mod.el.style.left = this.snapX(edge) + "px";
        mod.el.style.top = row + "px";
        return;
      }
    }
    mod.__row = this.ORIGIN_Y;
    mod.el.style.left = this.ORIGIN_X + "px";
    mod.el.style.top = this.ORIGIN_Y + "px";
    this.resolve(this.ORIGIN_Y, mod);
  },

  /** Empuja los vecinos de la misma fila para que no se solapen con el ancla. */
  resolve(row, anchor) {
    const others = this.modulesInRow(row, anchor);
    const aC = this.C(anchor);

    const right = others.filter((m) => this.C(m) >= aC).sort((p, q) => this.L(p) - this.L(q));
    let edge = this.R(anchor) + this.GAP;
    for (const m of right) {
      if (this.L(m) < edge) m.el.style.left = edge + "px";
      edge = this.R(m) + this.GAP;
    }

    const left = others.filter((m) => this.C(m) < aC).sort((p, q) => this.L(q) - this.L(p));
    let ledge = this.L(anchor) - this.GAP;
    for (const m of left) {
      if (this.R(m) > ledge) m.el.style.left = Math.max(0, ledge - this.W(m)) + "px";
      ledge = this.L(m) - this.GAP;
    }
  },
};

window.Layout = Layout;
