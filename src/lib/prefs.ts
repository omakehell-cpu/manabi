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
