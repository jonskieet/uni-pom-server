// electron/api.ts
// HTTP client dùng trong Electron main process (Node.js)
// Thay thế getDb() — mọi IPC handler gọi hàm này thay vì SQLite
//
// Cách dùng:
//   import { apiFetch, setToken } from './api'
//   const data = await apiFetch('/poms', { method: 'GET' })

import { net } from 'electron'  // electron net module, không cần axios

// ✅ Đúng domain uni-pom-server
const API_URL = process.env.UNI_POM_API_URL || 'https://uni-pom-server.onrender.com/api'

// JWT token lưu in-memory (main process), set sau khi login thành công
let _token: string | null = null

export function setToken(token: string | null) {
  _token = token
}

export function getToken(): string | null {
  return _token
}

// ── Core fetch ───────────────────────────────────────────────
export async function apiFetch<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: any
    params?: Record<string, any>
  } = {}
): Promise<T> {
  const { method = 'GET', body, params } = options

  // Build URL + query string
  let url = `${API_URL}${path}`
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += `?${qs}`
  }

  // Dùng node-fetch style với electron net.fetch (Electron 30+)
  const res = await net.fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json() as any

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}: ${path}`)
  }

  // ✅ Unwrap { success: true, data: ... } → trả về data trực tiếp
  return (data?.data !== undefined ? data.data : data) as T
}

// ── Shorthand helpers ─────────────────────────────────────────
export const api = {
  get:    <T>(path: string, params?: Record<string, any>) =>
    apiFetch<T>(path, { method: 'GET', params }),

  post:   <T>(path: string, body: any) =>
    apiFetch<T>(path, { method: 'POST', body }),

  put:    <T>(path: string, body: any) =>
    apiFetch<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}
