/**
 * Verificación headless de la capa de datos: siembra, FSRS y —sobre todo—
 * las reglas de desbloqueo, que son la parte con lógica de verdad.
 *
 * Se ejecuta con `npm run check`, sin abrir Electron.
 */
import { rmSync } from 'node:fs'
import { openDatabase, getQueue, gradeCard, getDeckStats, getOverview } from '../electron/db'

const DB = process.env.CHECK_DB ?? '/tmp/manabi-check.db'
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(DB + suffix)
  } catch {
    /* no existía */
  }
}

let failures = 0
function expect(label: string, actual: unknown, predicate: (v: any) => boolean, hint: string) {
  const ok = predicate(actual)
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : `  ← ${hint}`}`)
}

openDatabase(DB)

console.log('\nSiembra')
const stats0 = getDeckStats()
for (const d of stats0) {
  console.log(
    `  ${d.slug.padEnd(9)} total ${String(d.total).padStart(3)}  bloqueadas ${String(d.locked).padStart(3)}  pendientes ${String(d.due).padStart(3)}`,
  )
}
// 104 kana × 2 cartas = 208. Katakana: 104×2 + 25 extendidos×1 = 233.
expect('cartas hiragana', stats0.find((d) => d.slug === 'hiragana')?.total, (v) => v === 208, 'esperado 208')
expect('cartas katakana', stats0.find((d) => d.slug === 'katakana')?.total, (v) => v === 233, 'esperado 233')
expect('cartas vocab', stats0.find((d) => d.slug === 'vocab')?.total, (v) => v === 180, 'esperado 90×2')

console.log('\nEstado de arranque')
const q0 = getQueue('hiragana', 500)
expect('solo gojūon en cola', [...new Set(q0.map((c) => c.block))], (v) => v.length === 1 && v[0] === 'gojuon', 'no deben abrirse dakuten ni yōon')
expect('solo reconocimiento', [...new Set(q0.map((c) => c.cardType))], (v) => v.length === 1 && v[0] === 'recognition', 'la evocación nace bloqueada')
expect('cola gojūon', q0.length, (v) => v === 46, 'los 46 signos básicos')
expect('vocab cerrado', getQueue('vocab', 500).length, (v) => v === 0, 'ninguna palabra antes de saber kana')

console.log('\nAsentando el gojūon hiragana…')
for (let round = 0; round < 10; round++) {
  const q = getQueue('hiragana', 500).filter((c) => c.block === 'gojuon' && c.cardType === 'recognition')
  if (!q.length) break
  for (const c of q) gradeCard(c.cardId, 4, 1500)
}

const q1 = getQueue('hiragana', 500)
const blocks1 = [...new Set(q1.map((c) => c.block))]
const types1 = [...new Set(q1.map((c) => c.cardType))]
console.log('\nDespués del gojūon')
expect('se abre dakuten', blocks1, (v) => v.includes('dakuten'), 'la regla de bloques no disparó')
expect('yōon sigue cerrado', blocks1, (v) => !v.includes('yoon'), 'no debe saltarse un bloque')
expect('se abre la evocación', types1, (v) => v.includes('recall'), 'rōmaji→kana tras reconocer')

const vq = getQueue('vocab', 500)
const conKatakana = vq.filter((c) => /[ァ-ヶ]/.test(c.glyph))
console.log('\nVocabulario desbloqueado')
console.log('  palabras:', [...new Set(vq.map((c) => c.glyph))].slice(0, 14).join(' ') || '(ninguna)')
expect('alguna palabra abierta', vq.length, (v) => v > 0, 'ねこ, やま… deberían abrirse')
expect('ninguna con katakana', conKatakana.length, (v) => v === 0, 'solo se ha estudiado hiragana')

const soloHiragana = vq.every((c) => /^[ぁ-ゖー]+$/.test(c.glyph))
expect('todas en hiragana puro', soloHiragana, (v) => v === true, 'se coló una palabra no válida')

console.log('\nProgramación FSRS')
const target = getQueue('hiragana', 1)[0]
const r = gradeCard(target.cardId, 3, 1000)
expect('programa al futuro', new Date(r.due).getTime() > Date.now(), (v) => v === true, 'la carta debe volver más tarde')
const o = getOverview()
expect('repasos registrados', o.totalReviews, (v) => v > 0, 'la tabla review está vacía')
expect('racha de un día', o.streak, (v) => v === 1, 'hoy cuenta como día activo')

console.log(failures === 0 ? '\nTodo correcto\n' : `\n${failures} comprobación(es) fallida(s)\n`)
process.exit(failures === 0 ? 0 : 1)
