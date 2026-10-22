/* Core services: save data, runic burns, asset loading, synth audio. */
(function () {
  "use strict";
  const BC = window.BC;

  // ---------------------------------------------------------------- save --
  const KEY = "bc-tribes-save-v1";
  const DEFAULT = () => ({
    v: 1, tribe: null, seenIntro: false, nextId: 1,
    progress: { offense: 0, defense: 0, greed: 0 },
    endless: { offense: 0, defense: 0, greed: 0 },
    lineup: {}, burns: [], equipped: {}, ash: 0, bestiary: {}, newUnits: [],
    tutorial: { battle: "deploy", burn: "equip" },
    settings: { sound: true, masterVolume: 0.8, musicVolume: 0.55, effectsVolume: 0.8, ambienceVolume: 0.4, autocast: false, narration: true, ambience: true, speed: 1, motion: "system" },
    achievements: {},
  });
  const record = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const count = (v, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
  function normalizeSave(raw) {
    const src = record(raw), out = DEFAULT();
    out.tribe = Object.hasOwn(BC.TRIBES, src.tribe) ? src.tribe : null;
    out.seenIntro = src.seenIntro === true;
    for (const tribe of Object.keys(out.progress)) {
      out.progress[tribe] = count(record(src.progress)[tribe], BC.STAGES.length);
      out.endless[tribe] = count(record(src.endless)[tribe]);
      const line = record(src.lineup)[tribe];
      out.lineup[tribe] = Array.isArray(line) ? line.filter(n => typeof n === "string" && Object.hasOwn(BC.UNITS, n)) : [];
    }
    const settings = record(src.settings);
    for (const key of ["sound", "autocast", "narration", "ambience"]) if (typeof settings[key] === "boolean") out.settings[key] = settings[key];
    for (const key of ["masterVolume", "musicVolume", "effectsVolume", "ambienceVolume"]) {
      if (Number.isFinite(settings[key])) out.settings[key] = Math.max(0, Math.min(1, settings[key]));
    }
    out.settings.speed = settings.speed === 2 ? 2 : 1;
    out.settings.scene = settings.scene === 1 ? 1 : 0;
    out.settings.motion = ["system", "reduced", "full"].includes(settings.motion) ? settings.motion : "system";
    out.ash = count(src.ash);
    const ids = new Set();
    out.burns = (Array.isArray(src.burns) ? src.burns : []).filter(b => {
      if (!b || !Number.isSafeInteger(b.id) || b.id < 1 || ids.has(b.id) || !Number.isInteger(b.tier) || b.tier < 0 || b.tier > 6) return false;
      if (!Object.hasOwn(BC.BURN_STATS, b.buff) || !Object.hasOwn(BC.BURN_STATS, b.debuff) || b.buff === b.debuff) return false;
      if (![b.up, b.down].every(n => Number.isFinite(n) && n > 0 && n < 100)) return false;
      ids.add(b.id);
      return true;
    }).map(({ id, tier, buff, up, debuff, down }) => ({ id, tier, buff, up, debuff, down }));
    out.nextId = out.burns.reduce((max, b) => Math.max(max, b.id + 1), Math.max(1, count(src.nextId)));
    const equipped = new Set();
    for (const [name, id] of Object.entries(record(src.equipped))) if (Object.hasOwn(BC.UNITS, name) && ids.has(id) && !equipped.has(id)) {
      out.equipped[name] = id; equipped.add(id);
    }
    for (const key of Object.keys(BC.ENEMIES)) out.bestiary[key] = count(record(src.bestiary)[key]);
    for (const key of Object.keys(BC.ACHIEVEMENTS)) if (record(src.achievements)[key]) out.achievements[key] = count(src.achievements[key]) || 1;
    out.newUnits = [...new Set((Array.isArray(src.newUnits) ? src.newUnits : []).filter(n => typeof n === "string" && Object.hasOwn(BC.UNITS, n)))];
    const tutorial = record(src.tutorial);
    if (["deploy", "ability", "spell", "done", "skipped"].includes(tutorial.battle)) out.tutorial.battle = tutorial.battle;
    else if (Object.values(out.progress).some(n => n > 0) || Object.values(out.endless).some(n => n > 0)) out.tutorial.battle = "done";
    if (["equip", "done", "skipped"].includes(tutorial.burn)) out.tutorial.burn = tutorial.burn;
    else if (equipped.size) out.tutorial.burn = "done";
    return out;
  }
  let save;
  BC.saveStatus = "ready";
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    save = normalizeSave(stored);
  }
  catch (e) { save = DEFAULT(); BC.saveStatus = e instanceof SyntaxError ? "recovered" : "unavailable"; }
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(save)); BC.saveStatus = "saved"; }
    catch (e) { BC.saveStatus = "unavailable"; }
    if (typeof window.CustomEvent === "function") window.dispatchEvent(new CustomEvent("bc-save", { detail: BC.saveStatus }));
  };
  const resetSave = () => { save = DEFAULT(); BC.save = save; persist(); };

  const tribeUnits = (tribe) => Object.keys(BC.UNITS).filter(n => BC.UNITS[n].tribe === tribe);
  const unlockedUnits = (tribe) => tribeUnits(tribe).slice(0, Math.min(10, 3 + save.progress[tribe]));
  const mercenaryUnits = (tribe) => ["offense", "defense", "greed"].filter(t => t !== tribe).flatMap(t => unlockedUnits(t));
  const lineup = (tribe) => {
    const ok = unlockedUnits(tribe), mercs = mercenaryUnits(tribe);
    let hasMerc = false;
    const seen = new Set();
    let l = (Array.isArray(save.lineup[tribe]) ? save.lineup[tribe] : []).filter(n => {
      if (seen.has(n) || seen.size >= 5) return false;
      if (!ok.includes(n) && !mercs.includes(n)) return false;
      if (mercs.includes(n) && hasMerc) return false;
      seen.add(n);
      if (ok.includes(n)) return true;
      if (!hasMerc && mercs.includes(n)) { hasMerc = true; return true; }
      return false;
    });
    if (!l.length) l = ok.slice(0, 5);
    save.lineup[tribe] = l;
    return l;
  };

  function addToLineup(tribe, name) {
    const l = lineup(tribe), own = unlockedUnits(tribe), mercs = mercenaryUnits(tribe);
    if (l.length >= 5 || l.includes(name)) return false;
    if (!own.includes(name) && (!mercs.includes(name) || l.some(n => mercs.includes(n)))) return false;
    l.push(name);
    save.newUnits = save.newUnits.filter(n => n !== name);
    persist();
    return true;
  }

  function fillLineup(tribe) {
    const added = [];
    for (const name of unlockedUnits(tribe)) if (addToLineup(tribe, name)) added.push(name);
    return added;
  }

  function advanceTutorial(action) {
    if (action === "equip" && save.tutorial.burn === "equip") save.tutorial.burn = "done";
    else {
      const next = { deploy: "ability", ability: "spell", spell: "done" };
      if (save.tutorial.battle !== action || !next[action]) return false;
      save.tutorial.battle = next[action];
    }
    persist();
    return true;
  }
  function skipTutorial() { save.tutorial = { battle: "skipped", burn: "skipped" }; persist(); }
  function resetTutorial() { save.tutorial = DEFAULT().tutorial; persist(); }

  // --------------------------------------------------------- runic burns --
  function makeBurn(tier, rand, id = save.nextId++) {
    rand = rand || Math.random;
    const keys = Object.keys(BC.BURN_STATS);
    const buff = keys[Math.floor(rand() * keys.length)];
    const other = keys.filter(k => k !== buff);
    const debuff = other[Math.floor(rand() * other.length)];
    const u = BC.BURN_STATS[buff].up, d = BC.BURN_STATS[debuff].down;
    const up = (u[0] + rand() * (u[1] - u[0])) * BC.TIER_UP[tier];
    const down = (d[0] + rand() * (d[1] - d[0])) * BC.TIER_DOWN[tier];
    return { id, tier, buff, up: Math.round(up * 10) / 10, debuff, down: Math.round(down * 10) / 10 };
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

  function salvageBurn(id) {
    const idx = save.burns.findIndex(b => b.id === id);
    if (idx < 0) return 0;
    const b = save.burns[idx];
    const ash = (b.tier + 1) * 2;
    save.burns.splice(idx, 1);
    for (const k of Object.keys(save.equipped)) if (save.equipped[k] === id) delete save.equipped[k];
    save.ash = (save.ash || 0) + ash;
    persist();
    return ash;
  }

  function fuseBurns(tier, rand) {
    if (!Number.isInteger(tier) || tier < 0 || tier >= 5) return null;
    const eqIds = new Set(Object.values(save.equipped));
    const pool = save.burns.filter(b => b.tier === tier && !eqIds.has(b.id));
    if (pool.length < 3) return null;
    const drop = new Set(pool.slice(0, 3).map(b => b.id));
    save.burns = save.burns.filter(b => !drop.has(b.id));
    for (const k of Object.keys(save.equipped)) if (drop.has(save.equipped[k])) delete save.equipped[k];
    const forged = makeBurn(tier + 1, rand);
    save.burns.push(forged);
    persist();
    return forged;
  }

  function rerollBurn(id, rand) {
    const b = save.burns.find(x => x.id === id);
    if (!b) return false;
    const cost = (b.tier + 1) * 3;
    if ((save.ash || 0) < cost) return false;
    save.ash -= cost;
    const fresh = makeBurn(b.tier, rand, b.id);
    Object.assign(b, { buff: fresh.buff, up: fresh.up, debuff: fresh.debuff, down: fresh.down });
    persist();
    return true;
  }

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
  const stageLoads = new Map();
  function loadStageArt(index) {
    index %= BC.STAGES.length;
    if (!stageLoads.has(index)) stageLoads.set(index, new Promise(resolve => {
      const im = new Image();
      im.onload = () => { images["stage:" + index] = im; resolve(im); };
      im.onerror = () => resolve(null);
      im.src = `assets/art/stage-${String(index + 1).padStart(2, "0")}.png`;
    }));
    return stageLoads.get(index);
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
  const ac = () => BC.audio?.context();
  function tone(freq, dur, type, vol, slide, when) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(BC.audio.output("effects"));
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, when, hp, output) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 800;
    s.buffer = buf; g.gain.value = vol || 0.15;
    s.connect(f).connect(g).connect(output || BC.audio.output("effects"));
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
  const retiringAmbience = new Set();
  function ambience(tribe, immediate = false) {
    if (immediate) for (const cleanup of retiringAmbience) cleanup();
    if (document.hidden || !save.settings.sound || !save.settings.ambience || !save.settings.masterVolume || !save.settings.ambienceVolume) tribe = null;
    if (amb && amb.tribe === tribe) return;
    if (amb) { amb.stop(immediate); amb = null; }
    if (!tribe || !save.settings.ambience) return;
    const a = ac(); if (!a) return;
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, a.currentTime);
    out.gain.exponentialRampToValueAtTime(0.5, a.currentTime + 2);
    out.connect(BC.audio.output("ambient"));
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
      timers.push(setInterval(() => { if (Math.random() < 0.6) noise(0.03, 0.05 + Math.random() * 0.05, 0, 2500, out); }, 140));
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
    amb = { tribe, stop: (immediate) => {
      let cleanupTimer;
      const cleanup = () => {
        clearTimeout(cleanupTimer);
        nodes.forEach(n => { try { n.stop(); } catch (e) { /* already */ } n.disconnect(); });
        out.disconnect();
        retiringAmbience.delete(cleanup);
      };
      timers.forEach(clearInterval);
      out.gain.cancelScheduledValues(a.currentTime);
      if (immediate || a.state !== "running") { cleanup(); return; }
      out.gain.setTargetAtTime(0.0001, a.currentTime, 0.4);
      retiringAmbience.add(cleanup);
      cleanupTimer = setTimeout(cleanup, 1500);
    } };
  }
  // Tribe narration: a guttural, whispering voice that warns rather than describes.
  let utterance = null, pendingVoice = null;
  function cancelNarration() {
    utterance = null;
    if (pendingVoice) { pendingVoice(); pendingVoice = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    BC.audio?.duckNarration(false);
  }
  function narrate(text) {
    if (document.hidden || !save.settings.sound || !save.settings.masterVolume || !save.settings.narration || !window.speechSynthesis) return;
    cancelNarration();
    const u = new SpeechSynthesisUtterance(text);
    utterance = u;
    u.pitch = 0.1; u.rate = 0.72; u.volume = 0.9 * save.settings.masterVolume;
    u.onstart = () => { if (utterance === u) BC.audio?.duckNarration(true); };
    u.onend = u.onerror = () => { if (utterance === u) { utterance = null; BC.audio?.duckNarration(false); } };
    const speak = () => {
      if (utterance !== u) return;
      if (pendingVoice) { pendingVoice(); pendingVoice = null; }
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find(v => /male|daniel|fred|david|george/i.test(v.name) && /^en/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length) speak();
    else {
      // Some browsers never announce voices; retain a bounded default fallback.
      const ready = () => { if (speechSynthesis.getVoices().length) speak(); };
      const timer = setTimeout(speak, 1000);
      speechSynthesis.addEventListener("voiceschanged", ready);
      pendingVoice = () => { clearTimeout(timer); speechSynthesis.removeEventListener("voiceschanged", ready); };
    }
  }

  Object.assign(BC, {
    save, persist, resetSave, normalizeSave, tribeUnits, unlockedUnits, mercenaryUnits, lineup, addToLineup, fillLineup,
    advanceTutorial, skipTutorial, resetTutorial,
    makeBurn, rollTier, unitStats, burnText, salvageBurn, fuseBurns, rerollBurn,
    images, loadAssets, loadStageArt, drawFrame, iconURL, sfx, ambience, narrate, cancelNarration,
  });
})();
