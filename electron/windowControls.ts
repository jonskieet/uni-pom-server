// electron/windowControls.ts
import { ipcMain, BrowserWindow } from 'electron'

const DEFAULT_WIDTH  = 1280
const DEFAULT_HEIGHT = 800

export function registerWindowControls() {
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
  // Reset về kích thước mặc định — gọi khi đăng xuất
  ipcMain.handle('window:resetSize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.unmaximize()
    win.setSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, true)
    win.center()
  })
}
