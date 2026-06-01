/* ============================================================
   Persistence — guardar / cargar / exportar / importar patches.
   ------------------------------------------------------------
   - Guardar / Cargar: localStorage (clave 'webaudiorack.patch').
   - Exportar / Importar: archivo .wapatch (JSON).
   - Autosave cada 10s en clave separada ('webaudiorack.autosave');
     al abrir, ofrece restaurar la sesión anterior (toast no bloqueante).

   Limitaciones conocidas: los buffers cargados desde archivo
   (Sampler / Player) no se serializan; al cargar hay que volver a
   cargar el archivo. El módulo Device no persiste su deviceId.
   ============================================================ */

const Persistence = {
  KEY: "webaudiorack.patch",
  AUTOKEY: "webaudiorack.autosave",
  AUTO_MS: 10000,

  _read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  _write(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } },

  save() {
    if (this._write(this.KEY, JSON.stringify(Rack.toJSON()))) UI.toast("Patch guardado");
    else UI.toast("No se pudo guardar (almacenamiento lleno o bloqueado)");
  },

  load() {
    const raw = this._read(this.KEY);
    if (!raw) { UI.toast("No hay ningún patch guardado"); return; }
    try {
      Rack.fromJSON(JSON.parse(raw));
      if (window.History && History.record) History.record();
      UI.toast("Patch cargado");
    } catch (e) { UI.toast("El patch guardado está corrupto"); }
  },

  exportFile() {
    try {
      const json = JSON.stringify(Rack.toJSON(), null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "patch-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".wapatch";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { UI.toast("La exportación falló"); }
  },

  importFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        Rack.fromJSON(JSON.parse(r.result));
        if (window.History && History.record) History.record();
        UI.toast("Importado: " + file.name);
      } catch (e) { UI.toast("Archivo .wapatch inválido"); }
    };
    r.onerror = () => UI.toast("No se pudo leer el archivo");
    r.readAsText(file);
  },

  autosave() { this._write(this.AUTOKEY, JSON.stringify(Rack.toJSON())); },

  init() {
    const byId = (id) => document.getElementById(id);
    const wire = (id, fn) => { const el = byId(id); if (el) el.addEventListener("click", fn); };

    wire("btnSave", () => this.save());
    wire("btnLoad", () => this.load());
    wire("btnExport", () => this.exportFile());

    const imp = byId("importFile");
    wire("btnImport", () => imp && imp.click());
    if (imp) imp.addEventListener("change", (e) => { this.importFile(e.target.files[0]); e.target.value = ""; });

    if (window.History) History.bindButtons(byId("btnUndo"), byId("btnRedo"));

    // autosave periódico + al cerrar
    setInterval(() => this.autosave(), this.AUTO_MS);
    window.addEventListener("beforeunload", () => this.autosave());

    this._offerRestore();
  },

  /** Si existe un autosave previo, ofrece restaurarlo (no bloqueante). */
  _offerRestore() {
    const raw = this._read(this.AUTOKEY);
    if (!raw) return;
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || !Array.isArray(data.modules) || !data.modules.length) return;
    UI.toast("Sesión anterior disponible (" + data.modules.length + " módulos).", {
      ms: 14000,
      actions: [
        { label: "Restaurar", onClick: () => {
          try {
            Rack.fromJSON(data);                       // usa la copia ya parseada
            if (window.History && History.record) History.record();
            UI.toast("Sesión restaurada");
          } catch (e) { UI.toast("No se pudo restaurar"); }
        } },
        { label: "Descartar", onClick: () => { try { localStorage.removeItem(this.AUTOKEY); } catch (e) {} } },
      ],
    });
  },
};

window.Persistence = Persistence;
