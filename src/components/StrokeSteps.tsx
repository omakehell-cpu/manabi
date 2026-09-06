import { useEffect, useState } from 'react'

interface Props {
  glyph: string
  /** Lado de cada casilla. */
  size?: number
}

/**
 * El carácter construyéndose trazo a trazo, todos los pasos a la vez.
 *
 * La animación enseña el orden pero es fugaz: para comparar el paso tres
 * con el cuatro hay que volver a lanzarla. Los libros de kanji ponen la
 * columna de estados uno al lado de otro precisamente porque lo que se
 * memoriza es la secuencia entera, no cada fotograma. El trazo que entra
 * en cada casilla va en color, que es lo único que la fila añade al papel.
 */
export default function StrokeSteps({ glyph, size = 46 }: Props) {
  const [paths, setPaths] = useState<string[] | null>(null)

  useEffect(() => {
    let alive = true
    setPaths(null)
    void window.manabi.kanjiStrokes(glyph).then((p) => alive && setPaths(p))
    return () => {
      alive = false
    }
  }, [glyph])

  if (!paths?.length) return null

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {paths.map((_, step) => (
        <svg
          key={step}
          viewBox="0 0 109 109"
          width={size}
          height={size}
          className="shrink-0 rounded-md border border-line bg-surface"
          role="img"
          aria-label={`${glyph}, ${step + 1} de ${paths.length} trazos`}
        >
          <path
            d="M54.5,0 v109 M0,54.5 h109"
            stroke="currentColor"
            className="text-line"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
          {paths.slice(0, step + 1).map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={i === step ? 'text-accent' : 'text-fg'}
            />
          ))}
        </svg>
      ))}
    </div>
  )
}
