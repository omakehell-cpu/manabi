/**
 * Genera src/data/kanji-words.json: las palabras con las que se fija cada
 * kanji una vez aprendido de forma aislada.
 *
 * Fuente: JMdict (EDRDG), https://www.edrdg.org/pub/Nihongo/JMdict.gz
 *
 * Criterios de selección, todos pedagógicos:
 *
 *  - Solo palabras frecuentes (marcas ichi1 / news1 / spec1 de JMdict).
 *  - Solo palabras cuyos kanji estén TODOS en el temario y ya se hayan
 *    estudiado: nunca aparece una palabra con un kanji de un nivel
 *    posterior. Esta es la razón por la que la selección no puede hacerse
 *    en tiempo de ejecución.
 *  - Con traducción al español; el 24 % de JMdict que solo tiene inglés se
 *    descarta antes que mostrar inglés en una aplicación en español.
 *  - Entre 2 y 4 caracteres, para que la palabra sea abarcable.
 *
 * Cada palabra se asigna a un único kanji «propietario»: el último de sus
 * kanji en el orden de estudio. Así 日本 se desbloquea al llegar al más
 * difícil de 日 y 本, y no antes.
 *
 * Uso: node --max-old-space-size=4096 --experimental-strip-types \
 *        scripts/build-kanji-words.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

/** Cuántas palabras como máximo por kanji. */
const PER_KANJI = 4
/** Una glosa más larga que esto es una definición, no una traducción. */
const MAX_GLOSS = 42

interface KanjiRecord {
  k: string
  l: number
  x: 0 | 1
}

export interface WordRecord {
  /** La palabra escrita. */
  w: string
  /** Su lectura en kana. */
  r: string
  /** Traducción al español. */
  m: string
  /** Kanji al que se asigna: el último en el orden de estudio. */
  k: string
}

const kanjiList: KanjiRecord[] = JSON.parse(readFileSync('src/data/kanji.json', 'utf8'))
/** Posición de cada kanji en el orden global de estudio. */
const order = new Map(kanjiList.map((r, i) => [r.k, i]))

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

const isKanji = (ch: string) => {
  const c = ch.codePointAt(0)!
  return c >= 0x4e00 && c <= 0x9fff
}
const isKana = (s: string) => /^[ぁ-ゖァ-ヺー]+$/.test(s)

const xml = readFileSync(join(SRC, 'JMdict'), 'utf8')
const entries = xml.split('<entry>').slice(1)

const candidates = new Map<string, WordRecord[]>()
let considered = 0

for (const entry of entries) {
  // La primera grafía y la primera lectura son las principales.
  const written = /<keb>(.*?)<\/keb>/.exec(entry)?.[1]
  const pronounced = /<reb>(.*?)<\/reb>/.exec(entry)?.[1]
  if (!written || !pronounced) continue

  if (!/<(ke_pri|re_pri)>(ichi1|news1|spec1)<\/(ke_pri|re_pri)>/.test(entry)) continue

  const chars = [...written]
  if (chars.length < 2 || chars.length > 4) continue
  if (!isKana(pronounced)) continue

  const kanjiIn = chars.filter(isKanji)
  if (!kanjiIn.length) continue
  // Todos sus kanji tienen que estar en el temario.
  if (!kanjiIn.every((c) => order.has(c))) continue
  // Solo kanji y okurigana en hiragana. El katakana junto a kanji suele
  // delatar abreviaturas y contadores (カ国), malos como tarjeta.
  if (!chars.every((c) => isKanji(c) || /[ぁ-ゖー]/.test(c))) continue

  // JMdict agrupa cada idioma en su propio <sense> al final del artículo,
  // sin indicar a qué lectura corresponde. Eso hace imposible alinear la
  // glosa española con una lectura concreta, así que se descartan las
  // entradas con más de una lectura: 一日 es いちにち («un día») y ついたち
  // («primer día del mes»), y no hay forma de saber cuál traduce el español.
  if ([...entry.matchAll(/<reb>/g)].length > 1) continue

  const gloss = /<gloss xml:lang="spa">(.*?)<\/gloss>/.exec(entry)?.[1]
  if (!gloss) continue
  const meaning = decodeEntities(gloss).trim()
  if (!meaning || meaning.length > MAX_GLOSS) continue
  // Las glosas con aclaraciones largas entre paréntesis no sirven de tarjeta.
  if (/\(.{18,}\)/.test(meaning)) continue

  considered++

  // Propietario: el kanji que se aprende más tarde.
  const owner = kanjiIn.reduce((a, b) => (order.get(a)! >= order.get(b)! ? a : b))
  const list = candidates.get(owner) ?? []
  list.push({ w: written, r: pronounced, m: meaning, k: owner })
  candidates.set(owner, list)
}

// Entre las candidatas de cada kanji, las más cortas primero: 日本 enseña
// mejor que 日本経済 y se responde sin castigar al que aún teclea despacio.
const words: WordRecord[] = []
const seen = new Set<string>()
for (const [, list] of candidates) {
  // Los compuestos de solo kanji enseñan más que los mixtos con okurigana
  // (日本 antes que 日に日に), y a igualdad, cuanto más corto mejor.
  const allKanji = (w: string) => ([...w].every(isKanji) ? 0 : 1)
  list.sort(
    (a, b) =>
      allKanji(a.w) - allKanji(b.w) ||
      [...a.w].length - [...b.w].length ||
      a.w.localeCompare(b.w),
  )
  for (const w of list.slice(0, PER_KANJI)) {
    if (seen.has(w.w)) continue
    seen.add(w.w)
    words.push(w)
  }
}

words.sort((a, b) => order.get(a.k)! - order.get(b.k)! || a.w.localeCompare(b.w))
writeFileSync('src/data/kanji-words.json', JSON.stringify(words))

const withWords = new Set(words.map((w) => w.k))
const byLevel = new Map<number, number>()
for (const w of words) {
  const level = kanjiList[order.get(w.k)!].l
  byLevel.set(level, (byLevel.get(level) ?? 0) + 1)
}

console.log(`\ncandidatas que pasan los filtros: ${considered}`)
console.log(`palabras seleccionadas: ${words.length}`)
console.log(`kanji con al menos una palabra: ${withWords.size} de ${kanjiList.length}`)
console.log('\npalabras por nivel:')
for (const n of [5, 4, 3, 2, 1]) console.log(`  N${n}: ${byLevel.get(n) ?? 0}`)
console.log('\nmuestra:')
for (const w of words.slice(0, 10)) console.log(`  ${w.w}  ${w.r}  →  ${w.m}   [${w.k}]`)
