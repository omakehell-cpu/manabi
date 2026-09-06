import { useEffect, useState } from 'react'
import type { FuriganaPart } from '../types'
import { useFuriganaMode } from '../lib/prefs'

interface Props {
  word: string
  reading: string
  /** El reparto de la lectura; si es null se muestra la lectura entera. */
  parts: FuriganaPart[] | null
  /** El kanji que se está estudiando: su lectura se resalta. */
  focus?: string
  size?: 'sm' | 'md'
}

/**
 * La palabra con la lectura encima de cada kanji, no detrás de la palabra.
 *
 * Ver `中国人 ちゅうごくじん` obliga a adivinar dónde acaba cada pieza; con
 * la lectura colocada sobre su carácter, y la del kanji que se estudia en
 * color, la palabra deja de ser un bloque y pasa a enseñar una lectura.
 *
 * Cuando la palabra no admite reparto —大人 es おとな y ni お ni とな
 * pertenecen a ningún carácter— se cae a la lectura de siempre, al lado.
 *
 * Con el modo «al pulsar» la lectura empieza tapada y cada kanji se
 * resalta como lo que pasa a ser: un botón. Teniendo la furigana delante
 * se lee la furigana, así que taparla es la diferencia entre reconocer el
 * carácter y creer que se reconoce.
 */
export default function Furigana({ word, reading, parts, focus, size = 'md' }: Props) {
  const mode = useFuriganaMode()
  const [shown, setShown] = useState<Set<number>>(new Set())

  // Cada palabra empieza tapada de nuevo: lo revelado vale para esa palabra
  // y no para la siguiente.
  useEffect(() => setShown(new Set()), [word, mode])

  const big = size === 'md' ? 'text-lg' : 'text-base'
  const small = size === 'md' ? 'text-[0.6rem]' : 'text-[0.55rem]'
  const tap = mode === 'tap'

  if (!parts) {
    // Sin reparto no hay nada que pulsar carácter a carácter: se tapa la
    // lectura entera y se descubre de una vez.
    const hidden = tap && !shown.size
    return (
      <span className="flex items-baseline gap-2">
        <span className={`jp ${big}`}>{word}</span>
        {hidden ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShown(new Set([0]))
            }}
            className="rounded border-b border-dashed border-warn/50 bg-warn/10 px-1.5 text-xs text-muted hover:bg-warn/20"
          >
            lectura
          </button>
        ) : (
          <span className={`jp text-muted ${size === 'md' ? 'text-sm' : 'text-xs'}`}>
            {reading}
          </span>
        )}
      </span>
    )
  }

  return (
    // `leading-none` en el ruby y un hueco arriba: sin eso la línea de la
    // furigana empuja el renglón y las listas quedan desalineadas. El hueco
    // se reserva también con la lectura tapada, para que descubrirla no
    // mueva nada de sitio.
    <span className={`jp inline-flex items-end pt-3 ${big} leading-none`}>
      {parts.map((p, i) => {
        const isKanji = p.reading !== null
        const visible = !tap || !isKanji || shown.has(i)
        const rt = visible ? (p.reading ?? '') : ''
        const content = (
          <ruby className="leading-none">
            {p.text}
            <rt
              className={`${small} leading-none ${p.text === focus ? 'text-warn' : 'text-muted'}`}
            >
              {rt}
            </rt>
          </ruby>
        )

        if (!tap || !isKanji) return <span key={`${p.text}-${i}`}>{content}</span>
        return (
          <button
            key={`${p.text}-${i}`}
            onClick={(e) => {
              e.stopPropagation()
              setShown((s) => new Set(s).add(i))
            }}
            title={`Ver la lectura de ${p.text}`}
            className={`rounded transition-colors ${
              shown.has(i) ? '' : 'bg-warn/10 ring-1 ring-warn/25 hover:bg-warn/20'
            }`}
          >
            {content}
          </button>
        )
      })}
    </span>
  )
}
