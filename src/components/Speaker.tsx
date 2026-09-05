import { useEffect, useState } from 'react'
import { hasJapaneseVoice, onVoicesChanged, speak } from '../lib/speech'

/** Re-renderiza cuando el sistema termina de cargar las voces. */
export function useVoicesReady(): boolean {
  const [ready, setReady] = useState(hasJapaneseVoice)
  useEffect(() => onVoicesChanged(() => setReady(hasJapaneseVoice())), [])
  return ready
}

interface Props {
  text: string
  label?: string
  size?: 'sm' | 'md'
}

/**
 * Botón de pronunciación. No se dibuja si no hay voz japonesa instalada:
 * reproducirlo con una voz española sonaría mal y enseñaría una
 * pronunciación equivocada.
 */
export default function Speaker({ text, label, size = 'sm' }: Props) {
  const ready = useVoicesReady()
  if (!ready) return null

  const px = size === 'sm' ? 14 : 18
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        speak(text)
      }}
      title={`Escuchar ${label ?? text}`}
      aria-label={`Escuchar ${label ?? text}`}
      className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
    >
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M11 5 6 9H3v6h3l5 4V5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
