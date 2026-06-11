import './island.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import IslandApp from './IslandApp'

createRoot(document.getElementById('island-root')!).render(
  <StrictMode>
    <IslandApp />
  </StrictMode>
)
