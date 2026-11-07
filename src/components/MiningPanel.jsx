import { useT } from '../i18n/index.js'
import { count, duration, rate } from '../lib/format.js'
import { HashText, Stat } from './ui.jsx'

/**
 * Tangga kelangkaan: berapa banyak hash yang berawalan n nol.
 * Tiap anak tangga 16 kali lebih langka, jadi panjang batang memakai skala logaritmik.
 */
export function RarityLadder({ histogram, difficulty }) {
  const t = useT()
  const max = Math.log(Math.max(...histogram, 1) + 1)
  return (
    <div className="ladder" role="table" aria-label={t('mining.ladderLabel')}>
      {histogram.map((value, level) => {
        const isGoal = level === difficulty
        return (
          <div className={`ladder-row ${isGoal ? 'ladder-goal' : ''}`} role="row" key={level} title={t('mining.rowTitle', { n: level, count: count(value) })}>
            <span className="ladder-label" role="cell">
              {isGoal ? t('mining.target', { n: level }) : t('common.zeros', { n: level })}
            </span>
            <span className="ladder-track" role="cell">
              <span className="ladder-bar" style={{ width: `${value ? Math.max(2, (Math.log(value + 1) / max) * 100) : 0}%` }} />
            </span>
            <span className="ladder-count" role="cell">
              {count(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MiningStats({ progress, difficulty, workers }) {
  const t = useT()
  const attempts = progress?.attempts ?? 0
  const ms = progress?.ms ?? 0
  const speed = ms > 0 ? (attempts / ms) * 1000 : 0
  const expected = Math.pow(16, difficulty)
  return (
    <div className="stats">
      <Stat label={t('mining.attempts')} value={count(attempts)} hint={t('mining.average', { count: count(expected) })} />
      <Stat label={t('mining.speed')} value={rate(speed)} hint={t('mining.workers', { n: workers })} />
      <Stat label={t('mining.time')} value={duration(ms)} hint={speed ? t('mining.estimate', { time: duration((expected / speed) * 1000) }) : t('mining.notYet')} />
    </div>
  )
}

export function LiveHash({ progress, difficulty }) {
  const t = useT()
  return (
    <dl className="live-hash">
      <div>
        <dt>{t('mining.latest')}</dt>
        <dd><HashText value={progress?.lastHash} difficulty={difficulty} /></dd>
      </div>
      <div>
        <dt>{t('mining.best')}</dt>
        <dd><HashText value={progress?.bestHash} difficulty={difficulty} /></dd>
      </div>
    </dl>
  )
}
