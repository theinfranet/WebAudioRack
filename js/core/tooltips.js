/* ============================================================
   Tooltips — glosario técnico + mapeo a Web Audio API
   Al hacer hover sobre cualquier etiqueta técnica (knobs, jacks,
   títulos de módulo, botones) muestra una explicación breve y el
   nodo/propiedad de la Web Audio API correspondiente.
   Referencias: MDN Web Audio API — https://developer.mozilla.org/docs/Web/API/Web_Audio_API
   ============================================================ */

const Tooltips = {
  el: null,
  current: null,
  delay: 220,
  _t: null,

  // --- Glosario --------------------------------------------------
  // Cada entrada: { name, desc, waa }
  // name: nombre completo del término
  // desc: qué hace en síntesis
  // waa : el nodo / AudioParam / método de la Web Audio API que lo implementa
  glossary: {
    /* --- MÓDULOS / fuentes --- */
    "VCO": { name: "VCO — Voltage-Controlled Oscillator", desc: "Oscilador periódico. Produce las formas de onda base (sine, square, sawtooth, triangle) que son materia prima del sonido.", waa: "OscillatorNode. `type` define la forma; `frequency` y `detune` son AudioParams (admiten CV/modulación)." },
    "OSC": { name: "Oscilador", desc: "Genera una señal periódica que se usa como audio o como modulador.", waa: "OscillatorNode (AudioContext.createOscillator)." },
    "LFO": { name: "LFO — Low Frequency Oscillator", desc: "Oscilador de baja frecuencia que NO se escucha: se usa para modular otros parámetros (cutoff, pitch, amplitud, pan).", waa: "OscillatorNode operando por debajo de ~20 Hz, conectado a un AudioParam." },
    "NOISE": { name: "Generador de ruido", desc: "Ruido blanco/coloreado a partir de un buffer aleatorio en loop. Útil para percusión, viento, filtros barridos.", waa: "AudioBufferSourceNode con un AudioBuffer relleno de muestras aleatorias y `loop = true`." },
    "CV": { name: "CV — Control Voltage", desc: "Señal de control de baja frecuencia que modula parámetros (no se escucha como audio). El mismo cable transporta audio o CV.", waa: "Cualquier AudioNode conectado a un AudioParam: el valor del param se suma con la salida de la señal." },
    "OFFSET": { name: "Offset / DC", desc: "Voltaje constante (DC). Útil para desplazar un CV o controlar un parámetro a un valor fijo.", waa: "ConstantSourceNode (su `offset` es un AudioParam)." },
    "ADSR": { name: "ADSR — Envolvente", desc: "Genera un contorno: Attack (subida), Decay (caída), Sustain (nivel), Release (relajación). Se aplica a la amplitud o al filtro.", waa: "Automatización en un AudioParam: linearRampToValueAtTime / setTargetAtTime sobre `gain.gain` o `frequency`." },
    "ENV": { name: "Envolvente", desc: "Curva en el tiempo que controla un parámetro (típicamente la amplitud).", waa: "AudioParam.linearRampToValueAtTime / exponentialRampToValueAtTime." },
    "SEQ": { name: "Secuenciador", desc: "Avanza por una serie de pasos a tempo y dispara gate + CV (pitch) en cada paso.", waa: "Patrón programado con setTimeout/AudioContext.currentTime, escribiendo en ConstantSourceNode (CV) y disparando envolventes." },
    "SAMPLER": { name: "Sampler", desc: "Reproduce un fragmento de audio cargado por el usuario, opcionalmente con loop y cambio de pitch.", waa: "AudioBufferSourceNode con `buffer`, `loop`, `playbackRate` y `detune`." },
    "PLAYER": { name: "Reproductor de audio", desc: "Reproduce un archivo de audio del sistema (mp3/wav/ogg) integrado al rack.", waa: "MediaElementAudioSourceNode (envuelve un <audio>) o AudioBufferSourceNode." },
    "RECORDER": { name: "Grabador", desc: "Captura la señal que pasa por su entrada a un archivo descargable.", waa: "MediaStreamDestinationNode + MediaRecorder graban el stream a WebM/WAV." },
    "DEVICE": { name: "Dispositivo de audio", desc: "Entradas/salidas de la interfaz de audio del sistema (micrófonos, tarjetas, agregados).", waa: "navigator.mediaDevices.getUserMedia → MediaStreamAudioSourceNode (in) y AudioContext.setSinkId (out)." },
    "LISTENER": { name: "Listener 3D", desc: "Posición y orientación del oyente en el espacio 3D que usan los PannerNode.", waa: "AudioListener (AudioContext.listener): positionX/Y/Z + forwardX/Y/Z." },

    /* --- MÓDULOS / procesadores --- */
    "VCA": { name: "VCA — Voltage-Controlled Amplifier", desc: "Amplificador cuyo nivel se modula vía CV (usado para esculpir amplitud con la envolvente).", waa: "GainNode: su `gain` es un AudioParam modulable por CV." },
    "GAIN": { name: "Gain / Ganancia", desc: "Atenuación o amplificación lineal de la señal.", waa: "GainNode.gain (AudioParam, valores típicos 0..1, >1 amplifica)." },
    "VCF": { name: "VCF — Voltage-Controlled Filter", desc: "Filtro biquad (LP/HP/BP/Notch/AllPass/LowShelf/HighShelf/Peaking) con corte y Q modulables.", waa: "BiquadFilterNode: `type`, `frequency`, `Q`, `gain` (todos AudioParam excepto type)." },
    "IIR": { name: "IIR Filter", desc: "Filtro de respuesta infinita definido por coeficientes feedforward/feedback (más control, sin AudioParams).", waa: "IIRFilterNode (AudioContext.createIIRFilter(ff, fb))." },
    "DELAY": { name: "Delay / Retardo", desc: "Retarda la señal una cantidad de tiempo; con feedback produce ecos repetidos.", waa: "DelayNode.delayTime (AudioParam) + GainNode de feedback realimentando al delay." },
    "REVERB": { name: "Reverb por convolución", desc: "Simula la respuesta acústica de un espacio convolucionando la señal con un impulso (IR).", waa: "ConvolverNode con un AudioBuffer impulse-response (`buffer`)." },
    "COMPRESSOR": { name: "Compresor dinámico", desc: "Reduce el rango dinámico: por encima del umbral baja la ganancia con cierta proporción y tiempos.", waa: "DynamicsCompressorNode: threshold, knee, ratio, attack, release, reduction." },
    "WAVE SHAPER": { name: "Wave Shaper / Distortion", desc: "Aplica una curva no-lineal punto a punto a la muestra (saturación, fuzz, fold).", waa: "WaveShaperNode: `curve` (Float32Array) y `oversample` (none/2x/4x)." },
    "BITCRUSHER": { name: "Bitcrusher", desc: "Reduce profundidad de bits y/o frecuencia de muestreo para ensuciar el sonido (lo-fi).", waa: "AudioWorkletNode con un procesador custom que cuantiza la muestra y submuestrea." },
    "STEREO PAN": { name: "Stereo Pan", desc: "Posiciona la señal entre los altavoces izquierdo y derecho (-1 = L, 0 = centro, +1 = R).", waa: "StereoPannerNode.pan (AudioParam)." },
    "3D PANNER": { name: "Panner 3D", desc: "Espacializa la señal en un espacio 3D según posición y orientación relativa al AudioListener.", waa: "PannerNode con HRTF: positionX/Y/Z + orientationX/Y/Z." },
    "PAN": { name: "Pan", desc: "Posición estéreo izquierda/derecha.", waa: "StereoPannerNode.pan (-1..+1)." },
    "L/R SPLIT": { name: "Channel Splitter", desc: "Separa una señal estéreo en sus dos canales independientes (L y R).", waa: "ChannelSplitterNode (createChannelSplitter(2))." },
    "L/R MERGE": { name: "Channel Merger", desc: "Combina dos señales mono en una estéreo (L + R).", waa: "ChannelMergerNode (createChannelMerger(2))." },
    "MIXER": { name: "Mezclador", desc: "Suma varias entradas con su propio nivel y pan, generando una mezcla estéreo.", waa: "Cadena GainNode + StereoPannerNode por canal, todas sumadas a un bus de salida." },

    /* --- MÓDULOS / I/O --- */
    "SCOPE": { name: "Osciloscopio / Analizador", desc: "Visualiza la forma de onda en el tiempo o el espectro de frecuencias.", waa: "AnalyserNode.getByteTimeDomainData (onda) y getByteFrequencyData (FFT/espectro)." },
    "SPECTRUM": { name: "Espectro de frecuencias", desc: "Descompone la señal en sus componentes de frecuencia (FFT).", waa: "AnalyserNode.getByteFrequencyData con tamaño `fftSize`." },
    "WAVE": { name: "Forma de onda", desc: "Visualiza la amplitud a lo largo del tiempo.", waa: "AnalyserNode.getByteTimeDomainData (muestreo del dominio temporal)." },
    "OUTPUT": { name: "Output / Master", desc: "Salida final del rack al destino del AudioContext (interfaz física).", waa: "AudioContext.destination (master); setSinkId() elige la interfaz." },
    "MASTER": { name: "Master", desc: "Nivel global de salida antes del destino.", waa: "GainNode antes de AudioContext.destination." },

    /* --- KNOBS / parámetros --- */
    "FREQ": { name: "Frecuencia", desc: "Altura del tono del oscilador (Hz).", waa: "OscillatorNode.frequency (AudioParam, en Hz)." },
    "FINE": { name: "Detune fino", desc: "Desafinación fina en cents (1 semitono = 100 cents).", waa: "OscillatorNode.detune (AudioParam, en cents)." },
    "1V/OCT": { name: "1V/Oct (pitch CV)", desc: "Entrada de pitch al estilo eurorack: 1 voltio = 1 octava. Internamente se suma como detune.", waa: "Conectado a OscillatorNode.detune; cada voltio aporta 1200 cents." },
    "RATE": { name: "Rate", desc: "Velocidad / frecuencia (de un LFO, de un sampler, etc.).", waa: "OscillatorNode.frequency en LFO; AudioBufferSourceNode.playbackRate en samplers." },
    "DEPTH": { name: "Depth / Profundidad", desc: "Cuánta modulación entrega el LFO al destino conectado.", waa: "GainNode entre el LFO y el AudioParam destino; su `gain` escala la modulación." },
    "TONE": { name: "Tone", desc: "Filtro tonal simple (típicamente un low-pass tras el efecto).", waa: "BiquadFilterNode (lowpass/highpass) modulando `frequency`." },
    "LEVEL": { name: "Level / Nivel", desc: "Volumen de salida del módulo.", waa: "GainNode.gain (AudioParam lineal)." },
    "BPM": { name: "BPM — Beats Per Minute", desc: "Tempo del secuenciador (pulsaciones por minuto).", waa: "Determina el intervalo entre pasos (60/BPM segundos)." },
    "GATE": { name: "Gate", desc: "Señal de disparo: 1 = nota activa (sostener), 0 = nota apagada. Activa la envolvente.", waa: "ConstantSourceNode.offset conmutando entre 0 y 1 con setValueAtTime." },
    "CUTOFF": { name: "Cutoff", desc: "Frecuencia de corte del filtro: por encima/debajo de ella la señal se atenúa.", waa: "BiquadFilterNode.frequency (AudioParam, Hz)." },
    "CUT CV": { name: "Cutoff CV", desc: "Modulación de la frecuencia de corte vía una señal de control.", waa: "CV conectado a BiquadFilterNode.frequency (los valores se suman)." },
    "RESO": { name: "Resonance / Q", desc: "Resalta las frecuencias cercanas al corte; valores altos producen el típico silbido.", waa: "BiquadFilterNode.Q (AudioParam)." },
    "Q": { name: "Q (factor de calidad)", desc: "Define el ancho de banda del filtro alrededor del cutoff.", waa: "BiquadFilterNode.Q." },
    "TIME": { name: "Time", desc: "Ventana temporal visible (en scope) o tiempo de retardo (en delay).", waa: "AnalyserNode.fftSize / DelayNode.delayTime según contexto." },
    "T CV": { name: "Time CV", desc: "Modulación del tiempo de delay vía CV (produce chorus/flanger/pitch-shift).", waa: "CV conectado a DelayNode.delayTime (AudioParam)." },
    "FBK": { name: "Feedback", desc: "Cuánta señal se reinyecta a la entrada del delay para producir repeticiones.", waa: "GainNode en bucle de realimentación entre la salida y la entrada del DelayNode." },
    "MIX": { name: "Dry/Wet", desc: "Proporción entre señal limpia (dry) y procesada (wet).", waa: "Dos GainNodes en paralelo sumados a la salida (uno seco, uno con efecto)." },
    "DRIVE": { name: "Drive", desc: "Cantidad de saturación de la curva del wave shaper.", waa: "Multiplica la entrada antes de WaveShaperNode.curve." },
    "THRESH": { name: "Threshold", desc: "Umbral en dB por encima del cual el compresor empieza a actuar.", waa: "DynamicsCompressorNode.threshold (AudioParam, dB)." },
    "RATIO": { name: "Ratio", desc: "Cuánto se comprime la señal por encima del umbral (4:1, 8:1, etc.).", waa: "DynamicsCompressorNode.ratio (AudioParam)." },
    "ATK": { name: "Attack", desc: "Tiempo que tarda el compresor en reaccionar tras superar el umbral.", waa: "DynamicsCompressorNode.attack (AudioParam, s)." },
    "REL": { name: "Release", desc: "Tiempo que tarda en soltar la compresión tras bajar del umbral.", waa: "DynamicsCompressorNode.release (AudioParam, s)." },
    "OFFSET KNOB": { name: "Offset (DC)", desc: "Valor constante de salida.", waa: "ConstantSourceNode.offset." },
    "BITS": { name: "Profundidad de bits", desc: "Cuantización de la muestra: menos bits = más ruido y artefactos lo-fi.", waa: "AudioWorklet: `Math.round(x * 2^bits) / 2^bits`." },

    /* --- ADSR letras --- */
    "A": { name: "Attack", desc: "Tiempo de subida desde 0 al pico cuando llega el gate.", waa: "AudioParam.linearRampToValueAtTime al valor pico en `now + attack`." },
    "D": { name: "Decay", desc: "Tiempo de caída del pico al nivel de sustain.", waa: "AudioParam.linearRampToValueAtTime al sustain tras attack." },
    "S": { name: "Sustain", desc: "Nivel mantenido mientras el gate está activo.", waa: "Valor del AudioParam tras el decay, hasta que llegue el release." },
    "R": { name: "Release", desc: "Tiempo de caída a 0 cuando el gate se desactiva.", waa: "AudioParam.linearRampToValueAtTime(0, now + release)." },

    /* --- Puertos generales --- */
    "IN": { name: "Entrada de audio", desc: "Donde llega la señal a procesar.", waa: "AudioNode.connect(destino) — el destino expone una entrada." },
    "OUT": { name: "Salida de audio", desc: "De donde sale la señal procesada.", waa: "AudioNode (su salida 0); se conecta con .connect()." },
    "THRU": { name: "Through / Paso directo", desc: "Salida que repite la señal de entrada sin alterarla (útil en analizadores).", waa: "GainNode pass-through (`gain = 1`)." },
    "FM": { name: "FM — Frequency Modulation", desc: "Modulación de frecuencia: una señal modula la frecuencia del oscilador (timbres metálicos/inarmónicos).", waa: "AudioNode conectado a OscillatorNode.frequency (AudioParam)." },
    "L": { name: "Canal izquierdo", desc: "Salida/entrada del canal izquierdo (mono).", waa: "Output index 0 de un ChannelSplitterNode; input 0 de un ChannelMergerNode." },
    "R KNOB": { name: "Canal derecho", desc: "Salida/entrada del canal derecho (mono).", waa: "Output index 1 / input 1 de splitter/merger." },
    "L / ST": { name: "Entrada L o estéreo", desc: "Acepta una señal estéreo o solo el canal izquierdo si se conecta también R.", waa: "GainNode estéreo (channelCount = 2)." },
    "ST IN": { name: "Stereo In", desc: "Entrada estéreo (2 canales).", waa: "AudioNode con channelInterpretation `speakers` y channelCount 2." },
    "ST OUT": { name: "Stereo Out", desc: "Salida estéreo (2 canales).", waa: "ChannelMergerNode → AudioNode de 2 canales." },

    /* --- UI / Toolbar --- */
    "TENSIÓN": { name: "Tensión del cable", desc: "Controla cuánto cuelgan los cables (0 = cuelgan, 100 = rectos).", waa: "Parámetro puramente visual del SVG (curva Bézier de la ruta del cable)." },
    "TENSION": { name: "Tensión del cable", desc: "Controla cuánto cuelgan los cables.", waa: "Geometría SVG (no afecta al audio)." },
    "CABLE": { name: "Cable", desc: "Conexión vectorial (SVG path) entre un OUT y un IN. Su color es estético; el audio fluye igual.", waa: "AudioNode.connect(source, destino, outputIndex)." },
    "SUAVE": { name: "Movimiento suave", desc: "Suaviza el pan y zoom del lienzo con interpolación.", waa: "No relacionado a Web Audio; afecta el `transform` CSS de la superficie." },
    "SUAVE: OFF": { name: "Movimiento suave (desactivado)", desc: "El pan/zoom es instantáneo, sin interpolación.", waa: "Solo CSS transform." },
    "SUAVE: ON": { name: "Movimiento suave (activado)", desc: "El pan/zoom interpola hacia el destino.", waa: "Solo CSS transform." },
  },

  // --- Setup -----------------------------------------------------
  init() {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = "tip";
    document.body.appendChild(this.el);
    document.addEventListener("mouseover", (e) => this._over(e));
    document.addEventListener("mouseout", (e) => this._out(e));
    document.addEventListener("mousemove", (e) => this._move(e));
    // si arrastra algo, ocultar (no molestar mientras edita)
    document.addEventListener("mousedown", () => this._hide());
  },

  // --- Lookup ----------------------------------------------------
  _norm(s) { return (s || "").replace(/\s+/g, " ").trim().toUpperCase(); },

  _entry(text) {
    if (!text) return null;
    const k = this._norm(text);
    if (this.glossary[k]) return this.glossary[k];
    // limpiar prefijos típicos
    const stripped = k.replace(/^[+·•↵▾▴]+\s*/, "").replace(/\s*[▾▴↵]+$/, "").trim();
    if (stripped !== k && this.glossary[stripped]) return this.glossary[stripped];
    // intentar antes de un separador "·" o "/"
    const head = stripped.split(/\s*[·\/]\s*/)[0];
    if (head && this.glossary[head]) return this.glossary[head];
    // intentar el último token después de un separador (p.ej. "ADSR ENV" → ENV)
    const tail = stripped.split(/\s+/).pop();
    if (tail && this.glossary[tail]) return this.glossary[tail];
    // títulos de mixer: "4 CH MIXER", "8 CH MIXER" → MIXER
    if (/\bMIXER\b/.test(stripped)) return this.glossary["MIXER"];
    if (/\bADSR\b/.test(stripped)) return this.glossary["ADSR"];
    if (/\bSEQ\b/.test(stripped)) return this.glossary["SEQ"];
    if (/\bWAVE\s*SHAPER\b/.test(stripped)) return this.glossary["WAVE SHAPER"];
    return null;
  },

  // Selectores de elementos que muestran etiquetas técnicas.
  _candidate(el) {
    if (!el || !el.matches) return null;
    const SEL = ".knob__label, .port__label, .module__title, .group__label, .tiny-label, .switch-wave button, .module-list__cat, .mod-row__tx, .mod-card__tt";
    if (el.matches(SEL)) return el;
    // los botones del toolbar/mod no llevan clase específica para texto
    if (el.tagName === "BUTTON" && (el.classList.contains("btn") || el.classList.contains("power"))) return el;
    return null;
  },

  _textFromEl(el) {
    // tomar solo el texto directo, descartando <small>, <kbd> y subnodos icónicos
    const clone = el.cloneNode(true);
    clone.querySelectorAll("small, kbd, svg, .module__icon, .mod-row__ic, .mod-card__ic").forEach((n) => n.remove());
    return clone.textContent;
  },

  // --- Eventos ---------------------------------------------------
  _over(e) {
    const el = this._candidate(e.target);
    if (!el) { this._scheduleHide(); return; }
    if (el === this.current) return;
    const entry = this._entry(this._textFromEl(el));
    if (!entry) { this._scheduleHide(); return; }
    this.current = el;
    clearTimeout(this._t);
    this._t = setTimeout(() => this._show(entry, e), this.delay);
  },

  _out(e) {
    if (e.target === this.current) this._scheduleHide();
  },

  _scheduleHide() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this._hide(), 80);
  },

  _hide() {
    clearTimeout(this._t);
    this.current = null;
    if (this.el) this.el.classList.remove("show");
  },

  _move(e) {
    if (this.el && this.el.classList.contains("show")) this._place(e.clientX, e.clientY);
    this._lastX = e.clientX; this._lastY = e.clientY;
  },

  _show(entry, e) {
    this.el.innerHTML =
      `<div class="tip__name">${entry.name}</div>` +
      `<div class="tip__desc">${entry.desc}</div>` +
      (entry.waa ? `<div class="tip__waa"><span class="tip__waa-tag">Web Audio API</span> ${entry.waa}</div>` : "");
    this.el.classList.add("show");
    this._place(this._lastX ?? e.clientX, this._lastY ?? e.clientY);
  },

  _place(cx, cy) {
    const pad = 14;
    this.el.style.left = (cx + pad) + "px";
    this.el.style.top = (cy + pad) + "px";
    const r = this.el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (r.right > W - 6) this.el.style.left = Math.max(6, cx - r.width - pad) + "px";
    if (r.bottom > H - 6) this.el.style.top = Math.max(6, cy - r.height - pad) + "px";
  },
};

window.Tooltips = Tooltips;
document.addEventListener("DOMContentLoaded", () => Tooltips.init());
