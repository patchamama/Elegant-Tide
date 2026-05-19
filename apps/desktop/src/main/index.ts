import { app, BrowserWindow, ipcMain, dialog, screen, safeStorage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'

const isDev = process.env['NODE_ENV'] === 'development'
const WEB_DEV_URL = 'http://localhost:5173'

// Track all open windows
const openWindows = new Map<string, BrowserWindow>()

function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Elegant Tide',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL(WEB_DEV_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => openWindows.delete('control'))
  openWindows.set('control', win)
  return win
}

function createProjectorWindow(id: string, displayId?: number): BrowserWindow {
  const targetDisplay = displayId
    ? screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay()

  const { x, y, width, height } = targetDisplay.bounds

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: !isDev,
    frame: isDev,
    backgroundColor: '#000000',
    title: `Projector — ${id}`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const url = isDev
    ? `${WEB_DEV_URL}/projector/${id}`
    : `file://${path.join(__dirname, '../renderer/index.html')}#/projector/${id}`
  win.loadURL(url)

  win.on('closed', () => openWindows.delete(`projector-${id}`))
  openWindows.set(`projector-${id}`, win)
  return win
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('projector:open', (_event, { id, displayId }: { id: string; displayId?: number }) => {
  const key = `projector-${id}`
  if (openWindows.has(key)) {
    openWindows.get(key)?.focus()
    return
  }
  createProjectorWindow(id, displayId)
})

ipcMain.handle('projector:close', (_event, { id }: { id: string }) => {
  openWindows.get(`projector-${id}`)?.close()
})

ipcMain.handle('displays:list', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `Display ${d.id}`,
    bounds: d.bounds,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }))
})

ipcMain.handle('dialog:openFile', async (_event, { filters }: { filters?: Electron.FileFilter[] }) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: filters ?? [] })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('dialog:saveFile', async (_event, { defaultName, filters }: { defaultName?: string; filters?: Electron.FileFilter[] }) => {
  const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: filters ?? [] })
  return result.canceled ? null : result.filePath ?? null
})

ipcMain.handle('secure:get', (_event, { key }: { key: string }) => {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), `${key}.enc`))
    return safeStorage.decryptString(raw)
  } catch {
    return null
  }
})

ipcMain.handle('secure:set', (_event, { key, value }: { key: string; value: string }) => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const enc = safeStorage.encryptString(value)
  fs.writeFileSync(path.join(app.getPath('userData'), `${key}.enc`), enc)
  return true
})

ipcMain.handle('secure:delete', (_event, { key }: { key: string }) => {
  try {
    fs.unlinkSync(path.join(app.getPath('userData'), `${key}.enc`))
  } catch {
    // File didn't exist — fine
  }
})

ipcMain.handle('shell:openExternal', (_event, { url }: { url: string }) => {
  void shell.openExternal(url)
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createControlWindow()

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
