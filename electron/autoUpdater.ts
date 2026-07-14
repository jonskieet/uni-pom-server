// electron/autoUpdater.ts
// ============================================================
// Tự động cập nhật ứng dụng qua GitHub Releases (electron-updater).
//
// UX đã chọn: TẢI NGẦM → BÁO KHI SẴN SÀNG → người dùng tự bấm
// "Cập nhật ngay". Không tự khởi động lại app khi chưa được đồng ý.
//
// Fix:
//   - Delay checkForUpdates() đến sau khi renderer did-finish-load
//     để tránh mất IPC event khi renderer chưa mount xong.
//   - Log lỗi chi tiết ra console để dễ debug.
// ============================================================

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let mainWindow: BrowserWindow | null = null
let downloadedVersion: string | null = null
let rendererReady = false
let pendingStatus: UpdateStatus | null = null

function send(status: UpdateStatus) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (rendererReady) {
        mainWindow.webContents.send('updater:status', status)
        pendingStatus = null
      } else {
        // Renderer chưa sẵn sàng — lưu lại, sẽ gửi ngay khi ready
        pendingStatus = status
      }
    }
  } catch {
    /* renderer chưa sẵn sàng — bỏ qua */
  }
}

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win

  autoUpdater.autoDownload         = true
  autoUpdater.autoInstallOnAppQuit = false

  // ── Bật log ra console để dễ debug ──────────────────────────
  // Xem log trong DevTools hoặc file log của Electron
  autoUpdater.logger = {
    info:  (...args: any[]) => console.log('[AutoUpdater]', ...args),
    warn:  (...args: any[]) => console.warn('[AutoUpdater]', ...args),
    error: (...args: any[]) => console.error('[AutoUpdater]', ...args),
    debug: (...args: any[]) => console.debug('[AutoUpdater]', ...args),
  } as any

  autoUpdater.on('checking-for-update', () => {
    send({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    send({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message || 'Lỗi không xác định khi kiểm tra cập nhật'
    console.error('[AutoUpdater] Error:', err)
    send({ state: 'error', message })
  })

  // ── Đánh dấu renderer đã sẵn sàng, gửi pending status nếu có ─
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    if (pendingStatus) {
      try {
        win.webContents.send('updater:status', pendingStatus)
        pendingStatus = null
      } catch { /* ignore */ }
    }
  })

  // ── IPC: renderer chủ động yêu cầu kiểm tra ─────────────────
  ipcMain.handle('updater:check', () => {
    // KHÔNG await — các event (checking-for-update / update-available / update-not-available)
    // fire trong khi promise pending. Nếu await thì IPC bridge bị block, renderer
    // không nhận được event → UI treo mãi ở state 'checking'.
    // Fire-and-forget: trả về ngay, status push về renderer qua push event riêng.
    autoUpdater.checkForUpdates().catch((err: any) => {
      send({ state: 'error', message: err?.message || 'Không thể kiểm tra cập nhật' })
    })
    return { started: true }
  })

  // ── IPC: người dùng bấm "Cập nhật ngay" ─────────────────────
  ipcMain.handle('updater:installNow', async () => {
    if (!downloadedVersion) return { error: 'Bản cập nhật chưa tải xong.' }
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  // ── Tự động check khi khởi động (chỉ ở bản production) ──────
  // Delay 3 giây để đảm bảo renderer đã mount xong trước khi nhận event
  const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[AutoUpdater] Initial check failed:', err)
      })
    }, 3000)
  }
}