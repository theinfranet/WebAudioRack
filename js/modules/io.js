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
    this.timeBuf = new Uint8Array(this.an.fftSize);
    this.freqBuf = new Uint8Array(this.an.frequencyBinCount);

    const sc = this.addScreen(this.row(), 168, 90);
    this.sc = sc;
    const ctr = this.row();
    this.addButton(ctr, "WAVE", () => (this.mode = "wave"), { active: true });
    this.addButton(ctr, "SPECTRUM", () => (this.mode = "freq"));

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.in, { label: "THRU" });

    this.raf(() => this.draw());
  }
  draw() {
    const { ctx, w, h } = this.sc;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#060a08"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(46,230,166,.12)"; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.strokeStyle = "#2ee6a6"; ctx.lineWidth = 1.6;
    ctx.shadowColor = "#2ee6a6"; ctx.shadowBlur = 6;
    if (this.mode === "wave") {
      this.an.getByteTimeDomainData(this.timeBuf);
      ctx.beginPath();
      const step = this.timeBuf.length / w;
      for (let x = 0; x < w; x++) {
        const v = this.timeBuf[Math.floor(x * step)] / 128 - 1;
        const y = h / 2 - v * (h / 2 - 4);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      this.an.getByteFrequencyData(this.freqBuf);
      const bars = 64, bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = this.freqBuf[Math.floor(i / bars * this.freqBuf.length * 0.6)] / 255;
        const bh = v * (h - 4);
        ctx.fillStyle = `hsl(${160 - v * 40} 80% ${40 + v * 30}%)`;
        ctx.fillRect(i * bw, h - bh, bw - 1, bh);
      }
    }
    ctx.shadowBlur = 0;
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
  rms(buf, an) { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
  drawMeter() {
    const { ctx, w, h } = this.meter;
    const l = Math.min(1, this.rms(this.bufL, this.anL) * 2.2);
    const r = Math.min(1, this.rms(this.bufR, this.anR) * 2.2);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#060a08"; ctx.fillRect(0, 0, w, h);
    const bar = (y, v) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#2ee6a6"); grad.addColorStop(0.7, "#ffd23d"); grad.addColorStop(1, "#ff4d5e");
      ctx.fillStyle = grad; ctx.fillRect(2, y, (w - 4) * v, 9);
      ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.strokeRect(2, y, w - 4, 9);
    };
    bar(3, l); bar(14, r);
  }
}
registerModule({ id: "output", name: "Output (estéreo)", cat: "Salida", desc: "Salida a la interfaz de audio", make: (d) => new Output(d) });
