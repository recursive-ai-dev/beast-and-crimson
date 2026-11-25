/* Battle simulation + rendering. One lane, two strongholds, gold, abilities. */
(function () {
  "use strict";
  const BC = window.BC;

  const W = 480, H = 270;
  const LANE_Y = 190;          // feet line
  const GROUND = 166;          // top of the ground band
  const BASE_X = 34;           // player totem centre
  const KEEP_X = 446;          // enemy keep centre
  const GOLD_CAP = 2500;
  const STEP = 1 / 60;         // the simulation always advances by this, so results cannot depend on the display
  const MAX_FRAME = 0.1;       // the most real time one frame may simulate; slower devices play in slow motion

  class Battle {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.tribe = BC.TRIBES[opts.tribe];
      this.endless = !!opts.endless;
      this.stageIdx = this.endless ? 0 : opts.stage;
      this.stage = this.endless ? Object.assign({}, BC.STAGES[0], { name: "The Endless Levy — Wave 1", keepHp: 1400, pool: ["collector", "levy", "hound", "inquisitor"] }) : BC.STAGES[opts.stage];
      this.lineup = opts.lineup;
      this.onEnd = opts.onEnd;
      this.onHud = opts.onHud || (() => {});
      this.onAction = opts.onAction || (() => {});
      this.onWave = opts.onWave || (() => {});
      this.toast = opts.toast || (() => {});
      this.announce = opts.announce || this.toast;
      this.autocast = !!opts.autocast;
      this.speed = opts.speed || 1;

      const mods = this.tribe.mods;
      const T = this.T = BC.TUNE;
      const baseHp = T.baseHp * (mods.baseHp || 1);
      this.player = { id: "player", hp: baseHp, max: baseHp, discountT: 0, fallen: [], atkT: 0, animT: 0, spellCd: 0 };
      this.enemy = { id: "enemy", hp: this.stage.keepHp, max: this.stage.keepHp };
      this.gold = T.startGold;
      this.incomeMul = mods.income || 1;
      this.ents = [];
      this.fx = [];      // impacts / texts / projectiles
      this.zones = [];
      this.t = 0;
      this.hazardT = 0;
      this.ballistaT = 0;
      this.wave = 1;
      this.waveT = 42;
      this.threat = 14 + this.stageIdx * 4;
      this.nextFoe = null;
      this.surgeT = BC.TUNE.surgeEvery;
      this.midBossSpawned = false;
      this.bossSpawned = false;
      this.paused = false;
      this.over = false;
      this.nextId = 1;
      // Gameplay and cosmetics draw from separate streams, so a floating number can never change an outcome.
      this.seed = opts.seed ?? Math.floor(Math.random() * 4294967296);
      this.random = BC.makeRng(this.seed);
      this.fxRandom = BC.makeRng(this.seed ^ 0x9E3779B9);
      this._accum = 0;
      this.slots = this.lineup.map(name => ({ name, stats: BC.unitStats(name, opts.tribe), cd: 0 }));
      this.stats = { kills: 0, killedByType: {}, goldEarned: 0, deployed: 0, abilities: 0, lost: 0, dmg: 0, baseDmg: 0, bossKilled: false, waves: 1 };
      this.embers = [];
      this.bg = this.renderBackground();
      this.loadBackdrop();
      this.ctx.imageSmoothingEnabled = false;

      this._pointer = (e) => this.onPointer(e);
      canvas.addEventListener("pointerdown", this._pointer);
      this._last = performance.now();
      this._raf = requestAnimationFrame((t) => this.loop(t));
    }

    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this._raf);
      clearTimeout(this._endTimer);
      this.cv.removeEventListener("pointerdown", this._pointer);
    }

    loadBackdrop() {
      if (typeof Image === "undefined") return;
      const stageIdx = this.stageIdx;
      BC.loadStageArt(stageIdx).then(art => {
        if (art && !this._destroyed && stageIdx === this.stageIdx) this.bg = this.renderBackground();
      });
    }

    rnd(n) { const u = this.random(); return n === undefined ? u : Math.floor(u * n); }

    // ------------------------------------------------------------ spawning --
    deploy(i) {
      const slot = this.slots[i];
      if (!slot || this.paused || this.over) return false;
      const cost = this.costOf(slot);
      if (slot.cd > 0) { this.toast(slot.name + " deploys again in " + Math.ceil(slot.cd) + "s"); return false; }
      if (this.gold < cost) { this.toast(slot.name + ": need " + Math.ceil(cost - this.gold) + " more gold"); return false; }
      this.gold -= cost;
      slot.cd = 1.5 + slot.stats.cost / 45;
      this.spawnUnit(slot.name, slot.stats, BASE_X + 22);
      this.stats.deployed++;
      BC.sfx.deploy();
      BC.audio?.playUnitVoice?.(slot.name);
      this.onAction("deploy", this);
      return true;
    }

    costOf(slot) { return Math.round(slot.stats.cost * (this.player.discountT > 0 ? 0.75 : 1)); }

    spawnUnit(name, stats, x, hpFrac) {
      const def = BC.UNITS[name];
      const e = this.mk({
        side: "player", kind: "unit", name, base: Object.assign({}, stats), x, dir: 1,
        sprite: "units:" + name, ability: def.ability, passive: def.passive || null,
        abT: stats.abspd * 0.5, cost: stats.cost,
      });
      if (hpFrac) e.hp = e.base.hp * hpFrac;
      return e;
    }

    spawnEnemy(id, extra) {
      const def = BC.ENEMIES[id];
      const b = Object.assign({}, def.stats);
      const T = this.T, i = this.stageIdx;
      b.hp *= 1 + T.enemyHp * i; b.dmg *= 1 + T.enemyDmg * i; b.def *= 1 + T.enemyDef * i;
      if (extra && extra.hpMul) b.hp *= extra.hpMul;
      if (extra && extra.dmgMul) b.dmg *= extra.dmgMul;
      return this.mk(Object.assign({
        side: "enemy", kind: "enemy", name: id, base: b, x: KEEP_X - 26, dir: -1,
        sprite: "enemies:" + id, def, bounty: Math.round(def.bounty * (1 + 0.1 * this.stageIdx) * (extra && extra.bountyMul || 1)),
        scaleDraw: (extra && extra.scale) || def.scale || 1,
        castT: def.castCd ? def.castCd * 0.6 : 0,
      }, extra || {}));
    }

    mk(o) {
      const e = Object.assign({
        id: this.nextId++, hp: o.base.hp, atkT: 0.3, anim: "idle", animT: 0, status: {}, buffs: [],
        shield: 0, kills: 0, yOff: Math.round(this.fxRandom() * 14 - 9), dead: false, flash: 0, age: 0,
      }, o);
      e.s = Object.assign({}, e.base);
      this.ents.push(e);
      return e;
    }

    // ---------------------------------------------------------------- loop --
    loop(now) {
      if (this._destroyed) return;
      const rawDt = Math.min(MAX_FRAME, (now - this._last) / 1000);
      this._last = now;
      if (!this.paused && !this.over) {
        this.advance(rawDt * (this.speed || 1));
        this.onHud(this);
      }
      this.draw();
      this._raf = requestAnimationFrame((t) => this.loop(t));
    }

    /** Run as many whole simulation steps as the elapsed time has earned. */
    advance(dt) {
      this._accum += dt;
      while (this._accum >= STEP && !this.over) {
        this._accum -= STEP;
        this.update(STEP);
      }
    }

    update(dt) {
      this.t += dt;
      for (const side of [this.player, this.enemy]) side.flash = Math.max(0, (side.flash || 0) - dt);
      if (BC.reducedMotion) this.embers.length = 0;
      else {
        for (const e of this.embers) { e.y -= e.v * dt; e.l += dt; }
        this.embers = this.embers.filter(e => e.l < 3);
        if (this.embers.length < 30 && Math.random() < 1 - Math.pow(0.7, dt * 60)) this.embers.push({ x: Math.random() * W, y: 200, v: 10 + Math.random() * 20, l: 0 });
      }
      // economy
      let inc = Math.min(this.T.incomeCap, this.T.income + this.t * this.T.incomeGrowth) * this.incomeMul;
      for (const e of this.ents) if (!e.dead && e.side === "player" && e.passive && e.passive.gold) inc += e.passive.gold;
      this.addGold(inc * dt, null, true);
      if (this.player.discountT > 0) this.player.discountT -= dt;
      if (this.player.animT > 0) this.player.animT = Math.max(0, this.player.animT - dt);
      if (this.player.spellCd > 0) this.player.spellCd = Math.max(0, this.player.spellCd - dt);
      if (this.autocast && this.player.spellCd === 0 && this.t > 8 && this.foesOf("player").length >= 2 && this.alliesNear(240, 500).length >= 2) this.castSpell(true);
      for (const s of this.slots) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);

      this.updateSpawner(dt);
      this.updateTotem(dt);
      this.updateHazard(dt);

      for (const e of this.ents) if (!e.dead) this.updateEnt(e, dt);
      for (const z of this.zones) {
        z.t -= dt; z.acc += dt;
        if (z.acc >= 1) {
          z.acc -= 1;
          for (const a of (z.who === "ally" ? this.alliesNear(z.x, z.r, z.side) : this.enemiesNear(z.x, z.r, z.side))) z.fn(a);
        }
      }
      this.zones = this.zones.filter(z => z.t > 0);
      this.ents = this.ents.filter(e => !e.dead || e.deathT > 0);
      for (const e of this.ents) if (e.dead) e.deathT -= dt;
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.dur);

      if (this.enemy.hp <= 0) {
        if (this.endless) this.advanceEndlessWave(true);
        else return this.finish(true);
      }
      if (this.player.hp <= 0) return this.finish(false);
    }

    advanceEndlessWave(keepBroken) {
      this.wave++;
      this.hazardT = this.ballistaT = 0;
      this.waveT = 42;
      this.stats.waves = this.wave;
      this.stageIdx = this.wave - 1;
      this.midBossSpawned = this.bossSpawned = false;   // each biome's champion returns with it
      this.onWave(this.wave);
      const st = BC.STAGES[(this.wave - 1) % BC.STAGES.length];
      const allKeys = Object.keys(BC.ENEMIES).filter(k => k !== "king");
      const pool = st.pool.concat([allKeys[this.wave % allKeys.length]]);
      this.stage = Object.assign({}, st, {
        name: `Wave ${this.wave} — ${st.name}`,
        pool,
      });
      if (keepBroken) {
        this.enemy.max = Math.round(1400 * Math.pow(1.35, this.wave - 1));
        this.enemy.hp = this.enemy.max;
        this.healBase(this.player, this.player.max * 0.25);
        this.addGold(120 + this.wave * 20, { x: KEEP_X - 30 });
        for (const e of this.ents) if (!e.dead && e.side === "player") e.x = Math.max(BASE_X + 20, Math.min(e.x, KEEP_X - 190));
        for (let i = 0; i < 3; i++) {
          const g = this.spawnEnemy(pool[this.rnd(pool.length)]);
          g.x -= i * 14;
        }
      }
      this.bg = this.renderBackground();
      this.loadBackdrop();
      if (this.wave % 3 === 0) {
        const b = this.spawnEnemy(this.wave % 6 === 0 ? "king" : "golem", { scale: 1.5, hpMul: 1.35, dmgMul: 1.15, bountyMul: 1.5 });
        b.yOff = -4;
        this.announce((b.name === "king" ? "The Collector King" : "An Iron Golem") + " enters the lane!");
      }
      this.toast(`Wave ${this.wave}: ${st.name}!`);
      BC.sfx.drums();
    }

    updateHazard(dt) {
      const hz = this.stage.hazard;
      if (!hz) return;
      const period = hz.id === "fort" ? 12 : 1;
      const timer = hz.id === "fort" ? "ballistaT" : "hazardT";
      this[timer] += dt;
      while (this[timer] >= period) {
        this[timer] -= period;
        if (hz.id === "canopy") {
          for (const e of this.ents) if (!e.dead && e.side === "player" && e.kind === "unit") this.heal(e, 1.5);
        } else if (hz.id === "lava") {
          for (const e of this.ents) if (!e.dead && e.kind !== "decoy") this.dealDamage(null, e, 2, true);
        } else if (hz.id === "fort") {
          const front = this.alliesNear(KEEP_X, 420).sort((a, b) => b.x - a.x)[0];
          if (front) {
            this.dealDamage(null, front, 28 + 3 * this.stageIdx);
            this.fx.push({ kind: "bolt", x0: KEEP_X - 20, y0: LANE_Y - 56, x1: front.x, y1: LANE_Y - 14 + front.yOff, t: 0, dur: 0.22, col: "#ff9f1c" });
          }
        }
      }
    }

    updateSpawner(dt) {
      if (this.endless) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.waveT = 42;
          this.advanceEndlessWave(false);
        }
      }
      // The crown accrues "threat" and pays each enemy's bounty to field it,
      // so tougher foes arrive less often instead of drowning the lane.
      const st = this.stage, T = this.T;
      this.threat += ((T.threat + T.threatStage * this.stageIdx) * st.pace + this.t / T.threatRamp) * dt;
      if (this.nextFoe == null) this.nextFoe = st.pool[this.rnd(st.pool.length)];
      const cost = BC.ENEMIES[this.nextFoe].bounty;
      if (this.threat >= cost && this.t > 2) {
        this.threat -= cost;
        this.spawnEnemy(this.nextFoe);
        this.nextFoe = null;
      }
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surgeT = T.surgeEvery;
        this.toast("The crown sends a surge!");
        BC.sfx.drums();
        let budget = (T.threat + T.threatStage * this.stageIdx) * T.surgeSeconds, i = 0;
        while (budget > 0 && i < 12) {
          const id = st.pool[this.rnd(st.pool.length)];
          budget -= BC.ENEMIES[id].bounty;
          const e = this.spawnEnemy(id);
          e.x += 8 + i++ * 12;
        }
      }
      if (st.midBoss && !this.midBossSpawned && (this.enemy.hp < this.enemy.max * 0.65 || this.t > 70)) {
        this.midBossSpawned = true;
        const mb = this.spawnEnemy(st.midBoss, { scale: 1.45, hpMul: 1.5, dmgMul: 1.15, bountyMul: 2 });
        mb.yOff = -3;
        this.announce((st.midBossName || "A champion") + " enters the lane!");
        BC.sfx.drums();
      }
      if (st.boss && !this.bossSpawned && (this.enemy.hp < this.enemy.max * 0.6 || this.t > 100)) {
        this.bossSpawned = true;
        const b = this.spawnEnemy(st.boss);
        b.yOff = -4;
        this.announce("The Collector King enters the lane!");
        BC.sfx.drums();
      }
    }

    updateTotem(dt) {
      // The totem defends itself weakly so a single runner can't end the run.
      this.player.atkT -= dt;
      if (this.player.atkT <= 0) {
        const t = this.ents.find(e => !e.dead && e.side === "enemy" && e.x < BASE_X + 90);
        if (t) {
          this.player.atkT = 1.2;
          this.player.animT = 0.5;
          this.dealDamage(null, t, (12 + 4 * this.stageIdx) * (this.tribe.mods.totem || 1));
          this.fx.push({ kind: "bolt", x0: BASE_X, y0: LANE_Y - 50, x1: t.x, y1: LANE_Y - 14 + t.yOff, t: 0, dur: 0.2, col: this.tribe.colors.ink });
        }
      }
    }

    recompute(e) {
      const s = Object.assign({}, e.base);
      for (const b of e.buffs) { if (b.add) s[b.stat] += b.v; else s[b.stat] *= b.v; }
      if (e.passive && e.passive.killStack) s.dmg *= 1 + Math.min(10, e.kills) * e.passive.killStack;
      if (e.status.slow) { s.move *= 1 - e.status.slow.v; s.atkspd *= 1 - e.status.slow.v * 0.5; }
      const hz = this.stage.hazard;
      if (hz) {
        if (hz.id === "marsh") s.move *= 0.88;
        else if (hz.id === "tide" && e.side === "player") s.move += 3;
        else if (hz.id === "blizzard" && s.range > 35) s.range *= 0.85;
        else if (hz.id === "sandstorm") s.atkspd *= 0.9;
      }
      e.s = s;
    }

    updateEnt(e, dt) {
      e.age += dt;
      e.animT += dt;
      if (e.flash > 0) e.flash -= dt;
      // buffs / statuses
      e.buffs = e.buffs.filter(b => (b.t -= dt) > 0);
      for (const k of Object.keys(e.status)) {
        const st = e.status[k];
        st.t -= dt;
        if (k === "poison" || k === "burn") { st.acc = (st.acc || 0) + dt; if (st.acc >= 0.5) { st.acc -= 0.5; this.dealDamage(st.src, e, st.v * 0.5, true); } }
        if (st.t <= 0) delete e.status[k];
      }
      if (e.dead) return;
      this.recompute(e);
      if (e.s.rec && e.hp < e.s.hp) e.hp = Math.min(e.s.hp, e.hp + e.s.rec * dt);
      if (e.kind === "decoy") { e.life -= dt; if (e.life <= 0) return this.kill(e, null); }
      if (e.ability) {
        e.abT = Math.max(0, e.abT - dt);
        if (this.autocast && e.abT === 0 && e.age > 0.5) this.cast(e, true);
      }
      if (e.def && e.def.castCd && !e.status.stun) {
        e.castT = Math.max(0, (e.castT || 0) - dt);
        if (e.castT === 0) {
          if (e.def.onCast === "heresy") {
            const t = this.nearestEnemy(e, e.s.range + 30);
            if (t) {
              e.castT = e.def.castCd;
              this.status(t, "burn", 3, e.s.dmg * 0.4, e);
              if (t.ability) t.abT = Math.min(t.s.abspd, (t.abT || 0) + 2.5);
              this.text(t.x, LANE_Y - 44 + t.yOff, "HERESY!", "#ff4500", 0.9);
            }
          } else if (e.def.onCast === "aegis") {
            const allies = this.alliesNear(e.x, 70, e.side);
            if (allies.length > 1) {
              e.castT = e.def.castCd;
              allies.forEach(a => this.shield(a, 18 + 2 * this.stageIdx));
              this.text(e.x, LANE_Y - 46 + e.yOff, "AEGIS", "#ffd700", 0.9);
            }
          }
        }
      }
      if (e.status.stun) return;

      // targeting
      const foe = this.frontFoe(e);
      const baseDist = e.side === "player" ? (KEEP_X - 22) - e.x : e.x - (BASE_X + 18);
      const reach = e.s.range;
      if (foe && Math.abs(foe.x - e.x) <= reach) {
        this.attack(e, dt, foe);
      } else if (baseDist <= reach) {
        this.attack(e, dt, null);
      } else {
        if (e.kind !== "decoy") e.x += e.dir * e.s.move * dt;
        if (e.anim !== "walk" && e.anim !== "attack") { e.anim = "walk"; e.animT = 0; }
        if (e.anim === "attack" && e.animT > 0.5) { e.anim = "walk"; e.animT = 0; }
      }
      e.x = Math.max(BASE_X, Math.min(KEEP_X, e.x));
    }

    frontFoe(e) {
      let best = null, bd = 1e9;
      for (const o of this.ents) {
        if (o.dead || o.side === e.side) continue;
        const d = (o.x - e.x) * e.dir;
        if (d < -10) continue;           // behind us
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    attack(e, dt, foe) {
      if (e.kind === "decoy") return;
      e.atkT -= dt;
      if (e.atkT > 0) return;
      e.atkT += 1 / Math.max(0.1, e.s.atkspd);   // keeping the overshoot makes the attack rate exact
      e.anim = "attack"; e.animT = 0;
      const ranged = e.s.range > 40;
      if (foe) {
        const dealt = this.dealDamage(e, foe, e.s.dmg);
        if (e.status.lifesteal) this.heal(e, dealt * e.status.lifesteal.v);
        if (e.def && e.def.onHit === "slow") this.status(foe, "slow", 2, 0.3);
        if (e.side === "enemy" && e.def && e.def.onHit === "steal" && this.gold > 0) { const g = Math.min(this.gold, 8); this.gold -= g; this.text(foe.x, LANE_Y - 40, "-" + g + "g", "#ffd700"); }
        if (ranged) this.fx.push({ kind: "bolt", x0: e.x, y0: LANE_Y - 18 + e.yOff, x1: foe.x, y1: LANE_Y - 16 + foe.yOff, t: 0, dur: 0.18, col: e.side === "player" ? this.auraOf(e) : "#e8d0a0" });
      } else {
        const side = e.side === "player" ? this.enemy : this.player;
        const dmg = e.s.dmg * (e.def && e.def.boss ? 2 : 1);
        side.hp -= dmg;
        side.flash = 0.15;
        if (e.side === "player") this.stats.dmg += dmg; else this.stats.baseDmg += dmg;
        if (ranged) this.fx.push({ kind: "bolt", x0: e.x, y0: LANE_Y - 18 + e.yOff, x1: e.side === "player" ? KEEP_X - 10 : BASE_X + 10, y1: LANE_Y - 40, t: 0, dur: 0.18, col: e.side === "player" ? this.auraOf(e) : "#e8d0a0" });
        BC.sfx.hit();
      }
    }

    auraOf(e) { const m = window.BC_ASSETS.units[e.name]; return m ? m.aura : e.kind === "enemy" ? "#e8d0a0" : "#fff"; }

    dealDamage(src, t, amount, raw) {
      if (t.dead) return 0;
      let d = raw ? amount : amount * 60 / (60 + Math.max(0, t.s.def));
      if (t.shield > 0) { const a = Math.min(t.shield, d); t.shield -= a; d -= a; }
      t.hp -= d;
      t.flash = 0.12;
      if (src && src.side === "player") this.stats.dmg += d;
      if (d >= 1) this.text(t.x + (this.fxRandom() * 10 - 5), LANE_Y - 34 + t.yOff, Math.round(d), t.side === "player" ? "#ff6b6b" : "#fff3d6");
      if (t.hp <= 0) this.kill(t, src);
      return d;
    }

    kill(t, src) {
      if (t.dead) return;
      t.dead = true;
      t.deathT = 0.4;
      if (t.side === "enemy") {
        this.stats.kills++;
        this.stats.killedByType[t.name] = (this.stats.killedByType[t.name] || 0) + 1;
        const g = Math.round(t.bounty * (this.tribe.mods.bounty || 1));
        this.addGold(g, t);
        if (src && src.passive && src.passive.killStack) src.kills++;
        if (t.def && t.def.boss) this.stats.bossKilled = true;
      } else if (t.kind === "unit") {
        this.stats.lost++;
        this.player.fallen.push({ name: t.name, base: t.base });
        if (t.status.insured) this.addGold(Math.round(t.cost * t.status.insured.v), t);
        BC.sfx.die();
      }
    }

    finish(win) {
      if (this.over || this._destroyed) return;
      this.over = true;
      this.stats.time = this.t;
      (win ? BC.sfx.win : BC.sfx.lose)();
      this._endTimer = setTimeout(() => {
        this._endTimer = null;
        if (!this._destroyed) this.onEnd({ win, stats: this.stats });
      }, 900);
    }

    // ------------------------------------------------------------ abilities --
    abilityFailure(u) {
      return u.ability.name + ": " + (u.ability.unavailable || "No enemy in range") + ". Still ready.";
    }

    cast(u, auto, quiet = false) {
      if (!u.ability || u.abT > 0 || u.dead || this.paused || this.over) return false;
      this._src = u.ability.name;
      this._caster = u;
      const r = u.ability.run(this, u);
      this._src = this._caster = null;
      if (r === false) { if (!auto && !quiet) this.toast(this.abilityFailure(u)); return false; }
      u.abT = u.s.abspd;
      u.anim = "attack"; u.animT = 0;
      this.stats.abilities++;
      this.text(u.x, LANE_Y - 50 + u.yOff, u.ability.name, this.auraOf(u), 1.2);
      BC.sfx.cast();
      if (!auto) this.onAction("ability", this);
      return true;
    }

    abilityState(i) {
      const slot = this.slots[i];
      const units = slot ? this.ents.filter(e => !e.dead && e.side === "player" && e.name === slot.name && e.ability) : [];
      return {
        deployed: units.length,
        ready: units.filter(e => e.abT === 0).length,
        cooldown: units.length ? Math.min(...units.map(e => e.abT)) : 0,
      };
    }

    castBySlot(i) {
      const slot = this.slots[i];
      if (!slot || this.paused || this.over) return false;
      const ready = this.ents.filter(e => !e.dead && e.side === "player" && e.name === slot.name && e.ability && e.abT === 0).sort((a, b) => b.x - a.x);
      for (const u of ready) if (this.cast(u, false, true)) return true;
      if (ready.length) this.toast(this.abilityFailure(ready[0]));
      else {
        const state = this.abilityState(i);
        this.toast(state.deployed ? BC.UNITS[slot.name].ability.name + " ready in " + Math.ceil(state.cooldown) + "s" : "Deploy " + slot.name + " before casting");
      }
      return false;
    }

    castAny() {
      if (this.paused || this.over) return false;
      const ready = this.ents.filter(e => !e.dead && e.side === "player" && e.ability && e.abT === 0).sort((a, b) => b.x - a.x);
      for (const u of ready) if (this.cast(u, false, true)) return true;
      this.toast(ready.length ? this.abilityFailure(ready[0]) : "No abilities ready. Deploy a warrior or wait for cooldowns.");
      return false;
    }

    castSpell(auto) {
      if (this.paused || this.over) return false;
      const sp = this.tribe.spell;
      if (!sp || this.player.spellCd > 0) {
        if (!auto && sp && this.player.spellCd > 0) this.toast(sp.name + " ready in " + Math.ceil(this.player.spellCd) + "s");
        return false;
      }
      const reason = sp.unavailable?.(this);
      if (reason) { if (!auto) this.toast(sp.name + ": " + reason); return false; }
      this._src = sp.name;
      const r = sp.run(this);
      this._src = null;
      if (r === false) {
        if (!auto) this.toast(sp.name + ": no warriors deployed");
        return false;
      }
      this.player.spellCd = sp.cd;
      this.player.animT = 0.5;
      this.stats.abilities++;
      this.text(BASE_X + 10, LANE_Y - 84, sp.name.toUpperCase(), this.tribe.colors.ink, 1.4);
      BC.sfx.cast();
      BC.sfx.drums();
      if (!auto) this.onAction("spell", this);
      return true;
    }

    // API used by unit abilities (see data.js)
    foesOf(side) { return this.ents.filter(e => !e.dead && e.side !== side); }
    nearestEnemy(u, r) { let b = null, bd = r; for (const e of this.foesOf(u.side)) { const d = Math.abs(e.x - u.x); if (d <= bd) { bd = d; b = e; } } return b; }
    strongestEnemy(u, r) { return this.foesOf(u.side).filter(e => Math.abs(e.x - u.x) <= r).sort((a, b) => b.hp - a.hp)[0] || null; }
    weakestEnemy(u, r) { return this.foesOf(u.side).filter(e => Math.abs(e.x - u.x) <= r).sort((a, b) => a.hp - b.hp)[0] || null; }
    rearmostEnemy(u, r) { return this.foesOf(u.side).filter(e => Math.abs(e.x - u.x) <= r).sort((a, b) => (b.x - a.x) * u.dir)[0] || null; }
    enemiesNear(x, r, side) { return this.foesOf(side || "player").filter(e => Math.abs(e.x - x) <= r); }
    enemiesBetween(x0, x1) { const a = Math.min(x0, x1), b = Math.max(x0, x1); return this.foesOf("player").filter(e => e.x >= a && e.x <= b); }
    alliesNear(x, r, side) { side = side || "player"; return this.ents.filter(e => !e.dead && e.side === side && Math.abs(e.x - x) <= r); }
    hit(src, t, amt, raw) { return this.dealDamage(src, t, amt, raw); }
    heal(t, amt) { if (t.dead || amt <= 0) return; const h = Math.min(amt, t.s.hp - t.hp); t.hp += h; if (h >= 1) this.text(t.x, LANE_Y - 38 + t.yOff, "+" + Math.round(h), "#7dff8a"); }
    shield(t, amt) { t.shield = Math.max(t.shield, amt); }
    // The strongest value and the longest duration stand, and a damage tick in progress carries on.
    status(t, kind, dur, v = 0, src = this._caster || null) {
      const cur = t.status[kind];
      if (!cur) { t.status[kind] = { t: dur, v, acc: 0, src }; return; }
      cur.t = Math.max(cur.t, dur);
      if (v >= cur.v) { cur.v = v; cur.src = src || cur.src; }
    }
    // Recasting the same ability refreshes its buff instead of stacking it.
    buff(t, stat, v, dur, add) {
      const src = this._src || null;
      const cur = src && t.buffs.find(b => b.src === src && b.stat === stat);
      if (cur) { cur.t = Math.max(cur.t, dur); cur.v = Math.max(cur.v, v); }
      else t.buffs.push({ stat, v, t: dur, add: !!add, src });
      this.recompute(t);
    }
    knock(t, dx) { if (!(t.def && t.def.boss)) t.x = Math.max(BASE_X, Math.min(KEEP_X - 20, t.x + dx)); }
    side(u) { return u.side === "player" ? this.player : this.enemy; }
    healBase(side, amt) { side.hp = Math.min(side.max, side.hp + amt); this.text(BASE_X, LANE_Y - 80, "+" + Math.round(amt), "#7dff8a"); }
    hurtSelf(u, amt) { u.hp = Math.max(1, u.hp - amt); u.flash = 0.2; }
    decoy(u, x, hp) {
      const b = Object.assign({}, u.base, { hp, dmg: 0, def: 0, rec: 0 });
      const d = this.mk({ side: u.side, kind: "decoy", name: u.name, base: b, x, dir: u.dir, sprite: u.sprite, life: 10 });
      d.yOff = u.yOff + 3;
    }
    zone(u, x, r, dur, fn, who) { this.zones.push({ x, r, t: dur, dur, fn, who, side: u.side, acc: 0, col: this.auraOf(u) }); }
    revive(u, frac) {
      const f = this.player.fallen.pop();
      if (!f) return null;
      return this.spawnUnit(f.name, f.base, u.x - 10, frac);
    }
    impact(u, t) { this.fx.push({ kind: "impact", sprite: u.sprite, x: t.x, y: LANE_Y - 32 + t.yOff, t: 0, dur: 0.36 }); }
    addGold(n, at, quiet) {
      const before = this.gold;
      this.gold = Math.min(GOLD_CAP, this.gold + n);
      const got = this.gold - before;
      this.stats.goldEarned += got;
      if (!quiet && at && got >= 1) { this.text(at.x, LANE_Y - 46, "+" + Math.round(got) + "g", "#ffd700"); BC.sfx.coin(); }
    }
    text(x, y, s, col, dur) {
      const str = String(s);
      const isNum = /^[-+]?\d+$/.test(str);
      if (isNum) {
        const val = parseInt(str, 10);
        const sign = str.startsWith("+") ? "+" : "";
        for (const f of this.fx) {
          if (f.kind === "text" && f.num && f.col === col && f.t < 0.25 && Math.abs(f.x - x) < 16 && Math.abs(f.y - y) < 14) {
            f.val += val;
            f.s = (f.val >= 0 && sign ? "+" : "") + f.val;
            f.t = 0;
            return;
          }
        }
      }
      const texts = this.fx.filter(f => f.kind === "text");
      if (texts.length >= 32) {
        const victim = texts.find(f => f.num) || texts[0];
        const idx = this.fx.indexOf(victim);
        if (idx >= 0) this.fx.splice(idx, 1);
      }
      this.fx.push({ kind: "text", x, y, s: str, col, t: 0, dur: dur || 0.8, num: isNum, val: isNum ? parseInt(str, 10) : 0 });
    }

    // -------------------------------------------------------------- input --
    onPointer(ev) {
      if (this.paused || this.over) return;
      const r = this.cv.getBoundingClientRect();
      const x = (ev.clientX - r.left) * W / r.width;
      const y = (ev.clientY - r.top) * H / r.height;
      let best = null, bd = 22;
      for (const e of this.ents) {
        if (e.dead || e.side !== "player" || !e.ability) continue;
        const d = Math.hypot(e.x - x, (LANE_Y - 16 + e.yOff) - y);
        if (d < bd && (e.abT === 0 || !best)) { bd = d; best = e; }
      }
      if (best) {
        if (best.abT > 0) this.toast(best.ability.name + " ready in " + Math.ceil(best.abT) + "s");
        else this.cast(best, false);
      } else if (x < BASE_X + 38 && y > LANE_Y - 90 && y < LANE_Y + 10) {
        this.castSpell(false);
      }
    }

    // ----------------------------------------------------------- rendering --
    renderBackground() {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const col = this.tribe.colors;
      const scene = this.tribe.bgScene;
      const grad = g.createLinearGradient(0, 0, 0, H);
      if (scene === "pits") { grad.addColorStop(0, "#0b0606"); grad.addColorStop(1, "#3a0b05"); }
      else if (scene === "forest") { grad.addColorStop(0, "#0d1410"); grad.addColorStop(1, "#1f3326"); }
      else { grad.addColorStop(0, "#0c0a05"); grad.addColorStop(1, "#2b220c"); }
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      let s = 99 + this.stageIdx * 31;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const art = BC.images["stage:" + (this.stageIdx % BC.STAGES.length)];
      if (art && art.naturalWidth) {
        // A quiet crop of the biome painting gives every stage its own horizon.
        const cropH = art.naturalWidth * GROUND / W;
        g.imageSmoothingEnabled = false;
        g.drawImage(art, 0, (art.naturalHeight - cropH) * .48, art.naturalWidth, cropH, 0, 0, W, GROUND);
        const veil = g.createLinearGradient(0, 0, 0, GROUND);
        veil.addColorStop(0, "rgba(4,3,6,.72)"); veil.addColorStop(.55, "rgba(4,3,6,.28)"); veil.addColorStop(1, "rgba(4,3,6,.68)");
        g.fillStyle = veil; g.fillRect(0, 0, W, GROUND);
      } else if (scene === "pits") {
        for (let i = 0; i < 14; i++) { const x = r() * W, w = 20 + r() * 60, h = 30 + r() * 90; g.fillStyle = "#1a0a08"; g.beginPath(); g.moveTo(x - w, GROUND); g.lineTo(x, GROUND - h); g.lineTo(x + w, GROUND); g.fill(); }
        for (let i = 0; i < 6; i++) { const x = r() * W; const gg = g.createRadialGradient(x, GROUND, 2, x, GROUND, 40); gg.addColorStop(0, "rgba(255,90,20,0.6)"); gg.addColorStop(1, "rgba(255,69,0,0)"); g.fillStyle = gg; g.fillRect(x - 40, GROUND - 40, 80, 40); }
        for (let i = 0; i < 18; i++) { const x = r() * W; g.fillStyle = "#2a0d08"; const sy = GROUND - 46 + r() * 30; g.fillRect(x, sy, 2, GROUND - sy); g.fillStyle = col.ink; g.fillRect(x, sy, 1, 2); }
      } else if (scene === "forest") {
        g.fillStyle = "#16201c";
        for (let i = 0; i < 6; i++) { const x = i * 100 - 20 + r() * 40, h = 60 + r() * 50; g.beginPath(); g.moveTo(x - 70, GROUND - 40); g.lineTo(x, GROUND - 40 - h); g.lineTo(x + 70, GROUND - 40); g.fill(); }
        g.fillStyle = "#2c5a7a"; g.fillRect(0, GROUND - 30, W, 10);
        g.fillStyle = "#4682B4"; for (let x = 0; x < W; x += 9) g.fillRect(x + (x % 3), GROUND - 27, 4, 1);
        for (let i = 0; i < 22; i++) { const x = r() * W, h = 50 + r() * 70; g.fillStyle = r() < 0.5 ? "#173d1c" : "#1f4a24"; g.beginPath(); g.moveTo(x, GROUND - h); g.lineTo(x - 12, GROUND); g.lineTo(x + 12, GROUND); g.fill(); g.fillStyle = "#3b2513"; g.fillRect(x - 1, GROUND - 6, 3, 6); }
      } else {
        g.fillStyle = "#1a1408";
        g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= W; x += 24) g.lineTo(x, 30 + r() * 40); g.lineTo(W, 0); g.fill();
        for (let i = 0; i < 9; i++) { const x = r() * W, w = 20 + r() * 30, h = 10 + r() * 22; g.fillStyle = "#8a6d12"; g.beginPath(); g.ellipse(x, GROUND, w, h, 0, Math.PI, 0); g.fill(); g.fillStyle = "#FFD700"; for (let k = 0; k < 8; k++) g.fillRect(x - w * 0.7 + r() * w * 1.4, GROUND - r() * h * 0.8, 2, 1); }
        for (let i = 0; i < 12; i++) { g.fillStyle = r() < 0.5 ? "#50C878" : "#00FF00"; g.fillRect(r() * W, 40 + r() * 120, 2, 2); }
      }
      // ground tiles
      const tk = "tiles:" + this.stage.tile;
      for (let y = GROUND; y < H; y += 16) for (let x = 0; x < W; x += 16) BC.drawFrame(g, tk, (x * 7 + y * 3) % 3, x, y, 1, false, 16);
      const shade = g.createLinearGradient(0, GROUND, 0, H); shade.addColorStop(0, "rgba(0,0,0,0.35)"); shade.addColorStop(1, "rgba(0,0,0,0.75)");
      g.fillStyle = shade; g.fillRect(0, GROUND, W, H - GROUND);
      g.globalAlpha = 0.18; g.fillStyle = col.slab; g.fillRect(0, GROUND, W, H - GROUND); g.globalAlpha = 1;
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, GROUND, W, 2);
      // A worn path separates combatants from the busier ground texture.
      g.fillStyle = "rgba(22,15,12,.38)"; g.fillRect(0, LANE_Y - 5, W, 14);
      g.fillStyle = "rgba(214,181,128,.08)"; g.fillRect(0, LANE_Y + 9, W, 1);
      return c;
    }

    draw() {
      const g = this.ctx;
      g.imageSmoothingEnabled = false;
      g.drawImage(this.bg, 0, 0);
      const t = this.t;
      // ambient: embers / glowing eyes / sparkles
      const ember = this.tribe.bgScene === "pits" ? "#ff6a1a" : this.tribe.bgScene === "forest" ? "#98FB98" : "#FFD700";
      for (const e of BC.reducedMotion ? [] : this.embers) { g.fillStyle = ember; g.globalAlpha = Math.max(0, 1 - e.l / 3); g.fillRect(e.x + Math.sin(e.l * 3) * 3, e.y, 1, 1); }
      g.globalAlpha = 1;
      if (!BC.reducedMotion && this.tribe.bgScene === "pits" && Math.sin(t * 0.7) > 0.6) { g.fillStyle = "#FF0000"; g.fillRect(140, 120, 2, 1); g.fillRect(145, 120, 2, 1); }

      // strongholds
      const pf = this.player.flash || 0;
      const baseFrame = this.player.animT > 0 ? 4 + Math.min(4, Math.floor((0.5 - this.player.animT) * 10)) : Math.floor(t * 4) % 4;
      BC.drawFrame(g, "bases:" + this.tribe.id, baseFrame, BASE_X - 40, LANE_Y - 82, 2.5);
      if (pf > 0) {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.45;
        BC.drawFrame(g, "bases:" + this.tribe.id, baseFrame, BASE_X - 40, LANE_Y - 82, 2.5);
        g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      }
      BC.drawFrame(g, "props:campfire", Math.floor(t * 7) % 4, BASE_X + 20, LANE_Y - 38, 1);
      const ef = this.enemy.flash || 0;
      const keepCell = (window.BC_ASSETS?.keeps?.[this.stage.keep]?.cell) || 32;
      BC.drawFrame(g, "keeps:" + this.stage.keep, 0, KEEP_X - 40, LANE_Y - 78, 80 / keepCell, false, keepCell);
      if (ef > 0) {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.45;
        BC.drawFrame(g, "keeps:" + this.stage.keep, 0, KEEP_X - 40, LANE_Y - 78, 80 / keepCell, false, keepCell);
        g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      }
      BC.drawFrame(g, "props:brazier", Math.floor(t * 8) % 4, KEEP_X - 58, LANE_Y - 38, 1);

      // zones
      for (const z of this.zones) {
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 6);
        g.fillStyle = z.col;
        g.beginPath(); g.ellipse(z.x, LANE_Y - 2, z.r, 8, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }

      // entities (back to front)
      const list = this.ents.slice().sort((a, b) => a.yOff - b.yOff);
      for (const e of list) this.drawEnt(g, e);

      // foreground lamp posts along the bottom edge of the lane
      for (const [lx, phase] of [[BASE_X - 30, 0], [KEEP_X + 8, 2]]) {
        const ly = LANE_Y - 20;
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.beginPath(); g.ellipse(lx + 16, ly + 31, 7, 2.5, 0, 0, Math.PI * 2); g.fill();
        const pulse = BC.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 5 + phase);
        const glow = g.createRadialGradient(lx + 16, ly + 9, 1, lx + 16, ly + 9, 18);
        glow.addColorStop(0, `rgba(255,190,90,${(0.28 * pulse).toFixed(3)})`);
        glow.addColorStop(1, "rgba(255,140,40,0)");
        g.fillStyle = glow;
        g.fillRect(lx - 2, ly - 9, 36, 36);
        BC.drawFrame(g, "props:lantern", Math.floor(t * 6 + phase) % 4, lx, ly, 1);
      }

      // fx
      for (const f of this.fx) {
        const k = f.t / f.dur;
        if (f.kind === "text") {
          g.globalAlpha = 1 - k;
          g.font = "bold 8px monospace"; g.textAlign = "center";
          g.fillStyle = "#000"; g.fillText(f.s, f.x + 1, f.y - k * 14 + 1);
          g.fillStyle = f.col; g.fillText(f.s, f.x, f.y - k * 14);
          g.globalAlpha = 1;
        } else if (f.kind === "impact") {
          BC.drawFrame(g, f.sprite, 9 + Math.min(2, Math.floor(k * 3)), f.x - 16, f.y);
        } else if (f.kind === "bolt") {
          const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k;
          g.fillStyle = f.col; g.fillRect(x - 1, y - 1, 3, 2);
        }
      }
      if (this.paused) { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, W, H); }
    }

    drawEnt(g, e) {
      const sc = e.scaleDraw || 1;
      const flip = e.kind === "enemy" && e.dir === 1;
      const size = 32 * sc;
      const x = e.x - size / 2, y = LANE_Y - size + e.yOff;
      // shadow
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath(); g.ellipse(e.x, LANE_Y + e.yOff, 10 * sc, 3, 0, 0, Math.PI * 2); g.fill();
      // ready-ability circle (luminescent tribal ring)
      if (e.ability && e.abT === 0 && !e.dead) {
        const p = BC.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(this.t * 6);
        g.strokeStyle = this.auraOf(e); g.globalAlpha = 0.5 + 0.5 * p; g.lineWidth = 1;
        g.beginPath(); g.ellipse(e.x, LANE_Y + e.yOff, 14, 5, 0, 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 6; i++) { const a = (BC.reducedMotion ? 0 : this.t * 2) + i * Math.PI / 3; g.fillStyle = this.auraOf(e); g.fillRect(e.x + Math.cos(a) * 14 - 1, LANE_Y + e.yOff + Math.sin(a) * 5 - 1, 2, 2); }
        g.globalAlpha = 1;
      }
      let frame;
      if (e.kind === "enemy") {
        frame = e.anim === "attack" ? 4 + Math.min(3, Math.floor(e.animT * 10)) : Math.floor(e.age * 6) % 4;
      } else {
        frame = e.anim === "attack" && e.animT < 0.5 ? 4 + Math.min(4, Math.floor(e.animT * 10)) : Math.floor(e.age * 4) % 4;
      }
      if (e.dead) g.globalAlpha = Math.max(0, e.deathT / 0.4);
      if (e.kind === "decoy") g.globalAlpha = 0.45 + 0.1 * Math.sin(this.t * 10);
      const bob = (e.kind === "enemy" && e.anim === "walk" && !BC.reducedMotion)
        ? Math.abs(Math.sin(e.age * 8)) * 1.5
        : 0;
      BC.drawFrame(g, e.sprite, frame, x, y - bob, sc, flip);
      if (e.flash > 0 && !e.dead) {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5;
        BC.drawFrame(g, e.sprite, frame, x, y - bob, sc, flip);
        g.globalCompositeOperation = "source-over";
      }
      g.globalAlpha = 1;
      if (e.status.stun) { g.fillStyle = "#c0c0c0"; for (let i = 0; i < 3; i++) g.fillRect(x + 8 + i * 7, y + 6, 1, size - 10); }
      if (e.status.slow) { g.fillStyle = "#8cdcff"; g.fillRect(e.x - 6, y - 2, 2, 2); }
      if (e.status.poison || e.status.burn) { g.fillStyle = e.status.poison ? "#78ff3c" : "#ff7814"; g.fillRect(e.x + 4, y - 2 - (this.t * 8 % 4), 2, 2); }
      // hp bar
      if (!e.dead && (e.hp < e.s.hp || e.shield > 0)) {
        const bw = 16 * sc, k = Math.max(0, e.hp / e.s.hp);
        g.fillStyle = "#000"; g.fillRect(e.x - bw / 2 - 1, y - 5, bw + 2, 4);
        g.fillStyle = e.side === "player" ? "#d22" : "#e8c070"; g.fillRect(e.x - bw / 2, y - 4, bw * k, 2);
        if (e.shield > 0) { g.fillStyle = "#8cf"; g.fillRect(e.x - bw / 2, y - 6, Math.min(bw, bw * e.shield / e.s.hp), 1); }
      }
    }
  }

  BC.Battle = Battle;
  BC.BATTLE_W = W; BC.BATTLE_H = H; BC.BATTLE_STEP = STEP;
})();
