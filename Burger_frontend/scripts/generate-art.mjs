#!/usr/bin/env node
/**
 * BURGER THEORY — illustration generator
 * -----------------------------------
 * Draws every burger illustration used on the site as standalone, transparent SVG files.
 *
 *   public/images/burger/<layer>.svg     the 7 exploded-view ingredient layers (shared 1000×1000 canvas)
 *   public/images/products/<id>.svg      one composite per menu item (shared canvas and table line)
 *   src/data/burger-layers.json          each layer's `fallback` entry (SVG path + bounding box). The photo
 *                                        entries (`src`, measured `bbox`) and the `art` switch are kept as
 *                                        they are: `npm run burger:check` owns those.
 *
 * Every layer is drawn at its *assembled* position on the same canvas, so stacking the files
 * reproduces the complete burger. Replacement photography / 3D renders must follow the same rule
 * (see ASSETS.md). The drawing is deterministic: the same seeds always produce the same art.
 *
 * Usage: npm run art
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatManifest } from './burger-rules.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 1000
const CX = SIZE / 2
/** Vertical squash of every horizontal circle: the camera sits ~14.5° above the table. */
const K = 0.25
const COS = Math.sqrt(1 - K * K)
const PI = Math.PI
const TAU = PI * 2

/* ──────────────────────────────────────────────────────────────── helpers */

const f = (n) => String(Math.round(n * 10) / 10)
const pt = (p) => `${f(p[0])},${f(p[1])}`
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (rand, a, b) => a + (b - a) * rand()
const pick = (rand, list) => list[Math.floor(rand() * list.length)]

/** Smooth periodic noise built from sines with integer frequencies (wraps cleanly at 2π). */
function wave(rand, terms) {
  const parts = terms.map(([fr, amp]) => [fr, amp, rand() * TAU])
  const fn = (t) => parts.reduce((s, [fr, amp, ph]) => s + amp * Math.sin(fr * t + ph), 0)
  fn.d = (t) => parts.reduce((s, [fr, amp, ph]) => s + amp * fr * Math.cos(fr * t + ph), 0)
  return fn
}

function sample(fn, from, to, n) {
  const out = []
  for (let i = 0; i <= n; i++) out.push(fn(from + ((to - from) * i) / n))
  return out
}
const loop = (fn, n) => sample(fn, 0, TAU, n).slice(0, -1)

/** Point on a horizontal circle of radius r: θ = 0 → right, θ = π/2 → closest to the viewer. */
const polar = (cx, cy, r, th) => [cx + r * Math.cos(th), cy + r * K * Math.sin(th)]

/** Catmull-Rom spline through the points, emitted as cubic Béziers. */
function smooth(pts, closed = true) {
  const n = pts.length
  const at = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)])
  let d = `M${pt(pts[0])}`
  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`
  }
  return closed ? `${d}Z` : d
}

/** Viewer-side half of a horizontal ellipse, drawn left → right. */
const frontArc = (cx, cy, r) => `M${f(cx - r)},${f(cy)}A${f(r)},${f(r * K)} 0 0 0 ${f(cx + r)},${f(cy)}`
/** Part of a horizontal ellipse between two angles, as an open path. */
const arc = (cx, cy, r, from, to) => smooth(sample((t) => polar(cx, cy, r, t), from, to, 16), false)
/** Upright cylinder silhouette: back half of the top ellipse + sides + front half of the bottom ellipse. */
const cylinder = (cx, yTop, yBot, r) =>
  `M${f(cx - r)},${f(yTop)}A${f(r)},${f(r * K)} 0 0 1 ${f(cx + r)},${f(yTop)}L${f(cx + r)},${f(yBot)}A${f(r)},${f(r * K)} 0 0 1 ${f(cx - r)},${f(yBot)}Z`
const flatEllipse = (cx, cy, r, extra = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(r * K)}" ${extra}/>`

function hex(c) {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a, b, t) {
  const A = hex(a)
  const B = hex(b)
  return `#${A.map((v, i) => Math.round(lerp(v, B[i], clamp(t, 0, 1))).toString(16).padStart(2, '0')).join('')}`
}

/** Axis-aligned bounds [x0, y0, x1, y1] of a list of points. */
function bounds(points, pad = 0) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

/** A plump drip: wide where it leaves the edge, a neck, then a rounded bulb. */
function drip(x, y, w, len) {
  return (
    `M${f(x - w)},${f(y)}` +
    `C${f(x - w * 0.55)},${f(y + len * 0.35)} ${f(x - w * 0.48)},${f(y + len * 0.55)} ${f(x - w * 0.62)},${f(y + len * 0.74)}` +
    `C${f(x - w * 0.8)},${f(y + len * 1.04)} ${f(x + w * 0.8)},${f(y + len * 1.04)} ${f(x + w * 0.62)},${f(y + len * 0.74)}` +
    `C${f(x + w * 0.48)},${f(y + len * 0.55)} ${f(x + w * 0.55)},${f(y + len * 0.35)} ${f(x + w)},${f(y)}Z`
  )
}

/** Many tiny ellipses (crumbs, crust, flecks), grouped by colour to keep files small. */
function specks(rand, n, place, { r = [2, 5], squash = 0.5, fills, opacity = 0.6 }) {
  const groups = fills.map(() => [])
  for (let i = 0; i < n; i++) {
    const [x, y] = place(rand)
    const rx = between(rand, r[0], r[1])
    const ry = rx * squash * between(rand, 0.7, 1.3)
    groups[Math.floor(rand() * fills.length)].push(`<ellipse cx="${Math.round(x)}" cy="${Math.round(y)}" rx="${f(rx)}" ry="${f(ry)}"/>`)
  }
  return groups.map((g, i) => (g.length ? `<g fill="${fills[i]}" opacity="${opacity}">${g.join('')}</g>` : '')).join('')
}

const attrs = (o) =>
  Object.entries(o)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')
const stops = (list) =>
  list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('')

/** Collects <defs> for one SVG file and hands out unique ids. */
class Doc {
  constructor(prefix) {
    this.prefix = prefix
    this.defs = []
    this.n = 0
    this.blurs = new Map()
  }
  uid(tag) {
    this.n += 1
    return `${this.prefix}${tag}${this.n}`
  }
  linear(list, a = {}) {
    const id = this.uid('l')
    this.defs.push(`<linearGradient id="${id}"${attrs(a)}>${stops(list)}</linearGradient>`)
    return `url(#${id})`
  }
  radial(list, a = {}) {
    const id = this.uid('r')
    this.defs.push(`<radialGradient id="${id}"${attrs(a)}>${stops(list)}</radialGradient>`)
    return `url(#${id})`
  }
  vertical(list, y1, y2) {
    return this.linear(list, { x1: 0, y1: f(y1), x2: 0, y2: f(y2), gradientUnits: 'userSpaceOnUse' })
  }
  horizontal(list, x1, x2) {
    return this.linear(list, { x1: f(x1), y1: 0, x2: f(x2), y2: 0, gradientUnits: 'userSpaceOnUse' })
  }
  /** Radial gradient squashed like the burger's horizontal surfaces. */
  flatRadial(list, cx, cy, r, squash = K) {
    return this.radial(list, {
      cx: f(cx),
      cy: f(cy),
      r: f(r),
      gradientUnits: 'userSpaceOnUse',
      gradientTransform: `translate(${f(cx)} ${f(cy)}) scale(1 ${squash}) translate(${f(-cx)} ${f(-cy)})`,
    })
  }
  blur(sd) {
    if (!this.blurs.has(sd)) {
      const id = this.uid('b')
      this.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`)
      this.blurs.set(sd, `url(#${id})`)
    }
    return this.blurs.get(sd)
  }
  clipMarkup(markup) {
    const id = this.uid('c')
    this.defs.push(`<clipPath id="${id}">${markup}</clipPath>`)
    return `url(#${id})`
  }
  /** Registers a path once. Returns `use(extra)` that references it; `use.clip()` makes a clip-path. */
  shape(d) {
    const id = this.uid('s')
    this.defs.push(`<path id="${id}" d="${d}"/>`)
    const use = (extra = '') => `<use href="#${id}" ${extra}/>`
    use.clip = () => this.clipMarkup(`<use href="#${id}"/>`)
    return use
  }
  /** Fractal-noise speckles tinted `color`, confined to the shape the filter is applied to. */
  grain(color, { freq = 0.9, octaves = 2, seed = 1, gain = 3.2, bias = 1.55 } = {}) {
    const id = this.uid('g')
    const [r, g, b] = hex(color).map((v) => (v / 255).toFixed(3))
    this.defs.push(
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>` +
        `<feColorMatrix values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${gain} 0 0 0 ${-bias}"/>` +
        `<feComposite in2="SourceGraphic" operator="in"/></filter>`,
    )
    return `url(#${id})`
  }
}

/** Soft cylindrical shading laid over a side wall: dark edges, a warm highlight left of centre. */
function sideShade(doc, x0, x1, strength = 1, tint = '#1C0A02') {
  return doc.horizontal(
    [
      [0, tint, 0.62 * strength],
      [0.1, tint, 0.24 * strength],
      [0.3, '#FFF4DA', 0.1 * strength],
      [0.52, tint, 0],
      [0.8, tint, 0.2 * strength],
      [1, tint, 0.68 * strength],
    ],
    x0,
    x1,
  )
}

/* ──────────────────────────────────────────────────────────────── palettes */

const BUN = {
  brioche: {
    crown: ['#FAD08A', '#EFA94F', '#D9852F', '#B5601C', '#86400F', '#5C2707'],
    band: '#F2D49A',
    side: ['#E8BB72', '#CB8A3E', '#A5622A', '#6E3810'],
    crumb: ['#A35D25', '#BB7A36', '#D59C56', '#EBCB8E', '#F5E0B2', '#A9662A'],
    gloss: 0.38,
  },
  potato: {
    crown: ['#F9D894', '#EFB765', '#DB9749', '#BA7431', '#8E5221', '#663712'],
    band: '#F9E8BC',
    side: ['#F1D293', '#DFAE62', '#BE8442', '#88551F'],
    crumb: ['#B9823F', '#CD9E58', '#E0BA78', '#F0D9A6', '#F8EAC6', '#B88443'],
    gloss: 0.24,
  },
}

const CHEESE = {
  cheddar: { top: ['#FFD472', '#F8AE3A', '#E48C21'], flap: ['#F2A231', '#D3740F'], edge: '#AD5B0A', bend: '#FFE6A8' },
  american: { top: ['#FFE587', '#FACA4E', '#EDAC2E'], flap: ['#F6BD3F', '#DB961D'], edge: '#B97812', bend: '#FFF2BE' },
  gouda: { top: ['#FFC877', '#F2A24C', '#DB8532'], flap: ['#E69842', '#C5742A'], edge: '#A0561A', bend: '#FFDDA8' },
  pepperjack: {
    top: ['#FDF4D6', '#F3E3B4', '#E4CD94'],
    flap: ['#EBDAA6', '#CFB87B'],
    edge: '#AE975A',
    bend: '#FFFCEC',
    flecks: ['#C8361F', '#E0592C', '#4F8A2A'],
  },
  swiss: { top: ['#FFF3C6', '#F7E3A0', '#EACE7C'], flap: ['#F0DA92', '#D6BA63'], edge: '#B89949', bend: '#FFFBE3', holes: true },
  vegan: { top: ['#FFEBAE', '#F8D782', '#EBC05E'], flap: ['#F3CD6C', '#DBAB45'], edge: '#BB8E31', bend: '#FFF7D6' },
}

const PATTY = {
  beef: {
    top: ['#93562D', '#6E391A', '#4A240E'],
    side: ['#57290F', '#3A1A0A', '#1F0C04'],
    light: '#B57446',
    dark: '#1C0C03',
    rim: '#C98A55',
  },
  plant: {
    top: ['#7C3A30', '#5C2822', '#3E1815'],
    side: ['#58251F', '#3D1814', '#260C0A'],
    light: '#B8664E',
    dark: '#190707',
    rim: '#C77C63',
    flecks: ['#8C9C42', '#D88236', '#A8405E'],
  },
}

const SAUCE = {
  theory: { top: ['#FAD2AC', '#F3AE7C', '#E38A50'], under: '#BE6029', gloss: '#FFF8F0' },
  chipotle: { top: ['#EF8C5C', '#D65E30', '#B4401D'], under: '#8A2B11', gloss: '#FFEBE0' },
  bbq: { top: ['#9A4822', '#733015', '#4F1C0A'], under: '#3A1406', gloss: '#FFDCC6' },
  mustard: { top: ['#FADE70', '#F0C236', '#D9A11C'], under: '#B58014', gloss: '#FFFAE0' },
  aioli: { top: ['#FDF8EB', '#F4EAD0', '#E4D5B0'], under: '#C8B585', gloss: '#FFFFFF' },
  truffle: { top: ['#F4E7C8', '#E6D3AA', '#D0B98A'], under: '#B19764', gloss: '#FFFFFF', flecks: '#2A2018' },
  cheese: { top: ['#FFCF66', '#F8A92E', '#E28A14'], under: '#C26A08', gloss: '#FFF6DC' },
}

/* ──────────────────────────────────────────────────────────────── ingredients
 * Every ingredient takes `base` (screen y of the centre of the surface it rests on)
 * and returns { svg, top, r, bbox }:
 *   top  – screen y of its own top surface (the next ingredient rests there)
 *   r    – approximate radius (used for contact shadows)
 *   bbox – [x0, y0, x1, y1] in canvas units
 */

function bottomBun(doc, { base, R = 355, t = 84, bun = 'brioche' }) {
  const P = BUN[bun]
  const yT = base - t
  const Rb = R - 18
  const sil = doc.shape(
    `M${f(CX - R)},${f(yT)}A${f(R)},${f(R * K)} 0 0 1 ${f(CX + R)},${f(yT)}` +
      `C${f(CX + R + 9)},${f(yT + t * 0.42)} ${f(CX + Rb + 14)},${f(base - 4)} ${f(CX + Rb)},${f(base)}` +
      `A${f(Rb)},${f(Rb * K)} 0 0 1 ${f(CX - Rb)},${f(base)}` +
      `C${f(CX - Rb - 14)},${f(base - 4)} ${f(CX - R - 9)},${f(yT + t * 0.42)} ${f(CX - R)},${f(yT)}Z`,
  )
  const side = doc.vertical(
    [
      [0, P.side[0]],
      [0.35, P.side[1]],
      [0.75, P.side[2]],
      [1, P.side[3]],
    ],
    yT,
    base + Rb * K,
  )
  const face = doc.flatRadial(
    [
      [0, P.crumb[0]],
      [0.45, P.crumb[1]],
      [0.74, P.crumb[2]],
      [0.9, P.crumb[3]],
      [0.965, P.crumb[4]],
      [1, P.crumb[5]],
    ],
    CX - 20,
    yT,
    R,
  )
  const faceEl = (extra) => flatEllipse(CX, yT, R - 1, extra)
  const svg =
    sil(`fill="${side}"`) +
    `<g clip-path="${sil.clip()}">` +
    `<path d="${frontArc(CX, yT + 16, R - 4)}" fill="none" stroke="${P.band}" stroke-width="34" opacity=".85" filter="${doc.blur(8)}"/>` +
    `<path d="${frontArc(CX, base + 6, Rb)}" fill="none" stroke="#3B1904" stroke-width="34" opacity=".6" filter="${doc.blur(11)}"/>` +
    `</g>` +
    sil(`fill="${sideShade(doc, CX - R - 10, CX + R + 10)}"`) +
    sil(`fill="#000" filter="${doc.grain('#FFE9BA', { freq: 0.7, seed: 4 })}" opacity=".18"`) +
    faceEl(`fill="${face}"`) +
    faceEl(`fill="#000" filter="${doc.grain('#7A3C10', { freq: 0.045, octaves: 3, seed: 15, gain: 2.2, bias: 1.15 })}" opacity=".35"`) +
    faceEl(`fill="#000" filter="${doc.grain('#FFF2D2', { freq: 0.9, seed: 16 })}" opacity=".14"`) +
    `<path d="${frontArc(CX, yT, R - 2)}" fill="none" stroke="#FFEBC2" stroke-width="2.2" opacity=".55"/>`
  return { svg, top: yT, r: R, bbox: [CX - R - 10, yT - R * K, CX + R + 10, base + Rb * K] }
}

function sesameSeeds(doc, { base, R, H, seed, count = 50 }) {
  const rand = rng(seed)
  const seedFill = doc.linear(
    [
      [0, '#FFFBEF'],
      [0.5, '#F6E6BF'],
      [1, '#D9B676'],
    ],
    { x1: 0, y1: 0, x2: 0.35, y2: 1 },
  )
  const placed = []
  const seeds = []
  const phiMax = 1.15
  for (let tries = 0; seeds.length < count && tries < 9000; tries++) {
    const th = rand() * TAU
    const phi = Math.acos(1 - rand() * (1 - Math.cos(phiMax)))
    const s = Math.sin(phi)
    const c = Math.cos(phi)
    const x3 = R * s * Math.cos(th)
    const z3 = R * s * Math.sin(th)
    const h3 = H * c
    const nx = (s * Math.cos(th)) / R
    const ny = c / H
    const nz = (s * Math.sin(th)) / R
    const facing = (ny * K + nz * COS) / Math.hypot(nx, ny, nz)
    if (facing < 0.22) continue
    if (placed.some((p) => Math.hypot(p[0] - x3, p[1] - h3, p[2] - z3) < 42)) continue
    placed.push([x3, h3, z3])
    const tangent = (Math.atan2(R * s * Math.cos(th) * K, -R * s * Math.sin(th)) * 180) / PI
    seeds.push({
      X: CX + x3,
      Y: base - h3 * COS + z3 * K,
      rot: tangent + between(rand, -50, 50),
      rx: between(rand, 9.5, 11.5),
      ry: between(rand, 4.8, 5.8) * (0.5 + 0.5 * facing),
      z: z3,
    })
  }
  seeds.sort((a, b) => a.z - b.z)
  return seeds
    .map(
      ({ X, Y, rot, rx, ry }) =>
        `<g transform="translate(${f(X)} ${f(Y)})">` +
        `<ellipse rx="${f(rx)}" ry="${f(ry)}" transform="translate(1.8 2.8) rotate(${f(rot)})" fill="#4A1E05" opacity=".4"/>` +
        `<ellipse rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)})" fill="${seedFill}"/>` +
        `<ellipse rx="${f(rx * 0.42)}" ry="${f(ry * 0.34)}" transform="rotate(${f(rot)}) translate(${f(-rx * 0.28)} ${f(-ry * 0.28)})" fill="#fff" opacity=".7"/>` +
        `</g>`,
    )
    .join('')
}

function topBun(doc, { base, R = 360, H = 190, bun = 'brioche', seeds = true, seed = 11 }) {
  const P = BUN[bun]
  const Hs = Math.hypot(H * COS, R * K)
  const ex = 2 / 2.4
  const outline = sample(
    (a) => {
      const c = Math.cos(a)
      const s = Math.sin(a)
      return [CX + R * Math.sign(c) * Math.abs(c) ** ex, base - Hs * Math.abs(s) ** ex]
    },
    PI,
    0,
    120,
  )
  const sil = doc.shape(`M${outline.map(pt).join('L')}A${f(R)},${f(R * K)} 0 0 1 ${f(CX - R)},${f(base)}Z`)
  const crown = doc.radial(
    [
      [0, P.crown[0]],
      [0.16, P.crown[1]],
      [0.42, P.crown[2]],
      [0.7, P.crown[3]],
      [0.9, P.crown[4]],
      [1, P.crown[5]],
    ],
    { cx: f(CX - R * 0.3), cy: f(base - Hs * 0.82), r: f(R * 1.32), gradientUnits: 'userSpaceOnUse' },
  )
  const cy = base - Hs * 0.3
  const rim = doc.radial(
    [
      [0, '#000', 0],
      [0.72, '#000', 0],
      [1, '#210B02', 0.5],
    ],
    {
      cx: CX,
      cy: f(cy),
      r: f(R * 1.04),
      gradientUnits: 'userSpaceOnUse',
      gradientTransform: `translate(${CX} ${f(cy)}) scale(1 0.8) translate(${-CX} ${f(-cy)})`,
    },
  )
  const hx = CX - R * 0.3
  const hy = base - Hs * 0.74
  const svg =
    sil(`fill="${crown}"`) +
    sil(`fill="${rim}"`) +
    `<g clip-path="${sil.clip()}">` +
    `<path d="${frontArc(CX, base - 20, R - 2)}" fill="none" stroke="${P.band}" stroke-width="42" opacity=".85" filter="${doc.blur(11)}"/>` +
    `<path d="${frontArc(CX, base + 3, R)}" fill="none" stroke="#4A1E05" stroke-width="10" opacity=".45" filter="${doc.blur(3)}"/>` +
    `</g>` +
    sil(`fill="#000" filter="${doc.grain('#FFE2A6', { freq: 0.65, seed: 21 })}" opacity=".16"`) +
    sil(`fill="#000" filter="${doc.grain('#7A3A0E', { freq: 0.05, octaves: 2, seed: 22, gain: 2, bias: 1.1 })}" opacity=".1"`) +
    `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(R * 0.37)}" ry="${f(R * 0.13)}" transform="rotate(-14 ${f(hx)} ${f(hy)})" fill="#FFF8E8" opacity="${P.gloss}" filter="${doc.blur(16)}"/>` +
    `<ellipse cx="${f(hx - 18)}" cy="${f(hy - 12)}" rx="${f(R * 0.13)}" ry="${f(R * 0.045)}" transform="rotate(-16 ${f(hx - 18)} ${f(hy - 12)})" fill="#fff" opacity="${P.gloss + 0.14}" filter="${doc.blur(5)}"/>` +
    (seeds ? sesameSeeds(doc, { base, R: R * 0.97, H: H * 0.97, seed }) : '')
  return { svg, top: base - Hs, r: R, bbox: [CX - R, base - Hs, CX + R, base + R * K] }
}

function lettuce(doc, { base, R = 384, t = 12, seed = 5, hang: hangAmount = 12 }) {
  const rand = rng(seed)
  const ruf = wave(rand, [
    [6, 5],
    [11, 6],
    [17, 6],
    [27, 4.5],
    [41, 3],
    [63, 1.6],
  ])
  const hangW = wave(rand, [
    [4, 4],
    [9, 5],
    [15, 4],
    [23, 2.5],
  ])
  const yT = base - t
  const rTop = (th) => R + ruf(th)
  const hang = (th) => t + 4 + Math.max(0, Math.sin(th)) ** 0.7 * (hangAmount + hangW(th))
  const topPts = loop((th) => polar(CX, yT, rTop(th), th), 240)
  const top = doc.shape(smooth(topPts))
  const a0 = -0.22
  const a1 = PI + 0.22
  const upper = sample((th) => polar(CX, yT, rTop(th), th), a0, a1, 160)
  const lower = sample(
    (th) => {
      const p = polar(CX, yT, rTop(th) - 5, th)
      return [p[0], p[1] + hang(th)]
    },
    a1,
    a0,
    160,
  )
  const skirt = doc.shape(smooth([...upper, ...lower]))

  // Fold shading: light where a ruffle turns toward the key light, dark in the troughs.
  const foldStops = []
  for (let i = 0; i <= 200; i++) {
    const th = PI - (PI * i) / 200
    const light = clamp(0.52 + ruf.d(th) * 0.0019 + hangW.d(th) * 0.004, 0.04, 1)
    foldStops.push([((Math.cos(th) + 1) / 2).toFixed(4), mix('#356C1B', '#A9D46A', light)])
  }
  const folds = doc.horizontal(foldStops, CX - R, CX + R)
  const skirtDark = doc.vertical(
    [
      [0, '#0F2A05', 0],
      [0.55, '#0F2A05', 0.12],
      [1, '#0F2A05', 0.5],
    ],
    yT,
    yT + R * K + 40,
  )
  const face = doc.flatRadial(
    [
      [0, '#D5EAA3'],
      [0.35, '#BCDB82'],
      [0.68, '#97C557'],
      [0.88, '#73AA3D'],
      [1, '#548C28'],
    ],
    CX - 30,
    yT,
    R,
  )

  // Ruffle wedges around the rim of the leaf, faded out toward the middle by a mask.
  let wedges = ''
  const W = 120
  for (let i = 0; i < W; i++) {
    const t0 = (i / W) * TAU
    const t1 = ((i + 1) / W) * TAU
    const light = clamp(0.5 + ruf.d((t0 + t1) / 2) * 0.0022, 0, 1)
    const a = polar(CX, yT, R * 0.78, t0)
    const b = polar(CX, yT, rTop(t0) + 2, t0)
    const c = polar(CX, yT, rTop(t1) + 2, t1)
    const d = polar(CX, yT, R * 0.78, t1)
    wedges += `<path d="M${pt(a)}L${pt(b)}L${pt(c)}L${pt(d)}Z" fill="${mix('#3A7419', '#F0F8D2', light)}"/>`
  }
  const maskGrad = doc.flatRadial(
    [
      [0, '#fff', 0],
      [0.8, '#fff', 0],
      [0.95, '#fff', 1],
    ],
    CX,
    yT,
    R,
  )
  const maskId = doc.uid('m')
  doc.defs.push(
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-500" y="-500" width="2000" height="2000">${flatEllipse(CX, yT, R + 40, `fill="${maskGrad}"`)}</mask>`,
  )

  // Several overlapping leaves: each with a curving midrib and a few side veins.
  let veins = ''
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * TAU + between(rand, -0.3, 0.3)
    const startR = between(rand, 30, 110)
    const startA = th + between(rand, -0.9, 0.9)
    const bend = between(rand, -0.25, 0.25)
    const rib = sample((u) => polar(CX, yT, lerp(startR, R * 0.86, u), lerp(startA, th, smoothstep(0, 1, u)) + bend * Math.sin(PI * u)), 0, 1, 10)
    veins += `<path d="${smooth(rib, false)}" stroke-width="6" opacity=".2"/><path d="${smooth(rib, false)}" stroke-width="2.4" opacity=".5"/>`
    for (const idx of [3, 5, 7]) {
      const [x, y] = rib[idx]
      const r0 = lerp(startR, R * 0.86, idx / 10)
      const a0 = lerp(startA, th, smoothstep(0, 1, idx / 10))
      for (const side of [-1, 1]) {
        const end = polar(CX, yT, Math.min(r0 + between(rand, 50, 80), R * 0.95), a0 + side * between(rand, 0.15, 0.3))
        veins += `<path d="M${f(x)},${f(y)}Q${pt(polar(CX, yT, r0 + 30, a0 + side * 0.06))} ${pt(end)}" stroke-width="1.6" opacity=".38"/>`
      }
    }
  }
  const crinklePlace = (r) => polar(CX, yT, Math.sqrt(r()) * R * 0.82, r() * TAU)
  const crinkles =
    specks(rand, 16, crinklePlace, { r: [18, 50], squash: 0.28, fills: ['#EEF7CF'], opacity: 0.12 }) +
    specks(rand, 22, crinklePlace, { r: [18, 56], squash: 0.28, fills: ['#3E7A1F'], opacity: 0.22 })

  const svg =
    skirt(`fill="${folds}"`) +
    skirt(`fill="${skirtDark}"`) +
    top(`fill="${face}"`) +
    `<g clip-path="${top.clip()}">` +
    `<g mask="url(#${maskId})" opacity=".45">${wedges}</g>` +
    `<g filter="${doc.blur(7)}">${crinkles}</g>` +
    `<g fill="none" stroke="#F3FADB" stroke-linecap="round">${veins}</g>` +
    `</g>` +
    top(`fill="#000" filter="${doc.grain('#E8F6BE', { freq: 0.8, seed: 31 })}" opacity=".14"`)
  return { svg, top: yT, r: R, bbox: bounds([...topPts, ...lower]) }
}

function tomatoFace(r, rand, wall, gel) {
  const n = rand() > 0.45 ? 4 : 3
  const off = rand() * TAU
  let s = `<circle r="${f(r)}" fill="#A91F17"/><circle r="${f(r * 0.94)}" fill="${wall}"/>`
  for (let i = 0; i < n; i++) {
    const a0 = off + (i / n) * TAU + 0.2
    const a1 = off + ((i + 1) / n) * TAU - 0.2
    const pts = [
      ...sample((a) => [r * 0.8 * Math.cos(a), r * 0.8 * Math.sin(a)], a0, a1, 10),
      ...sample((a) => [r * 0.3 * Math.cos(a), r * 0.3 * Math.sin(a)], a1, a0, 5),
    ]
    s += `<path d="${smooth(pts)}" fill="${gel}"/>`
    const seeds = 4 + Math.floor(rand() * 3)
    for (let j = 0; j < seeds; j++) {
      const a = lerp(a0 + 0.14, a1 - 0.14, (j + 0.5) / seeds)
      const rr = r * between(rand, 0.48, 0.62)
      const sx = rr * Math.cos(a)
      const sy = rr * Math.sin(a)
      s += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(r * 0.065)}" ry="${f(r * 0.038)}" transform="rotate(${f((a * 180) / PI)} ${f(sx)} ${f(sy)})" fill="#F9EBBB" stroke="#D29E58" stroke-width="1"/>`
    }
  }
  s += `<circle r="${f(r * 0.2)}" fill="#F7B092" opacity=".85"/>`
  s += `<path d="M${f(-r * 0.83)},${f(-r * 0.28)}A${f(r * 0.87)},${f(r * 0.87)} 0 0 1 ${f(-r * 0.12)},${f(-r * 0.86)}" fill="none" stroke="#fff" stroke-width="${f(r * 0.05)}" stroke-linecap="round" opacity=".45"/>`
  return s
}

function tomatoes(doc, { base, t = 22, seed = 3, slices }) {
  const rand = rng(seed)
  const list = [
    ...(slices ?? [
      { x: 0, z: -195, r: 142 },
      { x: -226, z: 46, r: 140 },
      { x: 224, z: 30, r: 138 },
      { x: 6, z: 206, r: 144 },
    ]),
  ].sort((a, b) => a.z - b.z)
  const wall = doc.radial([
    [0, '#F28A6C'],
    [0.66, '#E04A33'],
    [1, '#C93222'],
  ])
  const gel = doc.radial([
    [0, '#FCC4A2'],
    [0.6, '#F69474'],
    [1, '#EA6447'],
  ])
  const shade = sideShade(doc, CX - 380, CX + 380, 0.7, '#3A0703')
  let svg = ''
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of list) {
    const x = CX + s.x
    const yB = base + s.z * K
    const yT = yB - t
    const sil = cylinder(x, yT, yB, s.r)
    const side = doc.vertical(
      [
        [0, '#E3422F'],
        [0.5, '#C42A1D'],
        [1, '#87160E'],
      ],
      yT,
      yB + s.r * K,
    )
    svg +=
      `<path d="${sil}" fill="${side}"/>` +
      `<path d="${sil}" fill="${shade}"/>` +
      `<g transform="translate(${f(x)} ${f(yT)}) scale(1 ${K})">${tomatoFace(s.r, rand, wall, gel)}</g>`
    x0 = Math.min(x0, x - s.r)
    x1 = Math.max(x1, x + s.r)
    y0 = Math.min(y0, yT - s.r * K)
    y1 = Math.max(y1, yB + s.r * K)
  }
  return { svg, top: base - t, r: 340, bbox: [x0, y0, x1, y1] }
}

function cheese(doc, { base, Rp = 372, D = 420, rot = 0, kind = 'cheddar', seed = 9, sag = 0.8 }) {
  const C = CHEESE[kind]
  const rand = rng(seed)
  const melt = wave(rand, [
    [3, 6],
    [5, 4],
    [9, 2.5],
    [17, 1.2],
  ])
  const EDGE = 40
  // A square slice, corners left / front / right / back (± rot), with slightly wavy edges.
  const square = []
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * PI) / 2
    const b = rot + ((k + 1) * PI) / 2
    const A0 = [D * Math.cos(a), D * Math.sin(a)]
    const B0 = [D * Math.cos(b), D * Math.sin(b)]
    for (let i = 0; i < EDGE; i++) {
      const u = i / EDGE
      const p = [lerp(A0[0], B0[0], u), lerp(A0[1], B0[1], u)]
      const len = Math.hypot(p[0], p[1])
      const grow = melt(((k + u) / 4) * TAU)
      square.push([p[0] * (1 + grow / len), p[1] * (1 + grow / len)])
    }
  }
  // Drape: everything beyond the patty rim bends down over the side (hidden behind it at the back).
  const pts = square.map(([px, pz]) => {
    const r = Math.hypot(px, pz)
    const th = Math.atan2(pz, px)
    if (r <= Rp) return [CX + px, base + pz * K]
    const o = r - Rp
    const w = smoothstep(-0.5, 0, Math.sin(th))
    const out = (1 - w) * Math.min(o, 3) + w * (5 + o * 0.16)
    const rr = Rp + out
    return [CX + rr * Math.cos(th), base + rr * K * Math.sin(th) + w * o * sag]
  })
  const outline = doc.shape(smooth(pts))
  const drips = []
  const dripTips = []
  for (let k = 0; k < 4; k++) {
    if (Math.sin(rot + (k * PI) / 2) < -0.3) continue
    const [x, y] = pts[k * EDGE]
    const n = 1 + Math.floor(rand() * 2)
    for (let j = 0; j < n; j++) {
      const X = x + between(rand, -16, 16)
      const len = between(rand, 14, 30)
      drips.push(drip(X, y - 9, between(rand, 9, 13), len))
      dripTips.push([X, y - 9 + len * 1.04])
    }
  }
  const flap = doc.vertical(
    [
      [0, C.flap[0]],
      [1, C.flap[1]],
    ],
    base,
    base + Rp * K + 70,
  )
  const topFill = doc.linear(
    [
      [0, C.top[0]],
      [0.5, C.top[1]],
      [1, C.top[2]],
    ],
    { x1: f(CX - Rp), y1: f(base - Rp * K), x2: f(CX + Rp * 0.8), y2: f(base + Rp * K * 2.2), gradientUnits: 'userSpaceOnUse' },
  )
  const rimClip = doc.clipMarkup(flatEllipse(CX, base, Rp + 2))
  const dripPaths = (fill) => drips.map((d) => `<path d="${d}" fill="${fill}"/>`).join('')
  let extras = ''
  if (C.flecks) {
    extras += specks(rand, 80, (r) => polar(CX, base, Math.sqrt(r()) * Rp * 0.95, r() * TAU), {
      r: [2, 4.5],
      squash: 0.45,
      fills: C.flecks,
      opacity: 0.85,
    })
  }
  if (C.holes) {
    for (let i = 0; i < 9; i++) {
      const [x, y] = polar(CX, base, Math.sqrt(rand()) * Rp * 0.8, rand() * TAU)
      const hr = between(rand, 12, 26)
      extras += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(hr)}" ry="${f(hr * K * 1.3)}" fill="#C9A452"/><ellipse cx="${f(x)}" cy="${f(y + 1.5)}" rx="${f(hr * 0.8)}" ry="${f(hr * K)}" fill="#E1C273"/>`
    }
  }
  let gloss = ''
  for (let i = 0; i < 4; i++) {
    const [x, y] = polar(CX, base, between(rand, 60, Rp * 0.7), between(rand, PI * 0.95, PI * 1.9))
    gloss += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(between(rand, 30, 80))}" ry="${f(between(rand, 4, 9))}" fill="#fff"/>`
  }
  const svg =
    `<g transform="translate(0 5)">${outline(`fill="${C.edge}"`)}${dripPaths(C.edge)}</g>` +
    outline(`fill="${flap}"`) +
    dripPaths(flap) +
    outline(`fill="${topFill}" clip-path="${rimClip}"`) +
    `<g clip-path="${outline.clip()}">` +
    `<path d="${frontArc(CX, base, Rp + 1)}" fill="none" stroke="${C.bend}" stroke-width="5" opacity=".7" filter="${doc.blur(2)}"/>` +
    `<g clip-path="${rimClip}">${extras}</g>` +
    `<g filter="${doc.blur(5)}" opacity=".38">${gloss}</g>` +
    `</g>`
  return { svg, top: base - 4, r: Rp, bbox: bounds([...pts, ...dripTips]) }
}

function patty(doc, { base, R = 372, t = 60, seed = 21, kind = 'beef' }) {
  const C = PATTY[kind]
  const rand = rng(seed)
  const eT = wave(rand, [
    [5, 4],
    [9, 3.4],
    [14, 3],
    [23, 2.6],
    [37, 2.1],
    [59, 1.5],
    [83, 1],
  ])
  const eB = wave(rand, [
    [6, 4],
    [12, 3.2],
    [27, 2.4],
    [45, 1.6],
  ])
  const yT = base - t
  const rT = (th) => R + eT(th)
  const rB = (th) => R - 12 + eB(th)
  const silPts = [
    ...sample((th) => polar(CX, yT, rT(th), th), PI, TAU, 100),
    [CX + R + 7 + eB(0.4), yT + t * 0.52],
    ...sample((th) => polar(CX, base, rB(th), th), 0.02, PI - 0.02, 100),
    [CX - R - 7 - eB(2.6), yT + t * 0.52],
  ]
  const sil = doc.shape(smooth(silPts))
  const top = doc.shape(smooth(loop((th) => polar(CX, yT, rT(th), th), 180)))
  const rimFront = smooth(sample((th) => polar(CX, yT, rT(th) - 2, th), 0.08, PI - 0.08, 80), false)
  const sideFill = doc.vertical(
    [
      [0, C.side[0]],
      [0.5, C.side[1]],
      [1, C.side[2]],
    ],
    yT,
    base + R * K,
  )
  const face = doc.flatRadial(
    [
      [0, C.top[0]],
      [0.6, C.top[1]],
      [1, C.top[2]],
    ],
    CX - 40,
    yT - 10,
    R,
  )
  const onTop = (r) => polar(CX, yT, Math.sqrt(r()) * R * 0.96, r() * TAU)
  const onSide = (r) => {
    const th = between(r, 0.04, 0.96) * PI
    const [x, yTop] = polar(CX, yT, rT(th) + 2, th)
    const yBot = polar(CX, base, rB(th), th)[1]
    return [x, lerp(yTop, yBot, r())]
  }
  const crust =
    specks(rand, 120, onTop, { r: [2.5, 7], squash: 0.42, fills: [C.light, C.dark], opacity: 0.75 }) +
    specks(rand, 110, onTop, { r: [2, 5], squash: 0.42, fills: [C.light, C.dark], opacity: 0.4 }) +
    (C.flecks ? specks(rand, 90, onTop, { r: [2, 4.5], squash: 0.45, fills: C.flecks, opacity: 0.7 }) : '')
  const sideCrust = specks(rand, 150, onSide, { r: [2, 5.5], squash: 0.7, fills: [C.light, C.dark], opacity: 0.55 })
  const svg =
    sil(`fill="${sideFill}"`) +
    sil(`fill="${sideShade(doc, CX - R - 10, CX + R + 10, 0.9, '#0E0501')}"`) +
    sil(`fill="#000" filter="${doc.grain(C.light, { freq: '0.05 0.13', octaves: 3, seed: 41, gain: 2.6, bias: 1.35 })}" opacity=".4"`) +
    `<g clip-path="${sil.clip()}">${sideCrust}</g>` +
    top(`fill="${face}"`) +
    top(`fill="#000" filter="${doc.grain(C.light, { freq: 0.055, octaves: 3, seed: 42, gain: 2.5, bias: 1.25 })}" opacity=".42"`) +
    top(`fill="#000" filter="${doc.grain(C.dark, { freq: 0.55, seed: 43 })}" opacity=".35"`) +
    `<g clip-path="${top.clip()}">${crust}</g>` +
    top(`fill="none" stroke="${C.dark}" stroke-width="7" opacity=".5" filter="${doc.blur(2)}"`) +
    `<path d="${rimFront}" fill="none" stroke="${C.rim}" stroke-width="3" opacity=".55" filter="${doc.blur(1.2)}"/>` +
    flatEllipse(CX - R * 0.32, yT - R * K * 0.35, R * 0.34, `fill="#FFE9D2" opacity=".1" filter="${doc.blur(14)}"`)
  return { svg, top: yT, r: R, bbox: bounds(silPts) }
}

function sauce(doc, { base, R = 318, t = 6, seed = 13, kind = 'theory', drips = 3, maxDrip = 34 }) {
  const C = SAUCE[kind]
  const rand = rng(seed)
  // Lobed, splashed outline: sauce spreads unevenly when the patty is pressed onto it.
  const wob = wave(rand, [
    [2, 8],
    [3, 11],
    [5, 8],
    [9, 4],
    [15, 2],
  ])
  const yT = base - t
  const rf = (th) => R + wob(th)
  const topPts = loop((th) => polar(CX, yT, rf(th), th), 160)
  const top = doc.shape(smooth(topPts))
  const under = smooth(loop((th) => polar(CX, yT + t, rf(th) - 1, th), 160))
  const dripTips = []
  const dripFill = doc.vertical(
    [
      [0, C.top[1]],
      [1, C.under],
    ],
    yT,
    yT + R * K + maxDrip + 20,
  )
  let dripPaths = ''
  for (let i = 0; i < drips; i++) {
    const th = lerp(0.14 * PI, 0.86 * PI, (i + between(rand, 0.2, 0.8)) / drips)
    const [x, y] = polar(CX, yT + t, rf(th) - 4, th)
    const w = between(rand, 10, 15)
    const len = between(rand, maxDrip * 0.45, maxDrip)
    dripTips.push([x, y - 7 + len * 1.04])
    dripPaths +=
      `<path d="${drip(x, y - 7, w, len)}" fill="${dripFill}"/>` +
      `<ellipse cx="${f(x - w * 0.25)}" cy="${f(y - 7 + len * 0.78)}" rx="${f(w * 0.2)}" ry="${f(len * 0.12)}" fill="${C.gloss}" opacity=".6"/>`
  }
  const face = doc.flatRadial(
    [
      [0, C.top[0]],
      [0.6, C.top[1]],
      [1, C.top[2]],
    ],
    CX - 50,
    yT - 8,
    R,
  )
  let gloss = ''
  for (let i = 0; i < 5; i++) {
    const r0 = between(rand, R * 0.35, R * 0.85)
    const a0 = between(rand, PI * 1.05, PI * 1.6)
    gloss += `<path d="${arc(CX, yT, r0, a0, a0 + between(rand, 0.25, 0.6))}" stroke-width="${f(between(rand, 3, 6))}"/>`
  }
  const flecks = C.flecks
    ? specks(rand, 60, (r) => polar(CX, yT, Math.sqrt(r()) * R * 0.9, r() * TAU), { r: [1.5, 3.2], squash: 0.5, fills: [C.flecks], opacity: 0.9 })
    : ''
  const svg =
    `<path d="${under}" fill="${C.under}"/>` +
    dripPaths +
    top(`fill="${face}"`) +
    flecks +
    `<g opacity=".75" filter="${doc.blur(1.6)}" fill="none" stroke="${C.gloss}" stroke-linecap="round">${gloss}</g>` +
    `<path d="${arc(CX, yT, R * 0.97, 0.25 * PI, 0.75 * PI)}" fill="none" stroke="${C.gloss}" stroke-width="3" opacity=".35" filter="${doc.blur(1.5)}"/>`
  return { svg, top: yT, r: R, bbox: bounds([...topPts, ...dripTips], 2) }
}

/* — product-only ingredients — */

function slicesOf(doc, { base, slices, t, face, side, sideBottom }) {
  const list = [...slices].sort((a, b) => a.z - b.z)
  let svg = ''
  for (const s of list) {
    const x = CX + s.x
    const yB = base + s.z * K
    const yT = yB - t
    const fill = doc.vertical(
      [
        [0, side],
        [1, sideBottom],
      ],
      yT,
      yB + s.r * K,
    )
    svg += `<path d="${cylinder(x, yT, yB, s.r)}" fill="${fill}"/>` + `<g transform="translate(${f(x)} ${f(yT)}) scale(1 ${K})">${face(s)}</g>`
  }
  return svg
}

/** Positions around the front rim of the burger, so the slices peek out past the bun. */
function rimSlices(rand, n, { rMin, rMax, size: [s0, s1], from = 0.05 * PI, to = 0.95 * PI, back = 2 }) {
  const out = []
  for (let i = 0; i < n; i++) {
    const th = lerp(from, to, (i + between(rand, 0.2, 0.8)) / n)
    const rr = between(rand, rMin, rMax)
    out.push({ x: rr * Math.cos(th), z: rr * Math.sin(th), r: between(rand, s0, s1) })
  }
  for (let i = 0; i < back; i++) {
    const th = between(rand, 1.15 * PI, 1.85 * PI)
    const rr = between(rand, rMin * 0.6, rMax * 0.8)
    out.push({ x: rr * Math.cos(th), z: rr * Math.sin(th), r: between(rand, s0, s1) })
  }
  return out
}

function pickles(doc, { base, seed = 41, slices, n = 6 }) {
  const rand = rng(seed)
  const flesh = doc.radial([
    [0, '#DCDF86'],
    [0.6, '#BFC75E'],
    [1, '#93A23A'],
  ])
  const list = slices ?? rimSlices(rand, n, { rMin: 290, rMax: 330, size: [62, 70] })
  const face = (s) => {
    const r = s.r
    const crinkle = smooth(
      loop((a) => {
        const rr = r + 2.4 * Math.sin(15 * a)
        return [rr * Math.cos(a), rr * Math.sin(a)]
      }, 60),
    )
    let seeds = ''
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + between(rand, -0.1, 0.1)
      const sx = r * 0.45 * Math.cos(a)
      const sy = r * 0.45 * Math.sin(a)
      seeds += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(r * 0.1)}" ry="${f(r * 0.06)}" transform="rotate(${f((a * 180) / PI)} ${f(sx)} ${f(sy)})"/>`
    }
    return (
      `<path d="${crinkle}" fill="#4E6C1A"/><circle r="${f(r * 0.86)}" fill="${flesh}"/><g fill="#F1F3C8" opacity=".85">${seeds}</g>` +
      `<circle r="${f(r * 0.2)}" fill="#A7B24C"/>` +
      `<path d="M${f(-r * 0.7)},${f(-r * 0.32)}A${f(r * 0.76)},${f(r * 0.76)} 0 0 1 ${f(-r * 0.12)},${f(-r * 0.75)}" stroke="#fff" stroke-width="${f(r * 0.07)}" fill="none" opacity=".4" stroke-linecap="round"/>`
    )
  }
  const svg = slicesOf(doc, { base, slices: list, t: 7, face, side: '#5F7E22', sideBottom: '#3A5210' })
  return { svg, top: base - 7, r: 330, bbox: [CX - 410, base - 60, CX + 410, base + 110] }
}

function jalapenos(doc, { base, seed = 47 }) {
  const rand = rng(seed)
  const slices = [
    ...rimSlices(rand, 9, { rMin: 300, rMax: 345, size: [42, 50], back: 0 }),
    ...rimSlices(rand, 5, { rMin: 120, rMax: 240, size: [40, 46], from: 0, to: TAU, back: 0 }),
  ]
  const flesh = doc.radial([
    [0, '#E5EEB8'],
    [0.45, '#A9CB5E'],
    [1, '#79A93A'],
  ])
  const face = (s) => {
    const r = s.r
    let seeds = ''
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + between(rand, -0.2, 0.2)
      seeds += `<circle cx="${f(r * 0.32 * Math.cos(a))}" cy="${f(r * 0.32 * Math.sin(a))}" r="${f(r * 0.11)}"/>`
    }
    return `<circle r="${f(r)}" fill="#25601A"/><circle r="${f(r * 0.86)}" fill="${flesh}"/><circle r="${f(r * 0.5)}" fill="#EEF3CF" opacity=".75"/><g fill="#F6F0CF" stroke="#CFC48C" stroke-width="1">${seeds}</g><circle r="${f(r * 0.14)}" fill="#DDE6AE"/>`
  }
  const svg = slicesOf(doc, { base, slices, t: 7, face, side: '#2E6A1E', sideBottom: '#1B4511' })
  return { svg, top: base - 7, r: 330, bbox: [CX - 400, base - 100, CX + 400, base + 110] }
}

function redOnion(doc, { base, rings }) {
  const list = rings ?? [
    { x: -190, z: 70, r: 165 },
    { x: 175, z: 20, r: 172 },
    { x: 10, z: 160, r: 130 },
  ]
  let svg = ''
  for (const s of list) {
    const x = CX + s.x
    const y = base + s.z * K - 4
    svg +=
      `<g transform="translate(${f(x)} ${f(y)}) scale(1 ${K})" fill="none">` +
      `<circle r="${f(s.r)}" stroke="#6E2A62" stroke-width="13"/><circle r="${f(s.r - 4)}" stroke="#F7ECF4" stroke-width="6"/>` +
      `<circle r="${f(s.r - 34)}" stroke="#86357A" stroke-width="11"/><circle r="${f(s.r - 38)}" stroke="#F4E6F0" stroke-width="5"/>` +
      `</g>`
  }
  return { svg, top: base - 6, r: 340, bbox: [CX - 380, base - 60, CX + 380, base + 90] }
}

function bacon(doc, { base, seed = 51, strips }) {
  const rand = rng(seed)
  const list = strips ?? [
    { z: -70, tilt: 0.05 },
    { z: 110, tilt: -0.04 },
  ]
  let svg = ''
  for (const s of list) {
    const ripple = wave(rand, [
      [3, 7],
      [5, 4],
      [9, 2],
    ])
    const edge = wave(rand, [
      [11, 1.5],
      [23, 1],
    ])
    const xs0 = CX - 418
    const xs1 = CX + 420
    const line = (u) => base + s.z * K + ripple(u * TAU) + s.tilt * (lerp(xs0, xs1, u) - CX) - 6
    const bands = [
      [0, 7, '#F3CEA6'],
      [7, 19, '#A9402A'],
      [19, 23, '#EFC39A'],
      [23, 30, '#7C2817'],
    ]
    for (const [o0, o1, col] of bands) {
      const upper = sample((u) => [lerp(xs0, xs1, u), line(u) + o0 - 15 + edge(u * TAU) * (o0 === 0 ? 1 : 0.3)], 0, 1, 60)
      const lower = sample((u) => [lerp(xs0, xs1, u), line(u) + o1 - 15 + edge(u * TAU) * (o1 === 30 ? 1 : 0.3)], 1, 0, 60)
      svg += `<path d="${smooth([...upper, ...lower])}" fill="${col}"/>`
    }
    const outline = smooth([
      ...sample((u) => [lerp(xs0, xs1, u), line(u) - 15 + edge(u * TAU)], 0, 1, 60),
      ...sample((u) => [lerp(xs0, xs1, u), line(u) + 15 + edge(u * TAU)], 1, 0, 60),
    ])
    svg += `<path d="${outline}" fill="none" stroke="#4E160A" stroke-width="2.2" opacity=".55"/>`
  }
  return { svg, top: base - 10, r: 380, bbox: [CX - 425, base - 70, CX + 425, base + 80] }
}

function chicken(doc, { base, R = 392, t = 76, seed = 61, spicy = false }) {
  const rand = rng(seed)
  const eT = wave(rand, [
    [2, 14],
    [3, 11],
    [5, 9],
    [8, 6],
    [13, 4.5],
    [21, 3],
    [34, 2],
  ])
  const yT = base - t
  const rT = (th) => R + eT(th)
  const rB = (th) => R - 14 + eT(th) * 0.8
  const top = doc.shape(smooth(loop((th) => polar(CX, yT, rT(th), th), 180)))
  const sil = doc.shape(
    smooth([
      ...sample((th) => polar(CX, yT, rT(th), th), PI, TAU, 90),
      [CX + rT(0) + 8, yT + t * 0.5],
      ...sample((th) => polar(CX, base, rB(th), th), 0.02, PI - 0.02, 90),
      [CX - rT(PI) - 8, yT + t * 0.5],
    ]),
  )
  const pal = spicy
    ? { top: ['#E58A48', '#C9572C', '#932E14'], side: ['#BE4D24', '#8E3014', '#561806'], light: '#F6AE72', dark: '#5A1606' }
    : { top: ['#F6C86C', '#E0A040', '#B9701F'], side: ['#D58F36', '#AA621C', '#6C380C'], light: '#FCE3A6', dark: '#8A4710' }
  const face = doc.flatRadial(
    [
      [0, pal.top[0]],
      [0.6, pal.top[1]],
      [1, pal.top[2]],
    ],
    CX - 50,
    yT - 10,
    R,
  )
  const onTop = (r) => polar(CX, yT, Math.sqrt(r()) * R * 0.98, r() * TAU)
  const onSide = (r) => {
    const th = between(r, 0.03, 0.97) * PI
    const [x, yTop] = polar(CX, yT, rT(th), th)
    const yBot = polar(CX, base, rB(th), th)[1]
    return [x, lerp(yTop, yBot, r())]
  }
  const crags =
    specks(rand, 260, onTop, { r: [3, 9], squash: 0.5, fills: [pal.light, pal.dark], opacity: 0.55 }) +
    (spicy ? specks(rand, 90, onTop, { r: [1.5, 3.5], squash: 0.5, fills: ['#5E0B03'], opacity: 0.8 }) : '')
  const sideCrags = specks(rand, 160, onSide, { r: [3, 8], squash: 0.7, fills: [pal.light, pal.dark], opacity: 0.45 })
  const svg =
    sil(
      `fill="${doc.vertical(
        [
          [0, pal.side[0]],
          [0.55, pal.side[1]],
          [1, pal.side[2]],
        ],
        yT,
        base + R * K,
      )}"`,
    ) +
    sil(`fill="${sideShade(doc, CX - R - 20, CX + R + 20, 0.8)}"`) +
    `<g clip-path="${sil.clip()}">${sideCrags}</g>` +
    top(`fill="${face}"`) +
    top(`fill="#000" filter="${doc.grain(pal.dark, { freq: 0.09, octaves: 3, seed: 62, gain: 2.4, bias: 1.25 })}" opacity=".4"`) +
    `<g clip-path="${top.clip()}">${crags}</g>` +
    top(`fill="#000" filter="${doc.grain(pal.light, { freq: 0.6, seed: 63 })}" opacity=".28"`)
  return { svg, top: yT, r: R, bbox: [CX - R - 30, yT - R * K - 30, CX + R + 30, base + R * K + 20] }
}

function mushrooms(doc, { base, seed = 71 }) {
  const rand = rng(seed)
  const pieces = []
  for (let i = 0; i < 18; i++) {
    const front = i < 11
    const th = front ? lerp(0.04 * PI, 0.96 * PI, (i + between(rand, 0.2, 0.8)) / 11) : between(rand, 0, TAU)
    const rr = front ? between(rand, 270, 330) : Math.sqrt(rand()) * 260
    pieces.push({ x: rr * Math.cos(th), z: rr * Math.sin(th), rot: between(rand, -35, 35), s: between(rand, 0.85, 1.15) })
  }
  pieces.sort((a, b) => a.z - b.z)
  const faceFill = doc.linear(
    [
      [0, '#DCC09C'],
      [1, '#A9825A'],
    ],
    { x1: 0, y1: 0, x2: 0, y2: 1 },
  )
  const cap = doc.shape(`M-62,6C-62,-38 -30,-52 0,-52C30,-52 62,-38 62,6C40,10 22,8 14,6L12,34C12,40 -12,40 -12,34L-14,6C-24,8 -40,10 -62,6Z`)
  let svg = ''
  for (const p of pieces) {
    const x = CX + p.x
    const y = base + p.z * K - 12
    // A sliced, sautéed mushroom: dome-shaped cap with a stub of stem, tipped toward the camera.
    svg +=
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(p.rot)}) scale(${f(p.s)} ${f(p.s * 0.58)})">` +
      cap(`fill="#3E2614" transform="translate(0 8)"`) +
      cap(`fill="${faceFill}"`) +
      `<path d="M-58,4C-58,-34 -28,-48 0,-48C28,-48 58,-34 58,4" fill="none" stroke="#5E3B1F" stroke-width="7"/>` +
      `<path d="M-30,-30C-18,-40 10,-42 26,-34" stroke="#F4E2C8" stroke-width="5" fill="none" opacity=".5" stroke-linecap="round"/>` +
      `</g>`
  }
  return { svg, top: base - 22, r: 330, bbox: [CX - 400, base - 120, CX + 400, base + 110] }
}

function onionRings(doc, { base, seed = 81, rings }) {
  const rand = rng(seed)
  const list = [
    ...(rings ?? [
      { x: -235, z: -10, r: 142 },
      { x: 232, z: 16, r: 138 },
    ]),
  ].sort((a, b) => a.z - b.z)
  const t = 34
  let svg = ''
  for (const s of list) {
    const x = CX + s.x
    const yB = base + s.z * K
    const yT = yB - t
    const sil = doc.shape(cylinder(x, yT, yB, s.r))
    const sideFill = doc.vertical(
      [
        [0, '#E9AE50'],
        [0.5, '#C98530'],
        [1, '#8C5416'],
      ],
      yT,
      yB + s.r * K,
    )
    const topFill = doc.flatRadial(
      [
        [0, '#F6CB78'],
        [1, '#D9953A'],
      ],
      x - 20,
      yT,
      s.r,
    )
    const hole = doc.vertical(
      [
        [0, '#3E2309'],
        [1, '#9A6224'],
      ],
      yT - s.r * K * 0.5,
      yT + s.r * K * 0.5,
    )
    const crumbs = specks(
      rand,
      90,
      (r) => {
        const [cx, cy] = polar(x, yT, between(r, s.r * 0.55, s.r * 0.98), r() * TAU)
        return [cx, cy + between(r, 0, 30)]
      },
      { r: [2.5, 6], squash: 0.6, fills: ['#FCE4A8', '#8A4F14'], opacity: 0.55 },
    )
    svg +=
      sil(`fill="${sideFill}"`) +
      sil(`fill="${sideShade(doc, x - s.r, x + s.r, 0.7)}"`) +
      flatEllipse(x, yT, s.r, `fill="${topFill}"`) +
      flatEllipse(x, yT + 2, s.r * 0.5, `fill="${hole}"`) +
      `<g clip-path="${sil.clip()}">${crumbs}</g>`
  }
  return { svg, top: base - t, r: 370, bbox: [CX - 390, base - t - 60, CX + 390, base + 70] }
}

function slaw(doc, { base, R = 368, t = 26, seed = 91 }) {
  const rand = rng(seed)
  const wob = wave(rand, [
    [4, 8],
    [7, 6],
    [13, 4],
    [29, 2.5],
  ])
  const yT = base - t
  const rf = (th) => R + wob(th)
  const top = smooth(loop((th) => polar(CX, yT, rf(th), th), 160))
  const sil = doc.shape(smooth([...sample((th) => polar(CX, yT, rf(th), th), PI, TAU, 80), ...sample((th) => polar(CX, base, rf(th) - 8, th), 0, PI, 80)]))
  const colors = ['#FFFFFF', '#F4F7E4', '#DCE9B2', '#9B4C8E', '#F2A04C']
  const groups = colors.map(() => [])
  for (let i = 0; i < 380; i++) {
    const onSide = rand() < 0.32
    const th = onSide ? between(rand, 0.05, 0.95) * PI : rand() * TAU
    const r = onSide ? rf(th) - 4 : Math.sqrt(rand()) * R * 0.96
    const [x, y0] = polar(CX, yT, r, th)
    const y = onSide ? y0 + between(rand, 2, t + 6) : y0
    const len = between(rand, 10, 26)
    const ang = between(rand, -PI, PI)
    const bend = between(rand, -6, 6)
    groups[Math.floor(rand() * colors.length)].push(
      `<path d="M${Math.round(x)},${Math.round(y)}q${f((Math.cos(ang) * len) / 2 + bend)},${f(((Math.sin(ang) * len) / 2) * 0.5 + bend)} ${f(Math.cos(ang) * len)},${f(Math.sin(ang) * len * 0.5)}"/>`,
    )
  }
  const shreds = groups.map((g, i) => `<g stroke="${colors[i]}" stroke-width="3" fill="none" stroke-linecap="round">${g.join('')}</g>`).join('')
  const svg =
    sil(`fill="#D9D8BE"`) +
    `<path d="${top}" fill="${doc.flatRadial(
      [
        [0, '#F7F6E6'],
        [1, '#DEDDC2'],
      ],
      CX - 30,
      yT,
      R,
    )}"/>` +
    shreds +
    sil(`fill="${sideShade(doc, CX - R, CX + R, 0.45)}"`)
  return { svg, top: yT, r: R, bbox: [CX - R - 20, yT - R * K - 20, CX + R + 20, base + R * K + 20] }
}

function crispyOnions(doc, { base, seed = 101, R = 345, count = 130 }) {
  const rand = rng(seed)
  const colors = ['#D9963F', '#B9702A', '#8E4C16', '#F0BC66', '#6E3810']
  const groups = colors.map(() => [])
  const shadows = []
  for (let i = 0; i < count; i++) {
    const front = rand() < 0.55
    const th = front ? between(rand, 0.05, 0.95) * PI : rand() * TAU
    const rr = front ? between(rand, R * 0.75, R) : Math.sqrt(rand()) * R
    const [x, y0] = polar(CX, base, rr, th)
    const y = y0 - between(rand, 0, 24)
    const a = between(rand, -PI, PI)
    const len = between(rand, 18, 42)
    const e = [x + Math.cos(a) * len, y + Math.sin(a) * len * 0.45]
    const c1 = [x + between(rand, -25, 25), y + between(rand, -18, 10)]
    const c2 = [e[0] + between(rand, -25, 25), e[1] + between(rand, -18, 10)]
    const d = `M${pt([x, y])}C${pt(c1)} ${pt(c2)} ${pt(e)}`
    shadows.push(`<path d="${d}"/>`)
    groups[Math.floor(rand() * colors.length)].push(`<path d="${d}"/>`)
  }
  const svg =
    `<g stroke="#3A1804" stroke-width="5" opacity=".35" fill="none" transform="translate(1.5 2.5)">${shadows.join('')}</g>` +
    groups.map((g, i) => `<g stroke="${colors[i]}" stroke-width="3.4" fill="none" stroke-linecap="round">${g.join('')}</g>`).join('')
  return { svg, top: base - 20, r: R, bbox: [CX - R - 50, base - R * K - 60, CX + R + 50, base + R * K + 30] }
}

function rocket(doc, { base, seed = 111, count = 14, R = 345 }) {
  const rand = rng(seed)
  const leafFill = doc.linear(
    [
      [0, '#5E9E3A'],
      [1, '#2E6A1E'],
    ],
    { x1: 0, y1: 0, x2: 1, y2: 0 },
  )
  const order = []
  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU + between(rand, -0.12, 0.12)
    order.push({ th, len: between(rand, 120, 165), z: Math.sin(th) })
  }
  order.sort((a, b) => a.z - b.z)
  let leaves = ''
  for (const { th, len } of order) {
    const lobes = (u) => Math.sin(PI * u) ** 0.8 * (1 + 0.35 * Math.sin(6 * PI * u))
    const half = sample((u) => [u * len, -22 * lobes(u)], 0, 1, 20)
    const other = sample((u) => [u * len, 22 * lobes(u)], 1, 0, 20)
    const [x, y] = polar(CX, base - 6, R * 0.64, th)
    const deg = (Math.atan2(Math.sin(th) * K, Math.cos(th)) * 180) / PI
    leaves +=
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(1 ${f(0.42 + 0.3 * Math.abs(Math.sin(th)))})">` +
      `<path d="${smooth([...half, ...other])}" fill="${leafFill}"/>` +
      `<path d="M0,0L${f(len * 0.92)},0" stroke="#A8D17A" stroke-width="2.5" opacity=".7"/>` +
      `</g>`
  }
  return { svg: leaves, top: base - 10, r: R, bbox: [CX - R - 120, base - 120, CX + R + 120, base + 100] }
}

function cheeseSauce(doc, { base, seed = 121 }) {
  return sauce(doc, { base, R: 350, t: 14, seed, kind: 'cheese', drips: 9, maxDrip: 70 })
}

const INGREDIENTS = {
  bottomBun,
  topBun,
  sauce,
  patty,
  cheese,
  tomatoes,
  lettuce,
  pickles,
  jalapenos,
  redOnion,
  bacon,
  chicken,
  mushrooms,
  onionRings,
  slaw,
  crispyOnions,
  rocket,
  cheeseSauce,
}

/* ──────────────────────────────────────────────────────────────── composition */

function build(doc, stack, base0) {
  let base = base0
  return stack.map(([name, opts = {}]) => {
    const out = INGREDIENTS[name](doc, { ...opts, base })
    const layer = { name, base, ...out }
    base = out.top
    return layer
  })
}

const svgFile = (doc, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
  `<title>${title}</title><defs>${doc.defs.join('')}</defs>${body}</svg>\n`

function write(rel, content) {
  const file = resolve(ROOT, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

/* — the exploded-view burger (bottom → top) — */

const EXPLODED = [
  { id: 'bottom-bun', label: 'Toasted brioche heel', layer: ['bottomBun'] },
  { id: 'sauce', label: 'Theory sauce', layer: ['sauce', { kind: 'theory', drips: 4 }] },
  { id: 'patty', label: 'Smashed beef patty', layer: ['patty'] },
  { id: 'cheese', label: 'Aged cheddar', layer: ['cheese', { kind: 'cheddar', rot: 0.12 }] },
  { id: 'tomato', label: 'Vine tomato', layer: ['tomatoes'] },
  { id: 'lettuce', label: 'Butter lettuce', layer: ['lettuce'] },
  { id: 'top-bun', label: 'Sesame brioche crown', layer: ['topBun'] },
]

function renderExploded() {
  // Measure once, then centre the assembled burger on the canvas.
  const probe = build(
    new Doc('x'),
    EXPLODED.map((l) => l.layer),
    1000,
  )
  const minY = Math.min(...probe.map((l) => l.bbox[1]))
  const maxY = Math.max(...probe.map((l) => l.bbox[3]))
  const base0 = 1000 + (SIZE / 2 - (minY + maxY) / 2)

  // Only the illustrated fallbacks are regenerated: keep the photo set's paths, outlines and `art` switch.
  const manifestPath = resolve(ROOT, 'src/data/burger-layers.json')
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const before = Object.fromEntries((previous.layers ?? []).map((l) => [l.id, l]))
  const manifest = {
    canvas: SIZE,
    note:
      previous.note ??
      'Bottom to top. bbox is [x0, y0, x1, y1] in 0-1000 canvas units. `npm run burger:check` measures the photo PNGs, fills their bbox and sets `art`. `npm run art` regenerates the illustrated fallbacks.',
    art: previous.art ?? 'illustration',
    layers: [],
  }
  let base = base0
  EXPLODED.forEach((entry, i) => {
    // One document per layer so every file is self-contained.
    const doc = new Doc(`${entry.id.replace(/[^a-z]/g, '')}${i}`)
    const [name, opts = {}] = entry.layer
    const out = INGREDIENTS[name](doc, { ...opts, base })
    write(`public/images/burger/${entry.id}.svg`, svgFile(doc, out.svg, entry.label))
    // Old-format manifests (no `fallback`) pointed `src` at the SVG: start the photo entry fresh.
    const photo = before[entry.id]?.fallback ? before[entry.id] : null
    manifest.layers.push({
      id: entry.id,
      label: entry.label,
      src: photo?.src ?? `/images/burger/${entry.id}.png`,
      bbox: photo?.bbox ?? null,
      fallback: { src: `/images/burger/${entry.id}.svg`, bbox: out.bbox.map((v) => Math.round(v)) },
    })
    base = out.top
  })
  write('src/data/burger-layers.json', formatManifest(manifest))
  return manifest
}

/* — menu products (bottom → top) — */

const CROWN = { R: 352, H: 172 }
const HEEL = { R: 350 }

const PRODUCTS = {
  'theory-classic': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'theory' }],
    ['patty', { t: 54, seed: 21 }],
    ['cheese', { kind: 'cheddar', rot: 0.1, seed: 3 }],
    ['patty', { t: 54, seed: 22 }],
    ['cheese', { kind: 'cheddar', rot: -0.15 }],
    ['tomatoes', { t: 18 }],
    ['lettuce', { hang: 18 }],
    ['topBun', CROWN],
  ],
  'double-trouble': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'theory', seed: 14 }],
    ['patty', { t: 56, seed: 23 }],
    ['cheese', { kind: 'american', rot: 0.15, seed: 4 }],
    ['patty', { t: 56, seed: 24 }],
    ['cheese', { kind: 'american', rot: -0.2 }],
    ['pickles'],
    ['redOnion'],
    ['topBun', { ...CROWN, seed: 12 }],
  ],
  'fire-house': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'chipotle', seed: 15, drips: 5 }],
    ['patty', { seed: 25 }],
    ['cheese', { kind: 'pepperjack', rot: 0.2 }],
    ['jalapenos'],
    ['crispyOnions'],
    ['topBun', { ...CROWN, seed: 13 }],
  ],
  'crispy-chicken': [
    ['bottomBun', { ...HEEL, bun: 'potato' }],
    ['sauce', { kind: 'mustard', seed: 16 }],
    ['lettuce', { seed: 6, R: 380, hang: 16 }],
    ['chicken'],
    ['pickles', { seed: 42 }],
    ['topBun', { ...CROWN, bun: 'potato', seeds: false }],
  ],
  'cheese-overload': [
    ['bottomBun', HEEL],
    ['patty', { t: 54, seed: 26 }],
    ['cheese', { kind: 'cheddar', rot: 0.12, seed: 5, sag: 1 }],
    ['patty', { t: 54, seed: 27 }],
    ['cheese', { kind: 'gouda', rot: -0.2, seed: 6, sag: 1 }],
    ['cheeseSauce'],
    ['topBun', { ...CROWN, seed: 14 }],
  ],
  'ultimate-stack': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'bbq', seed: 17 }],
    ['patty', { t: 48, seed: 28 }],
    ['cheese', { kind: 'cheddar', rot: 0.1, seed: 7 }],
    ['bacon'],
    ['patty', { t: 48, seed: 29 }],
    ['cheese', { kind: 'american', rot: -0.15, seed: 8 }],
    ['onionRings'],
    ['patty', { t: 48, seed: 30 }],
    ['cheese', { kind: 'cheddar', rot: 0.25, seed: 9 }],
    ['lettuce', { seed: 8, hang: 14 }],
    ['topBun', { ...CROWN, seed: 15 }],
  ],
  'nashville-heat': [
    ['bottomBun', { ...HEEL, bun: 'potato' }],
    ['slaw'],
    ['chicken', { spicy: true, seed: 64 }],
    ['pickles', { seed: 43 }],
    ['topBun', { ...CROWN, bun: 'potato', seeds: false, seed: 16 }],
  ],
  'garden-theory': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'aioli', seed: 18 }],
    ['patty', { kind: 'plant', seed: 31 }],
    ['cheese', { kind: 'vegan', rot: 0.18 }],
    ['tomatoes', { seed: 4 }],
    ['lettuce', { seed: 9, hang: 18 }],
    ['topBun', { ...CROWN, seed: 17 }],
  ],
  'truffle-shroom': [
    ['bottomBun', HEEL],
    ['sauce', { kind: 'truffle', seed: 19 }],
    ['patty', { seed: 32 }],
    ['cheese', { kind: 'swiss', rot: 0.1 }],
    ['mushrooms'],
    ['rocket'],
    ['topBun', { ...CROWN, seeds: false, seed: 18 }],
  ],
}

/** Products share one canvas: every burger stands on the same table line. */
const BASELINE = 880

function renderProduct(id, stack) {
  const doc = new Doc(id.replace(/[^a-z]/g, '').slice(0, 6))
  const layers = build(doc, stack, BASELINE - (HEEL.R - 18) * K)
  let body = flatEllipse(CX, BASELINE - 6, HEEL.R + 70, `fill="#000" opacity=".55" filter="${doc.blur(22)}"`)
  layers.forEach((layer, i) => {
    if (i > 0 && layer.name !== 'crispyOnions' && layer.name !== 'rocket') {
      body += flatEllipse(CX, layer.base + 5, layer.r + 6, `fill="#120600" opacity=".4" filter="${doc.blur(7)}"`)
    }
    body += layer.svg
  })
  write(`public/images/products/${id}.svg`, svgFile(doc, body, id.replace(/-/g, ' ')))
  return { id, top: Math.round(Math.min(...layers.map((l) => l.bbox[1]))) }
}

const manifest = renderExploded()
const products = Object.entries(PRODUCTS).map(([id, stack]) => renderProduct(id, stack))
console.log(`Exploded layers: ${manifest.layers.map((l) => l.id).join(', ')}`)
console.log(`Products: ${products.map((p) => `${p.id} (top y=${p.top})`).join(', ')}`)
