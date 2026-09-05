import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StudyCard } from '../types'
import { checkAnswer, toTargetKana, type CheckMode } from '../lib/answer'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'

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
  const vocabAlts = (parsed ?? {}) as { reading?: string[]; meaning?: string[] }

  if (card.deckKind === 'vocab') {
    if (card.cardType === 'recognition') {
      return {
        stimulus: card.glyph,
        stimulusIsJapanese: true,
        question: '¿Qué significa?',
        mode: 'meaning',
        expected: card.meaning ?? '',
        alternatives: vocabAlts.meaning ?? [],
        placeholder: 'significado en español',
        audio: card.glyph,
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

type Phase = 'asking' | 'right' | 'wrong'

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
  const [exhausted, setExhausted] = useState<Exhausted | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shownAt = useRef(Date.now())

  useEffect(() => {
    window.manabi.getQueue(deck, 40).then((q) => {
      setQueue(q)
      shownAt.current = Date.now()
    })
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

  const card = exhausted ? undefined : queue?.[index]
  const prompt = useMemo(() => (card ? buildPrompt(card) : null), [card])

  // Vista previa en vivo de la conversión rōmaji → kana.
  const livePreview =
    prompt?.mode === 'kana' && value ? toTargetKana(value, prompt.expected) : null

  const advance = useCallback(() => {
    setPhase('asking')
    setValue('')
    setDone((d) => d + 1)
    if (queue && index + 1 >= queue.length) {
      void refill()
    } else {
      setIndex((i) => i + 1)
    }
    shownAt.current = Date.now()
    inputRef.current?.focus()
  }, [queue, index, refill])

  const submit = useCallback(async () => {
    if (!card || !prompt || phase !== 'asking' || !value.trim()) return
    const result = checkAnswer(value, prompt.expected, prompt.alternatives, prompt.mode)
    const elapsed = Date.now() - shownAt.current

    if (result.correct) {
      setPhase('right')
      setTally((t) => ({ ...t, right: t.right + 1 }))
      await window.manabi.grade(card.cardId, 3, elapsed)
    } else {
      setPhase('wrong')
      setTally((t) => ({ ...t, wrong: t.wrong + 1 }))
      await window.manabi.grade(card.cardId, 1, elapsed)
    }
  }, [card, prompt, phase, value])

  /** Recalifica un acierto con una nota distinta (Difícil / Fácil). */
  const regrade = useCallback(
    async (rating: 2 | 4) => {
      if (!card || phase !== 'right') return
      await window.manabi.grade(card.cardId, rating, Date.now() - shownAt.current)
      advance()
    },
    [card, phase, advance],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onExit()
      if (e.key === 'Enter') {
        e.preventDefault()
        return phase === 'asking' ? void submit() : advance()
      }
      if (phase === 'right') {
        if (e.key === '2') return void regrade(2)
        if (e.key === '4') return void regrade(4)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, submit, advance, regrade, onExit])

  // `queue` va en las dependencias a propósito: en el primer render la cola
  // aún no ha llegado y no existe el input, así que sin ella el foco inicial
  // nunca se aplicaba y había que hacer clic para empezar a escribir.
  useEffect(() => {
    inputRef.current?.focus()
  }, [index, phase, queue])

  if (!queue) return <Centered>Cargando…</Centered>

  if (queue.length === 0) {
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

  const answered = phase !== 'asking'
  const progress = (index / queue.length) * 100

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex shrink-0 items-center justify-between px-6 pt-3 pb-2">
        <div className="no-drag flex items-center gap-3 pl-16">
          <button onClick={onExit} className="text-sm text-muted hover:text-fg">
            ← {deckName}
          </button>
        </div>
        <div className="text-sm tabular-nums text-muted">
          {done} {done === 1 ? 'carta' : 'cartas'} · quedan {queue.length - index}
        </div>
      </header>

      <div className="h-0.5 w-full shrink-0 bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <p className="mb-6 text-sm tracking-wide text-muted uppercase">{prompt.question}</p>

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
                  : 'border-line focus:border-muted'
            }`}
          />

          {livePreview && !answered && (
            <p className="jp mt-3 text-center text-3xl text-muted">{livePreview}</p>
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

          {phase === 'right' && prompt.audio && !prompt.word && (
            <div className="mt-4 flex items-center justify-center gap-2 text-muted">
              <span className="jp text-2xl text-fg">{card.glyph}</span>
              <Speaker text={prompt.audio} size="md" />
            </div>
          )}

          {answered && prompt.kanji && (
            <KanjiPanel detail={prompt.kanji} failed={phase === 'wrong'} />
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

          <div className="mt-6 flex h-12 items-center justify-center gap-3">
            {!answered && <span className="text-sm text-muted">Intro para responder</span>}
            {phase === 'right' && (
              <>
                <Key onClick={() => void regrade(2)} label="Costó" hint="2" />
                <Key onClick={advance} label="Bien" hint="Intro" primary />
                <Key onClick={() => void regrade(4)} label="Fácil" hint="4" />
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
function KanjiPanel({ detail, failed }: { detail: KanjiDetail; failed: boolean }) {
  return (
    <div
      className={`mt-5 rounded-xl px-5 py-4 ${failed ? 'bg-accent-soft' : 'bg-surface border border-line'}`}
    >
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
