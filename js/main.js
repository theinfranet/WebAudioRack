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
    if (e.code === "Space" && !typing) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      togglePower();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
      if (Rack.selected) { e.preventDefault(); Rack.selected.dispose(); return; }
    }
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
  tension.addEventListener("input", () => { Patch.tension = parseInt(tension.value, 10) / 100; });
  Patch.tension = parseInt(tension.value, 10) / 100;

  // ---------- cajón de cables ----------
  const cableBtn = document.getElementById("cableBtn");
  const cableMenu = document.getElementById("cableMenu");
  const cableList = document.getElementById("cableList");
  const cablePick = document.getElementById("cablePick");
  const applyAll = document.getElementById("applyAll");
  const cableDot = document.getElementById("cableDot");
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
      <path d="M24 11 C 82 19, 158 19, 216 11" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>
      <rect x="2" y="8.5" width="11" height="5" rx="2" fill="#c8ccd4"/>
      <rect x="10" y="3.5" width="14" height="15" rx="3" fill="${fill}" stroke="rgba(0,0,0,.55)"/>
      <rect x="227" y="8.5" width="11" height="5" rx="2" fill="#c8ccd4"/>
      <rect x="216" y="3.5" width="14" height="15" rx="3" fill="${fill}" stroke="rgba(0,0,0,.55)"/></svg>`;
  }

  function selectCable(c, el) {
    current = c;
    Patch.setNewColor(c);
    [...cableList.children].forEach((x) => x.classList.remove("active"));
    if (el) el.classList.add("active");
    cableDot.style.background = c || AUTO_GRAD;
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

  // ---------- panel de performance (driven by setInterval para sobrevivir background) ----------
  const perfState  = document.getElementById("perfState");
  const perfSR     = document.getElementById("perfSR");
  const perfLat    = document.getElementById("perfLat");
  const perfFrame  = document.getElementById("perfFrame");
  const perfClock  = document.getElementById("perfClock");
  const perfGraph  = document.getElementById("perfGraph");
  const perfRmsL   = document.getElementById("perfRmsL");
  const perfRmsR   = document.getElementById("perfRmsR");
  const perfPkL    = document.getElementById("perfPkL");
  const perfPkR    = document.getElementById("perfPkR");
  const perfDbL    = document.getElementById("perfDbL");
  const perfDbR    = document.getElementById("perfDbR");
  const specCv     = document.getElementById("perfSpec");
  const specCtx2d  = specCv.getContext("2d");

  const toDB = (v) => (v <= 0.0001 ? -Infinity : 20 * Math.log10(v));
  const dbToPct = (db) => Math.max(0, Math.min(1, (db + 60) / 60)) * 100;

  let hpL = 0, hpR = 0;
  let lastTickT = performance.now(), tickAvg = 33;
  let lastAudioT = 0, lastWallT = 0, driftMs = 0;
  const stateClass = { running: "run", suspended: "susp", closed: "closed" };

  function perfTick() {
    const now = performance.now();
    const dt = now - lastTickT; lastTickT = now;
    if (dt < 500) tickAvg = tickAvg * 0.85 + dt * 0.15;

    const actx = Engine.ctx;
    if (actx) {
      const stt = actx.state;
      perfState.textContent = stt.toUpperCase();
      perfState.className = "perf-pill " + (stateClass[stt] || "");
      perfSR.textContent = (actx.sampleRate / 1000).toFixed(1) + " kHz";
      const base = (actx.baseLatency || 0) * 1000;
      const outL = (actx.outputLatency || 0) * 1000;
      perfLat.textContent = (base + outL).toFixed(1) + " ms";
      perfClock.textContent = actx.currentTime.toFixed(2) + " s";

      // DRIFT: comparacion entre el reloj de audio y el wallclock.
      // ~0ms = sin glitches; positivo = el audio se quedo atras (xrun).
      if (stt === "running" && lastAudioT > 0) {
        const audioAdv = (actx.currentTime - lastAudioT) * 1000;
        const wallAdv = now - lastWallT;
        if (wallAdv < 500) {
          const d = wallAdv - audioAdv;
          driftMs = driftMs * 0.8 + d * 0.2;
        }
      }
      lastAudioT = actx.currentTime;
      lastWallT = now;
    }
    perfFrame.textContent = tickAvg.toFixed(1) + " / " + (driftMs >= 0 ? "+" : "") + driftMs.toFixed(1) + " ms";
    perfFrame.style.color = Math.abs(driftMs) > 5 ? "var(--danger)" : "";
    perfGraph.textContent = Rack.modules.length + " mod · " + Patch.cables.length + " cbl";

    const m = Engine.meter ? Engine.meter() : { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
    hpL = Math.max(m.peakL, hpL * 0.92);
    hpR = Math.max(m.peakR, hpR * 0.92);
    perfRmsL.style.width = dbToPct(toDB(m.rmsL)) + "%";
    perfRmsR.style.width = dbToPct(toDB(m.rmsR)) + "%";
    perfPkL.style.left   = dbToPct(toDB(hpL)) + "%";
    perfPkR.style.left   = dbToPct(toDB(hpR)) + "%";
    const fmt = (v) => v <= 0.0005 ? "-inf" : (toDB(v) >= 0 ? "+" : "") + toDB(v).toFixed(1);
    perfDbL.textContent = fmt(hpL);
    perfDbR.textContent = fmt(hpR);
    perfDbL.style.color = hpL >= 0.98 ? "var(--danger)" : "";
    perfDbR.style.color = hpR >= 0.98 ? "var(--danger)" : "";

    // Espectro: solo si visible (en background el navegador no compositea igual)
    if (!document.hidden) {
      const sp = Engine.spectrum ? Engine.spectrum() : null;
      const W = specCv.width, H = specCv.height;
      specCtx2d.clearRect(0, 0, W, H);
      specCtx2d.fillStyle = "#060a08"; specCtx2d.fillRect(0, 0, W, H);
      if (sp) {
        const bars = 56, bw = W / bars, bins = sp.length;
        for (let i = 0; i < bars; i++) {
          const t0 = i / bars, t1 = (i + 1) / bars;
          const lo = Math.floor(Math.pow(bins, t0));
          const hi = Math.max(lo + 1, Math.floor(Math.pow(bins, t1)));
          let max = 0;
          for (let k = lo; k < hi && k < bins; k++) if (sp[k] > max) max = sp[k];
          const v = max / 255;
          const bh = v * (H - 2);
          specCtx2d.fillStyle = v < 0.65 ? "#36d39a" : (v < 0.85 ? "#ffd23d" : "#ff4d5e");
          specCtx2d.fillRect(i * bw, H - bh, Math.max(1, bw - 1), bh);
        }
      }
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastTickT = performance.now();
      lastWallT = lastTickT;
      lastAudioT = Engine.ctx ? Engine.ctx.currentTime : 0;
    }
  });

  setInterval(perfTick, 33);

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

  const xs = [], ys = [];
  Rack.modules.forEach((m) => {
    xs.push(Layout.L(m), Layout.R(m));
    const top = parseFloat(m.el.style.top) || 0;
    ys.push(top, top + (m.el.offsetHeight || 340));
  });
  Viewport.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, true);

  const hint = document.getElementById("hint");
  setTimeout(() => hint && (hint.style.opacity = "0"), 9000);
})();
