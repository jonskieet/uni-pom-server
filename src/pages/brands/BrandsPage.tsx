// ============================================================
// src/pages/brands/BrandsPage.tsx — Quản lý nhà sản xuất
// Roles: admin, sales
// ============================================================
import { useState } from 'react'
import { useBrands } from '../../hooks'
import { useNotification, useConfirm } from '../../components/ui'
import { BrandService } from '../../services'
import { PageTransition } from '../../components/PageTransition'
import {
  Button, BrandBadge, StatCard, EmptyState, LoadingSpinner,
  Modal, Field, Input, Textarea,
  Th, Td,
} from '../../components/ui'
import { colors, formatVND } from '../../styles/theme'
import type { Brand } from '../../types'

// ── Helpers ──────────────────────────────────────────────────

const COUNTRIES = [
  'Việt Nam', 'Mỹ', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc',
  'Đức', 'Anh', 'Pháp', 'Đài Loan', 'Singapore', 'Khác',
]

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      background: active ? '#EAF3DE' : '#F1EFE8',
      color:      active ? '#3B6D11' : '#444441',
      fontSize: 11, padding: '3px 8px',
      borderRadius: 9999, whiteSpace: 'nowrap',
    }}>
      {active ? 'Đang hoạt động' : 'Ngừng hoạt động'}
    </span>
  )
}

// ── Edit/Create Modal ─────────────────────────────────────────

interface BrandForm {
  name:       string
  short_name: string
  country:    string
  website:    string
  is_active:  boolean
}

const EMPTY_FORM: BrandForm = {
  name: '', short_name: '', country: '', website: '', is_active: true,
}

function BrandModal({
  target, onClose, onSaved,
}: {
  target: Brand | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = target === 'new'
  const notify = useNotification()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BrandForm>(
    isNew ? EMPTY_FORM : {
      name:       (target as Brand).name,
      short_name: (target as Brand).short_name ?? '',
      country:    (target as Brand).country    ?? '',
      website:    (target as Brand).website    ?? '',
      is_active:  !!(target as Brand).is_active,
    }
  )

  const set = (k: keyof BrandForm, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { notify.error('Vui lòng nhập tên nhà sản xuất'); return }
    setSaving(true)
    try {
      const payload = {
        name:       form.name.trim(),
        short_name: form.short_name.trim() || null,
        country:    form.country || null,
        website:    form.website.trim() || null,
        is_active:  form.is_active,
      }
      if (isNew) {
        await BrandService.create(payload)
        notify.success(`Thêm nhà sản xuất "${form.name}" thành công`)
      } else {
        await BrandService.update((target as Brand).id, payload)
        notify.success(`Cập nhật "${form.name}" thành công`)
      }
      onSaved()
      onClose()
    } catch (err: any) {
      notify.error(err.message || 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    borderRadius: 8, border: `0.5px solid #d1d5db`,
    background: colors.bgPrimary, color: colors.textPrimary,
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <Modal
      title={isNew ? 'Thêm nhà sản xuất' : `Sửa: ${(target as Brand).name}`}
      width={480}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" icon="ti-device-floppy" loading={saving} onClick={handleSave}>
            {isNew ? 'Thêm mới' : 'Lưu thay đổi'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tên + short name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Tên nhà sản xuất *">
            <input style={inputStyle} placeholder="Cisco, Hikvision..."
              value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Tên viết tắt">
            <input style={inputStyle} placeholder="CSC, HKV..."
              value={form.short_name} onChange={e => set('short_name', e.target.value)} />
          </Field>
        </div>

        {/* Quốc gia */}
        <Field label="Quốc gia">
          <select style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.country} onChange={e => set('country', e.target.value)}>
            <option value="">-- Chọn quốc gia --</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {/* Website */}
        <Field label="Website">
          <input style={inputStyle} placeholder="https://..."
            value={form.website} onChange={e => set('website', e.target.value)} />
        </Field>

        {/* Trạng thái */}
        <Field label="Trạng thái">
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {[
              { val: true,  label: 'Đang hoạt động' },
              { val: false, label: 'Ngừng hoạt động' },
            ].map(opt => (
              <label key={String(opt.val)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" checked={form.is_active === opt.val}
                  onChange={() => set('is_active', opt.val)} />
                {opt.label}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

// ── Detail Modal ──────────────────────────────────────────────

function BrandDetailModal({ brand, onClose, onEdit }: {
  brand: Brand; onClose: () => void; onEdit: () => void
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Tên đầy đủ',   value: brand.name },
    { label: 'Tên viết tắt', value: brand.short_name ?? '—' },
    { label: 'Quốc gia',     value: brand.country ?? '—' },
    {
      label: 'Website', value: brand.website
        ? <a href={brand.website} target="_blank" rel="noreferrer"
            style={{ color: colors.secondary }}>{brand.website}</a>
        : '—'
    },
    { label: 'Trạng thái',   value: <ActiveBadge active={!!brand.is_active} /> },
    { label: 'Ngày tạo',     value: new Date(brand.created_at).toLocaleDateString('vi-VN') },
  ]

  return (
    <Modal title="Chi tiết nhà sản xuất" width={420} onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          <Button variant="primary" icon="ti-edit" onClick={onEdit}>Chỉnh sửa</Button>
        </div>
      }
    >
      {/* Logo placeholder */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 72, borderRadius: 12, background: colors.primaryLight,
        margin: '0 auto 16px', fontSize: 28,
      }}>
        <i className="ti ti-building-factory" style={{ color: colors.primary }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(r => (
          <div key={r.label} style={{
            display: 'grid', gridTemplateColumns: '130px 1fr',
            padding: '8px 0', borderBottom: `0.5px solid ${colors.borderLight}`,
            fontSize: 13,
          }}>
            <span style={{ color: colors.textTertiary }}>{r.label}</span>
            <span style={{ color: colors.textPrimary, fontWeight: 400 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function BrandsPage() {
  const { data: brands, loading, reload } = useBrands()
  const notify = useNotification()
  const { confirm, ConfirmNode } = useConfirm()
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [editTarget,   setEditTarget]   = useState<Brand | 'new' | null>(null)
  const [detailTarget, setDetailTarget] = useState<Brand | null>(null)

  const filtered = brands.filter(b => {
    const matchSearch = !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.short_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (b.country    ?? '').toLowerCase().includes(search.toLowerCase())
    const matchActive =
      filterActive === 'all'      ? true :
      filterActive === 'active'   ? !!b.is_active :
      /* inactive */                !b.is_active
    return matchSearch && matchActive
  })

  const activeCount   = brands.filter(b =>  b.is_active).length
  const inactiveCount = brands.filter(b => !b.is_active).length
  const countrySet    = new Set(brands.map(b => b.country).filter(Boolean))

  const handleDelete = async (b: Brand) => {
    const ok = await confirm({
      title:        `Xoá "${b.name}"?`,
      message:      'Thao tác này sẽ thất bại nếu hãng còn sản phẩm đang liên kết.',
      variant:      'danger',
      confirmLabel: 'Xoá hãng',
    })
    if (!ok) return
    try {
      await BrandService.delete(b.id)
      notify.success(`Đã xoá "${b.name}"`)
      reload()
    } catch (err: any) {
      notify.error(err.message || 'Không thể xoá — hãng còn sản phẩm liên kết')
    }
  }

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Tổng nhà sản xuất" value={brands.length}  sub="đã đăng ký"          />
          <StatCard label="Đang hoạt động"    value={activeCount}    accent={colors.success}    />
          <StatCard label="Ngừng hoạt động"   value={inactiveCount}  accent={colors.warning}    />
          <StatCard label="Quốc gia"          value={countrySet.size} sub="quốc gia khác nhau"  />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <i className="ti ti-search" style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', fontSize: 14,
              color: colors.textTertiary, pointerEvents: 'none',
            }} />
            <input
              style={{
                width: '100%', padding: '7px 12px 7px 32px', fontSize: 13,
                borderRadius: 8, border: `0.5px solid ${colors.border}`,
                background: colors.bgSecondary, color: colors.textPrimary,
                boxSizing: 'border-box', outline: 'none',
              }}
              placeholder="Tìm theo tên, viết tắt, quốc gia..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filter chips */}
          {(['all', 'active', 'inactive'] as const).map(v => (
            <button key={v}
              onClick={() => setFilterActive(v)}
              style={{
                padding: '6px 14px', fontSize: 12, borderRadius: 9999,
                border: `0.5px solid ${filterActive === v ? colors.primary : colors.border}`,
                background: filterActive === v ? colors.primaryLight : colors.bgPrimary,
                color: filterActive === v ? colors.primary : colors.textSecondary,
                cursor: 'pointer', fontWeight: filterActive === v ? 500 : 400,
              }}>
              {{ all: 'Tất cả', active: 'Hoạt động', inactive: 'Ngừng' }[v]}
            </button>
          ))}

          <Button variant="primary" icon="ti-plus" onClick={() => setEditTarget('new')}>
            Thêm hãng
          </Button>
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', border: `0.5px solid ${colors.border}`,
          borderRadius: 12, overflow: 'hidden', flex: 1,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${colors.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
              {loading ? 'Đang tải...' : `${filtered.length} nhà sản xuất`}
            </span>
          </div>

          {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
            <EmptyState
              icon="ti-building-factory-off"
              message="Không tìm thấy nhà sản xuất nào"
              subMessage={search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Nhấn "+ Thêm hãng" để bắt đầu'}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <Th width="4%">#</Th>
                  <Th width="28%">Tên nhà sản xuất</Th>
                  <Th width="12%">Viết tắt</Th>
                  <Th width="16%">Quốc gia</Th>
                  <Th width="24%">Website</Th>
                  <Th width="10%" align="center">Trạng thái</Th>
                  <Th width="6%"></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id}
                    style={{ borderTop: `0.5px solid ${colors.borderLight}`, transition: 'background .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <Td style={{ color: colors.textTertiary, fontSize: 12 }}>{i + 1}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: colors.primaryLight,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <i className="ti ti-building-factory"
                            style={{ fontSize: 14, color: colors.primary }} />
                        </div>
                        <span style={{ fontWeight: 500, color: colors.textPrimary }}>{b.name}</span>
                      </div>
                    </Td>
                    <Td>
                      {b.short_name
                        ? <BrandBadge label={b.short_name} />
                        : <span style={{ color: colors.textTertiary }}>—</span>}
                    </Td>
                    <Td style={{ fontSize: 12, color: colors.textSecondary }}>
                      {b.country
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="ti ti-map-pin" style={{ fontSize: 12 }} />
                            {b.country}
                          </span>
                        : '—'}
                    </Td>
                    <Td style={{ fontSize: 12 }}>
                      {b.website
                        ? <a href={b.website} target="_blank" rel="noreferrer"
                            style={{ color: colors.secondary, textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-external-link" style={{ fontSize: 12 }} />
                              {b.website.replace(/^https?:\/\//, '')}
                            </span>
                          </a>
                        : <span style={{ color: colors.textTertiary }}>—</span>}
                    </Td>
                    <Td align="center"><ActiveBadge active={!!b.is_active} /></Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" icon="ti-eye"
                          onClick={() => setDetailTarget(b)} />
                        <Button variant="ghost" size="sm" icon="ti-edit"
                          onClick={() => setEditTarget(b)} />
                        <Button variant="danger" size="sm" icon="ti-trash"
                          onClick={() => handleDelete(b)} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {editTarget && (
        <BrandModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={reload}
        />
      )}
      {detailTarget && (
        <BrandDetailModal
          brand={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null) }}
        />
      )}
      {ConfirmNode}
    </PageTransition>
  )
}
