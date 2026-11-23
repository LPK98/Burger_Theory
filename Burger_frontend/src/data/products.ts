/**
 * Menu data. Prices are in cents. Images are the generated illustrations in
 * public/images/products — swap `image` for real photography when it exists
 * (keep a transparent background and the shared 1000 × 1000 canvas; see ASSETS.md).
 */

export type Category = 'beef' | 'chicken' | 'spicy' | 'plant'
export type CategoryFilter = 'all' | Category

export interface Product {
  id: string
  name: string
  description: string
  /** Price in cents. */
  price: number
  image: string
  imageAlt: string
  categories: Category[]
  badge?: 'Signature' | 'Hot' | 'Plant-based' | 'For two'
}

export const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'beef', label: 'Beef' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'spicy', label: 'Spicy' },
  { id: 'plant', label: 'Plant-based' },
]

export const PRODUCTS: Product[] = [
  {
    id: 'theory-classic',
    name: 'The Theory Classic',
    description: 'Double smashed beef, aged cheddar, fresh lettuce, vine tomato, signature sauce and our toasted brioche bun.',
    price: 1450,
    image: '/images/products/theory-classic-800.webp',
    imageAlt: 'Double cheeseburger with lettuce and tomato on a sesame brioche bun',
    categories: ['beef'],
    badge: 'Signature',
  },
  {
    id: 'double-trouble',
    name: 'Double Trouble',
    description: 'Two smashed patties, double American cheese, house pickles, raw red onion and Theory sauce.',
    price: 1690,
    image: '/images/products/double-trouble-800.webp',
    imageAlt: 'Double cheeseburger with pickles and red onion rings',
    categories: ['beef'],
  },
  {
    id: 'fire-house',
    name: 'Fire House Burger',
    description: 'Smashed beef, pepper jack, charred jalapeños, chipotle mayo and a tangle of crispy onions.',
    price: 1590,
    image: '/images/products/fire-house-800.webp',
    imageAlt: 'Burger with pepper jack, jalapeño slices and crispy onions',
    categories: ['beef', 'spicy'],
    badge: 'Hot',
  },
  {
    id: 'crispy-chicken',
    name: 'Crispy Chicken',
    description: 'Buttermilk-brined thigh fried twice, crisp lettuce, house pickles and honey mustard on a potato bun.',
    price: 1390,
    image: '/images/products/crispy-chicken-800.webp',
    imageAlt: 'Fried chicken burger with lettuce and pickles on a potato bun',
    categories: ['chicken'],
  },
  {
    id: 'cheese-overload',
    name: 'Cheese Overload',
    description: 'Two patties, aged cheddar, smoked gouda and a ladle of molten cheese sauce. Napkins included.',
    price: 1650,
    image: '/images/products/cheese-overload-800.webp',
    imageAlt: 'Double burger dripping with cheddar, gouda and cheese sauce',
    categories: ['beef'],
  },
  {
    id: 'ultimate-stack',
    name: 'The Ultimate Stack',
    description: 'Three patties, three cheeses, smoked bacon, onion rings and BBQ sauce. Built to share, rarely shared.',
    price: 2100,
    image: '/images/products/ultimate-stack-800.webp',
    imageAlt: 'Tall triple burger with bacon, onion rings and three cheeses',
    categories: ['beef'],
    badge: 'For two',
  },
  {
    id: 'nashville-heat',
    name: 'Nashville Heat',
    description: 'Cayenne-oil fried chicken, buttermilk slaw and pickles on a soft potato bun.',
    price: 1490,
    image: '/images/products/nashville-heat-800.webp',
    imageAlt: 'Spicy red fried chicken burger with slaw',
    categories: ['chicken', 'spicy'],
    badge: 'Hot',
  },
  {
    id: 'garden-theory',
    name: 'Garden Theory',
    description: 'Beetroot and black bean patty, vegan cheddar, tomato, lettuce and roasted garlic aioli.',
    price: 1350,
    image: '/images/products/garden-theory-800.webp',
    imageAlt: 'Plant-based burger with tomato and lettuce',
    categories: ['plant'],
    badge: 'Plant-based',
  },
  {
    id: 'truffle-shroom',
    name: 'Truffle Shroom',
    description: 'Smashed beef, Swiss cheese, sautéed mushrooms, peppery rocket and black truffle mayo.',
    price: 1750,
    image: '/images/products/truffle-shroom-800.webp',
    imageAlt: 'Burger with Swiss cheese, mushrooms and rocket on a brioche bun',
    categories: ['beef'],
  },
]

export const PRODUCTS_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]))

export const SIGNATURE_PRODUCT_ID = 'theory-classic'
