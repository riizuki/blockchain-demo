// Daftar misi dan progresnya. Disimpan di localStorage supaya tidak hilang saat halaman dimuat ulang.
import { useSyncExternalStore } from 'react'

// Teks tiap misi ada di kamus dengan kunci mission.<id>.
export const MISSIONS = [
  { id: 'hash-avalanche', chapter: 'hash' },
  { id: 'hash-prefix', chapter: 'hash' },
  { id: 'hash-file', chapter: 'hash' },
  { id: 'block-hand', chapter: 'block' },
  { id: 'block-hard', chapter: 'block' },
  { id: 'block-power', chapter: 'block' },
  { id: 'chain-break', chapter: 'chain' },
  { id: 'chain-fix', chapter: 'chain' },
  { id: 'chain-grow', chapter: 'chain' },
  { id: 'net-reject', chapter: 'network' },
  { id: 'net-takeover', chapter: 'network' },
  { id: 'net-split', chapter: 'network' },
  { id: 'keys-verify', chapter: 'keys' },
  { id: 'keys-tamper', chapter: 'keys' },
  { id: 'tx-overspend', chapter: 'transactions' },
  { id: 'tx-forge', chapter: 'transactions' },
  { id: 'tx-replay', chapter: 'transactions' },
  { id: 'tx-tamper', chapter: 'transactions' },
  { id: 'lab-reorg', chapter: 'lab' },
  { id: 'lab-win', chapter: 'lab' },
  { id: 'lab-lose', chapter: 'lab' },
]

const KEY = 'buku-besar:misi'

function load() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY)) ?? [])
  } catch {
    return new Set()
  }
}

let done = load()
let toast = null
const listeners = new Set()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function completeMission(id) {
  if (done.has(id)) return
  done = new Set(done).add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]))
  } catch {
    // Mode privat bisa menolak penyimpanan; progres tetap jalan selama halaman terbuka.
  }
  toast = { id, key: Date.now() }
  emit()
}

export function dismissToast() {
  toast = null
  emit()
}

export function resetMissions() {
  done = new Set()
  toast = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Tidak ada yang perlu dilakukan kalau penyimpanan tidak tersedia.
  }
  emit()
}

export const useMissions = () => useSyncExternalStore(subscribe, () => done)
export const useToast = () => useSyncExternalStore(subscribe, () => toast)
