import './assets/main.css'
import '@mantine/core/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light" theme={{ primaryColor: 'orange', defaultRadius: 'sm' }}>
      <App />
    </MantineProvider>
  </StrictMode>
)
