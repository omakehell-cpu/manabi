/**
 * Descompone una palabra en las unidades kana que realmente se estudian.
 *
 * No basta con partir por carácter: しゃ es UN ítem del mazo, no し + ゃ.
 * El algoritmo es voraz — intenta primero pares (yōon y extendidos) y cae
 * a un solo carácter si no hay coincidencia.
 *
 * Se descartan los signos que no son unidades de estudio:
 *   ー  chōonpu (alarga la vocal previa)
 *   っッ sokuon (geminación)
 */

const SKIP = new Set(['ー', 'っ', 'ッ', '・', '　', ' '])

export function tokenizeKana(word: string, vocabulary: Set<string>): string[] {
  const chars = [...word]
  const out: string[] = []
  let i = 0

  while (i < chars.length) {
    const ch = chars[i]
    if (SKIP.has(ch)) {
      i += 1
      continue
    }
    const pair = ch + (chars[i + 1] ?? '')
    if (chars[i + 1] && vocabulary.has(pair)) {
      out.push(pair)
      i += 2
    } else {
      out.push(ch)
      i += 1
    }
  }
  return out
}
