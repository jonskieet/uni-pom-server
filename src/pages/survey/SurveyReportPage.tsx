// src/pages/survey/SurveyReportPage.tsx
// Trang TẠO phiếu báo cáo khảo sát (role kỹ thuật)
// UPDATED: Step 1 load solutions từ DB, Step 3 dùng FormRenderer từ template

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { useNotification, useLoading } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors, radius, commonStyles } from '../../styles/theme'
import { Button, LoadingSpinner, EmptyState, SelectPrompt } from '../../components/ui'
import { FormRenderer } from '../../components/FormRenderer'
import type { Pom } from '../../types'
import type { FormTemplate, FormData as CustomFormData } from '../../types/form'
import { usePolling, POLL_INTERVAL_REF } from '../../hooks'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type WizardStep = 'solution' | 'pom' | 'form'

interface SolutionWithTemplate {
  id:          number
  name:        string
  code:        string
  description: string | null
  is_active:   boolean
  template:    FormTemplate | null
}

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

const SolutionApi = {
  getAll:       ()           => (window as any).api.solutions.getAll(),
  getTemplates: (sid: number) => (window as any).api.formTemplates.getAll(sid),
}

// ─────────────────────────────────────────────────────────────
// STEP BAR
// ─────────────────────────────────────────────────────────────

function StepBar({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'solution', label: 'Chọn giải pháp'  },
    { key: 'pom',      label: 'Chọn POM liên kết' },
    { key: 'form',     label: 'Điền thông tin'   },
  ]
  const idx: Record<WizardStep, number> = { solution: 0, pom: 1, form: 2 }

  return (
    <div style={{
      display: 'flex', gap: 0, marginBottom: 24,
      border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden',
    }}>
      {steps.map((s, i) => {
        const active = step === s.key
        const done   = idx[step] > i
        return (
          <div key={s.key} style={{
            flex: 1, padding: '9px 12px', textAlign: 'center', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: done ? colors.successLight : active ? colors.primaryLight : colors.bgSecondary,
            color:      done ? colors.success      : active ? colors.primary      : colors.textTertiary,
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
// STEP 1 — Chọn giải pháp (load động từ DB)
// ─────────────────────────────────────────────────────────────

function StepSolution({ selected, onSelect }: {
  selected: SolutionWithTemplate | null
  onSelect: (s: SolutionWithTemplate) => void
}) {
  const [solutions, setSolutions] = useState<SolutionWithTemplate[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // Load solutions
      const sRes = await SolutionApi.getAll()
      const sArr: any[] = Array.isArray(sRes) ? sRes : (sRes?.data ?? [])

      // Load templates cho tất cả solutions (1 call)
      const tRes = await (window as any).api.formTemplates.getAll()
      const tArr: any[] = Array.isArray(tRes) ? tRes : (tRes?.data ?? [])

      // Map template vào từng solution
      const merged: SolutionWithTemplate[] = sArr
        .filter(s => s.is_active)
        .map(s => ({
          id:          s.id,
          name:        s.name,
          code:        s.code,
          description: s.description ?? null,
          is_active:   s.is_active,
          template:    tArr.find((t: any) => t.solution_id === s.id && t.is_active) ?? null,
        }))

      setSolutions(merged)
    } catch {
      if (!silent) setSolutions([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  // Giải pháp/form template ít đổi — cập nhật ngầm theo chu kỳ thưa
  usePolling(() => load(true), { intervalMs: POLL_INTERVAL_REF })

  if (loading) return <LoadingSpinner label="Đang tải giải pháp..." />

  if (solutions.length === 0) return (
    <EmptyState
      icon="ti-layout-off"
      message="Chưa có giải pháp nào"
      subMessage="Liên hệ Trưởng phòng KT để thêm giải pháp và thiết kế form"
    />
  )

  return (
    <div>
      <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 16px' }}>
        Chọn giải pháp để bắt đầu tạo phiếu báo cáo khảo sát.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {solutions.map((s, idx) => {
          const isSelected = selected?.id === s.id
          const hasTemplate = !!s.template
          return (
            <div
              key={s.id}
              onClick={() => hasTemplate && onSelect(s)}
              className="stat-card"
              style={{
                animationDelay: `${0.04 + idx * 0.05}s`,
                border: `2px solid ${isSelected ? colors.primary : hasTemplate ? colors.border : colors.borderLight}`,
                borderRadius: radius.lg, padding: '16px',
                cursor: hasTemplate ? 'pointer' : 'not-allowed',
                background: isSelected ? colors.primaryLight : colors.bgPrimary,
                opacity: hasTemplate ? 1 : 0.55,
                transition: 'all .15s',
                position: 'relative',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: radius.md, flexShrink: 0,
                  background: isSelected ? colors.primary : colors.bgSecondary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="ti ti-layout-grid"
                    style={{ fontSize: 18, color: isSelected ? '#fff' : colors.textSecondary }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary }}>
                    {s.name}
                  </div>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
                    padding: '1px 6px', borderRadius: 4,
                    background: isSelected ? '#c7d2fe' : colors.bgTertiary,
                    color: isSelected ? colors.primary : colors.textTertiary,
                  }}>{s.code}</span>
                </div>
              </div>

              {/* Description */}
              {s.description && (
                <p style={{ fontSize: 12, color: colors.textSecondary,
                  margin: '0 0 8px', lineHeight: 1.5 }}>
                  {s.description}
                </p>
              )}

              {/* Template status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {hasTemplate ? (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                    background: isSelected ? '#bbf7d0' : colors.successLight,
                    color: colors.success, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <i className="ti ti-clipboard-check" style={{ fontSize: 11 }} />
                    Có form · {((s.template as any)?.schema as any[])?.length ?? 0} trường
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                    background: '#fef9c3', color: '#92400e',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <i className="ti ti-clock" style={{ fontSize: 11 }} />
                    Chưa có form — liên hệ Trưởng phòng KT
                  </span>
                )}
              </div>

              {/* Selected check */}
              {isSelected && (
                <i className="ti ti-circle-check-filled" style={{
                  position: 'absolute', top: 12, right: 12,
                  color: colors.primary, fontSize: 20,
                }} />
              )}
            </div>
          )
        })}
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await PomApi.getAll({ exclude_surveyed: true })
      setPoms(Array.isArray(res) ? res : (res?.data ?? []))
    } catch { if (!silent) setPoms([]) }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  // Danh sách BOM khả dụng để chọn — cập nhật ngầm khi có BOM mới đủ điều kiện
  usePolling(() => load(true), { intervalMs: POLL_INTERVAL_REF })

  const filtered = poms.filter(p =>
    !search ||
    p.project_name.toLowerCase().includes(search.toLowerCase()) ||
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
        <input style={{ ...commonStyles.input, paddingLeft: 32 }}
          placeholder="Tìm POM, dự án, khách hàng..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="ti-file-off" message="Không tìm thấy POM"
            subMessage={poms.length === 0 ? 'Chưa có POM nào' : 'Thử từ khóa khác'} />
        ) : filtered.map((p, idx) => (
          <div key={p.id} onClick={() => onSelect(p)} className="list-item" style={{
            animationDelay: `${0.04 + idx * 0.03}s`,
            border: `2px solid ${selected?.id === p.id ? colors.primary : colors.border}`,
            borderRadius: radius.md, padding: '10px 14px', cursor: 'pointer',
            background: selected?.id === p.id ? colors.primaryLight : colors.bgPrimary,
            transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: radius.sm, flexShrink: 0,
              background: selected?.id === p.id ? colors.primary : colors.bgSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-file-invoice" style={{
                fontSize: 16, color: selected?.id === p.id ? '#fff' : colors.textTertiary }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.project_name}
              </div>
              <div style={{ fontSize: 11, color: colors.textSecondary }}>
                <span style={{
                  background: colors.primaryLight, color: colors.primary,
                  padding: '1px 6px', borderRadius: radius.sm, marginRight: 6,
                }}>{p.pom_code}</span>
                {p.customer_name}
              </div>
            </div>
            {selected?.id === p.id && (
              <i className="ti ti-circle-check-filled"
                style={{ color: colors.primary, fontSize: 22, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STEP 3 — Điền form (FormRenderer từ template)
// ─────────────────────────────────────────────────────────────

function StepForm({ solution, pom, formData, onChange, readOnly }: {
  solution:  SolutionWithTemplate
  pom:       Pom
  formData:  CustomFormData
  onChange:  (data: CustomFormData) => void
  readOnly?: boolean
}) {
  const template = solution.template

  return (
    <div>
      {/* POM + solution info strip */}
      <div style={{
        background: colors.primaryLight, borderRadius: radius.md,
        padding: '8px 16px', marginBottom: 20,
        fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
        border: `1px solid #c7d2fe`,
      }}>
        <span>
          <i className="ti ti-layout-grid" style={{ marginRight: 5, color: colors.primary }} />
          Giải pháp: <b style={{ color: colors.primary }}>{solution.name}</b>
        </span>
        <span style={{ color: colors.textSecondary }}>
          POM: <b style={{ color: colors.primary }}>{pom.pom_code}</b>
        </span>
        <span style={{ color: colors.textSecondary }}>
          Dự án: <b style={{ color: colors.textPrimary }}>{pom.project_name}</b>
        </span>
        {pom.customer_name && (
          <span style={{ color: colors.textSecondary }}>
            KH: <b style={{ color: colors.textPrimary }}>{pom.customer_name}</b>
          </span>
        )}
      </div>

      {/* Form title */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: colors.textPrimary,
        marginBottom: 16, paddingBottom: 10,
        borderBottom: `2px solid ${colors.primary}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <i className="ti ti-clipboard-text" style={{ color: colors.primary, fontSize: 18 }} />
        {template?.name ?? 'Phiếu báo cáo khảo sát'}
        {template && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 9999,
            background: colors.bgSecondary, color: colors.textTertiary,
            fontWeight: 400, marginLeft: 4,
          }}>
            v{template.version} · {((template as any).schema as any[])?.length ?? 0} trường
          </span>
        )}
      </div>

      {/* FormRenderer */}
      {template ? (
        <FormRenderer
          template={{
            ...template,
            fields: ((template as any).schema ?? template.fields ?? []) as any,
          }}
          data={formData}
          onChange={onChange}
          readOnly={readOnly}
        />
      ) : (
        <SelectPrompt
          icon="ti-clipboard-off"
          message="Giải pháp này chưa có form template"
          subMessage="Liên hệ Trưởng phòng KT để thiết kế form"
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function SurveyReportPage() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const notify     = useNotification()
  const { withLoading } = useLoading()

  const [step,             setStep]             = useState<WizardStep>('solution')
  const [selectedSolution, setSelectedSolution] = useState<SolutionWithTemplate | null>(null)
  const [selectedPom,      setSelectedPom]      = useState<Pom | null>(null)
  const [formData,         setFormData]         = useState<CustomFormData>({})
  const [lastReport,       setLastReport]       = useState<{ code: string; pomCode: string } | null>(null)
  const [isSaved,          setIsSaved]          = useState(false)

  const canNext =
    step === 'solution' ? !!selectedSolution :
    step === 'pom'      ? !!selectedPom      : false

  function goNext() {
    if (step === 'solution' && selectedSolution) setStep('pom')
    else if (step === 'pom' && selectedPom)      setStep('form')
  }

  function goBack() {
    if (step === 'pom')  setStep('solution')
    if (step === 'form') setStep('pom')
  }

  function resetWizard() {
    setStep('solution'); setSelectedSolution(null); setSelectedPom(null)
    setFormData({}); setLastReport(null); setIsSaved(false)
  }

  // ── Lưu phiếu ───────────────────────────────────────────────
  async function handleSave() {
    if (!selectedPom || !selectedSolution || !user) return
    if (!selectedSolution.template) {
      notify.error('Giải pháp này chưa có form template')
      return
    }

    try {
      await withLoading(async () => {
        const template = selectedSolution.template!

        // Lấy trường tên đơn vị, ngày, người KS từ formData nếu có
        const projectName  = formData['unit_name']     ?? formData['ten_don_vi'] ?? selectedPom.project_name
        const surveyDate   = formData['survey_date']   ?? formData['ngay_khao_sat'] ?? null
        const surveyorName = formData['surveyor_name'] ?? formData['nguoi_khao_sat'] ?? null
        const siteAddress  = formData['site_address']  ?? formData['dia_chi'] ?? null

        const res = await SurveyService.create({
          report_type:      'site_survey',
          pom_id:           Number(selectedPom.id),
          created_by:       user.id,
          project_name:     projectName,
          customer_name:    selectedPom.customer_name ?? '',
          site_address:     siteAddress,
          survey_date:      surveyDate,
          surveyor_name:    surveyorName,
          general_note:     JSON.stringify({ solution_code: selectedSolution.code }),
          form_template_id: template.id,
          form_data:        formData,
        })

        if (!res?.id) throw new Error(res?.error ?? 'Server không trả về ID phiếu')

        setLastReport({ code: res.report_code, pomCode: selectedPom.pom_code })
        setIsSaved(true)
        notify.success(`✓ Lưu phiếu thành công! Mã: ${res.report_code}`)
      }, 'Đang lưu phiếu...')
    } catch (e: any) {
      notify.error(e.message ?? 'Lỗi không xác định khi lưu phiếu')
    }
  }

  return (
    <PageTransition>
      <div style={{ height: '100%', overflowY: 'auto', padding: '0 2px' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step !== 'solution' && !isSaved && (
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
                {isSaved ? 'Phiếu đã lưu thành công' : 'Tạo phiếu báo cáo khảo sát'}
              </h2>
              {selectedSolution && !isSaved && (
                <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>
                  {selectedSolution.name}
                  {selectedPom && <> · POM <b style={{ color: colors.primary }}>{selectedPom.pom_code}</b></>}
                </p>
              )}
              {isSaved && lastReport && (
                <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>
                  Mã phiếu: <b style={{ color: colors.primary }}>{lastReport.code}</b>
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isSaved && (
              <Button variant="secondary" icon="ti-x"
                onClick={() => {
                  if (confirm('Huỷ bỏ? Dữ liệu chưa lưu sẽ mất.')) navigate('/survey')
                }}>
                Huỷ bỏ
              </Button>
            )}
            {step === 'form' && !isSaved && (
              <Button variant="primary" icon="ti-device-floppy" onClick={handleSave}>
                Lưu phiếu
              </Button>
            )}
          </div>
        </div>

        {/* Step bar */}
        {!isSaved && <StepBar step={step} />}

        {/* Content card */}
        <div key={step} className="panel-in-right" style={{
          background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
          borderRadius: radius.lg, padding: 24,
        }}>
          {step === 'solution' && (
            <StepSolution selected={selectedSolution} onSelect={s => setSelectedSolution(s)} />
          )}

          {step === 'pom' && (
            <StepPom selected={selectedPom} onSelect={p => setSelectedPom(p)} />
          )}

          {step === 'form' && selectedSolution && selectedPom && (
            <StepForm
              solution={selectedSolution}
              pom={selectedPom}
              formData={formData}
              onChange={setFormData}
              readOnly={isSaved}
            />
          )}

          {/* Navigation */}
          {!isSaved && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 24, paddingTop: 16, borderTop: `1px solid ${colors.border}`,
            }}>
              <div>
                {step !== 'solution' && (
                  <Button variant="secondary" icon="ti-chevron-left" onClick={goBack}>
                    Quay lại
                  </Button>
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
            marginTop: 12, padding: '14px 18px',
            background: colors.successLight, border: `1px solid #86efac`,
            borderRadius: radius.md, display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <i className="ti ti-circle-check-filled"
              style={{ color: colors.success, fontSize: 28, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.success }}>
                Phiếu đã được lưu thành công
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Mã phiếu: <b>{lastReport.code}</b>
                {' · '}POM: {lastReport.pomCode}
                {' · '}Giải pháp: {selectedSolution?.name}
              </div>
              <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                Dữ liệu form đã lưu vào hệ thống. Xem lại trong tab "Báo cáo KS".
              </div>
            </div>
            <Button variant="primary" icon="ti-plus" onClick={resetWizard}>
              Tạo phiếu mới
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
