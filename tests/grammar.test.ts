import { describe, expect, it } from 'vitest'
import { GRAMMAR, answerOf, blanked, plain } from '../src/data/grammar'

const all = GRAMMAR.flatMap((l) => l.points)

describe('temario de gramática', () => {
  it('cubre los niveles en orden, de N5 hacia arriba', () => {
    expect(GRAMMAR.map((l) => l.level)).toEqual([...GRAMMAR.map((l) => l.level)].sort((a, b) => b - a))
    expect(GRAMMAR[0].level).toBe(5)
  })

  it('no repite identificadores', () => {
    const ids = all.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada punto tiene explicación, formación y al menos un ejemplo', () => {
    for (const p of all) {
      expect(p.meaning, p.id).toBeTruthy()
      expect(p.form, p.id).toBeTruthy()
      expect(p.note.length, p.id).toBeGreaterThan(20)
      expect(p.examples.length, p.id).toBeGreaterThan(0)
    }
  })

  it('todos los ejemplos marcan la parte que se practica', () => {
    for (const p of all) {
      for (const e of p.examples) {
        expect(/\{[^}]+\}/.test(e.jp), `${p.id}: ${e.jp}`).toBe(true)
        expect(e.es, p.id).toBeTruthy()
      }
    }
  })

  it('no se cuela ningún carácter que no sea japonés ni español', () => {
    // Escribiendo a mano es fácil que entre un carácter de otro alfabeto:
    // se coló un 참 coreano en la explicación de un punto de N3.
    const hangulOrCyrillic = /[\uAC00-\uD7AF\u0400-\u04FF]/
    for (const p of all) {
      const texto = [p.pattern, p.reading, p.meaning, p.form, p.note, ...(p.alt ?? [])].join(' ')
      expect(hangulOrCyrillic.test(texto), `${p.id}: ${texto}`).toBe(false)
      for (const e of p.examples) {
        expect(hangulOrCyrillic.test(e.jp + e.es), p.id).toBe(false)
      }
    }
  })

  it('los ejemplos están en japonés y las traducciones en español', () => {
    for (const p of all) {
      for (const e of p.examples) {
        expect(/[ぁ-ゖァ-ヺ一-鿿]/.test(e.jp), `${p.id}: ${e.jp}`).toBe(true)
        expect(/[ぁ-ゖァ-ヺ一-鿿]/.test(e.es), `${p.id}: ${e.es}`).toBe(false)
      }
    }
  })
})

describe('cobertura del temario', () => {
  it('están los cinco niveles', () => {
    expect(GRAMMAR.map((l) => l.level)).toEqual([5, 4, 3, 2, 1])
  })

  it('cada nivel tiene un temario con cuerpo', () => {
    for (const l of GRAMMAR) {
      expect(l.points.length, `N${l.level}`).toBeGreaterThanOrEqual(30)
    }
  })

  it('no se repite un patrón entre niveles', () => {
    const patterns = all.map((p) => p.pattern)
    const dup = patterns.filter((x, i) => patterns.indexOf(x) !== i)
    expect(dup).toEqual([])
  })
})

describe('huecos', () => {
  it('quita las llaves para mostrar la frase entera', () => {
    expect(plain('私{は}学生です。')).toBe('私は学生です。')
  })

  it('sustituye la parte practicada por un hueco', () => {
    expect(blanked('私{は}学生です。')).toBe('私＿学生です。')
  })

  it('extrae la respuesta', () => {
    expect(answerOf('私{は}学生です。')).toBe('は')
  })

  it('cada punto genera un hueco con respuesta', () => {
    for (const p of all) {
      const answer = answerOf(p.examples[0].jp)
      expect(answer.length, p.id).toBeGreaterThan(0)
      expect(blanked(p.examples[0].jp), p.id).toContain('＿')
    }
  })
})
