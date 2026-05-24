// src/pages/solutions/SolutionsPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSolutions, useFormTemplates } from '../../hooks'
import { useNotification, useConfirm, Button, LoadingSpinner, EmptyState, StatCard, Th, Td } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors } from '../../styles/theme'

export default function SolutionsPage() {
  const navigate = useNavigate()
  const { data: solutions, loading } = useSolutions()
  const { data: templates } = useFormTemplates()
  const notify = useNotification()
  const { confirm, ConfirmNode } = useConfirm()
  const [search, setSearch] = useState('')

  // Map solution_id → has template
  const templateMap = new Map(templates.map(t => [t.solution_id, t]))

  const filtered = solutions.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = solutions.filter(s => s.is_active).length

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <StatCard label="Tổng giải pháp" value={solutions.length} />
          <StatCard label="Đang hoạt động" value={activeCount} accent={colors.success} />
          <StatCard label="Có form thiết kế" value={templateMap.size}
            sub={`/ ${solutions.length} giải pháp`} accent={colors.primary} />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
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
              placeholder="Tìm theo tên, mã giải pháp..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', border: `0.5px solid ${colors.border}`,
          borderRadius: 12, overflow: 'hidden', flex: 1,
        }}>
          {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
            <EmptyState icon="ti-layout-off" message="Không có giải pháp nào" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <Th width="5%">#</Th>
                  <Th width="20%">Mã</Th>
                  <Th width="30%">Tên giải pháp</Th>
                  <Th width="25%">Mô tả</Th>
                  <Th width="10%" align="center">Form</Th>
                  <Th width="10%" align="center">Trạng thái</Th>
                  <Th width="10%"></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const hasTemplate = templateMap.has(s.id)
                  const tmpl = templateMap.get(s.id)
                  return (
                    <tr key={s.id}
                      style={{ borderTop: `0.5px solid ${colors.borderLight}`, transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <Td style={{ color: colors.textTertiary, fontSize: 12 }}>{i + 1}</Td>
                      <Td>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 6,
                          background: colors.primaryLight, color: colors.primary,
                        }}>{s.code}</span>
                      </Td>
                      <Td>
                        <span style={{ fontWeight: 500, color: colors.textPrimary }}>{s.name}</span>
                      </Td>
                      <Td style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {s.description
                          ? s.description.slice(0, 60) + (s.description.length > 60 ? '…' : '')
                          : <span style={{ color: colors.textTertiary }}>—</span>}
                      </Td>
                      <Td align="center">
                        {hasTemplate ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                              background: colors.successLight, color: colors.success, fontWeight: 500,
                            }}>
                              <i className="ti ti-check" style={{ marginRight: 3 }} />
                              Đã thiết kế
                            </span>
                            <span style={{ fontSize: 10, color: colors.textTertiary }}>
                              v{tmpl?.version} · {tmpl?.fields?.length ?? 0} field
                            </span>
                          </div>
                        ) : (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                            background: colors.warningLight, color: colors.warning,
                          }}>Chưa có</span>
                        )}
                      </Td>
                      <Td align="center">
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                          background: s.is_active ? '#EAF3DE' : '#F1EFE8',
                          color:      s.is_active ? '#3B6D11' : '#444441',
                        }}>
                          {s.is_active ? 'Hoạt động' : 'Ngừng'}
                        </span>
                      </Td>
                      <Td>
                        <Button
                          variant="primary" size="sm"
                          icon={hasTemplate ? 'ti-edit' : 'ti-plus'}
                          onClick={() => navigate(`/lead-solutions/form-builder/${s.id}`)}
                        >
                          {hasTemplate ? 'Sửa form' : 'Tạo form'}
                        </Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {ConfirmNode}
    </PageTransition>
  )
}
