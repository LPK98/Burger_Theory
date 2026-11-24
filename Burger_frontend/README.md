# Burger Theory: a cinematic burger restaurant website

A scroll-driven, single-page site for **Burger Theory**, a premium smash-burger restaurant.

The centrepiece is a pinned scene. The burger you land on is the same burger that comes apart layer by layer as you scroll, explains each ingredient, and reassembles before the page moves on. A working menu and frontend cart follow.

> **Status:** frontend complete. Imagery is placeholder: generated illustrations and Unsplash photos (see [ASSETS.md](ASSETS.md)). Customer accounts (sign up, log in, log out) run against the Laravel API in `../backend`, and ordering requires an account. Order placement itself isn't wired to the API yet; checkout says so honestly.

---

## Quick start

Requires **Node 20.19+ or 22.12+**. Tested with Node 24.18 and npm 12.2.

```bash
npm install
npm run dev       # development server → http://localhost:5173
npm run build     # type-check (tsc -b) + production build → dist/
npm run preview   # serve the production build → http://localhost:4173
npm run lint      # oxlint
npm run art       # regenerate the burger illustrations (scripts/generate-art.mjs)
npm run burger:check  # check the photo burger layers and switch the site to them when all seven pass
```

**Dev-only tool:** with `npm run dev` running, open **http://localhost:5173/asset-preview.html**, the burger asset inspector. It shows the seven layers assembled, exploded (with an offset tuner) and on their own, on a transparency checkerboard. It also shows measured outlines, image dimensions, an alignment report, missing-file warnings and exportable generation guides, plus all product renders. It is not part of the production build. To make the photographic layers, see **BURGER-PROMPTS.md**.

---

## The page

| # | Section | File | What happens |
| --- | --- | --- | --- |
| 01 | Hero | `src/sections/Hero.tsx` | Two giant headline lines sit above and below the burger, placed from its outline so it is always centred between them. Entrance on load, idle float, a warm key light that follows the pointer, an overhead light and a pool of light under the burger. |
| 02 | Exploded burger | `src/sections/ExplodedBurger.tsx` | A pinned, scrubbed timeline. Seven layers separate one ingredient at a time, captions with leader lines appear, a progress rail tracks the step, then the burger reassembles. |
| 03 | Showcase | `src/sections/BurgerShowcase.tsx` | The Theory Classic on a turning stand under a spotlight. The ring text passes behind and in front of the burger, and spins faster while you scroll. Pointer parallax. "Order now" adds it to the cart. |
| 04 | Brand story | `src/sections/BrandStory.tsx` | An editorial spread on cream. Photography is annotated like a diagram, and the photos reveal with a clip-path wipe. |
| 05 | Signature menu | `src/sections/Menu.tsx` | Nine burgers with category filters (GSAP Flip re-flows the grid), add-to-cart, and in-card quantity steppers. |
| 06 | Restaurant | `src/sections/Restaurant.tsx` | An asymmetric photo collage, opening hours and a placeholder location card. |
| 07 | Final call to action | `src/sections/Contact.tsx` | The burger builds itself one last time, plus contact details and social links. |
| 08 | Footer | `src/components/Footer.tsx` | Logo, navigation, visit and contact details, social links, and a wordmark that rises into place. |

The site also has:
- a fixed navigation bar: links centred on the burger's axis, an ember dot that glides to the active section, glass once you scroll,
- a full-screen mobile menu,
- a cart drawer with quantity controls and subtotal,
- customer accounts: a sign-up / log-in dialog and an account button in the navigation bar,
- an add-to-cart toast,
- an animation that flies the burger into the cart.

---

## Stack

| Purpose | Package |
| --- | --- |
| UI | React 19.3, TypeScript 7.0 |
| Build | Vite 8.3 (`@vitejs/plugin-react`) |
| Styling | Tailwind CSS 4.3 (`@tailwindcss/vite`, tokens in `src/index.css`) |
| Animation | GSAP 3.15 (ScrollTrigger, Flip), `@gsap/react` 2.1 (`useGSAP` cleanup) |
| Smooth scroll | Lenis 1.3 |
| Icons | lucide-react 1.77. Lucide 1.x dropped brand marks, so Instagram and Facebook are drawn in `SocialIcons.tsx`. |
| Fonts (self-hosted) | Anybody Variable (display, width + weight axes), Newsreader Variable (text). Both via Fontsource. |
| API | axios 1.x, via the client copied from `backend/docs/frontend-integration/` |
| Lint | oxlint (the linter the official Vite template now ships) |

---

## Project structure

```
Burger_frontend/
├── admin/index.html            admin portal page (served for every /admin/* path)
├── asset-preview.html          dev tool: check layer alignment and product renders
├── ASSETS.md                   image asset checklist and replacement guide
├── BURGER-PROMPTS.md           how to make the photoreal burger layers: spec, workflows, prompts
├── scripts/
│   ├── generate-art.mjs        draws all burger illustrations as SVG (no dependencies)
│   ├── burger-check.mjs        validates the photo layers, measures outlines, switches the art set
│   ├── burger-rules.mjs        alignment rules shared by burger-check and asset-preview.html
│   └── blender/render_layers.py renders the seven layers from one Blender scene
├── public/
│   ├── favicon.svg
│   └── images/
│       ├── burger/             7 exploded-view layers on one shared canvas (photo PNGs + SVG fallbacks)
│       ├── products/           9 menu renders on one shared canvas and table line
│       ├── story/              brand-story photography (800w / 1600w WebP)
│       ├── restaurant/         restaurant photography (800w / 1600w WebP)
│       └── branding/           logo mark
└── src/
    ├── main.tsx · App.tsx · index.css (design tokens and utilities)
    ├── admin/                  the admin portal: AdminApp (routes), auth, layout, admin.css,
    │                           lib/ (API client, endpoints, types, formatting), components/, pages/
    ├── styles/animations.css   CSS-only loops and hover motion, plus reduced-motion overrides
    ├── sections/               Hero, ExplodedBurger, BurgerShowcase, BrandStory, Menu, Restaurant, Contact
    ├── components/             Navbar, MobileMenu, Footer, Button, BurgerLayers, ProductCard,
    │                           CartDrawer, CartToast, AuthDialog, QuantityStepper, SplitLines, Logo, SocialIcons
    ├── context/                CartContext (provider), cart-store (types and contexts),
    │                           AuthContext (provider), auth-store (types and contexts),
    │                           SmoothScrollContext (Lenis provider), smooth-scroll
    ├── hooks/                  useLenis, useCart, useAuth, useMediaQuery, useFocusTrap, useSectionNav
    ├── data/                   site.ts (venue info), products.ts (menu), burger.ts (layers, offsets, copy),
    │                           burger-layers.json (layer manifest: photo PNGs + illustrated fallbacks)
    ├── lib/                    gsap.ts (plugin registration), reveal.ts, flyToCart.ts, utils.ts
    └── services/
        ├── api/client.ts       the only place that holds the auth token; typed API calls
        ├── api/types.ts        API request and response types
        └── orders.ts           ← order placement plugs in here (guests are refused)
```

---

## How the exploded burger works

1. **Layers on one canvas.** Each ingredient is its own transparent image, drawn at its *assembled* position on one shared square canvas. Stacked untouched, they form the burger. `burger-layers.json` lists two art sets: the photographic PNGs (`src`) and the generated SVGs (`fallback`). `art` says which one is live, and `npm run burger:check` sets it to `photo` only when all seven PNGs exist and pass, so the page never mixes sets or requests a missing file. Each layer's outline (`bbox`, in 0–1000 canvas units, measured from the PNG's alpha channel) sets its rotation origin, where its caption's leader line points, and where the table shadow and the landing squash sit.
2. **One pinned scene for sections 01 and 02.** ScrollTrigger pins the scene for 6 viewport-heights on desktop and 5 on smaller screens, scrubbing a single master timeline (`scrub: 0.7`).
3. **A timeline per ingredient.** Each ingredient story builds its own sub-timeline: its layers move, its caption arrives and its leader line draws. These are placed on the master timeline at fixed steps. Layers underneath travel with the patty so the stack never collapses on itself. The burger then reassembles from the outside in (buns first).
4. **One owner per animated property.** The load intro, idle float, hero lift, scroll scale, pointer drift and scroll timeline each animate their own wrapper element. That keeps them from overwriting each other when you scroll back up. The intro uses `y` in pixels and the scroll timeline uses `yPercent`.
5. **Responsive by construction.** Offsets are percentages of the canvas, so motion scales with the burger. `gsap.matchMedia()` switches between two layouts:
   - **1024 px and up:** side captions with leader lines and a progress rail.
   - **Below 1024 px:** shorter travel, with captions under the burger.
6. **Cleanup.** Every animation lives inside `useGSAP` and `gsap.matchMedia()`, so it is reverted on unmount and on breakpoint changes. The pinned section has its own parent element, so ScrollTrigger's pin-spacer never sits between React-managed siblings.
7. **Tuning.** Travel distances live in `EXPLODE` and the copy in `INGREDIENT_STORIES` (both in `src/data/burger.ts`). Pin length and step spacing are `PIN_LENGTH` and `STEP` in `ExplodedBurger.tsx`.
8. **Finishing touches.** The cheddar stretches as it pulls away (`stretch` in `EXPLODE`) and keeps a little of that stretch while the burger holds apart. A light sweep, masked to the ingredient's silhouette, runs across the crown on page load, across the crown and cheddar as they lift, and across the crown again on reassembly. When the stack closes, it lands with a small squash on its own `[data-anim="settle"]` wrapper.
9. **Hero composition.** The headline is laid out around the burger, not against the screen edges. `ExplodedBurger.css` works out the burger's outline at hero size (from the layer manifest and `HERO_SCALE`, passed in as CSS variables), then ends "Not just" `--hero-gap` above the crown and starts "a burger." the same gap below the heel. The tagline hangs from the cap line of "Not just", and the scroll cue stands on the baseline of "a burger.". On desktop the burger is centred in the space under the nav. On phones the whole stack is centred between the nav and the scroll cue, and landscape phones use the desktop's diagonal. While the headline is up, the `[data-anim="lift"]` wrapper moves the burger there; it measures the `.hero-anchor` marker to find the spot, and the lift is back to 0 before the first ingredient moves, so the story's camera (`--stage-y`) is unchanged.

**Reduced motion:** Lenis and pinning are switched off. The hero is still, and a static, labelled exploded diagram (`AnatomyDiagram`) shows the same content. Scroll reveals and CSS loops are disabled.

---

## Smooth scrolling

Lenis runs from GSAP's ticker (`SmoothScrollContext.tsx`), and every Lenis scroll event calls `ScrollTrigger.update`. That keeps both libraries on the same frame and the same scroll position. Touch devices keep native momentum scrolling.

Dialogs (cart drawer, account dialog, mobile menu) call `lock()` and `unlock()`. The cart's item list uses `data-lenis-prevent`, so it scrolls on its own.

---

## Cart and ordering

- **State.** A reducer in `CartContext.tsx`, persisted to `localStorage`. Stored carts are validated against the menu when the page loads.
- **Re-renders.** State and actions are separate contexts, so action-only consumers don't re-render when the cart changes.
- **Prices.** Stored in cents and formatted with `Intl.NumberFormat`. Currency and locale live in `src/data/site.ts`.
- **Checkout (signed-in customers only).** Calls `submitOrder()` in `src/services/orders.ts`. Until order placement is wired to the API, it returns `status: 'unavailable'`, and the drawer tells the customer that nothing was charged or sent, then gives the phone number.

### Accounts: browse freely, sign up to order

Anyone can browse the site and fill a cart. Placing an order needs an account.

- **The gate.** For guests, the cart's button reads **Sign up to order** (with a **Log in** link) instead of **Checkout**. It closes the cart and opens `AuthDialog`. When the dialog closes, signed in or not, the cart comes back. Signed in, the cart shows **Checkout** and "Ordering as *name*".
- **Three layers.** The cart gates the button, `submitOrder()` refuses guests, and the API's `POST /orders` requires a Sanctum token. The API check is the one that actually matters.
- **API.** `POST /register`, `POST /login`, `POST /logout` and `GET /user` on `VITE_API_URL` (default `http://localhost:8000/api/v1`). The API must be running, and its `FRONTEND_URL` must match this site's origin for CORS.
- **Token.** Stored by `src/services/api/client.ts` in `localStorage['burger-theory:auth-token']` (in memory if storage is blocked). On load, a saved token is confirmed with `GET /user`. A 401 anywhere drops it, and signing in or out in another tab is picked up too. `AuthContext` mirrors who is signed in for the UI. Don't add a second token store.
- **Validation.** The form checks required fields, email shape, the API's phone pattern, matching passwords, and the API's production password rule (10+ characters, letters and numbers). It shows the API's own errors next to the right field. Examples: "The email has already been taken." and "These credentials do not match our records."
- **Navbar.** The person button opens **Log in** for guests. Signed-in customers see their initial; it opens their details and **Log out**.

### Connecting order placement

The storefront menu is priced in USD cents, but the API prices in LKR (1450 vs 145000 for the Theory Classic). Align the menu and currency first (backend/docs/FRONTEND_INTEGRATION.md §1–2). Then replace the body of `submitOrder()` with the drop-in from §5 (`cart.syncFromLocal` + `orders.place`), keeping the signed-in check.

---

## Admin portal (`/admin`)

The restaurant's back office: **http://localhost:5173/admin** with `npm run dev` (the Laravel API must be running too).

**Access.**
- The first administrator is created on the backend with `php artisan app:create-admin`. There's no public admin sign-up.
- The portal signs in through `POST /api/v1/admin/login`, which only gives tokens to administrators. Customers get the same "credentials don't match" answer as a wrong password.
- Every `/api/v1/admin/*` route checks the role again on the server.
- Signed-out visitors to any `/admin/...` page go to `/admin/login` and come back afterwards.
- The admin token is stored separately from the customer one (`burger-theory:admin-token`). Signing in to one never signs you in to the other.

**Pages.**

| Page | What it does |
| --- | --- |
| Dashboard | Today's and total revenue, orders, pending, completed and customers. Kitchen stages at a glance, revenue and order charts (daily, weekly, monthly), status distribution, best sellers, recent orders, low-stock ingredients and recent customer activity. |
| Orders | Searchable, filterable, paginated list (status, payment, method, fulfilment, dates, sort) and a **kitchen board** with live tickets by stage. The order drawer shows customer, address, items, payments and timeline. It moves orders through the workflow, records cash collected, and cancels or rejects with a reason. |
| Payments | PayHere and cash payments with filters and totals. The detail shows the PayHere notifications and whether each signature verified. |
| Products | Cards or table. Create, edit and delete (with restore). Price in rupees, categories, on-menu and featured switches, sellable stock with a logged history, Cloudinary photos and the burger's **recipe**. |
| Categories | Create, edit, hide, reorder, delete. |
| Inventory | Ingredients with stock, minimum level, last week's use and days of cover. Record deliveries, stock counts and waste. Full stock history and a consumption report. |
| Customers | Orders, spending and last order per customer, with search and sorting. The customer drawer has stats, favourite burgers, addresses and paginated order history. |
| Promotions | Percentage or fixed codes with caps, minimum order, total and per-customer limits, start and expiry times (Sri Lanka time), on/off and website listing. |
| Reports | Date range presets or custom, grouped by day, week or month. Revenue, orders, busiest hours, best sellers, status, fulfilment and payment breakdowns, and CSV export. |
| Settings | Restaurant name, logo, contact details, address, opening hours, ordering switches, delivery charge, free-delivery threshold, minimum order and preparation time. Also shows which server integrations are configured. |
| Profile | Your name, email and phone, and password change. |

**How it's built.**
- It's a separate page: `admin/index.html` → `src/admin/main.tsx`. It has its own bundle and its own Tailwind stylesheet (`src/admin/admin.css`, scoped to `src/admin` with `source(none)`).
- `src/index.css` excludes `src/admin` with `@source not`, so the customer site's CSS is unchanged.
- React Router (basename `/admin`) and TanStack Query.
- Filters live in the URL, so a filtered view can be bookmarked or shared.
- Charts are plain SVG (`src/admin/components/charts.tsx`): one validated orange per series, a hover crosshair or tooltip, keyboard reading through a hidden range input, and a table view on every chart card.
- Pages are lazy-loaded.

**Hosting.**
- `npm run build` writes `dist/index.html` and `dist/admin/index.html`.
- The admin portal routes on the client, so the web server must answer every `/admin/*` path that isn't a file with `dist/admin/index.html`. `npm run dev` and `npm run preview` already do this (`vite.config.ts`).
- Set `VITE_API_URL` for the build.
- The API's `FRONTEND_URL` must match the site's origin for CORS.

**Not included.**
- **Product variations and add-ons:** checkout sells each burger as one fixed item, so options would have nowhere to appear.
- **Photo and logo uploads:** these need `CLOUDINARY_*` in the backend `.env`. Until then the portal says so and disables the buttons.

**Demo data.** To see the dashboard with history on a development database, run `php artisan db:seed --class=DemoActivitySeeder` in the backend. It's opt-in and refuses to run in production.

---

## Editing content

- **Venue details:** `src/data/site.ts` holds the name, phone, email, address, hours, social links, currency and locale.
- **Menu:** `src/data/products.ts` holds products, prices (in cents), categories and badges.
- **Burger story:** `src/data/burger.ts` holds the ingredient captions and how far each layer travels.
- **Brand tokens:** colours, fonts and utilities are in `src/index.css` (the `@theme` block).

---

## Accessibility and performance

- **Semantics.** Semantic landmarks and a single `h1`, a skip link, visible `:focus-visible` rings, and labelled icon buttons.
- **Dialogs.** The cart and mobile menu are proper dialogs: focus moves in, Tab is trapped, Escape closes them, focus returns to the button that opened them, and `inert` hides them when closed.
- **Live regions.** The cart toast, filter results and checkout status are announced politely. The animated captions are hidden from screen readers and replaced by a screen-reader-only list, so the story doesn't depend on scrolling.
- **Images.** Hero layers load eagerly with high fetch priority. Everything else is lazy, and photos are served at 800w or 1600w through `srcset`.
- **Smooth animation.** Animated layers are kept on their own GPU layers so the SVG art isn't re-rasterised every frame. The showcase spin pauses when it is off screen.
- **Fonts.** Self-hosted and loaded as Latin subsets on demand. Newsreader uses its weight-only file (58 kB instead of 132 kB).

---

## Testing results (22 Nov 2026)

| Check | Result |
| --- | --- |
| `npm run build` | ✅ Passes (`tsc -b` + `vite build`). JS 454.0 kB (150.3 kB gzip), CSS 46.5 kB (10.4 kB gzip). |
| `npm run lint` | ✅ 0 warnings, 0 errors (39 files). `jsx-a11y/prefer-tag-over-role` is turned off on purpose: the dialogs use the ARIA dialog pattern so GSAP can animate them in and out. |
| Browser console | ✅ 0 errors and 0 warnings on the production build (`npm run preview`), including a full run: empty-cart drawer, every filter, add to cart, checkout, empty cart. |
| Images and fonts | ✅ 30 of 30 images loaded, both font families loaded, no 404s. |
| Viewports | ✅ 1920 × 1080, 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 375 × 667. Hero composition, every exploded-burger stage, captions and rail, all sections. No horizontal overflow on phones. |
| Interactions | ✅ Add to cart, quantity steppers, remove, subtotal maths, checkout notice, empty cart, cart persists across reloads, Flip filtering, mobile menu navigation, focus return, Escape to close. |
| Reduced motion | ✅ No Lenis, no pinning, static anatomy diagram, all content visible. |
| Scroll back | ✅ Scrolling down through the scene and back to the top restores the hero exactly. |

**Not covered:** testing ran in Chromium (Playwright) only. Check Safari, Firefox and real touch devices (address-bar resizing, momentum scrolling) before launch.

---

## Credits

- **Placeholder photography:** [Unsplash](https://unsplash.com) contributors, under the Unsplash License. Sources are listed in [ASSETS.md](ASSETS.md). Replace before launch.
- **Fonts:** Anybody (Etcetera Type Co.) and Newsreader (Production Type), both SIL Open Font License, via Fontsource.
- **Icons:** Lucide (ISC License).
