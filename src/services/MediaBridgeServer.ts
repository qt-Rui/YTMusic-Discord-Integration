import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import type { Logger } from './Logger'
import type { ConnectionStatus } from '../types/ipc'
import type { BridgePayload } from '../types/track'

/**
 * Local WebSocket server that the browser extension connects to.
 *
 * Security posture (per project requirements — everything stays on-device):
 *   - Binds to 127.0.0.1 only, so nothing on the network can reach it.
 *   - Rejects any non-loopback peer as defense-in-depth.
 *   - Validates every message shape; malformed frames are dropped, never trusted.
 *
 * It is intentionally "dumb": it parses + validates and re-emits payloads tagged
 * with a per-connection client id. Choosing which source wins (the fallback
 * hierarchy) is the {@link TrackResolver}'s job.
 */
export class MediaBridgeServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private port: number
  private statusValue: ConnectionStatus = 'disconnected'
  private detail: string | null = null
  private readonly clientIds = new Map<WebSocket, string>()

  constructor(
    port: number,
    private readonly logger: Logger
  ) {
    super()
    this.port = port
  }

  get status(): ConnectionStatus {
    return this.statusValue
  }

  get statusDetail(): string | null {
    return this.detail
  }

  get clientCount(): number {
    return this.clientIds.size
  }

  start(): void {
    this.stop()
    this.setStatus('connecting', `Starting bridge on 127.0.0.1:${this.port}`)
    try {
      const wss = new WebSocketServer({
        host: '127.0.0.1',
        port: this.port,
        // A track snapshot is well under 1 KB; cap frames so a misbehaving or
        // hostile local client can't push us multi-MB payloads.
        maxPayload: 64 * 1024
      })
      this.wss = wss

      wss.on('listening', () => {
        this.setStatus('disconnected', `Listening on 127.0.0.1:${this.port} (no source yet)`)
        this.logger.info('bridge', `listening on 127.0.0.1:${this.port}`)
      })

      wss.on('connection', (ws, req) => {
        const addr = req.socket.remoteAddress ?? ''
        if (!isLoopback(addr)) {
          this.logger.warn('bridge', 'rejected non-loopback peer', addr)
          ws.close(1008, 'loopback only')
          return
        }
        // Defense against cross-site WebSocket hijacking. Loopback alone isn't
        // enough: any web page the user has open can also reach 127.0.0.1 from
        // this same address. The browser extension connects from an extension
        // origin (chrome-extension:// / moz-extension://), whereas a web page
        // always presents its http(s):// page origin — so reject those to stop a
        // malicious site from spoofing the user's now-playing presence. Clients
        // with no Origin header (local test/sim scripts) are still allowed.
        const origin = req.headers.origin
        if (origin && /^https?:\/\//i.test(origin)) {
          this.logger.warn('bridge', 'rejected web origin', origin)
          ws.close(1008, 'forbidden origin')
          return
        }
        this.onConnection(ws)
      })

      wss.on('error', (err) => {
        const msg = (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? `Port ${this.port} is already in use`
          : String(err)
        this.logger.error('bridge', 'server error', msg)
        this.setStatus('error', msg)
      })
    } catch (err) {
      this.setStatus('error', String(err))
      this.logger.error('bridge', 'failed to start', String(err))
    }
  }

  stop(): void {
    for (const ws of this.clientIds.keys()) {
      try {
        ws.terminate()
      } catch {
        /* ignore */
      }
    }
    this.clientIds.clear()
    if (this.wss) {
      this.wss.removeAllListeners()
      this.wss.close()
      this.wss = null
    }
  }

  /** Rebind to a new port (called when the user changes it in Settings). */
  restart(port: number): void {
    this.port = port
    this.start()
  }

  private onConnection(ws: WebSocket): void {
    const id = randomUUID()
    this.clientIds.set(ws, id)
    this.logger.info('bridge', 'source connected', id)
    this.emitClients()
    this.refreshStatus()

    ws.on('message', (data) => this.onMessage(id, data))

    ws.on('close', () => {
      this.clientIds.delete(ws)
      this.logger.info('bridge', 'source disconnected', id)
      this.emit('disconnect', id)
      this.emitClients()
      this.refreshStatus()
    })

    ws.on('error', (err) => {
      this.logger.debug('bridge', 'client socket error', id, String(err))
    })
  }

  private onMessage(clientId: string, data: RawData): void {
    let payload: BridgePayload
    try {
      payload = JSON.parse(data.toString())
    } catch {
      this.logger.debug('bridge', 'dropped non-JSON message')
      return
    }
    if (!isValidPayload(payload)) {
      this.logger.debug('bridge', 'dropped invalid payload', JSON.stringify(payload))
      return
    }
    this.emit('message', clientId, payload)
  }

  private emitClients(): void {
    this.emit('clients', this.clientIds.size)
  }

  private refreshStatus(): void {
    if (this.clientIds.size > 0) {
      this.setStatus('connected', `${this.clientIds.size} source(s) connected`)
    } else {
      this.setStatus('disconnected', `Listening on 127.0.0.1:${this.port} (no source yet)`)
    }
  }

  private setStatus(status: ConnectionStatus, detail: string | null): void {
    if (this.statusValue === status && this.detail === detail) return
    this.statusValue = status
    this.detail = detail
    this.emit('status', status, detail)
  }
}

function isLoopback(addr: string): boolean {
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' ||
    addr.startsWith('127.')
  )
}

/** Structural validation of an inbound bridge payload. */
function isValidPayload(p: unknown): p is BridgePayload {
  if (typeof p !== 'object' || p === null) return false
  const type = (p as BridgePayload).type
  if (type !== 'update' && type !== 'clear' && type !== 'hello') return false
  if (type === 'update') {
    const t = (p as BridgePayload).track
    if (!t || typeof t.title !== 'string' || typeof t.artist !== 'string') return false
  }
  return true
}
