// Headless checks for the intro timeline and its story data. Run: node tools/check_intro_timeline.cjs
const assert = require("node:assert/strict");
global.window = {};
require("../src/data.js");
require("../src/intro.js");
const BC = window.BC;

const beats = BC.INTRO;
assert.ok(beats.length >= 3, "intro has beats");
beats.forEach((b, i) => {
  assert.ok(b.text && b.dur > 0, `beat ${i} has text and duration`);
  if (i) assert.ok(b.at >= beats[i - 1].at + beats[i - 1].dur - 1e-9, `beat ${i} does not overlap the previous`);
});
assert.deepEqual(BC.STORY, beats.map(b => b.text));
assert.equal(beats.filter(b => b.music).length, 1, "exactly one music cue");

const run = (tl, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) tl.update(step); };
const make = () => {
  const log = { beats: [], ended: 0 };
  const tl = BC.createTimeline(beats, { onBeat: (b, i) => log.beats.push(i), onEnd: () => log.ended++ });
  return { tl, log };
};

// Plays every beat once, in order, then ends exactly once.
{
  const { tl, log } = make();
  tl.start();
  run(tl, tl.total + 5);
  assert.deepEqual(log.beats, beats.map((_, i) => i));
  assert.equal(log.ended, 1);
  assert.equal(tl.done, true);
}
// A huge frame (stalled tab) still fires every crossed beat in order.
{
  const { tl, log } = make();
  tl.start(); tl.update(tl.total);
  assert.deepEqual(log.beats, beats.map((_, i) => i));
}
// seek() lands on the right beat without replaying skipped ones.
{
  const { tl, log } = make();
  tl.start();
  const probe = [[0, 0], [5, 1], [beats[3].at, 3], [beats.at(-1).at + 1, beats.length - 1]];
  for (const [t, index] of probe) { tl.seek(t); assert.equal(tl.index, index, `seek(${t})`); }
  assert.deepEqual(log.beats, [0, 1, 3, beats.length - 1]);
}
// Pausing freezes the clock; next() steps one beat; past the last it ends.
{
  const { tl, log } = make();
  tl.start(); tl.pause(); run(tl, 10);
  assert.equal(tl.time, 0);
  tl.pause(false); tl.next();
  assert.equal(tl.index, 1); assert.equal(tl.time, beats[1].at);
  for (let i = 0; i < beats.length; i++) tl.next();
  assert.equal(log.ended, 1);
}
// Local progress and since().
{
  const { tl } = make();
  tl.start(); tl.seek(beats[1].at + beats[1].dur / 2);
  assert.ok(Math.abs(tl.local() - 0.5) < 1e-9);
  assert.equal(tl.since(0), beats[1].at + beats[1].dur / 2);
  assert.equal(tl.since(99), 0);
}
console.log("[OK] Intro timeline: ordering, stalled frames, seek, pause, next, end-once");
