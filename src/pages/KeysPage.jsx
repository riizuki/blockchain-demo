import { useMemo, useState } from 'react'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ChapterHead, HashText, NextChapter, Stamp, Steps } from '../components/ui.jsx'
import { getLang, rich, translateIn, useLanguageChange, useT } from '../i18n/index.js'
import { bytesToHex, hexToBytes, sha256Hex } from '../lib/crypto.js'
import { list } from '../lib/format.js'
import { PEOPLE } from '../lib/ledger.js'
import { completeMission } from '../lib/store.js'

const encoder = new TextEncoder()
const randomSecret = () => bytesToHex(secp256k1.utils.randomSecretKey())

function derivePublic(secret) {
  try {
    return bytesToHex(secp256k1.getPublicKey(hexToBytes(secret)))
  } catch {
    return null
  }
}

function checkSignature(message, publicKey, signature) {
  try {
    return secp256k1.verify(hexToBytes(signature), encoder.encode(message), hexToBytes(publicKey))
  } catch {
    return false
  }
}

function changeHexDigit(hex) {
  if (!hex) return hex
  const index = Math.floor(hex.length / 2)
  const digit = (parseInt(hex[index], 16) + 1) % 16
  return hex.slice(0, index) + digit.toString(16) + hex.slice(index + 1)
}

export default function KeysPage() {
  const t = useT()
  const [secret, setSecret] = useState(randomSecret)
  const [message, setMessage] = useState(() => translateIn(getLang(), 'keys.defaultMessage'))
  const [signed, setSigned] = useState(null)
  const [check, setCheck] = useState({ message: '', publicKey: '', signature: '' })

  const publicKey = useMemo(() => derivePublic(secret), [secret])
  const address = publicKey ? sha256Hex(publicKey).slice(0, 40) : null
  const digest = useMemo(() => sha256Hex(message), [message])

  // Pesan contoh ikut berganti bahasa selama pengguna belum mengubahnya.
  useLanguageChange((lang, from) => {
    if (message === translateIn(from, 'keys.defaultMessage')) setMessage(translateIn(lang, 'keys.defaultMessage'))
  })

  const sign = () => {
    const signature = bytesToHex(secp256k1.sign(encoder.encode(message), hexToBytes(secret)))
    setSigned({ message, publicKey, signature })
    setCheck({ message, publicKey, signature })
    completeMission('keys-verify')
  }

  const hasSignature = Boolean(check.signature)
  const valid = hasSignature && checkSignature(check.message, check.publicKey, check.signature)

  const setCheckField = (changes) => {
    const next = { ...check, ...changes }
    setCheck(next)
    if (signed && !checkSignature(next.message, next.publicKey, next.signature)) completeMission('keys-tamper')
  }

  const tamperMessage = () => {
    const bumped = check.message.replace(/\d+/, (n) => String(Number(n) * 100))
    setCheckField({ message: bumped === check.message ? `${check.message}!` : bumped })
  }

  const differences = signed
    ? [
        check.message !== signed.message && t('keys.fieldMessage'),
        check.publicKey !== signed.publicKey && t('keys.fieldKey'),
        check.signature !== signed.signature && t('keys.fieldSignature'),
      ].filter(Boolean)
    : []

  const otherKey = PEOPLE[1].publicKey

  return (
    <>
      <ChapterHead no={5} title={t('keys.title')} chapter="keys">
        <p>{rich(t('keys.lede'))}</p>
      </ChapterHead>

      <section className="sheet panel key-flow">
        <div className="key-step">
          <label className="field-label" htmlFor="secret-key">{t('keys.private')}</label>
          <textarea
            id="secret-key"
            rows={2}
            className={`hash-input ${publicKey ? '' : 'input-error'}`}
            value={secret}
            spellCheck={false}
            aria-invalid={!publicKey}
            onChange={(event) => setSecret(event.target.value.trim().toLowerCase())}
          />
          {!publicKey && <p className="error-text">{t('keys.privateError')}</p>}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSecret(randomSecret())}>{t('keys.newKey')}</button>
        </div>
        <div className="key-arrow" aria-hidden="true"><span>{t('keys.oneWay')}</span>→</div>
        <div className="key-step">
          <span className="field-label">{t('keys.public')}</span>
          <HashText value={publicKey ?? ''} />
        </div>
        <div className="key-arrow" aria-hidden="true"><span>{t('keys.hashed')}</span>→</div>
        <div className="key-step">
          <span className="field-label">{t('keys.address')}</span>
          <HashText value={address ?? ''} />
        </div>
      </section>

      <div className="two-up sign-grid">
        <section className="sheet panel">
          <h3>{t('keys.signTitle')}</h3>
          <label className="field">
            <span className="field-label">{t('keys.message')}</span>
            <textarea rows={3} value={message} spellCheck={false} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <div className="field">
            <span className="field-label">{t('keys.digest')}</span>
            <HashText value={digest} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!publicKey} onClick={sign}>{t('keys.sign')}</button>
          <div className="field">
            <span className="field-label">{t('keys.signature')}</span>
            <HashText value={signed?.signature ?? ''} />
            {!signed && <p className="muted small">{t('keys.noSignature')}</p>}
          </div>
        </section>

        <section className={`sheet panel verify ${hasSignature ? (valid ? 'is-ok' : 'is-bad') : ''}`}>
          <div className="panel-head">
            <h3>{t('keys.verifyTitle')}</h3>
            {hasSignature && <Stamp ok={valid} okText={t('stamp.genuine')} badText={t('stamp.forged')} />}
          </div>
          <p className="muted small">{t('keys.verifyHint')}</p>
          <label className="field">
            <span className="field-label">{t('keys.received')}</span>
            <textarea rows={2} value={check.message} disabled={!signed} spellCheck={false} onChange={(event) => setCheckField({ message: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">{t('keys.senderKey')}</span>
            <textarea rows={2} className="hash-input" value={check.publicKey} disabled={!signed} spellCheck={false} onChange={(event) => setCheckField({ publicKey: event.target.value.trim() })} />
          </label>
          <label className="field">
            <span className="field-label">{t('keys.signature')}</span>
            <textarea rows={3} className="hash-input" value={check.signature} disabled={!signed} spellCheck={false} onChange={(event) => setCheckField({ signature: event.target.value.trim() })} />
          </label>
          <div className="button-row" role="group" aria-label={t('keys.forgeGroup')}>
            <button type="button" className="btn btn-danger-ghost btn-small" disabled={!signed} onClick={tamperMessage}>{t('keys.changeMessage')}</button>
            <button type="button" className="btn btn-danger-ghost btn-small" disabled={!signed} onClick={() => setCheckField({ signature: changeHexDigit(check.signature) })}>{t('keys.changeDigit')}</button>
            <button type="button" className="btn btn-danger-ghost btn-small" disabled={!signed} onClick={() => setCheckField({ publicKey: otherKey })}>{t('keys.useOtherKey', { name: t('name.budi') })}</button>
            <button type="button" className="btn btn-ghost btn-small" disabled={!signed || differences.length === 0} onClick={() => setCheck({ ...signed })}>{t('common.reset')}</button>
          </div>
          {signed && (
            <p className={`verify-note ${valid ? 'text-ok' : 'text-bad'}`}>
              {valid ? t('keys.ok') : differences.length ? t('keys.failed', { fields: list(differences) }) : t('keys.unsigned')}
            </p>
          )}
        </section>
      </div>

      <Steps items={[t('keys.step1'), t('keys.step2'), t('keys.step3')]} />

      <NextChapter to="transactions">{t('keys.next')}</NextChapter>
    </>
  )
}
