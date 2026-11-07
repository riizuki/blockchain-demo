import { useEffect, useMemo, useRef, useState } from 'react'
import { BlockCard } from '../components/BlockCard.jsx'
import { ChapterHead, NextChapter, Slider, Stat, Steps } from '../components/ui.jsx'
import { getLang, rich, useLanguageChange, useT } from '../i18n/index.js'
import { blockPrefix, deriveChain } from '../lib/chain.js'
import { count, duration } from '../lib/format.js'
import { MAX_WORKERS } from '../lib/miner.js'
import { FAKE_DATA, sameBlocks, seedChain } from '../lib/seeds.js'
import { completeMission } from '../lib/store.js'
import { useMiner } from '../lib/useMiner.js'

const WORKERS = Math.min(4, MAX_WORKERS)

function ChainLink({ ok, lit }) {
  return (
    <div className={`chain-link ${ok ? '' : 'chain-link-broken'} ${lit ? 'chain-link-lit' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 56 28">
        <rect className="link-left" x="4" y="7" width="28" height="14" rx="7" />
        <rect className="link-right" x="24" y="7" width="28" height="14" rx="7" />
      </svg>
    </div>
  )
}

export default function ChainPage() {
  const t = useT()
  const [blocks, setBlocks] = useState(() => seedChain(getLang()))
  const [difficulty, setDifficulty] = useState(4)
  const [miningIndex, setMiningIndex] = useState(null)
  const [origin, setOrigin] = useState(0)
  const [cost, setCost] = useState(null)
  const [hoverLink, setHoverLink] = useState(null)
  const [draft, setDraft] = useState('')
  const { running, progress, run, cancel } = useMiner()
  const scroller = useRef(null)
  const stopRequested = useRef(false)
  const broken = useRef(false)

  const derived = useMemo(() => deriveChain(blocks, difficulty), [blocks, difficulty])
  const firstBroken = derived.findIndex((b) => !b.valid)
  const brokenCount = derived.filter((b) => !b.valid).length
  const allValid = firstBroken === -1

  useEffect(() => {
    if (!allValid) broken.current = true
    else if (broken.current) {
      broken.current = false
      completeMission('chain-fix')
    }
  }, [allValid])

  // Rantai contoh ikut berganti bahasa selama pengguna belum mengubahnya.
  useLanguageChange((lang, from) => {
    if (!running && sameBlocks(blocks, seedChain(from))) {
      setOrigin(0)
      setBlocks(seedChain(lang))
    }
  })

  const showBlock = (index) => {
    const node = scroller.current?.querySelectorAll('.block')[index]
    node?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const edit = (index, changes) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...changes } : b))
    setOrigin(index)
    setBlocks(next)
    const chain = deriveChain(next, difficulty)
    if (index < next.length - 1 && !chain[index + 1].valid && !chain[index].valid) completeMission('chain-break')
  }

  /** Menambang blok rusak berurutan. Blok berikutnya harus menunggu karena prev-nya baru diketahui. */
  const mineRange = async (start, end, source = blocks) => {
    stopRequested.current = false
    let working = source
    const tally = { attempts: 0, ms: 0, count: 0 }
    for (let i = start; i <= end; i++) {
      const chain = deriveChain(working, difficulty)
      if (chain[i].valid) continue
      setMiningIndex(i)
      showBlock(i)
      const result = await run({ prefix: blockPrefix(chain[i]), difficulty, workers: WORKERS })
      if (!result || stopRequested.current) break
      working = working.map((b, index) => (index === i ? { ...b, nonce: result.nonce } : b))
      setBlocks(working)
      tally.attempts += result.attempts
      tally.ms += result.ms
      tally.count++
    }
    setMiningIndex(null)
    return tally
  }

  const fixAll = async () => {
    if (allValid) return
    const tally = await mineRange(firstBroken, blocks.length - 1)
    if (tally.count) setCost(tally)
  }

  const addBlock = async (event) => {
    event.preventDefault()
    const last = blocks[blocks.length - 1]
    const number = (last?.number ?? 0) + 1
    const data = draft.trim() || t('chain.defaultRecord', { number })
    const next = [...blocks, { number, nonce: 0, data }]
    setDraft('')
    setOrigin(next.length - 1)
    setBlocks(next)
    const tally = await mineRange(next.length - 1, next.length - 1, next)
    if (tally.count) completeMission('chain-grow')
  }

  const tamperRandom = () => {
    const index = Math.floor(Math.random() * Math.max(1, blocks.length - 1))
    const options = FAKE_DATA[t.lang].filter((text) => text !== blocks[index].data)
    edit(index, { data: options[Math.floor(Math.random() * options.length)] })
    showBlock(index)
  }

  const stop = () => {
    stopRequested.current = true
    cancel()
  }

  const remaining = allValid ? blocks.length : brokenCount
  const estimate = remaining * 16 ** difficulty

  return (
    <>
      <ChapterHead no={3} title={t('chain.title')} chapter="chain">
        <p>{rich(t('chain.lede'))}</p>
      </ChapterHead>

      <div className="toolbar sheet">
        <div className="toolbar-slider">
          <Slider id="chain-difficulty" label={t('common.difficulty')} value={difficulty} min={1} max={5} disabled={running} onChange={(value) => { setOrigin(0); setDifficulty(value) }} display={t('common.zeros', { n: difficulty })} />
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-danger-ghost" disabled={running} onClick={tamperRandom}>{t('chain.tamper')}</button>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={stop}>{t('common.stop')}</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={allValid} onClick={fixAll}>
              {allValid ? t('chain.alreadyValid') : t('chain.remine', { n: brokenCount })}
            </button>
          )}
          <button type="button" className="btn btn-ghost" disabled={running} onClick={() => { setBlocks(seedChain(t.lang)); setDifficulty(4); setOrigin(0); setCost(null) }}>{t('common.reset')}</button>
        </div>
      </div>

      <div className="chain-scroller" ref={scroller} tabIndex={0} aria-label={t('chain.scroller')}>
        {derived.map((block, index) => (
          <div className="chain-item" key={block.number}>
            <BlockCard
              block={block}
              index={index}
              difficulty={difficulty}
              onChange={(changes) => edit(index, changes)}
              onMine={() => mineRange(index, index)}
              mining={miningIndex === index}
              disabled={running}
              delay={Math.max(0, index - origin) * 110}
              linkHover={hoverLink}
              onLinkHover={setHoverLink}
            />
            {index < derived.length - 1 && <ChainLink ok={block.valid} lit={hoverLink === index} />}
          </div>
        ))}
        <form className="chain-add" onSubmit={addBlock}>
          <label className="field">
            <span className="field-label">{t('chain.newBlock')}</span>
            <textarea rows={3} value={draft} placeholder={t('chain.newPlaceholder')} disabled={running} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-ghost" disabled={running}>{t('chain.addButton')}</button>
          {blocks.length > 2 && (
            <button type="button" className="link-button" disabled={running} onClick={() => { setOrigin(blocks.length - 1); setBlocks(blocks.slice(0, -1)) }}>
              {t('chain.removeLast')}
            </button>
          )}
        </form>
      </div>

      <div className="two-up">
        <section className="sheet panel">
          <h3>{t('chain.costTitle')}</h3>
          <p className="muted">
            {allValid
              ? t('chain.costValid', { n: blocks.length })
              : t('chain.costBroken', { number: derived[firstBroken].number, n: brokenCount })}
          </p>
          <div className="stats">
            <Stat label={t('chain.statBlocks')} value={count(remaining)} hint={t('chain.statInOrder')} />
            <Stat label={t('chain.statEstimate')} value={count(estimate)} hint={`${remaining} × 16^${difficulty}`} />
            <Stat
              label={running ? t('chain.statAttemptsNow') : t('chain.statLast')}
              value={running ? count(progress?.attempts ?? 0) : cost ? duration(cost.ms) : '–'}
              hint={running ? t('chain.statBlock', { number: derived[miningIndex ?? 0]?.number ?? '' }) : cost ? t('chain.statAttempts', { count: count(cost.attempts) }) : t('chain.statNone')}
            />
          </div>
        </section>
        <Steps items={[t('chain.step1'), t('chain.step2'), t('chain.step3')]} />
      </div>

      <NextChapter to="network">{t('chain.next')}</NextChapter>
    </>
  )
}
