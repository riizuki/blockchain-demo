import { hexToBits } from '../lib/crypto.js'

const CELL = 12
const GAP = 2

/** 256 bit hash dalam kisi 16 × 16. Bit yang baru terbalik ditandai warna stabilo. */
export function BitGrid({ hash, previous, label }) {
  const bits = hexToBits(hash)
  const before = previous ? hexToBits(previous) : null
  const size = 16 * CELL + 15 * GAP
  return (
    <svg className="bitgrid" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {bits.map((bit, index) => {
        const x = (index % 16) * (CELL + GAP)
        const y = Math.floor(index / 16) * (CELL + GAP)
        const flipped = before && before[index] !== bit
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            rx="2"
            className={`bit ${bit ? 'bit-on' : 'bit-off'} ${flipped ? 'bit-flip' : ''}`}
          />
        )
      })}
    </svg>
  )
}
