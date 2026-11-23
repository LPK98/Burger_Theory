# Photoreal burger layers: production guide and prompts

The exploded burger is the centrepiece of the site. It needs **seven transparent PNGs that are all cut from one burger**: the same camera, the same light, the same scale. Each ingredient sits exactly where it belongs in the assembled stack. This guide covers how to make them, the prompts to use, and how to check them before they go live.

Until all seven exist and pass the checks, the site keeps using the generated illustrations, so nothing breaks while you work.

---

## 1. What to deliver

Put the files in `public/images/burger/`.

| File | Ingredient | Where it sits on the 1600 × 1600 canvas (x0–x1, y0–y1 px) |
| --- | --- | --- |
| `top-bun.png` | Sesame brioche crown | 224–1376, 418–890 |
| `lettuce.png` | Fresh green lettuce | 179–1413, 584–950 |
| `tomato.png` | Red tomato slices (3) | 214–1379, 630–941 |
| `cheese.png` | Melted orange cheddar, draped | 192–1421, 658–1058 |
| `patty.png` | Smashed beef patty, crispy edges | 197–1414, 656–1048 |
| `sauce.png` | Creamy signature sauce | 299–1333, 778–1072 |
| `bottom-bun.png` | Toasted brioche heel, cut face up | 216–1384, 771–1182 |

These positions come from the current illustrated layers. They aren't strict, but staying close keeps the page layout (captions, headline, shadows) fitting without retuning.

**Every file must have:**

- **Canvas:** 1600 × 1600 px, PNG, RGBA (32-bit), transparent background, not interlaced.
- **Position:** the ingredient at its **assembled** position. If you stack all seven files untouched, you see the complete burger. Never crop or centre an ingredient on its own canvas.
- **Camera:** about 15° above the burger, looking slightly down, centred and level. Use a long lens (85–100 mm equivalent) so there's little perspective distortion. Keep it identical for every layer.
- **Light:** a large soft key light from the upper left, soft fill from the right and a subtle warm rim from behind. Keep it identical for every layer.
- **Colour:** one grade across the set: warm, natural and appetising, not oversaturated.
- **Clean cut-outs:** no plate, board, table, drop shadow or background haze. No shadows from neighbouring layers either: each layer has to look right floating on its own, because the site separates them.
- **Hidden surfaces:** include the parts of each ingredient that are hidden when assembled (the whole top of the patty, the cut face of the heel). They show when the burger comes apart.

---

## 2. Choose a workflow

### A. 3D render (best: alignment is guaranteed)

Build or buy one burger model, assembled. Food photogrammetry scans give the most realistic result. Put each ingredient in its own Blender collection, named exactly like the files (`top-bun`, `lettuce`, `tomato`, `cheese`, `patty`, `sauce`, `bottom-bun`). Keep the lights outside those seven collections, then run:

```bash
blender burger.blend --background --python scripts/blender/render_layers.py -- --out public/images/burger
```

The script renders every collection alone with the same camera, lights and settings onto a transparent 1600 × 1600 canvas. The PNGs stack perfectly with no manual alignment. Use Cycles, subsurface scattering for the bun crumb, cheese and tomato, and a slightly glossy clearcoat on the bun glaze and the melted cheese.

### B. AI image generation with structure guides (recommended if you don't have a 3D model)

Image generators can't reliably place seven separate images at the right size and position. The illustrated layers already sit at the exact assembled positions, so use them as guides:

1. Run `npm run dev` and open **http://localhost:5173/asset-preview.html**. Under **05 Generation guides**, download the **guide layers** and **silhouette masks** (1600 × 1600 each).
2. For each layer, generate with the guide as structure input. Use image-to-image at a denoise of about 0.55–0.7, or ControlNet (depth or canny) at a weight of about 0.6–0.8. Paste the layer's prompt from section 4.
3. Use the same seed, model, sampler and style reference for all seven, so the light and grade match.
4. Remove the background (see section 5), then check the layer in the inspector on top of the guide.

### C. AI master shot plus cut-outs

1. Generate one "floating exploded burger" image with the master prompt in section 4. All ingredients come from one image, so light, perspective and grade match automatically.
2. Cut each ingredient out with a precise mask.
3. In one 1600 × 1600 document (Photoshop, Affinity or Photopea), put each cut-out on its own layer. Scale them all by the **same** factor, centre them on one vertical axis, then move each one **only vertically** until the stack forms the assembled burger. The downloadable **assembled reference** guide helps here.
4. Export each layer as its own PNG (Photoshop: *File › Export › Layers to Files*), keeping the full canvas size.
5. Retouch the surfaces each ingredient had hidden in the master shot, so they look complete when separated.

---

## 3. Shared style (paste into every prompt)

> Professional commercial food photography, photorealistic, premium burger advertising. Camera 15 degrees above the subject looking slightly down, 100 mm lens, f/11, everything in sharp focus, centred and level. Large softbox key light from the upper left, soft white fill from the right, subtle warm rim light from behind. Natural highlights, realistic micro-texture, appetising warm colour grade, true-to-life colour. Isolated on a pure transparent background (or a seamless flat mid-grey #808080 if transparency isn't supported). No plate, no table, no props, no hands, no text, no drop shadow. Square 1:1.

**Negative prompt** (for tools that take one):

> cartoon, illustration, vector, 3D toon render, clay, plastic, CGI look, oversaturated, neon, HDR halo, plate, board, table, background scene, hands, text, watermark, logo, multiple burgers, extra ingredients, cropped, out of frame, motion blur, depth-of-field blur, harsh shadow, drop shadow, reflection

Tool tips:

- **Midjourney:** append `--ar 1:1 --style raw`. Use the first good layer (or the master shot) as `--sref` for the other six.
- **Stable Diffusion / Flux with ControlNet:** use the guide PNG as the control image and keep the seed fixed.
- **Tools that output transparency directly:** request a transparent background and PNG output.
- **Upscaling:** most tools output at 1024 or 2048 px. Bring every layer to 1600 px with the **same** scale factor and method, then pad or crop all of them identically, never individually.

---

## 4. Prompts

Each prompt describes the ingredient as it looks **in the assembled burger**, seen from the shared camera. When generating without a guide image, add the placement line from the table in section 1.

### 4.1 Top bun: `top-bun.png`

```
The top half (crown) of a glossy brioche burger bun, high rounded dome, deep amber-gold
egg-washed glaze with a soft lacquered sheen, colour fading to pale gold at the rim, fine
natural crust cracks, scattered white and lightly toasted sesame seeds following the
curve of the dome, slightly flared lower rim, seen from 15 degrees above so the dome and a
little of the side are visible, the cut underside not visible. Soft specular highlight on
the upper left of the dome. Centred horizontally, occupying the upper part of the square
frame, about 72% of the frame width.
+ shared style block
```

### 4.2 Lettuce: `lettuce.png`

```
A single layer of fresh crisp green leaf lettuce exactly as it sits inside a burger: a
roughly round, flat, ruffled ring about 1 cm thick with frilly wavy edges extending a little
past the patty diameter all round, vibrant fresh green with pale yellow-green veins and
crunchy ribs, a few tiny water droplets catching the light, translucent where the leaf is
thin. Seen from 15 degrees above. Centred horizontally, about 77% of the frame width,
slightly above the middle of the frame. The rest of the burger is not visible.
+ shared style block
```

### 4.3 Tomato: `tomato.png`

```
Three overlapping slices of ripe red vine tomato arranged in a flat ring as they sit inside
a burger, each slice 6 mm thick, glossy wet cut faces, visible seed chambers with jelly and
seeds, paler inner walls, deep red skin edge, slight translucency at the rim, juicy and
fresh. Seen from 15 degrees above. Centred horizontally, about 73% of the frame width,
just above the middle of the frame. No other ingredients visible.
+ shared style block
```

### 4.4 Cheese: `cheese.png`

```
A single square slice of melted orange cheddar draped as if over a round beef patty that
has been removed: the centre lies flat, the four corners droop and fold down over the
invisible edge, two short glossy drips hanging from the corners. Smooth semi-gloss melted
surface, slightly translucent where it is thin, rich warm orange. Seen from 15 degrees
above. Centred horizontally, about 77% of the frame width, a little below the middle of
the frame. The patty is not visible.
+ shared style block
```

### 4.5 Beef patty: `patty.png`

```
A juicy smashed beef patty, round with irregular lacy crispy edges, about 1.5 cm thick, a
deep caramelised Maillard crust on top, dark brown to near-black crunchy fringes, coarse
ground-beef texture visible at the edge, glistening rendered juices and small fat
highlights. Seen from 15 degrees above so the whole top surface and the side are visible.
Centred horizontally, about 76% of the frame width, a little below the middle of the
frame. No bun, cheese or other ingredients.
+ shared style block
```

### 4.6 Sauce: `sauce.png`

```
A layer of creamy signature burger sauce spread in a round disc as if on a toasted bun
that has been removed: pale orange-pink, smooth and glossy, with tiny flecks of pickle and
paprika, slightly thicker towards the middle, two soft drips over the edge. Seen from 15
degrees above. Centred horizontally, about 65% of the frame width, below the middle of the
frame. Nothing else visible.
+ shared style block
```

### 4.7 Bottom bun: `bottom-bun.png`

```
The bottom half (heel) of a brioche burger bun, cut face up, toasted on a griddle: golden-
brown caramelised crumb surface with darker toasted edges and fine open crumb texture,
soft pale golden side crust, slightly flat. Seen from 15 degrees above so the toasted cut
face and the side are visible. Centred horizontally, about 73% of the frame width, in the
lower part of the frame. Nothing on top of it.
+ shared style block
```

### 4.8 Master shot (workflow C)

```
Professional commercial food photograph of a gourmet smashed cheeseburger in exploded
view: the ingredients float vertically separated with even gaps, perfectly centred on one
vertical axis. From top to bottom: glossy sesame brioche top bun; ruffled fresh green
lettuce; three red tomato slices; a slice of melted orange cheddar with draped corners; a
juicy smashed beef patty with crispy lacy edges; a disc of creamy pale-orange burger sauce;
a toasted brioche bottom bun, cut face up. Camera 15 degrees above, 100 mm lens, f/11, all
layers in sharp focus. Large softbox key light from the upper left, soft fill from the
right, warm rim light. Isolated on a seamless flat mid-grey background, no shadows on the
background. Premium burger advertising, photorealistic, square 1:1.
```

---

## 5. Finishing each layer

1. **Background removal.** Use a proper matting tool or a hand-refined mask, not a one-click magic wand. Check the edges at 200%: no grey or white halo, and soft natural edges on the lettuce frills and the cheese drips.
2. **Canvas.** 1600 × 1600 px, ingredient at its assembled position (section 1). Export PNG-24 with alpha, not interlaced.
3. **Consistency pass.** Put all seven in one document and match exposure, white balance and contrast so the stack reads as one photograph.
4. **File size.** Photographic 1600 px PNGs are often 1.5–3 MB each. Run them through a lossless optimiser (for example oxipng or ImageOptim) before committing. Section 7 covers lighter formats.

---

## 6. Check them, then switch the site over

1. Run `npm run dev` and open **http://localhost:5173/asset-preview.html**.
   - **Local files** lets you pick PNGs straight from your disk to inspect them before copying them in.
   - **Assembled** must read as one burger. Hover a layer in the list to isolate it, and turn on **Illustration ghost** or **Layout envelope** to compare framing with the current art.
   - **Exploded** shows the pose the scroll scene holds. Drag the slider or press **Play**. If your ingredients are thicker or thinner than the illustrations, tune the offsets and click **Copy snippet**, then paste it into `EXPLODE` in `src/data/burger.ts`.
   - The **Alignment report** and **Individual layers** show each file's canvas size, alpha, measured outline, distance off the centre axis and any problems.
2. Run `npm run burger:check`. It applies the same rules from the command line. When all seven pass, it measures each outline (used for rotation origins, caption leader lines, the table shadow and the landing squash) and switches `art` to `photo` in `src/data/burger-layers.json`. The site then uses the PNGs.
3. Run `npm run build`. The check also runs before every `dev` and `build`, so a build never ships a half-finished set. If a PNG goes missing or stops passing, the site falls back to the illustrations on its own.

To force the illustrations while the PNGs are present, set `BURGER_ART=illustration` for that command: `BURGER_ART=illustration npm run build` in Bash, or `$env:BURGER_ART='illustration'; npm run build` in PowerShell. In PowerShell, clear it afterwards with `Remove-Item Env:BURGER_ART`.

---

## 7. Troubleshooting

| Symptom in the inspector or check | Cause | Fix |
| --- | --- | --- |
| "Every ingredient is centred on its own canvas" | Each layer was exported cropped and centred. | Place every ingredient at its assembled position on one shared canvas (workflow C, step 3). |
| "The top bun isn't above the bottom bun" | Files swapped, or the layers aren't at assembled positions. | Check the file names and positions against section 1. |
| "Opaque corners" or "No transparent pixels" | The background wasn't removed, or the file was saved as JPG-in-PNG or RGB. | Re-export as an RGBA PNG with real transparency. |
| "Touches the canvas edge" | The ingredient is cropped by the canvas. | Leave a margin all round. |
| "% as wide as the bottom bun" | One layer was rendered or upscaled at a different scale. | Re-export with the same scale factor as the rest. |
| "% left/right of centre" | The layer isn't on the shared vertical axis. | Nudge it horizontally in the shared document. |
| The assembled view shows gaps or overlaps between layers | Vertical positions are off. | Move the layer vertically in the shared document. Never squash or stretch it. |
| The exploded view has too little or too much air between layers | The real ingredients are thicker or thinner than the illustrations. | Tune `EXPLODE` with the inspector's offsets table. |
| The page feels heavy on mobile | Seven large PNGs. | Optimise them losslessly (oxipng, ImageOptim). Serving WebP or AVIF instead would need a small change to `scripts/burger-check.mjs`, which only reads PNG. |
