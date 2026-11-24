/**
 * Brand and venue details. Everything here is placeholder content —
 * replace it with the real restaurant's information before launch.
 */
export const SITE = {
  name: 'Burger Theory',
  tagline: 'Not just a burger. An experience.',
  locale: 'en-US',
  currency: 'USD',
  // Phone, email, address and social links are not kept here: they come from the API
  // (GET /restaurant → profile), edited in the admin portal under Settings.
  // Opening hours are not kept here: they come from the API (GET /opening-hours, managed in the admin portal).
} as const

export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'story', label: 'Our story' },
  { id: 'menu', label: 'Menu' },
  { id: 'contact', label: 'Contact' },
] as const

export type SectionId = (typeof NAV_LINKS)[number]['id']
