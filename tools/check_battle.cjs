// Headless checks of the battle simulation's mathematics. Run: node tools/check_battle.cjs
"use strict";
const assert = require("node:assert/strict");
const { BC, mockCanvas, noop } = require("./headless.cjs");

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ±${tolerance}, got ${actual}`);
const battle = (opts = {}) => new BC.Battle(mockCanvas(), { tribe: "greed", stage: 0, lineup: BC.tribeUnits("greed").slice(0, 5), onEnd: noop, seed: 1, ...opts });

// ---- the random number generator (#8) ----------------------------------------
{
  const b = battle({ seed: 1234567 });
  const draws = Array.from({ length: 200000 }, () => b.rnd());
  assert.ok(draws.every(u => u >= 0 && u < 1), "Draws stay in [0, 1)");
  assert.ok(new Set(draws).size > 199000, `A long stream must not cycle (only ${new Set(draws).size} distinct of 200000)`);
  // Uniformity: chi-square against the 0.1% critical value for k-1 degrees of freedom (Wilson-Hilferty).
  const chiSquareCritical = (df) => { const z = 3.09; return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3; };
  for (const k of [2, 3, 4, 5, 6, 10, 16]) {
    const g = battle({ seed: 42 + k }), counts = new Array(k).fill(0), n = 200000;
    for (let i = 0; i < n; i++) counts[g.rnd(k)]++;
    const chi = counts.reduce((sum, c) => sum + (c - n / k) ** 2 / (n / k), 0);
    assert.ok(chi < chiSquareCritical(k - 1), `rnd(${k}) is not uniform: chi-square ${chi.toFixed(1)}`);
    assert.ok(counts.every(c => c > 0));
  }
  // Independence: successive draws and low bits are uncorrelated.
  const mean = draws.reduce((a, c) => a + c, 0) / draws.length;
  let cov = 0, variance = 0;
  for (let i = 0; i < draws.length - 1; i++) { cov += (draws[i] - mean) * (draws[i + 1] - mean); variance += (draws[i] - mean) ** 2; }
  near(cov / variance, 0, 0.01, "Lag-1 serial correlation");
  near(mean, 0.5, 0.005, "Mean");
  const b2 = battle({ seed: 7 }), bits = new Array(8).fill(0);
  for (let i = 0; i < 80000; i++) { const v = Math.floor(b2.rnd() * 4294967296); for (let k = 0; k < 8; k++) bits[k] += (v >>> k) & 1; }
  bits.forEach((c, k) => near(c / 80000, 0.5, 0.01, `Low bit ${k} balance`));
}
{
  // A seed fully determines the stream, and nearby seeds do not share one.
  const stream = (seed) => { const b = battle({ seed }); return Array.from({ length: 64 }, () => b.rnd(1000)); };
  assert.deepEqual(stream(5), stream(5), "The same seed repeats exactly");
  assert.notDeepEqual(stream(5), stream(6), "Adjacent seeds differ");
  const a = stream(5), c = stream(6);
  assert.ok(a.filter((v, i) => v === c[i]).length < 4, "Adjacent seeds are not correlated");
  // Cosmetic draws must not disturb gameplay draws: floating text cannot change an outcome.
  const plain = battle({ seed: 9 }), noisy = battle({ seed: 9 });
  const foe = noisy.spawnEnemy("collector"); plain.spawnEnemy("collector");
  for (let i = 0; i < 25; i++) noisy.dealDamage(null, foe, 1, true);
  assert.deepEqual(Array.from({ length: 16 }, () => noisy.rnd(1000)), Array.from({ length: 16 }, () => plain.rnd(1000)), "Damage numbers must not consume gameplay randomness");
}
console.log("[OK] RNG: exact range, no short cycle, uniform (chi-square), uncorrelated, reproducible, cosmetics separated");

// ---- a fresh seed for every battle (#10) -------------------------------------
{
  const seeds = new Set(Array.from({ length: 50 }, () => { const b = new BC.Battle(mockCanvas(), { tribe: "greed", stage: 3, lineup: [], onEnd: noop }); return b.seed; }));
  assert.ok(seeds.size >= 49, "Battles without a chosen seed start differently");
  const firstFoes = (seed) => { const b = battle({ stage: 5, seed }); return Array.from({ length: 12 }, () => b.stage.pool[b.rnd(b.stage.pool.length)]).join(); };
  assert.equal(firstFoes(11), firstFoes(11), "A chosen seed reproduces its battle");
  assert.notEqual(firstFoes(11), firstFoes(12));
}
console.log("[OK] Every battle has its own seed, and a chosen seed reproduces it");

// ---- results cannot depend on the frame rate (#9) ----------------------------
{
  const STEPS = 3600;
  // Drives the real frame loop at a display rate and captures the state at one exact simulation step.
  const run = (hz, speed = 1, jitter = 0) => {
    const b = battle({ tribe: "offense", stage: 5, lineup: BC.tribeUnits("offense").slice(0, 5), seed: 2024, autocast: true, speed });
    b.gold = 2500;
    for (let i = 0; i < 5; i++) b.deploy(i);
    let steps = 0, snapshot = null;
    const update = b.update;
    b.update = function (dt) {
      update.call(this, dt);
      if (++steps === STEPS) snapshot = JSON.stringify({ t: this.t, gold: this.gold, player: this.player.hp, keep: this.enemy.hp, stats: this.stats, xs: this.ents.map(e => [e.name, e.x, e.hp]) });
    };
    let now = b._last, i = 0;
    while (snapshot === null && !b.over && i < 500000) { now += (1000 / hz) * (1 + jitter * Math.sin(i++ * 12.9898)); b.loop(now); }
    b.destroy();
    return snapshot;
  };
  const reference = run(60);
  assert.ok(reference, "The reference battle reached the comparison point");
  for (const [hz, speed, jitter] of [[144, 1, 0], [240, 1, 0], [30, 1, 0], [20, 1, 0], [11, 1, 0], [60, 2, 0], [37, 2, 0], [60, 1, 0.45], [5, 1, 0]]) {
    assert.equal(run(hz, speed, jitter), reference, `Battle state diverged at ${hz} Hz, ${speed}x, jitter ${jitter}`);
  }
}
{
  // The attack rate is exactly what the stat says, whatever the step size.
  for (const dt of [BC.BATTLE_STEP, 1 / 30, 0.05, 0.1]) {
    const b = battle();
    const e = { kind: "unit", side: "player", dir: 1, atkT: 0, status: {}, s: { atkspd: 1.2, dmg: 1, range: 22 }, x: 100, yOff: 0, anim: "idle", animT: 0 };
    const foe = { kind: "enemy", side: "enemy", hp: 1e9, status: {}, shield: 0, s: { def: 0, hp: 1e9 }, x: 110, yOff: 0, flash: 0 };
    let hits = 0;
    b.dealDamage = () => { hits++; return 1; };
    for (let t = 0; t < 100 - dt / 2; t += dt) b.attack(e, dt, foe);
    near(hits, 120, 1, `Attacks in 100s at 1.2/s, step ${dt}`);
  }
}
console.log("[OK] Battle state is identical at every frame rate and speed, and attack rates are exact");

// ---- status effects (#11) ----------------------------------------------------
{
  const b = battle();
  const foe = b.spawnEnemy("golem"); foe.base.hp = foe.s.hp = foe.hp = 1e6;
  b.status(foe, "slow", 5, 0.6);
  b.status(foe, "slow", 2, 0.3);
  assert.equal(foe.status.slow.v, 0.6, "A weaker slow must not replace a stronger one");
  assert.equal(foe.status.slow.t, 5, "A shorter reapplication must not cut the duration");
  b.status(foe, "slow", 8, 0.1);
  assert.deepEqual([foe.status.slow.v, foe.status.slow.t], [0.6, 8], "The longest duration stands");
  b.status(foe, "slow", 1, 0.8);
  assert.equal(foe.status.slow.v, 0.8, "A stronger effect takes over");

  // Reapplying poison faster than it ticks must not stop it ticking.
  const victim = b.spawnEnemy("golem"); victim.base.hp = victim.s.hp = victim.hp = 1e6;
  b.stage = Object.assign({}, b.stage, { hazard: null });
  const hp = victim.hp, dt = 1 / 60;
  for (let i = 0; i < 300; i++) { if (i % 12 === 0) b.status(victim, "poison", 3, 10); b.updateEnt(victim, dt); }
  near(hp - victim.hp, 50, 5, "Five seconds of 10/s poison under constant reapplication");
}
{
  // Damage over time is credited to its caster.
  const b = battle({ tribe: "offense", lineup: ["Serpent Charmer"] });
  const u = b.spawnUnit("Serpent Charmer", b.slots[0].stats, 200); u.abT = 0;
  const foe = b.spawnEnemy("golem"); foe.x = 210; foe.base.hp = foe.s.hp = foe.hp = 1e6;
  assert.equal(b.cast(u, true), true);
  const before = b.stats.dmg;
  for (let i = 0; i < 120; i++) b.updateEnt(foe, 1 / 60);
  assert.ok(b.stats.dmg > before, "Poison damage counts toward the caster's total");
  // A foe killed by poison credits the caster.
  const stacker = b.spawnUnit("Bloodthirsty Warlord", BC.unitStats("Bloodthirsty Warlord", "offense"), 200);
  const weak = b.spawnEnemy("collector"); weak.hp = 1;
  b.status(weak, "burn", 3, 10, stacker);
  for (let i = 0; i < 60; i++) if (!weak.dead) b.updateEnt(weak, 1 / 60);
  assert.equal(weak.dead, true);
  assert.equal(stacker.kills, 1, "A kill by damage over time counts for its caster");
}
console.log("[OK] Status effects: strongest and longest win, ticks survive reapplication, caster gets the credit");

// ---- rules text matches the code (#12) ---------------------------------------
{
  // Ability Speed is a rate: +f% divides the cooldown by 1+f, and -f% divides it by 1-f.
  const statsWith = (buff, up, debuff, down) => {
    BC.resetSave();
    BC.save.burns.push({ id: 1, tier: 0, buff, up, debuff, down });
    BC.save.equipped["Baron"] = 1;
    return BC.unitStats("Baron", "greed");
  };
  const cooldown = BC.unitStats("Baron", "greed", true).abspd;
  near(statsWith("abspd", 25, "hp", 5).abspd, cooldown / 1.25, 1e-9, "+25% Ability Speed");
  near(statsWith("hp", 5, "abspd", 20).abspd, cooldown / 0.8, 1e-9, "-20% Ability Speed");
  BC.resetSave();

  // Mirror Host's text states each decoy's life.
  assert.match(BC.UNITS["Illusion Weaver"].ability.desc, /4x ability power life/);
  const b = battle({ tribe: "defense", lineup: ["Illusion Weaver"] });
  const weaver = b.spawnUnit("Illusion Weaver", b.slots[0].stats, 100);
  BC.UNITS["Illusion Weaver"].ability.run(b, weaver);
  const decoys = b.ents.filter(e => e.kind === "decoy");
  assert.equal(decoys.length, 2);
  decoys.forEach(d => assert.equal(d.hp, weaver.s.abpwr * 4));

  // Crown Levy's stated range matches what it pays at both ends.
  assert.match(BC.UNITS["Baron"].ability.desc, /10 gold plus 10% of your purse \(90 at most\)/);
  const levy = battle({ lineup: ["Baron"] });
  const baron = levy.spawnUnit("Baron", levy.slots[0].stats, 100);
  levy.gold = 0; levy.stats.goldEarned = 0;
  BC.UNITS["Baron"].ability.run(levy, baron);
  assert.equal(levy.gold, 10);
  levy.gold = 2000;
  BC.UNITS["Baron"].ability.run(levy, baron);
  assert.equal(levy.gold, 2090);
}
console.log("[OK] Rules text: Ability Speed mathematics, Mirror Host life and Crown Levy gold match their descriptions");

// ---- Endless mode (#13) ------------------------------------------------------
{
  const spawned = [], waves = [];
  const b = new BC.Battle(mockCanvas(), { tribe: "greed", stage: 0, endless: true, lineup: [], onEnd: noop, seed: 3, announce: msg => spawned.push(msg), onWave: wave => waves.push(wave) });
  b.t = 120;   // past the opening, when a wave's champion arrives as the wave begins
  const championsOf = (name) => spawned.filter(m => m.includes(name)).length;
  for (let wave = 2; wave <= 16; wave++) { b.advanceEndlessWave(false); b.updateSpawner(BC.BATTLE_STEP); }
  assert.deepEqual(waves, Array.from({ length: 15 }, (_, i) => i + 2), "Every wave reached is reported as it happens");
  assert.equal(championsOf("Drowned Warden"), 2, "A biome's champion returns with its biome (waves 5 and 15)");
  assert.equal(championsOf("Foundry Colossus"), 2, "A biome's champion returns with its biome (waves 6 and 16)");
}
console.log("[OK] Endless: champions return with their biome, and each new wave is reported immediately");
