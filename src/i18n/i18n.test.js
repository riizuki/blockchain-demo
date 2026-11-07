import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MISSIONS } from '../lib/store.js'
import { DICTIONARIES, LANGUAGES, translateIn } from './index.js'

const SRC = join(import.meta.dirname, '..')
const base = (dict) => Object.keys(dict).filter((key) => !key.endsWith('_one'))
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path)
    return /\.jsx?$/.test(name) && !name.endsWith('.test.js') ? [path] : []
  })
}

describe('kamus', () => {
  it('English menjadi bahasa pertama dan bawaan', () => {
    expect(LANGUAGES[0].code).toBe('en')
    expect(translateIn('en', 'stamp.valid')).toBe('VALID')
  })

  it('semua bahasa punya kunci yang sama', () => {
    const english = base(DICTIONARIES.en).sort()
    for (const lang of ['id', 'ja']) expect(base(DICTIONARIES[lang]).sort()).toEqual(english)
  })

  it('parameter tiap teks sama di semua bahasa', () => {
    for (const key of base(DICTIONARIES.en)) {
      const expected = [...new Set(placeholders(DICTIONARIES.en[key]))]
      for (const lang of ['id', 'ja']) {
        expect([...new Set(placeholders(DICTIONARIES[lang][key]))], `${lang}: ${key}`).toEqual(expected)
      }
    }
  })

  it('tiap bentuk tunggal punya bentuk jamak dan tidak memakai parameter tambahan', () => {
    for (const key of Object.keys(DICTIONARIES.en).filter((k) => k.endsWith('_one'))) {
      const plural = key.replace(/_one$/, '')
      expect(DICTIONARIES.en[plural], key).toBeDefined()
      const allowed = placeholders(DICTIONARIES.en[plural])
      for (const name of placeholders(DICTIONARIES.en[key])) expect(allowed, key).toContain(name)
    }
  })

  it('semua kunci yang dipakai kode ada di kamus', () => {
    const used = new Set()
    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, 'utf8')
      for (const match of code.matchAll(/\b(?:t|translate)\('([a-zA-Z0-9.\-_]+)'/g)) used.add(match[1])
      for (const match of code.matchAll(/note\('\w+', '([a-zA-Z0-9.\-_]+)'/g)) used.add(match[1])
      for (const match of code.matchAll(/'((?:net|lab|tx|stamp|keys)\.[a-zA-Z.]+)'/g)) used.add(match[1])
    }
    const missing = [...used].filter((key) => DICTIONARIES.en[key] === undefined)
    expect(missing).toEqual([])
    expect(used.size).toBeGreaterThan(150)
  })

  it('kunci dinamis punya teks: misi, tab, nama, alasan, masalah, skenario', () => {
    const dynamic = [
      ...MISSIONS.map((m) => `mission.${m.id}`),
      ...['hash', 'block', 'chain', 'network', 'keys', 'transactions', 'lab'].map((id) => `tab.${id}`),
      ...['najwa', 'budi', 'citra', 'deni', 'kancil'].map((id) => `name.${id}`),
      ...['broken', 'shorter', 'longer', 'heal'].map((id) => `net.reason.${id}`),
      ...['badAmount', 'badSignature', 'seqUsed', 'seqSkipped', 'insufficient', 'badReward'].map((id) => `tx.issue.${id}`),
      ...['healthy', 'slow', 'giant', 'attack20', 'attack55'].map((id) => `lab.scenario.${id}`),
      ...['waiting', 'racing', 'revealed'].map((id) => `lab.state.${id}`),
    ]
    for (const lang of Object.keys(DICTIONARIES)) {
      for (const key of dynamic) expect(DICTIONARIES[lang][key], `${lang}: ${key}`).toBeDefined()
    }
  })

  it('tidak ada teks Indonesia di kamus English atau teks Latin panjang di kamus Jepang', () => {
    const indonesian = /\b(yang|dan|tidak|dengan|untuk|sudah|rantai|tambang|kunci|saldo)\b/i
    for (const [key, text] of Object.entries(DICTIONARIES.en)) expect(indonesian.test(text), key).toBe(false)
    const japaneseScript = /[぀-ヿ一-鿿]/
    const allowLatin = new Set(['hash.bit1'])
    for (const [key, text] of Object.entries(DICTIONARIES.ja)) {
      if (allowLatin.has(key)) continue
      if (/^\{?[\w\s.%/]*\}?$/.test(text)) continue
      expect(japaneseScript.test(text), key).toBe(true)
    }
  })

  it('memilih bentuk tunggal hanya saat n bernilai 1 dan aman terhadap tanda dolar', () => {
    expect(translateIn('en', 'chain.remine', { n: 1 })).toBe('Re-mine 1 block')
    expect(translateIn('en', 'chain.remine', { n: 2 })).toBe('Re-mine 2 blocks')
    expect(translateIn('id', 'chain.remine', { n: 1 })).toBe('Tambang ulang 1 blok')
    expect(translateIn('en', 'hash.fileBusy', { name: '$1.txt' })).toBe('Hashing $1.txt…')
  })
})
