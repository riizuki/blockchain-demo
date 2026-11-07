import { useEffect, useState } from 'react'
import { LANGUAGES, setLang, useT } from './i18n/index.js'
import { MISSIONS, dismissToast, resetMissions, useMissions, useToast } from './lib/store.js'
import HashPage from './pages/HashPage.jsx'
import BlockPage from './pages/BlockPage.jsx'
import ChainPage from './pages/ChainPage.jsx'
import NetworkPage from './pages/NetworkPage.jsx'
import KeysPage from './pages/KeysPage.jsx'
import LedgerPage from './pages/LedgerPage.jsx'
import LabPage from './pages/LabPage.jsx'

const CHAPTERS = [
  { id: 'hash', Page: HashPage },
  { id: 'block', Page: BlockPage },
  { id: 'chain', Page: ChainPage },
  { id: 'network', Page: NetworkPage },
  { id: 'keys', Page: KeysPage },
  { id: 'transactions', Page: LedgerPage },
  { id: 'lab', Page: LabPage },
]

const routeFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return CHAPTERS.some((c) => c.id === id) ? id : 'hash'
}

function useRoute() {
  const [route, setRoute] = useState(routeFromHash)
  useEffect(() => {
    const onChange = () => {
      setRoute(routeFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('buku-besar:tema')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#14191c' : '#f3eee2')
    localStorage.setItem('buku-besar:tema', theme)
  }, [theme])
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}

function LanguageSwitch() {
  const t = useT()
  return (
    <div className="segmented lang-switch" role="group" aria-label={t('app.language')}>
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          lang={language.code}
          title={language.name}
          className={t.lang === language.code ? 'on' : ''}
          aria-pressed={t.lang === language.code}
          onClick={() => setLang(language.code)}
        >
          {language.short}
        </button>
      ))}
    </div>
  )
}

function Toast() {
  const t = useT()
  const toast = useToast()
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(dismissToast, 4200)
    return () => clearTimeout(timer)
  }, [toast])
  return (
    <div className="toast-slot" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.key}>
          <span className="stamp stamp-ok toast-stamp">{t('app.toast')}</span>
          <span>{t(`mission.${toast.id}`)}</span>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const t = useT()
  const route = useRoute()
  const [theme, toggleTheme] = useTheme()
  const done = useMissions()
  const [visited, setVisited] = useState(() => new Set([route]))

  useEffect(() => {
    document.documentElement.lang = t.lang
    document.title = t('app.docTitle')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'))
  }, [t])

  // Di layar sempit tab aktif bisa berada di luar layar, jadi geser daftarnya sampai terlihat.
  useEffect(() => {
    const nav = document.querySelector('.tabs')
    const tab = nav?.querySelector('.tab-active')
    if (tab) nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2
  }, [route, t.lang])

  // Bab yang pernah dibuka tetap terpasang supaya rantai dan simulasinya tidak hilang saat pindah bab.
  if (!visited.has(route)) setVisited(new Set(visited).add(route))

  const [inspiredBefore, inspiredAfter] = t('app.inspired').split('{link}')

  return (
    <div className="app">
      <svg width="0" height="0" className="defs" aria-hidden="true">
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
      </svg>

      <header className="masthead">
        <div className="masthead-title">
          <h1>{t('app.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
        <div className="masthead-tools">
          <div className="tally" title={t('app.missionsHint')}>
            <span className="tally-count">{done.size}/{MISSIONS.length}</span>
            <span className="tally-label">{t('app.missionsDone')}</span>
          </div>
          <LanguageSwitch />
          <button type="button" className="btn btn-ghost btn-small theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? t('app.light') : t('app.dark')}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t('app.tabs')}>
        {CHAPTERS.map((chapter, index) => {
          const missions = MISSIONS.filter((m) => m.chapter === chapter.id)
          const finished = missions.every((m) => done.has(m.id))
          return (
            <a
              key={chapter.id}
              href={`#/${chapter.id}`}
              className={`tab ${route === chapter.id ? 'tab-active' : ''} ${finished ? 'tab-finished' : ''}`}
              aria-current={route === chapter.id ? 'page' : undefined}
            >
              <span className="tab-no">{index + 1}</span>
              {t(`tab.${chapter.id}`)}
            </a>
          )
        })}
      </nav>

      <main className="page">
        {CHAPTERS.map(({ id, Page }) =>
          visited.has(id) ? (
            <section key={id} hidden={route !== id}>
              <Page active={route === id} />
            </section>
          ) : null,
        )}
      </main>

      <footer className="colophon">
        <p>
          {t('app.footer')}{' '}
          {inspiredBefore}
          <a href="https://andersbrownworth.com/blockchain/" target="_blank" rel="noreferrer">{t('app.inspiredLink')}</a>
          {inspiredAfter}
        </p>
        <button type="button" className="link-button" onClick={resetMissions}>{t('app.resetMissions')}</button>
      </footer>

      <Toast />
    </div>
  )
}
