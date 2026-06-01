/* ============================================================
   MÓDULOS — Utilidad / reloj / cuantizador (Tier 4)
   Multiple (1→4), Clock (BPM + divisiones), Quantizer (escala).
   ============================================================ */

/* ---------------- escalas + cuantización (función pura, testeable) ---------------- */
const SCALES = {
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Cuantiza un valor en CENTS al grado de escala más cercano.
 *  scaleArr: semitonos de la escala (0-11); root: tónica (0-11). Devuelve cents. */
function quantizeCents(cents, scaleArr, root) {
  const semi = cents / 100;
  const near = Math.round(semi);
  const allowed = scaleArr.map((s) => (root + s) % 12);
  let best = near, bestD = Infinity;
  for (let cand = near - 12; cand <= near + 12; cand++) {
    const pc = ((cand % 12) + 12) % 12;
    if (allowed.indexOf(pc) !== -1) {
      const d = Math.abs(cand - semi);
      if (d < bestD) { bestD = d; best = cand; }
    }
  }
  return best * 100;
}

/* ---------------- MULTIPLE (1 → 4) ---------------- */
class Multiple extends Module {
  constructor(def) {
    super({ title: "MULTIPLE", width: 116, ...def });
    const ctx = Engine.ctx;
    this.thru = ctx.createGain();        // passthrough: una entrada, varias salidas
    this.thru.gain.value = 1;
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.thru, { label: "IN" });
    const outs = document.createElement("div"); outs.className = "row"; p.appendChild(outs);
    for (let i = 0; i < 4; i++) this.addPort(outs, "out", this.thru, { label: "" + (i + 1) });
  }
}
registerModule({ id: "mult", name: "Multiple 1→4", cat: "Mezcla", desc: "Divide una señal en 4 salidas", make: (d) => new Multiple(d) });

/* ---------------- CLOCK (BPM + divisiones) ---------------- */
class Clock extends Module {
  constructor(def) {
    super({ title: "CLOCK", width: 168, ...def });
    const ctx = Engine.ctx;
    this.bpm = 120; this._on = false; this._t = 0; this._count = 0; this._lit = 0;
    const mk = () => { const cs = ctx.createConstantSource(); cs.offset.value = 0; cs.start(); return cs; };
    this.o1 = mk(); this.o2 = mk(); this.o4 = mk(); this.o8 = mk();

    this.addKnob(this.row(), { label: "BPM", min: 20, max: 300, value: 120, onChange: (v) => (this.bpm = Math.round(v)) });
    const ctr = this.row();
    this.led = this.addLED(ctr, "amber");
    this.addButton(ctr, "RUN", (on) => { this._on = on; this._count = 0; this._t = Engine.now; }, { toggle: true });

    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.o1, { label: "PULSE", kind: "cv" });
    this.addPort(p, "out", this.o2, { label: "/2", kind: "cv" });
    this.addPort(p, "out", this.o4, { label: "/4", kind: "cv" });
    this.addPort(p, "out", this.o8, { label: "/8", kind: "cv" });

    this.raf(() => this._tick());
  }
  _pulse(cs, spb) {
    const t = Engine.now;
    cs.offset.cancelScheduledValues(t);
    cs.offset.setValueAtTime(1, t);
    cs.offset.setValueAtTime(0, t + spb * 0.5);
  }
  _tick() {
    const spb = 60 / this.bpm;
    if (this._on) {
      const now = Engine.now;
      let guard = 0;
      while (now - this._t >= spb && guard++ < 8) {
        this._t += spb; this._count++;
        this._pulse(this.o1, spb);
        if (this._count % 2 === 0) this._pulse(this.o2, spb);
        if (this._count % 4 === 0) this._pulse(this.o4, spb);
        if (this._count % 8 === 0) this._pulse(this.o8, spb);
        this._lit = 1;
      }
    }
    this._lit = Math.max(0, this._lit - 0.08);
    this.led.set(this._lit);
  }
  onDispose() { try { this.o1.stop(); this.o2.stop(); this.o4.stop(); this.o8.stop(); } catch (e) {} }
}
registerModule({ id: "clock", name: "Clock", cat: "Fuentes", desc: "Reloj BPM · pulse + /2 /4 /8", make: (d) => new Clock(d) });

/* ---------------- QUANTIZER (cuantiza CV de pitch a una escala) ---------------- */
class Quantizer extends Module {
  constructor(def) {
    super({ title: "QUANTIZER", width: 162, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.an = ctx.createAnalyser(); this.an.fftSize = 256;
    this.in.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.out = ctx.createConstantSource(); this.out.offset.value = 0; this.out.start();
    this.scale = "major"; this.root = 0;

    this.addSelect(this.row(), [
      { value: "chromatic", label: "Cromática" }, { value: "major", label: "Mayor" },
      { value: "minor", label: "Menor" }, { value: "pentatonic", label: "Pentatónica" },
      { value: "dorian", label: "Dórica" }, { value: "phrygian", label: "Frigia" },
    ], (v) => (this.scale = v), "major");
    this.addSelect(this.row(), NOTE_NAMES.map((n, i) => ({ value: String(i), label: n })), (v) => (this.root = parseInt(v, 10)), "0");

    this.sc = this.addScreen(this.row(), 142, 26);
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN", kind: "cv" });
    this.addPort(p, "out", this.out, { label: "OUT", kind: "cv" });

    this.raf(() => this._tick());
  }
  _tick() {
    this.an.getFloatTimeDomainData(this.buf);
    const v = this.buf[this.buf.length - 1] || 0;            // CV actual (cents)
    const q = quantizeCents(v, SCALES[this.scale] || SCALES.chromatic, this.root);
    this.out.offset.setTargetAtTime(q, Engine.now, 0.008);
    const semi = Math.round(q / 100);
    this._draw(NOTE_NAMES[((semi % 12) + 12) % 12], semi);
  }
  _draw(name, semi) {
    const { ctx, w, h } = this.sc;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#040404"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#36d39a"; ctx.font = "13px monospace";
    ctx.fillText(name + "   " + (semi >= 0 ? "+" : "") + semi + " st", 8, 18);
  }
  onDispose() { try { this.out.stop(); } catch (e) {} }
}
registerModule({ id: "quant", name: "Quantizer", cat: "Procesa", desc: "Cuantiza CV a una escala", make: (d) => new Quantizer(d) });

/* ---------------- VECTORSCOPE (goniómetro XY: L vs R) ---------------- */
class Vectorscope extends Module {
  constructor(def) {
    super({ title: "VECTORSCOPE", width: 172, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();               // passthrough (THRU)
    this.split = ctx.createChannelSplitter(2);
    this.anL = ctx.createAnalyser(); this.anR = ctx.createAnalyser();
    this.anL.fftSize = 1024; this.anR.fftSize = 1024;
    this.in.connect(this.split);
    this.split.connect(this.anL, 0);
    this.split.connect(this.anR, 1);
    this.bufL = new Float32Array(this.anL.fftSize);
    this.bufR = new Float32Array(this.anR.fftSize);

    this.sc = this.addScreen(this.row(), 156, 120);
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.in, { label: "THRU" });

    this.raf(() => this.draw());
  }
  draw() {
    const { ctx, w, h } = this.sc;
    this.anL.getFloatTimeDomainData(this.bufL);
    this.anR.getFloatTimeDomainData(this.bufR);
    // fosforo: en vez de borrar, oscurecemos para dejar estela
    ctx.fillStyle = "rgba(6,10,8,.30)";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, s = (Math.min(w, h) / 2 - 4) * 0.7;
    ctx.fillStyle = "#36d39a";
    for (let i = 0; i < this.bufL.length; i += 2) {
      const L = this.bufL[i], R = this.bufR[i];
      // goniómetro clásico: rotado 45° -> x = L-R, y = L+R
      const x = cx + (L - R) * s;
      const y = cy - (L + R) * s;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
registerModule({ id: "vscope", name: "Vectorscope", cat: "Salida", desc: "Goniómetro XY (L vs R)", make: (d) => new Vectorscope(d) });

// expuesto para tests (lógica pura)
window.WAR = window.WAR || {};
window.WAR.quantizeCents = quantizeCents;
window.WAR.SCALES = SCALES;
