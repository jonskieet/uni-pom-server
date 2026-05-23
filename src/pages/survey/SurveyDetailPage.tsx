// ============================================================
// src/pages/survey/SurveyDetailPage.tsx
// Xem & chỉnh sửa phiếu báo cáo khảo sát (full form)
// ============================================================
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors, radius, commonStyles } from '../../styles/theme'
import { Button, EmptyState, LoadingSpinner } from '../../components/ui'
import type { SurveyDetail } from '../../types'
import type { Pom } from '../../types'

// ─────────────────────────────────────────────────────────────
// TYPES (mirror SurveyReportPage)
// ─────────────────────────────────────────────────────────────
interface LanDeviceRow {
  stt: number
  device_type: string
  model: string
  quantity: number
  function_desc: string
  location: string
}

interface LanCurrentStatus {
  internet_connection: string
  security_system: string
  switch_system: string
  wifi_system: string
  cable_system: string
}

interface LanProposedDevice {
  id: string
  device_name: string
  quantity: number
  unit: string
  function_desc: string
  deploy_location: string
}

interface LanFormData {
  unit_name: string
  survey_date: string
  surveyor_name: string
  site_address: string
  current_devices: LanDeviceRow[]
  current_status: LanCurrentStatus
  proposed_devices: LanProposedDevice[]
  general_note: string
}

// Default form khi phiếu chưa có dữ liệu
const defaultLanForm: LanFormData = {
  unit_name: '',
  survey_date: '',
  surveyor_name: '',
  site_address: '',
  current_devices: [],
  current_status: {
    internet_connection: '',
    security_system: '',
    switch_system: '',
    wifi_system: '',
    cable_system: '',
  },
  proposed_devices: [],
  general_note: '',
}

// ─────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────
const SurveyService = {
  getById:     (id: number)               => (window as any).api.survey.getById(id),
  update:      (id: number, data: any)    => (window as any).api.survey.update(id, data),
  updateItems: (id: number, items: any[]) => (window as any).api.survey.updateItems(id, items),
}

// ─────────────────────────────────────────────────────────────
// SECTION CARD (reuse style from SurveyReportPage)
// ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${colors.border}`,
      borderRadius: radius.lg, padding: '20px 24px', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 16, paddingBottom: 12,
        borderBottom: `1px solid ${colors.borderLight}`,
        fontSize: 11, fontWeight: 700, color: colors.primary,
        textTransform: 'uppercase' as const, letterSpacing: '0.06em',
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15 }} />
        {title}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FULL LAN FORM EDITOR (tái sử dụng từ SurveyReportPage)
// ─────────────────────────────────────────────────────────────
function LanFormEditor({
  form, pomInfo, readonly = false,
  updateField, updateDevice, updateStatus, updateProposed,
  addDevice, addProposed, removeDevice, removeProposed,
}: {
  form: LanFormData
  pomInfo: { pom_code?: string; project_name?: string; customer_name?: string } | null
  readonly?: boolean
  updateField: (k: keyof LanFormData, v: any) => void
  updateDevice: (i: number, f: keyof LanDeviceRow, v: any) => void
  updateStatus: (k: keyof LanCurrentStatus, v: string) => void
  updateProposed: (id: string, f: keyof LanProposedDevice, v: any) => void
  addDevice: () => void
  addProposed: () => void
  removeDevice: (i: number) => void
  removeProposed: (id: string) => void
}) {
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: colors.textSecondary,
    display: 'block', marginBottom: 5,
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 11px', fontSize: 13,
    borderRadius: radius.md, border: `1px solid ${colors.border}`,
    background: readonly ? colors.bgSecondary : colors.bgPrimary,
    color: colors.textPrimary,
    boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit',
    opacity: readonly ? 0.7 : 1,
  }
  const inpSm: React.CSSProperties = { ...inp, padding: '6px 8px', fontSize: 12 }
  const ta: React.CSSProperties = {
    ...inp, resize: 'vertical' as const, minHeight: 72,
    lineHeight: 1.6, fontFamily: 'inherit',
  }
  const TH: React.CSSProperties = {
    background: colors.primary, color: '#fff',
    padding: '8px 10px', fontSize: 12, fontWeight: 600,
    textAlign: 'left' as const, whiteSpace: 'nowrap' as const, border: 'none',
  }
  const TD: React.CSSProperties = {
    padding: '5px 6px', verticalAlign: 'middle' as const,
    borderBottom: `1px solid ${colors.borderLight}`,
  }

  const STATUS_FIELDS: { key: keyof LanCurrentStatus; icon: string; label: string; placeholder: string }[] = [
    { key: 'internet_connection', icon: 'ti-world',       label: 'Kết nối Internet',                   placeholder: 'Mô tả hiện trạng kết nối internet: số đường truyền, nhà mạng, cách phân phối...' },
    { key: 'security_system',     icon: 'ti-shield-lock', label: 'Hệ thống bảo mật an toàn thông tin', placeholder: 'Mô tả thiết bị tường lửa, cân bằng tải, các rủi ro bảo mật hiện tại...' },
    { key: 'switch_system',       icon: 'ti-switch',      label: 'Hệ thống Switch',                    placeholder: 'Mô tả loại Switch (managed/unmanaged), tình trạng, hạn chế hiện có...' },
    { key: 'wifi_system',         icon: 'ti-wifi',        label: 'Hệ thống Wifi',                      placeholder: 'Mô tả vùng phủ sóng, thiết bị AP, chất lượng kết nối không dây...' },
    { key: 'cable_system',        icon: 'ti-plug',        label: 'Hệ thống dây cáp mạng',              placeholder: 'Mô tả tình trạng cáp, đi dây âm tường hay nổi, cần thay thế hay không...' },
  ]

  return (
    <div>
      {/* POM info strip */}
      {pomInfo && (
        <div style={{
          background: colors.primaryLight, borderRadius: radius.md,
          padding: '8px 16px', marginBottom: 16,
          fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
          border: `1px solid #c7d2fe`,
        }}>
          <span>
            <i className="ti ti-file-invoice" style={{ marginRight: 5, color: colors.primary }} />
            POM: <b style={{ color: colors.primary }}>{pomInfo.pom_code ?? 'N/A'}</b>
          </span>
          {pomInfo.project_name && (
            <span style={{ color: colors.textSecondary }}>Dự án: <b style={{ color: colors.textPrimary }}>{pomInfo.project_name}</b></span>
          )}
          {pomInfo.customer_name && (
            <span style={{ color: colors.textSecondary }}>Khách hàng: <b style={{ color: colors.textPrimary }}>{pomInfo.customer_name}</b></span>
          )}
        </div>
      )}

      {/* ① Thông tin chung */}
      <SectionCard icon="ti-info-circle" title="Thông tin chung">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Tên đơn vị khảo sát <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={inp} value={form.unit_name} disabled={readonly}
              onChange={e => updateField('unit_name', e.target.value)}
              placeholder="VD: UBND xã Đắk Song" />
          </div>
          <div>
            <label style={lbl}>Thời gian khảo sát</label>
            <input style={inp} type="date" value={form.survey_date} disabled={readonly}
              onChange={e => updateField('survey_date', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Người thực hiện khảo sát <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={inp} value={form.surveyor_name} disabled={readonly}
              onChange={e => updateField('surveyor_name', e.target.value)}
              placeholder="Họ tên kỹ thuật viên" />
          </div>
        </div>
        <div>
          <label style={lbl}>Địa chỉ đơn vị</label>
          <input style={inp} value={form.site_address} disabled={readonly}
            onChange={e => updateField('site_address', e.target.value)}
            placeholder="Địa chỉ cụ thể của đơn vị khảo sát" />
        </div>
      </SectionCard>

      {/* ② Hiện trạng trang thiết bị CNTT */}
      <SectionCard icon="ti-device-desktop" title="Hiện trạng trang thiết bị CNTT">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 44, textAlign: 'center', borderRadius: '6px 0 0 0' }}>STT</th>
                <th style={{ ...TH, width: 160 }}>Thiết bị</th>
                <th style={{ ...TH, width: 150 }}>Phân loại / Model</th>
                <th style={{ ...TH, width: 84, textAlign: 'center' }}>Số lượng</th>
                <th style={TH}>Chức năng & Mô tả</th>
                <th style={{ ...TH, width: 200 }}>Bộ phận sử dụng</th>
                <th style={{ ...TH, width: 36, borderRadius: '0 6px 0 0' }}></th>
              </tr>
            </thead>
            <tbody>
              {form.current_devices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...TD, textAlign: 'center', color: colors.textTertiary, padding: '16px', fontStyle: 'italic' }}>
                    {readonly ? '(Chưa có dữ liệu thiết bị)' : 'Nhấn "Thêm thiết bị" để bắt đầu nhập'}
                  </td>
                </tr>
              ) : form.current_devices.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : colors.bgSecondary }}>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: colors.textTertiary, fontSize: 12 }}>{i + 1}</td>
                  <td style={TD}>
                    <input value={r.device_type} disabled={readonly}
                      onChange={e => updateDevice(i, 'device_type', e.target.value)}
                      style={inpSm} placeholder="Tên thiết bị" />
                  </td>
                  <td style={TD}>
                    <input value={r.model} disabled={readonly}
                      onChange={e => updateDevice(i, 'model', e.target.value)}
                      style={{ ...inpSm, fontStyle: r.model ? 'normal' : 'italic' }}
                      placeholder="Model / Mô tả" />
                  </td>
                  <td style={TD}>
                    <input type="number" min={0} value={r.quantity} disabled={readonly}
                      onChange={e => updateDevice(i, 'quantity', Number(e.target.value))}
                      style={{ ...inpSm, width: 68, textAlign: 'center' }} />
                  </td>
                  <td style={TD}>
                    <input value={r.function_desc} disabled={readonly}
                      onChange={e => updateDevice(i, 'function_desc', e.target.value)}
                      style={inpSm} placeholder="Chức năng chính" />
                  </td>
                  <td style={TD}>
                    <input value={r.location} disabled={readonly}
                      onChange={e => updateDevice(i, 'location', e.target.value)}
                      style={inpSm} placeholder="Khu vực / Phòng ban" />
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {!readonly && (
                      <button onClick={() => removeDevice(i)} title="Xóa dòng" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ef4444', fontSize: 18, padding: '0 4px', lineHeight: 1,
                      }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readonly && (
          <button onClick={addDevice} style={{
            marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: colors.primaryLight, color: colors.primary,
            border: `1px dashed #a5b4fc`, borderRadius: radius.md,
            padding: '7px 14px', fontSize: 12, cursor: 'pointer',
          }}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} /> Thêm thiết bị
          </button>
        )}
      </SectionCard>

      {/* ③ Thông tin hiện trạng */}
      <SectionCard icon="ti-report-analytics" title="Thông tin hiện trạng">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STATUS_FIELDS.map(({ key, icon, label, placeholder }) => (
            <div key={key}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: colors.textSecondary,
                marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className={`ti ${icon}`} style={{ fontSize: 14, color: colors.primary }} />
                {label}
              </div>
              <textarea
                style={ta}
                value={form.current_status[key]}
                disabled={readonly}
                onChange={e => updateStatus(key, e.target.value)}
                placeholder={placeholder}
                rows={3}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ④ Đề xuất nâng cấp */}
      <SectionCard icon="ti-bulb" title="Nhu cầu đề xuất nâng cấp trang thiết bị mạng LAN">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 44, textAlign: 'center', borderRadius: '6px 0 0 0' }}>STT</th>
                <th style={TH}>Tên thiết bị</th>
                <th style={{ ...TH, width: 84, textAlign: 'center' }}>Số lượng</th>
                <th style={{ ...TH, width: 84 }}>ĐVT</th>
                <th style={TH}>Chức năng / Mô tả</th>
                <th style={{ ...TH, width: 190, borderRadius: '0 6px 0 0' }}>Vị trí triển khai</th>
                <th style={{ ...TH, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {form.proposed_devices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...TD, textAlign: 'center', color: colors.textTertiary, padding: '16px', fontStyle: 'italic' }}>
                    {readonly ? '(Chưa có thiết bị đề xuất)' : 'Nhấn "Thêm thiết bị đề xuất" để bắt đầu'}
                  </td>
                </tr>
              ) : form.proposed_devices.map((d, i) => (
                <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : colors.bgSecondary }}>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: colors.textTertiary, fontSize: 12 }}>{i + 1}</td>
                  <td style={TD}>
                    <input value={d.device_name} disabled={readonly}
                      onChange={e => updateProposed(d.id, 'device_name', e.target.value)}
                      style={inpSm} placeholder="Tên thiết bị" />
                  </td>
                  <td style={TD}>
                    <input type="number" min={0} value={d.quantity} disabled={readonly}
                      onChange={e => updateProposed(d.id, 'quantity', Number(e.target.value))}
                      style={{ ...inpSm, width: 68, textAlign: 'center' }} />
                  </td>
                  <td style={TD}>
                    <select value={d.unit} disabled={readonly}
                      onChange={e => updateProposed(d.id, 'unit', e.target.value)}
                      style={{ ...inpSm, width: 78 }}>
                      {['Cái', 'Bộ', 'Cuộn', 'Thùng', 'License', 'Hộp', 'Gói'].map(u =>
                        <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={TD}>
                    <input value={d.function_desc} disabled={readonly}
                      onChange={e => updateProposed(d.id, 'function_desc', e.target.value)}
                      style={inpSm} placeholder="Mô tả chức năng" />
                  </td>
                  <td style={TD}>
                    <input value={d.deploy_location} disabled={readonly}
                      onChange={e => updateProposed(d.id, 'deploy_location', e.target.value)}
                      style={inpSm} placeholder="Phòng / Khu vực" />
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {!readonly && (
                      <button onClick={() => removeProposed(d.id)} title="Xóa" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ef4444', fontSize: 18, padding: '0 4px', lineHeight: 1,
                      }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readonly && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <button onClick={addProposed} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: colors.primaryLight, color: colors.primary,
              border: `1px dashed #a5b4fc`, borderRadius: radius.md,
              padding: '7px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              <i className="ti ti-plus" style={{ fontSize: 13 }} /> Thêm thiết bị đề xuất
            </button>
            {form.proposed_devices.length > 0 && (
              <div style={{ fontSize: 12, color: colors.textSecondary, display: 'flex', gap: 18 }}>
                <span>Loại thiết bị: <b style={{ color: colors.primary }}>
                  {form.proposed_devices.filter(d => d.device_name).length}
                </b></span>
                <span>Tổng số lượng: <b style={{ color: colors.success }}>
                  {form.proposed_devices.reduce((s, d) => s + d.quantity, 0)}
                </b></span>
              </div>
            )}
          </div>
        )}
        {readonly && form.proposed_devices.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.textSecondary, display: 'flex', gap: 18 }}>
            <span>Loại thiết bị: <b style={{ color: colors.primary }}>
              {form.proposed_devices.filter(d => d.device_name).length}
            </b></span>
            <span>Tổng số lượng: <b style={{ color: colors.success }}>
              {form.proposed_devices.reduce((s, d) => s + d.quantity, 0)}
            </b></span>
          </div>
        )}
      </SectionCard>

      {/* ⑤ Ghi chú chung */}
      <SectionCard icon="ti-notes" title="Ghi chú / Sơ đồ lắp đặt">
        <textarea
          style={{ ...ta, minHeight: 80 }}
          value={form.general_note}
          disabled={readonly}
          onChange={e => updateField('general_note', e.target.value)}
          placeholder="Ghi chú thêm, mô tả sơ đồ lắp đặt, lưu ý đặc biệt..."
          rows={3}
        />
      </SectionCard>

      <style>{`
        input:focus, textarea:focus, select:focus {
          border-color: ${colors.primary} !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EXPORT WORD
// ─────────────────────────────────────────────────────────────
function exportLanWord(form: LanFormData, survey: SurveyDetail) {
  const tblStyle = `border-collapse:collapse;width:100%;font-size:11pt;`
  const thS = `border:1px solid #000;padding:5px 7px;background:#DDEEFF;font-weight:bold;text-align:center;`
  const tdS = `border:1px solid #000;padding:5px 7px;`

  const deviceRows = form.current_devices.map((r, i) => `
    <tr>
      <td style="${tdS}text-align:center">${i + 1}</td>
      <td style="${tdS}">${r.device_type}</td>
      <td style="${tdS}font-style:italic">${r.model || 'Chưa có'}</td>
      <td style="${tdS}text-align:center">${r.quantity > 0 ? r.quantity : '0'}</td>
      <td style="${tdS}">${r.function_desc}</td>
      <td style="${tdS}">${r.location}</td>
    </tr>`).join('')

  const proposedRows = form.proposed_devices.filter(d => d.device_name).map((d, i) => `
    <tr>
      <td style="${tdS}text-align:center">${i + 1}</td>
      <td style="${tdS}">${d.device_name}</td>
      <td style="${tdS}text-align:center">${d.quantity} ${d.unit}</td>
      <td style="${tdS}">${d.function_desc}</td>
      <td style="${tdS}">${d.deploy_location}</td>
    </tr>`).join('')

  const statusSection = (label: string, text: string) => text ? `
    <p style="font-weight:bold;margin-top:10px">&#x25A0; ${label}</p>
    <p style="margin-left:24px">${text.replace(/\n/g, '<br>')}</p>` : ''

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 11pt; margin: 2cm; line-height: 1.5; }
    h1 { text-align: center; font-size: 14pt; text-transform: uppercase; margin-bottom: 4px; }
    .section { font-weight: bold; font-size: 12pt; margin-top: 16px; margin-bottom: 6px; }
    table { ${tblStyle} margin-bottom: 12px; }
    p { margin: 4px 0; }
  </style>
</head>
<body>
  <h1>Phiếu Báo Cáo Khảo Sát Hiện Trạng Mạng Nội Bộ</h1>
  <p class="section">I. THÔNG TIN CHUNG</p>
  <p>&#x25CF; Tên đơn vị khảo sát: <u>${form.unit_name}</u></p>
  <p>&#x25CF; Thời gian khảo sát: <u>${form.survey_date ? new Date(form.survey_date).toLocaleDateString('vi-VN') : ''}</u></p>
  <p>&#x25CF; Người khảo sát: <u>${form.surveyor_name}</u></p>
  <p>&#x25CF; Địa chỉ: <u>${form.site_address}</u></p>
  <p>&#x25CF; Mã POM liên kết: <u>${survey.pom_code ?? 'N/A'}</u> &nbsp;|&nbsp; Mã phiếu: <u>${survey.report_code}</u></p>
  <p class="section">II. KHẢO SÁT HIỆN TRẠNG TRANG THIẾT BỊ CNTT</p>
  <table>
    <thead>
      <tr>
        <th style="${thS}width:4%">STT</th>
        <th style="${thS}width:18%">Thiết bị</th>
        <th style="${thS}width:14%">Phân loại</th>
        <th style="${thS}width:8%">Số lượng</th>
        <th style="${thS}width:30%">Chức năng &amp; Mô tả</th>
        <th style="${thS}width:26%">Bộ phận sử dụng</th>
      </tr>
    </thead>
    <tbody>${deviceRows || '<tr><td colspan="6" style="text-align:center;padding:8px">(Chưa có dữ liệu)</td></tr>'}</tbody>
  </table>
  <p class="section">III. THÔNG TIN HIỆN TRẠNG</p>
  ${statusSection('Kết nối Internet', form.current_status.internet_connection)}
  ${statusSection('Hệ thống bảo mật an toàn thông tin', form.current_status.security_system)}
  ${statusSection('Hệ thống Switch', form.current_status.switch_system)}
  ${statusSection('Hệ thống Wifi', form.current_status.wifi_system)}
  ${statusSection('Hệ thống dây cáp mạng', form.current_status.cable_system)}
  <p class="section">IV. NHU CẦU ĐỀ XUẤT NÂNG CẤP TRANG THIẾT BỊ MẠNG LAN</p>
  <p><b>Danh sách thiết bị đề xuất:</b></p>
  <table>
    <thead>
      <tr>
        <th style="${thS}width:5%">STT</th>
        <th style="${thS}width:25%">Tên thiết bị</th>
        <th style="${thS}width:12%">Số lượng</th>
        <th style="${thS}width:33%">Chức năng / Mô tả</th>
        <th style="${thS}width:25%">Vị trí triển khai</th>
      </tr>
    </thead>
    <tbody>${proposedRows || '<tr><td colspan="5" style="text-align:center;padding:8px">(Chưa có dữ liệu)</td></tr>'}</tbody>
  </table>
  ${form.general_note ? `<p class="section">V. GHI CHÚ CHUNG</p><p>${form.general_note.replace(/\n/g, '<br>')}</p>` : ''}
  <br/><br/>
  <table style="width:100%;border:none">
    <tr>
      <td style="width:50%;text-align:center;border:none">
        <p><b>Người khảo sát</b></p>
        <p style="margin-top:60px"><i>(Ký, ghi rõ họ tên)</i></p>
        <p>${form.surveyor_name}</p>
      </td>
      <td style="width:50%;text-align:center;border:none">
        <p><b>Đại diện đơn vị</b></p>
        <p style="margin-top:60px"><i>(Ký tên, đóng dấu)</i></p>
      </td>
    </tr>
  </table>
</body>
</html>`

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${survey.report_code}_BaoCaoKhaoSat_MangLAN.doc`
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()

  // FIX: dùng ref để giữ notify ổn định, tránh useEffect vòng lặp vô hạn
  const notifyRef = useRef(notify)
  useEffect(() => { notifyRef.current = notify })

  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [lanForm, setLanForm] = useState<LanFormData | null>(null)
  const [editingForm, setEditingForm] = useState<LanFormData | null>(null)
  const [kind, setKind] = useState<'lan' | null>(null)

  // Load phiếu từ DB — deps chỉ [id, navigate], bỏ notify tránh vòng lặp
  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      try {
        const res = await SurveyService.getById(Number(id))
        if (res?.id) {
          setSurvey(res)
          if (res.general_note) {
            try {
              const parsed = JSON.parse(res.general_note)
              setKind(parsed.kind ?? 'lan')
              setLanForm(parsed.lanForm ?? defaultLanForm)
            } catch {
              notifyRef.current.error('Lỗi khi đọc dữ liệu phiếu, hiển thị form trống')
              setKind('lan')
              setLanForm(defaultLanForm)
            }
          } else {
            setKind('lan')
            setLanForm(defaultLanForm)
          }
        } else {
          notifyRef.current.error('Không tìm thấy phiếu')
          navigate('/survey')
        }
      } catch (e: any) {
        notifyRef.current.error(e.message ?? 'Lỗi khi tải phiếu')
        navigate('/survey')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, navigate])

  // Bắt đầu chỉnh sửa — copy lanForm vào editingForm
  function handleStartEdit() {
    if (!lanForm) return
    setEditingForm(JSON.parse(JSON.stringify(lanForm))) // deep clone
    setIsEditing(true)
  }

  // Hủy chỉnh sửa — bỏ editingForm
  function handleCancelEdit() {
    setEditingForm(null)
    setIsEditing(false)
  }

  // ── Updater helpers cho editingForm ──
  const updateField = (k: keyof LanFormData, v: any) =>
    setEditingForm(f => f ? { ...f, [k]: v } : f)

  const updateDevice = (i: number, f: keyof LanDeviceRow, v: any) =>
    setEditingForm(frm => frm ? ({
      ...frm,
      current_devices: frm.current_devices.map((r, idx) => idx === i ? { ...r, [f]: v } : r),
    }) : frm)

  const updateStatus = (k: keyof LanCurrentStatus, v: string) =>
    setEditingForm(f => f ? ({ ...f, current_status: { ...f.current_status, [k]: v } }) : f)

  const updateProposed = (pid: string, f: keyof LanProposedDevice, v: any) =>
    setEditingForm(frm => frm ? ({
      ...frm,
      proposed_devices: frm.proposed_devices.map(d => d.id === pid ? { ...d, [f]: v } : d),
    }) : frm)

  const addDevice = () =>
    setEditingForm(f => f ? ({
      ...f,
      current_devices: [...f.current_devices, {
        stt: f.current_devices.length + 1, device_type: '', model: '',
        quantity: 0, function_desc: '', location: '',
      }],
    }) : f)

  const removeDevice = (i: number) =>
    setEditingForm(f => f ? ({
      ...f,
      current_devices: f.current_devices.filter((_, idx) => idx !== i)
        .map((r, idx) => ({ ...r, stt: idx + 1 })),
    }) : f)

  const addProposed = () =>
    setEditingForm(f => f ? ({
      ...f,
      proposed_devices: [...f.proposed_devices, {
        id: Date.now().toString(), device_name: '', quantity: 1,
        unit: 'Cái', function_desc: '', deploy_location: '',
      }],
    }) : f)

  const removeProposed = (pid: string) =>
    setEditingForm(f => f ? ({ ...f, proposed_devices: f.proposed_devices.filter(d => d.id !== pid) }) : f)

  // Lưu phiếu
  async function handleSave() {
    if (!survey || !editingForm) return
    if (!editingForm.unit_name.trim())     { notifyRef.current.error('Vui lòng nhập tên đơn vị'); return }
    if (!editingForm.surveyor_name.trim()) { notifyRef.current.error('Vui lòng nhập tên người khảo sát'); return }

    try {
      await withLoading(async () => {
        const general_note = JSON.stringify({ kind, lanForm: editingForm })

        await SurveyService.update(survey.id, {
          general_note,
          surveyor_name: editingForm.surveyor_name || null,
          survey_date:   editingForm.survey_date   || null,
          site_address:  editingForm.site_address  || null,
        })

        const items = editingForm.proposed_devices
          .filter(d => d.device_name?.trim())
          .map((d, i) => ({
            product_id:        null,
            product_name:      d.device_name,
            quantity_proposed: Number(d.quantity) || 0,
            quantity_actual:   Number(d.quantity) || 0,
            unit:              d.unit,
            location:          d.deploy_location || null,
            condition_note:    d.function_desc   || null,
            sort_order:        i,
          }))

        await SurveyService.updateItems(survey.id, items)

        // Cập nhật state local
        setLanForm(editingForm)
        setEditingForm(null)
        setIsEditing(false)
        notifyRef.current.success('Lưu phiếu thành công!')
      }, 'Đang lưu...')
    } catch (e: any) {
      notifyRef.current.error(e.message ?? 'Lỗi khi lưu phiếu')
    }
  }

  // Kiểm tra quyền chỉnh sửa
  const canEdit = survey?.status === 'draft' &&
    (!user || survey.created_by === user.id || user.role === 'admin')

  // Form hiện tại để hiển thị (editing hoặc read-only)
  const displayForm = isEditing ? editingForm : lanForm

  // ── Render ──
  if (loading)
    return (
      <PageTransition>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageTransition>
    )

  if (!survey || !lanForm)
    return (
      <PageTransition>
        <div style={{ padding: 40 }}>
          <EmptyState icon="ti-file-off" title="Phiếu không tìm thấy" desc="Quay lại danh sách phiếu" />
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Button variant="primary" icon="ti-arrow-left" onClick={() => navigate('/survey')}>
              Quay lại
            </Button>
          </div>
        </div>
      </PageTransition>
    )

  return (
    <PageTransition>
      <div style={{ height: '100%', overflowY: 'auto', padding: '0 2px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => navigate('/survey')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: colors.textSecondary, fontSize: 20, padding: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <i className="ti ti-arrow-left" />
            </button>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
                {survey.report_code}
              </h2>
              <p style={{ fontSize: 12, color: colors.textSecondary, margin: '4px 0 0' }}>
                {survey.project_name}
                {survey.customer_name && ` • ${survey.customer_name}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Badge trạng thái */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: radius.full, fontSize: 12, fontWeight: 600,
              background: survey.status === 'draft' ? colors.warningLight : colors.successLight,
              color: survey.status === 'draft' ? colors.warning : colors.success,
            }}>
              <i className={`ti ti-${survey.status === 'draft' ? 'file' : 'circle-check'}`} />
              {survey.status === 'draft' ? 'Nháp' : 'Hoàn thành'}
            </span>

            {isEditing ? (
              <>
                <Button variant="secondary" onClick={handleCancelEdit}>Hủy</Button>
                <Button variant="primary" icon="ti-device-floppy" onClick={handleSave}>Lưu</Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button variant="secondary" icon="ti-edit" onClick={handleStartEdit}>
                    Chỉnh sửa
                  </Button>
                )}
                <Button variant="secondary" icon="ti-file-word" onClick={() => exportLanWord(lanForm, survey)}>
                  Xuất Word
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Banner thông báo ── */}
        {isEditing ? (
          <div style={{
            marginBottom: 16, padding: '10px 16px',
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: radius.md, fontSize: 13, color: '#1d4ed8',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-edit" />
            Bạn đang chỉnh sửa phiếu. Nhấn <b>"Lưu"</b> để cập nhật hoặc <b>"Hủy"</b> để bỏ qua thay đổi.
          </div>
        ) : !canEdit && survey.status === 'draft' ? (
          <div style={{
            marginBottom: 16, padding: '10px 16px',
            background: colors.warningLight, border: `1px solid #fcd34d`,
            borderRadius: radius.md, fontSize: 13, color: '#92400e',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-lock" />
            Bạn không có quyền chỉnh sửa phiếu này.
          </div>
        ) : survey.status !== 'draft' ? (
          <div style={{
            marginBottom: 16, padding: '10px 16px',
            background: colors.successLight, border: `1px solid #86efac`,
            borderRadius: radius.md, fontSize: 13, color: '#166534',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-circle-check" />
            Phiếu đã hoàn thành. Dữ liệu được hiển thị ở chế độ chỉ đọc.
          </div>
        ) : null}

        {/* ── Full LAN Form ── */}
        {displayForm && (
          <LanFormEditor
            form={displayForm}
            pomInfo={{
              pom_code:      survey.pom_code,
              project_name:  survey.project_name,
              customer_name: survey.customer_name,
            }}
            readonly={!isEditing}
            updateField={updateField}
            updateDevice={updateDevice}
            updateStatus={updateStatus}
            updateProposed={updateProposed}
            addDevice={addDevice}
            addProposed={addProposed}
            removeDevice={removeDevice}
            removeProposed={removeProposed}
          />
        )}
      </div>
    </PageTransition>
  )
}
