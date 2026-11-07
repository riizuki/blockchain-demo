// Format angka dan satuan mengikuti bahasa yang sedang aktif.
import { LANGUAGES, getLang, translate } from '../i18n/index.js'

const localeOf = () => LANGUAGES.find((l) => l.code === getLang()).locale

const cache = new Map()
function formatter(Kind, options = {}) {
  const key = `${Kind.name}/${localeOf()}/${JSON.stringify(options)}`
  if (!cache.has(key)) cache.set(key, new Kind(localeOf(), options))
  return cache.get(key)
}

export const count = (n) => formatter(Intl.NumberFormat).format(Math.round(n))
export const decimal = (n, digits = 1) => formatter(Intl.NumberFormat, { maximumFractionDigits: digits }).format(n)
export const list = (items) => formatter(Intl.ListFormat, { type: 'conjunction' }).format(items)

export function rate(perSecond) {
  if (!perSecond || !Number.isFinite(perSecond)) return '–'
  const compact = formatter(Intl.NumberFormat, { notation: 'compact', maximumFractionDigits: 1 }).format(perSecond)
  return `${compact}${translate('unit.perSecond')}`
}

export function duration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–'
  if (ms < 1000) return translate('unit.ms', { n: count(ms) })
  const seconds = ms / 1000
  if (seconds < 90) return translate('unit.sec', { n: decimal(seconds) })
  const minutes = seconds / 60
  if (minutes < 90) return translate('unit.min', { n: decimal(minutes) })
  const hours = minutes / 60
  if (hours < 48) return translate('unit.hour', { n: decimal(hours) })
  const days = hours / 24
  if (days < 730) return translate('unit.day', { n: decimal(days) })
  return translate('unit.year', { n: decimal(days / 365) })
}

export const percent = (fraction, digits = 0) =>
  formatter(Intl.NumberFormat, { style: 'percent', maximumFractionDigits: digits }).format(fraction)

export const short = (hash, n = 8) => (hash ? hash.slice(0, n) : '')

/** Sidik jari ringkas: beberapa digit setelah deretan nol, sebab digit nolnya sama di semua blok sah. */
export function tag(hash, n = 4) {
  const start = hash.search(/[^0]/)
  return hash.slice(start < 0 ? 0 : start, (start < 0 ? 0 : start) + n)
}
