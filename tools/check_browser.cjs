#!/usr/bin/env node
// Browser regressions. Run `npm install` first, then `npm run test:browser` (or `npx playwright install chromium`
// if no browser is present). PLAYWRIGHT_MODULE or PUPPETEER_MODULE may point to another install; BROWSER_BIN
// overrides Chrome. Set BC_SCREENSHOTS to a directory to capture the tested screens.
// Options: --clarity (tooltip and notice checks only), --flows (navigation, save and failure checks only).
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const loadDriver = () => {
  if (process.env.PLAYWRIGHT_MODULE) return { playwright: require(process.env.PLAYWRIGHT_MODULE) };
  if (process.env.PUPPETEER_MODULE) return { puppeteer: require(process.env.PUPPETEER_MODULE) };
  for (const name of ["playwright", "puppeteer"]) {
    try { return { [name]: require(name) }; } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
  }
  console.error("No browser driver found. Run: npm install && npx playwright install chromium");
  process.exit(1);
};
const { playwright, puppeteer } = loadDriver();
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  try {
    const name = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (!name.startsWith(root + path.sep)) throw new Error("Invalid path");
    const data = await fs.readFile(name);
    res.writeHead(200, { "Content-Type": types[path.extname(name)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await (playwright ? playwright.chromium : puppeteer).launch({ headless: true, executablePath: process.env.BROWSER_BIN || undefined });
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    if (process.argv.includes("--flows")) { await require("./check_flows.cjs")(browser, url, !!playwright); return; }
    await require("./check_clarity.cjs")(browser, url, !!playwright);
    if (process.argv.includes("--clarity")) return;
    await require("./check_audio.cjs")(browser, url, !!playwright);
    await require("./check_flows.cjs")(browser, url, !!playwright);
    const page = await browser.newPage(), errors = [];
    if (playwright) {
      page.setViewport = size => page.setViewportSize(size);
      page.evaluateOnNewDocument = fn => page.context().addInitScript(fn);
    }
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument(() => {
      const key = "bc-tribes-save-v1";
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
        tribe: "greed", seenIntro: true,
        settings: { sound: false, narration: false, ambience: false, autocast: true },
      }));
    });
    const screen = async id => {
      await page.waitForSelector(`#${id}.active`);
      await page.waitForFunction(() => document.querySelector("#curtain").className === "");
      await page.mouse.move(1, 1);
    };
    const screenshot = async name => {
      if (!process.env.BC_SCREENSHOTS) return;
      await page.evaluate(async () => {
        const animations = document.querySelector(".screen.active").getAnimations({ subtree: true });
        await Promise.all(animations.filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      await fs.mkdir(process.env.BC_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.BC_SCREENSHOTS, name + ".png") });
    };
    const begin = async () => {
      await page.click("#menu .start-btn"); await screen("campaign");
      await screenshot("campaign-desktop");
      await page.click("#campaign .mission");
      await page.waitForSelector("#campaign .brief:not(.hidden) .brief-art.has-art");
      await screenshot("briefing-desktop");
      await page.click("#campaign .brief .btns button:last-child"); await screen("battle");
    };
    // Stops animation frames so assertions do not race them. The battle stays live, unlike destroy().
    const freeze = () => page.evaluate(() => { const b = BC.currentBattle; cancelAnimationFrame(b._raf); b.loop = () => {}; });
    const win = async () => {
      await page.evaluate(() => { const b = BC.currentBattle; cancelAnimationFrame(b._raf); b.loop = () => {}; b.enemy.hp = 0; b.update(0.01); });
      await screen("result");
    };
    const state = () => page.evaluate(() => {
      const b = BC.currentBattle;
      return JSON.stringify({ gold: b.gold, player: b.player, stats: b.stats, ents: b.ents, slots: b.slots, speed: b.speed });
    });

    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "networkidle0" });
    await screen("menu"); await screenshot("menu-desktop"); await begin();
    await freeze(); // Step simulation explicitly so assertions do not race animation frames.
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "deploy");
    assert.equal(await page.evaluate(() => BC.currentBattle.autocast), false);
    assert.equal(await page.$$eval(".cast-btn", els => els.every(el => el.getAttribute("aria-disabled") === "true" && el.textContent.includes("Deploy first"))), true);
    await screenshot("tutorial-desktop");
    await page.click(".ubtn");
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "ability");
    assert.match(await page.$eval(".deploy-cd", el => el.textContent), /^\d+s$/);
    await page.keyboard.press("Escape");
    const paused = await state();
    for (const key of ["Digit2", "q", "f", "r", "Tab"]) await page.keyboard.press(key);
    await page.evaluate(() => { document.querySelector(".spell-btn").click(); document.querySelector(".ubtn").click(); });
    assert.equal(await state(), paused, "Paused controls changed the battle");
    await page.click("#battle .retreat"); await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), true);
    assert.equal(await page.$eval("#confirm", el => el.classList.contains("hidden")), true, "Escape should cancel the confirmation");
    await page.keyboard.press("Escape");
    await page.evaluate(() => { const b = BC.currentBattle; b.ents[0].abT = 0; b.onHud(b, true); });
    for (const [width, height] of [[844, 390], [568, 320]]) {
      await page.setViewport({ width, height });
      assert.equal(await page.$$eval(".unit-slot", els => els.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })), true);
      await screenshot(`tutorial-${width}`);
    }
    await page.click(".cast-btn");
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "spell");
    await page.click(".spell-btn");
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "done");
    assert.equal(await page.evaluate(() => BC.currentBattle.autocast), true, "Tutorial must restore the auto-cast preference");
    console.log("[OK] Tutorial actions, touch controls, cooldowns, pause and auto-cast restoration");

    // The keyboard alternative uses the same cast action as the touch button.
    await page.evaluate(() => { const b = BC.currentBattle; b.ents[0].abT = 0; b.onHud(b, true); });
    const casts = await page.evaluate(() => BC.currentBattle.stats.abilities);
    await page.keyboard.down("Shift"); await page.keyboard.press("Digit1"); await page.keyboard.up("Shift");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.abilities), casts + 1);
    await page.evaluate(() => { const b = BC.currentBattle; b.surgeT = 4; b.onHud(b, true); });
    assert.equal(await page.$eval(".surge-warning", el => !el.classList.contains("hidden") && el.textContent.includes("4s")), true);
    await win();
    await screenshot("rewards-phone");
    const rewardName = await page.evaluate(() => BC.tribeUnits("greed")[3]);
    assert.equal(await page.evaluate(name => BC.save.newUnits.includes(name), rewardName), true);
    const burns = await page.evaluate(() => BC.save.burns.length);
    await page.click("#result .manage-warband"); await screen("warband");
    assert.match(await page.$eval("#warband .back", el => el.textContent), /Results/);
    assert.equal(await page.$$eval(".new-badge", els => els.length), 1);
    assert.equal(await page.$eval(".wb-name", el => el.textContent), rewardName);
    await screenshot("warband-phone");
    await page.click(".burn-equip");
    assert.equal(await page.evaluate(() => BC.save.tutorial.burn), "done");
    assert.equal(await page.evaluate(name => !!BC.save.equipped[name], rewardName), true);
    await page.click("#warband .back"); await screen("result");
    assert.equal(await page.evaluate(() => BC.save.burns.length), burns, "Returning to results must not grant rewards again");
    await page.click(".reward-add");
    assert.equal(await page.evaluate(name => BC.lineup("greed").filter(n => n === name).length, rewardName), 1);
    assert.equal(await page.$eval(".reward-add", el => el.disabled), true);
    await page.click("#result .next"); await screen("battle");
    assert.equal(await page.$eval(".battle-guide", el => el.classList.contains("hidden")), true);
    assert.equal(await page.$$eval(".unit-slot", els => els.length), 4);
    await win(); await page.click("#result .fill-lineup");
    const filled = await page.evaluate(() => [...BC.lineup("greed")]);
    assert.equal(filled.length, 5);
    assert.equal(await page.$eval(".reward-add", el => el.disabled), true);
    await page.click("#result .next"); await screen("battle");
    assert.equal(await page.$$eval(".unit-slot", els => els.length), 5);
    await screenshot("five-slot-hud-phone");
    await win();
    assert.match(await page.$eval(".reward-add", el => el.textContent), /Manage lineup/);
    await page.click(".reward-add"); await screen("warband");
    assert.equal(await page.$eval(".lineup-action", el => el.disabled), true);
    assert.deepEqual(await page.evaluate(() => BC.lineup("greed")), filled, "A new reward must not replace a full lineup");
    console.log("[OK] New-unit highlights, burn guide, reward additions, fill slots and return-to-results flow");

    // Existing saves keep their progress and do not get forced back through onboarding.
    await page.evaluate(() => { delete BC.save.tutorial; delete BC.save.newUnits; BC.persist(); });
    await page.reload({ waitUntil: "networkidle0" }); await screen("menu");
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "done");
    assert.equal(await page.evaluate(() => BC.save.tutorial.burn), "done");
    assert.deepEqual(await page.evaluate(() => BC.lineup("greed")), filled);
    await page.click("#menu .gear"); await page.click(".replay-tutorial"); await screen("battle");
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "deploy");
    await page.click(".guide-skip");
    assert.deepEqual(await page.evaluate(() => BC.save.tutorial), { battle: "skipped", burn: "skipped" });
    assert.equal(await page.evaluate(() => BC.currentBattle.autocast), true);
    await page.reload({ waitUntil: "networkidle0" }); await screen("menu"); await begin();
    assert.equal(await page.$eval(".battle-guide", el => el.classList.contains("hidden")), true);
    assert.deepEqual(await page.evaluate(() => BC.lineup("greed")), filled);
    assert.deepEqual(errors, []);
    console.log("[OK] Save migration, replay, persistent skip and no uncaught browser errors");

    // Keyboard navigation must remain available while battle shortcuts still work.
    await freeze();
    const speed = await page.evaluate(() => BC.currentBattle.speed);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => BC.currentBattle.speed), speed, "Tab must navigate without changing speed");
    await page.keyboard.press("x");
    assert.notEqual(await page.evaluate(() => BC.currentBattle.speed), speed);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), true, "A hidden tab must pause battle");
    assert.equal(await page.$eval(".pause", el => el.contains(document.activeElement)), true);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), true, "Returning to the tab must wait for an explicit resume");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), false);
    console.log("[OK] Keyboard navigation, X speed shortcut and automatic background pause");

    const inBounds = async (selector, vertical = false) => {
      assert.equal(await page.$$eval(selector, (els, vertical) => els.length > 0 && els.every(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && (!vertical || r.top >= -1 && r.bottom <= innerHeight + 1);
      }), vertical), true, `Controls outside viewport: ${selector}`);
    };
    await page.evaluate(() => { BC.save.progress.greed = 5; BC.persist(); });
    await page.setViewport({ width: 1280, height: 720 });
    await page.reload({ waitUntil: "networkidle0" }); await screen("menu");
    await page.$eval('.slab[data-id="offense"]', el => el.focus());
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => BC.save.tribe), "offense");
    await page.$eval('.slab[data-id="greed"]', el => el.focus());
    await page.keyboard.press("Enter");
    assert.equal(await page.$eval('.slab[data-id="greed"]', el => el.getAttribute("aria-pressed")), "true");
    await page.click("#menu .gear");
    assert.equal(await page.$eval("#menu", el => el.inert), true);
    await page.$eval("#settings .close", el => el.focus());
    await page.keyboard.press("Tab");
    assert.equal(await page.$eval("#settings .close-icon", el => el === document.activeElement), true, "Dialog focus should wrap");
    await page.$eval(".opt-motion", el => { el.value = "reduced"; el.dispatchEvent(new Event("change")); });
    assert.equal(await page.evaluate(() => BC.reducedMotion), true);
    await screenshot("settings-desktop");
    await page.click("#settings .reset");
    assert.equal(await page.$eval("#confirm .no", el => el === document.activeElement), true, "Destructive dialogs should focus Cancel");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 5);
    assert.equal(await page.$eval("#settings .reset", el => el === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.$eval("#menu .gear", el => el === document.activeElement), true);
    await page.click("#menu .gear");
    assert.equal(await page.$eval("#settings .tablet", el => el.scrollTop), 0, "Reopened settings must start at the top");
    await page.keyboard.press("Escape");
    await page.click("#menu .start-btn"); await screen("campaign");
    await screenshot("campaign-desktop");
    assert.match(await page.$eval(".campaign-copy h3", el => el.textContent), /Iron Fortress/);
    // Honours dialog is reachable from Campaign and restores focus cleanly.
    await page.click(".honours-btn");
    assert.match(await page.$eval("#campaign .brief h3", el => el.textContent), /Honours of the Rebellion/);
    assert.equal(await page.$$eval("#campaign .brief .honour-card", els => els.length), 4);
    await page.keyboard.press("Escape");
    assert.equal(await page.$eval(".honours-btn", el => el === document.activeElement), true);
    await page.$eval(".continue-campaign", el => el.focus()); await page.keyboard.press("Enter");
    assert.equal(await page.$eval(".brief .btns button:last-child", el => el === document.activeElement), true);
    assert.equal(await page.$$eval(".brief .brief-spoils", els => els.length), 1, "Stage briefing previews clear spoils");
    await screenshot("briefing-desktop"); await page.keyboard.press("Escape");
    assert.equal(await page.$eval(".continue-campaign", el => el === document.activeElement), true);
    await page.click(".warband-btn"); await screen("warband");
    await screenshot("warband-desktop");
    await page.click("#warband .back"); await screen("campaign");
    await page.click("#campaign .back"); await screen("menu");

    for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
      await page.setViewport({ width, height });
      await inBounds("#menu .slab"); await screenshot(`menu-${width}`);
      if (width > height) await inBounds("#menu .title", true);
      assert.equal(await page.$$eval(".slab", els => els.every(el => {
        const r = el.getBoundingClientRect(), end = el.querySelector(".prog").getBoundingClientRect();
        return end.bottom <= r.bottom + 1;
      })), true, "Tribe-card content must fit within each card");
      assert.equal(await page.$eval("#rotate-hint", el => getComputedStyle(el).display), "none");
      await page.click("#menu .start-btn"); await screen("campaign");
      await inBounds("#campaign .mission"); await inBounds(".continue-campaign");
      await screenshot(`campaign-${width}`);
      await page.click(".bestiary-btn");
      await inBounds(".ledger-box", true); await screenshot(`ledger-${width}`);
      await page.keyboard.press("Escape");
      await page.click(".warband-btn"); await screen("warband");
      await inBounds(".lineup-member"); await inBounds(".wb-info"); await screenshot(`warband-${width}`);
      await page.click("#warband .back"); await screen("campaign");
      if (width === 390) await page.evaluate(() => BC.resetTutorial());
      await page.click(".mission");
      await inBounds(".brief .parchment", true);
      await page.click(".brief .btns button:last-child"); await screen("battle");
      await freeze();
      await inBounds(".unit-slot", true); await inBounds(".spell-btn", true); await inBounds(".hud-right", true);
      await screenshot(`battle-${width}`);
      if (width === 390) {
        await inBounds(".battle-guide", true);
        await page.click(".ubtn");
        await page.evaluate(() => { const b = BC.currentBattle; b.ents[0].abT = 0; b.onHud(b, true); });
        await page.click(".cast-btn"); await page.click(".spell-btn");
        assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "done", "Portrait controls must complete the tutorial");
      }
      await win(); await screenshot(`results-${width}`);
      await page.click("#result .to-menu"); await screen("menu");
    }
    console.log("[OK] Accessible tribe/stage selection, nested dialogs, focus restoration and portrait/landscape layouts");

    await page.evaluate(() => {
      localStorage.setItem("bc-tribes-save-v1", JSON.stringify({
        seenIntro: true, tribe: "greed", progress: { greed: 3 }, burns: null, equipped: null,
        lineup: { greed: "broken" }, tutorial: { battle: "bogus" },
        settings: { sound: false, narration: false, ambience: false },
      }));
    });
    await page.reload({ waitUntil: "networkidle0" }); await screen("menu");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 3);
    assert.equal(await page.evaluate(() => BC.save.tutorial.battle), "done");
    await page.click("#menu .start-btn"); await screen("campaign");
    assert.equal(await page.evaluate(() => BC.lineup("greed").length), 5);
    await page.click(".warband-btn"); await screen("warband");
    assert.deepEqual(await page.evaluate(() => BC.save.burns), []);
    await page.evaluate(() => { localStorage.setItem("bc-tribes-save-v1", "{broken"); localStorage.removeItem("bc-tribes-save-v1.backup"); });
    await page.reload({ waitUntil: "networkidle0" });
    // First run with sound on: loading waits for one gesture so the soundtrack can start.
    await page.waitForSelector("#loading .begin-prompt:not(.hidden)");
    await page.keyboard.press("Enter"); await screen("intro");
    await page.mouse.move(0, 0);
    const skip = await page.$("#intro .skip"), box = await skip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await new Promise(r => setTimeout(r, 1100)); await page.mouse.up();   // hold to skip
    await screen("menu");
    assert.equal(await page.$eval("#menu .start-btn", el => el.disabled), true);
    assert.deepEqual(await page.evaluate(() => BC.save.progress), { offense: 0, defense: 0, greed: 0 });
    // Storage failures are visible without blocking play.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Blocked storage"); }; });
    await page.click('.slab[data-id="greed"]');
    assert.equal(await page.evaluate(() => BC.saveStatus), "unavailable");
    assert.match(await page.$eval("#menu .save-status", el => el.textContent), /Saving unavailable/);
    await page.click("#menu .start-btn"); await screen("campaign");
    // Accessibility & HUD DOM-efficiency checks across active screens.
    const checkA11y = async (label) => {
      const issues = await page.evaluate(() => {
        const errs = [];
        if (!document.querySelector("main#app")) errs.push("Missing <main id='app'> landmark");
        document.querySelectorAll("img").forEach(img => { if (!img.hasAttribute("alt")) errs.push("img missing alt: " + img.outerHTML.slice(0, 80)); });
        const IMPLICIT_ROLES = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SECTION", "NAV", "MAIN", "ASIDE", "HEADER", "FOOTER", "FORM", "TABLE", "IMG", "H1", "H2", "H3", "H4", "H5", "H6", "PROGRESS", "DIALOG"]);
        document.querySelectorAll("[aria-label]").forEach(el => {
          if (!el.hasAttribute("role") && !IMPLICIT_ROLES.has(el.tagName)) errs.push("aria-label on role-less " + el.tagName + "." + el.className);
        });
        const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(el => el.getClientRects().length && !el.closest("[inert]"));
        for (let i = 1; i < headings.length; i++) {
          const prev = +headings[i - 1].tagName[1], cur = +headings[i].tagName[1];
          if (cur > prev + 1) errs.push(`Heading jump h${prev} -> h${cur} (${headings[i].textContent})`);
        }
        return errs;
      });
      assert.deepEqual(issues, [], `Accessibility issues on ${label}: ${issues.join("; ")}`);
    };
    await checkA11y("campaign");
    await page.click(".mission"); await checkA11y("briefing");
    await page.click(".brief .btns button:last-child"); await screen("battle");
    await checkA11y("battle");
    // Verify dirty-checked HUD writes: 30 unchanged HUD refreshes must not rewrite aria-label or textContent.
    const mutations = await page.evaluate(() => new Promise(resolve => {
      const b = BC.currentBattle;
      cancelAnimationFrame(b._raf); b.loop = () => {};
      b.onHud(b, true);
      let count = 0;
      const obs = new MutationObserver(list => { count += list.length; });
      obs.observe(document.querySelector("#battle .hud"), { attributes: true, childList: true, characterData: true, subtree: true });
      for (let i = 0; i < 30; i++) b.onHud(b, true);
      Promise.resolve().then(() => { obs.disconnect(); resolve(count); });
    }));
    assert.equal(mutations, 0, `Unchanged HUD state caused ${mutations} redundant DOM mutations`);
    assert.deepEqual(errors, []);
    console.log("[OK] Malformed browser saves recover, accessibility invariants hold, and idle HUD performs zero redundant DOM writes");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
