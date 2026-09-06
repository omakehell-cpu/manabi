import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, rmSync } from 'node:fs'
import {
  openDatabase,
  getQueue,
  getLessons,
  markPresented,
  gradeCard,
  getDeckStats,
  getOverview,
  newPerDay,
  setNewPerDay,
  newIntroducedToday,
  lessonBatchSize,
  browseKanji,
  kanjiDetail,
  kanjiStrokes,
  listLeeches,
  reviveCard,
  getForecast,
  undoLastReview,
  canUndo,
  getCard,
  previewIntervals,
  suspendCard,
  retention,
  setRetention,
} from '../electron/db'

const DB = '/tmp/manabi-tests.db'

/** Presenta todo lo que un mazo tenga disponible. */
function presentAll(slug: string): void {
  for (let i = 0; i < 600; i++) {
    const batch = getLessons(slug, 100)
    if (!batch.length) return
    markPresented(batch.map((c) => c.cardId))
  }
}

/**
 * Repasa con nota máxima lo que cumpla el filtro, hasta agotarlo. El filtro
 * recibe la carta entera y no solo su tipo: asentar de más abre el bloque
 * siguiente, y entonces ya no se puede comprobar que estaba cerrado.
 */
function drill(
  slug: string,
  keep: (card: { cardType: string; block: string }) => boolean,
  rounds = 10,
): void {
  for (let i = 0; i < rounds; i++) {
    presentAll(slug)
    const queue = getQueue(slug, 999).filter(keep)
    if (!queue.length) return
    for (const card of queue) gradeCard(card.cardId, 4, 1500)
  }
}

const kanjiData = JSON.parse(readFileSync('src/data/kanji.json', 'utf8')) as {
  k: string
  l: number
  s: number
}[]

beforeAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(DB + suffix)
    } catch {
      /* no existía */
    }
  }
  openDatabase(DB)
})

describe('siembra', () => {
  it('crea las cartas de cada mazo', () => {
    const stats = getDeckStats()
    const by = (slug: string) => stats.find((d) => d.slug === slug)!
    // 104 kana × 2 cartas; el katakana suma 25 extendidos que no piden evocación.
    expect(by('hiragana').total).toBe(208)
    expect(by('katakana').total).toBe(233)
    // 434 palabras generadas desde JMdict, con dos cartas cada una.
    expect(by('vocab').total).toBe(868)
    expect(by('kanji-n5').characters).toBe(79)
  })
})

describe('lecciones: nada se examina sin presentarse', () => {
  it('la cola arranca vacía', () => {
    expect(getQueue('hiragana', 500)).toHaveLength(0)
  })

  it('la tanda por defecto son cinco', () => {
    expect(lessonBatchSize()).toBe(5)
    expect(getLessons('hiragana')).toHaveLength(5)
  })

  it('solo lo presentado llega al examen', () => {
    const batch = getLessons('hiragana')
    expect(batch.map((c) => c.glyph)).toEqual(['あ', 'い', 'う', 'え', 'お'])
    markPresented(batch.map((c) => c.cardId))

    const queue = getQueue('hiragana', 500)
    expect(queue).toHaveLength(5)
    expect(queue.every((c) => batch.some((b) => b.cardId === c.cardId))).toBe(true)
  })

  it('los kanji se presentan igual, y solo el significado', () => {
    const batch = getLessons('kanji-n5')
    expect(batch.length).toBeGreaterThan(0)
    expect([...new Set(batch.map((c) => c.cardType))]).toEqual(['meaning'])
  })
})

describe('progresión por bloques', () => {
  beforeAll(() => {
    // El cupo diario se prueba aparte; aquí estorbaría.
    setNewPerDay(9999)
    presentAll('hiragana')
  })

  it('empieza solo por el gojūon y por el reconocimiento', () => {
    const queue = getQueue('hiragana', 500)
    expect([...new Set(queue.map((c) => c.block))]).toEqual(['gojuon'])
    expect([...new Set(queue.map((c) => c.cardType))]).toEqual(['recognition'])
  })

  it('el vocabulario espera a los kana que lo componen', () => {
    expect(getQueue('vocab', 500)).toHaveLength(0)
  })

  it('asentado el gojūon se abre dakuten, pero no yōon', () => {
    drill('hiragana', (c) => c.cardType === 'recognition' && c.block === 'gojuon')
    presentAll('hiragana')
    const blocks = [...new Set(getQueue('hiragana', 500).map((c) => c.block))]
    expect(blocks).toContain('dakuten')
    expect(blocks).not.toContain('yoon')
  })

  it('y la evocación sigue al reconocimiento', () => {
    expect([...new Set(getQueue('hiragana', 500).map((c) => c.cardType))]).toContain('recall')
  })

  it('las palabras se abren, y ninguna con katakana sin estudiar', () => {
    presentAll('vocab')
    const words = getQueue('vocab', 500)
    expect(words.length).toBeGreaterThan(0)
    expect(words.filter((c) => /[ァ-ヶ]/.test(c.glyph))).toHaveLength(0)
    expect(words.every((c) => /^[ぁ-ゖー]+$/.test(c.glyph))).toBe(true)
  })
})

describe('progresión de kanji', () => {
  beforeAll(() => {
    presentAll('kanji-n5')
  })

  it('N5 abierto y los demás niveles cerrados', () => {
    const stats = getDeckStats()
    const superiores = stats.filter((d) => d.kind === 'kanji' && d.slug !== 'kanji-n5')
    expect(superiores.every((d) => d.due + d.lessons === 0)).toBe(true)
  })

  it('ordena por frecuencia en prensa', () => {
    const queue = getQueue('kanji-n5', 500)
    expect(queue.slice(0, 5).map((c) => c.glyph)).toEqual(['日', '一', '国', '人', '年'])
  })

  it('asentado el significado se abre la lectura y el nivel siguiente', () => {
    drill('kanji-n5', (c) => c.cardType === 'meaning')
    presentAll('kanji-n5')
    expect([...new Set(getQueue('kanji-n5', 999).map((c) => c.cardType))]).toContain('reading')

    const stats = getDeckStats()
    expect(stats.find((d) => d.slug === 'kanji-n4')!.lessons).toBeGreaterThan(0)
    expect(stats.find((d) => d.slug === 'kanji-n3')!.lessons).toBe(0)
  })

  it('las palabras esperan a que el kanji esté aprendido aislado', () => {
    drill('kanji-n5', (c) => c.cardType === 'reading')
    presentAll('kanji-n5')
    const words = getQueue('kanji-n5', 999).filter((c) => c.cardType === 'word')
    expect(words.length).toBeGreaterThan(0)

    // Ninguna palabra puede exigir un kanji de un nivel posterior.
    const n5 = new Set(kanjiData.filter((r) => r.l === 5).map((r) => r.k))
    const intrusas = words.filter((c) =>
      [...c.glyph].some((ch) => /[一-鿿]/.test(ch) && !n5.has(ch)),
    )
    expect(intrusas).toHaveLength(0)
  })
})

describe('cupo diario y bucle de aprendizaje', () => {
  it('las lecciones respetan el cupo', () => {
    setNewPerDay(5)
    const batch = getLessons('katakana', 40)
    expect(batch).toHaveLength(5)
    markPresented(batch.map((c) => c.cardId))
    for (const card of batch) gradeCard(card.cardId, 3, 1000)

    expect(newIntroducedToday('katakana')).toBe(5)
    expect(getLessons('katakana', 40)).toHaveLength(0)
    expect(getDeckStats().find((d) => d.slug === 'katakana')!.newRemaining).toBe(0)
  })

  it('las cartas en aprendizaje vuelven dentro de la sesión', () => {
    // FSRS las programa a 10 minutos contando con verlas otra vez hoy: sin
    // adelanto no hay nada, con adelanto vuelven las mismas.
    expect(getQueue('katakana', 40, 0)).toHaveLength(0)
    const ahead = getQueue('katakana', 40, 20)
    expect(ahead).toHaveLength(5)
  })

  it('el valor por defecto del cupo es 20', () => {
    setNewPerDay(20)
    expect(newPerDay()).toBe(20)
  })
})

describe('retención objetivo', () => {
  it('parte de 0,9, el valor con el que trabaja FSRS', () => {
    expect(retention()).toBe(0.9)
  })

  it('bajarla alarga los intervalos de las cartas asentadas', () => {
    // La retención no toca los pasos de aprendizaje, que son fijos: hay que
    // llevar la carta a estado de repaso para ver el efecto.
    const [card] = getLessons('katakana', 1)
    markPresented([card.cardId])
    for (let i = 0; i < 6 && getCard(card.cardId)!.state !== 2; i++) {
      gradeCard(card.cardId, 4, 900)
    }
    expect(getCard(card.cardId)!.state).toBe(2)

    const exigente = previewIntervals(card.cardId)
    setRetention(0.8)
    const relajada = previewIntervals(card.cardId)
    setRetention(0.9)
    expect(relajada[3]).toBeGreaterThan(exigente[3])
  })

  it('se queda dentro de un rango sensato', () => {
    setRetention(0.5)
    expect(retention()).toBeGreaterThanOrEqual(0.7)
    setRetention(0.99)
    expect(retention()).toBeLessThanOrEqual(0.97)
    setRetention(0.9)
  })
})

describe('explorador', () => {
  it('lista el temario y filtra por nivel', () => {
    expect(browseKanji()).toHaveLength(2383)
    expect(browseKanji({ level: 5 })).toHaveLength(79)
  })

  it('busca por carácter, significado en español y lectura', () => {
    expect(browseKanji({ terms: ['水'] })[0].glyph).toBe('水')
    expect(browseKanji({ terms: ['agua'] })[0].glyph).toBe('水')
    expect(browseKanji({ terms: ['スイ'] }).map((k) => k.glyph)).toContain('水')
  })

  it('ordena por relevancia: «agua» no puede empezar por «paraguas»', () => {
    const resultados = browseKanji({ terms: ['agua'] }).map((k) => k.glyph)
    expect(resultados.indexOf('水')).toBeLessThan(resultados.indexOf('傘'))
  })

  it('la ficha trae significados, lecturas y palabras', () => {
    const detalle = kanjiDetail('水')!
    expect(detalle.meanings).toContain('agua')
    expect(detalle.on.length).toBeGreaterThan(0)
    expect(detalle.words.length).toBeGreaterThan(0)
  })

  it('refleja el progreso real', () => {
    expect(browseKanji({ level: 5 }).filter((k) => k.progress === 'locked')).toHaveLength(0)
    expect(browseKanji({ level: 1 }).every((k) => k.progress === 'locked')).toBe(true)
  })
})

describe('orden de trazos', () => {
  it('cubre todo el temario y también los kana', () => {
    expect(kanjiStrokes('水')).toHaveLength(4)
    expect(kanjiStrokes('あ').length).toBeGreaterThan(0)
    expect(kanjiData.filter((r) => kanjiStrokes(r.k).length === 0)).toHaveLength(0)
  })

  it('los trazos son comandos SVG', () => {
    expect(kanjiStrokes('水').every((d) => /^M[\d.]/.test(d))).toBe(true)
  })

  it('el recuento concuerda con KANJIDIC2 salvo casos aislados', () => {
    // Dos fuentes independientes discrepan en algún carácter raro sobre si
    // cierto trazo cuenta como uno o como dos; lo que importa es que sea
    // marginal, no que coincidan al cien por cien.
    const desajuste = kanjiData.filter((r) => r.s > 0 && kanjiStrokes(r.k).length !== r.s)
    expect(desajuste.length / kanjiData.length).toBeLessThan(0.05)
  })
})

describe('cartas apartadas', () => {
  let victima: number

  it('se aparta al octavo fallo', () => {
    setNewPerDay(9999)
    presentAll('hiragana')
    const card = getQueue('hiragana', 1, 999)[0]
    victima = card.cardId

    let suspendidaEn = 0
    for (let i = 1; i <= 12 && !suspendidaEn; i++) {
      if (gradeCard(victima, 1, 800).suspended) suspendidaEn = i
    }
    // El criterio son los fallos registrados, no los lapsus de FSRS: esos
    // solo suben al fallar una carta que ya estaba en repaso, así que una
    // carta que nunca se aprende jamás llegaría al umbral.
    expect(suspendidaEn).toBe(8)
  })

  it('aparece en la lista y deja de servirse', () => {
    const leeches = listLeeches()
    expect(leeches.some((l) => l.cardId === victima)).toBe(true)
    expect(getQueue('hiragana', 999, 999).some((c) => c.cardId === victima)).toBe(false)
  })

  it('al devolverla vuelve a circular y no se aparta al primer tropiezo', () => {
    reviveCard(victima)
    expect(listLeeches().some((l) => l.cardId === victima)).toBe(false)
    expect(getQueue('hiragana', 999, 999).some((c) => c.cardId === victima)).toBe(true)
    expect(gradeCard(victima, 1, 800).suspended).toBe(false)
  })

  it('también se puede apartar a mano', () => {
    const card = getQueue('hiragana', 1, 999)[0]
    suspendCard(card.cardId)
    expect(listLeeches().some((l) => l.cardId === card.cardId)).toBe(true)
    reviveCard(card.cardId)
  })
})

describe('previsión de carga', () => {
  it('devuelve catorce días ordenados y con repasos', () => {
    const fc = getForecast(14)
    expect(fc.days).toHaveLength(14)
    expect(fc.days.map((d) => d.day)).toEqual([...fc.days.map((d) => d.day)].sort())
    expect(fc.days.reduce((n, d) => n + d.count, 0)).toBeGreaterThan(0)
  })

  it('no cuenta las cartas sin estrenar: su fecha aún no existe', () => {
    const programados = getForecast(14).days.reduce((n, d) => n + d.count, 0)
    expect(programados).toBeLessThan(browseKanji({ level: 1 }).length * 2)
  })
})

describe('calificación y deshacer', () => {
  it('enseña cuándo volvería la carta con cada nota, sin tocarla', () => {
    const card = getQueue('hiragana', 1, 999)[0]
    const antes = getCard(card.cardId)!
    const preview = previewIntervals(card.cardId)

    expect(Object.keys(preview)).toEqual(['1', '2', '3', '4'])
    // Más fácil, más tarde vuelve.
    expect(preview[4]).toBeGreaterThan(preview[1])
    // Y consultarlo no puede alterar la carta.
    expect(getCard(card.cardId)!.due).toBe(antes.due)
  })

  it('deshacer restaura el estado exacto y borra el repaso', () => {
    const card = getQueue('hiragana', 1, 999)[0]
    const antes = getCard(card.cardId)!
    const repasosAntes = getOverview().totalReviews

    gradeCard(card.cardId, 3, 1200)
    expect(canUndo()).toBe(true)

    const deshecho = undoLastReview()
    expect(deshecho?.cardId).toBe(card.cardId)
    expect(deshecho?.rating).toBe(3)

    const despues = getCard(card.cardId)!
    expect(despues.due).toBe(antes.due)
    expect(despues.reps).toBe(antes.reps)
    expect(despues.state).toBe(antes.state)
    expect(getOverview().totalReviews).toBe(repasosAntes)
  })

  it('deshacer también retira una suspensión', () => {
    const card = getQueue('hiragana', 1, 999)[0]
    let apartada = false
    for (let i = 0; i < 12 && !apartada; i++) apartada = gradeCard(card.cardId, 1, 700).suspended
    expect(apartada).toBe(true)

    undoLastReview()
    expect(listLeeches().some((l) => l.cardId === card.cardId)).toBe(false)
  })
})
