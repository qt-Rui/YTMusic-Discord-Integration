import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createAppIcon } from './icon'

/**
 * Owns the single main window. The window is never truly destroyed while the
 * app runs with "minimize to tray" — it is hidden and re-shown, which keeps the
 * renderer warm (and resource usage low — no reload churn).
 */
export class WindowManager {
  private window: BrowserWindow | null = null

  create(startHidden: boolean): BrowserWindow {
    const win = new BrowserWindow({
      width: 420,
      height: 660,
      minWidth: 380,
      minHeight: 560,
      show: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: 'YTMusic Discord RPC',
      backgroundColor: '#0f1014',
      icon: createAppIcon(256),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // electron-vite injects ELECTRON_RENDERER_URL in dev for HMR; in a packaged
    // build we load the static file emitted to out/renderer.
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      void win.loadURL(devUrl)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    win.on('ready-to-show', () => {
      if (!startHidden) win.show()
    })

    // Any links the UI opens (e.g. the setup guide) go to the real browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    win.on('closed', () => {
      this.window = null
    })

    this.window = win
    return win
  }

  get(): BrowserWindow | null {
    return this.window
  }

  show(): void {
    if (!this.window) {
      this.create(false)
      return
    }
    if (this.window.isMinimized()) this.window.restore()
    this.window.show()
    this.window.focus()
  }

  hide(): void {
    this.window?.hide()
  }

  /** Push a JSON-serializable message to the renderer if it's alive. */
  send(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload)
    }
  }
}
