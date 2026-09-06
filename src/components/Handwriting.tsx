import { useCallback, useEffect, useRef, useState } from 'react'
import { compareHandwriting, type HandwritingResult, type Point } from '../lib/handwriting'

/** KanjiVG dibuja en un lienzo de 109×109; todo se compara en ese espacio. */
const VIEW = 109
const SAMPLES = 12

/**
 * Convierte un trazo SVG en puntos usando el propio motor del navegador.
 * `getPointAtLength` recorre la curva real, así que no hay que interpretar
 * a mano los comandos de Bézier.
 */
function pathToPoints(d: string): Point[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
  document.body.appendChild(svg)
  const length = path.getTotalLength()
  const points: Point[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const p = path.getPointAtLength((length * i) / (SAMPLES - 1))
    points.push({ x: p.x, y: p.y })
  }
  svg.remove()
  return points
}

/**
 * Cuánta ayuda se da al escribir.
 *
 * La primera vez se calca sobre el modelo; después la guía se va retirando
 * hasta escribir de memoria. Retirarla de golpe convierte la práctica en un
 * examen, y dejarla siempre impide que llegue a memorizarse.
 */
export type GuideLevel = 'trace' | 'faint' | 'stroke' | 'none'

export const GUIDE_LABEL: Record<GuideLevel, string> = {
  trace: 'calcando el modelo',
  faint: 'con el modelo de fondo',
  stroke: 'solo el trazo que toca',
  none: 'de memoria',
}

/**
 * Con cuánta ayuda toca escribir, según lo trabajada que esté la carta.
 * El andamiaje se retira solo: no hay que acordarse de bajarlo.
 */
export function guideFor(reps: number, state: number): GuideLevel {
  if (state === 0 || reps === 0) return 'trace'
  if (reps <= 2) return 'faint'
  if (reps <= 5) return 'stroke'
  return 'none'
}

interface Props {
  glyph: string
  size?: number
  /** Nivel de ayuda inicial; si se omite, se puede cambiar a mano. */
  guide?: GuideLevel
  /** Oculta el botón de guía cuando el nivel lo decide el estudio. */
  lockGuide?: boolean
  /** Se avisa del resultado para poder calificar la carta. */
  onResult?: (result: HandwritingResult) => void
}

/**
 * Práctica de escritura: se dibuja el carácter y se comprueba contra el
 * trazado de KanjiVG.
 *
 * No comprueba el parecido del dibujo final, sino cómo se ha hecho: cuántos
 * trazos, en qué orden y en qué dirección. Un carácter dibujado empezando
 * por abajo se parece al modelo y está mal escrito.
 */
export default function Handwriting({
  glyph,
  size = 260,
  guide: initialGuide,
  lockGuide = false,
  onResult,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [model, setModel] = useState<Point[][] | null>(null)
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [current, setCurrent] = useState<Point[]>([])
  const [result, setResult] = useState<HandwritingResult | null>(null)
  const [guide, setGuide] = useState<GuideLevel>(initialGuide ?? 'trace')
  const drawing = useRef(false)

  useEffect(() => {
    setGuide(initialGuide ?? 'trace')
  }, [initialGuide, glyph])

  useEffect(() => {
    setStrokes([])
    setCurrent([])
    setResult(null)
    void window.manabi.kanjiStrokes(glyph).then((paths) => {
      setModel(paths.map(pathToPoints))
    })
  }, [glyph])

  // Redibujar en cada cambio: son pocas líneas y evita mantener estado en el
  // contexto del canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const scale = canvas.width / VIEW
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(canvas.width / 2, 0)
    ctx.lineTo(canvas.width / 2, canvas.height)
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
    ctx.setLineDash([])

    const line = (points: Point[], color: string, width: number) => {
      if (points.length < 2) return
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0].x * scale, points[0].y * scale)
      for (const p of points.slice(1)) ctx.lineTo(p.x * scale, p.y * scale)
      ctx.stroke()
    }

    // El andamiaje: del modelo entero al siguiente trazo, y de ahí a nada.
    if (model) {
      if (guide === 'trace') {
        for (const m of model) line(m, 'rgba(255,255,255,0.22)', 10)
      } else if (guide === 'faint') {
        for (const m of model) line(m, 'rgba(255,255,255,0.08)', 9)
      } else if (guide === 'stroke') {
        // Solo el que toca ahora: dice por dónde seguir sin regalar la forma.
        const next = model[strokes.length]
        if (next) line(next, 'rgba(255,255,255,0.16)', 9)
      }
    }

    strokes.forEach((s, i) => {
      const verdict = result?.perStroke[i]
      const color = !result
        ? '#e8ebf0'
        : verdict?.ok
          ? 'var(--ok)'
          : 'var(--accent)'
      line(s, color === 'var(--ok)' ? '#4ba97a' : color === 'var(--accent)' ? '#e0554f' : color, 9)
    })
    line(current, '#e8ebf0', 9)
  }, [strokes, current, model, result, guide])

  const toModelSpace = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW,
      y: ((e.clientY - rect.top) / rect.height) * VIEW,
    }
  }, [])

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    setResult(null)
    setCurrent([toModelSpace(e)])
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    // El punto se calcula ANTES de actualizar el estado: React ejecuta el
    // updater más tarde, y para entonces el evento ya está reciclado y
    // `currentTarget` es null.
    const point = toModelSpace(e)
    setCurrent((c) => [...c, point])
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    // Un toque suelto no es un trazo, pero dos puntos ya son una recta:
    // 一 se dibuja de una pasada y no debe descartarse.
    if (current.length > 1) setStrokes((s) => [...s, current])
    setCurrent([])
  }

  const check = () => {
    if (!model) return
    const outcome = compareHandwriting(strokes, model)
    setResult(outcome)
    onResult?.(outcome)
  }

  const total = model?.length ?? 0

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size, touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="cursor-crosshair rounded-xl border border-line bg-surface"
      />

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Btn onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length}>
          Deshacer
        </Btn>
        <Btn
          onClick={() => {
            setStrokes([])
            setResult(null)
          }}
          disabled={!strokes.length}
        >
          Borrar
        </Btn>
        <Btn onClick={check} disabled={!strokes.length} primary>
          Comprobar
        </Btn>
        {!lockGuide && (
          <Btn
            onClick={() =>
              setGuide((g) =>
                g === 'trace' ? 'faint' : g === 'faint' ? 'stroke' : g === 'stroke' ? 'none' : 'trace',
              )
            }
          >
            {GUIDE_LABEL[guide]}
          </Btn>
        )}
        <span className="ml-2 text-xs tabular-nums text-muted">
          {strokes.length} / {total}
        </span>
      </div>

      {lockGuide && (
        <p className="text-xs text-muted">Escribiendo {GUIDE_LABEL[guide]}</p>
      )}

      {result && <Verdict result={result} total={total} />}
    </div>
  )
}

function Verdict({ result, total }: { result: HandwritingResult; total: number }) {
  const perfect = result.firstWrong === -1 && result.countDelta === 0
  const nota = Math.round(result.score * 100)

  if (perfect) {
    return (
      <p className="text-center text-sm text-ok">
        Bien escrito · {nota} % de precisión en {total} trazos
      </p>
    )
  }

  return (
    <div className="max-w-xs text-center text-sm">
      {result.countDelta !== 0 ? (
        <p className="text-accent">
          {result.countDelta > 0
            ? `Sobran ${result.countDelta} trazos: son ${total}.`
            : `Faltan ${-result.countDelta} trazos: son ${total}.`}
        </p>
      ) : (
        <p className="text-accent">
          El trazo {result.firstWrong + 1} no cuadra
          {result.perStroke[result.firstWrong]?.reversed ? ', va en el otro sentido' : ''}.
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        Enciende la guía para ver el orden, o repásalo en el trazado animado.
      </p>
    </div>
  )
}

function Btn({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-30 ${
        primary ? 'bg-fg text-ink hover:bg-white' : 'bg-raised hover:bg-line'
      }`}
    >
      {children}
    </button>
  )
}
