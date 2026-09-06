import { describe, expect, it } from 'vitest'
import { isRecommended, spokenForm, voiceLabel, voiceScore } from '../src/lib/speech'

/** Una voz del sistema, con lo poco que la Web Speech API expone. */
function voice(name: string, isDefault = false): SpeechSynthesisVoice {
  return { name, lang: 'ja-JP', default: isDefault, localService: true, voiceURI: name }
}

/** Lo que Chromium devuelve en un macOS reciente, en orden alfabético. */
const MACOS = [
  'Eddy (japonés (Japón))',
  'Flo (japonés (Japón))',
  'Grandma (japonés (Japón))',
  'Grandpa (japonés (Japón))',
  'Kyoko',
  'Reed (japonés (Japón))',
  'Rocko (japonés (Japón))',
  'Sandy (japonés (Japón))',
  'Shelley (japonés (Japón))',
].map((n) => voice(n))

describe('elección de voz', () => {
  it('prefiere la voz japonesa de verdad a la primera de la lista', () => {
    // El fallo que esto guarda: coger voices[0] daba Eddy, una voz de broma.
    const best = [...MACOS].sort((a, b) => voiceScore(b) - voiceScore(a))[0]
    expect(best.name).toBe('Kyoko')
  })

  it('prefiere la versión de mejor calidad de la misma voz', () => {
    expect(voiceScore(voice('Kyoko (Premium)'))).toBeGreaterThan(voiceScore(voice('Kyoko')))
    expect(voiceScore(voice('Microsoft Nanami Natural'))).toBeGreaterThan(
      voiceScore(voice('Microsoft Haruka')),
    )
  })

  it('separa las voces de broma de las japonesas', () => {
    expect(MACOS.filter(isRecommended).map((v) => v.name)).toEqual(['Kyoko'])
  })

  it('quita la coletilla del idioma del nombre', () => {
    expect(voiceLabel(voice('Eddy (japonés (Japón))'))).toBe('Eddy')
    expect(voiceLabel(voice('Kyoko'))).toBe('Kyoko')
    expect(voiceLabel(voice('Microsoft Nanami'))).toBe('Microsoft Nanami')
  })
})

describe('qué se reproduce', () => {
  it('impone la lectura enseñada cuando es kana', () => {
    // Con 一日 el motor elige entre いちにち y ついたち por su cuenta.
    expect(spokenForm('一日', 'いちにち')).toBe('いちにち')
  })

  it('no confunde el rōmaji de los mazos de kana con una lectura', () => {
    expect(spokenForm('か', 'ka')).toBe('か')
  })

  it('sin lectura, lee lo escrito', () => {
    expect(spokenForm('中', null)).toBe('中')
    expect(spokenForm('中')).toBe('中')
  })
})
