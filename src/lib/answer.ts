import { toKana, toKatakana } from 'wanakana'

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

export type CheckMode = 'romaji' | 'kana' | 'meaning'

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
