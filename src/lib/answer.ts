import { toHiragana, toKana, toKatakana } from 'wanakana'
import { cleanReading } from './speech'

/**
 * Normalización para comparar respuestas escritas.
 *
 * Se quitan diacríticos (para que «montaña» acepte «montana»), se pasa a
 * minúsculas y se colapsan espacios. Los apóstrofes y guiones desaparecen
 * porque en rōmaji son ruido: n'/nn/n son la misma respuesta.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`´\-_.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Artículos iniciales que no deberían invalidar una traducción. */
const LEADING_ARTICLES = /^(el|la|los|las|un|una|unos|unas)\s+/

function meaningForms(text: string): string[] {
  const n = normalize(text)
  return [n, n.replace(LEADING_ARTICLES, '')]
}

export type CheckMode = 'romaji' | 'kana' | 'meaning' | 'reading'

export interface CheckResult {
  correct: boolean
  /** Lo que se comparó realmente; en modo kana, el texto ya convertido. */
  submitted: string
}

export function checkAnswer(
  raw: string,
  expected: string,
  alternatives: string[],
  mode: CheckMode,
): CheckResult {
  if (mode === 'reading') {
    // Lectura de un kanji: vale cualquiera de sus on'yomi o kun'yomi. Se
    // compara todo en hiragana porque el on'yomi se escribe en katakana
    // (ニチ) y wanakana produce hiragana desde el rōmaji (にち).
    const submitted = toHiragana(toKana(raw.trim()))
    const accepted = alternatives.map((r) => toHiragana(cleanReading(r)))
    return { correct: accepted.includes(submitted), submitted }
  }

  if (mode === 'kana') {
    // El usuario teclea rōmaji y wanakana lo convierte; se compara kana con kana.
    const submitted = toTargetKana(raw, expected)
    if (submitted === expected) return { correct: true, submitted }
    // Red de seguridad para lo que wanakana romaniza distinto: «nn» produce
    // んん en vez de ん, y ti/tu/di/du siguen la escuela kunrei. Si el rōmaji
    // tecleado está entre los aceptados, la respuesta vale.
    const asRomaji = normalize(raw)
    const accepted = alternatives.map(normalize)
    return { correct: accepted.includes(asRomaji), submitted }
  }

  const submitted = normalize(raw)
  if (!submitted) return { correct: false, submitted }

  const accepted =
    mode === 'meaning'
      ? [expected, ...alternatives].flatMap(meaningForms)
      : [expected, ...alternatives].map(normalize)

  const candidate = mode === 'meaning' ? meaningForms(raw) : [submitted]
  return { correct: candidate.some((c) => accepted.includes(c)), submitted }
}

/**
 * Convierte a katakana cuando el objetivo lo es: wanakana produce hiragana
 * por defecto, y コ nunca coincidiría con こ.
 */
export function toTargetKana(raw: string, target: string): string {
  const trimmed = raw.trim()
  return /[ァ-ヶ]/.test(target) ? toKatakana(trimmed) : toKana(trimmed)
}

/**
 * Pista para el segundo intento: la primera letra y la longitud del resto.
 *
 * Es deliberadamente parca. En el temario hay 1246 pares de significados
 * separados por una sola letra —東 «este» y 西 «oeste», entre ellos—, así que
 * una pista generosa resolvería la carta en lugar de ayudar a recordarla.
 * Devuelve cadena vacía para respuestas de un solo carácter: ahí cualquier
 * máscara la destaparía entera.
 */
export function maskAnswer(answer: string): string {
  const chars = [...answer.trim()]
  if (chars.length <= 1) return ''
  return chars[0] + ' ' + chars.slice(1).map((c) => (c === ' ' ? ' ' : '·')).join(' ')
}
