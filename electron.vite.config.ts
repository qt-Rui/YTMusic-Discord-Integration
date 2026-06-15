import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * electron-vite unifies the three Electron build targets:
 *   - main:     Node/Electron main process (services, IPC, Discord, WS bridge)
 *   - preload:  the contextBridge that safely exposes a typed API to the UI
 *   - renderer: the React UI (sandboxed, no Node access)
 *
 * `externalizeDepsPlugin()` keeps runtime `dependencies` (e.g. `ws`) as real
 * Node requires instead of bundling them, which is what we want for native-ish
 * server code in the main process.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
