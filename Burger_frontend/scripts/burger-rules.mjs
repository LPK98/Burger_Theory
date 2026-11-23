/**
 * Rules for the exploded-burger image layers.
 *
 * Shared by `scripts/burger-check.mjs` (Node) and `asset-preview.html` (browser), so the command
 * line and the visual inspector always agree. Pure functions only: no Node or DOM APIs.
 *
 * Coordinates are canvas units, 0–1000 across the square canvas whatever its pixel size, the same
 * space `src/data/burger-layers.json` stores outlines (`bbox`) in.
 */

/** Bottom → top (paint order). Must match `src/data/burger-layers.json`. */
export const LAYER_IDS = ['bottom-bun', 'sauce', 'patty', 'cheese', 'tomato', 'lettuce', 'top-bun']

/** Side, in pixels, of the square canvas every photographic layer is delivered on. */
export const TARGET_SIZE = 1600

/** Alpha (0–255) from which a pixel counts as ingredient rather than soft haze or cut-out fringe. */
export const ALPHA_SOLID = 24

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

/**
 * Reads a PNG's header and chunks. Returns null when `bytes` (a Uint8Array) isn't a PNG.
 * `hasAlpha` is true for RGBA / grey+alpha files and for files with a tRNS transparency chunk.
 */
export function pngInfo(bytes) {
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  const u32 = (p) => ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0
  const info = { width: 0, height: 0, depth: 0, color: 0, interlaced: false, hasAlpha: false, palette: null, trns: null, idat: [] }
  let p = 8
  while (p + 8 <= bytes.length) {
    const length = u32(p)
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
    const start = p + 8
    const data = bytes.subarray(start, start + length)
    if (type === 'IHDR') {
      info.width = u32(start)
      info.height = u32(start + 4)
      info.depth = bytes[start + 8]
      info.color = bytes[start + 9]
      info.interlaced = bytes[start + 12] === 1
    } else if (type === 'PLTE') info.palette = data
    else if (type === 'tRNS') info.trns = data
    else if (type === 'IDAT') info.idat.push(data)
    else if (type === 'IEND') break
    p = start + length + 4
  }
  info.hasAlpha = info.color === 4 || info.color === 6 || info.trns !== null
  return info
}

/**
 * Measures one layer from its alpha channel.
 * `bytes` holds `stride` bytes per pixel with alpha at `offset`
 * (canvas ImageData: stride 4, offset 3; a bare alpha map: stride 1, offset 0).
 */
export function measureAlpha(bytes, width, height, stride = 1, offset = 0) {
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  let transparent = 0
  let edgeSolid = 0
  let edgeTotal = 0
  for (let y = 0; y < height; y++) {
    const edgeRow = y < 2 || y >= height - 2
    let i = y * width * stride + offset
    for (let x = 0; x < width; x++, i += stride) {
      const a = bytes[i]
      if (a < 255) transparent++
      const edge = edgeRow || x < 2 || x >= width - 2
      if (edge) edgeTotal++
      if (a < ALPHA_SOLID) continue
      if (edge) edgeSolid++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      y1 = y
    }
  }
  const at = (x, y) => bytes[(y * width + x) * stride + offset]
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const sx = 1000 / width
  const sy = 1000 / height
  return {
    empty: x1 < 0,
    opaque: transparent === 0,
    opaqueCorners: corners.filter((a) => a >= 128).length,
    edgeRatio: edgeSolid / edgeTotal,
    bbox: x1 < 0 ? null : [Math.round(x0 * sx), Math.round(y0 * sy), Math.round((x1 + 1) * sx), Math.round((y1 + 1) * sy)],
  }
}

/**
 * Problems with a single layer.
 * `layer`: { id, format, width, height, hasAlpha, interlaced, measure, vector }
 * Returns [{ level: 'error' | 'warn', text }]. Any error keeps the site on the illustrated fallback.
 */
export function checkLayer(layer) {
  const issues = []
  const error = (text) => issues.push({ level: 'error', text })
  const warn = (text) => issues.push({ level: 'warn', text })

  if (!layer.vector) {
    if (layer.format && layer.format !== 'png') warn(`${layer.format.toUpperCase()} file. The spec is PNG with alpha.`)
    if (layer.width !== layer.height) error(`Canvas is ${layer.width} × ${layer.height}. It must be square, and the same for all seven layers.`)
    else if (layer.width !== TARGET_SIZE) warn(`Canvas is ${layer.width} × ${layer.height}. The spec is ${TARGET_SIZE} × ${TARGET_SIZE}.`)
    if (layer.hasAlpha === false) error('No alpha channel. Export a 32-bit RGBA PNG with a transparent background.')
    if (layer.interlaced) error('Interlaced PNG. Re-export without interlacing so it can be measured.')
  }

  const m = layer.measure
  if (!m) return issues
  if (m.empty) {
    error('The image is fully transparent.')
    return issues
  }
  if (m.opaque) error('No transparent pixels: the background hasn’t been removed.')
  else if (m.opaqueCorners >= 2) error('Opaque corners: the background hasn’t been fully removed.')
  else if (m.edgeRatio > 0.002) warn('Touches the canvas edge, so it will look cropped. Leave a margin all round.')

  const [x0, , x1] = m.bbox
  const off = (x0 + x1) / 2 - 500
  if (Math.abs(off) > 25) {
    warn(`Outline is ${(Math.abs(off) / 10).toFixed(1)}% ${off < 0 ? 'left' : 'right'} of centre. Every layer should share one vertical axis.`)
  }
  return issues
}

/**
 * Problems with the set as a whole: shared canvas, assembled positions, scale and framing.
 * `layers`: [{ id, width, height, bbox }] for every layer that exists (bbox may be null).
 */
export function checkSet(layers) {
  const issues = []
  const error = (text) => issues.push({ level: 'error', text })
  const warn = (text) => issues.push({ level: 'warn', text })
  const avg = (values) => values.reduce((a, b) => a + b, 0) / values.length

  const sizes = new Set(layers.map((l) => `${l.width} × ${l.height}`))
  if (sizes.size > 1) error(`Layers use different canvas sizes (${[...sizes].join(', ')}). All seven must share one.`)

  const boxes = layers.filter((l) => l.bbox)
  if (boxes.length < 2) return issues
  const byId = Object.fromEntries(boxes.map((l) => [l.id, l.bbox]))
  const top = byId['top-bun']
  const heel = byId['bottom-bun']

  // The classic mistake: every ingredient cropped and centred on its own canvas.
  const centres = boxes.map((l) => (l.bbox[1] + l.bbox[3]) / 2)
  const mean = avg(centres)
  const spread = Math.sqrt(avg(centres.map((c) => (c - mean) ** 2)))
  if (boxes.length >= 4 && spread < 12) {
    error('Every ingredient is centred on its own canvas. Place each one where it sits in the assembled burger (crown high, heel low) on one shared canvas.')
  } else {
    if (top && heel && top[1] + top[3] >= heel[1] + heel[3]) error('The top bun isn’t above the bottom bun. Layers must sit at their assembled positions.')
    const above = top && boxes.filter((l) => l.id !== 'top-bun' && l.bbox[1] < top[1] - 15).map((l) => l.id)
    if (above?.length) warn(`${above.join(', ')} reaches above the top bun. Check the layers sit at their assembled positions.`)
    const below = heel && boxes.filter((l) => l.id !== 'bottom-bun' && l.bbox[3] > heel[3] + 15).map((l) => l.id)
    if (below?.length) warn(`${below.join(', ')} hangs below the bottom bun. Check the layers sit at their assembled positions.`)
  }

  if (heel) {
    const heelWidth = heel[2] - heel[0]
    for (const l of boxes) {
      const ratio = (l.bbox[2] - l.bbox[0]) / heelWidth
      if (ratio < 0.6 || ratio > 1.4) warn(`${l.id} is ${Math.round(ratio * 100)}% as wide as the bottom bun. Check every layer was rendered at the same scale.`)
    }
  }

  const union = [
    Math.min(...boxes.map((l) => l.bbox[0])),
    Math.min(...boxes.map((l) => l.bbox[1])),
    Math.max(...boxes.map((l) => l.bbox[2])),
    Math.max(...boxes.map((l) => l.bbox[3])),
  ]
  const width = union[2] - union[0]
  if (boxes.length === LAYER_IDS.length && (width < 600 || width > 880)) {
    warn(`The assembled burger spans ${(width / 10).toFixed(0)}% of the canvas width. Aim for 72–78%: the page layout is designed around that.`)
  }
  const middle = (union[1] + union[3]) / 2
  if (boxes.length === LAYER_IDS.length && Math.abs(middle - 500) > 60) {
    warn(`The assembled burger is centred at ${(middle / 10).toFixed(0)}% of the canvas height. Centre the stack vertically.`)
  }
  return issues
}

/** Union of a list of outlines. */
export function unionBox(boxes) {
  const list = boxes.filter(Boolean)
  if (!list.length) return null
  return [
    Math.min(...list.map((b) => b[0])),
    Math.min(...list.map((b) => b[1])),
    Math.max(...list.map((b) => b[2])),
    Math.max(...list.map((b) => b[3])),
  ]
}

/** JSON for `burger-layers.json`, with each bbox kept on one line. */
export function formatManifest(manifest) {
  const json = JSON.stringify(manifest, null, 2).replace(/\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]/g, '[$1, $2, $3, $4]')
  return `${json}\n`
}
