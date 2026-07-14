// electron/tokenStore.ts
// ============================================================
// Lưu trữ "phiên đăng nhập" và "tên đăng nhập đã nhớ" bền vững trên đĩa,
// sống sót qua việc tắt/mở lại app (khác với sessionStorage ở renderer,
// vốn bị xoá mỗi khi app đóng).
//
// - JWT token được MÃ HOÁ bằng app.safeStorage trước khi ghi xuống đĩa
//   (Windows: DPAPI, macOS: Keychain, Linux: libsecret/kwallet — tuỳ máy).
//   Nếu safeStorage không khả dụng (môi trường hiếm gặp), fallback ghi
//   plaintext để tính năng vẫn hoạt động, nhưng đây là trường hợp hạ cấp.
// - Username "ghi nhớ" lưu plaintext riêng — không phải bí mật, chỉ để
//   tiện điền sẵn vào ô input khi người dùng tắt "đăng nhập tự động".
// ============================================================

import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const SESSION_FILE  = () => path.join(app.getPath('userData'), 'session.bin')
const REMEMBER_FILE = () => path.join(app.getPath('userData'), 'remember.json')

// ── Session (JWT token) — phục vụ tự động đăng nhập lại ───────────
export function saveSession(token: string): void {
  try {
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token)
      : Buffer.from(token, 'utf-8')
    fs.writeFileSync(SESSION_FILE(), buf)
  } catch {
    // Ghi thất bại không nên làm crash app — người dùng chỉ phải đăng nhập lại
  }
}

export function loadSession(): string | null {
  try {
    const buf = fs.readFileSync(SESSION_FILE())
    if (safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(buf) }
      catch { return buf.toString('utf-8') /* file cũ chưa mã hoá */ }
    }
    return buf.toString('utf-8')
  } catch {
    return null
  }
}

export function clearSession(): void {
  try { fs.unlinkSync(SESSION_FILE()) } catch { /* không tồn tại — bỏ qua */ }
}

// ── Ghi nhớ tên đăng nhập (không lưu mật khẩu) ─────────────────────
export function saveRememberedUsername(username: string | null): void {
  try {
    if (username) {
      fs.writeFileSync(REMEMBER_FILE(), JSON.stringify({ username }))
    } else {
      fs.unlinkSync(REMEMBER_FILE())
    }
  } catch { /* ignore */ }
}

export function loadRememberedUsername(): string | null {
  try {
    const raw = fs.readFileSync(REMEMBER_FILE(), 'utf-8')
    const data = JSON.parse(raw)
    return typeof data?.username === 'string' ? data.username : null
  } catch {
    return null
  }
}
