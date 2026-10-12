/* Screens, menus, HUD. */
(function () {
  "use strict";
  const BC = window.BC;
  const $ = (s, root) => (root || document).querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };
  const S = () => BC.save;
  const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
  const runeString = (seed, n) => { let s = ""; for (let i = 0; i < n; i++) s += RUNES[(seed * 7 + i * 13) % RUNES.length] + " "; return s; };
  const fmtTime = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

  // ------------------------------------------------------------ screens --
  let current = "loading";
  let screenCleanup = null;
  function show(id, transition) {
    const swap = () => {
      if (screenCleanup) { screenCleanup(); screenCleanup = null; }
      document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
      current = id;
      const init = SCREENS[id];
      if (init) screenCleanup = init() || null;
    };
    if (!transition) return swap();
    const c = $("#curtain");
    BC.sfx.drums();
    c.className = "sweep-in";
    setTimeout(() => {
      swap();
      c.className = "sweep-out";
      setTimeout(() => { c.className = ""; }, 480);
    }, 470);
  }

  function applyTribeVars(tribe) {
    const t = BC.TRIBES[tribe];
    if (!t) return;
    const r = document.documentElement.style;
    r.setProperty("--tribe-slab", t.colors.slab);
    r.setProperty("--tribe-ink", t.colors.ink);
    r.setProperty("--tribe-bg", t.colors.bg);
    document.body.dataset.tribe = tribe;
    BC.ambience(tribe);
  }

  function confirmBox(text) {
    return new Promise((res) => {
      const m = $("#confirm");
      $("p", m).textContent = text;
      m.classList.remove("hidden");
      const done = (v) => { m.classList.add("hidden"); res(v); };
      $(".yes", m).onclick = () => done(true);
      $(".no", m).onclick = () => done(false);
    });
  }

  // tooltips
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-tip]");
    const tt = $("#tooltip");
    if (!el) { tt.classList.add("hidden"); return; }
    tt.textContent = el.dataset.tip;
    tt.classList.remove("hidden");
    const r = el.getBoundingClientRect();
    tt.style.left = Math.min(innerWidth - 270, Math.max(4, r.left)) + "px";
    tt.style.top = Math.max(4, r.top - tt.offsetHeight - 6) + "px";
  });

  // -------------------------------------------------------------- loading --
  function boot() {
    const tip = $("#loading .tip");
    let ti = 0;
    tip.textContent = BC.TIPS[0];
    const tipTimer = setInterval(() => { ti = (ti + 1) % BC.TIPS.length; tip.textContent = BC.TIPS[ti]; }, 2600);
    BC.loadAssets((p) => {
      $("#loading .progress-fill").style.width = (p * 100) + "%";
      $("#loading .claw").style.left = `calc(${p * 100}% - 11px)`;
    }).then(() => {
      const face = $("#loading .emblem-face");
      face.append(h("img", { class: "px", src: BC.iconURL("bases:" + (S().tribe || "offense"), 0, 64) }));
      setTimeout(() => { clearInterval(tipTimer); show(S().seenIntro ? "menu" : "intro", true); }, 700);
    }).catch((err) => {
      clearInterval(tipTimer);
      tip.textContent = String(err.message || err);
    });
  }

  // ------------------------------------------------------- screen inits --
  const SCREENS = {};

  SCREENS.intro = () => {
    const cv = $("#intro-canvas"), g = cv.getContext("2d");
    const sub = $("#intro .subtitle");
    let line = 0, t = 0, raf, last = performance.now();
    const drops = Array.from({ length: 60 }, () => ({ x: Math.random() * 240, y: Math.random() * 135, v: 60 + Math.random() * 60 }));
    const setLine = () => { sub.style.opacity = 0; setTimeout(() => { sub.textContent = BC.STORY[line] || ""; sub.style.opacity = 1; }, 300); };
    setLine();
    const timer = setInterval(() => { line++; if (line >= BC.STORY.length) finish(); else setLine(); }, 3600);
    const finish = () => { S().seenIntro = true; BC.persist(); show("menu", true); };
    const frame = (now) => {
      const dt = (now - last) / 1000; last = now; t += dt;
      g.fillStyle = "#070203"; g.fillRect(0, 0, 240, 135);
      // the river
      for (let y = 85; y < 135; y += 2) {
        const k = (y - 85) / 50;
        g.fillStyle = `rgb(${60 + k * 60},${5 + k * 4},${8})`;
        g.fillRect(0, y, 240, 2);
        g.fillStyle = "rgba(255,80,80,0.25)";
        for (let x = (t * 20 + y * 7) % 18; x < 240; x += 18) g.fillRect(x, y, 5, 1);
      }
      // collectors on the bank, a lone figure in the water
      g.fillStyle = "#000";
      for (let i = 0; i < 4; i++) { const x = 150 + i * 16; g.fillRect(x, 66, 6, 19); g.fillRect(x + 1, 61, 4, 5); g.fillRect(x + 6, 70, 8, 2); }
      const sink = Math.min(1, t / 14);
      g.fillRect(70, 84 + sink * 10, 5, 10 - sink * 10); g.fillRect(71, 80 + sink * 12, 3, 4);
      if (line >= 3) { // the tribes gather
        for (let i = 0; i < Math.min(12, (t - 10.8) * 3); i++) BC.drawFrame(g, "bases:" + ["offense", "defense", "greed"][i % 3], 0, 6 + i * 12, 52 + (i % 2) * 6, 0.5);
      }
      g.strokeStyle = "rgba(160,160,180,0.35)";
      for (const d of drops) { d.y += d.v * dt; if (d.y > 135) { d.y = -5; d.x = Math.random() * 240; } g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - 1, d.y + 4); g.stroke(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    $("#intro .skip").onclick = () => { BC.sfx.click(); finish(); };
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  };

  // BC Main Menu: icon tints per tribe, and what is carved into each slab.
  const ICON_COLOR = { greed: "#FFD700", defense: "#4682B4", offense: "#FF4500" };
  const INSCRIPTION = { offense: "ᛗ ᛁ ᛉ ᛁ ᛟ ✶ ᚠ ᛁ ᚱ ᛖ", defense: "♣ ≈ ❦ ≈ ♣ ≈ ❦", greed: "◆ ● ᛈ ᚨ ᛊ ● ◆" };

  SCREENS.menu = () => {
    const slabs = $("#menu .slabs");
    slabs.innerHTML = "";
    const start = $("#menu .start-btn");
    const select = (id) => {
      S().tribe = id; BC.persist(); applyTribeVars(id);
      slabs.querySelectorAll(".slab").forEach(s => s.classList.toggle("sel", s.dataset.id === id));
      start.disabled = false;
    };
    ["offense", "defense", "greed"].forEach((id, i) => {
      const t = BC.TRIBES[id];
      const cleared = S().progress[id];
      const el = h("div", { class: "slab", "data-id": id, style: `--glow:${ICON_COLOR[id]}`,
        onclick: () => { const fresh = S().tribe !== id; BC.sfx.chime(); select(id); if (fresh) BC.narrate(t.name + ". " + t.threat); },
        onpointermove: (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--tilt", ((e.clientX - r.left) / r.width - 0.5) * 14 + "deg"); } },
        h("img", { class: "px", src: BC.iconURL("bases:" + id, 0, 96) }),
        h("h3", {}, t.name),
        h("div", { class: "word" }, `${t.word} ${t.pron}`),
        h("div", { class: "runes", style: `color:${t.colors.ink};text-shadow:0 0 6px ${t.colors.ink}` }, INSCRIPTION[id]),
        h("p", {}, t.passive),
        h("p", { class: "threat" }, "“" + t.threat + "”"),
        h("div", { class: "prog" }, cleared >= 10 ? "The crown has fallen." : `Stage ${cleared + 1} of 10`));
      slabs.append(el);
    });
    start.disabled = !S().tribe;
    if (S().tribe) select(S().tribe);
    start.onclick = () => show("campaign", true);
    $("#menu .gear").onclick = openSettings;

    // Backgrounds (BC Main Menu): Bloodfang alternates fiery pits / a dark forest of
    // red eyes; Guardvaw is forest + river + mountains; Goldclaw a treasure cave.
    const cv = $("#menu .menu-bg"), g = cv.getContext("2d");
    const embers = [];
    const eyes = Array.from({ length: 10 }, () => ({ x: Math.random() * 240, y: 40 + Math.random() * 60, p: Math.random() * 6 }));
    const trees = Array.from({ length: 26 }, (_, i) => ({ x: i * 10 + Math.random() * 8, h: 50 + Math.random() * 50, d: Math.random() }));
    let raf, t = 0;
    const pits = () => {
      g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, 240, 135);
      for (let i = 0; i < 5; i++) { const x = 20 + i * 50, fl = 0.4 + 0.2 * Math.sin(t * 9 + i); const gr = g.createRadialGradient(x, 132, 1, x, 132, 34); gr.addColorStop(0, `rgba(255,120,0,${fl})`); gr.addColorStop(1, "rgba(255,69,0,0)"); g.fillStyle = gr; g.fillRect(x - 34, 98, 68, 37); g.fillStyle = "#0a0505"; g.beginPath(); g.ellipse(x, 134, 22, 4, 0, Math.PI, 0); g.fill(); }
      if (embers.length < 60) embers.push({ x: Math.random() * 240, y: 135, v: 8 + Math.random() * 18, l: 0 });
    };
    const eyeForest = () => {
      g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, 240, 135);
      for (const tr of trees) { g.fillStyle = tr.d < 0.5 ? "#0e0e0e" : "#141414"; g.fillRect(tr.x, 135 - tr.h, 4 + tr.d * 3, tr.h); g.beginPath(); g.moveTo(tr.x - 8, 135 - tr.h * 0.7); g.lineTo(tr.x + 2, 135 - tr.h - 12); g.lineTo(tr.x + 12, 135 - tr.h * 0.7); g.fill(); }
      for (const e of eyes) { const k = Math.sin(t * 0.9 + e.p * 3); if (k > 0.55) { g.fillStyle = "#FF0000"; g.globalAlpha = Math.min(1, (k - 0.55) * 5); g.fillRect(e.x, e.y, 2, 1); g.fillRect(e.x + 4, e.y, 2, 1); g.globalAlpha = 1; } }
    };
    const forest = () => {
      g.fillStyle = "#101a14"; g.fillRect(0, 0, 240, 135);
      g.fillStyle = "#808080"; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 70 - 20, 70); g.lineTo(i * 70 + 30, 18 + i % 2 * 12); g.lineTo(i * 70 + 80, 70); g.fill(); }
      g.fillStyle = "#e8eef0"; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 70 + 22, 26 + i % 2 * 12); g.lineTo(i * 70 + 30, 18 + i % 2 * 12); g.lineTo(i * 70 + 38, 26 + i % 2 * 12); g.fill(); }
      g.fillStyle = "#8B4513"; g.fillRect(0, 70, 240, 65);
      g.fillStyle = "#4682B4"; g.beginPath(); g.moveTo(90, 70); g.lineTo(150, 70); g.lineTo(200, 135); g.lineTo(40, 135); g.fill();
      g.fillStyle = "#87CEEB"; for (let i = 0; i < 18; i++) { const y = 74 + ((i * 7 + t * 12) % 60); const w = 50 + (y - 70) * 1.2; g.fillRect(120 - w / 2 + ((i * 37) % w), y, 4, 1); }
      for (const tr of trees) { if (tr.x > 70 && tr.x < 170) continue; g.fillStyle = tr.d < 0.5 ? "#228B22" : "#1a6b1a"; g.beginPath(); g.moveTo(tr.x - 9, 135 - tr.h * 0.4); g.lineTo(tr.x, 135 - tr.h); g.lineTo(tr.x + 9, 135 - tr.h * 0.4); g.fill(); g.fillStyle = "#3b2513"; g.fillRect(tr.x - 1, 135 - tr.h * 0.4, 3, tr.h * 0.4); }
    };
    const cave = () => {
      g.fillStyle = "#1c1206"; g.fillRect(0, 0, 240, 135);
      g.fillStyle = "#8B4513"; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= 240; x += 16) g.lineTo(x, 12 + ((x * 13) % 20)); g.lineTo(240, 0); g.fill();
      for (let i = 0; i < 6; i++) { const x = 20 + i * 42, w = 26 + (i % 3) * 8; g.fillStyle = "#b8860b"; g.beginPath(); g.ellipse(x, 135, w, 18 + (i % 2) * 10, 0, Math.PI, 0); g.fill(); g.fillStyle = "#FFD700"; g.beginPath(); g.ellipse(x, 135, w * 0.7, 12 + (i % 2) * 7, 0, Math.PI, 0); g.fill(); }
      for (let i = 0; i < 26; i++) { const x = (i * 89) % 240, y = 100 + (i * 31) % 32, on = Math.sin(t * 3 + i) > 0.6; g.fillStyle = i % 3 === 0 ? "#00FF00" : i % 3 === 1 ? "#FF4500" : "#fff6b0"; if (on) g.fillRect(x, y, 2, 2); }
    };
    const frame = () => {
      t += 1 / 60;
      const tribe = S().tribe || "offense";
      if (tribe === "offense") (Math.floor(t / 14) % 2 === 0 ? pits : eyeForest)();
      else if (tribe === "defense") forest();
      else cave();
      for (const e of embers) { e.y -= e.v / 60; e.l += 1 / 60; if (tribe !== "offense") continue; g.fillStyle = `rgba(255,${100 + Math.random() * 80 | 0},0,${Math.max(0, 1 - e.l / 6)})`; g.fillRect(e.x + Math.sin(e.l * 2) * 4, e.y, 1, 1); }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].l > 6) embers.splice(i, 1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  };

  SCREENS.campaign = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const T = BC.TRIBES[tribe];
    $("#campaign .map").className = "map " + tribe;
    $("#campaign .camp-title").textContent = `${T.name} — The War of Crimson`;
    $("#campaign .back").onclick = () => show("menu", true);
    $("#campaign .warband-btn").onclick = () => show("warband", true);
    const wrap = $("#campaign .missions");
    wrap.innerHTML = "";
    const prog = S().progress[tribe];
    BC.STAGES.forEach((st, i) => {
      const locked = i > prog;
      const icon = st.boss ? "enemies:" + st.boss : "enemies:" + st.pool[st.pool.length - 1];
      const el = h("div", { class: `mission ${tribe} ${locked ? "locked" : ""}`, style: `--glow:${T.colors.ink}` },
        h("span", { class: "num" }, i + 1),
        i < prog ? h("span", { class: "done", "data-tip": "Conquered" }, "✦") : null,
        locked ? lockIcon(tribe) : h("img", { class: "px", src: BC.iconURL(icon, 0, 64) }),
        h("div", {}, locked ? "Sealed" : st.name));
      if (!locked) el.onclick = () => { BC.sfx.click(); brief(i); };
      wrap.append(el);
    });
    $("#campaign .brief").classList.add("hidden");
  };

  // Locked thumbnails (BC Main Menu): Bloodfang a white skull on dark grey,
  // Guardvaw a leaf over a silver padlock, Goldclaw a treasure chest over a padlock.
  const PADLOCK = '<path d="M20 30v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#C0C0C0" stroke-width="5"/><rect x="12" y="29" width="40" height="30" rx="4" fill="#C0C0C0" stroke="#6b6b6b" stroke-width="2"/><circle cx="32" cy="42" r="4" fill="#3a3a3a"/><rect x="30.5" y="44" width="3" height="8" fill="#3a3a3a"/>';
  const LOCK_SVG = {
    offense: '<path d="M32 6C19 6 10 15 10 27c0 8 4 13 9 16v9h26v-9c5-3 9-8 9-16C54 15 45 6 32 6z" fill="#FFFFFF"/><circle cx="23" cy="28" r="6" fill="#2E2E2E"/><circle cx="41" cy="28" r="6" fill="#2E2E2E"/><path d="M32 34l-4 7h8z" fill="#2E2E2E"/><path d="M24 52v6m6-6v6m6-6v6m6-6v6" stroke="#2E2E2E" stroke-width="2.5"/>',
    defense: PADLOCK + '<path d="M44 26c-14 0-22 9-22 22 13 0 22-8 22-22z" fill="#228B22" stroke="#0b3a0b" stroke-width="2"/><path d="M24 46c6-6 11-10 18-17" stroke="#0b3a0b" stroke-width="2" fill="none"/>',
    greed: PADLOCK + '<rect x="18" y="38" width="28" height="18" rx="2" fill="#8B4513" stroke="#2a1a08" stroke-width="2"/><path d="M18 40a14 9 0 0 1 28 0z" fill="#a0561d" stroke="#2a1a08" stroke-width="2"/><rect x="18" y="39" width="28" height="4" fill="#FFD700"/><rect x="29" y="40" width="6" height="7" fill="#FFD700" stroke="#2a1a08"/>',
  };
  function lockIcon(tribe) {
    const d = h("div", { class: "lockicon" });
    d.innerHTML = `<svg viewBox="0 0 64 64">${LOCK_SVG[tribe]}</svg>`;
    return d;
  }

  function brief(i) {
    const st = BC.STAGES[i];
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const foes = [...new Set(st.pool.concat(st.boss ? [st.boss] : []))];
    box.append(h("div", { class: "parchment" },
      h("h3", {}, `${i + 1}. ${st.name}`),
      h("p", { class: "lore" }, st.lore),
      h("div", { class: "foes" }, foes.map(f => h("img", { class: "px", src: BC.iconURL("enemies:" + f, 0, 40), "data-tip": BC.ASSETS_NAME(f) + " — " + BC.ENEMIES[f].lore }))),
      h("p", {}, `Objective: raze the enemy keep (${st.keepHp} HP) before they break your Totem.` + (st.boss ? " The Collector King will take the field." : "")),
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => box.classList.add("hidden") }, "Back"),
        h("button", { class: "stone-btn", onclick: () => startBattle(i) }, "Begin"))));
    box.classList.remove("hidden");
  }
  BC.ASSETS_NAME = (id) => (window.BC_ASSETS.enemies[id] || {}).name || id;

  // ------------------------------------------------------------- warband --
  let wbSel = null;
  SCREENS.warband = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    $("#warband .back").onclick = () => show("campaign", true);
    // Two display scenes per tribe (BC Main Menu: Unit Customization Menu).
    const disp = $("#warband .wb-display");
    const setScene = () => { disp.className = `wb-display ${tribe} s${S().settings.scene || 0}`; };
    setScene();
    $("#warband .scene-btn").onclick = () => { S().settings.scene = 1 - (S().settings.scene || 0); BC.persist(); BC.sfx.click(); setScene(); };
    const all = BC.tribeUnits(tribe);
    const unlocked = BC.unlockedUnits(tribe);
    if (!wbSel || !unlocked.includes(wbSel)) wbSel = unlocked[0];

    const cv = $("#warband .wb-display canvas"), g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    let raf, t0 = performance.now();
    const anim = (now) => {
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, 96, 96);
      const cyc = t % 4;
      const f = cyc < 3 ? Math.floor(t * 4) % 4 : 4 + Math.min(4, Math.floor((cyc - 3) * 6));
      BC.drawFrame(g, "units:" + wbSel, f, 0, 0, 3);
      raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);

    const render = () => {
      const line = BC.lineup(tribe);
      $("#warband .lineup-count").textContent = `Lineup ${line.length}/5`;
      const list = $("#warband .wb-list");
      list.innerHTML = "";
      all.forEach((name, i) => {
        const ok = unlocked.includes(name);
        const burn = S().burns.find(b => b.id === S().equipped[name]);
        const el = h("div", { class: `wb-unit ${name === wbSel ? "sel" : ""} ${line.includes(name) ? "in-line" : ""} ${ok ? "" : "locked"}`, "data-tip": ok ? name : `Unlocks after stage ${i - 2}` },
          h("img", { class: "px", src: BC.iconURL("units:" + name, 0, 64) }),
          burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : null,
          ok ? name : "???");
        if (ok) el.onclick = () => { wbSel = name; BC.sfx.click(); render(); };
        list.append(el);
      });

      $("#warband .wb-name").textContent = wbSel;
      const U = BC.UNITS[wbSel];
      const base = BC.unitStats(wbSel, tribe, true), cur = BC.unitStats(wbSel, tribe);
      const info = $("#warband .wb-info");
      info.innerHTML = "";
      const statRow = (k, label, fmt) => {
        const a = base[k], b = cur[k];
        const better = k === "cost" || k === "abspd" ? b < a - 1e-6 : b > a + 1e-6;
        const worse = k === "cost" || k === "abspd" ? b > a + 1e-6 : b < a - 1e-6;
        return h("div", {}, h("span", {}, label), h("span", { class: better ? "up" : worse ? "down" : "" }, fmt(b)));
      };
      const n0 = (v) => String(Math.round(v)), n1 = (v) => v.toFixed(2);
      info.append(
        h("div", {}, h("b", {}, U.role), " · ", BC.TRIBES[tribe].name),
        h("div", { class: "stats" },
          statRow("hp", "HP", n0), statRow("dmg", "DMG", n0), statRow("def", "DEF", n0), statRow("atkspd", "ATTSPD", n1),
          statRow("move", "Move", n0), statRow("range", "Range", n0), statRow("abpwr", "ABPWR", n0), statRow("abspd", "Ability CD", (v) => v.toFixed(1) + "s"),
          statRow("rec", "REC", n1), statRow("cost", "Gold Cost", n0)),
        h("div", { class: "ability-box" }, h("b", {}, U.ability.name), h("div", {}, U.ability.desc)),
        h("div", { class: "scroll" }, BC.LORE[wbSel]));
      const inLine = line.includes(wbSel);
      info.append(h("div", { class: "wb-actions" },
        h("button", {
          class: "stone-btn", disabled: !inLine && line.length >= 5 ? true : false, onclick: () => {
            const l = BC.lineup(tribe);
            if (l.includes(wbSel)) { if (l.length > 1) l.splice(l.indexOf(wbSel), 1); }
            else if (l.length < 5) l.push(wbSel);
            BC.persist(); render();
          },
        }, inLine ? "Remove from lineup" : "Add to lineup")));

      info.append(h("h4", {}, "Runic Burns"));
      if (!S().burns.length) info.append(h("p", {}, "No Runic Burns yet. Victories carve them."));
      const owner = (id) => Object.keys(S().equipped).find(k => S().equipped[k] === id);
      S().burns.slice().sort((a, b) => b.tier - a.tier).forEach(b => {
        const tier = BC.BURN_TIERS[b.tier], txt = BC.burnText(b), own = owner(b.id);
        const el = h("div", { class: "burn" + (own === wbSel ? " equipped" : ""), "data-tip": tier.lore },
          h("div", { class: "glyph", style: `--tier:${tier.color}` }, h("img", { src: BC.iconURL("artifacts:" + tribe, b.tier, 32) })),
          h("div", {}, h("div", { class: "t", style: `color:${tier.color}` }, tier.name), h("div", { class: "u" }, txt.up), h("div", { class: "d" }, txt.down)),
          h("div", { class: "owner" }, own ? (own === wbSel ? "Equipped (tap to remove)" : "on " + own) : "Tap to burn"));
        el.onclick = async () => {
          if (own === wbSel) { delete S().equipped[wbSel]; }
          else {
            if (own && !(await confirmBox(`Move this burn from ${own} to ${wbSel}?`))) return;
            if (own) delete S().equipped[own];
            S().equipped[wbSel] = b.id;
          }
          BC.sfx.chime(); BC.persist(); render();
        };
        el.oncontextmenu = async (e) => {
          e.preventDefault();
          if (!(await confirmBox(`Shatter ${tier.name}? It is lost forever.`))) return;
          S().burns = S().burns.filter(x => x.id !== b.id);
          for (const k of Object.keys(S().equipped)) if (S().equipped[k] === b.id) delete S().equipped[k];
          BC.persist(); render();
        };
        info.append(el);
      });
      if (S().burns.length) info.append(h("p", { style: "font-size:11px;opacity:.6" }, "Right-click / long-press a burn to shatter it."));
    };
    render();
    return () => cancelAnimationFrame(raf);
  };

  // -------------------------------------------------------------- battle --
  let battle = null, lastStage = 0, keyHandler = null;
  function startBattle(i) {
    lastStage = i;
    show("battle", true);
  }

  SCREENS.battle = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const st = BC.STAGES[lastStage];
    const line = BC.lineup(tribe);
    const hud = $("#battle .hud");
    const toastEl = $(".toast", hud);
    let toastT = null;
    const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 1800); };
    $(".keep-name", hud).textContent = st.name;
    $(".objective", hud).textContent = st.boss ? "Slay the Collector King. Raze his throne." : "Raze the enemy keep.";
    const btnWrap = $(".unit-buttons", hud);
    btnWrap.innerHTML = "";
    const btns = line.map((name, i) => {
      const b = h("button", { class: "ubtn", "data-tip": `${name} — ${BC.UNITS[name].ability.name}: ${BC.UNITS[name].ability.desc}` },
        h("img", { class: "px", src: BC.iconURL("units:" + name, 0, 64) }),
        h("span", { class: "cost" }), h("span", { class: "cool" }),
        // HUD doc: "a spiral of mystical runes that dissipate as the cooldown reduces"
        h("span", { class: "spiral" }, Array.from({ length: 8 }, (_, k) => {
          const a = k * 0.95, r = 4 + k * 4.6;
          return h("span", { style: `left:${50 + Math.cos(a) * r}%;top:${44 + Math.sin(a) * r}%;transform:translate(-50%,-50%) rotate(${a}rad);opacity:0` }, RUNES[(k * 5 + i * 3) % RUNES.length]);
        })));
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); battle && battle.deploy(i); });
      btnWrap.append(b);
      return b;
    });
    const pause = $("#battle .pause");
    pause.classList.add("hidden");
    $(".autocast", pause).checked = S().settings.autocast;
    $(".autocast", pause).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); if (battle) battle.autocast = e.target.checked; };
    const setPaused = (p) => { if (!battle || battle.over) return; battle.paused = p; pause.classList.toggle("hidden", !p); };
    $(".hud-right .gear", hud).onclick = () => setPaused(true);
    $(".resume", pause).onclick = () => setPaused(false);
    $(".retreat", pause).onclick = async () => {
      if (!(await confirmBox("Retreat? The spoils of this battle will be lost."))) return;
      const s = battle.stats; s.time = battle.t;
      battle.over = true;
      endBattle({ win: false, retreat: true, stats: s });
    };

    let hudTick = 0;
    battle = new BC.Battle($("#battle-canvas"), {
      tribe, stage: lastStage, lineup: line, autocast: S().settings.autocast, toast,
      onEnd: (r) => endBattle(r),
      onHud: (B) => {
        if ((hudTick++ & 1) === 1) return;
        $(".gold-val", hud).textContent = Math.floor(B.gold);
        $(".hp-liquid", hud).style.setProperty("--hp", Math.max(0, B.player.hp / B.player.max * 100) + "%");
        $(".hp-text", hud).textContent = Math.max(0, Math.ceil(B.player.hp)) + " / " + Math.round(B.player.max);
        $(".keep-fill", hud).style.width = Math.max(0, B.enemy.hp / B.enemy.max * 100) + "%";
        const alive = B.ents.filter(e => !e.dead && e.side === "player" && e.kind === "unit").length;
        const dep = $(".deployed", hud);
        if (dep.dataset.n !== String(alive)) {
          dep.dataset.n = alive; dep.innerHTML = "";
          for (let i = 0; i < Math.min(alive, 8); i++) dep.append(h("i"));
          if (alive > 8) dep.append(h("b", {}, "+" + (alive - 8)));
        }
        B.slots.forEach((s, i) => {
          const cost = B.costOf(s), cdMax = 1.5 + s.stats.cost / 45;
          $(".cost", btns[i]).textContent = cost;
          const k = s.cd / cdMax;
          $(".cool", btns[i]).style.setProperty("--cd", (k * 100) + "%");
          const runes = btns[i].querySelectorAll(".spiral span");
          runes.forEach((r, j) => { r.style.opacity = Math.max(0, Math.min(1, k * runes.length - j)).toFixed(2); });
          btns[i].classList.toggle("poor", B.gold < cost);
        });
      },
    });
    BC.currentBattle = battle;
    keyHandler = (e) => {
      if (e.key >= "1" && e.key <= "5") battle.deploy(+e.key - 1);
      else if (e.key === " " || e.key === "Escape") { e.preventDefault(); setPaused(!battle.paused); }
    };
    addEventListener("keydown", keyHandler);
    return () => {
      removeEventListener("keydown", keyHandler);
      if (battle) { battle.destroy(); battle = null; }
    };
  };

  // -------------------------------------------------------------- result --
  let lastResult = null;
  function endBattle(r) {
    const tribe = S().tribe;
    r.rewards = [];
    if (r.win) {
      const firstClear = lastStage === S().progress[tribe];
      if (firstClear) {
        S().progress[tribe] = Math.min(10, lastStage + 1);
        const newUnit = lastStage + 3 < 10 ? BC.tribeUnits(tribe)[lastStage + 3] : null;
        if (newUnit) r.rewards.push({ kind: "unit", name: newUnit });
      }
      const n = firstClear ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const b = BC.makeBurn(BC.rollTier(lastStage));
        S().burns.push(b);
        r.rewards.push({ kind: "burn", burn: b });
      }
    }
    // Achievements — the only source of Cosmic Brands.
    const st = r.stats, done = S().achievements;
    const earned = {
      flawless: r.win && st.baseDmg === 0,
      regicide: st.bossKilled,
      tithe: st.goldEarned >= 3000,
      tribes: ["offense", "defense", "greed"].every(k => S().progress[k] >= 10),
    };
    for (const [id, ok] of Object.entries(earned)) {
      if (!ok || done[id]) continue;
      done[id] = Date.now();
      const b = BC.makeBurn(BC.ACHIEVEMENTS[id].reward);
      S().burns.push(b);
      r.rewards.push({ kind: "achievement", id, burn: b });
    }
    BC.persist();
    lastResult = r;
    show("result", true);
  }

  SCREENS.result = () => {
    const r = lastResult, s = r.stats;
    const title = $("#result .result-title");
    title.textContent = r.win ? (lastStage === 9 ? "The Crown Falls" : "Victory") : r.retreat ? "Retreated" : "The Totem Breaks";
    title.className = "result-title" + (r.win ? "" : " lose");
    const tabs = $("#result .tablets");
    tabs.innerHTML = "";
    [["Foes slain", s.kills], ["Gold earned", Math.round(s.goldEarned)], ["Warriors sent", s.deployed], ["Fallen", s.lost], ["Abilities", s.abilities], ["Time", fmtTime(s.time || 0)]]
      .forEach(([k, v]) => tabs.append(h("div", { class: "stab" }, h("b", {}, v), h("span", {}, k))));
    const rw = $("#result .rewards");
    rw.innerHTML = "";
    if (r.win) {
      const chest = h("div", { class: "chest-big" }, h("div", { class: "lid" }));
      rw.append(chest);
      // coins and loot spill out of the bursting chest
      for (let i = 0; i < 26; i++) {
        const loot = i % 9 === 4 && r.rewards.some(x => x.burn);
        const burn = loot && r.rewards.find(x => x.burn).burn;
        const c = h("div", { class: "coinfx" + (loot ? " loot" : ""), style: `--dx:${(Math.random() * 2 - 1) * 160}px;--dy:${20 + Math.random() * 50}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${0.4 + Math.random() * 0.5}s` },
          loot ? h("img", { src: BC.iconURL("artifacts:" + S().tribe, burn.tier, 32) }) : null);
        chest.append(c);
      }
      setTimeout(() => BC.sfx.coin(), 500); setTimeout(() => BC.sfx.coin(), 700); setTimeout(() => BC.sfx.chime(), 900);
      const line = h("div", { class: "reward-line" });
      r.rewards.forEach((x, i) => {
        if (x.kind === "unit") line.append(h("div", { class: "reward-card", style: `border-color:var(--gold);animation-delay:${0.3 + i * 0.25}s` }, h("img", { class: "px", src: BC.iconURL("units:" + x.name, 0, 64) }), "New warrior: " + x.name));
        else if (x.kind === "achievement") { const a = BC.ACHIEVEMENTS[x.id], t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("div", { style: "color:#ffd700" }, "✦ " + a.name), h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down))); }
        else { const t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down))); }
      });
      rw.append(line);
      if (lastStage === 9) rw.append(h("p", { class: "parchment", style: "max-width:520px" }, "The Collector King drowns in his own gold, and the river finally gives back its dead. Your wife's name is spoken in every village you freed. It does not bring her home."));
    } else {
      rw.append(h("p", { style: "font-style:italic;color:#c8b89a" }, r.retreat ? "You live to bleed another day." : "The collectors will count your dead by morning."));
      const ach = r.rewards.filter(x => x.kind === "achievement");
      if (ach.length) rw.append(h("div", { class: "reward-line" }, ach.map(x => { const t = BC.BURN_TIERS[x.burn.tier]; return h("div", { class: "reward-card", style: `border-color:${t.color}` }, h("div", { style: "color:#ffd700" }, "✦ " + BC.ACHIEVEMENTS[x.id].name), h("b", { style: `color:${t.color}` }, t.name)); })));
    }
    $("#result .retry").onclick = () => startBattle(lastStage);
    $("#result .to-menu").onclick = () => show("menu", true);
    const next = $("#result .next");
    const canNext = r.win && lastStage < 9;
    next.disabled = !canNext;
    next.onclick = () => canNext && startBattle(lastStage + 1);
  };

  // ------------------------------------------------------------ settings --
  function openSettings() {
    const m = $("#settings");
    $(".opt-sound", m).checked = S().settings.sound;
    $(".opt-autocast", m).checked = S().settings.autocast;
    $(".opt-autocast", m).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); };
    $(".opt-narration", m).checked = S().settings.narration;
    $(".opt-ambience", m).checked = S().settings.ambience;
    $(".opt-narration", m).onchange = (e) => { S().settings.narration = e.target.checked; BC.persist(); if (!e.target.checked && window.speechSynthesis) speechSynthesis.cancel(); };
    const ambSync = () => { BC.ambience(null); if (S().settings.sound && S().settings.ambience) BC.ambience(S().tribe); };
    $(".opt-ambience", m).onchange = (e) => { S().settings.ambience = e.target.checked; BC.persist(); ambSync(); };
    $(".opt-sound", m).onchange = (e) => { S().settings.sound = e.target.checked; BC.persist(); ambSync(); };
    const al = $(".ach-list", m);
    al.innerHTML = "";
    al.append(h("b", { style: "color:var(--gold)" }, "Achievements"));
    for (const [id, a] of Object.entries(BC.ACHIEVEMENTS)) {
      al.append(h("div", { class: "ach" + (S().achievements[id] ? " got" : ""), "data-tip": `${a.desc} Reward: ${BC.BURN_TIERS[a.reward].name}` },
        h("i", {}, S().achievements[id] ? "✦" : "✧"), a.name));
    }
    $(".close", m).onclick = () => m.classList.add("hidden");
    $(".replay-intro", m).onclick = () => { m.classList.add("hidden"); show("intro", true); };
    $(".reset", m).onclick = async () => {
      if (!(await confirmBox("Erase every stage, warrior and Runic Burn? This cannot be undone."))) return;
      BC.resetSave(); m.classList.add("hidden"); show("menu", true);
    };
    m.classList.remove("hidden");
  }

  if (S().tribe) applyTribeVars(S().tribe);
  boot();
})();
