import { nativeImage, type NativeImage } from 'electron'

/**
 * Generate the tray/window icon entirely in code so the app needs no binary
 * asset checked into the repo or bundled at runtime.
 *
 * We use purple (#800080), where R === B, so the result looks identical
 * regardless of whether the platform interprets the bitmap as RGBA or BGRA.
 */
export function createAppIcon(size = 16): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const r = Math.floor(size * 0.18) // corner radius for a rounded square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inside = insideRoundedRect(x, y, size, r)
      buf[i] = 128 // R / B (equal)
      buf[i + 1] = 0 // G
      buf[i + 2] = 128 // B / R (equal)
      buf[i + 3] = inside ? 255 : 0 // A
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function insideRoundedRect(x: number, y: number, size: number, r: number): boolean {
  const inX = x >= r && x < size - r
  const inY = y >= r && y < size - r
  if (inX || inY) return true
  const cx = x < r ? r : size - r - 1
  const cy = y < r ? r : size - r - 1
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}
