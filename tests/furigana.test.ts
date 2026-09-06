import { describe, expect, it } from 'vitest'
import { baseReading, isKanjiChar, segment, type Readings } from '../src/lib/furigana'
import KANJI from '../src/data/kanji.json'
import { readFileSync } from 'node:fs'

const table = new Map<string, Readings>(
  (KANJI as { k: string; on?: string[]; kun?: string[] }[]).map((k) => [
    k.k,
    { on: k.on ?? [], kun: k.kun ?? [] },
  ]),
)
const readingsOf = (k: string) => table.get(k)

/** El reparto, escrito como lo escribe un libro de kanji: 中(ちゅう)·学(がく). */
function shape(word: string, reading: string): string | null {
  const parts = segment(word, reading, readingsOf)
  return parts && parts.map((p) => (p.reading ? `${p.text}(${p.reading})` : p.text)).join('·')
}

describe('lectura de las entradas del diccionario', () => {
  it('quita la okurigana y los guiones de prefijo', () => {
    expect(baseReading('さ.げる')).toBe('さ')
    expect(baseReading('-び')).toBe('び')
    expect(baseReading('チュウ')).toBe('ちゅう')
  })
})

describe('reparto de la lectura', () => {
  it('reparte una palabra de lecturas limpias', () => {
    expect(shape('中国人', 'ちゅうごくじん')).toBe('中(ちゅう)·国(ごく)·人(じん)')
  })

  it('acepta la geminación', () => {
    // 学 es ガク, pero ante 校 se cierra en がっ.
    expect(shape('中学校', 'ちゅうがっこう')).toBe('中(ちゅう)·学(がっ)·校(こう)')
  })

  it('acepta el rendaku', () => {
    // 中 es チュウ, pero al final de 一日中 suena じゅう.
    expect(shape('一日中', 'いちにちじゅう')).toBe('一(いち)·日(にち)·中(じゅう)')
  })

  it('deja el kana fuera del reparto', () => {
    expect(shape('食べ物', 'たべもの')).toBe('食(た)·べ·物(もの)')
  })

  it('no reparte lo que no se puede repartir', () => {
    // Jukujikun: おとな no se divide entre 大 y 人. Antes que inventar un
    // corte, no se corta.
    expect(shape('大人', 'おとな')).toBeNull()
    expect(shape('時計', 'とけい')).toBeNull()
  })

  it('no acepta una lectura que sobra o que falta', () => {
    expect(shape('中国', 'ちゅうごくじん')).toBeNull()
    expect(shape('中国人', 'ちゅうごく')).toBeNull()
  })

  it('señala de qué lectura de la ficha sale cada trozo', () => {
    const parts = segment('中学校', 'ちゅうがっこう', readingsOf)!
    expect(parts[0]).toMatchObject({ source: 'チュウ', altered: false })
    expect(parts[1]).toMatchObject({ source: 'ガク', altered: true })
  })
})

describe('cobertura sobre el temario', () => {
  it('reparte la gran mayoría de las palabras de ejemplo', () => {
    const words = JSON.parse(
      readFileSync(new URL('../src/data/kanji-words.json', import.meta.url), 'utf8'),
    ) as { w: string; r: string }[]
    const ok = words.filter((w) => segment(w.w, w.r, readingsOf)).length
    // El resto son jukujikun de verdad, que no admiten reparto.
    expect(ok / words.length).toBeGreaterThan(0.97)
  })
})

describe('qué carácter hay que leer', () => {
  it('distingue los kanji del kana y de la puntuación', () => {
    expect([...'一日中グダグダしてた。'].filter(isKanjiChar).join('')).toBe('一日中')
    expect([...'ねこがいます'].filter(isKanjiChar)).toHaveLength(0)
    expect(isKanjiChar('々')).toBe(false)
  })
})
