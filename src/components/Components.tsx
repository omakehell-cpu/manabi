import { useEffect, useState } from 'react'
import type { KanjiComponent } from '../types'

/**
 * En qué partes se descompone un kanji.
 *
 * Los kanji se estudian por frecuencia, así que aparecen caracteres
 * complejos sin haber visto sus piezas. Ver que 明 es 日 más 月 convierte un
 * dibujo arbitrario en algo con lógica, y marcar las que ya se dominan
 * enseña que un carácter difícil suele ser una combinación de conocidos.
 */
export default function Components({ glyph }: { glyph: string }) {
  const [parts, setParts] = useState<KanjiComponent[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.manabi.componentsOf(glyph).then((p) => {
      if (alive) setParts(p)
    })
    return () => {
      alive = false
    }
  }, [glyph])

  if (!parts?.length) return null

  return (
    <>
      <h3 className="mt-7 text-xs tracking-wide text-muted uppercase">Se compone de</h3>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p, i) => (
          <li
            key={`${p.glyph}-${i}`}
            className="flex items-baseline gap-3 rounded-lg bg-surface px-4 py-2 text-sm"
          >
            <span className={`jp text-2xl ${p.known ? 'text-ok' : ''}`}>{p.glyph}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {p.meaning || <span className="text-muted">sin significado propio</span>}
                {p.isRadical && (
                  <span className="ml-2 rounded bg-raised px-1.5 py-0.5 text-xs text-muted">
                    radical
                  </span>
                )}
              </p>
              {(p.name || p.position) && (
                <p className="mt-0.5 text-xs text-muted">
                  {[p.name, p.position].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {p.known && <span className="shrink-0 text-xs text-ok">ya lo sabes</span>}
          </li>
        ))}
      </ul>
    </>
  )
}
