import { useEffect, useState } from 'react'
import type { StudyCard } from '../types'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'
import StrokeOrder from './StrokeOrder'

interface KanjiAlt {
  on?: string[]
  kun?: string[]
  meanings?: string[]
  strokes?: number
}

interface Props {
  card: StudyCard
  /** Posición dentro de la tanda, para orientar al que estudia. */
  position: number
  total: number
  showStrokes: boolean
  onNext: () => void
}

/**
 * Presentación de un elemento nuevo: se enseña, no se pregunta.
 *
 * Hasta ahora la primera vez que aparecía un carácter era ya un examen, lo
 * que garantizaba un fallo que FSRS interpretaba como dificultad real. Aquí
 * se muestra todo lo que hace falta saber y después se examina.
 */
export default function LessonCard({ card, position, total, showStrokes, onNext }: Props) {
  const [words, setWords] = useState<{ word: string; reading: string; meaning: string }[]>([])

  let alt: unknown = null
  try {
    alt = JSON.parse(card.alt)
  } catch {
    alt = null
  }

  const isKanji = card.deckKind === 'kanji' && card.block !== 'word'
  const kanji = isKanji ? ((alt ?? {}) as KanjiAlt) : null

  useEffect(() => {
    if (!isKanji) return setWords([])
    void window.manabi.wordsForKanji(card.glyph).then(setWords)
  }, [card.glyph, isKanji])

  // Los yōon (きゃ) no existen como una sola entrada en KanjiVG: se dibuja
  // cada carácter por separado.
  const strokeChars = [...card.glyph]

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <p className="mb-6 text-xs tracking-widest text-warn uppercase">
        Nuevo · {position} de {total}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-8">
        {showStrokes && strokeChars.length <= 2 ? (
          <div className="flex gap-3">
            {strokeChars.map((ch, i) => (
              <StrokeOrder key={`${ch}-${i}`} glyph={ch} size={strokeChars.length > 1 ? 130 : 180} autoPlay />
            ))}
          </div>
        ) : (
          <span className={`jp leading-none ${card.glyph.length > 2 ? 'text-7xl' : 'text-[8rem]'}`}>
            {card.glyph}
          </span>
        )}

        <div className="max-w-sm text-center sm:text-left">
          {strokeChars.length <= 2 && showStrokes && (
            <p className="jp mb-2 text-4xl">{card.glyph}</p>
          )}

          {kanji ? (
            <>
              <p className="text-xl">{(kanji.meanings ?? []).join(', ')}</p>
              <div className="mt-4 space-y-2">
                {(kanji.on ?? []).length > 0 && <Readings label="ON" list={kanji.on!} />}
                {(kanji.kun ?? []).length > 0 && <Readings label="KUN" list={kanji.kun!} />}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <p className="font-mono text-2xl">{card.reading}</p>
              <Speaker text={card.glyph} size="md" />
            </div>
          )}

          {!kanji && card.meaning && <p className="mt-2 text-lg text-muted">{card.meaning}</p>}
        </div>
      </div>

      {words.length > 0 && (
        <div className="mt-8 w-full max-w-lg">
          <p className="mb-3 text-center text-xs tracking-wide text-muted uppercase">
            {words.length === 1 ? 'Palabra de ejemplo' : 'Palabras de ejemplo'}
          </p>
          <ul className="space-y-1.5">
            {words.map((w) => (
              <li
                key={w.word}
                className="flex items-baseline gap-3 rounded-lg bg-surface px-4 py-2 text-sm"
              >
                <span className="jp text-lg">{w.word}</span>
                <span className="jp text-muted">{w.reading}</span>
                <Speaker text={w.word} />
                <span className="ml-auto text-right text-muted">{w.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        className="mt-8 rounded-lg bg-fg px-6 py-2.5 text-sm font-medium text-ink hover:bg-white"
      >
        {position === total ? 'Empezar a practicar' : 'Siguiente'}{' '}
        <span className="text-ink/50">Intro</span>
      </button>
    </div>
  )
}

function Readings({ label, list }: { label: string; list: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-8 shrink-0 text-xs tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {list.map((r) => (
          <span key={r} className="flex items-center rounded-md bg-raised/60 pl-2">
            <span className="jp text-lg">{r}</span>
            <Speaker text={cleanReading(r)} label={r} />
          </span>
        ))}
      </div>
    </div>
  )
}
