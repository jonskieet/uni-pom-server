// src/pages/survey/SurveyReportPage.tsx
// Tạo phiếu khảo sát — dùng Dynamic Form từ template DB
// Bước 1: Chọn loại (từ DB, không hardcode)
// Bước 2: Chọn POM liên kết
// Bước 3: Điền form động theo template

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../store/auth'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors, radius, commonStyles } from '../../styles/theme'
import { Button, LoadingSpinner, EmptyState } from '../../components/ui'
import type { Pom, SurveyFormTemplate } from '../../types'
import { useNavigate } from 'react-router-dom'
import DynamicFormRenderer, { buildDefaultData, type DynamicFormData } from './DynamicFormRenderer'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type WizardStep = 'kind' | 'pom' | 'form'

// ─────────────────────────────────────────────────────────────
// SERVICES
// ─────────────────────────────────────────────────────────────
const SurveyService = {
  create:      (d: any)                   => (window as any).api.survey.create(d),
  updateItems: (id: number, items: any[]) => (window as any).api.survey.updateItems(id, items),
  update:      (id: number, data: any)    => (window as any).api.survey.update(id, data),
}

const PomApi = {
  getAll: (filters?: any) => (window as any).api.poms.getAll(filters),
}

const TemplateApi = {
  getAll: () => (window as any).api.formTemplates.getAll(),
}

// ─────────────────────────────────────────────────────────────
// STEP BAR
// ─────────────────────────────────────────────────────────────
function StepBar({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'kind', label: 'Chọn loại khảo sát' },
    { key: 'pom',  label: 'Chọn POM liên kết'  },
    { key: 'form', label: 'Nhập thông tin'      },
  ]
  const idx: Record<WizardStep, number> = { kind: 0, pom: 1, form: 2 }

  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 24,
      border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
      {steps.map((s, i) => {
        const active = step === s.key
        const done   = idx[step] > i
        return (
          <div key={s.key} style={{
            flex: 1, padding: '9px 12px', textAlign: 'center', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: done ? colors.successLight : active ? colors.primaryLight : colors.bgSecondary,
            color: done ? colors.success : active ? colors.primary : colors.textTertiary,
            fontWeight: active || done ? 600 : 400,
            borderRight: i < 2 ? `1px solid ${colors.border}` : 'none',
          }}>
            {done
              ? <i className="ti ti-check" style={{ fontSize: 12 }} />
              : <span style={{
                  width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                  background: active ? colors.primary : '#d1d5db', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</span>
            }
            {s.label}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STEP 1 — Chọn loại khảo sát (từ DB)
// ─────────────────────────────────────────────────────────────
function StepKind({ selected, onSelect }: {
  selected: SurveyFormTemplate | null
  onSelect: (t: SurveyFormTemplate) => void
}) {
  const [templates, setTemplates] = useState<SurveyFormTemplate[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    setLoading(true)
    TemplateApi.getAll()
      .then((data: any) => setTemplates(Array.isArray(data) ? data.filter((t: any) => t.is_active) : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>

  // Các loại chưa có template (sắp ra mắt - hardcode icon)
  const comingSoon = [
    { label: 'Màn hình LED',        icon: 'ti-device-tv',    desc: 'Khảo sát vị trí, kích thước, nguồn điện cho màn hình LED' },
    { label: 'Phòng họp / Hội trường', icon: 'ti-presentation', desc: 'Khảo sát hội trường, phòng họp, hội nghị trực tuyến' },
    { label: 'Camera CCTV',         icon: 'ti-camera',       desc: 'Khảo sát vị trí camera, hệ thống ghi hình, lưu trữ' },
  ].filter(c => !templates.some(t => t.name.toLowerCase().includes(c.label.toLowerCase().split('/')[0].trim())))

  return (
    <div>
      <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 16px' }}>
        Chọn loại khảo sát để bắt đầu tạo phiếu báo cáo.
      </p>

      {templates.length === 0 && (
        <div style={{
          padding: '24px', background: colors.warningLight, borderRadius: radius.md,
          textAlign: 'center', color: colors.warning, fontSize: 13, marginBottom: 12,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
          Chưa có mẫu phiếu nào. Trưởng phòng KT cần tạo mẫu trước trong phần <b>Quản lý mẫu phiếu</b>.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {templates.map(t => (
          <div
            key={t.id}
            onClick={() => onSelect(t)}
            style={{
              border: `2px solid ${selected?.id === t.id ? colors.primary : colors.border}`,
              borderRadius: radius.lg, padding: '18px 16px', cursor: 'pointer',
              background: selected?.id === t.id ? colors.primaryLight : colors.bgPrimary,
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: radius.md, flexShrink: 0,
                background: selected?.id === t.id ? colors.primary : colors.bgSecondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className={`ti ${t.icon ?? 'ti-clipboard'}`} style={{ fontSize: 20,
                  color: selected?.id === t.id ? '#fff' : colors.textSecondary }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary }}>{t.name}</div>
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.5 }}>{t.description}</div>
          </div>
        ))}

        {comingSoon.map(c => (
          <div key={c.label} style={{
            border: `2px solid ${colors.borderLight}`, borderRadius: radius.lg,
            padding: '18px 16px', opacity: 0.5, cursor: 'not-allowed',
            background: colors.bgSecondary,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: radius.md, flexShrink: 0,
                background: colors.bgTertiary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className={`ti ${c.icon}`} style={{ fontSize: 20, color: colors.textTertiary }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary }}>{c.label}</div>
                <span style={{ fontSize: 10, color: colors.warning, background: colors.warningLight,
                  padding: '1px 6px', borderRadius: radius.full }}>
                  <i className="ti ti-clock" style={{ fontSize: 10, marginRight: 3 }} />Sắp ra mắt
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.5 }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STEP 2 — Chọn POM liên kết
// ─────────────────────────────────────────────────────────────
function StepPom({ selected, onSelect }: {
  selected: Pom | null
  onSelect: (p: Pom) => void
}) {
  const [poms, setPoms]       = useState<Pom[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await PomApi.getAll({ exclude_surveyed: true })
      setPoms(Array.isArray(res) ? res : (res?.data ?? []))
    }
    catch { setPoms([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = poms.filter(p =>
    !search || p.project_name.toLowerCase().includes(search.toLowerCase()) ||
    p.pom_code.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 12px' }}>
        Chọn POM liên kết với phiếu khảo sát này.
      </p>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <i className="ti ti-search" style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, color: colors.textTertiary, pointerEvents: 'none',
        }} />
        <input
          style={{ ...commonStyles.input, paddingLeft: 32 }}
          placeholder="Tìm POM, dự án, khách hàng..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon="ti-file-off" title="Không tìm thấy POM"
            description={poms.length === 0 ? 'Tất cả POM đã có phiếu khảo sát, hoặc chưa có POM nào' : 'Thử từ khóa khác'} />
        ) : filtered.map(p => (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            style={{
              border: `2px solid ${selected?.id === p.id ? colors.primary : colors.border}`,
              borderRadius: radius.md, padding: '10px 14px', cursor: 'pointer',
              background: selected?.id === p.id ? colors.primaryLight : colors.bgPrimary,
              transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: radius.sm, flexShrink: 0,
              background: selected?.id === p.id ? colors.primary : colors.bgSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-file-invoice" style={{ fontSize: 16,
                color: selected?.id === p.id ? '#fff' : colors.textTertiary }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.project_name}
              </div>
              <div style={{ fontSize: 11, color: colors.textSecondary }}>
                <span style={{ background: colors.primaryLight, color: colors.primary,
                  padding: '1px 6px', borderRadius: radius.sm, marginRight: 6 }}>
                  {p.pom_code}
                </span>
                {p.customer_name && `${p.customer_name}`}
              </div>
            </div>
            {selected?.id === p.id && (
              <i className="ti ti-circle-check-filled" style={{ color: colors.primary, fontSize: 22, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EXPORT WORD — generic từ form data + sections
// ─────────────────────────────────────────────────────────────
function exportDynamicWord(
  template: SurveyFormTemplate,
  formData: DynamicFormData,
  reportCode: string,
  pomCode: string,
) {
  const tblStyle = `border-collapse:collapse;width:100%;font-size:11pt;`
  const thS      = `border:1px solid #000;padding:5px 7px;background:#DDEEFF;font-weight:bold;text-align:center;`
  const tdS      = `border:1px solid #000;padding:5px 7px;`

  let body = `
  <h1>Phiếu Báo Cáo Khảo Sát — ${template.name}</h1>
  <p>&#x25CF; Mã phiếu: <u>${reportCode}</u> &nbsp;|&nbsp; POM: <u>${pomCode}</u></p>`

  for (const sec of template.sections) {
    body += `\n<p class="section">${sec.title.toUpperCase()}</p>`
    const sdata = formData[sec.key]

    if (sec.type === 'fields' && sec.fields) {
      for (const f of sec.fields) {
        const val = sdata?.[f.key] ?? ''
        body += `<p>&#x25CF; ${f.label}: <u>${val || '—'}</u></p>`
      }
    } else if (sec.type === 'table' && sec.columns) {
      const rows: any[] = Array.isArray(sdata) ? sdata : []
      body += `<table>\n<thead><tr>`
      body += `<th style="${thS}width:4%">STT</th>`
      for (const col of sec.columns) {
        body += `<th style="${thS}">${col.label}</th>`
      }
      body += `</tr></thead>\n<tbody>`
      rows.forEach((row, ri) => {
        body += `<tr>`
        body += `<td style="${tdS}text-align:center">${ri + 1}</td>`
        for (const col of sec.columns!) {
          body += `<td style="${tdS}">${row[col.key] ?? ''}</td>`
        }
        body += `</tr>`
      })
      body += `</tbody></table>`
    }
  }

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 11pt; margin: 2cm; line-height: 1.5; }
    h1 { text-align: center; font-size: 14pt; text-transform: uppercase; margin-bottom: 8px; }
    .section { font-weight: bold; font-size: 12pt; margin-top: 14px; margin-bottom: 6px; }
    table { ${tblStyle} margin-bottom: 12px; }
    p { margin: 4px 0; }
  </style>
</head>
<body>${body}</body>
</html>`

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${reportCode}_${template.survey_type}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function SurveyReportPage() {
  const navigate = useNavigate()
  const { user }  = useAuth()
  const notify    = useNotification()
  const { withLoading } = useLoading()

  const [step, setStep]                   = useState<WizardStep>('kind')
  const [template, setTemplate]           = useState<SurveyFormTemplate | null>(null)
  const [selectedPom, setSelectedPom]     = useState<Pom | null>(null)
  const [formData, setFormData]           = useState<DynamicFormData>({})
  const [lastReport, setLastReport]       = useState<{ code: string; pomCode: string } | null>(null)
  const [isSaved, setIsSaved]             = useState(false)

  function handleSelectTemplate(t: SurveyFormTemplate) {
    setTemplate(t)
  }

  function handleSelectPom(p: Pom) {
    setSelectedPom(p)
    // Build default form data from template sections + pomInfo
    if (template) {
      setFormData(buildDefaultData(template.sections, {
        pom_code:      p.pom_code,
        project_name:  p.project_name,
        customer_name: p.customer_name,
      }))
    }
  }

  const canNext = step === 'kind' ? !!template : step === 'pom' ? !!selectedPom : false

  function goNext() {
    if (step === 'kind' && template) setStep('pom')
    else if (step === 'pom' && selectedPom) setStep('form')
  }

  function goBack() {
    if (step === 'pom') setStep('kind')
    else if (step === 'form') setStep('pom')
  }

  function resetWizard() {
    setStep('kind'); setTemplate(null); setSelectedPom(null)
    setFormData({}); setLastReport(null); setIsSaved(false)
  }

  // ── Lưu phiếu ──
  async function handleSave() {
    if (!selectedPom || !template || !user) return

    // Validate required fields
    for (const sec of template.sections) {
      if (sec.type === 'fields' && sec.fields) {
        for (const f of sec.fields) {
          if (f.required) {
            const val = formData[sec.key]?.[f.key]
            if (!val || String(val).trim() === '') {
              notify.error(`Vui lòng nhập: ${f.label}`)
              return
            }
          }
        }
      }
    }

    try {
      await withLoading(async () => {
        // Lấy first fields section để extract các trường cơ bản
        const firstFieldsSec = template.sections.find(s => s.type === 'fields')
        const firstData      = firstFieldsSec ? (formData[firstFieldsSec.key] ?? {}) : {}

        const unit_name     = firstData.unit_name     ?? selectedPom.customer_name ?? ''
        const surveyor_name = firstData.surveyor_name ?? ''
        const site_address  = firstData.site_address  ?? null
        const survey_date   = firstData.survey_date   ?? null

        // general_note chứa toàn bộ form data dạng JSON
        const general_note = JSON.stringify({ template_type: template.survey_type, formData })

        const res = await SurveyService.create({
          report_type:   template.survey_type,
          pom_id:        Number(selectedPom.id),
          created_by:    user.id,
          project_name:  unit_name || selectedPom.project_name,
          customer_name: selectedPom.customer_name ?? '',
          site_address,
          survey_date,
          surveyor_name,
          general_note,
        })

        if (!res?.id) throw new Error(res?.error ?? 'Server không trả về ID phiếu')

        const surveyId = Number(res.id)

        // Lấy items từ tất cả table sections (đề xuất thiết bị)
        const allItems: any[] = []
        let sortIdx = 0
        for (const sec of template.sections) {
          if (sec.type === 'table' && sec.columns) {
            const rows: any[] = Array.isArray(formData[sec.key]) ? formData[sec.key] : []
            // Tìm cột tên chính (device_name, device_type, ...)
            const nameCol = sec.columns.find(c => c.key.includes('name') || c.key.includes('type') || c.key.includes('device'))
            const qtyCol  = sec.columns.find(c => c.key.includes('quantity') || c.key.includes('qty'))
            const unitCol = sec.columns.find(c => c.key === 'unit')
            const locCol  = sec.columns.find(c => c.key.includes('location') || c.key.includes('loc'))
            const noteCol = sec.columns.find(c => c.key.includes('desc') || c.key.includes('note') || c.key.includes('function'))

            for (const row of rows) {
              const productName = nameCol ? (row[nameCol.key] ?? '') : ''
              if (!productName) continue
              allItems.push({
                product_id:        null,
                product_name:      productName,
                quantity_proposed: qtyCol  ? (Number(row[qtyCol.key])  || 0) : 0,
                quantity_actual:   qtyCol  ? (Number(row[qtyCol.key])  || 0) : 0,
                unit:              unitCol ? (row[unitCol.key] ?? 'Cái') : 'Cái',
                location:          locCol  ? (row[locCol.key] ?? null) : null,
                condition_note:    noteCol ? (row[noteCol.key] ?? null) : null,
                sort_order:        sortIdx++,
              })
            }
          }
        }

        if (allItems.length > 0) {
          await SurveyService.updateItems(surveyId, allItems)
        }

        setLastReport({ code: res.report_code, pomCode: selectedPom.pom_code })
        setIsSaved(true)
        notify.success(`✓ Lưu phiếu thành công! (${allItems.length} thiết bị)`)
      }, 'Đang lưu phiếu...')
    } catch (e: any) {
      notify.error(e.message ?? 'Lỗi không xác định khi lưu phiếu')
    }
  }

  function handleExportWord() {
    if (!lastReport || !template) return
    exportDynamicWord(template, formData, lastReport.code, lastReport.pomCode)
  }

  const pomInfo = selectedPom ? {
    pom_code:      selectedPom.pom_code,
    project_name:  selectedPom.project_name,
    customer_name: selectedPom.customer_name,
  } : null

  return (
    <PageTransition>
      <div style={{ height: '100%', overflowY: 'auto', padding: '0 2px' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step !== 'kind' && !isSaved && (
              <button onClick={goBack} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: colors.textSecondary, fontSize: 18, padding: 4,
                display: 'flex', borderRadius: radius.sm,
              }}>
                <i className="ti ti-arrow-left" />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
                {isSaved ? 'Phiếu đã lưu' : 'Tạo phiếu báo cáo khảo sát'}
              </h2>
              {selectedPom && !isSaved && (
                <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>
                  POM: <b style={{ color: colors.primary }}>{selectedPom.pom_code}</b>
                  {template && <> · <b>{template.name}</b></>}
                </p>
              )}
              {isSaved && lastReport && (
                <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>
                  Mã: <b style={{ color: colors.primary }}>{lastReport.code}</b>
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isSaved && (
              <Button variant="secondary" icon="ti-x" onClick={() => {
                if (confirm('Bạn chắc chắn muốn huỷ bỏ? Dữ liệu sẽ không được lưu.')) {
                  navigate('/survey')
                }
              }}>
                Huỷ bỏ
              </Button>
            )}
            {step === 'form' && !isSaved && (
              <Button variant="primary" icon="ti-device-floppy" onClick={handleSave}>
                Lưu phiếu
              </Button>
            )}
            {isSaved && (
              <Button variant="secondary" icon="ti-file-word" onClick={handleExportWord}>
                Xuất Word
              </Button>
            )}
          </div>
        </div>

        {/* Step bar */}
        {!isSaved && <StepBar step={step} />}

        {/* Content */}
        <div style={{
          background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
          borderRadius: radius.lg, padding: 24,
        }}>
          {step === 'kind' && (
            <StepKind selected={template} onSelect={handleSelectTemplate} />
          )}

          {step === 'pom' && (
            <StepPom selected={selectedPom} onSelect={handleSelectPom} />
          )}

          {step === 'form' && template && (
            <DynamicFormRenderer
              sections={template.sections}
              data={formData}
              onChange={setFormData}
              readonly={isSaved}
              pomInfo={pomInfo}
            />
          )}

          {/* Navigation */}
          {!isSaved && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 20, paddingTop: 16, borderTop: `1px solid ${colors.border}`,
            }}>
              <div>
                {step !== 'kind' && (
                  <Button variant="secondary" icon="ti-chevron-left" onClick={goBack}>Quay lại</Button>
                )}
              </div>
              <div>
                {step !== 'form' ? (
                  <Button variant="primary" icon="ti-chevron-right"
                    disabled={!canNext} onClick={goNext}>
                    Tiếp theo
                  </Button>
                ) : (
                  <Button variant="primary" icon="ti-device-floppy" onClick={handleSave}>
                    Lưu phiếu
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Success banner */}
        {isSaved && lastReport && (
          <div style={{
            marginTop: 12, padding: '12px 16px',
            background: colors.successLight, border: `1px solid #86efac`,
            borderRadius: radius.md, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <i className="ti ti-circle-check-filled" style={{ color: colors.success, fontSize: 22, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.success }}>
                ✓ Phiếu đã lưu: <b>{lastReport.code}</b>
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Liên kết POM: {lastReport.pomCode} · Xem lại trong tab "Báo cáo khảo sát"
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" icon="ti-file-word" onClick={handleExportWord}>
                Xuất Word
              </Button>
              <Button variant="primary" icon="ti-plus" onClick={resetWizard}>
                Tạo phiếu mới
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
