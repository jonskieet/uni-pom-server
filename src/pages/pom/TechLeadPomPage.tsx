// ============================================================
// src/pages/pom/TechLeadPomPage.tsx
// Trang dành cho Trưởng phòng Kỹ thuật:
//   - Xem tất cả POM đang chờ duyệt (submitted)
//   - Duyệt POM → chuyển sang reviewed (sales thấy được)
//   - Trả lại POM cho Kỹ thuật kèm lý do
//   - Xem lịch sử đã duyệt
//   - Tab Phiếu khảo sát (giống MyPomPage)
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { usePoms, usePomDetail } from '../../hooks'
import { PomService } from '../../services'
import {
  Button, PomBadge, EmptyState, LoadingSpinner,
  Modal, Field, Textarea, Th, Td,
} from '../../components/ui'
import { colors, formatVND, radius } from '../../styles/theme'
import type { Pom, PomFilters } from '../../types'

// ─────────────────────────────────────────────────────────────
// SURVEY TYPES
// ─────────────────────────────────────────────────────────────
interface SurveyItem {
  id: number
  product_name: string
  quantity_proposed: number
  quantity_actual: number
  unit: string
  location: string | null
  condition_note: string | null
  sort_order: number
}

interface SurveyReport {
  id: number
  report_code: string
  report_type: string
  project_name: string
  customer_name: string | null
  site_address: string | null
  survey_date: string | null
  surveyor_name: string | null
  general_note: string | null
  status: string
  item_count: number
  pom_code: string
  pom_id: number
  created_by_name: string | null
  items?: SurveyItem[]
}

const SurveyApi = {
  getAll:  (filters?: any) => (window as any).api.survey.getAll(filters),
  getById: (id: number)    => (window as any).api.survey.getById(id),
}

function usePomSurveys(pomId: number | null) {
  const [data, setData]       = useState<SurveyReport[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!pomId) { setData([]); return }
    setLoading(true)
    try {
      const rows: SurveyReport[] = await SurveyApi.getAll({ pom_id: pomId })
      setData(Array.isArray(rows) ? rows : [])
    } catch { setData([]) }
    finally { setLoading(false) }
  }, [pomId])

  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}

// ─────────────────────────────────────────────────────────────
// SURVEY DETAIL MODAL
// ─────────────────────────────────────────────────────────────
function SurveyDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [report, setReport] = useState<(SurveyReport & { items: SurveyItem[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    SurveyApi.getById(id)
      .then((r: any) => setReport(r))
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [id])

  const TH: React.CSSProperties = {
    background: colors.primary, color: '#fff',
    padding: '8px 10px', fontSize: 12, fontWeight: 600,
    textAlign: 'left' as const, whiteSpace: 'nowrap' as const, border: 'none',
  }
  const TD: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13, verticalAlign: 'middle' as const,
    borderBottom: `1px solid ${colors.borderLight}`,
  }

  const parseGeneralNote = (raw: string | null) => {
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  const checkMissingInfo = (report: any, lanForm: any) => {
    const missing: string[] = []
    if (!report.surveyor_name) missing.push('Người khảo sát')
    if (!report.site_address) missing.push('Địa chỉ')
    if (!lanForm?.current_devices?.length) missing.push('Hiện trạng thiết bị')
    if (!lanForm?.current_status || !Object.values(lanForm.current_status).some(Boolean)) missing.push('Tình trạng hệ thống')
    if (!report.items?.length) missing.push('Thiết bị đề xuất')
    return missing
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: '820px', maxWidth: '95vw', maxHeight: '88vh',
        background: colors.bgPrimary, borderRadius: radius.xl,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: colors.bgSecondary, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: radius.md, flexShrink: 0,
              background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-clipboard-list" style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: colors.textPrimary }}>
                {loading ? 'Đang tải...' : report?.report_code ?? 'Phiếu khảo sát'}
              </div>
              {report && (
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  POM: <b style={{ color: colors.primary }}>{report.pom_code}</b>
                  {report.surveyor_name && <> · KTV: {report.surveyor_name}</>}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: colors.textTertiary, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><LoadingSpinner /></div>
          ) : !report ? (
            <EmptyState icon="ti-alert-circle" title="Không tải được phiếu" desc="Vui lòng thử lại" />
          ) : (() => {
            const parsed = parseGeneralNote(report.general_note)
            const lanForm = parsed?.lanForm
            const missing = checkMissingInfo(report, lanForm)

            return (
              <div>
                {/* Cảnh báo thiếu thông tin */}
                {missing.length > 0 && (
                  <div style={{
                    background: '#fef3c7', border: `1px solid #fcd34d`,
                    borderRadius: radius.md, padding: '12px 14px', marginBottom: 16,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: 18, color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                        ⚠️ Phiếu báo cáo chưa hoàn thiện
                      </div>
                      <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                        Các trường sau chưa được điền: <b>{missing.join(', ')}</b>
                      </div>
                    </div>
                  </div>
                )}

                {/* Thông tin chung */}
                <div style={{
                  background: colors.bgSecondary, borderRadius: radius.md,
                  padding: '14px 18px', marginBottom: 16,
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 13,
                }}>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Đơn vị khảo sát: </span>
                    <b>{report.project_name}</b>
                  </div>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Ngày khảo sát: </span>
                    <b>{report.survey_date ? new Date(report.survey_date).toLocaleDateString('vi-VN') : '—'}</b>
                  </div>
                  <div style={{ opacity: report.surveyor_name ? 1 : 0.6 }}>
                    <span style={{ color: colors.textSecondary }}>Người khảo sát: </span>
                    <b style={{ color: report.surveyor_name ? 'inherit' : colors.warning }}>
                      {report.surveyor_name || '⚠️ Chưa điền'}
                    </b>
                  </div>
                  <div style={{ opacity: report.site_address ? 1 : 0.6 }}>
                    <span style={{ color: colors.textSecondary }}>Địa chỉ: </span>
                    <b style={{ color: report.site_address ? 'inherit' : colors.warning }}>
                      {report.site_address || '⚠️ Chưa điền'}
                    </b>
                  </div>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Loại khảo sát: </span>
                    <span style={{
                      background: colors.primaryLight, color: colors.primary,
                      padding: '1px 8px', borderRadius: radius.full, fontSize: 11, fontWeight: 600,
                    }}>
                      <i className="ti ti-network" style={{ fontSize: 10, marginRight: 4 }} />Mạng LAN
                    </span>
                  </div>
                  <div>
                    <span style={{ color: colors.textSecondary }}>Trạng thái: </span>
                    <span style={{
                      background: report.status === 'completed' ? colors.successLight : colors.bgSecondary,
                      color: report.status === 'completed' ? colors.success : colors.textSecondary,
                      padding: '1px 8px', borderRadius: radius.full, fontSize: 11,
                    }}>
                      {report.status === 'completed' ? 'Hoàn tất' : 'Nháp'}
                    </span>
                  </div>
                </div>

                {/* Hiện trạng thiết bị */}
                <div style={{ marginBottom: 16, opacity: lanForm?.current_devices?.length > 0 ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: lanForm?.current_devices?.length > 0 ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-device-desktop" style={{ fontSize: 14 }} />
                    Hiện trạng thiết bị CNTT
                    {!lanForm?.current_devices?.length && (
                      <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>
                    )}
                  </div>
                  {lanForm?.current_devices?.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, width: 36, textAlign: 'center', borderRadius: '6px 0 0 0' }}>STT</th>
                          <th style={TH}>Thiết bị</th>
                          <th style={{ ...TH, width: 130 }}>Model</th>
                          <th style={{ ...TH, width: 60, textAlign: 'center' }}>SL</th>
                          <th style={TH}>Chức năng</th>
                          <th style={{ ...TH, borderRadius: '0 6px 0 0' }}>Vị trí</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lanForm.current_devices.map((d: any, i: number) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : colors.bgSecondary }}>
                            <td style={{ ...TD, textAlign: 'center', color: colors.textTertiary, fontWeight: 600 }}>{i + 1}</td>
                            <td style={TD}>{d.device_type}</td>
                            <td style={{ ...TD, fontStyle: 'italic', color: colors.textSecondary }}>{d.model || 'Chưa có'}</td>
                            <td style={{ ...TD, textAlign: 'center' }}>{d.quantity}</td>
                            <td style={TD}>{d.function_desc}</td>
                            <td style={TD}>{d.location}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ background: colors.bgSecondary, borderRadius: radius.md, padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có dữ liệu thiết bị hiện tại
                    </div>
                  )}
                </div>

                {/* Thông tin hiện trạng */}
                <div style={{ marginBottom: 16, opacity: lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-report-analytics" style={{ fontSize: 14 }} />
                    Thông tin hiện trạng
                    {(!lanForm?.current_status || !Object.values(lanForm.current_status).some(Boolean)) && (
                      <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>
                    )}
                  </div>
                  {lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        { key: 'internet_connection', icon: 'ti-world',       label: 'Kết nối Internet' },
                        { key: 'security_system',     icon: 'ti-shield-lock', label: 'Hệ thống bảo mật' },
                        { key: 'switch_system',       icon: 'ti-switch',      label: 'Hệ thống Switch' },
                        { key: 'wifi_system',         icon: 'ti-wifi',        label: 'Hệ thống Wifi' },
                        { key: 'cable_system',        icon: 'ti-plug',        label: 'Hệ thống cáp mạng' },
                      ] as { key: string; icon: string; label: string }[]).map(f => (
                        <div key={f.key} style={{
                          background: colors.bgSecondary, borderRadius: radius.md,
                          padding: '10px 14px', border: `1px solid ${colors.borderLight}`,
                          opacity: lanForm.current_status[f.key] ? 1 : 0.6,
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <i className={`ti ${f.icon}`} style={{ fontSize: 13, color: colors.primary }} />
                            {f.label}
                            {!lanForm.current_status[f.key] && (
                              <span style={{ fontSize: 10, marginLeft: 'auto', color: colors.warning }}>⚠️ Trống</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {lanForm.current_status[f.key] || <i>Chưa cập nhật</i>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: colors.bgSecondary, borderRadius: radius.md, padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có mô tả tình trạng hệ thống
                    </div>
                  )}
                </div>

                {/* Thiết bị đề xuất */}
                <div style={{ marginBottom: 16, opacity: report.items && report.items.length > 0 ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: report.items && report.items.length > 0 ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-bulb" style={{ fontSize: 14 }} />
                    Thiết bị đề xuất nâng cấp
                    {report.items && report.items.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 'auto', color: colors.textSecondary }}>({report.items.length} loại)</span>
                    )}
                    {(!report.items || report.items.length === 0) && (
                      <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>
                    )}
                  </div>
                  {report.items && report.items.length > 0 ? (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ ...TH, width: 36, textAlign: 'center', borderRadius: '6px 0 0 0' }}>STT</th>
                            <th style={TH}>Tên thiết bị</th>
                            <th style={{ ...TH, width: 80, textAlign: 'center' }}>Số lượng</th>
                            <th style={{ ...TH, width: 60 }}>ĐVT</th>
                            <th style={TH}>Chức năng / Mô tả</th>
                            <th style={{ ...TH, borderRadius: '0 6px 0 0' }}>Vị trí triển khai</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.items.map((item, i) => (
                            <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : colors.bgSecondary }}>
                              <td style={{ ...TD, textAlign: 'center', color: colors.textTertiary, fontWeight: 600 }}>{i + 1}</td>
                              <td style={{ ...TD, fontWeight: 500 }}>{item.product_name}</td>
                              <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: colors.primary }}>{item.quantity_proposed}</td>
                              <td style={TD}>{item.unit}</td>
                              <td style={{ ...TD, color: colors.textSecondary }}>{item.condition_note ?? '—'}</td>
                              <td style={{ ...TD, color: !item.location ? colors.warning : colors.textSecondary }}>
                                {item.location ?? '⚠️ Chưa điền'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, color: colors.textSecondary }}>
                        Tổng số lượng đề xuất: <b style={{ color: colors.primary }}>
                          {report.items.reduce((s, i) => s + i.quantity_proposed, 0)}
                        </b>
                      </div>
                    </>
                  ) : (
                    <div style={{ background: colors.bgSecondary, borderRadius: radius.md, padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có thiết bị đề xuất
                    </div>
                  )}
                </div>

                {/* Ghi chú */}
                {lanForm?.general_note && (
                  <div style={{ background: '#fffbeb', border: `1px solid #fde68a`, borderRadius: radius.md, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="ti ti-notes" style={{ fontSize: 13 }} />Ghi chú
                    </div>
                    <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {lanForm.general_note}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SURVEY TAB — danh sách + xem chi tiết phiếu khảo sát
// ─────────────────────────────────────────────────────────────
function SurveyTab({ surveys, loading }: {
  surveys: SurveyReport[]
  loading: boolean
}) {
  const [detailId, setDetailId] = useState<number | null>(null)

  const kindLabel = (r: SurveyReport) => {
    try {
      const p = JSON.parse(r.general_note ?? '{}')
      if (p?.kind === 'lan')  return { icon: 'ti-network',      label: 'Mạng LAN' }
      if (p?.kind === 'led')  return { icon: 'ti-device-tv',    label: 'Màn hình LED' }
      if (p?.kind === 'hall') return { icon: 'ti-presentation', label: 'Hội trường' }
      if (p?.kind === 'cctv') return { icon: 'ti-camera',       label: 'Camera CCTV' }
    } catch { /* empty */ }
    return { icon: 'ti-clipboard', label: 'Khảo sát' }
  }

  return (
    <>
      {detailId !== null && (
        <SurveyDetailModal id={Number(detailId)} onClose={() => setDetailId(null)} />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <LoadingSpinner />
        ) : surveys.length === 0 ? (
          <EmptyState
            icon="ti-clipboard-off"
            title="Chưa có phiếu khảo sát"
            desc="Kỹ thuật chưa tạo phiếu khảo sát nào gắn với POM này"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {surveys.map(sr => {
              const { icon, label } = kindLabel(sr)
              return (
                <div
                  key={sr.id}
                  onClick={() => setDetailId(Number(sr.id))}
                  style={{
                    border: `1px solid ${colors.border}`, borderRadius: radius.md,
                    padding: '10px 14px', background: colors.bgPrimary,
                    cursor: 'pointer', transition: 'all .12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = colors.primary)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = colors.border)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: colors.primary }}>{sr.report_code}</span>
                      <span style={{
                        background: sr.status === 'completed' ? colors.successLight : colors.bgSecondary,
                        color:      sr.status === 'completed' ? colors.success      : colors.textSecondary,
                        fontSize: 11, padding: '2px 8px', borderRadius: radius.full,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <i className={`ti ${sr.status === 'completed' ? 'ti-circle-check' : 'ti-pencil'}`} style={{ fontSize: 10 }} />
                        {sr.status === 'completed' ? 'Hoàn tất' : 'Nháp'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        background: colors.infoLight, color: colors.info,
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: radius.full,
                      }}>
                        {sr.item_count ?? 0} TB đề xuất
                      </span>
                      <span style={{ fontSize: 11, color: colors.textTertiary, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <i className="ti ti-eye" style={{ fontSize: 12 }} /> Xem chi tiết
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: colors.textSecondary, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>
                      <i className="ti ti-building" style={{ fontSize: 11, marginRight: 4 }} />
                      {sr.project_name}
                    </span>
                    {sr.survey_date && (
                      <span>
                        <i className="ti ti-calendar" style={{ fontSize: 11, marginRight: 4 }} />
                        {new Date(sr.survey_date).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                    {sr.surveyor_name && (
                      <span>
                        <i className="ti ti-user" style={{ fontSize: 11, marginRight: 4 }} />
                        {sr.surveyor_name}
                      </span>
                    )}
                    <span style={{
                      background: colors.primaryLight, color: colors.primary,
                      padding: '1px 6px', borderRadius: radius.sm, fontSize: 11,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 10 }} />
                      {label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, accent, icon }: {
  label: string; value: number; accent: string; icon?: string
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
      {icon && (
        <div style={{ width: 36, height: 36, borderRadius: 8, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: accent }} />
        </div>
      )}
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

// ── POM List Item ─────────────────────────────────────────────
function PomListItem({ pom, selected, onClick }: {
  pom: Pom; selected: boolean; onClick: () => void
}) {
  const isWaiting = pom.status === 'submitted'
  return (
    <div onClick={onClick} style={{
      padding: '10px 14px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
      background: selected ? colors.primary + '12' : '#fff',
      border: `1px solid ${selected ? colors.primary + '40' : colors.border}`,
      borderLeft: isWaiting ? `3px solid ${colors.warning}` : `3px solid transparent`,
      transition: 'all .12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pom.project_name}
        </div>
        <PomBadge status={pom.status} />
      </div>
      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>{pom.pom_code}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: colors.textTertiary }}>
        <span><i className="ti ti-box" style={{ fontSize: 11 }} /> {pom.item_count ?? 0} thiết bị</span>
        <span>{new Date(pom.created_at).toLocaleDateString('vi-VN')}</span>
        {pom.customer_name && <span style={{ color: colors.textSecondary }}>{pom.customer_name}</span>}
      </div>
    </div>
  )
}

// ── Return Modal ──────────────────────────────────────────────
function ReturnModal({ onConfirm, onClose }: {
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal title="Trả POM về Kỹ thuật" onClose={onClose}>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>POM sẽ trở về trạng thái Draft</div>
          <div>Kỹ thuật sẽ thấy lý do và chỉnh sửa lại.</div>
        </div>
        <Field label="Lý do trả về *">
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="Mô tả lý do cần chỉnh sửa..."
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button
            variant="secondary"
            icon="ti-arrow-back-up"
            disabled={!reason.trim()}
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            style={{ color: colors.warning, borderColor: colors.warning }}
          >
            Xác nhận trả về
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Detail Panel ──────────────────────────────────────────────
function DetailPanel({ pom, loading, onApprove, onReturn }: {
  pom: any | null
  loading: boolean
  onApprove: (id: number) => void
  onReturn: (id: number) => void
}) {
  const [activeTab, setActiveTab] = useState<'items' | 'surveys'>('items')
  const { data: surveys, loading: surveyLoading } = usePomSurveys(pom?.id ?? null)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner />
    </div>
  )
  if (!pom) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState icon="ti-file-invoice" title="Chọn POM để xem chi tiết" />
    </div>
  )

  const items = pom.items ?? []
  const totalAmount = items.reduce((s: number, i: any) =>
    s + Number(i.unit_price) * Number(i.quantity) * (1 + Number(i.vat_rate)), 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{pom.project_name}</div>
          <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
            {pom.pom_code} {pom.customer_name ? `· ${pom.customer_name}` : ''}
          </div>
        </div>
        <PomBadge status={pom.status} />
      </div>

      {/* Meta */}
      <div style={{ padding: '12px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', gap: 20, fontSize: 12, color: colors.textSecondary, flexShrink: 0 }}>
        <span><i className="ti ti-user" style={{ marginRight: 4 }} />{pom.creator?.full_name ?? '—'}</span>
        <span><i className="ti ti-calendar" style={{ marginRight: 4 }} />{new Date(pom.created_at).toLocaleDateString('vi-VN')}</span>
        <span><i className="ti ti-box" style={{ marginRight: 4 }} />{items.length} thiết bị</span>
        <span><i className="ti ti-cash" style={{ marginRight: 4 }} />{formatVND(totalAmount)}</span>
        {pom.solution && <span><i className="ti ti-network" style={{ marginRight: 4 }} />{pom.solution.name}</span>}
      </div>

      {/* Note */}
      {pom.note && (
        <div style={{ padding: '8px 20px', background: colors.bgSecondary, borderBottom: `0.5px solid ${colors.border}`, fontSize: 12, color: colors.textSecondary, flexShrink: 0 }}>
          <i className="ti ti-notes" style={{ marginRight: 6 }} />{pom.note}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${colors.border}`, flexShrink: 0 }}>
        {([
          { key: 'items',   label: 'Danh sách thiết bị',   icon: 'ti-box' },
          { key: 'surveys', label: `Phiếu khảo sát${surveys.length > 0 ? ` (${surveys.length})` : ''}`, icon: 'ti-clipboard-list' },
        ] as { key: 'items' | 'surveys'; label: string; icon: string }[]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 16px', fontSize: 12, border: 'none', background: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            color: activeTab === t.key ? colors.primary : colors.textSecondary,
            borderBottom: `2px solid ${activeTab === t.key ? colors.primary : 'transparent'}`,
            fontWeight: activeTab === t.key ? 600 : 400,
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab: Danh sách thiết bị */}
      {activeTab === 'items' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {items.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
              <EmptyState icon="ti-box" title="Chưa có thiết bị" />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.bgSecondary }}>
                <Th width="32">#</Th>
                <Th>Thiết bị</Th>
                <Th>Hãng</Th>
                <Th width="60">ĐVT</Th>
                <Th width="60" align="center">SL</Th>
                <Th width="110" align="right">Đơn giá</Th>
                <Th width="120" align="right">Thành tiền</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr key={item.id ?? idx} style={{ borderBottom: `0.5px solid ${colors.border}` }}>
                    <Td style={{ color: colors.textTertiary }}>{idx + 1}</Td>
                    <Td>
                      <div style={{ fontWeight: 500 }}>{item.product_name ?? item.product?.name}</div>
                      {(item.part_number ?? item.product?.part_number) && (
                        <div style={{ fontSize: 11, color: colors.textTertiary }}>{item.part_number ?? item.product?.part_number}</div>
                      )}
                    </Td>
                    <Td style={{ color: colors.textSecondary }}>{item.brand_short ?? item.product?.brand?.short_name ?? '—'}</Td>
                    <Td style={{ color: colors.textSecondary }}>{item.unit ?? item.product?.unit ?? 'Cái'}</Td>
                    <Td align="center" style={{ fontWeight: 500 }}>{item.quantity}</Td>
                    <Td align="right" style={{ color: colors.textSecondary }}>{formatVND(item.unit_price)}</Td>
                    <Td align="right" style={{ fontWeight: 500 }}>
                      {formatVND(Number(item.unit_price) * Number(item.quantity) * (1 + Number(item.vat_rate)))}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
                  <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>Tổng cộng (đã VAT):</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: colors.primary, fontSize: 13 }}>{formatVND(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Tab: Phiếu khảo sát */}
      {activeTab === 'surveys' && (
        <SurveyTab surveys={surveys} loading={surveyLoading} />
      )}

      {/* Action bar */}
      <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
        {pom.status === 'submitted' && (
          <>
            <Button
              variant="secondary"
              icon="ti-arrow-back-up"
              style={{ color: colors.warning, borderColor: '#fde68a', background: '#fffbeb' }}
              onClick={() => onReturn(pom.id)}
            >
              Trả về KT
            </Button>
            <Button variant="success" icon="ti-circle-check" onClick={() => onApprove(pom.id)}>
              Duyệt POM
            </Button>
          </>
        )}
        {pom.status === 'reviewed' && (
          <div style={{ fontSize: 13, color: colors.success, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-circle-check" />
            POM đã duyệt{pom.reviewer ? ` bởi ${pom.reviewer.full_name}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function TechLeadPomPage() {
  const notify   = useNotification()
  const { withLoading } = useLoading()

  const [filters, setFilters]       = useState<PomFilters>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showReturn, setShowReturn] = useState(false)
  const [returnTargetId, setReturnTargetId] = useState<number | null>(null)

  const { data: poms, loading, reload } = usePoms(filters)
  const { data: detail, loading: loadingDetail, reload: reloadDetail } = usePomDetail(selectedId)

  const counts = {
    waiting:  poms.filter(p => p.status === 'submitted').length,
    approved: poms.filter(p => p.status === 'reviewed' || p.status === 'exported').length,
    total:    poms.length,
  }

  const handleApprove = async (id: number) => {
    if (!confirm('Duyệt POM này? Sales sẽ có thể xuất Excel.')) return
    try {
      await withLoading(async () => {
        await PomService.approve(id)
        notify.success('Duyệt POM thành công')
        reload(); reloadDetail()
      }, 'Đang duyệt POM...')
    } catch (err: any) {
      notify.error(err.message || 'Duyệt thất bại')
    }
  }

  const handleOpenReturn = (id: number) => {
    setReturnTargetId(id)
    setShowReturn(true)
  }

  const handleReturn = async (reason: string) => {
    if (!returnTargetId) return
    try {
      await withLoading(async () => {
        await window.api.poms.return(returnTargetId, reason)
        notify.success('Đã trả lại POM cho Kỹ thuật')
        setShowReturn(false)
        setReturnTargetId(null)
        reload(); reloadDetail()
      }, 'Đang trả lại POM...')
    } catch (err: any) {
      notify.error(err.message || 'Trả lại thất bại')
    }
  }

  const waiting  = poms.filter(p => p.status === 'submitted')
  const reviewed = poms.filter(p => p.status === 'reviewed' || p.status === 'exported')

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <StatCard label="Chờ duyệt"  value={counts.waiting}  accent={colors.warning} icon="ti-clock" />
          <StatCard label="Đã duyệt"   value={counts.approved} accent={colors.success}  icon="ti-circle-check" />
          <StatCard label="Tổng POM"   value={counts.total}    accent={colors.primary}  icon="ti-file-invoice" />
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textTertiary, fontSize: 14 }} />
            <input
              placeholder="Tìm POM, dự án..."
              style={{ width: '100%', paddingLeft: 32, paddingRight: 12, height: 36, borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
            />
          </div>
          <select
            value={filters.status ?? ''}
            onChange={e => setFilters(f => ({ ...f, status: (e.target.value as any) || undefined }))}
            style={{ height: 36, paddingInline: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.textPrimary, background: '#fff' }}
          >
            <option value="">Tất cả</option>
            <option value="submitted">Chờ duyệt</option>
            <option value="reviewed">Đã duyệt</option>
            <option value="exported">Đã xuất</option>
          </select>
        </div>

        {/* Main: list + detail */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, minHeight: 0 }}>

          {/* Left: POM list */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><LoadingSpinner /></div>
              ) : poms.length === 0 ? (
                <EmptyState icon="ti-file-invoice" title="Không có POM nào" />
              ) : (
                <>
                  {waiting.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: colors.warning, fontWeight: 600, padding: '6px 4px 4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        ⏳ Chờ duyệt ({waiting.length})
                      </div>
                      {waiting.map(p => (
                        <PomListItem key={p.id} pom={p} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                      ))}
                    </>
                  )}
                  {reviewed.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: colors.textTertiary, fontWeight: 600, padding: '10px 4px 4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        ✓ Đã xử lý ({reviewed.length})
                      </div>
                      {reviewed.map(p => (
                        <PomListItem key={p.id} pom={p} selected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: detail */}
          <DetailPanel
            pom={detail}
            loading={loadingDetail && !!selectedId}
            onApprove={handleApprove}
            onReturn={handleOpenReturn}
          />
        </div>
      </div>

      {/* Return modal */}
      {showReturn && (
        <ReturnModal
          onConfirm={handleReturn}
          onClose={() => { setShowReturn(false); setReturnTargetId(null) }}
        />
      )}
    </PageTransition>
  )
}
