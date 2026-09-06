import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFuriganaMode } from '../lib/prefs'
import { isKanjiChar } from '../lib/furigana'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'

interface Readings {
  on: string[]
  kun: string[]
  meanings: string[]
}

/** Las lecturas ya pedidas, para no repetir la consulta al volver a pulsar. */
const cache = new Map<string, Readings | null>()

interface Props {
  text: string
  className?: string
}

/**
 * Texto japonés con los kanji pulsables, cuando el ajuste lo pide.
 *
 * En una frase no se puede saber qué lectura toca: 日 es ニチ en 日本 y ひ
 * en ひどい日, y aquí no hay ni reparto ni análisis gramatical que lo
 * decida. Así que lo que se muestra es lo que hay: las lecturas del
 * carácter, como en un diccionario, sin fingir que sabemos cuál suena.
 *
 * En las palabras de ejemplo sí se sabe, y allí lo hace `Furigana`.
 */
export default function JapaneseText({ text, className }: Props) {
  const mode = useFuriganaMode()
  const [open, setOpen] = useState<number | null>(null)
  const [readings, setReadings] = useState<Readings | null>(null)
  /** Cuánto hay que correr la ficha para que no se salga por un lado. */
  const [shift, setShift] = useState(0)
  const card = useRef<HTMLSpanElement>(null)

  useEffect(() => setOpen(null), [text, mode])

  // Se cierra al pulsar fuera o con Escape. Los botones del propio texto
  // paran la propagación, así que abrir uno no lo cierra acto seguido.
  useEffect(() => {
    if (open === null) return
    const close = () => setOpen(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // La ficha va centrada sobre un carácter que puede estar pegado al borde,
  // y es mucho más ancha que él. Se mide una vez colocada y se corre lo
  // justo para que quepa; medir antes de pintar evitaría el parpadeo pero
  // aún no existe el elemento.
  useLayoutEffect(() => {
    if (open === null) {
      setShift(0)
      return
    }
    const box = card.current?.getBoundingClientRect()
    if (!box) return
    const margin = 12
    if (box.left < margin) setShift(margin - box.left)
    else if (box.right > window.innerWidth - margin)
      setShift(window.innerWidth - margin - box.right)
  }, [open, readings])

  if (mode !== 'tap') return <span className={className}>{text}</span>

  const show = (index: number, glyph: string) => {
    if (open === index) {
      setOpen(null)
      return
    }
    setOpen(index)
    const hit = cache.get(glyph)
    if (hit !== undefined) {
      setReadings(hit)
      return
    }
    setReadings(null)
    void window.manabi.kanjiReadings(glyph).then((r) => {
      cache.set(glyph, r)
      setReadings(r)
    })
  }

  return (
    <span className={className}>
      {[...text].map((c, i) =>
        !isKanjiChar(c) ? (
          <span key={i}>{c}</span>
        ) : (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              show(i, c)
            }}
            title={`Ver las lecturas de ${c}`}
            className={`relative rounded transition-colors ${
              open === i ? 'bg-warn/25' : 'bg-warn/10 hover:bg-warn/20'
            }`}
          >
            {c}
            {open === i && (
              <span
                ref={card}
                // Encima del carácter y centrada: debajo tapaba la línea
                // siguiente de la frase, que es lo que se está leyendo.
                style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
                className="absolute bottom-full left-1/2 z-10 mb-1 rounded-lg border border-line bg-raised px-3 py-2 text-left whitespace-nowrap shadow-lg"
              >
                {readings ? <ReadingCard glyph={c} readings={readings} /> : (
                  <span className="text-xs text-muted">…</span>
                )}
              </span>
            )}
          </button>
        ),
      )}
    </span>
  )
}

function ReadingCard({ glyph, readings }: { glyph: string; readings: Readings }) {
  return (
    <span className="flex flex-col gap-0.5">
      {readings.on.length > 0 && <Row label="ON" list={readings.on} />}
      {readings.kun.length > 0 && <Row label="KUN" list={readings.kun} />}
      {readings.meanings.length > 0 && (
        <span className="mt-1 text-xs text-muted">
          {readings.meanings.slice(0, 3).join(', ')}
        </span>
      )}
      {readings.on.length === 0 && readings.kun.length === 0 && (
        <span className="text-xs text-muted">{glyph} no está en el temario</span>
      )}
    </span>
  )
}

function Row({ label, list }: { label: string; list: string[] }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[0.6rem] tracking-wide text-muted">{label}</span>
      <span className="jp text-sm">{list.slice(0, 4).join('・')}</span>
      <Speaker text={cleanReading(list[0])} label={list[0]} />
    </span>
  )
}
