import { useEffect, useState } from 'react'
import type { Overview } from '../types'
import {
  japaneseVoices,
  preferredVoice,
  setPreferredVoice,
  speak,
  speechRate,
  setSpeechRate,
} from '../lib/speech'
import { useVoicesReady } from './Speaker'
import { setStrokeVisibility, strokeVisibility, type StrokeMode } from '../lib/prefs'
import Forecast from './Forecast'
import Leeches from './Leeches'

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

      <Forecast />

      <Leeches />

      <StudySettings />

      <VoiceSettings />

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

/**
 * El límite de cartas nuevas es el ajuste que decide si la aplicación se
 * puede sostener en el tiempo: cada carta nueva arrastra una decena de
 * repasos futuros, así que sin freno la carga diaria crece hasta volverse
 * inasumible en un par de semanas.
 */
function StudySettings() {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    void window.manabi.newPerDay().then(setValue)
  }, [])

  if (value === null) return null

  return (
    <>
      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Ritmo de estudio</h2>
      <LessonBatch />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="nuevas" className="w-24 text-sm text-muted">
          Nuevas al día
        </label>
        <input
          id="nuevas"
          type="range"
          min={0}
          max={60}
          step={5}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value)
            setValue(v)
            void window.manabi.setNewPerDay(v)
          }}
          className="w-48 accent-[var(--color-accent)]"
        />
        <span className="text-sm tabular-nums text-muted">
          {value === 0 ? 'ninguna' : `${value} por mazo`}
        </span>
      </div>
      <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted">
        Se aplica a cada mazo por separado. Los repasos que ya tocan nunca se
        limitan: el tope solo controla cuánto material nuevo entra. Con 20 al día,
        los 104 hiragana llevan poco más de una semana.
      </p>

      <StrokeSetting />
    </>
  )
}

/**
 * Cuántos elementos se presentan juntos antes de examinarlos. Cinco no es
 * arbitrario: la memoria de trabajo maneja del orden de cuatro a la vez, y
 * presentar veinte seguidos reparte la atención hasta no dejar nada.
 */
function LessonBatch() {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    void window.manabi.lessonBatch().then(setValue)
  }, [])

  if (value === null) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label htmlFor="lote" className="w-24 text-sm text-muted">
        Por tanda
      </label>
      <input
        id="lote"
        type="range"
        min={1}
        max={12}
        step={1}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          setValue(v)
          void window.manabi.setLessonBatch(v)
        }}
        className="w-48 accent-[var(--color-accent)]"
      />
      <span className="text-sm tabular-nums text-muted">
        {value} {value === 1 ? 'elemento' : 'elementos'}
      </span>
    </div>
  )
}

const STROKE_LABELS: Record<StrokeMode, string> = {
  always: 'Siempre',
  onError: 'Solo al fallar',
  never: 'Nunca',
}

function StrokeSetting() {
  const [mode, setMode] = useState<StrokeMode | null>(null)

  useEffect(() => {
    void strokeVisibility().then(setMode)
  }, [])

  if (!mode) return null

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <label htmlFor="trazos" className="w-24 text-sm text-muted">
        Orden de trazos
      </label>
      <select
        id="trazos"
        value={mode}
        onChange={(e) => {
          const v = e.target.value as StrokeMode
          setMode(v)
          void setStrokeVisibility(v)
        }}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-muted"
      >
        {(Object.keys(STROKE_LABELS) as StrokeMode[]).map((m) => (
          <option key={m} value={m}>
            {STROKE_LABELS[m]}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted">durante el estudio</span>
    </div>
  )
}

/**
 * La pronunciación usa las voces del sistema. Si no hay ninguna japonesa
 * instalada se explica cómo añadirla en lugar de callar: el usuario vería
 * desaparecer los botones de audio sin saber por qué.
 */
function VoiceSettings() {
  const ready = useVoicesReady()
  const voices = japaneseVoices()
  const [voice, setVoice] = useState(() => preferredVoice()?.name ?? '')
  const [rate, setRate] = useState(speechRate)

  return (
    <>
      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Pronunciación</h2>
      {!ready ? (
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          No hay ninguna voz japonesa instalada en el sistema, así que los botones de
          audio no aparecen. En macOS se añaden en Ajustes del Sistema → Accesibilidad →
          Contenido hablado → Voz del sistema → Gestionar voces. En Windows, en
          Configuración → Hora e idioma → Idioma → Añadir japonés con la voz incluida.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="voz" className="w-24 text-sm text-muted">
              Voz
            </label>
            <select
              id="voz"
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value)
                setPreferredVoice(e.target.value)
              }}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-muted"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => speak('こんにちは')}
              className="rounded-lg bg-raised px-4 py-2 text-sm hover:bg-line"
            >
              Probar
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="vel" className="w-24 text-sm text-muted">
              Velocidad
            </label>
            <input
              id="vel"
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={rate}
              onChange={(e) => {
                const v = Number(e.target.value)
                setRate(v)
                setSpeechRate(v)
              }}
              className="w-48 accent-[var(--color-accent)]"
            />
            <span className="text-sm tabular-nums text-muted">{rate.toFixed(1)}×</span>
          </div>
        </div>
      )}
    </>
  )
}
