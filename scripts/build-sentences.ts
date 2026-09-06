/**
 * Genera src/data/sentences.json: una frase de ejemplo por kanji.
 *
 * Fuente: Tatoeba (CC BY 2.0 FR), https://tatoeba.org
 *   sentences.tar.bz2            todas las frases, con su idioma
 *   jpn-spa_links.tsv.bz2        qué frase japonesa traduce cuál española
 *
 * Misma regla que las palabras de ejemplo: una frase solo se admite si
 * TODOS sus kanji pertenecen a niveles ya estudiados cuando aparece. Sin
 * eso, la frase de 日 podría traer 曜 y dejar de ser un ejemplo para
 * convertirse en un muro.
 *
 * Uso: node --max-old-space-size=8192 --experimental-strip-types \
 *        scripts/build-sentences.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

/** Más largo que esto deja de ser un ejemplo y pasa a ser un texto. */
const MAX_JP = 28
/** Menos que esto no llega a ser una frase. */
const MIN_JP = 6
/** Traducciones desproporcionadas suelen indicar un emparejamiento flojo. */
const MAX_ES = 90

export interface SentenceRecord {
  /** La frase en japonés. */
  j: string
  /** Su traducción al español. */
  e: string
  /** Kanji al que se asigna: el último de la frase en el orden de estudio. */
  k: string
}

const kanjiList: { k: string }[] = JSON.parse(readFileSync('src/data/kanji.json', 'utf8'))
const order = new Map(kanjiList.map((r, i) => [r.k, i]))

const isKanji = (ch: string) => {
  const c = ch.codePointAt(0)!
  return c >= 0x4e00 && c <= 0x9fff
}

// --- frases por identificador

const jpn = new Map<string, string>()
const spa = new Map<string, string>()

for (const line of readFileSync(join(SRC, 'sent-jpn-spa.tsv'), 'utf8').split('\n')) {
  const tab1 = line.indexOf('\t')
  if (tab1 < 0) continue
  const tab2 = line.indexOf('\t', tab1 + 1)
  if (tab2 < 0) continue
  const id = line.slice(0, tab1)
  const lang = line.slice(tab1 + 1, tab2)
  const text = line.slice(tab2 + 1).trim()
  if (!text) continue
  if (lang === 'jpn') jpn.set(id, text)
  else if (lang === 'spa') spa.set(id, text)
}

// --- emparejar y filtrar

const candidates = new Map<string, SentenceRecord[]>()
let pairs = 0

for (const line of readFileSync(join(SRC, 'jpn-spa.tar'), 'utf8').split('\n')) {
  const tab = line.indexOf('\t')
  if (tab < 0) continue
  const japanese = jpn.get(line.slice(0, tab))
  const spanish = spa.get(line.slice(tab + 1).trim())
  if (!japanese || !spanish) continue
  pairs++

  const chars = [...japanese]
  if (chars.length < MIN_JP || chars.length > MAX_JP) continue
  if (spanish.length > MAX_ES) continue

  const kanjiIn = [...new Set(chars.filter(isKanji))]
  // Sin kanji no sirve como ejemplo de ningún kanji.
  if (!kanjiIn.length) continue
  if (!kanjiIn.every((c) => order.has(c))) continue

  const owner = kanjiIn.reduce((a, b) => (order.get(a)! >= order.get(b)! ? a : b))
  const list = candidates.get(owner) ?? []
  list.push({ j: japanese, e: spanish, k: owner })
  candidates.set(owner, list)
}

// Las más cortas primero: una frase de ejemplo se lee de un vistazo o no
// cumple su función.
const sentences: SentenceRecord[] = []
for (const [, list] of candidates) {
  list.sort((a, b) => [...a.j].length - [...b.j].length || a.j.localeCompare(b.j))
  sentences.push(list[0])
}
sentences.sort((a, b) => order.get(a.k)! - order.get(b.k)!)

writeFileSync('src/data/sentences.json', JSON.stringify(sentences))

console.log(`\nfrases japonés–español emparejadas: ${pairs}`)
console.log(`kanji con frase de ejemplo: ${sentences.length} de ${kanjiList.length}`)
console.log(`longitud media: ${(sentences.reduce((n, s) => n + [...s.j].length, 0) / sentences.length).toFixed(1)} caracteres`)
console.log('\nmuestra:')
for (const s of sentences.slice(0, 8)) console.log(`  [${s.k}] ${s.j}\n        ${s.e}`)
