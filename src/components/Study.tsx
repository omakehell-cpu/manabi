import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StudyCard } from '../types'
import { checkAnswer, maskAnswer, toTargetKana, type CheckMode } from '../lib/answer'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'
import StrokeOrder from './StrokeOrder'
import LessonCard from './LessonCard'
import { strokeVisibility, type StrokeMode } from '../lib/prefs'

/** Detalle que se despliega al responder una carta de kanji. */
interface KanjiDetail {
  on: string[]
  kun: string[]
  meanings: string[]
  strokes: number
}

interface Prompt {
  /** Lo que se muestra en grande. */
  stimulus: string
  /** Si el estímulo va en fuente japonesa y a tamaño grande. */
  stimulusIsJapanese: boolean
  question: string
  mode: CheckMode
  expected: string
  alternatives: string[]
  placeholder: string
  /** Texto que se puede escuchar una vez respondida la carta. */
  audio?: string
  kanji?: KanjiDetail
  word?: { reading: string; meaning: string }
  /** Otras acepciones: se enseñan al responder, no se aceptan como respuesta. */
  others?: string[]
}

function buildPrompt(card: StudyCard): Prompt {
  let parsed: unknown = []
  try {
    parsed = JSON.parse(card.alt)
  } catch {
    parsed = []
  }

  if (card.deckKind === 'kanji' && card.cardType === 'word') {
    // Fijar el kanji dentro de una palabra: se pide la lectura, que es
    // justo lo que cambia según el compuesto (生 es セイ en 学生 y い en
    // 生きる). El significado se revela después, como refuerzo.
    return {
      stimulus: card.glyph,
      stimulusIsJapanese: true,
      question: '¿Cómo se lee esta palabra?',
      mode: 'reading',
      expected: card.reading,
      alternatives: [card.reading],
      placeholder: 'teclea en rōmaji',
      audio: card.glyph,
      word: { reading: card.reading, meaning: card.meaning ?? '' },
    }
  }

  if (card.deckKind === 'kanji') {
    const k = parsed as { on: string[]; kun: string[]; meanings: string[]; strokes: number }
    const detail: KanjiDetail = {
      on: k.on ?? [],
      kun: k.kun ?? [],
      meanings: k.meanings ?? [],
      strokes: k.strokes ?? 0,
    }
    const readings = [...detail.on, ...detail.kun]

    if (card.cardType === 'reading') {
      return {
        stimulus: card.glyph,
        stimulusIsJapanese: true,
        question: '¿Cómo se lee? (vale cualquier lectura)',
        mode: 'reading',
        expected: readings[0] ?? '',
        alternatives: readings,
        placeholder: 'teclea en rōmaji',
        kanji: detail,
      }
    }
    return {
      stimulus: card.glyph,
      stimulusIsJapanese: true,
      question: '¿Qué significa?',
      mode: 'meaning',
      expected: detail.meanings[0] ?? card.meaning ?? '',
      alternatives: detail.meanings,
      placeholder: 'significado en español',
      kanji: detail,
    }
  }

  const kanaAlts = Array.isArray(parsed) ? (parsed as string[]) : []
  const vocabAlts = (parsed ?? {}) as {
    reading?: string[]
    meaning?: string[]
    others?: string[]
    pos?: string
  }

  if (card.deckKind === 'vocabulary' || card.deckKind === 'vocab') {
    if (card.cardType === 'recognition') {
      return {
        stimulus: card.glyph,
        stimulusIsJapanese: true,
        // La categoría va en la pregunta porque a menudo es lo único que
        // separa dos palabras: 青 y 青い son ambas «azul», sustantivo una y
        // adjetivo la otra. En N5 hay 33 significados compartidos por 69
        // palabras, y en N1 son 220 por 488.
        question: vocabAlts.pos ? `¿Qué significa? · ${vocabAlts.pos}` : '¿Qué significa?',
        mode: 'meaning',
        expected: card.meaning ?? '',
        alternatives: vocabAlts.meaning ?? [],
        placeholder: 'significado en español',
        audio: card.glyph,
        others: vocabAlts.others ?? [],
      }
    }
    return {
      stimulus: card.glyph,
      stimulusIsJapanese: true,
      question: '¿Cómo se lee?',
      mode: 'romaji',
      expected: card.reading,
      alternatives: vocabAlts.reading ?? [],
      placeholder: 'rōmaji',
      audio: card.glyph,
    }
  }

  // Kana
  if (card.cardType === 'recall') {
    return {
      stimulus: card.reading,
      stimulusIsJapanese: false,
      question: `Escríbelo en ${card.deck}`,
      mode: 'kana',
      expected: card.glyph,
      alternatives: kanaAlts,
      placeholder: 'teclea en rōmaji, se convierte solo',
      audio: card.glyph,
    }
  }
  return {
    stimulus: card.glyph,
    stimulusIsJapanese: true,
    question: '¿Cómo se lee?',
    mode: 'romaji',
    expected: card.reading,
    alternatives: kanaAlts,
    placeholder: 'rōmaji',
    audio: card.glyph,
  }
}

/**
 * `retry` es el segundo intento: se ha fallado una vez pero no se revela la
 * respuesta todavía. No se acepta nada incorrecto —el que responde se
 * corrige solo—, así que no relaja la exigencia; lo que evita es que un
 * desliz de tecleo se registre como un fallo de memoria.
 */
type Phase = 'asking' | 'retry' | 'right' | 'wrong'

/** «10 min», «3 d», «2 mes»: cuándo volvería la carta con cada nota. */
function formatInterval(minutes: number | undefined): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} h`
  const days = hours / 24
  if (days < 31) return `${Math.round(days)} d`
  const months = days / 30.4
  return months < 12 ? `${Math.round(months)} mes` : `${(months / 12).toFixed(1)} a`
}



interface Props {
  deck: string
  deckName: string
  onExit: () => void
}

/** Estado de la sesión cuando ya no hay nada que servir ahora mismo. */
interface Exhausted {
  /** Cartas en aprendizaje que volverán en breve. */
  pending: number
  /** Minutos hasta la siguiente, redondeados hacia arriba. */
  minutes: number
}

export default function Study({ deck, deckName, onExit }: Props) {
  const [queue, setQueue] = useState<StudyCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('asking')
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const [done, setDone] = useState(0)
  const [justSuspended, setJustSuspended] = useState(false)
  /** Lo tecleado en el intento fallido, para poder enseñárselo al corregir. */
  const [firstTry, setFirstTry] = useState('')
  /** Cuándo volvería la carta con cada nota, en minutos. */
  const [preview, setPreview] = useState<Record<number, number>>({})
  /** Nota que se aplica al pulsar Intro tras acertar. */
  const [defaultRating, setDefaultRating] = useState<2 | 3>(3)
  /**
   * Si hay algo que deshacer. Se consulta a la base de datos y no al
   * contador de la sesión, porque deshacer sobrevive a cerrar la aplicación:
   * al entrar puede haber un repaso de ayer pendiente de retirar.
   */
  const [undoable, setUndoable] = useState(false)
  /** Tanda que se está presentando; vacía mientras se examina. */
  const [lesson, setLesson] = useState<StudyCard[]>([])
  const [lessonAt, setLessonAt] = useState(0)
  /**
   * Cartas de la tanda recién presentada que aún no se han acertado. Se
   * gestiona en memoria porque el lote se repite hasta acertarlo entero,
   * y eso ocurre en segundos: pedirlo a la base de datos cada vez sería
   * pelearse con las fechas de FSRS por nada.
   */
  const [batch, setBatch] = useState<StudyCard[] | null>(null)
  const [strokeMode, setStrokeMode] = useState<StrokeMode>('always')
  /** Notas dadas en esta sesión, para revertir el recuento al deshacer. */
  const history = useRef<(1 | 2 | 3 | 4)[]>([])
  const [exhausted, setExhausted] = useState<Exhausted | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shownAt = useRef(Date.now())
  /** `advance` se define después de `setAside`; la referencia rompe el ciclo. */
  const advanceRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void strokeVisibility().then(setStrokeMode)
    void window.manabi.canUndo().then(setUndoable)
  }, [])

  /** Abre la siguiente tanda de lecciones; devuelve false si no queda ninguna. */
  const openLessons = useCallback(async () => {
    const next = await window.manabi.getLessons(deck)
    if (!next.length) return false
    setLesson(next)
    setLessonAt(0)
    return true
  }, [deck])

  useEffect(() => {
    let alive = true
    // Los repasos vencidos van primero: son deuda contraída. Solo cuando no
    // queda ninguno se abre material nuevo.
    void (async () => {
      const q = await window.manabi.getQueue(deck, 40)
      if (!alive) return
      if (q.length) {
        setQueue(q)
      } else {
        const opened = await window.manabi.getLessons(deck)
        if (!alive) return
        if (opened.length) {
          setLesson(opened)
          setLessonAt(0)
        }
        setQueue([])
      }
      shownAt.current = Date.now()
    })()
    return () => {
      alive = false
    }
  }, [deck])

  /**
   * Repone la cola en mitad de la sesión.
   *
   * FSRS devuelve las cartas nuevas a los 1–10 minutos porque espera verlas
   * otra vez el mismo día; si la sesión terminase al agotar la primera
   * tanda, cada carta se vería una sola vez y los pasos de aprendizaje no
   * servirían de nada.
   *
   * Se piden primero las realmente vencidas (`aheadMinutes` a 0). Solo si no
   * queda ninguna se mira el futuro cercano, y entonces se ofrece la salida
   * en lugar de repetir en bucle la única carta pendiente.
   */
  const refill = useCallback(async () => {
    const ready = await window.manabi.getQueue(deck, 40, 0)
    if (ready.length) {
      setQueue(ready)
      setIndex(0)
      shownAt.current = Date.now()
      return
    }
    // Sin repasos que tocar, es el momento de abrir material nuevo.
    const lessons = await window.manabi.getLessons(deck)
    if (lessons.length) {
      setLesson(lessons)
      setLessonAt(0)
      setQueue([])
      setIndex(0)
      return
    }
    const soon = await window.manabi.getQueue(deck, 40)
    if (!soon.length) {
      setExhausted({ pending: 0, minutes: 0 })
      return
    }
    const next = Math.min(...soon.map((c) => new Date(c.due).getTime()))
    const minutes = Math.max(1, Math.ceil((next - Date.now()) / 60_000))
    setExhausted({ pending: soon.length, minutes: Number.isFinite(minutes) ? minutes : 1 })
  }, [deck])

  /** Continuar aunque las cartas aún no hayan vencido del todo. */
  const pushOn = useCallback(async () => {
    const soon = await window.manabi.getQueue(deck, 40)
    if (!soon.length) return setExhausted({ pending: 0, minutes: 0 })
    setExhausted(null)
    setQueue(soon)
    setIndex(0)
    shownAt.current = Date.now()
  }, [deck])

  const card = exhausted ? undefined : (batch ? batch[0] : queue?.[index])
  const prompt = useMemo(() => (card ? buildPrompt(card) : null), [card])

  // Vista previa en vivo de la conversión rōmaji → kana.
  const livePreview =
    prompt?.mode === 'kana' && value ? toTargetKana(value, prompt.expected) : null

  /** Pasa a la siguiente ficha de la presentación, o abre el examen del lote. */
  const advanceLesson = useCallback(async () => {
    if (lessonAt + 1 < lesson.length) {
      setLessonAt((i) => i + 1)
      return
    }
    // Presentada la tanda entera, se examina inmediatamente: es el repaso
    // en caliente lo que la fija.
    await window.manabi.markPresented(lesson.map((c) => c.cardId))
    setBatch(lesson)
    setLesson([])
    setLessonAt(0)
    setPhase('asking')
    setValue('')
    shownAt.current = Date.now()
  }, [lesson, lessonAt])

  /** Aparta la carta actual: para lo que estorba y no se quiere arrastrar. */
  const setAside = useCallback(async () => {
    if (!card) return
    await window.manabi.suspendCard(card.cardId)
    advanceRef.current?.()
  }, [card])

  const advance = useCallback(() => {
    setPhase('asking')
    setValue('')
    setFirstTry('')
    setJustSuspended(false)
    setPreview({})
    setDefaultRating(3)
    setDone((d) => d + 1)

    if (batch) {
      // El lote se repite hasta acertar cada carta una vez. Las falladas
      // vuelven al final, no se pierden.
      const [current, ...rest] = batch
      const failed = phase === 'wrong'
      const remaining = failed ? [...rest, current] : rest
      if (remaining.length) {
        setBatch(remaining)
      } else {
        setBatch(null)
        void (async () => {
          if (!(await openLessons())) void refill()
        })()
      }
    } else if (queue && index + 1 >= queue.length) {
      void refill()
    } else {
      setIndex((i) => i + 1)
    }
    shownAt.current = Date.now()
    inputRef.current?.focus()
  }, [queue, index, refill, batch, phase, openLessons])

  advanceRef.current = advance

  const submit = useCallback(async () => {
    if (!card || !prompt || !value.trim()) return
    if (phase !== 'asking' && phase !== 'retry') return

    const result = checkAnswer(value, prompt.expected, prompt.alternatives, prompt.mode)
    const elapsed = Date.now() - shownAt.current
    const second = phase === 'retry'

    if (result.correct) {
      setTally((t) => ({ ...t, right: t.right + 1 }))
      // Acertar no califica todavía: primero se enseña cuándo volvería la
      // carta con cada nota, y se registra al elegir. Calificar aquí y
      // recalificar después dejaba DOS repasos en el historial por una sola
      // respuesta, y FSRS aplicaba las dos programaciones en cascada.
      setPreview(await window.manabi.previewIntervals(card.cardId))
      // Acertar al segundo intento no es lo mismo que acertar a la primera:
      // la nota por defecto pasa a ser «costó», que es lo que ha pasado.
      setDefaultRating(second ? 2 : 3)
      setPhase('right')
      return
    }

    if (!second) {
      // Primer fallo: ni se califica ni se revela la respuesta todavía.
      setFirstTry(value)
      setPhase('retry')
      setValue('')
      return
    }

    setPhase('wrong')
    setTally((t) => ({ ...t, wrong: t.wrong + 1 }))
    history.current.push(1)
    const outcome = await window.manabi.grade(card.cardId, 1, elapsed)
    setUndoable(true)
    // Apartarla en silencio dejaba al usuario sin saber que había dejado
    // de ver algo; se avisa aquí y queda listada en Progreso.
    setJustSuspended(outcome.suspended)
  }, [card, prompt, phase, value])

  /** Registra la nota elegida —una sola vez— y pasa a la siguiente carta. */
  const commit = useCallback(
    async (rating: 2 | 3 | 4) => {
      if (!card || phase !== 'right') return
      history.current.push(rating)
      await window.manabi.grade(card.cardId, rating, Date.now() - shownAt.current)
      setUndoable(true)
      advance()
    },
    [card, phase, advance],
  )

  /**
   * Deshace el último repaso y devuelve esa carta al principio de la cola.
   *
   * Se reinserta en lugar de retroceder el índice porque la cola se repone
   * a mitad de sesión: el índice anterior puede apuntar ya a otra tanda.
   */
  const undo = useCallback(async () => {
    const undone = await window.manabi.undo()
    if (!undone) return setUndoable(false)
    void window.manabi.canUndo().then(setUndoable)

    const rating = history.current.pop()
    if (rating !== undefined) {
      setTally((t) =>
        rating === 1 ? { ...t, wrong: Math.max(0, t.wrong - 1) } : { ...t, right: Math.max(0, t.right - 1) },
      )
    }
    setDone((d) => Math.max(0, d - 1))

    const restored = await window.manabi.getCard(undone.cardId)
    setExhausted(null)
    setPhase('asking')
    setValue('')
    setFirstTry('')
    setJustSuspended(false)
    if (restored) {
      setQueue((q) => {
        // Primero se recorta por el índice y después se filtra. Al revés,
        // quitar la carta restaurada desplazaba el resto y el slice se
        // comía una carta pendiente en cada deshacer.
        const pending = (q ?? []).slice(index).filter((c) => c.cardId !== restored.cardId)
        return [restored, ...pending]
      })
      setIndex(0)
    }
    shownAt.current = Date.now()
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return void undo()
      }
      if (e.key === 'Escape') return onExit()
      if (e.key === 'Enter') {
        e.preventDefault()
        if (lesson.length) return void advanceLesson()
        if (phase === 'asking' || phase === 'retry') return void submit()
        if (phase === 'right') return void commit(defaultRating)
        return advance()
      }
      if (phase === 'right') {
        if (e.key === '2') return void commit(2)
        if (e.key === '3') return void commit(3)
        if (e.key === '4') return void commit(4)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, submit, advance, commit, defaultRating, onExit, undo, lesson, advanceLesson])

  // Las dependencias son todo lo que puede hacer aparecer el input o cambiar
  // de carta: la cola que llega tarde, el avance dentro de ella, y el lote
  // de una lección, que sustituye a la cola sin tocar el índice. Si falta
  // alguna, el campo no recibe el foco y hay que hacer clic para escribir.
  useEffect(() => {
    inputRef.current?.focus()
  }, [index, phase, queue, batch, lesson])

  if (!queue) return <Centered>Cargando…</Centered>

  if (lesson.length) {
    return (
      <div className="flex h-full flex-col">
        <header className="drag flex shrink-0 items-center justify-between px-6 pt-3 pb-2">
          <div className="no-drag flex items-center gap-3 pl-16">
            <button onClick={onExit} className="text-sm text-muted hover:text-fg">
              ← {deckName}
            </button>
          </div>
          <span className="text-sm text-muted">Aprendiendo</span>
        </header>
        <div className="h-0.5 w-full shrink-0 bg-line">
          <div
            className="h-full bg-warn transition-[width] duration-300"
            style={{ width: `${(lessonAt / lesson.length) * 100}%` }}
          />
        </div>
        <LessonCard
          key={lesson[lessonAt].cardId}
          card={lesson[lessonAt]}
          position={lessonAt + 1}
          total={lesson.length}
          showStrokes={strokeMode !== 'never'}
          onNext={() => void advanceLesson()}
        />
      </div>
    )
  }

  // El lote recién presentado vive aparte de la cola de repasos, que puede
  // estar vacía: sin esta condición, terminar la presentación caía en
  // «nada pendiente» y las cinco cartas nunca llegaban a examinarse.
  if (queue.length === 0 && !batch) {
    return (
      <Centered>
        <p className="text-2xl">Nada pendiente en {deckName}</p>
        <p className="mt-3 max-w-md text-center text-muted">
          FSRS ha programado las cartas para más adelante. Vuelve luego, o estudia otro
          mazo mientras tanto.
        </p>
        <button onClick={onExit} className="mt-8 rounded-lg bg-raised px-5 py-2.5 hover:bg-line">
          Volver
        </button>
      </Centered>
    )
  }

  if (!card || !prompt) {
    const total = tally.right + tally.wrong
    return (
      <Centered>
        <p className="text-3xl font-medium">
          {exhausted?.pending ? 'De momento, hasta aquí' : 'Sesión terminada'}
        </p>
        <div className="mt-8 flex gap-10 text-center">
          <Figure value={total} label="cartas" />
          <Figure value={tally.right} label="aciertos" tone="ok" />
          <Figure value={tally.wrong} label="fallos" tone="accent" />
          <Figure
            value={total ? `${Math.round((tally.right / total) * 100)}%` : '—'}
            label="precisión"
          />
        </div>

        {undoable && (
          <button
            onClick={() => void undo()}
            className="mt-6 text-sm text-muted underline underline-offset-4 hover:text-fg"
          >
            Deshacer el último repaso
          </button>
        )}

        {exhausted?.pending ? (
          <>
            <p className="mt-8 max-w-md text-center text-muted">
              Quedan {exhausted.pending} cartas en aprendizaje. Vuelven dentro de{' '}
              {exhausted.minutes} {exhausted.minutes === 1 ? 'minuto' : 'minutos'}: ese
              respiro es parte del método, pero puedes seguir ahora si lo prefieres.
            </p>
            <div className="mt-8 flex gap-3">
              <button
                onClick={() => void pushOn()}
                className="rounded-lg bg-raised px-5 py-2.5 hover:bg-line"
              >
                Seguir ahora
              </button>
              <button
                onClick={onExit}
                className="rounded-lg bg-fg px-5 py-2.5 font-medium text-ink hover:bg-white"
              >
                Terminar
              </button>
            </div>
          </>
        ) : (
          <button onClick={onExit} className="mt-10 rounded-lg bg-raised px-5 py-2.5 hover:bg-line">
            Volver
          </button>
        )}
      </Centered>
    )
  }

  const answered = phase === 'right' || phase === 'wrong'
  const progress = batch ? 0 : (index / queue.length) * 100

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex shrink-0 items-center justify-between px-6 pt-3 pb-2">
        <div className="no-drag flex items-center gap-3 pl-16">
          <button onClick={onExit} className="text-sm text-muted hover:text-fg">
            ← {deckName}
          </button>
        </div>
        <div className="no-drag flex items-center gap-4">
          <button
            onClick={() => void setAside()}
            title="Apartar esta carta; queda en Progreso para devolverla"
            className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            Apartar
          </button>
          {undoable && (
            <button
              onClick={() => void undo()}
              title="Deshacer el último repaso (⌘Z)"
              className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              ↺ Deshacer
            </button>
          )}
          <span className="text-sm tabular-nums text-muted">
            {done} {done === 1 ? 'carta' : 'cartas'} · quedan{' '}
            {batch ? batch.length : queue.length - index}
          </span>
        </div>
      </header>

      <div className="h-0.5 w-full shrink-0 bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <p className="mb-6 flex items-center gap-2 text-sm tracking-wide text-muted uppercase">
          {batch && <span className="rounded bg-warn/15 px-2 py-0.5 text-xs text-warn">nuevo</span>}
          {prompt.question}
        </p>

        <div
          key={card.cardId}
          className={`pop mb-8 ${prompt.stimulusIsJapanese ? 'jp' : 'font-mono'} ${
            prompt.stimulusIsJapanese
              ? prompt.stimulus.length > 3
                ? 'text-7xl'
                : 'text-[9rem] leading-none'
              : 'text-7xl'
          } ${phase === 'wrong' ? 'shake' : ''}`}
        >
          {prompt.stimulus}
        </div>

        <div className="w-full max-w-md">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={answered}
            spellCheck={false}
            autoComplete="off"
            placeholder={prompt.placeholder}
            className={`w-full rounded-xl border bg-surface px-5 py-4 text-center text-2xl outline-none transition-colors placeholder:text-base placeholder:text-muted/60 disabled:opacity-70 ${
              phase === 'right'
                ? 'border-ok text-ok'
                : phase === 'wrong'
                  ? 'border-accent text-accent'
                  : phase === 'retry'
                    ? 'border-warn focus:border-warn'
                    : 'border-line focus:border-muted'
            }`}
          />

          {livePreview && !answered && (
            <p className="jp mt-3 text-center text-3xl text-muted">{livePreview}</p>
          )}

          {phase === 'retry' && (
            <div className="mt-5 rounded-xl border border-warn/40 px-5 py-4 text-center">
              <p className="text-sm text-warn">
                {firstTry ? (
                  <>
                    «<span className="jp">{firstTry}</span>» no es. Te queda un intento.
                  </>
                ) : (
                  'No es. Te queda un intento.'
                )}
              </p>

              {/* En rōmaji→kana la respuesta es un solo signo: enmascararlo no
                  diría nada, así que la pista es su primer trazo. */}
              {prompt.mode === 'kana' && [...prompt.expected].length === 1 ? (
                <div className="mt-3 flex justify-center">
                  <StrokeOrder glyph={prompt.expected} size={96} initialStrokes={1} bare />
                </div>
              ) : maskAnswer(prompt.expected) ? (
                <p
                  className={`mt-2 font-mono text-2xl tracking-widest text-muted ${
                    prompt.mode === 'reading' || prompt.mode === 'kana' ? 'jp' : ''
                  }`}
                >
                  {maskAnswer(prompt.expected)}
                </p>
              ) : (
                // Una respuesta de un solo carácter no se puede enmascarar
                // sin resolverla; decir que es corta ya descarta casi todo.
                <p className="mt-2 text-sm text-muted">
                  {prompt.mode === 'meaning' ? 'una sola palabra corta' : 'un solo carácter'}
                </p>
              )}

              {prompt.mode === 'meaning' && prompt.alternatives.length > 1 && (
                <p className="mt-2 text-xs text-muted">
                  se aceptan {prompt.alternatives.length} significados distintos
                </p>
              )}
            </div>
          )}

          {phase === 'wrong' && !prompt.kanji && !prompt.word && (
            <div className="mt-5 rounded-xl bg-accent-soft px-5 py-4 text-center">
              <p className="text-xs tracking-wide text-muted uppercase">Respuesta</p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <p className={`text-3xl ${prompt.mode === 'kana' ? 'jp' : ''}`}>
                  {prompt.expected}
                </p>
                {prompt.audio && <Speaker text={prompt.audio} size="md" />}
              </div>
              {prompt.alternatives.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  también válido: {prompt.alternatives.join(', ')}
                </p>
              )}
            </div>
          )}

          {answered && prompt.others && prompt.others.length > 0 && (
            <p className="mt-4 text-center text-sm text-muted">
              también: {prompt.others.join(', ')}
            </p>
          )}

          {phase === 'right' && prompt.audio && !prompt.word && (
            <div className="mt-4 flex items-center justify-center gap-2 text-muted">
              <span className="jp text-2xl text-fg">{card.glyph}</span>
              <Speaker text={prompt.audio} size="md" />
            </div>
          )}

          {answered && prompt.kanji && (
            <KanjiPanel
              detail={prompt.kanji}
              failed={phase === 'wrong'}
              glyph={card.glyph}
              showStrokes={
                strokeMode === 'always' || (strokeMode === 'onError' && phase === 'wrong')
              }
            />
          )}

          {answered && prompt.word && (
            <div
              className={`mt-5 rounded-xl px-5 py-4 text-center ${
                phase === 'wrong' ? 'bg-accent-soft' : 'border border-line bg-surface'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <p className="jp text-3xl">{prompt.word.reading}</p>
                <Speaker text={card.glyph} size="md" />
              </div>
              <p className="mt-2 text-lg text-muted">{prompt.word.meaning}</p>
            </div>
          )}

          {justSuspended && (
            <p className="mt-4 rounded-xl border border-warn/40 px-5 py-3 text-center text-sm leading-relaxed text-warn">
              Esta carta se aparta: llevas ocho fallos con ella. Sigue en Progreso →
              Cartas apartadas, por si quieres devolverla.
            </p>
          )}

          <div className="mt-6 flex h-12 items-center justify-center gap-3">
            {!answered && (
              <span className="text-sm text-muted">
                {phase === 'retry' ? 'Corrige y pulsa Intro' : 'Intro para responder'}
              </span>
            )}
            {phase === 'right' && (
              <>
                <Key
                  onClick={() => void commit(2)}
                  label="Costó"
                  hint={formatInterval(preview[2])}
                  primary={defaultRating === 2}
                />
                <Key
                  onClick={() => void commit(3)}
                  label="Bien"
                  hint={formatInterval(preview[3])}
                  primary={defaultRating === 3}
                />
                <Key
                  onClick={() => void commit(4)}
                  label="Fácil"
                  hint={formatInterval(preview[4])}
                />
              </>
            )}
            {phase === 'wrong' && <Key onClick={advance} label="Continuar" hint="Intro" primary />}
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Ficha del kanji tras responder. Se muestra tanto al acertar como al
 * fallar: es el momento en que de verdad se aprende, y un kanji tiene más
 * de lo que cabe en una respuesta.
 */
function KanjiPanel({
  detail,
  failed,
  glyph,
  showStrokes,
}: {
  detail: KanjiDetail
  failed: boolean
  glyph: string
  showStrokes: boolean
}) {
  return (
    <div
      className={`mt-5 rounded-xl px-5 py-4 ${failed ? 'bg-accent-soft' : 'bg-surface border border-line'}`}
    >
      {showStrokes && (
        <div className="mb-4 flex justify-center">
          <StrokeOrder glyph={glyph} size={140} autoPlay={failed} />
        </div>
      )}
      <p className="text-center text-lg">{detail.meanings.join(', ')}</p>
      <div className="mt-4 space-y-2">
        {detail.on.length > 0 && <ReadingRow label="ON" readings={detail.on} />}
        {detail.kun.length > 0 && <ReadingRow label="KUN" readings={detail.kun} />}
      </div>
      {detail.strokes > 0 && (
        <p className="mt-3 text-center text-xs text-muted">{detail.strokes} trazos</p>
      )}
    </div>
  )
}

function ReadingRow({ label, readings }: { label: string; readings: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-8 shrink-0 text-xs tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {readings.map((r) => (
          <span key={r} className="flex items-center rounded-md bg-raised/60 pl-2">
            <span className="jp text-lg">{r}</span>
            <Speaker text={cleanReading(r)} label={r} />
          </span>
        ))}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-muted">
      {children}
    </div>
  )
}

function Figure({
  value,
  label,
  tone,
}: {
  value: number | string
  label: string
  tone?: 'ok' | 'accent'
}) {
  return (
    <div>
      <p
        className={`text-4xl font-medium tabular-nums ${
          tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent' : 'text-fg'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  )
}

function Key({
  onClick,
  label,
  hint,
  primary,
}: {
  onClick: () => void
  label: string
  hint: string
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm transition-colors ${
        primary ? 'bg-fg text-ink hover:bg-white' : 'bg-raised hover:bg-line'
      }`}
    >
      {label} <span className={primary ? 'text-ink/50' : 'text-muted'}>{hint}</span>
    </button>
  )
}
