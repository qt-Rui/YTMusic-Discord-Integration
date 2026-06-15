/**
 * Generates resources/icon.png (used by electron-builder for app icons).
 *
 * We draw a blurple rounded square with a white "play" triangle, encoding a
 * valid RGBA PNG by hand (zlib is the only dependency). Run via `npm run make:icon`.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const RADIUS = Math.round(SIZE * 0.18)
const BG = [88, 101, 242] // Discord blurple
const FG = [255, 255, 255]

// Triangle (play button) vertices.
const A = [SIZE * 0.4, SIZE * 0.3]
const B = [SIZE * 0.4, SIZE * 0.7]
const C = [SIZE * 0.72, SIZE * 0.5]

function insideRoundedRect(x, y) {
  const inX = x >= RADIUS && x < SIZE - RADIUS
  const inY = y >= RADIUS && y < SIZE - RADIUS
  if (inX || inY) return true
  const cx = x < RADIUS ? RADIUS : SIZE - RADIUS - 1
  const cy = y < RADIUS ? RADIUS : SIZE - RADIUS - 1
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by)
}

function insideTriangle(x, y) {
  const d1 = sign(x, y, A[0], A[1], B[0], B[1])
  const d2 = sign(x, y, B[0], B[1], C[0], C[1])
  const d3 = sign(x, y, C[0], C[1], A[0], A[1])
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

// Build raw scanlines with a leading filter byte (0 = none).
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
let o = 0
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    if (insideRoundedRect(x, y)) {
      a = 255
      if (insideTriangle(x, y)) {
        ;[r, g, b] = FG
      } else {
        ;[r, g, b] = BG
      }
    }
    raw[o++] = r
    raw[o++] = g
    raw[o++] = b
    raw[o++] = a
  }
}

// --- minimal PNG encoder ---
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon.png'), png)
console.log(`Wrote ${join(outDir, 'icon.png')} (${png.length} bytes)`)
