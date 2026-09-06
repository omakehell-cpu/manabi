import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { Grade } from 'ts-fsrs'
import {
  openDatabase,
  getQueue,
  gradeCard,
  previewIntervals,
  getDeckStats,
  getOverview,
  resetProgress,
  exportAll,
  newPerDay,
  setNewPerDay,
  browseKanji,
  kanjiDetail,
  kanjiProgressCounts,
  listLeeches,
  reviveCard,
  reviveAllLeeches,
  suspendCard,
  getForecast,
  kanjiStrokes,
  undoLastReview,
  canUndo,
  getCard,
  getLessons,
  markPresented,
  lessonsRemaining,
  lessonBatchSize,
  setLessonBatchSize,
  wordsForKanji,
  getSetting,
  setSetting,
  type BrowseFilters,
} from './db'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: 'Manabi',
    backgroundColor: '#0f1115',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  openDatabase(join(app.getPath('userData'), 'manabi.db'))

  ipcMain.handle('queue:get', (_e, slug: string, limit?: number, aheadMinutes?: number) =>
    getQueue(slug, limit, aheadMinutes),
  )
  ipcMain.handle('card:grade', (_e, id: number, rating: Grade, ms: number) =>
    gradeCard(id, rating, ms),
  )
  ipcMain.handle('card:preview', (_e, id: number) => previewIntervals(id))
  ipcMain.handle('stats:decks', () => getDeckStats())
  ipcMain.handle('kanji:browse', (_e, filters: BrowseFilters) => browseKanji(filters))
  ipcMain.handle('kanji:detail', (_e, glyph: string) => kanjiDetail(glyph))
  ipcMain.handle('kanji:counts', (_e, level: number) => kanjiProgressCounts(level))
  ipcMain.handle('leeches:list', () => listLeeches())
  ipcMain.handle('leeches:revive', (_e, cardId: number) => reviveCard(cardId))
  ipcMain.handle('leeches:reviveAll', () => reviveAllLeeches())
  ipcMain.handle('card:suspend', (_e, cardId: number) => suspendCard(cardId))
  ipcMain.handle('stats:forecast', (_e, days?: number) => getForecast(days))
  ipcMain.handle('kanji:strokes', (_e, glyph: string) => kanjiStrokes(glyph))
  ipcMain.handle('review:undo', () => undoLastReview())
  ipcMain.handle('review:canUndo', () => canUndo())
  ipcMain.handle('card:get', (_e, cardId: number) => getCard(cardId))
  ipcMain.handle('lessons:get', (_e, slug: string, limit?: number) => getLessons(slug, limit))
  ipcMain.handle('lessons:present', (_e, ids: number[]) => markPresented(ids))
  ipcMain.handle('lessons:remaining', (_e, slug: string) => lessonsRemaining(slug))
  ipcMain.handle('settings:lessonBatch', () => lessonBatchSize())
  ipcMain.handle('settings:setLessonBatch', (_e, v: number) => {
    setLessonBatchSize(v)
    return lessonBatchSize()
  })
  ipcMain.handle('kanji:words', (_e, glyph: string) => wordsForKanji(glyph))
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => setSetting(key, value))
  ipcMain.handle('settings:newPerDay', () => newPerDay())
  ipcMain.handle('settings:setNewPerDay', (_e, value: number) => {
    setNewPerDay(value)
    return newPerDay()
  })
  ipcMain.handle('stats:overview', () => getOverview())
  ipcMain.handle('progress:reset', () => resetProgress())
  ipcMain.handle('progress:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar progreso',
      defaultPath: `manabi-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return null
    writeFileSync(filePath, exportAll(), 'utf8')
    return filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
