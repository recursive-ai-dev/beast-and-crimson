/* Core services: save data, runic burns, asset loading, synth audio. */
(function () {
  "use strict";
  const BC = window.BC;

  // ---------------------------------------------------------------- save --
  const KEY = "bc-tribes-save-v1", BACKUP_KEY = KEY + ".backup", DAMAGED_KEY = KEY + ".damaged";
  const SAVE_VERSION = 1;
  const DEFAULT = () => ({
    v: SAVE_VERSION, tribe: null, seenIntro: false, lastPlayed: 0, nextId: 1,
    progress: { offense: 0, defense: 0, greed: 0 },
    endless: { offense: 0, defense: 0, greed: 0 },
    lineup: {}, burns: [], equipped: {}, ash: 0, bestiary: {}, newUnits: [],
    tutorial: { battle: "deploy", burn: "equip" },
    settings: { sound: true, masterVolume: 0.8, musicVolume: 0.55, effectsVolume: 0.8, ambienceVolume: 0.4, autocast: false, narration: true, ambience: true, speed: 1, motion: "system", burnFilter: "all", burnSort: "tier" },
    achievements: {},
  });
  const record = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const count = (v, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
  function normalizeSave(raw) {
    const src = record(raw), out = DEFAULT();
    out.tribe = Object.hasOwn(BC.TRIBES, src.tribe) ? src.tribe : null;
    out.seenIntro = src.seenIntro === true;
    out.lastPlayed = count(src.lastPlayed);
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
    out.settings.burnFilter = settings.burnFilter === "unbound" || Object.hasOwn(BC.BURN_STATS, settings.burnFilter) ? settings.burnFilter : "all";
    out.settings.burnSort = ["tier", "buff", "quality"].includes(settings.burnSort) ? settings.burnSort : "tier";
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
  let readOnly = false;   // a save from a newer build: playable, but this build must not overwrite it
  BC.saveStatus = "ready";
  BC.saveNotice = "";     // what happened to the save at launch ("restored", "recovered", "newer"); lasts the session
  const parseSave = (text) => {
    const stored = JSON.parse(text);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new SyntaxError("Not a save");
    return stored;
  };
  const writeCopy = (key, text) => { try { localStorage.setItem(key, text); } catch (e) { /* a copy is best effort */ } };
  const removeCopy = (key) => { try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ } };
  function loadSave() {
    let text;
    try { text = localStorage.getItem(KEY); }
    catch (e) { BC.saveStatus = "unavailable"; return normalizeSave({}); }
    if (text === null) return normalizeSave({});
    try {
      const stored = parseSave(text);
      if (stored.v > SAVE_VERSION) { readOnly = true; BC.saveNotice = "newer"; }
      else writeCopy(BACKUP_KEY, text);
      return normalizeSave(stored);
    } catch (e) {
      // Whatever cannot be read is kept, and the last good launch takes its place when there is one.
      writeCopy(DAMAGED_KEY, text);
      try {
        const backup = parseSave(localStorage.getItem(BACKUP_KEY));
        BC.saveNotice = "restored";
        return normalizeSave(backup);
      } catch (e2) {
        BC.saveNotice = "recovered";
        return normalizeSave({});
      }
    }
  }
  save = loadSave();
  const persist = () => {
    if (readOnly) BC.saveStatus = "readonly";
    else {
      try { localStorage.setItem(KEY, JSON.stringify(save)); BC.saveStatus = "saved"; }
      catch (e) { BC.saveStatus = "unavailable"; }
    }
    if (typeof window.CustomEvent === "function") window.dispatchEvent(new CustomEvent("bc-save", { detail: BC.saveStatus }));
  };
  // Another tab saved. Taking its progress means this tab can never write an older copy back over
  // it. The chosen tribe stays per tab, so a battle or its rewards cannot change hands midway.
  addEventListener("storage", (e) => {
    if (e.key !== KEY || e.newValue === null) return;
    let stored;
    try { stored = parseSave(e.newValue); } catch (err) { return; }
    if (stored.v > SAVE_VERSION) { readOnly = true; BC.saveNotice = "newer"; }
    const tribe = save.tribe;
    save = normalizeSave(stored);
    if (tribe) save.tribe = tribe;
    BC.save = save;
    window.dispatchEvent(new CustomEvent("bc-save-external"));
  });
  const resetSave = () => {
    readOnly = false; BC.saveNotice = "";
    removeCopy(BACKUP_KEY); removeCopy(DAMAGED_KEY);
    save = DEFAULT(); BC.save = save; persist();
  };
  const exportSave = () => JSON.stringify(Object.assign({}, save, { v: SAVE_VERSION }), null, 2);
  function importSave(text) {
    let stored;
    try { stored = parseSave(text); }
    catch (e) { return { ok: false, error: "File is not valid save JSON." }; }
    if (stored.v !== undefined && (!Number.isInteger(stored.v) || stored.v < 1)) {
      return { ok: false, error: "Unrecognized save version." };
    }
    if (stored.v > SAVE_VERSION) {
      return { ok: false, error: `Save is from a newer version (v${stored.v}).` };
    }
    const known = ["v", "tribe", "progress", "endless", "burns", "settings", "achievements"];
    if (!known.some(k => Object.hasOwn(stored, k))) {
      return { ok: false, error: "File does not contain Beast and Crimson save data." };
    }
    readOnly = false; BC.saveNotice = "";
    save = normalizeSave(stored);
    BC.save = save;
    persist();
    return { ok: true };
  }

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

  /** mulberry32: exact 32-bit integer arithmetic with a period of 2^32. Returns draws in [0, 1). */
  const makeRng = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

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
    const r = rand() + stage * 0.055;
    const cuts = [0.45, 0.72, 0.9, 1.02, 1.12, 1.2];
    let t = 0;
    while (t < cuts.length && r > cuts[t]) t++;
    if (t === 6) t = 5;   // Cosmic Brands come only from achievements
    return t;
  }

  function applyMod(stats, key, pct, isBuff) {
    const f = pct / 100;
    if (key === "cost") stats.cost = Math.round(stats.cost * (isBuff ? 1 - f : 1 + f));
    else if (key === "abspd") stats.abspd = stats.abspd / (isBuff ? 1 + f : 1 - f);   // a rate, stored as its cooldown
    else stats[key] = stats[key] * (isBuff ? 1 + f : 1 - f);
  }

  function unitStats(name, tribe, noBurnOrBurn) {
    const base = Object.assign({}, BC.UNITS[name].stats);
    const burn = noBurnOrBurn === true ? null
      : (noBurnOrBurn && typeof noBurnOrBurn === "object" ? noBurnOrBurn : save.burns.find(b => b.id === save.equipped[name]));
    if (burn) { applyMod(base, burn.buff, burn.up, true); applyMod(base, burn.debuff, burn.down, false); }
    base.hp *= BC.TUNE.unitHp;
    base.dmg *= BC.TUNE.unitDmg;
    const mods = BC.TRIBES[tribe].mods;
    if (mods.dmg) base.dmg *= mods.dmg;
    if (mods.hp) base.hp *= mods.hp;
    if (mods.def) base.def *= mods.def;
    return base;
  }

  function burnWastedStats(name, burn) {
    const unit = BC.UNITS[name];
    if (!unit || !burn) return [];
    const wasted = [];
    if (unit.stats[burn.buff] === 0 && BC.BURN_STATS[burn.buff]) wasted.push(BC.BURN_STATS[burn.buff].label);
    return wasted;
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

  function fuseCandidates(tier) {
    if (!Number.isInteger(tier) || tier < 0 || tier >= 5) return [];
    const eqIds = new Set(Object.values(save.equipped));
    const pool = save.burns.filter(b => b.tier === tier && !eqIds.has(b.id));
    if (pool.length < 3) return [];
    return pool.slice().sort((a, b) => (a.up - a.down) - (b.up - b.down) || a.id - b.id).slice(0, 3);
  }

  function fuseBurns(tier, rand) {
    const candidates = fuseCandidates(tier);
    if (candidates.length < 3) return null;
    const drop = new Set(candidates.map(b => b.id));
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

  /**
   * Pure, once-only battle reward & achievement resolver.
   * Mutates `outcome` with `.resolved = true` and `.rewards` so repeated calls (e.g. a second
   * Retreat confirmation during a transition) can never grant duplicate spoils.
   */
  function resolveBattleRewards(outcome, opts = {}) {
    if (!outcome || outcome.resolved) return outcome?.rewards || [];
    outcome.resolved = true;
    const tribe = opts.tribe || save.tribe;
    const stageIdx = Number.isInteger(opts.stage) ? opts.stage : 0;
    const endless = !!(opts.endless ?? outcome.endless);
    const rand = opts.rand || Math.random;
    outcome.endless = endless;
    outcome.rewards = [];
    const st = outcome.stats || {};
    for (const [k, cnt] of Object.entries(st.killedByType || {})) {
      if (Object.hasOwn(BC.ENEMIES, k) && cnt > 0) save.bestiary[k] = (save.bestiary[k] || 0) + cnt;
    }
    if (endless) {
      const waves = st.waves || 1;
      save.endless[tribe] = Math.max(save.endless[tribe] || 0, waves);
      const burnCount = waves >= 2 ? Math.floor(waves / 2) : 0;
      for (let i = 0; i < burnCount; i++) {
        const b = makeBurn(rollTier(Math.min(9, waves), rand), rand);
        save.burns.push(b);
        outcome.rewards.push({ kind: "burn", burn: b });
      }
      const ashGain = waves >= 2 ? (waves - 1) * 2 : 0;
      if (ashGain > 0) {
        save.ash = (save.ash || 0) + ashGain;
        outcome.rewards.push({ kind: "ash", amount: ashGain });
      }
    } else if (outcome.win) {
      const firstClear = stageIdx === save.progress[tribe];
      if (firstClear) {
        save.progress[tribe] = Math.min(BC.STAGES.length, stageIdx + 1);
        const newUnit = stageIdx + 3 < 10 ? tribeUnits(tribe)[stageIdx + 3] : null;
        if (newUnit) {
          if (!save.newUnits.includes(newUnit)) save.newUnits.push(newUnit);
          outcome.rewards.push({ kind: "unit", name: newUnit });
        }
      }
      const n = firstClear ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const b = makeBurn(rollTier(stageIdx, rand), rand);
        save.burns.push(b);
        outcome.rewards.push({ kind: "burn", burn: b });
      }
    }
    // Achievements — the only source of Cosmic Brands.
    const done = save.achievements;
    const earned = {
      flawless: outcome.win && (st.baseDmg || 0) === 0,
      regicide: !!st.bossKilled,
      tithe: (st.goldEarned || 0) >= 3000,
      tribes: ["offense", "defense", "greed"].every(k => save.progress[k] >= 10),
    };
    for (const [id, ok] of Object.entries(earned)) {
      if (!ok || done[id]) continue;
      done[id] = Date.now();
      const b = makeBurn(BC.ACHIEVEMENTS[id].reward, rand);
      save.burns.push(b);
      outcome.rewards.push({ kind: "achievement", id, burn: b });
    }
    persist();
    return outcome.rewards;
  }

  // -------------------------------------------------------------- assets --
  const images = {};
  const assetWarnings = [];
  const ASSET_TIMEOUT_MS = 8000;
  function loadImageWithRetry(src, timeoutMs = ASSET_TIMEOUT_MS, retries = 1) {
    return new Promise(resolve => {
      const attempt = (left) => {
        const im = new Image();
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          im.onload = im.onerror = null;
          if (!ok && left > 0) return attempt(left - 1);
          resolve({ ok, im });
        };
        const timer = setTimeout(() => { im.src = ""; done(false); }, timeoutMs);
        im.onload = () => done(true);
        im.onerror = () => done(false);
        im.src = src;
      };
      attempt(retries);
    });
  }
  // Images read from disk taint a canvas, and iconURL could not export them, so file:// play
  // takes its sprites from bundled data URLs. A server never needs that file.
  const loadInlineSprites = () => new Promise(resolve => {
    if (window.location?.protocol !== "file:" || window.BC_INLINE_SPRITES) return resolve();
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.onload = script.onerror = null; resolve(); }, ASSET_TIMEOUT_MS);
    script.src = "assets/sprites.inline.js";
    script.onload = script.onerror = () => { clearTimeout(timer); resolve(); };
    document.head.append(script);
  });
  async function loadAssets(onProgress) {
    const M = window.BC_ASSETS;
    if (!M) throw new Error("assets/manifest.js missing — run tools/build_sprites.py");
    assetWarnings.length = 0;
    await loadInlineSprites();
    const inline = window.BC_INLINE_SPRITES || {};
    const jobs = [];
    for (const group of ["units", "bases", "enemies", "tiles", "keeps", "props", "artifacts"]) {
      for (const [k, v] of Object.entries(M[group] || {})) jobs.push([group + ":" + k, inline[v.src] || "assets/" + v.src]);
    }
    let done = 0;
    return Promise.all(jobs.map(([key, src]) => loadImageWithRetry(src).then(({ ok, im }) => {
      images[key] = im;
      if (!ok) assetWarnings.push(key);
      done++;
      onProgress && onProgress(done / jobs.length);
    })));
  }
  const stageLoads = new Map();
  function loadStageArt(index) {
    index %= BC.STAGES.length;
    if (!stageLoads.has(index)) {
      const pending = loadImageWithRetry(`assets/art/stage-${String(index + 1).padStart(2, "0")}.png`).then(({ ok, im }) => {
        if (ok) { images["stage:" + index] = im; return im; }
        stageLoads.delete(index);   // transient failure can retry on next visit
        return null;
      });
      stageLoads.set(index, pending);
    }
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
  const BLANK_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  function iconURL(key, frame, size) {
    const id = key + ":" + frame + ":" + size;
    if (iconCache[id]) return iconCache[id];
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    drawFrame(g, key, frame, 0, 0, size / 32);
    try { return (iconCache[id] = c.toDataURL()); }
    catch { return (iconCache[id] = BLANK_ICON); }   // a tainted canvas costs an icon, never the game
  }

  // --------------------------------------------------------------- audio --
  const ac = () => BC.audio?.context();
  const noisePool = new WeakMap();
  const sfxStamp = new Map();
  function allowSfx(id, gapMs) {
    if (!gapMs || typeof performance === "undefined") return true;
    const now = performance.now(), prev = sfxStamp.get(id);
    if (prev !== undefined && now > prev && now - prev < gapMs) return false;
    sfxStamp.set(id, now);
    return true;
  }
  function sharedNoise(a) {
    let buf = noisePool.get(a);
    if (!buf) {
      const len = Math.max(8, Math.floor(a.sampleRate * 2));
      buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noisePool.set(a, buf);
    }
    return buf;
  }
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
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 800;
    s.buffer = sharedNoise(a);
    s.loop = dur > 1.8;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(output || BC.audio.output("effects"));
    s.start(t); s.stop(t + dur + 0.02);
  }
  const sfx = {
    drum: (w) => { tone(90, 0.35, "sine", 0.45, 0.5, w); noise(0.08, 0.07, w, 200); },
    drums: () => { if (!allowSfx("drums", 180)) return; [0, 0.18, 0.36, 0.6].forEach((w, i) => sfx.drum(w + (i === 3 ? 0.02 : 0))); },
    chime: () => { [880, 1320, 1760].forEach((f, i) => tone(f, 0.9, "triangle", 0.08, null, i * 0.07)); },
    hit: () => { if (!allowSfx("hit", 45)) return; noise(0.06, 0.055, 0, 1500); tone(160, 0.08, "square", 0.035, 0.6); },
    arrow: () => { if (!allowSfx("arrow", 50)) return; noise(0.07, 0.045, 0, 2600); tone(620, 0.07, "triangle", 0.04, 0.45); },
    heal: () => { if (!allowSfx("heal", 80)) return; [523, 659, 784].forEach((f, i) => tone(f, 0.38, "sine", 0.045, null, i * 0.05)); },
    shield: () => { if (!allowSfx("shield", 80)) return; tone(330, 0.3, "triangle", 0.06, 1.05); tone(495, 0.35, "sine", 0.05, null, 0.03); },
    coin: () => { if (!allowSfx("coin", 40)) return; tone(1400, 0.08, "square", 0.038); tone(2100, 0.12, "square", 0.038, null, 0.06); },
    deploy: () => { if (!allowSfx("deploy", 60)) return; tone(220, 0.15, "triangle", 0.14, 1.5); sfx.drum(0); },
    cast: () => { if (!allowSfx("cast", 60)) return; tone(440, 0.36, "sawtooth", 0.048, 1.9); tone(660, 0.45, "triangle", 0.055, 1.45, 0.05); },
    die: () => { if (!allowSfx("die", 60)) return; tone(200, 0.28, "sawtooth", 0.045, 0.32); },
    boss: () => { if (!allowSfx("boss", 400)) return; tone(65, 1.1, "sawtooth", 0.09, 0.92); tone(98, 1.0, "triangle", 0.11, 0.96, 0.08); sfx.drums(); },
    razed: () => { noise(0.95, 0.2, 0, 120); tone(62, 0.9, "sine", 0.32, 0.35); tone(124, 0.45, "sawtooth", 0.08, 0.4); },
    ach: () => { [587, 784, 988, 1175].forEach((f, i) => tone(f, 0.75, "triangle", 0.08, null, i * 0.08)); },
    win: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.6, "triangle", 0.12, null, i * 0.15)); sfx.drums(); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.7, "sawtooth", 0.06, null, i * 0.22)); },
    click: () => tone(600, 0.05, "square", 0.04),
    // The title landing: a low hammer blow with a spray of sparks.
    strike: () => { tone(78, 0.7, "sine", 0.34, 0.45); tone(156, 0.3, "triangle", 0.1, 0.5); noise(0.45, 0.14, 0, 2400); },
    thunder: () => { noise(1.6, 0.22, 0, 60); tone(52, 1.8, "sawtooth", 0.1, 0.5); tone(38, 2.2, "sine", 0.3, 0.6, 0.1); },
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
    if (tribe === "intro") {            // the river in the rain: downpour, current, a dark hum
      loopNoise("bandpass", 3200, 0.5, 0.2); loopNoise("lowpass", 260, 0.8, 0.3); drone(41, 0.05);
    } else if (tribe === "offense") {   // fire pits: low roar + crackle
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
  /** True from the moment a line is queued until it finishes or is cancelled. */
  const narrating = () => utterance !== null;
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

  function validateData() {
    const errs = [];
    for (const [id, t] of Object.entries(BC.TRIBES)) {
      if (!t.name || !t.spell || typeof t.spell.run !== "function") errs.push(`Tribe ${id} missing spell`);
    }
    for (const [name, u] of Object.entries(BC.UNITS)) {
      if (!Object.hasOwn(BC.TRIBES, u.tribe)) errs.push(`Unit ${name} has unknown tribe ${u.tribe}`);
      if (!BC.LORE[name]) errs.push(`Unit ${name} missing lore`);
      if (!u.ability || typeof u.ability.run !== "function") errs.push(`Unit ${name} missing ability`);
      for (const k of Object.keys(BC.BURN_STATS)) if (!Number.isFinite(u.stats[k])) errs.push(`Unit ${name} missing stat ${k}`);
    }
    BC.STAGES.forEach((s, i) => {
      if (!s.name || !s.tile || !s.keep) errs.push(`Stage ${i} missing metadata`);
      if (!Array.isArray(s.pool) || !s.pool.length) errs.push(`Stage ${i} empty pool`);
      for (const e of (s.pool || [])) if (!Object.hasOwn(BC.ENEMIES, e)) errs.push(`Stage ${i} unknown enemy ${e}`);
      if (s.midBoss && !Object.hasOwn(BC.ENEMIES, s.midBoss)) errs.push(`Stage ${i} unknown midBoss ${s.midBoss}`);
      if (s.boss && !Object.hasOwn(BC.ENEMIES, s.boss)) errs.push(`Stage ${i} unknown boss ${s.boss}`);
    });
    return errs;
  }

  Object.assign(BC, {
    save, persist, resetSave, exportSave, importSave, normalizeSave, validateData,
    tribeUnits, unlockedUnits, mercenaryUnits, lineup, addToLineup, fillLineup,
    advanceTutorial, skipTutorial, resetTutorial, makeRng,
    makeBurn, rollTier, unitStats, burnText, burnWastedStats, salvageBurn, fuseCandidates, fuseBurns, rerollBurn, resolveBattleRewards,
    images, assetWarnings, loadImageWithRetry, loadAssets, loadStageArt, drawFrame, iconURL, sfx, ambience, narrate, narrating, cancelNarration,
  });
})();
