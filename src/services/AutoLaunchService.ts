import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Logger } from './Logger'

const LINUX_DESKTOP_FILE = 'ytmusic-discord-rpc.desktop'

/**
 * Manage "launch on login" across platforms.
 *
 * - Windows / macOS: Electron's native login-item API.
 * - Linux: there is no native API, so we write/remove a freedesktop autostart
 *   `.desktop` entry under `~/.config/autostart`.
 *
 * The app starts hidden (to tray) when auto-launched via the `--hidden` flag.
 */
export class AutoLaunchService {
  constructor(private readonly logger: Logger) {}

  set(enabled: boolean): void {
    try {
      if (process.platform === 'linux') {
        this.setLinux(enabled)
      } else {
        app.setLoginItemSettings({
          openAtLogin: enabled,
          path: process.execPath,
          args: ['--hidden']
        })
      }
      this.logger.info('autolaunch', `set to ${enabled}`)
    } catch (err) {
      this.logger.error('autolaunch', 'failed to apply', String(err))
    }
  }

  isEnabled(): boolean {
    try {
      if (process.platform === 'linux') {
        return existsSync(this.linuxFilePath())
      }
      return app.getLoginItemSettings().openAtLogin
    } catch {
      return false
    }
  }

  private setLinux(enabled: boolean): void {
    const file = this.linuxFilePath()
    if (!enabled) {
      if (existsSync(file)) rmSync(file)
      return
    }
    mkdirSync(join(homedir(), '.config', 'autostart'), { recursive: true })
    const exec = process.env.APPIMAGE || process.execPath
    const entry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=YTMusic Discord RPC',
      `Exec="${exec}" --hidden`,
      'X-GNOME-Autostart-enabled=true',
      'Terminal=false',
      ''
    ].join('\n')
    writeFileSync(file, entry, 'utf-8')
  }

  private linuxFilePath(): string {
    return join(homedir(), '.config', 'autostart', LINUX_DESKTOP_FILE)
  }
}
