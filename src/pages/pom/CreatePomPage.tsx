// ============================================================
// src/pages/pom/CreatePomPage.tsx
// ============================================================
import { useState } from 'react'
import { useSolutions, useRefData, useProducts } from '../../hooks'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { PomService, PomItemService } from '../../services'
import { useAuth } from '../../store/auth'
import {
  Button, BrandBadge, EmptyState, LoadingSpinner,
  Modal, Field, Input, Select, Textarea, Th, Td,
} from '../../components/ui'
import { colors, formatVND, SOLUTION_ICONS } from '../../styles/theme'
import type { Product, PomItem, Solution, ProductFilters } from '../../types'

// ── Main Page ────────────────────────────────────────────────
export default function CreatePomPage() {
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const { data: solutions, loading: loadingSol } = useSolutions()
  const [selSolution, setSelSolution] = useState<Solution | null>(null)

  // POM info
  const [info, setInfo] = useState({ projectName: '', customerName: '', note: '' })
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({})

  // Items
  const [items, setItems] = useState<PomItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ pomCode: string; total: number } | null>(null)

  const setInfoField = (k: string, v: string) => setInfo(f => ({ ...f, [k]: v }))

  const validateInfo = () => {
    const e: Record<string, string> = {}
    if (!info.projectName.trim()) e.projectName = 'Nhập tên dự án'
    setInfoErrors(e)
    return !Object.keys(e).length
  }

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

  const totalAmount = items.reduce(
    (s, i) => s + i.quantity * i.unit_price * (1 + i.vat_rate), 0
  )

  const handleSave = async () => {
    if (!validateInfo()) { setStep(2); return }
    if (!items.length) { 
      notify.error('Chưa có thiết bị nào trong POM.')
      return 
    }
    try {
      await withLoading(async () => {
        // Bước 1: Tạo POM kèm items luôn trong 1 request
        const pomItems = items.map((item, idx) => ({
          product_id: item.product_id,
          quantity:   item.quantity,
          unit_price: item.unit_price,
          vat_rate:   item.vat_rate,
          note:       item.note ?? null,
          sort_order: item.sort_order ?? idx,
        }))

        const pom = await PomService.create({
          solution_id:   selSolution?.id,
          created_by:    user!.id,
          project_name:  info.projectName,
          customer_name: info.customerName || undefined,
          note:          info.note || undefined,
          items:         pomItems,
        })

        // Kiểm tra lỗi trả về từ IPC handler
        if (!pom || (pom as any).error) {
          throw new Error((pom as any)?.error || 'Tạo POM thất bại')
        }

        // Bước 2: Nếu server chưa nhận items (phòng hờ), upsert thêm
        if (pom.id && (!pom.items || pom.items.length === 0) && pomItems.length > 0) {
          await PomItemService.upsert(Number(pom.id), pomItems)
        }

        // Bước 3: Chuyển trạng thái sang submitted
        await PomService.updateStatus(Number(pom.id), 'submitted')

        notify.success(`Tạo POM "${pom.pom_code}" thành công với ${pomItems.length} thiết bị!`)
        setResult({ pomCode: pom.pom_code, total: totalAmount })
        setStep(3)
      }, 'Đang tạo POM...')
    } catch (err: any) {
      notify.error(err.message || 'Tạo POM thất bại')
    }
  }

  const handleReset = () => {
    setStep(1); setSelSolution(null)
    setInfo({ projectName: '', customerName: '', note: '' })
    setItems([]); setResult(null)
  }

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <Stepper step={step} />

      {/* Step 1 — Chọn giải pháp */}
      {step === 1 && (
        <div style={card}>
          <div style={cardTitle}>Chọn giải pháp</div>
          <div style={cardSub}>Mỗi POM gắn với một giải pháp để dễ phân loại</div>
          {loadingSol ? <LoadingSpinner /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10, marginBottom: 16 }}>
              {solutions.map(sol => (
                <SolutionCard
                  key={sol.id} solution={sol}
                  selected={selSolution?.id === sol.id}
                  onClick={() => setSelSolution(prev => prev?.id === sol.id ? null : sol)}
                />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" icon="ti-arrow-right" onClick={() => setStep(2)}>
              {selSolution ? `Tiếp tục với "${selSolution.name}"` : 'Bỏ qua — không chọn giải pháp'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — Thông tin + thiết bị */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {/* Thông tin dự án */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={cardTitle}>Thông tin dự án</span>
              {selSolution && (
                <span style={{ fontSize: 11, background: colors.primaryLight, color: colors.primary, padding: '3px 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className={`ti ${SOLUTION_ICONS[selSolution.code] ?? 'ti-layout-grid'}`} style={{ fontSize: 12 }} />
                  {selSolution.name}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Tên dự án" required error={infoErrors.projectName}>
                <Input value={info.projectName} error={infoErrors.projectName}
                  placeholder="Mạng LAN Công ty ABC - Tầng 3"
                  onChange={e => setInfoField('projectName', e.target.value)} />
              </Field>
              <Field label="Tên khách hàng">
                <Input value={info.customerName} placeholder="Công ty TNHH ABC"
                  onChange={e => setInfoField('customerName', e.target.value)} />
              </Field>
            </div>
            <Field label="Ghi chú">
              <Textarea value={info.note} style={{ height: 56 }}
                placeholder="Ghi chú thêm về dự án..."
                onChange={e => setInfoField('note', e.target.value)} />
            </Field>
          </div>

          {/* Danh sách thiết bị */}
          <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={cardTitle}>Danh sách thiết bị</div>
                <div style={cardSub}>
                  {items.length} thiết bị · Tổng:{' '}
                  <b style={{ color: colors.primary }}>{formatVND(totalAmount)}</b>
                </div>
              </div>
              <Button variant="primary" icon="ti-plus" onClick={() => setShowPicker(true)}>
                Thêm thiết bị
              </Button>
            </div>

            {items.length === 0 ? (
              <EmptyState icon="ti-plug-off" message="Chưa có thiết bị nào"
                subMessage='Nhấn "Thêm thiết bị" để chọn từ danh mục' />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <Th width="3%">#</Th>
                      <Th width="27%">Thiết bị</Th>
                      <Th width="9%">Hãng</Th>
                      <Th width="11%">Danh mục</Th>
                      <Th width="6%">ĐVT</Th>
                      <Th width="7%" align="center">SL</Th>
                      <Th width="14%" align="right">Đơn giá</Th>
                      <Th width="6%" align="center">VAT</Th>
                      <Th width="13%" align="right">Thành tiền</Th>
                      <Th width="4%"></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.product_id} style={{ borderTop: `0.5px solid ${colors.borderLight}` }}>
                        <Td style={{ color: colors.textTertiary, fontSize: 12 }}>{i + 1}</Td>
                        <Td>
                          <div style={{ fontWeight: 500, color: colors.textPrimary, fontSize: 13 }}>{item.product_name}</div>
                          {item.part_number && (
                            <div style={{ fontSize: 11, color: colors.textTertiary, fontFamily: 'monospace' }}>{item.part_number}</div>
                          )}
                        </Td>
                        <Td><BrandBadge label={item.brand_short} /></Td>
                        <Td style={{ fontSize: 12, color: colors.textSecondary }}>{item.category_name}</Td>
                        <Td style={{ fontSize: 12, color: colors.textSecondary }}>{item.unit}</Td>
                        <Td align="center">
                          <input type="number" min={1} value={item.quantity}
                            onChange={e => updateItem(i, 'quantity', Math.max(1, +e.target.value))}
                            style={{ width: 54, padding: '4px 6px', fontSize: 13, borderRadius: 6, border: `0.5px solid ${colors.border}`, textAlign: 'center', color: colors.textPrimary }} />
                        </Td>
                        <Td align="right">
                          <input type="number" min={0} value={item.unit_price}
                            onChange={e => updateItem(i, 'unit_price', +e.target.value)}
                            style={{ width: 110, padding: '4px 6px', fontSize: 13, borderRadius: 6, border: `0.5px solid ${colors.border}`, textAlign: 'right', color: colors.textPrimary }} />
                        </Td>
                        <Td align="center" style={{ fontSize: 12, color: colors.textSecondary }}>
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
                      <td colSpan={8} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
                        Tổng cộng (đã bao gồm VAT):
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: colors.primary }}>
                        {formatVND(totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="secondary" icon="ti-arrow-left" onClick={() => setStep(1)}>Quay lại</Button>
            <Button variant="primary" icon="ti-send" loading={saving} onClick={handleSave}>
              Lưu & Submit cho Trưởng Phòng Kỹ Thuật
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Thành công */}
      {step === 3 && result && (
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: colors.successLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i className="ti ti-circle-check" style={{ fontSize: 40, color: colors.success }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: colors.textPrimary, marginBottom: 8 }}>
            POM đã được tạo thành công!
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
            Mã POM: <b style={{ color: colors.primary }}>{result.pomCode}</b>
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
            Dự án: <b>{info.projectName}</b>
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
            {items.length} thiết bị · Tổng {formatVND(result.total)}
            <span style={{ marginLeft: 8, color: colors.info, fontWeight: 500 }}>· Đã submit ✓</span>
          </div>
          <Button variant="primary" icon="ti-plus" onClick={handleReset}>Tạo POM mới</Button>
        </div>
      )}

      {/* Product picker modal */}
      {showPicker && (
        <ProductPickerModal
          onClose={() => setShowPicker(false)}
          onAdd={p => { addProduct(p); setShowPicker(false) }}
        />
      )}
      </div>
    </PageTransition>
  )
}

// ── Solution Card ────────────────────────────────────────────
function SolutionCard({ solution, selected, onClick }: {
  solution: Solution; selected: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      background: selected ? colors.primaryLight : colors.bgSecondary,
      border: `1.5px solid ${selected ? colors.primary : colors.border}`,
      borderRadius: 10, padding: '16px 14px', textAlign: 'center',
      cursor: 'pointer', transition: 'all .15s',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, display: 'flex',
        alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px',
        background: selected ? colors.gradientPrimary : colors.bgTertiary,
      }}>
        <i className={`ti ${SOLUTION_ICONS[solution.code] ?? 'ti-layout-grid'}`}
          style={{ fontSize: 22, color: selected ? '#fff' : colors.textSecondary }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary, marginBottom: 4 }}>
        {solution.name}
      </div>
      {solution.description && (
        <div style={{ fontSize: 11, color: colors.textTertiary, lineHeight: 1.4 }}>
          {solution.description}
        </div>
      )}
    </button>
  )
}

// ── Product Picker Modal ─────────────────────────────────────
function ProductPickerModal({ onClose, onAdd }: {
  onClose: () => void; onAdd: (p: Product) => void
}) {
  const [filters, setFilters] = useState<ProductFilters>({ status: 'active' })
  const { data: products, loading } = useProducts(filters)
  const { brands, categories } = useRefData()

  return (
    <Modal title="Chọn thiết bị" width={700} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: colors.textTertiary, pointerEvents: 'none' }} />
          <Input style={{ paddingLeft: 32 }} placeholder="Tìm thiết bị..."
            value={filters.search ?? ''}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
            autoFocus />
        </div>
        <Select style={{ width: 'auto' }}
          value={filters.brand_id ?? ''}
          onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value ? +e.target.value : undefined }))}>
          <option value="">Tất cả hãng</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select style={{ width: 'auto' }}
          value={filters.category_id ?? ''}
          onChange={e => setFilters(f => ({ ...f, category_id: e.target.value ? +e.target.value : undefined }))}>
          <option value="">Tất cả danh mục</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {/* List */}
      <div style={{ maxHeight: 400, overflowY: 'auto', margin: '0 -20px', padding: '0 20px' }}>
        {loading ? <LoadingSpinner /> : products.length === 0 ? (
          <EmptyState icon="ti-search-off" message="Không tìm thấy sản phẩm" />
        ) : products.map(p => (
          <div key={p.id}
            onClick={() => onAdd(p)}
            onMouseEnter={e => (e.currentTarget.style.background = colors.primaryLight)}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `0.5px solid ${colors.borderLight}`, cursor: 'pointer', transition: 'background .1s', borderRadius: 6 }}>
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
    </Modal>
  )
}

// ── Stepper ──────────────────────────────────────────────────
function Stepper({ step }: { step: number }) {
  const steps = ['Chọn giải pháp', 'Thêm thiết bị', 'Hoàn tất']
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {steps.map((label, i) => {
        const num = i + 1; const done = step > num; const active = step === num
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 500,
                background: done ? colors.success : active ? colors.gradientPrimary : colors.border,
                color: done || active ? '#fff' : colors.textTertiary,
              }}>
                {done ? <i className="ti ti-check" style={{ fontSize: 13 }} /> : num}
              </div>
              <span style={{ fontSize: 13, color: active ? colors.primary : done ? colors.success : colors.textTertiary, fontWeight: active ? 500 : 400 }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: step > num ? colors.success : colors.border, margin: '0 12px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Local style shortcuts ────────────────────────────────────
const card: React.CSSProperties = {
  background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
  borderRadius: 12, padding: '20px 24px',
}
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 500, color: colors.textPrimary, marginBottom: 4 }
const cardSub:   React.CSSProperties = { fontSize: 12, color: colors.textTertiary, marginBottom: 16 }
