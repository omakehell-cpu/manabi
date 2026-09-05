import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StudyCard } from '../types'
import { checkAnswer, toTargetKana, type CheckMode } from '../lib/answer'

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
}

function buildPrompt(card: StudyCard): Prompt {
  let parsed: unknown = []
  try {
    parsed = JSON.parse(card.alt)
  } catch {
    parsed = []
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
  }
}

type Phase = 'asking' | 'right' | 'wrong'

interface Props {
  deck: string
  deckName: string
  onExit: () => void
}

export default function Study({ deck, deckName, onExit }: Props) {
  const [queue, setQueue] = useState<StudyCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('asking')
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const shownAt = useRef(Date.now())

  useEffect(() => {
    window.manabi.getQueue(deck, 40).then((q) => {
      setQueue(q)
      shownAt.current = Date.now()
    })
  }, [deck])

  const card = queue?.[index]
  const prompt = useMemo(() => (card ? buildPrompt(card) : null), [card])

  // Vista previa en vivo de la conversión rōmaji → kana.
  const livePreview =
    prompt?.mode === 'kana' && value ? toTargetKana(value, prompt.expected) : null

  const advance = useCallback(() => {
    setPhase('asking')
    setValue('')
    setIndex((i) => i + 1)
    shownAt.current = Date.now()
    inputRef.current?.focus()
  }, [])

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

  if (!queue) {
    return <Centered>Cargando…</Centered>
  }

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
        <p className="text-3xl font-medium">Sesión terminada</p>
        <div className="mt-8 flex gap-10 text-center">
          <Figure value={total} label="cartas" />
          <Figure value={tally.right} label="aciertos" tone="ok" />
          <Figure value={tally.wrong} label="fallos" tone="accent" />
          <Figure
            value={total ? `${Math.round((tally.right / total) * 100)}%` : '—'}
            label="precisión"
          />
        </div>
        <button onClick={onExit} className="mt-10 rounded-lg bg-raised px-5 py-2.5 hover:bg-line">
          Volver
        </button>
      </Centered>
    )
  }

  const done = index
  const progress = (done / queue.length) * 100

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex shrink-0 items-center justify-between px-6 pt-3 pb-2">
        <div className="no-drag flex items-center gap-3 pl-16">
          <button onClick={onExit} className="text-sm text-muted hover:text-fg">
            ← {deckName}
          </button>
        </div>
        <div className="text-sm tabular-nums text-muted">
          {done} / {queue.length}
        </div>
      </header>

      <div className="h-0.5 w-full shrink-0 bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <p className="mb-8 text-sm tracking-wide text-muted uppercase">{prompt.question}</p>

        <div
          key={card.cardId}
          className={`pop mb-10 ${prompt.stimulusIsJapanese ? 'jp' : 'font-mono'} ${
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
            disabled={phase !== 'asking'}
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

          {livePreview && phase === 'asking' && (
            <p className="jp mt-3 text-center text-3xl text-muted">{livePreview}</p>
          )}

          {phase === 'wrong' && (
            <div className="mt-5 rounded-xl bg-accent-soft px-5 py-4 text-center">
              <p className="text-xs tracking-wide text-muted uppercase">Respuesta</p>
              <p
                className={`mt-1 text-3xl ${prompt.mode === 'kana' ? 'jp' : ''}`}
              >
                {prompt.expected}
              </p>
              {prompt.alternatives.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  también válido: {prompt.alternatives.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex h-12 items-center justify-center gap-3">
            {phase === 'asking' && (
              <span className="text-sm text-muted">Intro para responder</span>
            )}
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
