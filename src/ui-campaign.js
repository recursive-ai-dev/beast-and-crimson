/* Campaign map, stage briefings, and Crown's Ledger. */
(function () {
  "use strict";
  const BC = window.BC;
  const { $, h, S, SCREENS, show, applyTribeVars, openDialog, closeDialog } = BC.UI;

  // Locked thumbnails (BC Main Menu): Bloodfang a white skull on dark grey,
  // Guardvaw a leaf over a silver padlock, Goldclaw a treasure chest over a padlock.
  const PADLOCK = '<path d="M20 30v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#C0C0C0" stroke-width="5"/><rect x="12" y="29" width="40" height="30" rx="4" fill="#C0C0C0" stroke="#6b6b6b" stroke-width="2"/><circle cx="32" cy="42" r="4" fill="#3a3a3a"/><rect x="30.5" y="44" width="3" height="8" fill="#3a3a3a"/>';
  const LOCK_SVG = {
    offense: '<path d="M32 6C19 6 10 15 10 27c0 8 4 13 9 16v9h26v-9c5-3 9-8 9-16C54 15 45 6 32 6z" fill="#FFFFFF"/><circle cx="23" cy="28" r="6" fill="#2E2E2E"/><circle cx="41" cy="28" r="6" fill="#2E2E2E"/><path d="M32 34l-4 7h8z" fill="#2E2E2E"/><path d="M24 52v6m6-6v6m6-6v6m6-6v6" stroke="#2E2E2E" stroke-width="2.5"/>',
    defense: PADLOCK + '<path d="M44 26c-14 0-22 9-22 22 13 0 22-8 22-22z" fill="#228B22" stroke="#0b3a0b" stroke-width="2"/><path d="M24 46c6-6 11-10 18-17" stroke="#0b3a0b" stroke-width="2" fill="none"/>',
    greed: PADLOCK + '<rect x="18" y="38" width="28" height="18" rx="2" fill="#8B4513" stroke="#2a1a08" stroke-width="2"/><path d="M18 40a14 9 0 0 1 28 0z" fill="#a0561d" stroke="#2a1a08" stroke-width="2"/><rect x="18" y="39" width="28" height="4" fill="#FFD700"/><rect x="29" y="40" width="6" height="7" fill="#FFD700" stroke="#2a1a08"/>',
  };
  // Bundled biome paintings; elements without one keep their fallback look.
  const stagePath = (i) => `assets/art/stage-${String(i + 1).padStart(2, "0")}.png`;
  const stageArt = (i) => `url(${stagePath(i)})`;
  const withArt = (el, i) => { const im = new Image(); im.onload = () => el.classList.add("has-art"); im.src = stagePath(i); return el; };
  function lockIcon(tribe) {
    const d = h("div", { class: "lockicon" });
    d.innerHTML = `<svg viewBox="0 0 64 64">${LOCK_SVG[tribe]}</svg>`;
    return d;
  }

  BC.ASSETS_NAME = (id) => (window.BC_ASSETS.enemies[id] || {}).name || id;

  function brief(i) {
    const tribe = S().tribe;
    const st = BC.STAGES[i];
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const foes = [...new Set(st.pool.concat(st.midBoss ? [st.midBoss] : []).concat(st.boss ? [st.boss] : []))];
    const firstClear = i === S().progress[tribe];
    const unlockUnit = firstClear && i + 3 < 10 ? BC.tribeUnits(tribe)[i + 3] : null;
    const regicideOpen = st.boss && !S().achievements.regicide;
    const spoils = h("div", { class: "brief-spoils" },
      unlockUnit ? h("img", { class: "px", alt: "", src: BC.iconURL("units:" + unlockUnit, 0, 40) }) : null,
      h("div", {},
        h("b", {}, firstClear ? "First-Clear Spoils" : "Replay Spoils"),
        h("div", {}, firstClear
          ? (unlockUnit ? `Unlocks ${unlockUnit} (${BC.UNITS[unlockUnit].role}) · 2× Runic Burns` : "2× Runic Burns") + (regicideOpen ? " · Slay the King for a Cosmic Brand" : "")
          : "1× Runic Burn")));
    box.append(h("div", { class: "parchment" },
      withArt(h("div", { class: "brief-art", style: `--art:${stageArt(i)}` }), i),
      h("h3", {}, `${i + 1}. ${st.name}`),
      h("p", { class: "lore" }, st.lore),
      st.hazard ? h("div", { class: "hazard-tag" }, h("b", {}, `Biome Hazard — ${st.hazard.name}: `), st.hazard.desc) : null,
      h("div", { class: "foes" }, foes.map(f => h("img", { class: "px", alt: BC.ASSETS_NAME(f), src: BC.iconURL("enemies:" + f, 0, 40), "data-tip": BC.ASSETS_NAME(f) + " — " + BC.ENEMIES[f].lore }))),
      spoils,
      h("p", {}, `Objective: raze the enemy keep (${st.keepHp} HP) before they break your Totem.` + (st.midBoss ? ` Champion: ${st.midBossName}.` : "") + (st.boss ? " The Collector King will take the field." : "")),
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Back"),
        h("button", { class: "stone-btn primary", onclick: () => BC.UI.startBattle(i, false) }, "Begin"))));
    openDialog(box, () => closeDialog(box), ".btns button:last-child");
  }

  function briefEndless() {
    const tribe = S().tribe, T = BC.TRIBES[tribe];
    const best = (S().endless && S().endless[tribe]) || 0;
    const box = $("#campaign .brief");
    box.innerHTML = "";
    box.append(h("div", { class: "parchment" },
      h("h3", {}, "The Endless Levy"),
      h("p", { class: "lore" }, "The crown's bell never stops tolling. Biomes shift and enemy legions grow stronger with every wave. Razing a keep mends 25% of your Totem and advances the wave immediately."),
      h("div", { class: "brief-spoils" },
        h("div", {},
          h("b", {}, `Best Record with ${T.name}: ${best ? "Wave " + best : "None yet"}`),
          h("div", {}, "Spoils from Wave 2+: 1 Runic Burn per 2 waves survived + Crimson Ash for every wave cleared."))),
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Back"),
        h("button", { class: "stone-btn primary", onclick: () => BC.UI.startBattle(0, true) }, "Enter the Levy"))));
    openDialog(box, () => closeDialog(box), ".btns button:last-child");
  }

  function openHonours() {
    const tribe = S().tribe || "offense";
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const entries = Object.entries(BC.ACHIEVEMENTS);
    const gotCount = entries.filter(([id]) => S().achievements[id]).length;
    const list = h("div", { class: "honours-grid" });
    for (const [id, a] of entries) {
      const got = !!S().achievements[id];
      const tier = BC.BURN_TIERS[a.reward];
      list.append(h("div", { class: "honour-card" + (got ? " got" : "") },
        h("img", { class: "px", alt: "", src: BC.iconURL("artifacts:" + tribe, a.reward, 40) }),
        h("div", { class: "honour-copy" },
          h("b", {}, (got ? "✦ " : "✧ ") + a.name),
          h("div", {}, a.desc),
          h("div", { class: "honour-reward" }, `Reward: ${tier.name}${a.reward === 6 ? " (Mythic)" : ""}`)),
        h("span", { class: "honour-state" }, got ? "Earned" : "Unclaimed")));
    }
    box.append(h("div", { class: "parchment ledger-box" },
      h("h3", {}, `Honours of the Rebellion (${gotCount}/${entries.length})`),
      h("p", { class: "lore" }, "Great deeds against the crown carve the rarest Runic Burns—the only source of Cosmic Brands."),
      list,
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Close"))));
    openDialog(box, () => closeDialog(box));
  }

  function openBestiary() {
    const box = $("#campaign .brief");
    box.innerHTML = "";
    const slain = S().bestiary || {};
    const total = Object.values(slain).reduce((a, b) => a + b, 0);
    const grid = h("div", { class: "ledger-grid" });
    for (const [id, e] of Object.entries(BC.ENEMIES)) {
      const s = e.stats, traits = [];
      if (e.ranged) traits.push("Ranged");
      if (e.onHit === "slow") traits.push("Chilling Strike");
      if (e.onHit === "steal") traits.push("Pilfers Gold");
      if (e.onCast === "heresy") traits.push("Heresy Burn");
      if (e.onCast === "aegis") traits.push("Aegis Shield");
      if (e.boss) traits.push("Boss (2x Keep DMG)");
      grid.append(h("div", { class: "ledger-card", "data-tip": e.lore },
        h("img", { class: "px", alt: "", src: BC.iconURL("enemies:" + id, 0, 48) }),
        h("div", {},
          h("b", {}, BC.ASSETS_NAME(id)),
          h("div", {}, `HP ${s.hp} · DMG ${s.dmg} · DEF ${s.def} · ${e.bounty}g`),
          traits.length ? h("div", { style: "color:#8B0000;font-size:11px" }, traits.join(" · ")) : null,
          h("p", { class: "enemy-lore" }, e.lore),
          h("div", { class: "slain" }, `Slain: ${slain[id] || 0}`))));
    }
    box.append(h("div", { class: "parchment ledger-box" },
      h("h3", {}, `The Crown's Ledger (${total} Total Slain)`),
      grid,
      h("div", { class: "btns" },
        h("button", { class: "stone-btn", onclick: () => { BC.sfx.click(); closeDialog(box, false); openHonours(); } }, "Honours"),
        h("button", { class: "stone-btn", onclick: () => closeDialog(box) }, "Close"))));
    openDialog(box, () => closeDialog(box), ".btns button:last-child");
  }

  SCREENS.campaign = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const T = BC.TRIBES[tribe];
    $("#campaign .map").className = "map " + tribe;
    $("#campaign .camp-title").textContent = `${T.name} — The War of Crimson`;
    $("#campaign .back").onclick = () => show("menu", true);
    $("#campaign .warband-btn").onclick = () => BC.UI.openWarband("campaign");
    const bestWave = (S().endless && S().endless[tribe]) || 0;
    const endBtn = $("#campaign .endless-btn");
    endBtn.dataset.tip = `The Endless Levy — Survive infinite waves. Best with ${T.name}: Wave ${bestWave}`;
    endBtn.onclick = () => { BC.sfx.click(); briefEndless(); };
    const bestBtn = $("#campaign .bestiary-btn");
    bestBtn.dataset.tip = "The Crown's Ledger — Enemy stats, traits, lore & kill tallies";
    bestBtn.onclick = () => { BC.sfx.click(); openBestiary(); };
    const wbBtn = $("#campaign .warband-btn");
    const equippedIds = new Set(Object.values(S().equipped));
    const unboundCount = S().burns.filter(b => !equippedIds.has(b.id)).length;
    const needsBurn = unboundCount > 0 && BC.lineup(tribe).some(n => !S().equipped[n]);
    const hasNewUnit = S().newUnits.some(n => BC.UNITS[n]?.tribe === tribe);
    wbBtn.replaceChildren("Warband", ...(needsBurn || hasNewUnit ? [h("span", { class: "btn-pip", "aria-hidden": "true" }, needsBurn ? `${unboundCount}✦` : "New")] : []));
    wbBtn.classList.toggle("attention", needsBurn || hasNewUnit);
    wbBtn.dataset.tip = needsBurn
      ? `Warband — ${unboundCount} unbound Runic Burn${unboundCount === 1 ? "" : "s"} ready to equip`
      : hasNewUnit
        ? "Warband — new warrior unlocked! Inspect or add to your lineup"
        : "Warband — set your 5-slot lineup and bind Runic Burns";
    const wrap = $("#campaign .missions");
    wrap.innerHTML = "";
    const prog = S().progress[tribe];
    const nextStage = Math.min(prog, BC.STAGES.length - 1);
    const line = BC.lineup(tribe);
    const achTotal = Object.keys(BC.ACHIEVEMENTS).length;
    const achGot = Object.keys(BC.ACHIEVEMENTS).filter(id => S().achievements[id]).length;
    $("#campaign .campaign-overview").replaceChildren(
      h("div", { class: "campaign-copy" },
        h("span", { class: "eyebrow" }, prog === 10 ? "A kingdom reclaimed" : "The path to the crown"),
        h("h3", {}, prog === 10 ? "The crown is yours." : BC.STAGES[nextStage].name),
        h("p", {}, prog === 10 ? "Revisit conquered keeps or test your warband against the Endless Levy." : `${prog ? "Your next stand" : "Your rebellion begins"} · Chapter ${nextStage + 1} of 10`),
        h("div", { class: "campaign-progress", role: "progressbar", "aria-label": "Keeps conquered", "aria-valuenow": prog, "aria-valuemin": 0, "aria-valuemax": 10 }, h("span", { style: `width:${prog * 10}%` }))),
      h("div", { class: "campaign-metrics" },
        h("div", {}, h("b", {}, String(prog).padStart(2, "0")), h("span", {}, "Keeps razed")),
        h("div", {}, h("b", {}, BC.unlockedUnits(tribe).length + "/10"), h("span", {}, "Warriors")),
        h("div", {}, h("b", {}, bestWave || "—"), h("span", {}, "Best wave")),
        h("button", { type: "button", class: "metric-btn honours-btn", "data-tip": "Honours — view achievement goals and Cosmic Brand rewards", "aria-label": `Honours: ${achGot} of ${achTotal} earned. Inspect achievements`, onclick: () => { BC.sfx.click(); openHonours(); } }, h("b", {}, `${achGot}/${achTotal}`), h("span", {}, "Honours"))),
      h("div", { class: "campaign-ready" },
        h("div", { class: "mini-lineup", role: "group", "aria-label": `Warband: ${line.join(", ")}` }, line.map(name => h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 40), "data-tip": name }))),
        h("button", { class: "stone-btn primary continue-campaign", onclick: () => prog === 10 ? briefEndless() : brief(nextStage) }, prog === 10 ? "Enter the Endless Levy" : prog ? "Continue campaign →" : "Begin the rebellion →")));
    BC.STAGES.forEach((st, i) => {
      const locked = i > prog;
      const foes = [...new Set(st.pool)].slice(0, 3).concat(st.midBoss || st.boss ? [st.boss || st.midBoss] : []);
      const tag = st.boss ? "The Collector King" : st.midBossName || (st.hazard && st.hazard.name);
      const el = h("button", { type: "button", disabled: locked, "aria-label": `Stage ${i + 1}: ${st.name}${locked ? ". Clear the previous stage to unlock" : i < prog ? ". Conquered. Replay" : ". Next battle"}`, class: `mission ${tribe}${locked ? " locked" : ""}${i === prog && prog < 10 ? " next" : ""}`, style: `--glow:${T.colors.ink};--i:${i};--art:${stageArt(i)}` },
        h("span", { class: "num" }, i + 1),
        i < prog ? h("span", { class: "done", "data-tip": "Conquered" }, "Razed") : null,
        locked ? lockIcon(tribe) : null,
        h("div", { class: "plate" },
          h("div", { class: "name" }, locked ? "Sealed" : st.name),
          locked ? h("div", { class: "unlock-note" }, `Clear chapter ${i}`) : h("div", { class: "foes" }, foes.map(f => h("img", { class: "px", alt: "", src: BC.iconURL("enemies:" + f, 0, 32) }))),
          !locked && tag ? h("div", { class: "tag" }, tag) : null));
      if (!locked) el.onclick = () => { BC.sfx.click(); brief(i); };
      wrap.append(withArt(el, i));
    });
    $("#campaign .brief").classList.add("hidden");
  };
})();
