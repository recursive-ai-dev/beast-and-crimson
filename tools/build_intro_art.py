#!/usr/bin/env python3
"""
Build the intro cut scene's extra sprites from Shed Dev Sprites.
================================================================

Deterministic like tools/build_sprites.py: every sprite is a pure function of a
fixed seed. The other intro art (sky, hills, river, reeds) is painted in code by
src/intro-scene.js, so this only produces the things Shed is good at.

    python3 tools/build_intro_art.py [--shed ~/Projects/shed-dev-sprites]

Needs Pillow and numpy. Writes assets/intro/*.png.
"""

from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets", "intro")

COTTAGES = [("moor", 0), ("coastal", 0), ("oldstone", 1), ("moor", 2)]
VILLAGERS = 6          # front-facing folk, idle
MOURNERS = 2           # seen from behind: the survivor at the water's edge
WARRIORS = 4           # rebel villagers facing right


def strip(frames, cell=32):
    from PIL import Image
    img = Image.new("RGBA", (cell * len(frames), cell), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im = f.image if hasattr(f, "image") else f
        if im.size != (cell, cell):
            im = im.resize((cell, cell), Image.NEAREST)
        img.paste(im, (i * cell, 0), im)
    return img


def first_seed(gen, base, ok=lambda s: s.image.getbbox() is not None, tries=64, **opts):
    for k in range(tries):
        seed = f"{base}#{k}" if k else base
        if ok(gen.generate(seed, **opts)):
            return seed
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--shed", default=os.path.expanduser("~/Projects/shed-dev-sprites"))
    args = ap.parse_args()
    sys.path.insert(0, args.shed)
    from generator.registry import get_generator

    os.makedirs(OUT, exist_ok=True)

    keep = get_generator("settlement")
    strip([keep.generate(f"bc-intro-cottage-{i}", theme=theme, part="cottage", variant=v)
           for i, (theme, v) in enumerate(COTTAGES)]).save(os.path.join(OUT, "cottages.png"))

    human = get_generator("human")
    folk = []
    for i in range(VILLAGERS):
        seed = first_seed(human, f"bc-intro-villager-{i}", direction="front", role="refugee", palette="cloth", master_palette="endesga32", sel_out=True)
        folk.append(human.generate(seed, direction="front", frame=0, role="refugee", palette="cloth", master_palette="endesga32", sel_out=True))
    strip(folk).save(os.path.join(OUT, "villagers.png"))

    backs = []
    for i in range(MOURNERS):
        seed = first_seed(human, f"bc-intro-mourner-{i}", direction="back", role="refugee", palette="cloth", master_palette="endesga32", sel_out=True)
        backs.append(human.generate(seed, direction="back", frame=0, role="refugee", palette="cloth", master_palette="endesga32", sel_out=True))
    strip(backs).save(os.path.join(OUT, "mourners.png"))

    rebels = []
    for i in range(WARRIORS):
        seed = first_seed(human, f"bc-intro-rebel-{i}", direction="right", role="guard", palette="cloth", master_palette="endesga32", sel_out=True)
        rebels.append(human.generate(seed, direction="right", frame=i % 4, frames=4, action="walk", role="guard", palette="cloth", master_palette="endesga32", sel_out=True))
    strip(rebels).save(os.path.join(OUT, "warriors.png"))

    mount = get_generator("mount")
    cavalry = [mount.generate("bc-intro-cavalry", faction="human", direction="left", action="walk", frame=f, frames=4, cell=48) for f in range(4)]
    strip(cavalry, cell=48).save(os.path.join(OUT, "cavalry.png"))

    machine = get_generator("machine")
    siege = [machine.generate("bc-intro-siege", faction="corrupted", direction="left", action="attack", frame=f, frames=4, cell=48) for f in range(4)]
    strip(siege, cell=48).save(os.path.join(OUT, "siege.png"))

    citadel = get_generator("structure", size=96).generate("bc-intro-citadel", faction="corrupted", kind="hall")
    citadel.image.save(os.path.join(OUT, "citadel.png"))

    tower_gen = get_generator("structure", size=64)
    towers = [
        tower_gen.generate("bc-intro-tower-0", faction="corrupted", kind="tower"),
        tower_gen.generate("bc-intro-tower-1", faction="darkelf", kind="tower"),
    ]
    strip(towers, cell=64).save(os.path.join(OUT, "towers.png"))

    print(f"wrote intro sprites to {OUT}")


if __name__ == "__main__":
    main()
