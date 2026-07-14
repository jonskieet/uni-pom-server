// ============================================================
// src/pages/survey/SurveyListPage.tsx
// Danh sách phiếu báo cáo khảo sát — Xem, chỉnh sửa, xuất Word
// Dành cho role: technical, technical_lead
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { useNotification, useLoading, useConfirm } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors, radius, commonStyles } from '../../styles/theme'
import { Button, EmptyState, LoadingSpinner, StatCard } from '../../components/ui'
import type { SurveyReport, SurveyFilters } from '../../types'
import { usePolling, POLL_INTERVAL_LIST } from '../../hooks'

// ─────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────
const SurveyService = {
  getAll: (filters?: any) => (window as any).api.survey.getAll(filters),
  getById: (id: number) => (window as any).api.survey.getById(id),
  delete: (id: number) => (window as any).api.survey.delete(id),
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────
function useSurveys(filters?: SurveyFilters) {
  const [data, setData] = useState<SurveyReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await SurveyService.getAll(filters)
      setData(Array.isArray(res) ? res : (res?.data ?? []))
    } catch {
      if (!silent) setData([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filters?.status, filters?.report_type, filters?.search])

  useEffect(() => {
    load()
  }, [load])
  usePolling(() => load(true), { intervalMs: POLL_INTERVAL_LIST })

  return { data, loading, reload: load }
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function SurveyListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const notify = useNotification()
  const { withLoading } = useLoading()
  const { confirm, ConfirmNode } = useConfirm()

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'draft' | 'completed' | ''>('')
  const [typeFilter, setTypeFilter] = useState<'site_survey' | 'as_built' | 'acceptance' | ''>('')
  const [searchText, setSearchText] = useState('')

  const filters: SurveyFilters = {
    status: statusFilter || undefined,
    report_type: typeFilter || undefined,
    search: searchText || undefined,
  }

  const { data: surveys, loading, reload } = useSurveys(filters)

  // Thống kê
  const stats = {
    total: surveys.length,
    draft: surveys.filter(s => s.status === 'draft').length,
    completed: surveys.filter(s => s.status === 'completed').length,
  }

  // Xóa phiếu
  async function handleDelete(id: number) {
    const ok = await confirm({
      title:        'Xoá phiếu khảo sát?',
      message:      'Thao tác này không thể hoàn tác.',
      variant:      'danger',
      confirmLabel: 'Xoá phiếu',
    })
    if (!ok) return

    try {
      await withLoading(
        async () => {
          await SurveyService.delete(id)
          notify.success('Xóa phiếu thành công!')
          reload()
        },
        'Đang xóa...'
      )
    } catch (e: any) {
      notify.error(e.message ?? 'Lỗi khi xóa phiếu')
    }
  }

  // Điều hướng tới chi tiết phiếu (xem & chỉnh sửa)
  function handleViewReport(id: number) {
    navigate(`/survey-detail/${id}`)
  }

  // Tạo phiếu mới
  function handleCreateNew() {
    navigate('/survey-report')
  }

  // ──────────────────────────────────────────────────────────
  const statusLabel = (s: 'draft' | 'completed') => s === 'draft' ? 'Nháp' : 'Hoàn thành'
  const statusColor = (s: 'draft' | 'completed') =>
    s === 'draft' ? colors.warning : colors.success

  const typeLabel = (t: any) => {
    const map: Record<string, string> = {
      'site_survey': 'Khảo sát hiện trạng',
      'as_built': 'As-built',
      'acceptance': 'Bàn giao',
    }
    return map[t] ?? t
  }

  return (
    <PageTransition>
      <div style={{ height: '100%', overflowY: 'auto', padding: '0 2px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
              <i className="ti ti-report" style={{ marginRight: 8 }} />
              Báo cáo khảo sát
            </h2>
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}>
              Xem, chỉnh sửa và quản lý các phiếu báo cáo khảo sát của bạn
            </p>
          </div>

          <Button variant="primary" icon="ti-plus" onClick={handleCreateNew}>
            Tạo phiếu mới
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard
            label="Tổng phiếu"
            value={stats.total}
            accent={colors.primary}
          />
          <StatCard
            label="Nháp"
            value={stats.draft}
            accent={colors.warning}
          />
          <StatCard
            label="Hoàn thành"
            value={stats.completed}
            accent={colors.success}
          />
        </div>

        {/* Filters */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            padding: '16px',
            marginBottom: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr) auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              <i className="ti ti-search" style={{ marginRight: 4 }} />
              Tìm kiếm
            </label>
            <input
              style={commonStyles.input}
              placeholder="Mã phiếu, dự án, khách hàng..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              Trạng thái
            </label>
            <select
              style={{ ...commonStyles.input, boxSizing: 'border-box' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
            >
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              Loại khảo sát
            </label>
            <select
              style={{ ...commonStyles.input, boxSizing: 'border-box' }}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
            >
              <option value="">Tất cả</option>
              <option value="site_survey">Khảo sát hiện trạng</option>
              <option value="as_built">As-built</option>
              <option value="acceptance">Bàn giao</option>
            </select>
          </div>

          <Button
            variant="secondary"
            icon="ti-rotate-clockwise"
            onClick={() => reload()}
          >
            Làm mới
          </Button>
        </div>

        {/* List */}
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <LoadingSpinner />
            </div>
          ) : surveys.length === 0 ? (
            <div style={{ padding: 40 }}>
              <EmptyState
                icon="ti-file-off"
                title={searchText || statusFilter || typeFilter ? 'Không tìm thấy phiếu' : 'Chưa có phiếu khảo sát'}
                desc={
                  searchText || statusFilter || typeFilter
                    ? 'Thử thay đổi bộ lọc'
                    : 'Bắt đầu bằng cách tạo phiếu báo cáo khảo sát mới'
                }
              />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: colors.bgSecondary, borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: colors.textSecondary }}>
                      Mã phiếu
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: colors.textSecondary }}>
                      Dự án / Khách hàng
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: colors.textSecondary }}>
                      Loại khảo sát
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: colors.textSecondary }}>
                      Trạng thái
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: colors.textSecondary }}>
                      Ngày tạo
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: colors.textSecondary }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((s, i) => (
                    <tr
                      key={s.id}
                      style={{
                        background: i % 2 === 0 ? '#fff' : colors.bgPrimary,
                        borderBottom: `1px solid ${colors.border}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.primaryLight)}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : colors.bgPrimary)}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: colors.primary }}>
                        {s.report_code}
                        {s.word_file_name && (
                          <i
                            className="ti ti-file-word"
                            title={`Đã có file Word: ${s.word_file_name}`}
                            style={{ marginLeft: 6, fontSize: 13, color: '#1a56db' }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: colors.textPrimary }}>{s.project_name}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                          {s.customer_name || 'N/A'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: colors.textSecondary }}>
                        {typeLabel(s.report_type)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: radius.full,
                            fontSize: 11,
                            fontWeight: 600,
                            background: `${statusColor(s.status)}15`,
                            color: statusColor(s.status),
                          }}
                        >
                          <i className={`ti ti-${s.status === 'draft' ? 'file' : 'circle-check'}`} />
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: colors.textSecondary }}>
                        {new Date(s.created_at).toLocaleDateString('vi-VN')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button
                            onClick={() => handleViewReport(s.id)}
                            title="Xem chi tiết"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: colors.primary,
                              cursor: 'pointer',
                              fontSize: 18,
                              padding: '4px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: radius.sm,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = colors.primaryLight)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <i className="ti ti-eye" />
                          </button>

                          <button
                            onClick={() => handleDelete(s.id)}
                            title="Xóa"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 18,
                              padding: '4px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: radius.sm,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fecaca')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {ConfirmNode}
    </PageTransition>
  )
}
