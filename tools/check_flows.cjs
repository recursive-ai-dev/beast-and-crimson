// Real-browser regressions for navigation races, save safety and failure handling. Run by check_browser.cjs.
const assert = require("node:assert/strict");
const path = require("node:path");

const KEY = "bc-tribes-save-v1";
const QUIET = { sound: false, narration: false, ambience: false, autocast: false };

module.exports = async function checkFlows(browser, url, playwright) {
  if (!playwright) { console.log("[SKIP] Flow checks need Playwright"); return; }

  const open = async (save, options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options });
    context.setDefaultTimeout(15000);
    if (save) await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [KEY, typeof save === "string" ? save : JSON.stringify(save)]);
    const page = await context.newPage();
    page.errors = [];
    page.on("pageerror", error => page.errors.push(error.message));
    await page.goto(url);
    return page;
  };
  const settled = (page, id) => page.waitForFunction(id => document.body.dataset.screen === id && document.querySelector("#curtain").className === "", id);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const campaignSave = (tribe, cleared) => ({ tribe, seenIntro: true, progress: { [tribe]: cleared }, tutorial: { battle: "skipped", burn: "skipped" }, settings: QUIET });
  // Opens stage `index` and wins it, ending on a settled results screen.
  const winStage = async (page, index) => {
    await settled(page, "menu");
    await page.click("#menu .start-btn"); await settled(page, "campaign");
    await page.click(`.mission:nth-child(${index + 1})`); await page.click(".brief .btns button:last-child");
    await settled(page, "battle");
    await page.evaluate(() => { BC.currentBattle.enemy.hp = 0; });
    await settled(page, "result");
  };
  const stageShown = page => page.$eval(".keep-name", el => el.textContent);

  // ---- navigation ----------------------------------------------------------
  {
    const page = await open(campaignSave("greed", 2));
    await winStage(page, 2);
    await page.dblclick("#result .next", { delay: 80 });
    await settled(page, "battle");
    assert.equal(await stageShown(page), "Sanguine Marshes", "A double click on Next stage must open the next stage only");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  {
    const page = await open(campaignSave("greed", 2));
    await winStage(page, 2);
    await page.focus("#result .next");
    await page.keyboard.press("Enter"); await pause(60); await page.keyboard.press("Enter");
    await settled(page, "battle");
    assert.equal(await stageShown(page), "Sanguine Marshes", "Repeated Enter on Next stage must open the next stage only");
    await page.context().close();
  }
  {
    const page = await open(campaignSave("greed", 8));
    await winStage(page, 8);
    await page.dblclick("#result .next", { delay: 80 });
    await settled(page, "battle");
    assert.match(await stageShown(page), /Spirit Vale/, "A double click after stage 9 must open stage 10, never a stage that does not exist");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  {
    // Skip by keyboard or screen reader while the curtain still covers the start of the story.
    const page = await open({ seenIntro: false, settings: { sound: false, narration: false, ambience: false } });
    await page.waitForFunction(() => document.body.dataset.screen === "intro");
    await page.evaluate(() => document.querySelector("#intro .skip").click());
    await settled(page, "menu");
    assert.equal(await page.evaluate(() => BC.save.seenIntro), true);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  {
    // Retrying a stage is a fresh battle, and an Endless record is safe the moment it is reached.
    const page = await open(campaignSave("greed", 2));
    await winStage(page, 1);
    await page.click("#result .retry"); await settled(page, "battle");
    const first = await page.evaluate(() => BC.currentBattle.seed);
    await page.evaluate(() => { BC.currentBattle.enemy.hp = 0; }); await settled(page, "result");
    await page.click("#result .retry"); await settled(page, "battle");
    assert.notEqual(await page.evaluate(() => BC.currentBattle.seed), first, "A retry draws a new battle");
    await page.evaluate(() => { BC.currentBattle.enemy.hp = 0; }); await settled(page, "result");
    await page.click("#result .to-menu"); await settled(page, "menu");
    await page.click("#menu .start-btn"); await settled(page, "campaign");
    await page.click(".endless-btn"); await page.click(".brief .btns button:last-child"); await settled(page, "battle");
    await page.evaluate(() => BC.currentBattle.advanceEndlessWave(false));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bc-tribes-save-v1")).endless.greed), 2, "The record is on disk before the run ends");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  console.log("[OK] Repeated navigation opens one screen, the next stage only, and skipping during a transition still ends the story");

  // ---- battlefield stays clear ---------------------------------------------
  {
    const page = await open(campaignSave("greed", 2), { hasTouch: true, viewport: { width: 844, height: 390 } });
    await settled(page, "menu");
    await page.click("#menu .start-btn"); await settled(page, "campaign");
    await page.click(".mission.next"); await page.click(".brief .btns button:last-child"); await settled(page, "battle");
    const tipVisible = () => page.$eval("#tooltip", el => !el.classList.contains("hidden"));
    const tapCentre = async selector => {
      const box = await (await page.$(selector)).boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    await page.evaluate(() => { const b = BC.currentBattle; b.paused = false; b.gold = 2500; });
    // The first success introduces the control, then gets out of the way by itself.
    await tapCentre(".ubtn");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.deployed), 1);
    assert.equal(await tipVisible(), true, "The first deployment introduces the warrior");
    await pause(2000);
    assert.equal(await tipVisible(), false, "The introduction leaves the battlefield by itself");
    assert.equal(await page.$$eval('[aria-describedby~="tooltip"]', els => els.length), 0);
    // Later successes in the same fight stay out of the way completely.
    await page.evaluate(() => { const b = BC.currentBattle; b.slots[0].cd = 0; });
    await tapCentre(".ubtn");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.deployed), 2);
    assert.equal(await tipVisible(), false, "A repeated success must not cover the battlefield");
    // A failure explains itself for longer, then leaves too.
    await page.evaluate(() => { const b = BC.currentBattle; b.gold = 0; b.slots[0].cd = 0; });
    await tapCentre(".ubtn");
    assert.match(await page.$eval("#tooltip", el => el.textContent), /Last attempt:.*more gold/);
    await pause(2000);
    assert.equal(await tipVisible(), true, "A failure stays readable");
    await pause(3500);
    assert.equal(await tipVisible(), false, "A failure does not stay on the battlefield forever");
    // A new battle introduces its controls again.
    await page.evaluate(() => { BC.currentBattle.enemy.hp = 0; }); await settled(page, "result");
    await page.click("#result .retry"); await settled(page, "battle");
    await page.evaluate(() => { BC.currentBattle.gold = 2500; });
    await tapCentre(".ubtn");
    assert.equal(await tipVisible(), true);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  console.log("[OK] Tooltips introduce each control once per battle and never linger on the battlefield");

  // ---- opening index.html from disk ----------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(15000);
    await context.addInitScript(key => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ tribe: "greed", seenIntro: true, tutorial: { battle: "skipped", burn: "skipped" }, settings: { narration: false, ambience: false, autocast: false } }));
      const Native = window.Audio;
      window.audioTest = [];
      window.Audio = function (src) { const element = new Native(src); window.audioTest.push(element); return element; };
    }, KEY);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
    await settled(page, "menu");
    assert.equal(await page.$$eval(".slab .sigil img", els => els.length === 3 && els.every(el => el.complete && el.naturalWidth === 96 && el.src.startsWith("data:image/png"))), true, "Tribe icons render from disk");
    assert.ok(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d"); g.drawImage(document.querySelector(".slab .sigil img"), 0, 0); return g.getImageData(0, 0, 96, 96).data.some(v => v > 0); }), "Tribe icons are not blank");
    await page.click("#menu .start-btn"); await settled(page, "campaign");
    await page.click(".mission"); await page.click(".brief .btns button:last-child"); await settled(page, "battle");
    await page.click(".ubtn");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.deployed), 1, "Battles play from disk");
    // The browser feeds Web Audio silence from local media, so music must not depend on that route.
    await page.waitForFunction(() => {
      const playing = audioTest.filter(t => !t.paused && t.currentTime > 0);
      return playing.some(t => t.src.includes("battle") && Math.abs(t.volume - 0.8 * 0.55) < 0.02);
    });
    await page.evaluate(() => { BC.currentBattle.enemy.hp = 0; }); await settled(page, "result");
    await page.click("#result .to-menu"); await settled(page, "menu");
    await page.click("#menu .gear"); await page.click(".replay-intro"); await settled(page, "intro");
    await pause(600);
    await page.evaluate(() => document.querySelector("#intro .skip").click()); await settled(page, "menu");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("[OK] index.html opened from disk reaches the menu, renders icons, plays the story and battles, and plays music");

  // ---- save safety ---------------------------------------------------------
  const stored = (page, key = KEY) => page.evaluate(key => localStorage.getItem(key), key);
  const saveStatus = page => page.$eval("#menu .save-status", el => ({ text: el.textContent, warning: el.classList.contains("save-warning") }));
  const reloadWith = async (page, text) => {
    await page.evaluate(([key, text]) => localStorage.setItem(key, text), [KEY, text]);
    await page.reload();
  };
  {
    // No backup to fall back on: the unreadable text is kept and the player is told.
    const damaged = '{"tribe":"greed","progress":{"greed":9},"burns":[{"id":1,"ti';
    const page = await open(damaged);
    await page.waitForFunction(() => document.body.dataset.screen !== "loading" || document.querySelector("#loading .begin-prompt:not(.hidden)"));
    assert.equal(await stored(page, KEY + ".damaged"), damaged, "An unreadable save is kept, not destroyed");
    assert.match((await saveStatus(page)).text, /Unreadable save/, "The warning survives the first save of the session");
    assert.equal((await saveStatus(page)).warning, true);
    await page.context().close();
  }
  {
    // A readable save becomes the backup at launch; damage later restores it.
    const page = await open(campaignSave("greed", 4));
    await settled(page, "menu");
    assert.match(await stored(page, KEY + ".backup"), /"greed":4/);
    await reloadWith(page, "{broken");
    await settled(page, "menu");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 4, "Progress comes back from the backup");
    assert.equal(await stored(page, KEY + ".damaged"), "{broken");
    assert.match((await saveStatus(page)).text, /restored/i);
    assert.equal((await saveStatus(page)).warning, true);
    // A later launch is normal again, and damaged text does not replace the good backup.
    await page.reload(); await settled(page, "menu");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 4);
    assert.doesNotMatch((await saveStatus(page)).text, /restored/i);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  {
    // Valid JSON that is not a save counts as damaged too.
    const page = await open(campaignSave("greed", 3));
    await settled(page, "menu");
    await reloadWith(page, "[1,2,3]");
    await settled(page, "menu");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 3);
    assert.equal(await stored(page, KEY + ".damaged"), "[1,2,3]");
    await page.context().close();
  }
  {
    // A save from a newer build is never overwritten by this one.
    const newer = JSON.stringify({ v: 99, tribe: "greed", seenIntro: true, progress: { greed: 6 }, futureField: { keep: "me" }, tutorial: { battle: "skipped", burn: "skipped" }, settings: QUIET });
    const page = await open(newer);
    await settled(page, "menu");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 6, "The newer save still plays");
    await page.click('.slab[data-id="offense"]');
    await page.evaluate(() => { BC.save.ash = 123; BC.persist(); });
    assert.equal(await stored(page), newer, "This session must leave the newer save untouched");
    assert.match((await saveStatus(page)).text, /newer version/i);
    assert.equal((await saveStatus(page)).warning, true);
    // Choosing to erase is an explicit decision, and it releases the save.
    await page.click("#menu .gear"); await page.click(".reset"); await page.click("#confirm .yes");
    await page.waitForFunction(() => document.body.dataset.screen === "menu" && !document.querySelector("#settings:not(.hidden)"));
    assert.equal(JSON.parse(await stored(page)).progress.greed, 0);
    assert.doesNotMatch((await saveStatus(page)).text, /newer version/i);
    await page.context().close();
  }
  {
    // Erase means erase: nothing can resurrect the old progress afterwards.
    const page = await open(campaignSave("greed", 5));
    await settled(page, "menu");
    await reloadWith(page, "{broken"); await settled(page, "menu");
    await page.click("#menu .gear"); await page.click(".reset"); await page.click("#confirm .yes");
    await page.waitForFunction(() => !document.querySelector("#settings:not(.hidden)"));
    assert.equal(await stored(page, KEY + ".backup"), null);
    assert.equal(await stored(page, KEY + ".damaged"), null);
    await page.context().close();
  }
  console.log("[OK] Damaged saves are kept and restored from backup, newer saves are never overwritten, and Erase removes every copy");

  // ---- two tabs ------------------------------------------------------------
  {
    const a = await open(campaignSave("greed", 1));
    const b = await a.context().newPage();
    b.errors = []; b.on("pageerror", error => b.errors.push(error.message));
    await b.goto(url);
    await settled(a, "menu"); await settled(b, "menu");
    const synced = (page, ash) => page.waitForFunction(ash => BC.save.ash === ash, ash);

    // A stale tab must not roll back what the other tab just earned.
    await a.evaluate(() => { BC.save.progress.greed = 7; BC.save.ash = 500; BC.persist(); });
    await synced(b, 500);
    await b.evaluate(() => { BC.save.settings.scene = 1; BC.persist(); });
    await a.waitForFunction(() => BC.save.settings.scene === 1);
    assert.deepEqual(await a.evaluate(() => { const s = JSON.parse(localStorage.getItem("bc-tribes-save-v1")); return [s.progress.greed, s.ash, s.settings.scene]; }), [7, 500, 1]);

    // The screen on show follows along when nothing is in progress.
    await b.click("#menu .start-btn"); await settled(b, "campaign");
    assert.match(await b.$eval(".campaign-metrics b", el => el.textContent), /07/);
    await a.evaluate(() => { BC.save.progress.greed = 8; BC.save.ash = 501; BC.persist(); });
    await synced(b, 501);
    await b.waitForFunction(() => document.querySelector(".campaign-metrics b").textContent === "08");

    // A tab switching tribe does not move a battle or its rewards in another tab.
    await b.click(".mission.next"); await b.click(".brief .btns button:last-child"); await settled(b, "battle");
    await a.click('.slab[data-id="offense"]');
    await a.evaluate(() => { BC.save.ash = 502; BC.persist(); });
    await synced(b, 502);
    assert.equal(await b.evaluate(() => BC.save.tribe), "greed", "A tab keeps its own tribe");
    assert.equal(await b.evaluate(() => { const r = BC.currentBattle.stats; return typeof r.kills; }), "number", "The battle carries on");
    await b.evaluate(() => { BC.currentBattle.enemy.hp = 0; }); await settled(b, "result");
    assert.equal(await b.evaluate(() => BC.save.progress.greed), 9, "The win goes to the tribe that fought");
    assert.equal(await b.evaluate(() => BC.save.progress.offense), 0);
    assert.equal(await b.evaluate(() => BC.save.ash), 502, "The win keeps what the other tab earned");

    // Tabs on different tribes must not keep redrawing and re-saving in answer to each other.
    await b.click("#result .to-menu"); await settled(b, "menu");
    assert.notEqual(await a.evaluate(() => BC.save.tribe), await b.evaluate(() => BC.save.tribe));
    const writes = await a.evaluate(() => new Promise(resolve => {
      let count = 0;
      const counter = () => count++;
      addEventListener("storage", counter);
      setTimeout(() => { removeEventListener("storage", counter); resolve(count); }, 1200);
    }));
    assert.ok(writes <= 1, `Two idle tabs exchanged ${writes} saves`);

    // Skipping the tutorial elsewhere must not break a tab that is mid-tutorial.
    await b.evaluate(() => { BC.resetTutorial(); });
    await a.waitForFunction(() => BC.save.tutorial.battle === "deploy");
    await b.click("#menu .gear"); await b.click(".replay-tutorial"); await settled(b, "battle");
    await a.evaluate(() => { BC.skipTutorial(); });
    await b.waitForFunction(() => BC.save.tutorial.battle === "skipped");
    await b.keyboard.press("Escape"); await b.keyboard.press("Escape");
    assert.equal(await b.evaluate(() => BC.currentBattle.paused), false);
    assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    await a.context().close();
  }
  console.log("[OK] Open tabs share progress without rolling each other back, and keep their own tribe and battle");

  // ---- failure handling ----------------------------------------------------
  const panel = page => page.waitForSelector("#fatal:not(.hidden)");
  {
    // A failure while building a screen must not leave the curtain over everything.
    const page = await open(campaignSave("greed", 3));
    await settled(page, "menu");
    const before = await stored(page);
    await page.evaluate(() => { BC.lineup = () => { throw new Error("Lineup exploded"); }; });
    await page.click("#menu .start-btn");
    await panel(page);
    assert.match(await page.$eval("#fatal", el => el.textContent), /Lineup exploded/, "The panel states the actual error");
    assert.equal(await page.$eval("#fatal .fatal-reload", el => el === document.activeElement), true, "Keyboard focus lands on the way out");
    assert.equal(await page.$eval("#app", el => el.inert), true, "The broken game cannot be interacted with behind the panel");
    assert.equal(await stored(page), before, "The failure leaves the save alone");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#fatal .fatal-save")]);
    assert.match(download.suggestedFilename(), /beast-and-crimson.*\.json$/);
    await page.click("#fatal .fatal-reload");
    await settled(page, "menu");
    assert.equal(await page.$eval("#fatal", el => el.classList.contains("hidden")), true, "Reloading recovers the game");
    assert.equal(await page.evaluate(() => BC.save.progress.greed), 3);
    await page.context().close();
  }
  {
    // A failure inside the battle loop explains itself too, instead of silently freezing.
    const page = await open(campaignSave("greed", 3));
    await settled(page, "menu");
    await page.click("#menu .start-btn"); await settled(page, "campaign");
    await page.click(".mission.next"); await page.click(".brief .btns button:last-child"); await settled(page, "battle");
    await page.evaluate(() => { BC.currentBattle.update = () => { throw new Error("Battle exploded"); }; });
    await panel(page);
    assert.match(await page.$eval("#fatal", el => el.textContent), /Battle exploded/);
    await page.context().close();
  }
  {
    // Failed promises count, but noise from other sources must not end the player's game.
    const page = await open(campaignSave("greed", 3));
    await settled(page, "menu");
    await page.evaluate(() => {
      dispatchEvent(new ErrorEvent("error", { message: "Script error.", filename: "" }));
      dispatchEvent(new ErrorEvent("error", { message: "Boom", filename: "chrome-extension://abc/content.js", error: new Error("Boom") }));
    });
    await pause(100);
    assert.equal(await page.$eval("#fatal", el => el.classList.contains("hidden")), true, "Errors from outside the game are ignored");
    await page.evaluate(() => { Promise.reject(new Error("Rejected promise")); });
    await panel(page);
    assert.match(await page.$eval("#fatal", el => el.textContent), /Rejected promise/);
    await page.context().close();
  }
  {
    // A build that cannot even start (missing script) still explains itself.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(15000);
    await context.route("**/src/data.js", route => route.abort());
    const page = await context.newPage();
    await page.goto(url);
    await panel(page);
    assert.match(await page.$eval("#fatal", el => el.textContent), /stopped|could not/i);
    await context.close();
  }
  console.log("[OK] Uncaught failures show an honest panel with save export and reload, without touching the save");
};
