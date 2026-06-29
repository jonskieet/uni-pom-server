// ============================================================
// src/utils/storageR2.ts — Cloudflare R2 helper (S3-compatible API)
// ============================================================
// Dùng cho file Word báo cáo khảo sát (.docx) — KHÔNG dùng chung
// bucket Supabase "images" (vốn dành cho ảnh public). R2 ở đây để
// PRIVATE — mọi truy cập (xem nội dung / xuất Word) đều phải đi qua
// backend (có authMiddleware + check role), không có public URL.
//
// ENV cần cấu hình trên Render (Dashboard → Environment):
//   R2_ACCOUNT_ID          — Cloudflare Account ID
//   R2_ACCESS_KEY_ID        — R2 API Token: Access Key ID
//   R2_SECRET_ACCESS_KEY    — R2 API Token: Secret Access Key
//   R2_BUCKET_NAME          — tên bucket, vd: "uni-pom-survey-files"
//
// Tạo R2 API Token: Cloudflare Dashboard → R2 → Manage R2 API Tokens
// → Create API Token (quyền Object Read & Write, giới hạn vào bucket
// survey files cho an toàn).
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import type { Readable } from 'stream'

const ACCOUNT_ID  = process.env.R2_ACCOUNT_ID!
const ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID!
const SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY!
const BUCKET      = process.env.R2_BUCKET_NAME!

let _client: S3Client | null = null

/** Lazy singleton — chỉ khởi tạo khi thực sự dùng, tránh crash lúc import nếu thiếu env ở môi trường dev */
function getClient(): S3Client {
  if (_client) return _client

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    throw new Error(
      'Cloudflare R2 chưa được cấu hình. Cần set đủ env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
    )
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  })
  return _client
}

/**
 * Sinh object key duy nhất cho file Word của 1 phiếu khảo sát.
 * Dạng: survey-word-files/<report_code>/<timestamp>-<tên file đã làm sạch>.docx
 */
export function buildWordFileKey(reportCode: string, originalName: string): string {
  const safeName = originalName
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(-150) // tránh key quá dài nếu tên file gốc rất dài
  return `survey-word-files/${reportCode}/${Date.now()}-${safeName}`
}

/**
 * Upload buffer file Word lên Cloudflare R2.
 */
export async function uploadWordFile(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  )
}

/**
 * Tải file Word từ R2 về dạng Buffer (dùng cho preview HTML qua mammoth,
 * hoặc khi cần đo kích thước/đọc toàn bộ nội dung).
 */
export async function getWordFileBuffer(key: string): Promise<Buffer> {
  const client = getClient()
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const stream = res.Body as Readable
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Xóa file Word khỏi R2. Bỏ qua lỗi (best-effort) — vd. khi thay file mới
 * mà file cũ đã không còn tồn tại thì không nên làm fail cả request.
 */
export async function deleteWordFile(key: string): Promise<void> {
  try {
    const client = getClient()
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (err) {
    console.error('[storageR2] deleteWordFile warning:', (err as Error).message)
  }
}
