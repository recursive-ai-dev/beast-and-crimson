/* Warband screen: lineup management, warrior inspection, and Runic Burn forging/equipping. */
(function () {
  "use strict";
  const BC = window.BC;
  const { $, h, S, SCREENS, show, applyTribeVars, confirmBox, unitTip, showTip } = BC.UI;

  let wbSel = null, warbandReturn = "campaign", warbandFocusBurn = null;
  function openWarband(from, focus, focusBurnId = null) {
    show("warband", true, { prepare: () => {
      warbandReturn = from;
      warbandFocusBurn = focusBurnId;
      if (focusBurnId) S().settings.burnFilter = "all";
      if (focus) wbSel = focus;
      else if (focusBurnId) {
        const bare = BC.lineup(S().tribe).find(n => !S().equipped[n]);
        if (bare) wbSel = bare;
      }
    } });
  }

  SCREENS.warband = () => {
    const tribe = S().tribe;
    applyTribeVars(tribe);
    $("#warband .back").textContent = warbandReturn === "result" ? "← Results" : "← Campaign";
    $("#warband .back").onclick = () => show(warbandReturn, true);
    $("#warband .wb-info").scrollTop = 0;
    // Two display scenes per tribe (BC Main Menu: Unit Customization Menu).
    const disp = $("#warband .wb-display");
    const setScene = () => { disp.className = `wb-display ${tribe} s${S().settings.scene || 0}`; };
    setScene();
    $("#warband .scene-btn").onclick = () => { S().settings.scene = 1 - (S().settings.scene || 0); BC.persist(); BC.sfx.click(); setScene(); };
    const all = BC.tribeUnits(tribe);
    const unlocked = BC.unlockedUnits(tribe);
    const mercs = BC.mercenaryUnits(tribe);
    if (!wbSel || (!unlocked.includes(wbSel) && !mercs.includes(wbSel))) wbSel = unlocked[0];

    const cv = $("#warband .wb-display canvas"), g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    let raf, t0 = performance.now();
    const anim = (now) => {
      const t = BC.reducedMotion ? 0 : (now - t0) / 1000;
      g.clearRect(0, 0, 96, 96);
      const propKey = (S().settings.scene || 0) === 0 ? "props:campfire" : "props:lantern";
      BC.drawFrame(g, propKey, Math.floor(t * 6) % 4, 2, 58, 1);
      BC.drawFrame(g, propKey, Math.floor(t * 6 + 2) % 4, 62, 58, 1);
      const cyc = t % 4;
      const f = cyc < 3 ? Math.floor(t * 4) % 4 : 4 + Math.min(4, Math.floor((cyc - 3) * 6));
      BC.drawFrame(g, "units:" + wbSel, f, 0, 0, 3);
      raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);

    const render = () => {
      const focused = document.activeElement;
      const focusName = focused?.dataset.name;
      const focusClass = focused?.matches(".lineup-action, .fill-lineup, .guide-skip") ? ".lineup-action" : focused?.matches(".burn-tools select, .burn-tools button") ? ".burn-tools select" : null;
      const focusBurn = focused?.closest(".burn")?.dataset.burn;
      const focusButton = focusBurn ? [...focused.closest(".burn").querySelectorAll("button")].indexOf(focused) : -1;
      const scrollTop = $("#warband .wb-info").scrollTop;
      const line = BC.lineup(tribe);
      const curMerc = line.find(n => mercs.includes(n));
      $("#warband .lineup-count").textContent = `${line.length}/5 ready · ${curMerc ? "Pact sworn" : "1 mercenary slot"}`;
      const list = $("#warband .wb-list");
      list.innerHTML = "";
      const selectUnit = (name, source) => {
        wbSel = name;
        S().newUnits = S().newUnits.filter(n => n !== name);
        BC.persist(); BC.sfx.click(); render();
        $("#warband .wb-info").scrollTop = 0;
        // Rendering replaces the cards. Anchor the selection tip to the new card.
        const selector = source.classList.contains("lineup-member") ? ".lineup-member" : ".wb-unit";
        const selected = [...$("#warband").querySelectorAll(selector)].find(el => el.dataset.name === name);
        showTip({ target: selected }, true);
      };
      $("#warband .lineup-strip").replaceChildren(
        h("div", { class: "lineup-label" }, h("span", { class: "eyebrow" }, "Battle lineup"), h("span", {}, "Choose a slot to inspect")),
        ...Array.from({ length: 5 }, (_, i) => {
          const name = line[i];
          const burn = name && S().burns.find(b => b.id === S().equipped[name]);
          return name ? h("button", { class: "lineup-member" + (name === wbSel ? " selected" : ""), "data-name": name, "data-tip": unitTip(name, tribe), "aria-label": `Slot ${i + 1}: ${name}. Inspect warrior`, onclick: e => selectUnit(name, e.currentTarget) },
            h("span", { class: "slot-number" }, i + 1),
            burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : h("span", { class: "burn-dot empty", title: "No Runic Burn equipped" }),
            h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 40) }), h("span", {}, name))
            : h("div", { class: "lineup-member empty" }, h("span", { class: "slot-number" }, i + 1), h("span", {}, "Open slot"));
        }));
      all.forEach((name, i) => {
        const ok = unlocked.includes(name);
        const burn = S().burns.find(b => b.id === S().equipped[name]);
        const el = h("button", { class: `wb-unit ${name === wbSel ? "sel" : ""} ${line.includes(name) ? "in-line" : ""} ${ok ? "" : "locked"}`, disabled: !ok, "aria-pressed": String(name === wbSel), "data-name": name, "data-tip": ok ? unitTip(name, tribe) : `Unlocks after stage ${i - 2}` },
          h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
          S().newUnits.includes(name) ? h("span", { class: "new-badge" }, "New") : null,
          burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : null,
          ok ? name : "???");
        if (ok) el.onclick = e => selectUnit(name, e.currentTarget);
        list.append(el);
      });
      if (mercs.length) {
        list.append(h("div", { class: "wb-sec", "data-tip": "Up to 1 warrior from another tribe may join your warband" }, "Mercenary Pact (Max 1)"));
        mercs.forEach((name) => {
          const burn = S().burns.find(b => b.id === S().equipped[name]);
          const el = h("button", { class: `wb-unit merc ${name === wbSel ? "sel" : ""} ${line.includes(name) ? "in-line" : ""}`, "aria-pressed": String(name === wbSel), "data-name": name, "data-tip": unitTip(name, tribe) },
            h("img", { class: "px", alt: "", src: BC.iconURL("units:" + name, 0, 64) }),
            S().newUnits.includes(name) ? h("span", { class: "new-badge" }, "New") : null,
            burn ? h("span", { class: "burn-dot", style: `background:${BC.BURN_TIERS[burn.tier].color};color:${BC.BURN_TIERS[burn.tier].color}` }) : null,
            name);
          el.onclick = e => selectUnit(name, e.currentTarget);
          list.append(el);
        });
      }

      $("#warband .wb-name").textContent = wbSel;
      const U = BC.UNITS[wbSel];
      const isMerc = U.tribe !== tribe;
      const base = BC.unitStats(wbSel, tribe, true), cur = BC.unitStats(wbSel, tribe);
      const info = $("#warband .wb-info");
      info.innerHTML = "";
      const canFill = line.length < 5 && unlocked.some(n => !line.includes(n));
      const lineupHelp = canFill ? h("div", { class: "lineup-help" },
        h("p", {}, `${5 - line.length} empty lineup slot${line.length === 4 ? "" : "s"}. Fill them with unlocked ${BC.TRIBES[tribe].name} warriors.`),
        h("button", { class: "stone-btn fill-lineup", onclick: () => { BC.fillLineup(tribe); render(); } }, "Fill empty slots")) : null;
      const burnHelp = S().tutorial.burn === "equip" && S().burns.length ? h("aside", { class: "warband-guide", "aria-label": "Runic Burn tutorial" },
        h("strong", {}, "4 / 4 · Bind a Runic Burn"),
        h("p", {}, "Select a warrior, read a burn's buff and debuff below, then choose Equip. Each warrior holds one burn."),
        h("button", { class: "guide-skip", onclick: () => { S().tutorial.burn = "skipped"; BC.persist(); render(); } }, "Skip this tip")) : null;
      const STAT_TIPS = {
        hp: "Maximum health before this warrior falls",
        dmg: "Base damage dealt per attack",
        def: "Reduces incoming damage from each hit",
        atkspd: "Attacks landed per second",
        move: "Marching speed along the lane",
        range: "Attack reach in pixels (melee vs ranged)",
        abpwr: "Scales the strength of this warrior's ability",
        abspd: "Seconds between ability casts (lower is faster)",
        rec: "Health regenerated each second",
        cost: "Gold required to deploy this warrior (lower is cheaper)",
      };
      const statRow = (k, label, fmt, cmpBase, cmpTarget) => {
        const a = cmpBase[k], b = cmpTarget[k];
        const inv = k === "cost" || k === "abspd";
        const better = inv ? b < a - 1e-6 : b > a + 1e-6;
        const worse = inv ? b > a + 1e-6 : b < a - 1e-6;
        const txt = previewing && Math.abs(b - a) > 1e-6 ? `${fmt(a)} → ${fmt(b)}` : fmt(b);
        return h("div", { "data-tip": STAT_TIPS[k] }, h("span", {}, label), h("span", { class: better ? "up" : worse ? "down" : "" }, txt));
      };
      const n0 = (v) => String(Math.round(v)), n1 = (v) => v.toFixed(2);
      const statsEl = h("div", { class: "stats" });
      let previewing = false;
      const renderStats = (previewBurn) => {
        previewing = !!previewBurn;
        const cmpBase = previewBurn ? cur : base;
        const cmpTarget = previewBurn ? BC.unitStats(wbSel, tribe, previewBurn) : cur;
        statsEl.replaceChildren(
          statRow("hp", "Health", n0, cmpBase, cmpTarget), statRow("dmg", "Damage", n0, cmpBase, cmpTarget),
          statRow("def", "Defense", n0, cmpBase, cmpTarget), statRow("atkspd", "Attacks / sec", n1, cmpBase, cmpTarget),
          statRow("move", "Move speed", n0, cmpBase, cmpTarget), statRow("range", "Range", n0, cmpBase, cmpTarget),
          statRow("abpwr", "Ability power", n0, cmpBase, cmpTarget), statRow("abspd", "Cooldown", (v) => v.toFixed(1) + "s", cmpBase, cmpTarget),
          statRow("rec", "Recovery / sec", n1, cmpBase, cmpTarget), statRow("cost", "Gold cost", n0, cmpBase, cmpTarget));
      };
      renderStats(null);
      info.append(
        h("div", { class: "unit-identity" }, h("span", { class: "eyebrow" }, `${BC.TRIBES[U.tribe].name} · ${U.role}${isMerc ? " · Mercenary" : ""}`), h("h3", {}, wbSel)),
        statsEl,
        h("div", { class: "ability-box" }, h("b", {}, U.ability.name), h("div", {}, U.ability.desc)),
        h("div", { class: "scroll" }, BC.LORE[wbSel]));
      const inLine = line.includes(wbSel);
      const canAdd = inLine || (isMerc && curMerc ? true : line.length < 5);
      info.append(h("div", { class: "wb-actions" },
        h("button", {
          class: "stone-btn lineup-action", disabled: !canAdd || (inLine && line.length === 1), onclick: () => {
            const l = BC.lineup(tribe);
            if (l.includes(wbSel)) { if (l.length > 1) l.splice(l.indexOf(wbSel), 1); }
            else if (isMerc && curMerc) { l.splice(l.indexOf(curMerc), 1, wbSel); }
            else BC.addToLineup(tribe, wbSel);
            S().newUnits = S().newUnits.filter(n => n !== wbSel);
            BC.persist(); render();
          },
        }, inLine ? "Remove from lineup" : (isMerc && curMerc ? `Swap Merc (${curMerc})` : "Add to lineup"))));
      if (!canAdd) info.append(h("p", { class: "lineup-help" }, "Your lineup is full. Remove a warrior to make room for this one."));
      if (inLine && line.length === 1) info.append(h("p", { class: "inventory-note" }, "Keep at least one warrior in your lineup."));
      if (lineupHelp) info.append(lineupHelp);
      if (burnHelp) info.append(burnHelp);

      const owner = (id) => Object.keys(S().equipped).find(k => S().equipped[k] === id);
      const burnFilter = S().settings.burnFilter || "all";
      const burnSort = S().settings.burnSort || "tier";
      const forgeTiers = [0, 1, 2, 3, 4].filter(t => BC.fuseCandidates(t).length === 3);

      info.append(
        h("div", { class: "burn-head" },
          h("h4", {}, "Runic Burns"),
          h("span", { class: "ash-badge", "data-tip": "Crimson Ash — Salvage unwanted burns to reroll stats on others" }, `✦ Crimson Ash: ${S().ash || 0}`)),
        h("div", { class: "burn-tools" },
          h("select", {
            "aria-label": "Filter Runic Burns",
            onchange: (e) => { S().settings.burnFilter = e.target.value; BC.persist(); render(); },
          },
            h("option", { value: "all", selected: burnFilter === "all" }, "All Burns"),
            h("option", { value: "unbound", selected: burnFilter === "unbound" }, "Unbound Only"),
            ...Object.entries(BC.BURN_STATS).map(([k, v]) => h("option", { value: k, selected: burnFilter === k }, `+${v.label}`))),
          h("select", {
            "aria-label": "Sort Runic Burns",
            onchange: (e) => { S().settings.burnSort = e.target.value; BC.persist(); render(); },
          },
            h("option", { value: "tier", selected: burnSort === "tier" }, "Sort: Tier"),
            h("option", { value: "quality", selected: burnSort === "quality" }, "Sort: Best Roll"),
            h("option", { value: "buff", selected: burnSort === "buff" }, "Sort: Stat")),
          ...forgeTiers.map(t => h("button", {
            "data-tip": `Combine the 3 weakest unbound ${BC.BURN_TIERS[t].name}s into 1 ${BC.BURN_TIERS[t + 1].name}. Equipped burns are protected.`,
            onclick: async () => {
              const cands = BC.fuseCandidates(t);
              const names = cands.map(c => { const tx = BC.burnText(c); return `${BC.BURN_TIERS[t].name} (${tx.up}, ${tx.down})`; }).join("; ");
              if (!(await confirmBox(`Forge 3 unbound ${BC.BURN_TIERS[t].name}s into one ${BC.BURN_TIERS[t + 1].name}? Consumes: ${names}.`))) return;
              const forged = BC.fuseBurns(t);
              if (forged) { BC.sfx.chime(); render(); }
            },
          }, `Forge 3× ${BC.BURN_TIERS[t].name.split(" ")[0]} → ${BC.BURN_TIERS[t + 1].name.split(" ")[0]}`))));

      if (!S().burns.length) info.append(h("p", {}, "No Runic Burns yet. Victories carve them."));
      else if (!S().equipped[wbSel] && S().burns.some(b => !owner(b.id))) {
        info.append(h("p", { class: "inventory-note" }, `${wbSel} has no Runic Burn equipped — click Equip on any burn below.`));
      }
      const filtered = S().burns.filter(b => {
        if (burnFilter === "unbound") return !owner(b.id);
        if (burnFilter !== "all") return b.buff === burnFilter;
        return true;
      }).sort((a, b) => {
        if (burnSort === "quality") return (b.tier - a.tier) || ((b.up - b.down) - (a.up - a.down));
        if (burnSort === "buff") return a.buff.localeCompare(b.buff) || (b.tier - a.tier);
        return b.tier - a.tier;
      });
      if (S().burns.length && !filtered.length) info.append(h("p", { class: "inventory-note" }, "No burns match this filter. Choose All Burns to see your collection."));

      filtered.forEach(b => {
        const tier = BC.BURN_TIERS[b.tier], txt = BC.burnText(b), own = owner(b.id);
        const wasted = BC.burnWastedStats(wbSel, b);
        const rerollCost = (b.tier + 1) * 3;
        const salvageGain = (b.tier + 1) * 2;
        const salvagePrompt = own
          ? `Equipped on ${own}! Salvage ${tier.name} into +${salvageGain} Crimson Ash?`
          : `Salvage ${tier.name} into +${salvageGain} Crimson Ash?`;
        const el = h("div", { class: "burn" + (own === wbSel ? " equipped" : "") + (warbandFocusBurn === b.id ? " focus-burn" : ""), "data-burn": b.id, "data-tip": tier.lore },
          h("div", { class: "glyph", style: `--tier:${tier.color}` }, h("img", { src: BC.iconURL("artifacts:" + tribe, b.tier, 32), alt: "" })),
          h("div", {},
            h("div", { class: "t", style: `color:${tier.color}` }, tier.name),
            h("div", { class: "u" }, txt.up),
            h("div", { class: "d" }, txt.down),
            wasted.length ? h("div", { class: "burn-wasted" }, `⚠ Unused by ${wbSel}: ${wasted.join(", ")}`) : null),
          h("div", { class: "owner" }, own ? (own === wbSel ? "Equipped" : "on " + own) : "Unbound"),
          h("div", { class: "burn-btns" },
            h("button", { class: "burn-act burn-equip" }, own === wbSel ? "Unequip" : "Equip"),
            h("button", {
              class: "burn-act", disabled: (S().ash || 0) < rerollCost, "aria-label": `Reroll ${tier.name} for ${rerollCost} Crimson Ash`,
              "data-tip": `Reroll stats (${rerollCost} Crimson Ash)`,
              onclick: (e) => { e.stopPropagation(); if (BC.rerollBurn(b.id)) { BC.sfx.chime(); render(); } },
            }, `↻${rerollCost}`),
            h("button", {
              class: "burn-act", "aria-label": `Salvage ${tier.name} for ${salvageGain} Crimson Ash`,
              "data-tip": `Salvage into +${salvageGain} Crimson Ash`,
              onclick: async (e) => {
                e.stopPropagation();
                if (!(await confirmBox(salvagePrompt))) return;
                BC.salvageBurn(b.id); BC.sfx.click(); render();
              },
            }, `+${salvageGain}✦`)));
        el.onpointerenter = () => { if (own !== wbSel) renderStats(b); };
        el.onpointerleave = () => renderStats(null);
        el.onfocusin = () => { if (own !== wbSel) renderStats(b); };
        el.onfocusout = () => renderStats(null);
        const equip = async () => {
          if (own === wbSel) { delete S().equipped[wbSel]; }
          else {
            if (own && !(await confirmBox(`Move this burn from ${own} to ${wbSel}?`))) return;
            if (own) delete S().equipped[own];
            S().equipped[wbSel] = b.id;
            BC.advanceTutorial("equip");
          }
          BC.sfx.chime(); BC.persist(); render();
        };
        el.onclick = equip;
        $(".burn-equip", el).onclick = (e) => { e.stopPropagation(); equip(); };
        el.oncontextmenu = async (e) => {
          e.preventDefault();
          if (!(await confirmBox(salvagePrompt))) return;
          BC.salvageBurn(b.id); BC.sfx.click(); render();
        };
        info.append(el);
      });
      if (S().burns.length) info.append(h("p", { class: "inventory-note" }, "Equip one burn per warrior. Forge three unbound burns of the same tier. Equipped burns are protected from forging."));
      info.scrollTop = scrollTop;
      if (warbandFocusBurn) {
        const targetBurn = info.querySelector(`[data-burn="${warbandFocusBurn}"]`);
        warbandFocusBurn = null;
        if (targetBurn) requestAnimationFrame(() => targetBurn.scrollIntoView({ block: "center", behavior: "smooth" }));
      }
      if (focusName) [...$("#warband").querySelectorAll("button[data-name]")].find(el => el.dataset.name === focusName && el.classList.contains(focused.classList.contains("lineup-member") ? "lineup-member" : "wb-unit"))?.focus({ preventScroll: true });
      else if (focusClass) $(focusClass, info)?.focus({ preventScroll: true });
      else if (focusButton >= 0) {
        const buttons = [...info.querySelectorAll(".burn")].find(el => el.dataset.burn === focusBurn)?.querySelectorAll("button");
        (buttons?.[focusButton] && !buttons[focusButton].disabled ? buttons[focusButton] : buttons?.[0] || $(".burn-tools select", info)).focus({ preventScroll: true });
      }
    };
    render();
    return () => cancelAnimationFrame(raf);
  };

  BC.UI.openWarband = openWarband;
})();
