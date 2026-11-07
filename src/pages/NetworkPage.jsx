import { useMemo, useRef, useState } from 'react'
import { BlockCard } from '../components/BlockCard.jsx'
import { ChapterHead, NextChapter, Stamp, Steps } from '../components/ui.jsx'
import { getLang, rich, useLanguageChange, useT } from '../i18n/index.js'
import { blockPrefix, deriveChain, evaluateIncoming } from '../lib/chain.js'
import { hashHue } from '../lib/crypto.js'
import { list, tag } from '../lib/format.js'
import { MAX_WORKERS } from '../lib/miner.js'
import { SEED_DIFFICULTY, sameBlocks, seedChain } from '../lib/seeds.js'
import { completeMission } from '../lib/store.js'
import { useMiner } from '../lib/useMiner.js'

const DIFFICULTY = SEED_DIFFICULTY
const WORKERS = Math.min(4, MAX_WORKERS)
const HOP_MS = 720
const LETTERS = 'ABCDEF'
const MAP = { width: 440, height: 330, cx: 220, cy: 160, rx: 158, ry: 112 }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const edgeKey = (a, b) => [a, b].sort().join('-')

function ringEdges(ids) {
  return ids.map((id, index) => [id, ids[(index + 1) % ids.length]])
}

function nodePosition(index, total) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  return { x: MAP.cx + MAP.rx * Math.cos(angle), y: MAP.cy + MAP.ry * Math.sin(angle) }
}

function neighbours(ids, cuts, id) {
  return ringEdges(ids)
    .filter(([a, b]) => (a === id || b === id) && !cuts.has(edgeKey(a, b)))
    .map(([a, b]) => (a === id ? b : a))
    .filter((other, index, all) => all.indexOf(other) === index)
}

function isConnected(ids, cuts) {
  const seen = new Set([ids[0]])
  const queue = [ids[0]]
  while (queue.length) {
    for (const next of neighbours(ids, cuts, queue.pop())) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen.size === ids.length
}

const initialPeers = (lang) => ['A', 'B', 'C', 'D'].map((id) => ({ id, blocks: seedChain(lang) }))

/** Menerjemahkan vonis atau catatan yang menyimpan kode alasan penolakan. */
const describe = (t, key, params) =>
  t(key, params?.reason ? { ...params, reason: t(`net.reason.${params.reason}`, params) } : params)

function NetworkMap({ peers, derived, cuts, selected, packets, verdicts, onSelect, onToggleEdge }) {
  const t = useT()
  const ids = peers.map((p) => p.id)
  const positions = Object.fromEntries(ids.map((id, index) => [id, nodePosition(index, ids.length)]))
  return (
    <div className="net-map">
      <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="group" aria-label={t('net.mapLabel')}>
        {ringEdges(ids).map(([a, b]) => {
          const key = edgeKey(a, b)
          const cut = cuts.has(key)
          const p = positions[a]
          const q = positions[b]
          const toggle = () => onToggleEdge(key)
          return (
            <g
              key={key}
              className={`net-edge ${cut ? 'net-edge-cut' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={cut}
              aria-label={t(cut ? 'net.edgeHeal' : 'net.edgeCut', { a, b })}
              onClick={toggle}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggle()
                }
              }}
            >
              <line className="net-edge-hit" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
              <line className="net-edge-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
              <g transform={`translate(${(p.x + q.x) / 2} ${(p.y + q.y) / 2})`}>
                <circle className="net-edge-dot" r="9" />
                <path className="net-edge-mark" d={cut ? 'M-3.5 -3.5 3.5 3.5M3.5 -3.5 -3.5 3.5' : 'M-3.5 0H3.5'} />
              </g>
            </g>
          )
        })}

        {packets.map((packet) => {
          const from = positions[packet.from]
          const to = positions[packet.to]
          if (!from || !to) return null
          return (
            <circle
              key={packet.id}
              className="packet"
              r="7"
              style={{
                '--x1': `${from.x}px`,
                '--y1': `${from.y}px`,
                '--x2': `${to.x}px`,
                '--y2': `${to.y}px`,
                '--dur': `${HOP_MS}ms`,
                '--h': packet.hue,
              }}
            />
          )
        })}

        {peers.map((peer) => {
          const chain = derived[peer.id]
          const tip = chain[chain.length - 1]
          const valid = chain.every((b) => b.valid)
          const position = positions[peer.id]
          return (
            <g
              key={peer.id}
              className={`net-node ${selected === peer.id ? 'net-node-selected' : ''} ${valid ? '' : 'net-node-bad'}`}
              transform={`translate(${position.x} ${position.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected === peer.id}
              aria-label={t('net.nodeLabel', { id: peer.id, n: chain.length, state: t(valid ? 'net.stateValid' : 'net.stateBroken') })}
              onClick={() => onSelect(peer.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(peer.id)
                }
              }}
            >
              <circle className="net-node-ring" r="35" />
              <circle className="net-node-body" r="28" style={{ '--h': tip ? hashHue(tip.hash) : 0 }} />
              <text className="net-node-letter" y="-1" textAnchor="middle" dominantBaseline="middle">{peer.id}</text>
              <text className="net-node-tag" y="13" textAnchor="middle" dominantBaseline="middle">{tip ? tag(tip.hash) : ''}</text>
            </g>
          )
        })}
      </svg>
      {peers.map((peer) => {
        const verdict = verdicts[peer.id]
        if (!verdict) return null
        const position = positions[peer.id]
        return (
          <span
            key={verdict.key}
            className={`verdict ${verdict.ok ? 'verdict-ok' : 'verdict-bad'}`}
            style={{ left: `${(position.x / MAP.width) * 100}%`, top: `${((position.y + 30) / MAP.height) * 100}%` }}
          >
            {describe(t, verdict.messageKey, verdict.params)}
          </span>
        )
      })}
    </div>
  )
}

function LedgerMatrix({ peers, derived, selection, onPick, majority }) {
  const t = useT()
  const columns = Math.max(...peers.map((p) => p.blocks.length))
  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <caption className="sr-only">{t('net.matrixCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('net.peer')}</th>
            {Array.from({ length: columns }, (_, index) => (
              <th scope="col" key={index}>{t('blockcard.number', { n: index + 1 })}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {peers.map((peer) => (
            <tr key={peer.id} className={selection.peer === peer.id ? 'matrix-selected' : ''}>
              <th scope="row">{peer.id}</th>
              {Array.from({ length: columns }, (_, index) => {
                const block = derived[peer.id][index]
                if (!block) return <td key={index} className="matrix-empty">–</td>
                const differs = majority[index] && majority[index] !== block.hash
                const picked = selection.peer === peer.id && selection.index === index
                return (
                  <td key={index}>
                    <button
                      type="button"
                      className={`chip ${block.valid ? '' : 'chip-bad'} ${differs ? 'chip-diff' : ''} ${picked ? 'chip-picked' : ''}`}
                      style={{ '--h': hashHue(block.hash) }}
                      aria-label={t('net.cellLabel', { id: peer.id, number: block.number, state: t(block.valid ? 'net.stateValid' : 'net.stateBroken') }) + (differs ? t('net.cellDiffers') : '')}
                      title={block.hash}
                      onClick={() => onPick(peer.id, index)}
                    >
                      {tag(block.hash)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function NetworkPage() {
  const t = useT()
  const [peers, setPeers] = useState(() => initialPeers(getLang()))
  const [cuts, setCuts] = useState(() => new Set())
  const [selection, setSelection] = useState({ peer: 'B', index: 1 })
  const [packets, setPackets] = useState([])
  const [verdicts, setVerdicts] = useState({})
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const { run, cancel } = useMiner()

  const peersRef = useRef(peers)
  const cutsRef = useRef(cuts)
  const partitioned = useRef(false)
  const counter = useRef(0)

  const setAllPeers = (next) => {
    peersRef.current = next
    setPeers(next)
  }
  const updatePeer = (id, blocks) => setAllPeers(peersRef.current.map((p) => (p.id === id ? { ...p, blocks } : p)))
  const uid = () => ++counter.current
  const addLog = (key, params, tone = '') => setLog((rows) => [{ id: uid(), key, params, tone }, ...rows].slice(0, 10))

  // Rantai contoh ikut berganti bahasa selama belum ada peer yang mengubahnya.
  useLanguageChange((lang, from) => {
    const sample = seedChain(from)
    if (!busy && peersRef.current.every((peer) => sameBlocks(peer.blocks, sample))) {
      setAllPeers(peersRef.current.map((peer) => ({ ...peer, blocks: seedChain(lang) })))
    }
  })

  const derived = useMemo(() => Object.fromEntries(peers.map((p) => [p.id, deriveChain(p.blocks, DIFFICULTY)])), [peers])

  const majority = useMemo(() => {
    const columns = Math.max(...peers.map((p) => p.blocks.length))
    return Array.from({ length: columns }, (_, index) => {
      const votes = new Map()
      for (const peer of peers) {
        const block = derived[peer.id][index]
        if (block) votes.set(block.hash, (votes.get(block.hash) ?? 0) + 1)
      }
      let top = null
      let best = 0
      let tied = false
      for (const [hash, total] of votes) {
        if (total > best) {
          top = hash
          best = total
          tied = false
        } else if (total === best) tied = true
      }
      return tied ? null : top
    })
  }, [peers, derived])

  const consensus = useMemo(() => {
    const groups = new Map()
    for (const peer of peers) {
      const tip = derived[peer.id].at(-1)
      const key = tip?.hash ?? ''
      groups.set(key, [...(groups.get(key) ?? []), peer.id])
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [peers, derived])

  const selectedPeer = peers.find((p) => p.id === selection.peer) ?? peers[0]
  const selectedChain = derived[selectedPeer.id]
  const selectedIndex = Math.min(selection.index, selectedChain.length - 1)
  const selectedBlock = selectedChain[selectedIndex]
  const brokenCount = selectedChain.filter((b) => !b.valid).length

  const editBlock = (changes) => {
    const blocks = selectedPeer.blocks.map((b, index) => (index === selectedIndex ? { ...b, ...changes } : b))
    updatePeer(selectedPeer.id, blocks)
  }

  const mineFrom = async (peerId, start, source) => {
    let working = source
    for (let i = start; i < working.length; i++) {
      const chain = deriveChain(working, DIFFICULTY)
      if (chain[i].valid) continue
      const result = await run({ prefix: blockPrefix(chain[i]), difficulty: DIFFICULTY, workers: WORKERS })
      if (!result) return false
      working = working.map((b, index) => (index === i ? { ...b, nonce: result.nonce } : b))
      updatePeer(peerId, working)
    }
    return true
  }

  const withBusy = async (task) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const remine = () =>
    withBusy(async () => {
      const ok = await mineFrom(selectedPeer.id, 0, selectedPeer.blocks)
      if (ok) addLog('net.log.remined', { id: selectedPeer.id })
    })

  const mineSingle = () =>
    withBusy(async () => {
      const result = await run({ prefix: blockPrefix(selectedBlock), difficulty: DIFFICULTY, workers: WORKERS })
      if (result) editBlock({ nonce: result.nonce })
    })

  const appendBlock = (event) => {
    event.preventDefault()
    const data = draft.trim() || t('net.defaultRecord', { id: selectedPeer.id })
    const number = (selectedPeer.blocks.at(-1)?.number ?? 0) + 1
    const blocks = [...selectedPeer.blocks, { number, nonce: 0, data }]
    setDraft('')
    updatePeer(selectedPeer.id, blocks)
    setSelection({ peer: selectedPeer.id, index: blocks.length - 1 })
    withBusy(async () => {
      const ok = await mineFrom(selectedPeer.id, blocks.length - 1, blocks)
      if (ok) addLog('net.log.mined', { id: selectedPeer.id, number })
    })
  }

  const showVerdict = (id, messageKey, params, ok) => {
    const key = uid()
    setVerdicts((current) => ({ ...current, [id]: { key, messageKey, params, ok } }))
    setTimeout(() => {
      setVerdicts((current) => (current[id]?.key === key ? { ...current, [id]: undefined } : current))
    }, 3200)
  }

  /** Menerapkan aturan peer pada rantai yang diterima, lalu mencatat hasilnya. */
  const deliver = (receiverId, incoming, senderId) => {
    const receiver = peersRef.current.find((p) => p.id === receiverId)
    if (!receiver) return false
    const verdict = evaluateIncoming(receiver.blocks, incoming, DIFFICULTY)
    if (verdict.accept) {
      updatePeer(receiverId, incoming.map((b) => ({ ...b })))
      showVerdict(receiverId, 'net.verdict.accepted', null, true)
      addLog('net.log.accepted', { to: receiverId, from: senderId, reason: verdict.kind }, 'ok')
      if (verdict.fork) {
        completeMission('net-takeover')
        if (partitioned.current && isConnected(peersRef.current.map((p) => p.id), cutsRef.current)) {
          completeMission('net-split')
        }
      }
      return true
    }
    if (verdict.kind === 'same') {
      showVerdict(receiverId, 'net.verdict.same', null, true)
      return false
    }
    showVerdict(receiverId, 'net.verdict.rejected', { reason: verdict.kind, number: verdict.number }, false)
    addLog('net.log.rejected', { to: receiverId, from: senderId, reason: verdict.kind, number: verdict.number }, 'bad')
    if (verdict.kind === 'shorter') completeMission('net-reject')
    return false
  }

  /** Gosip: tiap peer yang menerima rantai meneruskannya ke tetangga, gelombang demi gelombang. */
  const broadcast = () =>
    withBusy(async () => {
      const origin = selectedPeer.id
      const chain = peersRef.current.find((p) => p.id === origin).blocks.map((b) => ({ ...b }))
      const hue = hashHue(deriveChain(chain, DIFFICULTY).at(-1).hash)
      const ids = () => peersRef.current.map((p) => p.id)
      const seen = new Set([origin])
      let frontier = [origin]
      addLog('net.log.broadcast', { id: origin })
      if (neighbours(ids(), cutsRef.current, origin).length === 0) {
        addLog('net.log.isolated', { id: origin }, 'bad')
        return
      }
      while (frontier.length) {
        const sends = []
        for (const from of frontier) {
          for (const to of neighbours(ids(), cutsRef.current, from)) {
            if (!seen.has(to)) {
              seen.add(to)
              sends.push({ id: uid(), from, to, hue })
            }
          }
        }
        if (!sends.length) break
        setPackets(sends)
        await sleep(HOP_MS)
        setPackets([])
        frontier = sends.filter((send) => deliver(send.to, chain, send.from)).map((send) => send.to)
        await sleep(140)
      }
    })

  /** Peer meminta rantai tetangganya; jalan keluar bagi peer yang rantainya rusak. */
  const pull = () =>
    withBusy(async () => {
      const me = selectedPeer.id
      const others = neighbours(peersRef.current.map((p) => p.id), cutsRef.current, me)
      if (!others.length) {
        addLog('net.log.isolated', { id: me }, 'bad')
        return
      }
      const sends = others.map((from) => ({
        id: uid(),
        from,
        to: me,
        hue: hashHue(deriveChain(peersRef.current.find((p) => p.id === from).blocks, DIFFICULTY).at(-1).hash),
      }))
      setPackets(sends)
      await sleep(HOP_MS)
      setPackets([])
      for (const send of sends) {
        deliver(me, peersRef.current.find((p) => p.id === send.from).blocks, send.from)
      }
    })

  const toggleEdge = (key) => {
    const next = new Set(cutsRef.current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    cutsRef.current = next
    setCuts(next)
    if (!isConnected(peersRef.current.map((p) => p.id), next)) partitioned.current = true
  }

  const addPeer = () => {
    const id = LETTERS[peers.length]
    const longest = [...peers].sort((a, b) => b.blocks.length - a.blocks.length)[0]
    setAllPeers([...peers, { id, blocks: longest.blocks.map((b) => ({ ...b })) }])
    addLog('net.log.joined', { id, from: longest.id })
  }

  const removePeer = () => {
    const removed = peers.at(-1)
    const next = peers.slice(0, -1)
    setAllPeers(next)
    cutsRef.current = new Set()
    setCuts(cutsRef.current)
    if (selection.peer === removed.id) setSelection({ peer: next[0].id, index: 0 })
    addLog('net.log.left', { id: removed.id })
  }

  const reset = () => {
    cancel()
    setAllPeers(initialPeers(t.lang))
    cutsRef.current = new Set()
    setCuts(cutsRef.current)
    partitioned.current = false
    setSelection({ peer: 'B', index: 1 })
    setVerdicts({})
    setLog([])
  }

  const [main, ...rest] = consensus
  const agree = consensus.length === 1

  return (
    <>
      <ChapterHead no={4} title={t('net.title')} chapter="network">
        <p>{rich(t('net.lede'))}</p>
      </ChapterHead>

      <div className="net-lab">
        <section className="sheet panel">
          <div className="panel-head">
            <h3>{t('net.mapTitle')}</h3>
            <div className="button-row">
              <button type="button" className="btn btn-ghost btn-small" onClick={addPeer} disabled={busy || peers.length >= LETTERS.length}>{t('net.addPeer')}</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={removePeer} disabled={busy || peers.length <= 3}>{t('net.removePeer')}</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={reset} disabled={busy}>{t('common.reset')}</button>
            </div>
          </div>
          <NetworkMap
            peers={peers}
            derived={derived}
            cuts={cuts}
            selected={selectedPeer.id}
            packets={packets}
            verdicts={verdicts}
            onSelect={(id) => setSelection({ peer: id, index: Math.min(selection.index, peersRef.current.find((p) => p.id === id).blocks.length - 1) })}
            onToggleEdge={toggleEdge}
          />
          <p className="muted small">{t('net.mapHint')}</p>
        </section>

        <section className="sheet panel">
          <div className="panel-head">
            <h3>{t('net.copiesTitle')}</h3>
            <span className={`consensus ${agree ? 'consensus-ok' : 'consensus-bad'}`}>
              {agree ? t('net.agree', { n: peers.length }) : t('net.versions', { n: consensus.length })}
            </span>
          </div>
          <LedgerMatrix peers={peers} derived={derived} selection={{ peer: selectedPeer.id, index: selectedIndex }} onPick={(peer, index) => setSelection({ peer, index })} majority={majority} />
          <ul className="legend" aria-label={t('net.legend')}>
            <li><span className="swatch chip-sample" /> {t('net.legendColor')}</li>
            <li><span className="swatch chip-sample chip-diff" /> {t('net.legendDiff')}</li>
            <li><span className="swatch chip-sample chip-bad" /> {t('net.legendBad')}</li>
          </ul>
          {!agree && (
            <p className="muted small consensus-detail">
              {t('net.majority', { peers: list(main[1]) })} {rest.map(([, group]) => t('net.different', { peers: list(group) })).join(' ')}
            </p>
          )}
          <div className="net-log" aria-live="polite">
            <h3 className="sub-head">{t('net.logTitle')}</h3>
            {log.length === 0 ? (
              <p className="muted small">{t('net.logEmpty')}</p>
            ) : (
              <ul>
                {log.map((row) => (
                  <li key={row.id} className={row.tone ? `log-${row.tone}` : ''}>{describe(t, row.key, row.params)}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="net-inspector">
        <div className="inspector-block">
          <h3 className="sub-head">{t('net.inspector', { id: selectedPeer.id, number: selectedBlock.number })}</h3>
          <BlockCard block={selectedBlock} difficulty={DIFFICULTY} onChange={editBlock} onMine={mineSingle} disabled={busy} mining={false} action={t('net.mineThis')} />
        </div>
        <section className="sheet panel inspector-actions">
          <div className="panel-head">
            <h3>{t('net.actions', { id: selectedPeer.id })}</h3>
            <Stamp ok={brokenCount === 0} okText={t('stamp.chainValid')} badText={t('stamp.brokenCount', { count: brokenCount })} />
          </div>
          <div className="button-column">
            <button type="button" className="btn btn-ghost" onClick={remine} disabled={busy || brokenCount === 0}>{t('net.remine')}</button>
            <button type="button" className="btn btn-primary" onClick={broadcast} disabled={busy}>{t('net.broadcast')}</button>
            <button type="button" className="btn btn-ghost" onClick={pull} disabled={busy}>{t('net.pull')}</button>
          </div>
          <form className="inline-form" onSubmit={appendBlock}>
            <label className="field">
              <span className="field-label">{t('net.newBlock', { id: selectedPeer.id })}</span>
              <input type="text" value={draft} disabled={busy} placeholder={t('chain.newPlaceholder')} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-ghost" disabled={busy || brokenCount > 0} title={brokenCount > 0 ? t('net.fixFirst') : undefined}>{t('net.mineNew')}</button>
          </form>
        </section>
        <Steps title={t('net.stepsTitle')} items={[t('net.step1'), t('net.step2'), t('net.step3'), t('net.step4')]} />
      </div>

      <NextChapter to="keys">{t('net.next')}</NextChapter>
    </>
  )
}
