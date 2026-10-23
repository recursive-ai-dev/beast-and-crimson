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
  const systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const syncMotion = () => {
    BC.reducedMotion = S().settings.motion === "reduced" || (S().settings.motion === "system" && systemMotion.matches);
    document.documentElement.classList.toggle("reduce-motion", BC.reducedMotion);
  };
  systemMotion.addEventListener("change", syncMotion);
  syncMotion();
  const syncSaveStatus = () => {
    const text = BC.saveStatus === "unavailable" ? "Saving unavailable · progress lasts this session" : BC.saveStatus === "recovered" ? "Unreadable save · a fresh journey awaits" : "Progress saved on this device";
    document.querySelectorAll(".save-status").forEach(el => { el.textContent = text; el.classList.toggle("save-warning", ["unavailable", "recovered"].includes(BC.saveStatus)); });
  };
  addEventListener("bc-save", syncSaveStatus);

  // Keep keyboard focus inside the topmost dialog, then return to its opener.
  const dialogs = [];
  function syncDialogs() {
    const top = dialogs.at(-1)?.el;
    document.querySelectorAll(".screen").forEach(screen => {
      screen.inert = !screen.classList.contains("active") || !!(top && !screen.contains(top));
      [...screen.children].forEach(child => { child.inert = !!(top && screen.contains(top) && !child.contains(top)); });
    });
    dialogs.forEach(({ el }) => { el.inert = el !== top; });
    hideTip();
  }
  function openDialog(el, dismiss, focus = "button:not(:disabled), input, select, summary") {
    if (dialogs.some(d => d.el === el)) return;
    dialogs.push({ el, dismiss, opener: document.activeElement });
    el.classList.remove("hidden");
    el.scrollTop = 0;
    el.querySelectorAll(".tablet, .parchment").forEach(panel => { panel.scrollTop = 0; });
    syncDialogs();
    ($(focus, el) || el).focus({ preventScroll: true });
  }
  function closeDialog(el, restore = true) {
    const index = dialogs.findIndex(d => d.el === el);
    const entry = dialogs[index];
    if (index >= 0) dialogs.splice(index, 1);
    el.classList.add("hidden"); el.inert = false;
    syncDialogs();
    if (restore && entry?.opener?.isConnected && !entry.opener.closest("[inert]")) entry.opener.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", e => {
    const top = dialogs.at(-1);
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) top.dismiss(); }
    if (e.key === "Tab") {
      const focusable = [...top.el.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex='0']")].filter(el => el.getClientRects().length && !el.closest("[inert]"));
      const index = focusable.indexOf(document.activeElement);
      if (!focusable.length) { e.preventDefault(); top.el.focus(); }
      else if (index < 0 || (!e.shiftKey && index === focusable.length - 1) || (e.shiftKey && index === 0)) {
        e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0].focus();
      }
    }
  }, true);
  document.addEventListener("click", e => {
    const top = dialogs.at(-1);
    if (top && e.target === top.el && top.el.id !== "confirm" && !top.el.classList.contains("pause")) top.dismiss();
  });

  // ------------------------------------------------------------ screens --
  let current = "loading";
  let screenCleanup = null;
  let transitioning = false;
  function show(id, transition) {
    if (transitioning) return;
    const swap = () => {
      while (dialogs.length) closeDialog(dialogs.at(-1).el, false);
      if (screenCleanup) { screenCleanup(); screenCleanup = null; }
      document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
      current = id;
      document.body.dataset.screen = id;
      BC.audio.setScene(id);
      const init = SCREENS[id];
      if (init) screenCleanup = init() || null;
      syncDialogs(); syncSaveStatus();
      const screen = $("#" + id);
      screen.tabIndex = -1;
      screen.scrollTop = 0; screen.scrollLeft = 0;
      screen.focus({ preventScroll: true });
    };
    if (!transition || BC.reducedMotion) return swap();
    transitioning = true;
    const c = $("#curtain");
    BC.sfx.drums();
    c.className = "sweep-in";
    setTimeout(() => {
      swap();
      c.className = "sweep-out";
      setTimeout(() => { c.className = ""; transitioning = false; }, 480);
    }, 470);
  }

  function applyTribeVars(tribe) {
    const t = BC.TRIBES[tribe];
    if (!t) return;
    const r = document.documentElement.style;
    r.setProperty("--tribe-slab", t.colors.slab);
    r.setProperty("--tribe-ink", t.colors.ink);
    r.setProperty("--tribe-bg", t.colors.bg);
    r.setProperty("--tribe-art", `url(assets/art/menu-${tribe}.png)`);
    document.body.dataset.tribe = tribe;
    BC.ambience(tribe);
  }

  function confirmBox(text) {
    return new Promise((res) => {
      const m = $("#confirm");
      $("p", m).textContent = text;
      const done = (v) => { closeDialog(m); res(v); };
      $(".yes", m).onclick = () => done(true);
      $(".no", m).onclick = () => done(false);
      openDialog(m, () => done(false), ".no");
    });
  }

  // tooltips
  let tipTarget = null, tipPinned = false, tipFeedback = "";
  function hideTip() {
    tipPinned = false;
    tipFeedback = "";
    $("#tooltip").classList.add("hidden");
    if (tipTarget) {
      const ids = (tipTarget.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== "tooltip");
      if (ids.length) tipTarget.setAttribute("aria-describedby", ids.join(" "));
      else tipTarget.removeAttribute("aria-describedby");
      tipTarget = null;
    }
  }
  const unitTip = (name, tribe, stats = BC.unitStats(name, tribe), cost = stats.cost) => {
    const unit = BC.UNITS[name];
    return [
      `${name} · ${unit.role}`,
      unit.tribe !== tribe ? `${BC.TRIBES[unit.tribe].name} mercenary` : null,
      `Cost: ${Math.round(cost)} gold`,
      `Health: ${Math.round(stats.hp)} · Damage: ${Math.round(stats.dmg)} · Defense: ${Math.round(stats.def)}`,
      `${unit.ability.name} · ${stats.abspd.toFixed(1)}s cooldown`,
      unit.ability.desc,
    ].filter(Boolean).join("\n");
  };
  const showTip = (e, pin = false) => {
    if (tipPinned && e.type === "pointerover") return;
    const el = e.target?.closest("[data-tip]");
    const tt = $("#tooltip");
    if (!el || !el.isConnected || el.closest("[inert]") || !el.getClientRects().length) { hideTip(); return; }
    if (e.pointerType === "touch" && !pin) return;
    if (tipTarget !== el) {
      hideTip();
      tipTarget = el;
      el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), "tooltip"].filter(Boolean).join(" "));
    }
    tipPinned = tipPinned || pin;
    if ("feedback" in e) tipFeedback = e.feedback;
    tt.textContent = (tipFeedback ? `Last attempt: ${tipFeedback}\n\n` : "") + el.dataset.tip;
    tt.style.left = "0px";
    tt.style.top = "0px";
    tt.classList.remove("hidden");
    const r = el.getBoundingClientRect();
    // Cast details must sit above the whole command area, including portraits
    // and the Totem on portrait phones, rather than covering another action.
    const commandTop = el.closest(".unit-slot, .spell-btn")
      ? Math.min(...[...document.querySelectorAll("#battle .unit-buttons, #battle .spell-btn, #battle .objective")].map(control => control.getBoundingClientRect().top))
      : r.top;
    tt.style.left = Math.max(8, Math.min(innerWidth - tt.offsetWidth - 8, r.left)) + "px";
    tt.style.top = Math.max(8, Math.min(innerHeight - tt.offsetHeight - 8, commandTop > tt.offsetHeight + 10 ? commandTop - tt.offsetHeight - 6 : r.bottom + 6)) + "px";
  };
  const updateTip = (el, text) => {
    if (el.dataset.tip === text) return;
    el.dataset.tip = text;
    if (tipTarget === el) showTip({ target: el });
  };
  document.addEventListener("pointerover", showTip);
  document.addEventListener("focusin", showTip);
  document.addEventListener("pointerout", e => {
    if (!tipPinned && tipTarget?.contains(e.target) && !tipTarget.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  document.addEventListener("focusout", () => { if (!tipPinned) hideTip(); }, true);
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("scroll", e => {
    if (e.target === document || e.target.contains?.(tipTarget)) hideTip();
  }, true);
  addEventListener("resize", hideTip);

  // -------------------------------------------------------------- loading --
  const LOAD_STAGES = [[0, "Rousing the tribes"], [0.3, "Awakening thirty warriors"], [0.6, "Lighting the totems"], [0.9, "The crown is watching"]];
  const LOAD_MIN_FIRST = 2600, LOAD_MIN_RETURN = 600;   // ms the screen stays up, so it is seen rather than flashed

  // A pixel brazier that burns brighter as the loading bar fills.
  function drawBrazier(g, t, p) {
    g.clearRect(0, 0, 48, 56);
    g.fillStyle = "#1a1210"; g.fillRect(19, 44, 10, 8); g.fillRect(13, 51, 22, 5);
    for (let y = 0; y < 8; y++) { const w = 14 + y * 2; g.fillStyle = y === 0 ? "#DAA520" : y < 3 ? "#4a3220" : "#2a1c12"; g.fillRect(24 - w / 2, 36 + y, w, 1); }
    const coals = ["#ff4500", "#ff8a1f", "#8B0000"];
    for (let i = 0; i < 9; i++) { g.fillStyle = coals[i % 3]; g.globalAlpha = 0.45 + 0.55 * p * (0.6 + 0.4 * Math.sin(t * 4 + i)); g.fillRect(17 + i * 1.6 | 0, 35, 2, 1); }
    g.globalAlpha = 1;
    const count = 8 + Math.round(p * 46), height = 5 + p * 26, size = 2 + p * 3;
    for (let i = 0; i < count; i++) {
      const h = (t * 0.9 + i * 0.173) % 1, sway = Math.sin(i * 12.9 + t * 3) * (5 + p * 3) * h;
      const r = Math.max(1, Math.round((1 - h) * size));
      const rgb = h < 0.3 ? "255,236,140" : h < 0.65 ? "255,130,30" : "200,30,10";
      g.fillStyle = `rgba(${rgb},${(1 - h) * (0.35 + p * 0.65)})`;
      g.fillRect(Math.round(24 + sway - r / 2), Math.round(35 - h * height), r, r);
    }
  }

  function boot() {
    const tip = $("#loading .tip"), screen = $("#loading"), bar = $("#loading .progress");
    const stageText = $("#loading .load-stage"), prompt = $("#loading .begin-prompt"), emblem = $("#loading .emblem");
    const g = $("#loading .brazier").getContext("2d");
    const tips = BC.TIPS.map(text => [Math.random(), text]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    let ti = 0, real = 0, shown = 0, loaded = false, failed = false, raf, last = performance.now();
    const started = last, minimum = S().seenIntro ? LOAD_MIN_RETURN : LOAD_MIN_FIRST;
    tip.textContent = tips[0];
    const tipTimer = setInterval(() => { ti = (ti + 1) % tips.length; tip.textContent = tips[ti]; }, 3200);

    // First-run players tap once so the soundtrack is allowed to play from the start.
    const awaitGesture = () => new Promise(resolve => {
      const { sound, masterVolume } = S().settings;
      if (S().seenIntro || !sound || !masterVolume || BC.audio.isUnlocked()) return resolve();
      screen.classList.add("awaiting");
      prompt.classList.remove("hidden");
      const go = (e) => {
        if (e.type === "keydown" && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
        removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true);
        prompt.classList.add("hidden"); screen.classList.remove("awaiting");
        resolve();
      };
      addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
    });

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // The bar follows real loading but never outruns the minimum display time.
      const target = Math.min(real, (now - started) / minimum);
      shown += (target - shown) * Math.min(1, dt * 7);
      if (target >= 1 && shown > 0.995) shown = 1;
      const pct = Math.round(shown * 100);
      $(".progress-fill", screen).style.width = pct + "%";
      $(".claw", screen).style.left = `calc(${pct}% - 11px)`;
      bar.setAttribute("aria-valuenow", pct);
      emblem.style.setProperty("--p", shown.toFixed(3));
      stageText.textContent = LOAD_STAGES.filter(([from]) => shown >= from).at(-1)[1] + "…";
      drawBrazier(g, BC.reducedMotion ? 0 : (now - started) / 1000, shown);
      if (shown >= 1 && loaded) { finish(); return; }
      if (!failed) raf = requestAnimationFrame(frame);
    };
    const finish = async () => {
      stageText.textContent = "";
      await awaitGesture();
      clearInterval(tipTimer);
      setTimeout(() => show(S().seenIntro ? "menu" : "intro", true), 350);
    };
    Promise.all([BC.loadAssets((p) => { real = p; }), S().seenIntro ? null : BC.loadIntroArt()]).then(() => { loaded = true; real = 1; }).catch((err) => {
      failed = true;
      cancelAnimationFrame(raf);
      clearInterval(tipTimer);
      tip.textContent = location.protocol === "file:" && err.name === "SecurityError"
        ? "Open this game through a local server: run ./bc-start in the game folder, then use the browser window it opens."
        : String(err.message || err);
    });
    raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------- screen inits --
  const SCREENS = {};

  SCREENS.intro = () => {
    const cv = $("#intro-canvas"), g = cv.getContext("2d");
    const sub = $("#intro .subtitle");
    let raf, last = performance.now(), finished = false;
    BC.loadIntroArt();
    const scene = BC.IntroScene.create({ makeCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) });
    const finish = () => { if (finished) return; finished = true; S().seenIntro = true; BC.persist(); show("menu", true); };

    // The three tribes, named: shown on the title-card beat.
    const card = $("#intro .title-card"), tribesEl = $(".tc-tribes", card);
    tribesEl.textContent = "";
    for (const id of ["offense", "defense", "greed"]) {
      const t = BC.TRIBES[id];
      tribesEl.append(h("div", { class: "tc-tribe", style: `--glow:${ICON_COLOR[id]}` },
        h("img", { src: BC.iconURL("bases:" + id, 0, 96), alt: "" }),
        h("h3", {}, t.name),
        h("span", { class: "tc-role" }, TRIBE_ROLE[id]),
        h("span", { class: "tc-word" }, `${t.word} ${t.pron}`)));
    }

    // Subtitle: typed letter by letter on the intro clock, so it stays in step with the picture.
    let chars = [], schedule = [], shown = 0, typingFrom = 0, typingFor = 1;
    const TYPE_DELAY = 0.35, TYPE_RATE = 24;   // seconds before typing starts; letters per second
    const buildSubtitle = (text) => {
      sub.textContent = "";
      chars = [];
      let word = null;
      const visual = h("span", { "aria-hidden": "true" });
      for (const seg of BC.introSegments(text)) for (const ch of seg.text) {
        if (ch === " ") { visual.append(" "); word = null; continue; }
        if (!word) { word = h("span", { class: "w" }); visual.append(word); }
        const span = h("span", { class: "ch" + (seg.em ? " em" : "") }, ch);
        word.append(span); chars.push(span);
      }
      sub.append(h("span", { class: "sr-only" }, BC.introPlain(text)), visual);
      schedule = BC.typeSchedule(BC.introPlain(text));
      shown = 0;
    };
    const typeSubtitle = (beat) => {
      const since = tl.time - beat.at;
      sub.style.opacity = since > beat.dur - 0.4 ? 0 : 1;
      const progress = BC.reducedMotion ? 1 : (since - TYPE_DELAY) / typingFor;
      const count = BC.typedCount(schedule, progress);
      while (shown < count) chars[shown++].classList.add("on");
    };

    const tl = BC.createTimeline(BC.INTRO, {
      onBeat: (beat) => {
        buildSubtitle(beat.text);
        // Type for at most ~65% of the beat so the line can be read before it fades.
        typingFor = Math.max(0.5, Math.min(beat.dur * 0.65 - TYPE_DELAY, chars.length / TYPE_RATE));
        card.classList.toggle("show", !!beat.card);
        if (beat.sfx) BC.sfx[beat.sfx]?.();
        if (beat.music) BC.audio.cueMusic(true);
      },
      onEnd: finish,
    });
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      tl.update(dt);
      if (finished) return;
      if (tl.beat()) typeSubtitle(tl.beat());
      scene.draw(g, tl, dt, BC.reducedMotion);
      raf = requestAnimationFrame(frame);
    };
    tl.start();
    raf = requestAnimationFrame(frame);
    $("#intro .skip").onclick = () => { BC.sfx.click(); finish(); };
    return () => { finished = true; cancelAnimationFrame(raf); card.classList.remove("show"); };
  };

  // BC Main Menu: icon tints per tribe, and what is carved into each slab.
  const ICON_COLOR = { greed: "#FFD700", defense: "#4682B4", offense: "#FF4500" };
  const TRIBE_ROLE = { offense: "Offense · Overwhelm", defense: "Defense · Endure", greed: "Greed · Outgrow" };
  const INSCRIPTION = { offense: "ᛗ ᛁ ᛉ ᛁ ᛟ ✶ ᚠ ᛁ ᚱ ᛖ", defense: "♣ ≈ ❦ ≈ ♣ ≈ ❦", greed: "◆ ● ᛈ ᚨ ᛊ ● ◆" };

  SCREENS.menu = () => {
    const slabs = $("#menu .slabs");
    slabs.innerHTML = "";
    const start = $("#menu .start-btn"), hint = $("#menu .hint");
    const select = (id) => {
      S().tribe = id; BC.persist(); applyTribeVars(id);
      slabs.querySelectorAll(".slab").forEach(s => { s.classList.toggle("sel", s.dataset.id === id); s.setAttribute("aria-pressed", String(s.dataset.id === id)); });
      document.querySelectorAll("#menu .backdrop .art").forEach(a => a.classList.toggle("on", a.classList.contains(id)));
      start.disabled = false;
      hint.textContent = `${BC.TRIBES[id].name} · ${S().progress[id] ? "Continue your rebellion" : "Begin your rebellion"}`;
    };
    ["offense", "defense", "greed"].forEach((id) => {
      const t = BC.TRIBES[id];
      const cleared = S().progress[id];
      const el = h("button", { type: "button", class: "slab", "data-id": id, "aria-pressed": "false", style: `--glow:${ICON_COLOR[id]}`,
        onclick: () => { const fresh = S().tribe !== id; BC.sfx.chime(); select(id); if (fresh) BC.narrate(t.name + ". " + t.threat); },
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
    $("#menu .gear").onclick = openSettings;

    // Particles over the painted backdrop (BC Main Menu): Bloodfang embers and the
    // red eyes of its dark forest, Guardvaw fireflies and river mist, Goldclaw glints.
    const cv = $("#menu .menu-bg"), g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const motes = [];
    const eyes = Array.from({ length: 12 }, (_, i) => ({ x: (i % 2 ? W - 60 : 10) + Math.random() * 50, y: 120 + Math.random() * 120, p: Math.random() * 9 }));
    let raf, t = 0, last = performance.now();
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
    return () => cancelAnimationFrame(raf);
  };

  SCREENS.campaign = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const T = BC.TRIBES[tribe];
    $("#campaign .map").className = "map " + tribe;
    $("#campaign .camp-title").textContent = `${T.name} — The War of Crimson`;
    $("#campaign .back").onclick = () => show("menu", true);
    $("#campaign .warband-btn").onclick = () => openWarband("campaign");
    const bestWave = (S().endless && S().endless[tribe]) || 0;
    const endBtn = $("#campaign .endless-btn");
    endBtn.dataset.tip = `The Endless Levy — Survive infinite waves. Best with ${T.name}: Wave ${bestWave}`;
    endBtn.onclick = () => { BC.sfx.click(); briefEndless(); };
    const bestBtn = $("#campaign .bestiary-btn");
    bestBtn.dataset.tip = "The Crown's Ledger — Enemy stats, traits, lore & kill tallies";
    bestBtn.onclick = () => { BC.sfx.click(); openBestiary(); };
    const wrap = $("#campaign .missions");
    wrap.innerHTML = "";
    const prog = S().progress[tribe];
    const nextStage = Math.min(prog, BC.STAGES.length - 1);
    const line = BC.lineup(tribe);
    $("#campaign .campaign-overview").replaceChildren(
      h("div", { class: "campaign-copy" },
        h("span", { class: "eyebrow" }, prog === 10 ? "A kingdom reclaimed" : "The path to the crown"),
        h("h3", {}, prog === 10 ? "The crown is yours." : BC.STAGES[nextStage].name),
        h("p", {}, prog === 10 ? "Revisit conquered keeps or test your warband against the Endless Levy." : `${prog ? "Your next stand" : "Your rebellion begins"} · Chapter ${nextStage + 1} of 10`),
        h("div", { class: "campaign-progress", role: "progressbar", "aria-label": "Keeps conquered", "aria-valuenow": prog, "aria-valuemin": 0, "aria-valuemax": 10 }, h("span", { style: `width:${prog * 10}%` }))),
      h("div", { class: "campaign-metrics" },
        h("div", {}, h("b", {}, String(prog).padStart(2, "0")), h("span", {}, "Keeps razed")),
        h("div", {}, h("b", {}, BC.unlockedUnits(tribe).length + "/10"), h("span", {}, "Warriors")),
        h("div", {}, h("b", {}, bestWave || "—"), h("span", {}, "Best wave"))),
      h("div", { class: "campaign-ready" },
        h("div", { class: "mini-lineup", "aria-label": `Warband: ${line.join(", ")}` }, line.map(name => h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 40), "data-tip": name }))),
        h("button", { class: "stone-btn primary continue-campaign", onclick: () => prog === 10 ? briefEndless() : brief(nextStage) }, prog === 10 ? "Enter the Endless Levy" : prog ? "Continue campaign →" : "Begin the rebellion →")));
    BC.STAGES.forEach((st, i) => {
      const locked = i > prog;
      const foes = [...new Set(st.pool)].slice(0, 3).concat(st.midBoss || st.boss ? [st.boss || st.midBoss] : []);
      const tag = st.boss ? "The Collector King" : st.midBossName || (st.hazard && st.hazard.name);
      const el = h("button", { type: "button", disabled: locked, "aria-label": `Stage ${i + 1}: ${st.name}${locked ? ". Clear the previous stage to unlock" : i < prog ? ". Conquered. Replay" : ". Next battle"}`, class: `mission ${tribe}${locked ? " locked" : ""}${i === prog && prog < 10 ? " next" : ""}`, style: `--glow:${T.colors.ink};--i:${i};--art:${stageArt(i)}` },
        h("span", { class: "num" }, i + 1),
        i < prog ? h("span", { class: "done", "data-tip": "Conquered" }, "Razed") : null,
        locked ? lockIcon(tribe) : null,
        h("div", { class: "plate" },
          h("div", { class: "name" }, locked ? "Sealed" : st.name),
          locked ? h("div", { class: "unlock-note" }, `Clear chapter ${i}`) : h("div", { class: "foes" }, foes.map(f => h("img", { class: "px", alt: "", src: BC.iconURL("enemies:" + f, 0, 32) }))),
          !locked && tag ? h("div", { class: "tag" }, tag) : null));
      if (!locked) el.onclick = () => { BC.sfx.click(); brief(i); };
      wrap.append(withArt(el, i));
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
  // Bundled biome paintings; elements without one keep their fallback look.
  const stagePath = (i) => `assets/art/stage-${String(i + 1).padStart(2, "0")}.png`;
  const stageArt = (i) => `url(${stagePath(i)})`;
  const withArt = (el, i) => { const im = new Image(); im.onload = () => el.classList.add("has-art"); im.src = stagePath(i); return el; };
  function lockIcon(tribe) {
    const d = h("div", { class: "lockicon" });
    d.innerHTML = `<svg viewBox="0 0 64 64">${LOCK_SVG[tribe]}</svg>`;
    return d;
  }

  function brief(i) {
    const st = BC.STAGES[i];
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const foes = [...new Set(st.pool.concat(st.midBoss ? [st.midBoss] : []).concat(st.boss ? [st.boss] : []))];
    box.append(h("div", { class: "parchment" },
      withArt(h("div", { class: "brief-art", style: `--art:${stageArt(i)}` }), i),
      h("h3", {}, `${i + 1}. ${st.name}`),
      h("p", { class: "lore" }, st.lore),
      st.hazard ? h("div", { class: "hazard-tag" }, h("b", {}, `Biome Hazard — ${st.hazard.name}: `), st.hazard.desc) : null,
      h("div", { class: "foes" }, foes.map(f => h("img", { class: "px", src: BC.iconURL("enemies:" + f, 0, 40), "data-tip": BC.ASSETS_NAME(f) + " — " + BC.ENEMIES[f].lore }))),
      h("p", {}, `Objective: raze the enemy keep (${st.keepHp} HP) before they break your Totem.` + (st.midBoss ? ` Champion: ${st.midBossName}.` : "") + (st.boss ? " The Collector King will take the field." : "")),
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Back"),
        h("button", { class: "stone-btn primary", onclick: () => startBattle(i, false) }, "Begin"))));
    openDialog(box, () => closeDialog(box), ".btns button:last-child");
  }

  function briefEndless() {
    const tribe = S().tribe, T = BC.TRIBES[tribe];
    const best = (S().endless && S().endless[tribe]) || 0;
    const box = $("#campaign .brief");
    box.innerHTML = "";
    box.append(h("div", { class: "parchment" },
      h("h3", {}, "The Endless Levy"),
      h("p", { class: "lore" }, "The crown's bell never stops tolling. Biomes shift and enemy legions grow stronger with every wave. Razing a keep mends 25% of your Totem and advances the wave immediately."),
      h("p", {}, `Best record with ${T.name}: ${best ? "Wave " + best : "None yet"}. Earn 1 Runic Burn for every 2 waves survived.`),
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Back"),
        h("button", { class: "stone-btn primary", onclick: () => startBattle(0, true) }, "Enter the Levy"))));
    openDialog(box, () => closeDialog(box), ".btns button:last-child");
  }

  function openBestiary() {
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const slain = S().bestiary || {};
    const total = Object.values(slain).reduce((a, b) => a + b, 0);
    const grid = h("div", { class: "ledger-grid" });
    for (const [id, e] of Object.entries(BC.ENEMIES)) {
      const s = e.stats, traits = [];
      if (e.ranged) traits.push("Ranged");
      if (e.onHit === "slow") traits.push("Chilling Strike");
      if (e.onHit === "steal") traits.push("Pilfers Gold");
      if (e.onCast === "heresy") traits.push("Heresy Burn");
      if (e.onCast === "aegis") traits.push("Aegis Shield");
      if (e.boss) traits.push("Boss (2x Keep DMG)");
      grid.append(h("div", { class: "ledger-card", "data-tip": e.lore },
        h("img", { class: "px", src: BC.iconURL("enemies:" + id, 0, 48) }),
        h("div", {},
          h("b", {}, BC.ASSETS_NAME(id)),
          h("div", {}, `HP ${s.hp} · DMG ${s.dmg} · DEF ${s.def} · ${e.bounty}g`),
          traits.length ? h("div", { style: "color:#8B0000;font-size:11px" }, traits.join(" · ")) : null,
          h("p", { class: "enemy-lore" }, e.lore),
          h("div", { class: "slain" }, `Slain: ${slain[id] || 0}`))));
    }
    box.append(h("div", { class: "parchment ledger-box" },
      h("h3", {}, `The Crown's Ledger (${total} Total Slain)`),
      grid,
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Close"))));
    openDialog(box, () => closeDialog(box));
  }
  BC.ASSETS_NAME = (id) => (window.BC_ASSETS.enemies[id] || {}).name || id;

  // ------------------------------------------------------------- warband --
  let wbSel = null, burnFilter = "all", warbandReturn = "campaign";
  function openWarband(from, focus) {
    warbandReturn = from;
    if (focus) wbSel = focus;
    burnFilter = "all";
    show("warband", true);
  }
  SCREENS.warband = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    $("#warband .back").textContent = warbandReturn === "result" ? "← Results" : "← Campaign";
    $("#warband .back").onclick = () => show(warbandReturn, true);
    $("#warband .wb-info").scrollTop = 0;
    // Two display scenes per tribe (BC Main Menu: Unit Customization Menu).
    const disp = $("#warband .wb-display");
    const setScene = () => { disp.className = `wb-display ${tribe} s${S().settings.scene || 0}`; };
    setScene();
    $("#warband .scene-btn").onclick = () => { S().settings.scene = 1 - (S().settings.scene || 0); BC.persist(); BC.sfx.click(); setScene(); };
    const all = BC.tribeUnits(tribe);
    const unlocked = BC.unlockedUnits(tribe);
    const mercs = BC.mercenaryUnits(tribe);
    if (!wbSel || (!unlocked.includes(wbSel) && !mercs.includes(wbSel))) wbSel = unlocked[0];

    const cv = $("#warband .wb-display canvas"), g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    let raf, t0 = performance.now();
    const anim = (now) => {
      const t = BC.reducedMotion ? 0 : (now - t0) / 1000;
      g.clearRect(0, 0, 96, 96);
      const propKey = (S().settings.scene || 0) === 0 ? "props:campfire" : "props:lantern";
      BC.drawFrame(g, propKey, Math.floor(t * 6) % 4, 2, 58, 1);
      BC.drawFrame(g, propKey, Math.floor(t * 6 + 2) % 4, 62, 58, 1);
      const cyc = t % 4;
      const f = cyc < 3 ? Math.floor(t * 4) % 4 : 4 + Math.min(4, Math.floor((cyc - 3) * 6));
      BC.drawFrame(g, "units:" + wbSel, f, 0, 0, 3);
      raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);

    const render = () => {
      const focused = document.activeElement;
      const focusName = focused?.dataset.name;
      const focusClass = focused?.matches(".lineup-action, .fill-lineup, .guide-skip") ? ".lineup-action" : focused?.matches(".burn-tools select, .burn-tools button") ? ".burn-tools select" : null;
      const focusBurn = focused?.closest(".burn")?.dataset.burn;
      const focusButton = focusBurn ? [...focused.closest(".burn").querySelectorAll("button")].indexOf(focused) : -1;
      const scrollTop = $("#warband .wb-info").scrollTop;
      const line = BC.lineup(tribe);
      const curMerc = line.find(n => mercs.includes(n));
      $("#warband .lineup-count").textContent = `${line.length}/5 ready · ${curMerc ? "Pact sworn" : "1 mercenary slot"}`;
      const list = $("#warband .wb-list");
      list.innerHTML = "";
      const selectUnit = (name, source) => {
        wbSel = name;
        S().newUnits = S().newUnits.filter(n => n !== name);
        BC.persist(); BC.sfx.click(); render();
        $("#warband .wb-info").scrollTop = 0;
        // Rendering replaces the cards. Anchor the selection tip to the new card.
        const selector = source.classList.contains("lineup-member") ? ".lineup-member" : ".wb-unit";
        const selected = [...$("#warband").querySelectorAll(selector)].find(el => el.dataset.name === name);
        showTip({ target: selected }, true);
      };
      $("#warband .lineup-strip").replaceChildren(
        h("div", { class: "lineup-label" }, h("span", { class: "eyebrow" }, "Battle lineup"), h("span", {}, "Choose a slot to inspect")),
        ...Array.from({ length: 5 }, (_, i) => {
          const name = line[i];
          return name ? h("button", { class: "lineup-member" + (name === wbSel ? " selected" : ""), "data-name": name, "data-tip": unitTip(name, tribe), "aria-label": `Slot ${i + 1}: ${name}. Inspect warrior`, onclick: e => selectUnit(name, e.currentTarget) },
            h("span", { class: "slot-number" }, i + 1), h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 40) }), h("span", {}, name))
            : h("div", { class: "lineup-member empty" }, h("span", { class: "slot-number" }, i + 1), h("span", {}, "Open slot"));
        }));
      all.forEach((name, i) => {
        const ok = unlocked.includes(name);
        const burn = S().burns.find(b => b.id === S().equipped[name]);
        const el = h("button", { class: `wb-unit ${name === wbSel ? "sel" : ""} ${line.includes(name) ? "in-line" : ""} ${ok ? "" : "locked"}`, disabled: !ok, "aria-pressed": String(name === wbSel), "data-name": name, "data-tip": ok ? unitTip(name, tribe) : `Unlocks after stage ${i - 2}` },
          h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
          S().newUnits.includes(name) ? h("span", { class: "new-badge" }, "New") : null,
          burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : null,
          ok ? name : "???");
        if (ok) el.onclick = e => selectUnit(name, e.currentTarget);
        list.append(el);
      });
      if (mercs.length) {
        list.append(h("div", { class: "wb-sec", "data-tip": "Up to 1 warrior from another tribe may join your warband" }, "Mercenary Pact (Max 1)"));
        mercs.forEach((name) => {
          const burn = S().burns.find(b => b.id === S().equipped[name]);
          const el = h("button", { class: `wb-unit merc ${name === wbSel ? "sel" : ""} ${line.includes(name) ? "in-line" : ""}`, "aria-pressed": String(name === wbSel), "data-name": name, "data-tip": unitTip(name, tribe) },
            h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
            S().newUnits.includes(name) ? h("span", { class: "new-badge" }, "New") : null,
            burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : null,
            name);
          el.onclick = e => selectUnit(name, e.currentTarget);
          list.append(el);
        });
      }

      $("#warband .wb-name").textContent = wbSel;
      const U = BC.UNITS[wbSel];
      const isMerc = U.tribe !== tribe;
      const base = BC.unitStats(wbSel, tribe, true), cur = BC.unitStats(wbSel, tribe);
      const info = $("#warband .wb-info");
      info.innerHTML = "";
      const canFill = line.length < 5 && unlocked.some(n => !line.includes(n));
      const lineupHelp = canFill ? h("div", { class: "lineup-help" },
        h("p", {}, `${5 - line.length} empty lineup slot${line.length === 4 ? "" : "s"}. Fill them with unlocked ${BC.TRIBES[tribe].name} warriors.`),
        h("button", { class: "stone-btn fill-lineup", onclick: () => { BC.fillLineup(tribe); render(); } }, "Fill empty slots")) : null;
      const burnHelp = S().tutorial.burn === "equip" && S().burns.length ? h("aside", { class: "warband-guide", "aria-label": "Runic Burn tutorial" },
        h("strong", {}, "4 / 4 · Bind a Runic Burn"),
        h("p", {}, "Select a warrior, read a burn's buff and debuff below, then choose Equip. Each warrior holds one burn."),
        h("button", { class: "guide-skip", onclick: () => { S().tutorial.burn = "skipped"; BC.persist(); render(); } }, "Skip this tip")) : null;
      const statRow = (k, label, fmt) => {
        const a = base[k], b = cur[k];
        const better = k === "cost" || k === "abspd" ? b < a - 1e-6 : b > a + 1e-6;
        const worse = k === "cost" || k === "abspd" ? b > a + 1e-6 : b < a - 1e-6;
        return h("div", {}, h("span", {}, label), h("span", { class: better ? "up" : worse ? "down" : "" }, fmt(b)));
      };
      const n0 = (v) => String(Math.round(v)), n1 = (v) => v.toFixed(2);
      info.append(
        h("div", { class: "unit-identity" }, h("span", { class: "eyebrow" }, `${BC.TRIBES[U.tribe].name} · ${U.role}${isMerc ? " · Mercenary" : ""}`), h("h3", {}, wbSel)),
        h("div", { class: "stats" },
          statRow("hp", "Health", n0), statRow("dmg", "Damage", n0), statRow("def", "Defense", n0), statRow("atkspd", "Attacks / sec", n1),
          statRow("move", "Move speed", n0), statRow("range", "Range", n0), statRow("abpwr", "Ability power", n0), statRow("abspd", "Cooldown", (v) => v.toFixed(1) + "s"),
          statRow("rec", "Recovery / sec", n1), statRow("cost", "Gold cost", n0)),
        h("div", { class: "ability-box" }, h("b", {}, U.ability.name), h("div", {}, U.ability.desc)),
        h("div", { class: "scroll" }, BC.LORE[wbSel]));
      const inLine = line.includes(wbSel);
      const canAdd = inLine || (isMerc && curMerc ? true : line.length < 5);
      info.append(h("div", { class: "wb-actions" },
        h("button", {
          class: "stone-btn lineup-action", disabled: !canAdd || (inLine && line.length === 1), onclick: () => {
            const l = BC.lineup(tribe);
            if (l.includes(wbSel)) { if (l.length > 1) l.splice(l.indexOf(wbSel), 1); }
            else if (isMerc && curMerc) { l.splice(l.indexOf(curMerc), 1, wbSel); }
            else BC.addToLineup(tribe, wbSel);
            S().newUnits = S().newUnits.filter(n => n !== wbSel);
            BC.persist(); render();
          },
        }, inLine ? "Remove from lineup" : (isMerc && curMerc ? `Swap Merc (${curMerc})` : "Add to lineup"))));
      if (!canAdd) info.append(h("p", { class: "lineup-help" }, "Your lineup is full. Remove a warrior to make room for this one."));
      if (inLine && line.length === 1) info.append(h("p", { class: "inventory-note" }, "Keep at least one warrior in your lineup."));
      if (lineupHelp) info.append(lineupHelp);
      if (burnHelp) info.append(burnHelp);

      const owner = (id) => Object.keys(S().equipped).find(k => S().equipped[k] === id);
      const tierCounts = [0, 0, 0, 0, 0];
      for (const b of S().burns) if (b.tier < 5 && !owner(b.id)) tierCounts[b.tier]++;
      const fuseTier = tierCounts.findIndex(c => c >= 3);

      info.append(
        h("div", { class: "burn-head" },
          h("h4", {}, "Runic Burns"),
          h("span", { class: "ash-badge", "data-tip": "Crimson Ash — Salvage unwanted burns to reroll stats on others" }, `✦ Crimson Ash: ${S().ash || 0}`)),
        h("div", { class: "burn-tools" },
          h("select", {
            "aria-label": "Filter Runic Burns",
            onchange: (e) => { burnFilter = e.target.value; render(); },
          },
            h("option", { value: "all", selected: burnFilter === "all" }, "All Burns"),
            h("option", { value: "unbound", selected: burnFilter === "unbound" }, "Unbound Only"),
            ...Object.entries(BC.BURN_STATS).map(([k, v]) => h("option", { value: k, selected: burnFilter === k }, `+${v.label}`))),
          fuseTier >= 0 ? h("button", {
            "data-tip": `Combine 3 unbound ${BC.BURN_TIERS[fuseTier].name}s into 1 ${BC.BURN_TIERS[fuseTier + 1].name}. Equipped burns are protected.`,
            onclick: async () => {
              if (!(await confirmBox(`Forge 3 unbound ${BC.BURN_TIERS[fuseTier].name}s into one ${BC.BURN_TIERS[fuseTier + 1].name}? The three burns will be consumed.`))) return;
              const forged = BC.fuseBurns(fuseTier);
              if (forged) { BC.sfx.chime(); render(); }
            },
          }, `Forge 3× ${BC.BURN_TIERS[fuseTier].name.split(" ")[0]} → ${BC.BURN_TIERS[fuseTier + 1].name.split(" ")[0]}`) : null));

      if (!S().burns.length) info.append(h("p", {}, "No Runic Burns yet. Victories carve them."));
      const filtered = S().burns.filter(b => {
        if (burnFilter === "unbound") return !owner(b.id);
        if (burnFilter !== "all") return b.buff === burnFilter;
        return true;
      }).sort((a, b) => b.tier - a.tier);
      if (S().burns.length && !filtered.length) info.append(h("p", { class: "inventory-note" }, "No burns match this filter. Choose All Burns to see your collection."));

      filtered.forEach(b => {
        const tier = BC.BURN_TIERS[b.tier], txt = BC.burnText(b), own = owner(b.id);
        const rerollCost = (b.tier + 1) * 3;
        const salvageGain = (b.tier + 1) * 2;
        const el = h("div", { class: "burn" + (own === wbSel ? " equipped" : ""), "data-burn": b.id, "data-tip": tier.lore },
          h("div", { class: "glyph", style: `--tier:${tier.color}` }, h("img", { src: BC.iconURL("artifacts:" + tribe, b.tier, 32) })),
          h("div", {}, h("div", { class: "t", style: `color:${tier.color}` }, tier.name), h("div", { class: "u" }, txt.up), h("div", { class: "d" }, txt.down)),
          h("div", { class: "owner" }, own ? (own === wbSel ? "Equipped" : "on " + own) : "Unbound"),
          h("div", { class: "burn-btns" },
            h("button", { class: "burn-act burn-equip" }, own === wbSel ? "Unequip" : "Equip"),
            h("button", {
              class: "burn-act", disabled: (S().ash || 0) < rerollCost, "aria-label": `Reroll ${tier.name} for ${rerollCost} Crimson Ash`,
              "data-tip": `Reroll stats (${rerollCost} Crimson Ash)`,
              onclick: (e) => { e.stopPropagation(); if (BC.rerollBurn(b.id)) { BC.sfx.chime(); render(); } },
            }, `↻${rerollCost}`),
            h("button", {
              class: "burn-act", "aria-label": `Salvage ${tier.name} for ${salvageGain} Crimson Ash`,
              "data-tip": `Salvage into +${salvageGain} Crimson Ash`,
              onclick: async (e) => {
                e.stopPropagation();
                if (!(await confirmBox(`Salvage ${tier.name} into +${salvageGain} Crimson Ash?`))) return;
                BC.salvageBurn(b.id); BC.sfx.click(); render();
              },
            }, `+${salvageGain}✦`)));
        const equip = async () => {
          if (own === wbSel) { delete S().equipped[wbSel]; }
          else {
            if (own && !(await confirmBox(`Move this burn from ${own} to ${wbSel}?`))) return;
            if (own) delete S().equipped[own];
            S().equipped[wbSel] = b.id;
            BC.advanceTutorial("equip");
          }
          BC.sfx.chime(); BC.persist(); render();
        };
        el.onclick = equip;
        $(".burn-equip", el).onclick = (e) => { e.stopPropagation(); equip(); };
        el.oncontextmenu = async (e) => {
          e.preventDefault();
          if (!(await confirmBox(`Salvage ${tier.name} into +${salvageGain} Crimson Ash?`))) return;
          BC.salvageBurn(b.id); BC.sfx.click(); render();
        };
        info.append(el);
      });
      if (S().burns.length) info.append(h("p", { class: "inventory-note" }, "Equip one burn per warrior. Forge three unbound burns of the same tier. Equipped burns are protected from forging."));
      info.scrollTop = scrollTop;
      if (focusName) [...$("#warband").querySelectorAll("button[data-name]")].find(el => el.dataset.name === focusName && el.classList.contains(focused.classList.contains("lineup-member") ? "lineup-member" : "wb-unit"))?.focus({ preventScroll: true });
      else if (focusClass) $(focusClass, info)?.focus({ preventScroll: true });
      else if (focusButton >= 0) {
        const buttons = [...info.querySelectorAll(".burn")].find(el => el.dataset.burn === focusBurn)?.querySelectorAll("button");
        (buttons?.[focusButton] && !buttons[focusButton].disabled ? buttons[focusButton] : buttons?.[0] || $(".burn-tools select", info)).focus({ preventScroll: true });
      }
    };
    render();
    return () => cancelAnimationFrame(raf);
  };

  // -------------------------------------------------------------- battle --
  let battle = null, lastStage = 0, lastEndless = false, keyHandler = null;
  function startBattle(i, endless) {
    lastStage = i;
    lastEndless = !!endless;
    show("battle", true);
  }

  const AB_KEYS = ["Q", "W", "E", "A", "S"];
  SCREENS.battle = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const T = BC.TRIBES[tribe];
    const st = BC.STAGES[lastStage];
    const line = BC.lineup(tribe);
    let guiding = !lastEndless && lastStage === 0 && ["deploy", "ability", "spell"].includes(S().tutorial.battle);
    if (guiding) { S().tutorial.battle = "deploy"; BC.persist(); }
    const hud = $("#battle .hud");
    const toastEl = $(".toast", hud);
    toastEl.classList.remove("show");
    toastEl.textContent = "";
    let toastT = null;
    const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 1800); };
    const command = (button, action) => {
      if (!battle || battle.paused || battle.over) return;
      const ok = action();
      // Keep failure feedback readable even when the details cover the toast.
      showTip({ target: button, feedback: ok ? "" : toastEl.textContent }, true);
    };
    const hazard = $(".battle-hazard", hud), arrival = $(".arrival-warning", hud);
    let arrivalUntil = 0;
    arrival.textContent = "";
    arrival.classList.add("hidden");
    const announce = msg => { arrival.textContent = msg; arrivalUntil = performance.now() + 5000; };
    hazard.onclick = () => showTip({ target: hazard }, true);
    $(".keep-name", hud).textContent = lastEndless ? "The Endless Levy — Wave 1" : st.name;
    $(".objective", hud).textContent = lastEndless ? "Survive the waves. Raze keeps to mend." : (st.boss ? "Slay the Collector King. Raze his throne." : "Raze the enemy keep.");

    const spBtn = $(".spell-btn", hud);
    $("img", spBtn).src = BC.iconURL("bases:" + tribe, 0, 64);
    spBtn.dataset.tip = `${T.spell.name} (Key R / Tap Totem, ${T.spell.cd}s CD) — ${T.spell.desc}`;
    spBtn.setAttribute("aria-label", `${T.spell.name} — Totem spell (R)`);
    spBtn.onclick = () => command(spBtn, () => battle.castSpell(false));

    const spdBtn = $(".speed-btn", hud);
    const applySpeed = (spd) => {
      S().settings.speed = spd;
      BC.persist();
      if (battle) battle.speed = spd;
      spdBtn.textContent = spd + "x";
      spdBtn.setAttribute("aria-label", `Battle speed: ${spd}x. Press X to change.`);
      spdBtn.classList.toggle("fast", spd > 1);
    };
    applySpeed(S().settings.speed || 1);
    spdBtn.onclick = () => { if (!battle || battle.paused || battle.over) return; BC.sfx.click(); applySpeed((S().settings.speed || 1) === 1 ? 2 : 1); };

    const btnWrap = $(".unit-buttons", hud);
    btnWrap.innerHTML = "";
    // Unavailable actions stay focusable so their requirements can be inspected.
    // The battle validates every action before changing state.
    const inspectUnit = e => {
      const button = e.target.closest(".ubtn, .cast-btn, .unit-slot");
      if (button && battle && !battle.paused && !battle.over) showTip({ target: button }, true);
    };
    btnWrap.addEventListener("click", inspectUnit);
    const castBtns = [];
    const btns = line.map((name, i) => {
      const ability = BC.UNITS[name].ability;
      const b = h("button", { class: "ubtn", "aria-label": `Deploy ${name} (${i + 1})`, "data-tip": `${unitTip(name, tribe)}\nDeploy: ${i + 1} · Cast: ${AB_KEYS[i]}`,
        onclick: () => command(b, () => battle.deploy(i)) },
        h("span", { class: "key" }, i + 1),
        h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
        h("span", { class: "cost" }), h("span", { class: "cool" }), h("span", { class: "deploy-cd" }),
        // HUD doc: "a spiral of mystical runes that dissipate as the cooldown reduces"
        h("span", { class: "spiral" }, Array.from({ length: 8 }, (_, k) => {
          const a = k * 0.95, r = 4 + k * 4.6;
          return h("span", { style: `left:${50 + Math.cos(a) * r}%;top:${44 + Math.sin(a) * r}%;transform:translate(-50%,-50%) rotate(${a}rad);opacity:0` }, RUNES[(k * 5 + i * 3) % RUNES.length]);
        })));
      const cast = h("button", { class: "cast-btn", "aria-label": `Cast ${ability.name} (${AB_KEYS[i]})`, "data-tip": `${ability.name} — ${ability.desc}`,
        onclick: () => command(cast, () => battle.castBySlot(i)) },
        h("span", { class: "cast-label" }, `Cast · ${AB_KEYS[i]}`), h("span", { class: "cast-state" }, "Deploy first"));
      castBtns.push(cast);
      btnWrap.append(h("div", { class: "unit-slot", "data-tip": b.dataset.tip }, h("span", { class: "unit-caption", "aria-hidden": "true" }, name), b, cast));
      return b;
    });
    const pause = $("#battle .pause");
    pause.classList.add("hidden");
    $(".autocast", pause).checked = S().settings.autocast;
    $(".autocast", pause).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); if (battle) battle.autocast = e.target.checked; };
    const guide = $(".battle-guide", hud);
    const renderGuide = (B) => {
      const step = S().tutorial.battle;
      guide.classList.toggle("hidden", !guiding || B.paused || B.over);
      $(".autocast", pause).disabled = guiding;
      $(".tutorial-auto-note", pause).classList.toggle("hidden", !guiding);
      B.autocast = !guiding && S().settings.autocast;
      $(".cast-mode", hud).textContent = B.autocast ? "Auto-cast on" : "Manual abilities";
      btns.forEach(b => b.classList.toggle("guide-target", guiding && step === "deploy"));
      castBtns.forEach(b => b.classList.toggle("guide-target", guiding && step === "ability"));
      spBtn.classList.toggle("guide-target", guiding && step === "spell");
      if (!guiding || guide.dataset.step === step) return;
      guide.dataset.step = step;
      const copy = {
        deploy: ["1 / 4 · Send a warrior", "Tap a portrait below (1–5). Deployment costs gold; your warriors fight as they advance."],
        ability: ["2 / 4 · Cast an ability", "Use a Cast button (Q / W / E / A / S) when it says Ready. Some abilities need a foe in range."],
        spell: ["3 / 4 · Call on your Totem", `Use ${T.spell.name}: tap the Totem button (R) while your warriors are deployed.`],
      }[step];
      $(".guide-copy", guide).replaceChildren(h("strong", {}, copy[0]), h("p", {}, copy[1]));
    };
    $(".guide-skip", guide).onclick = () => { BC.skipTutorial(); guiding = false; renderGuide(battle); };
    const setPaused = (p) => {
      if (!battle || battle.over) return;
      battle.paused = p;
      BC.audio.setPaused(p);
      if (p) {
        syncAudioControls();
        $(".pause-summary", pause).textContent = `${battle.stage.name} · ${fmtTime(battle.t)}`;
        openDialog(pause, () => setPaused(false), ".resume");
      } else closeDialog(pause);
      renderGuide(battle); battle.onHud(battle, true);
    };
    $(".hud-right .gear", hud).onclick = () => setPaused(true);
    $(".resume", pause).onclick = () => setPaused(false);
    $(".retreat", pause).onclick = async () => {
      if (!(await confirmBox(lastEndless ? "End this Endless run and claim wave rewards?" : "Retreat? The spoils of this battle will be lost."))) return;
      const s = battle.stats; s.time = battle.t;
      battle.over = true;
      endBattle({ win: false, retreat: true, stats: s });
    };

    const onVisibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", onVisibility);
    let hudTick = 0;
    battle = new BC.Battle($("#battle-canvas"), {
      tribe, stage: lastStage, endless: lastEndless, lineup: line,
      autocast: !guiding && S().settings.autocast, speed: S().settings.speed || 1, toast, announce,
      onEnd: (r) => endBattle(r),
      onAction: (action, B) => {
        if (guiding && BC.advanceTutorial(action)) {
          if (S().tutorial.battle === "done") { guiding = false; toast("Battle basics learned. Win to earn your first Runic Burns!"); }
          renderGuide(B);
        }
        B.onHud(B, true);
      },
      onHud: (B, force) => {
        if (!force && (hudTick++ & 1) === 1) return;
        $(".gold-val", hud).textContent = Math.floor(B.gold);
        $(".battle-time", hud).textContent = fmtTime(B.t);
        $(".hp-bar", hud).classList.toggle("critical", B.player.hp / B.player.max <= .25);
        $(".hp-bar", hud).setAttribute("aria-label", `Totem health: ${Math.max(0, Math.ceil(B.player.hp))} of ${Math.round(B.player.max)}`);
        $(".keep-bar", hud).setAttribute("aria-label", `Enemy keep: ${Math.max(0, Math.ceil(B.enemy.hp))} of ${Math.round(B.enemy.max)} health`);
        spdBtn.disabled = B.paused || B.over;
        $(".hp-liquid", hud).style.setProperty("--hp", Math.max(0, B.player.hp / B.player.max * 100) + "%");
        $(".hp-text", hud).textContent = Math.max(0, Math.ceil(B.player.hp)) + " / " + Math.round(B.player.max);
        $(".keep-fill", hud).style.width = Math.max(0, B.enemy.hp / B.enemy.max * 100) + "%";
        $(".keep-name", hud).title = `${B.stage.name} · ${Math.max(0, Math.ceil(B.enemy.hp))} / ${B.enemy.max} HP`;
        if (B.endless) $(".keep-name", hud).textContent = B.stage.name;
        const spK = B.player.spellCd / T.spell.cd;
        const spellReason = T.spell.unavailable?.(B);
        const spellState = B.player.spellCd > 0 ? `Ready in ${Math.ceil(B.player.spellCd)}s` : spellReason || "Ready";
        $(".cool", spBtn).style.setProperty("--cd", (spK * 100) + "%");
        spBtn.classList.toggle("cooling", B.player.spellCd > 0);
        $(".spell-state", spBtn).textContent = B.player.spellCd > 0 ? Math.ceil(B.player.spellCd) + "s" : spellReason ? "Blocked" : "Ready";
        spBtn.disabled = B.paused || B.over;
        spBtn.setAttribute("aria-disabled", String(spBtn.disabled || B.player.spellCd > 0 || !!spellReason));
        spBtn.setAttribute("aria-label", `${T.spell.name} (R). ${spellState}`);
        updateTip(spBtn, `${T.spell.name} · ${spellState}\n${T.spell.desc}\nCast: R / Tap Totem`);
        const hz = B.stage.hazard;
        hazard.classList.toggle("hidden", !hz || B.paused || B.over);
        if (hazard.classList.contains("hidden") && tipTarget === hazard) hideTip();
        if (hz) {
          if (hazard.textContent !== hz.name) hazard.textContent = hz.name;
          updateTip(hazard, `Biome hazard: ${hz.name}\n${hz.desc}`);
        }
        arrival.classList.toggle("hidden", !arrivalUntil || performance.now() >= arrivalUntil || B.paused || B.over);
        const warning = $(".surge-warning", hud);
        warning.classList.toggle("hidden", B.surgeT > 5 || B.paused || B.over);
        const warningText = `Enemy surge in ${Math.ceil(B.surgeT)}s`;
        if (warning.textContent !== warningText) warning.textContent = warningText;
        const alive = B.ents.filter(e => !e.dead && e.side === "player" && e.kind === "unit").length;
        const dep = $(".deployed", hud);
        if (dep.dataset.n !== String(alive)) {
          dep.dataset.n = alive; dep.innerHTML = "";
          for (let i = 0; i < Math.min(alive, 8); i++) dep.append(h("i"));
          if (alive > 8) dep.append(h("b", {}, "+" + (alive - 8)));
        }
        B.slots.forEach((s, i) => {
          const cost = B.costOf(s), cdMax = 1.5 + s.stats.cost / 45;
          const costLabel = $(".cost", btns[i]);
          if (costLabel.textContent !== String(cost)) costLabel.textContent = cost;
          const shortfall = Math.max(0, Math.ceil(cost - B.gold));
          const deployState = s.cd > 0 ? `Deploy again in ${Math.ceil(s.cd)}s` : shortfall ? `Need ${shortfall} more gold` : "Ready to deploy";
          const detail = `${unitTip(s.name, tribe, s.stats, cost)}\n${deployState}\nDeploy: ${i + 1} · Cast: ${AB_KEYS[i]}`;
          updateTip(btns[i], detail);
          updateTip(btns[i].parentElement, detail);
          const k = s.cd / cdMax;
          $(".cool", btns[i]).style.setProperty("--cd", (k * 100) + "%");
          const runes = btns[i].querySelectorAll(".spiral span");
          runes.forEach((r, j) => { r.style.opacity = Math.max(0, Math.min(1, k * runes.length - j)).toFixed(2); });
          btns[i].classList.toggle("poor", B.gold < cost);
          const deployLabel = $(".deploy-cd", btns[i]);
          deployLabel.textContent = s.cd > 0 ? Math.ceil(s.cd) + "s" : shortfall ? `Need ${shortfall}g` : "";
          deployLabel.classList.toggle("shortfall", s.cd <= 0 && shortfall > 0);
          btns[i].disabled = B.paused || B.over;
          btns[i].setAttribute("aria-disabled", String(btns[i].disabled || s.cd > 0 || shortfall > 0));
          btns[i].setAttribute("aria-label", `Deploy ${s.name} (${i + 1}), ${cost} gold. ${deployState}`);
          const state = B.abilityState(i);
          const castState = !state.deployed ? "Deploy first" : state.ready ? (state.ready > 1 ? `${state.ready} ready` : "Ready") : `Ready in ${Math.ceil(state.cooldown)}s`;
          const ability = BC.UNITS[s.name].ability;
          $(".cast-state", castBtns[i]).textContent = !state.deployed || state.ready ? castState : Math.ceil(state.cooldown) + "s";
          updateTip(castBtns[i], `${ability.name} · ${castState}\n${ability.desc}\nCast: ${AB_KEYS[i]} / Shift+${i + 1}`);
          castBtns[i].disabled = B.paused || B.over;
          castBtns[i].setAttribute("aria-disabled", String(castBtns[i].disabled || !state.ready));
          castBtns[i].setAttribute("aria-label", `Cast ${ability.name} (${AB_KEYS[i]}). ${castState}`);
          castBtns[i].classList.toggle("ready", state.ready > 0);
        });
      },
    });
    BC.currentBattle = battle;
    renderGuide(battle);
    battle.onHud(battle, true);
    keyHandler = (e) => {
      if (!battle || battle.over || transitioning || dialogs.length) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches("input, select, textarea, [contenteditable]")) return;
      if (e.key === " " || e.key === "Escape") {
        if (e.key === " " && e.target.closest("button")) return;
        e.preventDefault();
        if (!e.repeat) setPaused(!battle.paused);
        return;
      }
      if (battle.paused || e.repeat) return;
      // Shift changes event.key to punctuation on many keyboard layouts.
      const digit = /^Digit[1-5]$/.test(e.code) ? e.code.slice(-1) : e.key;
      if (digit >= "1" && digit <= "5") {
        if (e.shiftKey) command(castBtns[+digit - 1], () => battle.castBySlot(+digit - 1));
        else command(btns[+digit - 1], () => battle.deploy(+digit - 1));
      } else if (AB_KEYS.includes(e.key.toUpperCase())) {
        const slot = AB_KEYS.indexOf(e.key.toUpperCase());
        command(castBtns[slot], () => battle.castBySlot(slot));
      } else if (e.key === "f" || e.key === "F") {
        hideTip();
        battle.castAny();
      } else if (e.key === "r" || e.key === "R" || e.key === "0") {
        command(spBtn, () => battle.castSpell(false));
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (!e.repeat) applySpeed((S().settings.speed || 1) === 1 ? 2 : 1);
      }
    };
    addEventListener("keydown", keyHandler);
    return () => {
      clearTimeout(toastT);
      btnWrap.removeEventListener("click", inspectUnit);
      document.removeEventListener("visibilitychange", onVisibility);
      guide.classList.add("hidden");
      removeEventListener("keydown", keyHandler);
      if (battle) { battle.destroy(); battle = null; BC.currentBattle = null; }
    };
  };

  // -------------------------------------------------------------- result --
  let lastResult = null;
  function endBattle(r) {
    const tribe = S().tribe;
    r.endless = lastEndless;
    r.rewards = [];
    for (const [k, cnt] of Object.entries(r.stats.killedByType || {})) {
      S().bestiary[k] = (S().bestiary[k] || 0) + cnt;
    }
    if (lastEndless) {
      const waves = r.stats.waves || 1;
      S().endless[tribe] = Math.max(S().endless[tribe] || 0, waves);
      const burnCount = Math.floor((waves - 1) / 2);
      for (let i = 0; i < burnCount; i++) {
        const b = BC.makeBurn(BC.rollTier(Math.min(9, waves)));
        S().burns.push(b);
        r.rewards.push({ kind: "burn", burn: b });
      }
    } else if (r.win) {
      const firstClear = lastStage === S().progress[tribe];
      if (firstClear) {
        S().progress[tribe] = Math.min(10, lastStage + 1);
        const newUnit = lastStage + 3 < 10 ? BC.tribeUnits(tribe)[lastStage + 3] : null;
        if (newUnit) {
          if (!S().newUnits.includes(newUnit)) S().newUnits.push(newUnit);
          r.rewards.push({ kind: "unit", name: newUnit });
        }
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
    const rewardSounds = [];
    const r = lastResult, s = r.stats;
    const title = $("#result .result-title");
    title.textContent = r.endless ? `The Levy Ends — Wave ${s.waves || 1}` : (r.win ? (lastStage === 9 ? "The Crown Falls" : "Victory") : r.retreat ? "Retreated" : "The Totem Breaks");
    title.className = "result-title" + (r.win || (r.endless && (s.waves || 1) >= 3) ? "" : " lose");
    $("#result .result-subtitle").textContent = `${BC.TRIBES[S().tribe].name} · ${r.endless ? "The Endless Levy" : BC.STAGES[lastStage].name}`;
    const tabs = $("#result .tablets");
    tabs.innerHTML = "";
    const statList = [["Foes slain", s.kills], ["Gold earned", Math.round(s.goldEarned)], ["Warriors sent", s.deployed], ["Fallen", s.lost], ["Abilities", s.abilities], ["Time", fmtTime(s.time || 0)]];
    if (r.endless) statList.unshift(["Waves Reached", s.waves || 1]);
    statList.forEach(([k, v]) => tabs.append(h("div", { class: "stab" }, h("b", {}, v), h("span", {}, k))));
    const rw = $("#result .rewards");
    rw.innerHTML = "";
    const unitRewards = [];
    const nudge = $("#result .warband-nudge");
    const syncLineup = () => {
      const tribe = S().tribe, line = BC.lineup(tribe);
      const canFill = line.length < 5 && BC.unlockedUnits(tribe).some(n => !line.includes(n));
      nudge.replaceChildren(h("span", {}, `Lineup ${line.length}/5. ` + (S().tutorial.burn === "equip" && S().burns.length ? "Visit the Warband to equip your first Runic Burn." : "Prepare your warriors before the next battle.")));
      if (canFill) nudge.append(h("button", { class: "stone-btn fill-lineup", onclick: () => { BC.fillLineup(tribe); syncLineup(); } }, "Fill empty slots"));
      for (const { name, button } of unitRewards) {
        const added = line.includes(name);
        button.disabled = added;
        button.textContent = added ? "In your lineup" : line.length < 5 ? "Add to lineup" : "Manage lineup";
      }
    };
    if (r.win || (r.endless && r.rewards.length)) {
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
      rewardSounds.push(setTimeout(() => BC.sfx.coin(), 500), setTimeout(() => BC.sfx.coin(), 700), setTimeout(() => BC.sfx.chime(), 900));
      const line = h("div", { class: "reward-line" });
      r.rewards.forEach((x, i) => {
        if (x.kind === "unit") {
          const button = h("button", { class: "stone-btn reward-add", onclick: () => {
            if (BC.lineup(S().tribe).length >= 5) return openWarband("result", x.name);
            if (BC.addToLineup(S().tribe, x.name)) { BC.sfx.chime(); syncLineup(); }
          } });
          unitRewards.push({ name: x.name, button });
          line.append(h("div", { class: "reward-card new-warrior", style: `border-color:var(--gold);animation-delay:${0.3 + i * 0.25}s` },
            h("img", { class: "px", src: BC.iconURL("units:" + x.name, 0, 64) }), h("b", {}, "New warrior: " + x.name), button));
        }
        else if (x.kind === "achievement") { const a = BC.ACHIEVEMENTS[x.id], t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("div", { style: "color:#ffd700" }, "✦ " + a.name), h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down))); }
        else { const t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down))); }
      });
      rw.append(line);
      if (!r.endless && lastStage === 9) rw.append(h("p", { class: "parchment", style: "max-width:520px" }, "The Collector King drowns in his own gold, and the river finally gives back its dead. Your wife's name is spoken in every village you freed. It does not bring her home."));
    } else {
      rw.append(h("p", { style: "font-style:italic;color:#c8b89a" }, r.retreat ? "You live to bleed another day." : "The collectors will count your dead by morning."));
      const ach = r.rewards.filter(x => x.kind === "achievement");
      if (ach.length) rw.append(h("div", { class: "reward-line" }, ach.map(x => { const t = BC.BURN_TIERS[x.burn.tier]; return h("div", { class: "reward-card", style: `border-color:${t.color}` }, h("div", { style: "color:#ffd700" }, "✦ " + BC.ACHIEVEMENTS[x.id].name), h("b", { style: `color:${t.color}` }, t.name)); })));
    }
    $("#result .retry").onclick = () => startBattle(lastStage, lastEndless);
    $("#result .to-menu").onclick = () => show("menu", true);
    $("#result .manage-warband").onclick = () => openWarband("result", (r.rewards.find(x => x.kind === "unit") || {}).name);
    syncLineup();
    const next = $("#result .next");
    const canNext = r.win && !r.endless && lastStage < 9;
    next.disabled = false;
    next.classList.add("primary");
    next.textContent = canNext ? "Next stage →" : "Campaign map →";
    next.onclick = () => canNext ? startBattle(lastStage + 1, false) : show("campaign", true);
    return () => rewardSounds.forEach(clearTimeout);
  };

  // ------------------------------------------------------------ settings --
  function syncAudioControls() {
    document.querySelectorAll("[data-audio-setting]").forEach(input => {
      const value = S().settings[input.dataset.audioSetting];
      if (input.type === "checkbox") input.checked = value;
      else {
        input.value = Math.round(value * 100);
        input.setAttribute("aria-valuetext", `${input.value}%`);
        input.nextElementSibling.value = `${input.value}%`;
      }
    });
  }
  function initAudioControls() {
    document.querySelectorAll(".audio-controls").forEach(panel => {
      panel.append(h("legend", {}, "Audio"), h("label", { class: "toggle" },
        h("input", { type: "checkbox", class: "opt-sound", "data-audio-setting": "sound" }), "Sound enabled"));
      for (const [key, label] of [["masterVolume", "Master volume"], ["musicVolume", "Music"], ["effectsVolume", "Sound effects"], ["ambienceVolume", "Ambience"]]) {
        const id = `${panel.dataset.audioSettings}-${key}`;
        panel.append(h("label", { class: "audio-level", for: id }, h("span", {}, label),
          h("input", { id, type: "range", min: 0, max: 100, step: 1, "data-audio-setting": key }), h("output", { for: id })));
      }
      panel.addEventListener("input", e => {
        const key = e.target.dataset.audioSetting;
        if (!key) return;
        S().settings[key] = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value) / 100;
        if (key === "masterVolume") BC.cancelNarration();
        BC.audio.sync(); syncAudioControls(); BC.persist();
      });
    });
    syncAudioControls();
  }
  function openSettings() {
    const m = $("#settings");
    syncAudioControls();
    $(".opt-autocast", m).checked = S().settings.autocast;
    $(".opt-autocast", m).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); };
    $(".opt-narration", m).checked = S().settings.narration;
    $(".opt-ambience", m).checked = S().settings.ambience;
    $(".opt-narration", m).onchange = (e) => { S().settings.narration = e.target.checked; BC.persist(); BC.audio.sync(); };
    $(".opt-ambience", m).onchange = (e) => { S().settings.ambience = e.target.checked; BC.persist(); BC.audio.sync(); };
    $(".opt-motion", m).value = S().settings.motion;
    $(".opt-motion", m).onchange = e => { S().settings.motion = e.target.value; BC.persist(); syncMotion(); };
    const al = $(".ach-list", m);
    al.innerHTML = "";
    al.append(h("b", { style: "color:var(--gold)" }, "Achievements"));
    for (const [id, a] of Object.entries(BC.ACHIEVEMENTS)) {
      al.append(h("div", { class: "ach" + (S().achievements[id] ? " got" : ""), "data-tip": `Reward: ${BC.BURN_TIERS[a.reward].name}` },
        h("i", { "aria-hidden": "true" }, S().achievements[id] ? "✦" : "✧"), h("div", {}, h("b", {}, a.name), h("small", {}, a.desc)), h("span", { class: "ach-state" }, S().achievements[id] ? "Earned" : "Locked")));
    }
    $(".close", m).onclick = () => closeDialog(m);
    $(".close-icon", m).onclick = () => closeDialog(m);
    $(".replay-intro", m).onclick = () => { closeDialog(m); show("intro", true); };
    $(".replay-tutorial", m).disabled = !S().tribe;
    $(".replay-tutorial", m).onclick = () => {
      BC.resetTutorial(); closeDialog(m); startBattle(0, false);
    };
    $(".reset", m).onclick = async () => {
      if (!(await confirmBox("Erase every stage, warrior and Runic Burn? This cannot be undone."))) return;
      BC.resetSave(); syncMotion(); syncAudioControls(); BC.audio.sync(); closeDialog(m); show("menu", true);
    };
    syncSaveStatus(); openDialog(m, () => closeDialog(m), ".opt-sound");
  }

  initAudioControls();
  if (S().tribe) applyTribeVars(S().tribe);
  boot();
})();
