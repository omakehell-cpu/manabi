import type { FuriganaPart } from '../types'

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
 */
export default function Furigana({ word, reading, parts, focus, size = 'md' }: Props) {
  const big = size === 'md' ? 'text-lg' : 'text-base'
  const small = size === 'md' ? 'text-[0.6rem]' : 'text-[0.55rem]'

  if (!parts) {
    return (
      <span className="flex items-baseline gap-2">
        <span className={`jp ${big}`}>{word}</span>
        <span className={`jp text-muted ${size === 'md' ? 'text-sm' : 'text-xs'}`}>{reading}</span>
      </span>
    )
  }

  return (
    // `leading-none` en el ruby y un hueco arriba: sin eso la línea de la
    // furigana empuja el renglón y las listas quedan desalineadas.
    <span className={`jp inline-flex items-end pt-3 ${big} leading-none`}>
      {parts.map((p, i) => (
        <ruby key={`${p.text}-${i}`} className="leading-none">
          {p.text}
          <rt
            className={`${small} leading-none ${
              p.text === focus ? 'text-warn' : 'text-muted'
            }`}
          >
            {p.reading ?? ''}
          </rt>
        </ruby>
      ))}
    </span>
  )
}
