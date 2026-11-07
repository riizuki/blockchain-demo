import { useMemo, useRef, useState } from 'react'
import { ChapterHead, HashText, NextChapter, Stamp } from '../components/ui.jsx'
import { rich, useT } from '../i18n/index.js'
import { blockPrefix, mineSync } from '../lib/chain.js'
import { ZERO_HASH } from '../lib/crypto.js'
import { count, short } from '../lib/format.js'
import { PEOPLE, REWARD, deriveLedger, ledgerData, signTx, sortMempool } from '../lib/ledger.js'
import { MAX_WORKERS } from '../lib/miner.js'
import { completeMission } from '../lib/store.js'
import { useMiner } from '../lib/useMiner.js'

const DIFFICULTY = 3
const WORKERS = Math.min(2, MAX_WORKERS)
const seriesVar = (id) => `var(--s${PEOPLE.findIndex((p) => p.id === id) + 1})`

function seedBlocks() {
  const raw = [
    { number: 1, coinbase: { to: 'najwa', amount: REWARD }, txs: [] },
    { number: 2, coinbase: { to: 'budi', amount: REWARD }, txs: [signTx({ from: 'najwa', to: 'citra', amount: 15, seq: 0 }, 'najwa')] },
    {
      number: 3,
      coinbase: { to: 'citra', amount: REWARD },
      txs: [signTx({ from: 'budi', to: 'deni', amount: 20, seq: 0 }, 'budi'), signTx({ from: 'citra', to: 'najwa', amount: 5, seq: 0 }, 'citra')],
    },
  ]
  let prev = ZERO_HASH
  return raw.map((block) => {
    const { nonce, hash } = mineSync({ number: block.number, prev, data: ledgerData(block) }, DIFFICULTY)
    prev = hash
    return { ...block, nonce }
  })
}

function PersonTag({ id }) {
  const t = useT()
  return (
    <span className="person">
      <span className="person-dot" style={{ background: seriesVar(id) }} aria-hidden="true" />
      {t(`name.${id}`)}
    </span>
  )
}

function statusOf(block) {
  if (!block.mined) return { ok: false, key: 'stamp.broken' }
  if (!block.rulesOk) return { ok: false, key: 'stamp.invalid' }
  return { ok: true, key: 'stamp.valid' }
}

function LedgerBlock({ block, index, busy, onAmount, onCoinbase, onNonce, onMine, onReplay, mining }) {
  const t = useT()
  const status = statusOf(block)
  return (
    <article className={`sheet block ledger-block ${status.ok ? 'is-ok' : 'is-bad'} ${mining ? 'is-mining' : ''}`}>
      <header className="block-head">
        <span className="block-no">{t('blockcard.number', { n: block.number })}</span>
        <Stamp ok={status.ok} badText={t(status.key)} />
      </header>

      <div className="tx-list">
        <div className={`tx tx-coinbase ${block.coinbaseIssue ? 'tx-bad' : ''}`}>
          <div className="tx-main">
            <span className="tx-kind">{t('tx.reward')}</span>
            <span aria-hidden="true">→</span>
            <PersonTag id={block.coinbase.to} />
            <input
              type="number"
              aria-label={t('tx.rewardLabel', { number: block.number })}
              value={block.coinbase.amount}
              disabled={busy}
              onChange={(event) => onCoinbase(index, Number(event.target.value))}
            />
          </div>
          {block.coinbaseIssue && <p className="tx-issue">{t(`tx.issue.${block.coinbaseIssue}`, { reward: REWARD })}</p>}
        </div>

        {block.txs.map((tx, txIndex) => (
          <div className={`tx ${tx.issue ? 'tx-bad' : ''}`} key={`${tx.sig}-${txIndex}`}>
            <div className="tx-main">
              <PersonTag id={tx.from} />
              <span aria-hidden="true">→</span>
              <PersonTag id={tx.to} />
              <input
                type="number"
                aria-label={t('tx.amountLabel', { from: t(`name.${tx.from}`), to: t(`name.${tx.to}`) })}
                value={tx.amount}
                disabled={busy}
                onChange={(event) => onAmount(index, txIndex, Number(event.target.value))}
              />
            </div>
            <div className="tx-meta">
              <span className="mono-small" title={tx.sig}>{t('tx.sigMeta', { sig: short(tx.sig), seq: tx.seq })}</span>
              <button type="button" className="link-button" onClick={() => onReplay(tx)}>{t('tx.replay')}</button>
            </div>
            {tx.issue && <p className="tx-issue">{t(`tx.issue.${tx.issue}`)}</p>}
          </div>
        ))}
        {block.txs.length === 0 && <p className="muted small">{t('tx.noTx')}</p>}
      </div>

      <label className="field field-row">
        <span className="field-label">{t('blockcard.nonce')}</span>
        <input type="number" min={0} value={block.nonce} disabled={busy} onChange={(event) => onNonce(index, Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
      </label>
      <div className="field">
        <span className="field-label">{t('tx.blockHash')}</span>
        <HashText value={block.hash} difficulty={DIFFICULTY} className={block.mined ? '' : 'hash-bad'} />
      </div>
      <button type="button" className={`btn ${block.mined ? 'btn-ghost' : 'btn-primary'} block-action`} disabled={busy} onClick={() => onMine(index)}>
        {mining ? t('common.mining') : t('tx.remine')}
      </button>
    </article>
  )
}

export default function LedgerPage() {
  const t = useT()
  const [blocks, setBlocks] = useState(seedBlocks)
  const [mempool, setMempool] = useState([])
  const [from, setFrom] = useState('najwa')
  const [to, setTo] = useState('budi')
  const [amount, setAmount] = useState(10)
  const [signer, setSigner] = useState('auto')
  const [miner, setMiner] = useState('deni')
  const [cheat, setCheat] = useState(false)
  const [miningIndex, setMiningIndex] = useState(null)
  const [notice, setNotice] = useState(null)
  const { running, run } = useMiner()
  const nextId = useRef(1)
  const scroller = useRef(null)

  const ledger = useMemo(() => deriveLedger(blocks, DIFFICULTY), [blocks])
  const pool = useMemo(() => sortMempool(mempool.map((entry) => entry.tx), ledger.state), [mempool, ledger.state])

  const firstInvalid = ledger.blocks.find((b) => !b.valid)
  const balances = ledger.state.balance
  const maxBalance = Math.max(1, ...Object.values(balances))
  const supply = Object.values(balances).reduce((sum, value) => sum + value, 0)

  /** Menambahkan transaksi ke mempool lalu menandai misi sesuai alasan penolakannya. */
  const enqueue = (tx) => {
    const next = [...mempool, { id: nextId.current++, tx }]
    setMempool(next)
    const issue = sortMempool(next.map((entry) => entry.tx), ledger.state).issues.at(-1)
    if (issue === 'insufficient') completeMission('tx-overspend')
    if (issue === 'badSignature') completeMission('tx-forge')
    if (issue === 'seqUsed') completeMission('tx-replay')
    return issue
  }

  const compose = (event) => {
    event.preventDefault()
    const pending = mempool.filter((entry) => entry.tx.from === from).length
    const seq = (ledger.state.seq[from] ?? 0) + pending
    enqueue(signTx({ from, to, amount: Number(amount), seq }, signer === 'auto' ? from : signer))
  }

  const replay = (tx) => {
    const { issue, ...clean } = tx
    enqueue(clean)
  }

  const editAmount = (blockIndex, txIndex, value) => {
    setBlocks((all) =>
      all.map((b, i) => (i === blockIndex ? { ...b, txs: b.txs.map((tx, t) => (t === txIndex ? { ...tx, amount: value } : tx)) } : b)),
    )
    completeMission('tx-tamper')
  }

  const editCoinbase = (blockIndex, value) => {
    setBlocks((all) => all.map((b, i) => (i === blockIndex ? { ...b, coinbase: { ...b.coinbase, amount: value } } : b)))
  }

  const editNonce = (blockIndex, value) => {
    setBlocks((all) => all.map((b, i) => (i === blockIndex ? { ...b, nonce: value } : b)))
  }

  const remine = async (index) => {
    setMiningIndex(index)
    let working = blocks
    for (let i = index; i < working.length; i++) {
      const current = deriveLedger(working, DIFFICULTY).blocks[i]
      if (current.mined) continue
      const result = await run({ prefix: blockPrefix(current), difficulty: DIFFICULTY, workers: WORKERS })
      if (!result) break
      working = working.map((b, n) => (n === i ? { ...b, nonce: result.nonce } : b))
      setBlocks(working)
    }
    setMiningIndex(null)
  }

  const mineNext = async () => {
    const tip = ledger.blocks.at(-1)
    const txs = cheat ? mempool.map((entry) => entry.tx) : pool.accepted
    const raw = { number: tip.number + 1, nonce: 0, coinbase: { to: miner, amount: REWARD }, txs }
    setMiningIndex(blocks.length)
    const result = await run({ prefix: blockPrefix({ number: raw.number, prev: tip.hash, data: ledgerData(raw) }), difficulty: DIFFICULTY, workers: WORKERS })
    setMiningIndex(null)
    if (!result) return
    setBlocks([...blocks, { ...raw, nonce: result.nonce }])
    if (cheat) {
      setMempool([])
      setNotice(pool.rejected.length ? { key: 'tx.noticeCheat', n: pool.rejected.length } : null)
    } else {
      setMempool((entries) => entries.filter((_, index) => pool.issues[index]))
      setNotice(pool.rejected.length ? { key: 'tx.noticeRejected', n: pool.rejected.length } : null)
    }
    requestAnimationFrame(() => scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'smooth' }))
  }

  const reset = () => {
    setBlocks(seedBlocks())
    setMempool([])
    setNotice(null)
    setCheat(false)
  }

  const expectedSeq = (ledger.state.seq[from] ?? 0) + mempool.filter((entry) => entry.tx.from === from).length

  return (
    <>
      <ChapterHead no={6} title={t('tx.title')} chapter="transactions">
        <p>{rich(t('tx.lede'))}</p>
      </ChapterHead>

      <div className="ledger-top">
        <section className="sheet panel">
          <h3>{t('tx.composeTitle')}</h3>
          <form className="compose" onSubmit={compose}>
            <label className="field">
              <span className="field-label">{t('tx.from')}</span>
              <select value={from} onChange={(event) => setFrom(event.target.value)}>
                {PEOPLE.map((p) => <option key={p.id} value={p.id}>{t('tx.balanceOption', { name: t(`name.${p.id}`), count: balances[p.id] })}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('tx.to')}</span>
              <select value={to} onChange={(event) => setTo(event.target.value)}>
                {PEOPLE.map((p) => <option key={p.id} value={p.id}>{t(`name.${p.id}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('tx.amount')}</span>
              <input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t('tx.signedWith')}</span>
              <select value={signer} onChange={(event) => setSigner(event.target.value)}>
                <option value="auto">{t('tx.senderKey')}</option>
                {PEOPLE.filter((p) => p.id !== from).map((p) => <option key={p.id} value={p.id}>{t('tx.forgedKey', { name: t(`name.${p.id}`) })}</option>)}
              </select>
            </label>
            <div className="compose-submit">
              <span className="muted small">{t('tx.seq', { name: t(`name.${from}`), seq: expectedSeq })}</span>
              <button type="submit" className="btn btn-primary" disabled={from === to || !(Number(amount) > 0)}>{t('tx.submit')}</button>
            </div>
          </form>
        </section>

        <section className="sheet panel">
          <h3>{t('tx.mempoolTitle')}</h3>
          {mempool.length === 0 ? (
            <p className="muted small mempool-empty">{t('tx.mempoolEmpty')}</p>
          ) : (
            <ul className="mempool">
              {mempool.map((entry, index) => {
                const issue = pool.issues[index]
                return (
                  <li key={entry.id} className={issue ? 'tx-bad' : ''}>
                    <span className="tx-main">
                      <PersonTag id={entry.tx.from} />
                      <span aria-hidden="true">→</span>
                      <PersonTag id={entry.tx.to} />
                      <strong>{entry.tx.amount}</strong>
                    </span>
                    <span className={`mempool-status ${issue ? 'text-bad' : 'text-ok'}`}>{issue ? t(`tx.issue.${issue}`) : t('tx.passes')}</span>
                    <button type="button" className="link-button" aria-label={t('tx.removeLabel')} onClick={() => setMempool(mempool.filter((e) => e.id !== entry.id))}>{t('tx.remove')}</button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="miner-controls">
            <label className="field">
              <span className="field-label">{t('tx.miner')}</span>
              <select value={miner} onChange={(event) => setMiner(event.target.value)}>
                {PEOPLE.map((p) => <option key={p.id} value={p.id}>{t(`name.${p.id}`)}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={cheat} onChange={(event) => setCheat(event.target.checked)} />
              {t('tx.cheat')}
            </label>
            <button type="button" className="btn btn-primary" disabled={running} onClick={mineNext}>
              {running && miningIndex === blocks.length ? t('common.mining') : t('tx.mineNext', { number: ledger.blocks.at(-1).number + 1, reward: REWARD })}
            </button>
          </div>
          {notice && <p className="callout">{t(notice.key, { n: notice.n })}</p>}
        </section>

        <section className="sheet panel">
          <div className="panel-head">
            <h3>{t('tx.balancesTitle')}</h3>
            <button type="button" className="btn btn-ghost btn-small" onClick={reset} disabled={running}>{t('common.reset')}</button>
          </div>
          <ul className="balances">
            {PEOPLE.map((person) => (
              <li key={person.id} title={t('tx.balanceTitle', { name: t(`name.${person.id}`), count: count(balances[person.id]) })}>
                <PersonTag id={person.id} />
                <span className="balance-track">
                  <span className="balance-bar" style={{ width: `${(Math.max(0, balances[person.id]) / maxBalance) * 100}%`, background: seriesVar(person.id) }} />
                </span>
                <span className="balance-value">{count(balances[person.id])}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('tx.supply', { count: count(supply), n: ledger.blocks.length })}</p>
          {firstInvalid ? (
            <p className="callout callout-bad">{t(firstInvalid.mined ? 'tx.invalidRules' : 'tx.invalidBroken', { number: firstInvalid.number })}</p>
          ) : (
            <p className="callout callout-ok">{t('tx.allValid')}</p>
          )}
        </section>
      </div>

      <div className="chain-scroller" ref={scroller} tabIndex={0} aria-label={t('tx.scroller')}>
        {ledger.blocks.map((block, index) => (
          <div className="chain-item" key={block.number}>
            <LedgerBlock
              block={block}
              index={index}
              busy={running}
              mining={miningIndex === index}
              onAmount={editAmount}
              onCoinbase={editCoinbase}
              onNonce={editNonce}
              onMine={remine}
              onReplay={replay}
            />
            {index < ledger.blocks.length - 1 && (
              <div className={`chain-link ${block.valid ? '' : 'chain-link-broken'}`} aria-hidden="true">
                <svg viewBox="0 0 56 28">
                  <rect className="link-left" x="4" y="7" width="28" height="14" rx="7" />
                  <rect className="link-right" x="24" y="7" width="28" height="14" rx="7" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="sheet panel table-wrap">
        <h3>{t('tx.historyTitle')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('tx.person')}</th>
              {ledger.blocks.map((block) => <th key={block.number} scope="col" className="num">{t('blockcard.number', { n: block.number })}</th>)}
            </tr>
          </thead>
          <tbody>
            {PEOPLE.map((person) => (
              <tr key={person.id}>
                <th scope="row"><PersonTag id={person.id} /></th>
                {ledger.blocks.map((block, index) => {
                  const value = block.balances[person.id]
                  const previous = index ? ledger.blocks[index - 1].balances[person.id] : 0
                  return <td key={block.number} className={`num ${value !== previous ? 'cell-changed' : ''}`}>{count(value)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <NextChapter to="lab">{t('tx.next')}</NextChapter>
    </>
  )
}
