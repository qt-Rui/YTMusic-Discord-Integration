import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * Tiny dependency-free logger.
 *
 * - Always prints `info`/`warn`/`error` to the console.
 * - `debug` lines are only emitted when debug logging is enabled in settings.
 * - Everything is mirrored to a rotating-by-launch file under `logDir`, so a
 *   user reporting a bug can attach `main.log` without us collecting anything.
 */
export class Logger {
  private stream: WriteStream | null = null
  private debugEnabled = false

  constructor(private readonly logDir: string) {
    try {
      mkdirSync(this.logDir, { recursive: true })
      this.stream = createWriteStream(join(this.logDir, 'main.log'), { flags: 'a' })
    } catch (err) {
      // Logging must never crash the app; fall back to console only.
      // eslint-disable-next-line no-console
      console.error('[logger] failed to open log file', err)
    }
  }

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled
  }

  debug(scope: string, ...args: unknown[]): void {
    if (!this.debugEnabled) return
    this.write('debug', scope, args)
  }

  info(scope: string, ...args: unknown[]): void {
    this.write('info', scope, args)
  }

  warn(scope: string, ...args: unknown[]): void {
    this.write('warn', scope, args)
  }

  error(scope: string, ...args: unknown[]): void {
    this.write('error', scope, args)
  }

  private write(level: Level, scope: string, args: unknown[]): void {
    if (!this.debugEnabled && LEVEL_RANK[level] < LEVEL_RANK.info) return
    const ts = new Date().toISOString()
    const text = args
      .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
      .join(' ')
    const line = `${ts} [${level.toUpperCase()}] [${scope}] ${text}`

    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    // eslint-disable-next-line no-console
    consoleFn(line)
    this.stream?.write(line + '\n')
  }

  dispose(): void {
    this.stream?.end()
    this.stream = null
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
