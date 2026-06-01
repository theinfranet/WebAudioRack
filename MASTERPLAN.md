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

> **✅ HECHO (Sprint 1).** Implementación final (se desvió un poco del diseño de abajo, a mejor):
> - Modelo: `Module.serialize()` devuelve `{ type, x, y, params:[...], title?, state? }`. En lugar de `controlId`, **todos** los controles con estado (knob, fader, **select y wave-switch**) se registran en `this.controls` en orden de creación, y se serializan **por índice** (array `params`). Orden de construcción determinista ⇒ mapeo estable. `addSelect(..., { persist:false })` excluye los selects de dispositivo (Output/Device), cuyo `deviceId` no es portable.
> - `Module.deserialize(data)` reaplica `params[i] → controls[i].set(v)`. Se arregló `addFader` para que `set()` dispare `onChange` (antes solo movía el thumb ⇒ el audio no recuperaba la ganancia).
> - `Rack.toJSON()` / `Rack.fromJSON(json, {viewport})`. Cables serializados como `{ out:[modIdx,portIdx], in:[modIdx,portIdx], color }`; `fromJSON` limpia (dispose all + removeCable all), reconstruye por `spawnExact` (posición exacta, sin reflow) y reconecta por índice. `Patch.connect(out,in,color)` admite color para conservarlo.
> - UI: botones `GUARDAR / CARGAR / EXPORT / IMPORT` en la toolbar. Guardar/Cargar → `localStorage['webaudiorack.patch']`. Export/Import → archivo `.wapatch` (JSON). Autosave cada 10 s en `webaudiorack.autosave` + al `beforeunload`; al abrir ofrece **restaurar** la sesión anterior con un toast no bloqueante (`UI.toast`).
> - Edge cases: buffers de Sampler/Player NO se serializan (hay que recargar el archivo); Device no persiste deviceId.
> - **Archivos nuevos:** `js/core/persistence.js`, `js/core/ui.js`. **Tocados:** `module.js`, `rack.js`, `patch.js`, `io.js`, `advanced.js`, `index.html`, `css/sprint1.css`.

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

> **✅ HECHO (Sprint 1) — por INSTANTÁNEAS, no por comandos inversos.** Decisión de diseño: el patrón comando `{do,undo}` de abajo es frágil (referencias colgantes tras recrear módulos, reemplazo silencioso de cables al conectar, etc.). En su lugar `js/core/history.js` guarda **snapshots** completos (`JSON.stringify(Rack.toJSON())`, máx. 100) y deshacer = `Rack.fromJSON(prev, {viewport:false})`. Correcto por construcción y reutiliza toda la infra de T1.1.
> - **Coalescencia:** `History.record()` no captura de inmediato; agenda un microtask. Varias llamadas en el mismo turno síncrono (p. ej. borrar un módulo = quitar N cables + dispose) colapsan en **un solo** snapshot ⇒ un solo paso de undo. Verificado con test funcional (jsdom).
> - **Hooks** (con guarda `History.suspended`): `Rack.add`, `Module.dispose`, `Patch.connect`/`removeCable`/`setCableColor`, fin de arrastre de knob/fader/módulo, y `change` de select/wave. No registra durante boot ni durante un restore.
> - Atajos: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`. Botones `↶ ↷` en la toolbar reflejan `canUndo/canRedo` (`History.bindButtons`). `undo/redo` NO mueve el encuadre (menos desorientador).
> - Nota: `window.History` pisa el constructor nativo `History` del navegador (no se usa); las guardas son `window.History && History.record`.

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

> **✅ HECHO (Sprint 2).** `Rack.selection: Set<Module>` con `selected` mantenido como "primario" por compat. API: `selectOne` (clic), `selectAdd`, `selectToggle` (Shift+clic), `selectAll` (Ctrl/Cmd+A), `deselect` (Esc/clic en vacío), `isSelected`, `selectionList`; `select()` quedó como alias de `selectOne`. `_applySel()` refleja la clase `.selected` en todos los módulos.
> - **Arrastre de grupo** (`module.js _makeDraggable`): si arrastras un módulo ya seleccionado y la selección tiene >1, se mueven **todos** por el mismo delta con snap a grilla/fila, **sin** empuje magnético entre ellos (la decisión del plan: no auto-empujarse). El arrastre individual conserva el comportamiento magnético `Layout.drag`. Clic simple sin mover sobre un miembro del grupo lo colapsa a ese módulo. Shift sobre el header solo (de)selecciona, no arrastra.
> - **Marquee** (`js/core/selection.js`): **Shift+arrastre desde el vacío** dibuja un rectángulo y añade a la selección; intersección en coords de pantalla (`getBoundingClientRect`), robusta a zoom/pan. `Viewport._down` cede ante Shift para no hacer pan.
> - Atajos: Ctrl/Cmd+A (todo), Esc (deseleccionar), Delete/Backspace (borra **toda** la selección en un paso de undo vía `deleteSelection`).

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

> **✅ HECHO (Sprint 2).** Portapapeles interno `Rack.clipboard`. `_serializeSet(mods)` serializa los módulos **+ solo los cables internos** al conjunto (índices relativos a la selección). `_spawnSet(data, off)` reconstruye desplazado, reconecta los cables internos, deja lo nuevo seleccionado y registra **un** paso de undo.
> - `copySelection()` (Ctrl/Cmd+C) → `clipboard`. `paste(off)` (Ctrl/Cmd+V) pega desplazado; el menú contextual del lienzo ofrece **"Pegar aquí"** que coloca el portapapeles bajo el cursor (offset calculado desde `clipboard.modules[0]`). `duplicateSelection()` (Ctrl/Cmd+D) duplica sin tocar el portapapeles. `Rack.duplicate(mod)` (single, del menú contextual del módulo) ya existía desde Sprint 1.
> - Verificado con test funcional jsdom: copy→paste preserva el cable interno osc→amp y selecciona lo pegado; duplicar y borrar-selección-como-1-undo OK.

**Diseño:**
- Ctrl+D duplica selección desplazada 1 fila o a la derecha.
- Ctrl+C / Ctrl+V con clipboard interno (no portapapeles del SO al inicio; v2: JSON al SO clipboard).
- Reutiliza serialize/deserialize de T1.1.

**Implementación:**
1. `Actions.duplicate(mods)`: serializa, deserializa con nuevos ids, desplaza posiciones, NO duplica cables externos (sólo cables interiores a la selección, si se quiere — empezar sin cables).
2. `Actions.copy(mods)` guarda en `Rack.clipboard`. `Actions.paste()` recrea en posición del cursor o desplazado.

---

### T1.5 · Menú contextual (click derecho)

> **✅ HECHO (Sprint 1).** `js/core/contextmenu.js`: `ContextMenu.open(x,y,items)` con `items=[{label,onClick,hint?,disabled?,separator?,submenu?,header?}]`, reposiciona dentro de la ventana, cierra con click-fuera / Escape / scroll / blur. `ContextMenu.init()` instala UN listener delegado de `contextmenu` que resuelve el objetivo vía `closest()` + refs DOM↔objeto (`knob.__control`, `jack.__port`, `cable.__cable`, `module.__module`).
> - Variantes: **Knob** (valor actual, entrada numérica vía prompt, reiniciar, copiar/pegar valor) · **Cable** (borrar, submenú de color con swatches) · **Puerto** (info + desconectar todo) · **Módulo** (renombrar, duplicar, traer al frente, borrar) · **Lienzo vacío** (añadir módulo aquí, centrar todo — hooks fijados desde `main.js`).
> - Para que el click derecho no inicie arrastres, el `mousedown` de knob/fader/header/jack ahora exige botón izquierdo.
> - **Archivos nuevos:** `js/core/contextmenu.js` (+ `ui.js` para `UI.toast`). Estilos en `css/sprint1.css`.

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

> **✅ PARCIAL (Sprint 3) — enlace + indicador estático.** `Module.paramLinks: Map<AudioParam, knobApi>`; `addKnob` acepta `def.param` y registra el enlace. Anotados: VCO (FREQ→`osc.frequency`, FINE→`osc.detune`), LFO (RATE), VCF (CUTOFF), VCA (GAIN), Delay (TIME), Panner (PAN) — cada uno comparte el mismo `AudioParam` con su puerto CV. En `Patch.connect`/`removeCable`, `_refreshMod(port)` busca `port.module.paramLinks.get(port.node)` y alterna la clase `.modulated` en el knob (anillo ámbar + label ámbar, en `css/sprint1.css`). Verificado con jsdom (enlace correcto + toggle al conectar/desconectar).
> **Pendiente (paso 3 del plan):** el arco animado MEDIDO. Requiere muestrear el nivel del CV sin clamp (el `level()` actual satura a 1) y mapearlo a unidades del knob según su curva. Es lo más delicado; se dejó para una iteración dedicada.

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

> **✅ HECHO (Sprint 3).** `mouseenter` en el cable: engrosa (`.hover`, ya existía) + resalta ambos jacks (`.jack.highlighted`) + muestra un tooltip flotante `Módulo A · OUT  →  Módulo B · IN` que sigue el cursor (`.cable-tip`). **El "jump" se hizo vía menú contextual** ("Centrar en origen" / "Centrar en destino" → `Patch.jumpToPort`) en lugar de doble-click, porque el **clic simple ya borra el cable** (un doble-click lo eliminaría antes de poder saltar). Si se quiere el doble-click del plan, habría que mover el borrado a solo menú contextual.

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

> **✅ HECHO (Sprint 3).** `Patch.connect` detecta el reemplazo (`inp.connections.size > 0` al entrar) y muestra `UI.toast("Conexión reemplazada")` — guardado para que NO salte durante carga/undo/paste (esos conectan a entradas vacías; además se exige `!History.suspended`). Verificado: el toast salta exactamente una vez por reemplazo real y la entrada queda con un solo cable. El fade-out del cable saliente quedó como pulido opcional.

**Diseño:**
- Cuando hay reemplazo: animar el cable saliente con fade-out (200ms con clase CSS `.cable.removing`) antes de eliminarlo, y mostrar pequeño toast "Conexión reemplazada".
- Toast: helper `UI.toast(msg, ms)` reutilizable.

---

### T2.5 · Tooltips en jacks

> **✅ HECHO** — cubierto (y superado) por `js/core/tooltips.js`: un glosario que al hacer hover sobre cualquier etiqueta técnica (incluidas las de los jacks, `.port__label`) muestra qué es + el nodo/AudioParam de la Web Audio API correspondiente.

- Hover sobre `.jack` muestra `<modulo>.<label> [audio/cv]`.
- Reutiliza el sistema de tooltip de T2.3.

---

## TIER 3 — Navegación y layout

### T3.1 · Minimap

> **✅ HECHO (Sprint 4).** `js/core/minimap.js`: canvas 200×140 (retina) abajo-izquierda de `.rack`. Dibuja cada módulo como rectángulo (seleccionado = acento) + el rectángulo del viewport. Escala y posiciona sobre el bbox de todos los módulos **+ el viewport actual** (para que el indicador siga visible aunque te alejes). Refresco a ~4 Hz (`setInterval` 250ms; salta si `document.hidden`). Click/arrastre → mapea minimapa→mundo y `Viewport.centerOn`. Verificado con test: round-trip mundo↔minimapa exacto y el centro del bbox cae en el centro del minimapa. Init desde `main.js` (`Minimap.init()`); CSS `.minimap` en `css/sprint1.css`.

**Diseño:**
- Esquina inferior izquierda, 200×140 px, fondo translúcido.
- Cada módulo = rectángulo escalado. Viewport = rectángulo con borde `--accent`.
- Click/drag dentro = `Viewport.centerOn`.

**Implementación:**
- Nuevo archivo `js/core/minimap.js`. Canvas 2D refrescado cada 200ms (solo cuando cambia algo: rastrear `Rack.modules.length`, posiciones, viewport).
- Botón "−" para colapsar.

---

### T3.2 · Atajos de vista

> **✅ PARCIAL (Sprint 4).** `Viewport.fitTo(box, immediate)` encuadra (zoom + centro, clamp a min/max, padding 80px). En `main.js`: `boundsOf(mods)` + `fitView()` (selección si hay, si no todo). `F` = `fitView`, `0` = `Viewport.zoomTo(1)` (100% manteniendo el centro). El menú contextual "Centrar todo" ahora usa `fitView`. Verificado el encuadre/clamp con test. **Pendiente:** bookmarks 1–9.

- `F` → fit to selection (o todo el patch si nada seleccionado). Ya existe `centerOn` y el cálculo de bounding box en `main.js` final — extraer a `Viewport.fitTo(boxes)`.
- `0` → reset zoom 100% manteniendo centro.
- `1`-`9` → bookmarks de viewport (Shift+N para guardar, N para saltar).

---

### T3.3 · Zoom % clickable

> **DESCARTADO (Sprint 4).** Se implementó y luego se revirtió a petición del usuario: la zoom bar (slider + rueda + atajo `0`) ya cubre la necesidad; el input numérico no aportaba.

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

> **✅ HECHO (Sprint 5).** En `js/modules/utility.js`. Lee la CV de entrada vía `AnalyserNode` a ritmo de control (raf), cuantiza con la función pura `quantizeCents(cents, escala, tónica)` al grado más cercano y emite por un `ConstantSourceNode` (con `setTargetAtTime` para suavizar saltos). Selectores de escala (cromática/mayor/menor/pentatónica/dórica/frigia) y de tónica; pantalla con el nombre de nota + semitonos. Convención: pitch CV en **cents** (igual que 1V/OCT→detune del VCO). `quantizeCents` verificado con tests (incl. tónica ≠ C, pentatónica, notas negativas). Expone `window.WAR.quantizeCents/SCALES` para tests.

### T4.1 (diseño original)
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

> **✅ PARCIAL (Sprint 5).** **Clock** HECHO (`js/modules/utility.js`): knob BPM (20–300), botón RUN, 4 salidas gate (`PULSE`, `/2`, `/4`, `/8`) generadas con `ConstantSourceNode` programados (gate 0/1, ancho = medio beat) en un bucle raf que cuenta beats con `Engine.now` (mismo patrón que el Sequencer; `while` con guard para recuperar beats si cae un frame). LED ámbar que parpadea. **Pendiente: Divider** (lee un clock externo y lo divide) — requiere leer la señal de entrada (analyser/edge-detect), como el quantizer.

- **Clock**: BPM master, OUT pulse + divisiones /2 /4 /8.
- **Divider**: IN clock, 8 OUTs dividos /1 /2 /3 /4 /8 /16 /32 /64.

### T4.6 · Multiples (1→N)

> **✅ HECHO (Sprint 5).** `Multiple` en `js/modules/utility.js`: 1 IN, 4 OUT. Bajo el capó un único `GainNode(1)`; las 4 salidas comparten ese nodo y `.connect()` se abanica a todos los destinos. UI compacta. Icono `mult` en `icons.js`.

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
- [x] T1.1 Save/load + autosave  *(Sprint 1 — ver nota abajo)*
- [x] T1.2 Undo/redo  *(Sprint 1 — por snapshots)*
- [x] T1.3 Selección múltiple + marquee  *(Sprint 2)*
- [x] T1.4 Duplicar + copy/paste  *(Sprint 2)*
- [x] T1.5 Menú contextual reutilizable  *(Sprint 1)*

### Tier 2 (pulido modular)
- [~] T2.1 Indicador de modulación en knob  *(Sprint 3: enlace + anillo estático HECHO; arco animado medido pendiente)*
- [ ] T2.2 Atenuverters inline
- [x] T2.3 Hover cable + jump to other end  *(Sprint 3)*
- [x] T2.4 Toast al reemplazar conexión  *(Sprint 3)*
- [x] T2.5 Tooltips en jacks  *(cubierto por `js/core/tooltips.js` — glosario Web Audio)*

### Tier 3 (navegación)
- [x] T3.1 Minimap  *(Sprint 4)*
- [~] T3.2 Atajos de vista (F, 0, bookmarks)  *(Sprint 4: F=fit, 0=100% HECHO; bookmarks 1-9 pendientes)*
- [ ] T3.3 Zoom % clickable  *(descartado por el usuario — el zoom bar ya basta)*
- [ ] T3.4 Drag desde catálogo
- [ ] T3.5 Reasignar Space → pan
- [ ] T3.6 Ghost de destino

### Tier 4 (módulos)
- [x] T4.1 Quantizer  *(Sprint 5)*
- [ ] T4.2 Sample & Hold + Slew
- [ ] T4.3 MIDI Input
- [ ] T4.4 Teclado qwerty
- [~] T4.5 Clock + Divider  *(Sprint 5: Clock HECHO; Divider — que lee un clock externo — pendiente)*
- [x] T4.6 Multiples  *(Sprint 5)*
- [ ] T4.7 Macro knob
- [ ] T4.8 Vectorscope / Spectrogram

### Tier 5 (QoL)
- [~] T5.1 Renombrar módulo  *(adelantado: "Renombrar…" en el menú contextual del módulo; persiste como `custom`/`title` en serialize)*
- [x] T5.2 Panel de performance + medidor master (incluye T5.2b: DAW-friendly background)
- [ ] T5.3 Indicador de problemas
- [ ] T5.4 Touch / pinch zoom
- [ ] T5.5 i18n
- [ ] T5.6 Modo performance
- [ ] T5.7 Bypass por módulo

### Bugfixes
- [ ] Borrar dead code en `sources.js:57`
- [~] Acotar selección en `module.js:35`  *(parcial: el inicio de arrastre de knob/fader/header/jack ahora exige botón izquierdo `e.button!==0 → return`, así el click derecho abre el menú contextual sin arrastrar; el `mousedown`→select desde cualquier hijo se mantiene pero es inofensivo)*
- [ ] Aclarar UI de `Output` L/ST vs R
- [ ] Revisar `blur` en Space (al reasignar)
- [~] Pausar `Patch._loop` cuando Engine suspendido (mitigado: ahora es setInterval, ver T5.2b)
