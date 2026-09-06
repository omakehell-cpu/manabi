import { describe, expect, it } from 'vitest'
import { compareHandwriting, compareStroke, resample, type Point } from '../src/lib/handwriting'

/** Una raya horizontal, como el trazo de 一. */
const horizontal: Point[] = [
  { x: 10, y: 54 },
  { x: 99, y: 54 },
]
const vertical: Point[] = [
  { x: 54, y: 10 },
  { x: 54, y: 99 },
]

describe('remuestreo', () => {
  it('devuelve siempre el mismo número de puntos', () => {
    expect(resample(horizontal)).toHaveLength(12)
    expect(resample([{ x: 1, y: 1 }])).toHaveLength(12)
    expect(resample([])).toHaveLength(0)
  })

  it('respeta los extremos del trazo', () => {
    const r = resample(horizontal)
    expect(r[0].x).toBeCloseTo(10)
    expect(r.at(-1)!.x).toBeCloseTo(99)
  })
})

describe('comparación de un trazo', () => {
  it('aprueba un trazo casi idéntico', () => {
    const tembloroso: Point[] = [
      { x: 12, y: 56 },
      { x: 50, y: 52 },
      { x: 97, y: 55 },
    ]
    expect(compareStroke(tembloroso, horizontal).ok).toBe(true)
  })

  it('suspende un trazo en otra dirección', () => {
    expect(compareStroke(vertical, horizontal).ok).toBe(false)
  })

  it('detecta el trazo hecho al revés', () => {
    // Misma forma, sentido contrario: visualmente idéntico, mal escrito.
    const alReves = [...horizontal].reverse()
    const resultado = compareStroke(alReves, horizontal)
    expect(resultado.reversed).toBe(true)
    expect(resultado.ok).toBe(false)
  })
})

describe('comparación del carácter completo', () => {
  const modelo = [horizontal, vertical]

  it('acepta el trazado correcto', () => {
    const r = compareHandwriting([horizontal, vertical], modelo)
    expect(r.firstWrong).toBe(-1)
    expect(r.score).toBeGreaterThan(0.8)
  })

  it('señala cuál es el primer trazo mal hecho', () => {
    const r = compareHandwriting([horizontal, horizontal], modelo)
    expect(r.firstWrong).toBe(1)
  })

  it('penaliza el orden invertido, aunque el dibujo final sea el mismo', () => {
    const correcto = compareHandwriting([horizontal, vertical], modelo)
    const desordenado = compareHandwriting([vertical, horizontal], modelo)
    expect(desordenado.score).toBeLessThan(correcto.score)
  })

  it('cuenta los trazos que faltan o sobran', () => {
    expect(compareHandwriting([horizontal], modelo).countDelta).toBe(-1)
    expect(compareHandwriting([horizontal, vertical, horizontal], modelo).countDelta).toBe(1)
  })
})
