// ============================================================
// src/components/ui/NotificationBell.tsx
// Bell icon + dropdown thông báo với polling tự động
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface Notification {
  id: number
  user_id: number
  pom_id?: number
  task_id?: number
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

const TYPE_ICON: Record<string, string> = {
  submitted:       'ti-file-upload',
  tp_approved:     'ti-circle-check',
  tp_returned:     'ti-arrow-back-up',
  tp_reapproved:   'ti-circle-check',
  pricing_done:    'ti-currency-dollar',
  price_revised:   'ti-edit',
  return_to_price: 'ti-refresh',
  return_to_tech:  'ti-tool',
  closed_won:      'ti-trophy',
  closed_lost:     'ti-x',
  task_comment:    'ti-message-circle',
  task_assigned:   'ti-user-plus',
  task_unassigned: 'ti-user-minus',
  task_deleted:    'ti-trash',
}

const TYPE_COLOR: Record<string, string> = {
  submitted:       '#3b82f6',
  tp_approved:     '#22c55e',
  tp_returned:     '#f59e0b',
  tp_reapproved:   '#22c55e',
  pricing_done:    '#8b5cf6',
  price_revised:   '#3b82f6',
  return_to_price: '#f59e0b',
  return_to_tech:  '#f97316',
  closed_won:      '#22c55e',
  closed_lost:     '#ef4444',
  task_comment:    '#6366f1',
  task_assigned:   '#22c55e',
  task_unassigned: '#f59e0b',
  task_deleted:    '#ef4444',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  return `${d} ngày trước`
}

export function NotificationBell() {
  const [open, setOpen]                   = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [loading, setLoading]             = useState(false)
  const dropdownRef                       = useRef<HTMLDivElement>(null)
  const navigate                          = useNavigate()
  const api = (window as any).api

  // ── Lấy số unread (polling nhẹ, mỗi 30s) ─────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.notifications.getUnreadCount()
      if (res?.count !== undefined) setUnreadCount(res.count)
    } catch {}
  }, [api])

  // ── Lấy danh sách notification khi mở dropdown ────────────
  const fetchNotifications = useCallback(async () => {
    if (!api?.notifications) return
    setLoading(true)
    try {
      const res = await api.notifications.getAll({ limit: 30 })
      if (res?.notifications) {
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount ?? 0)
      }
    } catch {}
    setLoading(false)
  }, [api])

  // Polling unread count (mỗi 30 giây)
  useEffect(() => {
    if (!api?.notifications) return
    fetchUnreadCount()
    const timer = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(timer)
  }, [fetchUnreadCount])

  // Load khi mở dropdown
  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  // Click ngoài để đóng
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await api.notifications.markAsRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await api.notifications.markAllAsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await api.notifications.delete(id)
    const deleted = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (deleted && !deleted.is_read) setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await api.notifications.markAsRead(notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    // Điều hướng đến BOM/Task liên quan nếu có
    if (notif.task_id) {
      // Lưu lại task cần mở để PlannerPage tự mở đúng task + đúng tab
      sessionStorage.setItem('planner:openTaskId', String(notif.task_id))
      sessionStorage.setItem('planner:openTaskTab', notif.type === 'task_comment' ? 'activity' : 'detail')
      navigate('/planner')
    } else if (notif.pom_id) {
      // navigate to pom history or relevant page based on type
      navigate('/pom-history')
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 10,
          border: open ? '1.5px solid #6366f1' : '1.5px solid #e5e7eb',
          background: open ? '#eef2ff' : '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.18s',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : '0 1px 3px rgba(0,0,0,0.06)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = '#c7d2fe'
            e.currentTarget.style.background   = '#f5f3ff'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = '#e5e7eb'
            e.currentTarget.style.background   = '#fff'
          }
        }}
      >
        <i
          className="ti ti-bell"
          style={{
            fontSize: 16,
            color: open ? '#6366f1' : '#6b7280',
            animation: unreadCount > 0 ? 'bell-shake 2.5s ease infinite' : 'none',
          }}
        />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: '#ef4444',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            border: '2px solid #fff',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 44,
          right: 0,
          width: 360,
          maxHeight: 500,
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'notif-dropdown 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-bell" style={{ fontSize: 15, color: '#6366f1' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Thông báo</span>
              {unreadCount > 0 && (
                <span style={{
                  background: '#eef2ff',
                  color: '#6366f1',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: 10,
                }}>
                  {unreadCount} chưa đọc
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  fontSize: 12,
                  color: '#6366f1',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: 6,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#eef2ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Đọc tất cả
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ height: 68, borderRadius: 10, background: '#f9fafb', animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <i className="ti ti-bell-off" style={{ fontSize: 32, color: '#d1d5db', display: 'block', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Chưa có thông báo nào</div>
              </div>
            ) : (
              notifications.map(notif => {
                const icon  = TYPE_ICON[notif.type]  ?? 'ti-bell'
                const color = TYPE_COLOR[notif.type] ?? '#6b7280'
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      background: notif.is_read ? '#fff' : '#fafbff',
                      borderLeft: notif.is_read ? '3px solid transparent' : `3px solid ${color}`,
                      transition: 'background 0.15s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = notif.is_read ? '#fff' : '#fafbff'}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: `${color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 15, color }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: notif.is_read ? 400 : 600,
                        color: '#111827',
                        marginBottom: 2,
                      }}>
                        {notif.title}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: '#6b7280',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.45,
                      }}>
                        {notif.message}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        {timeAgo(notif.created_at)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                      {!notif.is_read && (
                        <button
                          onClick={e => handleMarkRead(notif.id, e)}
                          title="Đánh dấu đã đọc"
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: 'none', background: 'none', cursor: 'pointer',
                            color: '#6366f1', fontSize: 13,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eef2ff'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <i className="ti ti-check" />
                        </button>
                      )}
                      <button
                        onClick={e => handleDelete(notif.id, e)}
                        title="Xóa thông báo"
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          border: 'none', background: 'none', cursor: 'pointer',
                          color: '#9ca3af', fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#fef2f2'
                          e.currentTarget.style.color = '#ef4444'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'none'
                          e.currentTarget.style.color = '#9ca3af'
                        }}
                      >
                        <i className="ti ti-x" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: '8px 14px',
              borderTop: '1px solid #f3f4f6',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                {notifications.length} thông báo gần nhất
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bell-shake {
          0%, 85%, 100% { transform: rotate(0deg); }
          88%  { transform: rotate(-8deg); }
          92%  { transform: rotate(8deg); }
          96%  { transform: rotate(-4deg); }
          99%  { transform: rotate(4deg); }
        }
        @keyframes notif-dropdown {
          from { opacity: 0; transform: scale(0.95) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}