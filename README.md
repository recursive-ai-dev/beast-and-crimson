# Beast and Crimson: Tribes

A lane battler built from the design docs in this folder (`BC Main Menu`, `BC HUD`,
`BC Attack Sprites`, `BC Runic Burns`). Pick a tribe, send rune-carved
totem cubes down the lane, tap them to unleash their abilities, and raze the keeps
of the crown's tax collectors across ten biomes, ending with the Collector King.

See the [development roadmap](ROADMAP.md) for the proposed milestones toward a
polished, shareable release.

- **3 tribes**: Bloodfang (Offense, *Mixio*), Guardvaw (Defense, *Spuea*) and Goldclaw (Greed, *Pasea*), each with its own passive, active Totem Spell (*Blood Sacrifice*, *Spuea Bulwark*, *Royal Bribe*), palette and menu scene.
- **30 units**: the ones from *BC Attack Sprites*, each with a unique ability. Tap a unit when its rune circle glows, press **Q/W/E/A/S** (or **F**), or turn on auto-cast in Settings or Pause.
- **10 stages** across ten dark-fantasy biomes with stage hazards (*Crimson Canopy*, *Volcanic Fissures*, *Clinging Mire*, *Inward Tide*, *Keep Ballista*, *Black Blizzard*, *Bone-Sand Gale*) and mid-boss champions (*The Drowned Warden*, *Foundry Colossus*). Each first clear unlocks a new warrior, up to all 10 per tribe.
- **Endless Mode ("The Endless Levy") & Crown's Ledger**: survive infinite scaling waves across shifting biomes to earn Runic Burns and track your best wave per tribe, or inspect enemy stats, traits and kill tallies in the Ledger.
- **Runic Burns & Forging**: 7 tiers, from Initiate's Seal to Cosmic Brand. Each burn gives one buff and one debuff, using the percentage ranges from the doc. Combine 3 burns of the same tier into the next tier, salvage unwanted burns into **Crimson Ash**, and spend Ash to reroll a burn's stats. Equip one per unit in the Warband screen, plus up to 1 **Cross-Tribe Mercenary** in your 5-unit lineup. Cosmic Brands never drop at random; you earn them through **achievements**: Untouched Totem, Regicide, The Great Tithe, Beast and Crimson.
- **Warband**: two display scenes per tribe (fire circle or sacrificial altar, grove platform or riverside stone, gold pile or treasure chest), and each unit's lore on an ancient scroll.
- **First-battle guide**: learn deployment, manual ability casts and your Totem spell as you play, then bind a Runic Burn in the Warband. Skip at any time or replay from Settings. The guide temporarily uses manual casting and restores your auto-cast preference afterward.
- **Prepare after victory**: add a newly unlocked warrior directly from its reward card, fill empty slots with unlocked warriors from your tribe, or open Manage Warband and return to the same results. New warriors are marked until inspected or added; a full lineup is never replaced automatically.
- **Atmosphere**: each tribe has its own menu scene and campaign map, plus synthesized ambient sound. Menu and battle soundtracks loop and crossfade as you enter and leave combat. The menu reads the tribe's warning aloud in a low narrator voice (the Web Speech API). Settings and Pause buttons are styled per tribe: molten for Bloodfang, branch and river stone for Guardvaw, gold bars for Goldclaw.
- The screens are the ones the docs describe: loading (rotating emblem, claw progress bar, tips), cut scene (cinematic bars, subtitles, skip rune), main menu (stone slabs, pulsing start shield), campaign map, unit customization, HUD, retreated/result screen and the rune-curtain transition.
- **Campaign and lineup overview**: jump to your next chapter, see conquered keeps and your Endless record, and inspect the five deployment slots above your roster. Unit stats use full labels; the Ledger includes enemy lore directly on each card.
- **Keyboard, touch and motion preferences**: tribe and stage cards are keyboard accessible, dialogs keep focus inside and restore it when closed, and Escape cancels a confirmation. Menus, inventory and battles support portrait phones as well as landscape. Settings include a controls reference and reduced motion that follows your device by default.
- **Battle clarity**: each biome's painting forms the battlefield backdrop, deployment slots show warrior names where space permits, and the HUD includes a timer and casting mode. Switching away from the tab pauses the battle and stops ambience; returning waits for you to resume.
- **Safer forging**: only unbound burns can be forged. Forging asks for confirmation and never consumes equipped burns; the Unbound filter shows only unequipped burns.
- Offline, no dependencies. Progress is saved in `localStorage`. Partial saves are validated and repaired without discarding valid progress. The menu and Settings report when the browser cannot save.

## Play

Start a local server from the game folder (Python 3 required):

```bash
./bc-start                # opens the game in your browser
./bc-start 8080           # optional port; Ctrl+C stops the server
```

Alternatively, run `python3 -m http.server 8000 --bind 127.0.0.1` and visit
`http://127.0.0.1:8000/index.html`. Use the same port each time to keep using the
same browser save. Opening `index.html` directly with `file://` can block sprite
icons in Chrome. Both phone orientations work; landscape gives the battlefield more space.

Controls: tap or click the stone buttons to deploy (keys **1–5**), tap a glowing
unit or press **Q / W / E / A / S** (or **Shift+1–5** / **F**) to cast unit abilities,
press **R** (or tap your Totem) to unleash your Tribe Totem Spell, press **X** to toggle
**1x / 2x** battle speed, and press **Space** or **Esc** to pause. **Tab** navigates
controls; **Enter** or **Space** activates the focused button. Escape resumes a paused
battle or closes the topmost dialog. Auto-cast includes unit abilities and Totem spells.

Each portrait deploys a warrior; its separate **Cast** button uses a ready ability
from that unit type. The buttons show deployment and ability cooldowns, ready-unit
counts, and the Totem spell cooldown. An enemy-surge warning appears five seconds
before reinforcements arrive. An ability marked Ready may still need a target in range.

Unavailable actions remain inspectable with keyboard focus or touch. Their details
show the gold shortfall or cooldown, and attempting an unavailable action explains
what is needed. A cast without a target stays ready. Manual casting tries the ready
warriors of that type until one can use its ability. Blood Sacrifice requires a
deployed warrior and at least 35% Totem health.

The biome hazard stays visible during battle; select its name for the effect.
Champion and Collector King arrivals appear separately from action feedback, so
inspecting or casting does not replace the arrival warning.

Audio starts after your first click, tap, or key press. Settings and Pause include
saved **Master volume**, **Music**, **Sound effects**, and **Ambience** sliders;
**Sound enabled** mutes everything, including narration. Set Music to 0 to keep
effects without music. The default mix is 80% master, 55% music, 80% effects, and
40% ambience. Music stays at normal speed during 2× battles.

The menu track continues through Campaign, Ledger, Warband, and results. Entering
or leaving a battle crossfades the tracks over 1.4 seconds; a new battle starts
its track from the beginning. Pause lowers music and ambience to 30% of their
normal levels, and narration lowers them to 35% while speaking. Volume changes
fade over 180 milliseconds. Hiding the tab silences audio immediately and pauses
playback; returning restores the mix and leaves the battle paused until Resume.
The bundled tracks are `assets/music/bc_menu_music.mp3` and
`assets/music/bc_battle_music.mp3`; they stream locally and need no online service.

## Art

Every sprite is generated by **Shed Dev Sprites** (`~/Projects/shed-dev-sprites`) and
is deterministic, so the same seed always gives the same pixels:

| Asset | Generator |
|---|---|
| 30 units + 3 tribe Totems | `totem_cube`: a carved stone cube with face stencils (eyes, tattoos, horns, halo…). Idle (4), attack (5: aura forms → peak burst → fade) and impact (3) frames follow the Attack Sprites doc |
| 10 enemies | `human` (collectors, levies, inquisitors, knights, the King) and `creature` (hounds, golems, carrion, drowned, debt slimes) |
| Ground | `tile` (seamless) |
| Enemy keeps | `settlement` cottages |
| Braziers | `prop` |
| Runic Burn artifacts | `item` (7 per tribe) |

Rebuild the art after changing the generator:

```bash
python3 tools/build_sprites.py            # --shed /path/to/shed-dev-sprites
```

This writes `assets/**.png` and `assets/manifest.js`.

The painted menu art is bundled in `assets/art/`. The three tribe backdrops were
generated with FLUX.1-schnell, then pixelated and palette-reduced. The transparent
title crest and ten biome cards were generated with the built-in OpenAI image
generation tool; their exact prompts are in `assets/art/prompts.json`.
Missing images fall back to plain styled cards and procedural battle scenery.
Battle backdrops load on demand and reuse the bundled biome art.

The original FLUX/BiRefNet generator remains available to create alternative art
(it does not reproduce the bundled OpenAI-generated images):

```bash
python3 tools/gen_art.py                 # fetch whatever is missing
python3 tools/gen_art.py --force stage-03  # redo one
```

Fonts are bundled, Latin-subset OFL faces in `assets/fonts/`: Cinzel Decorative for the
title, Cinzel for headings and EB Garamond for body text.

## Code

```
index.html  style.css
src/data.js     tribes, units + abilities, enemies, stages, runic burns, TUNE (balance knobs)
src/core.js     save data, burn rolls, stat assembly, asset loader, WebAudio synth sfx
src/audio.js    shared audio mixer, streamed soundtrack, fades and audio lifecycle
src/battle.js   lane simulation + canvas renderer (480×270, pixel-scaled)
src/ui.js       screens, transitions, HUD, warband, results
tools/build_sprites.py   tools/gen_art.py   tools/sim.js (headless balance bot)
```

Run feature checks and the campaign/endless simulations with
`node tools/sim.js --runs 3`. Checks cover burns, paused actions, Royal Bribe,
tutorial progression, ability readiness, lineup limits, malformed save recovery,
storage failures, and protection of equipped burns during forging.

Run `node tools/check_lifecycle.cjs` for dependency-free regressions covering delayed
battle results, pause-safe rendering, ballista timing, ability effects, bribed
sprites, reroll IDs, delayed speech voices, and immediate ambience cleanup.

Optional browser regressions use Puppeteer or Playwright from your development environment:

```bash
node tools/check_browser.cjs
node tools/check_browser.cjs --clarity  # focused tooltip, control and battle-notice checks
```

If Puppeteer is installed outside this project, set `PUPPETEER_MODULE` to its
absolute module directory. Alternatively, set `PLAYWRIGHT_MODULE` to an installed
Playwright module directory. `BROWSER_BIN` optionally selects a Chrome executable,
and `BC_SCREENSHOTS` optionally saves screenshots to the specified directory.
The suite starts its own temporary local server and tests tutorial completion,
touch and keyboard casting, pause, reward-to-Warband navigation, save migration,
dialog focus, reduced motion, background pause, and portrait/landscape layouts
down to 320 pixels wide. It also runs `tools/check_audio.cjs`, which checks real
MP3 playback and looping, crossfades, saved mixer controls, narration ducking,
pause/resume, tab visibility, autoplay retries, and missing tracks.
Browser tooling is only needed for these tests.

`tools/check_clarity.cjs` adds mouse, emulated touch, and keyboard checks for unit
details, gold shortfalls, cooldowns, missing targets, Blood Sacrifice requirements,
Warband scrolling, and hazard/boss notices. It checks tooltip and notice placement
at 1280×720, 844×390, 568×320, 390×844, and 320×568.

Balance: enemies spawn from a *threat budget* (`TUNE.threat*`). Each foe costs its
bounty, so tougher foes come less often. The numbers were tuned with a headless
bot that deploys at random with auto-cast on and no Runic Burns. It usually clears
stages 1–9; Bloodfang can struggle in the later stages. Stage 10 is the wall:
Goldclaw wins it reliably, Guardvaw sometimes, and Bloodfang needs burns.
