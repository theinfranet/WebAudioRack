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

  // ---------- menú "Añadir módulo" (modal: buscador + lista/tarjetas) ----------
  const menu = document.getElementById("addMenu");
  const backdrop = document.getElementById("addBackdrop");
  const addBtn = document.getElementById("addBtn");
  let view = "list";   // "list" | "cards"
  let firstMatch = null;

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
        item.addEventListener("click", () => { Rack.add(m.id); closeMenu(); });
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
    if (e.key === "Enter") { e.preventDefault(); if (firstMatch) { Rack.add(firstMatch.id); closeMenu(); } }
    else if (e.key === "Escape") closeMenu();
  });

  function openMenu() {
    menu.classList.add("open"); backdrop.classList.add("show");
    search.value = ""; renderModules();
    setTimeout(() => search.focus(), 0);
  }
  function closeMenu() { menu.classList.remove("open"); backdrop.classList.remove("show"); }
  function toggleMenu() { menu.classList.contains("open") ? closeMenu() : openMenu(); }

  addBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  backdrop.addEventListener("click", closeMenu);
  window.addEventListener("keydown", (e) => {
    const t = e.target.tagName;
    const typing = (t === "INPUT" || t === "TEXTAREA");
    // Espacio = ON/OFF de la cabecera (siempre, salvo escribiendo en el buscador)
    if (e.code === "Space" && !typing) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      togglePower();
      return;
    }
    // borrar el módulo seleccionado
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

  // ---------- tensión de cables ----------
  const tension = document.getElementById("tension");
  tension.addEventListener("input", () => { Patch.tension = parseInt(tension.value, 10) / 100; });
  Patch.tension = parseInt(tension.value, 10) / 100;

  // ---------- color de cables (cajón de cables, desplegable) ----------
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

  // cable horizontal con puntas/plug realistas (como en un cajón de cables)
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
  cableList.firstChild.classList.add("active"); // auto por defecto

  cablePick.addEventListener("input", () => selectCable(cablePick.value, null));
  applyAll.addEventListener("click", () => Patch.recolorAll(current));

  cableBtn.addEventListener("click", (e) => { e.stopPropagation(); cableMenu.classList.toggle("open"); });
  document.addEventListener("click", (e) => {
    if (!cableMenu.contains(e.target) && !cableBtn.contains(e.target)) cableMenu.classList.remove("open");
  });

  // ---------- power (on/off de la cabecera) ----------
  const power = document.getElementById("power");
  async function togglePower() {
    if (!Engine.started) { await Engine.resume(); power.classList.add("on"); power.textContent = "● ON"; }
    else { await Engine.suspend(); power.classList.remove("on"); power.textContent = "○ OFF"; }
  }
  power.addEventListener("click", togglePower);

  // ---------- status ----------
  const st = document.getElementById("status");
  setInterval(() => {
    st.innerHTML = `SR <b>${(Engine.sampleRate / 1000).toFixed(1)}k</b> · estado <b>${Engine.ctx.state}</b> · módulos <b>${Rack.modules.length}</b> · cables <b>${Patch.cables.length}</b>`;
  }, 400);

  // ---------- patch inicial de ejemplo ----------
  const vco = Rack.add("vco");
  const vcf = Rack.add("vcf");
  const scope = Rack.add("scope");
  const out = Rack.add("output");
  const mix = Rack.add("mix4");

  // cablear ejemplo: VCO -> VCF -> SCOPE -> OUTPUT
  const oOut = vco.ports.find((p) => p.dir === "out");
  const fIn = vcf.ports.find((p) => p.dir === "in" && p.label === "IN");
  const fOut = vcf.ports.find((p) => p.dir === "out");
  const sIn = scope.ports.find((p) => p.dir === "in");
  const sThru = scope.ports.find((p) => p.dir === "out");
  const oIn = out.ports.find((p) => p.dir === "in");
  Patch.connect(oOut, fIn);
  Patch.connect(fOut, sIn);
  Patch.connect(sThru, oIn);

  // centrar la vista en el patch inicial
  const xs = [], ys = [];
  Rack.modules.forEach((m) => {
    xs.push(Layout.L(m), Layout.R(m));
    const top = parseFloat(m.el.style.top) || 0;
    ys.push(top, top + (m.el.offsetHeight || 340));
  });
  Viewport.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, true);

  // pista
  const hint = document.getElementById("hint");
  setTimeout(() => hint && (hint.style.opacity = "0"), 9000);
})();
