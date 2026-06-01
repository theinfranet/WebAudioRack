/* ============================================================
   ICONS — set de iconos SVG lineales, minimal, sin glow.
   Clave = id del módulo. Contenido interno del <svg>.
   ============================================================ */

const ICONS = {
  vco:     '<path d="M2 12 Q7 3 12 12 T22 12"/>',
  lfo:     '<path d="M2 13 Q8 5 14 13 T26 13"/><path d="M2 13 Q8 5 14 13" opacity=".0"/>',
  noise:   '<path d="M2 12 L5 7 L8 16 L11 6 L14 17 L17 8 L20 15 L22 11"/>',
  cv:      '<path d="M3 17 H10 V7 H21"/>',
  adsr:    '<path d="M2 20 L7 5 L11 12 L16 12 L22 20"/>',
  seq:     '<path d="M2 16 H6 V8 H10 V16 H14 V8 H18 V16 H22"/>',
  sampler: '<path d="M3 9 V15 M7 5 V19 M11 8 V16 M15 4 V20 M19 7 V17"/>',
  mic:     '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11 a6 6 0 0 0 12 0 M12 17 V21 M9 21 H15"/>',
  audioin: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11 a6 6 0 0 0 12 0 M12 17 V21 M9 21 H15"/>',
  audioout:'<path d="M3 9 V15 H7 L12 19 V5 L7 9 Z"/><path d="M15 12 H22 M19 9 L22 12 L19 15"/>',
  device:  '<rect x="2" y="6" width="20" height="12" rx="1.5"/><circle cx="7" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="17" cy="12" r="1.7"/>',
  vca:     '<path d="M5 5 L5 19 L19 12 Z"/>',
  vcf:     '<path d="M3 8 H11 C16 8 16 18 21 18"/>',
  iir:     '<path d="M3 18 H11 C16 18 16 8 21 8"/>',
  delay:   '<path d="M4 7 V17 M10 9 V15 M16 10 V14 M21 11 V13"/>',
  reverb:  '<path d="M12 16 a4 4 0 0 1 0 -8 M12 19 a7 7 0 0 1 0 -14 M12 22 a10 10 0 0 1 0 -20"/>',
  comp:    '<path d="M4 6 H20 M4 18 H20 M9 9 L13 12 L9 15 M15 9 L11 12 L15 15" opacity="0"/><path d="M4 6 H20 M4 18 H20 M8 9 L12 12 L8 15 M16 9 L12 12 L16 15"/>',
  shaper:  '<path d="M2 16 H6 V8 H10 V16 H14 V8 H18 V16 H22"/><path d="M2 12 H22" opacity="0"/>',
  pan:     '<path d="M4 12 H20 M7 9 L4 12 L7 15 M17 9 L20 12 L17 15"/>',
  pan3d:   '<circle cx="12" cy="12" r="8"/><path d="M4 12 H20 M12 4 a8 5 0 0 1 0 16 a8 5 0 0 1 0 -16"/>',
  split:   '<path d="M3 12 H10 M10 12 L18 6 M10 12 L18 18"/><circle cx="18" cy="6" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
  merge:   '<path d="M3 6 L11 12 M3 18 L11 12 M11 12 H21"/><circle cx="3" cy="6" r="1.6"/><circle cx="3" cy="18" r="1.6"/>',
  mix4:    '<path d="M7 4 V20 M13 4 V20 M19 4 V20 M4 9 H10 M10 14 H16 M16 8 H22"/>',
  mix8:    '<path d="M5 4 V20 M10 4 V20 M15 4 V20 M20 4 V20 M3 9 H7 M8 14 H12 M13 7 H17 M18 12 H22"/>',
  scope:   '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M5 14 Q8 8 11 14 T17 14"/>',
  output:  '<path d="M4 9 V15 H8 L13 19 V5 L8 9 Z"/><path d="M16 9 Q19 12 16 15 M17 6 Q22 12 17 18"/>',
  bitcrush:'<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M4 10 H8 M4 14 H8 M16 10 H20 M16 14 H20 M10 4 V8 M14 4 V8 M10 16 V20 M14 16 V20"/>',
  player:  '<circle cx="12" cy="12" r="8"/><path d="M10 8.5 L16 12 L10 15.5 Z"/>',
  recorder:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
  listener:'<path d="M10 20 a7 7 0 1 1 4 0"/><path d="M15 8 a4 4 0 0 1 0 8 M18 5 a8 8 0 0 1 0 14"/>',
};

window.ICONS = ICONS;
