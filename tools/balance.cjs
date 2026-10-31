#!/usr/bin/env node
/**
 * Campaign balance measurement. Plays every tribe through every stage under several
 * preparation scenarios and reports win rates with 95% Wilson confidence intervals.
 *
 *   node tools/balance.cjs [--seeds 24] [--stages 1-10] [--tribes offense,defense,greed]
 *                          [--scenarios baseline,alternate,mercenary,burns,sampled] [--bots random,sensible]
 *                          [--tune experiment.cjs] [--json out.json]
 *
 * --tune loads a module exporting (BC) => {...} that edits the data before play, to try numbers without changing them.
 * "sampled" draws a random legal lineup per seed, which shows how forgiving a stage is of different warbands.
 * A battle still undecided after 10 minutes counts as a stalemate, shown in parentheses: not a win, but not a defeat.
 *
 * The bots are stand-ins, not players: they locate walls and imbalances, and they do not predict human win rates.
 * Every battle is seeded, so a result can be reproduced exactly.
 */
"use strict";
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const os = require("node:os");
const fs = require("node:fs");

const MAX_TIME = 600, DECISION_EVERY = 0.4;
const SCENARIOS = ["baseline", "alternate", "mercenary", "burns", "sampled"];
const BOTS = ["random", "sensible"];
const TRIBES = ["offense", "defense", "greed"];

/** 95% Wilson score interval: honest at small samples and at rates near 0 or 1, unlike p ± 2σ. */
function wilson(wins, n, z = 1.959964) {
  if (!n) return [0, 1];
  const p = wins / n, d = 1 + z * z / n, centre = p + z * z / (2 * n), margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (centre - margin) / d), Math.min(1, (centre + margin) / d)];
}

function runCell({ tribe, stage, scenario, bot, seeds, tune }) {
  const { BC, mockCanvas } = require("./headless.cjs");
  if (tune && !BC.tuned) { require(tune)(BC); BC.tuned = true; }
  const hash = (...parts) => parts.reduce((h, v) => Math.imul(h ^ v, 0x01000193) >>> 0, 0x811C9DC5);
  const tribeId = TRIBES.indexOf(tribe), scenarioId = SCENARIOS.indexOf(scenario), botId = BOTS.indexOf(bot);

  // A warrior is frontline when it is built to stand in the lane rather than behind it.
  const isFront = (name) => { const s = BC.UNITS[name].stats; return s.range <= 30 && s.hp >= 150; };

  function prepare(seed) {
    BC.resetSave();
    const unlocked = BC.tribeUnits(tribe).slice(0, Math.min(10, 3 + stage));
    let lineup = unlocked.slice(0, 5);
    if (scenario === "alternate") lineup = unlocked.slice(-5);
    if (scenario === "mercenary") {
      // Cross-tribe recruits available at this point in the campaign, assuming the others are level with this one.
      const others = TRIBES.filter(t => t !== tribe).flatMap(t => BC.tribeUnits(t).slice(0, Math.min(10, 3 + stage)));
      const rng = BC.makeRng(hash(seed, 77));
      lineup = lineup.slice(0, Math.min(4, lineup.length)).concat(others[Math.floor(rng() * others.length)]);
    }
    if (scenario === "sampled") {
      const rng = BC.makeRng(hash(seed, 55)), pool = [...unlocked];
      lineup = [];
      while (lineup.length < 5 && pool.length) lineup.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    if (scenario === "burns") {
      // Exactly what clearing the earlier stages awarded: two burns per first clear, best worn first.
      const rng = BC.makeRng(hash(seed, 91));
      const burns = [];
      for (let cleared = 0; cleared < stage; cleared++) for (let k = 0; k < 2; k++) burns.push(BC.makeBurn(BC.rollTier(cleared, rng), rng));
      burns.sort((a, b) => b.tier - a.tier);
      BC.save.burns = burns;
      lineup.forEach((name, i) => { if (burns[i]) BC.save.equipped[name] = burns[i].id; });
    }
    return lineup;
  }

  function play(seed) {
    const lineup = prepare(seed);
    let result = null;
    const b = new BC.Battle(mockCanvas(), { tribe, stage, lineup, autocast: true, seed, onEnd: (r) => { result = r; } });
    const decide = BC.makeRng(hash(seed, 13));
    let next = 0, turn = 0;
    while (!b.over && b.t < MAX_TIME) {
      b.update(BC.BATTLE_STEP);
      if (b.t < next) continue;
      next += DECISION_EVERY;
      if (bot === "random") b.deploy(Math.floor(decide() * b.slots.length));
      else {
        // Keep a front line ahead of the backline, and always spend when it is possible.
        const alive = b.ents.filter(e => !e.dead && e.side === "player" && e.kind === "unit");
        const wantFront = alive.filter(e => isFront(e.name)).length <= alive.filter(e => !isFront(e.name)).length;
        const order = b.slots.map((s, i) => i).filter(i => isFront(b.slots[i].name) === wantFront).concat(b.slots.map((s, i) => i));
        for (let k = 0; k < order.length; k++) {
          const i = order[(k + turn) % order.length];
          if (b.slots[i].cd <= 0 && b.gold >= b.costOf(b.slots[i])) { b.deploy(i); turn++; break; }
        }
      }
    }
    const out = { win: !!(result && result.win), lost: !!(result && !result.win), time: b.t, totem: Math.max(0, b.player.hp / b.player.max), keep: Math.max(0, b.enemy.hp / b.enemy.max), kingDead: !!b.stats.bossKilled, lineup };
    b.destroy();
    return out;
  }

  let wins = 0, stalemates = 0, time = 0, totem = 0, keep = 0, kings = 0;
  const lineups = [];
  for (let i = 0; i < seeds; i++) {
    const r = play(hash(tribeId, stage, scenarioId, botId, i));
    if (r.win) { wins++; time += r.time; totem += r.totem; if (r.kingDead) kings++; }
    else { keep += r.keep; if (!r.lost) stalemates++; }
    if (scenario === "sampled") lineups.push({ lineup: r.lineup, win: r.win });
  }
  const others = seeds - wins;
  return { tribe, stage, scenario, bot, seeds, wins, stalemates, ci: wilson(wins, seeds), meanClearTime: wins ? time / wins : null, meanTotemLeft: wins ? totem / wins : null, meanKeepLeftOnLoss: others ? keep / others : null, kings, lineups };
}

if (!isMainThread) {
  parentPort.on("message", (cell) => parentPort.postMessage(runCell(cell)));
} else {
  const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : fallback; };
  const seeds = +arg("seeds", 24);
  const [from, to] = arg("stages", "1-10").split("-").map(Number);
  const tribes = arg("tribes", TRIBES.join()).split(",");
  const scenarios = arg("scenarios", SCENARIOS.join()).split(",");
  const bots = arg("bots", BOTS.join()).split(",");
  const jsonOut = arg("json", null);
  const tune = arg("tune", null) && require("node:path").resolve(arg("tune", null));
  const cells = [];
  for (const bot of bots) for (const scenario of scenarios) for (const tribe of tribes) for (let s = from - 1; s < (to || from); s++) cells.push({ tribe, stage: s, scenario, bot, seeds, tune });
  const results = [];
  let index = 0;
  const report = () => {
    for (const bot of bots) for (const scenario of scenarios) {
      console.log(`\n${bot} bot, ${scenario} (wins of ${seeds}, per stage ${from}-${to || from})`);
      for (const tribe of tribes) {
        const row = results.filter(r => r.bot === bot && r.scenario === scenario && r.tribe === tribe).sort((a, b) => a.stage - b.stage);
        console.log(`  ${tribe.padEnd(8)} ${row.map(r => String(r.wins).padStart(3) + (r.stalemates ? `(${r.stalemates})` : "")).join(" ")}   | final stage ${Math.round(row.at(-1).ci[0] * 100)}-${Math.round(row.at(-1).ci[1] * 100)}% CI, ${row.at(-1).meanClearTime ? Math.round(row.at(-1).meanClearTime) + "s clear, " + Math.round(row.at(-1).meanTotemLeft * 100) + "% Totem left" : "no clears"}, King slain in ${row.at(-1).kings}`);
      }
    }
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
  };
  const workers = Array.from({ length: Math.min(os.availableParallelism(), cells.length) }, () => new Worker(__filename));
  let open = workers.length;
  for (const worker of workers) {
    const feed = () => { if (index < cells.length) worker.postMessage(cells[index++]); else { worker.terminate(); if (--open === 0) report(); } };
    worker.on("message", (r) => { results.push(r); feed(); });
    worker.on("error", (e) => { console.error(e); process.exit(1); });
    feed();
  }
}
