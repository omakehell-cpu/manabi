/**
 * Pronunciación mediante las voces del sistema (Web Speech API).
 *
 * No se empaqueta audio: son miles de elementos y cualquier grabación
 * multiplicaría por veinte el tamaño de la app. Chromium expone las voces
 * instaladas en el sistema, y en japonés suelen existir (Kyoko en macOS,
 * Haruka/Nanami/Ayumi en Windows con el paquete de idioma japonés).
 *
 * Si no hay ninguna voz japonesa, `hasJapaneseVoice()` devuelve false y la
 * interfaz oculta los botones de audio en lugar de reproducir una voz en
 * español leyendo kana, que sonaría mal y enseñaría una pronunciación falsa.
 *
 * Que exista una voz japonesa no basta: hay que elegir cuál. macOS instala
 * ocho voces de broma —Eddy, Grandma, Rocko…— con el idioma japonés puesto,
 * y salen antes que Kyoko por orden alfabético. Coger la primera de la lista
 * significaba estudiar con una voz de dibujos animados.
 */

let voices: SpeechSynthesisVoice[] = []
const listeners = new Set<() => void>()

function refresh(): void {
  if (typeof speechSynthesis === 'undefined') return
  voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ja'))
  for (const fn of listeners) fn()
}

if (typeof speechSynthesis !== 'undefined') {
  refresh()
  // La lista llega vacía en el primer arranque y se rellena después.
  speechSynthesis.addEventListener('voiceschanged', refresh)
}

export function hasJapaneseVoice(): boolean {
  return voices.length > 0
}

export function japaneseVoices(): SpeechSynthesisVoice[] {
  return voices
}

/** Avisa cuando las voces terminan de cargar, para re-renderizar. */
export function onVoicesChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const VOICE_KEY = 'manabi.voice'
const RATE_KEY = 'manabi.rate'

/**
 * Las voces de broma que macOS ofrece en todos los idiomas. Leen japonés
 * —el motor es el mismo— pero con una caricatura encima, y en una app para
 * aprender pronunciación eso no es una preferencia estética.
 */
const NOVELTY = [
  'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'eddy', 'flo', 'grandma',
  'grandpa', 'jester', 'junior', 'organ', 'reed', 'rocko', 'sandy', 'shelley',
  'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
]

/** Las voces japonesas de verdad de cada sistema. */
const KNOWN = [
  'kyoko', 'otoya', 'hattori', 'o-ren', // macOS
  'nanami', 'ayumi', 'haruka', 'ichiro', 'keita', 'mayu', 'naoki', 'sayaka', // Windows
  '日本語', 'japanese', // Google y genéricas
]

/** Marcas de que el sistema tiene descargada una versión mejor de la voz. */
const BETTER = ['premium', 'enhanced', 'neural', 'natural', 'siri']

/**
 * Cuánto conviene una voz para estudiar. Solo se compara entre voces
 * japonesas: aquí ya no se decide el idioma, sino la calidad.
 */
export function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase()
  let score = 0
  if (NOVELTY.some((n) => name.startsWith(n))) score -= 100
  if (KNOWN.some((n) => name.includes(n))) score += 50
  if (BETTER.some((n) => name.includes(n))) score += 100
  if (voice.default) score += 5
  return score
}

/** Las voces japonesas de mejor a peor. */
export function rankedVoices(): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))
}

/** Una voz que no es de broma y que el sistema reconoce como japonesa. */
export function isRecommended(voice: SpeechSynthesisVoice): boolean {
  return voiceScore(voice) >= 0
}

/**
 * El nombre sin la coletilla del idioma: macOS llama a sus voces
 * «Kyoko» pero a las de broma «Eddy (japonés (Japón))».
 */
export function voiceLabel(voice: SpeechSynthesisVoice): string {
  return voice.name.replace(/\s*\((japon[eé]s|japanese|日本語)[^)]*\)*\s*$/i, '').trim() || voice.name
}

export function preferredVoice(): SpeechSynthesisVoice | undefined {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(VOICE_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
  // Sin elección guardada manda la puntuación, no el orden alfabético.
  return voices.find((v) => v.name === saved) ?? rankedVoices()[0]
}

export function setPreferredVoice(name: string): void {
  try {
    localStorage.setItem(VOICE_KEY, name)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function speechRate(): number {
  try {
    const v = Number(localStorage.getItem(RATE_KEY))
    return v >= 0.5 && v <= 1.5 ? v : 0.9
  } catch {
    return 0.9
  }
}

export function setSpeechRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate))
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * KANJIDIC2 anota las lecturas con marcas que no se pronuncian:
 *   つ.ぐ   el punto separa la okurigana
 *   -び     el guion indica que va sufijada
 *   おお.きい.な  variantes con partícula
 */
export function cleanReading(reading: string): string {
  return reading.replace(/[.\-‐−]/g, '').trim()
}

/**
 * Lo que hay que reproducir de un par escritura–lectura.
 *
 * Dándole kanji, el motor elige la lectura por su cuenta, y no siempre la
 * que se está enseñando: 一日 es いちにち o ついたち según el contexto, y el
 * contexto aquí no existe. Cuando la lectura es kana se impone; en los
 * mazos de kana la lectura es rōmaji («ka») y entonces manda lo escrito.
 */
export function spokenForm(glyph: string, reading?: string | null): string {
  return reading && /[぀-ヿ]/.test(reading) ? reading : glyph
}

export function speak(text: string): void {
  if (typeof speechSynthesis === 'undefined' || !voices.length) return
  const clean = cleanReading(text)
  if (!clean) return

  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  const voice = preferredVoice()
  if (voice) utterance.voice = voice
  utterance.lang = 'ja-JP'
  utterance.rate = speechRate()
  speechSynthesis.speak(utterance)
}
