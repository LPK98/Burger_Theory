"""
Render the seven exploded-burger layers from one Blender scene.

Every layer is rendered with the same camera, lights, world and colour management, one
collection at a time, on a transparent square canvas. The PNGs therefore stack into the
assembled burger with no manual alignment (see BURGER-PROMPTS.md, workflow A).

Scene setup:
  * Model the burger ASSEMBLED: every ingredient where it sits in the finished burger.
    Model the surfaces that are hidden when assembled too (the patty's top, the heel's
    cut face): they show when the site pulls the burger apart.
  * One collection per layer, named exactly:
      top-bun, lettuce, tomato, cheese, patty, sauce, bottom-bun
    (they can be nested anywhere in the outliner).
  * Lights and world live OUTSIDE those seven collections, so every layer gets the same light.
  * An active scene camera: about 15 degrees above the burger, centred and level,
    85-100 mm focal length, framing the burger at about 72-78% of the frame width.

Run (Blender 3.6 or newer):
  blender burger.blend --background --python scripts/blender/render_layers.py -- --out public/images/burger

Options (after the `--`):
  --out DIR       output folder (default: //renders, next to the .blend file)
  --size N        canvas size in pixels (default 1600)
  --samples N     Cycles samples (default 256)
  --only a,b      render only these layers

Then run `npm run burger:check` to verify the set and switch the site to it.
"""

import argparse
import os
import sys

import bpy

LAYERS = ["bottom-bun", "sauce", "patty", "cheese", "tomato", "lettuce", "top-bun"]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="render_layers.py")
    parser.add_argument("--out", default="//renders")
    parser.add_argument("--size", type=int, default=1600)
    parser.add_argument("--samples", type=int, default=256)
    parser.add_argument("--only", default="")
    return parser.parse_args(argv)


def find_layer_collection(root, name):
    """Depth-first search of the view layer's collection tree."""
    if root.name == name:
        return root
    for child in root.children:
        found = find_layer_collection(child, name)
        if found is not None:
            return found
    return None


def fail(message):
    print(f"render_layers: {message}", file=sys.stderr)
    sys.exit(1)


def main():
    args = parse_args()
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer

    if scene.camera is None:
        fail("the scene has no active camera")

    found = {name: find_layer_collection(view_layer.layer_collection, name) for name in LAYERS}
    missing = [name for name, lc in found.items() if lc is None]
    if missing:
        fail(f"missing collections: {', '.join(missing)} (names must match exactly)")

    only = [s.strip() for s in args.only.split(",") if s.strip()] or LAYERS
    unknown = [name for name in only if name not in LAYERS]
    if unknown:
        fail(f"unknown layers in --only: {', '.join(unknown)}")

    # One shared output spec for every layer.
    render = scene.render
    render.engine = "CYCLES"
    scene.cycles.samples = args.samples
    render.resolution_x = args.size
    render.resolution_y = args.size
    render.resolution_percentage = 100
    render.pixel_aspect_x = 1
    render.pixel_aspect_y = 1
    render.use_border = False
    render.use_motion_blur = False
    render.film_transparent = True
    settings = render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "RGBA"
    settings.color_depth = "8"
    settings.compression = 90

    out_dir = bpy.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    original = {name: lc.exclude for name, lc in found.items()}
    try:
        for name in only:
            # Render this ingredient alone: no occlusion by, and no shadows from, its neighbours.
            for other, lc in found.items():
                lc.exclude = other != name
            render.filepath = os.path.join(out_dir, f"{name}.png")
            print(f"render_layers: {name} -> {render.filepath}")
            bpy.ops.render.render(write_still=True)
    finally:
        for name, lc in found.items():
            lc.exclude = original[name]

    print("render_layers: done. Run `npm run burger:check` to verify the set.")


main()
