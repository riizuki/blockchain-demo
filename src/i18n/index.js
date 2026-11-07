// Kamus tiga bahasa dan cara memakainya di komponen. English adalah bahasa utama dan cadangan.
import { createElement, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import en from './en.js'
import id from './id.js'
import ja from './ja.js'

export const LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English', locale: 'en-US' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia', locale: 'id-ID' },
  { code: 'ja', short: '日本語', name: '日本語', locale: 'ja-JP' },
]

export const DICTIONARIES = { en, id, ja }

const KEY = 'buku-besar:bahasa'

function load() {
  try {
    const saved = localStorage.getItem(KEY)
    if (DICTIONARIES[saved]) return saved
  } catch {
    // Penyimpanan tidak tersedia, pakai bahasa utama.
  }
  return 'en'
}

let current = load()
const listeners = new Set()
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getLang = () => current

export function setLang(lang) {
  if (lang === current || !DICTIONARIES[lang]) return
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Pilihan tetap berlaku selama halaman terbuka.
  }
  listeners.forEach((listener) => listener())
}

/**
 * Mengambil teks dari kamus dan mengisi {param}. Bila params.n bernilai 1 dan ada kunci berakhiran
 * _one, kunci itu yang dipakai; hanya English yang butuh bentuk tunggal.
 */
export function translateIn(lang, key, params) {
  const dictionary = DICTIONARIES[lang]
  const singular = params?.n === 1 ? `${key}_one` : null
  const template = (singular && dictionary[singular]) ?? dictionary[key] ?? (singular && en[singular]) ?? en[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match)
}

export const translate = (key, params) => translateIn(current, key, params)

/** Fungsi t(kunci, params) untuk komponen; komponen digambar ulang saat bahasa berganti. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang)
  return useMemo(() => {
    const t = (key, params) => translateIn(lang, key, params)
    t.lang = lang
    return t
  }, [lang])
}

/**
 * Dipanggil saat bahasa berganti. Dipakai untuk menukar isi contoh ke bahasa baru,
 * hanya bila pengguna belum mengubahnya.
 */
export function useLanguageChange(callback) {
  const lang = useSyncExternalStore(subscribe, getLang)
  const previous = useRef(lang)
  const latest = useRef(callback)
  latest.current = callback
  useEffect(() => {
    if (previous.current === lang) return
    const from = previous.current
    previous.current = lang
    latest.current(lang, from)
  }, [lang])
}

/** Mengubah **tebal** dan *miring* di dalam teks kamus menjadi elemen. */
export function rich(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, index) => {
    if (part.startsWith('**')) return createElement('strong', { key: index }, part.slice(2, -2))
    if (part.startsWith('*') && part.length > 1) return createElement('em', { key: index }, part.slice(1, -1))
    return part
  })
}
