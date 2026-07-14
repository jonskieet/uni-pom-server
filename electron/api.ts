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

// ── Retry/timeout config ───────────────────────────────────────
// QUAN TRỌNG: SplashScreen chỉ ping /health (route "rẻ", không cần DB) để
// đánh thức Render. Nhưng request /api/... ĐẦU TIÊN sau khi splash xong vẫn
// có thể rơi đúng lúc DB/Prisma pool chưa kịp connect xong (đặc biệt nếu DB
// cũng là free-tier, tự ngủ riêng). Nếu request đó timeout ngắn + không
// retry như trước đây, app sẽ báo "mất kết nối" dù server NodeJS đã thức.
// → Cho apiFetch cùng "độ kiên nhẫn" với splash: timeout dài hơn mỗi lần thử
//   + tự retry một vài lần với lỗi network/timeout/5xx trước khi throw.
const REQUEST_TIMEOUT_MS = 20000   // mỗi lần thử chờ tối đa 20s (đủ cho DB cold-start)
const MAX_RETRIES        = 3       // tổng cộng tối đa 4 lần thử (1 + 3 retry)
const RETRY_DELAY_MS     = 2000

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// Lỗi đáng để retry: timeout, lỗi network (server chưa kịp accept connection),
// hoặc 502/503/504 (Render trả khi container đang khởi động lại / đang restart).
function isRetryable(err: unknown, status?: number): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  if (err instanceof Error) {
    return err.name === 'AbortError' || /network|fetch failed|ECONNRESET|ECONNREFUSED/i.test(err.message)
  }
  return false
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await net.fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(tid)
  }
}

// ── Core fetch ───────────────────────────────────────────────
export async function apiFetch<T = any>(
  path: string,
  options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
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

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }

  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init)
      const data = await res.json() as any

      if (!res.ok) {
        if (isRetryable(undefined, res.status) && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS)
          continue
        }
        throw new Error(data?.error || `HTTP ${res.status}: ${path}`)
      }

      // ✅ Unwrap { success: true, data: ... } → trả về data trực tiếp
      return (data?.data !== undefined ? data.data : data) as T
    } catch (err) {
      lastErr = err
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      throw err
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(`Request failed: ${path}`)
}

// ── Shorthand helpers ─────────────────────────────────────────
export const api = {
  get:    <T>(path: string, params?: Record<string, any>) =>
    apiFetch<T>(path, { method: 'GET', params }),

  post:   <T>(path: string, body: any) =>
    apiFetch<T>(path, { method: 'POST', body }),

  put:    <T>(path: string, body: any) =>
    apiFetch<T>(path, { method: 'PUT', body }),
   patch:  <T>(path: string, body: any) =>
    apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}

// ── Multipart upload (dùng node FormData) ─────────────────────
export async function apiUpload(
  folder: string,
  filePath: string,
  oldUrl?: string
): Promise<string> {
  const fs   = await import('fs')
  const path = await import('path')

  const buffer   = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)
  const ext      = fileName.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime     = ext === 'png' ? 'image/png'
                 : ext === 'webp' ? 'image/webp'
                 : 'image/jpeg'

  // Tạo multipart boundary thủ công (Electron net không hỗ trợ FormData browser)
  const boundary = `----FormBoundary${Date.now()}`
  const crlf = '\r\n'

  const parts: Buffer[] = []

  // field: old_url (optional)
  if (oldUrl) {
    parts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="old_url"${crlf}${crlf}` +
      `${oldUrl}${crlf}`
    ))
  }

  // field: image (file)
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="image"; filename="${fileName}"${crlf}` +
    `Content-Type: ${mime}${crlf}${crlf}`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`))

  const body = Buffer.concat(parts)

  const url  = `${API_URL}/upload/${folder}`
  const res  = await net.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body,
  })

  const data = await res.json() as any
  if (!res.ok) throw new Error(data?.error || `Upload failed: HTTP ${res.status}`)
  return data.url as string
}

// ── Upload từ Buffer (không cần file path trên disk) ──────────
// Dùng trong handler upload:image-buffer — renderer gửi base64
export async function apiUploadBuffer(
  folder:   string,
  buffer:   Buffer,
  filename: string,
  mimeType: string,
  oldUrl?:  string,
): Promise<string> {
  const boundary = `----FormBoundary${Date.now()}`
  const crlf = '\r\n'
  const parts: Buffer[] = []

  if (oldUrl) {
    parts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="old_url"${crlf}${crlf}` +
      `${oldUrl}${crlf}`
    ))
  }

  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"${crlf}` +
    `Content-Type: ${mimeType}${crlf}${crlf}`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`))

  const body = Buffer.concat(parts)
  const url  = `${API_URL}/upload/${folder}`

  const res  = await net.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body,
  })

  const data = await res.json() as any
  if (!res.ok) throw new Error(data?.error || `Upload failed: HTTP ${res.status}`)
  return data.url as string
}
// ── Upload file Word (.docx) cho phiếu khảo sát ───────────────
// Khác với apiUpload (ảnh) — field name là "file", không gắn vào
// bucket ảnh Supabase mà đi tới Cloudflare R2 (server tự xử lý).
export async function apiUploadWordFile(
  surveyId: number,
  filePath: string,
): Promise<any> {
  const fs   = await import('fs')
  const path = await import('path')

  const buffer   = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const boundary = `----FormBoundary${Date.now()}`
  const crlf = '\r\n'
  const parts: Buffer[] = []

  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"${crlf}` +
    `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document${crlf}${crlf}`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`))

  const body = Buffer.concat(parts)
  const url  = `${API_URL}/surveys/${surveyId}/word-file`

  const res = await net.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body,
  })

  const data = await res.json() as any
  if (!res.ok) throw new Error(data?.error || `Upload thất bại: HTTP ${res.status}`)
  return data?.data !== undefined ? data.data : data
}

// Thêm vào cuối electron/api.ts
export async function apiFetchRaw(
  path: string,
  params?: Record<string, any>
): Promise<{ buffer: Buffer; headers: Record<string, string> }> {
  let url = `${API_URL}${path}`
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += `?${qs}`
  }

  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Gom headers thành object đơn giản
  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => { headers[key] = value })

  return { buffer, headers }
}