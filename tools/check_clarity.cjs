// Real pointer, touch and keyboard checks for battle feedback and unit details.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function checkClarity(browser, url, playwright) {
  const context = await (playwright ? browser.newContext({ hasTouch: true }) : browser.createBrowserContext());
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  const viewport = async size => {
    await (playwright ? page.setViewportSize(size) : page.setViewport({ ...size, hasTouch: true }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  page.on("pageerror", error => errors.push(error.message));
  const screen = id => page.waitForSelector(`#${id}.active`);
  const tip = () => page.$eval("#tooltip", el => el.textContent);
  const tap = async selector => {
    const point = await page.$eval(selector, el => {
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute("aria-describedby")?.includes("tooltip"), ...(playwright ? [selector] : [{}, selector]));
  };
  const bounds = selector => page.waitForFunction(selector => {
    const els = [...document.querySelectorAll(selector)];
    return els.length > 0 && els.every(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    });
  }, ...(playwright ? [selector] : [{}, selector]));
  const clearControls = async () => assert.equal(await page.$eval("#tooltip", el => {
    const r = el.getBoundingClientRect();
    return [...document.querySelectorAll(".ubtn, .cast-btn, .spell-btn, .hud-right")].every(control => {
      const c = control.getBoundingClientRect();
      return r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom;
    });
  }), true, "Tooltip covers battle controls");
  const screenshot = async name => {
    if (!process.env.BC_SCREENSHOTS) return;
    await fs.mkdir(process.env.BC_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.BC_SCREENSHOTS, `clarity-${name}.png`) });
  };
  const begin = async () => {
    await page.click("#menu .start-btn"); await screen("campaign");
    await page.click(".mission"); await page.click(".brief .btns button:last-child"); await screen("battle");
    await page.evaluate(() => BC.currentBattle.destroy());
  };
  try {
    const seed = () => {
      if (!localStorage.getItem("bc-tribes-save-v1")) localStorage.setItem("bc-tribes-save-v1", JSON.stringify({
        tribe: "greed", seenIntro: true, progress: { greed: 5 },
        tutorial: { battle: "skipped", burn: "skipped" },
        settings: { sound: false, narration: false, ambience: false, autocast: false, motion: "reduced" },
      }));
    };
    await (playwright ? context.addInitScript(seed) : page.evaluateOnNewDocument(seed));
    await viewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "load" }); await screen("menu"); await begin();

    await page.evaluate(() => { const b = BC.currentBattle; b.gold = 0; b.onHud(b, true); });
    const portrait = await page.$(".ubtn"); await portrait.hover();
    assert.match(await tip(), /Golden Totemist.*Ranged/s);
    assert.match(await tip(), /Need 60 more gold/);
    await bounds("#tooltip:not(.hidden)");
    await page.$eval(".ubtn", el => el.focus()); await page.keyboard.press("Tab");
    assert.equal(await page.$eval(".cast-btn", el => el === document.activeElement), true, "Unavailable casts remain keyboard inspectable");
    assert.match(await tip(), /Totem Tithe.*Deploy first/s);
    await page.keyboard.press("Enter");
    assert.match(await page.$eval(".toast", el => el.textContent), /Deploy Golden Totemist/);
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.abilities), 0);

    for (const [width, height] of [[1280, 720], [844, 390], [568, 320], [390, 844], [320, 568]]) {
      await viewport({ width, height });
      await tap(".ubtn");
      assert.match(await tip(), /Need 60 more gold/, `Portrait tooltip at ${width}x${height}`);
      assert.match(await page.$eval(".toast", el => el.textContent), /need 60 more gold/);
      await bounds("#tooltip:not(.hidden)");
      await clearControls();
      assert.equal(await page.evaluate(() => BC.currentBattle.stats.deployed), 0);
      await screenshot(`tooltip-${width}`);
      await tap(".cast-btn");
      assert.match(await tip(), /Totem Tithe.*Deploy first/s);
      await bounds("#tooltip:not(.hidden)");
      await clearControls();
      assert.equal(await page.$eval(".cast-btn", el => el.getAttribute("aria-describedby")), "tooltip");
    }

    await page.evaluate(() => { const b = BC.currentBattle; b.gold = 250; b.onHud(b, true); });
    await tap(".ubtn");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.deployed), 1);
    assert.match(await tip(), /Deploy again in/);
    const gold = await page.evaluate(() => BC.currentBattle.gold);
    await tap(".ubtn");
    assert.equal(await page.evaluate(() => BC.currentBattle.gold), gold);
    assert.match(await page.$eval(".toast", el => el.textContent), /deploys again in/);
    await tap(".cast-btn");
    assert.match(await tip(), /Ready in \d+s/);
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.abilities), 0);
    await page.evaluate(() => { const b = BC.currentBattle; b.ents[0].abT = 0; b.onHud(b, true); });
    assert.match(await tip(), /Totem Tithe · Ready\n/);
    await tap(".cast-btn");
    assert.equal(await page.evaluate(() => BC.currentBattle.stats.abilities), 1);
    assert.match(await tip(), /Ready in/);
    await page.evaluate(() => { const b = BC.currentBattle; b.slots[0].cd = 0; b.onHud(b, true); });
    await page.$eval(".ubtn", el => el.focus());
    await page.evaluate(() => { const b = BC.currentBattle; b.player.discountT = 8; b.onHud(b, true); });
    assert.match(await tip(), /Cost: 45 gold/);
    assert.match(await page.$eval(".ubtn", el => el.getAttribute("aria-label")), /45 gold/);

    await page.evaluate(() => {
      const b = BC.currentBattle; b.ents = []; b.gold = 250; b.deploy(2); b.ents[0].abT = 0; b.onHud(b, true);
    });
    await tap(".unit-slot:nth-child(3) .cast-btn");
    assert.match(await page.$eval(".toast", el => el.textContent), /No enemy in range.*Still ready/);
    assert.match(await tip(), /Last attempt:.*No enemy in range.*Still ready/);
    assert.equal(await page.evaluate(() => BC.currentBattle.ents[0].abT), 0);
    assert.equal(await page.$eval(".unit-slot:nth-child(3) .cast-state", el => el.textContent), "Ready");
    await screenshot("missing-target");
    await clearControls();
    console.log("[OK] Mouse/touch/keyboard tooltips, unavailable actions, live costs, cooldowns and missing targets");

    await page.keyboard.press("Escape");
    assert.equal(await page.$eval("#tooltip", el => el.classList.contains("hidden")), true);
    assert.equal(await page.$$eval(".ubtn, .cast-btn, .spell-btn", els => els.every(el => el.disabled)), true);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const b = BC.currentBattle;
      b.stage = BC.STAGES[5]; b.enemy.hp = b.enemy.max * 0.5;
      b.updateSpawner(0); b.surgeT = 4; b.onHud(b, true);
    });
    assert.match(await page.$eval(".arrival-warning:not(.hidden)", el => el.textContent), /Foundry Colossus/);
    await tap(".battle-hazard");
    assert.match(await tip(), /Keep Ballista.*every 12s/s);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const b = BC.currentBattle; b.stage = BC.STAGES[9]; b.updateSpawner(0); b.onHud(b, true);
    });
    assert.match(await page.$eval(".arrival-warning:not(.hidden)", el => el.textContent), /Collector King/);
    await page.evaluate(() => BC.currentBattle.toast("Not enough gold"));
    assert.match(await page.$eval(".arrival-warning", el => el.textContent), /Collector King/, "Action feedback must not replace boss announcements");

    // Exercise the tutorial together with the longest hazard and arrival labels.
    await page.evaluate(() => { BC.save.tutorial.battle = "deploy"; BC.persist(); });
    await page.reload({ waitUntil: "load" }); await screen("menu"); await begin();
    for (const [width, height] of [[1280, 720], [844, 390], [568, 320], [390, 844], [320, 568]]) {
      await viewport({ width, height });
      await page.evaluate(() => {
        const b = BC.currentBattle; b.stage = BC.STAGES[1]; b.surgeT = 4;
        b.announce("The Drowned Warden enters the lane!"); b.onHud(b, true);
      });
      await bounds(".battle-notices");
      assert.equal(await page.$eval(".battle-notices", el => {
        const r = el.getBoundingClientRect();
        return [...document.querySelectorAll(".unit-slot, .spell-btn, .hud-right, .hud-mid, .battle-guide:not(.hidden)")].every(control => {
          const c = control.getBoundingClientRect();
          return r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom;
        });
      }), true, `Battle notices cover controls or guidance at ${width}x${height}`);
      await screenshot(`notices-${width}`);
    }
    await tap(".battle-hazard");
    await page.evaluate(() => { const b = BC.currentBattle; b.stage = BC.STAGES[2]; b.onHud(b, true); });
    assert.equal(await page.$eval(".battle-hazard", el => el.classList.contains("hidden")), true);
    assert.equal(await page.$eval("#tooltip", el => el.classList.contains("hidden")), true, "Changing biome dismisses an obsolete hazard tooltip");
    console.log("[OK] Hazard details, champion/King announcements and readable notice layouts at five viewport sizes");

    await page.reload({ waitUntil: "load" }); await screen("menu");
    await page.click("#menu .start-btn"); await screen("campaign");
    await page.click(".warband-btn"); await screen("warband");
    await tap(".wb-unit");
    assert.match(await tip(), /Golden Totemist/);
    assert.equal(await page.$eval('.wb-unit[data-name="Golden Totemist"]', el => el.getAttribute("aria-describedby")), "tooltip");
    await page.$eval(".wb-list", el => { el.scrollLeft = 100; });
    await page.waitForFunction(() => document.querySelector("#tooltip").classList.contains("hidden"));
    await tap(".lineup-member"); await bounds("#tooltip:not(.hidden)");
    await viewport({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector("#tooltip").classList.contains("hidden"));
    assert.equal(await page.$$eval('[aria-describedby~="tooltip"]', els => els.length), 0);
    console.log("[OK] Warband tooltip anchors survive selection and dismiss on scrolling/rotation without stale descriptions");

    await page.evaluate(() => { BC.save.tribe = "offense"; BC.skipTutorial(); });
    await page.reload({ waitUntil: "load" }); await screen("menu"); await begin();
    await tap(".spell-btn");
    assert.match(await tip(), /Deploy a warrior first/);
    assert.equal(await page.evaluate(() => BC.currentBattle.player.spellCd), 0);
    await page.evaluate(() => {
      const b = BC.currentBattle; b.deploy(0); b.player.hp = b.player.max * 0.34; b.onHud(b, true);
    });
    for (const [width, height] of [[568, 320], [320, 568]]) {
      await viewport({ width, height }); await tap(".spell-btn");
      assert.match(await tip(), /Requires at least 35% Totem health/);
      assert.match(await page.$eval(".toast", el => el.textContent), /35% Totem health/);
      await bounds("#tooltip:not(.hidden)"); await clearControls();
      await screenshot(`sacrifice-${width}`);
    }
    assert.equal(await page.evaluate(() => BC.currentBattle.player.spellCd), 0);
    assert.deepEqual(errors, []);
    console.log("[OK] Blood Sacrifice explains warrior/health requirements and keeps the Totem control visible");
  } catch (error) {
    await screenshot("failure");
    throw error;
  } finally {
    await context.close();
  }
};
