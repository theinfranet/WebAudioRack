/* ============================================================
   AudioEngine — envoltura del AudioContext (W3C Web Audio API)
   Singleton compartido por todos los módulos.
   ============================================================ */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;     // GainNode de seguridad antes del destino
    this.started = false;
  }

  /** Crea el AudioContext tras gesto del usuario (autoplay policy). */
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    // --- taps de medición (no afectan al grafo de salida) ---
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.masterAnalyser.smoothingTimeConstant = 0.6;
    this.master.connect(this.masterAnalyser);
    this.masterSplit = this.ctx.createChannelSplitter(2);
    this.master.connect(this.masterSplit);
    this.anL = this.ctx.createAnalyser(); this.anL.fftSize = 512; this.anL.smoothingTimeConstant = 0.2;
    this.anR = this.ctx.createAnalyser(); this.anR.fftSize = 512; this.anR.smoothingTimeConstant = 0.2;
    try { this.masterSplit.connect(this.anL, 0); this.masterSplit.connect(this.anR, 1); } catch (e) {}
    this._meterL = new Float32Array(this.anL.fftSize);
    this._meterR = new Float32Array(this.anR.fftSize);
    this._spec   = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Mide el master: devuelve {peakL, peakR, rmsL, rmsR}. */
  meter() {
    if (!this.anL) return { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
    this.anL.getFloatTimeDomainData(this._meterL);
    this.anR.getFloatTimeDomainData(this._meterR);
    let pl = 0, pr = 0, sl = 0, sr = 0;
    const N = this._meterL.length;
    for (let i = 0; i < N; i++) {
      const a = Math.abs(this._meterL[i]); if (a > pl) pl = a; sl += this._meterL[i] * this._meterL[i];
      const b = Math.abs(this._meterR[i]); if (b > pr) pr = b; sr += this._meterR[i] * this._meterR[i];
    }
    return {
      peakL: Math.min(1, pl), peakR: Math.min(1, pr),
      rmsL: Math.sqrt(sl / N), rmsR: Math.sqrt(sr / N),
    };
  }

  /** Espectro del master (Uint8Array 0..255 reutilizado). */
  spectrum() {
    if (!this.masterAnalyser) return null;
    this.masterAnalyser.getByteFrequencyData(this._spec);
    return this._spec;
  }

  async resume() {
    this.init();
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.started = true;
    return this.ctx.state;
  }

  async suspend() {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
    this.started = false;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 44100; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  get canSelectOutput() { return !!(this.ctx && typeof this.ctx.setSinkId === "function"); }

  /** Cambia la interfaz/dispositivo de salida (setSinkId del AudioContext). */
  async setSinkId(deviceId) {
    if (!this.canSelectOutput) return false;
    try { await this.ctx.setSinkId(deviceId || ""); return true; }
    catch (e) { console.warn("setSinkId:", e.message); return false; }
  }

  /** Genera un AudioBuffer de ruido blanco reutilizable. */
  whiteNoiseBuffer(seconds = 2) {
    const len = this.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Respuesta de impulso sintética para el Convolver (reverb). */
  impulseResponse(seconds = 2.4, decay = 2.0) {
    const len = Math.floor(this.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Carga (una sola vez) el procesador AudioWorklet del bitcrusher. */
  ensureWorklet() {
    if (this._wl) return this._wl;
    const code = `
      class Bitcrusher extends AudioWorkletProcessor {
        static get parameterDescriptors() {
          return [
            { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16 },
            { name: 'reduction', defaultValue: 4, minValue: 1, maxValue: 50 },
          ];
        }
        constructor() { super(); this.phase = 0; this.last = 0; }
        process(inputs, outputs, params) {
          const input = inputs[0], output = outputs[0];
          if (!input || !input.length) return true;
          for (let ch = 0; ch < output.length; ch++) {
            const inp = input[ch] || input[0];
            const out = output[ch];
            for (let i = 0; i < out.length; i++) {
              const bits = params.bits.length > 1 ? params.bits[i] : params.bits[0];
              const red = params.reduction.length > 1 ? params.reduction[i] : params.reduction[0];
              const step = Math.pow(0.5, bits);
              this.phase += 1;
              if (this.phase >= red) { this.phase = 0; this.last = step * Math.floor(inp[i] / step + 0.5); }
              out[i] = this.last;
            }
          }
          return true;
        }
      }
      registerProcessor('bitcrusher', Bitcrusher);
    `;
    const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    this._wl = this.ctx.audioWorklet.addModule(url);
    return this._wl;
  }

  /** Curva de saturación para el WaveShaper. */
  static makeDistortionCurve(amount = 30) {
    const n = 1024, curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}

window.Engine = new AudioEngine();
