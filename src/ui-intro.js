/* Loading screen and intro cut-scene. */
(function () {
  "use strict";
  const BC = window.BC;
  const { $, h, S, ICON_COLOR, TRIBE_ROLE, SCREENS, state, show } = BC.UI;

  const LOAD_STAGES = [[0, "Rousing the tribes"], [0.3, "Awakening thirty warriors"], [0.6, "Lighting the totems"], [0.9, "The crown is watching"]];
  const RECAP_AFTER = 7 * 24 * 3600 * 1000;   // absence after which the story recap plays on launch
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
      const hh = (t * 0.9 + i * 0.173) % 1, sway = Math.sin(i * 12.9 + t * 3) * (5 + p * 3) * hh;
      const r = Math.max(1, Math.round((1 - hh) * size));
      const rgb = hh < 0.3 ? "255,236,140" : hh < 0.65 ? "255,130,30" : "200,30,10";
      g.fillStyle = `rgba(${rgb},${(1 - hh) * (0.35 + p * 0.65)})`;
      g.fillRect(Math.round(24 + sway - r / 2), Math.round(35 - hh * height), r, r);
    }
  }

  function boot() {
    const tip = $("#loading .tip"), screen = $("#loading"), bar = $("#loading .progress");
    const stageText = $("#loading .load-stage"), prompt = $("#loading .begin-prompt"), emblem = $("#loading .emblem");
    const g = $("#loading .brazier").getContext("2d");
    const tips = BC.TIPS.map(text => [Math.random(), text]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    let ti = 0, real = 0, shown = 0, loaded = false, failed = false, raf, last = performance.now();
    // Players back after a long gap get the short recap before the menu.
    const away = S().seenIntro && S().lastPlayed > 0 && Date.now() - S().lastPlayed > RECAP_AFTER;
    S().lastPlayed = Date.now(); BC.persist();
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
      state.introRecap = away;
      setTimeout(() => show(S().seenIntro && !away ? "menu" : "intro", true), 350);
    };
    Promise.all([BC.loadAssets((p) => { real = p; }), S().seenIntro && !away ? null : BC.loadIntroArt()]).then(() => { loaded = true; real = 1; }).catch((err) => {
      failed = true;
      cancelAnimationFrame(raf);
      clearInterval(tipTimer);
      tip.textContent = String(err.message || err);
    });
    raf = requestAnimationFrame(frame);
  }

  SCREENS.intro = () => {
    const cv = $("#intro-canvas"), g = cv.getContext("2d");
    const sub = $("#intro .subtitle");
    let raf, last = performance.now(), finished = false;
    BC.loadIntroArt();
    const scene = BC.IntroScene.create({ makeCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) });
    const finish = () => { if (finished) return; finished = true; S().seenIntro = true; BC.persist(); state.menuReveal = true; show("menu", true, { required: true }); };
    const recap = state.introRecap; state.introRecap = false;

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
    let chars = [], schedule = [], shown = 0, typingFor = 1, spoken = false, held = 0;
    const TYPE_DELAY = 0.35, TYPE_RATE = 24;   // seconds before typing starts; letters per second
    const OVERRUN = 1.5;                       // most the clock will wait, in seconds, for a narrator still speaking
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
      sub.style.opacity = since > beat.dur - 0.4 && !BC.narrating() ? 0 : 1;
      const progress = BC.reducedMotion ? 1 : (since - TYPE_DELAY) / typingFor;
      const count = BC.typedCount(schedule, progress);
      while (shown < count) chars[shown++].classList.add("on");
    };

    const tl = BC.createTimeline(recap ? BC.INTRO_RECAP : BC.INTRO, {
      onBeat: (beat) => {
        buildSubtitle(beat.text);
        // Type for at most ~65% of the beat so the line can be read before it fades.
        typingFor = Math.max(0.5, Math.min(beat.dur * 0.65 - TYPE_DELAY, chars.length / TYPE_RATE));
        card.classList.toggle("show", !!beat.card);
        spoken = false; held = 0;
        if (beat.sfx) BC.sfx[beat.sfx]?.();
        if (beat.music) BC.audio.cueMusic(true);
      },
      onEnd: finish,
    });
    // Skipping: tap / Space / Enter / → moves to the next beat; holding Esc or the Skip button ends the story.
    const HOLD = 0.8, STEP_GUARD = 220;
    const root = $("#intro"), skipBtn = $(".skip", root), hint = $(".skip-hint", root);
    const holders = new Set();
    let holdT = 0, releasedAt = 1, lastStep = 0;
    const setHold = (v) => skipBtn.style.setProperty("--hold", v.toFixed(3));
    const skipAll = () => { BC.sfx.click(); finish(); };
    const advance = () => {
      const now = performance.now();
      if (finished || now - lastStep < STEP_GUARD) return;
      lastStep = now;
      BC.cancelNarration(); BC.sfx.click();
      tl.next();
    };
    const hold = (src, on) => { if (on) holders.add(src); else holders.delete(src); };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { e.preventDefault(); hold("key", true); return; }
      if ([" ", "Enter", "ArrowRight"].includes(e.key) && !e.repeat && !e.target.closest?.("button")) { e.preventDefault(); advance(); }
    };
    const onKeyUp = (e) => { if (e.key === "Escape") hold("key", false); };
    const onBlur = () => holders.clear();
    const onVisibility = () => {
      // A hidden tab pauses the story; the narrator repeats the current line on return.
      tl.pause(document.hidden);
      if (document.hidden) { BC.cancelNarration(); holders.clear(); }
      else { last = performance.now(); spoken = false; }
    };
    const release = () => { releasedAt = holdT; hold("ptr", false); skipBtn.blur(); };   // blur: Space afterwards advances, not skips
    skipBtn.onpointerdown = () => { releasedAt = 1; hold("ptr", true); };
    skipBtn.onpointerup = release; skipBtn.onpointerleave = release; skipBtn.onpointercancel = release;
    // A keyboard activation (detail 0) skips outright; a quick tap only advances.
    skipBtn.onclick = (e) => { if (e.detail === 0) skipAll(); else if (releasedAt < 0.3) advance(); };
    root.onclick = (e) => { if (!e.target.closest(".skip")) advance(); };
    addEventListener("keydown", onKeyDown); addEventListener("keyup", onKeyUp); addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    const touch = matchMedia("(pointer: coarse)").matches;
    hint.textContent = touch ? "Tap to advance · hold Skip to end" : "Space or click to advance · hold Esc to skip";
    hint.classList.add("show");
    const hintTimer = setTimeout(() => hint.classList.remove("show"), 5000);

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      holdT = holders.size ? holdT + dt : 0;
      setHold(Math.min(1, holdT / HOLD));
      if (holdT >= HOLD) { skipAll(); return; }
      const beat = tl.beat();
      // The narrator starts with the first letters; if still speaking as the beat closes, let the picture ease to a near stop.
      let rate = 1;
      if (beat && !spoken && tl.time - beat.at >= TYPE_DELAY) { spoken = true; if (beat.voice) BC.narrate(beat.voice); }
      if (beat && BC.narrating() && tl.time >= beat.at + beat.dur - 0.5 && held < OVERRUN) { held += dt; rate = 0.3; }
      tl.update(dt * rate);
      if (finished) return;
      if (tl.beat()) typeSubtitle(tl.beat());
      scene.draw(g, tl, dt, BC.reducedMotion);
      raf = requestAnimationFrame(frame);
    };
    tl.start();
    raf = requestAnimationFrame(frame);
    return () => {
      finished = true; cancelAnimationFrame(raf); clearTimeout(hintTimer);
      card.classList.remove("show"); hint.classList.remove("show"); setHold(0);
      removeEventListener("keydown", onKeyDown); removeEventListener("keyup", onKeyUp); removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      root.onclick = skipBtn.onclick = skipBtn.onpointerdown = skipBtn.onpointerup = skipBtn.onpointerleave = skipBtn.onpointercancel = null;
      BC.cancelNarration();
    };
  };

  BC.UI.boot = boot;
})();
