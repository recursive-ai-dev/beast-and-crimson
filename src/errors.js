/* Last resort: any uncaught failure explains itself and offers a way out, leaving the save alone.
 * Loaded first and independent of the game, so it also covers a build that cannot start. */
(function () {
  "use strict";
  const SAVE_KEY = "bc-tribes-save-v1";
  let shown = false;

  function downloadSave() {
    let text = null;
    try { text = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage is blocked */ }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text || "{}"], { type: "application/json" }));
    link.download = `beast-and-crimson-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function showPanel(detail) {
    if (shown) return;
    shown = true;
    const panel = document.getElementById("fatal");
    panel.querySelector(".fatal-message").textContent = detail;
    panel.querySelector(".fatal-reload").onclick = () => location.reload();
    panel.querySelector(".fatal-save").onclick = downloadSave;
    document.getElementById("app").inert = true;
    // The game's shortcuts and focus trap must not fight the panel; the browser's own keys still work.
    addEventListener("keydown", e => e.stopImmediatePropagation(), true);
    panel.classList.remove("hidden");
    panel.querySelector(".fatal-reload").focus();
    try { window.BC?.currentBattle?.destroy(); window.BC?.cancelNarration?.(); window.BC?.audio?.setPaused(true); } catch (e) { /* already failing */ }
  }

  const describe = (error, fallback) => (error && error.stack && String(error.stack).includes(error.message) ? error.stack : error?.message) || String(error ?? fallback);
  // Other pages' scripts and browser extensions can raise errors here too. Those are not the game's to die for.
  const foreign = (source) => /^(chrome|moz|safari|safari-web|ms-browser)-extension:/.test(source) || (/^https?:/.test(source) && !source.startsWith(location.origin));

  addEventListener("error", (e) => {
    if (e.message === "Script error." || foreign(e.filename || "")) return;
    showPanel(describe(e.error, e.message));
  });
  addEventListener("unhandledrejection", (e) => {
    if (foreign(String(e.reason?.stack || "").match(/\b[\w-]+:\/\/\S+/)?.[0] || "")) return;
    showPanel(describe(e.reason, "A promise was rejected"));
  });
})();
