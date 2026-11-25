# Beast and Crimson: Improvement Backlog

Audited on 2026-10-30 against commit `20bc8bb`. Items run from most harmful to the
player down to barely a concern, and work follows that order. There is one exception:
**#7 is done first**, because every other fix is verified with the test suite it repairs.

Evidence labels:

- **Reproduced**: observed failing in a real browser or on the real code before any change.
- **Measured**: the number came from an instrumented run.
- **Read**: found by reading the code, and proven with a regression test when fixed.

Effort: S (under an hour), M (a few hours), L (a day or more).

## Baseline before this work

| Check | Result |
| --- | --- |
| `node tools/sim.js --runs 3` | Pass |
| `node tools/check_lifecycle.cjs` | Pass |
| `node tools/check_intro_timeline.cjs` | Pass |
| `node tools/check_browser.cjs` | **Fails** (see #7) |
| 150-battle invariant fuzz (no NaN, no overheal, no exceptions) | Pass; the combat logic itself is sound |
| Crowded battle, 4× CPU throttle | 60 fps; about 3.5 ms script per frame, so raw speed is not the problem |

## Tier 1: Breaks the game or destroys progress

- [x] **1. Double-activating "Next stage" skips to a locked stage, or crashes for good.** Effort S. *Reproduced.*
  `startBattle` changes `lastStage` before `show()` decides whether to accept the request, so a
  second click or Enter during the curtain adds another stage. From stage 9 this asks for
  `STAGES[10]` and throws, leaving a black curtain the player can never leave.
  *Fix:* a request only changes state once the navigation is accepted.

- [x] **2. Navigation requested during a transition is silently dropped, which freezes the game.** Effort S. *Reproduced.*
  `show()` returns early while the curtain moves. Using Skip by keyboard or screen reader in
  that window ends the intro's frame loop without leaving the screen, so the story freezes forever.
  *Fix:* navigation the game itself requires (end of intro, battle results) is queued and
  runs when the curtain finishes. Duplicate player input is still ignored.

- [x] **3. Opening `index.html` from disk is a permanent black screen.** Effort M. *Reproduced.*
  Double-clicking the file is the most natural way to start a downloaded game. Sprites loaded
  over `file://` taint the canvas, `toDataURL` throws, and the curtain stays down. `bc-start`
  needs bash and Python, so Windows players have no working route at all. Music is also
  routed through Web Audio, which outputs silence for `file://` media.
  *Fix:* embed sprite data for `file://`, fall back to element volume for music, and test it end to end.

- [x] **4. A corrupt save is destroyed at boot and the warning never appears.** Effort M. *Reproduced.*
  Boot calls `persist()` right after recovery. That overwrites the unreadable data with an
  empty save and flips the status to "saved", so "Unreadable save" can never be shown. The `v`
  field is never read, and a save from a newer build is silently stripped.
  *Fix:* keep the unreadable text, restore the last good backup when one exists, make the
  notice stick, and add a versioned migration path that refuses to overwrite a newer save.

- [x] **5. Two open tabs roll back each other's progress.** Effort M. *Reproduced.*
  After tab A saved progress 7 and 500 ash, a stale tab B saving one setting reset them to
  progress 1 and 0 ash. `storage` events are ignored.
  *Fix:* adopt newer saves from other tabs and refresh the visible screen, without disturbing a running battle.

- [x] **6. Any uncaught error freezes the game with no explanation.** Effort M. *Reproduced via #1 and #3.*
  There is no error boundary. An exception in a screen's setup leaves the curtain covering
  everything, and an exception in the battle loop stops the game silently.
  *Fix:* a global error panel with reload and save export, plus a screen swap that always clears the curtain.

- [x] **7. The browser test suite is red, and has no one-command entry point.** Effort S. *Reproduced.* **Done first.**
  The audio check uses a fake voice that real Chrome rejects. `win()` destroys the battle
  before stepping it, and `finish()` now ignores destroyed battles, so result-screen tests
  can never pass. Everything after the first failure never runs, and there is no `package.json`.
  *Fix:* repair the checks, add a `stopLoop()` for tests, and add `npm test`.

## Tier 2: Wrong results and unfair simulation

- [x] **8. The battle RNG is mathematically broken.** Effort S. *Measured.*
  `seed * 1103515245` exceeds 2^53, so the low bits are lost to rounding. All tested seeds fall
  into one shared cycle of **10,466** values instead of about 2^31. `rnd(n)` can also return
  `n` in principle, because it divides by `0x7fffffff`.
  *Fix:* a proper 32-bit generator with statistical tests, and separate streams for gameplay and cosmetics.

- [x] **9. Combat results depend on the player's frame rate.** Effort M. *Measured.*
  With the same seed and inputs, damage ranged from 4,997 at 20 Hz to 5,922 at 144 Hz, about 18%.
  Attack timers discard their overshoot, and below 20 fps the game also slows down. Balance
  numbers were measured at a timestep players never see.
  *Fix:* a fixed 60 Hz simulation step and overshoot-preserving attack timers, then a re-baseline.

- [x] **10. Every retry replays the same enemy sequence.** Effort S. *Measured.*
  The seed depends only on the stage, so retries see identical first spawns, and every Endless run opens the same way.
  *Fix:* a fresh seed per battle; the simulator passes explicit seeds so it stays reproducible.

- [x] **11. Status effects overwrite each other incorrectly.** Effort S. *Read.*
  A weak slow replaces a stronger one, and reapplying a damage-over-time effect resets its tick
  timer, so frequent reapplication can stop it dealing damage. Poison and burn kills are not
  credited, so they never grant Warlord stacks or count toward damage.
  *Fix:* the stronger value and longer duration win, tick progress is kept, and the caster is credited.

- [x] **12. Some rules text does not match the code.** Effort S. *Read.*
  Mirror Host says 2x life but gives 4x. Crown Levy omits its flat +10 gold. The Ability Speed
  debuff multiplies cooldown by `1+f` instead of dividing by `1-f`. Stage 10 says to slay the
  King, but razing the keep wins without it. The README says all four achievements give Cosmic Brands; two do.
  *Fix:* correct each one and test the numbers that are stated in the text.

- [x] **13. Endless mode forgets champions and can lose records.** Effort S. *Read.*
  Boss flags are never reset, so each champion appears once per run however many times its
  biome returns. The best wave is only saved when the run ends, so a closed tab forfeits it.
  *Fix:* per-biome-cycle champion flags and saving the record as each wave is reached.

## Tier 3: Significant player friction

- [x] **14. A tooltip sits on the battlefield after every successful action.** Effort S. *Measured.*
  It is still visible 2.5 s after a deploy and covers 14.8% of the battlefield on a landscape phone.
  *Fix:* a pinned tooltip after a success dismisses itself quickly; failures keep their longer explanation.

- [ ] **15. Campaign balance is only measured for one lineup, and Bloodfang hits a wall.** Effort L. *Measured.*
  Bloodfang wins stage 10 about 0 to 1 time in 6 without burns, and Goldclaw wins every time.
  The simulator tests only the first five units with no burns, so it cannot show whether a
  viable path exists (Roadmap milestone 2).
  *Fix:* scenarios with alternate lineups, mercenaries and obtainable burns, then evidence-based tuning.

- [x] **16. Forging can destroy your best burns without saying which.** Effort S. *Read.*
  It consumes the first three in inventory order, the confirmation names none of them, and
  only the lowest eligible tier is offered. Salvage also does not warn when a burn is equipped.
  *Fix:* consume the weakest rolls, name them in the confirmation, offer every eligible tier, and warn on equipped salvage.

- [x] **17. There is no way to move or back up a save.** Effort M. *Read.* (Roadmap milestone 3)
  Saves are tied to the exact origin, and `bc-start` silently moves to another port when 8000
  is busy, so the player appears to lose everything.
  *Fix:* versioned export and import with validation and confirmation, plus a launcher that reuses a running game and warns before changing port.

- [x] **18. Burns cannot be compared before equipping.** Effort M. *Read.* (Roadmap milestone 3)
  Effects only appear after committing, and a burn on a stat the warrior lacks, such as Ability Power on the Drummer, gives no warning.
  *Fix:* a live before-and-after preview, including the current burn being replaced, and a warning for wasted stats.

- [x] **19. The campaign screen downloads 23.9 MB of images.** Effort M. *Measured.*
  1043×1508 paintings fill 231 px cards, and a 1254 px, 1.8 MB crest renders at 110 px or less.
  With `image-rendering: pixelated`, that heavy downscale also aliases badly.
  *Fix:* `tools/optimize_art.py` resizes and palette-reduces `assets/art/` (23 MB -> 2.7 MB).

- [ ] **20. Screen reader support has real gaps.** Effort S. *Measured with axe-core.*
  26 images have no `alt` (critical), `aria-label` is used on role-less elements, heading order is wrong, and most content is outside landmarks.
  *Fix:* resolve every violation and add an axe regression check.

- [ ] **21. The HUD performs about 1,064 DOM writes per second, mostly unchanged values.** Effort S. *Measured.*
  This includes 392 `aria-label` rewrites per second, which hurts assistive technology, and about 30 forced layouts per second.
  *Fix:* cache element references and write only when a value changes.

- [ ] **22. Sound effects can clip, and each noise burst allocates a new buffer.** Effort S. *Read.*
  There is no limiter or voice cap, and auto-cast at 2× speed stacks many sawtooth voices.
  *Fix:* a master limiter, per-effect rate limits, and shared noise buffers.

- [x] **23. Crowded fights stack hundreds of unreadable floating numbers.** Effort S. *Measured.*
  301 live effects were recorded in one crowded fight, and the lava hazard adds a number for every combatant each second.
  *Fix:* a capped effects pool that merges hits on the same target.

- [x] **24. Alt-tabbing does not pause the battle.** Effort S. *Read.*
  Only a hidden tab pauses. A window left partly visible keeps fighting without the player.
  *Fix:* also pause on window blur.

## Tier 4: Robustness and maintainability

- [ ] **25. Rewards are granted inside UI code, and Retreat can run twice.** Effort M. *Read.*
  Achievement and burn logic lives in the UI closure with no unit tests. Retreat's confirmation does not recheck the battle, so a second confirmation during the curtain would grant rewards again.
  *Fix:* move this to a pure, tested `core.js` function with a once-only guard.

- [x] **26. Large burn inventories are hard to use.** Effort S. *Read.* (Roadmap milestone 3)
  Sorting is by tier only, with no tier filter. Achievements are tucked inside Settings.
  *Fix:* sort and tier filters that persist, and achievements reachable from the campaign screen.

- [x] **27. Nothing validates the game data.** Effort S. *Read.*
  A misspelt enemy in a stage pool crashes that stage at runtime, and the code has dead helpers.
  *Fix:* `BC.validateData()` covers units, lore, abilities, stats, and stage pools/bosses.

- [ ] **28. A stalled image request hangs the loading screen forever.** Effort S. *Read.*
  There is no timeout, and a failed stage image is cached as failed for the whole session.
  *Fix:* a per-asset timeout, a retry for transient failures, and a visible reason if loading cannot finish.

- [ ] **29. No continuous integration.** Effort S. *Read.*
  Nothing runs the checks on push, which is how #7 went unnoticed.
  *Fix:* a GitHub Actions workflow for the headless and browser suites.

- [ ] **30. The docs have drifted from the code.** Effort S. *Read.*
  The README's code map omits the intro modules and tooling, `data.js` points to a `docs/` folder that does not exist, and the roadmap's validation notes are stale.
  *Fix:* bring the README and roadmap back in line.

## Tier 5: Barely a concern

- [ ] **31. No favicon, install manifest or offline cache for hosted builds.** Effort M. *Read.*
  Every load logs a favicon 404, and a hosted build cannot be reopened offline.
  *Fix:* an icon, a web manifest, and a versioned service worker.

- [ ] **32. Fonts ship as TTF.** Effort S. *Measured.*
  632 KB of fonts could be roughly half that as WOFF2.
  *Fix:* convert them and update the `@font-face` rules.

- [ ] **33. No Content Security Policy, and one inline handler.** Effort S. *Read.*
  The game makes no network requests, so a strict policy costs nothing once `onerror=` is removed.
  *Fix:* add the policy and remove inline handlers and styles.

- [x] **34. No release packaging.** Effort S. *Read.* (Roadmap milestone 5)
  Design docs and tooling would ship to players, and nothing produces a versioned build.
  *Fix:* `tools/build_itch.sh` and `tools/build_release.sh` produce clean versioned web zips, AppImages, `.deb`, and `.rpm` packages.

- [x] **35. `ui.js` is one 1,390-line closure with 27 lines over 200 characters.** Effort L. *Measured.*
  It works, but it is hard to navigate and review, and players never notice it. It goes last because it is the riskiest change for the smallest player benefit.
  *Fix:* split into per-screen modules (`src/ui.js` + `src/ui-{intro,menu,campaign,warband,battle,settings}.js`).
