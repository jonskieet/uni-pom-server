// ============================================================
// src/utils/storage.ts — Supabase Storage helper
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.SUPABASE_URL!
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY! // service role để bypass RLS
const BUCKET       = 'images'

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Upload file buffer lên Supabase Storage
 * @param folder   'avatars' | 'brands' | 'products' | 'surveys'
 * @param fileName tên file (nên unique, vd: `${id}-${Date.now()}.jpg`)
 * @param buffer   Buffer dữ liệu file
 * @param mimeType vd: 'image/jpeg'
 * @returns public URL của ảnh đã upload
 */
export async function uploadImage(
  folder: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const path = `${folder}/${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true          // ghi đè nếu trùng tên
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Xoá file khỏi Supabase Storage theo public URL
 * Trả về false nếu URL không thuộc bucket (bỏ qua an toàn)
 */
export async function deleteImage(publicUrl: string): Promise<void> {
  // Trích path từ URL: .../storage/v1/object/public/images/<path>
  const marker = `/object/public/${BUCKET}/`
  const idx    = publicUrl.indexOf(marker)
  if (idx === -1) return   // URL ngoài bucket → bỏ qua

  const path = decodeURIComponent(publicUrl.slice(idx + marker.length))

  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.error('Storage delete warning:', error.message)
}
