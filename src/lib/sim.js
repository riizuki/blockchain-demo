// Bab Lab: simulasi jaringan penambang. Waktu menemukan blok diundi secara acak sesuai daya hash,
// jadi di sini tidak ada SHA-256 yang benar-benar ditambang. Hash di label hanya untuk identitas blok.
import { sha256Hex } from './crypto.js'

export const STEP = 0.05 // detik simulasi per langkah
export const GIVE_UP_GAP = 6

export const DEFAULT_MINERS = [
  { id: 'najwa', power: 30 },
  { id: 'budi', power: 30 },
  { id: 'citra', power: 25 },
  { id: 'deni', power: 15 },
  { id: 'kancil', power: 0, attacker: true },
]

/**
 * Peluang double spend berhasil menurut aturan simulasi ini, dengan latensi diabaikan.
 * Saat jaringan mencapai z konfirmasi, jumlah blok rahasia k mengikuti distribusi binomial negatif
 * (Rosenfeld, 2014). Bila k > z penyerang langsung menang; bila tidak, ia harus menyalip (bukan sekadar
 * menyamai) sebelum tertinggal giveUp blok, yaitu masalah gambler's ruin dengan dua batas.
 */
export function attackSuccessProbability(q, z, giveUp = GIVE_UP_GAP) {
  if (q <= 0) return 0
  if (q >= 1) return 1
  const p = 1 - q
  const ruin = (start, target) => {
    if (start <= 0) return 0
    const r = p / q
    return r === 1 ? start / target : (1 - Math.pow(r, start)) / (1 - Math.pow(r, target))
  }
  let negativeBinomial = Math.pow(p, z)
  let reached = 0
  let success = 0
  for (let k = 0; k <= z; k++) {
    reached += negativeBinomial
    success += negativeBinomial * ruin(giveUp - (z - k), giveUp + 1)
    negativeBinomial *= (q * (k + z)) / (k + 1)
  }
  return Math.min(1, success + (1 - reached))
}

export class Simulation {
  constructor({ miners = DEFAULT_MINERS, blockTime = 6, latency = 0.6, confirmations = 2, random = Math.random } = {}) {
    this.random = random
    this.blockTime = blockTime
    this.latency = latency
    this.confirmations = confirmations
    this.minerConfig = miners
    this.reset()
  }

  reset() {
    const genesis = {
      id: 0,
      parent: null,
      height: 0,
      miner: null,
      t: 0,
      hash: sha256Hex('genesis'),
      secret: false,
    }
    this.t = 0
    this.nextId = 1
    this.blocks = new Map([[0, genesis]])
    this.miners = this.minerConfig.map((m) => ({ ...m, tip: 0, lastFound: -10 }))
    this.messages = []
    this.found = 0
    this.reorgs = 0
    this.deepestReorg = 0
    this.lastReorg = null
    this.version = 0
    this.attack = { state: 'idle' }
    this.attackStats = { tries: 0, wins: 0, losses: 0 }
    this.autoAttack = false
    this.cooldownUntil = 0
    this.log = []
  }

  get attacker() {
    return this.miners.find((m) => m.attacker)
  }

  totalPower() {
    return this.miners.reduce((sum, m) => sum + m.power, 0)
  }

  /** Porsi daya penyerang dari seluruh jaringan, 0 sampai 1. */
  attackerShare() {
    const total = this.totalPower()
    return total > 0 && this.attacker ? this.attacker.power / total : 0
  }

  setPower(id, power) {
    const miner = this.miners.find((m) => m.id === id)
    if (miner) miner.power = power
    this.minerConfig = this.minerConfig.map((m) => (m.id === id ? { ...m, power } : m))
    this.version++
  }

  /** Mencatat kejadian sebagai kunci kamus, supaya log ikut berganti saat bahasa diganti. */
  note(kind, key, params) {
    this.log.unshift({ id: `${this.t}-${this.log.length}`, kind, key, params, t: this.t })
    this.log.length = Math.min(this.log.length, 40)
  }

  addBlock(miner, parentId, secret) {
    const parent = this.blocks.get(parentId)
    const id = this.nextId++
    const block = {
      id,
      parent: parentId,
      height: parent.height + 1,
      miner: miner.id,
      t: this.t,
      hash: sha256Hex(`${parent.hash}|${miner.id}|${id}`),
      secret,
    }
    this.blocks.set(id, block)
    miner.lastFound = this.t
    if (!secret) this.found++
    this.version++
    return block
  }

  broadcast(from, block) {
    for (const miner of this.miners) {
      if (miner.id === from.id) continue
      // Sedikit acak supaya kedatangan pesan tidak serempak.
      const delay = this.latency * (0.6 + this.random() * 0.8)
      this.messages.push({ from: from.id, to: miner.id, block: block.id, sent: this.t, arrive: this.t + delay })
    }
  }

  /** Mencari leluhur blok pada ketinggian tertentu. */
  ancestorAt(id, height) {
    let block = this.blocks.get(id)
    while (block && block.height > height) block = this.blocks.get(block.parent)
    return block
  }

  commonAncestor(a, b) {
    let x = this.blocks.get(a)
    let y = this.blocks.get(b)
    while (x.id !== y.id) {
      if (x.height >= y.height) x = this.blocks.get(x.parent)
      else y = this.blocks.get(y.parent)
    }
    return x
  }

  isAncestor(ancestorId, id) {
    const ancestor = this.blocks.get(ancestorId)
    const found = this.ancestorAt(id, ancestor.height)
    return found && found.id === ancestorId
  }

  receive(miner, blockId) {
    // Penyerang yang sedang balapan tidak mau pindah ke rantai publik.
    if (miner.attacker && this.isRacing()) return
    const incoming = this.blocks.get(blockId)
    const current = this.blocks.get(miner.tip)
    if (incoming.height <= current.height) return
    if (!this.isAncestor(miner.tip, blockId)) {
      const depth = current.height - this.commonAncestor(miner.tip, blockId).height
      if (depth > 0) {
        this.reorgs++
        this.deepestReorg = Math.max(this.deepestReorg, depth)
        if (this.t - (this.lastReorg?.t ?? -9) > 1) {
          this.note('reorg', 'lab.log.reorg', { n: depth, miner: miner.id })
        }
        this.lastReorg = { depth, miner: miner.id, t: this.t }
      }
    }
    miner.tip = blockId
    this.version++
  }

  isRacing() {
    return this.attack.state === 'waiting' || this.attack.state === 'racing'
  }

  /** Ujung rantai yang dipegang penambang jujur terbanyak; bila seri, yang tertinggi lalu yang lebih dulu. */
  bestTip() {
    const votes = new Map()
    for (const miner of this.miners) {
      if (miner.attacker && this.attack.state !== 'idle') continue
      votes.set(miner.tip, (votes.get(miner.tip) ?? 0) + 1)
    }
    let best = 0
    let bestHeight = -1
    let bestVotes = -1
    for (const [tip, count] of votes) {
      const height = this.blocks.get(tip).height
      if (height > bestHeight || (height === bestHeight && count > bestVotes)) {
        best = tip
        bestHeight = height
        bestVotes = count
      }
    }
    return best
  }

  /** Himpunan id blok di rantai utama saat ini. */
  mainChain() {
    const ids = new Set()
    let block = this.blocks.get(this.bestTip())
    while (block) {
      ids.add(block.id)
      block = this.blocks.get(block.parent)
    }
    return ids
  }

  stats() {
    const best = this.blocks.get(this.bestTip())
    const main = this.mainChain()
    const rewards = Object.fromEntries(this.miners.map((m) => [m.id, 0]))
    for (const id of main) {
      const block = this.blocks.get(id)
      if (block.miner) rewards[block.miner]++
    }
    const stale = Math.max(0, this.found - best.height)
    return {
      height: best.height,
      found: this.found,
      stale,
      staleRate: this.found ? stale / this.found : 0,
      reorgs: this.reorgs,
      deepestReorg: this.deepestReorg,
      rewards,
    }
  }

  startAttack() {
    const attacker = this.attacker
    if (!attacker || attacker.power <= 0 || this.attack.state !== 'idle') return false
    const base = this.bestTip()
    attacker.tip = base
    this.attack = { state: 'waiting', base, secretTip: base, payment: null, startedAt: this.t, confirmations: 0, lead: 0 }
    this.attackStats.tries++
    this.note('attack', 'lab.log.start', { height: this.blocks.get(base).height })
    this.version++
    return true
  }

  finishAttack(result, key, params) {
    const attacker = this.attacker
    this.attack = { state: 'idle', last: result, payment: this.attack.payment }
    if (result === 'win') this.attackStats.wins++
    else if (result === 'lose') this.attackStats.losses++
    else this.attackStats.tries--
    this.note(result === 'void' ? 'attack' : result, key, params)
    attacker.tip = this.bestTip()
    this.cooldownUntil = this.t + this.blockTime
    this.version++
  }

  stepAttack() {
    const attack = this.attack
    if (attack.state === 'idle') {
      if (this.autoAttack && this.t >= this.cooldownUntil) this.startAttack()
      return
    }
    const secretTip = this.blocks.get(attack.secretTip)
    const baseHeight = this.blocks.get(attack.base).height

    if (attack.state === 'waiting' || attack.state === 'racing') {
      const publicTip = this.blocks.get(this.bestTip())
      const onChain = this.isAncestor(attack.base, publicTip.id)
      if (!onChain) {
        // Titik awal tergusur fork alami. Ini bukan hasil serangan, jadi tidak ikut dihitung.
        this.finishAttack('void', 'lab.log.voidFork')
        return
      }
      if (!this.miners.some((m) => !m.attacker && m.power > 0)) {
        this.finishAttack('void', 'lab.log.voidHonest')
        return
      }
      if (publicTip.height > baseHeight) {
        const paymentBlock = this.ancestorAt(publicTip.id, baseHeight + 1)
        if (attack.payment !== paymentBlock.id) {
          attack.payment = paymentBlock.id
          if (attack.state === 'waiting') {
            attack.state = 'racing'
            this.note('attack', 'lab.log.payment', { height: paymentBlock.height })
          }
          this.version++
        }
      }
      attack.confirmations = Math.max(0, publicTip.height - baseHeight)
      attack.lead = secretTip.height - publicTip.height
      if (attack.confirmations >= this.confirmations && attack.lead > 0) {
        for (let block = secretTip; block && block.id !== attack.base; block = this.blocks.get(block.parent)) {
          block.secret = false
          this.found++
        }
        attack.state = 'revealed'
        attack.revealTip = secretTip.id
        this.attacker.tip = secretTip.id
        this.broadcast(this.attacker, secretTip)
        this.note('attack', 'lab.log.reveal', { n: secretTip.height - baseHeight })
        this.version++
        return
      }
      if (attack.lead <= -GIVE_UP_GAP) {
        this.finishAttack('lose', 'lab.log.giveUp', { gap: GIVE_UP_GAP })
      }
      return
    }

    if (attack.state === 'revealed') {
      const honest = this.miners.filter((m) => !m.attacker && m.power > 0)
      const adopted = honest.filter((m) => this.isAncestor(attack.revealTip, m.tip)).length
      if (adopted > honest.length / 2) {
        this.finishAttack('win', 'lab.log.win')
        return
      }
      const publicTip = this.blocks.get(this.bestTip())
      const revealHeight = this.blocks.get(attack.revealTip).height
      if (publicTip.height >= revealHeight + 3 && !this.isAncestor(attack.revealTip, publicTip.id)) {
        this.finishAttack('lose', 'lab.log.lostRace')
      }
    }
  }

  stepMining(dt) {
    const total = this.totalPower()
    if (total <= 0) return
    for (const miner of this.miners) {
      if (miner.power <= 0) continue
      const rate = miner.power / total / this.blockTime
      if (this.random() >= 1 - Math.exp(-rate * dt)) continue
      const racing = miner.attacker && this.isRacing()
      if (racing) {
        const block = this.addBlock(miner, this.attack.secretTip, true)
        this.attack.secretTip = block.id
      } else {
        const block = this.addBlock(miner, miner.tip, false)
        miner.tip = block.id
        this.broadcast(miner, block)
      }
    }
  }

  step(dt = STEP) {
    this.t += dt
    const pending = []
    for (const message of this.messages) {
      if (message.arrive <= this.t) {
        this.receive(this.miners.find((m) => m.id === message.to), message.block)
      } else {
        pending.push(message)
      }
    }
    this.messages = pending
    this.stepMining(dt)
    this.stepAttack()
  }

  /** Menyusun blok dalam jalur supaya rantai utama lurus dan cabang berada di sekitarnya. */
  layout(visible = 16) {
    const best = this.blocks.get(this.bestTip())
    const main = this.mainChain()
    const top = Math.max(...this.miners.map((m) => this.blocks.get(m.tip).height), best.height, this.attack.secretTip !== undefined ? this.blocks.get(this.attack.secretTip).height : 0)
    const minHeight = Math.max(0, top - visible + 1)
    const lanes = new Map()
    const occupied = new Map()
    const placed = []
    const claim = (height, wanted, direction) => {
      let lane = wanted
      const row = occupied.get(height) ?? new Set()
      while (row.has(lane)) lane += direction
      row.add(lane)
      occupied.set(height, row)
      return lane
    }
    // Sisakan beberapa blok di kiri layar supaya tidak ada ruang kosong selama animasi bergeser.
    const ordered = [...this.blocks.values()].filter((b) => b.height >= minHeight - 8).sort((a, b) => a.height - b.height || a.id - b.id)
    for (const block of ordered) if (main.has(block.id)) { lanes.set(block.id, claim(block.height, 0, 1)) }
    for (const block of ordered) {
      if (main.has(block.id)) continue
      const parentLane = lanes.get(block.parent)
      const direction = block.secret ? 1 : -1
      const start = parentLane !== undefined && parentLane !== 0 ? parentLane : direction
      lanes.set(block.id, claim(block.height, start, direction))
    }
    for (const block of ordered) {
      placed.push({ ...block, lane: lanes.get(block.id), main: main.has(block.id), parentLane: lanes.get(block.parent) })
    }
    return { blocks: placed, top, minHeight, bestId: best.id }
  }
}
