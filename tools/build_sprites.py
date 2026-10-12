#!/usr/bin/env python3
"""
Build every Beast and Crimson sprite from Shed Dev Sprites.
===========================================================

All art is deterministic: each asset is a pure function of a fixed seed, so
re-running this script reproduces identical PNGs.

    python3 tools/build_sprites.py [--shed ~/Projects/shed-dev-sprites]

Writes ``assets/*.png`` strips (one row, 32 px cells unless noted) and
``assets/manifest.js`` (``window.BC_ASSETS = {...}``) so the game also runs
straight from ``file://`` without a server.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")


def slug(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-").replace("--", "-")


# Enemy roster: the ruling class and the beasts they keep.
ENEMIES = [
    # id, name, generator, options
    ("collector", "Tax Collector", "human", {"palette": "cloth"}),
    ("levy", "Crown Levy", "human", {"palette": "grim_steel"}),
    ("inquisitor", "Inquisitor", "human", {"palette": "cult_blood"}),
    ("knight", "Royal Knight", "human", {"palette": "sacred_gold"}),
    ("hound", "War Hound", "creature", {"archetype": "quadruped", "palette": "blood"}),
    ("golem", "Iron Golem", "creature", {"archetype": "golem", "palette": "grim_steel"}),
    ("carrion", "Carrion Wing", "creature", {"archetype": "winged", "palette": "wraith_ash"}),
    ("drowned", "Drowned Horror", "creature", {"archetype": "tentacle", "palette": "black_water"}),
    ("debt", "Debt Slime", "creature", {"archetype": "slime", "palette": "sickly_green"}),
    ("king", "The Collector King", "human", {"palette": "sacred_gold"}),
]

# Runic Burn artifacts per tribe (BC Main Menu: "Upgrade Options"), one per tier 0..6.
ARTIFACTS = {
    # Bloodfang: blood-red runes or dark obsidian artifacts
    "offense": [("shard", "stone"), ("gem", "cult_blood"), ("shard", "volcanic_ember"), ("gem", "blood"),
                ("shard", "cult_blood"), ("gem", "volcanic_ember"), ("shard", "magic")],
    # Guardvaw: carved wooden talismans or stones wrapped in vines
    "defense": [("ring", "wood"), ("shard", "grass"), ("shield", "wood"), ("gem", "grass"),
                ("staff", "wood"), ("shard", "spire_anima"), ("gem", "magic")],
    # Goldclaw: golden idols, enchanted rings, gem-encrusted amulets
    "greed":   [("coin", "sacred_gold"), ("ring", "sacred_gold"), ("gem", "water"), ("ring", "magic"),
                ("gem", "blood"), ("key", "sacred_gold"), ("gem", "sacred_gold")],
}

TILES = ["dirt", "mud", "stone", "sand", "lava", "snow", "moss", "cobble"]
KEEP_THEMES = ["oldstone", "cinder", "moor", "coastal"]


def strip(frames, cell=32):
    from PIL import Image
    img = Image.new("RGBA", (cell * len(frames), cell), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im = f.image if hasattr(f, "image") else f
        if im.size != (cell, cell):
            im = im.resize((cell, cell))
        img.paste(im, (i * cell, 0), im)
    return img


def first_seed(gen, base_seed, ok, tries=64):
    """Deterministically skip seeds whose sprite is degenerate."""
    for k in range(tries):
        s = f"{base_seed}#{k}" if k else base_seed
        if ok(gen.generate(s)):
            return s
    return base_seed


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--shed", default=os.path.expanduser("~/Projects/shed-dev-sprites"))
    args = ap.parse_args()
    sys.path.insert(0, args.shed)
    from generator.registry import get_generator
    from generator.sprites.cube import UNITS, TRIBES, TotemCubeSpriteGenerator

    os.makedirs(ASSETS, exist_ok=True)
    manifest = {"cell": 32, "units": {}, "bases": {}, "enemies": {}, "tiles": {}, "keeps": {}, "props": {}}

    # -- tribe units: idle(4) | attack(5) | impact(3) -----------------------
    cube = TotemCubeSpriteGenerator()
    for name, info in UNITS.items():
        frames = []
        for action in ("idle", "attack", "impact"):
            for f in range(cube.ACTION_FRAMES[action]):
                frames.append(cube.generate(name, unit=name, action=action, frame=f))
        path = f"units/{slug(name)}.png"
        os.makedirs(os.path.join(ASSETS, "units"), exist_ok=True)
        strip(frames).save(os.path.join(ASSETS, path))
        manifest["units"][name] = {
            "src": path, "tribe": info["tribe"], "aura": frames[0].spec["aura"],
            "anims": {"idle": [0, 4], "attack": [4, 5], "impact": [9, 3]},
        }

    # -- tribe totem bases (random kit, tribe-locked) ----------------------
    for tribe in TRIBES:
        frames = [cube.generate(f"totem-{tribe}", tribe=tribe, action="idle", frame=f) for f in range(4)]
        frames += [cube.generate(f"totem-{tribe}", tribe=tribe, action="attack", frame=f) for f in range(5)]
        path = f"bases/{tribe}.png"
        os.makedirs(os.path.join(ASSETS, "bases"), exist_ok=True)
        strip(frames).save(os.path.join(ASSETS, path))
        manifest["bases"][tribe] = {"src": path, "anims": {"idle": [0, 4], "attack": [4, 5]},
                                    "name": TRIBES[tribe]["name"], "word": TRIBES[tribe]["word"]}

    # -- enemies: walk-left(4) | attack-left(4) ----------------------------
    os.makedirs(os.path.join(ASSETS, "enemies"), exist_ok=True)
    for eid, name, gname, opts in ENEMIES:
        gen = get_generator(gname)
        seed = first_seed(gen, f"bc-{eid}", lambda s: s.image.getbbox() is not None)
        walk = [gen.generate(seed, direction="left", frame=f, frames=4, **opts) for f in range(4)]
        atk = [gen.generate(seed, direction="left", frame=f, frames=4, action="attack", **opts) for f in range(4)]
        path = f"enemies/{eid}.png"
        strip(walk + atk).save(os.path.join(ASSETS, path))
        manifest["enemies"][eid] = {"src": path, "name": name, "anims": {"walk": [0, 4], "attack": [4, 4]}}

    # -- runic burn artifacts ---------------------------------------------
    os.makedirs(os.path.join(ASSETS, "artifacts"), exist_ok=True)
    item = get_generator("item")
    manifest["artifacts"] = {}
    for tribe, tiers in ARTIFACTS.items():
        frames = [item.generate(f"bc-art-{tribe}-{i}", category=cat, palette=pal) for i, (cat, pal) in enumerate(tiers)]
        path = f"artifacts/{tribe}.png"
        strip(frames).save(os.path.join(ASSETS, path))
        manifest["artifacts"][tribe] = {"src": path}

    # -- ground tiles (16 px, seamless) ------------------------------------
    os.makedirs(os.path.join(ASSETS, "tiles"), exist_ok=True)
    tile = get_generator("tile")
    for kind in TILES:
        frames = [tile.generate(f"bc-{kind}-{v}", kind=kind) for v in range(3)]
        path = f"tiles/{kind}.png"
        strip(frames, cell=16).save(os.path.join(ASSETS, path))
        manifest["tiles"][kind] = {"src": path, "cell": 16, "variants": 3}

    # -- enemy keeps -------------------------------------------------------
    os.makedirs(os.path.join(ASSETS, "keeps"), exist_ok=True)
    keep = get_generator("settlement")
    for theme in KEEP_THEMES:
        im = keep.generate(f"bc-keep-{theme}", theme=theme, part="cottage")
        path = f"keeps/{theme}.png"
        im.image.save(os.path.join(ASSETS, path))
        manifest["keeps"][theme] = {"src": path}

    # -- decorative props --------------------------------------------------
    os.makedirs(os.path.join(ASSETS, "props"), exist_ok=True)
    prop = get_generator("prop")
    for ptype in ("brazier", "campfire", "lantern"):
        frames = [prop.generate(f"bc-{ptype}", prop_type=ptype, frame=f, frames=4) for f in range(4)]
        path = f"props/{ptype}.png"
        strip(frames).save(os.path.join(ASSETS, path))
        manifest["props"][ptype] = {"src": path, "anims": {"idle": [0, 4]}}

    with open(os.path.join(ASSETS, "manifest.js"), "w") as fh:
        fh.write("// Generated by tools/build_sprites.py — do not edit.\n")
        fh.write("window.BC_ASSETS = " + json.dumps(manifest, indent=1) + ";\n")
    n = sum(len(v) for v in manifest.values() if isinstance(v, dict))
    print(f"wrote {n} assets to {ASSETS}")


if __name__ == "__main__":
    main()
