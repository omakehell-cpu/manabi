/**
 * Ajustes que dependen del sistema.
 *
 * En macOS la ventana usa `titleBarStyle: hiddenInset`, así que los botones
 * de cerrar, minimizar y ampliar flotan sobre el contenido y hay que
 * reservarles sitio. En Windows y Linux la barra de título es nativa y ese
 * hueco solo deja un vacío raro a la izquierda de la cabecera.
 */

/** Hueco a la izquierda de la cabecera, solo donde de verdad hace falta. */
export function titlebarInset(platform: string): string {
  return platform === 'darwin' ? 'pl-20' : ''
}

/** La plataforma llega por el preload; fuera del renderer no hay ventana. */
function currentPlatform(): string {
  if (typeof window === 'undefined') return ''
  return window.manabi?.platform ?? ''
}

export const IS_MAC = currentPlatform() === 'darwin'
export const TITLEBAR_INSET = titlebarInset(currentPlatform())
