/* ============================================================
   History — Undo / Redo por instantáneas (snapshots).
   ------------------------------------------------------------
   En lugar de comandos inversos (frágiles: referencias colgantes,
   side-effects al reemplazar cables, etc.) guardamos snapshots
   completos del patch reutilizando Rack.toJSON()/fromJSON().
   Es la estrategia habitual en editores de nodos y es correcta
   por construcción.

   COALESCENCIA: record() no captura de inmediato; agenda un
   microtask. Varias llamadas dentro del mismo turno síncrono
   (p. ej. borrar un módulo = quitar N cables + dispose) colapsan
   en UN solo snapshot → un solo paso de undo.

   No se registra durante boot ni durante un restore (suspended).
   ============================================================ */

const History = {
  stack: [],
  cursor: -1,
  limit: 100,
  suspended: true,     // arranca suspendido hasta History.init()
  _pending: false,
  _btnUndo: null,
  _btnRedo: null,

  _snap() { return JSON.stringify(Rack.toJSON()); },

  /** Toma el snapshot base y habilita el registro. Llamar tras montar el patch inicial. */
  init() {
    this.suspended = false;
    this.stack = [this._snap()];
    this.cursor = 0;
    this._refreshButtons();
  },

  /** Marca que el estado cambió. Captura coalescida al final del turno. */
  record() {
    if (this.suspended || this._pending) return;
    this._pending = true;
    Promise.resolve().then(() => {
      this._pending = false;
      if (this.suspended) return;
      const s = this._snap();
      if (s === this.stack[this.cursor]) return;          // nada cambió de verdad
      this.stack = this.stack.slice(0, this.cursor + 1);  // descarta el "redo" futuro
      this.stack.push(s);
      if (this.stack.length > this.limit) this.stack.shift();
      this.cursor = this.stack.length - 1;
      this._refreshButtons();
    });
  },

  canUndo() { return this.cursor > 0; },
  canRedo() { return this.cursor < this.stack.length - 1; },

  undo() { if (this.canUndo()) { this.cursor--; this._restore(); } },
  redo() { if (this.canRedo()) { this.cursor++; this._restore(); } },

  _restore() {
    this.suspended = true;
    try {
      // viewport:false -> undo/redo no mueve el encuadre (menos desorientador)
      Rack.fromJSON(JSON.parse(this.stack[this.cursor]), { viewport: false });
    } catch (e) {
      console.warn("History restore:", e);
    }
    this.suspended = false;
    this._refreshButtons();
  },

  /** Conecta los botones ↶ ↷ de la toolbar (opcional). */
  bindButtons(undoBtn, redoBtn) {
    this._btnUndo = undoBtn;
    this._btnRedo = redoBtn;
    if (undoBtn) undoBtn.addEventListener("click", () => this.undo());
    if (redoBtn) redoBtn.addEventListener("click", () => this.redo());
    this._refreshButtons();
  },

  _refreshButtons() {
    if (this._btnUndo) this._btnUndo.disabled = !this.canUndo();
    if (this._btnRedo) this._btnRedo.disabled = !this.canRedo();
  },
};

window.History = History;
