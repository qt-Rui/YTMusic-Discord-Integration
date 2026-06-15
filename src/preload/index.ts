import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type AppState, type RendererApi } from '../types/ipc'

/**
 * The ONLY bridge between the sandboxed renderer and the main process.
 * Everything is funneled through explicit, typed methods — the renderer never
 * gets Node or ipcRenderer directly (contextIsolation + sandbox).
 */
const api: RendererApi = {
  getState: () => ipcRenderer.invoke(IpcChannels.GetState),
  updateSettings: (patch) => ipcRenderer.invoke(IpcChannels.UpdateSettings, patch),
  onStateUpdate: (listener) => {
    const subscription = (_e: IpcRendererEvent, state: AppState): void => listener(state)
    ipcRenderer.on(IpcChannels.StateUpdate, subscription)
    return () => {
      ipcRenderer.removeListener(IpcChannels.StateUpdate, subscription)
    }
  },
  minimizeWindow: () => ipcRenderer.send(IpcChannels.WindowMinimize),
  hideWindow: () => ipcRenderer.send(IpcChannels.WindowHide),
  closeWindow: () => ipcRenderer.send(IpcChannels.WindowClose),
  openExtensionFolder: () => ipcRenderer.send(IpcChannels.OpenExtensionFolder),
  reconnectDiscord: () => ipcRenderer.send(IpcChannels.ReconnectDiscord)
}

contextBridge.exposeInMainWorld('api', api)
