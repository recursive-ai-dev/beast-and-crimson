/* Shared Web Audio mixer and streamed menu / battle soundtrack. */
(function () {
  "use strict";
  const BC = window.BC;
  const TRACKS = { menu: "assets/music/bc_menu_music.mp3", battle: "assets/music/bc_battle_music.mp3" };
  const UNIT_VOICES = {
    "Baron": ["assets/voice/baron-owe.mp3", "assets/voice/baron-tax-season.mp3"],
    "Battle Mage": ["assets/voice/battle_mage-explodes.mp3", "assets/voice/battle_mage-four-bolts.mp3"],
    "Beast Berserker": ["assets/voice/beast_berserker-claw-first.mp3", "assets/voice/beast_berserker-tax-this.mp3"],
    "Bloodthirsty Warlord": ["assets/voice/bloodthirsty_warlord-collecting-heads.mp3", "assets/voice/bloodthirsty_warlord-heavier.mp3"],
    "Fire Spiritmaster": ["assets/voice/fire_spiritmaster-dirts-angry.mp3", "assets/voice/fire_spiritmaster-kept-the-fire.mp3"],
    "Frenzied Alchemist": ["assets/voice/frenzied_alchemist-just-drink.mp3", "assets/voice/frenzied_alchemist-mostly-blood.mp3"],
    "Golden Archer": ["assets/voice/golden_archer-blinking.mp3", "assets/voice/golden_archer-good-eye.mp3"],
    "Golden Beffalo": ["assets/voice/golden_beffalo-counting-house.mp3", "assets/voice/golden_beffalo-horns-first.mp3"],
    "Golden Totemist": ["assets/voice/golden_totemist-one-coin.mp3", "assets/voice/golden_totemist_pay-the-toll.mp3"],
    "Goldweb Spider": ["assets/voice/goldweb_spider-meat.mp3", "assets/voice/goldweb_spider-receipt.mp3"],
    "Guardian of the Grove": ["assets/voice/guardian_of_the_grove-bloom.mp3", "assets/voice/guardian_of_the_grove-roots-drink-deep.mp3"],
    "Guardian Spirit": ["assets/voice/guardian_spirit-behind-the-wall.mp3", "assets/voice/guardian_spirit-cold-tonight.mp3"],
    "Healing Shaman": ["assets/voice/healing_shaman-feather-and-thread.mp3", "assets/voice/healing_shaman-hold-together.mp3"],
    "Illusion Weaver": ["assets/voice/illusion_weaver-two-decoys.mp3", "assets/voice/illusion_weaver-which-one.mp3"],
    "Mine Spirit": ["assets/voice/mine_spirit-digging.mp3", "assets/voice/mine_spirit-loose-change.mp3"],
    "Mystic Engineer": ["assets/voice/mystic_engineer-own-chains.mp3", "assets/voice/mystic_engineer-turrets-up.mp3"],
    "Pledge Warbeast": ["assets/voice/pledge_warbeast-coins.mp3", "assets/voice/pledge_warbeast-shiny.mp3"],
    "Resource Warlock": ["assets/voice/resource_warlock-compound.mp3", "assets/voice/resource_warlock-vault.mp3"],
    "Ritualist": ["assets/voice/ritualist-extra-veins.mp3", "assets/voice/ritualist-my-blood.mp3"],
    "Serpent Charmer": ["assets/voice/serpent_charmer-brewing.mp3", "assets/voice/serpent_charmer-only-bites.mp3"],
    "Shadowstalker": ["assets/voice/shadowstalker-candle.mp3", "assets/voice/shadowstalker-tally.mp3"],
    "Skytalon Raider": ["assets/voice/skytalon_raider-backline.mp3", "assets/voice/skytalon_raider-wings.mp3"],
    "Spirit Guardian": ["assets/voice/spirit_guardian-back-from-river.mp3", "assets/voice/spirit_guardian-your-grave.mp3"],
    "Spirit Slowclaw": ["assets/voice/spirit_slowclaw-river-time.mp3", "assets/voice/spirit_slowclaw-rushing.mp3"],
    "Thunderhoof Juggernaut": ["assets/voice/thunderhoof_juggernaut-into-the-dirt.mp3", "assets/voice/thunderhoof_juggernaut-wagons.mp3"],
    "Totem Insurer": ["assets/voice/totem_insurer-die-for-free.mp3", "assets/voice/totem_insurer-refundable.mp3"],
    "Totem Shieldbearer": ["assets/voice/totem_shieldbearer-gate-stands.mp3", "assets/voice/totem_shieldbearer-hit-the-shield.mp3"],
    "Trade Pact Alpha": ["assets/voice/trade_pact_alpha-blood-pact.mp3", "assets/voice/trade_pact_alpha-on-sale.mp3"],
    "Warbeast Drummer": ["assets/voice/warbeast_drummer-one-two-crush.mp3", "assets/voice/warbeast_drummer-thighbone.mp3"],
    "Warden of the Wild": ["assets/voice/warden_of_the_wild-into-the-cage.mp3", "assets/voice/warden_of_the_wild-kept-the-keys.mp3"],
  };
  const lastVoiceIdx = new Map();
  let activeVoice = null;
  function stopVoice() {
    if (!activeVoice) return;
    activeVoice.pause();
    activeVoice.currentTime = 0;
    activeVoice = null;
  }
  const CROSSFADE = 1.4, MIX_FADE = 0.18;
  const tracks = new Map(), ramps = new WeakMap();
  let ctx = null, buses = null, unlocked = false, away = false, resuming = false;
  let scene = "loading", wanted = null, paused = false, speaking = false, musicCue = false;
  const settings = () => BC.save.settings;
  const hidden = () => away || document.hidden;
  // Browsers feed Web Audio silence from media loaded over file://. There the element's own
  // volume carries the same mix, following the envelopes `fade` has already scheduled.
  const directMedia = window.location?.protocol === "file:";
  let directTimer = null;
  const audible = () => unlocked && !hidden() && settings().sound && settings().masterVolume > 0;
  const wantsMusic = () => audible() && settings().musicVolume > 0 && wanted;

  // Remember our envelopes so a rapid reversal starts at the actual current gain,
  // including browsers without AudioParam.cancelAndHoldAtTime().
  function fade(node, value, seconds = MIX_FADE) {
    const p = node.gain, now = ctx.currentTime, prev = ramps.get(node);
    if (seconds && prev?.to === value) return;
    if (!seconds) {
      // An immediately suspended context may never render a scheduled event.
      p.cancelScheduledValues(0);
      p.value = value;
      ramps.set(node, { from: value, to: value, start: now, end: now });
      return;
    }
    const progress = prev ? Math.min(1, Math.max(0, (now - prev.start) / (prev.end - prev.start || 1))) : 1;
    const from = prev ? prev.from + (prev.to - prev.from) * progress : p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(from, now);
    p.linearRampToValueAtTime(value, now + seconds);
    ramps.set(node, { from, to: value, start: now, end: now + seconds });
  }

  function level(node) {
    const ramp = ramps.get(node);
    if (!ramp) return node.gain.value;
    const span = ramp.end - ramp.start;
    return span > 0 ? ramp.from + (ramp.to - ramp.from) * Math.min(1, Math.max(0, (ctx.currentTime - ramp.start) / span)) : ramp.to;
  }
  function directMix() {
    for (const track of tracks.values()) track.element.volume = Math.min(1, level(buses.master) * level(buses.music) * level(track.gain));
  }

  function mix(seconds = MIX_FADE) {
    if (!buses) return;
    const s = settings(), duck = (paused ? 0.3 : 1) * (speaking ? 0.35 : 1);
    fade(buses.master, audible() ? s.masterVolume : 0, seconds);
    fade(buses.music, s.musicVolume * duck, seconds);
    fade(buses.effects, s.effectsVolume, seconds);
    fade(buses.ambient, s.ambience ? s.ambienceVolume * duck : 0, seconds);
  }

  function context() {
    if (!audible()) return null;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        buses = {};
        for (const name of ["master", "music", "effects", "ambient"]) {
          buses[name] = ctx.createGain();
          buses[name].gain.value = 0;
        }
        buses.master.connect(ctx.destination);
        for (const name of ["music", "effects", "ambient"]) buses[name].connect(buses.master);
        // Reconcile after an OS interruption or a browser-initiated suspension.
        ctx.addEventListener("statechange", () => { if (ctx.state === "running") sync(); });
        mix();
      } catch { ctx = null; buses = null; return null; }
    }
    return ctx;
  }

  function stop(track, seconds = CROSSFADE) {
    if (seconds && track.stopTimer !== null) return;
    clearTimeout(track.stopTimer);
    track.stopTimer = null;
    fade(track.gain, 0, seconds);
    const finish = () => {
      track.stopTimer = null;
      track.element.pause();
      // Menu navigation keeps its place; every new battle gets a fresh opening.
      if (track.id === "battle" && wanted !== "battle") track.element.currentTime = 0;
    };
    if (!seconds) finish();
    else track.stopTimer = setTimeout(finish, seconds * 1000 + 30);
  }

  function activate(track) {
    if (!wantsMusic() || wanted !== track.id) { stop(track, 0); return; }
    clearTimeout(track.stopTimer);
    track.stopTimer = null;
    fade(track.gain, 1, CROSSFADE);
    for (const other of tracks.values()) if (other !== track && !other.element.paused) stop(other);
  }

  function syncMusic() {
    if (!ctx) return;
    if (!wantsMusic()) {
      for (const track of tracks.values()) stop(track, hidden() ? 0 : MIX_FADE);
      return;
    }
    let track = tracks.get(wanted);
    if (!track) {
      // Media elements stream compressed files rather than retaining minutes of PCM.
      const element = new Audio(TRACKS[wanted]), gain = ctx.createGain();
      element.preload = "auto"; element.loop = true;
      gain.gain.value = 0;
      if (directMedia) { element.volume = 0; directTimer ??= setInterval(directMix, 40); }
      else ctx.createMediaElementSource(element).connect(gain).connect(buses.music);
      track = { id: wanted, element, gain, pending: false, failed: false, stopTimer: null };
      tracks.set(wanted, track);
      element.addEventListener("error", () => {
        track.failed = true;
        stop(track, 0);
        if (wanted === track.id) for (const other of tracks.values()) if (other !== track) stop(other);
      });
    }
    clearTimeout(track.stopTimer);
    track.stopTimer = null;
    if (track.failed || track.pending) return;
    if (!track.element.paused) { activate(track); return; }
    track.pending = true;
    // Calling play synchronously on a gesture also unlocks media on mobile browsers.
    track.element.play().then(() => {
      track.pending = false;
      activate(track); // Re-check the desired scene; loading may have outlived it.
    }).catch(() => {
      track.pending = false;
      // Autoplay rejection can be retried by the next pointer/key gesture.
      if (wanted === track.id) for (const other of tracks.values()) if (other !== track) stop(other);
    });
  }

  function sync() {
    const a = context();
    if (a && a.state !== "running" && !resuming) {
      resuming = true;
      a.resume().then(() => { resuming = false; syncMusic(); }).catch(() => { resuming = false; });
    }
    mix(hidden() ? 0 : MIX_FADE);
    syncMusic();
    if (!audible() || !settings().narration) BC.cancelNarration();
    BC.ambience(!audible() || scene === "loading" ? null : scene === "intro" ? "intro" : BC.save.tribe || "offense", hidden());
  }

  function wake() {
    unlocked = true;
    sync();
  }

  function visibility() {
    if (hidden()) {
      // Background timers can freeze: silence and stop immediately, without a timer.
      stopVoice();
      sync();
      if (ctx && ctx.state !== "closed") ctx.suspend().catch(() => {});
    } else if (unlocked) wake();
  }
  addEventListener("pointerdown", wake, true);
  addEventListener("keydown", wake, true);
  document.addEventListener("visibilitychange", visibility);
  addEventListener("pagehide", () => { away = true; visibility(); });
  addEventListener("pageshow", () => { away = false; visibility(); });

  BC.audio = {
    context,
    output: name => buses?.[name],
    sync,
    setScene(id) {
      if (scene !== id) { BC.cancelNarration(); stopVoice(); }
      scene = id;
      musicCue = false;
      wanted = id === "battle" ? "battle" : ["menu", "campaign", "warband", "result"].includes(id) ? "menu" : null;
      paused = false;
      sync();
    },
    /** True once a gesture has let the browser play sound. */
    isUnlocked: () => unlocked,
    /** Let the intro bring the menu theme in before the menu itself opens. */
    cueMusic(value) {
      if (scene !== "intro" || musicCue === value) return;
      musicCue = value;
      wanted = value ? "menu" : null;
      sync();
    },
    setPaused(value) { paused = value; if (value) stopVoice(); mix(0.35); },
    duckNarration(value) { speaking = value; mix(value ? 0.2 : 0.7); },
    playUnitVoice(name) {
      const clips = UNIT_VOICES[name];
      const s = settings();
      if (!clips || !audible() || s.effectsVolume <= 0) return;
      const prev = lastVoiceIdx.get(name);
      const idx = prev === undefined ? Math.floor(Math.random() * clips.length) : (prev + 1) % clips.length;
      lastVoiceIdx.set(name, idx);
      stopVoice();
      const el = new Audio(clips[idx]);
      el.volume = Math.min(1, s.masterVolume * s.effectsVolume);
      activeVoice = el;
      el.addEventListener("ended", () => { if (activeVoice === el) activeVoice = null; });
      el.play().catch(() => {});
    },
  };
})();
