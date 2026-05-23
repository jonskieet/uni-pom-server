// ============================================================
// src/pages/pom/TechPomPage.tsx
// Trang POM dành riêng cho Kỹ thuật:
//   - Xem tất cả POM của mình
//   - Nhận biết POM bị trả về (nổi bật)
//   - Chỉnh sửa POM ở trạng thái draft (kể cả bị trả về)
//   - Re-submit lại cho Kinh doanh
// ============================================================
import { useState } from 'react'
import { useAuth } from '../../store/auth'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { usePoms, usePomDetail, useSolutions, useRefData, useProducts } from '../../hooks'
import { PomService, PomItemService } from '../../services'
import {
  Button, PomBadge, BrandBadge, EmptyState, LoadingSpinner,
  Modal, Field, Input, Select, Textarea, Th, Td,
} from '../../components/ui'
import { colors, formatVND, STATUS_POM, SOLUTION_ICONS } from '../../styles/theme'
import type { Pom, PomDetail, PomItem, PomFilters, Product, ProductFilters, Solution } from '../../types'

// ── Main Page ────────────────────────────────────────────────
export default function TechPomPage() {
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()
  const [filters, setFilters] = useState<PomFilters>({ created_by: user?.id })
  const { data: poms, loading, reload } = usePoms(filters)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: detail, loading: loadingDetail, reload: reloadDetail } = usePomDetail(selectedId)
  const [editingPom, setEditingPom] = useState<PomDetail | null>(null)

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Xóa POM "${code}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await withLoading(async () => {
        await PomService.delete(id)
        notify.success(`Xóa POM "${code}" thành công`)
        if (selectedId === id) setSelectedId(null)
        reload()
      }, 'Đang xóa POM...')
    } catch (err: any) {
      notify.error(err.message || 'Xóa thất bại')
    }
  }

  const handleResubmit = async (id: number) => {
    if (!confirm('Gửi lại POM này cho Trưởng phòng KT duyệt?')) return
    try {
      await withLoading(async () => {
        await PomService.updateStatus(id, 'submitted')
        notify.success('Gửi lại POM thành công — Trưởng phòng KT sẽ xem xét')
        reload(); reloadDetail()
      }, 'Đang gửi lại POM...')
    } catch (err: any) {
      notify.error(err.message || 'Gửi lại thất bại')
    }
  }

  // Phân loại POM: nổi bật những cái bị trả về
  const returned  = poms.filter(p => p.status === 'draft' && (p as any).return_reason)
  const others    = poms.filter(p => !(p.status === 'draft' && (p as any).return_reason))

  const counts = {
    returned:  returned.length,
    draft:     poms.filter(p => p.status === 'draft' && !(p as any).return_reason).length,
    submitted: poms.filter(p => p.status === 'submitted').length,
    done:      poms.filter(p => p.status === 'reviewed' || p.status === 'exported').length,
  }

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <StatCard
          label="Cần chỉnh sửa"
          value={counts.returned}
          accent={counts.returned > 0 ? colors.danger : colors.textTertiary}
          icon="ti-arrow-back-up"
          highlight={counts.returned > 0}
        />
        <StatCard label="Nháp"        value={counts.draft}     accent={colors.textSecondary} icon="ti-pencil" />
        <StatCard label="Chờ duyệt"   value={counts.submitted} accent={colors.warning}       icon="ti-clock" />
        <StatCard label="Hoàn thành"  value={counts.done}      accent={colors.success}       icon="ti-circle-check" />
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

        {/* ── Left: danh sách ── */}
        <div style={{
          width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Toolbar */}
          <div style={{ padding: '10px 12px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: colors.textTertiary, pointerEvents: 'none' }} />
              <input
                style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: 13, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, boxSizing: 'border-box' }}
                placeholder="Tìm POM, dự án..."
                value={filters.search ?? ''}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
              />
            </div>
            <select
              style={{ padding: '7px 8px', fontSize: 12, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, cursor: 'pointer' }}
              value={filters.status ?? ''}
              onChange={e => setFilters(f => ({ ...f, status: (e.target.value as any) || undefined }))}>
              <option value="">Tất cả</option>
              {Object.entries(STATUS_POM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <LoadingSpinner /> : poms.length === 0 ? (
              <EmptyState icon="ti-file-off" message="Không có POM nào" />
            ) : (
              <>
                {/* Nhóm bị trả về — luôn ở trên đầu */}
                {returned.length > 0 && (
                  <div>
                    <div style={{
                      padding: '6px 12px 4px', fontSize: 10, fontWeight: 600,
                      color: colors.danger, letterSpacing: '0.07em', textTransform: 'uppercase',
                      background: '#fff5f5', borderBottom: `0.5px solid #fecaca`,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <i className="ti ti-arrow-back-up" style={{ fontSize: 11 }} />
                      Bị trả về — cần chỉnh sửa ({returned.length})
                    </div>
                    {returned.map(pom => (
                      <PomListItem
                        key={pom.id} pom={pom}
                        active={selectedId === pom.id}
                        isReturned
                        onClick={() => setSelectedId(pom.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Nhóm còn lại */}
                {others.length > 0 && (
                  <div>
                    {returned.length > 0 && (
                      <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 600, color: colors.textTertiary, letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: `0.5px solid ${colors.borderLight}` }}>
                        Tất cả POM khác
                      </div>
                    )}
                    {others.map(pom => (
                      <PomListItem
                        key={pom.id} pom={pom}
                        active={selectedId === pom.id}
                        onClick={() => setSelectedId(pom.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right: chi tiết ── */}
        <div style={{
          flex: 1, background: colors.bgPrimary,
          border: `0.5px solid ${colors.border}`,
          borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          {loadingDetail ? <LoadingSpinner /> : !detail ? (
            <EmptyState icon="ti-file-description" message="Chọn một POM để xem chi tiết" />
          ) : (
            <PomDetailPanel
              pom={detail}
              onDelete={() => handleDelete(detail.id, detail.pom_code)}
              onEdit={() => setEditingPom(detail)}
              onResubmit={() => handleResubmit(detail.id)}
            />
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editingPom && (
        <EditPomModal
          pom={editingPom}
          onClose={() => setEditingPom(null)}
          onSaved={() => { setEditingPom(null); reload(); reloadDetail() }}
        />
      )}
      </div>
    </PageTransition>
  )
}

// ── POM List Item ─────────────────────────────────────────────
function PomListItem({ pom, active, isReturned, onClick }: {
  pom: Pom; active: boolean; isReturned?: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', cursor: 'pointer', transition: 'background .1s',
        borderBottom: `0.5px solid ${colors.borderLight}`,
        background: active
          ? (isReturned ? '#fff0f0' : colors.primaryLight)
          : (isReturned ? '#fff5f5' : 'transparent'),
        borderLeft: isReturned ? `3px solid ${colors.danger}` : active ? `3px solid ${colors.primary}` : '3px solid transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = isReturned ? '#fff0f0' : colors.bgSecondary }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = isReturned ? '#fff5f5' : 'transparent' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: isReturned ? colors.danger : colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pom.project_name}
          </div>
          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
            {pom.pom_code}
            {pom.solution_name && ` · ${pom.solution_name}`}
          </div>
        </div>
        <PomBadge status={pom.status} />
      </div>
      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 5, display: 'flex', gap: 10 }}>
        <span><i className="ti ti-box" style={{ fontSize: 11 }} /> {pom.item_count ?? 0} thiết bị</span>
        <span>{new Date(pom.created_at).toLocaleDateString('vi-VN')}</span>
      </div>
      {isReturned && (
        <div style={{ marginTop: 5, fontSize: 11, color: colors.danger, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 11 }} />
          Kinh doanh yêu cầu chỉnh sửa
        </div>
      )}
    </div>
  )
}

// ── Detail Panel ─────────────────────────────────────────────
function PomDetailPanel({ pom, onDelete, onEdit, onResubmit }: {
  pom: PomDetail
  onDelete: () => void
  onEdit: () => void
  onResubmit: () => void
}) {
  const totalAmount = pom.items.reduce((s, i) => s + (i.total_price ?? i.quantity * i.unit_price * (1 + i.vat_rate)), 0)
  const isReturned  = pom.status === 'draft' && !!(pom as any).return_reason
  const canEdit     = pom.status === 'draft'

  return (
    <>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: `0.5px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>{pom.project_name}</div>
            <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 3 }}>
              {pom.pom_code}
              {pom.customer_name && ` · ${pom.customer_name}`}
              {pom.solution_name && ` · ${pom.solution_name}`}
            </div>
          </div>
          <PomBadge status={pom.status} />
        </div>
      </div>

      {/* Cảnh báo bị trả về — nổi bật */}
      {isReturned && (
        <div style={{
          display: 'flex', gap: 12, padding: '12px 20px',
          background: 'linear-gradient(90deg, #fff0f0, #fff5f5)',
          borderBottom: `1px solid #fecaca`, alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-arrow-back-up" style={{ fontSize: 18, color: colors.danger }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.danger, marginBottom: 3 }}>
              Kinh doanh đã trả về POM này — cần chỉnh sửa
            </div>
            <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.5, background: '#fee2e2', borderRadius: 6, padding: '6px 10px' }}>
              <i className="ti ti-quote" style={{ fontSize: 12, marginRight: 4 }} />
              {(pom as any).return_reason}
            </div>
          </div>
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 20px', borderBottom: `0.5px solid ${colors.borderLight}`, fontSize: 12, color: colors.textTertiary, flexWrap: 'wrap', flexShrink: 0 }}>
        <span><i className="ti ti-user" style={{ fontSize: 12 }} /> {pom.created_by_name}</span>
        <span><i className="ti ti-calendar" style={{ fontSize: 12 }} /> {new Date(pom.created_at).toLocaleDateString('vi-VN')}</span>
        <span><i className="ti ti-box" style={{ fontSize: 12 }} /> {pom.items.length} thiết bị</span>
        <span style={{ color: colors.primary, fontWeight: 500 }}>
          <i className="ti ti-coins" style={{ fontSize: 12 }} /> {formatVND(totalAmount)}
        </span>
      </div>

      {/* Note */}
      {pom.note && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 20px', background: '#fffbeb', borderBottom: `0.5px solid #fde68a`, alignItems: 'flex-start', flexShrink: 0 }}>
          <i className="ti ti-notes" style={{ fontSize: 13, color: colors.textTertiary, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>{pom.note}</span>
        </div>
      )}

      {/* Items table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <Th width="4%">#</Th>
              <Th>Thiết bị</Th>
              <Th width="9%" align="center">Hãng</Th>
              <Th width="7%" align="center">ĐVT</Th>
              <Th width="6%" align="center">SL</Th>
              <Th width="14%" align="right">Đơn giá</Th>
              <Th width="15%" align="right">Thành tiền</Th>
            </tr>
          </thead>
          <tbody>
            {pom.items.map((item: any, i: number) => (
              <tr key={item.id} style={{ borderTop: `0.5px solid ${colors.borderLight}` }}>
                <Td style={{ color: colors.textTertiary }}>{i + 1}</Td>
                <Td>
                  <div style={{ fontWeight: 500, color: colors.textPrimary }}>{item.product_name}</div>
                  {item.part_number && <div style={{ fontSize: 10, color: colors.textTertiary, fontFamily: 'monospace' }}>{item.part_number}</div>}
                </Td>
                <Td align="center"><BrandBadge label={item.brand_short} /></Td>
                <Td align="center" style={{ color: colors.textSecondary }}>{item.unit}</Td>
                <Td align="center" style={{ fontWeight: 500 }}>{item.quantity}</Td>
                <Td align="right" style={{ color: colors.textSecondary }}>{formatVND(item.unit_price)}</Td>
                <Td align="right" style={{ fontWeight: 500 }}>
                  {formatVND(item.total_price ?? item.quantity * item.unit_price * (1 + item.vat_rate))}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
              <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
                Tổng cộng (đã VAT):
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: colors.primary, fontSize: 13 }}>
                {formatVND(totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Action bar */}
      <div style={{
        padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0, gap: 8, flexWrap: 'wrap',
        background: isReturned ? '#fff5f5' : colors.bgPrimary,
      }}>
        <Button variant="danger" icon="ti-trash" size="sm" onClick={onDelete}>Xóa</Button>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Xem lại — không chỉnh sửa được khi đang submitted/reviewed/exported */}
          {!canEdit && (
            <span style={{ fontSize: 12, color: colors.textTertiary, alignSelf: 'center' }}>
              <i className="ti ti-lock" style={{ fontSize: 12, marginRight: 4 }} />
              {pom.status === 'submitted' ? 'Đang chờ Trưởng phòng KT duyệt' : 'POM đã được duyệt'}
            </span>
          )}

          {/* Nút chỉnh sửa — chỉ khi draft */}
          {canEdit && (
            <Button
              variant="secondary"
              icon="ti-edit"
              onClick={onEdit}
              style={isReturned ? { borderColor: colors.danger, color: colors.danger, background: '#fff0f0' } : {}}
            >
              {isReturned ? 'Chỉnh sửa theo yêu cầu' : 'Chỉnh sửa POM'}
            </Button>
          )}

          {/* Gửi lại — chỉ khi draft */}
          {canEdit && (
            <Button
              variant="primary"
              icon="ti-send"
              onClick={onResubmit}
            >
              {isReturned ? 'Gửi lại cho Kinh doanh' : 'Submit cho Kinh doanh'}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Edit POM Modal ────────────────────────────────────────────
function EditPomModal({ pom, onClose, onSaved }: {
  pom: PomDetail; onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const { data: solutions } = useSolutions()
  const { brands, categories } = useRefData()

  // Info form
  const [info, setInfo] = useState({
    project_name:  pom.project_name,
    customer_name: pom.customer_name ?? '',
    solution_id:   pom.solution_id ?? '',
    note:          pom.note ?? '',
  })
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({})

  // Items
  const [items, setItems] = useState<PomItem[]>(
    pom.items.map(i => ({ ...i }))
  )
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'items'>('info')

  const setInfoField = (k: string, v: unknown) => setInfo(f => ({ ...f, [k]: v }))

  const addProduct = (product: Product) => {
    setItems(prev => {
      const exists = prev.find(i => i.product_id === product.id)
      if (exists) return prev.map(i =>
        i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      )
      return [...prev, {
        product_id:    product.id,
        product_name:  product.name,
        part_number:   product.part_number,
        brand_short:   product.brand_short,
        category_name: product.category_name,
        unit:          product.unit,
        quantity:      1,
        unit_price:    product.price,
        vat_rate:      product.vat_rate,
        sort_order:    prev.length,
      }]
    })
  }

  const updateItem = (idx: number, field: keyof PomItem, value: unknown) =>
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx))

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price * (1 + i.vat_rate), 0)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!info.project_name.trim()) e.project_name = 'Nhập tên dự án'
    if (items.length === 0) e.items = 'Cần ít nhất 1 thiết bị'
    setInfoErrors(e)
    return !Object.keys(e).length
  }

  const handleSave = async () => {
    if (!validate()) {
      if (infoErrors.project_name) setActiveTab('info')
      else setActiveTab('items')
      return
    }
    setSaving(true)
    await PomService.update(pom.id, {
      project_name:  info.project_name,
      customer_name: info.customer_name || null,
      solution_id:   info.solution_id   || null,
      note:          info.note          || null,
      return_reason: null, // xóa lý do trả về sau khi chỉnh sửa
    })
    await PomItemService.upsert(pom.id, items)
    setSaving(false)
    onSaved()
  }

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: 'none', background: 'none',
    borderBottom: activeTab === tab ? `2px solid ${colors.primary}` : '2px solid transparent',
    color: activeTab === tab ? colors.primary : colors.textSecondary,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: colors.bgPrimary, borderRadius: 12, width: '92%', maxWidth: 780,
        height: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${colors.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>
                Chỉnh sửa POM
              </div>
              <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{pom.pom_code}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: 4 }}>
              <i className="ti ti-x" style={{ fontSize: 18 }} />
            </button>
          </div>

          {/* Hiện lý do trả về nếu có */}
          {(pom as any).return_reason && (
            <div style={{ marginTop: 10, background: '#fff5f5', border: `0.5px solid #fecaca`, borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: 14, color: colors.danger, flexShrink: 0, marginTop: 1 }} />
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.danger }}>Lý do trả về: </span>
                <span style={{ fontSize: 12, color: '#7f1d1d' }}>{(pom as any).return_reason}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `0.5px solid ${colors.border}`, flexShrink: 0, padding: '0 20px' }}>
          <button style={tabStyle('info')} onClick={() => setActiveTab('info')}>
            <i className="ti ti-info-circle" style={{ fontSize: 13, marginRight: 5 }} />
            Thông tin dự án
          </button>
          <button style={tabStyle('items')} onClick={() => setActiveTab('items')}>
            <i className="ti ti-box" style={{ fontSize: 13, marginRight: 5 }} />
            Thiết bị ({items.length})
            {infoErrors.items && <i className="ti ti-alert-circle" style={{ fontSize: 12, color: colors.danger, marginLeft: 5 }} />}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* Tab: Thông tin */}
          {activeTab === 'info' && (
            <div>
              {/* Giải pháp */}
              <Field label="Giải pháp">
                <Select value={info.solution_id} onChange={e => setInfoField('solution_id', e.target.value)}>
                  <option value="">— Không chọn —</option>
                  {solutions.map((s: Solution) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Tên dự án" required error={infoErrors.project_name}>
                  <Input
                    value={info.project_name}
                    error={infoErrors.project_name}
                    placeholder="Mạng LAN Công ty ABC"
                    onChange={e => setInfoField('project_name', e.target.value)}
                  />
                </Field>
                <Field label="Tên khách hàng">
                  <Input
                    value={info.customer_name}
                    placeholder="Công ty TNHH ABC"
                    onChange={e => setInfoField('customer_name', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Ghi chú">
                <Textarea
                  value={info.note}
                  style={{ height: 80 }}
                  placeholder="Ghi chú thêm..."
                  onChange={e => setInfoField('note', e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Tab: Thiết bị */}
          {activeTab === 'items' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: colors.textSecondary }}>
                  {items.length} thiết bị · Tổng <b style={{ color: colors.primary }}>{formatVND(totalAmount)}</b>
                </span>
                <Button variant="primary" size="sm" icon="ti-plus" onClick={() => setShowPicker(true)}>
                  Thêm thiết bị
                </Button>
              </div>

              {infoErrors.items && (
                <div style={{ padding: '8px 12px', background: colors.dangerLight, border: `0.5px solid #fecaca`, borderRadius: 8, fontSize: 12, color: colors.danger }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 12, marginRight: 5 }} />
                  {infoErrors.items}
                </div>
              )}

              {items.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <i className="ti ti-box-off" style={{ fontSize: 36, color: '#d1d5db', display: 'block', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: colors.textTertiary }}>Chưa có thiết bị nào</div>
                  <Button variant="secondary" icon="ti-plus" style={{ marginTop: 12 }} onClick={() => setShowPicker(true)}>
                    Thêm thiết bị đầu tiên
                  </Button>
                </div>
              ) : (
                <div style={{ border: `0.5px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.bgSecondary }}>
                        <Th width="4%">#</Th>
                        <Th>Tên thiết bị</Th>
                        <Th width="9%" align="center">Hãng</Th>
                        <Th width="8%" align="center">SL</Th>
                        <Th width="15%" align="right">Đơn giá</Th>
                        <Th width="7%" align="center">VAT</Th>
                        <Th width="15%" align="right">Thành tiền</Th>
                        <Th width="5%"></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} style={{ borderTop: `0.5px solid ${colors.borderLight}` }}>
                          <Td style={{ color: colors.textTertiary }}>{i + 1}</Td>
                          <Td>
                            <div style={{ fontWeight: 500, color: colors.textPrimary }}>{item.product_name}</div>
                            {item.part_number && (
                              <div style={{ fontSize: 10, color: colors.textTertiary, fontFamily: 'monospace' }}>{item.part_number}</div>
                            )}
                          </Td>
                          <Td align="center"><BrandBadge label={item.brand_short} /></Td>
                          <Td align="center">
                            <input
                              type="number" min={1}
                              value={item.quantity}
                              onChange={e => updateItem(i, 'quantity', Math.max(1, +e.target.value))}
                              style={{ width: 52, padding: '4px 6px', fontSize: 12, borderRadius: 6, border: `0.5px solid ${colors.border}`, textAlign: 'center', background: colors.bgPrimary }}
                            />
                          </Td>
                          <Td align="right">
                            <input
                              type="number" min={0}
                              value={item.unit_price}
                              onChange={e => updateItem(i, 'unit_price', Math.max(0, +e.target.value))}
                              style={{ width: 110, padding: '4px 6px', fontSize: 12, borderRadius: 6, border: `0.5px solid ${colors.border}`, textAlign: 'right', background: colors.bgPrimary }}
                            />
                          </Td>
                          <Td align="center" style={{ color: colors.textSecondary }}>
                            {(item.vat_rate * 100).toFixed(0)}%
                          </Td>
                          <Td align="right" style={{ fontWeight: 500, color: colors.textPrimary }}>
                            {formatVND(item.quantity * item.unit_price * (1 + item.vat_rate))}
                          </Td>
                          <Td>
                            <Button variant="danger" size="sm" icon="ti-trash" onClick={() => removeItem(i)} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
                        <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
                          Tổng cộng (đã VAT):
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: colors.primary, fontSize: 13 }}>
                          {formatVND(totalAmount)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" icon="ti-device-floppy" loading={saving} onClick={handleSave}>
            Lưu thay đổi
          </Button>
        </div>
      </div>

      {/* Product picker */}
      {showPicker && (
        <ProductPickerModal
          onClose={() => setShowPicker(false)}
          onAdd={p => { addProduct(p); setShowPicker(false) }}
        />
      )}
    </div>
  )
}

// ── Product Picker Modal ──────────────────────────────────────
function ProductPickerModal({ onClose, onAdd }: {
  onClose: () => void; onAdd: (p: Product) => void
}) {
  const [filters, setFilters] = useState<ProductFilters>({ status: 'active' })
  const { data: products, loading } = useProducts(filters)
  const { brands, categories } = useRefData()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: colors.bgPrimary, borderRadius: 12, width: '90%', maxWidth: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Chọn thiết bị</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }}><i className="ti ti-x" style={{ fontSize: 18 }} /></button>
        </div>

        <div style={{ padding: '12px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: colors.textTertiary, pointerEvents: 'none' }} />
            <input
              style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: 13, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, boxSizing: 'border-box' }}
              placeholder="Tìm thiết bị, mã part..."
              value={filters.search ?? ''}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
              autoFocus
            />
          </div>
          <select style={{ padding: '7px 8px', fontSize: 12, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, cursor: 'pointer' }}
            value={filters.brand_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Tất cả hãng</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select style={{ padding: '7px 8px', fontSize: 12, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, cursor: 'pointer' }}
            value={filters.category_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, category_id: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {loading ? <LoadingSpinner /> : products.length === 0 ? (
            <EmptyState icon="ti-search-off" message="Không tìm thấy sản phẩm" />
          ) : products.map(p => (
            <div key={p.id}
              onClick={() => onAdd(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `0.5px solid ${colors.borderLight}`, cursor: 'pointer', borderRadius: 6, transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = colors.primaryLight)}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>{p.name}</div>
                <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                  {p.brand_short} · {p.category_name}
                  {p.part_number && <> · <span style={{ fontFamily: 'monospace' }}>{p.part_number}</span></>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: colors.primary }}>{formatVND(p.price)}</div>
                <div style={{ fontSize: 11, color: colors.textTertiary }}>VAT {(p.vat_rate * 100).toFixed(0)}%</div>
              </div>
              <i className="ti ti-plus" style={{ fontSize: 16, color: colors.primary, flexShrink: 0 }} />
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${colors.border}` }}>
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, accent, icon, highlight }: {
  label: string; value: number; accent: string; icon: string; highlight?: boolean
}) {
  return (
    <div style={{
      background: highlight ? '#fff5f5' : colors.bgPrimary,
      border: `0.5px solid ${highlight ? '#fecaca' : colors.border}`,
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: highlight ? '#fee2e2' : colors.bgSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 20, color: accent }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, color: accent, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}
