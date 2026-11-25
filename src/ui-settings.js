/* Settings dialog, audio mixer controls, and UI bootstrap. */
(function () {
  "use strict";
  const BC = window.BC;
  const { $, h, S, state, syncMotion, syncSaveStatus, openDialog, closeDialog, show, applyTribeVars, confirmBox } = BC.UI;

  function syncAudioControls() {
    document.querySelectorAll("[data-audio-setting]").forEach(input => {
      const value = S().settings[input.dataset.audioSetting];
      if (input.type === "checkbox") input.checked = value;
      else {
        input.value = Math.round(value * 100);
        input.setAttribute("aria-valuetext", `${input.value}%`);
        input.nextElementSibling.value = `${input.value}%`;
      }
    });
  }

  function initAudioControls() {
    document.querySelectorAll(".audio-controls").forEach(panel => {
      panel.append(h("legend", {}, "Audio"), h("label", { class: "toggle" },
        h("input", { type: "checkbox", class: "opt-sound", "data-audio-setting": "sound" }), "Sound enabled"));
      for (const [key, label] of [["masterVolume", "Master volume"], ["musicVolume", "Music"], ["effectsVolume", "Sound effects"], ["ambienceVolume", "Ambience"]]) {
        const id = `${panel.dataset.audioSettings}-${key}`;
        panel.append(h("label", { class: "audio-level", for: id }, h("span", {}, label),
          h("input", { id, type: "range", min: 0, max: 100, step: 1, "data-audio-setting": key }), h("output", { for: id })));
      }
      panel.addEventListener("input", e => {
        const key = e.target.dataset.audioSetting;
        if (!key) return;
        S().settings[key] = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value) / 100;
        if (key === "masterVolume") BC.cancelNarration();
        BC.audio.sync(); syncAudioControls(); BC.persist();
      });
    });
    syncAudioControls();
  }

  function openSettings() {
    const m = $("#settings");
    syncAudioControls();
    $(".opt-autocast", m).checked = S().settings.autocast;
    $(".opt-autocast", m).onchange = (e) => { S().settings.autocast = e.target.checked; BC.persist(); };
    $(".opt-narration", m).checked = S().settings.narration;
    $(".opt-ambience", m).checked = S().settings.ambience;
    $(".opt-narration", m).onchange = (e) => { S().settings.narration = e.target.checked; BC.persist(); BC.audio.sync(); };
    $(".opt-ambience", m).onchange = (e) => { S().settings.ambience = e.target.checked; BC.persist(); BC.audio.sync(); };
    $(".opt-motion", m).value = S().settings.motion;
    $(".opt-motion", m).onchange = e => { S().settings.motion = e.target.value; BC.persist(); syncMotion(); };
    const al = $(".ach-list", m);
    al.innerHTML = "";
    const tribe = S().tribe || "offense";
    const achEntries = Object.entries(BC.ACHIEVEMENTS);
    const achEarned = achEntries.filter(([id]) => S().achievements[id]).length;
    al.append(h("b", { style: "color:var(--gold)" }, `Honours & Achievements (${achEarned}/${achEntries.length})`));
    for (const [id, a] of achEntries) {
      const got = !!S().achievements[id];
      const tier = BC.BURN_TIERS[a.reward];
      al.append(h("div", { class: "ach" + (got ? " got" : ""), "data-tip": `Reward: ${tier.name} — ${tier.lore}` },
        h("img", { class: "px ach-icon", alt: "", src: BC.iconURL("artifacts:" + tribe, a.reward, 32) }),
        h("div", {}, h("b", {}, a.name), h("small", {}, `${a.desc} · Reward: ${tier.name}`)),
        h("span", { class: "ach-state" }, got ? "Earned" : "Locked")));
    }
    $(".close", m).onclick = () => closeDialog(m);
    $(".close-icon", m).onclick = () => closeDialog(m);
    $(".export-save", m).onclick = () => {
      const blob = new Blob([BC.exportSave()], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: "beast-and-crimson-save.json",
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      $(".save-status", m).textContent = "Save exported.";
    };
    const importInput = $(".import-file", m);
    $(".import-save", m).onclick = () => { importInput.value = ""; importInput.click(); };
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (!(await confirmBox("Replace all current progress with the imported save?"))) return;
      const res = BC.importSave(text);
      if (!res.ok) {
        $(".save-status", m).textContent = res.error;
        return;
      }
      syncMotion(); syncAudioControls(); BC.audio.sync();
      closeDialog(m); show("menu", true);
    };
    $(".replay-intro", m).onclick = () => { closeDialog(m); state.introRecap = false; show("intro", true); };
    $(".replay-tutorial", m).disabled = !S().tribe;
    $(".replay-tutorial", m).onclick = () => {
      BC.resetTutorial(); closeDialog(m); BC.UI.startBattle(0, false);
    };
    $(".reset", m).onclick = async () => {
      if (!(await confirmBox("Erase every stage, warrior and Runic Burn? This cannot be undone."))) return;
      BC.resetSave(); syncMotion(); syncAudioControls(); BC.audio.sync(); closeDialog(m); show("menu", true);
    };
    syncSaveStatus(); openDialog(m, () => closeDialog(m), ".opt-sound");
  }

  BC.UI.syncAudioControls = syncAudioControls;
  BC.UI.openSettings = openSettings;

  initAudioControls();
  if (S().tribe) applyTribeVars(S().tribe);
  BC.UI.boot();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.__BC_NO_SW) {
    addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); }, { once: true });
  }
})();
