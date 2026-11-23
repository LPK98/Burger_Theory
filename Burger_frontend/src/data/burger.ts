import manifest from './burger-layers.json'

/**
 * The exploded-view burger.
 *
 * Every layer image shares one square canvas and is drawn at its assembled position,
 * so stacking them untouched shows the whole burger. Animation offsets below are in
 * percent of that canvas, which keeps the motion proportional at every screen size.
 *
 * Two art sets share the manifest: the photographic PNGs (`src`) and the generated
 * illustrations (`fallback`). `npm run burger:check` switches `art` to 'photo' only when
 * all seven PNGs exist and pass, so the page never mixes the two or requests a missing file.
 */

export type LayerId = 'bottom-bun' | 'sauce' | 'patty' | 'cheese' | 'tomato' | 'lettuce' | 'top-bun'

/** [x0, y0, x1, y1] in canvas units (0–1000). */
export type LayerBox = [number, number, number, number]

export type BurgerArt = 'photo' | 'illustration'

export interface BurgerLayer {
  id: LayerId
  label: string
  src: string
  /** The ingredient's outline on the canvas. */
  bbox: LayerBox
}

interface ManifestLayer {
  id: LayerId
  label: string
  /** Photographic PNG (1600 × 1600, transparent). */
  src: string
  /** Measured by `npm run burger:check`; null until the PNG exists and passes. */
  bbox: LayerBox | null
  fallback: { src: string; bbox: LayerBox }
}

const MANIFEST = manifest as unknown as { canvas: number; art: BurgerArt; layers: ManifestLayer[] }

/** Which art set the site shows. */
export const BURGER_ART: BurgerArt = MANIFEST.art === 'photo' && MANIFEST.layers.every((l) => l.bbox) ? 'photo' : 'illustration'

/** Pixel size of the live art's canvas (an aspect-ratio hint for `<img>`). */
export const BURGER_PIXELS = BURGER_ART === 'photo' ? 1600 : MANIFEST.canvas

/** Bottom → top, i.e. paint order. */
export const BURGER_LAYERS: BurgerLayer[] = MANIFEST.layers.map(({ id, label, src, bbox, fallback }) =>
  BURGER_ART === 'photo' ? { id, label, src, bbox: bbox ?? fallback.bbox } : { id, label, src: fallback.src, bbox: fallback.bbox },
)

export const LAYER_BY_ID = Object.fromEntries(BURGER_LAYERS.map((l) => [l.id, l])) as Record<LayerId, BurgerLayer>

export interface LayerOffset {
  /** Vertical offset, % of canvas height. */
  y: number
  /** Horizontal offset, % of canvas width. */
  x?: number
  /** Degrees. */
  rotate?: number
  /**
   * Melt pull: the layer stretches vertically by this fraction while it travels, then relaxes
   * to `STRETCH_REST` of it once it's out (0.1 = 10% longer at the peak).
   */
  stretch?: number
}

export type ExplodeMap = Record<LayerId, LayerOffset>

/** Share of the peak stretch a layer keeps while the burger holds exploded. */
export const STRETCH_REST = 0.3

/** Layers that catch a moving highlight (a light sweep) in the scroll scene. */
export const SHEEN_LAYERS: LayerId[] = ['top-bun', 'cheese']

/** CSS for a layer resting at its exploded position (matches where the scroll timeline holds). */
export function layerTransform(o: LayerOffset) {
  const sy = 1 + (o.stretch ?? 0) * STRETCH_REST
  return `translate(${o.x ?? 0}%, ${o.y}%) rotate(${o.rotate ?? 0}deg)${sy !== 1 ? ` scaleY(${sy})` : ''}`
}

/** How far each layer travels when the burger comes apart. */
export const EXPLODE: { desktop: ExplodeMap; compact: ExplodeMap } = {
  desktop: {
    'top-bun': { y: -29, rotate: -1.5 },
    lettuce: { y: -17, rotate: 1.5 },
    tomato: { y: -7, x: 7, rotate: 3 },
    cheese: { y: 2, x: -7, rotate: -1.5, stretch: 0.1 },
    patty: { y: 11, rotate: -5 },
    sauce: { y: 18 },
    'bottom-bun': { y: 26 },
  },
  compact: {
    'top-bun': { y: -24, rotate: -1 },
    lettuce: { y: -14, rotate: 1 },
    tomato: { y: -5.5, x: 4, rotate: 2 },
    cheese: { y: 2, x: -4, rotate: -1, stretch: 0.08 },
    patty: { y: 10, rotate: -4 },
    sauce: { y: 16 },
    'bottom-bun': { y: 23 },
  },
}

export interface IngredientStory {
  id: string
  /** Layers that move while this caption is on screen. */
  layers: LayerId[]
  /** Layers below that travel with the lead layer for now (they separate in a later step). */
  carry?: LayerId[]
  title: string
  body: string
  detail: string
  /** Which side of the burger the caption sits on (desktop). */
  side: 'left' | 'right'
  /** Shorter name for the progress rail. */
  short: string
}

export const INGREDIENT_STORIES: IngredientStory[] = [
  {
    id: 'start',
    layers: ['top-bun'],
    title: 'The perfect start',
    body: 'Brioche from our own oven, baked before sunrise, split and toasted on the flat-top to order.',
    detail: 'Sesame brioche crown',
    side: 'right',
    short: 'Bun',
  },
  {
    id: 'garden',
    layers: ['lettuce', 'tomato'],
    title: 'Fresh from the garden',
    body: 'Butter lettuce and vine tomatoes from two farms we can drive to. Sliced every service, never the night before.',
    detail: 'Butter lettuce, vine tomato',
    side: 'left',
    short: 'Garden',
  },
  {
    id: 'melt',
    layers: ['cheese'],
    title: 'The melt',
    body: 'Twelve-month cheddar laid on in the last thirty seconds, so it drapes over the edge instead of sweating.',
    detail: 'Aged cheddar',
    side: 'right',
    short: 'Melt',
  },
  {
    id: 'beef',
    layers: ['patty'],
    carry: ['sauce', 'bottom-bun'],
    title: 'The signature beef',
    body: 'Chuck and brisket ground every morning, smashed thin on a 230 °C griddle for a lacy, caramelised crust.',
    detail: 'Smashed beef patty',
    side: 'left',
    short: 'Beef',
  },
  {
    id: 'sauce',
    layers: ['sauce', 'bottom-bun'],
    title: 'The secret sauce',
    body: 'Tangy, smoky, a little sweet. The recipe lives on one index card, and the card lives in the safe.',
    detail: 'Theory sauce, toasted heel',
    side: 'right',
    short: 'Sauce',
  },
]

/** Caption anchor on the burger, in % of the canvas, for a given set of offsets. */
export function storyAnchor(story: IngredientStory, offsets: ExplodeMap) {
  const ys = story.layers.map((id) => {
    const [, y0, , y1] = LAYER_BY_ID[id].bbox
    return (y0 + y1) / 20 + offsets[id].y
  })
  const lead = LAYER_BY_ID[story.layers[0]]
  const dx = offsets[story.layers[0]].x ?? 0
  const x = story.side === 'right' ? lead.bbox[2] / 10 + dx : lead.bbox[0] / 10 + dx
  return { x, y: ys.reduce((a, b) => a + b, 0) / ys.length }
}
