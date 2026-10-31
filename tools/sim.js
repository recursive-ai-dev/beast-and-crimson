#!/usr/bin/env node
/**
 * Headless balance simulation & feature verification for Beast and Crimson: Tribes.
 *
 * Usage:
 *   node tools/sim.js [--runs 3] [--endless]
 */
"use strict";

const assert = require("node:assert/strict");
const { BC, mockCanvas, noop } = require("./headless.cjs");

function runStage(tribe, stageIdx, lineup, endless = false, maxTime = 240, seedOffset = 0) {
  let result = null;
  const b = new BC.Battle(mockCanvas(), {
    tribe, stage: stageIdx, endless, lineup, autocast: true, seed: 1234567 + stageIdx * 977 + seedOffset,
    onEnd: (r) => { result = r; },
  });
  let deployTick = 0;
  while (!b.over && b.t < maxTime) {
    b.update(BC.BATTLE_STEP);
    deployTick += BC.BATTLE_STEP;
    if (deployTick >= 0.4) {
      deployTick = 0;
      const idx = b.rnd(b.slots.length);
      b.deploy(idx);
    }
  }
  b.destroy();
  return {
    win: result ? result.win : false,
    time: Math.round(b.t),
    waves: b.stats.waves,
    kills: b.stats.kills,
    abilities: b.stats.abilities,
    midBossSpawned: b.midBossSpawned,
    bossSpawned: b.bossSpawned,
  };
}

function testFeatures() {
  // Partial and malformed records recover independently without losing valid progress.
  const stableBurn = { id: 8, tier: 2, buff: "hp", up: 20, debuff: "dmg", down: 5 };
  const repaired = BC.normalizeSave({
    tribe: "bogus", progress: { offense: 4, defense: -8, greed: 99 }, endless: null,
    lineup: { offense: "broken", greed: ["Baron", "missing"] },
    settings: { sound: "false", speed: 17, motion: "reduced" },
    burns: [null, stableBurn, { ...stableBurn }, { ...stableBurn, id: 9, tier: 10 }],
    equipped: { Baron: 8, "Golden Totemist": 8, "Beast Berserker": 999 }, nextId: 1,
    tutorial: { battle: "invalid" }, newUnits: null,
  });
  assert.equal(repaired.tribe, null);
  assert.deepEqual(repaired.progress, { offense: 4, defense: 0, greed: 10 });
  assert.deepEqual(repaired.lineup.offense, []);
  assert.equal(repaired.settings.sound, true);
  assert.equal(repaired.settings.musicVolume, 0.55, "Old saves receive the default music mix");
  const volumes = BC.normalizeSave({ settings: { masterVolume: -1, musicVolume: 5, effectsVolume: "0", ambienceVolume: NaN } }).settings;
  assert.deepEqual([volumes.masterVolume, volumes.musicVolume, volumes.effectsVolume, volumes.ambienceVolume], [0, 1, 0.8, 0.4]);
  assert.equal(BC.normalizeSave({ settings: { musicVolume: 0 } }).settings.musicVolume, 0, "Preserve a saved zero volume");
  assert.equal(repaired.settings.speed, 1);
  assert.equal(repaired.settings.motion, "reduced");
  assert.deepEqual(repaired.burns, [stableBurn]);
  assert.deepEqual(repaired.equipped, { Baron: 8 });
  assert.equal(repaired.nextId, 9);
  assert.deepEqual(repaired.tutorial, { battle: "done", burn: "done" });
  for (const value of [null, [], "bad", 5]) assert.deepEqual(BC.normalizeSave(value).progress, { offense: 0, defense: 0, greed: 0 });
  BC.resetSave();
  // Even a constant RNG must produce two distinct stats without hanging.
  const constant = BC.makeBurn(0, () => 0);
  assert.notEqual(constant.buff, constant.debuff);
  const protectedBurns = Array.from({ length: 4 }, () => BC.makeBurn(0));
  BC.save.burns.push(...protectedBurns.slice(0, 3));
  BC.save.equipped.Baron = protectedBurns[0].id;
  const beforeForge = JSON.stringify(BC.save);
  assert.equal(BC.fuseBurns(0), null, "Forging must require three unbound burns");
  assert.equal(JSON.stringify(BC.save), beforeForge, "An unavailable forge must not change inventory");
  BC.save.burns.push(protectedBurns[3]);
  assert.equal(BC.fuseBurns(0).tier, 1);
  assert.ok(BC.save.burns.includes(protectedBurns[0]));
  assert.equal(BC.save.equipped.Baron, protectedBurns[0].id);
  assert.equal(BC.fuseBurns(5), null, "Cosmic Brands remain achievement rewards");
  const write = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  BC.persist(); assert.equal(BC.saveStatus, "unavailable");
  localStorage.setItem = write;
  BC.persist(); assert.equal(BC.saveStatus, "saved");
  console.log("[OK] Save recovery, unique burn IDs, constant RNG, storage failures and equipped-burn protection");
  BC.resetSave();
  // 1. Runic Burn forging, salvaging, rerolling
  const b0 = BC.makeBurn(0), b1 = BC.makeBurn(0), b2 = BC.makeBurn(0);
  BC.save.burns.push(b0, b1, b2);
  const fused = BC.fuseBurns(0);
  if (!fused || fused.tier !== 1 || BC.save.burns.length !== 1) throw new Error("fuseBurns failed");
  const ashGain = BC.salvageBurn(fused.id);
  if (ashGain !== 4 || BC.save.ash !== 4 || BC.save.burns.length !== 0) throw new Error("salvageBurn failed");
  const b3 = BC.makeBurn(0);
  BC.save.burns.push(b3);
  if (!BC.rerollBurn(b3.id) || BC.save.ash !== 1) throw new Error("rerollBurn failed");

  // 2. Cross-tribe mercenary lineup validation
  const mercs = BC.mercenaryUnits("offense");
  if (mercs.length !== 6) throw new Error("Expected 6 starting mercenary units across other 2 tribes");
  BC.save.lineup.offense = ["Beast Berserker", "Warbeast Drummer", mercs[0], mercs[1]];
  const validated = BC.lineup("offense");
  if (validated.length !== 3 || !validated.includes(mercs[0]) || validated.includes(mercs[1])) {
    throw new Error("Lineup should allow at most 1 cross-tribe mercenary");
  }

  // 3. Ability casts and spells
  const b = new BC.Battle(mockCanvas(), {
    tribe: "greed", stage: 4, lineup: BC.tribeUnits("greed").slice(0, 5), autocast: false, speed: 2,
    onEnd: noop,
  });
  b.gold = 1000;
  b.deploy(0);
  b.ents[0].abT = 0;
  if (!b.castBySlot(0)) throw new Error("castBySlot failed");
  if (!b.castSpell(false) || b.player.spellCd <= 0 || b.player.animT <= 0) throw new Error("castSpell failed");

  // 4. Pause must block every player action even when it is affordable and ready.
  const unit = b.ents[0];
  unit.abT = 0;
  b.player.spellCd = 0;
  b.slots.forEach(s => { s.cd = 0; });
  b.paused = true;
  const snapshot = () => JSON.stringify({ gold: b.gold, player: b.player, slots: b.slots, ents: b.ents, stats: b.stats, fx: b.fx });
  const beforePauseInput = snapshot();
  for (const action of [() => b.deploy(1), () => b.cast(unit, false), () => b.castBySlot(0), () => b.castAny(), () => b.castSpell(false)]) {
    assert.equal(action(), false, "Player actions must fail while paused");
    assert.equal(snapshot(), beforePauseInput, "Paused input must not change battle state");
  }
  b.paused = false;
  assert.equal(b.deploy(1), true, "Deployment should work after resuming");
  assert.equal(b.castBySlot(0), true, "Abilities should work after resuming");
  assert.equal(b.castSpell(false), true, "Totem spells should work after resuming");
  b.destroy();

  // 5. Hostile debt slimes steal gold; a Royal Bribe stops that friendly-fire effect.
  const bribeBattle = new BC.Battle(mockCanvas(), {
    tribe: "greed", stage: 2, lineup: ["Golden Totemist"], onEnd: noop,
  });
  bribeBattle.deploy(0);
  const debt = bribeBattle.spawnEnemy("debt");
  debt.atkT = 0;
  const goldBeforeTheft = bribeBattle.gold;
  bribeBattle.attack(debt, 0.05, bribeBattle.ents[0]);
  assert.equal(bribeBattle.gold, goldBeforeTheft - 8, "Hostile debt slimes must still steal gold");
  assert.equal(bribeBattle.castSpell(false), true);
  assert.equal(debt.side, "player", "Royal Bribe must convert the debt slime");
  const foe = bribeBattle.spawnEnemy("collector");
  const goldAfterBribe = bribeBattle.gold, foeHp = foe.hp;
  debt.atkT = 0;
  bribeBattle.attack(debt, 0.05, foe);
  assert.ok(foe.hp < foeHp, "Bribed debt slimes must still damage enemies");
  assert.equal(bribeBattle.gold, goldAfterBribe, "Bribed debt slimes must not steal the player's gold");
  bribeBattle.destroy();

  // 6. A tutorial advances only after successful manual actions, and skip survives saving.
  BC.resetSave();
  const tutorialBattle = new BC.Battle(mockCanvas(), {
    tribe: "greed", stage: 0, lineup: ["Golden Totemist"], onEnd: noop,
    onAction: action => BC.advanceTutorial(action),
  });
  assert.equal(tutorialBattle.deploy(9), false);
  assert.equal(BC.save.tutorial.battle, "deploy");
  assert.equal(BC.advanceTutorial("spell"), false, "Out-of-order actions must not skip steps");
  tutorialBattle.deploy(0);
  assert.equal(BC.save.tutorial.battle, "ability");
  const student = tutorialBattle.ents[0];
  assert.equal(tutorialBattle.castBySlot(0), false);
  assert.equal(BC.save.tutorial.battle, "ability", "A cooling ability must not complete the lesson");
  student.abT = 0; tutorialBattle.cast(student, true);
  assert.equal(BC.save.tutorial.battle, "ability", "Auto-casts must not count as learning a control");
  student.abT = 0; tutorialBattle.castBySlot(0);
  assert.equal(BC.save.tutorial.battle, "spell");
  tutorialBattle.castSpell(false);
  assert.equal(BC.save.tutorial.battle, "done");
  BC.advanceTutorial("equip");
  assert.equal(BC.save.tutorial.burn, "done");
  BC.resetTutorial(); BC.skipTutorial();
  assert.deepEqual(JSON.parse(localStorage.getItem("bc-tribes-save-v1")).tutorial, { battle: "skipped", burn: "skipped" });
  assert.equal(BC.advanceTutorial("deploy"), false);

  // HUD readiness aggregates live copies of a unit, excluding corpses.
  student.abT = 7;
  const second = tutorialBattle.spawnUnit(student.name, student.base, 60); second.abT = 0;
  assert.deepEqual(tutorialBattle.abilityState(0), { deployed: 2, ready: 1, cooldown: 0 });
  second.dead = true;
  assert.deepEqual(tutorialBattle.abilityState(0), { deployed: 1, ready: 0, cooldown: 7 });
  student.dead = true;
  assert.deepEqual(tutorialBattle.abilityState(0), { deployed: 0, ready: 0, cooldown: 0 });
  tutorialBattle.destroy();

  // Failed manual commands explain the requirement without spending resources.
  const feedback = [];
  const clarity = new BC.Battle(mockCanvas(), {
    tribe: "greed", stage: 0, lineup: ["Pledge Warbeast", "Spirit Guardian"],
    onEnd: noop, toast: msg => feedback.push(msg),
  });
  assert.equal(clarity.castBySlot(0), false);
  assert.match(feedback.at(-1), /Deploy Pledge Warbeast/);
  clarity.gold = 0;
  assert.equal(clarity.deploy(0), false);
  assert.match(feedback.at(-1), /need 110 more gold/);
  assert.equal(clarity.stats.deployed, 0);
  clarity.gold = 250;
  assert.equal(clarity.deploy(0), true);
  const paid = clarity.gold;
  assert.equal(clarity.deploy(0), false);
  assert.match(feedback.at(-1), /deploys again in/);
  assert.equal(clarity.gold, paid);
  const bite = clarity.ents[0]; bite.abT = 0;
  assert.equal(clarity.castBySlot(0), false);
  assert.match(feedback.at(-1), /No enemy in range.*Still ready/);
  assert.equal(bite.abT, 0);
  assert.equal(clarity.stats.abilities, 0);
  const front = clarity.spawnUnit(bite.name, bite.base, 250); front.abT = 0;
  clarity.spawnEnemy("collector", { x: 70 });
  const notices = feedback.length;
  assert.equal(clarity.castBySlot(0), true, "Try other ready warriors when the front warrior has no target");
  assert.equal(feedback.length, notices, "A successful cast must not leave a false failure message");
  assert.equal(front.abT, 0);
  assert.ok(bite.abT > 0);
  front.abT = 8; bite.abT = 2;
  assert.equal(clarity.castBySlot(0), false);
  assert.match(feedback.at(-1), /ready in 2s/);
  const reviver = clarity.spawnUnit("Spirit Guardian", clarity.slots[1].stats, 60); reviver.abT = 0;
  assert.equal(clarity.castBySlot(1), false);
  assert.match(feedback.at(-1), /No fallen ally to revive/);
  assert.equal(reviver.abT, 0);
  clarity.destroy();

  const sacrifice = new BC.Battle(mockCanvas(), {
    tribe: "offense", stage: 9, lineup: ["Beast Berserker"], onEnd: noop,
    toast: msg => feedback.push(msg), announce: msg => feedback.push(msg),
  });
  assert.equal(sacrifice.castSpell(false), false);
  assert.match(feedback.at(-1), /Deploy a warrior first/);
  sacrifice.deploy(0);
  sacrifice.player.hp = sacrifice.player.max * 0.34;
  const life = sacrifice.player.hp;
  assert.equal(sacrifice.castSpell(false), false);
  assert.match(feedback.at(-1), /35% Totem health/);
  assert.equal(sacrifice.player.hp, life);
  assert.equal(sacrifice.player.spellCd, 0);
  sacrifice.player.hp = sacrifice.player.max * 0.35;
  assert.equal(sacrifice.castSpell(false), true);
  sacrifice.enemy.hp = sacrifice.enemy.max * 0.5;
  sacrifice.updateSpawner(0);
  assert.match(feedback.at(-1), /Collector King enters/);
  sacrifice.destroy();
  console.log("[OK] Unavailable actions, target feedback, manual cast selection and Blood Sacrifice requirements");

  // 7. Adding rewards and filling slots preserves choices, cap and mercenary limit.
  BC.resetSave();
  const own = BC.tribeUnits("offense"), merc = BC.mercenaryUnits("offense");
  BC.lineup("offense");
  assert.equal(BC.addToLineup("offense", own[3]), false, "Locked warriors cannot be added");
  BC.save.progress.offense = 1;
  BC.save.newUnits.push(own[3]);
  assert.equal(BC.addToLineup("offense", own[3]), true);
  assert.equal(BC.save.newUnits.includes(own[3]), false);
  assert.equal(BC.addToLineup("offense", own[3]), false, "Reward buttons must not duplicate a warrior");
  assert.equal(BC.addToLineup("offense", merc[0]), true);
  BC.save.progress.offense = 4;
  const fullLine = [...BC.lineup("offense")];
  assert.deepEqual(BC.fillLineup("offense"), []);
  assert.deepEqual(BC.lineup("offense"), fullLine, "Filling must never replace a player's full lineup");
  BC.save.lineup.offense = [own[2], merc[0]];
  assert.equal(BC.addToLineup("offense", merc[1]), false, "A second mercenary must be rejected");
  assert.deepEqual(BC.fillLineup("offense"), [own[0], own[1], own[3]]);
  assert.deepEqual(BC.lineup("offense"), [own[2], merc[0], own[0], own[1], own[3]]);
  assert.equal(new Set(BC.lineup("offense")).size, 5);
  console.log("[OK] Feature verification passed (Burns, Mercenaries, Spells, Pause, Royal Bribe, Tutorial, Ability Readiness, Reward Lineups).");
}

function main() {
  testFeatures();
  const args = process.argv.slice(2);
  const runs = args.includes("--runs") ? +args[args.indexOf("--runs") + 1] : 3;
  console.log(`\nSimulating 10 Campaign Stages (${runs} runs/stage, auto-cast bot, no Runic Burns):`);
  for (const tribe of ["offense", "defense", "greed"]) {
    const row = [];
    for (let s = 0; s < 10; s++) {
      const unlocked = BC.tribeUnits(tribe).slice(0, Math.min(10, 3 + s));
      const lineup = unlocked.slice(0, 5);
      let wins = 0;
      for (let r = 0; r < runs; r++) {
        BC.resetSave();
        const res = runStage(tribe, s, lineup, false, 300, r * 101);
        if (res.win) wins++;
      }
      row.push(`S${s + 1}:${wins}/${runs}`);
    }
    console.log(`  ${tribe.padEnd(8)} | ${row.join(" ")}`);
  }

  console.log("\nSimulating Endless Mode (180s cap):");
  for (const tribe of ["offense", "defense", "greed"]) {
    const lineup = BC.tribeUnits(tribe).slice(0, 5);
    const res = runStage(tribe, 0, lineup, true, 180);
    console.log(`  ${tribe.padEnd(8)} | Reached Wave ${res.waves} (${res.kills} kills, ${res.abilities} abilities cast)`);
  }
}

main();
