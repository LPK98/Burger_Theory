// Anybody needs its width axis (standard = wght + wdth); Newsreader only needs weight.
import '@fontsource-variable/anybody/standard.css'
import '@fontsource-variable/newsreader/wght.css'
import 'lenis/dist/lenis.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
