import './assets/main.css'
import '@mantine/core/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './App'

const theme = createTheme({
  primaryColor: 'sunset',
  defaultRadius: 'md',
  colors: {
    sunset: [
      '#fff0eb',
      '#ffd8cd',
      '#ffb7a1',
      '#ff9477',
      '#ff7458',
      '#ff5a46',
      '#ff4d6d',
      '#e53b61',
      '#c92f58',
      '#ac254c'
    ],
    lilac: [
      '#f6efff',
      '#e7d7ff',
      '#d5b9ff',
      '#c195ff',
      '#af74ff',
      '#a05dff',
      '#8f3ff2',
      '#7d31d5',
      '#6c27b7',
      '#591f97'
    ]
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>
)
