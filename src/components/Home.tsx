import type { DeckStats } from '../types'

const BLURB: Record<string, string> = {
  hiragana: 'Los 104 signos: 46 básicos, 25 con dakuten y 33 combinados.',
  katakana: 'Los mismos 104, más 25 extendidos para extranjerismos.',
  vocab: 'Palabras escritas solo en kana. Se abren al dominar sus signos.',
}

interface Props {
  decks: DeckStats[]
  onStudy: (slug: string) => void
}

export default function Home({ decks, onStudy }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-6">
      <h1 className="text-2xl font-medium">Mazos</h1>
      <p className="mt-1 text-sm text-muted">
        Las cartas aparecen cuando FSRS calcula que estás a punto de olvidarlas.
      </p>

      <div className="mt-8 space-y-4">
        {decks.map((d) => {
          const available = d.total - d.locked
          const canStudy = d.due > 0
          return (
            <div
              key={d.slug}
              className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-muted/40"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <h2 className="text-lg font-medium">{d.name}</h2>
                  <p className="mt-1 text-sm text-muted">{BLURB[d.slug] ?? ''}</p>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <Stat label="pendientes" value={d.due} tone={d.due ? 'accent' : undefined} />
                    <Stat label="nuevas" value={d.New} />
                    <Stat label="aprendiendo" value={d.learning} />
                    <Stat label="asentadas" value={d.review} tone="ok" />
                    {d.locked > 0 && <Stat label="bloqueadas" value={d.locked} muted />}
                    {d.suspended > 0 && <Stat label="apartadas" value={d.suspended} muted />}
                  </div>

                  <div className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full bg-ok transition-[width] duration-500"
                      style={{ width: `${d.total ? (d.review / d.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {d.review} de {d.total} cartas asentadas · {available} desbloqueadas
                  </p>
                </div>

                <button
                  onClick={() => onStudy(d.slug)}
                  disabled={!canStudy}
                  className="shrink-0 rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                >
                  {canStudy ? `Estudiar ${d.due}` : 'Al día'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: number
  tone?: 'ok' | 'accent'
  muted?: boolean
}) {
  return (
    <span className={muted ? 'text-muted/70' : ''}>
      <span
        className={`font-medium tabular-nums ${
          tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent' : ''
        }`}
      >
        {value}
      </span>{' '}
      <span className="text-muted">{label}</span>
    </span>
  )
}
