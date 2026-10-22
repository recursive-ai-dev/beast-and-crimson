/* Dependency-free regressions for simulation timing and browser lifecycle races. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const noop = () => {};
const timers = new Map(), intervals = new Map(), voiceListeners = new Set();
let nextTimer = 0, voices = [], spoken = [];
const g = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) }, { get: (o, k) => o[k] ?? noop });
const canvas = () => ({ getContext: () => g, addEventListener: noop, removeEventListener: noop });
const env = {
  console, Math, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: noop },
  document: { hidden: false, createElement: canvas },
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout: id => timers.delete(id),
  setInterval: fn => { intervals.set(++nextTimer, fn); return nextTimer; },
  clearInterval: id => intervals.delete(id),
  SpeechSynthesisUtterance: function (text) { this.text = text; },
  speechSynthesis: {
    getVoices: () => voices, speak: u => spoken.push(u), cancel: noop,
    addEventListener: (_, fn) => voiceListeners.add(fn),
    removeEventListener: (_, fn) => voiceListeners.delete(fn),
  },
};
env.window = env;
vm.createContext(env);
for (const file of ["assets/manifest.js", "src/data.js", "src/core.js", "src/battle.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), env);
}
const BC = env.BC;
const battle = (onEnd = noop) => new BC.Battle(canvas(), { tribe: "greed", stage: 0, lineup: [], onEnd });
let results = 0;
const ended = battle(() => results++);
ended.finish(true);
ended.finish(false);
assert.equal(timers.size, 1, "Finishing twice must schedule only one result");
const staleEnd = [...timers.values()][0];
ended.destroy();
assert.equal(timers.size, 0, "Destroy must cancel the delayed result");
staleEnd();
assert.equal(results, 0, "A stale result callback must not navigate after destruction");
const completed = battle(() => results++);
completed.finish(true);
const [timerId, callback] = [...timers][0];
timers.delete(timerId); callback(); completed.finish(true);
assert.equal(results, 1, "A completed battle delivers exactly one result");
completed.destroy();

const b = battle();
b.player.flash = b.enemy.flash = 0.15;
b.embers = [{ x: 30, y: 200, v: 20, l: 0 }];
b.paused = true;
const before = JSON.stringify([b.player.flash, b.enemy.flash, b.embers]);
for (let i = 0; i < 144; i++) b.draw();
assert.equal(JSON.stringify([b.player.flash, b.enemy.flash, b.embers]), before, "Rendering while paused must not age visuals");
b.paused = false;
b.update(0.1);
assert.ok(Math.abs(b.player.flash - 0.05) < 1e-9);
assert.equal(b.embers[0].y, 198);
assert.equal(b.embers[0].l, 0.1);

for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
  b.stage = { hazard: { id: "fort" } }; b.ballistaT = 0;
  let shots = 0;
  b.alliesNear = () => [{ x: 400, yOff: 0 }];
  b.dealDamage = () => shots++;
  for (let t = 0; t < 36.2; t += dt) b.updateHazard(dt);
  assert.equal(shots, 3, `Ballista fires once per 12 seconds at dt=${dt}`);
}
const unit = b.spawnUnit("Guardian of the Grove", BC.unitStats("Guardian of the Grove", "defense"), 200);
let healing = 0;
b.zone = (_, x, r, duration, tick) => { for (let i = 0; i < duration; i++) tick(unit); };
b.heal = (_, amount) => healing += amount;
unit.ability.run(b, unit);
assert.equal(healing, unit.s.abpwr * 6, "Grove heals full ability power each second");
const charger = { x: 424, dir: 1, s: { abpwr: 20 } };
b.enemiesNear = x => { assert.equal(x, 424, "Charge must clamp before looking up targets"); return []; };
BC.UNITS["Thunderhoof Juggernaut"].ability.run(b, charger);

const bribed = b.spawnEnemy("inquisitor");
bribed.side = "player"; bribed.dir = 1; bribed.flash = 0.1;
const frames = [];
BC.drawFrame = (...args) => frames.push(args);
b.drawEnt(g, bribed);
assert.ok(frames.length >= 2 && frames.every(args => args[6] === true), "Bribed sprite and flash must both face forward");
b.kill(bribed, null);
assert.equal(b.player.fallen.length, 0, "Bribed foes must not enter the resurrection pool");
b.destroy();

const burn = BC.makeBurn(1);
BC.save.burns.push(burn); BC.save.ash = 50;
const nextId = BC.save.nextId;
assert.equal(BC.rerollBurn(burn.id, () => 0.2), true);
assert.equal(BC.save.nextId, nextId);
assert.equal(BC.makeBurn(1).id, nextId);

BC.narrate("First");
assert.equal(spoken.length, 0, "Narration waits for the voice list");
voices = [{ name: "Daniel", lang: "en-GB" }];
for (const listener of voiceListeners) listener();
assert.equal(spoken[0].voice, voices[0]);
assert.equal(timers.size, 0);
voices = []; BC.narrate("Cancelled"); BC.cancelNarration();
assert.equal(voiceListeners.size, 0);
assert.equal(timers.size, 0);
BC.narrate("Fallback");
const [fallbackId, fallback] = [...timers][0];
timers.delete(fallbackId); fallback();
assert.equal(spoken.length, 2, "Narration falls back if voices never load");
assert.equal(voiceListeners.size, 0);

const sources = [];
const param = () => ({ value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, cancelScheduledValues: noop, setTargetAtTime: noop });
const node = () => ({ gain: param(), frequency: param(), Q: param(), connect(other) { return other; }, disconnect() { this.disconnected = true; }, start: noop, stop() { this.stopped = true; } });
const audio = {
  state: "running", currentTime: 0, sampleRate: 8,
  createGain: node, createBiquadFilter: node,
  createBuffer: (_, len) => ({ getChannelData: () => new Float32Array(len) }),
  createBufferSource() { const n = node(); sources.push(n); return n; },
  createOscillator() { const n = node(); sources.push(n); return n; },
};
BC.audio = { context: () => audio, output: node, duckNarration: noop };
BC.ambience("offense"); BC.ambience("defense");
assert.ok(timers.size > 0, "Scene change retains a normal fade");
BC.ambience(null, true);
assert.equal(timers.size, 0, "Hiding must also flush older fading ambience");
assert.equal(intervals.size, 0);
assert.ok(sources.every(n => n.stopped && n.disconnected), "All ambience sources stop before suspension");
console.log("[OK] Battle lifecycle, render timing, ballista cadence, abilities, bribe sprites, burn IDs, voice loading and ambience cleanup");
