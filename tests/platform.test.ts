import { describe, expect, it } from 'vitest'
import { titlebarInset } from '../src/lib/platform'

describe('hueco de la barra de título', () => {
  it('reserva sitio a los semáforos solo en macOS', () => {
    // Ahí la barra está oculta y los botones flotan sobre el contenido.
    expect(titlebarInset('darwin')).toBe('pl-20')
  })

  it('no deja hueco donde la barra de título es nativa', () => {
    // En Windows y Linux el hueco solo dejaba un vacío a la izquierda.
    expect(titlebarInset('win32')).toBe('')
    expect(titlebarInset('linux')).toBe('')
  })
})
