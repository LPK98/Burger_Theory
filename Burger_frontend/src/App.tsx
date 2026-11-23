import { useEffect } from 'react'
import { AuthDialog } from './components/AuthDialog'
import { CartDrawer } from './components/CartDrawer'
import { CartToast } from './components/CartToast'
import { CheckoutReturnDialog } from './components/CheckoutReturnDialog'
import { Footer } from './components/Footer'
import { HoursDialog } from './components/HoursDialog'
import { Navbar } from './components/Navbar'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { SmoothScrollProvider } from './context/SmoothScrollContext'
import { ScrollTrigger } from './lib/gsap'
import { BrandStory } from './sections/BrandStory'
import { BurgerShowcase } from './sections/BurgerShowcase'
import { Contact } from './sections/Contact'
import { ExplodedBurger } from './sections/ExplodedBurger'
import { Menu } from './sections/Menu'
import { Restaurant } from './sections/Restaurant'

export default function App() {
  // Web fonts change line heights once they load; re-measure every trigger after that.
  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) ScrollTrigger.refresh()
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AuthProvider>
      <CartProvider>
        <SmoothScrollProvider>
          <a
            href="#main"
            className="ui fixed left-4 top-4 z-[100] -translate-y-24 rounded-[3px] bg-ember px-4 py-3 text-ink transition-transform focus:translate-y-0"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main" tabIndex={-1} className="outline-none">
            {/* 01 Hero + 02 Exploded burger share one pinned scene */}
            <ExplodedBurger />
            <BurgerShowcase />
            <BrandStory />
            <Menu />
            <Restaurant />
            <Contact />
          </main>
          <Footer />
          <CartDrawer />
          <AuthDialog />
          <HoursDialog />
          <CheckoutReturnDialog />
          <CartToast />
          <div className="grain" aria-hidden="true" />
        </SmoothScrollProvider>
      </CartProvider>
    </AuthProvider>
  )
}
