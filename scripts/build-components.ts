/**
 * Genera src/data/components.json: en qué partes se descompone cada kanji.
 *
 * Fuente: KanjiVG, que además de los trazos marca los componentes con
 * `kvg:element` y señala cuál de ellos es el radical.
 *
 * Solo se toman los componentes de primer nivel. 明 se descompone en 日 y 月,
 * y ahí conviene parar: bajar más devuelve trazos sueltos que no significan
 * nada y estorban más que ayudan.
 *
 * Uso: node --max-old-space-size=4096 --experimental-strip-types \
 *        scripts/build-components.ts <dir-fuentes>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
if (!SRC) {
  console.error('Falta el directorio de fuentes.')
  process.exit(1)
}

export interface ComponentRecord {
  /** Parte que compone el kanji. */
  c: string
  /** Dónde va: izquierda, arriba, envolviendo… */
  p?: string
  /** 1 si es el radical clasificador. */
  r?: 1
}

const kanjiList: { k: string }[] = JSON.parse(readFileSync('src/data/kanji.json', 'utf8'))
const wanted = new Set(kanjiList.map((r) => r.k))

const POSITION: Record<string, string> = {
  left: 'izquierda',
  right: 'derecha',
  top: 'arriba',
  bottom: 'abajo',
  nyo: 'envolviendo por abajo',
  tare: 'envolviendo desde arriba',
  kamae: 'rodeando',
}

const xml = readFileSync(join(SRC, 'kanjivg.xml'), 'utf8')
const components: Record<string, ComponentRecord[]> = {}
let sinDescomponer = 0

for (const block of xml.split('<kanji id="').slice(1)) {
  const id = block.slice(0, block.indexOf('"'))
  const match = /^kvg:kanji_([0-9a-f]+)$/.exec(id)
  if (!match) continue

  const glyph = String.fromCodePoint(parseInt(match[1], 16))
  if (!wanted.has(glyph) || components[glyph]) continue

  // KanjiVG numera los grupos de forma plana —g1, g2, g3…— aunque estén
  // anidados, así que el identificador no dice a qué nivel está cada uno.
  // Hay que recorrer las etiquetas contando la profundidad: 語 daba siete
  // piezas (言, 口, 吾, 五, 二, 二, 口) en lugar de las dos que tiene.
  const found: ComponentRecord[] = []
  let depth = 0

  for (const tag of block.matchAll(/<(\/?)g\b([^>]*)>/g)) {
    const closing = tag[1] === '/'
    if (closing) {
      depth--
      continue
    }
    const attrs = tag[2]
    depth++
    // Profundidad 1 es el grupo raíz, el propio carácter; 2 son sus partes.
    if (depth !== 2) continue

    const element = /kvg:element="([^"]+)"/.exec(attrs)?.[1]
    if (!element || element === glyph) continue
    const position = /kvg:position="([^"]+)"/.exec(attrs)?.[1]
    const isRadical = /kvg:radical="/.test(attrs)
    found.push({
      c: element,
      ...(position && POSITION[position] ? { p: POSITION[position] } : {}),
      ...(isRadical ? { r: 1 as const } : {}),
    })
  }

  // Un solo componente igual al carácter no descompone nada.
  if (found.length < 2) {
    sinDescomponer++
    continue
  }
  components[glyph] = found
}

writeFileSync('src/data/components.json', JSON.stringify(components))

const total = Object.keys(components).length
const piezas = new Map<string, number>()
for (const list of Object.values(components)) {
  for (const c of list) piezas.set(c.c, (piezas.get(c.c) ?? 0) + 1)
}
const enElTemario = [...piezas.keys()].filter((c) => wanted.has(c)).length

console.log(`\nkanji descompuestos: ${total} de ${kanjiList.length}`)
console.log(`sin descomponer (una sola pieza): ${sinDescomponer}`)
console.log(`piezas distintas: ${piezas.size}`)
console.log(`  de ellas, kanji del temario: ${enElTemario}`)
console.log(`  el resto son radicales que no existen sueltos: ${piezas.size - enElTemario}`)
console.log('\npiezas más frecuentes:')
for (const [c, n] of [...piezas].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${c}  en ${n} kanji${wanted.has(c) ? '  (está en el temario)' : ''}`)
}
console.log('\nejemplos:')
for (const k of ['明', '休', '語', '思', '海', '曜', '館', '議']) {
  if (components[k]) {
    console.log(`  ${k} = ${components[k].map((c) => c.c + (c.r ? '*' : '')).join(' + ')}`)
  }
}
