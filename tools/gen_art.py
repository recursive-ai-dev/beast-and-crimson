#!/usr/bin/env python3
"""Generate the painted menu art (menu backdrops, biome cards, title crest).

Images come from free Hugging Face Spaces (FLUX.1-schnell for generation,
BiRefNet for background removal) through their public Gradio API, and are then
pixelated with Pillow so they sit next to the Shed sprites. Seeds are fixed, so
re-running yields the same pictures as long as the Space's model is unchanged.

    python3 tools/gen_art.py               # everything missing
    python3 tools/gen_art.py --force crest  # regenerate one asset (name prefix)

Raw downloads are cached in tools/.art-cache/ (git-ignored); finished images go
to assets/art/.
"""
import json, sys, time, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".art-cache"
OUT = ROOT / "assets" / "art"
FLUX = "https://evalstate-flux1-schnell.hf.space"
REMBG = "https://not-lain-background-removal.hf.space"

STYLE = "dark fantasy 16-bit pixel art, moody cinematic lighting, rich crimson and deep shadow, highly detailed, no text, no people in foreground"
SCENE = "wide landscape game background, empty center for a menu, " + STYLE

# name: (prompt, seed, (w, h) to generate, (w, h) pixel grid, colours, cutout)
ART = {
    "menu-offense": ("volcanic war camp of a beast tribe at night, rivers of lava, burning totem poles with skulls, ember storm, red sky, " + SCENE, 101, (1344, 768), (448, 256), 48, False),
    "menu-defense": ("ancient misty forest beside a wide river, standing stones carved with blue runes, snowy mountains behind, moonlight, " + SCENE, 202, (1344, 768), (448, 256), 48, False),
    "menu-greed": ("vast treasure cave of a goblin tribe, mountains of gold coins, glowing green gems, golden idols, lanterns, " + SCENE, 303, (1344, 768), (448, 256), 48, False),
    "crest": ("game logo crest, a snarling crimson wolf skull carved from black stone with glowing red eyes, two crossed bone axes behind, gold rim, symmetrical, centered, 16-bit pixel art, isolated on a plain flat white background", 4117, (768, 768), (160, 160), 40, True),
}
BIOMES = [
    "a bleeding crimson forest with red leaves falling upward",
    "obsidian glass wastes with cracks of glowing lava",
    "a cavern of whispering echoes with faint blue crystals",
    "a blood-red marsh with drowned reeds and fog",
    "a dark shore where black tides pull inward under a green moon",
    "a towering iron fortress with chains and furnace light",
    "jagged mountain peaks under falling black snow",
    "endless dark plains bending toward a black obelisk",
    "red sand dunes with half-buried giant armour and bones",
    "a haunted spirit valley with a ghostly golden throne",
]
for i, b in enumerate(BIOMES):
    ART[f"stage-{i + 1:02d}"] = (b + ", tall portrait card art, " + STYLE, 1000 + i * 37, (576, 832), (144, 208), 40, False)


def gradio(base, endpoint, data, timeout=300):
    req = urllib.request.Request(f"{base}/gradio_api/call/{endpoint}", data=json.dumps({"data": data}).encode(),
                                 headers={"Content-Type": "application/json"})
    eid = json.load(urllib.request.urlopen(req, timeout=60))["event_id"]
    event = None
    with urllib.request.urlopen(f"{base}/gradio_api/call/{endpoint}/{eid}", timeout=timeout) as r:
        for raw in r:
            line = raw.decode().strip()
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:") and event in ("complete", "error"):
                payload = json.loads(line[5:])
                if event == "error":
                    raise RuntimeError(f"{base} {endpoint}: {payload}")
                return payload
    raise RuntimeError(f"{base} {endpoint}: stream ended without a result")


def file_url(x):
    if isinstance(x, list):
        x = x[0]
    if isinstance(x, dict):
        return x.get("url") or x.get("path")
    return x


def fetch(url, dest):
    urllib.request.urlretrieve(url, dest)
    return dest


def generate(name, prompt, seed, size, cutout):
    raw = CACHE / f"{name}.png"
    if raw.exists():
        return raw
    for attempt in range(2):
        try:
            res = gradio(FLUX, "infer", [prompt, seed, False, size[0], size[1], 4])
            url = file_url(res[0])
            if cutout:
                res = gradio(REMBG, "image", [{"path": url, "meta": {"_type": "gradio.FileData"}}])
                url = file_url(res[0] if not isinstance(res[0], list) else res[0][-1])
            return fetch(url, raw)
        except Exception as e:  # ZeroGPU queues are flaky; back off and retry
            print(f"  {name}: {e}; retrying", file=sys.stderr)
            time.sleep(15 * (attempt + 1))
    print(f"  {name}: skipped (Space unavailable or out of quota); re-run later", file=sys.stderr)
    return None


def pixelate(src, grid, colours, cutout):
    im = Image.open(src).convert("RGBA")
    if cutout:
        im = im.crop(im.getbbox())
        side = max(im.size)
        sq = Image.new("RGBA", (side, side))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = sq
    small = im.resize(grid, Image.LANCZOS)
    alpha = small.getchannel("A").point(lambda a: 255 if a > 110 else 0)
    rgb = small.convert("RGB").quantize(colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    rgb.putalpha(alpha)
    return rgb


def main():
    args = sys.argv[1:]
    force = args[args.index("--force") + 1] if "--force" in args else None
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (prompt, seed, size, grid, colours, cutout) in ART.items():
        dest = OUT / f"{name}.png"
        if force and name.startswith(force):
            (CACHE / f"{name}.png").unlink(missing_ok=True)
        elif dest.exists():
            continue
        print("generating", name)
        raw = generate(name, prompt, seed, size, cutout)
        if raw:
            pixelate(raw, grid, colours, cutout).save(dest, optimize=True)


if __name__ == "__main__":
    main()
