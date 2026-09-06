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
import { classOf } from '../src/lib/conjugation.ts'

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
  /** Formas alternativas de la traducción principal que se dan por buenas. */
  a: string[]
  /** Otras acepciones, solo informativas: no se aceptan como respuesta. */
  o: string[]
  /** Nivel JLPT: 5 (más fácil) … 1. */
  l: 1 | 2 | 3 | 4 | 5
  /** Categoría gramatical abreviada: sust., verbo, adj-i, adj-na… */
  p: string
  /** Clase de conjugación, si la palabra se conjuga. */
  c?: string
}

/**
 * Traduce las etiquetas de JMdict a algo legible.
 *
 * Sin esto, 青 y 青い aparecen los dos como «azul» y no hay forma de saber
 * que uno es sustantivo y el otro adjetivo: en N5 hay 33 significados
 * compartidos por 69 palabras, y en N1 son 220 por 488.
 */
function grammarLabel(tags: string[]): string {
  const has = (...names: string[]) => names.some((n) => tags.includes(n))

  // El orden importa. «n-adv» es un sustantivo que además funciona como
  // adverbio —秋, 朝— y comprobar «adverbio» antes lo etiquetaba mal; lo
  // mismo con «adj-no», que marca sustantivos que admiten の, como 青.
  if (has('adj-i')) return 'adj-i'
  if (has('adj-na')) return 'adj-na'
  if (tags.some((t) => /^v[15k]|^vs|^vk|^vz/.test(t))) {
    // Transitivo frente a intransitivo es el par que más confunde: 開く
    // («abrirse») y 開ける («abrir»). Pero JMdict agrupa varias lecturas en
    // una entrada —開く es あく intransitivo y ひらく transitivo— y las
    // etiquetas vienen mezcladas. Si aparecen las dos no se afirma nada:
    // vale más callar que enseñar lo contrario.
    if (has('vt') && has('vi')) return 'verbo'
    if (has('vt')) return 'verbo tr.'
    if (has('vi')) return 'verbo intr.'
    return 'verbo'
  }
  if (has('n', 'n-t', 'n-adv', 'n-suf', 'n-pref')) return 'sust.'
  if (has('adv', 'adv-to')) return 'adverbio'
  if (has('adj-no', 'adj-pn', 'adj-t')) return 'adj.'
  if (has('prt')) return 'partícula'
  if (has('ctr')) return 'contador'
  if (has('conj')) return 'conjunción'
  if (has('int')) return 'interjección'
  if (has('pn')) return 'pronombre'
  if (has('exp')) return 'expresión'
  return ''
}

// ------------------------------------------------- JMdict en español

interface Sense {
  main: string
  alt: string[]
  others: string[]
  pos: string
  /** Etiquetas crudas de JMdict, para deducir la clase de conjugación. */
  tags: string[]
}

/** Indexado por «escritura|lectura», por lectura de palabras sin kanji, y
 *  por lectura a secas como último recurso. */
const byPair = new Map<string, Sense>()
const byReading = new Map<string, Sense>()
const byAnyReading = new Map<string, Sense>()

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')

/** La glosa tal cual viene, con su aclaración entre paréntesis. */
function raw(gloss: string): string {
  return gloss
}

/** Quita la aclaración entre paréntesis, que obligaría a teclearla. */
function clean(gloss: string): string | null {
  const full = decodeEntities(gloss).trim()
  if (!full || full.length > MAX_GLOSS) return null
  if (/\((eng|lit|abr|fre|ger|ita|dut|pt)[:.]/.test(full)) return null
  return full.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim() || full
}

/**
 * Reúne TODAS las acepciones en español de una entrada, no solo la primera.
 *
 * Con una sola palabra, 会う, 合う y 遭う acaban traducidos casi igual, cuando
 * el primero es «quedar con alguien» y el tercero «toparse con algo malo».
 * En el temario hay 481 lecturas compartidas por varias palabras, así que la
 * traducción única se queda corta a menudo.
 */
function collectSenses(entry: string, tags: string[]): Sense | null {
  const originals = [...entry.matchAll(/<gloss xml:lang="spa">(.*?)<\/gloss>/g)].map((m) =>
    decodeEntities(m[1]).trim(),
  )
  const glosses = originals.map(clean).filter((g): g is string => Boolean(g))
  if (!glosses.length) return null
  const firstOriginal = originals.find((o) => clean(o) === glosses[0]) ?? glosses[0]

  const unique = [...new Set(glosses)]
  const [first, ...rest] = unique

  // Las acepciones extra se enseñan pero NO se aceptan como respuesta.
  // JMdict agrupa palabras que comparten entrada, así que entre las de 会う
  // aparecen las de 遭う: dar «tener un accidente» por buena para 会う sería
  // enseñar algo falso.
  return {
    main: first,
    alt: firstOriginal !== first ? [firstOriginal] : [],
    others: rest.slice(0, 3),
    pos: grammarLabel(tags),
    tags,
  }
}

const xml = readFileSync(join(SRC, 'JMdict'), 'utf8')
for (const entry of xml.split('<entry>').slice(1)) {
  const tags = [...new Set([...entry.matchAll(/<pos>&(.*?);<\/pos>/g)].map((m) => m[1]))]
  const sense = collectSenses(entry, tags)
  if (!sense) continue

  const readings = [...entry.matchAll(/<reb>(.*?)<\/reb>/g)].map((m) => m[1])
  const writings = [...entry.matchAll(/<keb>(.*?)<\/keb>/g)].map((m) => m[1])

  for (const r of readings) {
    // La primera entrada gana: JMdict las ordena por relevancia.
    if (!writings.length && !byReading.has(r)) byReading.set(r, sense)
    if (!byAnyReading.has(r)) byAnyReading.set(r, sense)
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
    // Las listas dan a veces varias lecturas separadas por punto y coma
    // —行く es «いく; ゆく»— y compararlas como una sola cadena no casaba
    // con JMdict, así que 行く se perdía pese a ser una palabra de N5.
    const readings = reading
      .split(/[;；]/)
      .map((r) => r.trim())
      .filter(Boolean)
    const kana = readings[0] || word
    if (seen.has(word)) continue
    counted[level]++

    // Primero la pareja exacta escritura+lectura; luego, si la palabra se
    // escribe solo en kana, por lectura. Y como último recurso, por lectura
    // aunque JMdict la guarde con kanji: する aparece allí como 為る y de
    // otro modo se quedaría fuera.
    const sense =
      readings.map((r) => byPair.get(`${word}|${r}`)).find(Boolean) ??
      (word === kana ? byReading.get(kana) : undefined) ??
      (word === kana ? byAnyReading.get(kana) : undefined)
    if (!sense) {
      missing[level]++
      continue
    }

    seen.add(word)
    const cls = classOf(sense.tags)
    records.push({
      w: word,
      r: kana,
      m: sense.main,
      a: sense.alt,
      o: sense.others,
      l: level,
      p: sense.pos,
      ...(cls ? { c: cls } : {}),
    })
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
const conPos = records.filter((r) => r.p).length
const conVarias = records.filter((r) => r.o.length).length
const conClase = records.filter((r) => r.c).length
console.log(`\ncon categoría gramatical: ${conPos} (${Math.round((conPos / records.length) * 100)} %)`)
console.log(`conjugables: ${conClase} (${Math.round((conClase / records.length) * 100)} %)`)
console.log(`con más de una acepción: ${conVarias} (${Math.round((conVarias / records.length) * 100)} %)`)
console.log('\nmuestra de N5:')
for (const r of records.filter((r) => r.l === 5).slice(0, 12)) {
  const extra = r.o.length ? `  · también: ${r.o.join(', ')}` : ''
  console.log(`  ${r.w.padEnd(6)} ${r.r.padEnd(8)} ${r.p.padEnd(11)} → ${r.m}${extra}`)
}
