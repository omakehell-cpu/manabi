import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron'
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
  newPerDayTotal,
  setNewPerDayTotal,
  browseKanji,
  kanjiDetail,
  kanjiProgressCounts,
  browseSimple,
  listLeeches,
  reviveCard,
  reviveAllLeeches,
  suspendCard,
  getForecast,
  getGlobalProgress,
  kanjiStrokes,
  sentenceFor,
  componentsOf,
  undoLastReview,
  canUndo,
  getCard,
  getLessons,
  markPresented,
  lessonBatchSize,
  setLessonBatchSize,
  wordsForKanji,
  getSetting,
  setSetting,
  retention,
  setRetention,
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
    // En Windows y Linux el menú se dibuja dentro de la ventana y ocupa una
    // franja permanente. Se oculta, pero sigue ahí: la tecla Alt lo muestra.
    // Quitarlo del todo se llevaría por delante los atajos de edición.
    autoHideMenuBar: true,
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

/**
 * Menú propio, mínimo y en español.
 *
 * El de Electron viene en inglés con entradas que aquí no pintan nada. Este
 * se queda con lo que de verdad se usa —edición, zoom, ventana— y conserva
 * los atajos de copiar y pegar, que se perderían si se quitara el menú.
 */
function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [{ role: 'appMenu' as const }]
        : [
            {
              label: 'Archivo',
              submenu: [{ role: 'quit' as const, label: 'Salir' }],
            },
          ]),
      {
        label: 'Edición',
        submenu: [
          { role: 'undo' as const, label: 'Deshacer' },
          { role: 'redo' as const, label: 'Rehacer' },
          { type: 'separator' as const },
          { role: 'cut' as const, label: 'Cortar' },
          { role: 'copy' as const, label: 'Copiar' },
          { role: 'paste' as const, label: 'Pegar' },
          { role: 'selectAll' as const, label: 'Seleccionar todo' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload' as const, label: 'Recargar' },
          { role: 'toggleDevTools' as const, label: 'Herramientas de desarrollo' },
          { type: 'separator' as const },
          { role: 'resetZoom' as const, label: 'Tamaño real' },
          { role: 'zoomIn' as const, label: 'Ampliar' },
          { role: 'zoomOut' as const, label: 'Reducir' },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const, label: 'Pantalla completa' },
        ],
      },
      {
        label: 'Ventana',
        submenu: [
          { role: 'minimize' as const, label: 'Minimizar' },
          { role: 'close' as const, label: 'Cerrar' },
        ],
      },
    ]),
  )
}

app.whenReady().then(() => {
  buildMenu()
  openDatabase(join(app.getPath('userData'), 'manabi.db'))

  ipcMain.handle('queue:get', (_e, slug: string | null, limit?: number, aheadMinutes?: number) =>
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
  ipcMain.handle('deck:browse', (_e, slug: string, terms: string[]) => browseSimple(slug, terms))
  ipcMain.handle('leeches:list', () => listLeeches())
  ipcMain.handle('leeches:revive', (_e, cardId: number) => reviveCard(cardId))
  ipcMain.handle('leeches:reviveAll', () => reviveAllLeeches())
  ipcMain.handle('card:suspend', (_e, cardId: number) => suspendCard(cardId))
  ipcMain.handle('stats:forecast', (_e, days?: number) => getForecast(days))
  ipcMain.handle('stats:global', () => getGlobalProgress())
  ipcMain.handle('kanji:strokes', (_e, glyph: string) => kanjiStrokes(glyph))
  ipcMain.handle('review:undo', () => undoLastReview())
  ipcMain.handle('review:canUndo', () => canUndo())
  ipcMain.handle('card:get', (_e, cardId: number) => getCard(cardId))
  ipcMain.handle('lessons:get', (_e, slug: string | null, limit?: number) =>
    getLessons(slug, limit),
  )
  ipcMain.handle('lessons:present', (_e, ids: number[]) => markPresented(ids))
  ipcMain.handle('settings:lessonBatch', () => lessonBatchSize())
  ipcMain.handle('settings:setLessonBatch', (_e, v: number) => {
    setLessonBatchSize(v)
    return lessonBatchSize()
  })
  ipcMain.handle('kanji:words', (_e, glyph: string) => wordsForKanji(glyph))
  ipcMain.handle('kanji:sentence', (_e, glyph: string) => sentenceFor(glyph))
  ipcMain.handle('kanji:components', (_e, glyph: string) => componentsOf(glyph))
  ipcMain.handle('settings:retention', () => retention())
  ipcMain.handle('settings:setRetention', (_e, v: number) => {
    setRetention(v)
    return retention()
  })
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => setSetting(key, value))
  ipcMain.handle('settings:newPerDay', () => newPerDay())
  ipcMain.handle('settings:newPerDayTotal', () => newPerDayTotal())
  ipcMain.handle('settings:setNewPerDayTotal', (_e, v: number) => {
    setNewPerDayTotal(v)
    return newPerDayTotal()
  })
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
