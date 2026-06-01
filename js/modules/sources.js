/* ============================================================
   MÓDULOS — Fuentes de señal
   VCO, LFO, Noise, CV/Offset, ADSR, Sequencer, Sampler, Mic
   ============================================================ */

/* ---------------- VCO (OscillatorNode) ---------------- */
class VCO extends Module {
  constructor(def) {
    super({ title: "VCO · OSC", width: 154, ...def });
    const ctx = Engine.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 200;
    this.level = ctx.createGain();
    this.level.gain.value = 0.5;
    this.osc.connect(this.level);
    this.osc.start();

    this.addWaveSwitch(this.row(), (t) => (this.osc.type = t), "sine");
    const k = this.row();
    this.addKnob(k, { label: "FREQ", min: 16, max: 12000, value: 200, unit: "Hz", mapping: "exp", onChange: (v) => (this.osc.frequency.value = v) });
    this.addKnob(k, { label: "FINE", min: -100, max: 100, value: 0, unit: "c", bipolar: true, onChange: (v) => (this.osc.detune.value = v) });
    this.addKnob(this.row(), { label: "LEVEL", min: 0, max: 1, value: 0.5, onChange: (v) => (this.level.gain.value = v) });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.osc.frequency, { label: "FM", kind: "cv" });
    this.addPort(p, "in", this.osc.detune, { label: "1V/OCT", kind: "cv" });
    this.addPort(p, "out", this.level, { label: "OUT" });
  }
  onDispose() { try { this.osc.stop(); } catch (e) {} }
}
registerModule({ id: "vco", name: "VCO Oscillator", cat: "Fuentes", desc: "Oscilador · 4 ondas + FM", make: (d) => new VCO(d) });

/* ---------------- LFO ---------------- */
class LFO extends Module {
  constructor(def) {
    super({ title: "LFO", width: 150, ...def });
    const ctx = Engine.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 2;
    this.depth = ctx.createGain();
    this.depth.gain.value = 1;
    this.osc.connect(this.depth);
    this.osc.start();

    this.addWaveSwitch(this.row(), (t) => (this.osc.type = t), "sine");
    const k = this.row();
    this.addKnob(k, { label: "RATE", min: 0.02, max: 40, value: 2, unit: "Hz", mapping: "exp", onChange: (v) => (this.osc.frequency.value = v) });
    this.addKnob(k, { label: "DEPTH", min: 0, max: 1, value: 1, onChange: (v) => (this.depth.gain.value = v) });
    this.actLed = this.addLED(this.row(), "amber");

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.osc.frequency, { label: "RATE", kind: "cv" });
    this.addPort(p, "out", this.depth, { label: "OUT", kind: "cv" });

    const buf = new Float32Array(this.osc ? 1 : 1);
    this.raf(() => {
      // parpadeo del LED al ritmo del LFO (estimación por reloj)
      const t = (Math.sin(Engine.now * this.osc.frequency.value * Math.PI * 2) * 0.5 + 0.5) * this.depth.gain.value;
      this.actLed.set(t);
    });
  }
  onDispose() { try { this.osc.stop(); } catch (e) {} }
}
registerModule({ id: "lfo", name: "LFO", cat: "Fuentes", desc: "Oscilador de baja frecuencia", make: (d) => new LFO(d) });

/* ---------------- NOISE (AudioBufferSource) ---------------- */
class Noise extends Module {
  constructor(def) {
    super({ title: "NOISE", width: 140, ...def });
    const ctx = Engine.ctx;
    this.src = ctx.createBufferSource();
    this.src.buffer = Engine.whiteNoiseBuffer(2);
    this.src.loop = true;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 12000;
    this.level = ctx.createGain();
    this.level.gain.value = 0.4;
    this.src.connect(this.tone).connect(this.level);
    this.src.start();

    const k = this.row();
    this.addKnob(k, { label: "TONE", min: 200, max: 18000, value: 12000, unit: "Hz", mapping: "exp", onChange: (v) => (this.tone.frequency.value = v) });
    this.addKnob(k, { label: "LEVEL", min: 0, max: 1, value: 0.4, onChange: (v) => (this.level.gain.value = v) });
    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.level, { label: "OUT" });
  }
  onDispose() { try { this.src.stop(); } catch (e) {} }
}
registerModule({ id: "noise", name: "Noise", cat: "Fuentes", desc: "Ruido blanco filtrable", make: (d) => new Noise(d) });

/* ---------------- CV / OFFSET (ConstantSourceNode) ---------------- */
class CVSource extends Module {
  constructor(def) {
    super({ title: "CV · OFFSET", width: 130, ...def });
    const ctx = Engine.ctx;
    this.cs = ctx.createConstantSource();
    this.cs.offset.value = 0;
    this.cs.start();
    this.addKnob(this.row(), { label: "OFFSET", min: -5, max: 5, value: 0, bipolar: true, onChange: (v) => (this.cs.offset.value = v) });
    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.cs, { label: "OUT", kind: "cv" });
  }
  onDispose() { try { this.cs.stop(); } catch (e) {} }
}
registerModule({ id: "cv", name: "CV / Offset", cat: "Fuentes", desc: "Voltaje constante manual", make: (d) => new CVSource(d) });

/* ---------------- ADSR (envolvente con automatización) ---------------- */
class ADSR extends Module {
  constructor(def) {
    super({ title: "ADSR ENV", width: 150, ...def });
    const ctx = Engine.ctx;
    this.cs = ctx.createConstantSource();   // nivel base
    this.cs.offset.value = 1;
    this.env = ctx.createGain();            // ganancia automatizada = envolvente
    this.env.gain.value = 0;
    this.cs.connect(this.env);
    this.cs.start();

    this.a = 0.01; this.d = 0.2; this.s = 0.6; this.r = 0.4;
    const k = this.row();
    this.addKnob(k, { label: "A", min: 0.001, max: 4, value: 0.01, unit: "s", mapping: "exp", onChange: (v) => (this.a = v) });
    this.addKnob(k, { label: "D", min: 0.001, max: 4, value: 0.2, unit: "s", mapping: "exp", onChange: (v) => (this.d = v) });
    const k2 = this.row();
    this.addKnob(k2, { label: "S", min: 0, max: 1, value: 0.6, onChange: (v) => (this.s = v) });
    this.addKnob(k2, { label: "R", min: 0.001, max: 6, value: 0.4, unit: "s", mapping: "exp", onChange: (v) => (this.r = v) });

    const ctr = this.row();
    const gate = this.addButton(ctr, "GATE", () => {}, {});
    gate.addEventListener("mousedown", () => this.trigger());
    gate.addEventListener("mouseup", () => this.release());
    gate.addEventListener("mouseleave", () => this.release());
    let autoOn = false, timer = null;
    this.addButton(ctr, "AUTO", (on) => {
      autoOn = on;
      if (on) { const loop = () => { this.trigger(); setTimeout(() => this.release(), 120); timer = setTimeout(loop, 500); }; loop(); }
      else clearTimeout(timer);
    }, { toggle: true });

    this.led = this.addLED(this.row(), "amber");
    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.env, { label: "ENV", kind: "cv" });

    this.raf(() => { /* el LED sigue el nivel del env */
      // estimación visual del gate
    });
  }
  trigger() {
    const g = this.env.gain, t = Engine.now;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(1, t + this.a);
    g.linearRampToValueAtTime(this.s, t + this.a + this.d);
    this.led.set(1);
  }
  release() {
    const g = this.env.gain, t = Engine.now;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + this.r);
    this.led.set(0.1);
  }
  onDispose() { try { this.cs.stop(); } catch (e) {} }
}
registerModule({ id: "adsr", name: "ADSR Envelope", cat: "Fuentes", desc: "Envolvente A/D/S/R", make: (d) => new ADSR(d) });

/* ---------------- SEQUENCER (8 pasos, CV + gate) ---------------- */
class Sequencer extends Module {
  constructor(def) {
    super({ title: "SEQ · 8", width: 230, ...def });
    const ctx = Engine.ctx;
    this.cv = ctx.createConstantSource(); this.cv.offset.value = 0; this.cv.start();
    this.gate = ctx.createConstantSource(); this.gate.offset.value = 0; this.gate.start();
    this.steps = [0, 3, 5, 7, 12, 7, 5, 3]; // semitonos
    this.bpm = 120; this.idx = 0; this._t = 0; this._on = false;

    this.addKnob(this.row(), { label: "BPM", min: 30, max: 300, value: 120, onChange: (v) => (this.bpm = v) });
    const grid = this.row(); grid.style.gap = "4px";
    this.leds = [];
    this.steps.forEach((val, i) => {
      const col = document.createElement("div"); col.className = "col"; col.style.alignItems = "center"; col.style.gap = "4px";
      this.addKnob(col, { label: "" + (i + 1), min: -24, max: 24, value: val, bipolar: true, onChange: (v) => (this.steps[i] = Math.round(v)) });
      const led = this.addLED(col, ""); this.leds.push(led);
      grid.appendChild(col);
    });
    const ctr = this.row();
    this.addButton(ctr, "RUN", (on) => { this._on = on; this.idx = 0; this._t = Engine.now; }, { toggle: true });

    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.cv, { label: "CV", kind: "cv" });
    this.addPort(p, "out", this.gate, { label: "GATE", kind: "cv" });

    this.raf(() => {
      if (!this._on) return;
      const spb = 60 / this.bpm;
      if (Engine.now - this._t >= spb) {
        this._t += spb;
        this.idx = (this.idx + 1) % this.steps.length;
        const semis = this.steps[this.idx];
        this.cv.offset.setTargetAtTime(semis * 100, Engine.now, 0.005); // cents -> a detune
        this.gate.offset.setValueAtTime(1, Engine.now);
        this.gate.offset.setValueAtTime(0, Engine.now + spb * 0.5);
        this.leds.forEach((l, i) => l.set(i === this.idx ? 1 : 0));
      }
    });
  }
  onDispose() { try { this.cv.stop(); this.gate.stop(); } catch (e) {} }
}
registerModule({ id: "seq", name: "Sequencer 8", cat: "Fuentes", desc: "Secuenciador CV/Gate", make: (d) => new Sequencer(d) });

/* ---------------- SAMPLER (AudioBufferSource desde archivo) ---------------- */
class Sampler extends Module {
  constructor(def) {
    super({ title: "SAMPLER", width: 160, ...def });
    const ctx = Engine.ctx;
    this.buffer = null;
    this.rate = 1; this.loop = false;
    this.level = ctx.createGain(); this.level.gain.value = 0.8;

    const fileBtn = this.addButton(this.row(), "CARGAR…", () => input.click(), { wide: true });
    const input = document.createElement("input");
    input.type = "file"; input.accept = "audio/*"; input.style.display = "none";
    input.addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const ab = await f.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(ab);
      fileBtn.textContent = f.name.slice(0, 14);
    });
    this.el.appendChild(input);

    const k = this.row();
    this.addKnob(k, { label: "RATE", min: 0.25, max: 4, value: 1, mapping: "exp", onChange: (v) => (this.rate = v) });
    this.addKnob(k, { label: "LEVEL", min: 0, max: 1, value: 0.8, onChange: (v) => (this.level.gain.value = v) });
    const ctr = this.row();
    this.addButton(ctr, "PLAY", () => this.play());
    this.addButton(ctr, "LOOP", (on) => (this.loop = on), { toggle: true });

    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.level, { label: "OUT" });
  }
  play() {
    if (!this.buffer) return;
    const ctx = Engine.ctx;
    if (this.node) { try { this.node.stop(); } catch (e) {} }
    this.node = ctx.createBufferSource();
    this.node.buffer = this.buffer;
    this.node.loop = this.loop;
    this.node.playbackRate.value = this.rate;
    this.node.connect(this.level);
    this.node.start();
  }
  onDispose() { try { this.node && this.node.stop(); } catch (e) {} }
}
registerModule({ id: "sampler", name: "Sampler", cat: "Fuentes", desc: "Reproductor de muestras", make: (d) => new Sampler(d) });

/* (Audio In / Audio Out se fusionaron en el módulo DEVICE — ver advanced.js) */
