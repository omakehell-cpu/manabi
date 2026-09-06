import type { DeckStats } from '../types'

const BLURB: Record<string, string> = {
  hiragana: 'Los 104 signos: 46 básicos, 25 con dakuten y 33 combinados.',
  katakana: 'Los mismos 104, más 25 extendidos para extranjerismos.',
  vocab: 'Palabras escritas solo en kana. Se abren al dominar sus signos.',
  'vocab-n5': 'Las primeras 543 palabras del examen.',
  'vocab-n4': 'Vocabulario de la vida cotidiana.',
  'vocab-n3': 'El salto al nivel intermedio.',
  'vocab-n2': 'Lo que exige el material general.',
  'vocab-n1': 'Vocabulario avanzado.',
  'kanji-n5': 'Los básicos del día a día.',
  'kanji-n4': 'Kanji comunes de la vida cotidiana.',
  'kanji-n3': 'El puente intermedio.',
  'kanji-n2': 'Prensa y material general.',
  'kanji-n1': 'Hasta cubrir el jōyō completo.',
}

/** Qué hay que hacer para que se abra cada mazo cerrado. */
const GATE: Record<string, string> = {
  vocab: 'Se abren al asentar los kana que las componen',
  'vocab-n4': 'Se abre al asentar el 80 % de N5',
  'vocab-n3': 'Se abre al asentar el 80 % de N4',
  'vocab-n2': 'Se abre al asentar el 80 % de N3',
  'vocab-n1': 'Se abre al asentar el 80 % de N2',
  'kanji-n4': 'Se abre al asentar el 80 % de N5',
  'kanji-n3': 'Se abre al asentar el 80 % de N4',
  'kanji-n2': 'Se abre al asentar el 80 % de N3',
  'kanji-n1': 'Se abre al asentar el 80 % de N2',
}

interface Props {
  decks: DeckStats[]
  onStudy: (slug: string) => void
}

export default function Home({ decks, onStudy }: Props) {
  const kana = decks.filter((d) => d.kind !== 'kanji' && d.kind !== 'vocabulary')
  const kanji = decks.filter((d) => d.kind === 'kanji')
  const vocabulary = decks.filter((d) => d.kind === 'vocabulary')

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-6">
      <h1 className="text-2xl font-medium">Mazos</h1>
      <p className="mt-1 text-sm text-muted">
        Las cartas aparecen cuando FSRS calcula que estás a punto de olvidarlas.
      </p>

      <h2 className="mt-8 text-sm tracking-wide text-muted uppercase">Kana</h2>
      <div className="mt-4 space-y-4">
        {kana.map((d) => (
          <DeckCard key={d.slug} deck={d} onStudy={onStudy} />
        ))}
      </div>

      <h2 className="mt-10 text-sm tracking-wide text-muted uppercase">
        Kanji · {kanji.reduce((n, d) => n + d.characters, 0)} caracteres hasta el jōyō completo
      </h2>
      <div className="mt-4 space-y-3">
        {kanji.map((d) => (
          <DeckCard key={d.slug} deck={d} onStudy={onStudy} compact />
        ))}
      </div>

      <h2 className="mt-10 text-sm tracking-wide text-muted uppercase">
        Vocabulario · {vocabulary.reduce((n, d) => n + d.characters, 0)} palabras del JLPT
      </h2>
      <div className="mt-4 space-y-3">
        {vocabulary.map((d) => (
          <DeckCard key={d.slug} deck={d} onStudy={onStudy} compact />
        ))}
      </div>
    </div>
  )
}

function DeckCard({
  deck: d,
  onStudy,
  compact,
}: {
  deck: DeckStats
  onStudy: (slug: string) => void
  compact?: boolean
}) {
  // Aprender y repasar son cosas distintas y conviene verlas separadas:
  // una sesión de 20 repasos no se parece en nada a una de 5 elementos nuevos.
  const canStudy = d.due + d.lessons > 0
  // Un mazo con todo bloqueado aún no ha empezado: mejor decir qué lo abre
  // que mostrar un «Al día» que suena a que ya está hecho.
  const untouched = d.locked === d.total && d.total > 0

  return (
    <div
      className={`rounded-2xl border border-line bg-surface transition-colors hover:border-muted/40 ${
        compact ? 'p-5' : 'p-6'
      } ${untouched ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className={compact ? 'font-medium' : 'text-lg font-medium'}>{d.name}</h3>
          <p className="mt-1 text-sm text-muted">{BLURB[d.slug] ?? ''}</p>

          {untouched ? (
            <p className="mt-3 text-sm text-muted/80">{GATE[d.slug] ?? 'Aún no disponible'}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Stat label="por repasar" value={d.due} tone={d.due ? 'accent' : undefined} />
                <Stat label="por aprender" value={d.lessons} tone={d.lessons ? 'warn' : undefined} />
                <Stat label="aprendiendo" value={d.learning} />
                <Stat label="asentadas" value={d.review} tone="ok" />
                {d.locked > 0 && <Stat label="bloqueadas" value={d.locked} muted />}
                {d.suspended > 0 && <Stat label="apartadas" value={d.suspended} muted />}
              </div>

              <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-ok transition-[width] duration-500"
                  style={{ width: `${d.total ? (d.review / d.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {d.review} de {d.total} cartas asentadas · {d.total - d.locked} desbloqueadas
              </p>
              {d.New > 0 && d.newRemaining === 0 && (
                <p className="mt-1.5 text-xs text-muted/80">
                  Hoy no entran más cartas nuevas; el cupo se ajusta en Progreso.
                </p>
              )}
            </>
          )}
        </div>

        <button
          onClick={() => onStudy(d.slug)}
          disabled={!canStudy}
          className="shrink-0 rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
        >
          {canStudy
            ? d.due > 0
              ? `Repasar ${d.due}`
              : `Aprender ${d.lessons}`
            : untouched
              ? 'Bloqueado'
              : 'Al día'}
        </button>
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
  tone?: 'ok' | 'accent' | 'warn'
  muted?: boolean
}) {
  return (
    <span className={muted ? 'text-muted/70' : ''}>
      <span
        className={`font-medium tabular-nums ${
          tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent' : tone === 'warn' ? 'text-warn' : ''
        }`}
      >
        {value}
      </span>{' '}
      <span className="text-muted">{label}</span>
    </span>
  )
}
