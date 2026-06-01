/* ============================================================
   MÓDULOS — Análisis y salida
   Scope (AnalyserNode: onda + espectro) y Output (destino estéreo)
   ============================================================ */

/* ---------------- SCOPE (AnalyserNode) ---------------- */
class Scope extends Module {
  constructor(def) {
    super({ title: "SCOPE", width: 184, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();          // pass-through (insertable)
    this.an = ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.in.connect(this.an);
    this.mode = "wave";
    this.span = 1024;                 // muestras visibles (timebase)
    this.timeBuf = new Uint8Array(this.an.fftSize);
    this.freqBuf = new Uint8Array(this.an.frequencyBinCount);

    const sc = this.addScreen(this.row(), 168, 90);
    this.sc = sc;
    const ctr = this.row();
    this.waveBtn = this.addButton(ctr, "WAVE", () => (this.mode = "wave"), { active: true });
    this.freqBtn = this.addButton(ctr, "SPECTRUM", () => (this.mode = "freq"));
    this.addKnob(this.row(), {
      label: "TIME", min: 64, max: 2048, value: 1024, mapping: "exp",
      format: (v) => Math.round(v) + " smp", onChange: (v) => (this.span = Math.round(v)),
    });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.in, { label: "THRU" });

    this.raf(() => this.draw());
  }
  draw() {
    const { ctx, w, h } = this.sc;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(46,230,166,.12)"; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.strokeStyle = "#2ee6a6"; ctx.lineWidth = 1.6;
    if (this.mode === "wave") {
      this.an.getByteTimeDomainData(this.timeBuf);
      ctx.beginPath();
      const span = Math.min(this.span || this.timeBuf.length, this.timeBuf.length);
      const step = span / w;
      for (let x = 0; x < w; x++) {
        const v = this.timeBuf[Math.floor(x * step)] / 128 - 1;
        const y = h / 2 - v * (h / 2 - 4);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      this.an.getByteFrequencyData(this.freqBuf);
      const bars = 64, bw = w / bars;
      ctx.fillStyle = "#2ee6a6";
      for (let i = 0; i < bars; i++) {
        const v = this.freqBuf[Math.floor(i / bars * this.freqBuf.length * 0.6)] / 255;
        const bh = v * (h - 4);
        ctx.fillRect(i * bw, h - bh, bw - 1, bh);
      }
    }
  }
}
registerModule({ id: "scope", name: "Scope / Spectrum", cat: "Salida", desc: "Osciloscopio + espectro", make: (d) => new Scope(d) });

/* ---------------- OUTPUT (AudioDestination estéreo) ---------------- */
class Output extends Module {
  constructor(def) {
    super({ title: "OUTPUT", width: 168, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain(); this.in.gain.value = 0.8;
    this.split = ctx.createChannelSplitter(2);
    this.anL = ctx.createAnalyser(); this.anR = ctx.createAnalyser();
    this.anL.fftSize = 256; this.anR.fftSize = 256;
    this.bufL = new Float32Array(256); this.bufR = new Float32Array(256);

    this.in.connect(Engine.master);
    this.in.connect(this.split);
    this.split.connect(this.anL, 0);
    this.split.connect(this.anR, 1);

    // selector de interfaz de salida (setSinkId)
    this.devSel = this.addSelect(this.row(), [{ value: "", label: "Salida por defecto" }], (id) => Engine.setSinkId(id), "", { persist: false });
    this._refreshDevices();
    if (navigator.mediaDevices) navigator.mediaDevices.ondevicechange = () => this._refreshDevices();

    const meter = this.addScreen(this.row(), 152, 26);
    this.meter = meter;
    this.addKnob(this.row(), { label: "MASTER", min: 0, max: 1.4, value: 0.8, onChange: (v) => (this.in.gain.value = v) });

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "L / ST" });
    // entrada derecha opcional vía merge interno
    this.rIn = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    // ruteo: si conectas solo "L/ST" pasa estéreo; "R" fuerza canal derecho
    this.rIn.connect(merge, 0, 1);
    merge.connect(this.in);
    this.addPort(p, "in", this.rIn, { label: "R" });

    this.raf(() => this.drawMeter());
  }
  async _refreshDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const outs = devs.filter((d) => d.kind === "audiooutput");
      const cur = this.devSel.value;
      this.devSel.innerHTML = "";
      const def = document.createElement("option");
      def.value = ""; def.textContent = Engine.canSelectOutput ? "Salida por defecto" : "Salida (no configurable)";
      this.devSel.appendChild(def);
      outs.forEach((d, i) => {
        const o = document.createElement("option");
        o.value = d.deviceId; o.textContent = d.label || ("Salida " + (i + 1));
        this.devSel.appendChild(o);
      });
      this.devSel.value = cur;
    } catch (e) {}
  }
  rms(buf, an) { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
  drawMeter() {
    const { ctx, w, h } = this.meter;
    const l = Math.min(1, this.rms(this.bufL, this.anL) * 2.2);
    const r = Math.min(1, this.rms(this.bufR, this.anR) * 2.2);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
    const bar = (y, v) => {
      ctx.fillStyle = "#2ee6a6";
      ctx.fillRect(2, y, (w - 4) * v, 9);
    };
    bar(3, l); bar(14, r);
  }
}
registerModule({ id: "output", name: "Output (estéreo)", cat: "Salida", desc: "Salida a la interfaz de audio", make: (d) => new Output(d) });
