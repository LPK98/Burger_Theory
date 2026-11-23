#!/usr/bin/env node
/**
 * Checks the photographic exploded-burger layers and switches the site to them once they're ready.
 *
 *   npm run burger:check                     full report, updates src/data/burger-layers.json
 *   npm run burger:check -- --strict         also exit 1 unless the photo set is live (for CI)
 *   BURGER_ART=illustration npm run build    keep the illustrated fallback even if the PNGs pass
 *
 * It also runs quietly before `npm run dev` and `npm run build`, so a build ships either all seven
 * photo layers or all seven illustrations, never a broken mix and never a request for a missing file.
 *
 * For each layer it reads public/images/burger/<id>.png, checks size, alpha and background, then
 * measures the ingredient's outline (bbox) from the alpha channel and writes it to the manifest.
 * The outline sets each layer's rotation origin and where the caption leader lines point.
 * The rules themselves live in ./burger-rules.mjs, shared with asset-preview.html.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { checkLayer, checkSet, formatManifest, measureAlpha, pngInfo } from './burger-rules.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = resolve(ROOT, 'src/data/burger-layers.json')
const argv = process.argv.slice(2)
const STRICT = argv.includes('--strict')
const QUIET = argv.includes('--quiet')
const FORCE_FALLBACK = process.env.BURGER_ART === 'illustration'

/** Reverses PNG scanline filtering. */
function unfilter(raw, height, rowBytes, bpp) {
  const out = new Uint8Array(height * rowBytes)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const row = y * rowBytes
    const prev = row - rowBytes
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[p++]
      const a = i >= bpp ? out[row + i - bpp] : 0
      const b = y > 0 ? out[prev + i] : 0
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0
      let v
      if (filter === 0) v = x
      else if (filter === 1) v = x + a
      else if (filter === 2) v = x + b
      else if (filter === 3) v = x + ((a + b) >> 1)
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      } else throw new Error(`unknown PNG filter ${filter} on row ${y}`)
      out[row + i] = v & 255
    }
  }
  return out
}

/** Decodes a PNG's alpha channel into one byte per pixel (8/16-bit, every colour type, not interlaced). */
function decodeAlpha({ width, height, depth, color, trns, idat }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color]
  if (!channels) throw new Error(`unknown colour type ${color}`)
  const bits = channels * depth
  const rowBytes = Math.ceil((width * bits) / 8)
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length < height * (rowBytes + 1)) throw new Error('the image data is truncated')
  const px = unfilter(raw, height, rowBytes, Math.max(1, bits >> 3))
  const wide = depth === 16 ? 2 : 1
  // One sample of a single-channel (grey or palette) image, any bit depth.
  const sample = (row, x) => {
    if (depth === 8) return px[row + x]
    if (depth === 16) return (px[row + 2 * x] << 8) | px[row + 2 * x + 1]
    const bit = x * depth
    return (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
  }
  const key = (c) => (trns[c * 2] << 8) | trns[c * 2 + 1]
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes
    for (let x = 0; x < width; x++) {
      let a = 255
      if (color === 6) a = px[row + (x * 4 + 3) * wide]
      else if (color === 4) a = px[row + (x * 2 + 1) * wide]
      else if (color === 3) {
        const index = sample(row, x)
        a = trns && index < trns.length ? trns[index] : 255
      } else if (trns && color === 0) a = sample(row, x) === key(0) ? 0 : 255
      else if (trns && color === 2) {
        let match = true
        for (let c = 0; c < 3 && match; c++) {
          const o = row + (x * 3 + c) * wide
          match = (wide === 2 ? (px[o] << 8) | px[o + 1] : px[o]) === key(c)
        }
        a = match ? 0 : 255
      }
      alpha[y * width + x] = a
    }
  }
  return alpha
}

function inspect(layer) {
  const file = resolve(ROOT, 'public', layer.src.replace(/^\//, ''))
  const result = { id: layer.id, file: relative(ROOT, file).replaceAll('\\', '/'), issues: [] }
  if (!existsSync(file)) return { ...result, missing: true }

  const bytes = readFileSync(file)
  const info = pngInfo(bytes)
  if (!info) return { ...result, bytes: bytes.length, issues: [{ level: 'error', text: 'Not a PNG file.' }] }

  let measure = null
  const decodeIssues = []
  if (info.hasAlpha && !info.interlaced) {
    try {
      measure = measureAlpha(decodeAlpha(info), info.width, info.height)
    } catch (err) {
      decodeIssues.push({ level: 'error', text: `Couldn’t decode the image: ${err.message}.` })
    }
  }
  const issues = [
    ...checkLayer({ id: layer.id, format: 'png', width: info.width, height: info.height, hasAlpha: info.hasAlpha, interlaced: info.interlaced, measure }),
    ...decodeIssues,
  ]
  return { ...result, bytes: bytes.length, width: info.width, height: info.height, measure, issues }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const results = manifest.layers.map(inspect)
const present = results.filter((r) => !r.missing)
// Layers that already failed on their own (opaque, unreadable) would only add noise to the set checks.
const failed = (r) => r.issues.some((i) => i.level === 'error')
const setIssues = checkSet(
  present.filter((r) => r.width).map((r) => ({ id: r.id, width: r.width, height: r.height, bbox: failed(r) ? null : (r.measure?.bbox ?? null) })),
)
const allIssues = [...results.flatMap((r) => r.issues), ...setIssues]
const errors = allIssues.filter((i) => i.level === 'error').length
const warnings = allIssues.length - errors
const ready = present.length === results.length && errors === 0
const art = ready && !FORCE_FALLBACK ? 'photo' : 'illustration'

// Update the manifest only when something changed, so the dev server doesn't reload for nothing.
const next = {
  ...manifest,
  art,
  layers: manifest.layers.map((layer, i) => ({ ...layer, bbox: results[i].measure?.bbox ?? null })),
}
const changed = formatManifest(next) !== readFileSync(MANIFEST, 'utf8')
if (changed) writeFileSync(MANIFEST, formatManifest(next))

/* — report — */
const reason = FORCE_FALLBACK
  ? 'BURGER_ART=illustration is set'
  : present.length < results.length
    ? `${results.length - present.length} of ${results.length} photo layers are missing`
    : `${errors} problem${errors === 1 ? '' : 's'} to fix`
const outcome =
  art === 'photo'
    ? `The site uses the photo layers${warnings ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''}.`
    : `The site uses the illustrated fallback: ${reason}.`

if (QUIET && (present.length === 0 || (ready && warnings === 0))) {
  const tail = present.length === 0 ? ' Add public/images/burger/*.png (see BURGER-PROMPTS.md) to switch.' : ''
  console.log(`burger:check  ${outcome}${tail}`)
} else {
  const pad = (s, n) => String(s).padEnd(n)
  console.log('\nBurger layers  (public/images/burger)\n')
  for (const r of results) {
    const name = r.file.split('/').pop()
    if (r.missing) {
      console.log(`  ${pad('MISSING', 8)} ${name}`)
      continue
    }
    const status = r.issues.some((i) => i.level === 'error') ? 'ERROR' : r.issues.length ? 'WARN' : 'OK'
    const size = r.width ? `${r.width} × ${r.height}` : ''
    const kb = `${Math.round(r.bytes / 1024)} KB`
    const box = r.measure?.bbox ? `outline ${r.measure.bbox.join(' ')}` : ''
    console.log(`  ${pad(status, 8)} ${pad(name, 15)} ${pad(size, 12)} ${pad(kb, 9)} ${box}`)
    for (const issue of r.issues) console.log(`  ${pad('', 8)}   ${issue.level === 'error' ? 'x' : '!'} ${issue.text}`)
  }
  if (setIssues.length) {
    console.log('\n  Whole set')
    for (const issue of setIssues) console.log(`  ${pad('', 8)}   ${issue.level === 'error' ? 'x' : '!'} ${issue.text}`)
  }
  console.log(`\n${outcome}${changed ? ' Updated src/data/burger-layers.json.' : ''}`)
  console.log('Inspect alignment at http://localhost:5173/asset-preview.html while `npm run dev` runs.\n')
}

if (STRICT && art !== 'photo') process.exit(1)
