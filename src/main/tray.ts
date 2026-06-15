import { Tray, Menu, type MenuItemConstructorOptions } from 'electron'
import { createAppIcon } from './icon'
import type { AppState } from '../types/ipc'

export interface TrayHandlers {
  onShow(): void
  onToggleRpc(enabled: boolean): void
  onReconnectDiscord(): void
  onQuit(): void
}

/** System-tray presence with a live status menu and tooltip. */
export class TrayManager {
  private tray: Tray | null = null

  constructor(private readonly handlers: TrayHandlers) {}

  create(initial: AppState): void {
    this.tray = new Tray(createAppIcon(16))
    this.tray.setToolTip('YTMusic Discord RPC')
    this.tray.on('click', () => this.handlers.onShow())
    this.tray.on('double-click', () => this.handlers.onShow())
    this.update(initial)
  }

  update(state: AppState): void {
    if (!this.tray) return

    const nowPlaying = state.track
      ? `${state.track.isPlaying ? '▶' : '⏸'} ${state.track.title} — ${state.track.artist}`
      : 'Nothing playing'

    const template: MenuItemConstructorOptions[] = [
      { label: nowPlaying.slice(0, 80), enabled: false },
      { type: 'separator' },
      { label: 'Show Window', click: () => this.handlers.onShow() },
      {
        label: 'Rich Presence Enabled',
        type: 'checkbox',
        checked: state.settings.enableRichPresence,
        click: (item) => this.handlers.onToggleRpc(item.checked)
      },
      {
        label: `Discord: ${state.discord.status}`,
        enabled: false
      },
      { label: 'Reconnect Discord', click: () => this.handlers.onReconnectDiscord() },
      { type: 'separator' },
      { label: 'Quit', click: () => this.handlers.onQuit() }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
    this.tray.setToolTip(
      `YTMusic Discord RPC\nDiscord: ${state.discord.status}\n${nowPlaying}`.slice(0, 127)
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
