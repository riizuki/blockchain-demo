// Bab Transaksi: dompet, tanda tangan secp256k1, dan aturan saldo di dalam blok.
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ZERO_HASH, bytesToHex, hexToBytes, meetsDifficulty, sha256Hex } from './crypto.js'
import { blockHash } from './chain.js'

const encoder = new TextEncoder()

export const REWARD = 50

// Kunci diturunkan dari nama supaya demo stabil setiap dimuat. Jelas tidak aman untuk uang sungguhan.
const wallet = (id) => {
  const secret = hexToBytes(sha256Hex(`buku-besar:${id}`))
  return { id, secret: bytesToHex(secret), publicKey: bytesToHex(secp256k1.getPublicKey(secret)) }
}

export const PEOPLE = ['najwa', 'budi', 'citra', 'deni'].map(wallet)
export const personById = Object.fromEntries(PEOPLE.map((p) => [p.id, p]))

/** Teks yang ditandatangani. seq adalah nomor urut transaksi pengirim, penangkal pemutaran ulang. */
export const txMessage = ({ from, to, amount, seq }) => `${from}>${to}:${amount}#${seq}`

export function signTx({ from, to, amount, seq }, signerId) {
  const tx = { from, to, amount, seq }
  const signature = secp256k1.sign(encoder.encode(txMessage(tx)), hexToBytes(personById[signerId].secret))
  return { ...tx, sig: bytesToHex(signature) }
}

const verifyCache = new Map()

export function verifyTx(tx) {
  const key = `${txMessage(tx)}/${tx.sig}`
  if (verifyCache.has(key)) return verifyCache.get(key)
  let ok = false
  try {
    ok = secp256k1.verify(hexToBytes(tx.sig), encoder.encode(txMessage(tx)), hexToBytes(personById[tx.from].publicKey))
  } catch {
    ok = false
  }
  if (verifyCache.size > 2000) verifyCache.clear()
  verifyCache.set(key, ok)
  return ok
}

/** Memeriksa satu transaksi terhadap keadaan saldo. Mengembalikan kode masalah atau null. */
export function txIssue(tx, state) {
  const amount = Number(tx.amount)
  if (!Number.isFinite(amount) || amount <= 0) return 'badAmount'
  if (!verifyTx(tx)) return 'badSignature'
  const expected = state.seq[tx.from] ?? 0
  if (tx.seq !== expected) {
    return tx.seq < expected ? 'seqUsed' : 'seqSkipped'
  }
  if ((state.balance[tx.from] ?? 0) < amount) return 'insufficient'
  return null
}

const applyTx = (tx, state) => {
  const amount = Number(tx.amount)
  state.balance[tx.from] = (state.balance[tx.from] ?? 0) - amount
  state.balance[tx.to] = (state.balance[tx.to] ?? 0) + amount
  state.seq[tx.from] = (state.seq[tx.from] ?? 0) + 1
}

export const emptyState = () => ({
  balance: Object.fromEntries(PEOPLE.map((p) => [p.id, 0])),
  seq: Object.fromEntries(PEOPLE.map((p) => [p.id, 0])),
})

const cloneState = (state) => ({ balance: { ...state.balance }, seq: { ...state.seq } })

/** Data blok yang di-hash: penerima hadiah dan daftar transaksi lengkap dengan tanda tangannya. */
export const ledgerData = (block) => JSON.stringify({ coinbase: block.coinbase, txs: block.txs })

/**
 * Berjalan dari blok pertama, menghitung saldo sambil memeriksa hash dan setiap transaksi.
 * Blok berhash sah tetap bisa ditolak kalau isinya melanggar aturan.
 */
export function deriveLedger(blocks, difficulty) {
  let prev = ZERO_HASH
  let healthy = true
  const state = emptyState()
  const derived = blocks.map((block) => {
    const data = ledgerData(block)
    const hash = blockHash({ number: block.number, prev, data, nonce: block.nonce })
    const mined = meetsDifficulty(hash, difficulty)
    const coinbaseIssue = Number(block.coinbase.amount) === REWARD ? null : 'badReward'
    if (!coinbaseIssue) state.balance[block.coinbase.to] += REWARD
    const txs = block.txs.map((tx) => {
      const issue = txIssue(tx, state)
      if (!issue) applyTx(tx, state)
      return { ...tx, issue }
    })
    const rulesOk = !coinbaseIssue && txs.every((tx) => !tx.issue)
    const valid = mined && rulesOk
    const out = {
      ...block,
      prev,
      data,
      hash,
      mined,
      rulesOk,
      valid,
      linked: healthy,
      coinbaseIssue,
      txs,
      balances: { ...state.balance },
    }
    healthy = healthy && valid
    prev = hash
    return out
  })
  return { blocks: derived, state, valid: healthy }
}

/** Memilah mempool seperti penambang jujur: yang lolos dimasukkan, sisanya ditolak beserta alasannya. */
export function sortMempool(mempool, state) {
  const working = cloneState(state)
  const accepted = []
  const rejected = []
  const issues = []
  for (const tx of mempool) {
    const issue = txIssue(tx, working)
    issues.push(issue)
    if (issue) {
      rejected.push({ ...tx, issue })
    } else {
      applyTx(tx, working)
      accepted.push(tx)
    }
  }
  return { accepted, rejected, issues, state: working }
}
