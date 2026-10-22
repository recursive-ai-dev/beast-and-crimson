/* Shared Web Audio mixer and streamed menu / battle soundtrack. */
(function () {
  "use strict";
  const BC = window.BC;
  const TRACKS = { menu: "assets/music/bc_menu_music.mp3", battle: "assets/music/bc_battle_music.mp3" };
  const CROSSFADE = 1.4, MIX_FADE = 0.18;
  const tracks = new Map(), ramps = new WeakMap();
  let ctx = null, buses = null, unlocked = false, away = false, resuming = false;
  let scene = "loading", wanted = null, paused = false, speaking = false;
  const settings = () => BC.save.settings;
  const hidden = () => away || document.hidden;
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
      const source = ctx.createMediaElementSource(element);
      source.connect(gain).connect(buses.music);
      track = { id: wanted, element, source, gain, pending: false, failed: false, stopTimer: null };
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
    BC.ambience(audible() && scene !== "loading" && scene !== "intro" ? BC.save.tribe || "offense" : null, hidden());
  }

  function wake() {
    unlocked = true;
    sync();
  }

  function visibility() {
    if (hidden()) {
      // Background timers can freeze: silence and stop immediately, without a timer.
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
      if (scene !== id) BC.cancelNarration();
      scene = id;
      wanted = id === "battle" ? "battle" : ["menu", "campaign", "warband", "result"].includes(id) ? "menu" : null;
      paused = false;
      sync();
    },
    setPaused(value) { paused = value; mix(0.35); },
    duckNarration(value) { speaking = value; mix(value ? 0.2 : 0.7); },
  };
})();
