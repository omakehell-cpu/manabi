import { useEffect, useState } from 'react'
import type { StudyCard } from '../types'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'
import StrokeOrder from './StrokeOrder'
import Handwriting from './Handwriting'

interface KanjiAlt {
  on?: string[]
  kun?: string[]
  meanings?: string[]
  strokes?: number
}

interface VocabAlt {
  others?: string[]
  pos?: string
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
  const [sentence, setSentence] = useState<{ japanese: string; spanish: string } | null>(null)
  const [writing, setWriting] = useState(false)

  let alt: unknown = null
  try {
    alt = JSON.parse(card.alt)
  } catch {
    alt = null
  }

  const isKanji = card.deckKind === 'kanji' && card.block !== 'word'
  const kanji = isKanji ? ((alt ?? {}) as KanjiAlt) : null
  const vocab = card.deckKind === 'vocabulary' ? ((alt ?? {}) as VocabAlt) : null

  useEffect(() => {
    if (!isKanji) {
      setWords([])
      setSentence(null)
      return
    }
    void window.manabi.wordsForKanji(card.glyph).then(setWords)
    void window.manabi.sentenceFor(card.glyph).then(setSentence)
  }, [card.glyph, isKanji])

  useEffect(() => setWriting(false), [card.cardId])

  // Los yōon (きゃ) no existen como una sola entrada en KanjiVG: se dibuja
  // cada carácter por separado. En vocabulario no se dibuja nada: son
  // palabras, y lo que se aprende es la palabra, no cómo trazar sus signos.
  const isCharacter = card.deckKind === 'hiragana' || card.deckKind === 'katakana' || isKanji
  const strokeChars = isCharacter ? [...card.glyph] : []

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <p className="mb-6 text-xs tracking-widest text-warn uppercase">
        Nuevo · {position} de {total}
      </p>

      {writing ? (
        <Handwriting glyph={strokeChars[0]} size={230} />
      ) : (
      <div className="flex flex-wrap items-center justify-center gap-8">
        {showStrokes && strokeChars.length > 0 && strokeChars.length <= 2 ? (
          <div className="flex gap-3">
            {strokeChars.map((ch, i) => (
              <StrokeOrder key={`${ch}-${i}`} glyph={ch} size={strokeChars.length > 1 ? 130 : 180} autoPlay />
            ))}
          </div>
        ) : (
          <span className={`jp leading-none ${[...card.glyph].length > 2 ? 'text-7xl' : 'text-[8rem]'}`}>
            {card.glyph}
          </span>
        )}

        <div className="max-w-sm text-center sm:text-left">
          {strokeChars.length > 0 && strokeChars.length <= 2 && showStrokes && (
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
              {/* En kana la lectura es rōmaji y va en monoespaciada; en
                  vocabulario es kana y necesita la fuente japonesa. */}
              <p
                className={
                  card.deckKind === 'vocabulary' ? 'jp text-2xl' : 'font-mono text-2xl'
                }
              >
                {card.reading}
              </p>
              <Speaker text={card.glyph} size="md" />
            </div>
          )}

          {!kanji && card.meaning && (
            <>
              <p className="mt-2 text-lg">
                {card.meaning}
                {vocab?.pos && (
                  <span className="ml-2 text-sm text-muted">{vocab.pos}</span>
                )}
              </p>
              {vocab?.others && vocab.others.length > 0 && (
                <p className="mt-1 text-sm text-muted">también: {vocab.others.join(', ')}</p>
              )}
            </>
          )}

        </div>
      </div>
      )}

      {/* Escribirlo una vez al conocerlo fija mucho más que solo verlo. */}
      {strokeChars.length === 1 && (
        <button
          onClick={() => setWriting((w) => !w)}
          className="mt-5 rounded-lg bg-raised px-4 py-1.5 text-xs hover:bg-line"
        >
          {writing ? 'Ver la ficha' : 'Practicar la escritura'}
        </button>
      )}

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

      {sentence && <ExampleSentence sentence={sentence} />}

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

/** Una frase corta donde el carácter aparece en uso, no aislado. */
export function ExampleSentence({
  sentence,
}: {
  sentence: { japanese: string; spanish: string }
}) {
  return (
    <div className="mt-6 w-full max-w-lg rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex items-start gap-2">
        <p className="jp flex-1 text-lg leading-relaxed">{sentence.japanese}</p>
        <Speaker text={sentence.japanese} size="md" />
      </div>
      <p className="mt-2 text-sm text-muted">{sentence.spanish}</p>
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
