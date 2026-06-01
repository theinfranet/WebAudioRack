/* ============================================================
   ContextMenu — menú contextual (click derecho) reutilizable.
   ------------------------------------------------------------
   API:  ContextMenu.open(x, y, items)
     items = [{ label, onClick, hint?, disabled?, separator?, submenu? }]
     submenu = [{ label, onClick, swatch? }]

   init() instala un único listener delegado de 'contextmenu' que,
   según el objetivo (knob, jack, cable, módulo o lienzo vacío),
   construye el menú adecuado. Muchas otras features reutilizarán
   ContextMenu.open() directamente.
   ============================================================ */

const ContextMenu = {
  el: null,
  _clipValue: null,         // portapapeles interno para "copiar/pegar valor"
  onAddModuleHere: null,    // hook fijado por main.js (worldless: usa clientX/Y)
  onCenterAll: null,        // hook fijado por main.js
  onPaste: null,            // hook fijado por main.js (pega el portapapeles en el cursor)

  // paleta para el submenú de color de cable (espejo del cajón de cables)
  PALETTE: [
    { label: "Automático", color: null },
    { label: "Verde",   color: "#36d39a" },
    { label: "Naranja",  color: "#ff7a3d" },
    { label: "Amarillo", color: "#ffd23d" },
    { label: "Lima",     color: "#9be15d" },
    { label: "Rosa",     color: "#ff5e8a" },
    { label: "Violeta",  color: "#c46bff" },
    { label: "Rojo",     color: "#ff4d5e" },
    { label: "Hueso",    color: "#d9dde4" },
  ],

  // ---------- render ----------
  open(x, y, items) {
    this.close();
    if (!items || !items.length) return;
    const menu = document.createElement("div");
    menu.className = "ctx-menu";

    items.forEach((it) => {
      if (it.separator) {
        const s = document.createElement("div");
        s.className = "ctx-sep";
        menu.appendChild(s);
        return;
      }
      const row = document.createElement("div");
      row.className = "ctx-item"
        + (it.disabled ? " disabled" : "")
        + (it.header ? " header" : "")
        + (it.submenu ? " has-sub" : "");

      const lbl = document.createElement("span");
      lbl.className = "ctx-label";
      lbl.textContent = it.label;
      row.appendChild(lbl);

      if (it.hint) {
        const h = document.createElement("span");
        h.className = "ctx-hint";
        h.textContent = it.hint;
        row.appendChild(h);
      }

      if (it.submenu && it.submenu.length) {
        const arrow = document.createElement("span");
        arrow.className = "ctx-arrow";
        arrow.textContent = "›";
        row.appendChild(arrow);

        const sub = document.createElement("div");
        sub.className = "ctx-sub";
        it.submenu.forEach((si) => {
          const sr = document.createElement("div");
          sr.className = "ctx-item" + (si.active ? " active" : "");
          if (si.swatchClass) {
            const dot = document.createElement("span");
            dot.className = "ctx-swatch " + si.swatchClass;
            sr.appendChild(dot);
          } else if (si.swatch !== undefined) {
            const dot = document.createElement("span");
            dot.className = "ctx-swatch";
            dot.style.background = si.swatch || "conic-gradient(#36d39a,#ffd23d,#ff7a3d,#ff5e8a,#c46bff,#36d39a)";
            sr.appendChild(dot);
          }
          const sl = document.createElement("span");
          sl.className = "ctx-label";
          sl.textContent = si.label;
          sr.appendChild(sl);
          sr.addEventListener("click", (e) => { e.stopPropagation(); try { si.onClick && si.onClick(); } finally { this.close(); } });
          sub.appendChild(sr);
        });
        row.appendChild(sub);
      } else if (!it.disabled && !it.header) {
        row.addEventListener("click", (e) => { e.stopPropagation(); try { it.onClick && it.onClick(); } finally { this.close(); } });
      }
      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    // reposicionar dentro de la ventana
    const r = menu.getBoundingClientRect();
    let px = x, py = y;
    if (px + r.width > window.innerWidth - 6) px = window.innerWidth - r.width - 6;
    if (py + r.height > window.innerHeight - 6) py = window.innerHeight - r.height - 6;
    menu.style.left = Math.max(6, px) + "px";
    menu.style.top = Math.max(6, py) + "px";
    this.el = menu;

    // cerrar al interactuar fuera (en el siguiente turno, para no auto-cerrarse)
    setTimeout(() => {
      window.addEventListener("mousedown", this._outside, true);
      window.addEventListener("keydown", this._esc, true);
      window.addEventListener("wheel", this._closeNow, true);
      window.addEventListener("blur", this._closeNow, true);
    }, 0);
  },

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    window.removeEventListener("mousedown", this._outside, true);
    window.removeEventListener("keydown", this._esc, true);
    window.removeEventListener("wheel", this._closeNow, true);
    window.removeEventListener("blur", this._closeNow, true);
  },

  _outside(e) { if (ContextMenu.el && !ContextMenu.el.contains(e.target)) ContextMenu.close(); },
  _esc(e) { if (e.key === "Escape") { e.stopPropagation(); ContextMenu.close(); } },
  _closeNow() { ContextMenu.close(); },

  // ---------- delegación: construir el menú según el objetivo ----------
  init() {
    document.addEventListener("contextmenu", (e) => {
      const items = this._itemsFor(e.target, e.clientX, e.clientY);
      if (!items) return;            // objetivo no reconocido: menú nativo
      e.preventDefault();
      this.open(e.clientX, e.clientY, items);
    });
  },

  _itemsFor(target, cx, cy) {
    if (!target || !target.closest) return null;

    // --- KNOB ---
    const knobEl = target.closest(".knob");
    if (knobEl && knobEl.__control) return this._knobItems(knobEl.__control);

    // --- CABLE (path SVG) ---
    const cableEl = target.closest(".cable");
    if (cableEl && cableEl.__cable) return this._cableItems(cableEl.__cable);

    // --- JACK / PORT ---
    const jackEl = target.closest(".jack");
    if (jackEl && jackEl.__port) return this._portItems(jackEl.__port);

    // --- MÓDULO (header o cuerpo) ---
    const modEl = target.closest(".module");
    if (modEl && modEl.__module) return this._moduleItems(modEl.__module);

    // --- LIENZO VACÍO ---
    if (target.closest(".rack")) return this._canvasItems(cx, cy);

    return null;
  },

  _knobItems(ctrl) {
    const cur = (typeof ctrl.display === "function") ? ctrl.display() : String(ctrl.value);
    return [
      { label: "Valor: " + cur + (ctrl.unit && ctrl.unit !== "Hz" ? " " + ctrl.unit : ""), header: true },
      { label: "Entrada numérica…", onClick: () => {
        const raw = window.prompt(
          (ctrl.label || "Valor") + (ctrl.min != null ? "  (" + ctrl.min + " – " + ctrl.max + ")" : ""),
          String(+(+ctrl.value).toFixed(4))
        );
        if (raw == null) return;
        const n = parseFloat(raw);
        if (!isNaN(n)) { ctrl.set(n); ctrl.commit && ctrl.commit(); }
      } },
      { label: "Reiniciar", hint: ctrl.default != null ? String(+(+ctrl.default).toFixed(3)) : "", onClick: () => ctrl.reset && ctrl.reset() },
      { separator: true },
      { label: "Copiar valor", onClick: () => { ContextMenu._clipValue = ctrl.value; } },
      { label: "Pegar valor", disabled: (ContextMenu._clipValue == null), onClick: () => {
        if (ContextMenu._clipValue == null) return;
        ctrl.set(ContextMenu._clipValue); ctrl.commit && ctrl.commit();
      } },
    ];
  },

  _cableItems(cable) {
    return [
      { label: cable.out.module.title + " → " + cable.in.module.title, header: true },
      { label: "Borrar cable", onClick: () => Patch.removeCable(cable) },
      { label: "Color", submenu: this.PALETTE.map((p) => ({
        label: p.label, swatch: p.color, onClick: () => Patch.setCableColor(cable, p.color),
      })) },
      { separator: true },
      { label: "Centrar en origen", hint: cable.out.module.title, onClick: () => Patch.jumpToPort && Patch.jumpToPort(cable.out) },
      { label: "Centrar en destino", hint: cable.in.module.title, onClick: () => Patch.jumpToPort && Patch.jumpToPort(cable.in) },
    ];
  },

  _portItems(port) {
    const n = port.connections ? port.connections.size : 0;
    return [
      { label: port.module.title + " · " + port.label + "  [" + (port.kind || "audio") + "]", header: true },
      { label: "Desconectar todo" + (n ? " (" + n + ")" : ""), disabled: !n, onClick: () => Patch.disconnectPort(port) },
    ];
  },

  _moduleItems(mod) {
    return [
      { label: mod.title, header: true },
      { label: "Renombrar…", onClick: () => {
        const t = window.prompt("Nuevo nombre del módulo:", mod.title);
        if (t != null && t.trim()) { mod.setTitle(t.trim()); if (window.History && History.record) History.record(); }
      } },
      { label: "Duplicar", onClick: () => Rack.duplicate(mod) },
      { label: "Traer al frente", onClick: () => Rack.bringToFront(mod.el) },
      ...(window.ModuleThemes ? [{
        label: "Estilo del módulo",
        submenu: ModuleThemes.THEMES.map((t) => ({
          label: t.name,
          swatchClass: "theme-swatch--" + t.id,
          active: (mod.el.dataset.theme || "default") === t.id,
          onClick: () => ModuleThemes.apply(mod.el, t.id),
        })),
      }] : []),
      { separator: true },
      { label: "Borrar módulo", onClick: () => mod.dispose() },
    ];
  },

  _canvasItems(cx, cy) {
    const items = [
      { label: "Añadir módulo aquí…", onClick: () => this.onAddModuleHere && this.onAddModuleHere(cx, cy) },
    ];
    const clip = window.Rack && Rack.clipboard;
    if (clip && clip.modules && clip.modules.length) {
      items.push({ label: "Pegar aquí (" + clip.modules.length + ")", onClick: () => this.onPaste && this.onPaste(cx, cy) });
    }
    items.push({ label: "Centrar todo", onClick: () => this.onCenterAll && this.onCenterAll() });
    return items;
  },
};

window.ContextMenu = ContextMenu;
