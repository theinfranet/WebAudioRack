# WebAudioRack — Master Plan de UI

Roadmap completo derivado de la auditoría de la UI actual. Pensado para ejecutarse
incrementalmente en sesiones futuras de Claude (Opus 4.8). Cada tarea trae
**contexto técnico** suficiente para retomarla sin releer todo el código.

---

## 0. Contexto rápido del proyecto

- Vanilla JS, sin build, sin deps. Carga por `<script>` en `index.html`.
- Globals expuestos: `Engine`, `Patch`, `Rack`, `Layout`, `Viewport`, `MODULES`, `registerModule`, `ICONS`.
- Clase base de módulo: `class Module` en `js/core/module.js` con helpers `addKnob`, `addFader`, `addPort`, `addLED`, `addScreen`, `addSelect`, `addButton`, `addWaveSwitch`, `row`, `group`.
- Registro: `registerModule({ id, name, cat, desc, make: (def) => new Foo(def) })`.
- Sistema de patching: `Patch.connect(out, in)`, `Patch.removeCable(c)`, `Patch.cables[]`, `Patch.ports` (Map). Señal unificada — cualquier `out` puede ir a cualquier `in` (audio o `AudioParam`).
- Layout magnético: `Layout.placeAt(mod, x, y)` / `placeNew(mod)` / `drag(mod,x,y)` con `ROW_H=340`, `GRID=6`, `GAP=2`.
- Viewport: `Viewport.zoom`, `panX/Y`, `centerOn(wx,wy,immediate)`, `_zoomAt`.
- Coordenadas: el `surface` aplica un `transform: translate(...) scale(...)`. Para convertir cliente→mundo: `(clientX - rect.left) / zoom` (y restar pan según contexto). Ver `Patch.center(port)` como referencia.

**Reglas de oro al editar:**
- No introducir bundler ni dependencias.
- Cada feature debería seguir la misma estética (negro plano, sin gradientes adicionales).
- Mantener compatibilidad con el `registerModule` existente.
- Probar siempre con el patch inicial (`vco → vcf → scope → output`).

---

## TIER 1 — Lo crítico ausente

### T1.1 · Save / Load de patches
**Problema:** todo se pierde al refrescar.

**Diseño:**
- Modelo serializable por módulo: añadir en `class Module` un método `serialize()` que devuelva `{ id: defId, x, y, params: {...}, state: {...} }`. Default base que serializa `controls` (cada `addKnob`/`addFader` ya guarda un `api` con `value` y `set`); cada subclase puede sobrescribir si tiene estado adicional (sequencer steps, sampler buffer URL, etc.).
- Cable: `{ out: { modIdx, portIdx }, in: { modIdx, portIdx }, color }`.
- Patch completo: `{ version: 1, viewport: { panX, panY, zoom }, modules: [...], cables: [...], tension, cableColor }`.

**Implementación:**
1. En `Module`: `serialize()` base que recorre `this.controls` con `.value` y mapea por índice. Añadir `controlId` opcional al crear controles (segundo arg o key) para mapear por nombre en vez de índice — más robusto.
2. En cada módulo con estado extra (Sampler, Sequencer, Player, Recorder, VCF type, Wave type, etc.) override `serialize()` y `deserialize(state)`.
3. En `Rack`: `Rack.toJSON()` y `Rack.fromJSON(json)`. `fromJSON` limpia todo (`modules.slice().forEach(m=>m.dispose())`, `Patch.cables.slice().forEach(c=>Patch.removeCable(c))`), reconstruye módulos en orden y luego cables (resolviendo por índice `modIdx`).
4. UI toolbar: tres botones `💾 Guardar`, `📂 Cargar`, `⤓ Exportar`. Guardar → `localStorage.setItem('webaudiorack.patch', JSON.stringify(...))`. Cargar → recupera. Exportar/Importar → archivo `.wapatch` (JSON).
5. Autosave cada 10s en `localStorage` con key separada (`webaudiorack.autosave`), restaurar al abrir tras prompt si existe.

**Edge cases:**
- Samples/buffers de archivo no serializan — guardar nombre y avisar que hay que recargar.
- Permissions del Device — no auto-activar al cargar, dejar el botón ACTIVAR.

**Archivos a tocar:** `js/core/module.js`, `js/core/rack.js`, `js/core/patch.js`, todos los módulos con estado, `js/main.js`, `index.html` (botones), `css/rack.css`.

---

### T1.2 · Undo / Redo
**Diseño:**
- Stack de comandos `{ do(), undo() }` con tamaño máximo (e.g. 100).
- Atajos: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z.
- Comandos a implementar: `AddModule`, `RemoveModule`, `MoveModule(oldX,oldY,newX,newY)`, `Connect`, `Disconnect`, `ChangeParam(control, oldV, newV)`.

**Implementación:**
1. Nuevo archivo `js/core/history.js`: `const History = { stack:[], cursor:0, push(cmd), undo(), redo(), canUndo(), canRedo() }`.
2. Wrapping mínimo: en lugar de llamar directamente `Rack.add`, `Patch.connect`, etc., toda la app pasa por `History.do(new XxxCommand(...))`. Para no reescribir todo, exponer funciones tipo `Actions.add(id, pos)`, `Actions.connect(out, in)` que dentro empujan a History.
3. Para knobs: ya tienen `onChange`. Añadir agrupación temporal — cuando el usuario empieza a arrastrar, capturar `valueAtStart`; al `mouseup`, push de un único `ChangeParam` con `oldV → finalV`. Ver `addKnob` en `module.js`, agregar callback `onBegin` y `onEnd`.
4. Botones en toolbar opcionales `↶ ↷` que reflejen `canUndo/canRedo`.

**Trampa:** los comandos deben tener referencia al *módulo* y *puerto* por id estable, no por objeto (porque undo de "borrar" debe re-crear con el mismo id; agrega `Rack.add(id, pos, forceModuleId)` opcional).

---

### T1.3 · Selección múltiple
**Diseño:**
- `Rack.selection: Set<Module>` reemplazando o complementando `Rack.selected`.
- Modos de selección:
  - Click sobre módulo → reemplaza selección.
  - Shift+click → toggle en selección.
  - Marquee: drag con botón izquierdo *desde el vacío* dibuja rectángulo (hoy ese drag hace pan). Decisión: marquee con `Alt+drag` o `Shift+drag` desde vacío.
- Acciones sobre selección: mover (drag uno mueve todos manteniendo offset), borrar, duplicar.

**Implementación:**
1. Refactor `Rack.select(mod)` → `selectOne(mod)`, `selectAdd(mod)`, `selectRemove(mod)`, `selectAll()`, `deselect()`. Mantener `Rack.selected` como `[...selection][0]` por compat.
2. `class Module._makeDraggable`: si el módulo arrastrado pertenece a `Rack.selection`, mover todos los de la selección con el mismo delta. Layout actual empuja vecinos individualmente — habrá que repensar resolver para no auto-empujarse a sí mismos (pasar `Set` como `except`).
3. Marquee: capa SVG/div absoluta sobre `rack-surface`. Calcular intersección con bounding boxes de módulos en coords mundo.
4. Atajos: Ctrl+A → todo, Esc → deselect, Delete → borrar selección entera.

---

### T1.4 · Duplicar módulo + Copy/Paste
**Diseño:**
- Ctrl+D duplica selección desplazada 1 fila o a la derecha.
- Ctrl+C / Ctrl+V con clipboard interno (no portapapeles del SO al inicio; v2: JSON al SO clipboard).
- Reutiliza serialize/deserialize de T1.1.

**Implementación:**
1. `Actions.duplicate(mods)`: serializa, deserializa con nuevos ids, desplaza posiciones, NO duplica cables externos (sólo cables interiores a la selección, si se quiere — empezar sin cables).
2. `Actions.copy(mods)` guarda en `Rack.clipboard`. `Actions.paste()` recrea en posición del cursor o desplazado.

---

### T1.5 · Menú contextual (click derecho)
**Diseño:**
- Un único componente `ContextMenu` reutilizable: `ContextMenu.open(x, y, items)` donde `items = [{ label, onClick, icon?, separator?, submenu? }]`.
- Variantes según target:
  - Knob: "Entrada numérica…", "Reset", "Fine (Shift+drag)", "Copy value", "Paste value", "MIDI learn" (placeholder).
  - Cable: "Borrar", "Color…", "Resaltar extremos".
  - Módulo (header): "Renombrar", "Duplicar", "Borrar", "Bring to front", "Bypass" (próximo).
  - Puerto: "Desconectar todo", "Color cable", info de la conexión.
  - Vacío del lienzo: "Pegar", "Añadir módulo aquí…", "Centrar vista".

**Implementación:**
1. Archivo `js/core/contextmenu.js`. Crea un `<div class="ctx-menu">` con items, posicionado en coords cliente, cerrado al click fuera/Escape.
2. Suprimir `contextmenu` browser por defecto (`e.preventDefault()`) sólo en targets válidos.
3. CSS plano oscuro, ancho ~180px, ítems 28px alto, separator 1px `var(--panel-line)`.

---

## TIER 2 — Pulido modular

### T2.1 · Indicador de modulación en knob
**Problema:** los CV cableados a `AudioParam` modulan invisiblemente. VCV dibuja un arco animado que muestra el rango efectivo del valor modulado.

**Diseño:**
- Cuando un `Port` con `kind: "cv"` recibe cable (es `AudioParam`), localizar el knob asociado a ese param. Hoy no hay relación directa — añadir `addKnob({...})` un campo opcional `param` que apunte al `AudioParam` y registrarlo en `module.paramLinks: Map<AudioParam, knobApi>`.
- En `Patch._loop()`, además del LED, samplear el nivel actual del cable saliente y calcular el rango (peak ± promedio del último N frames). Convertir a delta en unidades del knob (cuidado: depende de la curva `mapping`).
- Render: dial knob ya tiene un anillo. Añadir un segundo arco SVG superpuesto con color `--accent` translúcido marcando `[base-delta, base+delta]`.

**Implementación incremental:**
1. Primero: link param↔knob al construir el módulo.
2. Segundo: anillo SVG estático (no animado) que muestra "este param está modulado" sin medir.
3. Tercero: medición y arco animado.

---

### T2.2 · Atenuverter inline en CV inputs
**Diseño:**
- Cada `addPort(dir:"in", node:AudioParam, kind:"cv")` opcionalmente recibe `attenuverter: true`. Inserta un mini-knob bipolar a la izquierda del jack.
- Bajo el capó: el `AudioParam` no se conecta directamente; se inserta un `GainNode` cuyo `gain` es controlado por el mini-knob (rango -1..+1, dblclick reset 0). El cable real va a la `GainNode.input`, y la `GainNode` se conecta al `AudioParam`.

**Implementación:**
1. En `Module.addPort`, si `opts.attenuverter`, crear `GainNode`, conectar a `node` (el param), exponer puerto que apunta a `GainNode` en lugar del param.
2. CSS: `.port.has-attn` con flex que pone un `.knob.mini` (28×28) a la izquierda del jack.
3. Aplicar al menos en: `VCO.frequency`, `VCO.detune` (1V/OCT), `VCF.frequency`, `Delay.delayTime`, `VCA.gain`, `Panner.pan`.

---

### T2.3 · Hover cable → resaltar + jump
**Diseño:**
- Mouseenter en cable → aumentar grosor del path, resaltar ambos jacks (`.connected.highlighted`), tooltip flotante `Módulo A · OUT → Módulo B · CUT CV`.
- Doble-click en cable → centrar viewport en el extremo opuesto a donde está el cursor (útil para patches grandes).

**Implementación:**
1. Ya existe `hover` class en `Patch._draw`. Añadir handlers para tooltip y para resaltar `cable.out.el` y `cable.in.el`.
2. Tooltip: usar `<div class="cable-tip">` reposicionado en `mousemove`.
3. Doble click: calcular distancia a ambos extremos en pantalla, `Viewport.centerOn` del más lejano.

---

### T2.4 · Aviso al reemplazar conexión
**Problema:** `Patch.connect` elimina silenciosamente el cable previo si la entrada ya estaba ocupada.

**Diseño:**
- Cuando hay reemplazo: animar el cable saliente con fade-out (200ms con clase CSS `.cable.removing`) antes de eliminarlo, y mostrar pequeño toast "Conexión reemplazada".
- Toast: helper `UI.toast(msg, ms)` reutilizable.

---

### T2.5 · Tooltips en jacks
- Hover sobre `.jack` muestra `<modulo>.<label> [audio/cv]`.
- Reutiliza el sistema de tooltip de T2.3.

---

## TIER 3 — Navegación y layout

### T3.1 · Minimap
**Diseño:**
- Esquina inferior izquierda, 200×140 px, fondo translúcido.
- Cada módulo = rectángulo escalado. Viewport = rectángulo con borde `--accent`.
- Click/drag dentro = `Viewport.centerOn`.

**Implementación:**
- Nuevo archivo `js/core/minimap.js`. Canvas 2D refrescado cada 200ms (solo cuando cambia algo: rastrear `Rack.modules.length`, posiciones, viewport).
- Botón "−" para colapsar.

---

### T3.2 · Atajos de vista
- `F` → fit to selection (o todo el patch si nada seleccionado). Ya existe `centerOn` y el cálculo de bounding box en `main.js` final — extraer a `Viewport.fitTo(boxes)`.
- `0` → reset zoom 100% manteniendo centro.
- `1`-`9` → bookmarks de viewport (Shift+N para guardar, N para saltar).

---

### T3.3 · Zoom % clickable
- El `#zoomValue` actual se convierte en botón. Click → input numérico (50-260). Doble-click → 100%.

---

### T3.4 · Drag desde catálogo
**Diseño:**
- En el modal de añadir módulo, los items son arrastrables. Al iniciar drag, el modal se vuelve semi-transparente y se sigue al cursor con un ghost del módulo. Drop → `Rack.add(id, {x,y})` en coords mundo del cursor.

**Implementación:**
1. `mousedown` en `.mod-row`/`.mod-card`: marcar dragSource, ocultar modal (no cerrar) con opacidad 0.15 y `pointer-events: none` para ver el rack.
2. Crear ghost element siguiendo cursor.
3. `mouseup`: calcular pos mundo, `Rack.add(id, pos)`, cerrar modal.

---

### T3.5 · Reasignación de Space
**Problema:** Space hoy = power, choca con la convención Figma/Photoshop de "hold space para pan".

**Decisión propuesta:**
- Power → mover a `Ctrl+.` o botón solo. Space queda libre.
- Space mantenido + drag → pan (cursor `grab` mientras está presionado).
- Alternativa: dejar Space=power, añadir middle-click drag como pan extra.

Documentar en README el cambio.

---

### T3.6 · Ghost de destino al arrastrar
**Diseño:**
- Mientras `Layout.drag` posiciona un módulo, dibujar un `<div class="drop-ghost">` en el destino final (snap a fila + slot). Hoy ya se calcula `snapRow/snapX`; sólo añadir el ghost.

---

## TIER 4 — Módulos UI nuevos

Cada uno añade widgets/affordances nuevos al UI kit.

### T4.1 · Quantizer
- Dropdown de escala (chromatic, major, minor, pentatonic, dorian, phrygian…).
- Tónica seleccionable.
- IN CV (volts/oct semis) → cuantiza al nearest grado de la escala → OUT CV.
- Visualización: piano-roll mini (12 leds) mostrando notas activas.

### T4.2 · Sample & Hold + Slew Limiter
- **S&H**: IN, TRIG; en cada gate alto, captura valor de IN y mantiene hasta el próximo. Implementación: `ScriptProcessor`/`AudioWorklet` o un truco con `ConstantSource.setValueAtTime`.
- **Slew**: IN, RISE, FALL; suavizado one-pole asimétrico. `BiquadFilter` o IIR custom.

### T4.3 · MIDI Input
- Web MIDI API. Selector de device. OUT: CV (notas como volts), GATE, VELOCITY.
- UI: piano roll mini iluminando notas activas; selector de modo (mono, poly stack, last-note).

### T4.4 · Teclado virtual qwerty
- Mapa AWSEDFTGYHUJ → C..B. Octava ± con Z/X.
- Visual: dos octavas de piano clickeables.
- OUT: CV + GATE.

### T4.5 · Clock + Clock Divider
- **Clock**: BPM master, OUT pulse + divisiones /2 /4 /8.
- **Divider**: IN clock, 8 OUTs dividos /1 /2 /3 /4 /8 /16 /32 /64.

### T4.6 · Multiples (1→N)
- Trivial: passthrough con N salidas. UI muy compacta (1 IN, 4 OUT).
- Bajo el capó: una `GainNode(1)` con `.connect` múltiple.

### T4.7 · Macro knob
- 1 knob → hasta 4 destinos asignables con scale individual y offset. Drag&drop del knob al jack destino para asignar (afín a click+modulate de DAW modernas).

### T4.8 · Vectorscope / Goniometer / Spectrogram
- Vectorscope XY (L vs R en canvas).
- Spectrogram waterfall (cada frame nueva línea desplazada).
- Reutilizan `addScreen`.

---

## TIER 5 — QoL y pulido final

### T5.1 · Renombrar módulo
- Doble-click en `.module__title` → input editable inline.
- Persistir en `serialize()` como `customTitle`.

### T5.2 · Panel de performance + medidor master ✅ HECHO
**Implementado** (en lugar de "status bar útil" del plan original): un panel completo
entre la toolbar y el rack que también sirve como inspector del flujo de audio.

**Archivos tocados:** `js/core/engine.js`, `js/core/patch.js`, `js/main.js`, `index.html`, `css/rack.css`.

**Qué expone (todo refrescado a ~30Hz):**
- `ESTADO` — `AudioContext.state` (RUN / SUSP / CLOSED) con pill de color.
- `SR` — sample rate en kHz.
- `LATENCIA` — `baseLatency + outputLatency` en ms (lo único auténtico que la API
  reporta sobre el round-trip de audio).
- `FRAME` — `tickAvg / driftMs`. El **drift** compara el avance de
  `audioContext.currentTime` contra `performance.now()` entre ticks: cerca de 0
  ms = sin glitches; > 5 ms positivo = el motor de audio se quedó atrás (xrun
  real). Es la única métrica fiable de "salud" de audio en JS — el viejo `CPU%`
  del plan original no es accesible desde la Web Audio API.
- `CLOCK` — `audioContext.currentTime` en segundos (solo avanza si el motor
  procesa audio; útil para ver de un vistazo si está corriendo).
- `GRAFO` — `nMod · nCbl`.
- `OUT L/R` — VU master con barra RMS verde→ámbar→rojo y marca de pico con
  caída lenta; texto dB con clip a +0 dBFS en rojo.
- Espectro master (canvas) con mapeo logarítmico para ver bien todo el rango
  audible.

**Cómo se mide sin romper el grafo:** en `Engine.init()` se crean taps no
destructivos antes del `destination`:
- `master → masterAnalyser` (1024 FFT, smoothing 0.6) → `Engine.spectrum()`.
- `master → ChannelSplitter(2) → anL / anR` (512 FFT cada uno) → `Engine.meter()` devuelve `{peakL, peakR, rmsL, rmsR}`.

Estos tres `.connect()` adicionales no consumen la señal: la salida real sigue
yendo a `destination` por su rama propia. La salida vieja `toolbar__status` se
oculta (`display:none`) en lugar de borrarse — código aún referenciable si se
quiere reactivar.

---

### T5.2b · Comportamiento DAW en background ✅ HECHO
**Problema:** `requestAnimationFrame` se throttea a ~1Hz cuando la pestaña pierde
foco (otra ventana al frente, minimizada). Para una herramienta tipo DAW que se
usa al lado de Ableton/Reaper, eso significa medidores y LEDs congelados.

**Solución implementada:**
1. `Patch._loop()` (LEDs de actividad de outputs) → migrado de `rAF` a
   `setInterval(tick, 33)`. Chrome y Firefox **NO throttean `setInterval` cuando
   hay un `AudioContext` activo** — los LEDs siguen pulsando a 30Hz aunque la
   pestaña esté oculta.
2. Panel de performance → mismo cambio (setInterval 33ms). Skip del repintado
   del canvas del espectro cuando `document.hidden` (el navegador no
   compositea, ahorramos CPU).
3. `visibilitychange` resetea `lastTickT/lastWallT/lastAudioT` al volver, para
   que `tickAvg` y `driftMs` no falsifiquen un pico tras una pausa larga en
   background.

**No tocado intencionalmente:** `Module.raf()` (animaciones por módulo — scopes,
spectrum analyzer) sigue usando `rAF`. No tiene sentido dibujar un osciloscopio
que nadie está mirando. Si en el futuro se quiere que el SCOPE también siga
muestreando para latencia 0 al reenfocar, replicar la misma estrategia
(`setInterval` + skip de repintado si `document.hidden`).

**Nota:** el audio en sí **siempre** sigue corriendo en background — `AudioContext`
procesa en su propio hilo independiente de la pestaña. Lo que arreglamos es solo
la UI de medición.

### T5.3 · Indicador de problemas
- Lint pasivo cada 2s: si hay módulos source sin ningún OUT cableado → badge amarillo en su header. Loops detectados → badge rojo. Tooltip explicativo.

### T5.4 · Touch / pinch zoom
- `pointerdown`/`pointermove` con tracking de 2 dedos. Pinch → zoom hacia centroide. Pan con un dedo.
- Inputs hoy son `mousedown` puros — migrar a Pointer Events para que móvil/táctil funcione.

### T5.5 · i18n
- Diccionarios `i18n.es` / `i18n.en`. Toggle en toolbar. Detectar `navigator.language` por defecto.
- Strings hardcoded a extraer en toolbar, modal, mensajes, tooltips. Nombres de módulos también (`MODULES` ya tiene `name` y `desc` — añadir `names: { es, en }`).

### T5.6 · Modo "performance"
- Toggle en toolbar. Cuando está activo, los módulos colapsan a header + jacks (oculta knobs/screens). Permite ver muchos módulos a la vez.

### T5.7 · Bypass por módulo
- Click derecho módulo → "Bypass". Mientras está activo: inserta dry passthrough entre el primer IN audio y el primer OUT audio del módulo, desviando los nodos internos. Visual: módulo con overlay diagonal.

---

## Bugs a aprovechar y arreglar de paso

1. `js/modules/sources.js:57` — `new Float32Array(this.osc ? 1 : 1)` es código muerto: borrar.
2. `js/core/module.js:35` — `mousedown` selecciona desde cualquier hijo (incluyendo knob/jack). Considerar limitar a `target.closest('.module__header')` o capturar sólo si el target no es un control interactivo.
3. `js/core/patch.js:226` — el reemplazo silencioso ya documentado en T2.4.
4. `Output` (`js/modules/io.js`) no documenta visualmente la asimetría `L/ST` vs `R`. Añadir tooltip o label más explícita.
5. `js/main.js:102` — el `blur` en Space puede ser molesto cuando el foco está intencionalmente en un control (e.g. tipear en input numérico futuro). Revisar al reasignar Space (T3.5).
6. ~~`Patch._loop` corre `requestAnimationFrame` aunque no haya señal…~~ ✅ Migrado a `setInterval(33ms)` en T5.2b. La preocupación original (rAF "vacío") se diluye: setInterval a 30Hz con un bucle que solo lee analysers ya conectados tiene coste insignificante. Si se quiere una optimización extra, *pausar* el `setInterval` cuando `Engine.ctx.state !== 'running'` (con `clearInterval`/restart en `resume()`/`suspend()`) sería trivial pero opcional.

---

## Orden sugerido de ejecución

1. **Sprint 1 (fundacional):** T1.1 (save/load) + T1.2 (undo) en paralelo, porque ambos necesitan el modelo `serialize/deserialize`. T1.5 (context menu) trae el componente base que muchas otras features reutilizarán.
2. **Sprint 2 (selección + duplicación):** T1.3 + T1.4. Aprovecha undo del sprint 1.
3. **Sprint 3 (identidad modular):** T2.1 + T2.2 + T2.3 + T2.4 + T2.5. Es lo que "hace sentir VCV".
4. **Sprint 4 (navegación):** T3.1 + T3.2 + T3.3 + T3.5 + T3.6. T3.4 al final del sprint, requiere refactor del modal.
5. **Sprint 5 (módulos nuevos):** T4.6 (multiples, trivial) → T4.5 (clock) → T4.4 (qwerty) → T4.1 (quantizer) → T4.2 (S&H + slew) → T4.3 (MIDI) → T4.7 (macro) → T4.8 (visualizadores).
6. **Sprint 6 (QoL):** T5.* en cualquier orden. T5.4 (touch) es el más complejo, último.

---

## Convenciones para futuras sesiones

- **Una feature = un commit** cuando sea posible, mensaje en español.
- Mantener `MASTERPLAN.md` actualizado: marcar tareas con `[x]` al completar y añadir notas de implementación bajo cada una.
- Al añadir un módulo nuevo, recordar:
  - Añadir entrada en `js/core/icons.js` (`ICONS[id]`).
  - `registerModule({ id, name, cat, desc, make })`.
  - Asegurar `onDispose` para parar nodos.
- Al añadir un widget al UI kit, añadirlo en `Module` con la misma API que el resto (`(parent, def) => api`).
- Para cualquier persistencia: incrementar `version` del JSON y manejar migraciones.

---

## Checklist consolidado

### Tier 1 (crítico)
- [ ] T1.1 Save/load + autosave
- [ ] T1.2 Undo/redo
- [ ] T1.3 Selección múltiple + marquee
- [ ] T1.4 Duplicar + copy/paste
- [ ] T1.5 Menú contextual reutilizable

### Tier 2 (pulido modular)
- [ ] T2.1 Indicador de modulación en knob
- [ ] T2.2 Atenuverters inline
- [ ] T2.3 Hover cable + jump to other end
- [ ] T2.4 Toast al reemplazar conexión
- [ ] T2.5 Tooltips en jacks

### Tier 3 (navegación)
- [ ] T3.1 Minimap
- [ ] T3.2 Atajos de vista (F, 0, bookmarks)
- [ ] T3.3 Zoom % clickable
- [ ] T3.4 Drag desde catálogo
- [ ] T3.5 Reasignar Space → pan
- [ ] T3.6 Ghost de destino

### Tier 4 (módulos)
- [ ] T4.1 Quantizer
- [ ] T4.2 Sample & Hold + Slew
- [ ] T4.3 MIDI Input
- [ ] T4.4 Teclado qwerty
- [ ] T4.5 Clock + Divider
- [ ] T4.6 Multiples
- [ ] T4.7 Macro knob
- [ ] T4.8 Vectorscope / Spectrogram

### Tier 5 (QoL)
- [ ] T5.1 Renombrar módulo
- [x] T5.2 Panel de performance + medidor master (incluye T5.2b: DAW-friendly background)
- [ ] T5.3 Indicador de problemas
- [ ] T5.4 Touch / pinch zoom
- [ ] T5.5 i18n
- [ ] T5.6 Modo performance
- [ ] T5.7 Bypass por módulo

### Bugfixes
- [ ] Borrar dead code en `sources.js:57`
- [ ] Acotar selección en `module.js:35`
- [ ] Aclarar UI de `Output` L/ST vs R
- [ ] Revisar `blur` en Space (al reasignar)
- [~] Pausar `Patch._loop` cuando Engine suspendido (mitigado: ahora es setInterval, ver T5.2b)
