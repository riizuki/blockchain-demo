// Mengelola satu atau beberapa pekerja penambang dan menggabungkan laporan mereka.
export const MAX_WORKERS = Math.max(1, Math.min(8, globalThis.navigator?.hardwareConcurrency ?? 4))

/**
 * Memulai penambangan. Mengembalikan { promise, cancel }.
 * promise selesai dengan { nonce, hash, attempts, ms, workers }, atau null bila dibatalkan.
 */
export function startMining({ prefix, difficulty, workers = 1, onProgress }) {
  // Titik awal acak: menambang ulang data yang sama menghasilkan nonce dan jumlah percobaan yang lain.
  const startNonce = Math.floor(Math.random() * 1_000_000)
  const startedAt = performance.now()
  const pool = []
  const totals = {
    attempts: 0,
    histogram: new Array(difficulty + 1).fill(0),
    bestHash: null,
    bestNonce: null,
    bestZeros: -1,
    lastHash: null,
    lastNonce: 0,
  }
  let finished = false
  let settle

  const promise = new Promise((resolve) => {
    settle = resolve
  })

  const stopAll = () => pool.forEach((worker) => worker.terminate())

  const absorb = (message) => {
    totals.attempts += message.attempts
    message.histogram.forEach((count, level) => {
      totals.histogram[level] += count
    })
  }

  for (let i = 0; i < workers; i++) {
    const worker = new Worker(new URL('./miner.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (finished) return
      absorb(data)
      if (data.type === 'found') {
        finished = true
        stopAll()
        settle({
          nonce: data.nonce,
          hash: data.hash,
          attempts: totals.attempts,
          ms: performance.now() - startedAt,
          workers,
          histogram: totals.histogram,
        })
        return
      }
      totals.lastHash = data.lastHash
      totals.lastNonce = data.lastNonce
      if (data.bestZeros > totals.bestZeros) {
        totals.bestZeros = data.bestZeros
        totals.bestHash = data.bestHash
        totals.bestNonce = data.bestNonce
      }
      onProgress?.({ ...totals, histogram: totals.histogram.slice(), ms: performance.now() - startedAt })
    }
    worker.postMessage({ prefix, difficulty, start: startNonce + i, step: workers })
    pool.push(worker)
  }

  return {
    promise,
    cancel() {
      if (finished) return
      finished = true
      stopAll()
      settle(null)
    },
  }
}
