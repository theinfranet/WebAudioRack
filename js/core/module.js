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
    this.body = el.querySelector(".module__body");
    this._makeDraggable(el.querySelector(".module__header"));
    // clic en el módulo => seleccionar (se borra con Delete/Backspace)
    el.addEventListener("mousedown", () => { if (window.Rack) Rack.select(this); });
  }

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
      mapping = "lin", bipolar = false, format, onChange,
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
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    dial.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      startY = e.clientY; startT = toNorm(v);
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
    dial.addEventListener("dblclick", (e) => { e.stopPropagation(); set(value); });
    // (sin rueda: el scroll/trackpad mueve el lienzo, no la perilla)

    render();
    if (onChange) onChange(v);
    const api = { el: wrap, get value() { return v; }, set: (x) => set(x) };
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
  addSelect(parent, options, onChange, selected) {
    const sel = document.createElement("select");
    sel.className = "sel";
    options.forEach((o) => {
      const op = document.createElement("option");
      op.value = typeof o === "object" ? o.value : o;
      op.textContent = typeof o === "object" ? o.label : o;
      sel.appendChild(op);
    });
    if (selected != null) sel.value = selected;
    sel.addEventListener("change", () => onChange(sel.value));
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    parent.appendChild(sel);
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
    Object.keys(icons).forEach((k) => {
      const b = document.createElement("button");
      b.innerHTML = `<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${icons[k]}"/></svg>`;
      b.classList.toggle("active", k === initial);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        Object.values(btns).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        onChange(k);
      });
      btns[k] = b;
      sw.appendChild(b);
    });
    parent.appendChild(sw);
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
      e.preventDefault(); e.stopPropagation();
      setFromY(e.clientY);
      const mv = (ev) => setFromY(ev.clientY);
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    });
    track.addEventListener("dblclick", (e) => { e.stopPropagation(); v = value; render(); onChange(v); });
    render();
    const api = { el: wrap, get value() { return v; }, set: (x) => { v = x; render(); } };
    this.controls.push(api);
    return api;
  }

  // ---------- animación por módulo (scopes, etc.) ----------
  raf(fn) {
    const loop = () => { fn(); this._anim = requestAnimationFrame(loop); };
    this._anim = requestAnimationFrame(loop);
  }

  // ---------- arrastre del módulo ----------
  _makeDraggable(handle) {
    let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;
    const move = (e) => {
      if (!dragging) return;
      const z = window.Viewport ? Viewport.zoom : 1;
      Layout.drag(this, ox + (e.clientX - sx) / z, Math.max(0, oy + (e.clientY - sy) / z));
      if (window.Patch) Patch.redrawAll();   // los cables siguen al módulo
    };
    const up = () => { dragging = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".module__close")) return;
      dragging = true;
      ox = parseFloat(this.el.style.left); oy = parseFloat(this.el.style.top);
      sx = e.clientX; sy = e.clientY;
      Rack.bringToFront(this.el);
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
  }

  /** subclases sobreescriben para liberar nodos. */
  onDispose() {}

  dispose() {
    if (this._anim) cancelAnimationFrame(this._anim);
    this.ports.forEach((p) => Patch.unregister(p));
    this.onDispose();
    this.el.remove();
    Rack.remove(this);
  }
}
