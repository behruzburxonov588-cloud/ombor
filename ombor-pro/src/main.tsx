import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/onest'
import './styles.css'
import { applyTheme } from './lib/theme'
applyTheme()
import { App } from './App'
import { SessionProvider } from './session'
import { ToastProvider } from './components/Toast'
import { Intro } from './components/Intro'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
          <Intro />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
