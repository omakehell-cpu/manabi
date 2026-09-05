/**
 * Genera src/data/kanji.json a partir de las fuentes externas.
 *
 * No se ejecuta en cada build: las fuentes pesan más de 100 MB y no se
 * versionan. Se corre a mano cuando hay que regenerar el dataset, y el
 * JSON resultante sí va al repositorio para que la app sea autocontenida.
 *
 *   KANJIDIC2   significados (español), lecturas, trazos, grado, frecuencia
 *               https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
 *   kanji-data  listas de kanji por nivel JLPT (de Jonathan Waller)
 *               npm pack kanji-data
 *
 * Uso: node --experimental-strip-types scripts/build-kanji.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ES_FALLBACK } from './kanji-es-fallback.ts'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

export interface KanjiRecord {
  /** El carácter. */
  k: string
  /** Nivel JLPT: 5 (más fácil) … 1. */
  l: 1 | 2 | 3 | 4 | 5
  /** 1 si es jōyō que ninguna lista JLPT recoge; se estudia al final de N1. */
  x: 0 | 1
  /** Significados en español. */
  m: string[]
  /** Lecturas on'yomi (katakana). */
  on: string[]
  /** Lecturas kun'yomi (hiragana, con «.» separando la okurigana). */
  kun: string[]
  /** Número de trazos. */
  s: number
  /** Frecuencia en prensa (1 = más frecuente); 0 si no consta. */
  f: number
  /** Grado escolar japonés. */
  g: number
}

// ---------------------------------------------------------- KANJIDIC2

const xml = readFileSync(join(SRC, 'kanjidic2.xml'), 'utf8')

interface Entry {
  es: string[]
  en: string[]
  on: string[]
  kun: string[]
  strokes: number
  freq: number
  grade: number
}

const dict = new Map<string, Entry>()

for (const block of xml.split('<character>').slice(1)) {
  const literal = /<literal>(.*?)<\/literal>/.exec(block)?.[1]
  if (!literal) continue

  // El rmgroup con las lecturas japonesas; el resto son pinyin y coreano.
  const readings = (tag: string) =>
    [...block.matchAll(new RegExp(`<reading r_type="${tag}"[^>]*>(.*?)</reading>`, 'g'))].map(
      (m) => m[1],
    )

  dict.set(literal, {
    // Sin atributo m_lang, <meaning> es inglés.
    es: [...block.matchAll(/<meaning m_lang="es">(.*?)<\/meaning>/g)].map((m) => m[1]),
    en: [...block.matchAll(/<meaning>(.*?)<\/meaning>/g)].map((m) => m[1]),
    on: readings('ja_on'),
    kun: readings('ja_kun'),
    strokes: Number(/<stroke_count>(\d+)<\/stroke_count>/.exec(block)?.[1] ?? 0),
    freq: Number(/<freq>(\d+)<\/freq>/.exec(block)?.[1] ?? 0),
    grade: Number(/<grade>(\d+)<\/grade>/.exec(block)?.[1] ?? 0),
  })
}

// ------------------------------------------------------ listas JLPT

/** N5 … N1, en el orden en que se estudian. */
const LEVELS = [5, 4, 3, 2, 1] as const
const levelOf = new Map<string, (typeof LEVELS)[number]>()

for (const n of LEVELS) {
  const list: string[] = JSON.parse(
    readFileSync(join(SRC, 'probe/package/data/lists', `jlpt-${n}.json`), 'utf8'),
  )
  for (const k of list) if (!levelOf.has(k)) levelOf.set(k, n)
}

// ------------------------------------------------------------ salida

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

const records: KanjiRecord[] = []
let missingSpanish = 0

for (const [literal, e] of dict) {
  const level = levelOf.get(literal)
  // Grados 1–8 son jōyō; 9 y 10 son jinmeiyō (solo para nombres propios).
  const isJoyo = e.grade >= 1 && e.grade <= 8
  if (!level && !isJoyo) continue

  const meanings = (e.es.length ? e.es : (ES_FALLBACK[literal] ?? [])).map(decodeEntities)
  if (!meanings.length) {
    missingSpanish++
    console.warn(`  sin español: ${literal} (${e.en.slice(0, 3).join(', ')})`)
    continue
  }

  records.push({
    k: literal,
    // Los jōyō que ninguna lista JLPT recoge se estudian al final de N1.
    l: level ?? 1,
    x: level ? 0 : 1,
    m: meanings,
    on: e.on,
    kun: e.kun,
    s: e.strokes,
    f: e.freq,
    g: e.grade,
  })
}

// Dentro de cada nivel: primero los jōyō de las listas, luego los añadidos,
// y en ambos grupos por frecuencia en prensa (los sin datos, al final).
const levelRank = { 5: 0, 4: 1, 3: 2, 2: 3, 1: 4 } as const
records.sort(
  (a, b) =>
    levelRank[a.l] - levelRank[b.l] ||
    a.x - b.x ||
    (a.f || 99999) - (b.f || 99999) ||
    a.s - b.s ||
    a.k.localeCompare(b.k),
)

writeFileSync('src/data/kanji.json', JSON.stringify(records))

const byLevel = new Map<number, number>()
for (const r of records) byLevel.set(r.l, (byLevel.get(r.l) ?? 0) + 1)
let running = 0
console.log('\nkanji por nivel:')
for (const n of LEVELS) {
  const count = byLevel.get(n) ?? 0
  running += count
  const extra = records.filter((r) => r.l === n && r.x === 1).length
  console.log(
    `  N${n}: ${String(count).padStart(4)} nuevos  acumulado ${String(running).padStart(4)}${
      extra ? `   (${extra} jōyō añadidos fuera de las listas JLPT)` : ''
    }`,
  )
}
console.log(`\ntotal: ${records.length} kanji`)
if (missingSpanish) console.log(`descartados por falta de traducción: ${missingSpanish}`)
