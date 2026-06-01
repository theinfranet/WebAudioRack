/* ============================================================
   UI — helpers de interfaz reutilizables.
   UI.toast(msg, opts) — aviso flotante abajo-derecha.
     opts: número (ms) | { ms, actions: [{ label, onClick }] }
   Compartido por persistencia (guardado/restauración) y, más
   adelante, por avisos de reemplazo de conexión (T2.4).
   ============================================================ */

const UI = {
  _wrap: null,

  _ensure() {
    if (this._wrap && document.body.contains(this._wrap)) return this._wrap;
    const w = document.createElement("div");
    w.className = "toast-wrap";
    document.body.appendChild(w);
    this._wrap = w;
    return w;
  },

  toast(msg, opts = {}) {
    if (typeof opts === "number") opts = { ms: opts };
    const hasActions = Array.isArray(opts.actions) && opts.actions.length;
    const ms = opts.ms != null ? opts.ms : (hasActions ? 9000 : 2600);
    const wrap = this._ensure();

    const t = document.createElement("div");
    t.className = "toast";
    const span = document.createElement("span");
    span.className = "toast__msg";
    span.textContent = msg;
    t.appendChild(span);

    let timer = null;
    const close = () => {
      if (timer) clearTimeout(timer);
      if (!t.parentNode) return;
      t.classList.remove("in");
      t.classList.add("out");
      setTimeout(() => t.remove(), 200);
    };

    if (hasActions) {
      opts.actions.forEach((a) => {
        const b = document.createElement("button");
        b.className = "toast__btn";
        b.textContent = a.label;
        b.addEventListener("click", () => { try { a.onClick && a.onClick(); } finally { close(); } });
        t.appendChild(b);
      });
    }
    const x = document.createElement("button");
    x.className = "toast__x";
    x.setAttribute("aria-label", "cerrar");
    x.textContent = "✕";
    x.addEventListener("click", close);
    t.appendChild(x);

    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    if (ms > 0) timer = setTimeout(close, ms);
    return { close };
  },
};

window.UI = UI;
