import type { RendererApi } from '../types/ipc'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
