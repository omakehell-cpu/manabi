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

export function preferredVoice(): SpeechSynthesisVoice | undefined {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(VOICE_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
  return voices.find((v) => v.name === saved) ?? voices[0]
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
