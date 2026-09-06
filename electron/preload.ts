import { contextBridge, ipcRenderer } from 'electron'

/**
 * Superficie mínima expuesta al renderer. Nada de Node ni de `ipcRenderer`
 * en bruto: solo estas funciones concretas.
 */
const api = {
  getQueue: (slug: string, limit?: number, aheadMinutes?: number) =>
    ipcRenderer.invoke('queue:get', slug, limit, aheadMinutes),
  grade: (cardId: number, rating: 1 | 2 | 3 | 4, durationMs: number) =>
    ipcRenderer.invoke('card:grade', cardId, rating, durationMs),
  previewIntervals: (cardId: number) => ipcRenderer.invoke('card:preview', cardId),
  deckStats: () => ipcRenderer.invoke('stats:decks'),
  browseKanji: (filters: unknown) => ipcRenderer.invoke('kanji:browse', filters),
  kanjiDetail: (glyph: string) => ipcRenderer.invoke('kanji:detail', glyph),
  kanjiCounts: (level: number) => ipcRenderer.invoke('kanji:counts', level),
  leeches: () => ipcRenderer.invoke('leeches:list'),
  reviveLeech: (cardId: number) => ipcRenderer.invoke('leeches:revive', cardId),
  reviveAllLeeches: () => ipcRenderer.invoke('leeches:reviveAll'),
  suspendCard: (cardId: number) => ipcRenderer.invoke('card:suspend', cardId),
  forecast: (days?: number) => ipcRenderer.invoke('stats:forecast', days),
  kanjiStrokes: (glyph: string) => ipcRenderer.invoke('kanji:strokes', glyph),
  undo: () => ipcRenderer.invoke('review:undo'),
  canUndo: () => ipcRenderer.invoke('review:canUndo'),
  getCard: (cardId: number) => ipcRenderer.invoke('card:get', cardId),
  getLessons: (slug: string, limit?: number) => ipcRenderer.invoke('lessons:get', slug, limit),
  markPresented: (ids: number[]) => ipcRenderer.invoke('lessons:present', ids),
  lessonsRemaining: (slug: string) => ipcRenderer.invoke('lessons:remaining', slug),
  lessonBatch: () => ipcRenderer.invoke('settings:lessonBatch'),
  setLessonBatch: (v: number) => ipcRenderer.invoke('settings:setLessonBatch', v),
  wordsForKanji: (glyph: string) => ipcRenderer.invoke('kanji:words', glyph),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  newPerDay: () => ipcRenderer.invoke('settings:newPerDay'),
  setNewPerDay: (value: number) => ipcRenderer.invoke('settings:setNewPerDay', value),
  overview: () => ipcRenderer.invoke('stats:overview'),
  resetProgress: () => ipcRenderer.invoke('progress:reset'),
  exportProgress: () => ipcRenderer.invoke('progress:export'),
}

contextBridge.exposeInMainWorld('manabi', api)

export type ManabiApi = typeof api
