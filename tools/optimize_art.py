#!/usr/bin/env python3
"""Optimize bundled PNGs in assets/art/ for web and desktop distribution.

Resizes oversized stage paintings (1043x1508 -> 480px wide) and the title crest
(1254x1254 -> 256x256), applies 256-color palette quantization via ffmpeg, and
runs optipng for lossless compression. Safe to re-run; skips files already at or
below target width unless --force is passed.
"""
import argparse
import glob
import os
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_DIR = os.path.join(ROOT, "assets", "art")


def get_size(path: str) -> tuple[int, int]:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path],
        text=True,
    ).strip()
    w, h = out.split("x")
    return int(w), int(h)


def optimize_png(path: str, target_w: int, palette: bool, force: bool) -> None:
    before = os.path.getsize(path)
    w, h = get_size(path)
    if not force and w <= target_w and not palette:
        return

    with tempfile.TemporaryDirectory() as tmp:
        pal = os.path.join(tmp, "palette.png")
        out = os.path.join(tmp, "out.png")
        scale_w = min(w, target_w)
        vf_scale = f"scale={scale_w}:-2:flags=lanczos"

        if palette:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", path,
                 "-vf", f"{vf_scale},palettegen=max_colors=256:reserve_transparent=1", pal],
                check=True,
            )
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", path, "-i", pal,
                 "-lavfi", f"{vf_scale} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3", out],
                check=True,
            )
        elif w > target_w:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", path, "-vf", vf_scale, out],
                check=True,
            )
        else:
            shutil.copy2(path, out)

        if shutil.which("optipng"):
            subprocess.run(["optipng", "-quiet", "-o2", out], check=True)

        after = os.path.getsize(out)
        if after < before or w > target_w:
            shutil.move(out, path)
            nw, nh = get_size(path)
            pct = (1 - after / before) * 100
            print(f"  {os.path.basename(path):18s} {w}x{h} -> {nw}x{nh} | {before//1024:4d}KB -> {after//1024:4d}KB ({pct:+.1f}%)")
        else:
            print(f"  {os.path.basename(path):18s} kept ({before//1024}KB)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Optimize assets/art PNGs.")
    parser.add_argument("--force", action="store_true", help="Re-optimize even if already resized.")
    args = parser.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe are required.")

    print("Optimizing assets/art/:")
    crest = os.path.join(ART_DIR, "crest.png")
    if os.path.exists(crest):
        optimize_png(crest, 256, palette=True, force=args.force)

    for path in sorted(glob.glob(os.path.join(ART_DIR, "stage-*.png"))):
        optimize_png(path, 480, palette=True, force=args.force)

    for path in sorted(glob.glob(os.path.join(ART_DIR, "menu-*.png"))):
        optimize_png(path, 448, palette=False, force=args.force)


if __name__ == "__main__":
    main()
