# Image asset checklist

Every image on the site works today, but most of them are **placeholders**:

- **Generated illustrations.** The burger ingredients and menu products are SVGs drawn by `scripts/generate-art.mjs`. They're vector, transparent and aligned, but they're illustrations, not photographs.
- **Licensed stock photos.** The story and restaurant photography comes from Unsplash. It's free to use under the [Unsplash License](https://unsplash.com/license), but it isn't your restaurant.

This file lists what to shoot or render for launch, the rules each asset must follow, and how to swap it in.

Legend: `[x]` in place (placeholder or final) · `[ ]` still needed for production.

---

## 1. Exploded burger layers (highest priority)

**Used by:** the pinned hero and exploded-burger scene, the reduced-motion diagram, and the final call to action.
**Location:** `public/images/burger/`
**Currently:** the generated SVG illustrations, used as the **fallback**. The site is wired for the photographic PNGs and switches to them automatically once all seven exist and pass the checks.

| File | Ingredient | Illustrated fallback | Photo PNG |
| --- | --- | --- | --- |
| `top-bun.png` | Sesame brioche crown | [x] | [ ] |
| `lettuce.png` | Fresh green lettuce | [x] | [ ] |
| `tomato.png` | Red tomato slices | [x] | [ ] |
| `cheese.png` | Melted cheddar, draped | [x] | [ ] |
| `patty.png` | Smashed beef patty | [x] | [ ] |
| `sauce.png` | Signature sauce | [x] | [ ] |
| `bottom-bun.png` | Toasted heel, cut face up | [x] | [ ] |

**How to make them:** [BURGER-PROMPTS.md](BURGER-PROMPTS.md) covers the full spec, three workflows (Blender render rig, AI with structure guides, AI master shot plus cut-outs) and a copy-ready prompt for every layer.

### Rules the animation depends on

1. **One shared square canvas.** Every layer is 1600 × 1600 px, an RGBA PNG with a transparent background, not interlaced.
2. **Assembled position.** Each ingredient sits on its canvas exactly where it is in the finished burger. Stack all seven files without moving them and you see the whole burger.
3. **One camera.** Roughly 15° above the table, centred and level, with the same focal length and distance for every layer.
4. **One light.** The key light comes from the upper left, and it's identical for every layer.
5. **Clean cut-outs.** No background, watermark, or shadows or reflections from neighbouring layers. Each layer must look right on its own, including the surfaces hidden when assembled.
6. **Framing.** The assembled burger is about 72–78% of the canvas width, centred horizontally, with the stack centred vertically.

### Swapping them in

1. Put the seven PNGs in `public/images/burger/` (the file names above).
2. Open **http://localhost:5173/asset-preview.html** while `npm run dev` runs. It shows the assembled, exploded and individual views on a transparency checkerboard, with measured outlines, the centre axis, image dimensions, an alignment report and missing-file warnings. Use **Local files** to inspect PNGs before copying them in.
3. Run `npm run burger:check`. When all seven pass, it measures each ingredient's outline from its alpha channel, writes the outlines to `src/data/burger-layers.json` and sets `"art": "photo"`. The site switches over with nothing else to edit. The check also runs before every `npm run dev` and `npm run build`, so the site never mixes the two sets or requests a missing file.
4. If the real ingredients are thicker or thinner than the illustrations, tune how far each layer travels in the inspector's **Exploded** panel, copy the snippet, and paste it into `EXPLODE` in `src/data/burger.ts`.

`npm run art` only regenerates the illustrated fallbacks (each layer's `fallback` entry in the manifest). It keeps the photo set's paths, outlines and the `art` switch.

---

## 2. Menu product images

**Used by:** menu cards, the cart drawer and the showcase stand.
**Location:** `public/images/products/` (file names match the product `id` in `src/data/products.ts`).
**Currently:** generated SVG composites built from the same ingredient art, served as WebP renders of them (`<id>-800.webp` and `<id>-1600.webp`, picked by `srcset`). The SVGs carry 14–27 blur/noise filters each, which made the browser re-parse and re-rasterise them mid-scroll; the WebPs look the same (≈1/255 average pixel difference) and cost a fraction. After `npm run art` changes the illustrations, run `node scripts/rasterize-products.mjs` to refresh the WebPs (needs Playwright's Chromium, see the script).

- [x] `theory-classic` (also the showcase hero; render it at 2000 px if you can)
- [x] `double-trouble`
- [x] `fire-house`
- [x] `crispy-chicken`
- [x] `cheese-overload`
- [x] `ultimate-stack`
- [x] `nashville-heat`
- [x] `garden-theory`
- [x] `truffle-shroom`

**Production spec:**
- Transparent background, 1200 × 1200 px WebP with alpha, same camera angle as the layers.
- Every burger stands on the same table line at about 88% of the canvas height, and is about 70% of the canvas wide. Following this lets every card crop identically.
- Leave a little air above the tallest burger (the Ultimate Stack).
- After swapping, update `image` in `src/data/products.ts`. Name real photos `<id>-800.webp` and `<id>-1600.webp` and the `srcset` keeps working (`src/lib/productImage.ts`).

---

## 3. Brand story photography

**Location:** `public/images/story/`. Deliver each photo at **800 w and 1600 w** (WebP, quality about 60), and keep the dark, warm grade.

| File | Shows | Placeholder source (Unsplash) | Production |
| --- | --- | --- | --- |
| `smash-double-{800,1600}.webp` | Hero food shot, portrait 2:3 | `images.unsplash.com/photo-1607013251379-e6eecfffe234` | [ ] |
| `vine-tomatoes-800.webp` | Fresh ingredient detail, portrait | `images.unsplash.com/photo-1592924357228-91a4daadcfea` | [ ] |

The three diagram notes on the main photo (bun, pickle and crust) are pinned in percent. When the photo changes, re-check `NOTES` in `src/sections/BrandStory.tsx`.

---

## 4. Restaurant photography

**Location:** `public/images/restaurant/`. Deliver each photo at **800 w and 1600 w** WebP.

| File | Role in the layout | Crop | Placeholder source (Unsplash) | Production |
| --- | --- | --- | --- | --- |
| `dining-room` | Interior | 3:4 | `images.unsplash.com/photo-1590846406792-0adc7f938f1d` | [ ] |
| `grill-flame` | Burger preparation | 16:10 | `images.unsplash.com/photo-1600565193348-f74bd3c7ccdf` | [ ] |
| `burger-closeup` | Food | 4:5 | `images.unsplash.com/photo-1606131731446-5568d87113aa` | [ ] |
| `bar` | Wide closing strip | 21:9 (16:10 on phones) | `images.unsplash.com/photo-1514933651103-005eec06c04b` | [ ] |

---

## 5. Branding

- [x] Logo mark: `public/images/branding/logo-mark.svg`. The site uses the same mark inline in `src/components/Logo.tsx`.
- [x] Favicon: `public/favicon.svg`.
- [ ] Social share image (`og:image`), 1200 × 630 JPG. Add a `<meta property="og:image">` tag in `index.html`.
- [ ] Apple touch icon, 180 × 180 PNG.

---

## 6. Content placeholders (not images, but also not real yet)

- [ ] Address, phone, email, opening hours and social links in `src/data/site.ts`. The phone uses a reserved 555 number and the email uses the reserved `.example` domain.
- [ ] Menu names, descriptions and prices in `src/data/products.ts`.
- [ ] Ingredient copy for the exploded burger in `src/data/burger.ts`.
