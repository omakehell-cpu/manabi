import { useEffect, useState } from 'react'

/** Cuándo mostrar el orden de trazos durante el estudio. */
export type StrokeMode = 'always' | 'onError' | 'never'

const KEY = 'stroke_mode'

export async function strokeVisibility(): Promise<StrokeMode> {
  const value = await window.manabi.getSetting(KEY)
  return value === 'onError' || value === 'never' ? value : 'always'
}

export async function setStrokeVisibility(mode: StrokeMode): Promise<void> {
  await window.manabi.setSetting(KEY, mode)
}

/**
 * Cómo se muestra la lectura de los kanji: siempre encima, o solo al
 * pulsarlos.
 *
 * Verla siempre enseña; taparla examina. Con la furigana delante se lee la
 * lectura y no el kanji, que es justo lo que no hay que practicar una vez
 * presentado el carácter.
 */
export type FuriganaMode = 'always' | 'tap'

const FURIGANA_KEY = 'furigana_mode'

/**
 * El modo vive en memoria además de en la base: la furigana aparece en
 * listas de palabras y en cada frase, y no puede cada una pedir su ajuste
 * por IPC. Se carga una vez y se avisa a quien esté pintando.
 */
let mode: FuriganaMode = 'always'
let loaded = false
const modeListeners = new Set<() => void>()

export function furiganaMode(): FuriganaMode {
  // El puente con el proceso principal puede no estar todavía —al arrancar,
  // y en desarrollo cada vez que se recarga el main—. Si falta, no se marca
  // como leído y se reintenta en el siguiente pintado, en lugar de quedarse
  // para siempre con el valor por defecto.
  if (!loaded && window.manabi) {
    loaded = true
    void window.manabi.getSetting(FURIGANA_KEY).then((v) => {
      mode = v === 'tap' ? 'tap' : 'always'
      for (const fn of modeListeners) fn()
    })
  }
  return mode
}

export async function setFuriganaMode(next: FuriganaMode): Promise<void> {
  mode = next
  loaded = true
  for (const fn of modeListeners) fn()
  await window.manabi.setSetting(FURIGANA_KEY, next)
}

export function onFuriganaModeChange(fn: () => void): () => void {
  modeListeners.add(fn)
  return () => modeListeners.delete(fn)
}

/** Re-renderiza cuando el ajuste llega o cambia. */
export function useFuriganaMode(): FuriganaMode {
  const [value, setValue] = useState(furiganaMode)

  useEffect(() => {
    // Releer al suscribirse no es redundante: el primer render lanza la
    // consulta, que se resuelve en un microtask —antes de que React llegue
    // a ejecutar este efecto—. Sin esta línea el aviso llega cuando todavía
    // no hay nadie escuchando y la primera palabra se pinta con el ajuste
    // por defecto para siempre.
    setValue(furiganaMode())
    return onFuriganaModeChange(() => setValue(furiganaMode()))
  }, [])

  return value
}
