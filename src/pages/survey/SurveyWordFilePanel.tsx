// ============================================================
// src/pages/survey/SurveyWordFilePanel.tsx
// Panel upload / xem nội dung / xuất file Word (.docx) đã soạn sẵn
// cho phiếu báo cáo khảo sát — lưu trên Cloudflare R2.
//
// Đây là LỰA CHỌN THAY THẾ cho việc điền form online (vốn bị hạn chế
// chỉnh sửa văn bản/hình ảnh, xuất Word không đẹp). Kỹ thuật soạn báo
// cáo trực tiếp trong Word rồi upload .docx lên đây. Trưởng phòng kỹ
// thuật / Sale Admin / Sale có thể xem nội dung hoặc xuất file Word
// gốc về bất kỳ lúc nào — không cần đụng tới luồng form cũ.
// ============================================================
import { useState } from 'react'
import { colors, radius } from '../../styles/theme'
import { Button, Modal, useNotification, useConfirm } from '../../components/ui'

interface Props {
  surveyId:    number
  fileName?:   string | null
  fileSize?:   number | null
  uploadedAt?: string | null
  canManage:   boolean   // được upload / thay / xóa file (technical, technical_lead, admin)
  onChanged:   () => void
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function SurveyWordFilePanel({
  surveyId, fileName, fileSize, uploadedAt, canManage, onChanged,
}: Props) {
  const notify = useNotification()
  const { confirm, ConfirmNode } = useConfirm()

  const [uploading, setUploading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  const hasFile = !!fileName

  async function handleUpload() {
    if (uploading) return
    setUploading(true)
    try {
      const result = await (window as any).api.survey.uploadWordFile(surveyId)
      if (result?.canceled) return
      if (result?.success === false) throw new Error(result.error ?? 'Lỗi không xác định')
      notify.success(hasFile ? 'Đã thay file Word thành công' : 'Đã tải lên file Word thành công')
      onChanged()
    } catch (err: any) {
      notify.error('Tải lên thất bại: ' + (err?.message ?? ''))
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      const result = await (window as any).api.survey.downloadWordFile(surveyId)
      if (result?.success === false && result?.error !== 'Hủy') {
        throw new Error(result.error ?? 'Lỗi không xác định')
      }
    } catch (err: any) {
      notify.error('Xuất Word thất bại: ' + (err?.message ?? ''))
    } finally {
      setDownloading(false)
    }
  }

  async function handlePreview() {
    if (previewing) return
    setPreviewing(true)
    try {
      const result = await (window as any).api.survey.previewWordFile(surveyId)
      if (result?.error) throw new Error(result.error)
      setPreviewHtml(result?.html ?? '<p><i>(File không có nội dung)</i></p>')
      setPreviewOpen(true)
    } catch (err: any) {
      notify.error('Không xem được nội dung: ' + (err?.message ?? ''))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title:        'Xóa file Word?',
      message:      'File hiện tại sẽ bị xóa khỏi hệ thống. Bạn có thể upload lại file khác sau đó.',
      variant:      'danger',
      confirmLabel: 'Xóa file',
    })
    if (!ok) return

    setDeleting(true)
    try {
      const result = await (window as any).api.survey.deleteWordFile(surveyId)
      if (result?.error) throw new Error(result.error)
      notify.success('Đã xóa file Word')
      onChanged()
    } catch (err: any) {
      notify.error('Xóa thất bại: ' + (err?.message ?? ''))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div style={{
        background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
        borderRadius: radius.lg, padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.md, flexShrink: 0,
            background: hasFile ? '#e8f0fe' : colors.bgSecondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-file-word" style={{ fontSize: 20, color: hasFile ? '#1a56db' : colors.textTertiary }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: colors.textPrimary,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360,
            }}>
              {hasFile ? fileName : 'Chưa có file Word'}
            </div>
            <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
              {hasFile
                ? `${formatBytes(fileSize)}${uploadedAt ? ' • Tải lên ' + new Date(uploadedAt).toLocaleString('vi-VN') : ''}`
                : 'Upload file Word đã soạn sẵn để xem nội dung hoặc xuất ra bất kỳ lúc nào'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasFile && (
            <>
              <Button
                variant="secondary" size="sm"
                icon="ti-eye"  loading={previewing}
                disabled={previewing}
                onClick={handlePreview}
              >
                Xem nội dung
              </Button>
              <Button
                variant="secondary" size="sm"
                icon="ti-download"
                loading={downloading}
                onClick={handleDownload}
              >
                Xuất Word
              </Button>
            </>
          )}
          {canManage && (
            <Button
              variant="secondary" size="sm"
              icon="ti-upload"
              loading={uploading}
              onClick={handleUpload}
            >
              {hasFile ? 'Thay file' : 'Upload file Word'}
            </Button>
          )}
          {canManage && hasFile && (
            <Button
              variant="danger" size="sm" icon="ti-trash"
              disabled={deleting}
              onClick={handleDelete}
            >
              Xóa
            </Button>
          )}
        </div>
      </div>

      {previewOpen && (
        <Modal
          title={fileName ? `Nội dung: ${fileName}` : 'Nội dung file Word'}
          width={840}
          onClose={() => setPreviewOpen(false)}
        >
          <div
            className="word-preview-content"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <style>{`
            .word-preview-content { font-size: 14px; line-height: 1.7; color: ${colors.textPrimary}; }
            .word-preview-content img { max-width: 100%; height: auto; }
            .word-preview-content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            .word-preview-content table td, .word-preview-content table th {
              border: 1px solid ${colors.border}; padding: 6px 10px; font-size: 13px;
            }
            .word-preview-content h1, .word-preview-content h2, .word-preview-content h3 {
              color: ${colors.primary}; margin: 16px 0 8px;
            }
            .word-preview-content p { margin: 6px 0; }
          `}</style>
        </Modal>
      )}

      {ConfirmNode}
    </>
  )
}