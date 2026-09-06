/**
 * Genera src/data/conjugation.json: el temario de conjugación.
 *
 * No se conjugan las 3214 palabras conjugables del temario, porque la
 * conjugación no se memoriza palabra a palabra: se aprende como regla. Una
 * vez sabes que un godan en く hace いて, lo aplicas a todos.
 *
 * Se eligen entonces unos pocos verbos representativos de CADA clase y cada
 * terminación —que es lo que cambia la regla— y se practican sus formas. Las
 * excepciones se fuerzan a estar: 行く hace って y no いて, いい se conjuga
 * como よい.
 *
 * Uso: node --experimental-strip-types scripts/build-conjugation.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { conjugate, FORMS, formsFor, type WordClass } from '../src/lib/conjugation.ts'

/** Cuántas palabras se practican por cada grupo de regla. */
const PER_GROUP = 8

interface VocabRow {
  w: string
  r: string
  m: string
  l: number
  c?: string
}

export interface ConjugationRecord {
  /** Palabra en forma de diccionario. */
  w: string
  /** Su lectura. */
  r: string
  /** Traducción, para saber de qué verbo se habla. */
  m: string
  /** Clase de conjugación. */
  c: WordClass
  /** Forma que se pide. */
  f: string
  /** Respuesta: la palabra conjugada. */
  a: string
  /** La respuesta en kana. */
  ar: string
  /** Nivel JLPT de la palabra de origen. */
  l: number
}

const vocab: VocabRow[] = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8'))
const conjugables = vocab.filter((v): v is VocabRow & { c: string } => Boolean(v.c))

/**
 * La regla depende de la clase y, en los godan, de la última sílaba: 読む
 * hace んで y 書く hace いて. Cada combinación es un grupo que hay que
 * practicar por separado.
 */
function groupOf(row: VocabRow & { c: string }): string {
  return row.c === 'v5' ? `v5${row.w.at(-1)}` : row.c
}

/** Excepciones que no pueden faltar por muy poco frecuentes que sean. */
const MUST_INCLUDE = ['行く', '良い', '来る', 'する']

const groups = new Map<string, (VocabRow & { c: string })[]>()
for (const row of conjugables) {
  const key = groupOf(row)
  const list = groups.get(key) ?? []
  list.push(row)
  groups.set(key, list)
}

const chosen: (VocabRow & { c: string })[] = []
for (const [, list] of groups) {
  // El vocabulario ya viene ordenado por nivel y frecuencia, así que los
  // primeros de cada grupo son los más útiles.
  const forced = list.filter((r) => MUST_INCLUDE.includes(r.w))
  const rest = list.filter((r) => !MUST_INCLUDE.includes(r.w))
  chosen.push(...forced, ...rest.slice(0, Math.max(0, PER_GROUP - forced.length)))
}

const records: ConjugationRecord[] = []
let skipped = 0

for (const row of chosen) {
  const cls = row.c as WordClass
  // JMdict marca 勉強 como «vs»: es el sustantivo que forma verbo con する.
  // El verbo es 勉強する, así que se le añade antes de conjugar.
  const base = cls === 'vs' && !row.w.endsWith('する') ? `${row.w}する` : row.w
  const baseKana = cls === 'vs' && !row.r.endsWith('する') ? `${row.r}する` : row.r

  for (const form of formsFor(cls)) {
    const written = conjugate(base, cls, form)
    const kana = conjugate(baseKana, cls, form)
    // Si la regla no encaja se descarta en lugar de inventar una forma.
    if (!written || !kana) {
      skipped++
      continue
    }
    records.push({ w: base, r: baseKana, m: row.m, c: cls, f: form, a: written, ar: kana, l: row.l })
  }
}

// Se estudia forma a forma: primero todas las palabras en ます, después
// todas en て. Así se aprende una regla cada vez, no una palabra cada vez.
const formOrder = new Map(FORMS.map((f, i) => [f.id, i]))
records.sort(
  (a, b) =>
    (formOrder.get(a.f) ?? 99) - (formOrder.get(b.f) ?? 99) ||
    b.l - a.l ||
    a.c.localeCompare(b.c) ||
    a.w.localeCompare(b.w),
)

writeFileSync('src/data/conjugation.json', JSON.stringify(records))

console.log(`\ngrupos de regla: ${groups.size}`)
console.log(`palabras elegidas: ${chosen.length}`)
console.log(`cartas de conjugación: ${records.length}`)
if (skipped) console.log(`formas descartadas por no encajar: ${skipped}`)
console.log('\nreparto por grupo:')
for (const [key, list] of [...groups].sort()) {
  const used = chosen.filter((c) => groupOf(c) === key).length
  console.log(`  ${key.padEnd(6)} ${String(used).padStart(2)} de ${list.length} disponibles`)
}
console.log('\nmuestra:')
for (const r of records.slice(0, 10)) {
  console.log(`  ${r.w.padEnd(6)} (${r.m}) · ${r.f.padEnd(11)} → ${r.a}`)
}
