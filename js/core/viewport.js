/* ============================================================
   Viewport — navegación del espacio de trabajo (pan + zoom).
   - Scroll mouse/trackpad multidireccional: desplaza el lienzo.
   - Shift + scroll: zoom suave hacia el cursor.
   - Arrastrar espacio vacío: pan suave.
   Aplica un único transform (translate + scale) a la superficie.
   El resto del código convierte coords dividiendo por Viewport.zoom.
   ============================================================ */

const Viewport = {
  rack: null,
  surface: null,
  panX: 0, panY: 0, zoom: 1,        // estado actual (renderizado)
  tPanX: 0, tPanY: 0, tZoom: 1,     // objetivo (para suavizado)
  min: 0.3, max: 2.6,
  EASE: 0.32,
  smooth: false,                    // movimiento suave on/off (off = instantáneo)

  mount(rack, surface) {
    this.rack = rack;
    this.surface = surface;
    this.grid = document.getElementById("gridLayer");
    rack.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    rack.addEventListener("mousedown", (e) => this._down(e));
    this._apply();         // estado inicial inmediato (no espera al rAF)
    this._loop();
  },

  // ---- scroll: pan multidireccional / shift = zoom ----
  _wheel(e) {
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0016);
      this._zoomAt(e.clientX, e.clientY, this.tZoom * factor);
    } else {
      this.tPanX -= e.deltaX;
      this.tPanY -= e.deltaY;
    }
  },

  // mantiene fijo el punto del mundo bajo el cursor al hacer zoom
  _zoomAt(cx, cy, newZoom) {
    newZoom = Math.max(this.min, Math.min(this.max, newZoom));
    const r = this.rack.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const wx = (px - this.tPanX) / this.tZoom;
    const wy = (py - this.tPanY) / this.tZoom;
    this.tPanX = px - wx * newZoom;
    this.tPanY = py - wy * newZoom;
    this.tZoom = newZoom;
  },

  // ---- arrastrar espacio vacío para hacer pan ----
  _down(e) {
    if (e.button !== 0) return;
    // ignorar si el click es sobre un módulo, jack, cable o control
    if (e.target.closest(".module") || e.target.closest(".jack") || e.target.closest(".cable")) return;
    if (window.Rack) Rack.deselect();    // clic en vacío deselecciona
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, px = this.tPanX, py = this.tPanY;
    this.rack.classList.add("panning");
    const move = (ev) => { this.tPanX = px + (ev.clientX - sx); this.tPanY = py + (ev.clientY - sy); };
    const up = () => {
      this.rack.classList.remove("panning");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  },

  zoomTo(z) { const r = this.rack.getBoundingClientRect(); this._zoomAt(r.left + r.width / 2, r.top + r.height / 2, z); },
  reset() { this.tPanX = 0; this.tPanY = 0; this.tZoom = 1; },

  /** Centra la vista en un punto del mundo (immediate = sin animación). */
  centerOn(wx, wy, immediate) {
    const r = this.rack.getBoundingClientRect();
    this.tPanX = r.width / 2 - wx * this.tZoom;
    this.tPanY = r.height / 2 - wy * this.tZoom;
    if (immediate) { this.panX = this.tPanX; this.panY = this.tPanY; this.zoom = this.tZoom; this._apply(); this._lpx = this.panX; this._lpy = this.panY; this._lz = this.zoom; }
  },

  // ---- bucle de suavizado ----
  _apply() {
    const z = this.zoom;
    this.surface.style.transform =
      `translate(${this.panX.toFixed(2)}px, ${this.panY.toFixed(2)}px) scale(${z.toFixed(4)})`;
    // grilla anclada al origen del mundo (línea x=0 en screen panX; fila y=3800 en panY+3800z)
    if (this.grid) {
      if (z !== this._gz) {
        this.grid.style.backgroundSize = `${(30 * z).toFixed(2)}px 100%, 100% ${(340 * z).toFixed(2)}px`;
        this._gz = z;
      }
      this.grid.style.backgroundPosition =
        `${this.panX.toFixed(1)}px 0px, 0px ${(this.panY + 3800 * z).toFixed(1)}px`;
    }
  },

  _loop() {
    const tick = () => {
      const a = this.smooth ? this.EASE : 1;     // 1 = instantáneo (sin suavizado)
      this.panX += (this.tPanX - this.panX) * a;
      this.panY += (this.tPanY - this.panY) * a;
      this.zoom += (this.tZoom - this.zoom) * a;
      if (Math.abs(this.tPanX - this.panX) < 0.05) this.panX = this.tPanX;
      if (Math.abs(this.tPanY - this.panY) < 0.05) this.panY = this.tPanY;
      if (Math.abs(this.tZoom - this.zoom) < 0.0005) this.zoom = this.tZoom;
      // solo aplicar cuando cambió algo (en reposo no hace nada)
      if (this.panX !== this._lpx || this.panY !== this._lpy || this.zoom !== this._lz) {
        this._apply();
        this._lpx = this.panX; this._lpy = this.panY; this._lz = this.zoom;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};

window.Viewport = Viewport;
