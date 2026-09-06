/**
 * Genera src/data/vocab.json: palabras escritas solo en kana.
 *
 * Fuente: JMdict (EDRDG). Mismos criterios que el vocabulario de kanji —
 * frecuentes, con traducción al español y sin ambigüedad de lectura.
 *
 * Se toma la LECTURA de la palabra, no su grafía. 猫 se muestra como ねこ:
 * el objetivo del mazo es practicar la lectura de los signos recién
 * aprendidos, y descartar todo lo que normalmente lleva kanji dejaría fuera
 * casi el vocabulario básico entero —gato, montaña, agua— para quedarse con
 * préstamos y partículas.
 *
 * Uso: node --max-old-space-size=4096 --experimental-strip-types \
 *        scripts/build-kana-vocab.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HIRAGANA, KATAKANA } from '../src/data/kana.ts'
import { tokenizeKana } from '../src/lib/tokenize.ts'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

/** Una glosa más larga que esto es una definición, no una traducción. */
const MAX_GLOSS = 40
/** Palabras demasiado largas cansan sin enseñar más. */
const MAX_LENGTH = 6
/**
 * Cuántas se conservan de cada silabario.
 *
 * JMdict da más de ocho mil candidatas válidas, pero este mazo existe para
 * fijar los kana, no para enseñar vocabulario: con unos cientos ya se han
 * leído todos los signos muchas veces, y pasarse convertiría el puente en
 * un curso que competiría con los kanji.
 */
const KEEP_PER_SCRIPT = { hiragana: 300, katakana: 200 }

export interface KanaVocabRecord {
  /** La palabra, solo en kana. */
  w: string
  /** Su romanización. */
  r: string
  /** Traducción al español, sin aclaraciones. */
  m: string
  /** Formas alternativas aceptadas, como la glosa completa con paréntesis. */
  a: string[]
  /** hiragana | katakana, según lo que predomine. */
  s: 'hiragana' | 'katakana'
}

/**
 * Puesto de frecuencia según las bandas «nfXX» de JMdict, donde nf01 es lo
 * más frecuente de la prensa. Sin banda, al final de la cola.
 */
function frequencyRank(entry: string): number {
  const band = /<(ke_pri|re_pri)>nf(\d+)<\/(ke_pri|re_pri)>/.exec(entry)
  return band ? Number(band[2]) : 99
}

const known = new Set([...HIRAGANA, ...KATAKANA].map((k) => k.glyph))
const romajiOf = new Map([...HIRAGANA, ...KATAKANA].map((k) => [k.glyph, k.romaji]))

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')

/**
 * «cara (de una persona)» pide escribir el paréntesis para acertar. Se
 * guarda la forma corta como respuesta y la completa como alternativa, así
 * valen las dos.
 */
function cleanGloss(gloss: string): { main: string; alt: string[] } {
  const stripped = gloss
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const main = stripped || gloss.trim()
  return { main, alt: main === gloss.trim() ? [] : [gloss.trim()] }
}

const isKanji = (ch: string) => {
  const c = ch.codePointAt(0)!
  return c >= 0x4e00 && c <= 0x9fff
}

/**
 * Romaniza componiendo desde la tabla de kana, no con una librería: así la
 * respuesta esperada usa exactamente las mismas romanizaciones que el resto
 * de la aplicación. Las vocales largas (ー) duplican la vocal anterior, y el
 * sokuon (っ) duplica la consonante siguiente.
 */
function romanize(word: string): string | null {
  const chars = [...word]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'ー') {
      const last = out.at(-1)
      if (!last || !'aeiou'.includes(last)) return null
      out += last
      continue
    }
    if (ch === 'っ' || ch === 'ッ') {
      const next = chars[i + 1]
      const pair = next ? romajiOf.get(next + (chars[i + 2] ?? '')) : undefined
      const single = next ? romajiOf.get(next) : undefined
      const following = pair ?? single
      if (!following) return null
      out += following[0]
      continue
    }
    const two = ch + (chars[i + 1] ?? '')
    if (chars[i + 1] && romajiOf.has(two)) {
      out += romajiOf.get(two)!
      i++
      continue
    }
    const one = romajiOf.get(ch)
    if (!one) return null
    out += one
  }
  return out
}

const xml = readFileSync(join(SRC, 'JMdict'), 'utf8')
const seen = new Set<string>()
const records: (KanaVocabRecord & { rank: number })[] = []

for (const entry of xml.split('<entry>').slice(1)) {
  const reading = /<reb>(.*?)<\/reb>/.exec(entry)?.[1]
  if (!reading) continue
  if (!/<(ke_pri|re_pri)>(ichi1|news1|spec1)<\/(ke_pri|re_pri)>/.test(entry)) continue
  // Varias lecturas hacen imposible saber a cuál corresponde el español.
  if ([...entry.matchAll(/<reb>/g)].length > 1) continue

  const chars = [...reading]
  if (chars.length < 2 || chars.length > MAX_LENGTH) continue
  if (chars.some(isKanji)) continue
  if (seen.has(reading)) continue

  // Todos sus signos tienen que estar en el temario de kana.
  const parts = tokenizeKana(reading, known)
  if (!parts.length || !parts.every((p) => known.has(p))) continue

  // JMdict mezcla vocabulario con gramática: partículas, sufijos, auxiliares
  // y conjunciones. «さえ» («incluso») o «がる» («al parecer») no son palabras
  // que sirvan para practicar la lectura de kana recién aprendidos.
  if (/<pos>&(prt|suf|pref|aux|aux-v|aux-adj|conj|cop|int|exp|ctr|num);<\/pos>/.test(entry)) continue
  // Y se exige que sea sustantivo, adjetivo o verbo: lo que se puede
  // traducir por una palabra y dibujar en la cabeza.
  if (!/<pos>&(n|n-t|adj-na|adj-i|adj-no|v1|v5[a-z]|vs|vk);<\/pos>/.test(entry)) continue

  const gloss = /<gloss xml:lang="spa">(.*?)<\/gloss>/.exec(entry)?.[1]
  if (!gloss) continue
  const meaning = decodeEntities(gloss).trim()
  if (!meaning || meaning.length > MAX_GLOSS) continue
  if (/\(.{16,}\)/.test(meaning)) continue
  // «(eng: ...)» y similares son notas de etimología, no la traducción.
  if (/\((eng|lit|abr|fre|ger|ita)[:.]/.test(meaning)) continue

  const romaji = romanize(reading)
  if (!romaji) continue

  const { main, alt } = cleanGloss(meaning)
  if (!main) continue

  seen.add(reading)
  records.push({
    w: reading,
    r: romaji,
    m: main,
    a: alt,
    s: /[ァ-ヺ]/.test(reading) ? 'katakana' : 'hiragana',
    rank: frequencyRank(entry),
  })
}

// Se elige por frecuencia y, a igualdad, por brevedad; luego se ordena para
// estudiar de lo más corto a lo más largo.
const chosen: KanaVocabRecord[] = []
for (const script of ['hiragana', 'katakana'] as const) {
  const pool = records
    .filter((r) => r.s === script)
    .sort((a, b) => a.rank - b.rank || [...a.w].length - [...b.w].length || a.w.localeCompare(b.w))
    .slice(0, KEEP_PER_SCRIPT[script])
  chosen.push(...pool.map(({ rank: _rank, ...rest }) => rest))
}
chosen.sort((a, b) => [...a.w].length - [...b.w].length || a.w.localeCompare(b.w))
writeFileSync('src/data/vocab.json', JSON.stringify(chosen))

const records2 = chosen
const hira = records2.filter((r) => r.s === 'hiragana').length
console.log(`\ncandidatas válidas: ${records.length}`)
console.log(`palabras conservadas: ${records2.length}`)
console.log(`  hiragana: ${hira}   katakana: ${records2.length - hira}`)
console.log(`  longitud media: ${(records2.reduce((n, r) => n + [...r.w].length, 0) / records2.length).toFixed(1)} signos`)
console.log('\nmuestra:')
for (const r of records2.slice(0, 14)) console.log(`  ${r.w.padEnd(7)} ${r.r.padEnd(10)} → ${r.m}`)
