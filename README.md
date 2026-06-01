# WebAudioRack

Un **eurorack modular** construido sobre la **Web Audio API** (W3C). Cada módulo es un nodo (o conjunto de nodos) de audio que se interconecta con otros a través de sus entradas y salidas para crear *patches* y enrutar la señal hasta la interfaz de audio. Inspirado en **VCV Rack**.

Hecho en **JavaScript vanilla, sin build ni dependencias** — corre directamente desde cualquier servidor estático.

---

## Características

- **Señal unificada estilo VCV**: un solo tipo de cable. Cualquier salida (`OUT`) conecta a cualquier entrada (`IN`), incluyendo parámetros de control (CV) — un LFO puede modular el cutoff de un filtro igual que enviar audio.
- **Patching visual**: arrastra de un `OUT` a un `IN` para cablear; los cables cuelgan con una curva tipo catenaria y llevan conectores del color del cable en las puntas. Clic en un cable para quitarlo.
- **Lienzo infinito** con navegación: scroll/trackpad multidireccional para desplazarte, `Shift + scroll` para zoom hacia el cursor, y arrastrar el espacio vacío para mover el área de trabajo.
- **Grilla magnética** estilo eurorack: los módulos se alinean a filas y se empujan entre sí sin solaparse.
- **Sistema de diseño / UI kit** propio: perillas, faders, LEDs, pantallas, jacks y paneles, con iconos lineales por módulo.
- **Actividad de señal**: cada salida tiene un LED que parpadea según el nivel.
- **Mixers** de 4 y 8 canales (nivel, pan y mute por canal) y **salida estéreo**.
- **Cajón de cables**: elige el color de los cables nuevos o recolorea todos.

---

## Módulos

**Fuentes** — VCO (oscilador), LFO, Noise, CV/Offset, ADSR (envolvente), Sequencer 8, Sampler, Media Player.

**Procesadores** — VCA (ganancia), VCF (filtro Biquad, 8 tipos), IIR, Delay, Reverb (convolución), Compressor, WaveShaper (distorsión), Bitcrusher (AudioWorklet).

**Estéreo** — Stereo Panner, 3D Panner (HRTF), Split L/R, Merge L/R, Listener.

**Mezcla** — Mixer 4ch, Mixer 8ch.

**Salida** — Scope (osciloscopio + espectro), Output (estéreo con VU y selección de interfaz), Recorder (graba a archivo).

**I/O** — Device: interfaz de audio con hasta 4 entradas y 4 salidas (normalmente 2+2 estéreo).

Cubre prácticamente todo el grafo de nodos de la Web Audio API.

---

## Cómo ejecutar

Requiere servirse desde **`localhost`** (contexto seguro), porque el AudioWorklet, el micrófono y la selección de salida (`setSinkId`) no funcionan abriendo el archivo directamente (`file://`).

Con **MAMP**: copia la carpeta en `htdocs/` y abre `http://localhost:8888/WebAudioRack/`.

O con cualquier servidor estático:

```bash
# Python
python3 -m http.server 8000
# luego abre http://localhost:8000

# Node
npx serve
```

Pulsa **ON** (o la barra espaciadora) para iniciar el audio.

---

## Controles

| Acción | Atajo |
| --- | --- |
| Encender / apagar audio | botón **ON/OFF** o **Espacio** |
| Abrir menú de módulos | botón **+ Añadir módulo** o **Enter** |
| Buscar y agregar módulo | escribe en el buscador, **Enter** agrega el primero |
| Cablear | arrastra de un **OUT** a un **IN** |
| Quitar un cable | clic sobre el cable |
| Seleccionar módulo | clic sobre el módulo |
| Borrar módulo seleccionado | **Supr / Retroceso** |
| Mover el lienzo | scroll/trackpad, o arrastrar el vacío |
| Zoom | **Shift + scroll** (hacia el cursor) |

---

## Arquitectura

```
WebAudioRack/
├─ index.html
├─ css/
│  ├─ design-system.css   # tokens + componentes del UI kit
│  └─ rack.css            # layout, toolbar, cables, grilla
└─ js/
   ├─ core/
   │  ├─ engine.js        # AudioContext, worklet, setSinkId
   │  ├─ patch.js         # puertos, cables, señal unificada
   │  ├─ layout.js        # grilla magnética
   │  ├─ viewport.js      # pan + zoom del lienzo
   │  ├─ icons.js         # iconos SVG por módulo
   │  ├─ module.js        # clase base + widgets (knob, fader, jack…)
   │  └─ rack.js          # catálogo y gestión de módulos
   ├─ modules/
   │  ├─ sources.js       # fuentes
   │  ├─ processors.js    # procesadores / efectos
   │  ├─ mixers.js        # mixers
   │  ├─ io.js            # scope y salida
   │  └─ advanced.js      # worklet, device, recorder, listener
   └─ main.js             # arranque, toolbar, atajos
```

Agregar un módulo nuevo = una subclase de `Module` registrada con `registerModule(...)`; aparece automáticamente en el menú.

---

## Stack

Vanilla JS (módulos por `<script>`), Web Audio API y SVG. Sin framework, sin bundler, sin dependencias en runtime.
