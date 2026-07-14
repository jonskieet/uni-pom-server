// src/components/DeviceSyncPanel.tsx
// ============================================================
// Bảng "Danh sách thiết bị đề xuất" cho phiếu báo cáo khảo sát.
//
// Thay thế cho việc gõ tay tên/số lượng thiết bị (dễ lệch với POM khi
// kỹ thuật sửa POM sau đó). Nguồn dữ liệu chính (tên, số lượng đề xuất)
// LUÔN đọc live từ PomItem/Product qua SurveyItem.pomItem — phần duy nhất
// lưu ở SurveyItem là số liệu khảo sát thực tế (SL thực tế, vị trí, ghi chú).
//
// Khi POM thay đổi thiết bị sau khi phiếu đã tạo, panel hiện banner cảnh
// báo lệch dữ liệu (so pom.items_updated_at với survey.items_synced_at)
// và cho xem trước diff (thêm/gỡ) trước khi áp dụng — không tự ghi đè để
// không mất số liệu khảo sát thực địa đã nhập.
// ============================================================

import { useState } from 'react'
import { colors, radius } from '../styles/theme'
import { Button, LoadingSpinner, useConfirm, usePrompt, useNotification } from './ui'
import type { SurveyDetail, SurveyItem } from '../types'
import { surveyItemDisplayName, surveyItemProposedQty } from '../types'

const SurveyApi = {
  getSyncDiff: (id: number)               => (window as any).api.survey.getSyncDiff(id),
  sync:        (id: number, payload: any) => (window as any).api.survey.sync(id, payload),
  addItem:     (id: number, data: any)    => (window as any).api.survey.addItem(id, data),
  updateItem:  (itemId: number, data: any)=> (window as any).api.survey.updateItem(itemId, data),
  deleteItem:  (itemId: number)           => (window as any).api.survey.deleteItem(itemId),
}

function needsSync(survey: SurveyDetail): boolean {
  const pomUpdated = survey.pom?.items_updated_at
  if (!pomUpdated) return false
  if (!survey.items_synced_at) return true
  return new Date(pomUpdated).getTime() > new Date(survey.items_synced_at).getTime()
}

// ── Diff preview modal ──────────────────────────────────────────

function SyncDiffModal({ surveyId, onClose, onApplied }: {
  surveyId: number
  onClose: () => void
  onApplied: (survey: SurveyDetail) => void
}) {
  const [loading, setLoading]   = useState(true)
  const [applying, setApplying] = useState(false)
  const [diff, setDiff]         = useState<any>(null)
  const [addSel, setAddSel]     = useState<Set<number>>(new Set())
  const [removeSel, setRemoveSel] = useState<Set<number>>(new Set())
  const notify = useNotification()

  useState(() => {
    SurveyApi.getSyncDiff(surveyId).then((res: any) => {
      if (res?.error) { notify.error(res.error); onClose(); return }
      setDiff(res)
      setAddSel(new Set((res?.added ?? []).map((a: any) => a.product_id)))
      setRemoveSel(new Set((res?.removed ?? []).map((r: any) => r.survey_item_id)))
      setLoading(false)
    })
  })

  async function apply() {
    setApplying(true)
    try {
      const res = await SurveyApi.sync(surveyId, {
        accept_all: false,
        add_product_ids: Array.from(addSel),
        remove_survey_item_ids: Array.from(removeSel),
      })
      if (res?.error) { notify.error(res.error); return }
      notify.success('Đã đồng bộ thiết bị từ POM')
      onApplied(res)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: colors.bgPrimary, borderRadius: radius.lg, padding: 20,
        width: 560, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          <i className="ti ti-refresh" style={{ marginRight: 6, color: colors.primary }} />
          Đồng bộ thiết bị từ POM
        </div>
        <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 14px' }}>
          POM đã thay đổi danh sách thiết bị. Chọn các thay đổi muốn áp dụng vào phiếu khảo sát này.
        </p>

        {loading ? <LoadingSpinner label="Đang tính toán chênh lệch..." /> : (
          <>
            {diff?.added?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.success, marginBottom: 6 }}>
                  + Thiết bị mới trong POM ({diff.added.length})
                </div>
                {diff.added.map((a: any) => (
                  <label key={a.product_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    background: colors.successLight, borderRadius: radius.sm, marginBottom: 4, fontSize: 13,
                  }}>
                    <input type="checkbox" checked={addSel.has(a.product_id)}
                      onChange={e => setAddSel(s => {
                        const n = new Set(s)
                        e.target.checked ? n.add(a.product_id) : n.delete(a.product_id)
                        return n
                      })} />
                    <span style={{ flex: 1 }}>{a.product_name}</span>
                    <span style={{ color: colors.textSecondary }}>SL: {a.quantity}</span>
                  </label>
                ))}
              </div>
            )}

            {diff?.removed?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.danger, marginBottom: 6 }}>
                  − Thiết bị đã bị gỡ khỏi POM ({diff.removed.length})
                </div>
                {diff.removed.map((r: any) => (
                  <label key={r.survey_item_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    background: colors.dangerLight, borderRadius: radius.sm, marginBottom: 4, fontSize: 13,
                  }}>
                    <input type="checkbox" checked={removeSel.has(r.survey_item_id)}
                      onChange={e => setRemoveSel(s => {
                        const n = new Set(s)
                        e.target.checked ? n.add(r.survey_item_id) : n.delete(r.survey_item_id)
                        return n
                      })} />
                    <span style={{ flex: 1 }}>Thiết bị #{r.product_id}</span>
                    <span style={{ fontSize: 11, color: colors.textTertiary }}>Giữ lại số liệu khảo sát nếu bỏ chọn</span>
                  </label>
                ))}
              </div>
            )}

            {!diff?.has_changes && (
              <p style={{ fontSize: 13, color: colors.textSecondary }}>Không có thay đổi nào cần đồng bộ.</p>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          {diff?.has_changes && (
            <Button variant="primary" icon="ti-check" disabled={applying} onClick={apply}>
              {applying ? 'Đang áp dụng...' : 'Áp dụng đồng bộ'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────

export function DeviceSyncPanel({ survey, onSurveyUpdate, readOnly }: {
  survey: SurveyDetail
  onSurveyUpdate: (survey: SurveyDetail) => void
  readOnly?: boolean
}) {
  const [showDiff, setShowDiff] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const { confirm, ConfirmNode } = useConfirm()
  const { prompt, PromptNode }   = usePrompt()
  const notify  = useNotification()

  const items = (survey.items ?? []).filter(i => !i.is_removed_from_pom)
  const stale = needsSync(survey)

  async function saveField(item: SurveyItem, patch: Partial<SurveyItem>) {
    if (!item.id) return
    setSavingId(item.id)
    try {
      const res = await SurveyApi.updateItem(item.id, patch)
      if (res?.error) { notify.error(res.error); return }
      onSurveyUpdate({
        ...survey,
        items: (survey.items ?? []).map(i => i.id === item.id ? { ...i, ...patch } : i),
      })
    } finally {
      setSavingId(null)
    }
  }

  async function removeItem(item: SurveyItem) {
    if (!item.id) return
    const ok = await confirm({
      title: 'Xoá thiết bị khỏi phiếu?',
      message: item.pom_item_id
        ? 'Thiết bị này lấy từ POM — nếu vẫn còn trong POM, lần đồng bộ sau có thể được thêm lại.'
        : 'Thiết bị thêm tay sẽ bị xoá vĩnh viễn khỏi phiếu.',
    })
    if (!ok) return
    const res = await SurveyApi.deleteItem(item.id)
    if (res?.error) { notify.error(res.error); return }
    onSurveyUpdate({ ...survey, items: (survey.items ?? []).filter(i => i.id !== item.id) })
  }

  async function addManualDevice() {
    const name = await prompt({ title: 'Thêm thiết bị ngoài POM', placeholder: 'VD: Ổ cắm mạng dự phòng' })
    if (name === null || !name.trim()) return
    const res = await SurveyApi.addItem(survey.id, { product_name: name, quantity_actual: 1, unit: 'Cái' })
    if (res?.error) { notify.error(res.error); return }
    onSurveyUpdate({ ...survey, items: [...(survey.items ?? []), res] })
  }

  return (
    <>
    <div>
      {stale && !readOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
          padding: '10px 14px', background: colors.warningLight, borderRadius: radius.md,
          border: `1px solid #fde68a`, fontSize: 13,
        }}>
          <i className="ti ti-alert-triangle" style={{ color: colors.warning, fontSize: 16 }} />
          <span style={{ flex: 1, color: colors.warning }}>
            Danh sách thiết bị trong POM đã thay đổi kể từ lần khảo sát gần nhất.
          </span>
          <Button variant="secondary" icon="ti-refresh" onClick={() => setShowDiff(true)}>
            Xem &amp; đồng bộ
          </Button>
        </div>
      )}

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: colors.bgSecondary }}>
              <th style={th}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Tên thiết bị</th>
              <th style={th}>SL đề xuất</th>
              <th style={th}>SL thực tế</th>
              <th style={{ ...th, textAlign: 'left' }}>Vị trí lắp đặt</th>
              <th style={{ ...th, textAlign: 'left' }}>Ghi chú</th>
              {!readOnly && <th style={th}></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: colors.textTertiary }}>
                Chưa có thiết bị nào
              </td></tr>
            ) : items.map((item, idx) => {
              const proposedQty = surveyItemProposedQty(item)
              return (
                <tr key={item.id} style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                  <td style={td}>{idx + 1}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                    {surveyItemDisplayName(item)}
                    {!item.pom_item_id && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 9999,
                        background: colors.infoLight, color: colors.info,
                      }}>Ngoài POM</span>
                    )}
                  </td>
                  <td style={td}>{proposedQty ?? '—'}</td>
                  <td style={td}>
                    {readOnly ? item.quantity_actual : (
                      <input type="number" defaultValue={item.quantity_actual}
                        disabled={savingId === item.id}
                        onBlur={e => {
                          const v = Number(e.target.value) || 0
                          if (v !== item.quantity_actual) saveField(item, { quantity_actual: v })
                        }}
                        style={inputSm} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    {readOnly ? (item.location || '—') : (
                      <input defaultValue={item.location ?? ''} disabled={savingId === item.id}
                        onBlur={e => {
                          if (e.target.value !== (item.location ?? '')) saveField(item, { location: e.target.value })
                        }}
                        style={{ ...inputSm, width: '100%' }} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    {readOnly ? (item.condition_note || '—') : (
                      <input defaultValue={item.condition_note ?? ''} disabled={savingId === item.id}
                        onBlur={e => {
                          if (e.target.value !== (item.condition_note ?? '')) saveField(item, { condition_note: e.target.value })
                        }}
                        style={{ ...inputSm, width: '100%' }} />
                    )}
                  </td>
                  {!readOnly && (
                    <td style={td}>
                      <button onClick={() => removeItem(item)} title="Xoá"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}>
                        <i className="ti ti-trash" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <Button variant="secondary" icon="ti-plus" onClick={addManualDevice} style={{ marginTop: 10 }}>
          Thêm thiết bị ngoài POM
        </Button>
      )}

      <p style={{ fontSize: 11, color: colors.textTertiary, marginTop: 8 }}>
        Tên &amp; số lượng đề xuất lấy trực tiếp từ POM — muốn sửa, hãy chỉnh trong POM rồi bấm "Đồng bộ".
        Chỉ số lượng thực tế / vị trí / ghi chú là dữ liệu riêng của phiếu khảo sát.
      </p>

      {showDiff && (
        <SyncDiffModal
          surveyId={survey.id}
          onClose={() => setShowDiff(false)}
          onApplied={onSurveyUpdate}
        />
      )}
    </div>
    {ConfirmNode}
    {PromptNode}
    </>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: colors.textSecondary, fontSize: 12 }
const td: React.CSSProperties = { padding: '6px 10px', textAlign: 'center', color: colors.textPrimary }
const inputSm: React.CSSProperties = {
  border: `1px solid ${colors.border}`, borderRadius: 6, padding: '4px 6px', fontSize: 13, width: 70,
}
