import Database from 'better-sqlite3'
// El esquema se incrusta en el bundle: leerlo del disco fallaría dentro del asar.
import schemaSql from './schema.sql?raw'
import { fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { HIRAGANA, KATAKANA } from '../src/data/kana'
import VOCAB from '../src/data/vocab.json'
import { tokenizeKana } from '../src/lib/tokenize'
import KANJI from '../src/data/kanji.json'
import KANJI_WORDS from '../src/data/kanji-words.json'
// El trazado vive en el proceso principal y se sirve por petición: son
// 2 MB que no tiene sentido cargar en el renderer para ver un kanji.
import KANJI_STROKES from '../src/data/kanji-strokes.json'
import SENTENCES from '../src/data/sentences.json'

export type CardType = 'recognition' | 'recall' | 'reading' | 'meaning' | 'word'

/** Forma de cada registro en src/data/kanji.json (ver scripts/build-kanji.ts). */
interface KanjiJson {
  k: string
  l: number
  x: 0 | 1
  m: string[]
  on: string[]
  kun: string[]
  s: number
  f: number
  g: number
}

/** Forma de cada registro en src/data/vocab.json. */
interface KanaVocabJson {
  w: string
  r: string
  m: string
  a: string[]
  s: 'hiragana' | 'katakana'
}

/** Forma de cada registro en src/data/kanji-words.json. */
interface KanjiWordJson {
  /** La palabra escrita. */
  w: string
  /** Su lectura en kana. */
  r: string
  /** Traducción al español. */
  m: string
  /** Formas alternativas aceptadas. */
  a: string[]
  /** Kanji al que pertenece: el último de la palabra en el orden de estudio. */
  k: string
}

/** Un ítem se considera asentado cuando FSRS lo saca de aprendizaje. */
const MATURE = State.Review
/** Proporción del bloque previo que hay que asentar para abrir el siguiente. */
const BLOCK_THRESHOLD = 0.8
/** Fallos acumulados tras los que una carta se aparta como leech. */
const LEECH_FAILURES = 8

/**
 * Cuánto se pueden adelantar las cartas que están en aprendizaje.
 *
 * FSRS las reprograma a 1 minuto si fallas y a 10 si aciertas, contando con
 * que vuelvan a salir en la misma sesión: ahí es donde se consolidan. Sin
 * este margen la sesión se daría por terminada antes de que venciera
 * ninguna, y cada carta se vería una sola vez al día.
 */
const LEARN_AHEAD_MINUTES = 20

/** Cartas nuevas por mazo y día si el usuario no ha configurado otra cosa. */
const DEFAULT_NEW_PER_DAY = 20

/**
 * Cuántos elementos se presentan juntos antes de examinarlos.
 *
 * Cinco no es arbitrario: la memoria de trabajo maneja del orden de cuatro
 * elementos a la vez, y presentar veinte kanji seguidos reparte la atención
 * hasta que no queda nada de ninguno.
 */
const DEFAULT_LESSON_BATCH = 5

const BLOCK_ORDER = ['gojuon', 'dakuten', 'yoon', 'extended'] as const

/**
 * Retención objetivo: la probabilidad de acordarse cuando una carta vuelve.
 *
 * Es la palanca directa sobre cuánto trabajo diario hay. FSRS usa 0,9 por
 * defecto; bajarla a 0,85 reduce bastante los repasos a cambio de olvidar
 * algo más a menudo.
 */
const DEFAULT_RETENTION = 0.9

function scheduler() {
  return fsrs(
    generatorParameters({
      enable_fuzz: true,
      request_retention: numericSetting('retention', DEFAULT_RETENTION, 0.7, 0.97),
    }),
  )
}

export function retention(): number {
  return numericSetting('retention', DEFAULT_RETENTION, 0.7, 0.97)
}

export function setRetention(value: number): void {
  setSetting('retention', String(Math.max(0.7, Math.min(0.97, value))))
}

let db: Database.Database

export function openDatabase(file: string): Database.Database {
  db = new Database(file)
  db.exec(schemaSql)
  migrate()
  seed()
  refreshLocks()
  return db
}

/**
 * El esquema se crea con CREATE TABLE IF NOT EXISTS, que no toca las tablas
 * ya existentes. Las columnas añadidas después necesitan un ALTER explícito
 * para que las instalaciones en marcha no pierdan el progreso.
 */
function migrate(): void {
  const columns = (db.prepare('PRAGMA table_info(card)').all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!columns.includes('leech_at')) {
    db.exec(`ALTER TABLE card ADD COLUMN leech_at INTEGER NOT NULL DEFAULT ${LEECH_FAILURES}`)
  }

  const reviewColumns = (db.prepare('PRAGMA table_info(review)').all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!reviewColumns.includes('prev_card')) {
    db.exec('ALTER TABLE review ADD COLUMN prev_card TEXT')
  }

  if (!columns.includes('presented_at')) {
    db.exec('ALTER TABLE card ADD COLUMN presented_at TEXT')
    // Lo ya estudiado cuenta como presentado: si no, todo el progreso
    // anterior volvería a pasar por las lecciones desde cero.
    db.exec("UPDATE card SET presented_at = last_review WHERE reps > 0")
  }
}

// ---------------------------------------------------------------- seed

/** Los niveles JLPT van de N5 (más fácil) a N1. */
export const KANJI_LEVELS = [5, 4, 3, 2, 1] as const

const DECKS = [
  { kind: 'hiragana', slug: 'hiragana', name: 'Hiragana', position: 0 },
  { kind: 'katakana', slug: 'katakana', name: 'Katakana', position: 1 },
  { kind: 'vocab', slug: 'vocab', name: 'Vocabulario en kana', position: 2 },
  ...KANJI_LEVELS.map((n, i) => ({
    kind: 'kanji',
    slug: `kanji-n${n}`,
    name: `Kanji N${n}`,
    position: 3 + i,
  })),
]

function seed(): void {
  const insertDeck = db.prepare(
    'INSERT OR IGNORE INTO deck (kind, slug, name, position) VALUES (@kind, @slug, @name, @position)',
  )
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO item (deck_id, glyph, reading, alt, meaning, block, row_key, position)
    VALUES (@deck_id, @glyph, @reading, @alt, @meaning, @block, @row_key, @position)
  `)
  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO card (item_id, card_type, due, stability, difficulty,
      elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, locked)
    VALUES (@item_id, @card_type, @due, 0, 0, 0, 0, 0, 0, 0, 0, NULL, @locked)
  `)

  const run = db.transaction(() => {
    for (const d of DECKS) insertDeck.run(d)

    const deckId = (slug: string): number =>
      (db.prepare('SELECT id FROM deck WHERE slug = ?').get(slug) as { id: number }).id

    const now = new Date().toISOString()

    // Kana: cada signo produce reconocimiento (kana→rōmaji) y evocación
    // (rōmaji→kana). La evocación nace bloqueada.
    for (const [slug, table] of [
      ['hiragana', HIRAGANA],
      ['katakana', KATAKANA],
    ] as const) {
      const id = deckId(slug)
      table.forEach((k, i) => {
        insertItem.run({
          deck_id: id,
          glyph: k.glyph,
          reading: k.romaji,
          alt: JSON.stringify(k.alt),
          meaning: null,
          block: k.block,
          row_key: k.row,
          position: i,
        })
        const itemId = (
          db.prepare('SELECT id FROM item WHERE deck_id = ? AND glyph = ?').get(id, k.glyph) as {
            id: number
          }
        ).id
        // Solo el gojūon está abierto de entrada; el resto de bloques los
        // abre refreshLocks() cuando el anterior está asentado.
        insertCard.run({
          item_id: itemId,
          card_type: 'recognition',
          due: now,
          locked: k.block === 'gojuon' ? 0 : 1,
        })
        // Los kana extendidos (ファ, ヴィ…) no generan carta de evocación: su
        // rōmaji es ambiguo (ウォ y ヲ son ambos «wo») y en la práctica se leen,
        // no se producen desde rōmaji.
        if (k.block !== 'extended') {
          insertCard.run({ item_id: itemId, card_type: 'recall', due: now, locked: 1 })
        }
      })
    }

    // Kanji: significado (漢→«China») y lectura (漢→カン/から).
    // La lectura nace bloqueada hasta asentar el significado, y todo lo que
    // no sea N5 espera a que el nivel anterior esté hecho.
    for (const level of KANJI_LEVELS) {
      const id = deckId(`kanji-n${level}`)
      const rows = (KANJI as KanjiJson[]).filter((r) => r.l === level)
      rows.forEach((r, i) => {
        insertItem.run({
          deck_id: id,
          glyph: r.k,
          reading: [...r.on, ...r.kun].join('、'),
          alt: JSON.stringify({
            on: r.on,
            kun: r.kun,
            meanings: r.m,
            strokes: r.s,
            freq: r.f,
            grade: r.g,
          }),
          meaning: r.m[0],
          // Los jōyō que ninguna lista JLPT recoge se estudian al final de N1.
          block: r.x ? 'joyo-extra' : 'jlpt',
          row_key: `n${level}`,
          position: i,
        })
        const itemId = (
          db.prepare('SELECT id FROM item WHERE deck_id = ? AND glyph = ?').get(id, r.k) as {
            id: number
          }
        ).id
        insertCard.run({
          item_id: itemId,
          card_type: 'meaning',
          due: now,
          locked: level === 5 && !r.x ? 0 : 1,
        })
        insertCard.run({ item_id: itemId, card_type: 'reading', due: now, locked: 1 })
      })
    }

    // Palabras de ejemplo: la fase de «fijar en palabras». Cada una vive en
    // el mazo del kanji que la introduce y nace bloqueada hasta que ese
    // kanji está aprendido de forma aislada.
    {
      const levelOf = new Map((KANJI as KanjiJson[]).map((r) => [r.k, r.l]))
      const words = KANJI_WORDS as KanjiWordJson[]
      words.forEach((w, i) => {
        const level = levelOf.get(w.k)
        if (!level) return
        const id = deckId(`kanji-n${level}`)
        insertItem.run({
          deck_id: id,
          glyph: w.w,
          reading: w.r,
          alt: JSON.stringify({ owner: w.k, meaning: w.a }),
          meaning: w.m,
          block: 'word',
          row_key: w.k,
          position: 10000 + i,
        })
        const itemId = (
          db.prepare('SELECT id FROM item WHERE deck_id = ? AND glyph = ?').get(id, w.w) as
            | { id: number }
            | undefined
        )?.id
        if (itemId) insertCard.run({ item_id: itemId, card_type: 'word', due: now, locked: 1 })
      })
    }

    // Vocabulario: reconocimiento (palabra→significado) y lectura (palabra→rōmaji).
    // Ambas nacen bloqueadas hasta dominar los kana que componen la palabra.
    const vid = deckId('vocab')
    ;(VOCAB as KanaVocabJson[]).forEach((v, i) => {
      insertItem.run({
        deck_id: vid,
        glyph: v.w,
        reading: v.r,
        alt: JSON.stringify({ reading: [], meaning: v.a }),
        meaning: v.m,
        block: v.s,
        row_key: v.s,
        position: i,
      })
      const itemId = (
        db.prepare('SELECT id FROM item WHERE deck_id = ? AND glyph = ?').get(vid, v.w) as {
          id: number
        }
      ).id
      insertCard.run({ item_id: itemId, card_type: 'recognition', due: now, locked: 1 })
      insertCard.run({ item_id: itemId, card_type: 'reading', due: now, locked: 1 })
    })
  })

  run()
}

// ------------------------------------------------------- desbloqueo

/**
 * Recalcula qué cartas están disponibles. Tres reglas encadenadas:
 *
 *  1. Los bloques de kana se abren en orden (gojūon → dakuten → yōon →
 *     extendidos) cuando el 80 % del anterior está asentado.
 *  2. La carta de evocación de un kana se abre cuando su reconocimiento
 *     está asentado: primero reconocer, después producir.
 *  3. Una palabra se abre cuando TODOS los kana que la componen están
 *     asentados — nunca ves ねこ antes de dominar ね y こ.
 *  4. Los niveles de kanji se abren en cadena: N4 espera al 80 % de N5, y
 *     así hasta N1. Los jōyō fuera de las listas JLPT cierran N1.
 *  5. En cada kanji, la lectura espera al significado: primero sabes qué
 *     quiere decir 漢, después cómo suena.
 *  6. Las palabras de un kanji esperan a que ese kanji esté aprendido
 *     aislado — el «primero aislados, después en palabras».
 */
export function refreshLocks(): void {
  const unlock = db.prepare('UPDATE card SET locked = 0 WHERE id = ? AND locked = 1')

  const maturedGlyphs = new Set(
    (
      db
        .prepare(
          `SELECT i.glyph FROM card c JOIN item i ON i.id = c.item_id
           JOIN deck d ON d.id = i.deck_id
           WHERE c.card_type = 'recognition' AND c.state >= ? AND d.kind IN ('hiragana','katakana')`,
        )
        .all(MATURE) as { glyph: string }[]
    ).map((r) => r.glyph),
  )

  const tx = db.transaction(() => {
    // Regla 1 — progresión por bloques, dentro de cada mazo de kana.
    for (const slug of ['hiragana', 'katakana']) {
      for (let b = 1; b < BLOCK_ORDER.length; b++) {
        const prev = BLOCK_ORDER[b - 1]
        const stats = db
          .prepare(
            `SELECT COUNT(*) AS total, SUM(CASE WHEN c.state >= ? THEN 1 ELSE 0 END) AS done
             FROM card c JOIN item i ON i.id = c.item_id JOIN deck d ON d.id = i.deck_id
             WHERE d.slug = ? AND i.block = ? AND c.card_type = 'recognition'`,
          )
          .get(MATURE, slug, prev) as { total: number; done: number | null }

        if (!stats.total) continue
        if ((stats.done ?? 0) / stats.total < BLOCK_THRESHOLD) break

        db.prepare(
          `UPDATE card SET locked = 0
           WHERE card_type = 'recognition' AND locked = 1 AND item_id IN (
             SELECT i.id FROM item i JOIN deck d ON d.id = i.deck_id
             WHERE d.slug = ? AND i.block = ?)`,
        ).run(slug, BLOCK_ORDER[b])
      }
    }

    // Regla 2 — evocación tras reconocimiento, kana a kana.
    db.prepare(
      `UPDATE card SET locked = 0
       WHERE card_type = 'recall' AND locked = 1 AND item_id IN (
         SELECT item_id FROM card WHERE card_type = 'recognition' AND state >= ?)`,
    ).run(MATURE)

    // Regla 4 — cada nivel de kanji espera al anterior.
    for (let i = 1; i < KANJI_LEVELS.length; i++) {
      const prev = KANJI_LEVELS[i - 1]
      const stats = db
        .prepare(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN c.state >= ? THEN 1 ELSE 0 END) AS done
           FROM card c JOIN item i ON i.id = c.item_id JOIN deck d ON d.id = i.deck_id
           WHERE d.slug = ? AND c.card_type = 'meaning' AND i.block = 'jlpt'`,
        )
        .get(MATURE, `kanji-n${prev}`) as { total: number; done: number | null }

      if (!stats.total) continue
      if ((stats.done ?? 0) / stats.total < BLOCK_THRESHOLD) break

      db.prepare(
        `UPDATE card SET locked = 0
         WHERE card_type = 'meaning' AND locked = 1 AND item_id IN (
           SELECT i.id FROM item i JOIN deck d ON d.id = i.deck_id
           WHERE d.slug = ? AND i.block = 'jlpt')`,
      ).run(`kanji-n${KANJI_LEVELS[i]}`)
    }

    // Los jōyō que ninguna lista JLPT recoge cierran N1, una vez hecho el resto.
    {
      const stats = db
        .prepare(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN c.state >= ? THEN 1 ELSE 0 END) AS done
           FROM card c JOIN item i ON i.id = c.item_id JOIN deck d ON d.id = i.deck_id
           WHERE d.slug = 'kanji-n1' AND c.card_type = 'meaning' AND i.block = 'jlpt'`,
        )
        .get(MATURE) as { total: number; done: number | null }
      if (stats.total && (stats.done ?? 0) / stats.total >= BLOCK_THRESHOLD) {
        db.prepare(
          `UPDATE card SET locked = 0
           WHERE card_type = 'meaning' AND locked = 1 AND item_id IN (
             SELECT i.id FROM item i JOIN deck d ON d.id = i.deck_id
             WHERE d.kind = 'kanji' AND i.block = 'joyo-extra')`,
        ).run()
      }
    }

    // Regla 5 — en cada kanji, la lectura espera al significado.
    db.prepare(
      `UPDATE card SET locked = 0
       WHERE card_type = 'reading' AND locked = 1 AND item_id IN (
         SELECT c.item_id FROM card c JOIN item i ON i.id = c.item_id
         JOIN deck d ON d.id = i.deck_id
         WHERE d.kind = 'kanji' AND c.card_type = 'meaning' AND c.state >= ?)`,
    ).run(MATURE)

    // Regla 6 — una palabra de kanji espera a que su kanji esté aprendido
    // aislado: primero sabes qué significa y cómo se lee 地, después lo
    // reconoces dentro de 地下. Los demás kanji de la palabra ya están
    // vistos por construcción, porque el generador solo admite palabras
    // cuyos caracteres pertenezcan todos a niveles anteriores o al propio.
    db.prepare(
      `UPDATE card SET locked = 0
       WHERE card_type = 'word' AND locked = 1 AND item_id IN (
         SELECT w.id FROM item w
         JOIN item k ON k.glyph = w.row_key
         JOIN deck kd ON kd.id = k.deck_id AND kd.kind = 'kanji'
         JOIN card c ON c.item_id = k.id AND c.card_type = 'reading'
         WHERE w.block = 'word' AND c.state >= ?)`,
    ).run(MATURE)

    // Regla 3 — palabras, solo si todos sus kana están asentados.
    const words = db
      .prepare(
        `SELECT i.id, i.glyph FROM item i JOIN deck d ON d.id = i.deck_id
         WHERE d.kind = 'vocab' AND EXISTS (
           SELECT 1 FROM card c WHERE c.item_id = i.id AND c.locked = 1)`,
      )
      .all() as { id: number; glyph: string }[]

    const known = new Set([...HIRAGANA, ...KATAKANA].map((k) => k.glyph))
    for (const w of words) {
      const parts = tokenizeKana(w.glyph, known)
      if (parts.length && parts.every((p) => maturedGlyphs.has(p))) {
        for (const c of db
          .prepare('SELECT id FROM card WHERE item_id = ? AND locked = 1')
          .all(w.id) as { id: number }[]) {
          unlock.run(c.id)
        }
      }
    }
  })

  tx()
}

// ------------------------------------------------------------- cola

export interface StudyCard {
  cardId: number
  itemId: number
  deck: string
  deckKind: string
  cardType: CardType
  glyph: string
  reading: string
  meaning: string | null
  alt: string
  block: string
  state: number
  reps: number
  /** Cuándo vence, en ISO. La sesión lo usa para decir cuánto falta. */
  due: string
}

/**
 * @param aheadMinutes cuánto se adelantan las cartas en aprendizaje. Se pasa
 *   0 al recargar a mitad de sesión: sin ese cero, una única carta pendiente
 *   se serviría en bucle cada pocos segundos.
 */
export function getQueue(slug: string, limit = 40, aheadMinutes = LEARN_AHEAD_MINUTES): StudyCard[] {
  const now = new Date()
  const nowIso = now.toISOString()
  const horizon = new Date(now.getTime() + aheadMinutes * 60_000).toISOString()

  const columns = `c.id AS cardId, i.id AS itemId, d.slug AS deck, d.kind AS deckKind,
              c.card_type AS cardType, i.glyph, i.reading, i.meaning, i.alt,
              i.block, c.state, c.reps, c.due`

  // Las que ya están en marcha no tienen cupo: si toca repasarlas, tocan.
  // A las de aprendizaje (estados 1 y 3) se les permite el adelanto.
  const inProgress = db
    .prepare(
      `SELECT ${columns}
       FROM card c
       JOIN item i ON i.id = c.item_id
       JOIN deck d ON d.id = i.deck_id
       WHERE d.slug = ? AND c.locked = 0 AND c.suspended = 0 AND c.state != 0
         AND ((c.state IN (1, 3) AND c.due <= ?) OR (c.state = 2 AND c.due <= ?))
       ORDER BY c.due, i.position
       LIMIT ?`,
    )
    .all(slug, horizon, nowIso, limit) as StudyCard[]

  // Las nuevas sí: cada una arrastra una decena de repasos futuros, y sin
  // freno la carga se dispara hasta volverse inasumible en dos semanas.
  const room = Math.max(0, Math.min(newRemainingToday(slug), limit - inProgress.length))
  const fresh = room
    ? (db
        .prepare(
          `SELECT ${columns}
           FROM card c
           JOIN item i ON i.id = c.item_id
           JOIN deck d ON d.id = i.deck_id
           WHERE d.slug = ? AND c.locked = 0 AND c.suspended = 0 AND c.state = 0
             AND c.presented_at IS NOT NULL AND c.due <= ?
           ORDER BY i.position
           LIMIT ?`,
        )
        .all(slug, nowIso, room) as StudyCard[])
    : []

  return [...inProgress, ...fresh]
}

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Una carta cuenta como estrenada hoy si su primer repaso ha sido hoy. */
export function newIntroducedToday(slug: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT r.card_id) AS n
         FROM review r
         JOIN card c ON c.id = r.card_id
         JOIN item i ON i.id = c.item_id
         JOIN deck d ON d.id = i.deck_id
         WHERE d.slug = ? AND r.state_before = 0 AND r.reviewed_at >= ?`,
      )
      .get(slug, startOfToday()) as { n: number }
  ).n
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

function numericSetting(key: string, fallback: number, min: number, max: number): number {
  const raw = getSetting(key)
  // Hay que descartar el null antes de convertir: Number(null) es 0, y un
  // cero pasa el rango de «cartas nuevas al día» tan campante, dejando el
  // cupo a cero sin que nadie lo haya pedido.
  if (raw === null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export function newPerDay(): number {
  return numericSetting('new_per_day', DEFAULT_NEW_PER_DAY, 0, 500)
}

export function setNewPerDay(value: number): void {
  setSetting('new_per_day', String(Math.max(0, Math.min(500, Math.round(value)))))
}

/** Cuántos elementos se presentan juntos antes de examinarlos. */
export function lessonBatchSize(): number {
  return numericSetting('lesson_batch', DEFAULT_LESSON_BATCH, 1, 20)
}

export function setLessonBatchSize(value: number): void {
  setSetting('lesson_batch', String(Math.max(1, Math.min(20, Math.round(value)))))
}

/** Cuántas cartas nuevas admite todavía hoy este mazo. */
export function newRemainingToday(slug: string): number {
  return Math.max(0, newPerDay() - newIntroducedToday(slug))
}

// ---------------------------------------------------------- calificar

function rowToFsrs(row: Record<string, unknown>): Card {
  return {
    due: new Date(row.due as string),
    stability: row.stability as number,
    difficulty: row.difficulty as number,
    elapsed_days: row.elapsed_days as number,
    scheduled_days: row.scheduled_days as number,
    learning_steps: row.learning_steps as number,
    reps: row.reps as number,
    lapses: row.lapses as number,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review as string) : undefined,
  }
}

export interface GradeResult {
  due: string
  state: number
  suspended: boolean
  intervalDays: number
}

/** Fallos («Otra vez») acumulados por una carta a lo largo de su historia. */
function countFailures(cardId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM review WHERE card_id = ? AND rating = 1').get(cardId) as {
      n: number
    }
  ).n
}

export function gradeCard(cardId: number, rating: Grade, durationMs: number): GradeResult {
  const row = db.prepare('SELECT * FROM card WHERE id = ?').get(cardId) as
    | Record<string, unknown>
    | undefined
  if (!row) throw new Error(`Carta inexistente: ${cardId}`)

  const now = new Date()
  const stateBefore = row.state as number
  const next = scheduler().next(rowToFsrs(row), now, rating).card

  db.transaction(() => {
    db.prepare(
      `UPDATE card SET due = @due, stability = @stability, difficulty = @difficulty,
         elapsed_days = @elapsed_days, scheduled_days = @scheduled_days,
         learning_steps = @learning_steps, reps = @reps, lapses = @lapses,
         state = @state, last_review = @last_review
       WHERE id = @id`,
    ).run({
      id: cardId,
      due: next.due.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      learning_steps: next.learning_steps,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      last_review: next.last_review ? next.last_review.toISOString() : now.toISOString(),
    })
    db.prepare(
      `INSERT INTO review (card_id, reviewed_at, rating, duration_ms, state_before, prev_card)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      cardId,
      now.toISOString(),
      rating,
      Math.round(durationMs),
      stateBefore,
      JSON.stringify(row),
    )
  })()

  // El criterio son los fallos realmente registrados, no el contador de
  // lapsus de FSRS: ese solo sube al fallar una carta que ya estaba en
  // repaso, así que una carta que nunca llegas a aprender se queda en
  // aprendizaje acumulando cero lapsus por muchas veces que la falles
  // — justo el caso que esto tiene que detectar.
  const suspended =
    countFailures(cardId) >= Number(row.leech_at ?? LEECH_FAILURES)
  if (suspended) db.prepare('UPDATE card SET suspended = 1 WHERE id = ?').run(cardId)

  refreshLocks()

  return {
    due: next.due.toISOString(),
    state: next.state,
    suspended,
    intervalDays: next.scheduled_days,
  }
}

/**
 * Minutos que tardaría en volver la carta con cada nota, para poder
 * enseñarlo en los botones. No modifica nada: FSRS calcula sobre una copia.
 *
 * Se devuelve en minutos y no en días porque las cartas en aprendizaje
 * vuelven en 1 o 10 minutos, y ahí «0 días» no dice nada.
 */
export function previewIntervals(cardId: number): Record<number, number> {
  const row = db.prepare('SELECT * FROM card WHERE id = ?').get(cardId) as
    | Record<string, unknown>
    | undefined
  if (!row) return {}
  const card = rowToFsrs(row)
  const now = new Date()
  const out: Record<number, number> = {}
  for (const g of [1, 2, 3, 4] as Grade[]) {
    const due = scheduler().next(card, now, g).card.due
    out[g] = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000))
  }
  return out
}

// ------------------------------------------------------- estadísticas

export interface DeckStats {
  slug: string
  name: string
  kind: string
  total: number
  locked: number
  due: number
  New: number
  learning: number
  review: number
  suspended: number
  /** Ítems que son caracteres o signos, excluidas las palabras de ejemplo. */
  characters: number
  /** Cartas nuevas ya presentadas que este mazo admite todavía hoy. */
  newRemaining: number
  /** Elementos por presentar hoy: la puerta de entrada del material nuevo. */
  lessons: number
}

export function getDeckStats(): DeckStats[] {
  const now = new Date()
  const nowIso = now.toISOString()
  const horizon = new Date(now.getTime() + LEARN_AHEAD_MINUTES * 60_000).toISOString()

  const rows = db
    .prepare(
      `SELECT d.slug, d.name, d.kind,
              COUNT(c.id) AS total,
              SUM(c.locked) AS locked,
              SUM(CASE WHEN c.locked = 0 AND c.suspended = 0 AND c.state != 0
                        AND ((c.state IN (1,3) AND c.due <= @horizon)
                          OR (c.state = 2 AND c.due <= @now))
                       THEN 1 ELSE 0 END) AS dueInProgress,
              SUM(CASE WHEN c.locked = 0 AND c.suspended = 0 AND c.state = 0
                        AND c.presented_at IS NOT NULL AND c.due <= @now
                       THEN 1 ELSE 0 END) AS New,
              SUM(CASE WHEN c.locked = 0 AND c.suspended = 0 AND c.state = 0
                        AND c.presented_at IS NULL THEN 1 ELSE 0 END) AS unpresented,
              SUM(CASE WHEN c.state IN (1,3) THEN 1 ELSE 0 END) AS learning,
              SUM(CASE WHEN c.state = 2 THEN 1 ELSE 0 END) AS review,
              SUM(c.suspended) AS suspended,
              COUNT(DISTINCT CASE WHEN i.block != 'word' THEN i.id END) AS characters
       FROM deck d
       LEFT JOIN item i ON i.deck_id = d.id
       LEFT JOIN card c ON c.item_id = i.id
       GROUP BY d.id ORDER BY d.position`,
    )
    .all({ now: nowIso, horizon }) as (Omit<DeckStats, 'due' | 'newRemaining' | 'lessons'> & {
    dueInProgress: number
    unpresented: number
  })[]

  // `due` debe ser lo que la sesión va a servir de verdad, no todo lo que
  // existe: anunciar «Estudiar 79» y luego entregar 20 sería mentir.
  return rows.map((r) => {
    const newRemaining = Math.min(r.New, newRemainingToday(r.slug))
    const { dueInProgress, unpresented, ...rest } = r
    return {
      ...rest,
      due: dueInProgress + newRemaining,
      newRemaining,
      lessons: Math.min(unpresented, Math.max(0, newPerDay() - newIntroducedToday(r.slug))),
    }
  })
}

export interface Overview {
  reviewsToday: number
  accuracyToday: number
  streak: number
  totalReviews: number
  history: { day: string; count: number }[]
}

export function getOverview(): Overview {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const today = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS ok
       FROM review WHERE reviewed_at >= ?`,
    )
    .get(startOfDay.toISOString()) as { n: number; ok: number | null }

  const total = (db.prepare('SELECT COUNT(*) AS n FROM review').get() as { n: number }).n

  const history = db
    .prepare(
      `SELECT date(reviewed_at) AS day, COUNT(*) AS count
       FROM review GROUP BY day ORDER BY day DESC LIMIT 30`,
    )
    .all() as { day: string; count: number }[]

  // Racha: días consecutivos con al menos un repaso, hacia atrás desde hoy.
  const days = new Set(history.map((h) => h.day))
  let streak = 0
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    reviewsToday: today.n,
    accuracyToday: today.n ? Math.round(((today.ok ?? 0) / today.n) * 100) : 0,
    streak,
    totalReviews: total,
    history: history.reverse(),
  }
}

export function resetProgress(): void {
  db.transaction(() => {
    db.prepare('DELETE FROM review').run()
    db.prepare(
      `UPDATE card SET due = ?, stability = 0, difficulty = 0, elapsed_days = 0,
         scheduled_days = 0, learning_steps = 0, reps = 0, lapses = 0,
         state = 0, last_review = NULL, suspended = 0`,
    ).run(new Date().toISOString())
    db.prepare(
      `UPDATE card SET locked = 1 WHERE card_type != 'recognition'
        OR item_id IN (SELECT i.id FROM item i JOIN deck d ON d.id = i.deck_id
                       WHERE d.kind = 'vocab' OR i.block != 'gojuon')`,
    ).run()
  })()
  refreshLocks()
}

export function exportAll(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: db
        .prepare(
          `SELECT d.slug AS deck, i.glyph, c.card_type, c.due, c.stability, c.difficulty,
                  c.elapsed_days, c.scheduled_days, c.learning_steps, c.reps, c.lapses,
                  c.state, c.last_review, c.locked, c.suspended
           FROM card c JOIN item i ON i.id = c.item_id JOIN deck d ON d.id = i.deck_id`,
        )
        .all(),
      reviews: db
        .prepare(
          `SELECT d.slug AS deck, i.glyph, c.card_type, r.reviewed_at, r.rating, r.duration_ms
           FROM review r JOIN card c ON c.id = r.card_id
           JOIN item i ON i.id = c.item_id JOIN deck d ON d.id = i.deck_id`,
        )
        .all(),
    },
    null,
    2,
  )
}

// -------------------------------------------------------- explorador

/** Cómo va un kanji, resumido a partir de sus cartas de estudio. */
export type KanjiProgress = 'locked' | 'new' | 'learning' | 'mature'

export interface KanjiBrowseItem {
  glyph: string
  level: number
  /** Jōyō que ninguna lista JLPT recoge. */
  extra: boolean
  meaning: string
  progress: KanjiProgress
  strokes: number
}

export interface KanjiDetail extends KanjiBrowseItem {
  meanings: string[]
  on: string[]
  kun: string[]
  freq: number
  grade: number
  /** Próximo repaso, si ya está en circulación. */
  nextDue: string | null
  words: { word: string; reading: string; meaning: string; progress: KanjiProgress }[]
}

/**
 * Un kanji tiene dos cartas de estudio (significado y lectura) que pueden ir
 * a distinto ritmo. Se resume en un solo estado tomando el de la más
 * atrasada: un kanji cuya lectura aún no se sabe no está «asentado».
 */
function summarize(row: { minLocked: number; minState: number }): KanjiProgress {
  if (row.minLocked === 1) return 'locked'
  if (row.minState === 0) return 'new'
  if (row.minState === 2) return 'mature'
  return 'learning'
}

const BROWSE_COLUMNS = `i.glyph, i.meaning, i.alt, i.row_key AS rowKey, i.block,
         MIN(c.locked) AS minLocked, MIN(c.state) AS minState,
         MIN(CASE WHEN c.locked = 0 THEN c.due END) AS nextDue`

const BROWSE_FROM = `FROM item i
       JOIN deck d ON d.id = i.deck_id AND d.kind = 'kanji'
       JOIN card c ON c.item_id = i.id AND c.card_type IN ('meaning', 'reading')
       WHERE i.block != 'word'`

interface BrowseRow {
  glyph: string
  meaning: string | null
  alt: string
  rowKey: string
  block: string
  minLocked: number
  minState: number
  nextDue: string | null
}

export interface BrowseFilters {
  /** Nivel JLPT, o 0 para todos. */
  level?: number
  progress?: KanjiProgress | 'all'
  /**
   * Términos a buscar. El renderer envía el texto tal cual y además sus
   * conversiones a hiragana y katakana, porque quien busca «nichi» espera
   * encontrar ニチ sin tener que escribir en japonés.
   */
  terms?: string[]
  limit?: number
}

export function browseKanji(filters: BrowseFilters = {}): KanjiBrowseItem[] {
  const { level = 0, progress = 'all', terms = [], limit = 3000 } = filters

  const clauses: string[] = []
  const params: unknown[] = []

  if (level) {
    clauses.push('i.row_key = ?')
    params.push(`n${level}`)
  }

  const clean = terms.map((t) => t.trim()).filter(Boolean)
  if (clean.length) {
    // Se busca en el carácter, en los significados y en las lecturas. Los
    // significados viven dentro del JSON de `alt`, de ahí el LIKE sobre él.
    const per = clean.map(() => '(i.glyph = ? OR i.alt LIKE ? OR i.reading LIKE ?)')
    clauses.push(`(${per.join(' OR ')})`)
    for (const t of clean) params.push(t, `%${t}%`, `%${t}%`)
  }

  const where = clauses.length ? ` AND ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT ${BROWSE_COLUMNS} ${BROWSE_FROM}${where}
       GROUP BY i.id ORDER BY i.deck_id, i.position LIMIT ?`,
    )
    .all(...params, limit) as BrowseRow[]

  const mapped = rows.map((r) => {
    const alt = JSON.parse(r.alt) as { meanings?: string[]; strokes?: number; on?: string[]; kun?: string[] }
    return {
      item: {
        glyph: r.glyph,
        level: Number(r.rowKey.replace('n', '')),
        extra: r.block === 'joyo-extra',
        meaning: r.meaning ?? (alt.meanings?.[0] ?? ''),
        progress: summarize(r),
        strokes: alt.strokes ?? 0,
      },
      meanings: alt.meanings ?? [],
      readings: [...(alt.on ?? []), ...(alt.kun ?? [])],
    }
  })

  const filtered = mapped.filter(
    (k) => progress === 'all' || k.item.progress === progress,
  )
  if (!clean.length) return filtered.map((k) => k.item)

  // El LIKE del SQL busca subcadenas, así que «agua» arrastra «paraguas».
  // Se reordena por relevancia para que la coincidencia exacta mande; el
  // orden original (frecuencia en prensa) decide los empates.
  const lower = clean.map((t) => t.toLowerCase())
  const rank = (k: (typeof filtered)[number]): number => {
    if (lower.some((t) => k.item.glyph === t)) return 0
    const meanings = k.meanings.map((m) => m.toLowerCase())
    const readings = k.readings.map((r) => r.replace(/[.\-]/g, ''))
    if (lower.some((t) => meanings.includes(t) || readings.includes(t))) return 1
    if (lower.some((t) => meanings.some((m) => m.startsWith(t)))) return 2
    return 3
  }

  return filtered
    .map((k, i) => ({ k, i, r: rank(k) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ k }) => k.item)
}

export function kanjiDetail(glyph: string): KanjiDetail | null {
  const row = db
    .prepare(`SELECT ${BROWSE_COLUMNS} ${BROWSE_FROM} AND i.glyph = ? GROUP BY i.id`)
    .get(glyph) as BrowseRow | undefined
  if (!row) return null

  const alt = JSON.parse(row.alt) as {
    on?: string[]
    kun?: string[]
    meanings?: string[]
    strokes?: number
    freq?: number
    grade?: number
  }

  const words = db
    .prepare(
      `SELECT i.glyph AS word, i.reading, i.meaning,
              MIN(c.locked) AS minLocked, MIN(c.state) AS minState
       FROM item i
       JOIN card c ON c.item_id = i.id AND c.card_type = 'word'
       WHERE i.block = 'word' AND i.row_key = ?
       GROUP BY i.id ORDER BY i.position`,
    )
    .all(glyph) as {
    word: string
    reading: string
    meaning: string
    minLocked: number
    minState: number
  }[]

  return {
    glyph: row.glyph,
    level: Number(row.rowKey.replace('n', '')),
    extra: row.block === 'joyo-extra',
    meaning: row.meaning ?? '',
    progress: summarize(row),
    strokes: alt.strokes ?? 0,
    meanings: alt.meanings ?? [],
    on: alt.on ?? [],
    kun: alt.kun ?? [],
    freq: alt.freq ?? 0,
    grade: alt.grade ?? 0,
    nextDue: row.nextDue,
    words: words.map((w) => ({
      word: w.word,
      reading: w.reading,
      meaning: w.meaning,
      progress: summarize(w),
    })),
  }
}

/** Cuántos kanji hay en cada estado, para las cifras del explorador. */
export function kanjiProgressCounts(level = 0): Record<KanjiProgress, number> {
  const out: Record<KanjiProgress, number> = { locked: 0, new: 0, learning: 0, mature: 0 }
  for (const k of browseKanji({ level })) out[k.progress]++
  return out
}

// ----------------------------------------------- cartas apartadas

export interface LeechCard {
  cardId: number
  deck: string
  deckName: string
  glyph: string
  reading: string
  meaning: string | null
  cardType: CardType
  lapses: number
  reps: number
  /** Fallos acumulados; es el criterio por el que se aparta. */
  failures: number
  /** Proporción de fallos sobre el total de repasos, en tanto por ciento. */
  failureRate: number
}

/**
 * Cartas que se han apartado por acumular fallos. Sin esta lista se
 * esfumaban de la circulación sin que el usuario llegara a enterarse.
 */
export function listLeeches(): LeechCard[] {
  return (
    db
      .prepare(
        `SELECT c.id AS cardId, d.slug AS deck, d.name AS deckName,
                i.glyph, i.reading, i.meaning, c.card_type AS cardType,
                c.lapses, c.reps,
                (SELECT COUNT(*) FROM review r WHERE r.card_id = c.id AND r.rating = 1)
                  AS failures
         FROM card c
         JOIN item i ON i.id = c.item_id
         JOIN deck d ON d.id = i.deck_id
         WHERE c.suspended = 1
         ORDER BY failures DESC, d.position, i.position`,
      )
      .all() as Omit<LeechCard, 'failureRate'>[]
  ).map((c) => ({
    ...c,
    failureRate: c.reps ? Math.round((c.failures / c.reps) * 100) : 0,
  }))
}

/**
 * Devuelve una carta a la circulación. El umbral sube para que no vuelva a
 * apartarse al primer tropiezo: arrastra los lapsus de antes, y esos no se
 * borran porque FSRS los usa para calcular la dificultad.
 */
export function reviveCard(cardId: number): void {
  db.prepare(
    `UPDATE card SET suspended = 0, leech_at = ?, due = ? WHERE id = ?`,
  ).run(countFailures(cardId) + LEECH_FAILURES, new Date().toISOString(), cardId)
}

export function suspendCard(cardId: number): void {
  db.prepare('UPDATE card SET suspended = 1 WHERE id = ?').run(cardId)
}

export function reviveAllLeeches(): number {
  const ids = (db.prepare('SELECT id FROM card WHERE suspended = 1').all() as { id: number }[]).map(
    (r) => r.id,
  )
  db.transaction(() => {
    for (const id of ids) reviveCard(id)
  })()
  return ids.length
}

// ------------------------------------------------- previsión de carga

export interface ForecastDay {
  /** Fecha en formato YYYY-MM-DD. */
  day: string
  count: number
}

export interface Forecast {
  /** Repasos ya vencidos que siguen sin hacerse. */
  overdue: number
  days: ForecastDay[]
}

/**
 * Repasos ya programados para los próximos días.
 *
 * Solo cuenta lo que FSRS tiene agendado: las cartas nuevas que aún no se
 * han estudiado no aparecen, porque su fecha depende de cuándo se estudien
 * y con qué nota. Es una previsión de lo comprometido, no una estimación.
 */
export function getForecast(days = 14): Forecast {
  const now = new Date()
  const nowIso = now.toISOString()
  const end = new Date(now)
  end.setDate(end.getDate() + days)
  end.setHours(23, 59, 59, 999)

  const overdue = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM card
         WHERE locked = 0 AND suspended = 0 AND state != 0 AND due <= ?`,
      )
      .get(nowIso) as { n: number }
  ).n

  // date() interpreta el ISO como UTC; el localtime lo lleva al día del
  // usuario, que es el que ve en pantalla.
  const rows = db
    .prepare(
      `SELECT date(due, 'localtime') AS day, COUNT(*) AS count
       FROM card
       WHERE locked = 0 AND suspended = 0 AND state != 0
         AND due > ? AND due <= ?
       GROUP BY day ORDER BY day`,
    )
    .all(nowIso, end.toISOString()) as ForecastDay[]

  const counts = new Map(rows.map((r) => [r.day, r.count]))
  const out: ForecastDay[] = []
  const cursor = new Date(now)
  for (let i = 0; i < days; i++) {
    cursor.setDate(i === 0 ? cursor.getDate() : cursor.getDate() + 1)
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push({ day: key, count: counts.get(key) ?? 0 })
  }
  return { overdue, days: out }
}

/** Trazos de un kanji, en el orden en que se escriben. */
export function kanjiStrokes(glyph: string): string[] {
  return (KANJI_STROKES as Record<string, string[]>)[glyph] ?? []
}

// ------------------------------------------------------------ deshacer

export interface UndoResult {
  cardId: number
  glyph: string
  /** Nota que se retira, para poder decir qué se ha deshecho. */
  rating: number
}

/** Campos de `card` que se restauran al deshacer. */
const RESTORABLE = [
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'last_review',
  'suspended',
  'leech_at',
] as const

/**
 * Deshace el último repaso: devuelve la carta al estado exacto que tenía
 * antes y borra el registro.
 *
 * Lo que no se revierte son los desbloqueos: si ese repaso abrió un bloque
 * o un nivel, esas cartas siguen abiertas. Volver a cerrarlas escondería
 * material que el usuario ya ha visto, y refreshLocks solo abre cuando se
 * cumple el umbral, así que dejarlas abiertas no adelanta nada indebido.
 */
export function undoLastReview(): UndoResult | null {
  const last = db
    .prepare(
      `SELECT r.id, r.card_id AS cardId, r.rating, r.prev_card, i.glyph
       FROM review r
       JOIN card c ON c.id = r.card_id
       JOIN item i ON i.id = c.item_id
       ORDER BY r.id DESC LIMIT 1`,
    )
    .get() as
    | { id: number; cardId: number; rating: number; prev_card: string | null; glyph: string }
    | undefined

  // Sin `prev_card` no hay a dónde volver: son repasos anteriores a que se
  // empezara a guardar el estado previo.
  if (!last?.prev_card) return null

  const prev = JSON.parse(last.prev_card) as Record<string, unknown>
  const assignments = RESTORABLE.map((f) => `${f} = @${f}`).join(', ')
  const values = Object.fromEntries(RESTORABLE.map((f) => [f, prev[f] ?? null]))

  db.transaction(() => {
    db.prepare(`UPDATE card SET ${assignments} WHERE id = @id`).run({ ...values, id: last.cardId })
    db.prepare('DELETE FROM review WHERE id = ?').run(last.id)
  })()

  return { cardId: last.cardId, glyph: last.glyph, rating: last.rating }
}

/** Si hay algo que deshacer, para poder habilitar el botón. */
export function canUndo(): boolean {
  const row = db
    .prepare('SELECT prev_card FROM review ORDER BY id DESC LIMIT 1')
    .get() as { prev_card: string | null } | undefined
  return Boolean(row?.prev_card)
}

/** Una carta concreta, con la forma que espera la sesión de estudio. */
export function getCard(cardId: number): StudyCard | null {
  return (db
    .prepare(
      `SELECT c.id AS cardId, i.id AS itemId, d.slug AS deck, d.kind AS deckKind,
              c.card_type AS cardType, i.glyph, i.reading, i.meaning, i.alt,
              i.block, c.state, c.reps, c.due
       FROM card c
       JOIN item i ON i.id = c.item_id
       JOIN deck d ON d.id = i.deck_id
       WHERE c.id = ?`,
    )
    .get(cardId) ?? null) as StudyCard | null
}

// ----------------------------------------------------------- lecciones

/**
 * Siguiente tanda de elementos por presentar.
 *
 * Una carta nueva no entra en el examen hasta pasar por aquí. Preguntar por
 * un kanji que nunca se ha mostrado no mide la memoria: garantiza un fallo,
 * ensucia el cálculo de FSRS —que lo interpreta como «esto te cuesta»— y
 * acerca la carta al umbral de las apartadas por motivos que no son suyos.
 *
 * Solo se presenta lo que cabe en el cupo diario: las lecciones son la
 * puerta por la que entra el material nuevo.
 */
export function getLessons(slug: string, limit = lessonBatchSize()): StudyCard[] {
  const room = Math.min(limit, newRemainingToday(slug))
  if (room <= 0) return []

  return db
    .prepare(
      `SELECT c.id AS cardId, i.id AS itemId, d.slug AS deck, d.kind AS deckKind,
              c.card_type AS cardType, i.glyph, i.reading, i.meaning, i.alt,
              i.block, c.state, c.reps, c.due
       FROM card c
       JOIN item i ON i.id = c.item_id
       JOIN deck d ON d.id = i.deck_id
       WHERE d.slug = ? AND c.locked = 0 AND c.suspended = 0
         AND c.state = 0 AND c.presented_at IS NULL
       ORDER BY i.position, c.card_type
       LIMIT ?`,
    )
    .all(slug, room) as StudyCard[]
}

/** Marca una tanda como presentada; a partir de aquí ya se puede examinar. */
export function markPresented(cardIds: number[]): void {
  if (!cardIds.length) return
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE card SET presented_at = ? WHERE id = ? AND presented_at IS NULL')
  db.transaction(() => {
    for (const id of cardIds) stmt.run(now, id)
  })()
}

/** Cuántos elementos quedan hoy por presentar en un mazo. */
export function lessonsRemaining(slug: string): number {
  const available = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM card c
         JOIN item i ON i.id = c.item_id
         JOIN deck d ON d.id = i.deck_id
         WHERE d.slug = ? AND c.locked = 0 AND c.suspended = 0
           AND c.state = 0 AND c.presented_at IS NULL`,
      )
      .get(slug) as { n: number }
  ).n
  return Math.min(available, newRemainingToday(slug))
}

/** Palabras de ejemplo de un kanji, para enseñarlas junto al carácter. */
export function wordsForKanji(glyph: string): { word: string; reading: string; meaning: string }[] {
  return db
    .prepare(
      `SELECT i.glyph AS word, i.reading, i.meaning
       FROM item i WHERE i.block = 'word' AND i.row_key = ?
       ORDER BY i.position LIMIT 4`,
    )
    .all(glyph) as { word: string; reading: string; meaning: string }[]
}

// ------------------------------------- explorador de kana y vocabulario

export interface SimpleBrowseItem {
  glyph: string
  reading: string
  meaning: string | null
  deck: string
  block: string
  progress: KanjiProgress
  /** Próximo repaso, si ya está en circulación. */
  nextDue: string | null
}

/**
 * Recorre los mazos que no son de kanji. Comparte el resumen de estado con
 * el explorador de kanji: manda la carta más atrasada, porque saber leer か
 * no es lo mismo que saber escribirlo.
 */
export function browseSimple(slug: string, terms: string[] = []): SimpleBrowseItem[] {
  const clauses: string[] = []
  const params: unknown[] = [slug]

  const clean = terms.map((t) => t.trim()).filter(Boolean)
  if (clean.length) {
    clauses.push(
      `(${clean.map(() => '(i.glyph = ? OR i.reading LIKE ? OR i.meaning LIKE ?)').join(' OR ')})`,
    )
    for (const t of clean) params.push(t, `%${t}%`, `%${t}%`)
  }

  const rows = db
    .prepare(
      `SELECT i.glyph, i.reading, i.meaning, d.slug AS deck, i.block,
              MIN(c.locked) AS minLocked, MIN(c.state) AS minState,
              MIN(CASE WHEN c.locked = 0 THEN c.due END) AS nextDue
       FROM item i
       JOIN deck d ON d.id = i.deck_id
       JOIN card c ON c.item_id = i.id
       WHERE d.slug = ?${clauses.length ? ` AND ${clauses.join(' AND ')}` : ''}
       GROUP BY i.id ORDER BY i.position`,
    )
    .all(...params) as (Omit<SimpleBrowseItem, 'progress'> & {
    minLocked: number
    minState: number
  })[]

  return rows.map(({ minLocked, minState, ...rest }) => ({
    ...rest,
    progress: summarize({ minLocked, minState }),
  }))
}

/**
 * Frase de ejemplo de un kanji. No es una carta: es contexto, para que la
 * palabra deje de estar suelta. Todos sus kanji pertenecen a niveles ya
 * estudiados cuando la frase aparece, por construcción del generador.
 */
export function sentenceFor(glyph: string): { japanese: string; spanish: string } | null {
  const found = (SENTENCES as { j: string; e: string; k: string }[]).find((s) => s.k === glyph)
  return found ? { japanese: found.j, spanish: found.e } : null
}
