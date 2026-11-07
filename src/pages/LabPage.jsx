import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ChapterHead, Slider, Stat } from '../components/ui.jsx'
import { rich, useT } from '../i18n/index.js'
import { count, decimal, percent, short } from '../lib/format.js'
import { GIVE_UP_GAP, STEP, Simulation, attackSuccessProbability } from '../lib/sim.js'
import { completeMission } from '../lib/store.js'

const STEP_X = 62
const LANE_Y = 44
const LANES_UP = 2
const LANES_DOWN = 2
const TREE_HEIGHT = (LANES_UP + LANES_DOWN + 1) * LANE_Y + 16
const MAP_SIZE = { width: 300, height: 260, cx: 150, cy: 122, r: 88 }
const SPEEDS = [1, 3, 10, 30]

const SCENARIOS = [
  { id: 'healthy', blockTime: 6, latency: 0.4, powers: { ayu: 30, budi: 30, citra: 25, deni: 15, kancil: 0 } },
  { id: 'slow', blockTime: 5, latency: 4, powers: { ayu: 30, budi: 30, citra: 25, deni: 15, kancil: 0 } },
  { id: 'giant', blockTime: 6, latency: 0.4, powers: { ayu: 80, budi: 8, citra: 7, deni: 5, kancil: 0 } },
  { id: 'attack20', blockTime: 4, latency: 0.3, powers: { ayu: 28, budi: 24, citra: 16, deni: 12, kancil: 20 } },
  { id: 'attack55', blockTime: 4, latency: 0.3, powers: { ayu: 15, budi: 12, citra: 10, deni: 8, kancil: 55 } },
]

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const clampLane = (lane) => Math.max(-LANES_UP, Math.min(LANES_DOWN, lane))
const laneY = (lane) => (LANES_UP + 0.5) * LANE_Y + 8 + clampLane(lane) * LANE_Y

const BlockTree = memo(function BlockTree({ layout, miners, visible, payment, speed }) {
  const t = useT()
  const width = visible * STEP_X + 40
  const indexOf = Object.fromEntries(miners.map((m, i) => [m.id, i + 1]))
  const byId = new Map(layout.blocks.map((b) => [b.id, b]))
  const offset = 30 - layout.minHeight * STEP_X
  return (
    <svg
      className="tree"
      viewBox={`0 0 ${width} ${TREE_HEIGHT}`}
      role="img"
      aria-label={t('lab.treeLabel', { height: layout.top })}
      style={{ '--tree-ms': `${Math.round(450 / Math.sqrt(speed))}ms` }}
    >
      <line className="tree-axis" x1="0" x2={width} y1={laneY(0)} y2={laneY(0)} />
      <g className="tree-scroll" style={{ transform: `translateX(${offset}px)` }}>
        {layout.blocks.map((block) => {
          const parent = byId.get(block.parent)
          if (!parent) return null
          const x1 = parent.height * STEP_X
          const y1 = laneY(parent.lane)
          const x2 = block.height * STEP_X
          const y2 = laneY(block.lane)
          const mid = (x1 + x2) / 2
          return (
            <path
              key={`edge-${block.id}`}
              className={`tree-edge ${block.main ? 'tree-edge-main' : ''} ${block.secret ? 'tree-edge-secret' : ''}`}
              d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
            />
          )
        })}
        {layout.blocks.map((block) => {
          const slot = block.miner ? indexOf[block.miner] : 0
          const name = block.miner ? t(`name.${block.miner}`) : t('lab.genesis')
          const state = t(block.secret ? 'lab.secret' : block.main ? 'lab.stateMain' : 'lab.stale')
          return (
            <g
              key={block.id}
              className={`tree-block ${block.main ? '' : 'tree-stale'} ${block.secret ? 'tree-secret' : ''}`}
              style={{ transform: `translate(${block.height * STEP_X}px, ${laneY(block.lane)}px)` }}
            >
              <title>{t('lab.blockTitle', { height: block.height, name, state, hash: short(block.hash) })}</title>
              <rect x="-20" y="-14" width="40" height="28" rx="4" style={{ fill: slot ? `var(--s${slot})` : 'var(--ink-3)' }} />
              <text textAnchor="middle" dominantBaseline="central" style={{ fill: slot ? `var(--s${slot}-on)` : 'var(--sheet)' }}>
                {block.miner ? (block.miner === 'kancil' ? 'K' : block.miner[0].toUpperCase()) : 'G'}
              </text>
              {block.id === payment && (
                <g className="tree-payment">
                  <line x1="0" y1="-14" x2="0" y2="-21" />
                  <text y="-27" textAnchor="middle">{t('lab.payment')}</text>
                </g>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
})

function NetworkView({ sim }) {
  const t = useT()
  const miners = sim.miners
  const total = sim.totalPower() || 1
  const position = (index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / miners.length
    return { x: MAP_SIZE.cx + MAP_SIZE.r * Math.cos(angle), y: MAP_SIZE.cy + MAP_SIZE.r * Math.sin(angle) }
  }
  const positions = Object.fromEntries(miners.map((m, i) => [m.id, position(i)]))
  return (
    <svg className="lab-map" viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`} role="img" aria-label={t('lab.mapLabel')}>
      {miners.flatMap((a, i) =>
        miners.slice(i + 1).map((b) => (
          <line key={`${a.id}${b.id}`} className="lab-edge" x1={positions[a.id].x} y1={positions[a.id].y} x2={positions[b.id].x} y2={positions[b.id].y} />
        )),
      )}
      {sim.messages.map((message, index) => {
        const from = positions[message.from]
        const to = positions[message.to]
        const progress = Math.min(1, (sim.t - message.sent) / Math.max(0.001, message.arrive - message.sent))
        const slot = miners.findIndex((m) => m.id === message.from) + 1
        return (
          <circle
            key={index}
            className="lab-packet"
            r="4"
            cx={from.x + (to.x - from.x) * progress}
            cy={from.y + (to.y - from.y) * progress}
            style={{ fill: `var(--s${slot})` }}
          />
        )
      })}
      {miners.map((miner, index) => {
        const { x, y } = positions[miner.id]
        const share = miner.power / total
        const radius = 11 + Math.sqrt(share) * 18
        const pulse = Math.max(0, 1 - (sim.t - miner.lastFound) / 1.2)
        return (
          <g key={miner.id} transform={`translate(${x} ${y})`} className={miner.power ? '' : 'lab-node-idle'}>
            {pulse > 0 && <circle className="lab-pulse" r={radius + (1 - pulse) * 14} style={{ opacity: pulse, stroke: `var(--s${index + 1})` }} />}
            <circle className="lab-node" r={radius} style={{ fill: `var(--s${index + 1})` }} />
            <text className="lab-node-letter" textAnchor="middle" dominantBaseline="central" style={{ fill: `var(--s${index + 1}-on)` }}>
              {miner.id === 'kancil' ? 'K' : miner.id[0].toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function UnitRow({ label, value, marker, tone }) {
  const cells = Array.from({ length: Math.min(12, Math.max(value, 0)) })
  return (
    <div className="unit-row">
      <span className="unit-label">{label}</span>
      <span className="unit-cells" aria-hidden="true">
        {cells.map((_, index) => <span key={index} className={`unit-cell ${tone}`} />)}
      </span>
      <span className="unit-value">{value}{marker ? ` / ${marker}` : ''}</span>
    </div>
  )
}

const LOG_LABEL = { win: 'lab.logWin', lose: 'lab.logLose' }

export default function LabPage({ active }) {
  const t = useT()
  const simRef = useRef(null)
  if (!simRef.current) simRef.current = new Simulation({ blockTime: SCENARIOS[0].blockTime, latency: SCENARIOS[0].latency })
  const sim = simRef.current

  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [scenario, setScenario] = useState('healthy')
  const [, repaint] = useState(0)
  const narrow = useMediaQuery('(max-width: 720px)')
  const visible = narrow ? 7 : 16

  useEffect(() => {
    if (!active || !playing) return undefined
    let frame
    let last = performance.now()
    let carry = 0
    let painted = 0
    const loop = (now) => {
      // Batas 1 detik: tetap sesuai waktu nyata walau peramban melambatkan frame, tanpa melompat jauh saat tab kembali aktif.
      carry += Math.min(1, (now - last) / 1000) * speed
      last = now
      while (carry >= STEP) {
        sim.step(STEP)
        carry -= STEP
      }
      if (sim.reorgs > 0) completeMission('lab-reorg')
      if (sim.attackStats.wins > 0) completeMission('lab-win')
      if (sim.attackStats.losses > 0) completeMission('lab-lose')
      if (now - painted > 33) {
        painted = now
        repaint((n) => n + 1)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active, playing, speed, sim])

  const version = sim.version
  // sim diubah di luar React; version menjadi penanda bahwa isi pohon berubah.
  const layout = useMemo(() => sim.layout(visible), [sim, version, visible])
  const stats = useMemo(() => sim.stats(), [sim, version])

  const applyScenario = (item) => {
    setScenario(item.id)
    sim.blockTime = item.blockTime
    sim.latency = item.latency
    for (const [id, power] of Object.entries(item.powers)) sim.setPower(id, power)
    sim.reset()
    repaint((n) => n + 1)
  }

  const resetSim = () => {
    sim.reset()
    repaint((n) => n + 1)
  }

  const changeSetting = (key, value) => {
    sim[key] = value
    sim.version++
    setScenario(null)
    repaint((n) => n + 1)
  }

  const changePower = (id, value) => {
    sim.setPower(id, value)
    setScenario(null)
    repaint((n) => n + 1)
  }

  const total = sim.totalPower() || 1
  const share = sim.attackerShare()
  const attack = sim.attack
  const racing = attack.state !== 'idle'
  const secretCount = racing ? sim.blocks.get(attack.secretTip).height - sim.blocks.get(attack.base).height : 0
  const settled = sim.attackStats.wins + sim.attackStats.losses
  const theory = attackSuccessProbability(share, sim.confirmations)

  const stateLabel = racing ? t(`lab.state.${attack.state}`, { n: sim.confirmations }) : null
  const seconds = (value) => t('unit.sec', { n: decimal(value) })

  return (
    <>
      <ChapterHead no={7} title={t('lab.title')} chapter="lab">
        <p>{rich(t('lab.lede'))}</p>
      </ChapterHead>

      <div className="toolbar sheet lab-toolbar">
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => setPlaying(!playing)}>{playing ? t('lab.pause') : t('lab.resume')}</button>
          <div className="segmented" role="group" aria-label={t('lab.speed')}>
            {SPEEDS.map((value) => (
              <button key={value} type="button" className={speed === value ? 'on' : ''} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={resetSim}>{t('lab.restart')}</button>
        </div>
        <div className="scenario-row" role="group" aria-label={t('lab.scenarios')}>
          <span className="field-label">{t('lab.scenarios')}</span>
          {SCENARIOS.map((item) => (
            <button key={item.id} type="button" className={`pill ${scenario === item.id ? 'pill-on' : ''}`} aria-pressed={scenario === item.id} onClick={() => applyScenario(item)}>
              {t(`lab.scenario.${item.id}`)}
            </button>
          ))}
        </div>
      </div>

      <section className="sheet panel tree-panel">
        <div className="panel-head">
          <h3>{t('lab.treeTitle')}</h3>
          <ul className="legend tree-legend" aria-label={t('lab.treeLegend')}>
            {sim.miners.map((miner, index) => (
              <li key={miner.id}><span className="swatch" style={{ background: `var(--s${index + 1})` }} /> {t(`name.${miner.id}`)}</li>
            ))}
            <li><span className="swatch swatch-stale" /> {t('lab.stale')}</li>
            <li><span className="swatch swatch-secret" /> {t('lab.secret')}</li>
          </ul>
        </div>
        <BlockTree layout={layout} miners={sim.miners} visible={visible} payment={attack.payment ?? null} speed={speed} />
      </section>

      <div className="lab-stats stats">
        <Stat label={t('lab.statHeight')} value={count(stats.height)} hint={t('lab.statTime', { time: t('unit.sec', { n: count(sim.t) }) })} />
        <Stat label={t('lab.statStale')} value={count(stats.stale)} hint={t('lab.statStaleHint', { percent: percent(stats.staleRate, 1), n: stats.found })} />
        <Stat label={t('lab.statReorg')} value={count(stats.reorgs)} hint={stats.reorgs ? t('lab.statReorgHint', { n: stats.deepestReorg }) : t('lab.statNone')} />
        <Stat label={t('lab.statInFlight')} value={sim.messages.length} hint={t('lab.statLatency', { time: seconds(sim.latency) })} />
      </div>

      <div className="lab-grid">
        <section className="sheet panel">
          <h3>{t('lab.minersTitle')}</h3>
          <p className="muted small">{t('lab.minersHint')}</p>
          <ul className="miner-list">
            {sim.miners.map((miner, index) => {
              const powerShare = miner.power / total
              const reward = stats.height ? stats.rewards[miner.id] / stats.height : 0
              const name = t(`name.${miner.id}`)
              return (
                <li key={miner.id}>
                  <div className="miner-head">
                    <span className="person"><span className="person-dot" style={{ background: `var(--s${index + 1})` }} aria-hidden="true" />{name}</span>
                    <span className="miner-share">{t('lab.minerShare', { percent: percent(powerShare), n: stats.rewards[miner.id] })}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={miner.power}
                    aria-label={t('lab.powerLabel', { name })}
                    style={{ '--fill': `${miner.power}%` }}
                    onChange={(event) => changePower(miner.id, Number(event.target.value))}
                  />
                  <div className="reward-track" title={t('lab.rewardTitle', { reward: percent(reward, 1), power: percent(powerShare, 1) })}>
                    <span className="reward-bar" style={{ width: `${reward * 100}%`, background: `var(--s${index + 1})` }} />
                    <span className="reward-mark" style={{ left: `${powerShare * 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="control-grid">
            <Slider id="lab-block-time" label={t('lab.blockTime')} value={sim.blockTime} min={1} max={20} onChange={(value) => changeSetting('blockTime', value)} display={seconds(sim.blockTime)} />
            <Slider id="lab-latency" label={t('lab.latency')} value={sim.latency} min={0} max={6} step={0.1} onChange={(value) => changeSetting('latency', value)} display={seconds(sim.latency)} />
          </div>
        </section>

        <section className="sheet panel lab-map-panel">
          <h3>{t('lab.mapTitle')}</h3>
          <NetworkView sim={sim} />
          <p className="muted small">{t('lab.mapHint')}</p>
        </section>

        <section className={`sheet panel attack-panel ${racing ? 'attack-live' : ''}`}>
          <h3>{t('lab.attackTitle')}</h3>
          <p className="muted small">{t('lab.attackBody')}</p>
          <Slider id="lab-confirmations" label={t('lab.confirmations')} value={sim.confirmations} min={1} max={6} onChange={(value) => changeSetting('confirmations', value)} display={t('lab.confirmationsValue', { n: sim.confirmations })} />
          <div className="button-row">
            <button type="button" className="btn btn-danger" disabled={racing || sim.attacker.power === 0} onClick={() => { sim.startAttack(); repaint((n) => n + 1) }}>
              {racing ? t('lab.attackRunning') : t('lab.startAttack')}
            </button>
            <label className="check">
              <input type="checkbox" checked={sim.autoAttack} onChange={(event) => { sim.autoAttack = event.target.checked; repaint((n) => n + 1) }} />
              {t('lab.repeat')}
            </label>
          </div>
          {sim.attacker.power === 0 && <p className="callout">{t('lab.needPower')}</p>}
          {racing && (
            <div className="race" aria-live="off">
              <p className="small">{stateLabel}</p>
              <UnitRow label={t('lab.public')} value={attack.confirmations ?? 0} marker={sim.confirmations} tone="unit-public" />
              <UnitRow label={t('lab.secretRow')} value={secretCount} tone="unit-secret" />
              <p className="muted small">{t('lab.giveUp', { gap: GIVE_UP_GAP })}</p>
            </div>
          )}
          <div className="stats">
            <Stat label={t('lab.statWins')} value={t('lab.statWinsValue', { wins: sim.attackStats.wins, total: settled })} hint={settled ? percent(sim.attackStats.wins / settled) : t('lab.statNone')} />
            <Stat label={t('lab.statFormula')} value={percent(theory, 1)} hint={t('lab.statFormulaHint', { percent: percent(share), n: sim.confirmations })} />
          </div>
          <ul className="lab-log" aria-live="polite">
            {sim.log.slice(0, 5).map((entry) => (
              <li key={entry.id} className={`log-${entry.kind}`}>
                {LOG_LABEL[entry.kind] && <span className="log-kind">{t(LOG_LABEL[entry.kind])} </span>}
                {t(entry.key, entry.params?.miner ? { ...entry.params, miner: t(`name.${entry.params.miner}`) } : entry.params)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="epilogue sheet panel">
        <h3>{t('lab.endTitle')}</h3>
        <p>{t('lab.endBody')}</p>
      </div>
    </>
  )
}
