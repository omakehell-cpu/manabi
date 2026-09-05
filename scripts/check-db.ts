/**
 * Verificación headless de la capa de datos: siembra, FSRS y —sobre todo—
 * las reglas de desbloqueo, que son la parte con lógica de verdad.
 *
 * Se ejecuta con `npm run check`, sin abrir Electron.
 */
import { readFileSync, rmSync } from 'node:fs'
import {
  openDatabase,
  getQueue,
  gradeCard,
  getDeckStats,
  getOverview,
  newPerDay,
  setNewPerDay,
  newIntroducedToday,
  browseKanji,
  kanjiDetail,
  listLeeches,
  reviveCard,
  getForecast,
  kanjiStrokes,
} from '../electron/db'

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
// Ya no se sirven los 46 de golpe: el cupo diario los reparte en tandas.
expect('la primera tanda respeta el cupo', q0.length, (v) => v === 20, 'esperado el tope diario')
expect('vocab cerrado', getQueue('vocab', 500).length, (v) => v === 0, 'ninguna palabra antes de saber kana')

// El resto de comprobaciones necesita avanzar niveles enteros, cosa que el
// cupo impide a propósito. Se levanta aquí y se restaura al probarlo.
setNewPerDay(9999)

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

// ------------------------------------------------------------- kanji

console.log('\nKanji: siembra')
const kanjiDecks = getDeckStats().filter((d) => d.kind === 'kanji')
for (const d of kanjiDecks) {
  console.log(
    `  ${d.slug.padEnd(9)} total ${String(d.total).padStart(4)}  bloqueadas ${String(d.locked).padStart(4)}  pendientes ${String(d.due).padStart(3)}`,
  )
}
const n5 = kanjiDecks.find((d) => d.slug === 'kanji-n5')!
// 79 kanji × 2 cartas (significado y lectura) + las palabras que introducen.
expect('N5: 158 cartas de kanji + palabras', n5.total, (v) => v > 158, 'esperado 158 más las palabras')
expect('N5 tiene palabras asociadas', n5.total - 158, (v) => v > 0, 'faltan las palabras de ejemplo')
expect('N5 abierto de entrada', n5.due, (v) => v === 79, 'solo los significados')
expect(
  'niveles superiores cerrados',
  kanjiDecks.filter((d) => d.slug !== 'kanji-n5').every((d) => d.due === 0),
  (v) => v === true,
  'N4–N1 no deben abrirse todavía',
)

const kq = getQueue('kanji-n5', 500)
expect('solo significados', [...new Set(kq.map((c) => c.cardType))], (v) => v.length === 1 && v[0] === 'meaning', 'la lectura espera al significado')
console.log('  primeros por frecuencia:', kq.slice(0, 10).map((c) => c.glyph).join(' '))

console.log('\nAsentando los significados de N5…')
for (let round = 0; round < 10; round++) {
  const q = getQueue('kanji-n5', 500).filter((c) => c.cardType === 'meaning')
  if (!q.length) break
  for (const c of q) gradeCard(c.cardId, 4, 1500)
}

const kq2 = getQueue('kanji-n5', 500)
expect('se abre la lectura', [...new Set(kq2.map((c) => c.cardType))], (v) => v.includes('reading'), 'tras el significado toca la lectura')
const n4after = getDeckStats().find((d) => d.slug === 'kanji-n4')!
expect('se abre N4', n4after.due, (v) => v > 0, 'N4 debe abrirse al 80 % de N5')
const n3after = getDeckStats().find((d) => d.slug === 'kanji-n3')!
expect('N3 sigue cerrado', n3after.due, (v) => v === 0, 'no debe saltarse un nivel')

const n1 = getDeckStats().find((d) => d.slug === 'kanji-n1')!
expect('N1 cerrado', n1.due, (v) => v === 0, 'aún queda mucho para N1')

console.log('\nKanji: palabras')
const wordsBefore = getQueue('kanji-n5', 999).filter((c) => c.cardType === 'word')
expect('sin palabras todavía', wordsBefore.length, (v) => v === 0, 'las palabras esperan a la lectura')

console.log('Asentando también las lecturas de N5…')
for (let round = 0; round < 10; round++) {
  const q = getQueue('kanji-n5', 999).filter((c) => c.cardType === 'reading')
  if (!q.length) break
  for (const c of q) gradeCard(c.cardId, 4, 1500)
}

const wordsAfter = getQueue('kanji-n5', 999).filter((c) => c.cardType === 'word')
expect('se abren las palabras', wordsAfter.length, (v) => v > 0, 'tras dominar el kanji aislado')
console.log('  ejemplos:', wordsAfter.slice(0, 8).map((c) => `${c.glyph}(${c.reading})`).join(' '))

// Ninguna palabra puede exigir un kanji que aún no toca.
const openKanji = new Set(
  getQueue('kanji-n5', 999)
    .concat(getQueue('kanji-n4', 999))
    .map((c) => c.glyph),
)
const n5Kanji = new Set(
  (JSON.parse(readFileSync('src/data/kanji.json', 'utf8')) as { k: string; l: number }[])
    .filter((r) => r.l === 5)
    .map((r) => r.k),
)
const leaky = wordsAfter.filter((c) =>
  [...c.glyph].some((ch) => /[\u4e00-\u9fff]/.test(ch) && !n5Kanji.has(ch)),
)
expect('ninguna usa kanji de niveles posteriores', leaky.length, (v) => v === 0,
  leaky.length ? `p. ej. ${leaky[0].glyph}` : '')
void openKanji

// ------------------------------------------- ritmo y bucle de aprendizaje

console.log('\nCupo de cartas nuevas')
setNewPerDay(20)
expect('valor por defecto', newPerDay(), (v) => v === 20, 'esperado 20')

setNewPerDay(5)
const limited = getQueue('katakana', 40)
expect('la cola respeta el cupo', limited.length, (v) => v === 5, 'debía servir solo 5 nuevas')

for (const c of limited) gradeCard(c.cardId, 3, 1000)
expect('se contabilizan como estrenadas hoy', newIntroducedToday('katakana'), (v) => v === 5, 'esperado 5')
expect(
  'agotado el cupo, no entran más nuevas',
  getQueue('katakana', 40, 0).filter((c) => c.state === 0).length,
  (v) => v === 0,
  'el tope no se está aplicando',
)

const kStats = getDeckStats().find((d) => d.slug === 'katakana')!
expect('las estadísticas reflejan el cupo', kStats.newRemaining, (v) => v === 0, 'debería anunciar 0 nuevas')

console.log('\nBucle de aprendizaje')
// Las recién acertadas vuelven a los 10 minutos: sin adelanto no deben
// aparecer, con adelanto sí. Es lo que permite repetirlas en la sesión.
const strict = getQueue('katakana', 40, 0)
const ahead = getQueue('katakana', 40, 20)
expect('sin adelanto no hay nada que servir', strict.length, (v) => v === 0, 'no deberían haber vencido')
expect('con adelanto vuelven las de aprendizaje', ahead.length, (v) => v === 5, 'FSRS las puso a 10 min')
expect(
  'y son las mismas cartas',
  ahead.every((c) => limited.some((l) => l.cardId === c.cardId)),
  (v) => v === true,
  'deberían ser las recién estudiadas',
)

setNewPerDay(20)

// --------------------------------------------------------- explorador

console.log('\nExplorador')
expect('lista el temario completo', browseKanji().length, (v) => v === 2383, 'esperado 2383')
expect('filtra por nivel', browseKanji({ level: 5 }).length, (v) => v === 79, 'N5 son 79')

// Buscar por el carácter, por significado en español y por lectura. El
// renderer convierte «sui» a すい/スイ antes de consultar; aquí se simula.
expect('busca por carácter', browseKanji({ terms: ['水'] }).map((k) => k.glyph), (v) => v.includes('水'), 'debía encontrarse')
const agua = browseKanji({ terms: ['agua'] })
expect('busca por significado español', agua.map((k) => k.glyph), (v) => v.includes('水'), '«agua» debía dar 水')
const sui = browseKanji({ terms: ['スイ'] })
expect('busca por lectura', sui.map((k) => k.glyph), (v) => v.includes('水'), '«スイ» debía dar 水')

const detail = kanjiDetail('水')
expect('la ficha existe', detail !== null, (v) => v === true, '水 debería tener ficha')
expect('trae significados en español', detail?.meanings ?? [], (v) => v.includes('agua'), '')
expect('trae lecturas on', detail?.on ?? [], (v) => v.length > 0, '')
console.log(`  水 → ${detail?.meanings.join(', ')} | ON ${detail?.on.join(' ')} | KUN ${detail?.kun.join(' ')} | ${detail?.words.length} palabras`)

// El estado tiene que reflejar lo estudiado en esta misma sesión.
const browsedN5 = browseKanji({ level: 5 })
const mature = browsedN5.filter((k) => k.progress === 'mature').length
expect('refleja el progreso real', mature, (v) => v > 0, 'se asentó N5 más arriba')
expect('ningún N5 sigue bloqueado', browsedN5.filter((k) => k.progress === 'locked').length, (v) => v === 0, '')
expect('los de N1 sí', browseKanji({ level: 1 }).every((k) => k.progress === 'locked'), (v) => v === true, '')

// ---------------------------------------------- apartadas y previsión

console.log('\nCartas apartadas')
expect('de entrada no hay ninguna', listLeeches().length, (v) => v === 0, '')

// Fallar la misma carta hasta pasar el umbral de ocho lapsus.
const victim = getQueue('hiragana', 1, 999)[0]
let suspendedAt = 0
for (let i = 1; i <= 12 && !suspendedAt; i++) {
  if (gradeCard(victim.cardId, 1, 800).suspended) suspendedAt = i
}
expect('se aparta al octavo fallo', suspendedAt, (v) => v === 8, 'el umbral es 8')

const leeches = listLeeches()
expect('aparece en la lista', leeches.length, (v) => v === 1, '')
expect('se identifica bien', leeches[0]?.glyph, (v) => v === victim.glyph, '')
expect('registra los fallos', leeches[0]?.failures, (v) => v >= 8, '')
expect('ya no se sirve', getQueue('hiragana', 999, 999).some((c) => c.cardId === victim.cardId), (v) => v === false, 'una carta apartada no debe salir')

reviveCard(victim.cardId)
expect('al devolverla desaparece de la lista', listLeeches().length, (v) => v === 0, '')
expect('y vuelve a la circulación', getQueue('hiragana', 999, 999).some((c) => c.cardId === victim.cardId), (v) => v === true, '')

// Lo importante: el umbral sube, así que un solo fallo no la aparta otra vez.
const again = gradeCard(victim.cardId, 1, 800)
expect('no se aparta al primer tropiezo', again.suspended, (v) => v === false, 'el margen no se amplió')

console.log('\nPrevisión de carga')
const fc = getForecast(14)
expect('devuelve 14 días', fc.days.length, (v) => v === 14, '')
expect('hay repasos programados', fc.days.reduce((n, d) => n + d.count, 0), (v) => v > 0, 'se ha estudiado bastante arriba')
expect('las fechas están ordenadas', fc.days.map((d) => d.day), (v) => v.join() === [...v].sort().join(), '')
const withLoad = fc.days.filter((d) => d.count > 0).length
console.log(`  ${fc.overdue} atrasados · ${fc.days.reduce((n, d) => n + d.count, 0)} repasos repartidos en ${withLoad} días`)

// Las cartas nuevas no deben contarse: su fecha aún no está decidida.
const untouched = getForecast(14).days.reduce((n, d) => n + d.count, 0)
const newCards = browseKanji({ level: 1 }).length
expect('no cuenta las cartas sin estrenar', untouched < newCards * 2, (v) => v === true, 'estaría inflando la previsión')

console.log('\nOrden de trazos')
const water = kanjiStrokes('水')
expect('水 tiene trazado', water.length, (v) => v === 4, '水 son 4 trazos')
expect('son comandos SVG', water.every((d) => /^M[\d.]/.test(d)), (v) => v === true, 'cada trazo empieza con un moveto')

// La cobertura importa: un hueco deja la ficha coja justo en el kanji raro,
// que es donde más falta hace ver cómo se escribe.
const allKanji = JSON.parse(readFileSync('src/data/kanji.json', 'utf8')) as { k: string; s: number }[]
const sinTrazado = allKanji.filter((r) => kanjiStrokes(r.k).length === 0)
expect('ninguno se queda sin trazado', sinTrazado.length, (v) => v === 0,
  sinTrazado.length ? sinTrazado.slice(0, 10).map((r) => r.k).join('') : '')

// El número de trazos de KanjiVG debe cuadrar con el que dice KANJIDIC2.
const desajuste = allKanji.filter((r) => r.s > 0 && kanjiStrokes(r.k).length !== r.s)
console.log(`  ${allKanji.length} kanji · ${desajuste.length} con recuento distinto al de KANJIDIC2`)
expect('los recuentos concuerdan', desajuste.length / allKanji.length, (v) => v < 0.05,
  desajuste.length ? `p. ej. ${desajuste[0].k}: ${kanjiStrokes(desajuste[0].k).length} vs ${desajuste[0].s}` : '')

console.log(failures === 0 ? '\nTodo correcto\n' : `\n${failures} comprobación(es) fallida(s)\n`)
process.exit(failures === 0 ? 0 : 1)
