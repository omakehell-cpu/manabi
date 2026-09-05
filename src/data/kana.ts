/**
 * Tablas de kana.
 *
 * El katakana no se transcribe a mano: se deriva del hiragana desplazando
 * +0x60 en Unicode (あ U+3042 → ア U+30A2), que es exacto para todo el rango
 * U+3041–U+3096. Solo los kana extendidos (ファ, ヴィ…) se listan aparte,
 * porque no tienen equivalente en hiragana.
 */

export type KanaBlock = 'gojuon' | 'dakuten' | 'yoon' | 'extended'

export interface KanaItem {
  glyph: string
  romaji: string
  /** Romanizaciones alternativas aceptadas (Nihon-shiki, Kunrei-shiki…). */
  alt: string[]
  block: KanaBlock
  /** Fila de la tabla (a, ka, sa…), para ordenar pedagógicamente. */
  row: string
}

type Row = [glyph: string, romaji: string, ...alt: string[]]

const GOJUON: Record<string, Row[]> = {
  a:  [['あ','a'],['い','i'],['う','u'],['え','e'],['お','o']],
  ka: [['か','ka'],['き','ki'],['く','ku'],['け','ke'],['こ','ko']],
  sa: [['さ','sa'],['し','shi','si'],['す','su'],['せ','se'],['そ','so']],
  ta: [['た','ta'],['ち','chi','ti'],['つ','tsu','tu'],['て','te'],['と','to']],
  na: [['な','na'],['に','ni'],['ぬ','nu'],['ね','ne'],['の','no']],
  ha: [['は','ha'],['ひ','hi'],['ふ','fu','hu'],['へ','he'],['ほ','ho']],
  ma: [['ま','ma'],['み','mi'],['む','mu'],['め','me'],['も','mo']],
  ya: [['や','ya'],['ゆ','yu'],['よ','yo']],
  ra: [['ら','ra'],['り','ri'],['る','ru'],['れ','re'],['ろ','ro']],
  wa: [['わ','wa'],['を','wo','o']],
  n:  [['ん','n','nn',"n'"]],
}

const DAKUTEN: Record<string, Row[]> = {
  ga: [['が','ga'],['ぎ','gi'],['ぐ','gu'],['げ','ge'],['ご','go']],
  za: [['ざ','za'],['じ','ji','zi'],['ず','zu'],['ぜ','ze'],['ぞ','zo']],
  da: [['だ','da'],['ぢ','ji','di','dji'],['づ','zu','du','dzu'],['で','de'],['ど','do']],
  ba: [['ば','ba'],['び','bi'],['ぶ','bu'],['べ','be'],['ぼ','bo']],
  pa: [['ぱ','pa'],['ぴ','pi'],['ぷ','pu'],['ぺ','pe'],['ぽ','po']],
}

const YOON: Record<string, Row[]> = {
  kya: [['きゃ','kya'],['きゅ','kyu'],['きょ','kyo']],
  gya: [['ぎゃ','gya'],['ぎゅ','gyu'],['ぎょ','gyo']],
  sha: [['しゃ','sha','sya'],['しゅ','shu','syu'],['しょ','sho','syo']],
  ja:  [['じゃ','ja','zya','jya'],['じゅ','ju','zyu','jyu'],['じょ','jo','zyo','jyo']],
  cha: [['ちゃ','cha','tya'],['ちゅ','chu','tyu'],['ちょ','cho','tyo']],
  nya: [['にゃ','nya'],['にゅ','nyu'],['にょ','nyo']],
  hya: [['ひゃ','hya'],['ひゅ','hyu'],['ひょ','hyo']],
  bya: [['びゃ','bya'],['びゅ','byu'],['びょ','byo']],
  pya: [['ぴゃ','pya'],['ぴゅ','pyu'],['ぴょ','pyo']],
  mya: [['みゃ','mya'],['みゅ','myu'],['みょ','myo']],
  rya: [['りゃ','rya'],['りゅ','ryu'],['りょ','ryo']],
}

/** Kana exclusivos del katakana, para transcribir préstamos extranjeros. */
const EXTENDED: Record<string, Row[]> = {
  fa:  [['ファ','fa'],['フィ','fi'],['フェ','fe'],['フォ','fo']],
  ti:  [['ティ','ti'],['ディ','di'],['トゥ','tu'],['ドゥ','du']],
  wi:  [['ウィ','wi'],['ウェ','we'],['ウォ','wo']],
  va:  [['ヴァ','va'],['ヴィ','vi'],['ヴ','vu'],['ヴェ','ve'],['ヴォ','vo']],
  she: [['シェ','she'],['ジェ','je'],['チェ','che'],['イェ','ye']],
  tsa: [['ツァ','tsa'],['ツィ','tsi'],['ツェ','tse'],['ツォ','tso'],['クァ','kwa']],
}

/** あ U+3042 → ア U+30A2. Válido en todo U+3041–U+3096. */
export function toKatakana(hiragana: string): string {
  return [...hiragana]
    .map((ch) => {
      const code = ch.codePointAt(0)!
      return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch
    })
    .join('')
}

function flatten(table: Record<string, Row[]>, block: KanaBlock): KanaItem[] {
  return Object.entries(table).flatMap(([row, entries]) =>
    entries.map(([glyph, romaji, ...alt]) => ({ glyph, romaji, alt, block, row })),
  )
}

export const HIRAGANA: KanaItem[] = [
  ...flatten(GOJUON, 'gojuon'),
  ...flatten(DAKUTEN, 'dakuten'),
  ...flatten(YOON, 'yoon'),
]

export const KATAKANA: KanaItem[] = [
  ...HIRAGANA.map((k) => ({ ...k, glyph: toKatakana(k.glyph) })),
  ...flatten(EXTENDED, 'extended'),
]

/** Pares que se confunden por su forma, no por su sonido. */
export const CONFUSABLES: string[][] = [
  ['シ', 'ツ'],
  ['ソ', 'ン'],
  ['ね', 'れ', 'わ'],
  ['る', 'ろ'],
  ['さ', 'き'],
  ['は', 'ほ'],
  ['め', 'ぬ'],
  ['フ', 'ワ', 'ヲ'],
  ['ク', 'ケ', 'タ'],
  ['ア', 'マ'],
  ['チ', 'テ'],
  ['コ', 'ユ'],
]

export const BLOCK_LABELS: Record<KanaBlock, string> = {
  gojuon: 'Gojūon (básicos)',
  dakuten: 'Dakuten y handakuten',
  yoon: 'Yōon (combinados)',
  extended: 'Extendidos (extranjerismos)',
}
