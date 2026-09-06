/**
 * Comparación de trazos a mano alzada contra los de KanjiVG.
 *
 * No intenta reconocer el carácter: sabe cuál se está escribiendo y lo que
 * comprueba es *cómo* se escribe. Por eso valora tres cosas que un simple
 * parecido visual ignoraría, y que son justo lo que hay que aprender:
 *
 *   - el número de trazos,
 *   - el orden en que se hacen,
 *   - y la dirección de cada uno (一 se escribe de izquierda a derecha).
 *
 * Un carácter dibujado de derecha a izquierda se parecería mucho al modelo
 * y sin embargo estaría mal escrito.
 */

export interface Point {
  x: number
  y: number
}

/** Puntos que se muestrean de cada trazo para compararlos. */
const SAMPLES = 12
/** Distancia media tolerada, en unidades del lienzo de KanjiVG (109×109). */
const TOLERANCE = 22
/** A partir de aquí el trazo se considera bien hecho. */
const STROKE_PASS = 0.55

/** Reparte n puntos equiespaciados a lo largo de una polilínea. */
export function resample(points: Point[], n = SAMPLES): Point[] {
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: n }, () => points[0])

  const lengths: number[] = [0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    lengths.push(total)
  }
  if (total === 0) return Array.from({ length: n }, () => points[0])

  const out: Point[] = []
  let cursor = 1
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1)
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor++
    const span = lengths[cursor] - lengths[cursor - 1] || 1
    const t = (target - lengths[cursor - 1]) / span
    out.push({
      x: points[cursor - 1].x + (points[cursor].x - points[cursor - 1].x) * t,
      y: points[cursor - 1].y + (points[cursor].y - points[cursor - 1].y) * t,
    })
  }
  return out
}

/**
 * Cuánto se parece un trazo al modelo, de 0 a 1.
 *
 * Compara punto a punto tras remuestrear ambos, así que un trazo hecho al
 * revés puntúa mal aunque su forma sea idéntica: el primer punto del usuario
 * se compara con el primero del modelo.
 */
export function strokeScore(drawn: Point[], model: Point[]): number {
  const a = resample(drawn)
  const b = resample(model)
  if (!a.length || !b.length) return 0

  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  const average = sum / a.length
  return Math.max(0, 1 - average / TOLERANCE)
}

export interface StrokeResult {
  score: number
  ok: boolean
  /** Si iba mejor al revés: casi siempre significa dirección equivocada. */
  reversed: boolean
}

export function compareStroke(drawn: Point[], model: Point[]): StrokeResult {
  const score = strokeScore(drawn, model)
  const backwards = strokeScore([...drawn].reverse(), model)
  return {
    score: Math.max(score, 0),
    ok: score >= STROKE_PASS,
    reversed: backwards > score + 0.15,
  }
}

export interface HandwritingResult {
  /** Nota global, de 0 a 1. */
  score: number
  perStroke: StrokeResult[]
  /** Índice del primer trazo mal hecho, o -1 si están todos bien. */
  firstWrong: number
  /** Trazos que faltan o sobran respecto al modelo. */
  countDelta: number
}

export function compareHandwriting(drawn: Point[][], model: Point[][]): HandwritingResult {
  const perStroke = model.map((m, i) =>
    drawn[i] ? compareStroke(drawn[i], m) : { score: 0, ok: false, reversed: false },
  )
  const firstWrong = perStroke.findIndex((s) => !s.ok)
  const average = perStroke.length
    ? perStroke.reduce((n, s) => n + s.score, 0) / perStroke.length
    : 0
  // Los trazos de más penalizan: escribir 三 con cuatro rayas no es un acierto.
  const extra = Math.max(0, drawn.length - model.length)
  return {
    score: Math.max(0, average - extra * 0.15),
    perStroke,
    firstWrong,
    countDelta: drawn.length - model.length,
  }
}
