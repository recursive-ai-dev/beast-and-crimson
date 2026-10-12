/* Core services: save data, runic burns, asset loading, synth audio. */
(function () {
  "use strict";
  const BC = window.BC;

  // ---------------------------------------------------------------- save --
  const KEY = "bc-tribes-save-v1";
  const DEFAULT = () => ({
    v: 1, tribe: null, seenIntro: false, nextId: 1,
    progress: { offense: 0, defense: 0, greed: 0 },
    lineup: {}, burns: [], equipped: {},
    settings: { sound: true, autocast: false, narration: true, ambience: true },
    achievements: {},
  });
  let save;
  try { save = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { save = DEFAULT(); }
  save.settings = Object.assign(DEFAULT().settings, save.settings);
  save.achievements = save.achievements || {};
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
  const resetSave = () => { save = DEFAULT(); BC.save = save; persist(); };

  const tribeUnits = (tribe) => Object.keys(BC.UNITS).filter(n => BC.UNITS[n].tribe === tribe);
  const unlockedUnits = (tribe) => tribeUnits(tribe).slice(0, Math.min(10, 3 + save.progress[tribe]));
  const lineup = (tribe) => {
    const ok = unlockedUnits(tribe);
    let l = (save.lineup[tribe] || []).filter(n => ok.includes(n));
    if (!l.length) l = ok.slice(0, 5);
    save.lineup[tribe] = l;
    return l;
  };

  // --------------------------------------------------------- runic burns --
  function makeBurn(tier, rand) {
    rand = rand || Math.random;
    const keys = Object.keys(BC.BURN_STATS);
    const buff = keys[Math.floor(rand() * keys.length)];
    let debuff = buff;
    while (debuff === buff) debuff = keys[Math.floor(rand() * keys.length)];
    const u = BC.BURN_STATS[buff].up, d = BC.BURN_STATS[debuff].down;
    const up = (u[0] + rand() * (u[1] - u[0])) * BC.TIER_UP[tier];
    const down = (d[0] + rand() * (d[1] - d[0])) * BC.TIER_DOWN[tier];
    return { id: save.nextId++, tier, buff, up: Math.round(up * 10) / 10, debuff, down: Math.round(down * 10) / 10 };
  }

  function rollTier(stage, rand) {
    rand = rand || Math.random;
    // higher stages shift the tier curve upward; Cosmic stays near-mythical
    const r = rand() + stage * 0.05;
    const cuts = [0.45, 0.72, 0.9, 1.02, 1.12, 1.2];
    let t = 0;
    while (t < cuts.length && r > cuts[t]) t++;
    if (t === 6) t = 5;   // Cosmic Brands come only from achievements
    return t;
  }

  function applyMod(stats, key, pct, isBuff) {
    const f = pct / 100;
    if (key === "cost") stats.cost = Math.round(stats.cost * (isBuff ? 1 - f : 1 + f));
    else if (key === "abspd") stats.abspd = stats.abspd * (isBuff ? 1 / (1 + f) : 1 + f);
    else stats[key] = stats[key] * (isBuff ? 1 + f : 1 - f);
  }

  function unitStats(name, tribe, noBurn) {
    const base = Object.assign({}, BC.UNITS[name].stats);
    const burn = !noBurn && save.burns.find(b => b.id === save.equipped[name]);
    if (burn) { applyMod(base, burn.buff, burn.up, true); applyMod(base, burn.debuff, burn.down, false); }
    base.hp *= BC.TUNE.unitHp;
    base.dmg *= BC.TUNE.unitDmg;
    const mods = BC.TRIBES[tribe].mods;
    if (mods.dmg) base.dmg *= mods.dmg;
    if (mods.hp) base.hp *= mods.hp;
    if (mods.def) base.def *= mods.def;
    return base;
  }

  const burnText = (b) => {
    const s = BC.BURN_STATS;
    const upTxt = s[b.buff].inverse ? `-${b.up}% ${s[b.buff].label}` : `+${b.up}% ${s[b.buff].label}`;
    const dnTxt = s[b.debuff].inverse ? `+${b.down}% ${s[b.debuff].label}` : `-${b.down}% ${s[b.debuff].label}`;
    return { up: upTxt, down: dnTxt };
  };

  // -------------------------------------------------------------- assets --
  const images = {};
  function loadAssets(onProgress) {
    const M = window.BC_ASSETS;
    if (!M) return Promise.reject(new Error("assets/manifest.js missing — run tools/build_sprites.py"));
    const jobs = [];
    for (const group of ["units", "bases", "enemies", "tiles", "keeps", "props", "artifacts"]) {
      for (const [k, v] of Object.entries(M[group] || {})) jobs.push([group + ":" + k, "assets/" + v.src]);
    }
    let done = 0;
    return Promise.all(jobs.map(([key, src]) => new Promise((res) => {
      const im = new Image();
      im.onload = im.onerror = () => { images[key] = im; done++; onProgress && onProgress(done / jobs.length); res(); };
      im.src = src;
    })));
  }

  /** Draw one 32px (or `cell`) frame of a strip. */
  function drawFrame(ctx, key, frame, x, y, scale, flip, cell) {
    const im = images[key];
    if (!im || !im.width) return;
    cell = cell || 32;
    scale = scale || 1;
    const w = cell * scale;
    ctx.save();
    if (flip) { ctx.translate(Math.round(x + w), Math.round(y)); ctx.scale(-1, 1); }
    else ctx.translate(Math.round(x), Math.round(y));
    ctx.drawImage(im, frame * cell, 0, cell, cell, 0, 0, w, w);
    ctx.restore();
  }

  /** A frame as a data-URL canvas for DOM buttons. */
  const iconCache = {};
  function iconURL(key, frame, size) {
    const id = key + ":" + frame + ":" + size;
    if (iconCache[id]) return iconCache[id];
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    drawFrame(g, key, frame, 0, 0, size / 32);
    return (iconCache[id] = c.toDataURL());
  }

  // --------------------------------------------------------------- audio --
  let actx = null;
  const ac = () => {
    if (!save.settings.sound) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === "suspended") actx.resume();
    return actx;
  };
  // Browsers keep audio suspended until a gesture; wake it (and the ambience) on the first one.
  const wake = () => { if (actx && actx.state === "suspended") actx.resume(); };
  addEventListener("pointerdown", wake);
  addEventListener("keydown", wake);
  function tone(freq, dur, type, vol, slide, when) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, when, hp) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 800;
    s.buffer = buf; g.gain.value = vol || 0.15;
    s.connect(f).connect(g).connect(a.destination);
    s.start(t);
  }
  const sfx = {
    drum: (w) => { tone(90, 0.35, "sine", 0.5, 0.5, w); noise(0.08, 0.08, w, 200); },
    drums: () => { [0, 0.18, 0.36, 0.6].forEach((w, i) => sfx.drum(w + (i === 3 ? 0.02 : 0))); },
    chime: () => { [880, 1320, 1760].forEach((f, i) => tone(f, 0.9, "triangle", 0.08, null, i * 0.07)); },
    hit: () => { noise(0.06, 0.06, 0, 1500); tone(160, 0.08, "square", 0.04, 0.6); },
    coin: () => { tone(1400, 0.08, "square", 0.04); tone(2100, 0.12, "square", 0.04, null, 0.06); },
    deploy: () => { tone(220, 0.15, "triangle", 0.15, 1.5); sfx.drum(0); },
    cast: () => { tone(440, 0.4, "sawtooth", 0.06, 2); tone(660, 0.5, "triangle", 0.06, 1.5, 0.05); },
    die: () => { tone(200, 0.3, "sawtooth", 0.05, 0.3); },
    win: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.6, "triangle", 0.12, null, i * 0.15)); sfx.drums(); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.7, "sawtooth", 0.06, null, i * 0.22)); },
    click: () => tone(600, 0.05, "square", 0.04),
  };

  // Tribe ambience (BC Main Menu: "ambient sounds that match the tribe's aesthetic").
  let amb = null;
  function ambience(tribe) {
    if (amb && amb.tribe === tribe) return;
    if (amb) { amb.stop(); amb = null; }
    if (!tribe || !save.settings.ambience) return;
    const a = ac(); if (!a) return;
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, a.currentTime);
    out.gain.exponentialRampToValueAtTime(0.5, a.currentTime + 2);
    out.connect(a.destination);
    const nodes = [], timers = [];
    const loopNoise = (type, freq, q, vol) => {
      const len = a.sampleRate * 4, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = a.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(out); src.start();
      nodes.push(src);
      return { f, g };
    };
    const drone = (freq, vol) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = freq; g.gain.value = vol;
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = 0.07; lg.gain.value = vol * 0.6; lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(out); o.start(); lfo.start();
      nodes.push(o, lfo);
    };
    const pling = (freqs, vol, every) => timers.push(setInterval(() => {
      if (Math.random() < 0.5) return;
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.frequency.value = freqs[Math.floor(Math.random() * freqs.length)];
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g).connect(out); o.start(t); o.stop(t + 1.3);
    }, every));
    if (tribe === "offense") {          // fire pits: low roar + crackle
      loopNoise("lowpass", 300, 0.7, 0.35); drone(49, 0.05);
      timers.push(setInterval(() => { if (Math.random() < 0.6) noise(0.03, 0.05 + Math.random() * 0.05, 0, 2500); }, 140));
    } else if (tribe === "defense") {   // river through the forest + wind
      loopNoise("bandpass", 900, 0.6, 0.25);
      const wind = loopNoise("bandpass", 400, 3, 0.12);
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.1; lg.gain.value = 250;
      lfo.connect(lg).connect(wind.f.frequency); lfo.start(); nodes.push(lfo);
      pling([1760, 2093, 2349], 0.02, 1900);
    } else {                            // treasure cave: drips + coin glints
      drone(55, 0.05); loopNoise("lowpass", 200, 1, 0.15);
      pling([1200, 1500, 1800, 2600], 0.035, 900);
    }
    amb = { tribe, stop: () => {
      timers.forEach(clearInterval);
      out.gain.setTargetAtTime(0.0001, a.currentTime, 0.4);
      setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) { /* already */ } }); out.disconnect(); }, 1500);
    } };
  }

  // Tribe narration: a guttural, whispering voice that warns rather than describes.
  function narrate(text) {
    if (!save.settings.narration || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find(v => /male|daniel|fred|david|george/i.test(v.name) && /^en/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
    u.pitch = 0.1; u.rate = 0.72; u.volume = 0.9;
    speechSynthesis.speak(u);
  }

  Object.assign(BC, {
    save, persist, resetSave, tribeUnits, unlockedUnits, lineup,
    makeBurn, rollTier, unitStats, burnText,
    images, loadAssets, drawFrame, iconURL, sfx, ambience, narrate,
  });
})();
