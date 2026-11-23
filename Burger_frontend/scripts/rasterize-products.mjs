/**
 * Pre-renders the menu illustrations (public/images/products/<id>.svg) to WebP.
 *
 *   public/images/products/<id>-800.webp    cards, cart thumbnails
 *   public/images/products/<id>-1600.webp   the showcase on high-density screens
 *
 * Why: each illustration carries 14–27 SVG filters (blur + turbulence). Browsers parse an SVG
 * image on the main thread when it loads and re-rasterise those filters whenever the image is
 * drawn at a new scale (the showcase lowering in, card hover, the fly-to-cart copy). That cost
 * landed mid-scroll as dropped frames. A WebP is decoded off the main thread and scales cheaply.
 *
 * Rendering is done by Chromium, the same engine that drew the SVGs on screen, so the pixels
 * match. Run after `npm run art` changes the illustrations:
 *
 *   node scripts/rasterize-products.mjs
 *
 * Needs Playwright with Chromium. It isn't a project dependency; install it once with
 * `npx playwright install chromium`, or point PLAYWRIGHT_PATH at an existing copy.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const DIR = 'public/images/products'
const WIDTHS = [800, 1600]
const QUALITY = 0.9

function loadPlaywright() {
  for (const id of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) {
    try {
      return require(id)
    } catch {
      // try the next one
    }
  }
  console.error('Playwright not found. Run `npx playwright install chromium` (or set PLAYWRIGHT_PATH).')
  process.exit(1)
}

const { chromium } = loadPlaywright()
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'))
  for (const file of files) {
    const svg = readFileSync(join(DIR, file), 'utf8')
    const id = file.replace(/\.svg$/, '')
    for (const width of WIDTHS) {
      const dataUrl = await page.evaluate(
        async ({ svg, width, quality }) => {
          const img = new Image()
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = Math.round((width * img.naturalHeight) / img.naturalWidth)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          return canvas.toDataURL('image/webp', quality)
        },
        { svg, width, quality: QUALITY },
      )
      const out = join(DIR, `${id}-${width}.webp`)
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
      writeFileSync(out, bytes)
      console.log(`${out}  ${(bytes.length / 1024).toFixed(0)} kB`)
    }
  }
} finally {
  await browser.close()
}
