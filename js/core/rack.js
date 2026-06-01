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

  // ---------- selección (múltiple) ----------
  // `selection` es el conjunto; `selected` se mantiene como "primario"
  // (último tocado) por compatibilidad con el código existente.
  selection: new Set(),

  isSelected(mod) { return this.selection.has(mod); },
  selectionList() { return [...this.selection]; },

  _applySel() {
    for (const m of this.modules) m.el.classList.toggle("selected", this.selection.has(m));
  },

  /** Selección única (reemplaza todo). */
  selectOne(mod) {
    this.selection.clear();
    if (mod) this.selection.add(mod);
    this.selected = mod || null;
    this._applySel();
  },
  /** Alias retrocompatible: un clic simple selecciona solo ese módulo. */
  select(mod) { this.selectOne(mod); },

  selectAdd(mod) {
    if (!mod) return;
    this.selection.add(mod);
    this.selected = mod;
    this._applySel();
  },
  selectToggle(mod) {
    if (!mod) return;
    if (this.selection.has(mod)) {
      this.selection.delete(mod);
      if (this.selected === mod) this.selected = [...this.selection][0] || null;
    } else {
      this.selection.add(mod);
      this.selected = mod;
    }
    this._applySel();
  },
  selectAll() {
    this.selection = new Set(this.modules);
    this.selected = this.modules[this.modules.length - 1] || null;
    this._applySel();
  },
  deselect() {
    this.selection.clear();
    this.selected = null;
    this._applySel();
  },

  /** Crea la instancia, la añade al DOM y a la lista, SIN colocarla. */
  _instantiate(id) {
    const def = MODULES.find((m) => m.id === id);
    if (!def) { console.warn("módulo desconocido:", id); return null; }
    const mod = def.make({ x: 0, y: 0 });
    mod._defId = id;                       // recordar tipo para serializar
    if (window.ICONS) mod.setIcon(ICONS[id]);
    this.surface.appendChild(mod.el);
    this.modules.push(mod);
    this.bringToFront(mod.el);
    return mod;
  },

  /** Instancia un módulo por id y lo coloca en el rack (grilla magnética). */
  add(id, pos) {
    const mod = this._instantiate(id);
    if (!mod) return null;
    if (pos) {
      // Si nos dan una posición (p. ej. la del cursor) intentamos colocar
      // el módulo en el hueco libre más cercano de la fila apuntada.
      // Si no cabe en ninguna fila, caemos al comportamiento anterior.
      if (!Layout.placeAt(mod, pos.x, pos.y)) Layout.placeNew(mod);
    } else Layout.placeNew(mod);
    if (window.History && History.record) History.record();
    return mod;
  },

  /** Coloca un módulo en coordenadas EXACTAS (sin reflow magnético).
   *  Lo usa fromJSON para reconstruir un patch tal cual se guardó. */
  spawnExact(id, x, y) {
    const mod = this._instantiate(id);
    if (!mod) return null;
    mod.el.style.left = (x || 0) + "px";
    mod.el.style.top = (y || 0) + "px";
    mod.__row = Layout.snapRow(y || 0);
    return mod;
  },

  /** Duplica un módulo (mismo tipo + valores) una fila más abajo. */
  duplicate(mod) {
    if (!mod || !mod._defId) return null;
    const data = mod.serialize();
    const x = (parseFloat(mod.el.style.left) || 0);
    const y = (parseFloat(mod.el.style.top) || 0) + Layout.ROW_H;
    const copy = this.add(mod._defId, { x, y });
    if (copy) {
      copy.deserialize({ params: data.params, state: data.state, title: data.title });
      this.select(copy);
    }
    return copy;
  },

  // ---------- portapapeles / acciones sobre la selección ----------
  clipboard: null,

  /** Serializa un conjunto de módulos + SOLO los cables internos al conjunto. */
  _serializeSet(mods) {
    const setIdx = new Map(mods.map((m, i) => [m, i]));
    const modules = mods.map((m) => m.serialize());
    const cables = [];
    if (window.Patch) {
      for (const c of Patch.cables) {
        if (setIdx.has(c.out.module) && setIdx.has(c.in.module)) {
          cables.push({
            out: [setIdx.get(c.out.module), c.out.module.ports.indexOf(c.out)],
            in:  [setIdx.get(c.in.module),  c.in.module.ports.indexOf(c.in)],
            color: c.color,
          });
        }
      }
    }
    return { modules, cables };
  },

  /** Reconstruye un conjunto serializado desplazado por `off`; lo deja seleccionado. */
  _spawnSet(data, off) {
    if (!data || !data.modules || !data.modules.length) return [];
    off = off || { x: 24, y: Layout.ROW_H };
    const created = data.modules.map((md) => {
      const m = this.spawnExact(md.type, (md.x || 0) + off.x, (md.y || 0) + off.y);
      if (m) m.deserialize(md);
      return m;
    });
    if (window.Patch && Array.isArray(data.cables)) {
      data.cables.forEach((cb) => {
        const om = created[cb.out[0]], im = created[cb.in[0]];
        if (!om || !im) return;
        const op = om.ports[cb.out[1]], ip = im.ports[cb.in[1]];
        if (op && ip) Patch.connect(op, ip, cb.color);
      });
    }
    this.selection = new Set(created.filter(Boolean));
    this.selected = [...this.selection][this.selection.size - 1] || null;
    this._applySel();
    if (window.History && History.record) History.record();
    return created;
  },

  copySelection() {
    const mods = this.selectionList();
    if (!mods.length) return false;
    this.clipboard = this._serializeSet(mods);
    return true;
  },

  /** Pega el portapapeles (en `off`, o desplazado por defecto). */
  paste(off) {
    if (!this.clipboard) return [];
    return this._spawnSet(this.clipboard, off);
  },

  /** Duplica la selección (sin tocar el portapapeles). */
  duplicateSelection() {
    const mods = this.selectionList();
    if (!mods.length) return [];
    return this._spawnSet(this._serializeSet(mods), { x: 24, y: Layout.ROW_H });
  },

  /** Borra toda la selección (un único paso de undo por coalescencia). */
  deleteSelection() {
    const mods = this.selectionList();
    if (!mods.length) return;
    mods.forEach((m) => m.dispose());
    this.deselect();
  },

  remove(mod) {
    if (this.selected === mod) this.selected = null;
    this.selection.delete(mod);
    this.modules = this.modules.filter((m) => m !== mod);
  },

  // ---------- serialización del rack completo ----------
  toJSON() {
    const idx = (m) => this.modules.indexOf(m);
    return {
      version: 1,
      viewport: window.Viewport ? { panX: Viewport.tPanX, panY: Viewport.tPanY, zoom: Viewport.tZoom } : null,
      tension: window.Patch ? Patch.tension : 0.3,
      cableColor: window.Patch ? Patch.cableColor : null,
      modules: this.modules.map((m) => m.serialize()),
      cables: window.Patch ? Patch.cables.map((c) => ({
        out: [idx(c.out.module), c.out.module.ports.indexOf(c.out)],
        in:  [idx(c.in.module),  c.in.module.ports.indexOf(c.in)],
        color: c.color,
      })) : [],
    };
  },

  /** Reemplaza el patch actual por el de `json`.
   *  opts.viewport=false  -> no toca el encuadre (usado por undo/redo). */
  fromJSON(json, opts = {}) {
    if (!json) return;
    const restoreViewport = opts.viewport !== false;

    // 1) limpiar el patch actual
    this.modules.slice().forEach((m) => m.dispose());
    if (window.Patch) Patch.cables.slice().forEach((c) => Patch.removeCable(c));
    this.selection.clear();
    this.selected = null;

    // 2) reconstruir módulos en el MISMO orden (los cables referencian por índice)
    const created = (json.modules || []).map((md) => {
      const mod = this.spawnExact(md.type, md.x, md.y);
      if (mod) mod.deserialize(md);
      return mod;   // null si el tipo es desconocido
    });

    // 3) reconstruir cables por [moduleIdx, portIdx]
    if (window.Patch && Array.isArray(json.cables)) {
      json.cables.forEach((cb) => {
        const om = created[cb.out[0]], im = created[cb.in[0]];
        if (!om || !im) return;
        const op = om.ports[cb.out[1]], ip = im.ports[cb.in[1]];
        if (op && ip) Patch.connect(op, ip, cb.color);
      });
    }

    // 4) ajustes globales
    if (window.Patch) {
      if (typeof json.tension === "number") Patch.tension = json.tension;
      Patch.setNewColor(json.cableColor || null);
      Patch.redrawAll();
    }
    const ts = document.getElementById("tension");
    if (ts && window.Patch) ts.value = Math.round(Patch.tension * 100);

    if (restoreViewport && json.viewport && window.Viewport) {
      Viewport.tPanX = json.viewport.panX;
      Viewport.tPanY = json.viewport.panY;
      Viewport.tZoom = json.viewport.zoom;
    }
  },
};

window.Rack = Rack;
window.MODULES = MODULES;
window.registerModule = registerModule;
