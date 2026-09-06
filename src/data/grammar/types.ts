/**
 * Temario de gramática, escrito a mano.
 *
 * No existe un conjunto de datos abierto de puntos gramaticales del JLPT con
 * licencia clara —solo listas en webs de estudio, sin permiso de reutilización—
 * así que este temario es original de la aplicación.
 *
 * Cada punto trae un ejemplo con la parte que se practica entre llaves. De ahí
 * salen las dos cartas: una pregunta qué significa el patrón, y la otra lo
 * borra de la frase para que haya que reponerlo. La segunda es la que enseña
 * a usarlo; la primera, a reconocerlo.
 */

export interface GrammarExample {
  /** Frase en japonés, con la parte practicada entre llaves: 私{は}学生です。 */
  jp: string
  /** Su traducción. */
  es: string
}

export interface GrammarPoint {
  /** Identificador estable; se usa como clave de las cartas. */
  id: string
  /** El patrón tal y como se enuncia: は, 〜てから, 〜なければならない. */
  pattern: string
  /** Cómo se lee, para el audio y para quien aún no domina los kanji. */
  reading: string
  /** Qué significa, en pocas palabras: es la respuesta de la primera carta. */
  meaning: string
  /** Otras formas de decir lo mismo que también se dan por buenas. */
  alt?: string[]
  /** Cómo se construye. */
  form: string
  /** Cuándo se usa y con qué se confunde. */
  note: string
  examples: GrammarExample[]
}

export interface GrammarLevel {
  level: 1 | 2 | 3 | 4 | 5
  points: GrammarPoint[]
}

/** Quita las llaves para mostrar la frase entera. */
export function plain(sentence: string): string {
  return sentence.replace(/[{}]/g, '')
}

/** Sustituye la parte practicada por un hueco. */
export function blanked(sentence: string, placeholder = '＿'): string {
  return sentence.replace(/\{[^}]*\}/g, placeholder)
}

/** La parte que va entre llaves: lo que hay que reponer. */
export function answerOf(sentence: string): string {
  return /\{([^}]*)\}/.exec(sentence)?.[1] ?? ''
}
