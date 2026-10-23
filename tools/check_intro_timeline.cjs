// Headless checks for the intro timeline and its story data. Run: node tools/check_intro_timeline.cjs
const assert = require("node:assert/strict");
global.window = {};
require("../src/data.js");
require("../src/intro.js");
require("../src/intro-scene.js");
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

// Every beat has a shot, and the title card is the last beat.
assert.equal(BC.IntroScene.SHOTS, beats.length, "one shot per beat");
assert.equal(beats.at(-1).card, true);
assert.equal(beats.filter(b => b.card).length, 1);

// Emphasis markup: balanced, parsed, and stripped for narration.
for (const [i, b] of beats.entries()) assert.equal(b.text.split("*").length % 2, 1, `beat ${i} has balanced emphasis marks`);
assert.deepEqual(BC.introSegments("a *b* c"), [{ text: "a ", em: false }, { text: "b", em: true }, { text: " c", em: false }]);
assert.equal(BC.introPlain("a *b* c"), "a b c");
assert.equal(BC.introSegments(beats[2].text).filter(s => s.em).map(s => s.text).join("|"), "nothing|everything");

// Typewriter: monotonic, complete at the end, pauses after punctuation.
for (const b of beats) {
  const plain = BC.introPlain(b.text), sched = BC.typeSchedule(plain), n = plain.replace(/\s/g, "").length;
  assert.equal(sched.length, n);
  assert.equal(BC.typedCount(sched, 0), 0);
  assert.equal(BC.typedCount(sched, 1), n);
  let prev = 0;
  for (let p = 0; p <= 1; p += 0.05) { const c = BC.typedCount(sched, p); assert.ok(c >= prev); prev = c; }
}
{
  const sched = BC.typeSchedule("ab. cd");   // the full stop weighs more than a letter
  assert.ok(sched[2] - sched[1] > sched[1] - sched[0]);
  assert.ok(sched[3] - sched[2] === 1);
}
// Narration: every beat has a short spoken line that adds nothing the subtitle lacks.
// The narrator speaks at ~0.72x, roughly 10 letters a second, so a line must fit in its beat.
for (const [i, b] of beats.entries()) {
  assert.ok(b.voice && !b.voice.includes("*"), `beat ${i} has a plain voice line`);
  assert.ok(b.voice.length <= 42, `beat ${i} voice (${b.voice.length} chars) fits inside its ${b.dur}s beat`);
  const shown = new Set(b.text.toLowerCase().match(/[a-z']+/g));
  for (const w of b.voice.toLowerCase().match(/[a-z']+/g)) assert.ok(shown.has(w), `beat ${i}: spoken "${w}" is not in the subtitle`);
}
console.log("[OK] Intro timeline: ordering, stalled frames, seek, pause, next, end-once");
console.log("[OK] Intro story: one shot per beat, emphasis markup, typewriter schedule");

// The recap: short, silent (no narration), and every beat names a real scene shot.
{
  const recap = BC.INTRO_RECAP;
  assert.ok(recap.length >= 2);
  const end = recap.at(-1).at + recap.at(-1).dur;
  assert.ok(end >= 4 && end <= 7, `recap runs about five seconds (got ${end})`);
  recap.forEach((b, i) => {
    assert.ok(Number.isInteger(b.shot) && b.shot >= 0 && b.shot < BC.IntroScene.SHOTS, `recap beat ${i} has a valid shot`);
    assert.ok(!b.voice, "recap is not narrated");
    assert.equal(b.text.split("*").length % 2, 1, `recap beat ${i} has balanced emphasis`);
    if (i) assert.ok(b.at >= recap[i - 1].at + recap[i - 1].dur - 1e-9);
  });
  const log = []; const tl = BC.createTimeline(recap, { onBeat: (_, i) => log.push(i) });
  tl.start(); tl.next(); tl.next();
  assert.deepEqual(log, [0, 1, 2]);
  tl.next();
  assert.ok(tl.done, "advancing past the last beat ends the story");
}
