import { useCallback, useEffect, useState } from 'react'
import type { DeckStats, Overview } from './types'
import Home from './components/Home'
import Study from './components/Study'
import Stats from './components/Stats'
import Credits from './components/Credits'
import Explorer from './components/Explorer'
import { TITLEBAR_INSET } from './lib/platform'

type View = 'home' | 'explore' | 'stats' | 'credits'

export default function App() {
  const [view, setView] = useState<View>('home')
  // `null` dentro del objeto significa «todos los mazos»; el objeto ausente
  // significa que no hay sesión abierta. Con un solo `string | null` no se
  // podían distinguir esas dos cosas.
  const [studying, setStudying] = useState<{ deck: string | null } | null>(null)
  const [decks, setDecks] = useState<DeckStats[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)

  const refresh = useCallback(async () => {
    const [d, o] = await Promise.all([window.manabi.deckStats(), window.manabi.overview()])
    setDecks(d)
    setOverview(o)
  }, [])

  // `view` va en las dependencias porque los ajustes de Progreso cambian lo
  // que Mazos debe mostrar: sin esto, tocar el cupo diario no se reflejaba
  // en las tarjetas hasta reiniciar la aplicación.
  useEffect(() => {
    void refresh()
  }, [refresh, view])

  const exitStudy = useCallback(() => {
    setStudying(null)
    void refresh()
  }, [refresh])

  if (studying) {
    const deck = decks.find((d) => d.slug === studying.deck)
    return (
      <Study
        deck={studying.deck}
        deckName={deck?.name ?? 'Todo lo de hoy'}
        onExit={exitStudy}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header
        className={`drag flex shrink-0 items-center gap-1 border-b border-line px-6 pt-3 pb-2 ${TITLEBAR_INSET}`}
      >
        <span className="mr-4 text-sm font-medium tracking-wide">
          学び <span className="ml-1 text-muted">Manabi</span>
        </span>
        <nav className="no-drag flex gap-1">
          <Tab active={view === 'home'} onClick={() => setView('home')}>
            Mazos
          </Tab>
          <Tab active={view === 'explore'} onClick={() => setView('explore')}>
            Explorar
          </Tab>
          <Tab active={view === 'stats'} onClick={() => setView('stats')}>
            Progreso
          </Tab>
          <Tab active={view === 'credits'} onClick={() => setView('credits')}>
            Créditos
          </Tab>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {view === 'home' && <Home decks={decks} onStudy={(deck) => setStudying({ deck })} />}
        {view === 'explore' && <Explorer />}
        {view === 'stats' && overview && (
          <Stats
            overview={overview}
            onExport={() => void window.manabi.exportProgress()}
            onReset={async () => {
              if (!confirm('Se borrarán todos los repasos y el progreso. ¿Continuar?')) return
              await window.manabi.resetProgress()
              await refresh()
            }}
          />
        )}
        {view === 'credits' && <Credits />}
      </main>
    </div>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
