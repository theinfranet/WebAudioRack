/* ============================================================
   Rack — superficie, registro de tipos de módulo y gestión.
   ============================================================ */

const MODULES = [];   // catálogo: { id, name, cat, desc, make }

function registerModule(def) { MODULES.push(def); }

const Rack = {
  surface: null,
  modules: [],
  _z: 10,
  _spawnX: 40,
  _spawnY: 60,

  mount(surface) { this.surface = surface; },

  bringToFront(el) { el.style.zIndex = ++this._z; },

  /** Instancia un módulo por id y lo coloca en el rack (grilla magnética). */
  add(id, pos) {
    const def = MODULES.find((m) => m.id === id);
    if (!def) { console.warn("módulo desconocido:", id); return null; }
    const mod = def.make({ x: 0, y: 0 });
    this.surface.appendChild(mod.el);
    this.modules.push(mod);
    this.bringToFront(mod.el);

    if (pos) Layout.place(mod, pos.x, pos.y);
    else Layout.placeNew(mod);
    return mod;
  },

  remove(mod) {
    this.modules = this.modules.filter((m) => m !== mod);
  },
};

window.Rack = Rack;
window.MODULES = MODULES;
window.registerModule = registerModule;
