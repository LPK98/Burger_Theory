import type { CSSProperties, Ref } from 'react'
import { BURGER_LAYERS, BURGER_PIXELS, layerTransform, SHEEN_LAYERS, type ExplodeMap } from '../data/burger'
import { cn } from '../lib/utils'
import './BurgerLayers.css'

interface BurgerLayersProps {
  className?: string
  /** Load eagerly with high priority (above-the-fold usage). */
  priority?: boolean
  /** Accessible description. Omit for purely decorative instances. */
  label?: string
  /** Render statically pulled apart (used for the reduced-motion diagram). */
  offsets?: ExplodeMap
  /** Keep each layer on its own GPU layer (only where layers animate every frame). */
  composited?: boolean
  /** Add the light-sweep overlays (`[data-sheen]`) the scroll scene animates. */
  sheen?: boolean
  ref?: Ref<HTMLDivElement>
}

/**
 * Seven transparent images on one shared canvas. Untouched they form the whole burger;
 * GSAP moves each `[data-layer]` wrapper independently to take it apart.
 *
 * With `sheen`, glossy layers also get a highlight masked to the ingredient's own
 * silhouette. Its bands sit off the canvas until the scene sweeps one across.
 */
export function BurgerLayers({ className, priority = false, label, offsets, composited = false, sheen = false, ref }: BurgerLayersProps) {
  return (
    <div
      ref={ref}
      className={cn('relative aspect-square', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {BURGER_LAYERS.map((layer, index) => {
        const [x0, y0, x1, y1] = layer.bbox
        const offset = offsets?.[layer.id]
        const style: CSSProperties = {
          zIndex: index + 1,
          // Rotate/scale around the ingredient itself, not the middle of the canvas.
          transformOrigin: `${(x0 + x1) / 20}% ${(y0 + y1) / 20}%`,
          ...(offset && { transform: layerTransform(offset) }),
          ...(composited && { willChange: 'transform' }),
        }
        const mask = `url("${layer.src}")`
        return (
          <div key={layer.id} data-layer={layer.id} className="burger-layer" style={style}>
            <img
              src={layer.src}
              alt=""
              width={BURGER_PIXELS}
              height={BURGER_PIXELS}
              draggable={false}
              decoding="async"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
            />
            {sheen && SHEEN_LAYERS.includes(layer.id) && (
              <span className="burger-sheen" data-sheen={layer.id} style={{ maskImage: mask, WebkitMaskImage: mask }}>
                <span className="burger-sheen-band" data-band="load" />
                <span className="burger-sheen-band" data-band="scroll" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
