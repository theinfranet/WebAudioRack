/* ============================================================
   WebAudioRack — Smooth Scroll
   Suaviza el scroll de la rueda del ratón (interpolación rAF).
   Arregla el "scroll por pasos" cortado del wheel en Windows.
   Vanilla JS, sin dependencias, sin build.

   - Solo intercepta la rueda del RATÓN (deltas grandes/discretos).
     El trackpad / scroll de precisión queda nativo (ya es suave).
   - No toca contenedores con su propio scroll (menús, code blocks…),
     ni Ctrl+wheel (zoom), ni si el usuario pidió reduced-motion.
   - Config opcional vía window.SMOOTH_SCROLL antes de cargar el script:
       { ease: 0.12, step: 1.0, wheelThreshold: 50 }
   ============================================================ */
(function () {
  "use strict";

  // Respeta a quien pidió menos movimiento.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var cfg = Object.assign({
    smoothness: 6,       // 0..10 — escala principal (0 = instantáneo, 10 = máx. suave)
    ease: null,          // override directo del lerp (0..1). Si null, se deriva de smoothness.
    step: 1.0,           // multiplicador de distancia por "click" de rueda
    wheelThreshold: 50,  // |deltaY| px mínimo para considerarlo rueda de ratón
    maxStep: 240         // tope de px por evento para no dar saltos enormes
  }, window.SMOOTH_SCROLL || {});

  // smoothness 0..10  →  ease 0.60..0.06  (más suave = ease más bajo)
  var SMOOTH_MAX = 10;
  function easeFromSmoothness(s) {
    s = Math.max(0, Math.min(SMOOTH_MAX, +s || 0));
    return 0.60 - (s / SMOOTH_MAX) * 0.54;
  }
  cfg.ease = (cfg.ease != null) ? cfg.ease : easeFromSmoothness(cfg.smoothness);

  var root = document.scrollingElement || document.documentElement;
  var target = 0;        // posición objetivo
  var current = 0;       // posición animada actual
  var raf = null;
  var running = false;

  function maxScroll() {
    return Math.max(0, root.scrollHeight - root.clientHeight);
  }

  function sync() {
    // Resincroniza si el scroll cambió por otra vía (teclado, arrastre, etc.)
    current = target = root.scrollTop;
  }

  function tick() {
    var diff = target - current;
    if (Math.abs(diff) < 0.5) {
      current = target;
      root.scrollTop = current;
      running = false;
      raf = null;
      return;
    }
    current += diff * cfg.ease;
    root.scrollTop = current;
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (!running) {
      running = true;
      // arranca desde la posición real por si hubo otro scroll
      current = root.scrollTop;
      raf = requestAnimationFrame(tick);
    }
  }

  // ¿Algún ancestro del elemento puede scrollear en la dirección del wheel?
  function nestedScrollerHandles(el, dy) {
    while (el && el !== document.body && el !== root && el.nodeType === 1) {
      var oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        var atTop = el.scrollTop <= 0;
        var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (dy < 0 && !atTop) return true;
        if (dy > 0 && !atBottom) return true;
      }
      el = el.parentNode;
    }
    return false;
  }

  function onWheel(e) {
    // Zoom con Ctrl, gestos pinch, o default ya prevenido → no tocar.
    if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    if (e.deltaY === 0) return;

    // Página sin scroll → nada que hacer.
    if (maxScroll() <= 0) return;

    // Heurística: rueda de ratón = deltas en líneas/páginas o píxeles grandes.
    // Trackpad = deltaMode 0 con deltas pequeños → lo dejamos nativo (ya es suave).
    var isMouseWheel = e.deltaMode !== 0 || Math.abs(e.deltaY) >= cfg.wheelThreshold;
    if (!isMouseWheel) { sync(); return; }

    // Si un contenedor interno puede absorber el scroll, no lo robamos.
    if (nestedScrollerHandles(e.target, e.deltaY)) return;

    e.preventDefault();

    // Normaliza el delta a píxeles.
    var px = e.deltaY;
    if (e.deltaMode === 1) px *= 16;            // líneas → px aprox
    else if (e.deltaMode === 2) px *= root.clientHeight; // páginas → px

    px = Math.max(-cfg.maxStep, Math.min(cfg.maxStep, px)) * cfg.step;

    // Si la animación no corre, parte de la posición real.
    if (!running) current = root.scrollTop;
    target = Math.max(0, Math.min(maxScroll(), target + px));
    start();
  }

  // Mantener sincronía cuando el scroll lo mueve otra cosa (teclado, barra…)
  function onScroll() {
    if (!running) { current = target = root.scrollTop; }
  }

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    target = Math.max(0, Math.min(maxScroll(), target));
  });

  // API pública — ajustar en vivo desde consola o UI.
  window.SmoothScroll = {
    get smoothness() { return cfg.smoothness; },
    // n en escala 0..10 (max = 10)
    setSmoothness: function (n) {
      cfg.smoothness = Math.max(0, Math.min(SMOOTH_MAX, +n || 0));
      cfg.ease = easeFromSmoothness(cfg.smoothness);
      return cfg.smoothness;
    },
    config: cfg,
    MAX: SMOOTH_MAX
  };

  // Init
  sync();
})();
