import { useMemo, useRef, useState } from 'react'
import { BitGrid } from '../components/BitGrid.jsx'
import { ChapterHead, HashText, NextChapter, Stamp, Stat } from '../components/ui.jsx'
import { getLang, rich, useLanguageChange, useT } from '../i18n/index.js'
import { bitDistance, leadingZeros, sha256Hex, sha256HexBytes } from '../lib/crypto.js'
import { count, percent } from '../lib/format.js'
import { sampleRecord } from '../lib/seeds.js'
import { completeMission } from '../lib/store.js'

const MAX_FILE = 256 * 1024 * 1024

function changeOneChar(text) {
  if (!text) return 'a'
  const index = Math.floor(Math.random() * text.length)
  const code = text.charCodeAt(index)
  return text.slice(0, index) + String.fromCharCode(code === 122 ? 97 : code + 1) + text.slice(index + 1)
}

function flipCase(text) {
  const index = text.search(/[a-zA-Z]/)
  if (index < 0) return text
  const char = text[index]
  const flipped = char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()
  return text.slice(0, index) + flipped + text.slice(index + 1)
}

function PrefixGame() {
  const t = useT()
  const [zeros, setZeros] = useState(2)
  const [guess, setGuess] = useState('')
  const [tries, setTries] = useState(0)
  const hash = useMemo(() => sha256Hex(guess), [guess])
  const hit = guess.length > 0 && leadingZeros(hash) >= zeros

  const onGuess = (value) => {
    setGuess(value)
    setTries((n) => n + 1)
    if (value && zeros >= 2 && leadingZeros(sha256Hex(value)) >= zeros) completeMission('hash-prefix')
  }

  return (
    <section className="sheet panel">
      <div className="panel-head">
        <h3>{t('hash.gameTitle')}</h3>
        <div className="segmented" role="group" aria-label={t('hash.gameZeros')}>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={zeros === n ? 'on' : ''}
              aria-pressed={zeros === n}
              onClick={() => {
                setZeros(n)
                setTries(0)
              }}
            >
              {'0'.repeat(n)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">{t('hash.gameBody', { odds: count(16 ** zeros) })}</p>
      <label className="field">
        <span className="field-label">{t('hash.gameInput')}</span>
        <input type="text" value={guess} onChange={(event) => onGuess(event.target.value)} spellCheck={false} placeholder="najwa1, najwa2, najwa3…" />
      </label>
      <div className="prefix-result">
        <HashText value={hash} difficulty={zeros} className={hit ? '' : 'hash-dim'} />
        <div className="prefix-side">
          <span className="prefix-tries"><strong>{count(tries)}</strong> {t('hash.gameTries')}</span>
          {hit && <Stamp ok okText={t('stamp.found')} />}
        </div>
      </div>
      {hit && <p className="callout">{t('hash.gameWon')}</p>}
    </section>
  )
}

function FileHasher() {
  const t = useT()
  const [state, setState] = useState(null)
  const [over, setOver] = useState(false)
  const input = useRef(null)

  const read = async (file) => {
    if (!file) return
    if (file.size > MAX_FILE) {
      setState({ error: file.name })
      return
    }
    setState({ busy: true, name: file.name })
    const bytes = new Uint8Array(await file.arrayBuffer())
    setState({ name: file.name, size: file.size, hash: sha256HexBytes(bytes) })
    completeMission('hash-file')
  }

  return (
    <section className="sheet panel">
      <h3>{t('hash.fileTitle')}</h3>
      <p className="muted">{t('hash.fileBody')}</p>
      <div
        className={`dropzone ${over ? 'dropzone-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          read(event.dataTransfer.files[0])
        }}
      >
        <input ref={input} type="file" className="sr-only" id="file-hash" onChange={(event) => read(event.target.files[0])} />
        <label htmlFor="file-hash" className="btn btn-ghost">{t('hash.fileChoose')}</label>
        <span className="muted">{t('hash.fileDrop')}</span>
      </div>
      {state?.error && <p className="error-text">{t('hash.fileTooBig', { name: state.error })}</p>}
      {state?.busy && <p className="muted">{t('hash.fileBusy', { name: state.name })}</p>}
      {state?.hash && (
        <div className="file-result">
          <p><strong>{state.name}</strong> <span className="muted">({t('hash.fileSize', { count: count(state.size) })})</span></p>
          <HashText value={state.hash} />
        </div>
      )}
    </section>
  )
}

export default function HashPage() {
  const t = useT()
  const [text, setText] = useState(() => sampleRecord(getLang()))
  const [before, setBefore] = useState(null)
  const hash = useMemo(() => sha256Hex(text), [text])

  // Isi contoh ikut berganti bahasa, tetapi teks buatan pengguna tidak disentuh.
  useLanguageChange((lang, from) => {
    if (text === sampleRecord(from)) {
      setText(sampleRecord(lang))
      setBefore(null)
    }
  })

  const update = (next) => {
    if (next === text) return
    const nextHash = sha256Hex(next)
    setBefore({ text, hash })
    setText(next)
    if (Math.abs(next.length - text.length) <= 1 && bitDistance(hash, nextHash) > 100) completeMission('hash-avalanche')
  }

  const flipped = before ? bitDistance(before.hash, hash) : 0
  const changedDigits = before ? [...hash].filter((char, i) => char !== before.hash[i]).length : 0

  return (
    <>
      <ChapterHead no={1} title={t('hash.title')} chapter="hash">
        <p>{rich(t('hash.lede'))}</p>
      </ChapterHead>

      <div className="hash-lab">
        <section className="sheet panel">
          <label className="field">
            <span className="field-label">{t('hash.data')}</span>
            <textarea rows={4} value={text} onChange={(event) => update(event.target.value)} spellCheck={false} />
          </label>
          <div className="button-row" role="group" aria-label={t('hash.quick')}>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => update(changeOneChar(text))}>{t('hash.changeChar')}</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => update(`${text} `)}>{t('hash.addSpace')}</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => update(flipCase(text))}>{t('hash.flipCase')}</button>
          </div>
          <div className="field">
            <span className="field-label">{t('hash.current')}</span>
            <HashText value={hash} className="hash-large" />
          </div>
          <div className="field">
            <span className="field-label">{t('hash.previous')}</span>
            <HashText value={before?.hash} className="hash-large hash-dim" />
          </div>
        </section>

        <section className="sheet panel bit-panel">
          <div className="bit-figure">
            <BitGrid hash={hash} previous={before?.hash} label={t('hash.gridLabel')} />
            <ul className="legend" aria-label={t('hash.legend')}>
              <li><span className="swatch bit-on" /> {t('hash.bit1')}</li>
              <li><span className="swatch bit-off" /> {t('hash.bit0')}</li>
              <li><span className="swatch bit-flip" /> {t('hash.bitFlip')}</li>
            </ul>
          </div>
          <div className="stats stats-column">
            <Stat
              label={t('hash.bitsFlipped')}
              value={before ? t('hash.bitsValue', { count: flipped }) : t('hash.editPrompt')}
              hint={before ? t('hash.bitsPercent', { percent: percent(flipped / 256) }) : t('hash.bitsHint')}
            />
            <Stat label={t('hash.digitsChanged')} value={before ? t('hash.digitsValue', { count: changedDigits }) : '–'} hint={t('hash.avalanche')} />
            <Stat label={t('hash.length')} value={t('hash.lengthValue', { count: count(new TextEncoder().encode(text).length) })} hint={t('hash.lengthHint')} />
          </div>
        </section>
      </div>

      <div className="two-up">
        <PrefixGame />
        <FileHasher />
      </div>

      <NextChapter to="block">{t('hash.next')}</NextChapter>
    </>
  )
}
