// ============================================================
// src/pages/pricing/PricingPage.tsx — Bảng giá sản phẩm
// Cập nhật giá, VAT, xem lịch sử thay đổi giá
// Roles: admin, sales
// ============================================================
import { useState, useMemo } from 'react'
import { useProducts, useRefData } from '../../hooks'
import { useNotification } from '../../components/ui'
import { ProductService } from '../../services'
import { PageTransition } from '../../components/PageTransition'
import {
  Button, BrandBadge, ProductBadge, StatCard, EmptyState,
  LoadingSpinner, Modal, Field,
  Th, Td,
} from '../../components/ui'
import { colors, formatVND } from '../../styles/theme'
import type { Product, PriceHistory, ProductFilters } from '../../types'

// ── VAT options ───────────────────────────────────────────────
const VAT_OPTIONS = [
  { label: '0%',  value: 0    },
  { label: '5%',  value: 0.05 },
  { label: '8%',  value: 0.08 },
  { label: '10%', value: 0.10 },
]

// ── Price change badge ────────────────────────────────────────
function PriceDiff({ old_price, new_price }: { old_price: number; new_price: number }) {
  const diff = new_price - old_price
  const pct  = old_price > 0 ? (diff / old_price) * 100 : 0
  if (diff === 0) return <span style={{ color: colors.textTertiary, fontSize: 11 }}>—</span>
  const up = diff > 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 500,
      color:      up ? colors.danger  : colors.success,
      background: up ? '#fff5f5'      : colors.successLight,
      padding: '2px 7px', borderRadius: 9999,
    }}>
      <i className={`ti ${up ? 'ti-arrow-up' : 'ti-arrow-down'}`} style={{ fontSize: 10, marginRight: 2 }} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Edit Price Modal ──────────────────────────────────────────

function EditPriceModal({ product, onClose, onSaved }: {
  product: Product; onClose: () => void; onSaved: () => void
}) {
  const notify = useNotification()
  const [saving,    setSaving]    = useState(false)
  const [priceStr,  setPriceStr]  = useState(String(product.price))
  const [vatRate,   setVatRate]   = useState(product.vat_rate)
  const [note,      setNote]      = useState('')

  const newPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0
  const changed  = newPrice !== product.price || vatRate !== product.vat_rate

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8,
    border: `0.5px solid #d1d5db`, background: colors.bgPrimary,
    color: colors.textPrimary, boxSizing: 'border-box', outline: 'none',
  }

  const handleSave = async () => {
    if (newPrice < 0) { notify.error('Giá không hợp lệ'); return }
    if (!changed)     { notify.error('Không có thay đổi'); return }
    setSaving(true)
    try {
      await ProductService.update(product.id, {
        price:    newPrice,
        vat_rate: vatRate,
        _price_note: note.trim() || undefined,
      })
      notify.success(`Đã cập nhật giá "${product.name}"`)
      onSaved(); onClose()
    } catch (err: any) {
      notify.error(err.message || 'Cập nhật thất bại')
    } finally {
      setSaving(false)
    }
  }

  // Preview total
  const previewTotal = newPrice * (1 + vatRate)

  return (
    <Modal
      title="Cập nhật giá sản phẩm"
      width={480}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" icon="ti-device-floppy" loading={saving}
            disabled={!changed} onClick={handleSave}>
            Lưu giá mới
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Product info card */}
        <div style={{
          background: colors.bgSecondary, borderRadius: 10,
          padding: 12, display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: colors.primaryLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="ti ti-box" style={{ fontSize: 20, color: colors.primary }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
              {product.name}
            </div>
            <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
              {product.brand_name}
              {product.part_number && ` · ${product.part_number}`}
            </div>
          </div>
        </div>

        {/* Giá hiện tại vs mới */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>
              Giá hiện tại
            </div>
            <div style={{
              fontSize: 16, fontWeight: 600, color: colors.textSecondary,
              padding: '8px 12px', background: colors.bgSecondary, borderRadius: 8,
            }}>
              {formatVND(product.price)}
            </div>
          </div>
          <Field label="Giá mới *">
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="1000"
              placeholder="0"
              value={priceStr}
              onChange={e => setPriceStr(e.target.value)}
            />
          </Field>
        </div>

        {/* VAT */}
        <Field label="Thuế VAT">
          <div style={{ display: 'flex', gap: 8 }}>
            {VAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setVatRate(opt.value)}
                style={{
                  flex: 1, padding: '7px 4px', fontSize: 13, borderRadius: 8,
                  border: `1.5px solid ${vatRate === opt.value ? colors.primary : colors.border}`,
                  background: vatRate === opt.value ? colors.primaryLight : colors.bgPrimary,
                  color:      vatRate === opt.value ? colors.primary      : colors.textSecondary,
                  cursor: 'pointer', fontWeight: vatRate === opt.value ? 600 : 400,
                  transition: 'all .1s',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Preview */}
        {newPrice > 0 && (
          <div style={{
            background: colors.infoLight, borderRadius: 10, padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: colors.info }}>
              Giá bao gồm VAT ({(vatRate * 100).toFixed(0)}%)
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.info }}>
              {formatVND(previewTotal)}
            </span>
          </div>
        )}

        {/* Ghi chú lý do */}
        <Field label="Ghi chú thay đổi giá">
          <textarea
            style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }}
            placeholder="Lý do thay đổi giá (tuỳ chọn)..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ── Price History Modal ───────────────────────────────────────

function PriceHistoryModal({ product, onClose }: {
  product: Product; onClose: () => void
}) {
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [loading, setLoading] = useState(true)

  // Load on mount
  useState(() => {
    ProductService.getPriceHistory(product.id)
      .then((r: any) => {
        const arr = Array.isArray(r) ? r : (r?.data ?? [])
        setHistory(arr)
      })
      .finally(() => setLoading(false))
  })

  return (
    <Modal title={`Lịch sử giá — ${product.name}`} width={560} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {loading ? (
        <LoadingSpinner />
      ) : history.length === 0 ? (
        <EmptyState icon="ti-history-off" message="Chưa có lịch sử thay đổi giá" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Current price pill */}
          <div style={{
            background: colors.successLight, borderRadius: 8, padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: colors.success }}>Giá hiện tại</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: colors.success }}>
              {formatVND(product.price)}
            </span>
          </div>

          {/* Timeline */}
          {history.map((h, i) => (
            <div key={h.id} style={{
              display: 'grid',
              gridTemplateColumns: '16px 1fr',
              gap: '0 12px',
              paddingBottom: 12,
            }}>
              {/* Dot + line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                  background: i === 0 ? colors.primary : colors.border,
                  border: `2px solid ${i === 0 ? colors.primary : colors.border}`,
                }} />
                {i < history.length - 1 && (
                  <div style={{ flex: 1, width: 1, background: colors.borderLight, marginTop: 3 }} />
                )}
              </div>
              {/* Content */}
              <div style={{
                background: colors.bgSecondary, borderRadius: 8,
                padding: '8px 12px', marginBottom: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: colors.textSecondary, textDecoration: 'line-through' }}>
                      {formatVND(h.old_price)}
                    </span>
                    <i className="ti ti-arrow-right" style={{ fontSize: 12, color: colors.textTertiary }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                      {formatVND(h.new_price)}
                    </span>
                    <PriceDiff old_price={h.old_price} new_price={h.new_price} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4, display: 'flex', gap: 8 }}>
                  <span>
                    <i className="ti ti-calendar" style={{ marginRight: 3 }} />
                    {new Date(h.changed_at).toLocaleString('vi-VN')}
                  </span>
                  {h.changed_by_name && (
                    <span>
                      <i className="ti ti-user" style={{ marginRight: 3 }} />
                      {h.changed_by_name}
                    </span>
                  )}
                </div>
                {h.note && (
                  <div style={{
                    fontSize: 11, color: colors.textSecondary,
                    marginTop: 4, fontStyle: 'italic',
                  }}>
                    "{h.note}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function PricingPage() {
  const [filters,  setFilters]  = useState<ProductFilters>({})
  const { data: products, loading, reload } = useProducts(filters)
  const { brands, categories }  = useRefData()
  const notify = useNotification()

  const [editTarget,    setEditTarget]    = useState<Product | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Product | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'price_asc' | 'price_desc'>('name')

  // Stats
  const totalValue = products.reduce((s, p) => s + p.price, 0)
  const avgPrice   = products.length ? totalValue / products.length : 0
  const maxPrice   = products.length ? Math.max(...products.map(p => p.price)) : 0
  const withVat10  = products.filter(p => p.vat_rate === 0.10).length

  // Sorted products
  const sorted = useMemo(() => {
    const arr = [...products]
    if (sortBy === 'price_asc')  arr.sort((a, b) => a.price - b.price)
    if (sortBy === 'price_desc') arr.sort((a, b) => b.price - a.price)
    if (sortBy === 'name')       arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return arr
  }, [products, sortBy])

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Tổng sản phẩm"  value={products.length}  sub="trong bảng giá"      />
          <StatCard label="Giá trung bình" value={formatVND(avgPrice)} sub="chưa VAT" accent={colors.info} />
          <StatCard label="Giá cao nhất"   value={formatVND(maxPrice)} sub="chưa VAT" accent={colors.warning} />
          <StatCard label="VAT 10%"        value={withVat10}           sub={`/ ${products.length} sản phẩm`} />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
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
              placeholder="Tên sản phẩm, part number..."
              value={filters.search ?? ''}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
            />
          </div>

          {/* Brand filter */}
          <select
            style={{
              padding: '7px 10px', fontSize: 13, borderRadius: 8,
              border: `0.5px solid ${colors.border}`, background: colors.bgPrimary,
              color: colors.textPrimary, cursor: 'pointer',
            }}
            value={filters.brand_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Tất cả hãng</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {/* Category filter */}
          <select
            style={{
              padding: '7px 10px', fontSize: 13, borderRadius: 8,
              border: `0.5px solid ${colors.border}`, background: colors.bgPrimary,
              color: colors.textPrimary, cursor: 'pointer',
            }}
            value={filters.category_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, category_id: e.target.value ? +e.target.value : undefined }))}>
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Sort */}
          <select
            style={{
              padding: '7px 10px', fontSize: 13, borderRadius: 8,
              border: `0.5px solid ${colors.border}`, background: colors.bgPrimary,
              color: colors.textPrimary, cursor: 'pointer',
            }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="name">Sắp xếp: Tên A→Z</option>
            <option value="price_asc">Sắp xếp: Giá tăng dần</option>
            <option value="price_desc">Sắp xếp: Giá giảm dần</option>
          </select>
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', border: `0.5px solid ${colors.border}`,
          borderRadius: 12, overflow: 'hidden', flex: 1,
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: `0.5px solid ${colors.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
              {loading ? 'Đang tải...' : `${sorted.length} sản phẩm`}
            </span>
            <span style={{ fontSize: 11, color: colors.textTertiary }}>
              <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
              Nhấn vào biểu tượng bút chì để cập nhật giá
            </span>
          </div>

          {loading ? <LoadingSpinner /> : sorted.length === 0 ? (
            <EmptyState icon="ti-tag-off" message="Không tìm thấy sản phẩm" subMessage="Thử thay đổi bộ lọc" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <Th width="4%">#</Th>
                  <Th width="28%">Tên sản phẩm</Th>
                  <Th width="10%">Hãng</Th>
                  <Th width="14%">Danh mục</Th>
                  <Th width="10%">Mã part</Th>
                  <Th width="7%" align="center">ĐVT</Th>
                  <Th width="14%" align="right">Đơn giá (chưa VAT)</Th>
                  <Th width="6%"  align="center">VAT</Th>
                  <Th width="14%" align="right">Giá + VAT</Th>
                  <Th width="9%"  align="center">Trạng thái</Th>
                  <Th width="4%"></Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const priceWithVat = p.price * (1 + p.vat_rate)
                  return (
                    <tr key={p.id}
                      style={{ borderTop: `0.5px solid ${colors.borderLight}`, transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <Td style={{ color: colors.textTertiary, fontSize: 12 }}>{i + 1}</Td>
                      <Td>
                        <div style={{ fontWeight: 500, color: colors.textPrimary }}>{p.name}</div>
                        {p.description && (
                          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                            {p.description.slice(0, 50)}{p.description.length > 50 ? '…' : ''}
                          </div>
                        )}
                      </Td>
                      <Td><BrandBadge label={p.brand_short ?? p.brand_name} /></Td>
                      <Td style={{ fontSize: 12, color: colors.textSecondary }}>{p.category_name}</Td>
                      <Td style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' }}>
                        {p.part_number ?? '—'}
                      </Td>
                      <Td align="center" style={{ fontSize: 12, color: colors.textSecondary }}>
                        {p.unit}
                      </Td>
                      <Td align="right">
                        <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                          {formatVND(p.price)}
                        </span>
                      </Td>
                      <Td align="center">
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 9999,
                          background: p.vat_rate > 0 ? colors.warningLight : colors.bgTertiary,
                          color:      p.vat_rate > 0 ? colors.warning      : colors.textTertiary,
                        }}>
                          {(p.vat_rate * 100).toFixed(0)}%
                        </span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontSize: 13, color: colors.secondary, fontWeight: 500 }}>
                          {formatVND(priceWithVat)}
                        </span>
                      </Td>
                      <Td align="center"><ProductBadge status={p.status} /></Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <Button
                            variant="ghost" size="sm" icon="ti-history"
                            title="Lịch sử giá"
                            onClick={() => setHistoryTarget(p)}
                          />
                          <Button
                            variant="ghost" size="sm" icon="ti-pencil"
                            title="Cập nhật giá"
                            onClick={() => setEditTarget(p)}
                          />
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {editTarget && (
        <EditPriceModal
          product={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={reload}
        />
      )}
      {historyTarget && (
        <PriceHistoryModal
          product={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </PageTransition>
  )
}
