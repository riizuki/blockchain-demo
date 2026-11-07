// Primitif kriptografi yang dipakai semua bab. SHA-256 sungguhan, tidak disimulasikan.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const encoder = new TextEncoder()

export const ZERO_HASH = '0'.repeat(64)

export const sha256Hex = (text) => bytesToHex(sha256(encoder.encode(text)))
export const sha256HexBytes = (bytes) => bytesToHex(sha256(bytes))

export { bytesToHex, hexToBytes }

/** Mengubah hash hex menjadi larik bit, bit terpenting lebih dulu. */
export function hexToBits(hex) {
  const bits = new Array(hex.length * 4)
  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16)
    for (let b = 0; b < 4; b++) bits[i * 4 + b] = (nibble >> (3 - b)) & 1
  }
  return bits
}

/** Jumlah bit yang berbeda antara dua hash hex sepanjang sama. */
export function bitDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      diff += x & 1
      x >>= 1
    }
  }
  return diff
}

export function leadingZeros(hex) {
  let n = 0
  while (n < hex.length && hex[n] === '0') n++
  return n
}

export const meetsDifficulty = (hex, difficulty) => leadingZeros(hex) >= difficulty

/**
 * Warna sidik jari dari hash, supaya dua hash bisa dibandingkan sekilas tanpa membaca hex.
 * Rona diambil dari byte pertama setelah deretan nol, sebab semua hash yang sah berawalan nol.
 */
export function hashHue(hex) {
  const start = leadingZeros(hex)
  return (parseInt(hex.slice(start, start + 3).padEnd(3, '0'), 16) * 360) / 4096
}
