/* ============================================================
   Themes — estilos por módulo.
   La selección de estilo vive ahora dentro del menú contextual
   unificado (ContextMenu → submenú "Estilo del módulo"). Este
   archivo sólo define los temas, expone la función que aplica
   la clase .theme-<id> sobre el .module concreto (no afecta a
   otros) y conserva el guard de click-derecho.
   ============================================================ */

(function () {
  const THEMES = [
    { id: "default", name: "Eurorack negro" },
    { id: "steel",   name: "Acero cepillado" },
    { id: "silver",  name: "Plata Doepfer" },
    { id: "soft",    name: "Card moderno" },
    { id: "wire",    name: "Wireframe" },
    { id: "carbon",  name: "Fibra de carbono" },
    { id: "aqua",    name: "Aqua glow fluor" },
  ];

  function applyTheme(modEl, themeId) {
    THEMES.forEach((t) => modEl.classList.remove("theme-" + t.id));
    if (themeId && themeId !== "default") modEl.classList.add("theme-" + themeId);
    modEl.dataset.theme = themeId;
  }

  // Intercepta el mousedown de botón derecho dentro de un módulo para
  // que los handlers internos (knob, jack, drag…) no se activen.
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    if (!e.target.closest(".module")) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  window.ModuleThemes = { THEMES, apply: applyTheme };
})();
