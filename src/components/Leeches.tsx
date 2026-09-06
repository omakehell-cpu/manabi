import { useCallback, useEffect, useState } from 'react'
import type { CardType, LeechCard } from '../types'

const CARD_LABEL: Record<CardType, string> = {
  recognition: 'reconocer',
  recall: 'escribir',
  reading: 'lectura',
  meaning: 'significado',
  word: 'palabra',
  conjugation: 'conjugación',
  grammar: 'patrón',
  cloze: 'completar',
}

/**
 * Cartas apartadas por acumular fallos.
 *
 * La suspensión automática existe para que una carta imposible no envenene
 * las sesiones, pero sin esta lista desaparecían en silencio: el usuario
 * nunca sabía que había dejado de ver algo.
 */
export default function Leeches() {
  const [items, setItems] = useState<LeechCard[] | null>(null)

  const load = useCallback(() => {
    void window.manabi.leeches().then(setItems)
  }, [])

  useEffect(load, [load])

  if (!items) return null

  return (
    <>
      <h2 className="mt-12 text-sm tracking-wide text-muted uppercase">Cartas apartadas</h2>

      {items.length === 0 ? (
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Ninguna. Cuando una carta se falla ocho veces se aparta sola para que no
          entorpezca las sesiones, y aparecerá aquí para que decidas qué hacer con ella.
        </p>
      ) : (
        <>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Se apartaron solas tras fallarlas ocho veces. Al devolverlas se les da margen
            nuevo, así que no volverán a apartarse al primer tropiezo. Si una se te
            resiste, suele ser más útil buscarle una palabra o un contexto que insistir.
          </p>

          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {items.map((c) => (
              <li key={c.cardId} className="flex items-center gap-4 bg-surface px-4 py-3">
                <span className="jp shrink-0 text-3xl">{c.glyph}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {c.meaning ?? c.reading}
                    <span className="ml-2 text-xs text-muted">
                      {c.deckName} · {CARD_LABEL[c.cardType]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.failures} fallos en {c.reps} repasos ({c.failureRate} %)
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await window.manabi.reviveLeech(c.cardId)
                    load()
                  }}
                  className="shrink-0 rounded-lg bg-raised px-3 py-1.5 text-sm hover:bg-line"
                >
                  Devolver
                </button>
              </li>
            ))}
          </ul>

          {items.length > 1 && (
            <button
              onClick={async () => {
                await window.manabi.reviveAllLeeches()
                load()
              }}
              className="mt-3 text-sm text-muted underline underline-offset-4 hover:text-fg"
            >
              Devolver las {items.length}
            </button>
          )}
        </>
      )}
    </>
  )
}
