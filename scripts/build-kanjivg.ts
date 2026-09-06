/**
 * Genera src/data/kanji-strokes.json: el trazado de cada kanji, en orden.
 *
 * Fuente: KanjiVG, https://github.com/KanjiVG/kanjivg (CC BY-SA 3.0)
 *   curl -LO https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816.xml.gz
 *
 * Se queda solo con los kanji del temario y con el atributo `d` de cada
 * trazo. Todo lo demás del fichero —radicales, tipos de trazo, variantes
 * caligráficas— sobra para animar el trazado y multiplicaría el tamaño.
 *
 * Uso: node --max-old-space-size=4096 --experimental-strip-types \
 *        scripts/build-kanjivg.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

const kanjiList: { k: string }[] = JSON.parse(readFileSync('src/data/kanji.json', 'utf8'))

// KanjiVG también trae los kana, así que las lecciones de hiragana y
// katakana pueden enseñar el trazado igual que las de kanji. Se guardan por
// carácter suelto: los yōon (きゃ) no existen como entrada combinada, y la
// interfaz los dibuja componiendo sus dos caracteres.
const KANA: string[] = []
for (let c = 0x3041; c <= 0x3096; c++) KANA.push(String.fromCodePoint(c))
for (let c = 0x30a1; c <= 0x30fa; c++) KANA.push(String.fromCodePoint(c))

const wanted = new Set([...kanjiList.map((r) => r.k), ...KANA])

const xml = readFileSync(join(SRC, 'kanjivg.xml'), 'utf8')

const strokes: Record<string, string[]> = {}
let variants = 0

for (const block of xml.split('<kanji id="').slice(1)) {
  const id = block.slice(0, block.indexOf('"'))
  // «kvg:kanji_06c34» lleva el codepoint en hexadecimal. Las variantes
  // caligráficas añaden un sufijo (…-Kaisho) y se descartan: interesa la
  // forma estándar, que es la que se enseña.
  const match = /^kvg:kanji_([0-9a-f]+)$/.exec(id)
  if (!match) {
    variants++
    continue
  }

  const glyph = String.fromCodePoint(parseInt(match[1], 16))
  if (!wanted.has(glyph) || strokes[glyph]) continue

  const paths = [...block.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])
  if (paths.length) strokes[glyph] = paths
}

writeFileSync('src/data/kanji-strokes.json', JSON.stringify(strokes))

const covered = Object.keys(strokes).length
const missing = kanjiList.filter((r) => !strokes[r.k]).map((r) => r.k)
const kanaCovered = KANA.filter((k) => strokes[k]).length
const totalPaths = Object.values(strokes).reduce((n, p) => n + p.length, 0)

console.log(`\nkanji con trazado: ${covered - kanaCovered} de ${kanjiList.length}`)
console.log(`kana con trazado: ${kanaCovered} de ${KANA.length}`)
console.log(`trazos en total: ${totalPaths} (media de ${(totalPaths / covered).toFixed(1)} por carácter)`)
console.log(`variantes caligráficas descartadas: ${variants}`)
if (missing.length) console.log(`kanji sin trazado: ${missing.length} → ${missing.slice(0, 20).join('')}`)
