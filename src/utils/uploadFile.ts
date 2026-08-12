// src/utils/uploadFile.ts
// ============================================================
// Dùng chung giữa FormRenderer.tsx (field type='image') và
// RichTextEditor.tsx (ảnh dán/paste từ Word vào field richtext).
// Tách riêng ra file này (thay vì export thẳng từ FormRenderer.tsx)
// để tránh import vòng: FormRenderer.tsx -> RichTextEditor.tsx ->
// FormRenderer.tsx.
// ============================================================

// ── Đọc File thành base64 string ────────────────────────────
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => {
      // result là "data:<mime>;base64,<data>" — lấy phần sau dấu phẩy
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ── Upload một File lên Supabase qua IPC, trả về public URL ─
export async function uploadFileToSupabase(file: File): Promise<string> {
  const base64 = await readFileAsBase64(file)
  const result = await (window as any).api.upload.imageBuffer(
    'surveys',
    base64,
    file.name,
    file.type || 'image/jpeg',
  )
  if (result?.error) throw new Error(result.error)
  return result.url as string
}
