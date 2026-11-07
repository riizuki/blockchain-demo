// Pekerja penambang: mencoba nonce secepat mungkin tanpa membekukan antarmuka.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const PROGRESS_MS = 70
const BATCH = 2048

function run({ prefix, difficulty, start, step }) {
  const prefixBytes = new TextEncoder().encode(prefix)
  const buffer = new Uint8Array(prefixBytes.length + 20)
  buffer.set(prefixBytes)
  const base = prefixBytes.length

  const histogram = new Array(difficulty + 1).fill(0)
  let nonce = start
  let attemptsSince = 0
  let bestZeros = -1
  let bestHash = null
  let bestNonce = null
  let lastTick = performance.now()

  for (;;) {
    let digest
    for (let i = 0; i < BATCH; i++) {
      // Menulis digit nonce langsung ke buffer jauh lebih cepat daripada menyusun string baru.
      let n = nonce
      let length = 0
      do {
        length++
        n = Math.floor(n / 10)
      } while (n > 0)
      n = nonce
      for (let p = length - 1; p >= 0; p--) {
        buffer[base + p] = 48 + n % 10
        n = Math.floor(n / 10)
      }
      digest = sha256(buffer.subarray(0, base + length))

      let zeros = 0
      for (let b = 0; b < digest.length; b++) {
        const value = digest[b]
        if (value === 0) {
          zeros += 2
          continue
        }
        if (value < 16) zeros += 1
        break
      }
      histogram[Math.min(zeros, difficulty)]++
      attemptsSince++

      if (zeros > bestZeros) {
        bestZeros = zeros
        bestHash = bytesToHex(digest)
        bestNonce = nonce
      }
      if (zeros >= difficulty) {
        self.postMessage({
          type: 'found',
          nonce,
          hash: bytesToHex(digest),
          attempts: attemptsSince,
          histogram,
        })
        return
      }
      nonce += step
    }

    const now = performance.now()
    if (now - lastTick >= PROGRESS_MS) {
      lastTick = now
      self.postMessage({
        type: 'progress',
        attempts: attemptsSince,
        histogram: histogram.slice(),
        lastHash: bytesToHex(digest),
        lastNonce: nonce - step,
        bestHash,
        bestNonce,
        bestZeros,
      })
      attemptsSince = 0
      histogram.fill(0)
    }
  }
}

self.onmessage = ({ data }) => run(data)
