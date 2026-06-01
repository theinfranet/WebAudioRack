/* ============================================================
   Rack — superficie, registro de tipos de módulo y gestión.
   ============================================================ */

const MODULES = [];   // catálogo: { id, name, cat, desc, make }

function registerModule(def) { MODULES.push(def); }

const Rack = {
  surface: null,
  modules: [],
  selected: null,
  _z: 10,
  _spawnX: 40,
  _spawnY: 60,

  mount(surface) { this.surface = surface; },

  bringToFront(el) { el.style.zIndex = ++this._z; },

  select(mod) {
    if (this.selected && this.selected !== mod) this.selected.el.classList.remove("selected");
    this.selected = mod;
    if (mod) mod.el.classList.add("selected");
  },
  deselect() {
    if (this.selected) this.selected.el.classList.remove("selected");
    this.selected = null;
  },

  /** Instancia un módulo por id y lo coloca en el rack (grilla magnética). */
  add(id, pos) {
    const def = MODULES.find((m) => m.id === id);
    if (!def) { console.warn("módulo desconocido:", id); return null; }
    const mod = def.make({ x: 0, y: 0 });
    if (window.ICONS) mod.setIcon(ICONS[id]);
    this.surface.appendChild(mod.el);
    this.modules.push(mod);
    this.bringToFront(mod.el);

    if (pos) {
      // Si nos dan una posición (p. ej. la del cursor) intentamos colocar
      // el módulo en el hueco libre más cercano de la fila apuntada.
      // Si no cabe en ninguna fila, caemos al comportamiento anterior.
      if (!Layout.placeAt(mod, pos.x, pos.y)) Layout.placeNew(mod);
    } else Layout.placeNew(mod);
    return mod;
  },

  remove(mod) {
    if (this.selected === mod) this.selected = null;
    this.modules = this.modules.filter((m) => m !== mod);
  },
};

window.Rack = Rack;
window.MODULES = MODULES;
window.registerModule = registerModule;
