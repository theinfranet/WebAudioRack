/* ============================================================
   MÓDULOS — Avanzados (completan la cobertura de la Web Audio API)
   Bitcrusher (AudioWorkletNode), Player (MediaElementAudioSource),
   Recorder (MediaStreamAudioDestination + MediaRecorder),
   Listener (AudioListener).
   ============================================================ */

/* ---------------- BITCRUSHER (AudioWorkletNode) ---------------- */
class Bitcrusher extends Module {
  constructor(def) {
    super({ title: "BITCRUSHER", width: 150, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.out = ctx.createGain();
    this.in.connect(this.out);           // passthrough hasta cargar el worklet
    this._bits = 8; this._red = 4;

    const k = this.row();
    this.addKnob(k, { label: "BITS", min: 1, max: 16, value: 8, onChange: (v) => this._set("bits", Math.round(v)) });
    this.addKnob(k, { label: "RATE", min: 1, max: 50, value: 4, onChange: (v) => this._set("reduction", Math.round(v)) });
    this.status = this.addLED(this.row(), "amber");

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.out, { label: "OUT" });

    Engine.ensureWorklet().then(() => {
      this.node = new AudioWorkletNode(ctx, "bitcrusher");
      this._set("bits", this._bits); this._set("reduction", this._red);
      this.in.disconnect(this.out);
      this.in.connect(this.node).connect(this.out);
      this.status.set(1);
    }).catch(() => this.status.set(0));
  }
  _set(name, v) {
    if (name === "bits") this._bits = v; else this._red = v;
    if (this.node) this.node.parameters.get(name).value = v;
  }
  onDispose() { try { this.node && this.node.disconnect(); } catch (e) {} }
}
registerModule({ id: "bitcrush", name: "Bitcrusher", cat: "Procesa", desc: "AudioWorklet · bits + rate", make: (d) => new Bitcrusher(d) });

/* ---------------- PLAYER (MediaElementAudioSourceNode) ---------------- */
class Player extends Module {
  constructor(def) {
    super({ title: "PLAYER", width: 168, ...def });
    const ctx = Engine.ctx;
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = false;
    this.src = ctx.createMediaElementSource(this.audio);
    this.level = ctx.createGain(); this.level.gain.value = 0.9;
    this.src.connect(this.level);

    const loadBtn = this.addButton(this.row(), "CARGAR…", () => input.click(), { wide: true });
    const input = document.createElement("input");
    input.type = "file"; input.accept = "audio/*"; input.style.display = "none";
    input.addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      this.audio.src = URL.createObjectURL(f);
      loadBtn.textContent = f.name.slice(0, 16);
    });
    this.el.appendChild(input);

    const ctr = this.row();
    this.addButton(ctr, "▶", () => { Engine.resume(); this.audio.play(); });
    this.addButton(ctr, "❚❚", () => this.audio.pause());
    this.addButton(ctr, "LOOP", (on) => (this.audio.loop = on), { toggle: true });
    this.addKnob(this.row(), { label: "LEVEL", min: 0, max: 1.4, value: 0.9, onChange: (v) => (this.level.gain.value = v) });

    const p = this.row(this.body, "between");
    this.addPort(p, "out", this.level, { label: "OUT" });
  }
  onDispose() { try { this.audio.pause(); } catch (e) {} }
}
registerModule({ id: "player", name: "Media Player", cat: "Fuentes", desc: "Streaming de audio (elemento)", make: (d) => new Player(d) });

/* ---------------- RECORDER (MediaStreamAudioDestinationNode) ---------------- */
class Recorder extends Module {
  constructor(def) {
    super({ title: "RECORDER", width: 160, ...def });
    const ctx = Engine.ctx;
    this.in = ctx.createGain();
    this.out = ctx.createGain();
    this.dest = ctx.createMediaStreamDestination();
    this.in.connect(this.out);           // THRU para monitorear
    this.in.connect(this.dest);
    this.chunks = []; this.rec = null; this._t0 = 0;

    this.led = this.addLED(this.row(), "red");
    this.time = this.addScreen(this.row(), 140, 22);
    const ctr = this.row();
    this.recBtn = this.addButton(ctr, "● REC", (on) => on ? this.start() : this.stop(), { toggle: true });
    this.dl = this.addButton(ctr, "↓ WAV", () => this.download());

    const p = this.row(this.body, "between");
    this.addPort(p, "in", this.in, { label: "IN" });
    this.addPort(p, "out", this.out, { label: "THRU" });

    this.raf(() => this.draw());
  }
  start() {
    Engine.resume();
    this.chunks = [];
    this.rec = new MediaRecorder(this.dest.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => { this.blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" }); };
    this.rec.start();
    this._t0 = Engine.now; this.led.set(1);
  }
  stop() { if (this.rec && this.rec.state !== "inactive") this.rec.stop(); this.led.set(0.1); }
  download() {
    if (!this.blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(this.blob);
    a.download = "webaudiorack-" + Date.now() + ".webm";
    a.click();
  }
  draw() {
    const { ctx, w, h } = this.time;
    const rec = this.rec && this.rec.state === "recording";
    const t = rec ? Engine.now - this._t0 : 0;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#040404"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rec ? "#ff4d5e" : "#36d39a"; ctx.font = "12px monospace";
    const mm = String(Math.floor(t / 60)).padStart(2, "0");
    const ss = String(Math.floor(t % 60)).padStart(2, "0");
    ctx.fillText((rec ? "● " : "  ") + mm + ":" + ss, 8, 15);
  }
  onDispose() { this.stop(); }
}
registerModule({ id: "recorder", name: "Recorder", cat: "Salida", desc: "Graba la señal a archivo", make: (d) => new Recorder(d) });

/* ---------------- DEVICE (interfaz de audio: hasta 4 in / 4 out) ---------------- */
class Device extends Module {
  constructor(def) {
    super({ title: "DEVICE", width: 250, ...def });
    const ctx = Engine.ctx;
    this.inId = ""; this.outId = "";

    // salida (rack -> interfaz): 4 gains -> merger -> mediaStreamDest -> <audio> setSinkId
    this.merger = ctx.createChannelMerger(4);
    this.outGains = [];
    for (let i = 0; i < 4; i++) { const g = ctx.createGain(); g.connect(this.merger, 0, i); this.outGains.push(g); }
    this.dest = ctx.createMediaStreamDestination();
    this.merger.connect(this.dest);
    this.audioEl = new Audio();
    this.audioEl.srcObject = this.dest.stream;

    // entrada (interfaz -> rack): mediaStreamSource -> splitter(4) -> 4 salidas
    this.splitter = ctx.createChannelSplitter(4);

    const top = this.row();
    this.led = this.addLED(top, "red");
    const act = this.addButton(top, "ACTIVAR", () => this.activate(), {});
    act.style.flex = "1";

    const gIn = this.group("ENTRADA (interfaz → rack)");
    this.inSel = this.addSelect(gIn, [{ value: "", label: "— activa para listar —" }],
      (id) => { this.inId = id; if (this.stream) this._openInput(); }, "", { persist: false });
    const inRow = this.row(gIn); inRow.style.gap = "4px";
    for (let i = 0; i < 4; i++) this.addPort(inRow, "out", this.splitter, { label: "I" + (i + 1), index: i });

    const gOut = this.group("SALIDA (rack → interfaz)");
    this.outSel = this.addSelect(gOut, [{ value: "", label: "— activa para listar —" }], (id) => this._setOutput(id), "", { persist: false });
    const outRow = this.row(gOut); outRow.style.gap = "4px";
    for (let i = 0; i < 4; i++) this.addPort(outRow, "in", this.outGains[i], { label: "O" + (i + 1) });

    this._refresh();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener)
      navigator.mediaDevices.addEventListener("devicechange", () => this._refresh());
  }
  async activate() {
    Engine.resume();
    try { await this._openInput(); } catch (e) { console.warn(e); }
    try { await this.audioEl.play(); } catch (e) {}
    if (this.outId) this._setOutput(this.outId);
    this.led.set(1);
    this._refresh();           // ahora con permiso: aparecen las etiquetas reales
  }
  async _openInput() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    const make = (extra) => Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }, this.inId ? { deviceId: { exact: this.inId } } : {}, extra);
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: make({ channelCount: { ideal: 4 } }) }); }
    catch (e) { this.stream = await navigator.mediaDevices.getUserMedia({ audio: make({}) }); }
    if (this.src) this.src.disconnect();
    this.src = Engine.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.splitter);
    this.led.set(1);
  }
  async _setOutput(id) {
    this.outId = id;
    if (this.audioEl.setSinkId) { try { await this.audioEl.setSinkId(id || ""); } catch (e) { console.warn("setSinkId:", e.message); } }
  }
  async _refresh() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const fill = (sel, kind, word) => {
        const cur = sel.value; sel.innerHTML = "";
        const d0 = document.createElement("option"); d0.value = ""; d0.textContent = word + " por defecto"; sel.appendChild(d0);
        devs.filter((d) => d.kind === kind).forEach((d, i) => {
          const o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || (word + " " + (i + 1)); sel.appendChild(o);
        });
        sel.value = cur;
      };
      fill(this.inSel, "audioinput", "Entrada");
      fill(this.outSel, "audiooutput", "Salida");
    } catch (e) {}
  }
  onDispose() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    try { this.audioEl.pause(); } catch (e) {}
  }
}
registerModule({ id: "device", name: "Device", cat: "I/O", desc: "Interfaz de audio · 4 in / 4 out", make: (d) => new Device(d) });

/* ---------------- LISTENER (AudioListener para el 3D Panner) ---------------- */
class Listener extends Module {
  constructor(def) {
    super({ title: "LISTENER", width: 150, ...def });
    this.L = Engine.ctx.listener;
    this._p = { X: 0, Y: 0, Z: 0 };
    const k = this.row();
    this.addKnob(k, { label: "X", min: -10, max: 10, value: 0, bipolar: true, onChange: (v) => this._pos("X", v) });
    this.addKnob(k, { label: "Y", min: -10, max: 10, value: 0, bipolar: true, onChange: (v) => this._pos("Y", v) });
    this.addKnob(this.row(), { label: "Z", min: -10, max: 10, value: 0, bipolar: true, onChange: (v) => this._pos("Z", v) });
    const note = document.createElement("div");
    note.className = "tiny-label";
    note.textContent = "posición del oyente (3D Panner)";
    this.body.appendChild(note);
  }
  _pos(axis, v) {
    this._p[axis] = v;
    const L = this.L;
    if (L["position" + axis]) L["position" + axis].value = v;
    else if (L.setPosition) L.setPosition(this._p.X, this._p.Y, this._p.Z);
  }
}
registerModule({ id: "listener", name: "Listener", cat: "Estéreo", desc: "Oyente (AudioListener)", make: (d) => new Listener(d) });
