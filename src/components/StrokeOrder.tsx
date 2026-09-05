import { useCallback, useEffect, useRef, useState } from 'react'

/** Milisegundos que tarda en dibujarse un trazo. */
const STROKE_MS = 420
/** Pausa entre trazos, para que se distingan. */
const GAP_MS = 110

interface Props {
  glyph: string
  size?: number
  /** Empezar a dibujar en cuanto aparece. */
  autoPlay?: boolean
}

/**
 * Orden de trazos animado, a partir de los datos de KanjiVG.
 *
 * Cada trazo lleva `pathLength="1"`, lo que normaliza su longitud real a la
 * unidad: así se anima con un dash-offset de 1 a 0 sin tener que medir cada
 * curva con getTotalLength(), y todos los trazos tardan lo mismo
 * independientemente de su tamaño.
 */
export default function StrokeOrder({ glyph, size = 200, autoPlay = false }: Props) {
  const [paths, setPaths] = useState<string[] | null>(null)
  /** Trazos ya terminados. */
  const [drawn, setDrawn] = useState(0)
  /** Trazo que se está dibujando ahora, o -1 si está parado. */
  const [drawing, setDrawing] = useState(-1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stop = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
    setDrawing(-1)
  }, [])

  useEffect(() => {
    let alive = true
    setPaths(null)
    setDrawn(0)
    stop()
    void window.manabi.kanjiStrokes(glyph).then((p) => {
      if (alive) setPaths(p)
    })
    return () => {
      alive = false
      stop()
    }
  }, [glyph, stop])

  const play = useCallback(
    (from = 0) => {
      if (!paths?.length) return
      stop()
      setDrawn(from)
      paths.slice(from).forEach((_, offset) => {
        const index = from + offset
        const start = offset * (STROKE_MS + GAP_MS)
        timers.current.push(setTimeout(() => setDrawing(index), start))
        timers.current.push(
          setTimeout(() => {
            setDrawn(index + 1)
            setDrawing(-1)
          }, start + STROKE_MS),
        )
      })
    },
    [paths, stop],
  )

  useEffect(() => {
    if (autoPlay && paths?.length) play(0)
  }, [autoPlay, paths, play])

  const step = useCallback(
    (delta: number) => {
      if (!paths?.length) return
      stop()
      setDrawn((d) => Math.max(0, Math.min(paths.length, d + delta)))
    },
    [paths, stop],
  )

  if (!paths) return <div style={{ width: size, height: size }} />
  if (!paths.length) {
    return (
      <p className="text-center text-xs text-muted" style={{ width: size }}>
        KanjiVG no tiene el trazado de este carácter.
      </p>
    )
  }

  const total = paths.length
  const shown = drawing >= 0 ? drawing : drawn

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 109 109"
        width={size}
        height={size}
        className="shrink-0 rounded-xl border border-line bg-surface"
        role="img"
        aria-label={`Orden de trazos de ${glyph}`}
      >
        {/* Retícula de guía, como en el papel cuadriculado de caligrafía. */}
        <path
          d="M54.5,0 v109 M0,54.5 h109"
          stroke="currentColor"
          className="text-line"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
        {paths.map((d, i) => {
          const done = i < drawn
          const active = i === drawing
          if (!done && !active) return null
          return (
            <path
              key={i}
              d={d}
              pathLength="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={active ? 'text-accent' : 'text-fg'}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: active ? 0 : 0,
                transition: active ? `stroke-dashoffset ${STROKE_MS}ms linear` : 'none',
                ...(active ? { animation: `draw ${STROKE_MS}ms linear` } : {}),
              }}
            />
          )
        })}
      </svg>

      <div className="flex items-center gap-1.5">
        <Ctrl onClick={() => step(-1)} disabled={drawn === 0 && drawing < 0} label="Trazo anterior">
          ‹
        </Ctrl>
        <button
          onClick={() => (drawing >= 0 ? stop() : play(drawn >= total ? 0 : drawn))}
          className="rounded-lg bg-raised px-3 py-1.5 text-xs hover:bg-line"
        >
          {drawing >= 0 ? 'Parar' : drawn >= total ? 'Repetir' : 'Reproducir'}
        </button>
        <Ctrl onClick={() => step(1)} disabled={drawn >= total} label="Trazo siguiente">
          ›
        </Ctrl>
        <span className="ml-2 text-xs tabular-nums text-muted">
          {Math.min(shown + (drawing >= 0 ? 1 : 0), total) || drawn} / {total}
        </span>
      </div>
    </div>
  )
}

function Ctrl({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg bg-raised px-2.5 py-1.5 text-sm leading-none hover:bg-line disabled:opacity-30"
    >
      {children}
    </button>
  )
}
