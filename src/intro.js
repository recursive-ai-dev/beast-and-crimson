/* Intro timeline: one clock drives subtitles, visuals and audio cues, so they cannot drift. */
(function () {
  "use strict";
  const BC = window.BC = window.BC || {};

  /**
   * beats: [{ at, dur, ...payload }] in seconds. Handlers: onBeat(beat, index), onEnd().
   * Advance it with update(dt); seek() and next() jump without replaying skipped beats.
   */
  function createTimeline(beats, handlers = {}) {
    const list = [...beats].sort((a, b) => a.at - b.at);
    const total = list.reduce((end, b) => Math.max(end, b.at + b.dur), 0);
    const tl = { time: 0, index: -1, paused: false, done: false, total, beats: list };

    const indexAt = (t) => {
      let i = -1;
      for (let k = 0; k < list.length && list[k].at <= t; k++) i = k;
      return i;
    };
    // Entering several beats in one tick fires each in order; a seek fires only the target.
    const enter = (to, all) => {
      if (to === tl.index) return;
      const from = all ? tl.index + 1 : to;
      tl.index = to;
      for (let k = Math.max(from, 0); k <= to; k++) handlers.onBeat?.(list[k], k);
    };
    const finish = () => {
      if (tl.done) return;
      tl.done = true;
      handlers.onEnd?.();
    };

    tl.start = () => { tl.time = 0; tl.index = -1; tl.done = false; enter(indexAt(0), true); return tl; };
    tl.update = (dt) => {
      if (tl.paused || tl.done) return tl;
      tl.time = Math.min(total, tl.time + Math.max(0, dt));
      enter(indexAt(tl.time), true);
      if (tl.time >= total) finish();
      return tl;
    };
    tl.seek = (t) => {
      if (tl.done) return tl;
      tl.time = Math.min(total, Math.max(0, t));
      enter(indexAt(tl.time), false);
      if (tl.time >= total) finish();
      return tl;
    };
    /** Jump to the next beat; past the last one, the timeline ends. */
    tl.next = () => {
      const target = list[tl.index + 1];
      if (target) tl.seek(target.at); else { tl.time = total; finish(); }
      return tl;
    };
    tl.pause = (value = true) => { tl.paused = value; return tl; };
    tl.beat = () => list[tl.index] || null;
    /** How far through the current beat we are, 0..1. */
    tl.local = () => { const b = tl.beat(); return b ? Math.min(1, Math.max(0, (tl.time - b.at) / (b.dur || 1))) : 0; };
    /** Seconds since beat `index` began (0 until it starts). */
    tl.since = (index) => Math.max(0, tl.time - (list[index]?.at ?? Infinity));
    return tl;
  }

  BC.createTimeline = createTimeline;
})();
