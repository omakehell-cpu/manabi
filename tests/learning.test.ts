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
  newPerDayTotal,
  setNewPerDayTotal,
  lessonBatchSize,
  browseKanji,
  kanjiDetail,
  kanjiStrokes,
  listLeeches,
  reviveCard,
  getForecast,
  getGlobalProgress,
  undoLastReview,
  canUndo,
  getCard,
  previewIntervals,
  suspendCard,
  componentsOf,
  wordsForKanji,
  kanjiReadings,
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

const kanjiWords = JSON.parse(readFileSync('src/data/kanji-words.json', 'utf8')) as {
  w: string
  k: string
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
    // 104 kana: reconocer y evocar cada uno, más escribir a mano los 71 que
    // no son yōon. El katakana suma 25 extendidos, que no piden evocación.
    expect(by('hiragana').total).toBe(279)
    expect(by('katakana').total).toBe(304)
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
    // Los dos cupos se prueban aparte; aquí estorbarían.
    setNewPerDay(9999)
    setNewPerDayTotal(100000)
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

describe('palabras de ejemplo de un kanji', () => {
  it('reparte la lectura entre los caracteres', () => {
    const word = wordsForKanji('中').find((w) => w.word === '中国人')!
    expect(word.parts!.map((p) => `${p.text}(${p.reading})`).join('·')).toBe(
      '中(ちゅう)·国(ごく)·人(じん)',
    )
  })

  it('descarta las palabras con un kanji que aún no se ha presentado', () => {
    // A estas alturas solo se ha presentado N5. 会社 es más frecuente que
    // 入社, pero usa 会, que es de N4 y todavía no se ha visto: enseñarla
    // ahora sería pedir un carácter desconocido para fijar otro.
    const shown = wordsForKanji('社').map((w) => w.word)
    expect(shown).toContain('入社')
    expect(shown).not.toContain('会社')
  })

  it('antes que ningún ejemplo, muestra los que hay', () => {
    // 誌 solo tiene 雑誌, y 雑 es de un nivel posterior. Sin la vuelta
    // atrás la ficha se quedaría sin una sola palabra.
    for (const glyph of ['社', '中', '誌']) {
      const all = kanjiWords.filter((w) => w.k === glyph)
      if (all.length) expect(wordsForKanji(glyph).length).toBeGreaterThan(0)
    }
  })
})

describe('lecturas de un kanji suelto', () => {
  it('las sirve para el texto pulsable de las frases', () => {
    // En una frase no se sabe qué lectura toca —日 es ニチ en 日本 y ひ en
    // ひどい日—, así que se dan todas, como en un diccionario.
    expect(kanjiReadings('日')).toMatchObject({ on: ['ニチ', 'ジツ'] })
    expect(kanjiReadings('日')!.meanings[0]).toBe('día')
  })

  it('no inventa nada para lo que no está en el temario', () => {
    expect(kanjiReadings('あ')).toBeNull()
  })
})

describe('vocabulario del JLPT', () => {
  it('reparte las palabras en cinco niveles', () => {
    const stats = getDeckStats().filter((d) => d.kind === 'vocabulary')
    expect(stats).toHaveLength(5)
    expect(stats.reduce((n, d) => n + d.characters, 0)).toBe(7057)
  })

  it('N5 abierto y el resto esperando', () => {
    const stats = getDeckStats().filter((d) => d.kind === 'vocabulary')
    expect(stats.find((d) => d.slug === 'vocab-n5')!.lessons).toBeGreaterThan(0)
    expect(
      stats.filter((d) => d.slug !== 'vocab-n5').every((d) => d.due + d.lessons === 0),
    ).toBe(true)
  })

  it('empieza preguntando el significado, no la lectura', () => {
    const batch = getLessons('vocab-n5')
    expect([...new Set(batch.map((c) => c.cardType))]).toEqual(['recognition'])
  })

  it('las palabras traen su lectura y su traducción', () => {
    const [card] = getLessons('vocab-n5')
    expect(card.reading).toMatch(/^[ぁ-ゖァ-ヺー]+$/)
    expect(card.meaning).toBeTruthy()
  })

  it('la lectura de una palabra se abre al asentar su significado', () => {
    // Se comprueba palabra a palabra y no asentando el nivel entero: el cupo
    // diario admite 500 cartas nuevas como mucho y N5 tiene 543 palabras,
    // así que un nivel completo no cabe en un día. La cadena entre niveles
    // usa exactamente la misma regla que los kanji, ya probada arriba.
    const [word] = getLessons('vocab-n5', 1)
    markPresented([word.cardId])

    const lecturaDisponible = () =>
      getLessons('vocab-n5', 999).some(
        (c) => c.glyph === word.glyph && c.cardType === 'reading',
      )

    expect(lecturaDisponible()).toBe(false)
    for (let i = 0; i < 6; i++) gradeCard(word.cardId, 4, 1000)
    expect(lecturaDisponible()).toBe(true)
  })
})

describe('cupo diario y bucle de aprendizaje', () => {
  it('las lecciones respetan el cupo', () => {
    setNewPerDayTotal(100000)
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
    setNewPerDay(9999)
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

describe('conjugación', () => {
  it('cubre todas las clases y terminaciones', () => {
    const rows = JSON.parse(readFileSync('src/data/conjugation.json', 'utf8')) as {
      w: string
      c: string
      f: string
      a: string
    }[]
    // Lo que cambia la regla es la clase y, en los godan, la última sílaba.
    const grupos = new Set(rows.map((r) => (r.c === 'v5' ? `v5${[...r.w].at(-1)}` : r.c)))
    expect(grupos.size).toBeGreaterThanOrEqual(13)
  })

  it('incluye las excepciones que más se fallan', () => {
    const rows = JSON.parse(readFileSync('src/data/conjugation.json', 'utf8')) as {
      w: string
      f: string
      a: string
    }[]
    const te = (w: string) => rows.find((r) => r.w === w && r.f === 'te')?.a
    // 行く es el único godan en く que hace って; 良い se conjuga como よい.
    expect(te('行く')).toBe('行って')
    expect(rows.find((r) => r.w === '良い' && r.f === 'ta')?.a).toBe('よかった')
    expect(te('来る')).toBe('来て')
    expect(te('する')).toBe('して')
  })

  it('las formas se abren en orden', () => {
    const stats = getDeckStats().find((d) => d.slug === 'conjugation')!
    expect(stats.lessons).toBeGreaterThan(0)

    const batch = getLessons('conjugation', 999)
    // Solo la primera forma está abierta al principio.
    expect([...new Set(batch.map((c) => c.block))]).toEqual(['masu'])
  })
})

describe('tope global de cartas nuevas', () => {
  it('existe además del cupo por mazo', () => {
    expect(newPerDayTotal()).toBeGreaterThan(0)
  })

  it('manda el más restrictivo de los dos', () => {
    // Con trece mazos, veinte por mazo serían 260 nuevas al día. El tope
    // general es lo que impide esa avalancha.
    setNewPerDay(20)
    setNewPerDayTotal(0)
    expect(getLessons('katakana', 40)).toHaveLength(0)

    setNewPerDayTotal(3)
    expect(getLessons('katakana', 40).length).toBeLessThanOrEqual(3)

    setNewPerDayTotal(100000)
    setNewPerDay(9999)
  })
})

describe('calidad del vocabulario', () => {
  it('encuentra las palabras que JMdict guarda con otra grafía', () => {
    const vocab = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8')) as { w: string }[]
    const words = new Set(vocab.map((v) => v.w))
    // 行く venía en las listas como «いく; ゆく» y する está en JMdict como
    // 為る: sin tratar esos dos casos se perdían 368 palabras.
    expect(words.has('行く')).toBe(true)
    expect(words.has('する')).toBe(true)
  })

  it('cada palabra lleva su categoría gramatical', () => {
    const vocab = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8')) as {
      w: string
      m: string
      p: string
      o: string[]
      l: number
    }[]
    const conPos = vocab.filter((v) => v.p).length
    expect(conPos / vocab.length).toBeGreaterThan(0.95)
  })

  it('distingue el sustantivo del adjetivo cuando comparten significado', () => {
    const vocab = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8')) as {
      w: string
      p: string
    }[]
    // 青 y 青い son ambos «azul»; sin la categoría no habría forma de saber
    // cuál es cuál.
    expect(vocab.find((v) => v.w === '青')?.p).toBe('sust.')
    expect(vocab.find((v) => v.w === '青い')?.p).toBe('adj-i')
  })

  it('no afirma la transitividad cuando JMdict mezcla lecturas', () => {
    const vocab = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8')) as {
      w: string
      p: string
    }[]
    // 開く es あく (intransitivo) y ひらく (transitivo) en la misma entrada:
    // vale más callar que enseñar lo contrario.
    expect(vocab.find((v) => v.w === '開く')?.p).toBe('verbo')
  })

  it('las otras acepciones no se aceptan como respuesta', () => {
    const vocab = JSON.parse(readFileSync('src/data/vocabulary.json', 'utf8')) as {
      w: string
      m: string
      a: string[]
      o: string[]
    }[]
    const au = vocab.find((v) => v.w === '会う')!
    expect(au.o.length).toBeGreaterThan(0)
    // «tener un accidente» viene de 遭う, que comparte entrada en JMdict:
    // se enseña como información, pero darla por buena sería falso.
    expect(au.a).not.toContain(au.o[0])
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

describe('escritura a mano como fase final', () => {
  it('no aparece hasta poder producir el carácter', () => {
    const disponible = () =>
      getQueue('hiragana', 999, 999)
        .concat(getLessons('hiragana', 999))
        .filter((c) => c.cardType === 'writing').length

    // Con el reconocimiento asentado todavía no basta: hace falta también
    // saber escribirlo desde el rōmaji.
    expect(disponible()).toBe(0)

    drill('hiragana', (c) => c.cardType === 'recall' && c.block === 'gojuon')
    presentAll('hiragana')
    expect(disponible()).toBeGreaterThan(0)
  })

  it('los yōon no la llevan: son dos signos ya practicados aparte', () => {
    const yoon = getQueue('hiragana', 999, 999)
      .concat(getLessons('hiragana', 999))
      .filter((c) => c.cardType === 'writing' && [...c.glyph].length > 1)
    expect(yoon).toHaveLength(0)
  })
})

describe('componentes de los kanji', () => {
  it('descompone en las piezas correctas', () => {
    const partes = (g: string) => componentsOf(g).map((c) => c.glyph)
    // Sol más luna: de ahí «brillante».
    expect(partes('明')).toEqual(['日', '月'])
    // Persona junto a árbol: descansar.
    expect(partes('休')).toEqual(['亻', '木'])
  })

  it('se queda en el primer nivel', () => {
    // KanjiVG numera los grupos de forma plana aunque estén anidados, así
    // que sin controlar la profundidad 語 daba siete piezas en vez de dos.
    expect(componentsOf('語').map((c) => c.glyph)).toEqual(['言', '吾'])
  })

  it('señala cuál es el radical', () => {
    const radicales = componentsOf('海').filter((c) => c.isRadical)
    expect(radicales.map((c) => c.glyph)).toEqual(['氵'])
  })

  it('explica los radicales que no existen como kanji suelto', () => {
    const agua = componentsOf('海').find((c) => c.glyph === '氵')!
    expect(agua.meaning).toContain('agua')
    expect(agua.name).toBe('sanzui')
  })

  it('no inventa descomposición para los kanji simples', () => {
    expect(componentsOf('日')).toEqual([])
    expect(componentsOf('一')).toEqual([])
  })

  it('marca las piezas ya estudiadas', () => {
    // A estas alturas N5 está asentado, así que 日 debería figurar sabido.
    const dia = componentsOf('明').find((c) => c.glyph === '日')!
    expect(dia.known).toBe(true)
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
    setNewPerDayTotal(100000)
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

describe('sesión unificada', () => {
  it('junta los repasos de todos los mazos', () => {
    setNewPerDay(9999)
    setNewPerDayTotal(100000)
    const deUno = getQueue('hiragana', 999, 999)
    const deTodos = getQueue(null, 999, 999)
    expect(deTodos.length).toBeGreaterThan(deUno.length)
    // Y vienen de mazos distintos: eso es lo que evita entrar uno por uno.
    expect(new Set(deTodos.map((c) => c.deck)).size).toBeGreaterThan(1)
  })

  it('cada tanda de lecciones sale de un solo mazo', () => {
    // Presentar dos kana y tres kanji a la vez repartiría la atención en
    // lugar de enseñar algo.
    const batch = getLessons(null, 5)
    expect(batch.length).toBeGreaterThan(0)
    expect(new Set(batch.map((c) => c.deck)).size).toBe(1)
  })

  it('respeta el tope global aunque se pidan todos los mazos', () => {
    setNewPerDayTotal(3)
    expect(getLessons(null, 40).length).toBeLessThanOrEqual(3)
    setNewPerDayTotal(100000)
  })
})

describe('progreso global', () => {
  it('cuenta el temario entero, no un mazo', () => {
    const g = getGlobalProgress()
    const porMazo = getDeckStats().reduce((n, d) => n + d.total, 0)
    expect(g.total).toBe(porMazo)
  })

  it('distingue lo asentado de lo simplemente visto', () => {
    const g = getGlobalProgress()
    expect(g.seen).toBeGreaterThanOrEqual(g.mature)
    expect(g.mature + g.learning).toBeLessThanOrEqual(g.total)
  })

  it('estima cuánto material queda al ritmo actual', () => {
    setNewPerDayTotal(40)
    const g = getGlobalProgress()
    expect(g.daysLeft).toBe(Math.ceil((g.total - g.seen) / 40))
    setNewPerDayTotal(100000)
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
