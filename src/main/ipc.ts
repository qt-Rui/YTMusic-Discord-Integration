import { ipcMain } from 'electron'
import { IpcChannels, type AppState } from '../types/ipc'
import type { AppSettings } from '../types/settings'

/**
 * The set of actions the main process exposes to the renderer. Implemented by
 * the AppController and wired to IPC channels here, keeping transport concerns
 * out of the controller itself.
 */
export interface IpcBackend {
  getState(): AppState
  updateSettings(patch: Partial<AppSettings>): AppState
  windowMinimize(): void
  windowHide(): void
  windowClose(): void
  openExtensionFolder(): void
  reconnectDiscord(): void
}

export function registerIpc(backend: IpcBackend): void {
  ipcMain.handle(IpcChannels.GetState, () => backend.getState())
  ipcMain.handle(IpcChannels.UpdateSettings, (_e, patch: Partial<AppSettings>) =>
    backend.updateSettings(patch ?? {})
  )
  ipcMain.on(IpcChannels.WindowMinimize, () => backend.windowMinimize())
  ipcMain.on(IpcChannels.WindowHide, () => backend.windowHide())
  ipcMain.on(IpcChannels.WindowClose, () => backend.windowClose())
  ipcMain.on(IpcChannels.OpenExtensionFolder, () => backend.openExtensionFolder())
  ipcMain.on(IpcChannels.ReconnectDiscord, () => backend.reconnectDiscord())
}

export function unregisterIpc(): void {
  for (const channel of Object.values(IpcChannels)) {
    ipcMain.removeHandler(channel)
    ipcMain.removeAllListeners(channel)
  }
}
