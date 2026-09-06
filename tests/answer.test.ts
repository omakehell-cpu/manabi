import { describe, expect, it } from 'vitest'
import { checkAnswer, maskAnswer, normalize, toTargetKana } from '../src/lib/answer'
import { tokenizeKana } from '../src/lib/tokenize'
import { cleanReading } from '../src/lib/speech'
import { HIRAGANA, KATAKANA, toKatakana } from '../src/data/kana'

describe('normalización de respuestas', () => {
  it('ignora acentos, para que «montana» valga por «montaña»', () => {
    expect(normalize('montaña')).toBe(normalize('montana'))
    expect(normalize('DÍA')).toBe(normalize('dia'))
  })

  it('descarta los signos que en rōmaji son ruido', () => {
    expect(normalize("n'")).toBe('n')
    expect(normalize('a-b')).toBe('ab')
  })
})

describe('comprobación de respuestas', () => {
  it('acepta las romanizaciones alternativas', () => {
    expect(checkAnswer('si', 'shi', ['si'], 'romaji').correct).toBe(true)
    expect(checkAnswer('tu', 'tsu', ['tu'], 'romaji').correct).toBe(true)
  })

  it('tolera el artículo inicial en los significados', () => {
    expect(checkAnswer('la casa', 'casa', ['casa'], 'meaning').correct).toBe(true)
  })

  it('convierte a katakana cuando el objetivo lo es', () => {
    expect(toTargetKana('ka', 'カ')).toBe('カ')
    expect(toTargetKana('ka', 'か')).toBe('か')
  })

  it('acepta cualquier lectura del kanji, sea on o kun', () => {
    const readings = ['ニチ', 'ジツ', 'ひ']
    expect(checkAnswer('nichi', 'ニチ', readings, 'reading').correct).toBe(true)
    expect(checkAnswer('hi', 'ニチ', readings, 'reading').correct).toBe(true)
    expect(checkAnswer('kuru', 'ニチ', readings, 'reading').correct).toBe(false)
  })

  it('no da por buena una respuesta parecida pero distinta', () => {
    // El caso que descartó la tolerancia automática a erratas.
    expect(checkAnswer('oeste', 'este', ['este'], 'meaning').correct).toBe(false)
  })
})

describe('pista del segundo intento', () => {
  it('deja la inicial y marca la longitud', () => {
    expect(maskAnswer('día')).toBe('d · ·')
    expect(maskAnswer('rayo de sol')).toBe('r · · ·   · ·   · · ·')
  })

  it('distingue palabras que solo difieren en longitud', () => {
    expect(maskAnswer('este')).not.toBe(maskAnswer('oeste'))
  })

  it('no enmascara lo que destaparía entero', () => {
    expect(maskAnswer('a')).toBe('')
  })
})

describe('tokenización de kana', () => {
  const vocabulary = new Set([...HIRAGANA, ...KATAKANA].map((k) => k.glyph))

  it('trata los yōon como una sola unidad', () => {
    expect(tokenizeKana('おちゃ', vocabulary)).toEqual(['お', 'ちゃ'])
  })

  it('descarta lo que no se estudia: chōonpu y sokuon', () => {
    expect(tokenizeKana('コーヒー', vocabulary)).toEqual(['コ', 'ヒ'])
    expect(tokenizeKana('がっこう', vocabulary)).toEqual(['が', 'こ', 'う'])
  })
})

describe('tablas de kana', () => {
  it('tiene 104 hiragana y 129 katakana', () => {
    expect(HIRAGANA).toHaveLength(104)
    expect(KATAKANA).toHaveLength(129)
  })

  it('deriva el katakana del hiragana por desplazamiento Unicode', () => {
    expect(toKatakana('きゃ')).toBe('キャ')
    expect(toKatakana('ん')).toBe('ン')
  })

  it('no repite ningún signo', () => {
    expect(new Set(HIRAGANA.map((k) => k.glyph)).size).toBe(HIRAGANA.length)
    expect(new Set(KATAKANA.map((k) => k.glyph)).size).toBe(KATAKANA.length)
  })
})

describe('limpieza de lecturas para el audio', () => {
  it('quita las marcas de okurigana', () => {
    expect(cleanReading('つ.ぐ')).toBe('つぐ')
    expect(cleanReading('-び')).toBe('び')
  })
})
