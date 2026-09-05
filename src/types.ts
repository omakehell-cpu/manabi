export type CardType = 'recognition' | 'recall' | 'reading' | 'meaning' | 'word'

export interface StudyCard {
  cardId: number
  itemId: number
  deck: string
  deckKind: string
  cardType: CardType
  glyph: string
  reading: string
  meaning: string | null
  alt: string
  block: string
  state: number
  reps: number
  due: string
}

export interface DeckStats {
  slug: string
  name: string
  kind: string
  total: number
  locked: number
  due: number
  New: number
  learning: number
  review: number
  suspended: number
  characters: number
  newRemaining: number
}

export interface Overview {
  reviewsToday: number
  accuracyToday: number
  streak: number
  totalReviews: number
  history: { day: string; count: number }[]
}

export interface GradeResult {
  due: string
  state: number
  suspended: boolean
  intervalDays: number
}

export interface ManabiApi {
  getQueue(slug: string, limit?: number, aheadMinutes?: number): Promise<StudyCard[]>
  grade(cardId: number, rating: 1 | 2 | 3 | 4, durationMs: number): Promise<GradeResult>
  previewIntervals(cardId: number): Promise<Record<number, number>>
  deckStats(): Promise<DeckStats[]>
  newPerDay(): Promise<number>
  setNewPerDay(value: number): Promise<number>
  overview(): Promise<Overview>
  resetProgress(): Promise<void>
  exportProgress(): Promise<string | null>
}

declare global {
  interface Window {
    manabi: ManabiApi
  }
}
