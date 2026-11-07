import { useT } from '../i18n/index.js'
import { HashText, Stamp } from './ui.jsx'

/** Satu halaman buku besar: data, nonce, tautan ke blok sebelumnya, dan hash. */
export function BlockCard({
  block,
  difficulty,
  onChange,
  onMine,
  mining = false,
  disabled = false,
  delay = 0,
  linkHover = null,
  onLinkHover,
  index = 0,
  action,
}) {
  const t = useT()
  const hoverProps = (target) =>
    onLinkHover
      ? {
          onPointerEnter: () => onLinkHover(target),
          onPointerLeave: () => onLinkHover(null),
          tabIndex: 0,
          onFocus: () => onLinkHover(target),
          onBlur: () => onLinkHover(null),
        }
      : {}
  return (
    <article
      className={`sheet block ${block.valid ? 'is-ok' : 'is-bad'} ${mining ? 'is-mining' : ''}`}
      style={{ '--delay': `${delay}ms` }}
    >
      <header className="block-head">
        <span className="block-no">{t('blockcard.number', { n: block.number })}</span>
        <Stamp ok={block.valid} delay={delay} />
      </header>
      <label className="field">
        <span className="field-label">{t('blockcard.data')}</span>
        <textarea
          rows={2}
          value={block.data}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange({ data: event.target.value })}
        />
      </label>
      <label className="field field-row">
        <span className="field-label">{t('blockcard.nonce')}</span>
        <input
          type="number"
          min={0}
          value={block.nonce}
          disabled={disabled}
          onChange={(event) => onChange({ nonce: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
        />
      </label>
      <div className={`field ${linkHover === index - 1 && index > 0 ? 'field-lit' : ''}`} {...(index > 0 ? hoverProps(index - 1) : {})}>
        <span className="field-label">{t('blockcard.prev')}</span>
        <HashText value={block.prev} difficulty={difficulty} />
      </div>
      <div className={`field ${linkHover === index ? 'field-lit' : ''}`} {...hoverProps(index)}>
        <span className="field-label">{t('blockcard.hash')}</span>
        <HashText value={block.hash} difficulty={difficulty} className={block.valid ? '' : 'hash-bad'} />
      </div>
      <button type="button" className={`btn ${block.valid ? 'btn-ghost' : 'btn-primary'} block-action`} onClick={onMine} disabled={disabled || mining}>
        {mining ? t('common.mining') : action ?? t('common.mine')}
      </button>
    </article>
  )
}
