// Aturan blok dan rantai. Semua fungsi murni, sehingga mudah diuji dan dipakai ulang tiap bab.
import { sha256 } from '@noble/hashes/sha2.js'
import { ZERO_HASH, meetsDifficulty, sha256Hex, bytesToHex } from './crypto.js'

/** Bagian blok yang di-hash selain nonce. Nonce selalu di akhir supaya penambangan efisien. */
export const blockPrefix = ({ number, prev, data }) => `${number}|${prev}|${data}|`

export const blockHash = (block) => sha256Hex(blockPrefix(block) + block.nonce)

/**
 * Menurunkan prev, hash, dan status tiap blok dari data mentah [{ number, nonce, data }].
 * prev selalu mengikuti hash blok sebelumnya, sehingga perubahan di satu blok menjalar ke belakang.
 */
export function deriveChain(blocks, difficulty) {
  let prev = ZERO_HASH
  let healthy = true
  return blocks.map((block) => {
    const hash = blockHash({ ...block, prev })
    const valid = meetsDifficulty(hash, difficulty)
    const derived = { ...block, prev, hash, valid, linked: healthy }
    healthy = healthy && valid
    prev = hash
    return derived
  })
}

export const isChainValid = (blocks, difficulty) => deriveChain(blocks, difficulty).every((b) => b.valid)

/** Penambangan sinkron, hanya untuk pengujian dan benih data kecil. Antarmuka memakai worker. */
export function mineSync(block, difficulty, start = 0) {
  const prefix = blockPrefix(block)
  const encoder = new TextEncoder()
  const target = '0'.repeat(difficulty)
  for (let nonce = start; ; nonce++) {
    const hash = bytesToHex(sha256(encoder.encode(prefix + nonce)))
    if (hash.startsWith(target)) return { nonce, hash }
  }
}

/** Indeks blok pertama yang berbeda di antara dua rantai turunan, atau panjang yang lebih pendek. */
export function forkIndex(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i].hash !== b[i].hash) return i
  return n
}

/**
 * Aturan yang dijalankan peer saat menerima rantai: tolak yang rusak, terima hanya yang lebih panjang.
 * Peer yang rantainya sendiri rusak boleh menerima rantai sah yang setidaknya sama panjang.
 * Mengembalikan { accept, kind } dengan kind: same | broken | shorter | longer | heal.
 * Antarmuka yang menerjemahkan kind menjadi kalimat.
 */
export function evaluateIncoming(ownBlocks, incomingBlocks, difficulty) {
  const own = deriveChain(ownBlocks, difficulty)
  const incoming = deriveChain(incomingBlocks, difficulty)
  const badIndex = incoming.findIndex((b) => !b.valid)
  if (badIndex !== -1) {
    return { accept: false, kind: 'broken', number: incoming[badIndex].number }
  }
  const ownTip = own[own.length - 1]
  const incomingTip = incoming[incoming.length - 1]
  if (ownTip && incomingTip && ownTip.hash === incomingTip.hash) {
    return { accept: false, kind: 'same' }
  }
  const ownValid = own.every((b) => b.valid)
  if (!ownValid && incoming.length >= own.length) {
    return { accept: true, kind: 'heal' }
  }
  if (incoming.length > own.length) {
    return { accept: true, kind: 'longer', fork: forkIndex(own, incoming) < own.length }
  }
  return { accept: false, kind: 'shorter' }
}
