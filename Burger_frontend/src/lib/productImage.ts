/**
 * The menu illustrations are pre-rendered to WebP at two widths (scripts/rasterize-products.mjs).
 * `image` points at the 800px file; this returns the matching srcset so large or high-density
 * screens get the 1600px one. Other images (e.g. photos from the API) get no srcset.
 */
export function productSrcSet(src: string): string | undefined {
  const match = /^(.*\/images\/products\/[\w-]+)-(?:800|1600)\.webp$/.exec(src)
  return match ? `${match[1]}-800.webp 800w, ${match[1]}-1600.webp 1600w` : undefined
}
