// src/pages/pom/MyPomPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { usePoms, usePomDetail } from '../../hooks'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { PomService } from '../../services'
import { useAuth } from '../../store/auth'
import {
  Button, PomBadge, BrandBadge, StatCard,
  EmptyState, LoadingSpinner, Th, Td,
} from '../../components/ui'
import { colors, formatVND, STATUS_POM, radius } from '../../styles/theme'
import type { Pom, PomFilters } from '../../types'

// ── Survey types (dùng nội bộ) ───────────────────────────────
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
  delete:  (id: number)    => (window as any).api.survey.delete(id),
}

function usePomSurveys(pomId: number | null) {
  const [data, setData]       = useState<SurveyReport[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!pomId) { setData([]); return }
    setLoading(true)
    try {
      // Backend đã có pom_id filter sau khi patch ipcHandlers.ts
      const rows: SurveyReport[] = await SurveyApi.getAll({ pom_id: pomId })
      setData(Array.isArray(rows) ? rows : [])
    } catch { setData([]) }
    finally { setLoading(false) }
  }, [pomId])

  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}


// ─────────────────────────────────────────────────────────────
// SurveyDetailModal — Xem chi tiết phiếu báo cáo khảo sát
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

  // Kiểm tra thông tin bị thiếu
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
            <div style={{ textAlign: 'center', padding: 40 }}>
              <LoadingSpinner />
            </div>
          ) : !report ? (
            <EmptyState icon="ti-alert-circle" title="Không tải được phiếu" desc="Vui lòng thử lại" />
          ) : (() => {
            const parsed = parseGeneralNote(report.general_note)
            const lanForm = parsed?.lanForm
            const missing = checkMissingInfo(report, lanForm)

            return (
              <div>
                {/* Cảnh báo thông tin không đầy đủ */}
                {missing.length > 0 && (
                  <div style={{
                    background: '#fef3c7', border: `1px solid #fcd34d`,
                    borderRadius: radius.md, padding: '12px 14px', marginBottom: 16,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <i className="ti ti-alert-circle" style={{
                      fontSize: 18, color: '#d97706', flexShrink: 0, marginTop: 1,
                    }} />
                    <div>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4,
                      }}>
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
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px',
                  fontSize: 13,
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

                {/* Hiện trạng thiết bị — luôn hiển thị */}
                <div style={{ marginBottom: 16, opacity: lanForm?.current_devices?.length > 0 ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: lanForm?.current_devices?.length > 0 ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-device-desktop" style={{ fontSize: 14 }} />
                    Hiện trạng thiết bị CNTT
                    {!lanForm?.current_devices?.length && <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>}
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
                    <div style={{
                      background: colors.bgSecondary, borderRadius: radius.md,
                      padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13,
                    }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có dữ liệu thiết bị hiện tại
                    </div>
                  )}
                </div>

                {/* Tình trạng hệ thống — luôn hiển thị */}
                <div style={{ marginBottom: 16, opacity: lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-report-analytics" style={{ fontSize: 14 }} />
                    Thông tin hiện trạng
                    {!lanForm?.current_status || !Object.values(lanForm.current_status).some(Boolean) && <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>}
                  </div>
                  {lanForm?.current_status && Object.values(lanForm.current_status).some(Boolean) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        { key: 'internet_connection', icon: 'ti-world',       label: 'Kết nối Internet' },
                        { key: 'security_system',     icon: 'ti-shield-lock', label: 'Hệ thống bảo mật' },
                        { key: 'switch_system',       icon: 'ti-switch',      label: 'Hệ thống Switch' },
                        { key: 'wifi_system',         icon: 'ti-wifi',        label: 'Hệ thống Wifi' },
                        { key: 'cable_system',        icon: 'ti-plug',        label: 'Hệ thống cáp mạng' },
                      ] as { key: string; icon: string; label: string }[])
                        .map(f => (
                          <div key={f.key} style={{
                            background: colors.bgSecondary, borderRadius: radius.md,
                            padding: '10px 14px', border: `1px solid ${colors.borderLight}`,
                            opacity: lanForm.current_status[f.key] ? 1 : 0.6,
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className={`ti ${f.icon}`} style={{ fontSize: 13, color: colors.primary }} />
                              {f.label}
                              {!lanForm.current_status[f.key] && <span style={{ fontSize: 10, marginLeft: 'auto', color: colors.warning }}>⚠️ Trống</span>}
                            </div>
                            <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                              {lanForm.current_status[f.key] || <i>Chưa cập nhật</i>}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div style={{
                      background: colors.bgSecondary, borderRadius: radius.md,
                      padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13,
                    }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có mô tả tình trạng hệ thống
                    </div>
                  )}
                </div>

                {/* Thiết bị đề xuất — luôn hiển thị */}
                <div style={{ marginBottom: 16, opacity: report.items && report.items.length > 0 ? 1 : 0.6 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: report.items && report.items.length > 0 ? colors.primary : colors.warning,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="ti ti-bulb" style={{ fontSize: 14 }} />
                    Thiết bị đề xuất nâng cấp
                    {report.items && report.items.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 'auto', color: colors.textSecondary }}>({report.items.length} loại)</span>}
                    {(!report.items || report.items.length === 0) && <span style={{ fontSize: 10, marginLeft: 'auto', fontWeight: 400 }}>⚠️ Chưa cập nhật</span>}
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
                    <div style={{
                      background: colors.bgSecondary, borderRadius: radius.md,
                      padding: '20px', textAlign: 'center', color: colors.textSecondary, fontSize: 13,
                    }}>
                      <i className="ti ti-inbox" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                      Chưa có thiết bị đề xuất
                    </div>
                  )}
                </div>

                {/* Ghi chú */}
                {lanForm?.general_note && (
                  <div style={{
                    background: '#fffbeb', border: `1px solid #fde68a`,
                    borderRadius: radius.md, padding: '12px 14px',
                  }}>
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
// SurveyTab — Danh sách + xem chi tiết phiếu khảo sát
// ─────────────────────────────────────────────────────────────
function SurveyTab({ surveys, loading, pomId }: {
  surveys: SurveyReport[]
  loading: boolean
  pomId: number
}) {
  const [detailId, setDetailId] = useState<number | null>(null)

  const kindLabel = (r: SurveyReport) => {
    try {
      const p = JSON.parse(r.general_note ?? '{}')
      if (p?.kind === 'lan')  return { icon: 'ti-network', label: 'Mạng LAN' }
      if (p?.kind === 'led')  return { icon: 'ti-device-tv', label: 'Màn hình LED' }
      if (p?.kind === 'hall') return { icon: 'ti-presentation', label: 'Hội trường' }
      if (p?.kind === 'cctv') return { icon: 'ti-camera', label: 'Camera CCTV' }
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
          <EmptyState icon="ti-clipboard-off" title="Chưa có phiếu khảo sát"
            desc="Kỹ thuật chưa tạo phiếu khảo sát nào gắn với POM này" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {surveys.map((sr) => {
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

// ── Main Page ────────────────────────────────────────────────
export default function MyPomPage() {
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()
  const [filters, setFilters] = useState<PomFilters>({})
  const { data: poms, loading, reload } = usePoms(filters)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: detail, loading: loadingDetail, reload: reloadDetail } = usePomDetail(selectedId)

  // Modal states
  const [showReturn, setShowReturn]   = useState(false)
  const [exporting,  setExporting]    = useState(false)

  const handleApprove = async (id: number) => {
    try {
      await withLoading(async () => {
        await PomService.updateStatus(id, 'reviewed', user!.id)
        notify.success('Duyệt POM thành công')
        reload(); reloadDetail()
      }, 'Đang duyệt POM...')
    } catch (err: any) {
      notify.error(err.message || 'Duyệt thất bại')
    }
  }

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Xóa POM "${code}"?`)) return
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

  const handleReturn = async (id: number, reason: string) => {
    try {
      await withLoading(async () => {
        const r = await window.api.poms.return(id, reason)
        if (r.success) {
          notify.success('Trả lại POM thành công')
          setShowReturn(false); reload(); reloadDetail()
        } else {
          notify.error('Lỗi: ' + r.error)
        }
      }, 'Đang trả lại POM...')
    } catch (err: any) {
      notify.error(err.message || 'Trả lại thất bại')
    }
  }

  const handleExport = async (id: number, isPreview: boolean) => {
    setExporting(true)
    try {
      const r = await window.api.poms.exportExcel(id, isPreview)
      if (r.success) {
        notify.success('Xuất Excel thành công')
        reload(); reloadDetail()
      } else if (r.error !== 'Hủy') {
        notify.error('Lỗi xuất Excel: ' + r.error)
      }
    } catch (err: any) {
      notify.error(err.message || 'Xuất Excel thất bại')
    } finally {
      setExporting(false)
    }
  }

  const counts = {
    all:       poms.length,
    submitted: poms.filter(p => p.status === 'submitted').length,
    reviewed:  poms.filter(p => p.status === 'reviewed').length,
    exported:  poms.filter(p => p.status === 'exported').length,
  }

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Tổng POM"      value={counts.all}       accent={colors.primary} />
          <StatCard label="Chờ duyệt"     value={counts.submitted} accent={colors.warning} />
          <StatCard label="Đã duyệt"      value={counts.reviewed}  accent={colors.secondary} />
          <StatCard label="Đã xuất Excel" value={counts.exported}  accent={colors.success} />
        </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Left — danh sách */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: colors.bgPrimary, border: `0.5px solid ${colors.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: colors.textTertiary, pointerEvents: 'none' }} />
              <input style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: 13, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, boxSizing: 'border-box' }}
                placeholder="Tìm POM, dự án..."
                value={filters.search ?? ''}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))} />
            </div>
            <select style={{ padding: '7px 8px', fontSize: 12, borderRadius: 8, border: `0.5px solid ${colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, cursor: 'pointer' }}
              value={filters.status ?? ''}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value as any || undefined }))}>
              <option value="">Tất cả</option>
              {Object.entries(STATUS_POM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <LoadingSpinner /> : poms.length === 0 ? (
              <EmptyState icon="ti-file-off" message="Không có POM nào" />
            ) : poms.map(pom => (
              <PomListItem key={pom.id} pom={pom}
                active={selectedId === pom.id}
                onClick={() => setSelectedId(pom.id)} />
            ))}
          </div>
        </div>

        {/* Right — chi tiết */}
        <div style={{ flex: 1, background: colors.bgPrimary, border: `0.5px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loadingDetail ? <LoadingSpinner /> : !detail ? (
            <EmptyState icon="ti-file-description" message="Chọn một POM để xem chi tiết" />
          ) : (
            <PomDetailPanel
              pom={detail}
              exporting={exporting}
              onApprove={() => handleApprove(detail.id)}
              onReturn={() => setShowReturn(true)}
              onDelete={() => handleDelete(detail.id, detail.pom_code)}
              onExport={(isPreview) => handleExport(detail.id, isPreview)}
            />
          )}
        </div>
      </div>

        {/* Return modal */}
        {showReturn && detail && (
          <ReturnModal
            pomCode={detail.pom_code}
            onClose={() => setShowReturn(false)}
            onConfirm={(reason) => handleReturn(detail.id, reason)}
          />
        )}
      </div>
    </PageTransition>
  )
}

// ── POM List Item ────────────────────────────────────────────
function PomListItem({ pom, active, onClick }: { pom: Pom; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick}
      onMouseEnter={e => !active && (e.currentTarget.style.background = colors.bgSecondary)}
      onMouseLeave={e => !active && (e.currentTarget.style.background = '')}
      style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', border: `1px solid ${active ? colors.primary : 'transparent'}`, background: active ? colors.primaryLight : '', transition: 'all .1s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pom.project_name}
          </div>
          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
            {pom.pom_code}{pom.customer_name && ` · ${pom.customer_name}`}
          </div>
        </div>
        <PomBadge status={pom.status} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: colors.textTertiary }}>
          <i className="ti ti-box" style={{ fontSize: 11 }} /> {pom.item_count ?? 0} thiết bị
        </div>
        {!!pom.total_amount && (
          <span style={{ fontSize: 12, fontWeight: 500, color: colors.primary }}>
            {formatVND(pom.total_amount)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── POM Detail Panel ─────────────────────────────────────────
function PomDetailPanel({ pom, exporting, onApprove, onReturn, onDelete, onExport }: {
  pom: any
  exporting: boolean
  onApprove: () => void
  onReturn:  () => void
  onDelete:  () => void
  onExport:  (isPreview: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<'items' | 'surveys'>('items')
  const { data: surveys, loading: surveyLoading, reload: reloadSurveys } = usePomSurveys(pom.id)

  const totalAmount = pom.items.reduce((s: number, i: any) =>
    s + (i.total_price ?? i.quantity * i.unit_price * (1 + i.vat_rate)), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>{pom.project_name}</div>
          <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 3 }}>
            {pom.pom_code}
            {pom.customer_name && ` · ${pom.customer_name}`}
            {pom.solution_name && ` · ${pom.solution_name}`}
          </div>
        </div>
        <PomBadge status={pom.status} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 20px', borderBottom: `0.5px solid ${colors.borderLight}`, fontSize: 12, color: colors.textTertiary, flexWrap: 'wrap', flexShrink: 0 }}>
        <span><i className="ti ti-user" style={{ fontSize: 12 }} /> {pom.created_by_name}</span>
        <span><i className="ti ti-calendar" style={{ fontSize: 12 }} /> {new Date(pom.created_at).toLocaleDateString('vi-VN')}</span>
        <span><i className="ti ti-box" style={{ fontSize: 12 }} /> {pom.items.length} thiết bị</span>
        <span style={{ color: colors.primary, fontWeight: 500 }}>
          <i className="ti ti-coins" style={{ fontSize: 12 }} /> {formatVND(totalAmount)}
        </span>
      </div>

      {/* Return reason — hiện nếu POM đang là draft và có lý do trả về */}
      {pom.status === 'draft' && pom.return_reason && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 20px', background: '#fff5f5', borderBottom: `0.5px solid #fecaca`, alignItems: 'flex-start', flexShrink: 0 }}>
          <i className="ti ti-arrow-back-up" style={{ fontSize: 15, color: colors.danger, marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: colors.danger, marginBottom: 2 }}>Kinh doanh trả về — lý do:</div>
            <div style={{ fontSize: 13, color: '#7f1d1d' }}>{pom.return_reason}</div>
          </div>
        </div>
      )}

      {/* Note */}
      {pom.note && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 20px', background: '#fffbeb', borderBottom: `0.5px solid #fde68a`, alignItems: 'flex-start', flexShrink: 0 }}>
          <i className="ti ti-notes" style={{ fontSize: 13, color: colors.textTertiary, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>{pom.note}</span>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${colors.border}`, flexShrink: 0 }}>
        {([
          { key: 'items',   label: 'Danh sách thiết bị', icon: 'ti-box'      },
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

      {/* ── Tab: Danh sách thiết bị ── */}
      {activeTab === 'items' && (
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
                <Td align="right" style={{ fontWeight: 500, color: colors.textPrimary }}>
                  {formatVND(item.total_price ?? item.quantity * item.unit_price * (1 + item.vat_rate))}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: colors.bgSecondary, borderTop: `1px solid ${colors.border}` }}>
              <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>Tổng cộng (đã VAT):</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: colors.primary, fontSize: 13 }}>{formatVND(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}


      {/* ── Tab: Phiếu khảo sát ── */}
      {activeTab === 'surveys' && (
        <SurveyTab surveys={surveys} loading={surveyLoading} pomId={pom.id} />
      )}


      {/* Action bar */}
      <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>

        {/* Left: Xóa — ẩn khi POM đã được duyệt hoặc đã xuất */}
        {(pom.status === 'draft' || pom.status === 'submitted') && (
          <Button variant="danger" icon="ti-trash" onClick={onDelete}>Xóa</Button>
        )}

        {/* Right: actions theo status */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

          {/* Xuất Excel preview — cho cả submitted và reviewed */}
          {(pom.status === 'submitted' || pom.status === 'reviewed') && (
            <Button variant="secondary" icon="ti-file-spreadsheet" loading={exporting}
              onClick={() => onExport(true)}>
              Xuất preview
            </Button>
          )}

          {/* Sales chỉ xem — việc duyệt do Trưởng phòng KT */}
          {pom.status === 'submitted' && (
            <div style={{ fontSize: 13, color: colors.warning, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-clock" />
              Đang chờ Trưởng phòng KT duyệt
            </div>
          )}

          {/* Xuất Excel chính thức — chỉ khi reviewed */}
          {pom.status === 'reviewed' && (
            <Button variant="primary" icon="ti-file-spreadsheet" loading={exporting}
              onClick={() => onExport(false)}>
              Xuất Excel chính thức
            </Button>
          )}

          {/* Xuất lại — khi đã exported */}
          {pom.status === 'exported' && (
            <Button variant="secondary" icon="ti-file-spreadsheet" loading={exporting}
              onClick={() => onExport(false)}>
              Xuất lại Excel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Return Modal ─────────────────────────────────────────────
function ReturnModal({ pomCode, onClose, onConfirm }: {
  pomCode: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error,  setError]  = useState('')

  const handleConfirm = () => {
    if (!reason.trim()) { setError('Vui lòng nhập lý do trả về.'); return }
    onConfirm(reason.trim())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-arrow-back-up" style={{ fontSize: 18, color: colors.warning }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>Trả POM về Kỹ thuật</div>
            <div style={{ fontSize: 12, color: colors.textTertiary }}>{pomCode}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: 4, borderRadius: 6 }}>
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ background: '#fffbeb', border: `0.5px solid #fde68a`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#78350f' }}>
            <i className="ti ti-info-circle" style={{ fontSize: 14, marginRight: 6 }} />
            POM sẽ trở về trạng thái <b>Draft</b>. Kỹ thuật sẽ thấy lý do và chỉnh sửa lại.
          </div>

          <label style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary, display: 'block', marginBottom: 6 }}>
            Lý do trả về <span style={{ color: colors.danger }}>*</span>
          </label>
          <textarea
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8, border: `1.5px solid ${error ? colors.danger : colors.border}`, background: colors.bgSecondary, color: colors.textPrimary, boxSizing: 'border-box', outline: 'none', resize: 'vertical', height: 100, fontFamily: 'inherit' }}
            placeholder="Ví dụ: Thiếu thiết bị phòng họp, cần bổ sung thêm màn hình và camera..."
            value={reason}
            onChange={e => { setReason(e.target.value); setError('') }}
            autoFocus
          />
          {error && <div style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}><i className="ti ti-alert-circle" style={{ fontSize: 11, marginRight: 3 }} />{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="secondary" icon="ti-arrow-back-up"
            style={{ background: '#fffbeb', color: colors.warning, borderColor: '#fde68a' }}
            onClick={handleConfirm}>
            Xác nhận trả về
          </Button>
        </div>
      </div>
    </div>
  )
}
