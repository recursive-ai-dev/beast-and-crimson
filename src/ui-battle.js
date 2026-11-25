/* Battle HUD, keyboard/touch controls, pause dialog, and post-battle results. */
(function () {
  "use strict";
  const BC = window.BC;
  const {
    $, h, S, RUNES, fmtTime, SCREENS, show, applyTribeVars, confirmBox,
    openDialog, closeDialog, hasOpenDialogs, isTransitioning,
    hideTip, unitTip, showTip, hideTipAfter, updateTip, getTipTarget,
  } = BC.UI;

  let battle = null, lastStage = 0, lastEndless = false, keyHandler = null;
  function startBattle(i, endless) {
    if (!endless && !(BC.STAGES[i] && i <= S().progress[S().tribe])) return;   // only ever an unlocked stage
    show("battle", true, { prepare: () => { lastStage = i; lastEndless = !!endless; } });
  }

  const AB_KEYS = ["Q", "W", "E", "A", "S"];
  SCREENS.battle = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    const T = BC.TRIBES[tribe];
    const st = BC.STAGES[lastStage];
    const line = BC.lineup(tribe);
    let guiding = !lastEndless && lastStage === 0 && ["deploy", "ability", "spell"].includes(S().tutorial.battle);
    if (guiding) { S().tutorial.battle = "deploy"; BC.persist(); }
    const hud = $("#battle .hud");
    const toastEl = $(".toast", hud);
    toastEl.classList.remove("show");
    toastEl.textContent = "";
    let toastT = null;
    const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 1800); };
    // A success introduces its control once: after that, a tooltip would sit on the battlefield
    // through every tap of a real-time fight. A failure explains itself for longer, then leaves too.
    const introduced = new Set();
    const command = (button, action) => {
      if (!battle || battle.paused || battle.over) return;
      const ok = action();
      if (ok && introduced.has(button)) { hideTip(); return; }
      if (ok) introduced.add(button);
      showTip({ target: button, feedback: ok ? "" : toastEl.textContent }, true);
      hideTipAfter(ok ? 1600 : 5000);
    };
    const hazard = $(".battle-hazard", hud), arrival = $(".arrival-warning", hud);
    let arrivalUntil = 0;
    arrival.textContent = "";
    arrival.classList.add("hidden");
    const announce = msg => { arrival.textContent = msg; arrivalUntil = performance.now() + 5000; };
    hazard.onclick = () => { showTip({ target: hazard }, true); hideTipAfter(6000); };
    $(".keep-name", hud).textContent = lastEndless ? "The Endless Levy — Wave 1" : st.name;
    $(".objective", hud).textContent = lastEndless ? "Survive the waves. Raze keeps to mend." : (st.boss ? "Raze the throne. The Collector King will defend it." : "Raze the enemy keep.");

    const spBtn = $(".spell-btn", hud);
    $("img", spBtn).src = BC.iconURL("bases:" + tribe, 0, 64);
    spBtn.dataset.tip = `${T.spell.name} (Key R / Tap Totem, ${T.spell.cd}s CD) — ${T.spell.desc}`;
    spBtn.setAttribute("aria-label", `${T.spell.name} — Totem spell (R)`);
    spBtn.onclick = () => command(spBtn, () => battle.castSpell(false));

    const spdBtn = $(".speed-btn", hud);
    const applySpeed = (spd) => {
      S().settings.speed = spd;
      BC.persist();
      if (battle) battle.speed = spd;
      spdBtn.textContent = spd + "x";
      spdBtn.setAttribute("aria-label", `Battle speed: ${spd}x. Press X to change.`);
      spdBtn.classList.toggle("fast", spd > 1);
    };
    applySpeed(S().settings.speed || 1);
    spdBtn.onclick = () => { if (!battle || battle.paused || battle.over) return; BC.sfx.click(); applySpeed((S().settings.speed || 1) === 1 ? 2 : 1); };

    const btnWrap = $(".unit-buttons", hud);
    btnWrap.innerHTML = "";
    // Unavailable actions stay focusable so their requirements can be inspected.
    // The battle validates every action before changing state.
    const inspectUnit = e => {
      const slot = e.target.closest(".unit-slot");
      if (!slot || e.target.closest(".ubtn, .cast-btn") || !battle || battle.paused || battle.over) return;
      showTip({ target: slot }, true);
      hideTipAfter(6000);
    };
    btnWrap.addEventListener("click", inspectUnit);
    const castBtns = [];
    const btns = line.map((name, i) => {
      const ability = BC.UNITS[name].ability;
      const b = h("button", { class: "ubtn", "aria-label": `Deploy ${name} (${i + 1})`, "data-tip": `${unitTip(name, tribe)}\nDeploy: ${i + 1} · Cast: ${AB_KEYS[i]}`,
        onclick: () => command(b, () => battle.deploy(i)) },
        h("span", { class: "key" }, i + 1),
        h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
        h("span", { class: "cost" }), h("span", { class: "cool" }), h("span", { class: "deploy-cd" }),
        // HUD doc: "a spiral of mystical runes that dissipate as the cooldown reduces"
        h("span", { class: "spiral" }, Array.from({ length: 8 }, (_, k) => {
          const a = k * 0.95, r = 4 + k * 4.6;
          return h("span", { style: `left:${50 + Math.cos(a) * r}%;top:${44 + Math.sin(a) * r}%;transform:translate(-50%,-50%) rotate(${a}rad);opacity:0` }, RUNES[(k * 5 + i * 3) % RUNES.length]);
        })));
      const cast = h("button", { class: "cast-btn", "aria-label": `Cast ${ability.name} (${AB_KEYS[i]})`, "data-tip": `${ability.name} — ${ability.desc}`,
        onclick: () => command(cast, () => battle.castBySlot(i)) },
        h("span", { class: "cast-label" }, `Cast · ${AB_KEYS[i]}`), h("span", { class: "cast-state" }, "Deploy first"));
      castBtns.push(cast);
      btnWrap.append(h("div", { class: "unit-slot", "data-tip": b.dataset.tip }, h("span", { class: "unit-caption", "aria-hidden": "true" }, name), b, cast));
      return b;
    });
    const pause = $("#battle .pause");
    pause.classList.add("hidden");
    $(".autocast", pause).checked = S().settings.autocast;
    $(".autocast", pause).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); if (battle) battle.autocast = e.target.checked; };
    const guide = $(".battle-guide", hud);
    const renderGuide = (B) => {
      const step = S().tutorial.battle;
      guiding = guiding && ["deploy", "ability", "spell"].includes(step);   // another tab may have finished it
      guide.classList.toggle("hidden", !guiding || B.paused || B.over);
      $(".autocast", pause).disabled = guiding;
      $(".tutorial-auto-note", pause).classList.toggle("hidden", !guiding);
      B.autocast = !guiding && S().settings.autocast;
      $(".cast-mode", hud).textContent = B.autocast ? "Auto-cast on" : "Manual abilities";
      btns.forEach(b => b.classList.toggle("guide-target", guiding && step === "deploy"));
      castBtns.forEach(b => b.classList.toggle("guide-target", guiding && step === "ability"));
      spBtn.classList.toggle("guide-target", guiding && step === "spell");
      if (!guiding || guide.dataset.step === step) return;
      guide.dataset.step = step;
      const copy = {
        deploy: ["1 / 4 · Send a warrior", "Tap a portrait below (1–5). Deployment costs gold; your warriors fight as they advance."],
        ability: ["2 / 4 · Cast an ability", "Use a Cast button (Q / W / E / A / S) when it says Ready. Some abilities need a foe in range."],
        spell: ["3 / 4 · Call on your Totem", `Use ${T.spell.name}: tap the Totem button (R) while your warriors are deployed.`],
      }[step];
      $(".guide-copy", guide).replaceChildren(h("strong", {}, copy[0]), h("p", {}, copy[1]));
    };
    $(".guide-skip", guide).onclick = () => { BC.skipTutorial(); guiding = false; renderGuide(battle); };
    const setPaused = (p) => {
      if (!battle || battle.over) return;
      battle.paused = p;
      BC.audio.setPaused(p);
      if (p) {
        BC.UI.syncAudioControls();
        $(".pause-summary", pause).textContent = `${battle.stage.name} · ${fmtTime(battle.t)}`;
        openDialog(pause, () => setPaused(false), ".resume");
      } else closeDialog(pause);
      renderGuide(battle); battle.onHud(battle, true);
    };
    $(".hud-right .gear", hud).onclick = () => setPaused(true);
    $(".resume", pause).onclick = () => setPaused(false);
    $(".retreat", pause).onclick = async () => {
      if (!battle || battle.over) return;
      if (!(await confirmBox(lastEndless ? "End this Endless run and claim wave rewards?" : "Retreat? The spoils of this battle will be lost."))) return;
      if (!battle || battle.over) return;
      const s = battle.stats; s.time = battle.t;
      battle.over = true;
      endBattle({ win: false, retreat: true, stats: s });
    };

    const onVisibility = () => { if (document.hidden) setPaused(true); };
    const onBlur = () => setPaused(true);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("blur", onBlur);
    let hudTick = 0;
    battle = new BC.Battle($("#battle-canvas"), {
      tribe, stage: lastStage, endless: lastEndless, lineup: line,
      autocast: !guiding && S().settings.autocast, speed: S().settings.speed || 1, toast, announce,
      onEnd: (r) => endBattle(r),
      onWave: (wave) => {
        // Recorded as it happens, so a closed tab cannot forfeit the run's best wave.
        if (wave > (S().endless[tribe] || 0)) { S().endless[tribe] = wave; BC.persist(); }
      },
      onAction: (action, B) => {
        if (guiding && BC.advanceTutorial(action)) {
          if (S().tutorial.battle === "done") { guiding = false; toast("Battle basics learned. Win to earn your first Runic Burns!"); }
          renderGuide(B);
        }
        B.onHud(B, true);
      },
      onHud: (B, force) => {
        if (!force && (hudTick++ & 1) === 1) return;
        $(".gold-val", hud).textContent = Math.floor(B.gold);
        $(".battle-time", hud).textContent = fmtTime(B.t);
        $(".hp-bar", hud).classList.toggle("critical", B.player.hp / B.player.max <= .25);
        $(".hp-bar", hud).setAttribute("aria-label", `Totem health: ${Math.max(0, Math.ceil(B.player.hp))} of ${Math.round(B.player.max)}`);
        $(".keep-bar", hud).setAttribute("aria-label", `Enemy keep: ${Math.max(0, Math.ceil(B.enemy.hp))} of ${Math.round(B.enemy.max)} health`);
        spdBtn.disabled = B.paused || B.over;
        $(".hp-liquid", hud).style.setProperty("--hp", Math.max(0, B.player.hp / B.player.max * 100) + "%");
        $(".hp-text", hud).textContent = Math.max(0, Math.ceil(B.player.hp)) + " / " + Math.round(B.player.max);
        updateTip($(".hp-bar", hud), `Totem health: ${Math.max(0, Math.ceil(B.player.hp))} / ${Math.round(B.player.max)}\nIf your Totem falls, the battle is lost.`);
        $(".keep-fill", hud).style.width = Math.max(0, B.enemy.hp / B.enemy.max * 100) + "%";
        updateTip($(".keep-bar", hud), `${B.stage.name} · ${Math.max(0, Math.ceil(B.enemy.hp))} / ${Math.round(B.enemy.max)} HP\nRaze the keep to win.`);
        updateTip($(".cast-mode", hud), B.autocast
          ? "Auto-cast — warriors and your Totem cast automatically when ready (toggle in Pause or Settings)"
          : "Manual casting — press Q/W/E/A/S or tap Cast when an ability is ready (toggle Auto-cast in Pause or Settings)");
        if (B.endless) $(".keep-name", hud).textContent = B.stage.name;
        const spK = B.player.spellCd / T.spell.cd;
        const spellReason = T.spell.unavailable?.(B);
        const spellState = B.player.spellCd > 0 ? `Ready in ${Math.ceil(B.player.spellCd)}s` : spellReason || "Ready";
        $(".cool", spBtn).style.setProperty("--cd", (spK * 100) + "%");
        spBtn.classList.toggle("cooling", B.player.spellCd > 0);
        $(".spell-state", spBtn).textContent = B.player.spellCd > 0 ? Math.ceil(B.player.spellCd) + "s" : spellReason ? "Blocked" : "Ready";
        spBtn.disabled = B.paused || B.over;
        spBtn.setAttribute("aria-disabled", String(spBtn.disabled || B.player.spellCd > 0 || !!spellReason));
        spBtn.setAttribute("aria-label", `${T.spell.name} (R). ${spellState}`);
        updateTip(spBtn, `${T.spell.name} · ${spellState}\n${T.spell.desc}\nCast: R / Tap Totem`);
        const hz = B.stage.hazard;
        hazard.classList.toggle("hidden", !hz || B.paused || B.over);
        if (hazard.classList.contains("hidden") && getTipTarget() === hazard) hideTip();
        if (hz) {
          if (hazard.textContent !== hz.name) hazard.textContent = hz.name;
          updateTip(hazard, `Biome hazard: ${hz.name}\n${hz.desc}`);
        }
        arrival.classList.toggle("hidden", !arrivalUntil || performance.now() >= arrivalUntil || B.paused || B.over);
        const warning = $(".surge-warning", hud);
        warning.classList.toggle("hidden", B.surgeT > 5 || B.paused || B.over);
        const warningText = `Enemy surge in ${Math.ceil(B.surgeT)}s`;
        if (warning.textContent !== warningText) warning.textContent = warningText;
        const alive = B.ents.filter(e => !e.dead && e.side === "player" && e.kind === "unit").length;
        const dep = $(".deployed", hud);
        if (dep.dataset.n !== String(alive)) {
          dep.dataset.n = alive; dep.innerHTML = "";
          for (let i = 0; i < Math.min(alive, 8); i++) dep.append(h("i"));
          if (alive > 8) dep.append(h("b", {}, "+" + (alive - 8)));
          updateTip(dep, `Active warriors on the lane: ${alive}`);
        }
        B.slots.forEach((s, i) => {
          const cost = B.costOf(s), cdMax = 1.5 + s.stats.cost / 45;
          const costLabel = $(".cost", btns[i]);
          if (costLabel.textContent !== String(cost)) costLabel.textContent = cost;
          const shortfall = Math.max(0, Math.ceil(cost - B.gold));
          const deployState = s.cd > 0 ? `Deploy again in ${Math.ceil(s.cd)}s` : shortfall ? `Need ${shortfall} more gold` : "Ready to deploy";
          const detail = `${unitTip(s.name, tribe, s.stats, cost)}\n${deployState}\nDeploy: ${i + 1} · Cast: ${AB_KEYS[i]}`;
          updateTip(btns[i], detail);
          updateTip(btns[i].parentElement, detail);
          const k = s.cd / cdMax;
          $(".cool", btns[i]).style.setProperty("--cd", (k * 100) + "%");
          const runes = btns[i].querySelectorAll(".spiral span");
          runes.forEach((r, j) => { r.style.opacity = Math.max(0, Math.min(1, k * runes.length - j)).toFixed(2); });
          btns[i].classList.toggle("poor", B.gold < cost);
          const deployLabel = $(".deploy-cd", btns[i]);
          deployLabel.textContent = s.cd > 0 ? Math.ceil(s.cd) + "s" : shortfall ? `Need ${shortfall}g` : "";
          deployLabel.classList.toggle("shortfall", s.cd <= 0 && shortfall > 0);
          btns[i].disabled = B.paused || B.over;
          btns[i].setAttribute("aria-disabled", String(btns[i].disabled || s.cd > 0 || shortfall > 0));
          btns[i].setAttribute("aria-label", `Deploy ${s.name} (${i + 1}), ${cost} gold. ${deployState}`);
          const state = B.abilityState(i);
          const castState = !state.deployed ? "Deploy first" : state.ready ? (state.ready > 1 ? `${state.ready} ready` : "Ready") : `Ready in ${Math.ceil(state.cooldown)}s`;
          const ability = BC.UNITS[s.name].ability;
          $(".cast-state", castBtns[i]).textContent = !state.deployed || state.ready ? castState : Math.ceil(state.cooldown) + "s";
          updateTip(castBtns[i], `${ability.name} · ${castState}\n${ability.desc}\nCast: ${AB_KEYS[i]} / Shift+${i + 1}`);
          castBtns[i].disabled = B.paused || B.over;
          castBtns[i].setAttribute("aria-disabled", String(castBtns[i].disabled || !state.ready));
          castBtns[i].setAttribute("aria-label", `Cast ${ability.name} (${AB_KEYS[i]}). ${castState}`);
          castBtns[i].classList.toggle("ready", state.ready > 0);
        });
      },
    });
    BC.currentBattle = battle;
    renderGuide(battle);
    battle.onHud(battle, true);
    keyHandler = (e) => {
      if (!battle || battle.over || isTransitioning() || hasOpenDialogs()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches("input, select, textarea, [contenteditable]")) return;
      if (e.key === " " || e.key === "Escape") {
        if (e.key === " " && e.target.closest("button")) return;
        e.preventDefault();
        if (!e.repeat) setPaused(!battle.paused);
        return;
      }
      if (battle.paused || e.repeat) return;
      // Shift changes event.key to punctuation on many keyboard layouts.
      const digit = /^Digit[1-5]$/.test(e.code) ? e.code.slice(-1) : e.key;
      if (digit >= "1" && digit <= "5") {
        if (e.shiftKey) command(castBtns[+digit - 1], () => battle.castBySlot(+digit - 1));
        else command(btns[+digit - 1], () => battle.deploy(+digit - 1));
      } else if (AB_KEYS.includes(e.key.toUpperCase())) {
        const slot = AB_KEYS.indexOf(e.key.toUpperCase());
        command(castBtns[slot], () => battle.castBySlot(slot));
      } else if (e.key === "f" || e.key === "F") {
        hideTip();
        battle.castAny();
      } else if (e.key === "r" || e.key === "R" || e.key === "0") {
        command(spBtn, () => battle.castSpell(false));
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (!e.repeat) applySpeed((S().settings.speed || 1) === 1 ? 2 : 1);
      }
    };
    addEventListener("keydown", keyHandler);
    return () => {
      clearTimeout(toastT);
      btnWrap.removeEventListener("click", inspectUnit);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("blur", onBlur);
      guide.classList.add("hidden");
      removeEventListener("keydown", keyHandler);
      if (battle) { battle.destroy(); battle = null; BC.currentBattle = null; }
    };
  };

  // -------------------------------------------------------------- result --
  let lastResult = null;
  function endBattle(r) {
    const tribe = S().tribe;
    r.endless = lastEndless;
    r.rewards = [];
    for (const [k, cnt] of Object.entries(r.stats.killedByType || {})) {
      S().bestiary[k] = (S().bestiary[k] || 0) + cnt;
    }
    if (lastEndless) {
      const waves = r.stats.waves || 1;
      S().endless[tribe] = Math.max(S().endless[tribe] || 0, waves);
      const burnCount = Math.floor((waves - 1) / 2);
      for (let i = 0; i < burnCount; i++) {
        const b = BC.makeBurn(BC.rollTier(Math.min(9, waves)));
        S().burns.push(b);
        r.rewards.push({ kind: "burn", burn: b });
      }
    } else if (r.win) {
      const firstClear = lastStage === S().progress[tribe];
      if (firstClear) {
        S().progress[tribe] = Math.min(10, lastStage + 1);
        const newUnit = lastStage + 3 < 10 ? BC.tribeUnits(tribe)[lastStage + 3] : null;
        if (newUnit) {
          if (!S().newUnits.includes(newUnit)) S().newUnits.push(newUnit);
          r.rewards.push({ kind: "unit", name: newUnit });
        }
      }
      const n = firstClear ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const b = BC.makeBurn(BC.rollTier(lastStage));
        S().burns.push(b);
        r.rewards.push({ kind: "burn", burn: b });
      }
    }
    // Achievements — the only source of Cosmic Brands.
    const st = r.stats, done = S().achievements;
    const earned = {
      flawless: r.win && st.baseDmg === 0,
      regicide: st.bossKilled,
      tithe: st.goldEarned >= 3000,
      tribes: ["offense", "defense", "greed"].every(k => S().progress[k] >= 10),
    };
    for (const [id, ok] of Object.entries(earned)) {
      if (!ok || done[id]) continue;
      done[id] = Date.now();
      const b = BC.makeBurn(BC.ACHIEVEMENTS[id].reward);
      S().burns.push(b);
      r.rewards.push({ kind: "achievement", id, burn: b });
    }
    BC.persist();
    lastResult = r;
    show("result", true, { required: true });
  }

  SCREENS.result = () => {
    const rewardSounds = [];
    const r = lastResult, s = r.stats;
    const title = $("#result .result-title");
    title.textContent = r.endless ? `The Levy Ends — Wave ${s.waves || 1}` : (r.win ? (lastStage === 9 ? "The Crown Falls" : "Victory") : r.retreat ? "Retreated" : "The Totem Breaks");
    title.className = "result-title" + (r.win || (r.endless && (s.waves || 1) >= 3) ? "" : " lose");
    $("#result .result-subtitle").textContent = `${BC.TRIBES[S().tribe].name} · ${r.endless ? "The Endless Levy" : BC.STAGES[lastStage].name}`;
    const tabs = $("#result .tablets");
    tabs.innerHTML = "";
    const statList = [["Foes slain", s.kills], ["Gold earned", Math.round(s.goldEarned)], ["Warriors sent", s.deployed], ["Fallen", s.lost], ["Abilities", s.abilities], ["Time", fmtTime(s.time || 0)]];
    if (r.endless) statList.unshift(["Waves Reached", s.waves || 1]);
    statList.forEach(([k, v]) => tabs.append(h("div", { class: "stab" }, h("b", {}, v), h("span", {}, k))));
    const rw = $("#result .rewards");
    rw.innerHTML = "";
    const unitRewards = [];
    const nudge = $("#result .warband-nudge");
    const syncLineup = () => {
      const tribe = S().tribe, line = BC.lineup(tribe);
      const canFill = line.length < 5 && BC.unlockedUnits(tribe).some(n => !line.includes(n));
      const earnedBurn = r.rewards.some(x => x.burn);
      nudge.replaceChildren(h("span", {}, `Lineup ${line.length}/5. ` + (S().tutorial.burn === "equip" && S().burns.length ? "Visit the Warband to equip your first Runic Burn." : earnedBurn ? "New Runic Burn earned — equip it in the Warband to power up your warriors." : "Prepare your warriors before the next battle.")));
      if (canFill) nudge.append(h("button", { class: "stone-btn fill-lineup", onclick: () => { BC.fillLineup(tribe); syncLineup(); } }, "Fill empty slots"));
      for (const { name, button } of unitRewards) {
        const added = line.includes(name);
        button.disabled = added;
        button.textContent = added ? "In your lineup" : line.length < 5 ? "Add to lineup" : "Manage lineup";
      }
    };
    if (r.win || (r.endless && r.rewards.length)) {
      const chest = h("div", { class: "chest-big" }, h("div", { class: "lid" }));
      rw.append(chest);
      // coins and loot spill out of the bursting chest
      for (let i = 0; i < 26; i++) {
        const loot = i % 9 === 4 && r.rewards.some(x => x.burn);
        const burn = loot && r.rewards.find(x => x.burn).burn;
        const c = h("div", { class: "coinfx" + (loot ? " loot" : ""), style: `--dx:${(Math.random() * 2 - 1) * 160}px;--dy:${20 + Math.random() * 50}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${0.4 + Math.random() * 0.5}s` },
          loot ? h("img", { src: BC.iconURL("artifacts:" + S().tribe, burn.tier, 32) }) : null);
        chest.append(c);
      }
      rewardSounds.push(setTimeout(() => BC.sfx.coin(), 500), setTimeout(() => BC.sfx.coin(), 700), setTimeout(() => BC.sfx.chime(), 900));
      const line = h("div", { class: "reward-line" });
      r.rewards.forEach((x, i) => {
        if (x.kind === "unit") {
          const button = h("button", { class: "stone-btn reward-add", onclick: () => {
            if (BC.lineup(S().tribe).length >= 5) return BC.UI.openWarband("result", x.name);
            if (BC.addToLineup(S().tribe, x.name)) { BC.sfx.chime(); syncLineup(); }
          } });
          unitRewards.push({ name: x.name, button });
          line.append(h("div", { class: "reward-card new-warrior", style: `border-color:var(--gold);animation-delay:${0.3 + i * 0.25}s` },
            h("img", { class: "px", src: BC.iconURL("units:" + x.name, 0, 64) }), h("b", {}, "New warrior: " + x.name), button));
        }
        else if (x.kind === "achievement") { const a = BC.ACHIEVEMENTS[x.id], t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("div", { style: "color:#ffd700" }, "✦ " + a.name), h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down), h("button", { class: "stone-btn reward-add", onclick: () => BC.UI.openWarband("result", null, x.burn.id) }, "Equip in Warband"))); }
        else { const t = BC.BURN_TIERS[x.burn.tier], tx = BC.burnText(x.burn); line.append(h("div", { class: "reward-card", style: `border-color:${t.color};animation-delay:${0.3 + i * 0.25}s` }, h("img", { class: "px", src: BC.iconURL("artifacts:" + S().tribe, x.burn.tier, 32) }), h("b", { style: `color:${t.color}` }, t.name), h("div", { style: "color:#7dff8a" }, tx.up), h("div", { style: "color:#ff7d7d" }, tx.down), h("button", { class: "stone-btn reward-add", onclick: () => BC.UI.openWarband("result", null, x.burn.id) }, "Equip in Warband"))); }
      });
      rw.append(line);
      if (!r.endless && lastStage === 9) rw.append(h("p", { class: "parchment", style: "max-width:520px" }, "The Collector King drowns in his own gold, and the river finally gives back its dead. Your wife's name is spoken in every village you freed. It does not bring her home."));
    } else {
      rw.append(h("p", { style: "font-style:italic;color:#c8b89a" }, r.retreat ? "You live to bleed another day." : "The collectors will count your dead by morning."));
      const ach = r.rewards.filter(x => x.kind === "achievement");
      if (ach.length) rw.append(h("div", { class: "reward-line" }, ach.map(x => { const t = BC.BURN_TIERS[x.burn.tier]; return h("div", { class: "reward-card", style: `border-color:${t.color}` }, h("div", { style: "color:#ffd700" }, "✦ " + BC.ACHIEVEMENTS[x.id].name), h("b", { style: `color:${t.color}` }, t.name)); })));
    }
    $("#result .retry").onclick = () => startBattle(lastStage, lastEndless);
    $("#result .to-menu").onclick = () => show("menu", true);
    const mw = $("#result .manage-warband");
    const firstBurn = r.rewards.find(x => x.burn)?.burn;
    mw.onclick = () => BC.UI.openWarband("result", (r.rewards.find(x => x.kind === "unit") || {}).name, firstBurn?.id || null);
    mw.classList.toggle("attention", !!firstBurn || r.rewards.some(x => x.kind === "unit"));
    syncLineup();
    const next = $("#result .next");
    const canNext = r.win && !r.endless && lastStage < 9;
    next.disabled = false;
    next.classList.add("primary");
    next.textContent = canNext ? "Next stage →" : "Campaign map →";
    next.onclick = () => canNext ? startBattle(lastStage + 1, false) : show("campaign", true);
    return () => rewardSounds.forEach(clearTimeout);
  };

  BC.UI.startBattle = startBattle;
})();
