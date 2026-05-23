// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import './ipcHandlers'   // ← giữ nguyên, không còn import initDb từ db.ts

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST           = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST       = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// ── API URL — trỏ đến Render server ─────────────────────────
// Dev: đọc từ .env (VITE_DEV_SERVER_URL có nghĩa là đang dev)
// Production (.exe): dùng URL hardcode của Render
process.env.UNI_POM_API_URL = VITE_DEV_SERVER_URL
  ? (process.env.UNI_POM_API_URL || 'http://localhost:3001/api')
  : 'https://uni-pom-api.onrender.com/api'

let win: BrowserWindow | null

function registerWindowControls() {
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('window:resetSize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.unmaximize()
    win.setSize(1280, 800)
    win.center()
  })
}

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  // ← KHÔNG còn initDb() — không dùng SQLite nữa
  registerWindowControls()
  createWindow()
})
