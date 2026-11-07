import { useCallback, useEffect, useRef, useState } from 'react'
import { startMining } from './miner.js'

/** Menjalankan penambangan di worker dan melaporkan kemajuannya sebagai state React. */
export function useMiner() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const job = useRef(null)

  const cancel = useCallback(() => {
    job.current?.cancel()
    job.current = null
    setRunning(false)
  }, [])

  const run = useCallback(async ({ prefix, difficulty, workers = 1 }) => {
    job.current?.cancel()
    setRunning(true)
    setProgress({ attempts: 0, ms: 0, histogram: new Array(difficulty + 1).fill(0), difficulty })
    const handle = startMining({
      prefix,
      difficulty,
      workers,
      onProgress: (p) => setProgress({ ...p, difficulty }),
    })
    job.current = handle
    const result = await handle.promise
    if (job.current === handle) {
      job.current = null
      setRunning(false)
    }
    if (result) {
      setProgress({
        ...result,
        difficulty,
        lastHash: result.hash,
        lastNonce: result.nonce,
        bestHash: result.hash,
        bestZeros: difficulty,
        done: true,
      })
    }
    return result
  }, [])

  useEffect(() => cancel, [cancel])

  return { running, progress, run, cancel }
}
