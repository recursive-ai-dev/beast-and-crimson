/* Shared UI utilities, dialog focus trap, screen router, and tooltips. */
(function () {
  "use strict";
  const BC = window.BC;
  const $ = (s, root) => (root || document).querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };
  const S = () => BC.save;
  const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
  const fmtTime = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

  const ICON_COLOR = { greed: "#FFD700", defense: "#4682B4", offense: "#FF4500" };
  const TRIBE_ROLE = { offense: "Offense · Overwhelm", defense: "Defense · Endure", greed: "Greed · Outgrow" };
  const INSCRIPTION = { offense: "ᛗ ᛁ ᛉ ᛁ ᛟ ✶ ᚠ ᛁ ᚱ ᛖ", defense: "♣ ≈ ❦ ≈ ♣ ≈ ❦", greed: "◆ ● ᛈ ᚨ ᛊ ● ◆" };

  const systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const syncMotion = () => {
    BC.reducedMotion = S().settings.motion === "reduced" || (S().settings.motion === "system" && systemMotion.matches);
    document.documentElement.classList.toggle("reduce-motion", BC.reducedMotion);
  };
  systemMotion.addEventListener("change", syncMotion);
  syncMotion();

  const syncSaveStatus = () => {
    const notices = {
      newer: "Save from a newer version · this session will not be kept",
      restored: "Save was damaged · restored from your last launch",
      recovered: "Unreadable save · a fresh journey awaits",
    };
    const unavailable = BC.saveStatus === "unavailable";
    const text = unavailable ? "Saving unavailable · progress lasts this session" : notices[BC.saveNotice] || "Progress saved on this device";
    document.querySelectorAll(".save-status").forEach(el => { el.textContent = text; el.classList.toggle("save-warning", unavailable || !!BC.saveNotice); });
  };
  addEventListener("bc-save", syncSaveStatus);

  // Keep keyboard focus inside the topmost dialog, then return to its opener.
  const dialogs = [];
  function syncDialogs() {
    const top = dialogs.at(-1)?.el;
    document.querySelectorAll(".screen").forEach(screen => {
      screen.inert = !screen.classList.contains("active") || !!(top && !screen.contains(top));
      [...screen.children].forEach(child => { child.inert = !!(top && screen.contains(top) && !child.contains(top)); });
    });
    dialogs.forEach(({ el }) => { el.inert = el !== top; });
    hideTip();
  }
  function openDialog(el, dismiss, focus = "button:not(:disabled), input, select, summary") {
    if (dialogs.some(d => d.el === el)) return;
    dialogs.push({ el, dismiss, opener: document.activeElement });
    el.classList.remove("hidden");
    el.scrollTop = 0;
    el.querySelectorAll(".tablet, .parchment").forEach(panel => { panel.scrollTop = 0; });
    syncDialogs();
    ($(focus, el) || el).focus({ preventScroll: true });
  }
  function closeDialog(el, restore = true) {
    const index = dialogs.findIndex(d => d.el === el);
    const entry = dialogs[index];
    if (index >= 0) dialogs.splice(index, 1);
    el.classList.add("hidden"); el.inert = false;
    syncDialogs();
    if (restore && entry?.opener?.isConnected && !entry.opener.closest("[inert]")) entry.opener.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", e => {
    const top = dialogs.at(-1);
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) top.dismiss(); }
    if (e.key === "Tab") {
      const focusable = [...top.el.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex='0']")].filter(el => el.getClientRects().length && !el.closest("[inert]"));
      const index = focusable.indexOf(document.activeElement);
      if (!focusable.length) { e.preventDefault(); top.el.focus(); }
      else if (index < 0 || (!e.shiftKey && index === focusable.length - 1) || (e.shiftKey && index === 0)) {
        e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0].focus();
      }
    }
  }, true);
  document.addEventListener("click", e => {
    const top = dialogs.at(-1);
    if (top && e.target === top.el && top.el.id !== "confirm" && !top.el.classList.contains("pause")) top.dismiss();
  });

  // ------------------------------------------------------------ screens --
  const SCREENS = {};
  const state = { menuReveal: false, introRecap: false };
  let screenCleanup = null;
  let transitioning = false;
  let queuedNav = null;
  /**
   * Go to a screen. While the curtain moves, repeated player input is ignored, but a `required`
   * request (the end of the story, battle results) waits its turn: dropping it would strand the
   * player. `prepare` runs only if the request goes ahead, just before the new screen is built.
   */
  function show(id, transition, { prepare, required = false } = {}) {
    if (transitioning) {
      if (required) queuedNav = { id, transition, prepare };
      return;
    }
    const swap = () => {
      prepare?.();
      while (dialogs.length) closeDialog(dialogs.at(-1).el, false);
      if (screenCleanup) { screenCleanup(); screenCleanup = null; }
      document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
      document.body.dataset.screen = id;
      BC.audio.setScene(id);
      const init = SCREENS[id];
      if (init) screenCleanup = init() || null;
      syncDialogs(); syncSaveStatus();
      const screen = $("#" + id);
      screen.tabIndex = -1;
      screen.scrollTop = 0; screen.scrollLeft = 0;
      screen.focus({ preventScroll: true });
    };
    if (!transition || BC.reducedMotion) return swap();
    transitioning = true;
    const c = $("#curtain");
    BC.sfx.drums();
    c.className = "sweep-in";
    setTimeout(() => {
      swap();
      c.className = "sweep-out";
      setTimeout(() => {
        c.className = ""; transitioning = false;
        const next = queuedNav;
        queuedNav = null;
        if (next) show(next.id, next.transition, { prepare: next.prepare });
      }, 480);
    }, 470);
  }

  // Another tab saved. The data is already current; bring what is on show up to date as well,
  // unless the player is in the middle of something, which keeps its view until the next screen.
  let staleScreen = false;
  function refreshScreen() {
    const id = document.body.dataset.screen;
    staleScreen = document.hidden || transitioning || dialogs.length > 0;
    if (!staleScreen && ["menu", "campaign", "warband"].includes(id)) show(id);
  }
  addEventListener("bc-save-external", () => { syncMotion(); BC.UI.syncAudioControls?.(); BC.audio.sync(); syncSaveStatus(); refreshScreen(); });
  document.addEventListener("visibilitychange", () => { if (staleScreen && !document.hidden) refreshScreen(); });

  function applyTribeVars(tribe) {
    const t = BC.TRIBES[tribe];
    if (!t) return;
    const r = document.documentElement.style;
    r.setProperty("--tribe-slab", t.colors.slab);
    r.setProperty("--tribe-ink", t.colors.ink);
    r.setProperty("--tribe-bg", t.colors.bg);
    r.setProperty("--tribe-art", `url(assets/art/menu-${tribe}.png)`);
    document.body.dataset.tribe = tribe;
    BC.ambience(tribe);
  }

  function confirmBox(text) {
    return new Promise((res) => {
      const m = $("#confirm");
      $("p", m).textContent = text;
      const done = (v) => { closeDialog(m); res(v); };
      $(".yes", m).onclick = () => done(true);
      $(".no", m).onclick = () => done(false);
      openDialog(m, () => done(false), ".no");
    });
  }

  // tooltips
  let tipTarget = null, tipPinned = false, tipFeedback = "", tipHideTimer = null;
  function hideTip() {
    clearTimeout(tipHideTimer);
    tipPinned = false;
    tipFeedback = "";
    $("#tooltip").classList.add("hidden");
    if (tipTarget) {
      const ids = (tipTarget.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== "tooltip");
      if (ids.length) tipTarget.setAttribute("aria-describedby", ids.join(" "));
      else tipTarget.removeAttribute("aria-describedby");
      tipTarget = null;
    }
  }
  const unitTip = (name, tribe, stats = BC.unitStats(name, tribe), cost = stats.cost) => {
    const unit = BC.UNITS[name];
    return [
      `${name} · ${unit.role}`,
      unit.tribe !== tribe ? `${BC.TRIBES[unit.tribe].name} mercenary` : null,
      `Cost: ${Math.round(cost)} gold`,
      `Health: ${Math.round(stats.hp)} · Damage: ${Math.round(stats.dmg)} · Defense: ${Math.round(stats.def)}`,
      `${unit.ability.name} · ${stats.abspd.toFixed(1)}s cooldown`,
      unit.ability.desc,
    ].filter(Boolean).join("\n");
  };
  const showTip = (e, pin = false) => {
    if (tipPinned && e.type === "pointerover") return;
    const el = e.target?.closest("[data-tip]");
    const tt = $("#tooltip");
    if (!el || !el.isConnected || el.closest("[inert]") || !el.getClientRects().length) { hideTip(); return; }
    if (e.pointerType === "touch" && !pin) return;
    if (tipTarget !== el) {
      hideTip();
      tipTarget = el;
      el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), "tooltip"].filter(Boolean).join(" "));
    }
    tipPinned = tipPinned || pin;
    if ("feedback" in e) tipFeedback = e.feedback;
    tt.textContent = (tipFeedback ? `Last attempt: ${tipFeedback}\n\n` : "") + el.dataset.tip;
    tt.style.left = "0px";
    tt.style.top = "0px";
    tt.classList.remove("hidden");
    const r = el.getBoundingClientRect();
    // Cast details must sit above the whole command area, including portraits
    // and the Totem on portrait phones, rather than covering another action.
    const commandTop = el.closest(".unit-slot, .spell-btn")
      ? Math.min(...[...document.querySelectorAll("#battle .unit-buttons, #battle .spell-btn, #battle .objective")].map(control => control.getBoundingClientRect().top))
      : r.top;
    tt.style.left = Math.max(8, Math.min(innerWidth - tt.offsetWidth - 8, r.left)) + "px";
    tt.style.top = Math.max(8, Math.min(innerHeight - tt.offsetHeight - 8, commandTop > tt.offsetHeight + 10 ? commandTop - tt.offsetHeight - 6 : r.bottom + 6)) + "px";
  };
  const hideTipAfter = (ms) => { clearTimeout(tipHideTimer); tipHideTimer = setTimeout(hideTip, ms); };
  const updateTip = (el, text) => {
    if (el.dataset.tip === text) return;
    el.dataset.tip = text;
    if (tipTarget === el) showTip({ target: el });
  };
  document.addEventListener("pointerover", showTip);
  document.addEventListener("focusin", showTip);
  document.addEventListener("pointerout", e => {
    if (!tipPinned && tipTarget?.contains(e.target) && !tipTarget.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  document.addEventListener("focusout", () => { if (!tipPinned) hideTip(); }, true);
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("scroll", e => {
    if (e.target === document || e.target.contains?.(tipTarget)) hideTip();
  }, true);
  addEventListener("resize", hideTip);

  BC.UI = {
    $, h, S, RUNES, fmtTime, ICON_COLOR, TRIBE_ROLE, INSCRIPTION,
    SCREENS, state, syncMotion, syncSaveStatus,
    openDialog, closeDialog, hasOpenDialogs: () => dialogs.length > 0, isTransitioning: () => transitioning,
    show, applyTribeVars, confirmBox,
    hideTip, unitTip, showTip, hideTipAfter, updateTip, getTipTarget: () => tipTarget,
  };
})();
