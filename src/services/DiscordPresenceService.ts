import { EventEmitter } from 'node:events'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import type { Logger } from './Logger'
import type { ConnectionStatus } from '../types/ipc'

/** Discord IPC opcodes (see Discord RPC docs). */
const enum OpCode {
  Handshake = 0,
  Frame = 1,
  Close = 2,
  Ping = 3,
  Pong = 4
}

/** A Discord Rich Presence activity payload. */
export interface DiscordActivity {
  type?: number
  details?: string
  state?: string
  timestamps?: { start?: number; end?: number }
  assets?: {
    large_image?: string
    large_text?: string
    small_image?: string
    small_text?: string
  }
  buttons?: Array<{ label: string; url: string }>
  instance?: boolean
}

/**
 * Hand-rolled Discord Rich Presence client over the local IPC transport.
 *
 * We deliberately implement the wire protocol directly (instead of pulling in
 * the abandoned `discord-rpc` package) so we fully own:
 *   - the connect loop across all 10 candidate pipes,
 *   - exponential-backoff reconnection when Discord closes/restarts,
 *   - re-applying the last activity automatically after a reconnect.
 *
 * Frame format: [uint32LE opcode][uint32LE byteLength][utf8 JSON payload].
 */
export class DiscordPresenceService extends EventEmitter {
  private socket: net.Socket | null = null
  private readBuffer = Buffer.alloc(0)
  private statusValue: ConnectionStatus = 'disconnected'
  private detail: string | null = null

  /** True once Discord has sent the READY dispatch. */
  private ready = false
  private running = false

  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private connectingPipe = 0

  /** Last activity we were asked to display; re-sent after every reconnect. */
  private lastActivity: DiscordActivity | null = null

  /**
   * Set when Discord rejects our application id. We stop the reconnect loop in
   * that case (retrying can't help) until the id changes or the user hits
   * Reconnect — otherwise we'd hammer Discord pointlessly.
   */
  private clientIdRejected = false

  constructor(
    private readonly getClientId: () => string,
    private readonly logger: Logger
  ) {
    super()
  }

  get status(): ConnectionStatus {
    return this.statusValue
  }

  get statusDetail(): string | null {
    return this.detail
  }

  /** Begin (and keep) trying to connect to Discord. */
  start(): void {
    if (this.running) return
    this.running = true
    this.clientIdRejected = false
    this.connect()
  }

  /** Tear down the connection and stop reconnecting. */
  stop(): void {
    this.running = false
    this.clearReconnect()
    this.teardownSocket()
    this.setStatus('disconnected', null)
  }

  /** Force an immediate reconnect attempt (used by the UI button). */
  reconnect(): void {
    this.clientIdRejected = false
    if (!this.running) {
      this.start()
      return
    }
    this.reconnectAttempts = 0
    this.connectingPipe = 0
    this.teardownSocket()
    this.connect()
  }

  /**
   * Set or clear the presence. Passing `null` clears it. Safe to call when
   * disconnected — the value is cached and flushed once we (re)connect.
   */
  setActivity(activity: DiscordActivity | null): void {
    this.lastActivity = activity
    if (!this.ready || !this.socket) return
    this.sendFrame(OpCode.Frame, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        // Omitting `activity` (undefined) tells Discord to clear it.
        activity: activity ?? undefined
      },
      nonce: randomUUID()
    })
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  private connect(): void {
    if (!this.running || this.clientIdRejected) return
    this.ready = false
    this.setStatus('connecting', `Connecting to Discord (pipe ${this.connectingPipe})`)

    const path = ipcPath(this.connectingPipe)
    const socket = net.createConnection(path)
    this.socket = socket

    socket.on('connect', () => {
      this.logger.debug('discord', 'socket connected on', path)
      this.reconnectAttempts = 0
      this.sendFrame(OpCode.Handshake, { v: 1, client_id: this.getClientId() })
    })

    socket.on('data', (chunk) => this.onData(chunk))

    socket.on('error', (err) => {
      this.logger.debug('discord', 'socket error', String(err))
      // Try the next candidate pipe before giving up this round.
      this.handleDisconnect(`Discord not reachable`)
    })

    socket.on('close', () => {
      if (this.ready) this.logger.info('discord', 'connection closed')
      this.handleDisconnect('Discord connection closed')
    })
  }

  private handleDisconnect(reason: string): void {
    const wasReady = this.ready
    this.ready = false
    this.teardownSocket()
    if (!this.running) return

    // If we never reached READY, sweep across the 10 possible pipes quickly.
    if (!wasReady && this.connectingPipe < 9) {
      this.connectingPipe += 1
      this.setStatus('connecting', reason)
      this.scheduleReconnect(150)
      return
    }

    this.connectingPipe = 0
    this.setStatus('disconnected', wasReady ? reason : 'Discord not running')
    this.scheduleReconnect()
    this.emit('disconnected')
  }

  private scheduleReconnect(fixedDelay?: number): void {
    this.clearReconnect()
    const delay =
      fixedDelay ?? Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempts, 5))
    this.reconnectAttempts += 1
    this.logger.debug('discord', `reconnect in ${delay}ms`)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private teardownSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = null
    }
    this.readBuffer = Buffer.alloc(0)
  }

  // ---------------------------------------------------------------------------
  // Wire protocol
  // ---------------------------------------------------------------------------

  private sendFrame(op: OpCode, payload: unknown): void {
    if (!this.socket || this.socket.destroyed) return
    try {
      const json = Buffer.from(JSON.stringify(payload), 'utf-8')
      const header = Buffer.alloc(8)
      header.writeInt32LE(op, 0)
      header.writeInt32LE(json.length, 4)
      this.socket.write(Buffer.concat([header, json]))
    } catch (err) {
      this.logger.warn('discord', 'failed to write frame', String(err))
    }
  }

  private onData(chunk: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk])

    // Drain as many complete frames as the buffer currently holds.
    while (this.readBuffer.length >= 8) {
      const op = this.readBuffer.readInt32LE(0)
      const len = this.readBuffer.readInt32LE(4)
      if (this.readBuffer.length < 8 + len) break // wait for the rest

      const body = this.readBuffer.subarray(8, 8 + len).toString('utf-8')
      this.readBuffer = this.readBuffer.subarray(8 + len)

      let message: any
      try {
        message = JSON.parse(body)
      } catch {
        continue
      }
      this.handleMessage(op, message)
    }
  }

  private handleMessage(op: OpCode, message: any): void {
    switch (op) {
      case OpCode.Ping:
        this.sendFrame(OpCode.Pong, message)
        break
      case OpCode.Close: {
        const detail = String(message?.message ?? 'Discord closed the connection')
        this.logger.warn('discord', 'server requested close', detail)
        // A reachable Discord that rejects our app id is a config error, not a
        // transient drop — surface it and stop the retry loop until it changes.
        if (/invalid client/i.test(detail)) {
          this.clientIdRejected = true
          this.ready = false
          this.clearReconnect()
          this.teardownSocket()
          this.setStatus(
            'error',
            'Invalid Discord Application ID — set your own in Settings → Advanced'
          )
        } else {
          this.handleDisconnect(detail)
        }
        break
      }
      case OpCode.Frame:
        if (message?.cmd === 'DISPATCH' && message?.evt === 'READY') {
          this.ready = true
          this.connectingPipe = 0
          const user = message?.data?.user?.username
          this.setStatus('connected', user ? `Connected as ${user}` : 'Connected')
          this.logger.info('discord', 'READY', user ?? '')
          this.emit('connected')
          // Flush whatever we were last asked to show.
          if (this.lastActivity !== null) this.setActivity(this.lastActivity)
        } else if (message?.evt === 'ERROR') {
          const detail = message?.data?.message ?? 'Discord returned an error'
          this.logger.error('discord', 'error frame', detail)
          this.setStatus('error', detail)
        }
        break
      default:
        break
    }
  }

  private setStatus(status: ConnectionStatus, detail: string | null): void {
    if (this.statusValue === status && this.detail === detail) return
    this.statusValue = status
    this.detail = detail
    this.emit('status', status, detail)
  }
}

/**
 * Build the platform-specific IPC endpoint for pipe index `id` (0-9).
 * Windows uses a named pipe; everything else uses a unix domain socket whose
 * directory may live in any of several runtime locations (incl. Flatpak/snap).
 */
function ipcPath(id: number): string {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\discord-ipc-${id}`
  }
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    '/tmp'
  return `${base.replace(/\/$/, '')}/discord-ipc-${id}`
}
