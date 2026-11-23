// The admin portal is its own page (admin/index.html) with its own bundle and styles:
// nothing here is loaded by the customer site.
import '@fontsource-variable/anybody/standard.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminApp } from './AdminApp'
import './admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
