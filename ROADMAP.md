# Beast and Crimson Tribes Roadmap

Target: bring the existing browser game to a polished, shareable playable
release. The core loop is already in place: choose a tribe, assemble a warband,
conquer the campaign, improve warriors with Runic Burns, and return for Endless.
The next work should make that loop clear, satisfying, and dependable.

Milestones are ordered by dependency. Set dates after the first playtest establishes
the remaining scope and available development time. Unchecked items are proposed work.

## Current foundation

- Three tribes, 30 warriors, ten campaign stages, stage hazards, champions, and the Collector King.
- Five-unit warbands with one cross-tribe mercenary, seven burn tiers, forging, salvage, rerolls, and achievements.
- Endless mode, enemy Ledger, first-battle guidance, and preparation after victory.
- Local saves with recovery, keyboard and touch controls, responsive layouts, reduced motion, and an audio mixer.
- Headless feature checks and balance simulations, plus an optional browser and audio regression suite.

Milestone 1 engineering work is complete. New-player playtests remain open before
that milestone can be closed.

## Milestone sequence

| Milestone | Player outcome | Dependency |
| --- | --- | --- |
| 1. Battle clarity | Understand units, controls, and what to do next | Existing playable loop |
| 2. Campaign balance | Progress with each tribe through meaningful choices | Clear battle feedback |
| 3. Progression and saves | Compare upgrades and keep progress portable | Campaign reward targets |
| 4. Presentation and performance | Read and enjoy crowded battles across devices | Stable combat behavior |
| 5. Playable release | Open the game, finish a campaign, and return reliably | Milestones 1–4 |

## Milestone 1 Battle clarity

- [x] Verify tooltip changes in Chromium with mouse, emulated touch, and keyboard, including unaffordable units, cooldowns, scrolling, and small screens.
- [x] Show deployment costs, gold shortfalls, cooldowns, ability readiness, and missing-target feedback. Keep tooltips above deployment, Cast, and Totem controls.
- [ ] Play through the first victory, unlock, burn equip, and next-stage flow with new players; fix points where they need outside instructions.
- [x] Keep hazard details available during combat and separate boss arrivals from action feedback. Verify notices fit beside guidance and clear the controls at the tested screen sizes.

Unavailable actions now explain their requirements without spending resources.
Manual casts try other ready copies when the front warrior has no target. Blood
Sacrifice reports its warrior and health requirements. Tooltip and notice checks
cover 1280×720, 844×390, 568×320, 390×844, and 320×568; real-device and new-player
validation remain part of the playtest.

Validation on 2026-10-19: `node tools/sim.js --runs 3` and the full
`node tools/check_browser.cjs` suite passed, including audio, onboarding, save
recovery, and the new clarity checks. The campaign simulation baseline is unchanged.

For each of three new players, record their tribe, device, and any point where they
need help. Ask them to deploy a warrior, cast an ability, use the Totem spell, win
the first stage, inspect the unlock, equip a burn, and start the next stage. Observe
before explaining the controls; use repeated difficulties to choose the next fixes.

**Done when:** at least three new players have tried the opening loop, and each can
deploy, cast, use a Totem spell, equip a burn, and start the next stage using the
game's guidance. Resolve repeated confusion before moving on.

Primary files: `src/ui.js`, `src/battle.js`, `src/data.js`, `style.css`, `index.html`,
`tools/check_clarity.cjs`, `tools/check_browser.cjs`.

## Milestone 2 Campaign balance

- [ ] Define the intended difficulty curve: opening lessons, mid-campaign lineup changes, and the preparation expected for the Collector King.
- [ ] Extend balance scenarios beyond the first five unlocked units: alternate lineups, one mercenary, and burns obtainable at that campaign stage. Record seeds, clear times, and remaining Totem health.
- [ ] Investigate Bloodfang's late-campaign difficulty and Goldclaw's stronger baseline; preserve each tribe's distinct play style while making all three viable.
- [ ] Playtest manual casting alongside auto-cast, especially boss encounters and abilities that require targets.
- [ ] Tune burn rewards, Crimson Ash costs, and Endless scaling together so upgrades support progression without excessive replaying of easy stages.

**Done when:** each tribe has a demonstrated path through all ten stages using gear
and units obtainable along that path, and at least two viable late-campaign lineups.
Confirm the difficulty curve with human playtests as well as simulations.

Baseline from `node tools/sim.js --runs 3` on 2026-10-19:

| Tribe | Stages 1–7 | Stage 8 | Stage 9 | Stage 10 |
| --- | --- | --- | --- | --- |
| Bloodfang | 3/3 each | 2/3 | 2/3 | 0/3 |
| Guardvaw | 3/3 each | 3/3 | 3/3 | 2/3 |
| Goldclaw | 3/3 each | 3/3 | 3/3 | 3/3 |

These are wins from three seeded runs per stage with random deployment, auto-cast,
the first five available units, and no burns. They identify cases to investigate;
they do not estimate player win rates. The existing feature assertions passed.

Primary files: `src/data.js`, `src/battle.js`, `src/core.js`, `tools/sim.js`.

## Milestone 3 Progression and saves

- [ ] Preview a burn's effect on the selected warrior before equipping it, including the tradeoff and any change from the currently equipped burn.
- [ ] Improve inventory sorting and filtering if larger inventories make useful burns hard to find.
- [ ] Make achievement goals, completion, and rewards easy to review; preserve Cosmic Brands as achievement rewards.
- [ ] Add save export and import with a versioned format, validation, and confirmation before replacing current progress.
- [ ] Verify a full save round trip, older saves, malformed imports, and unavailable browser storage. An invalid import must leave current progress intact.

**Done when:** players can explain an upgrade's benefit and drawback, find their next
progression goal, and transfer a save to a fresh browser without losing campaign,
warband, burn, achievement, or settings data.

Primary files: `src/core.js`, `src/ui.js`, `tools/sim.js`, `tools/check_browser.cjs`.

## Milestone 4 Presentation and performance

- [ ] Review all 30 warriors against the attack-sprite designs. Prioritize readable silhouettes and distinct cues for attacks, healing, shields, and control effects.
- [ ] Improve boss entrances, impact feedback, and victory or defeat presentation where playtests show weak or confusing feedback.
- [ ] Check text contrast, touch targets, focus visibility, tooltip placement, audio levels, and reduced-motion behavior on representative devices.
- [ ] Profile crowded Endless battles and repeated screen transitions. Address measured frame-time, memory, or loading problems before adding more effects.

**Done when:** important actions remain readable in crowded battles, essential
controls fit supported phone layouts, and the chosen minimum device sustains a
documented performance target. Reduced motion and muted audio must retain essential cues.

Primary files: `src/battle.js`, `src/ui.js`, `src/audio.js`, `style.css`, `assets/`,
`tools/build_sprites.py`.

## Milestone 5 Playable release

- [ ] Choose the release destination and supported browser/device matrix. Document whether offline play means running the downloaded game locally or also reopening a hosted build offline.
- [ ] Make the existing simulation and browser/audio checks repeatable from a clean development setup; document tooling versions and commands.
- [ ] Run the complete checks on the release candidate, then manually check the target browsers and physical touch devices.
- [ ] Run a small external playtest covering all three tribes, campaign completion, Endless, and save export/import. Resolve crashes, progress loss, blocked progression, and unusable controls.
- [ ] Prepare a versioned release package, controls and save instructions, asset credits, screenshots, and a feedback route.

**Done when:** a new player can launch the packaged or hosted build, learn the game,
complete the campaign, and return to their progress. The release candidate passes
the agreed browser/device checks and has no unresolved blocking defects.

## After the first release

Choose the next expansion from playtest feedback: challenge modifiers, additional
boss encounters, more Endless variety, or saved warband loadouts. Larger changes
such as a fourth tribe, multiplayer, cloud saves, or an engine migration need their
own scope and should be evaluated after the current loop is validated.

## Next work session

Run the milestone 1 new-player playtest and record any confusing steps. The next
engineering task is milestone 2: define the campaign difficulty targets and extend
the balance scenarios to cover alternate lineups, mercenaries, and obtainable burns
before changing tuning values. Update this roadmap as acceptance criteria are met.
