// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import './ipcHandlers'   // ← giữ nguyên, không còn import initDb từ db.ts
import { readFileSync } from 'node:fs'
import { initAutoUpdater } from './autoUpdater'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// ── Load environment variables ───────────────────────────────
// Strategy (theo thu tu uu tien):
//   1. Doc tu .env file (dev va production neu tim thay)
//   2. Fallback: gia tri duoc EMBED vao code luc `npm run build` boi Vite define
//      → Luon hoat dong trong .exe du khong co .env file
function _loadEnv(envPath: string): boolean {
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !process.env[key]) process.env[key] = val
    }
    return true
  } catch { return false }
}

// Thu doc .env file (dev: project root, production: resources/)
_loadEnv(path.join(__dirname, '..', '.env'))
if (process.resourcesPath) _loadEnv(path.join(process.resourcesPath, '.env'))

// FALLBACK: neu van chua co key → dung gia tri embed luc build (luon co trong .exe)
// Cac gia tri nay duoc inject boi Vite define trong vite.config.ts
declare const __ENV_OPENROUTER_API_KEY__: string
if (!process.env.OPENROUTER_API_KEY) {
  try { process.env.OPENROUTER_API_KEY = __ENV_OPENROUTER_API_KEY__ } catch {}
}

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
  : 'https://uni-pom-server.onrender.com/api'

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
    icon: path.join(process.env.VITE_PUBLIC, '../assets/logo.png'),
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

  // Kiểm tra cập nhật ngầm sau khi window đã sẵn sàng (chỉ ở bản build,
  // bỏ qua khi đang dev — xem điều kiện trong autoUpdater.ts)
  initAutoUpdater(win)
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