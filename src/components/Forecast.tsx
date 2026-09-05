import { useEffect, useState } from 'react'
import type { Forecast as ForecastData } from '../types'

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Repasos ya comprometidos para los próximos días.
 *
 * Es la cifra que permite decidir si hoy conviene meter más material nuevo:
 * las estadísticas de siempre miran atrás, y lo accionable es lo que viene.
 */
export default function Forecast() {
  const [data, setData] = useState<ForecastData | null>(null)

  useEffect(() => {
    void window.manabi.forecast(14).then(setData)
  }, [])

  if (!data) return null

  const max = Math.max(1, ...data.days.map((d) => d.count))
  const total = data.days.reduce((n, d) => n + d.count, 0)
  const busiest = data.days.reduce((a, b) => (b.count > a.count ? b : a), data.days[0])

  return (
    <>
      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Próximos 14 días</h2>

      {total === 0 && data.overdue === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No hay repasos programados todavía. Aparecerán en cuanto estudies las primeras
          cartas.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-36 items-stretch gap-1">
            {data.days.map((d, i) => {
              const date = new Date(`${d.day}T12:00:00`)
              return (
                <div
                  key={d.day}
                  className="group flex h-full flex-1 flex-col justify-end"
                  title={`${date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}: ${d.count} repasos`}
                >
                  <span className="mb-1 text-center text-[10px] tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    {d.count}
                  </span>
                  <div
                    className={`w-full rounded-t transition-colors ${
                      d.count ? 'bg-accent/70 group-hover:bg-accent' : 'bg-line'
                    }`}
                    style={{ height: d.count ? `${Math.max(4, (d.count / max) * 100)}%` : '2px' }}
                  />
                  <span className="mt-1.5 text-center text-[10px] text-muted">
                    {i === 0 ? 'hoy' : DAY_NAMES[date.getDay()]}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {data.overdue > 0 && (
              <span>
                <span className="font-medium tabular-nums text-accent">{data.overdue}</span>{' '}
                <span className="text-muted">atrasados</span>
              </span>
            )}
            <span>
              <span className="font-medium tabular-nums">{total}</span>{' '}
              <span className="text-muted">repasos en dos semanas</span>
            </span>
            <span>
              <span className="font-medium tabular-nums">{Math.round(total / 14)}</span>{' '}
              <span className="text-muted">de media al día</span>
            </span>
            {busiest.count > 0 && (
              <span>
                <span className="font-medium tabular-nums">{busiest.count}</span>{' '}
                <span className="text-muted">
                  el día más cargado (
                  {new Date(`${busiest.day}T12:00:00`).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  )
                </span>
              </span>
            )}
          </div>

          <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted">
            Solo cuenta lo ya programado. Las cartas nuevas que aún no has estudiado no
            aparecen, porque su fecha depende de cuándo las veas y con qué nota: cada una
            que estrenes hoy añadirá repasos a estos días.
          </p>
        </>
      )}
    </>
  )
}
