import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // onnxruntime-node loads a native addon at runtime; keep it external so
        // it is required from node_modules (asarUnpack'd) instead of bundled.
        external: ['onnxruntime-node']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          recording: resolve(__dirname, 'src/preload/recording.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          recording: resolve(__dirname, 'src/renderer/recording/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
