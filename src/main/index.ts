import { app, shell } from 'electron'
import { join } from 'node:path'

import { Logger } from '../services/Logger'
import { SettingsStore } from '../services/SettingsStore'
import { DiscordPresenceService } from '../services/DiscordPresenceService'
import { MediaBridgeServer } from '../services/MediaBridgeServer'
import { TrackResolver } from '../services/TrackResolver'
import { AutoLaunchService } from '../services/AutoLaunchService'

import { WindowManager } from './windowManager'
import { TrayManager } from './tray'
import { registerIpc, unregisterIpc, type IpcBackend } from './ipc'
import { IpcChannels, type AppState } from '../types/ipc'
import type { AppSettings } from '../types/settings'

/**
 * Composition root. Constructs every service, wires their events to a single
 * `broadcast()` that pushes a full {@link AppState} to the renderer + tray, and
 * implements the {@link IpcBackend} the UI calls into.
 */
class AppController implements IpcBackend {
  private readonly logger: Logger
  private readonly settings: SettingsStore
  private readonly discord: DiscordPresenceService
  private readonly bridge: MediaBridgeServer
  private readonly resolver: TrackResolver
  private readonly autoLaunch: AutoLaunchService
  private readonly windows = new WindowManager()
  private readonly tray: TrayManager

  private isQuitting = false

  constructor(private readonly startHidden: boolean) {
    this.logger = new Logger(app.getPath('logs'))
    this.settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), this.logger)
    this.logger.setDebug(this.settings.get().debugLogging)

    this.discord = new DiscordPresenceService(
      () => this.settings.get().discordClientId,
      this.logger
    )
    this.bridge = new MediaBridgeServer(this.settings.get().bridgePort, this.logger)
    this.resolver = new TrackResolver(this.settings, this.discord, this.bridge, this.logger)
    this.autoLaunch = new AutoLaunchService(this.logger)
    this.tray = new TrayManager({
      onShow: () => this.windows.show(),
      onToggleRpc: (enabled) => this.updateSettings({ enableRichPresence: enabled }),
      onReconnectDiscord: () => this.discord.reconnect(),
      onQuit: () => this.quit()
    })
  }

  start(): void {
    this.logger.info('app', `starting v${app.getVersion()} (hidden=${this.startHidden})`)

    // Reconcile OS auto-launch with the persisted preference.
    if (this.autoLaunch.isEnabled() !== this.settings.get().launchOnStartup) {
      this.autoLaunch.set(this.settings.get().launchOnStartup)
    }

    const win = this.windows.create(this.startHidden)
    win.on('close', (e) => {
      if (!this.isQuitting && this.settings.get().minimizeToTray) {
        e.preventDefault()
        this.windows.hide()
      }
    })

    this.tray.create(this.buildState())
    registerIpc(this)

    // Any change in any subsystem results in one consolidated broadcast.
    this.discord.on('status', () => this.broadcast())
    this.bridge.on('status', () => this.broadcast())
    this.bridge.on('clients', () => this.broadcast())
    this.resolver.on('track', () => this.broadcast())

    this.resolver.start()
    this.bridge.start()
    this.discord.start()

    this.broadcast()
  }

  // --- IpcBackend ------------------------------------------------------------

  getState(): AppState {
    return this.buildState()
  }

  updateSettings(patch: Partial<AppSettings>): AppState {
    const prev = this.settings.get()
    const next = this.settings.update(patch)
    this.applySettingsEffects(prev, next)
    this.broadcast()
    return this.buildState()
  }

  windowMinimize(): void {
    this.windows.get()?.minimize()
  }

  windowHide(): void {
    this.windows.hide()
  }

  windowClose(): void {
    if (this.settings.get().minimizeToTray) this.windows.hide()
    else this.quit()
  }

  openExtensionFolder(): void {
    const dir = app.isPackaged
      ? join(process.resourcesPath, 'extension')
      : join(app.getAppPath(), 'extension')
    void shell.openPath(dir)
  }

  reconnectDiscord(): void {
    this.discord.reconnect()
  }

  // --- internals -------------------------------------------------------------

  private applySettingsEffects(prev: AppSettings, next: AppSettings): void {
    if (prev.debugLogging !== next.debugLogging) this.logger.setDebug(next.debugLogging)
    if (prev.bridgePort !== next.bridgePort) this.bridge.restart(next.bridgePort)
    if (prev.discordClientId !== next.discordClientId) this.discord.reconnect()
    if (prev.launchOnStartup !== next.launchOnStartup) this.autoLaunch.set(next.launchOnStartup)
    this.resolver.onSettingsChanged()
  }

  private buildState(): AppState {
    return {
      discord: { status: this.discord.status, detail: this.discord.statusDetail },
      bridge: {
        status: this.bridge.status,
        clients: this.bridge.clientCount,
        detail: this.bridge.statusDetail
      },
      track: this.resolver.getCurrentTrack(),
      settings: this.settings.get()
    }
  }

  private broadcast(): void {
    const state = this.buildState()
    this.windows.send(IpcChannels.StateUpdate, state)
    this.tray.update(state)
  }

  focusExisting(): void {
    this.windows.show()
  }

  /** Mark that we're shutting down so the close handler stops hiding the window. */
  markQuitting(): void {
    this.isQuitting = true
  }

  quit(): void {
    this.markQuitting()
    app.quit()
  }

  dispose(): void {
    this.resolver.stop()
    this.discord.stop()
    this.bridge.stop()
    this.tray.destroy()
    unregisterIpc()
    this.logger.dispose()
  }
}

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

const startHidden = process.argv.includes('--hidden')

// Single-instance: a second launch just focuses the running window.
const gotLock = app.requestSingleInstanceLock()
let controller: AppController | null = null

if (!gotLock) {
  app.quit()
} else {
  app.setAppUserModelId('com.ytmusicrpc.app')

  app.on('second-instance', () => controller?.focusExisting())
  app.on('activate', () => controller?.focusExisting())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => controller?.markQuitting())

  app.on('will-quit', () => controller?.dispose())

  app.whenReady().then(() => {
    controller = new AppController(startHidden)
    controller.start()
  })
}
