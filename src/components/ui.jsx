import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/index.js'
import { MISSIONS, useMissions } from '../lib/store.js'
import { leadingZeros } from '../lib/crypto.js'

export function Stamp({ ok, okText, badText, delay = 0, tone }) {
  const t = useT()
  const text = ok ? okText ?? t('stamp.valid') : badText ?? t('stamp.broken')
  return (
    <span key={text} className={`stamp ${tone ?? (ok ? 'stamp-ok' : 'stamp-bad')}`} style={{ animationDelay: `${delay}ms` }}>
      {text}
    </span>
  )
}

/** Menampilkan hash; digit nol di depan yang memenuhi target ditonjolkan. */
export function HashText({ value, difficulty = 0, className = '', ...rest }) {
  if (!value) return <code className={`hash ${className}`} {...rest}>&nbsp;</code>
  const zeros = leadingZeros(value)
  const good = Math.min(zeros, difficulty)
  return (
    <code className={`hash ${className}`} {...rest}>
      {good > 0 && <span className="hash-zeros">{value.slice(0, good)}</span>}
      {value.slice(good)}
    </code>
  )
}

export function Stat({ label, value, hint, wide }) {
  return (
    <div className={`stat ${wide ? 'stat-wide' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, display, disabled, id }) {
  return (
    <label className="slider" htmlFor={id}>
      <span className="slider-head">
        <span className="slider-label">{label}</span>
        <output className="slider-value">{display ?? value}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--fill': `${((value - min) / (max - min || 1)) * 100}%` }}
      />
    </label>
  )
}

/**
 * Tombol yang bisa ditekan sekali atau ditahan untuk mengulang.
 * onStep boleh mengembalikan false untuk menghentikan pengulangan.
 */
export function HoldButton({ onStep, children, interval = 40, ...rest }) {
  const latest = useRef(onStep)
  latest.current = onStep
  const timers = useRef({})

  const stop = () => {
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.repeat)
  }
  useEffect(() => stop, [])

  const start = (event) => {
    if (event.button !== 0) return
    stop()
    if (latest.current() === false) return
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => {
        if (latest.current() === false) stop()
      }, interval)
    }, 280)
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // Klik dari papan ketik punya detail 0; klik penunjuk sudah ditangani onPointerDown.
      onClick={(event) => {
        if (event.detail === 0) latest.current()
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function MissionList({ chapter }) {
  const t = useT()
  const done = useMissions()
  const missions = MISSIONS.filter((m) => m.chapter === chapter)
  const finished = missions.filter((m) => done.has(m.id)).length
  // Di layar sempit daftar ini dilipat supaya bagian yang bisa dicoba tidak terdorong terlalu jauh ke bawah.
  const [startOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches)
  return (
    <details className="missions" open={startOpen}>
      <summary className="missions-title">{t('missions.title')} {finished}/{missions.length}</summary>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id} className={done.has(mission.id) ? 'mission-done' : ''}>
            <span className="mission-box" aria-hidden="true">
              {done.has(mission.id) && (
                <svg viewBox="0 0 16 16">
                  <path d="M3 8.5 6.5 12 13 4" />
                </svg>
              )}
            </span>
            <span>
              {t(`mission.${mission.id}`)}
              {done.has(mission.id) && <span className="sr-only"> {t('missions.doneSr')}</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function ChapterHead({ no, title, chapter, children }) {
  const t = useT()
  return (
    <header className="chapter-head">
      <div className="chapter-intro">
        <p className="eyebrow">{t('chapter.label', { no })}</p>
        <h2>{title}</h2>
        <div className="lede">{children}</div>
      </div>
      <MissionList chapter={chapter} />
    </header>
  )
}

export function NextChapter({ to, children }) {
  const t = useT()
  return (
    <a className="next-chapter" href={`#/${to}`}>
      <span className="next-label">{t('next.label', { title: t(`tab.${to}`) })}</span>
      <span className="next-text">{children}</span>
      <span className="next-arrow" aria-hidden="true">→</span>
    </a>
  )
}

export function Steps({ title, items }) {
  const t = useT()
  return (
    <div className="steps">
      <h3>{title ?? t('steps.try')}</h3>
      <ol>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ol>
    </div>
  )
}
