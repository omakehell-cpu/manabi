/**
 * Conjugación de verbos y adjetivos japoneses.
 *
 * Las reglas son deterministas: dada la clase de la palabra (que JMdict
 * indica con etiquetas como v5k o adj-i) y su forma de diccionario, todas
 * las demás formas se derivan sin ambigüedad. Por eso no se almacenan las
 * conjugaciones: se calculan, y así 2567 verbos no se convierten en un
 * fichero de datos que mantener.
 */

export type WordClass =
  | 'v1' // ichidan: 食べる → 食べます
  | 'v5' // godan: la consonante final decide todo
  | 'vk' // 来る, irregular
  | 'vs' // する y sus compuestos
  | 'adj-i'
  | 'adj-na'

export type FormId =
  | 'masu'
  | 'te'
  | 'ta'
  | 'nai'
  | 'nakatta'
  | 'potential'
  | 'volitional'

export interface FormInfo {
  id: FormId
  /** Nombre en español, como se le pregunta al que estudia. */
  label: string
  /** Para qué sirve, en una línea. */
  hint: string
}

export const FORMS: FormInfo[] = [
  { id: 'masu', label: 'forma ます', hint: 'cortés, presente o futuro' },
  { id: 'te', label: 'forma て', hint: 'enlaza acciones y forma peticiones' },
  { id: 'ta', label: 'pasado llano', hint: 'forma た' },
  { id: 'nai', label: 'negativo llano', hint: 'forma ない' },
  { id: 'nakatta', label: 'negativo pasado', hint: 'forma なかった' },
  { id: 'potential', label: 'potencial', hint: '«poder hacer algo»' },
  { id: 'volitional', label: 'volitivo', hint: '«hagamos» o «voy a»' },
]

/** Traduce las etiquetas de JMdict a la clase que usan estas reglas. */
export function classOf(tags: string[]): WordClass | null {
  if (tags.includes('adj-i')) return 'adj-i'
  if (tags.includes('adj-na')) return 'adj-na'
  if (tags.some((t) => t === 'vk')) return 'vk'
  if (tags.some((t) => t === 'vs' || t === 'vs-i' || t === 'vs-s')) return 'vs'
  if (tags.some((t) => t === 'v1' || t === 'v1-s')) return 'v1'
  if (tags.some((t) => /^v5/.test(t))) return 'v5'
  return null
}

/** Verbos godan: la última sílaba manda en casi todas las formas. */
const GODAN_STEM: Record<string, { i: string; a: string; e: string; o: string }> = {
  う: { i: 'い', a: 'わ', e: 'え', o: 'お' }, // わ y no あ: 買う → 買わない
  く: { i: 'き', a: 'か', e: 'け', o: 'こ' },
  ぐ: { i: 'ぎ', a: 'が', e: 'げ', o: 'ご' },
  す: { i: 'し', a: 'さ', e: 'せ', o: 'そ' },
  つ: { i: 'ち', a: 'た', e: 'て', o: 'と' },
  ぬ: { i: 'に', a: 'な', e: 'ね', o: 'の' },
  ぶ: { i: 'び', a: 'ば', e: 'べ', o: 'ぼ' },
  む: { i: 'み', a: 'ま', e: 'め', o: 'も' },
  る: { i: 'り', a: 'ら', e: 'れ', o: 'ろ' },
}

/** Terminación de la forma て según la última sílaba. */
const GODAN_TE: Record<string, string> = {
  う: 'って',
  つ: 'って',
  る: 'って',
  む: 'んで',
  ぶ: 'んで',
  ぬ: 'んで',
  く: 'いて',
  ぐ: 'いで',
  す: 'して',
}

/** 行く es el único godan en く que hace って y no いて. */
const IKU = /行く$|いく$/

function godanTe(word: string, past: boolean): string | null {
  const stem = word.slice(0, -1)
  const last = word.at(-1)!
  if (IKU.test(word)) return stem + (past ? 'った' : 'って')
  const te = GODAN_TE[last]
  if (!te) return null
  return stem + (past ? te.replace('て', 'た').replace('で', 'だ') : te)
}

/**
 * Conjuga una palabra. Devuelve null si la clase o la terminación no
 * encajan, en lugar de inventarse una forma.
 */
export function conjugate(word: string, cls: WordClass, form: FormId): string | null {
  const stem = word.slice(0, -1)
  const last = word.at(-1)!

  if (cls === 'v1') {
    if (last !== 'る') return null
    switch (form) {
      case 'masu':
        return `${stem}ます`
      case 'te':
        return `${stem}て`
      case 'ta':
        return `${stem}た`
      case 'nai':
        return `${stem}ない`
      case 'nakatta':
        return `${stem}なかった`
      case 'potential':
        return `${stem}られる`
      case 'volitional':
        return `${stem}よう`
    }
  }

  if (cls === 'v5') {
    const row = GODAN_STEM[last]
    if (!row) return null
    switch (form) {
      case 'masu':
        return `${stem}${row.i}ます`
      case 'te':
        return godanTe(word, false)
      case 'ta':
        return godanTe(word, true)
      case 'nai':
        return `${stem}${row.a}ない`
      case 'nakatta':
        return `${stem}${row.a}なかった`
      case 'potential':
        return `${stem}${row.e}る`
      case 'volitional':
        return `${stem}${row.o}う`
    }
  }

  if (cls === 'vk') {
    // 来る se lee distinto en cada forma (く.る, き.ます, こ.ない), así que
    // solo se conjuga la grafía; la lectura va aparte en los datos.
    if (!word.endsWith('来る') && !word.endsWith('くる')) return null
    const prefix = word.slice(0, -2)
    const kanji = word.endsWith('来る')
    const k = (kana: string, kanjiForm: string) => prefix + (kanji ? kanjiForm : kana)
    switch (form) {
      case 'masu':
        return k('きます', '来ます')
      case 'te':
        return k('きて', '来て')
      case 'ta':
        return k('きた', '来た')
      case 'nai':
        return k('こない', '来ない')
      case 'nakatta':
        return k('こなかった', '来なかった')
      case 'potential':
        return k('こられる', '来られる')
      case 'volitional':
        return k('こよう', '来よう')
    }
  }

  if (cls === 'vs') {
    if (!word.endsWith('する')) return null
    const prefix = word.slice(0, -2)
    switch (form) {
      case 'masu':
        return `${prefix}します`
      case 'te':
        return `${prefix}して`
      case 'ta':
        return `${prefix}した`
      case 'nai':
        return `${prefix}しない`
      case 'nakatta':
        return `${prefix}しなかった`
      case 'potential':
        return `${prefix}できる`
      case 'volitional':
        return `${prefix}しよう`
    }
  }

  if (cls === 'adj-i') {
    if (last !== 'い') return null
    // いい es irregular: todas sus formas salen de よい.
    const base = word === 'いい' || word.endsWith('良い') ? `${word.slice(0, -2)}よ` : stem
    switch (form) {
      case 'masu':
        return `${word}です`
      case 'te':
        return `${base}くて`
      case 'ta':
        return `${base}かった`
      case 'nai':
        return `${base}くない`
      case 'nakatta':
        return `${base}くなかった`
      // Los adjetivos no tienen potencial ni volitivo.
      case 'potential':
      case 'volitional':
        return null
    }
  }

  if (cls === 'adj-na') {
    switch (form) {
      case 'masu':
        return `${word}です`
      case 'te':
        return `${word}で`
      case 'ta':
        return `${word}だった`
      case 'nai':
        return `${word}じゃない`
      case 'nakatta':
        return `${word}じゃなかった`
      case 'potential':
      case 'volitional':
        return null
    }
  }

  return null
}

/** Formas que tienen sentido para una clase dada. */
export function formsFor(cls: WordClass): FormId[] {
  const skip: FormId[] = cls === 'adj-i' || cls === 'adj-na' ? ['potential', 'volitional'] : []
  return FORMS.map((f) => f.id).filter((id) => !skip.includes(id))
}
