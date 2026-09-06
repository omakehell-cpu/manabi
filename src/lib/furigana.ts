/**
 * Reparte la lectura de una palabra entre sus caracteres.
 *
 * Ver 中国人 = ちゅうごくじん no enseña que 中 sea ちゅう: la lectura llega
 * como un bloque y hay que adivinar dónde acaba cada pieza. Los libros de
 * kanji lo escriben separado —ちゅう・がく— y ahí es donde se aprende una
 * lectura, dentro de una palabra de verdad y no en una lista.
 *
 * El reparto no es un problema resuelto: 大人 se lee おとな sin que ni お ni
 * とな pertenezcan a ningún carácter (jukujikun). Cuando no cuadra se
 * devuelve null y la palabra se muestra entera, que es la verdad.
 */

/** Una pieza de la palabra: un kanji con su lectura, o kana suelto. */
export interface Part {
  /** El carácter tal como se escribe. */
  text: string
  /** Lo que suena; null en kana, que ya se lee solo. */
  reading: string | null
  /**
   * La entrada del diccionario de la que sale la lectura, tal como aparece
   * en la ficha (`チュウ`, `さ.げる`). Sirve para señalar cuál de las
   * lecturas listadas es la que se está usando.
   */
  source: string | null
  /** La lectura cambia respecto a la del diccionario: rendaku o geminación. */
  altered: boolean
}

export interface Readings {
  on: string[]
  kun: string[]
}

/** Consonante sorda → sonora. El rendaku sonoriza la primera mora. */
const VOICED: Record<string, string[]> = {
  か: ['が'], き: ['ぎ'], く: ['ぐ'], け: ['げ'], こ: ['ご'],
  さ: ['ざ'], し: ['じ'], す: ['ず'], せ: ['ぜ'], そ: ['ぞ'],
  // ち y つ se sonorizan hoy como じ/ず, aunque la grafía histórica sea ぢ/づ.
  た: ['だ'], ち: ['じ', 'ぢ'], つ: ['ず', 'づ'], て: ['で'], と: ['ど'],
  は: ['ば', 'ぱ'], ひ: ['び', 'ぴ'], ふ: ['ぶ', 'ぷ'], へ: ['べ', 'ぺ'], ほ: ['ぼ', 'ぽ'],
}

export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/**
 * La lectura tal como se pronuncia el kanji solo: sin la okurigana que
 * KANJIDIC separa con punto (`さ.げる` → `さ`) ni los guiones que marcan
 * prefijos y sufijos (`-び` → `び`).
 */
export function baseReading(entry: string): string {
  return kataToHira(entry.split('.')[0].replace(/^-/, '').replace(/-$/, ''))
}

/** Un carácter japonés que ya suena por sí mismo. */
function isKana(c: string): boolean {
  return /[぀-ヿㇰ-ㇿ]/.test(c)
}

interface Candidate {
  reading: string
  source: string
  altered: boolean
}

/**
 * Las formas en que puede aparecer una lectura dentro de una palabra.
 *
 * Un kanji casi nunca suena igual solo que compuesto: 学 es がく pero
 * 中学校 es ちゅうがっこう, y 中 es ちゅう pero 一日中 es いちにちじゅう.
 * Sin estas dos reglas el reparto falla en una de cada cinco palabras.
 */
function candidatesFor(entry: string): Candidate[] {
  const base = baseReading(entry)
  if (!base) return []
  const out: Candidate[] = [{ reading: base, source: entry, altered: false }]

  // Rendaku: la primera mora se sonoriza al ir detrás de otra palabra.
  for (const voiced of VOICED[base[0]] ?? []) {
    out.push({ reading: voiced + base.slice(1), source: entry, altered: true })
  }
  // Geminación: la última mora se cierra en っ ante consonante sorda.
  if (/[きくちつ]$/.test(base)) {
    const geminated = base.slice(0, -1) + 'っ'
    out.push({ reading: geminated, source: entry, altered: true })
    for (const voiced of VOICED[base[0]] ?? []) {
      out.push({ reading: voiced + geminated.slice(1), source: entry, altered: true })
    }
  }
  return out
}

/** Todas las candidatas de un kanji, las largas primero para no cortar de menos. */
function allCandidates(r: Readings): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const entry of [...r.on, ...r.kun]) {
    for (const c of candidatesFor(entry)) {
      if (seen.has(c.reading)) continue
      seen.add(c.reading)
      out.push(c)
    }
  }
  return out.sort((a, b) => b.reading.length - a.reading.length)
}

/**
 * Reparte `reading` entre los caracteres de `word`, o null si no cuadra.
 *
 * Se resuelve por vuelta atrás y no de izquierda a derecha porque la
 * primera lectura que encaja no siempre es la buena: en 中学校, 学 admite
 * がく y がっ, y solo al llegar a 校 se sabe cuál de las dos deja sitio.
 */
export function segment(
  word: string,
  reading: string,
  readingsOf: (kanji: string) => Readings | undefined,
): Part[] | null {
  const target = kataToHira(reading)

  const walk = (i: number, j: number): Part[] | null => {
    if (i === word.length) return j === target.length ? [] : null

    const char = word[i]
    if (isKana(char)) {
      // El kana se lee solo, pero hay que consumirlo de la lectura: si no
      // coincide es que el reparto anterior era el equivocado.
      if (kataToHira(char) !== target[j]) return null
      const rest = walk(i + 1, j + 1)
      return rest && [{ text: char, reading: null, source: null, altered: false }, ...rest]
    }

    const readings = readingsOf(char)
    if (!readings) return null
    for (const c of allCandidates(readings)) {
      if (!target.startsWith(c.reading, j)) continue
      const rest = walk(i + 1, j + c.reading.length)
      if (rest) {
        // Se devuelve el trozo de la lectura original, no la candidata en
        // hiragana: en シャンハイ lo escrito es katakana y así se conserva.
        const text = reading.slice(j, j + c.reading.length)
        return [{ text: char, reading: text, source: c.source, altered: c.altered }, ...rest]
      }
    }
    return null
  }

  return walk(0, 0)
}

/**
 * La lectura que suena en la palabra, ¿es esta de la ficha?
 *
 * Compara por la entrada del diccionario y no por el sonido, porque en
 * 中学校 lo que suena es がっ y lo que hay que reconocer en la lista es
 * ガク: son la misma lectura, alterada por la palabra.
 */
export function usesReading(entry: string, part: Part): boolean {
  return part.source === entry
}
