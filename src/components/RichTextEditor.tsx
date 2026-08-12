// src/components/RichTextEditor.tsx
// ============================================================
// Editor văn bản định dạng (giống trải nghiệm gõ Word) dùng cho
// field type='richtext' trong FormBuilder/FormRenderer.
//
// KIẾN TRÚC: nội dung lưu dạng TipTap/ProseMirror JSON doc (không
// phải HTML thô) — để lúc xuất Word, backend duyệt JSON node theo
// schema đã biết trước (heading/paragraph/bulletList/orderedList/
// listItem, marks bold/italic/underline) và convert 1-1 sang docx
// element, không cần parse HTML tuỳ tiện (dễ vỡ, khó kiểm soát).
//
// Hỗ trợ: heading (H2/H3/H4), in đậm/nghiêng/gạch chân, danh sách
// gạch đầu dòng & đánh số NHIỀU CẤP (thụt vào/ra qua toolbar), ảnh
// dán trực tiếp từ Word (paste), và NHẬP NGUYÊN FILE .docx (nút
// "Nhập từ Word" trên toolbar) — dùng mammoth.js đọc thẳng cấu trúc
// XML gốc của file .docx (numbering.xml/styles) thay vì dựa vào HTML
// clipboard khi paste, nên bullet/số list ra đúng ngay cả khi Word
// hiển thị bằng font ký hiệu (Wingdings/Symbol) mà trình duyệt không
// có font đó để hiển thị (nguyên nhân gây ô vuông ▯ khi paste thường).
// Ảnh nhúng trong .docx cũng được tự động upload lên Supabase Storage.
// Bảng trong rich text vẫn dùng field type='table' riêng.
// ============================================================
import { useRef, useState } from 'react'
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import mammoth from 'mammoth'
import { colors, radius } from '../styles/theme'
import { EMPTY_RICH_TEXT } from '../types/form'
import { uploadFileToSupabase } from '../utils/uploadFile'

interface Props {
  content?:     JSONContent | null
  onChange?:    (doc: JSONContent) => void
  readOnly?:    boolean
  placeholder?: string
}

function ToolbarButton({ active, disabled, onClick, icon, title }: {
  active?: boolean; disabled?: boolean; onClick: () => void; icon: string; title: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()} // giữ focus editor, không blur khi bấm nút
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? colors.primaryLight : 'transparent',
        color: active ? colors.primary : disabled ? colors.textTertiary : colors.textSecondary,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 15 }} />
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: colors.border, margin: '2px 4px' }} />
}

// Word "Heading 1/2/3" (và "Title") -> h2/h3/h4: editor chỉ hỗ trợ heading
// level 2-4 (xem StarterKit.configure({ heading: { levels: [2,3,4] } }) bên
// dưới), nếu không map thì mammoth xuất ra <h1>/<h5>/<h6> mà schema không
// nhận diện được, nội dung sẽ tụt về đoạn văn thường mất định dạng tiêu đề.
const MAMMOTH_STYLE_MAP = [
  "p[style-name='Title'] => h2:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
]

// Chuyển chuỗi base64 (mammoth đọc ảnh nhúng trong .docx ra base64) thành
// File để tái dùng đúng hàm uploadFileToSupabase hiện có (giống ảnh dán/
// field type='image') — không lưu base64 trực tiếp vào form_data.
function base64ToFile(base64: string, contentType: string, name: string): File {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: contentType || 'image/png' })
}

export function RichTextEditor({ content, onChange, readOnly, placeholder }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Nhập nội dung...',
        emptyEditorClass: 'rte-empty',
      }),
    ],
    content: content ?? EMPTY_RICH_TEXT,
    onUpdate: ({ editor: ed }) => onChange?.(ed.getJSON()),
    editorProps: {
      // Dán từ Word: HTML clipboard thường chèn ảnh bằng đường dẫn cục bộ
      // <img src="file:///C:/...">, Electron renderer không đọc được qua
      // file:// trong context này → xoá thẻ đó trước khi TipTap parse, để
      // không lưu lại icon ảnh vỡ. Ảnh thật (nếu có) được chèn ở handlePaste
      // bên dưới, từ clipboard items nhị phân thật.
      transformPastedHTML(html) {
        return html.replace(/<img[^>]*src=["']file:\/\/[^"']*["'][^>]*>/gi, '')
      },
      // Dán từ Word: clipboard thường chứa đồng thời text/html (đã dọn ở
      // trên) VÀ item ảnh nhị phân thật trong clipboardData.items — bắt lấy,
      // upload lên Supabase Storage rồi chèn vào vị trí con trỏ hiện tại.
      // Không upload base64 trực tiếp vào form_data (tránh phình JSON,
      // dùng lại đúng cơ chế lưu ảnh đã có ở field type='image').
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItems = items.filter(it => it.type.startsWith('image/'))
        if (imageItems.length === 0) return false // không có ảnh → để TipTap xử lý paste text/HTML mặc định

        // Không preventDefault ở đây (return false) để phần text/HTML (bold/
        // italic/heading/list) vẫn được paste bình thường qua cơ chế mặc định
        // của TipTap — ảnh được chèn thêm SAU đó, bất đồng bộ, gần đúng vị trí
        // con trỏ tại thời điểm dán. Nếu Word có nhiều ảnh xen giữa nhiều đoạn
        // văn bản, thứ tự chèn không đảm bảo tuyệt đối 100% — đánh đổi chấp
        // nhận được ở giai đoạn này.
        imageItems.forEach(item => {
          const file = item.getAsFile()
          if (!file) return
          uploadFileToSupabase(file).then(url => {
            const { state, dispatch } = view
            const node = state.schema.nodes.image.create({ src: url })
            const tr = state.tr.replaceSelectionWith(node)
            dispatch(tr)
          }).catch(err => {
            console.error('[RichTextEditor] paste ảnh thất bại:', err)
          })
        })

        return false
      },
    },
  }, [readOnly]) // re-init nếu chuyển đổi editable ↔ readOnly

  if (!editor) return null

  async function handleImportDocx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại đúng file đó lần sau
    if (!file || !editor) return

    setImportError(null)
    setImporting(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: MAMMOTH_STYLE_MAP,
          // mammoth đọc numbering.xml thật của file .docx (không dựa vào
          // clipboard HTML) nên bullet/số đúng ngữ nghĩa dù Word hiển thị
          // bằng font ký hiệu (Wingdings/Symbol...) — không còn bị tofu ▯.
          convertImage: mammoth.images.imgElement(async (image) => {
            const base64 = await image.read('base64')
            const imgFile = base64ToFile(base64, image.contentType, 'word-image')
            const url = await uploadFileToSupabase(imgFile)
            return { src: url }
          }),
        }
      )
      editor.chain().focus().insertContent(result.value).run()
      if (result.messages?.length) {
        console.warn('[RichTextEditor] mammoth cảnh báo khi đọc .docx:', result.messages)
      }
    } catch (err) {
      console.error('[RichTextEditor] nhập file Word thất bại:', err)
      setImportError('Không đọc được file Word này. Vui lòng thử file .docx khác.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{
      border: `0.5px solid ${colors.border}`, borderRadius: radius.md,
      background: colors.bgPrimary, overflow: 'hidden',
    }}>
      {!readOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px',
          borderBottom: `0.5px solid ${colors.border}`, background: colors.bgSecondary, flexWrap: 'wrap',
        }}>
          <ToolbarButton icon="ti-bold" title="In đậm (Ctrl+B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton icon="ti-italic" title="In nghiêng (Ctrl+I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton icon="ti-underline" title="Gạch chân (Ctrl+U)"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton icon="ti-strikethrough" title="Gạch ngang"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()} />

          <Divider />

          <ToolbarButton icon="ti-h-2" title="Tiêu đề lớn"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarButton icon="ti-h-3" title="Tiêu đề vừa"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <ToolbarButton icon="ti-h-4" title="Tiêu đề nhỏ"
            active={editor.isActive('heading', { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} />

          <Divider />

          <ToolbarButton icon="ti-list" title="Danh sách gạch đầu dòng"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton icon="ti-list-numbers" title="Danh sách đánh số"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton icon="ti-indent-increase" title="Thụt vào (danh sách cấp con)"
            disabled={!editor.can().sinkListItem('listItem')}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()} />
          <ToolbarButton icon="ti-indent-decrease" title="Thụt ra"
            disabled={!editor.can().liftListItem('listItem')}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()} />

          <Divider />

          <ToolbarButton icon="ti-arrow-back-up" title="Hoàn tác (Ctrl+Z)"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()} />
          <ToolbarButton icon="ti-arrow-forward-up" title="Làm lại (Ctrl+Y)"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()} />

          <Divider />

          <ToolbarButton icon={importing ? 'ti-loader-2' : 'ti-file-import'}
            title="Nhập nội dung từ file Word (.docx) — giữ đúng định dạng gốc"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()} />
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            style={{ display: 'none' }}
            onChange={handleImportDocx}
          />
        </div>
      )}

      {importError && (
        <div style={{ padding: '6px 12px', fontSize: 12, color: colors.danger, background: colors.dangerLight }}>
          {importError}
        </div>
      )}

      <div style={{ padding: readOnly ? '4px 2px' : '10px 12px', minHeight: readOnly ? 0 : 120 }}>
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .ProseMirror { outline: none; font-size: 13px; line-height: 1.7; color: ${colors.textPrimary}; }
        .ProseMirror p { margin: 4px 0; }
        .ProseMirror h2 { font-size: 17px; font-weight: 700; margin: 14px 0 6px; color: ${colors.textPrimary}; }
        .ProseMirror h3 { font-size: 15px; font-weight: 700; margin: 12px 0 5px; color: ${colors.textPrimary}; }
        .ProseMirror h4 { font-size: 13.5px; font-weight: 700; margin: 10px 0 4px; color: ${colors.textPrimary}; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 22px; margin: 4px 0; }
        .ProseMirror ul ul, .ProseMirror ol ol, .ProseMirror ul ol, .ProseMirror ol ul { margin: 0; }
        .ProseMirror li { margin: 2px 0; }
        .ProseMirror img {
          max-width: 100%;
          border-radius: 6px;
          margin: 8px 0;
          display: block;
        }
        .rte-empty::before {
          content: attr(data-placeholder); float: left; height: 0; pointer-events: none;
          color: ${colors.textTertiary};
        }
      `}</style>
    </div>
  )
}
