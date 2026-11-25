/* Main menu screen: tribe slabs, title reveal, and ambient particles. */
(function () {
  "use strict";
  const BC = window.BC;
  const { $, h, S, ICON_COLOR, TRIBE_ROLE, INSCRIPTION, SCREENS, state, show, applyTribeVars } = BC.UI;

  SCREENS.menu = () => {
    const slabs = $("#menu .slabs");
    slabs.innerHTML = "";
    const start = $("#menu .start-btn"), hint = $("#menu .hint");
    const select = (id) => {
      applyTribeVars(id);
      slabs.querySelectorAll(".slab").forEach(s => { s.classList.toggle("sel", s.dataset.id === id); s.setAttribute("aria-pressed", String(s.dataset.id === id)); });
      document.querySelectorAll("#menu .backdrop .art").forEach(a => a.classList.toggle("on", a.classList.contains(id)));
      start.disabled = false;
      hint.textContent = `${BC.TRIBES[id].name} · ${S().progress[id] ? "Continue your rebellion" : "Begin your rebellion"}`;
    };
    ["offense", "defense", "greed"].forEach((id) => {
      const t = BC.TRIBES[id];
      const cleared = S().progress[id];
      const el = h("button", { type: "button", class: "slab", "data-id": id, "aria-pressed": "false", style: `--glow:${ICON_COLOR[id]}`,
        onclick: () => {
          const fresh = S().tribe !== id;
          BC.sfx.chime();
          S().tribe = id; BC.persist(); select(id);
          if (fresh) BC.narrate(t.name + ". " + t.threat);
        },
        ondblclick: () => show("campaign", true),
        onpointermove: (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--tilt", ((e.clientX - r.left) / r.width - 0.5) * 14 + "deg"); } },
        h("div", { class: "sigil" }, h("img", { class: "px", src: BC.iconURL("bases:" + id, 0, 96) })),
        h("h3", {}, t.name),
        h("span", { class: "tribe-role" }, TRIBE_ROLE[id]),
        h("div", { class: "word" }, `${t.word} ${t.pron}`),
        h("div", { class: "runes" }, INSCRIPTION[id]),
        h("p", {}, t.passive),
        h("p", { class: "threat" }, "“" + t.threat + "”"),
        h("div", { class: "prog" }, cleared >= 10 ? "The crown has fallen" : `Stage ${cleared + 1} of 10`,
          h("div", { class: "pips" }, Array.from({ length: 10 }, (_, k) => h("i", { class: k < cleared ? "on" : "" })))));
      slabs.append(el);
    });
    start.disabled = !S().tribe;
    hint.textContent = S().tribe ? "" : "Choose your tribe";
    if (S().tribe) select(S().tribe);
    else {
      applyTribeVars("offense");
      document.querySelectorAll("#menu .backdrop .art").forEach(a => a.classList.toggle("on", a.classList.contains("offense")));
    }
    start.onclick = () => show("campaign", true);
    $("#menu .gear").onclick = BC.UI.openSettings;

    // Title reveal after the story: camera push, crest ignites, letters strike, slabs rise.
    const root = $("#menu"), title = $("#menu .title");
    const reveal = state.menuReveal && !BC.reducedMotion;
    state.menuReveal = false;
    const timers = [];
    let endReveal = () => {};
    const titleHTML = title.innerHTML;
    title.setAttribute("aria-label", title.textContent);
    if (reveal) {
      // Each letter becomes its own element so it can land on its own beat.
      let n = 0;
      const wrap = (node) => {
        if (node.nodeType === 3) return [...node.textContent].map(ch => ch === " " ? " " : h("i", { class: "tl", "aria-hidden": "true", style: `--i:${n++}` }, ch));
        node.classList.add("tl"); node.style.setProperty("--i", n++); node.setAttribute("aria-hidden", "true"); return [node];
      };
      title.replaceChildren(...[...title.childNodes].flatMap(wrap));
      slabs.querySelectorAll(".slab").forEach((el, i) => el.style.setProperty("--si", i));
      root.classList.add("reveal");
      const total = 3600;
      const strikeAt = 900 + (n - 1) * 60;
      timers.push(setTimeout(() => { BC.sfx.strike(); burst(); }, strikeAt));
      endReveal = () => {
        timers.forEach(clearTimeout); timers.length = 0;
        root.classList.remove("reveal");
        removeEventListener("pointerdown", endReveal, true); removeEventListener("keydown", endReveal, true);
        endReveal = () => {};
      };
      timers.push(setTimeout(() => endReveal(), total));
      // Any input finishes the reveal at once.
      timers.push(setTimeout(() => { addEventListener("pointerdown", endReveal, true); addEventListener("keydown", endReveal, true); }, 300));
    }

    // Particles over the painted backdrop (BC Main Menu): Bloodfang embers and the
    // red eyes of its dark forest, Guardvaw fireflies and river mist, Goldclaw glints.
    const cv = $("#menu .menu-bg"), g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const motes = [];
    const eyes = Array.from({ length: 12 }, (_, i) => ({ x: (i % 2 ? W - 60 : 10) + Math.random() * 50, y: 120 + Math.random() * 120, p: Math.random() * 9 }));
    let raf, t = 0, last = performance.now();
    // A spray of sparks from where the title sits.
    const burst = () => {
      const a = cv.getBoundingClientRect(), b = title.getBoundingClientRect();
      const cx = (b.left + b.width / 2 - a.left) / a.width * W, cy = (b.top + b.height / 2 - a.top) / a.height * H;
      for (let i = 0; i < 46; i++) {
        const ang = Math.random() * 6.2832, sp = 25 + Math.random() * 85;
        motes.push({ x: cx + Math.cos(ang) * 40 * Math.random(), y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - 18, l: 0.35, max: 1.1 + Math.random() * 1.3, c: Math.random() < 0.4 ? "255,220,120" : "255,100,30" });
      }
    };
    const spawn = (tribe) => {
      if (tribe === "offense") return { x: Math.random() * W, y: H + 2, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 26, l: 0, max: 5 + Math.random() * 5, c: Math.random() < 0.3 ? "255,210,90" : "255,90,20" };
      if (tribe === "defense") return { x: Math.random() * W, y: 120 + Math.random() * 140, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 4, l: 0, max: 6 + Math.random() * 6, c: Math.random() < 0.5 ? "190,255,170" : "150,220,255" };
      return { x: Math.random() * W, y: 150 + Math.random() * 115, vx: 0, vy: -1, l: 0, max: 1.2 + Math.random() * 1.6, c: Math.random() < 0.2 ? "120,255,140" : "255,236,140", glint: true };
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (BC.reducedMotion) { g.clearRect(0, 0, W, H); raf = requestAnimationFrame(frame); return; }
      const tribe = S().tribe || "offense";
      g.clearRect(0, 0, W, H);
      const want = tribe === "greed" ? 40 : 90;
      while (motes.length < want) { const m = spawn(tribe); m.l = Math.random() * m.max * (motes.length < 5 ? 0 : 1); motes.push(m); }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.l += dt; m.x += (m.vx + Math.sin(t * 1.3 + i) * (tribe === "offense" ? 6 : 3)) * dt; m.y += m.vy * dt;
        if (m.l > m.max) { motes.splice(i, 1); continue; }
        const k = m.l / m.max, a = Math.sin(Math.PI * k);
        if (m.glint) {
          const r = Math.round(a * 2);
          g.fillStyle = `rgba(${m.c},${a})`;
          g.fillRect(m.x | 0, m.y | 0, 1, 1);
          if (r > 0) { g.fillStyle = `rgba(${m.c},${a * 0.55})`; g.fillRect((m.x | 0) - r, m.y | 0, r * 2 + 1, 1); g.fillRect(m.x | 0, (m.y | 0) - r, 1, r * 2 + 1); }
        } else {
          g.fillStyle = `rgba(${m.c},${a * (tribe === "defense" ? 0.25 : 0.3)})`;
          g.fillRect((m.x | 0) - 1, (m.y | 0) - 1, 3, 3);
          g.fillStyle = `rgba(${m.c},${a})`;
          g.fillRect(m.x | 0, m.y | 0, 1, 1);
        }
      }
      if (tribe === "offense") {
        for (const e of eyes) {
          const k = Math.sin(t * 0.7 + e.p);
          if (k < 0.6) continue;
          g.fillStyle = `rgba(255,20,10,${Math.min(1, (k - 0.6) * 5)})`;
          g.fillRect(e.x | 0, e.y | 0, 2, 1); g.fillRect((e.x | 0) + 5, e.y | 0, 2, 1);
        }
      } else if (tribe === "defense") {
        for (let i = 0; i < 3; i++) {
          const y = 196 + i * 22, x = ((t * (6 + i * 3)) % (W + 200)) - 200;
          const gr = g.createLinearGradient(x, 0, x + 200, 0);
          gr.addColorStop(0, "rgba(200,225,235,0)"); gr.addColorStop(0.5, "rgba(200,225,235,0.07)"); gr.addColorStop(1, "rgba(200,225,235,0)");
          g.fillStyle = gr; g.fillRect(x, y, 200, 14);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); endReveal();
      root.classList.remove("reveal");
      title.innerHTML = titleHTML;
    };
  };
})();
