/* ============================================================
   Layout — grilla "magnética" estilo eurorack.
   - Los módulos se alinean a filas (rows) y a una grilla horizontal.
   - No se permiten solapes: al colocar/arrastrar un módulo, empuja
     a sus vecinos (derecha e izquierda) para hacerle sitio.
   ============================================================ */

const Layout = {
  GRID: 6,        // paso horizontal de la grilla
  ROW_H: 360,     // alto de fila
  ROW_PAD: 16,    // margen superior de la primera fila
  GAP: 3,         // separación entre módulos (eurorack: casi a tope)
  SURF_W: 4000,

  snapX(x) { return Math.max(this.GRID, Math.round(x / this.GRID) * this.GRID); },
  snapRow(y) {
    const k = Math.max(0, Math.round((y - this.ROW_PAD) / this.ROW_H));
    return this.ROW_PAD + k * this.ROW_H;
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

  /** Coloca un módulo nuevo en el primer hueco disponible, sin solapar. */
  placeNew(mod) {
    const w = this.W(mod);
    for (let i = 0; i < 16; i++) {
      const row = this.ROW_PAD + i * this.ROW_H;
      const inRow = this.modulesInRow(row, mod);
      const edge = inRow.length ? Math.max(...inRow.map((m) => this.R(m))) + this.GAP : this.GRID;
      if (inRow.length === 0 || edge + w <= this.SURF_W - this.GRID) {
        mod.__row = row;
        mod.el.style.left = this.snapX(edge) + "px";
        mod.el.style.top = row + "px";
        return;
      }
    }
    const row = this.ROW_PAD;
    mod.__row = row;
    mod.el.style.left = this.GRID + "px";
    mod.el.style.top = row + "px";
    this.resolve(row, mod);
  },

  /** Empuja los vecinos de la misma fila para que no se solapen con el ancla. */
  resolve(row, anchor) {
    const others = this.modulesInRow(row, anchor);
    const aC = this.C(anchor);

    // vecinos a la derecha: empujar hacia la derecha en cadena
    const right = others.filter((m) => this.C(m) >= aC).sort((p, q) => this.L(p) - this.L(q));
    let edge = this.R(anchor) + this.GAP;
    for (const m of right) {
      if (this.L(m) < edge) m.el.style.left = edge + "px";
      edge = this.R(m) + this.GAP;
    }

    // vecinos a la izquierda: empujar hacia la izquierda en cadena
    const left = others.filter((m) => this.C(m) < aC).sort((p, q) => this.L(q) - this.L(p));
    let ledge = this.L(anchor) - this.GAP;
    for (const m of left) {
      if (this.R(m) > ledge) {
        const nx = Math.max(this.GRID, ledge - this.W(m));
        m.el.style.left = nx + "px";
      }
      ledge = this.L(m) - this.GAP;
    }
  },
};

window.Layout = Layout;
