import { useRef, useState } from 'react'
import { LiveHash, MiningStats, RarityLadder } from '../components/MiningPanel.jsx'
import { ChapterHead, HashText, HoldButton, NextChapter, Slider, Stamp } from '../components/ui.jsx'
import { getLang, rich, useLanguageChange, useT } from '../i18n/index.js'
import { blockHash, blockPrefix } from '../lib/chain.js'
import { ZERO_HASH, meetsDifficulty } from '../lib/crypto.js'
import { count, duration, rate } from '../lib/format.js'
import { MAX_WORKERS } from '../lib/miner.js'
import { sampleRecord } from '../lib/seeds.js'
import { completeMission } from '../lib/store.js'
import { useMiner } from '../lib/useMiner.js'

export default function BlockPage() {
  const t = useT()
  const [block, setBlock] = useState(() => ({ number: 1, nonce: 0, data: sampleRecord(getLang()) }))
  const [difficulty, setDifficulty] = useState(4)
  const [workers, setWorkers] = useState(1)
  const [history, setHistory] = useState([])
  const { running, progress, run, cancel } = useMiner()
  const blockRef = useRef(block)
  blockRef.current = block

  const full = { ...block, prev: ZERO_HASH }
  const hash = blockHash(full)
  const valid = meetsDifficulty(hash, difficulty)

  const patch = (changes) => {
    const next = { ...blockRef.current, ...changes }
    blockRef.current = next
    setBlock(next)
  }

  // Isi contoh ikut berganti bahasa selama pengguna belum mengubah atau menambangnya.
  useLanguageChange((lang, from) => {
    if (!running && block.nonce === 0 && block.data === sampleRecord(from)) patch({ data: sampleRecord(lang) })
  })

  /** Mencoba satu nonce dengan tangan. Berhenti mengulang begitu menemukan hash yang sah. */
  const stepNonce = (delta) => {
    const nonce = Math.max(0, blockRef.current.nonce + delta)
    patch({ nonce })
    const found = meetsDifficulty(blockHash({ ...blockRef.current, prev: ZERO_HASH }), difficulty)
    if (found && difficulty >= 2) completeMission('block-hand')
    return !found
  }

  const mine = async () => {
    const result = await run({ prefix: blockPrefix(full), difficulty, workers })
    if (!result) return
    patch({ nonce: result.nonce })
    setHistory((rows) => [{ id: rows.length + 1, difficulty, workers, attempts: result.attempts, ms: result.ms }, ...rows].slice(0, 8))
    if (difficulty >= 5) completeMission('block-hard')
    if (workers >= 2) completeMission('block-power')
  }

  const histogram = progress?.histogram?.length === difficulty + 1 ? progress.histogram : new Array(difficulty + 1).fill(0)

  return (
    <>
      <ChapterHead no={2} title={t('block.title')} chapter="block">
        <p>{rich(t('block.lede'))}</p>
      </ChapterHead>

      <div className="block-lab">
        <div className="block-column">
          <article className={`sheet block block-large ${valid ? 'is-ok' : 'is-bad'}`}>
            <header className="block-head">
              <label className="block-no-edit">
                <span>{t('block.word')}</span>
                <input
                  type="number"
                  min={1}
                  value={block.number}
                  disabled={running}
                  aria-label={t('block.numberField')}
                  onChange={(event) => patch({ number: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                />
              </label>
              <Stamp ok={valid} />
            </header>
            <label className="field">
              <span className="field-label">{t('blockcard.data')}</span>
              <textarea rows={3} value={block.data} disabled={running} spellCheck={false} onChange={(event) => patch({ data: event.target.value })} />
            </label>
            <div className="field">
              <label className="field-label" htmlFor="nonce-input">{t('block.nonceHand')}</label>
              <div className="nonce-control">
                <HoldButton className="btn btn-ghost nonce-step" aria-label={t('block.decrease')} disabled={running} onStep={() => stepNonce(-1)}>−</HoldButton>
                <input
                  id="nonce-input"
                  type="number"
                  min={0}
                  value={block.nonce}
                  disabled={running}
                  onChange={(event) => patch({ nonce: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                />
                <HoldButton className="btn btn-ghost nonce-step" aria-label={t('block.increase')} disabled={running} onStep={() => stepNonce(1)}>+</HoldButton>
              </div>
            </div>
            <div className="field">
              <span className="field-label">{t('block.hash')}</span>
              <HashText value={hash} difficulty={difficulty} className={`hash-large ${valid ? '' : 'hash-bad'}`} />
            </div>
          </article>

          <section className="sheet panel preimage">
            <h3>{t('block.preimage')}</h3>
            <p className="preimage-text">
              <span className="part-number">{block.number}</span>|<span className="part-prev">{ZERO_HASH.slice(0, 12)}…</span>|<span className="part-data">{block.data || ' '}</span>|<span className="part-nonce">{block.nonce}</span>
            </p>
            <ul className="legend" aria-label={t('block.parts')}>
              <li><span className="swatch part-number" /> {t('block.partNumber')}</li>
              <li><span className="swatch part-prev" /> {t('block.partPrev')}</li>
              <li><span className="swatch part-data" /> {t('block.partData')}</li>
              <li><span className="swatch part-nonce" /> {t('block.partNonce')}</li>
            </ul>
          </section>
        </div>

        <section className="sheet panel mine-panel">
          <div className="control-grid">
            <Slider
              id="block-difficulty"
              label={t('common.difficulty')}
              value={difficulty}
              min={1}
              max={6}
              disabled={running}
              onChange={setDifficulty}
              display={t('block.difficultyValue', { n: difficulty, odds: count(16 ** difficulty) })}
            />
            <Slider
              id="block-workers"
              label={t('block.workers')}
              value={workers}
              min={1}
              max={MAX_WORKERS}
              disabled={running}
              onChange={setWorkers}
              display={t('block.workersValue', { n: workers, max: MAX_WORKERS })}
            />
          </div>

          <div className="button-row">
            {running ? (
              <button type="button" className="btn btn-danger btn-wide" onClick={cancel}>{t('common.stop')}</button>
            ) : (
              <button type="button" className="btn btn-primary btn-wide" onClick={mine}>{valid ? t('block.mineAgain') : t('block.mineAuto')}</button>
            )}
          </div>

          <MiningStats progress={progress} difficulty={difficulty} workers={workers} />
          <LiveHash progress={progress} difficulty={difficulty} />

          <div>
            <h3 className="sub-head">{t('block.ladder')}</h3>
            <p className="muted small">{t('block.ladderHint')}</p>
            <RarityLadder histogram={histogram} difficulty={difficulty} />
          </div>

          {history.length > 0 && (
            <div className="table-wrap">
              <h3 className="sub-head">{t('block.log')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('common.difficulty')}</th>
                    <th scope="col">{t('block.logWorkers')}</th>
                    <th scope="col" className="num">{t('block.logAttempts')}</th>
                    <th scope="col" className="num">{t('block.logTime')}</th>
                    <th scope="col" className="num">{t('block.logSpeed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{row.difficulty}</td>
                      <td>{row.workers}</td>
                      <td className="num">{count(row.attempts)}</td>
                      <td className="num">{duration(row.ms)}</td>
                      <td className="num">{rate((row.attempts / row.ms) * 1000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">{t('block.logHint')}</p>
            </div>
          )}
        </section>
      </div>

      <NextChapter to="chain">{t('block.next')}</NextChapter>
    </>
  )
}
