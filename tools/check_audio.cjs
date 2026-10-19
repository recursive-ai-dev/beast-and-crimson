// Real media playback / mixer regressions, run by check_browser.cjs.
const assert = require("node:assert/strict");

module.exports = async function checkAudio(browser, url, playwright) {
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  const init = fn => playwright ? page.context().addInitScript(fn) : page.evaluateOnNewDocument(fn);
  const screen = id => page.waitForSelector(`#${id}.active`);
  const gain = async (bus, value) => {
    try {
      await page.waitForFunction(([bus, value]) => Math.abs(BC.audio.output(bus).gain.value - value) < 0.005, ...(
        playwright ? [[bus, value]] : [{}, [bus, value]]
      ));
    } catch (error) {
      const actual = await page.evaluate(bus => ({ gain: BC.audio.output(bus).gain.value, settings: BC.save.settings, screen: document.body.dataset.screen, context: BC.audio.context()?.state }), bus);
      throw new Error(`Expected ${bus} gain ${value}; got ${JSON.stringify(actual)}; browser errors: ${errors.join(", ")}`, { cause: error });
    }
  };
  const volume = (key, value, panel = "settings") => page.$eval(`#${panel}-${key}`, (el, value) => {
    el.value = value; el.dispatchEvent(new Event("input", { bubbles: true }));
    // Keep the effects bus rendering while its gain ramps; browsers can skip
    // processing a GainNode with no active inputs and report its last sample.
    if (el.dataset.audioSetting === "effectsVolume") BC.sfx.chime();
  }, value);
  const play = name => page.waitForFunction(name => window.audioTest.tracks.some(t => t.src.includes(name) && !t.paused && t.currentTime > 0 && t.testGain.gain.value > 0.99), ...(
    playwright ? [name] : [{}, name]
  ));
  page.on("pageerror", e => errors.push(e.message));
  try {
    await init(() => {
      localStorage.setItem("bc-tribes-save-v1", localStorage.getItem("bc-audio-save") || JSON.stringify({
        tribe: "greed", seenIntro: true, tutorial: { battle: "skipped", burn: "skipped" },
        settings: { sound: true, narration: false, ambience: false, motion: "reduced" },
      }));
      window.audioTest = { tracks: [], rejectNext: false, missingBattle: false };
      const Audio = window.Audio, createSource = AudioContext.prototype.createMediaElementSource;
      window.Audio = function (src) {
        const element = new Audio(window.audioTest.missingBattle && src.includes("battle") ? "missing-battle.mp3" : src);
        const play = element.play.bind(element);
        element.play = () => {
          if (window.audioTest.rejectNext) {
            window.audioTest.rejectNext = false;
            return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
          }
          return play();
        };
        window.audioTest.tracks.push(element);
        return element;
      };
      AudioContext.prototype.createMediaElementSource = function (element) {
        const source = createSource.call(this, element), connect = source.connect.bind(source);
        source.connect = node => { element.testGain = node; return connect(node); };
        return source;
      };
    });
    await page.goto(url, { waitUntil: "load" }); await screen("menu");
    assert.equal(await page.evaluate(() => BC.audio.context()), null, "Wait for a gesture before creating audio");
    assert.equal(await page.evaluate(() => audioTest.tracks.length), 0);
    await page.click("#menu .gear"); await play("menu");
    await gain("master", 0.8); await gain("music", 0.55);
    assert.equal(await page.evaluate(() => audioTest.tracks[0].loop), true);
    await volume("musicVolume", 40); await gain("music", 0.4);
    await volume("effectsVolume", 25); await gain("effects", 0.25);
    await page.click(".opt-ambience");
    await volume("ambienceVolume", 15); await gain("ambient", 0.15);
    await volume("masterVolume", 60); await gain("master", 0.6);
    assert.equal(await page.$eval("#pause-musicVolume", el => el.value), "40", "Settings and Pause stay in sync");
    await page.click("#settings .opt-sound"); await gain("master", 0);
    await page.waitForFunction(() => audioTest.tracks.every(t => t.paused));
    await page.click("#settings .opt-sound"); await play("menu");
    await volume("musicVolume", 0);
    await page.waitForFunction(() => audioTest.tracks.every(t => t.paused));
    await gain("effects", 0.25);
    await volume("musicVolume", 40); await play("menu");
    // Reversing a fade must cancel its pending stop.
    await volume("masterVolume", 0); await volume("masterVolume", 60);
    await play("menu"); await gain("master", 0.6);
    console.log("[OK] Audio gesture unlock, master/music/effects/ambience controls and interrupted fades");
    await page.evaluate(() => localStorage.setItem("bc-audio-save", localStorage.getItem("bc-tribes-save-v1")));
    await page.reload({ waitUntil: "load" }); await screen("menu");
    assert.deepEqual(await page.evaluate(() => [BC.save.settings.masterVolume, BC.save.settings.musicVolume, BC.save.settings.effectsVolume, BC.save.settings.ambienceVolume]), [0.6, 0.4, 0.25, 0.15]);
    await page.click("#menu .start-btn"); await screen("campaign"); await play("menu");
    const before = await page.evaluate(() => audioTest.tracks[0].currentTime);
    await page.click(".warband-btn"); await screen("warband");
    await page.click("#warband .back"); await screen("campaign");
    assert.equal(await page.evaluate(() => audioTest.tracks.length), 1);
    assert.ok(await page.evaluate(() => audioTest.tracks[0].currentTime) >= before, "Menu navigation must not restart music");
    await page.click(".mission"); await page.click(".brief .btns button:last-child"); await screen("battle");
    await page.waitForFunction(() => audioTest.tracks.length === 2 && audioTest.tracks.every(t => !t.paused && t.testGain.gain.value > 0.02 && t.testGain.gain.value < 0.98));
    await play("battle");
    await page.waitForFunction(() => audioTest.tracks[0].paused);
    await page.click(".speed-btn");
    assert.equal(await page.evaluate(() => audioTest.tracks[1].playbackRate), 1, "Battle speed must not change music speed");
    await page.click(".hud-right .gear"); await gain("music", 0.12);
    await volume("effectsVolume", 50, "pause"); await gain("effects", 0.5);
    await page.click(".resume"); await gain("music", 0.4);

    // Narration events duck the mix; a cancelled older utterance cannot unduck a newer one.
    await page.evaluate(() => {
      const spoken = []; window.audioTest.spoken = spoken;
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        cancel() {}, getVoices() { return []; }, speak(u) { spoken.push(u); u.onstart(); },
      } });
      BC.save.settings.narration = true;
      BC.narrate("First tribe"); BC.narrate("Second tribe"); spoken[0].onend();
    });
    await gain("music", 0.14);
    await page.evaluate(() => audioTest.spoken[1].onend()); await gain("music", 0.4);
    await page.evaluate(() => {
      window.audioTest.context = BC.audio.context();
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await gain("master", 0);
    await page.waitForFunction(() => audioTest.context.state === "suspended" && audioTest.tracks.every(t => t.paused));
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), true);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    await play("battle"); await gain("music", 0.12);
    assert.equal(await page.evaluate(() => BC.currentBattle.paused), true);
    await page.click(".resume"); await gain("music", 0.4);
    await page.evaluate(() => { const b = BC.currentBattle; b.destroy(); b.enemy.hp = 0; b.update(0.01); });
    await screen("result"); await play("menu");
    await page.waitForFunction(() => audioTest.tracks[1].paused && audioTest.tracks[1].currentTime === 0);
    // Seek near the end to verify actual MP3 looping without waiting three minutes.
    await page.evaluate(() => { const t = audioTest.tracks[0]; t.currentTime = t.duration - 0.3; });
    await page.waitForFunction(() => audioTest.tracks[0].currentTime < 2 && !audioTest.tracks[0].paused);
    await page.click("#result .retry"); await screen("battle"); await play("battle");
    assert.equal(await page.evaluate(() => audioTest.tracks.length), 2, "Reuse tracks across retries");
    await page.click(".hud-right .gear"); await page.click(".retreat"); await page.click("#confirm .yes");
    await screen("result"); await play("menu");
    await page.click("#result .to-menu"); await screen("menu");
    console.log("[OK] Real MP3 playback, loops, crossfades, mixer persistence, pause, narration, backgrounding, results and retreat");

    // Failed play promises and absent files must leave the game usable.
    await page.reload({ waitUntil: "load" }); await screen("menu");
    await page.evaluate(() => { audioTest.rejectNext = true; audioTest.missingBattle = true; });
    await page.click("#menu .gear");
    await page.keyboard.press("Escape"); await play("menu");
    await page.click("#menu .start-btn"); await screen("campaign");
    await page.click(".mission"); await page.click(".brief .btns button:last-child"); await screen("battle");
    await page.waitForFunction(() => audioTest.tracks.length === 2 && audioTest.tracks[1].error && audioTest.tracks[0].paused);
    await page.click(".ubtn");
    assert.ok(await page.evaluate(() => BC.currentBattle.ents.length) > 0);
    assert.deepEqual(errors, []);
    console.log("[OK] Autoplay retries and missing music fail without interrupting gameplay");
  } finally {
    await page.evaluate(() => { localStorage.removeItem("bc-tribes-save-v1"); localStorage.removeItem("bc-audio-save"); }).catch(() => {});
    await page.close();
  }
};
