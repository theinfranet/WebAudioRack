/* ============================================================
   Sistema de patching (señal unificada estilo VCV Rack)
   - Port: jack de entrada o salida (audio o AudioParam, mismo cable)
   - PatchBay: registro de puertos, cables SVG, arrastre y medición
   ============================================================ */

let __portId = 0;

class Port {
  /**
   * @param {Module} module  módulo dueño
   * @param {"in"|"out"} dir  dirección
   * @param {AudioNode|AudioParam} node  destino/origen web audio
   * @param {object} opts { label, kind:"audio"|"cv", index }
   */
  constructor(module, dir, node, opts = {}) {
    this.id = ++__portId;
    this.module = module;
    this.dir = dir;
    this.node = node;            // AudioNode (out/in) o AudioParam (in)
    this.outputIndex = opts.index || 0;
    this.kind = opts.kind || "audio";
    this.label = opts.label || (dir === "out" ? "OUT" : "IN");
    this.connections = new Set(); // Cable[]
    this.el = null;              // .jack DOM
    this.actLed = null;          // LED de actividad (solo out)
    this.analyser = null;        // medición (solo out)
    this._buf = null;
  }

  isOutput() { return this.dir === "out"; }
  isParam() { return this.node instanceof AudioParam; }

  /** Crea (lazy) un analizador para medir nivel de la salida. */
  ensureAnalyser() {
    if (this.analyser || !this.isOutput()) return;
    const ctx = Engine.ctx;
    if (!ctx) return;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this._buf = new Float32Array(this.analyser.fftSize);
    try { this.node.connect(this.analyser, this.outputIndex); } catch (e) {}
  }

  /** Nivel pico 0..1 de la señal que sale por este puerto. */
  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._buf);
    let peak = 0;
    for (let i = 0; i < this._buf.length; i++) {
      const a = Math.abs(this._buf[i]);
      if (a > peak) peak = a;
    }
    return Math.min(1, peak);
  }
}

class Cable {
  constructor(out, inp, color) {
    this.out = out;            // Port (salida)
    this.in = inp;             // Port (entrada)
    this.color = color;
    this.path = null;
    this.glow = null;
    this.plugA = null;
    this.plugB = null;
  }
  /** Conecta de verdad en el grafo de audio. */
  wire() {
    try {
      this.out.node.connect(this.in.node, this.out.outputIndex);
    } catch (e) {
      // Param: la API ignora outputIndex en algunas implementaciones
      this.out.node.connect(this.in.node);
    }
  }
  unwire() {
    try { this.out.node.disconnect(this.in.node, this.out.outputIndex); }
    catch (e) { try { this.out.node.disconnect(this.in.node); } catch (_) {} }
  }
}

class PatchBay {
  constructor() {
    this.ports = new Map();
    this.cables = [];
    this.surface = null;
    this.svg = null;
    this.drag = null;       // { fromOut, tempPath }
    this.hoverPort = null;
    this.tension = 0.3;     // 0 = muy flojo (cuelga), 1 = tenso (recto)
    this.cableColor = null; // null = color automático por puerto
  }

  mount(surface, svg) {
    this.surface = surface;
    this.svg = svg;
    window.addEventListener("mousemove", (e) => this._onMove(e));
    window.addEventListener("mouseup", (e) => this._onUp(e));
    this._loop();
  }

  register(port, jackEl, actLed) {
    port.el = jackEl;
    port.actLed = actLed;
    jackEl.__port = port;
    this.ports.set(port.id, port);
    jackEl.addEventListener("mousedown", (e) => this._onDown(e, port));
  }

  unregister(port) {
    // quitar cables asociados
    [...port.connections].forEach((c) => this.removeCable(c));
    this.ports.delete(port.id);
  }

  // ---------- coordenadas ----------
  center(port) {
    const r = port.el.getBoundingClientRect();
    const s = this.surface.getBoundingClientRect();
    const z = window.Viewport ? Viewport.zoom : 1;   // coords locales (sin escalar)
    return {
      x: (r.left - s.left + r.width / 2) / z,
      y: (r.top - s.top + r.height / 2) / z,
    };
  }

  static path(x1, y1, x2, y2) {
    const t = window.Patch ? window.Patch.tension : 0.3;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    // catenaria aproximada: caída proporcional al largo, control points
    // insertados en horizontal para una curva de cable colgante natural.
    let sag = (8 + dist * 0.5) * (1 - t * 0.9);
    sag = Math.min(sag, 700);
    const c1x = x1 + dx * 0.18, c2x = x2 - dx * 0.18;
    const c1y = y1 + sag, c2y = y2 + sag;
    return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }

  // ---------- arrastre ----------
  _onDown(e, port) {
    e.preventDefault();
    e.stopPropagation();
    Engine.resume();

    // Si es una ENTRADA ya conectada -> re-enchufar (tomar el cable existente)
    if (port.dir === "in" && port.connections.size) {
      const cable = [...port.connections][0];
      const fromOut = cable.out;
      this.removeCable(cable);
      this._startDrag(fromOut, e);
      return;
    }
    // Empezar desde salida (o desde entrada vacía: arrastras hacia una salida)
    this._startDrag(port, e);
  }

  _startDrag(fromPort, e) {
    const ns = "http://www.w3.org/2000/svg";
    const temp = document.createElementNS(ns, "path");
    temp.setAttribute("class", "cable");
    temp.setAttribute("stroke", fromPort.dir === "out" ? this._color(fromPort) : "var(--metal)");
    this.svg.appendChild(temp);
    this.drag = { from: fromPort, tempPath: temp };
    this._onMove(e);
  }

  _color(port) {
    const palette = ["#36d39a", "#ff7a3d", "#ffd23d", "#c46bff", "#ff5e8a", "#d9dde4"];
    return palette[port.id % palette.length];
  }

  _onMove(e) {
    if (!this.drag) return;
    const a = this.center(this.drag.from);
    const s = this.surface.getBoundingClientRect();
    const z = window.Viewport ? Viewport.zoom : 1;
    const mx = (e.clientX - s.left) / z, my = (e.clientY - s.top) / z;

    // resaltar puerto objetivo
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const jack = el && el.closest(".jack");
    if (this.hoverPort && this.hoverPort.el !== jack) {
      this.hoverPort.el.classList.remove("target-ok", "target-bad");
      this.hoverPort = null;
    }
    let tx = mx, ty = my;
    if (jack && jack.__port && jack.__port !== this.drag.from) {
      const tp = jack.__port;
      const ok = this._compatible(this.drag.from, tp);
      tp.el.classList.add(ok ? "target-ok" : "target-bad");
      this.hoverPort = tp;
      if (ok) { const c = this.center(tp); tx = c.x; ty = c.y; }
    }
    const d = this.drag.from.dir === "out"
      ? PatchBay.path(a.x, a.y, tx, ty)
      : PatchBay.path(tx, ty, a.x, a.y);
    this.drag.tempPath.setAttribute("d", d);
  }

  _onUp(e) {
    if (!this.drag) return;
    const from = this.drag.from;
    this.drag.tempPath.remove();
    if (this.hoverPort && this._compatible(from, this.hoverPort)) {
      const out = from.dir === "out" ? from : this.hoverPort;
      const inp = from.dir === "in" ? from : this.hoverPort;
      this.connect(out, inp);
    }
    if (this.hoverPort) this.hoverPort.el.classList.remove("target-ok", "target-bad");
    this.hoverPort = null;
    this.drag = null;
  }

  _compatible(a, b) {
    if (!b || a === b) return false;
    if (a.dir === b.dir) return false;          // out<->in obligatorio
    if (a.module === b.module) return false;     // no auto-conexión simple
    return true; // señal unificada: cualquier out a cualquier in
  }

  // ---------- conexiones ----------
  connect(out, inp) {
    // una entrada solo admite un cable
    if (inp.connections.size) this.removeCable([...inp.connections][0]);
    const cable = new Cable(out, inp, this.cableColor || this._color(out));
    cable.wire();
    out.ensureAnalyser();
    out.connections.add(cable);
    inp.connections.add(cable);
    this.cables.push(cable);
    this._draw(cable);
    this._updateCable(cable);
    out.el.classList.add("connected");
    inp.el.classList.add("connected");
    return cable;
  }

  removeCable(cable) {
    cable.unwire();
    cable.out.connections.delete(cable);
    cable.in.connections.delete(cable);
    if (cable.path) cable.path.remove();
    if (cable.glow) cable.glow.remove();
    if (cable.plugA) cable.plugA.remove();
    if (cable.plugB) cable.plugB.remove();
    this.cables = this.cables.filter((c) => c !== cable);
    if (!cable.out.connections.size) cable.out.el.classList.remove("connected");
    if (!cable.in.connections.size) cable.in.el.classList.remove("connected");
  }

  _draw(cable) {
    const ns = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(ns, "path");
    path.setAttribute("class", "cable");
    path.setAttribute("stroke", cable.color);
    path.addEventListener("mouseenter", () => path.classList.add("hover"));
    path.addEventListener("mouseleave", () => path.classList.remove("hover"));
    path.addEventListener("click", (e) => { e.stopPropagation(); this.removeCable(cable); });
    this.svg.appendChild(path);
    cable.path = path;
    cable.glow = null;
    // conectores: un círculo del color del cable en cada extremo
    const mkPlug = () => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("class", "cable-plug");
      c.setAttribute("r", "5");
      c.setAttribute("fill", cable.color);
      this.svg.appendChild(c);
      return c;
    };
    cable.plugA = mkPlug();
    cable.plugB = mkPlug();
  }

  /** Color de los cables NUEVOS (null = automático por puerto). */
  setNewColor(color) { this.cableColor = color || null; }

  /** Recolorea TODOS los cables existentes (null = volver a automático). */
  recolorAll(color) {
    for (const c of this.cables) {
      const col = color || this._color(c.out);
      c.color = col;
      c.path.setAttribute("stroke", col);
      if (c.plugA) c.plugA.setAttribute("fill", col);
      if (c.plugB) c.plugB.setAttribute("fill", col);
    }
  }

  // ---------- geometría de cables (solo bajo demanda) ----------
  _updateCable(c) {
    const a = this.center(c.out), b = this.center(c.in);
    c.path.setAttribute("d", PatchBay.path(a.x, a.y, b.x, b.y));
    if (c.plugA) { c.plugA.setAttribute("cx", a.x); c.plugA.setAttribute("cy", a.y); }
    if (c.plugB) { c.plugB.setAttribute("cx", b.x); c.plugB.setAttribute("cy", b.y); }
  }
  /** Redibuja todos los cables. Llamar solo cuando algún módulo se mueve. */
  redrawAll() { for (const c of this.cables) this._updateCable(c); }

  // ---------- bucle ligero: solo actividad de LEDs de salida ----------
  // (los cables NO se redibujan por frame: al hacer pan/zoom se mueven con
  //  el transform de la superficie; solo se redibujan al mover un módulo)
  _loop() {
    const tick = () => {
      for (const port of this.ports.values()) {
        if (!port.isOutput() || !port.actLed) continue;
        const lvl = port.analyser ? port.level() : 0;
        const lit = lvl > 0.003 ? Math.min(1, 0.15 + lvl * 1.6) : 0;
        port.actLed.style.setProperty("--lit", lit.toFixed(3));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

window.Patch = new PatchBay();
