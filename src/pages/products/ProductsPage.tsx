// ============================================================
// src/pages/products/ProductsPage.tsx
// ============================================================
import { useState } from 'react'
import { useAuth } from '../../store/auth'
import { useProducts, useRefData } from '../../hooks'
import { useNotification, useLoading } from '../../components/ui'
import { ProductService } from '../../services'
import { PageTransition } from '../../components/PageTransition'
import { Button, ProductBadge, BrandBadge, StatCard, EmptyState, LoadingSpinner, Modal, Field, Input, Select, Textarea, Th, Td, Grid2, Grid3 } from '../../components/ui'
import { colors, formatVND, PRODUCT_UNITS } from '../../styles/theme'
import type { Product, ProductFilters, ProductStatus } from '../../types'

// ── Main Page ────────────────────────────────────────────────
export default function ProductsPage() {
  const [filters, setFilters] = useState<ProductFilters>({})
  const { data: products, loading, reload } = useProducts(filters)
  const { brands, categories } = useRefData()
  const notify = useNotification()

  const [editTarget, setEditTarget] = useState<Product | null | 'new'>(null)
  const [detailTarget, setDetailTarget] = useState<Product | null>(null)

  const handleDelete = async (p: Product) => {
    if (!confirm(`Xóa sản phẩm "${p.name}"?`)) return
    try {
      await ProductService.delete(p.id)
      notify.success(`Xóa sản phẩm "${p.name}" thành công`)
      reload()
    } catch(err: any) { 
      notify.error(err.message || 'Xóa thất bại')
    }
  }

  const active       = products.filter(p => p.status === 'active').length
  const discontinued = products.filter(p => p.status === 'discontinued').length
  const avgPrice     = products.length ? products.reduce((s, p) => s + p.price, 0) / products.length : 0

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Tổng sản phẩm" value={products.length} sub={`${brands.length} hãng`} />
          <StatCard label="Đang bán"       value={active}          accent={colors.success} />
          <StatCard label="Ngừng bán"      value={discontinued}    accent={colors.warning} />
          <StatCard label="Giá trung bình" value={formatVND(avgPrice)} sub="chưa VAT" />
        </div>

        {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: colors.textTertiary, pointerEvents: 'none' }} />
          <input
            style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: 13, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, boxSizing: 'border-box' }}
            placeholder="Tên sản phẩm, mã part number..."
            value={filters.search ?? ''}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
          />
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
        <Select style={{ width: 'auto' }}
          value={filters.status ?? ''}
          onChange={e => setFilters(f => ({ ...f, status: (e.target.value || undefined) as ProductStatus | undefined }))}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="discontinued">Ngừng bán</option>
          <option value="draft">Nháp</option>
        </Select>
        <Button variant="primary" icon="ti-plus" onClick={() => setEditTarget('new')}>
          Thêm sản phẩm
        </Button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: `0.5px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden', flex: 1 }}>
        <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${colors.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
            {loading ? 'Đang tải...' : `${products.length} sản phẩm`}
          </span>
        </div>

        {loading ? <LoadingSpinner /> : products.length === 0 ? (
          <EmptyState icon="ti-box-off" message="Không tìm thấy sản phẩm nào" subMessage="Thử thay đổi bộ lọc hoặc thêm sản phẩm mới" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <Th width="4%">#</Th>
                <Th width="28%">Tên sản phẩm</Th>
                <Th width="10%">Hãng</Th>
                <Th width="12%">Danh mục</Th>
                <Th width="12%">Mã part</Th>
                <Th width="13%" align="right">Đơn giá</Th>
                <Th width="7%" align="center">VAT</Th>
                <Th width="9%" align="center">Trạng thái</Th>
                <Th width="5%"></Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.id}
                  style={{ borderTop: `0.5px solid ${colors.borderLight}`, transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td style={{ color: colors.textTertiary, fontSize: 12 }}>{i + 1}</Td>
                  <Td>
                    <div style={{ fontWeight: 500, color: colors.textPrimary }}>{p.name}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                        {p.description.slice(0, 55)}{p.description.length > 55 ? '…' : ''}
                      </div>
                    )}
                  </Td>
                  <Td><BrandBadge label={p.brand_short ?? p.brand_name} /></Td>
                  <Td style={{ fontSize: 12, color: colors.textSecondary }}>{p.category_name}</Td>
                  <Td style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' }}>
                    {p.part_number ?? '—'}
                  </Td>
                  <Td align="right" style={{ fontWeight: 500 }}>{formatVND(p.price)}</Td>
                  <Td align="center" style={{ fontSize: 12, color: colors.textSecondary }}>
                    {(p.vat_rate * 100).toFixed(0)}%
                  </Td>
                  <Td align="center"><ProductBadge status={p.status} /></Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" icon="ti-eye"   onClick={() => setDetailTarget(p)} />
                      <Button variant="ghost" size="sm" icon="ti-edit"  onClick={() => setEditTarget(p)} />
                      <Button variant="danger" size="sm" icon="ti-trash" onClick={() => handleDelete(p)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

        {/* Modals */}
        {editTarget !== null && (
          <ProductFormModal
            product={editTarget === 'new' ? null : editTarget}
            brands={brands} categories={categories}
            onClose={() => setEditTarget(null)}
            onSaved={() => { setEditTarget(null); reload() }}
          />
        )}
        {detailTarget && (
          <ProductDetailModal
            product={detailTarget}
            onClose={() => setDetailTarget(null)}
          />
        )}
      </div>
    </PageTransition>
  )
}

// ── Form Modal ───────────────────────────────────────────────
function ProductFormModal({ product, brands, categories, onClose, onSaved }: {
  product: Product | null
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!product
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()
  const [form, setForm] = useState({
    brand_id: product?.brand_id ?? '',  category_id: product?.category_id ?? '',
    name: product?.name ?? '',           part_number: product?.part_number ?? '',
    unit: product?.unit ?? 'Cái',        price: product?.price ?? '',
    vat_rate: product ? product.vat_rate * 100 : 10,
    status: product?.status ?? 'active',
    description: product?.description ?? '', spec: product?.spec ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.brand_id)    e.brand_id    = 'Chọn hãng'
    if (!form.category_id) e.category_id = 'Chọn danh mục'
    if (!form.name.trim()) e.name        = 'Nhập tên sản phẩm'
    if (!form.price || +form.price <= 0) e.price = 'Nhập đơn giá hợp lệ'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await withLoading(async () => {
        const payload = { ...form, brand_id: +form.brand_id, category_id: +form.category_id, price: +form.price, vat_rate: +form.vat_rate / 100, created_by: user?.id ?? null }
        if (isEdit) {
          await ProductService.update(product!.id, payload)
          notify.success(`Cập nhật "${form.name}" thành công`)
        } else {
          await ProductService.create(payload as Parameters<typeof ProductService.create>[0])
          notify.success(`Thêm sản phẩm "${form.name}" thành công`)
        }
        onSaved()
      }, `${isEdit ? 'Cập nhật' : 'Thêm'} sản phẩm...`)
    } catch(err: any) {
      notify.error(err.message || 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button variant="primary" icon={saving ? undefined : 'ti-check'} loading={saving} onClick={handleSubmit}>
          {isEdit ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </>}
    >
      <Grid2>
        <Field label="Hãng" required error={errors.brand_id}>
          <Select value={form.brand_id} onChange={e => set('brand_id', e.target.value)} error={errors.brand_id}>
            <option value="">— Chọn hãng —</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Danh mục" required error={errors.category_id}>
          <Select value={form.category_id} onChange={e => set('category_id', e.target.value)} error={errors.category_id}>
            <option value="">— Chọn danh mục —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </Grid2>
      <Field label="Tên sản phẩm" required error={errors.name}>
        <Input value={form.name} placeholder="Cisco Catalyst 9200L-24P-4G" onChange={e => set('name', e.target.value)} error={errors.name} />
      </Field>
      <Grid2>
        <Field label="Mã Part Number">
          <Input value={form.part_number} placeholder="C9200L-24P-4G-E" onChange={e => set('part_number', e.target.value)} />
        </Field>
        <Field label="Đơn vị tính">
          <Select value={form.unit} onChange={e => set('unit', e.target.value)}>
            {PRODUCT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
      </Grid2>
      <Grid3>
        <Field label="Đơn giá (VNĐ)" required error={errors.price}>
          <Input type="number" value={form.price} min={0} placeholder="0" onChange={e => set('price', e.target.value)} error={errors.price} />
        </Field>
        <Field label="VAT (%)">
          <Input type="number" value={form.vat_rate} min={0} max={100} onChange={e => set('vat_rate', e.target.value)} />
        </Field>
        <Field label="Trạng thái">
          <Select value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Đang bán</option>
            <option value="discontinued">Ngừng bán</option>
            <option value="draft">Nháp</option>
          </Select>
        </Field>
      </Grid3>
      <Field label="Mô tả ngắn">
        <Textarea value={form.description} style={{ height: 70 }} placeholder="Mô tả ngắn..." onChange={e => set('description', e.target.value)} />
      </Field>
      <Field label="Thông số kỹ thuật">
        <Textarea value={form.spec} style={{ height: 90 }} placeholder="Thông số kỹ thuật..." onChange={e => set('spec', e.target.value)} />
      </Field>
    </Modal>
  )
}

// ── Detail Modal ─────────────────────────────────────────────
function ProductDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const rows = [
    { label: 'Mã part number',    value: product.part_number ?? '—', mono: true },
    { label: 'Đơn vị tính',       value: product.unit },
    { label: 'Đơn giá',           value: formatVND(product.price), bold: true },
    { label: 'Thuế VAT',          value: `${(product.vat_rate * 100).toFixed(0)}%` },
    { label: 'Giá sau VAT',       value: formatVND(product.price * (1 + product.vat_rate)), bold: true, accent: true },
    { label: 'Ngày tạo',          value: new Date(product.created_at).toLocaleDateString('vi-VN') },
    { label: 'Cập nhật lần cuối', value: new Date(product.updated_at).toLocaleDateString('vi-VN') },
  ]
  return (
    <Modal title="Chi tiết sản phẩm" width={520} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-box" style={{ fontSize: 24, color: colors.primary }} />
        </div>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15, color: colors.textPrimary }}>{product.name}</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>{product.brand_name} · {product.category_name}</div>
          <div style={{ marginTop: 8 }}><ProductBadge status={product.status} /></div>
        </div>
      </div>
      <div style={{ border: `0.5px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `0.5px solid ${colors.borderLight}` }}>
            <span style={{ fontSize: 12, color: colors.textSecondary }}>{r.label}</span>
            <span style={{ fontSize: 13, fontFamily: r.mono ? 'monospace' : undefined, fontWeight: r.bold ? 500 : 400, color: r.accent ? colors.primary : colors.textPrimary }}>{r.value}</span>
          </div>
        ))}
      </div>
      {product.description && (
        <Field label="Mô tả">
          <div style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.6 }}>{product.description}</div>
        </Field>
      )}
      {product.spec && (
        <Field label="Thông số kỹ thuật">
          <pre style={{ fontSize: 12, background: colors.bgSecondary, padding: 12, borderRadius: 8, border: `0.5px solid ${colors.border}`, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>{product.spec}</pre>
        </Field>
      )}
    </Modal>
  )
}
