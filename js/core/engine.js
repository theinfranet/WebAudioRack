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
    this.master.connect(this.ctx.destination);
    return this.ctx;
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
