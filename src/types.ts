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
  lessons: number
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

export type KanjiProgress = 'locked' | 'new' | 'learning' | 'mature'

export interface KanjiBrowseItem {
  glyph: string
  level: number
  extra: boolean
  meaning: string
  progress: KanjiProgress
  strokes: number
}

export interface KanjiDetail extends KanjiBrowseItem {
  meanings: string[]
  on: string[]
  kun: string[]
  freq: number
  grade: number
  nextDue: string | null
  words: { word: string; reading: string; meaning: string; progress: KanjiProgress }[]
}

export interface BrowseFilters {
  level?: number
  progress?: KanjiProgress | 'all'
  terms?: string[]
  limit?: number
}

export interface LeechCard {
  cardId: number
  deck: string
  deckName: string
  glyph: string
  reading: string
  meaning: string | null
  cardType: CardType
  lapses: number
  reps: number
  failures: number
  failureRate: number
}

export interface ForecastDay {
  day: string
  count: number
}

export interface Forecast {
  overdue: number
  days: ForecastDay[]
}

export interface UndoResult {
  cardId: number
  glyph: string
  rating: number
}

export interface ManabiApi {
  getQueue(slug: string, limit?: number, aheadMinutes?: number): Promise<StudyCard[]>
  grade(cardId: number, rating: 1 | 2 | 3 | 4, durationMs: number): Promise<GradeResult>
  previewIntervals(cardId: number): Promise<Record<number, number>>
  deckStats(): Promise<DeckStats[]>
  browseKanji(filters: BrowseFilters): Promise<KanjiBrowseItem[]>
  kanjiDetail(glyph: string): Promise<KanjiDetail | null>
  kanjiCounts(level: number): Promise<Record<KanjiProgress, number>>
  leeches(): Promise<LeechCard[]>
  reviveLeech(cardId: number): Promise<void>
  reviveAllLeeches(): Promise<number>
  suspendCard(cardId: number): Promise<void>
  forecast(days?: number): Promise<Forecast>
  kanjiStrokes(glyph: string): Promise<string[]>
  undo(): Promise<UndoResult | null>
  canUndo(): Promise<boolean>
  getCard(cardId: number): Promise<StudyCard | null>
  getLessons(slug: string, limit?: number): Promise<StudyCard[]>
  markPresented(ids: number[]): Promise<void>
  lessonsRemaining(slug: string): Promise<number>
  lessonBatch(): Promise<number>
  setLessonBatch(v: number): Promise<number>
  wordsForKanji(glyph: string): Promise<{ word: string; reading: string; meaning: string }[]>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
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
