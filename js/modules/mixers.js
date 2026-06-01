/* ============================================================
   MÓDULOS — Mixers estéreo (4 y 8 canales)
   Cada canal: IN -> nivel (fader) -> pan -> bus master -> OUT estéreo
   ============================================================ */

class MixerBase extends Module {
  constructor(channels, def) {
    super({ title: channels + " CH MIXER", width: 26 + channels * 52 + 66, ...def });
    const ctx = Engine.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;

    const strip = this.row();
    strip.className = "row mix-strip";

    this.channels = [];
    for (let i = 0; i < channels; i++) {
      const ch = document.createElement("div");
      ch.className = "mix-ch";

      const g = ctx.createGain(); g.gain.value = 0.7;
      const pan = ctx.createStereoPanner();
      g.connect(pan).connect(this.master);

      const lbl = document.createElement("div"); lbl.className = "tiny-label"; lbl.textContent = i + 1; ch.appendChild(lbl);
      this.addKnob(ch, { label: "PAN", min: -1, max: 1, value: 0, bipolar: true, format: (v) => (v === 0 ? "C" : (v < 0 ? "L" : "R")), onChange: (v) => (pan.pan.value = v) });
      this.addFader(ch, { min: 0, max: 1.2, value: 0.7, onChange: (v) => (g.gain.value = v) });
      let prev = 0.7;
      this.addButton(ch, "M", (on) => { if (on) { prev = g.gain.value; g.gain.value = 0; } else g.gain.value = prev; }, { toggle: true });
      const pr = document.createElement("div"); pr.className = "row"; ch.appendChild(pr);
      this.addPort(pr, "in", g, { label: "IN" });

      strip.appendChild(ch);
      this.channels.push({ g, pan });
    }

    // columna MASTER al final
    const m = document.createElement("div");
    m.className = "mix-ch mix-master";
    const mt = document.createElement("div"); mt.className = "tiny-label"; mt.textContent = "MAIN"; m.appendChild(mt);
    this.addFader(m, { min: 0, max: 1.4, value: 0.8, onChange: (v) => (this.master.gain.value = v) });
    const pr = document.createElement("div"); pr.className = "row"; m.appendChild(pr);
    this.addPort(pr, "out", this.master, { label: "OUT" });
    strip.appendChild(m);
  }
}

class Mixer4 extends MixerBase { constructor(def) { super(4, def); } }
class Mixer8 extends MixerBase { constructor(def) { super(8, def); } }

registerModule({ id: "mix4", name: "Mixer 4ch", cat: "Mezcla", desc: "4 canales · pan · master", make: (d) => new Mixer4(d) });
registerModule({ id: "mix8", name: "Mixer 8ch", cat: "Mezcla", desc: "8 canales · pan · master", make: (d) => new Mixer8(d) });
