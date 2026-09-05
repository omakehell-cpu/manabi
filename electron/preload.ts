import { contextBridge, ipcRenderer } from 'electron'

/**
 * Superficie mínima expuesta al renderer. Nada de Node ni de `ipcRenderer`
 * en bruto: solo estas funciones concretas.
 */
const api = {
  getQueue: (slug: string, limit?: number) => ipcRenderer.invoke('queue:get', slug, limit),
  grade: (cardId: number, rating: 1 | 2 | 3 | 4, durationMs: number) =>
    ipcRenderer.invoke('card:grade', cardId, rating, durationMs),
  previewIntervals: (cardId: number) => ipcRenderer.invoke('card:preview', cardId),
  deckStats: () => ipcRenderer.invoke('stats:decks'),
  overview: () => ipcRenderer.invoke('stats:overview'),
  resetProgress: () => ipcRenderer.invoke('progress:reset'),
  exportProgress: () => ipcRenderer.invoke('progress:export'),
}

contextBridge.exposeInMainWorld('manabi', api)

export type ManabiApi = typeof api
