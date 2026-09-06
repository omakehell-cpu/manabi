/**
 * Genera src/data/vocabulary.json: el vocabulario del JLPT por niveles.
 *
 * Dos fuentes que se cruzan:
 *   - Los niveles, de las listas de Jonathan Waller (tanos.co.uk), vía el
 *     repositorio elzup/jlpt-word-list (MIT). Es la misma procedencia que
 *     las listas de kanji, así que ambos temarios encajan.
 *   - Las traducciones, de JMdict (EDRDG), porque esas listas vienen en
 *     inglés y aquí hacen falta en español.
 *
 * Uso: node --max-old-space-size=8192 --experimental-strip-types \
 *        scripts/build-vocabulary.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

const MAX_GLOSS = 46

export interface VocabularyRecord {
  /** La palabra tal y como se escribe. */
  w: string
  /** Su lectura en kana. */
  r: string
  /** Traducción al español. */
  m: string
  /** Traducciones alternativas aceptadas. */
  a: string[]
  /** Nivel JLPT: 5 (más fácil) … 1. */
  l: 1 | 2 | 3 | 4 | 5
}

// ------------------------------------------------- JMdict en español

interface Sense {
  main: string
  alt: string[]
}

/** Indexado por «escritura|lectura» y también solo por lectura. */
const byPair = new Map<string, Sense>()
const byReading = new Map<string, Sense>()

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')

/** «cara (de una persona)» obligaría a teclear el paréntesis para acertar. */
function cleanGloss(gloss: string): Sense | null {
  const full = decodeEntities(gloss).trim()
  if (!full || full.length > MAX_GLOSS) return null
  if (/\((eng|lit|abr|fre|ger|ita|dut|pt)[:.]/.test(full)) return null
  const stripped = full.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim()
  const main = stripped || full
  return { main, alt: main === full ? [] : [full] }
}

const xml = readFileSync(join(SRC, 'JMdict'), 'utf8')
for (const entry of xml.split('<entry>').slice(1)) {
  const spanish = /<gloss xml:lang="spa">(.*?)<\/gloss>/.exec(entry)?.[1]
  if (!spanish) continue
  const sense = cleanGloss(spanish)
  if (!sense) continue

  const readings = [...entry.matchAll(/<reb>(.*?)<\/reb>/g)].map((m) => m[1])
  const writings = [...entry.matchAll(/<keb>(.*?)<\/keb>/g)].map((m) => m[1])

  for (const r of readings) {
    // La primera entrada gana: JMdict las ordena por relevancia.
    if (!writings.length && !byReading.has(r)) byReading.set(r, sense)
    for (const w of writings) {
      const key = `${w}|${r}`
      if (!byPair.has(key)) byPair.set(key, sense)
    }
  }
}

// -------------------------------------------- listas JLPT por nivel

/** Parte una línea CSV respetando las comillas. */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out
}

const LEVELS = [5, 4, 3, 2, 1] as const
const records: VocabularyRecord[] = []
const seen = new Set<string>()
const missing: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
const counted: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

for (const level of LEVELS) {
  const csv = readFileSync(join(SRC, 'jlptvocab', `n${level}.csv`), 'utf8')
  for (const line of csv.split('\n').slice(1)) {
    if (!line.trim()) continue
    const [expression, reading] = splitCsv(line)
    if (!expression || !reading) continue

    const word = expression.trim()
    const kana = reading.trim() || word
    if (seen.has(word)) continue
    counted[level]++

    // Se busca primero la pareja exacta escritura+lectura; si la palabra se
    // escribe solo en kana, basta la lectura.
    const sense = byPair.get(`${word}|${kana}`) ?? (word === kana ? byReading.get(kana) : undefined)
    if (!sense) {
      missing[level]++
      continue
    }

    seen.add(word)
    records.push({ w: word, r: kana, m: sense.main, a: sense.alt, l: level })
  }
}

writeFileSync('src/data/vocabulary.json', JSON.stringify(records))

console.log('\nvocabulario por nivel:')
let running = 0
for (const n of LEVELS) {
  const kept = records.filter((r) => r.l === n).length
  running += kept
  const pct = Math.round((kept / counted[n]) * 100)
  console.log(
    `  N${n}: ${String(kept).padStart(4)} de ${String(counted[n]).padStart(4)} (${pct} % con español)  acumulado ${running}`,
  )
}
console.log(`\ntotal: ${records.length} palabras`)
console.log('\nmuestra de N5:')
for (const r of records.filter((r) => r.l === 5).slice(0, 10)) {
  console.log(`  ${r.w.padEnd(6)} ${r.r.padEnd(8)} → ${r.m}`)
}
