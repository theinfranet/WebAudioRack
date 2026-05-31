/* ============================================================
   WebAudioRack — arranque de la app
   ============================================================ */

(function () {
  Engine.init(); // crea el AudioContext (suspendido hasta el primer gesto)

  const surface = document.getElementById("surface");
  const svg = document.getElementById("cables");
  Rack.mount(surface);
  Patch.mount(surface, svg);

  // ---------- menú "Añadir módulo" ----------
  const menu = document.getElementById("addMenu");
  const cats = [...new Set(MODULES.map((m) => m.cat))];
  cats.forEach((cat) => {
    const h = document.createElement("div");
    h.className = "add-menu__cat"; h.textContent = cat;
    menu.appendChild(h);
    MODULES.filter((m) => m.cat === cat).forEach((m) => {
      const b = document.createElement("button");
      b.className = "add-item";
      b.innerHTML = `${m.name}<small>${m.desc}</small>`;
      b.addEventListener("click", () => { Rack.add(m.id); closeMenu(); });
      menu.appendChild(b);
    });
  });
  const addBtn = document.getElementById("addBtn");
  function closeMenu() { menu.classList.remove("open"); }
  addBtn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target) && e.target !== addBtn) closeMenu(); });
  // abrir/cerrar el menú con Enter
  window.addEventListener("keydown", (e) => {
    const t = e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    if (e.key === "Enter") { e.preventDefault(); menu.classList.toggle("open"); }
    else if (e.key === "Escape") closeMenu();
  });

  // ---------- tensión de cables ----------
  const tension = document.getElementById("tension");
  tension.addEventListener("input", () => { Patch.tension = parseInt(tension.value, 10) / 100; });
  Patch.tension = parseInt(tension.value, 10) / 100;

  // ---------- power ----------
  const power = document.getElementById("power");
  power.addEventListener("click", async () => {
    if (!Engine.started) { await Engine.resume(); power.classList.add("on"); power.textContent = "● ON"; }
    else { await Engine.suspend(); power.classList.remove("on"); power.textContent = "○ OFF"; }
  });

  // ---------- status ----------
  const st = document.getElementById("status");
  setInterval(() => {
    st.innerHTML = `SR <b>${(Engine.sampleRate / 1000).toFixed(1)}k</b> · estado <b>${Engine.ctx.state}</b> · módulos <b>${Rack.modules.length}</b> · cables <b>${Patch.cables.length}</b>`;
  }, 400);

  // ---------- patch inicial de ejemplo ----------
  const vco = Rack.add("vco", { x: 40, y: 60 });
  const vcf = Rack.add("vcf", { x: 210, y: 60 });
  const scope = Rack.add("scope", { x: 384, y: 60 });
  const out = Rack.add("output", { x: 590, y: 60 });
  const mix = Rack.add("mix4", { x: 40, y: 420 });

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

  // pista
  const hint = document.getElementById("hint");
  setTimeout(() => hint && (hint.style.opacity = "0"), 9000);
})();
