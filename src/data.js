/* Beast and Crimson: Tribes — game data.
 * Units / tribes / runic burns come from the root .docx design docs.
 * Stat keys match the Runic Burn doc: hp dmg def atkspd move range cost abpwr abspd rec.
 */
(function () {
  "use strict";

  const TRIBES = {
    offense: {
      id: "offense", name: "Bloodfang", word: "Mixio", pron: "/'mix.i.o/",
      colors: { slab: "#8B0000", ink: "#FF4500", bg: "#1a1a1a", eyes: "#FF0000", accent: "#FF4500" },
      passive: "Bloodfang warriors strike 25% harder and carry 25% more life.",
      threat: "Every ember here was once a village. Feed the fire or become it.",
      mods: { dmg: 1.25, hp: 1.25 },
      bgScene: "pits",
      spell: {
        name: "Blood Sacrifice", cd: 26,
        desc: "Spill 5% of the Totem's current life: all deployed warriors gain +35% damage, +35% attack speed, and 25% lifesteal for 7s. Requires at least 35% Totem health and a deployed warrior.",
        unavailable: (B) => !B.alliesNear(240, 500).length ? "Deploy a warrior first" : B.player.hp < B.player.max * 0.35 ? "Requires at least 35% Totem health" : "",
        run: (B) => {
          const allies = B.alliesNear(240, 500);
          if (B.tribe.spell.unavailable(B)) return false;
          B.player.hp = Math.max(1, B.player.hp * 0.95);
          B.player.flash = 0.25;
          B.burst?.(34, 152, "#FF4500", 18, "ring");
          allies.forEach(a => { B.buff(a, "dmg", 1.35, 7); B.buff(a, "atkspd", 1.35, 7); B.status(a, "lifesteal", 7, 0.25); B.impact(a, a); });
        },
      },
    },
    defense: {
      id: "defense", name: "Guardvaw", word: "Spuea", pron: "/'spu.e.a/",
      colors: { slab: "#228B22", ink: "#87CEEB", bg: "#1b2416", eyes: "#98FB98", accent: "#4682B4" },
      passive: "The Totem holds 50% more life and bolts twice as hard; units gain +10% DEF.",
      threat: "The river remembers every body it carried. Stand, or join them.",
      mods: { baseHp: 1.5, def: 1.1, totem: 2 },
      bgScene: "forest",
      spell: {
        name: "Spuea Bulwark", cd: 28,
        desc: "Raise a stone barricade ahead of your vanguard and wrap all allies in an 80 HP shield.",
        run: (B) => {
          const allies = B.alliesNear(240, 500);
          const frontX = allies.reduce((m, a) => Math.max(m, a.x), 80);
          const bx = Math.min(400, frontX + 24);
          B.decoy({ side: "player", name: "Totem Shieldbearer", base: { hp: 450, dmg: 0, def: 18, move: 0, range: 20, atkspd: 0.5 }, x: bx, dir: 1, sprite: "bases:defense", yOff: -4 }, bx, 450);
          B.burst?.(bx, 178, "#87CEEB", 16, "ring");
          allies.forEach(a => { B.shield(a, 80); B.impact(a, a); });
        },
      },
    },
    greed: {
      id: "greed", name: "Goldclaw", word: "Pasea", pron: "/pa'se.a/",
      colors: { slab: "#006400", ink: "#FFD700", bg: "#15140c", eyes: "#FFD700", accent: "#FFD700" },
      passive: "Gold flows 25% faster and every kill pays 35% more.",
      threat: "They taxed your dead. Now you will tax theirs.",
      mods: { income: 1.25, bounty: 1.35 },
      bgScene: "cave",
      spell: {
        name: "Royal Bribe", cd: 38,
        desc: "Buy off the strongest non-boss foe at 60% life to fight for Goldclaw and pay you 25 gold. With no foe to buy, mint 75 gold.",
        run: (B) => {
          const foes = B.foesOf("player").filter(e => !(e.def && e.def.boss)).sort((a, b) => b.hp - a.hp);
          if (foes[0]) {
            const f = foes[0];
            f.side = "player"; f.dir = 1; f.hp = f.s.hp * 0.6; f.shield = 0;
            B.text(f.x, 140, "BRIBED!", "#FFD700", 1.1);
            B.burst?.(f.x, 168, "#FFD700", 18, "coins");
            B.addGold(25, f);
          } else {
            B.burst?.(60, 168, "#FFD700", 16, "coins");
            B.addGold(75, { x: 60 });
          }
        },
      },
    },
  };

  // [cost, hp, dmg, def, atkspd, move, range, abpwr, abcd, rec]
  const U = (tribe, role, s, ability, extra) => Object.assign({
    tribe, role,
    stats: { cost: s[0], hp: s[1], dmg: s[2], def: s[3], atkspd: s[4], move: s[5], range: s[6], abpwr: s[7], abspd: s[8], rec: s[9] },
    ability,
  }, extra || {});

  const UNITS = {
    // ---- GREED (Goldclaw) -------------------------------------------------
    "Golden Totemist": U("greed", "Ranged", [70, 120, 14, 4, 1.0, 22, 60, 20, 11, 0.5],
      { name: "Totem Tithe", desc: "Hurls a golden totem at the nearest foe in reach and always skims 15 gold.", fx: "nearest", run: (B, u) => { const t = B.nearestEnemy(u, u.s.range * 1.5); if (t) { B.beam?.(u.x, 168 + u.yOff, t.x, 172 + t.yOff, "#FFD700", "coin"); B.hit(u, t, u.s.abpwr * 2.5); B.impact(u, t); } B.addGold(15, u); } }),
    "Baron": U("greed", "Support", [150, 160, 10, 6, 0.7, 18, 30, 30, 14, 1],
      { name: "Crown Levy", desc: "Crowns the strongest foe for heavy damage and levies 10 gold plus 10% of your purse (90 at most).", run: (B, u) => { const t = B.strongestEnemy(u, 220); if (t) { B.burst?.(t.x, 164, "#FFD700", 12, "pillar"); B.hit(u, t, u.s.abpwr * 3); B.impact(u, t); } B.addGold(Math.min(80, Math.floor(B.gold * 0.1)) + 10, u); } }),
    "Pledge Warbeast": U("greed", "Bruiser", [110, 260, 26, 8, 0.9, 30, 22, 25, 12, 1],
      { name: "Pledged Fang", desc: "A frenzied bite for 4x ability power that heals for 30% of the damage.", run: (B, u) => { const t = B.nearestEnemy(u, u.s.range + 30); if (!t) return false; B.slash?.(u.x, t.x, "#dc141e"); const d = B.hit(u, t, u.s.abpwr * 4); B.heal(u, d * 0.3); B.impact(u, t); } }),
    "Resource Warlock": U("greed", "Caster", [160, 110, 18, 2, 0.8, 18, 90, 20, 12, 0.5],
      { name: "Compound Interest", desc: "Opens the vault: damages every foe in range for ability power + 1 per 15 gold held.", run: (B, u) => { const ts = B.enemiesNear(u.x, u.s.range + 20); if (!ts.length) return false; B.burst?.(u.x, 174, "#FFD700", 14, "ring"); const amt = u.s.abpwr + B.gold / 15; ts.forEach(t => { B.hit(u, t, amt); B.impact(u, t); }); } }),
    "Mine Spirit": U("greed", "Economy", [90, 90, 6, 2, 0.6, 14, 40, 15, 11, 1],
      { name: "Nugget Burst", desc: "Passive: +2 gold/s while alive. Active: shakes loose 25 + ability power gold.", run: (B, u) => { B.burst?.(u.x, 174, "#FFD700", 10, "coins"); B.addGold(25 + u.s.abpwr, u); B.impact(u, u); } },
      { passive: { gold: 2 } }),
    "Goldweb Spider": U("greed", "Control", [100, 140, 12, 4, 1.0, 26, 50, 15, 11, 0.5],
      { name: "Gilded Web", desc: "Webs the ground ahead: foes inside are slowed 50% for 4s and take light damage.", run: (B, u) => { const cx = u.x + 40 * u.dir; const ts = B.enemiesNear(cx, 70); if (!ts.length) return false; B.burst?.(cx, 188, "#FFD700", 14, "web"); ts.forEach(t => { B.hit(u, t, u.s.abpwr); B.status(t, "slow", 4, 0.5); B.impact(u, t); }); } }),
    "Totem Insurer": U("greed", "Guardian", [120, 200, 10, 12, 0.8, 20, 25, 30, 15, 1],
      { name: "Blood Insurance", desc: "Allies nearby gain a shield worth 3x ability power. Allies who fall in the next 8s refund half their cost.", run: (B, u) => { B.burst?.(u.x, 178, "#FFD700", 12, "ring"); B.alliesNear(u.x, 110).forEach(a => { B.shield(a, u.s.abpwr * 3); B.status(a, "insured", 8, 0.5); B.impact(u, a); }); } }),
    "Golden Archer": U("greed", "Sniper", [130, 100, 22, 2, 0.9, 24, 140, 30, 10, 0.3],
      { name: "Gilded Shaft", desc: "An arrow that pierces every foe in a long line for 2x ability power.", run: (B, u) => { const x1 = u.x + u.dir * u.s.range * 1.6; const ts = B.enemiesBetween(u.x, x1); if (!ts.length) return false; B.beam?.(u.x, 172 + u.yOff, x1, 172 + u.yOff, "#FFD700", "pierce"); ts.forEach(t => { B.hit(u, t, u.s.abpwr * 2); B.impact(u, t); }); } }),
    "Golden Beffalo": U("greed", "Tank", [140, 360, 14, 14, 0.6, 20, 22, 20, 14, 2],
      { name: "Golden Horns", desc: "Charges into the line, damaging and hurling back every foe close by.", run: (B, u) => { const ts = B.enemiesNear(u.x + 20 * u.dir, 50); if (!ts.length) return false; B.burst?.(u.x + 20 * u.dir, 184, "#FFD700", 12, "ring"); ts.forEach(t => { B.hit(u, t, u.s.abpwr * 2); B.knock(t, 40 * u.dir); B.impact(u, t); }); } }),
    "Trade Pact Alpha": U("greed", "Commander", [200, 180, 12, 6, 0.8, 20, 60, 25, 16, 1],
      { name: "Coin Rain", desc: "Gold falls on the enemy line (2x ability power, area) and all deployments cost 25% less for 8s.", run: (B, u) => { const t = B.nearestEnemy(u, 200); if (t) { B.burst?.(t.x, 142, "#FFD700", 20, "rain"); B.enemiesNear(t.x, 60).forEach(e => { B.hit(u, e, u.s.abpwr * 2); B.impact(u, e); }); } B.side(u).discountT = 8; } }),

    // ---- DEFENSE (Guardvaw) -----------------------------------------------
    "Totem Shieldbearer": U("defense", "Tank", [70, 390, 14, 22, 0.75, 18, 22, 20, 12, 2],
      { name: "Shield Wall", desc: "Allies within reach gain +15 DEF for 6s.", run: (B, u) => { B.burst?.(u.x, 178, "#87CEEB", 10, "ring"); B.alliesNear(u.x, 90).forEach(a => { B.buff(a, "def", 15, 6, true); B.impact(u, a); }); } }),
    "Healing Shaman": U("defense", "Healer", [110, 135, 11, 5, 0.8, 18, 60, 26, 9, 1],
      { name: "Feather Mend", desc: "Heals every ally nearby for 2.5x ability power.", run: (B, u) => { const as = B.alliesNear(u.x, 100); B.burst?.(u.x, 174, "#7dff8a", 12, "motes"); as.forEach(a => { B.heal(a, u.s.abpwr * 2.5); B.impact(u, a); }); } }),
    "Guardian Spirit": U("defense", "Warder", [130, 175, 14, 11, 0.85, 18, 50, 26, 13, 1],
      { name: "Geometric Barrier", desc: "Wraps allies nearby in a barrier worth 3x ability power.", run: (B, u) => { B.burst?.(u.x, 176, "#87CEEB", 12, "ring"); B.alliesNear(u.x, 100).forEach(a => { B.shield(a, u.s.abpwr * 3); B.impact(u, a); }); } }),
    "Spirit Slowclaw": U("defense", "Control", [100, 185, 19, 9, 0.9, 22, 40, 22, 10, 1],
      { name: "Rend Time", desc: "Ethereal claws slow every foe nearby by 60% for 5s and deal light damage.", run: (B, u) => { const ts = B.enemiesNear(u.x, 110); if (!ts.length) return false; B.burst?.(u.x, 178, "#8cdcff", 14, "ring"); ts.forEach(t => { B.status(t, "slow", 5, 0.6); B.hit(u, t, u.s.abpwr * 0.5); B.impact(u, t); }); } }),
    "Mystic Engineer": U("defense", "Builder", [140, 155, 18, 9, 0.85, 16, 70, 26, 15, 1],
      { name: "Rune Mending", desc: "Repairs the Totem for 4x ability power and fires turret bolts at three foes.", run: (B, u) => { B.healBase(B.side(u), u.s.abpwr * 4); B.enemiesNear(u.x, 160).slice(0, 3).forEach(t => { B.beam?.(u.x, 170 + u.yOff, t.x, 172 + t.yOff, "#87CEEB", "bolt"); B.hit(u, t, u.s.abpwr * 1.5); B.impact(u, t); }); } }),
    "Warden of the Wild": U("defense", "Jailer", [100, 365, 28, 18, 0.85, 20, 30, 24, 11, 2],
      { name: "Imprison", desc: "Locks the strongest foe nearby in vine-bound bars for 4s, dealing ability power damage.", run: (B, u) => { const t = B.strongestEnemy(u, 140); if (!t) return false; B.status(t, "stun", 4); B.burst?.(t.x, 182, "#7fb069", 10, "vines"); B.hit(u, t, u.s.abpwr); B.impact(u, t); } }),
    "Illusion Weaver": U("defense", "Trickster", [115, 145, 20, 6, 0.9, 20, 60, 25, 12, 0.8],
      { name: "Mirror Host", desc: "Weaves two illusory decoys that soak blows (each with 4x ability power life).", run: (B, u) => { for (let i = 0; i < 2; i++) { const dx = u.x + (18 + i * 14) * u.dir; B.decoy(u, dx, u.s.abpwr * 2 * 2); B.burst?.(dx, 176, "#87CEEB", 8, "motes"); } B.impact(u, u); } }),
    "Guardian of the Grove": U("defense", "Healer", [120, 290, 20, 14, 0.75, 18, 50, 24, 13, 2.5],
      { name: "Healing Grove", desc: "Raises a grove that heals allies inside for ability power each second for 6s.", run: (B, u) => { B.zone(u, u.x, 80, 6, (a) => B.heal(a, u.s.abpwr), "ally"); B.burst?.(u.x, 182, "#7dff8a", 14, "motes"); B.impact(u, u); } }),
    "Ritualist": U("defense", "Blood Rite", [120, 230, 30, 9, 0.85, 18, 60, 30, 13, 2.5],
      { name: "Blood Rite", desc: "Spills 15% of its own life: allies nearby deal +40% damage for 6s.", run: (B, u) => { B.hurtSelf(u, u.hp * 0.15); B.burst?.(u.x, 176, "#ff3b3b", 12, "ring"); B.alliesNear(u.x, 120).forEach(a => { B.buff(a, "dmg", 1.4, 6); B.impact(u, a); }); } }),
    "Spirit Guardian": U("defense", "Reviver", [155, 265, 22, 12, 0.75, 18, 50, 0, 15, 1.5],
      { name: "Resurrection", desc: "Calls the most recently fallen ally back at 65% life.", unavailable: "No fallen ally to revive", run: (B, u) => { const r = B.revive(u, 0.65); if (!r) return false; B.burst?.(r.x, 176, "#98FB98", 16, "pillar"); B.impact(u, r); } }),

    // ---- OFFENSE (Bloodfang) ----------------------------------------------
    "Beast Berserker": U("offense", "Bruiser", [80, 245, 25, 8, 1.1, 34, 22, 20, 10, 1],
      { name: "Frenzy", desc: "+60% attack speed and +30% damage for 5s.", run: (B, u) => { B.buff(u, "atkspd", 1.6, 5); B.buff(u, "dmg", 1.3, 5); B.burst?.(u.x, 174, "#FF4500", 10, "sparks"); B.impact(u, u); } }),
    "Warbeast Drummer": U("offense", "Rallier", [120, 185, 12, 8, 1.0, 22, 30, 0, 13, 1],
      { name: "War Rhythm", desc: "Allies nearby attack 40% faster for 6s.", run: (B, u) => { B.burst?.(u.x, 178, "#FF4500", 14, "ring"); B.alliesNear(u.x, 140).forEach(a => { B.buff(a, "atkspd", 1.4, 6); B.impact(u, a); }); } }),
    "Frenzied Alchemist": U("offense", "Brewer", [120, 150, 15, 5, 0.9, 22, 60, 25, 13, 0.5],
      { name: "Battle Brew", desc: "Allies nearby gain +30% damage and ability power for 6s.", run: (B, u) => { B.burst?.(u.x, 174, "#ff9f1c", 12, "motes"); B.alliesNear(u.x, 120).forEach(a => { B.buff(a, "dmg", 1.3, 6); B.buff(a, "abpwr", 1.3, 6); B.impact(u, a); }); } }),
    "Shadowstalker": U("offense", "Assassin", [140, 135, 32, 5, 1.0, 40, 22, 42, 11, 0.5],
      { name: "Silent Death", desc: "Steps through shadow to the weakest foe in sight with a shadow barrier (1.5x ability power): deals 4x ability power, or executes below 25% life.", run: (B, u) => { const t = B.weakestEnemy(u, 240); if (!t) return false; const x0 = u.x; u.x = t.x - 14 * u.dir; B.shield(u, u.s.abpwr * 1.5); B.slash?.(x0, t.x, "#ff3b3b"); if (t.hp < t.s.hp * 0.25) B.hit(u, t, t.hp + 999, true); else B.hit(u, t, u.s.abpwr * 4); B.impact(u, t); } }),
    "Fire Spiritmaster": U("offense", "Caster", [160, 140, 18, 4, 0.8, 18, 90, 32, 11, 0.5],
      { name: "Pyroclasm", desc: "Erupts the ground under the nearest foe: 2.5x ability power in an area plus burning.", run: (B, u) => { const t = B.nearestEnemy(u, u.s.range + 40); if (!t) return false; B.burst?.(t.x, 184, "#ff6a1a", 18, "pillar"); B.enemiesNear(t.x, 55).forEach(e => { B.hit(u, e, u.s.abpwr * 2.5); B.status(e, "burn", 4, u.s.abpwr * 0.25); B.impact(u, e); }); } }),
    "Serpent Charmer": U("offense", "Poisoner", [100, 155, 14, 6, 0.9, 22, 70, 22, 10, 0.5],
      { name: "Serpent Venom", desc: "Poisons every foe in range for ability power per second over 5s.", run: (B, u) => { const ts = B.enemiesNear(u.x, u.s.range + 30); if (!ts.length) return false; B.burst?.(u.x + 28 * u.dir, 178, "#78ff3c", 14, "motes"); ts.forEach(t => { B.status(t, "poison", 5, u.s.abpwr); B.impact(u, t); }); } }),
    "Bloodthirsty Warlord": U("offense", "Warlord", [165, 380, 24, 14, 0.9, 24, 24, 20, 14, 1.5],
      { name: "Bloodlust", desc: "Passive: +8% damage per kill (max 10). Active: heals 25% and drinks 50% of damage dealt for 6s.", run: (B, u) => { B.heal(u, u.s.hp * 0.25); B.status(u, "lifesteal", 6, 0.5); B.burst?.(u.x, 174, "#dc141e", 12, "sparks"); B.impact(u, u); } },
      { passive: { killStack: 0.08 } }),
    "Battle Mage": U("offense", "Caster", [150, 150, 16, 5, 0.8, 20, 100, 38, 11, 0.5],
      { name: "Arcane Volley", desc: "Four arcane bolts strike random foes in range for 2.5x ability power each.", run: (B, u) => { const ts = B.enemiesNear(u.x, u.s.range + 40); if (!ts.length) return false; for (let i = 0; i < 4; i++) { const t = ts[B.rnd(ts.length)]; B.beam?.(u.x, 162 + u.yOff - i * 3, t.x, 174 + t.yOff, "#ff6a1a", "arcane"); B.hit(u, t, u.s.abpwr * 2.5); B.impact(u, t); } } }),
    "Thunderhoof Juggernaut": U("offense", "Juggernaut", [170, 500, 28, 18, 0.75, 26, 24, 25, 11, 2],
      { name: "Thunder Charge", desc: "Charges forward, knocking back and stunning foes in its path for 1.5s.", run: (B, u) => { const x0 = u.x; u.x = Math.max(34 + 18, Math.min(446 - 22, u.x + 50 * u.dir)); B.slash?.(x0, u.x, "#ff9f1c"); B.burst?.(u.x, 186, "#ff9f1c", 14, "ring"); const ts = B.enemiesNear(u.x, 50); ts.forEach(t => { B.hit(u, t, u.s.abpwr * 2); B.knock(t, 50 * u.dir); B.status(t, "stun", 1.5); B.impact(u, t); }); } }),
    "Skytalon Raider": U("offense", "Raider", [115, 195, 22, 7, 1.2, 44, 24, 26, 10, 1],
      { name: "Swoop", desc: "Flies over the front line to strike the rearmost foe for 3x ability power.", run: (B, u) => { const t = B.rearmostEnemy(u, 260); if (!t) return false; B.slash?.(u.x, t.x, "#ffd76a", true); B.hit(u, t, u.s.abpwr * 3); B.impact(u, t); } }),
  };

  // Enemies — the ruling class and its beasts.
  // [hp, dmg, def, atkspd, move, range, bounty]
  const E = (s, extra) => Object.assign({ stats: { hp: s[0], dmg: s[1], def: s[2], atkspd: s[3], move: s[4], range: s[5], abpwr: 0, rec: 0 }, bounty: s[6] }, extra || {});
  const ENEMIES = {
    collector: E([90, 8, 2, 1.0, 22, 22, 12], { lore: "Ledger in one hand, cudgel in the other." }),
    levy: E([150, 12, 8, 0.9, 20, 24, 18], { lore: "Conscripts who forgot their own villages." }),
    inquisitor: E([110, 16, 4, 0.8, 18, 90, 22], { lore: "Burns heresy from range and delays unit abilities.", ranged: true, castCd: 9, onCast: "heresy" }),
    knight: E([320, 22, 18, 0.8, 18, 26, 40], { lore: "Gilded armour paid for in drowned tithes. Rally-shields nearby troops.", castCd: 14, onCast: "aegis" }),
    hound: E([110, 14, 2, 1.4, 42, 20, 14], { lore: "Bred to run down the ones who flee." }),
    golem: E([600, 28, 26, 0.5, 12, 26, 60], { lore: "Iron poured over the bones of debtors." }),
    carrion: E([80, 12, 0, 1.2, 40, 20, 14], { lore: "They follow the collectors, and feast after." }),
    drowned: E([260, 18, 6, 0.8, 16, 50, 30], { lore: "What the river would not keep.", onHit: "slow" }),
    debt: E([160, 6, 4, 0.8, 16, 20, 15], { lore: "Every unpaid coin, congealed.", onHit: "steal" }),
    king: E([3200, 45, 30, 0.6, 10, 34, 400], { lore: "He has never once looked at the faces he taxes.", boss: true, scale: 2 }),
  };

  // Ten stages across the CSV biomes.
  const S = (name, tile, keep, keepHp, pool, pace, lore, extra) => Object.assign({ name, tile, keep, keepHp, pool, pace, lore }, extra || {});
  const STAGES = [
    S("Bloodwood Forest", "moss", "oldstone", 900, ["collector", "collector", "carrion"], 1,
      "The crimson leaves fall upward here, back toward the branches that bled them. The collectors came at dusk, and the forest drank what they left.",
      { hazard: { id: "canopy", name: "Crimson Canopy", desc: "Bleeding leaves mend all warriors for +1.5 HP/s." } }),
    S("Obsidian Wastes", "lava", "cinder", 1100, ["collector", "levy", "hound"], 1.02,
      "Glass grows where the screaming stopped. Every shard holds the last face that saw it form.",
      { hazard: { id: "lava", name: "Volcanic Fissures", desc: "Superheated ground scorches all combatants for 2 HP/s." } }),
    S("The Whispering Caves", "cobble", "oldstone", 1300, ["levy", "debt", "carrion"], 1.05,
      "The echoes repeat your name before you speak it. Some of them are still asking to be let out."),
    S("Sanguine Marshes", "mud", "moor", 1500, ["drowned", "collector", "levy", "debt"], 1.08,
      "The water is red because it remembers. Your wife's name is written somewhere beneath the reeds.",
      { hazard: { id: "marsh", name: "Clinging Mire", desc: "Deep mud slows movement across the lane by 12%." } }),
    S("Abyssal Shore", "sand", "coastal", 1700, ["drowned", "inquisitor", "hound"], 1.12,
      "Tides here pull inward, never out. The drowned stand in rows beneath the surface, still waiting to pay.",
      { midBoss: "drowned", midBossName: "The Drowned Warden", hazard: { id: "tide", name: "Inward Tide", desc: "The undertow pulls warriors +3 move speed toward the keep." } }),
    S("The Iron Fortress", "cobble", "oldstone", 2000, ["knight", "levy", "inquisitor", "golem"], 1.16,
      "Iron walls, iron gates, iron men who sleep standing. Its foundations were mixed with the ash of the first rebellion.",
      { midBoss: "golem", midBossName: "Foundry Colossus", hazard: { id: "fort", name: "Keep Ballista", desc: "The keep fires a heavy iron bolt at your front warrior every 12s." } }),
    S("Shadow Peaks", "snow", "moor", 2200, ["hound", "carrion", "knight", "inquisitor"], 1.18,
      "Snow falls black on the high passes. The hermits say the mountain is a grave the sky dug for itself.",
      { hazard: { id: "blizzard", name: "Black Blizzard", desc: "Blinding snow reduces ranged attack reach by 15%." } }),
    S("Ebon Plains", "dirt", "cinder", 2500, ["golem", "knight", "debt", "hound"], 1.20,
      "The grass bends toward the obelisk like worshippers. Those who lie down in it never stand back up the same."),
    S("Crimson Desert", "sand", "cinder", 2800, ["golem", "inquisitor", "drowned", "knight", "carrion"], 1.22,
      "The dunes are made of red sand ground from old armies. Every storm buries a war and uncovers another.",
      { hazard: { id: "sandstorm", name: "Bone-Sand Gale", desc: "Scouring winds slow all attack speeds by 10%." } }),
    S("Spirit Vale — The Collector's Throne", "moss", "moor", 3500, ["knight", "golem", "inquisitor", "levy", "drowned"], 1.24,
      "The ghosts here kneel to no one but him. Tonight they will watch a king learn what a debt is.", { boss: "king" }),
  ];

  // Runic Burns (doc: 7 tiers, % ranges per stat).
  const BURN_TIERS = [
    { name: "Initiate's Seal", color: "#9a8c7a", lore: "Inscribed with elementary runes during basic rituals." },
    { name: "Adept's Glyph", color: "#7fb069", lore: "Given to warriors proven in skirmishes and rites of passage." },
    { name: "Warrior's Sigil", color: "#4f9dde", lore: "Made in ceremony with the blood of the unit's defeated enemies." },
    { name: "Chieftain's Mark", color: "#a66cff", lore: "Carries the essence of the tribe's totem or deity." },
    { name: "Elder's Rune", color: "#ff9f1c", lore: "Crafted by elders with ingredients only they know." },
    { name: "Legendary Relic", color: "#ff3b3b", lore: "Forged with forbidden or lost arts, perhaps by the beast deity itself." },
    { name: "Cosmic Brand", color: "#f4f4ff", lore: "Said to be forged in the celestial forge. Most call it a myth." },
  ];
  const BURN_STATS = {
    hp: { label: "Health", up: [10, 12], down: [4, 6] },
    dmg: { label: "Damage", up: [12, 15], down: [4, 6] },
    def: { label: "Defense", up: [10, 12], down: [3, 5] },
    atkspd: { label: "Attack Speed", up: [8, 10], down: [3, 5] },
    move: { label: "Move Speed", up: [6, 8], down: [2, 4] },
    range: { label: "Range", up: [5, 7], down: [2, 3] },
    cost: { label: "Gold Cost", up: [10, 12], down: [4, 6], inverse: true },
    abpwr: { label: "Ability Power", up: [12, 15], down: [4, 6] },
    abspd: { label: "Ability Speed", up: [8, 10], down: [3, 5] },
    rec: { label: "Recovery", up: [10, 12], down: [3, 5] },
  };
  const TIER_UP = [1, 1.4, 1.9, 2.5, 3.2, 4, 5];
  const TIER_DOWN = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];


  // Unit lore — shown as ancient scrolls in the Warband (BC Main Menu: "Unit Lore").
  const LORE = {
    "Golden Totemist": "Every totem he carves holds a coin pressed into its mouth, payment for the spirit bound inside. The spirits have stopped asking to be released; they ask only to be spent.",
    "Baron": "He owned three villages before the crown drowned two of them for late taxes. His beard is gilded with the rings he pulled from the river.",
    "Pledge Warbeast": "It was sworn to the tribe with a bag of gold tied around its neck, and it has never let anyone take it off. It bites hardest when it hears coins.",
    "Resource Warlock": "He stores his sorrow the way misers store gold, in vaults behind his eyes. When the vaults open, nobody standing in front of him is ever counted again.",
    "Mine Spirit": "It died in a collapsed shaft clutching the nugget that would have freed its family. It still mines, eyes closed, for a debt nobody remembers.",
    "Goldweb Spider": "It spins with thread drawn from melted crowns. What it catches, it keeps alive for a long time, because fresh meat is worth more.",
    "Totem Insurer": "For a fee he swears your death will not be wasted. He has never once failed to pay out, and never once been thanked.",
    "Golden Archer": "She lost one eye to a collector's ledger-hook and paid a shaman to gild the other. It has not blinked since, not even to grieve.",
    "Golden Beffalo": "Its horns were dipped in the gold of a sacked counting-house while the clerks were still inside. It remembers the screaming as music.",
    "Trade Pact Alpha": "Every pact he signs is written in his own blood and witnessed by the dead. The crown's merchants have learned that his discounts are never free.",
    "Totem Shieldbearer": "Her face is carved into the shield because she gave her real one to hold the gate at Spuea Ford. The gate is still standing.",
    "Healing Shaman": "She stitches wounds with feathers plucked from carrion birds, so the scavengers learn to fear the living. Her patients rarely thank her; most of them weep.",
    "Guardian Spirit": "It was a mason who died walling his children inside to hide them from the levy. Now it builds walls of light, and never again lets anyone inside go cold.",
    "Spirit Slowclaw": "Time bent the moment its village drowned, and the Slowclaw was caught in the fold. Everything near it now moves at the pace of grief.",
    "Mystic Engineer": "He builds turrets from the iron shackles the collectors leave behind. Each bolt he fires is engraved with the name of someone they chained.",
    "Warden of the Wild": "The forest made him its jailer after the crown burned its oldest grove. He keeps the cages, and the forest keeps the keys.",
    "Illusion Weaver": "No one has seen his true face, including him. The collectors who hunt him always find a dozen of him smiling back.",
    "Guardian of the Grove": "Where she plants her staff, healing trees push up through the battlefield in a single breath. Their roots drink from the fallen, and give it back to the living.",
    "Ritualist": "He opens his own veins so the war-band can fight a little longer. His skull tattoo is not decoration; it marks how much of him is already gone.",
    "Spirit Guardian": "She was the first of the drowned to climb back out of the river. She has been pulling the others out ever since, one at a time.",
    "Beast Berserker": "The claw marks on his face are his own; he made them the night the tax men came. He has not stopped clawing since.",
    "Warbeast Drummer": "He beats his drum with the thighbones of collectors, and the rhythm never repeats. He lost an eye keeping time through the massacre at Mixio.",
    "Frenzied Alchemist": "His brews are mostly blood, partly fire, and only a little poison, as far as anyone knows. Those who drink them fight like gods and sleep for a week.",
    "Shadowstalker": "She walks between one candle's shadow and the next, and the crown's sentries die in the space between. The daggers on her cheeks are tallies.",
    "Fire Spiritmaster": "He bargained with the fire that took his home and won it as a servant. It still burns hottest whenever he remembers.",
    "Serpent Charmer": "Her serpent lives coiled around her eye and drinks her tears for venom. The collectors say she weeps on purpose.",
    "Bloodthirsty Warlord": "He grows stronger with every man he kills, and he has never been tired. The crown has offered him a lordship four times; four messengers came back without heads.",
    "Battle Mage": "He learned his runes from a burned library, reading the ashes before the wind took them. His staff hums with every spell he half-remembers.",
    "Thunderhoof Juggernaut": "It was bred to pull the crown's tax wagons until the day it turned around. The road to the capital still carries the hoofprints.",
    "Skytalon Raider": "She was thrown from the cliffs of Shadow Peaks for refusing to pay a toll. She did not fall.",
  };

  // Achievements — the only way to earn a Cosmic Brand (BC Runic Burns: "tied to secret game content or achievements").
  const ACHIEVEMENTS = {
    flawless: { name: "Untouched Totem", desc: "Win a stage without the Totem taking damage.", reward: 4 },
    regicide: { name: "Regicide", desc: "Slay the Collector King.", reward: 6 },
    tithe: { name: "The Great Tithe", desc: "Earn 3000 gold in a single battle.", reward: 5 },
    tribes: { name: "Beast and Crimson", desc: "Conquer the war with all three tribes.", reward: 6 },
  };

  const TIPS = [
    "Tap a unit when its rune circle glows to unleash its ability.",
    "Runic Burns always take something in return. Read the debuff.",
    "Goldclaw Mine Spirits pay for themselves if you keep them alive.",
    "Guardvaw totems outlast storms. Let the enemy break on them.",
    "Bloodfang wins quickly or not at all.",
    "Retreating keeps your Runic Burns, but forfeits the spoils.",
    "The Collector King waits in Spirit Vale. He does not hurry.",
  ];

  // The intro cut scene, on one clock (see src/intro.js). Beat `i` is shot `i` in
  // src/intro-scene.js. `text` is the subtitle, with *emphasis*. `voice` is what the
  // narrator says over it: a distilled line short enough to finish inside the beat
  // (the narrator is slow), so the subtitle never omits anything that is spoken.
  // `sfx` names a BC.sfx cue, `music` brings the menu theme in under the scene,
  // `card` shows the three-tribe title card.
  const INTRO = [
    { at: 0, dur: 4, voice: "Collectors came at the end of the harvest.", text: "The crown's *tax collectors* came at the end of the harvest." },
    { at: 4, dur: 4, voice: "They drowned the ones who could not pay.", text: "They drowned the ones who could not pay, your *expecting wife* among them." },
    { at: 8, dur: 4, sfx: "thunder", voice: "The river kept everything.", text: "You buried *nothing*. The river kept *everything*." },
    { at: 12, dur: 4.5, sfx: "drums", music: true, voice: "Now the tribes gather.", text: "Now the tribes *gather* behind you: village by village, town by town, city by city." },
    { at: 16.5, dur: 4.5, voice: "The common folk against the crown.", text: "The common folk against the crown, and the *Collector King* who wears it." },
    { at: 21, dur: 4, card: true, voice: "Three tribes. One rebellion.", text: "Three tribes. One *rebellion*." },
  ];
  // The short cut for players back after a long gap: three beats, no narration. `shot` picks the scene.
  const INTRO_RECAP = [
    { at: 0, dur: 1.8, shot: 2, sfx: "thunder", text: "The river kept *everything*." },
    { at: 1.8, dur: 1.8, shot: 3, sfx: "drums", music: true, text: "The tribes *gather* against the crown." },
    { at: 3.6, dur: 2, shot: 5, card: true, text: "Three tribes. One *rebellion*." },
  ];
  const STORY = INTRO.map(beat => beat.text);

  // Balance knobs (tuned with the headless simulation, see README).
  const TUNE = {
    startGold: 250, income: 16, incomeGrowth: 0.12, incomeCap: 34,
    unitHp: 1.4, unitDmg: 1.15,
    enemyHp: 0.09, enemyDmg: 0.06, enemyDef: 0.04,   // per-stage growth
    threat: 3.3, threatStage: 0.55, threatRamp: 85,      // enemy budget/s (+ per stage, + t/ramp)
    surgeEvery: 36, surgeSeconds: 10,                  // surge = 10s of budget at once
    baseHp: 1200,
  };

  window.BC = Object.assign(window.BC || {}, {
    TUNE, LORE, ACHIEVEMENTS, TRIBES, UNITS, ENEMIES, STAGES, BURN_TIERS, BURN_STATS, TIER_UP, TIER_DOWN, TIPS, INTRO, INTRO_RECAP, STORY,
  });
})();
