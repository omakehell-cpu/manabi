import type { Overview } from '../types'

interface Props {
  overview: Overview
  onExport: () => void
  onReset: () => void
}

/**
 * Rellena los 30 días hasta hoy, incluidos los que no tienen repasos.
 * Sin esto, un solo día registrado se dibujaba como una única barra
 * ocupando todo el ancho, que no dice nada.
 */
function lastThirtyDays(history: { day: string; count: number }[]) {
  const counts = new Map(history.map((h) => [h.day, h.count]))
  const days: { day: string; count: number }[] = []
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(cursor)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ day: key, count: counts.get(key) ?? 0 })
  }
  return days
}

export default function Stats({ overview, onExport, onReset }: Props) {
  const days = lastThirtyDays(overview.history)
  const max = Math.max(1, ...days.map((d) => d.count))

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-6">
      <h1 className="text-2xl font-medium">Progreso</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile value={overview.reviewsToday} label="repasos hoy" />
        <Tile
          value={overview.reviewsToday ? `${overview.accuracyToday}%` : '—'}
          label="precisión hoy"
        />
        <Tile value={overview.streak} label={overview.streak === 1 ? 'día seguido' : 'días seguidos'} />
        <Tile value={overview.totalReviews} label="repasos totales" />
      </div>

      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Últimos 30 días</h2>
      {overview.totalReviews === 0 ? (
        <p className="mt-4 text-sm text-muted">Aún no hay repasos registrados.</p>
      ) : (
        <>
          {/* Cada columna necesita altura propia: un porcentaje sobre un
              padre sin altura colapsa a cero y el gráfico sale vacío. */}
          <div className="mt-4 flex h-32 items-stretch gap-1">
            {days.map((d) => (
              <div
                key={d.day}
                className="group flex h-full flex-1 flex-col justify-end"
                title={`${d.day}: ${d.count} repasos`}
              >
                <div
                  className={`w-full rounded-t transition-colors ${
                    d.count ? 'bg-accent/70 group-hover:bg-accent' : 'bg-line'
                  }`}
                  style={{ height: d.count ? `${Math.max(4, (d.count / max) * 100)}%` : '2px' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>hace 30 días</span>
            <span>máx. {max}/día</span>
            <span>hoy</span>
          </div>
        </>
      )}

      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Datos</h2>
      <div className="mt-4 flex gap-3">
        <button
          onClick={onExport}
          className="rounded-lg bg-raised px-4 py-2 text-sm hover:bg-line"
        >
          Exportar progreso (JSON)
        </button>
        <button
          onClick={onReset}
          className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent hover:bg-accent-soft"
        >
          Reiniciar progreso
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Exporta de vez en cuando: el progreso vive solo en este equipo.
      </p>
    </div>
  )
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-3xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  )
}
