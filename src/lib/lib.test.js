import { describe, expect, it } from 'vitest'
import { bitDistance, hexToBits, leadingZeros, sha256Hex, ZERO_HASH } from './crypto.js'
import { blockPrefix, deriveChain, evaluateIncoming, isChainValid, mineSync } from './chain.js'
import { SEED_CHAINS, SEED_DIFFICULTY, seedChain } from './seeds.js'
import { REWARD, deriveLedger, signTx, sortMempool, emptyState, verifyTx } from './ledger.js'
import { DEFAULT_MINERS, GIVE_UP_GAP, Simulation, attackSuccessProbability } from './sim.js'

const seeded = (seed) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const minedChain = (blocks, difficulty) => {
  let prev = ZERO_HASH
  return blocks.map((block) => {
    const { nonce, hash } = mineSync({ ...block, prev }, difficulty)
    prev = hash
    return { ...block, nonce }
  })
}

describe('hash', () => {
  it('cocok dengan vektor uji SHA-256 resmi', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('menghitung bit dan jarak dengan benar', () => {
    expect(hexToBits('a')).toEqual([1, 0, 1, 0])
    expect(bitDistance('ff', '0f')).toBe(4)
    expect(leadingZeros('000a1')).toBe(3)
  })
})

describe('rantai', () => {
  it('benih rantai tiap bahasa sudah ditambang pada kesulitan benih', () => {
    for (const lang of Object.keys(SEED_CHAINS)) expect(isChainValid(SEED_CHAINS[lang], SEED_DIFFICULTY)).toBe(true)
  })
  it('mengubah satu blok merusak blok itu dan yang di belakangnya', () => {
    const blocks = seedChain('en')
    blocks[1].data = 'Najwa bayar iuran Rp200.000'
    const derived = deriveChain(blocks, SEED_DIFFICULTY)
    expect(derived[0].valid).toBe(true)
    expect(derived.slice(1).every((b) => !b.valid)).toBe(true)
    expect(derived[1].hash).toBe(derived[2].prev)
  })
  it('hash pakai format awalan yang sama dengan penambang', () => {
    const block = { number: 1, prev: ZERO_HASH, data: 'x' }
    const { nonce, hash } = mineSync(block, 2)
    expect(sha256Hex(blockPrefix(block) + nonce)).toBe(hash)
    expect(hash.startsWith('00')).toBe(true)
  })
})

describe('aturan peer', () => {
  const honest = seedChain('en')
  it('menolak rantai berisi blok rusak', () => {
    const fake = seedChain('en')
    fake[1].data = 'palsu'
    expect(evaluateIncoming(honest, fake, SEED_DIFFICULTY)).toMatchObject({ accept: false, kind: 'broken' })
  })
  it('menolak rantai palsu yang sah tapi sama panjang', () => {
    const fake = seedChain('en')
    fake[1].data = 'palsu'
    const mined = minedChain(fake, SEED_DIFFICULTY)
    expect(evaluateIncoming(honest, mined, SEED_DIFFICULTY)).toMatchObject({ accept: false, kind: 'shorter' })
  })
  it('menerima rantai palsu sah yang lebih panjang dan menandainya sebagai fork', () => {
    const fake = seedChain('en')
    fake[1].data = 'palsu'
    fake.push({ number: 6, nonce: 0, data: 'tambahan' })
    const mined = minedChain(fake, SEED_DIFFICULTY)
    expect(evaluateIncoming(honest, mined, SEED_DIFFICULTY)).toMatchObject({ accept: true, kind: 'longer', fork: true })
  })
  it('peer yang rantainya rusak mau sembuh dari rantai sah', () => {
    const broken = seedChain('en')
    broken[2].data = 'rusak'
    expect(evaluateIncoming(broken, honest, SEED_DIFFICULTY)).toMatchObject({ accept: true, kind: 'heal' })
  })
})

describe('transaksi', () => {
  const makeChain = () => {
    const first = { number: 1, nonce: 0, coinbase: { to: 'ayu', amount: REWARD }, txs: [] }
    return [first]
  }
  it('tanda tangan benar lolos, kunci orang lain gagal, nominal diubah gagal', () => {
    const good = signTx({ from: 'ayu', to: 'budi', amount: 10, seq: 0 }, 'ayu')
    expect(verifyTx(good)).toBe(true)
    expect(verifyTx(signTx({ from: 'ayu', to: 'budi', amount: 10, seq: 0 }, 'budi'))).toBe(false)
    expect(verifyTx({ ...good, amount: 1000 })).toBe(false)
  })
  it('menolak saldo kurang dan pemutaran ulang', () => {
    const state = emptyState()
    state.balance.ayu = 20
    const pay = signTx({ from: 'ayu', to: 'budi', amount: 15, seq: 0 }, 'ayu')
    const { accepted, rejected } = sortMempool([pay, pay], state)
    expect(accepted).toHaveLength(1)
    expect(rejected[0].issue).toBe('seqUsed')
    const greedy = signTx({ from: 'ayu', to: 'budi', amount: 99, seq: 0 }, 'ayu')
    expect(sortMempool([greedy], state).rejected[0].issue).toBe('insufficient')
  })
  it('menghitung saldo dari hadiah dan transaksi', () => {
    const blocks = makeChain()
    blocks.push({ number: 2, nonce: 0, coinbase: { to: 'budi', amount: REWARD }, txs: [signTx({ from: 'ayu', to: 'citra', amount: 20, seq: 0 }, 'ayu')] })
    const ledger = deriveLedger(blocks, 0)
    expect(ledger.state.balance).toMatchObject({ ayu: 30, budi: 50, citra: 20, deni: 0 })
    expect(ledger.blocks.every((b) => b.rulesOk)).toBe(true)
  })
  it('hadiah yang digelembungkan melanggar aturan walau hash-nya sah', () => {
    const blocks = makeChain()
    blocks[0].coinbase.amount = 5000
    const ledger = deriveLedger(blocks, 0)
    expect(ledger.blocks[0].mined).toBe(true)
    expect(ledger.blocks[0].valid).toBe(false)
  })
})

describe('simulasi', () => {
  const run = (sim, seconds) => {
    for (let t = 0; t < seconds; t += 0.05) sim.step(0.05)
  }
  it('rumus peluang serangan cocok dengan balapan Monte Carlo', () => {
    const random = seeded(11)
    const race = (q, z) => {
      let honest = 0
      let secret = 0
      for (;;) {
        if (random() < q) secret++
        else honest++
        if (honest >= z && secret > honest) return true
        if (honest - secret >= GIVE_UP_GAP) return false
      }
    }
    for (const [q, z] of [[0.1, 1], [0.2, 2], [0.3, 2], [0.3, 6], [0.45, 3], [0.55, 2]]) {
      let wins = 0
      const trials = 60000
      for (let i = 0; i < trials; i++) if (race(q, z)) wins++
      expect(Math.abs(wins / trials - attackSuccessProbability(q, z))).toBeLessThan(0.012)
    }
    expect(attackSuccessProbability(0, 2)).toBe(0)
    expect(attackSuccessProbability(1, 2)).toBe(1)
  })
  it('hasil simulasi lengkap mendekati rumus peluang serangan', () => {
    const miners = DEFAULT_MINERS.map((m) => (m.attacker ? { ...m, power: 30 } : { ...m, power: 17.5 }))
    const sim = new Simulation({ miners, blockTime: 2, latency: 0.02, confirmations: 2, random: seeded(21) })
    sim.autoAttack = true
    for (let t = 0; t < 40000; t += 0.05) sim.step(0.05)
    const { wins, losses } = sim.attackStats
    expect(wins + losses).toBeGreaterThan(600)
    expect(Math.abs(wins / (wins + losses) - attackSuccessProbability(0.3, 2))).toBeLessThan(0.06)
  })
  it('jumlah blok per detik mengikuti waktu blok', () => {
    const sim = new Simulation({ blockTime: 5, latency: 0, random: seeded(1) })
    run(sim, 2500)
    expect(sim.stats().height).toBeGreaterThan(420)
    expect(sim.stats().height).toBeLessThan(580)
  })
  it('latensi tinggi menghasilkan lebih banyak blok terbuang', () => {
    const calm = new Simulation({ blockTime: 5, latency: 0.1, random: seeded(2) })
    const slow = new Simulation({ blockTime: 5, latency: 4, random: seeded(2) })
    run(calm, 1500)
    run(slow, 1500)
    expect(slow.stats().staleRate).toBeGreaterThan(calm.stats().staleRate + 0.1)
  })
  it('hadiah kira-kira sebanding dengan daya hash', () => {
    const miners = [
      { id: 'a', power: 75 },
      { id: 'b', power: 25 },
    ]
    const sim = new Simulation({ miners, blockTime: 2, latency: 0, random: seeded(3) })
    run(sim, 2000)
    const { rewards, height } = sim.stats()
    expect(rewards.a / height).toBeGreaterThan(0.68)
    expect(rewards.a / height).toBeLessThan(0.82)
  })
  it('penyerang mayoritas hampir selalu menang, penyerang kecil jarang', () => {
    const attack = (power, seed) => {
      const miners = DEFAULT_MINERS.map((m) => (m.attacker ? { ...m, power } : { ...m, power: 25 }))
      const sim = new Simulation({ miners, blockTime: 2, latency: 0.05, confirmations: 2, random: seeded(seed) })
      sim.autoAttack = true
      run(sim, 3000)
      return sim.attackStats
    }
    const strong = attack(150, 4)
    const weak = attack(15, 5)
    expect(strong.wins + strong.losses).toBeGreaterThan(10)
    expect(strong.wins / (strong.wins + strong.losses)).toBeGreaterThan(0.85)
    expect(weak.wins / (weak.wins + weak.losses)).toBeLessThan(0.35)
  })
  it('layout menaruh rantai utama lurus di jalur 0', () => {
    const sim = new Simulation({ blockTime: 2, latency: 2, random: seeded(6) })
    run(sim, 200)
    const { blocks } = sim.layout(30)
    expect(blocks.filter((b) => b.main).every((b) => b.lane === 0)).toBe(true)
    const keys = blocks.map((b) => `${b.height}/${b.lane}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
