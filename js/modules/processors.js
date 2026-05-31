/* ============================================================
   MÓDULOS — Procesadores / efectos
   VCA, VCF (Biquad), IIR, Delay, Reverb, Compressor,
   WaveShaper, StereoPanner, Panner3D, Split, Merge
   ============================================================ */

/* ---------------- VCA (GainNode) ---------------- */
class VCA extends Module {
  constructor(def) {
    super({ title: "VCA · GAIN", width: 140, ...def });
    const ctx = Engine.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.7;
    this.addKnob(this.row(), { label: "GAIN", min: 0, max: 1.5, value: 0.7, onChange: (v) => (this.gain.gain.value = v) });
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.gain, { label: "IN" });
    this.addPort(p, "in", this.gain.gain, { label: "CV", kind: "cv" });
    this.addPort(p, "out", this.gain, { label: "OUT" });
  }
}
registerModule({ id: "vca", name: "VCA / Gain", cat: "Procesa", desc: "Amplificador controlado", make: (d) => new VCA(d) });

/* ---------------- VCF (BiquadFilterNode) ---------------- */
class VCF extends Module {
  constructor(def) {
    super({ title: "VCF · FILTER", width: 154, ...def });
    const ctx = Engine.ctx;
    this.f = ctx.createBiquadFilter();
    this.f.type = "lowpass";
    this.f.frequency.value = 1200;
    this.f.Q.value = 6;

    this.addSelect(this.row(), [
      "lowpass", "highpass", "bandpass", "notch",
      "lowshelf", "highshelf", "peaking", "allpass",
    ], (v) => (this.f.type = v), "lowpass");
    const k = this.row();
    this.addKnob(k, { label: "CUTOFF", min: 20, max: 18000, value: 1200, unit: "Hz", mapping: "exp", onChange: (v) => (this.f.frequency.value = v) });
    this.addKnob(k, { label: "RESO", min: 0.1, max: 24, value: 6, mapping: "exp", onChange: (v) => (this.f.Q.value = v) });
    this.addKnob(this.row(), { label: "GAIN", min: -24, max: 24, value: 0, unit: "dB", bipolar: true, onChange: (v) => (this.f.gain.value = v) });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.f, { label: "IN" });
    this.addPort(p, "in", this.f.frequency, { label: "CUT CV", kind: "cv" });
    this.addPort(p, "out", this.f, { label: "OUT" });
  }
}
registerModule({ id: "vcf", name: "VCF Filter", cat: "Procesa", desc: "Filtro Biquad (8 tipos)", make: (d) => new VCF(d) });

/* ---------------- IIR (IIRFilterNode) ---------------- */
class IIR extends Module {
  constructor(def) {
    super({ title: "IIR FILTER", width: 150, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.out = ctx.createGain();
    this._build("lp");
    this.addSelect(this.row(), [
      { value: "lp", label: "1-pole LP" },
      { value: "hp", label: "1-pole HP" },
    ], (v) => this._build(v), "lp");
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.out, { label: "OUT" });
  }
  _build(type) {
    const ctx = Engine.ctx;
    if (this.iir) { try { this.in.disconnect(); this.iir.disconnect(); } catch (e) {} }
    // coeficientes de un filtro de 1 polo
    const ff = type === "lp" ? [0.05, 0] : [0.95, -0.95];
    const fb = type === "lp" ? [1, -0.95] : [1, -0.95];
    this.iir = ctx.createIIRFilter(ff, fb);
    this.in.connect(this.iir).connect(this.out);
  }
}
registerModule({ id: "iir", name: "IIR Filter", cat: "Procesa", desc: "Filtro de coeficientes", make: (d) => new IIR(d) });

/* ---------------- DELAY (DelayNode) ---------------- */
class Delay extends Module {
  constructor(def) {
    super({ title: "DELAY", width: 154, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.delay = ctx.createDelay(5);
    this.delay.delayTime.value = 0.3;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.35;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
    this.dry = ctx.createGain(); this.dry.gain.value = 1;
    this.out = ctx.createGain();

    this.in.connect(this.dry).connect(this.out);
    this.in.connect(this.delay);
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(this.wet).connect(this.out);

    const k = this.row();
    this.addKnob(k, { label: "TIME", min: 0.001, max: 2, value: 0.3, unit: "s", mapping: "exp", onChange: (v) => (this.delay.delayTime.value = v) });
    this.addKnob(k, { label: "FBK", min: 0, max: 0.95, value: 0.35, onChange: (v) => (this.fb.gain.value = v) });
    this.addKnob(this.row(), { label: "MIX", min: 0, max: 1, value: 0.5, onChange: (v) => { this.wet.gain.value = v; this.dry.gain.value = 1 - v * 0.6; } });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "in", this.delay.delayTime, { label: "T CV", kind: "cv" });
    this.addPort(p, "out", this.out, { label: "OUT" });
  }
}
registerModule({ id: "delay", name: "Delay", cat: "Procesa", desc: "Retardo con feedback", make: (d) => new Delay(d) });

/* ---------------- REVERB (ConvolverNode) ---------------- */
class Reverb extends Module {
  constructor(def) {
    super({ title: "REVERB", width: 150, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.wet = ctx.createGain(); this.wet.gain.value = 0.4;
    this.dry = ctx.createGain(); this.dry.gain.value = 1;
    this.out = ctx.createGain();
    this._size = 2.4;
    this.conv.buffer = Engine.impulseResponse(this._size, 2.2);

    this.in.connect(this.dry).connect(this.out);
    this.in.connect(this.conv).connect(this.wet).connect(this.out);

    this.addSelect(this.row(), [
      { value: "1.0", label: "Room" },
      { value: "2.4", label: "Hall" },
      { value: "5.0", label: "Cathedral" },
    ], (v) => { this._size = parseFloat(v); this.conv.buffer = Engine.impulseResponse(this._size, 2.2); }, "2.4");
    this.addKnob(this.row(), { label: "MIX", min: 0, max: 1, value: 0.4, onChange: (v) => { this.wet.gain.value = v; this.dry.gain.value = 1 - v * 0.5; } });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.out, { label: "OUT" });
  }
}
registerModule({ id: "reverb", name: "Reverb", cat: "Procesa", desc: "Convolución (IR sintética)", make: (d) => new Reverb(d) });

/* ---------------- COMPRESSOR (DynamicsCompressorNode) ---------------- */
class Comp extends Module {
  constructor(def) {
    super({ title: "COMPRESSOR", width: 158, ...def });
    const ctx = Engine.ctx;
    this.c = ctx.createDynamicsCompressor();
    const k = this.row();
    this.addKnob(k, { label: "THRESH", min: -60, max: 0, value: -24, unit: "dB", onChange: (v) => (this.c.threshold.value = v) });
    this.addKnob(k, { label: "RATIO", min: 1, max: 20, value: 4, onChange: (v) => (this.c.ratio.value = v) });
    const k2 = this.row();
    this.addKnob(k2, { label: "ATK", min: 0, max: 1, value: 0.003, unit: "s", onChange: (v) => (this.c.attack.value = v) });
    this.addKnob(k2, { label: "REL", min: 0, max: 1, value: 0.25, unit: "s", onChange: (v) => (this.c.release.value = v) });
    this.gr = this.addLED(this.row(), "red");
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.c, { label: "IN" });
    this.addPort(p, "out", this.c, { label: "OUT" });
    this.raf(() => this.gr.set(Math.min(1, -this.c.reduction / 20)));
  }
}
registerModule({ id: "comp", name: "Compressor", cat: "Procesa", desc: "Compresor dinámico", make: (d) => new Comp(d) });

/* ---------------- WAVESHAPER (Distortion) ---------------- */
class Shaper extends Module {
  constructor(def) {
    super({ title: "WAVE SHAPER", width: 154, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.ws = ctx.createWaveShaper();
    this.ws.curve = AudioEngine.makeDistortionCurve(30);
    this.ws.oversample = "4x";
    this.tone = ctx.createBiquadFilter(); this.tone.type = "lowpass"; this.tone.frequency.value = 8000;
    this.out = ctx.createGain(); this.out.gain.value = 0.7;
    this.in.connect(this.ws).connect(this.tone).connect(this.out);

    const k = this.row();
    this.addKnob(k, { label: "DRIVE", min: 0, max: 100, value: 30, onChange: (v) => (this.ws.curve = AudioEngine.makeDistortionCurve(v)) });
    this.addKnob(k, { label: "TONE", min: 300, max: 16000, value: 8000, unit: "Hz", mapping: "exp", onChange: (v) => (this.tone.frequency.value = v) });
    this.addKnob(this.row(), { label: "OUT", min: 0, max: 1, value: 0.7, onChange: (v) => (this.out.gain.value = v) });
    this.addSelect(this.row(), [{ value: "none", label: "OS off" }, { value: "2x", label: "OS 2x" }, { value: "4x", label: "OS 4x" }], (v) => (this.ws.oversample = v), "4x");

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.out, { label: "OUT" });
  }
}
registerModule({ id: "shaper", name: "WaveShaper", cat: "Procesa", desc: "Distorsión / saturación", make: (d) => new Shaper(d) });

/* ---------------- STEREO PANNER ---------------- */
class Panner extends Module {
  constructor(def) {
    super({ title: "STEREO PAN", width: 140, ...def });
    const ctx = Engine.ctx;
    this.p = ctx.createStereoPanner();
    this.addKnob(this.row(), { label: "PAN", min: -1, max: 1, value: 0, bipolar: true, format: (v) => (v === 0 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100)), onChange: (v) => (this.p.pan.value = v) });
    const pr = this.row(this.body, "between");
    this.addPort(pr, "in", this.p, { label: "IN" });
    this.addPort(pr, "in", this.p.pan, { label: "CV", kind: "cv" });
    this.addPort(pr, "out", this.p, { label: "OUT" });
  }
}
registerModule({ id: "pan", name: "Stereo Panner", cat: "Estéreo", desc: "Paneo izquierda/derecha", make: (d) => new Panner(d) });

/* ---------------- PANNER 3D (PannerNode HRTF) ---------------- */
class Panner3D extends Module {
  constructor(def) {
    super({ title: "3D PANNER", width: 150, ...def });
    const ctx = Engine.ctx;
    this.p = ctx.createPanner();
    this.p.panningModel = "HRTF";
    this.p.distanceModel = "inverse";
    this.p.positionZ.value = 1;
    const k = this.row();
    this.addKnob(k, { label: "X", min: -10, max: 10, value: 0, bipolar: true, onChange: (v) => (this.p.positionX.value = v) });
    this.addKnob(k, { label: "Y", min: -10, max: 10, value: 0, bipolar: true, onChange: (v) => (this.p.positionY.value = v) });
    this.addKnob(this.row(), { label: "Z", min: -10, max: 10, value: 1, bipolar: true, onChange: (v) => (this.p.positionZ.value = v) });
    const pr = this.row(this.body, "between");
    this.addPort(pr, "in", this.p, { label: "IN" });
    this.addPort(pr, "out", this.p, { label: "OUT" });
  }
}
registerModule({ id: "pan3d", name: "3D Panner", cat: "Estéreo", desc: "Espacialización HRTF", make: (d) => new Panner3D(d) });

/* ---------------- SPLIT (ChannelSplitter) ---------------- */
class Split extends Module {
  constructor(def) {
    super({ title: "L/R SPLIT", width: 130, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.sp = ctx.createChannelSplitter(2);
    this.l = ctx.createGain(); this.r = ctx.createGain();
    this.in.connect(this.sp);
    this.sp.connect(this.l, 0);
    this.sp.connect(this.r, 1);
    this.addPort(this.row(this.body, "between"), "in", this.in, { label: "ST IN" });
    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.l, { label: "L" });
    this.addPort(p, "out", this.r, { label: "R" });
  }
}
registerModule({ id: "split", name: "L/R Split", cat: "Estéreo", desc: "Separa estéreo en L y R", make: (d) => new Split(d) });

/* ---------------- MERGE (ChannelMerger) ---------------- */
class Merge extends Module {
  constructor(def) {
    super({ title: "L/R MERGE", width: 130, ...def });
    const ctx = Engine.ctx;
    this.l = ctx.createGain(); this.r = ctx.createGain();
    this.mg = ctx.createChannelMerger(2);
    this.l.connect(this.mg, 0, 0);
    this.r.connect(this.mg, 0, 1);
    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.l, { label: "L" });
    this.addPort(p, "in", this.r, { label: "R" });
    this.addPort(this.row(this.body, "between"), "out", this.mg, { label: "ST OUT" });
  }
}
registerModule({ id: "merge", name: "L/R Merge", cat: "Estéreo", desc: "Une L y R en estéreo", make: (d) => new Merge(d) });
