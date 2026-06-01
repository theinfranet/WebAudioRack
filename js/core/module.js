/* ============================================================
   Module — clase base de todo módulo del rack.
   Construye el panel y expone helpers del UI kit:
   addKnob, addPort, addScreen, addLED, addSelect, addButton,
   addWaveSwitch, addFader, group, row.
   ============================================================ */

let __moduleId = 0;

class Module {
  /** @param {object} def { title, width, x, y } */
  constructor(def = {}) {
    this.id = ++__moduleId;
    this.title = def.title || "MODULE";
    this.ports = [];
    this.controls = [];
    this.paramLinks = new Map();   // AudioParam -> knob api (indicador de modulación, T2.1)
    this._anim = null;

    const el = document.createElement("div");
    el.className = "module";
    el.style.width = (def.width || 150) + "px";
    el.style.left = (def.x ?? 40) + "px";
    el.style.top = (def.y ?? 60) + "px";
    el.innerHTML = `
      <span class="module__screw tl"></span><span class="module__screw tr"></span>
      <span class="module__screw bl"></span><span class="module__screw br"></span>
      <div class="module__header">
        <div class="module__title">${this.title}</div>
      </div>
      <div class="module__body"></div>`;
    this.el = el;
    el.__module = this;                 // ref DOM -> instancia (menú contextual)
    this.body = el.querySelector(".module__body");
    this._makeDraggable(el.querySelector(".module__header"));
    // clic en el módulo => seleccionar (Shift = añadir/quitar de la selección)
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !window.Rack) return;
      if (e.shiftKey) Rack.selectToggle(this);
      else if (!Rack.isSelected(this)) Rack.selectOne(this);
      // si ya estaba seleccionado (parte de un grupo) y sin shift: se mantiene
      // la selección para poder arrastrar el grupo; se colapsa en mouseup si no
      // hubo arrastre (ver _makeDraggable).
    });
  }

  /** Cambia el título visible (usado por "Renombrar" del menú contextual). */
  setTitle(t) {
    this.title = t;
    this.custom = true;                 // marca para que serialize lo conserve
    const el = this.el.querySelector(".module__title");
    if (el) el.textContent = t;
  }

  /** Notifica al historial que un control se "soltó" (fin de gesto). */
  _commit() { if (window.History && History.record) History.record(); }

  /** Inserta el icono lineal del módulo en el header. */
  setIcon(inner) {
    if (!inner) return;
    const span = document.createElement("span");
    span.className = "module__icon";
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    const header = this.el.querySelector(".module__header");
    header.insertBefore(span, header.firstChild);
  }

  // ---------- layout helpers ----------
  row(parent = this.body, cls = "") {
    const r = document.createElement("div");
    r.className = "row " + cls;
    parent.appendChild(r);
    return r;
  }
  group(label, parent = this.body) {
    const g = document.createElement("div");
    g.className = "group";
    g.innerHTML = `<div class="group__label">${label}</div>`;
    parent.appendChild(g);
    return g;
  }

  // ---------- KNOB ----------
  addKnob(parent, def) {
    const {
      label = "", min = 0, max = 1, value = min, unit = "",
      mapping = "lin", bipolar = false, format, onChange, param,
    } = def;

    const wrap = document.createElement("div");
    wrap.className = "knob" + (bipolar ? " bipolar" : "");
    wrap.innerHTML = `
      <div class="knob__dial">
        <div class="knob__face"></div>
        <div class="knob__indicator"></div>
      </div>
      <div class="knob__label">${label}</div>
      <div class="knob__value"></div>`;
    parent.appendChild(wrap);

    const dial = wrap.querySelector(".knob__dial");
    const ind = wrap.querySelector(".knob__indicator");
    const out = wrap.querySelector(".knob__value");

    const toNorm = (v) => mapping === "exp"
      ? Math.log(v / min) / Math.log(max / min)
      : (v - min) / (max - min);
    const fromNorm = (t) => mapping === "exp"
      ? min * Math.pow(max / min, t)
      : min + t * (max - min);

    let v = value;
    const fmt = format || ((x) => {
      const a = Math.abs(x);
      if (unit === "Hz" && a >= 1000) return (x / 1000).toFixed(2) + "k";
      if (a >= 100) return x.toFixed(0);
      if (a >= 10) return x.toFixed(1);
      return x.toFixed(2);
    });

    const render = () => {
      const t = Math.max(0, Math.min(1, toNorm(v)));
      ind.style.transform = `translate(-50%,-100%) rotate(${(-135 + t * 270).toFixed(1)}deg)`;
      out.textContent = fmt(v) + (unit && unit !== "Hz" ? unit : (unit === "Hz" ? "" : ""));
    };
    const set = (nv, fire = true) => {
      v = Math.max(min, Math.min(max, nv));
      render();
      if (fire && onChange) onChange(v);
    };

    // arrastre vertical
    let startY = 0, startT = 0;
    const move = (e) => {
      const dy = startY - e.clientY;
      let t = startT + dy / 200;
      t = Math.max(0, Math.min(1, t));
      set(fromNorm(t));
    };
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      this._commit();   // un único registro de historial al soltar
    };
    dial.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;           // derecho/medio: deja pasar (menú contextual)
      e.preventDefault(); e.stopPropagation();
      startY = e.clientY; startT = toNorm(v);
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
    dial.addEventListener("dblclick", (e) => { e.stopPropagation(); set(value); this._commit(); });
    // (sin rueda: el scroll/trackpad mueve el lienzo, no la perilla)

    render();
    if (onChange) onChange(v);
    const api = {
      el: wrap, kind: "knob", label, min, max, unit, default: value,
      get value() { return v; },
      set: (x) => set(x),
      reset: () => { set(value); this._commit(); },
      commit: () => this._commit(),
      display: () => fmt(v),
    };
    wrap.__control = api;       // ref DOM -> control (menú contextual)
    if (param && this.paramLinks) this.paramLinks.set(param, api);   // T2.1: knob <-> AudioParam
    this.controls.push(api);
    return api;
  }

  // ---------- PORT (jack) ----------
  addPort(parent, dir, node, opts = {}) {
    const port = new Port(this, dir, node, opts);
    const wrap = document.createElement("div");
    wrap.className = "port";
    const jack = document.createElement("div");
    jack.className = "jack " + (dir === "out" ? "is-output" : "is-input");
    const lbl = document.createElement("div");
    lbl.className = "port__label";
    lbl.textContent = opts.label || (dir === "out" ? "OUT" : "IN");

    // convención eurorack: las salidas llevan un rectángulo de fondo
    if (dir === "out") {
      const plate = document.createElement("div");
      plate.className = "jack-plate";
      plate.appendChild(jack);
      wrap.appendChild(plate);
    } else {
      wrap.appendChild(jack);
    }
    wrap.appendChild(lbl);

    let actLed = null;
    if (dir === "out") {
      actLed = document.createElement("div");
      actLed.className = "led port__act";
      wrap.appendChild(actLed);
    }
    parent.appendChild(wrap);
    Patch.register(port, jack, actLed);
    this.ports.push(port);
    return port;
  }

  // ---------- LED ----------
  addLED(parent, cls = "") {
    const led = document.createElement("div");
    led.className = "led " + cls;
    parent.appendChild(led);
    return {
      el: led,
      set: (v) => led.style.setProperty("--lit", Math.max(0, Math.min(1, v)).toFixed(3)),
    };
  }

  // ---------- SCREEN ----------
  addScreen(parent, w, h) {
    const sc = document.createElement("div");
    sc.className = "screen";
    sc.style.width = w + "px";
    sc.style.height = h + "px";
    const cv = document.createElement("canvas");
    cv.width = w * 2; cv.height = h * 2;            // retina
    sc.appendChild(cv);
    parent.appendChild(sc);
    const ctx = cv.getContext("2d");
    ctx.scale(2, 2);
    return { el: sc, canvas: cv, ctx, w, h };
  }

  // ---------- SELECT ----------
  // opts.persist === false  -> no se serializa (p. ej. selección de dispositivo,
  // cuyo deviceId no es portable entre sesiones/máquinas).
  addSelect(parent, options, onChange, selected, opts = {}) {
    const sel = document.createElement("select");
    sel.className = "sel";
    options.forEach((o) => {
      const op = document.createElement("option");
      op.value = typeof o === "object" ? o.value : o;
      op.textContent = typeof o === "object" ? o.label : o;
      sel.appendChild(op);
    });
    if (selected != null) sel.value = selected;
    sel.addEventListener("change", () => { onChange(sel.value); this._commit(); });
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    parent.appendChild(sel);
    if (opts.persist !== false) {
      this.controls.push({
        el: sel, kind: "select",
        get value() { return sel.value; },
        set: (x) => { sel.value = x; onChange(x); },   // restaura nodo + UI
      });
    }
    return sel;
  }

  // ---------- BUTTON ----------
  addButton(parent, label, onClick, opts = {}) {
    const b = document.createElement("button");
    b.className = "btn" + (opts.wide ? " wide" : "") + (opts.active ? " active" : "");
    b.textContent = label;
    let active = !!opts.active;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (opts.toggle) { active = !active; b.classList.toggle("active", active); }
      onClick(active, b);
    });
    parent.appendChild(b);
    return b;
  }

  // ---------- WAVE SWITCH (oscilador) ----------
  addWaveSwitch(parent, onChange, initial = "sine") {
    const icons = {
      sine: "M0 6 Q4 0 8 6 T16 6",
      square: "M0 10 V2 H8 V10 H16",
      sawtooth: "M0 10 L8 2 L8 10 L16 2",
      triangle: "M0 10 L4 2 L12 10 L16 2",
    };
    const sw = document.createElement("div");
    sw.className = "switch-wave";
    const btns = {};
    let cur = initial;
    const apply = (k, fire) => {
      cur = k;
      Object.values(btns).forEach((x) => x.classList.remove("active"));
      if (btns[k]) btns[k].classList.add("active");
      if (fire) onChange(k);
    };
    Object.keys(icons).forEach((k) => {
      const b = document.createElement("button");
      b.innerHTML = `<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${icons[k]}"/></svg>`;
      b.classList.toggle("active", k === initial);
      b.addEventListener("click", (e) => { e.stopPropagation(); apply(k, true); this._commit(); });
      btns[k] = b;
      sw.appendChild(b);
    });
    parent.appendChild(sw);
    this.controls.push({
      el: sw, kind: "wave",
      get value() { return cur; },
      set: (x) => apply(x, true),     // restaura tipo de onda + UI
    });
    return sw;
  }

  // ---------- FADER vertical (custom, handler centrado) ----------
  addFader(parent, def) {
    const { min = 0, max = 1, value = 0, onChange } = def;
    const wrap = document.createElement("div"); wrap.className = "fader";
    const track = document.createElement("div"); track.className = "fader__track";
    const fill = document.createElement("div"); fill.className = "fader__fill";
    const thumb = document.createElement("div"); thumb.className = "fader__thumb";
    track.appendChild(fill); track.appendChild(thumb); wrap.appendChild(track);
    parent.appendChild(wrap);

    let v = value;
    const render = () => {
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      thumb.style.bottom = (t * 100).toFixed(2) + "%";
      fill.style.height = (t * 100).toFixed(2) + "%";
    };
    const setFromY = (clientY) => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      v = min + t * (max - min);
      render(); onChange(v);
    };
    track.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      setFromY(e.clientY);
      const mv = (ev) => setFromY(ev.clientY);
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); this._commit(); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    });
    track.addEventListener("dblclick", (e) => { e.stopPropagation(); v = value; render(); onChange(v); this._commit(); });
    render();
    const api = {
      el: wrap, kind: "fader", min, max, default: value,
      get value() { return v; },
      // set ahora SÍ dispara onChange (antes solo movía el thumb): necesario
      // para que al cargar un patch el audio recupere su ganancia, no solo la UI.
      set: (x) => { v = Math.max(min, Math.min(max, x)); render(); onChange(v); },
      reset: () => { v = value; render(); onChange(v); this._commit(); },
      commit: () => this._commit(),
    };
    wrap.__control = api;
    this.controls.push(api);
    return api;
  }

  // ---------- animación por módulo (scopes, etc.) ----------
  raf(fn) {
    const loop = () => { fn(); this._anim = requestAnimationFrame(loop); };
    this._anim = requestAnimationFrame(loop);
  }

  // ---------- arrastre del módulo (individual o de grupo) ----------
  _makeDraggable(handle) {
    let sx = 0, sy = 0, dragging = false, moved = false, group = [];
    const move = (e) => {
      if (!dragging) return;
      const z = window.Viewport ? Viewport.zoom : 1;
      const dx = (e.clientX - sx) / z, dy = (e.clientY - sy) / z;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) moved = true;
      if (group.length > 1) {
        // grupo: traslación libre con snap (sin empuje magnético entre seleccionados)
        for (const g of group) {
          const ny = Math.max(0, g._oy + dy);
          g.el.style.left = Layout.snapX(g._ox + dx) + "px";
          g.el.style.top = Layout.snapRow(ny) + "px";
          g.__row = Layout.snapRow(ny);
        }
      } else {
        Layout.drag(this, group[0]._ox + dx, Math.max(0, group[0]._oy + dy));
      }
      if (window.Patch) Patch.redrawAll();   // los cables siguen a los módulos
    };
    const up = () => {
      dragging = false;
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      // clic simple (sin arrastre) sobre un miembro de un grupo => colapsa a ese módulo
      if (!moved && group.length > 1 && window.Rack) Rack.selectOne(this);
      this._commit();
    };
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;           // derecho: menú contextual del módulo
      if (e.shiftKey) return;               // shift: solo (de)selecciona, no arrastra
      if (e.target.closest(".module__close")) return;
      dragging = true; moved = false;
      // mover el grupo si este módulo ya está seleccionado; si no, solo este
      group = (window.Rack && Rack.isSelected(this) && Rack.selection.size > 1) ? Rack.selectionList() : [this];
      for (const g of group) { g._ox = parseFloat(g.el.style.left) || 0; g._oy = parseFloat(g.el.style.top) || 0; }
      sx = e.clientX; sy = e.clientY;
      Rack.bringToFront(this.el);
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
  }

  // ---------- serialización ----------
  /** Estado serializable: tipo, posición y valores de todos los controles. */
  serialize() {
    const data = {
      type: this._defId || null,
      x: parseFloat(this.el.style.left) || 0,
      y: parseFloat(this.el.style.top) || 0,
      params: this.controls.map((c) => c.value),
    };
    if (this.custom) data.title = this.title;
    // estado extra de subclases (buffers de archivo, etc.) — opcional
    const extra = this.serializeState ? this.serializeState() : null;
    if (extra && Object.keys(extra).length) data.state = extra;
    return data;
  }

  /** Restaura el estado producido por serialize(). */
  deserialize(data) {
    if (!data) return;
    if (data.title) this.setTitle(data.title);
    if (Array.isArray(data.params)) {
      data.params.forEach((v, i) => {
        const c = this.controls[i];
        if (c && v !== null && v !== undefined) { try { c.set(v); } catch (e) {} }
      });
    }
    if (data.state && this.deserializeState) { try { this.deserializeState(data.state); } catch (e) {} }
  }

  /** subclases sobreescriben para liberar nodos. */
  onDispose() {}

  dispose() {
    if (this._anim) cancelAnimationFrame(this._anim);
    this.ports.forEach((p) => Patch.unregister(p));
    this.onDispose();
    this.el.remove();
    Rack.remove(this);
    this._commit();   // registra el borrado en el historial (coalescido)
  }
}
