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
  newPerDay: () => ipcRenderer.invoke('settings:newPerDay'),
  setNewPerDay: (value: number) => ipcRenderer.invoke('settings:setNewPerDay', value),
  overview: () => ipcRenderer.invoke('stats:overview'),
  resetProgress: () => ipcRenderer.invoke('progress:reset'),
  exportProgress: () => ipcRenderer.invoke('progress:export'),
}

contextBridge.exposeInMainWorld('manabi', api)

export type ManabiApi = typeof api
