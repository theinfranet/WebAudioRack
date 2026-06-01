/* ============================================================
   WebAudioRack — arranque de la app
   ============================================================ */

(function () {
  Engine.init(); // crea el AudioContext (suspendido hasta el primer gesto)

  const surface = document.getElementById("surface");
  const svg = document.getElementById("cables");
  Rack.mount(surface);
  Patch.mount(surface, svg);
  Viewport.mount(document.querySelector(".rack"), surface);

  // ---------- menú "Añadir módulo" ----------
  const menu = document.getElementById("addMenu");
  const backdrop = document.getElementById("addBackdrop");
  const addBtn = document.getElementById("addBtn");
  const rackEl = document.querySelector(".rack");
  let view = "list";
  let firstMatch = null;

  let lastCursorWorld = null;
  let spawnAt = null;
  function cursorToWorld(clientX, clientY) {
    const r = Viewport.rack.getBoundingClientRect();
    return {
      x: (clientX - r.left - Viewport.panX) / Viewport.zoom,
      y: (clientY - r.top - Viewport.panY) / Viewport.zoom,
    };
  }
  rackEl.addEventListener("mousemove", (e) => {
    lastCursorWorld = cursorToWorld(e.clientX, e.clientY);
  });

  menu.innerHTML = `
    <div class="add-menu__head">
      <h2>Añadir módulo</h2>
      <div class="view-toggle">
        <button data-view="list" class="active">Lista</button>
        <button data-view="cards">Módulos</button>
      </div>
    </div>
    <input id="moduleSearch" class="module-search" type="text" placeholder="Buscar módulo…  (Enter agrega)" />
    <div id="moduleList" class="module-list"></div>`;
  const search = menu.querySelector("#moduleSearch");
  const list = menu.querySelector("#moduleList");

  function iconSVG(id) {
    return ICONS[id] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>` : "";
  }
  function rowEl(m) {
    const b = document.createElement("button");
    b.className = "mod-row";
    b.innerHTML = `<span class="mod-row__ic">${iconSVG(m.id)}</span><span class="mod-row__tx">${m.name}<small>${m.desc}</small></span>`;
    return b;
  }
  function cardEl(m) {
    const b = document.createElement("button");
    b.className = "mod-card";
    b.innerHTML = `
      <div class="mod-card__hd"><span class="mod-card__ic">${iconSVG(m.id)}</span><span class="mod-card__tt">${m.name}</span></div>
      <div class="mod-card__body"><span class="mc-knob"></span><span class="mc-knob"></span></div>
      <div class="mod-card__jacks"><i></i><i></i><i class="out"></i></div>`;
    return b;
  }
  function renderModules() {
    const q = search.value.trim().toLowerCase();
    list.className = "module-list " + (view === "cards" ? "as-cards" : "as-list");
    list.innerHTML = "";
    const matches = MODULES.filter((m) => !q || (m.name + " " + m.desc + " " + m.id + " " + m.cat).toLowerCase().includes(q));
    firstMatch = matches[0] || null;
    const cats = [...new Set(matches.map((m) => m.cat))];
    cats.forEach((cat) => {
      const h = document.createElement("div");
      h.className = "module-list__cat"; h.textContent = cat;
      list.appendChild(h);
      matches.filter((m) => m.cat === cat).forEach((m) => {
        const item = view === "cards" ? cardEl(m) : rowEl(m);
        if (m === firstMatch) item.classList.add("focus");
        item.addEventListener("click", () => { Rack.add(m.id, spawnAt); closeMenu(); });
        list.appendChild(item);
      });
    });
    if (!matches.length) list.innerHTML = `<div class="module-list__empty">Sin resultados</div>`;
  }

  menu.querySelectorAll(".view-toggle button").forEach((b) => {
    b.addEventListener("click", () => {
      view = b.dataset.view;
      menu.querySelectorAll(".view-toggle button").forEach((x) => x.classList.toggle("active", x === b));
      renderModules();
    });
  });
  search.addEventListener("input", renderModules);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (firstMatch) { Rack.add(firstMatch.id, spawnAt); closeMenu(); } }
    else if (e.key === "Escape") closeMenu();
  });

  function openMenu(originEvent) {
    if (originEvent && typeof originEvent.clientX === "number") {
      spawnAt = cursorToWorld(originEvent.clientX, originEvent.clientY);
    } else {
      spawnAt = lastCursorWorld;
    }
    menu.classList.add("open"); backdrop.classList.add("show");
    search.value = ""; renderModules();
    setTimeout(() => search.focus(), 0);
  }
  function closeMenu() { menu.classList.remove("open"); backdrop.classList.remove("show"); }
  function toggleMenu(originEvent) { menu.classList.contains("open") ? closeMenu() : openMenu(originEvent); }

  addBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  backdrop.addEventListener("click", closeMenu);

  rackEl.addEventListener("dblclick", (e) => {
    if (e.target.closest(".module") || e.target.closest(".jack") || e.target.closest(".cable")) return;
    if (e.target.closest(".zoom-bar")) return;
    e.preventDefault();
    if (menu.classList.contains("open")) return;
    openMenu(e);
  });
  window.addEventListener("keydown", (e) => {
    const t = e.target.tagName;
    const typing = (t === "INPUT" || t === "TEXTAREA");
    // atajos de historial / guardado (Ctrl/Cmd)
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && !typing) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); if (window.History) History.undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); if (window.History) History.redo(); return; }
      if (k === "s") { e.preventDefault(); if (window.Persistence) Persistence.save(); return; }
      if (k === "a") { e.preventDefault(); Rack.selectAll(); return; }
      if (k === "c") { e.preventDefault(); Rack.copySelection(); return; }
      if (k === "v") { e.preventDefault(); Rack.paste(); return; }
      if (k === "d") { e.preventDefault(); Rack.duplicateSelection(); return; }
    }
    if (e.code === "Space" && !typing) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      togglePower();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
      if (Rack.selection && Rack.selection.size) { e.preventDefault(); Rack.deleteSelection(); return; }
    }
    // T3.2: atajos de vista
    if (!typing && (e.key === "f" || e.key === "F")) { e.preventDefault(); fitView(); return; }
    if (!typing && e.key === "0") { e.preventDefault(); Viewport.zoomTo(1); return; }
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON") return;
    if (e.key === "Enter") { e.preventDefault(); toggleMenu(); }
    else if (e.key === "Escape") { closeMenu(); Rack.deselect(); }
  });

  // ---------- movimiento suave on/off ----------
  const smoothBtn = document.getElementById("smoothBtn");
  function updateSmooth() {
    smoothBtn.classList.toggle("active", Viewport.smooth);
    smoothBtn.textContent = Viewport.smooth ? "SUAVE: ON" : "SUAVE: OFF";
  }
  smoothBtn.addEventListener("click", () => { Viewport.smooth = !Viewport.smooth; updateSmooth(); });
  updateSmooth();

  // ---------- zoom bar ----------
  const zoomTrack = document.getElementById("zoomTrack");
  const zoomFill = document.getElementById("zoomFill");
  const zoomThumb = document.getElementById("zoomThumb");
  const zoomValue = document.getElementById("zoomValue");
  const zoomTtoZ = (t) => Viewport.min * Math.pow(Viewport.max / Viewport.min, t);
  const zoomZtoT = (z) => Math.log(z / Viewport.min) / Math.log(Viewport.max / Viewport.min);
  function refreshZoomBar() {
    const t = Math.max(0, Math.min(1, zoomZtoT(Viewport.zoom)));
    const pct = (t * 100).toFixed(2) + "%";
    zoomThumb.style.bottom = pct;
    zoomFill.style.height = pct;
    zoomValue.textContent = Math.round(Viewport.zoom * 100) + "%";
  }
  function zoomFromY(clientY) {
    const r = zoomTrack.getBoundingClientRect();
    const t = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    Viewport.zoomTo(zoomTtoZ(t));
  }
  zoomTrack.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    zoomFromY(e.clientY);
    const move = (ev) => zoomFromY(ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  zoomTrack.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const r = zoomTrack.getBoundingClientRect();
    Viewport._zoomAt(r.left + r.width / 2, r.top + r.height / 2, Viewport.tZoom * factor);
  }, { passive: false });
  setInterval(refreshZoomBar, 60);
  refreshZoomBar();

  // ---------- tensión de cables ----------
  const tension = document.getElementById("tension");
  tension.addEventListener("input", () => { Patch.tension = parseInt(tension.value, 10) / 100; Patch.redrawAll(); });
  Patch.tension = parseInt(tension.value, 10) / 100;

  // ---------- cajón de cables ----------
  const cableBtn = document.getElementById("cableBtn");
  const cableMenu = document.getElementById("cableMenu");
  const cableList = document.getElementById("cableList");
  const cablePick = document.getElementById("cablePick");
  const applyAll = document.getElementById("applyAll");
  const AUTO_GRAD = "conic-gradient(#36d39a,#ffd23d,#ff7a3d,#ff5e8a,#c46bff,#36d39a)";

  const palette = [
    { c: null, auto: true },
    { c: "#36d39a" }, { c: "#ff7a3d" }, { c: "#ffd23d" }, { c: "#9be15d" },
    { c: "#ff5e8a" }, { c: "#c46bff" }, { c: "#ff4d5e" }, { c: "#d9dde4" },
  ];
  let current = null;

  function cableSVG(color, auto, gid) {
    const fill = auto ? `url(#${gid})` : color;
    const defs = auto ? `<defs><linearGradient id="${gid}" x1="0" x2="1">
      <stop offset="0" stop-color="#36d39a"/><stop offset=".35" stop-color="#ffd23d"/>
      <stop offset=".7" stop-color="#ff5e8a"/><stop offset="1" stop-color="#c46bff"/></linearGradient></defs>` : "";
    return `<svg viewBox="0 0 240 22" preserveAspectRatio="none">${defs}
      <path d="M39 11 C 90 19, 150 19, 201 11" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>
      <rect x="2" y="8.5" width="16" height="5" rx="2" fill="#c8ccd4"/>
      <rect x="14" y="3.5" width="25" height="15" rx="3" fill="${fill}" stroke="rgba(0,0,0,.55)"/>
      <rect x="222" y="8.5" width="16" height="5" rx="2" fill="#c8ccd4"/>
      <rect x="201" y="3.5" width="25" height="15" rx="3" fill="${fill}" stroke="rgba(0,0,0,.55)"/></svg>`;
  }

  function selectCable(c, el) {
    current = c;
    Patch.setNewColor(c);
    [...cableList.children].forEach((x) => x.classList.remove("active"));
    if (el) el.classList.add("active");
  }

  palette.forEach((p, i) => {
    const opt = document.createElement("button");
    opt.className = "cable-opt";
    opt.innerHTML = cableSVG(p.c, p.auto, "cg" + i);
    opt.addEventListener("click", () => selectCable(p.c, opt));
    cableList.appendChild(opt);
  });
  cableList.firstChild.classList.add("active");

  cablePick.addEventListener("input", () => selectCable(cablePick.value, null));
  applyAll.addEventListener("click", () => Patch.recolorAll(current));

  cableBtn.addEventListener("click", (e) => { e.stopPropagation(); cableMenu.classList.toggle("open"); });
  document.addEventListener("click", (e) => {
    if (!cableMenu.contains(e.target) && !cableBtn.contains(e.target)) cableMenu.classList.remove("open");
  });

  // ---------- power ----------
  const power = document.getElementById("power");
  async function togglePower() {
    if (!Engine.started) { await Engine.resume(); power.classList.add("on"); power.textContent = "● ON"; }
    else { await Engine.suspend(); power.classList.remove("on"); power.textContent = "○ OFF"; }
  }
  power.addEventListener("click", togglePower);

  // ---------- HUD inline (CPU / SR / LAT / CLK) al lado del ON/OFF ----------
  const hudCpu   = document.getElementById("hudCpu");
  const hudSR    = document.getElementById("hudSR");
  const hudLat   = document.getElementById("hudLat");
  const hudClock = document.getElementById("hudClock");

  // CPU = avgFrame / 16.7ms (proxy de carga del hilo de UI; el navegador no expone CPU/GPU real).
  // Medimos con rAF cuando la pestaña está activa.
  let lastFrameT = performance.now();
  let avgFrame = 16.7;
  function frameLoop(t) {
    const dt = t - lastFrameT; lastFrameT = t;
    if (dt > 0 && dt < 500) avgFrame = avgFrame * 0.9 + dt * 0.1;
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  function setLoadClass(el, pct) {
    el.classList.remove("warn", "bad");
    if (pct >= 90) el.classList.add("bad");
    else if (pct >= 65) el.classList.add("warn");
  }

  function hudTick() {
    const actx = Engine.ctx;
    if (actx) {
      hudSR.textContent = (actx.sampleRate / 1000).toFixed(1) + "k";
      const lat = ((actx.baseLatency || 0) + (actx.outputLatency || 0)) * 1000;
      hudLat.textContent = lat.toFixed(1) + "ms";
      hudClock.textContent = actx.currentTime.toFixed(1) + "s";
    }
    const cpuPct = Math.min(999, Math.round((avgFrame / 16.7) * 100));
    hudCpu.textContent = cpuPct + "%";
    setLoadClass(hudCpu, cpuPct);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastFrameT = performance.now();
  });

  setInterval(hudTick, 250);
  hudTick();

  // ---------- patch inicial ----------
  const vco = Rack.add("vco");
  const vcf = Rack.add("vcf");
  const scope = Rack.add("scope");
  const out = Rack.add("output");
  const mix = Rack.add("mix4");

  const oOut = vco.ports.find((p) => p.dir === "out");
  const fIn = vcf.ports.find((p) => p.dir === "in" && p.label === "IN");
  const fOut = vcf.ports.find((p) => p.dir === "out");
  const sIn = scope.ports.find((p) => p.dir === "in");
  const sThru = scope.ports.find((p) => p.dir === "out");
  const oIn = out.ports.find((p) => p.dir === "in");
  Patch.connect(oOut, fIn);
  Patch.connect(fOut, sIn);
  Patch.connect(sThru, oIn);

  // ---------- encuadrar todo el patch (reutilizable: init + "Centrar todo") ----------
  function fitAll(immediate) {
    if (!Rack.modules.length) return;
    const xs = [], ys = [];
    Rack.modules.forEach((m) => {
      xs.push(Layout.L(m), Layout.R(m));
      const top = parseFloat(m.el.style.top) || 0;
      ys.push(top, top + (m.el.offsetHeight || 340));
    });
    Viewport.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, immediate);
  }
  fitAll(true);

  // T3.2: bbox de un conjunto de módulos + encuadre con zoom (selección o todo)
  function boundsOf(mods) {
    if (!mods || !mods.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    mods.forEach((m) => {
      const x = parseFloat(m.el.style.left) || 0, y = parseFloat(m.el.style.top) || 0;
      const w = m.el.offsetWidth || 150, h = m.el.offsetHeight || 340;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    });
    return { minX, minY, maxX, maxY };
  }
  function fitView() {
    const sel = (Rack.selection && Rack.selection.size) ? [...Rack.selection] : Rack.modules;
    const box = boundsOf(sel);
    if (box) Viewport.fitTo(box, false);
  }

  // ---------- sprint 1+3: menú contextual, historial, persistencia, minimap ----------
  if (window.ContextMenu) {
    ContextMenu.onAddModuleHere = (cx, cy) => openMenu({ clientX: cx, clientY: cy });
    ContextMenu.onCenterAll = () => fitView();
    ContextMenu.onPaste = (cx, cy) => {
      const clip = Rack.clipboard;
      if (!clip || !clip.modules.length) return;
      const w = cursorToWorld(cx, cy);
      Rack.paste({ x: w.x - (clip.modules[0].x || 0), y: w.y - (clip.modules[0].y || 0) });
    };
    ContextMenu.init();
  }
  if (window.Selection) Selection.init(rackEl);  // marquee (Shift+arrastre)
  if (window.Minimap) Minimap.init();            // T3.1 minimapa
  if (window.History) History.init();            // snapshot base = patch inicial
  if (window.Persistence) Persistence.init();     // botones, autosave, oferta de restaurar

  const hint = document.getElementById("hint");
  setTimeout(() => hint && (hint.style.opacity = "0"), 9000);
})();
