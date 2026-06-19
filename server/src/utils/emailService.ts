// ============================================================
// server/src/utils/emailService.ts
// Gửi email thông báo qua Brevo HTTP API (https://api.brevo.com)
// Dùng HTTP API thay vì SMTP vì Render chặn outbound tới port 25/465/587
// trên free web service — HTTP API đi qua port 443 nên không bị chặn.
//
// 3 loại email:
//   1. sendTaskAssignEmail   — giao việc (task mới / thêm assignee mới)
//   2. sendTaskReassignEmail — chuyển giao (đổi người thực hiện)
//   3. sendTaskDeleteEmail   — xóa nhiệm vụ
// ============================================================

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'
const SENDER_NAME = 'UNI BOM System'

// Nếu có cấu hình APP_URL (web/deeplink), nút CTA sẽ là link thật.
// Nếu không, nút CTA chỉ hiển thị mang tính hướng dẫn (app desktop Electron
// hiện chưa có deep-link scheme nên không có URL để mở trực tiếp).
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || ''

// ── Nhãn hiển thị dùng chung ───────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  deferred: 'Tạm hoãn',
}

const PRIORITY_META: Record<string, { label: string; cssClass: string }> = {
  low: { label: '🟢 Thấp', cssClass: 'low' },
  medium: { label: '🟡 Trung bình', cssClass: 'medium' },
  urgent: { label: '🔴 Khẩn cấp', cssClass: 'high' },
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  sales: 'Sale',
  sales_admin: 'Sale Admin',
  technical: 'Kỹ thuật',
  technical_lead: 'Trưởng phòng KT',
  ke_toan: 'Kế toán',
}

// ── Helpers ─────────────────────────────────────────────────────────
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getInitials(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  return ROLE_LABEL[role] ?? role
}

function statusLabel(status?: string | null): string {
  if (!status) return 'Không rõ'
  return STATUS_LABEL[status] ?? status
}

function priorityMeta(priority?: string | null) {
  return PRIORITY_META[priority ?? ''] ?? { label: priority ?? 'Không rõ', cssClass: 'medium' }
}

// Hạn hoàn thành — hiển thị dạng đầy đủ tiếng Việt
function formatDueDate(date?: string | Date | null): string {
  if (!date) return 'Chưa đặt hạn'
  return new Date(date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Ngày giao/chuyển/xóa — hiển thị ngắn kèm giờ
function formatDateTime(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' } as any)
}

// Nút CTA — chỉ là link thật khi có APP_URL được cấu hình
function ctaButton(label: string, taskId?: number, fallbackPath = '/planner'): string {
  const href = APP_URL ? `${APP_URL}${taskId ? `/planner/task/${taskId}` : fallbackPath}` : null
  if (href) {
    return `<a href="${href}" class="cta-btn">${label}</a>`
  }
  return `<div class="cta-btn" style="cursor:default;">${label}</div>`
}

// ── Gửi email qua Brevo API ────────────────────────────────────────────
async function sendBrevoEmail(params: {
  toEmail: string
  toName: string
  subject: string
  html: string
  logTag: string
}): Promise<void> {
  const { toEmail, toName, subject, html, logTag } = params

  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('[Email] BREVO_API_KEY/EMAIL_FROM chưa được cấu hình — bỏ qua gửi email')
    return
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: process.env.EMAIL_FROM },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent: html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Brevo API trả lỗi ${res.status}: ${errText}`)
    }

    const data = (await res.json()) as { messageId?: string }
    console.log(`[Email] ${logTag} → ${toEmail} — messageId: ${data.messageId}`)
  } catch (err) {
    console.error(`[Email] Lỗi gửi email (${logTag}):`, err)
  }
}

// ============================================================
// 1. GIAO VIỆC (sendTaskAssignEmail)
// ============================================================

export interface TaskAssignEmailParams {
  toEmail: string
  recipientName: string
  taskTitle: string
  planName: string
  assignerName: string
  priority: string
  dueDate?: string | Date | null
  description?: string | null
  // Các trường mở rộng (tùy chọn) để hiển thị đầy đủ theo mẫu mới
  taskId?: number
  bucketName?: string | null
  status?: string | null
  assignerRole?: string | null
  assignedDate?: string | Date | null
}

function buildAssignEmailHtml(p: TaskAssignEmailParams): string {
  const priority = priorityMeta(p.priority)
  const status = p.status ?? 'not_started'

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bạn được giao nhiệm vụ mới</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #F0F2F5; font-family: 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 32px auto; padding: 0 16px 40px; }
    .header { background: linear-gradient(145deg, #312E81, #1E40AF); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 18px; height: 18px; fill: #fff; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; margin-bottom: 14px; }
    .badge-dot { width: 6px; height: 6px; background: #34D399; border-radius: 50%; }
    .badge span { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .task-card { background: #F8FAFF; border: 1.5px solid #E0E7FF; border-radius: 16px; padding: 20px; margin-bottom: 24px; }
    .task-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
    .task-title { font-size: 17px; font-weight: 700; color: #111827; line-height: 1.35; flex: 1; }
    .priority-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; margin-left: 10px; }
    .priority-high { background: #FEF2F2; color: #EF4444; border: 1px solid #FECACA; }
    .priority-medium { background: #FFFBEB; color: #F59E0B; border: 1px solid #FDE68A; }
    .priority-low { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }
    .task-desc { font-size: 13px; color: #6B7280; line-height: 1.6; margin-bottom: 16px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .meta-item { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111827; }
    .meta-value.danger { color: #EF4444; }
    .meta-value.success { color: #10B981; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .plan-info { display: flex; align-items: center; gap: 12px; background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
    .plan-icon { width: 38px; height: 38px; background: linear-gradient(135deg, #4F46E5, #1E40AF); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .plan-icon svg { width: 18px; height: 18px; fill: #fff; }
    .plan-text { flex: 1; }
    .plan-name { font-size: 13px; font-weight: 700; color: #312E81; }
    .plan-bucket { font-size: 11px; color: #6366F1; margin-top: 2px; }
    .cta-wrap { text-align: center; margin-bottom: 24px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #4F46E5, #1E40AF); color: #fff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 32px; border-radius: 999px; letter-spacing: 0.01em; }
    .assigner-row { display: flex; align-items: center; gap: 10px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
    .avatar { width: 36px; height: 36px; background: linear-gradient(135deg, #4F46E5, #7C3AED); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0; }
    .assigner-info { flex: 1; }
    .assigner-name { font-size: 13px; font-weight: 600; color: #111827; }
    .assigner-role { font-size: 11px; color: #6B7280; }
    .assigner-label { font-size: 11px; color: #9CA3AF; text-align: right; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo-row">
      <div class="logo-icon"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg></div>
      <div><div class="logo-text">UNI BOM Planner</div><div class="logo-sub">Quản lý kế hoạch &amp; nhiệm vụ</div></div>
    </div>
    <div class="badge"><div class="badge-dot"></div><span>Nhiệm vụ mới</span></div>
    <h1>Bạn vừa được<br/>giao một nhiệm vụ</h1>
    <p>Kiểm tra chi tiết bên dưới và bắt đầu thực hiện ngay hôm nay.</p>
  </div>

  <div class="body">
    <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
    <strong>${escapeHtml(p.assignerName)}</strong> đã giao cho bạn nhiệm vụ sau trong dự án <strong>${escapeHtml(p.planName)}</strong>. Vui lòng xem chi tiết và bắt đầu thực hiện.</p>

    <div class="task-card">
      <div class="task-card-header">
        <div class="task-title">${escapeHtml(p.taskTitle)}</div>
        <div class="priority-badge priority-${priority.cssClass}">${priority.label}</div>
      </div>
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-label">📅 Hạn hoàn thành</div><div class="meta-value danger">${formatDueDate(p.dueDate)}</div></div>
        <div class="meta-item"><div class="meta-label">📋 Cột (Bucket)</div><div class="meta-value">${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div></div>
        <div class="meta-item"><div class="meta-label">🚦 Trạng thái</div><div class="meta-value success">${statusLabel(status)}</div></div>
        <div class="meta-item"><div class="meta-label">⏱ Ngày giao</div><div class="meta-value">${formatDateTime(p.assignedDate)}</div></div>
      </div>
    </div>

    <div class="plan-info">
      <div class="plan-icon"><svg viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg></div>
      <div class="plan-text"><div class="plan-name">${escapeHtml(p.planName)}</div><div class="plan-bucket">Bucket: ${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div></div>
    </div>

    <div class="cta-wrap">${ctaButton('→ Mở nhiệm vụ trong BOM Planner', p.taskId)}</div>

    <div class="divider"></div>

    <div class="assigner-row">
      <div class="avatar">${getInitials(p.assignerName)}</div>
      <div class="assigner-info"><div class="assigner-name">${escapeHtml(p.assignerName)}</div><div class="assigner-role">${escapeHtml(roleLabel(p.assignerRole))}</div></div>
      <div class="assigner-label">Người giao việc</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo"><span>UNI BOM System</span></div>
    <div class="footer-text">
      Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
      © ${new Date().getFullYear()} UNI Technology
    </div>
  </div>
</div>
</body>
</html>`
}

export async function sendTaskAssignEmail(params: TaskAssignEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName: params.recipientName,
    subject: `[UNI] Bạn được giao việc: ${params.taskTitle}`,
    html: buildAssignEmailHtml(params),
    logTag: 'Giao việc',
  })
}

// ============================================================
// 2. CHUYỂN GIAO / ĐỔI NGƯỜI THỰC HIỆN (sendTaskReassignEmail)
// ============================================================

export interface TaskReassignEmailParams {
  toEmail: string
  // 'new'  → người gửi đang nhận thêm việc (đứng ở vai người MỚI)
  // 'old'  → người gửi vừa bị gỡ khỏi nhiệm vụ (đứng ở vai người CŨ)
  viewpoint: 'new' | 'old'
  recipientName: string

  oldAssigneeName: string
  oldAssigneeRole?: string | null
  newAssigneeName: string
  newAssigneeRole?: string | null

  taskId?: number
  taskTitle: string
  description?: string | null
  planName: string
  bucketName?: string | null
  status?: string | null
  priority: string
  dueDate?: string | Date | null

  changedByName: string
  changedByRole?: string | null
  changedDate?: string | Date | null
}

function buildReassignEmailHtml(p: TaskReassignEmailParams): string {
  const priority = priorityMeta(p.priority)
  const isNewView = p.viewpoint === 'new'

  const headerTitle = isNewView
    ? 'Nhiệm vụ vừa được<br/>chuyển giao cho bạn'
    : 'Nhiệm vụ của bạn<br/>đã được chuyển cho người khác'

  const greeting = isNewView
    ? `Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
       <strong>${escapeHtml(p.changedByName)}</strong> đã chuyển nhiệm vụ <strong>"${escapeHtml(p.taskTitle)}"</strong> sang cho bạn thực hiện trong dự án <strong>${escapeHtml(p.planName)}</strong>.`
    : `Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
       Nhiệm vụ <strong>"${escapeHtml(p.taskTitle)}"</strong> trong dự án <strong>${escapeHtml(p.planName)}</strong> mà bạn đang thực hiện đã được chuyển sang cho người khác bởi <strong>${escapeHtml(p.changedByName)}</strong>.`

  const infoBox = isNewView
    ? `<div class="info-box-new">
         <div class="info-icon">ℹ️</div>
         <div class="info-text">Bạn đã được giao trách nhiệm thực hiện nhiệm vụ này. Hãy xem xét thông tin, checklist và deadline để bắt đầu ngay. Nếu có thắc mắc, liên hệ <strong>${escapeHtml(p.changedByName)}</strong>.</div>
       </div>`
    : `<div class="info-box-relieved">
         <div class="info-icon">✅</div>
         <div class="info-text">Nhiệm vụ này không còn thuộc trách nhiệm của bạn. Mọi cập nhật về sau sẽ do người thực hiện mới đảm nhận. Nếu đây là nhầm lẫn, vui lòng liên hệ <strong>${escapeHtml(p.changedByName)}</strong>.</div>
       </div>`

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nhiệm vụ đã được chuyển giao</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #F0F2F5; font-family: 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 32px auto; padding: 0 16px 40px; }
    .header { background: linear-gradient(145deg, #064E3B, #065F46); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 18px; height: 18px; fill: #fff; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; margin-bottom: 14px; }
    .badge-dot { width: 6px; height: 6px; background: #6EE7B7; border-radius: 50%; }
    .badge span { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .transfer-visual { display: flex; align-items: center; gap: 0; background: #F0FDF4; border: 1.5px solid #A7F3D0; border-radius: 16px; padding: 16px; margin-bottom: 24px; }
    .person-card { flex: 1; text-align: center; padding: 10px; }
    .person-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #fff; margin: 0 auto 8px; }
    .from-avatar { background: linear-gradient(135deg, #9CA3AF, #6B7280); }
    .to-avatar { background: linear-gradient(135deg, #10B981, #064E3B); }
    .person-name { font-size: 13px; font-weight: 700; color: #111827; }
    .person-role { font-size: 11px; color: #6B7280; margin-top: 2px; }
    .person-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin-top: 5px; }
    .tag-from { background: #F3F4F6; color: #6B7280; }
    .tag-to { background: #D1FAE5; color: #065F46; }
    .arrow-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 8px; }
    .arrow-icon { font-size: 24px; color: #10B981; }
    .arrow-label { font-size: 10px; font-weight: 600; color: #10B981; letter-spacing: 0.05em; }
    .task-card { background: #F8FAFF; border: 1.5px solid #E0E7FF; border-radius: 16px; padding: 20px; margin-bottom: 24px; }
    .task-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
    .task-title { font-size: 17px; font-weight: 700; color: #111827; line-height: 1.35; flex: 1; }
    .priority-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; margin-left: 10px; }
    .priority-high { background: #FEF2F2; color: #EF4444; border: 1px solid #FECACA; }
    .priority-medium { background: #FFFBEB; color: #F59E0B; border: 1px solid #FDE68A; }
    .priority-low { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }
    .task-desc { font-size: 13px; color: #6B7280; line-height: 1.6; margin-bottom: 16px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .meta-item { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111827; }
    .meta-value.danger { color: #EF4444; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .info-box-relieved { background: #F0FDF4; border: 1px solid #A7F3D0; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; display: flex; gap: 10px; align-items: flex-start; }
    .info-box-new { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; display: flex; gap: 10px; align-items: flex-start; }
    .info-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .info-text { font-size: 13px; color: #374151; line-height: 1.6; }
    .info-text strong { color: #111827; }
    .cta-wrap { text-align: center; margin-bottom: 24px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #10B981, #064E3B); color: #fff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 32px; border-radius: 999px; letter-spacing: 0.01em; }
    .changer-row { display: flex; align-items: center; gap: 10px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
    .changer-avatar { width: 36px; height: 36px; background: linear-gradient(135deg, #6366F1, #4F46E5); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0; }
    .changer-info { flex: 1; }
    .changer-name { font-size: 13px; font-weight: 600; color: #111827; }
    .changer-role { font-size: 11px; color: #6B7280; }
    .changer-label { font-size: 11px; color: #9CA3AF; text-align: right; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo-row">
      <div class="logo-icon"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg></div>
      <div><div class="logo-text">UNI BOM Planner</div><div class="logo-sub">Quản lý kế hoạch &amp; nhiệm vụ</div></div>
    </div>
    <div class="badge"><div class="badge-dot"></div><span>Thay đổi người thực hiện</span></div>
    <h1>${headerTitle}</h1>
    <p>Xem chi tiết bên dưới về thay đổi người thực hiện nhiệm vụ.</p>
  </div>

  <div class="body">
    <p class="greeting">${greeting}</p>

    <div class="transfer-visual">
      <div class="person-card">
        <div class="person-avatar from-avatar">${getInitials(p.oldAssigneeName)}</div>
        <div class="person-name">${escapeHtml(p.oldAssigneeName)}</div>
        <div class="person-role">${escapeHtml(roleLabel(p.oldAssigneeRole))}</div>
        <div class="person-tag tag-from">Người cũ</div>
      </div>
      <div class="arrow-wrap"><div class="arrow-icon">→</div><div class="arrow-label">Chuyển giao</div></div>
      <div class="person-card">
        <div class="person-avatar to-avatar">${getInitials(p.newAssigneeName)}</div>
        <div class="person-name">${escapeHtml(p.newAssigneeName)}</div>
        <div class="person-role">${escapeHtml(roleLabel(p.newAssigneeRole))}</div>
        <div class="person-tag tag-to">Người mới</div>
      </div>
    </div>

    <div class="task-card">
      <div class="task-card-header">
        <div class="task-title">${escapeHtml(p.taskTitle)}</div>
        <div class="priority-badge priority-${priority.cssClass}">${priority.label}</div>
      </div>
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-label">📅 Hạn hoàn thành</div><div class="meta-value danger">${formatDueDate(p.dueDate)}</div></div>
        <div class="meta-item"><div class="meta-label">📋 Cột (Bucket)</div><div class="meta-value">${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div></div>
        <div class="meta-item"><div class="meta-label">🚦 Trạng thái</div><div class="meta-value">${statusLabel(p.status)}</div></div>
        <div class="meta-item"><div class="meta-label">🔄 Ngày chuyển</div><div class="meta-value">${formatDateTime(p.changedDate)}</div></div>
      </div>
    </div>

    ${infoBox}

    <div class="cta-wrap">${ctaButton('→ Mở nhiệm vụ trong BOM Planner', p.taskId)}</div>

    <div class="divider"></div>

    <div class="changer-row">
      <div class="changer-avatar">${getInitials(p.changedByName)}</div>
      <div class="changer-info"><div class="changer-name">${escapeHtml(p.changedByName)}</div><div class="changer-role">${escapeHtml(roleLabel(p.changedByRole))}</div></div>
      <div class="changer-label">Người thực hiện thay đổi</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo"><span>UNI BOM System</span></div>
    <div class="footer-text">
      Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
      © ${new Date().getFullYear()} UNI Technology
    </div>
  </div>
</div>
</body>
</html>`
}

export async function sendTaskReassignEmail(params: TaskReassignEmailParams): Promise<void> {
  const subject = params.viewpoint === 'new'
    ? `[UNI] Nhiệm vụ được chuyển giao cho bạn: ${params.taskTitle}`
    : `[UNI] Nhiệm vụ đã được chuyển cho người khác: ${params.taskTitle}`

  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName: params.recipientName,
    subject,
    html: buildReassignEmailHtml(params),
    logTag: params.viewpoint === 'new' ? 'Chuyển giao (người mới)' : 'Chuyển giao (người cũ)',
  })
}

// ============================================================
// 3. XÓA NHIỆM VỤ (sendTaskDeleteEmail)
// ============================================================

export interface TaskDeleteEmailParams {
  toEmail: string
  recipientName: string
  taskTitle: string
  description?: string | null
  planName: string
  bucketName?: string | null
  status?: string | null
  dueDate?: string | Date | null
  deletedByName: string
  deletedByRole?: string | null
  deletedDate?: string | Date | null
}

function buildDeleteEmailHtml(p: TaskDeleteEmailParams): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nhiệm vụ đã bị xóa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #F0F2F5; font-family: 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 32px auto; padding: 0 16px 40px; }
    .header { background: linear-gradient(145deg, #7F1D1D, #991B1B); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 18px; height: 18px; fill: #fff; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; margin-bottom: 14px; }
    .badge-dot { width: 6px; height: 6px; background: #FCA5A5; border-radius: 50%; }
    .badge span { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .task-card { background: #FFF5F5; border: 1.5px solid #FECACA; border-radius: 16px; padding: 20px; margin-bottom: 24px; position: relative; }
    .deleted-watermark { position: absolute; top: 14px; right: 14px; background: #EF4444; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .task-title { font-size: 17px; font-weight: 700; color: #991B1B; line-height: 1.35; text-decoration: line-through; opacity: 0.8; margin-bottom: 14px; }
    .task-desc { font-size: 13px; color: #9CA3AF; line-height: 1.6; margin-bottom: 16px; background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 10px; padding: 12px 14px; text-decoration: line-through; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .meta-item { background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111827; }
    .meta-value.muted { color: #9CA3AF; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .info-box { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; display: flex; gap: 10px; align-items: flex-start; }
    .info-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .info-text { font-size: 13px; color: #92400E; line-height: 1.6; }
    .info-text strong { color: #78350F; }
    .assigner-row { display: flex; align-items: center; gap: 10px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 12px 14px; }
    .avatar { width: 36px; height: 36px; background: linear-gradient(135deg, #EF4444, #991B1B); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0; }
    .assigner-info { flex: 1; }
    .assigner-name { font-size: 13px; font-weight: 600; color: #111827; }
    .assigner-role { font-size: 11px; color: #6B7280; }
    .assigner-label { font-size: 11px; color: #EF4444; font-weight: 600; text-align: right; }
    .cta-wrap { text-align: center; margin-bottom: 24px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #1E40AF, #312E81); color: #fff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 32px; border-radius: 999px; letter-spacing: 0.01em; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo-row">
      <div class="logo-icon"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg></div>
      <div><div class="logo-text">UNI BOM Planner</div><div class="logo-sub">Quản lý kế hoạch &amp; nhiệm vụ</div></div>
    </div>
    <div class="badge"><div class="badge-dot"></div><span>Nhiệm vụ đã xóa</span></div>
    <h1>Nhiệm vụ của bạn<br/>đã bị xóa</h1>
    <p>Nhiệm vụ bạn đang thực hiện đã bị xóa khỏi hệ thống. Vui lòng liên hệ người quản lý nếu cần thêm thông tin.</p>
  </div>

  <div class="body">
    <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
    Chúng tôi thông báo rằng nhiệm vụ <strong>"${escapeHtml(p.taskTitle)}"</strong> bạn đang thực hiện trong dự án <strong>${escapeHtml(p.planName)}</strong> đã bị xóa bởi <strong>${escapeHtml(p.deletedByName)}</strong>.</p>

    <div class="task-card">
      <div class="deleted-watermark">Đã xóa</div>
      <div class="task-title">${escapeHtml(p.taskTitle)}</div>
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-label">📅 Hạn hoàn thành (cũ)</div><div class="meta-value muted">${formatDueDate(p.dueDate)}</div></div>
        <div class="meta-item"><div class="meta-label">📋 Cột (Bucket)</div><div class="meta-value muted">${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div></div>
        <div class="meta-item"><div class="meta-label">🚦 Trạng thái (cũ)</div><div class="meta-value muted">${statusLabel(p.status)}</div></div>
        <div class="meta-item"><div class="meta-label">🗑 Ngày xóa</div><div class="meta-value muted">${formatDateTime(p.deletedDate)}</div></div>
      </div>
    </div>

    <div class="info-box">
      <div class="info-icon">⚠️</div>
      <div class="info-text">Mọi dữ liệu liên quan đến nhiệm vụ này (checklist, ghi chú, file đính kèm) đã bị xóa vĩnh viễn. Nếu đây là nhầm lẫn, vui lòng liên hệ <strong>${escapeHtml(p.deletedByName)}</strong> hoặc quản trị viên hệ thống ngay lập tức.</div>
    </div>

    <div class="cta-wrap">${ctaButton('→ Xem các nhiệm vụ còn lại')}</div>

    <div class="divider"></div>

    <div class="assigner-row">
      <div class="avatar">${getInitials(p.deletedByName)}</div>
      <div class="assigner-info"><div class="assigner-name">${escapeHtml(p.deletedByName)}</div><div class="assigner-role">${escapeHtml(roleLabel(p.deletedByRole))}</div></div>
      <div class="assigner-label">Người thực hiện xóa</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo"><span>UNI BOM System</span></div>
    <div class="footer-text">
      Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
      © ${new Date().getFullYear()} UNI Technology
    </div>
  </div>
</div>
</body>
</html>`
}

export async function sendTaskDeleteEmail(params: TaskDeleteEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName: params.recipientName,
    subject: `[UNI] Nhiệm vụ đã bị xóa: ${params.taskTitle}`,
    html: buildDeleteEmailHtml(params),
    logTag: 'Xóa nhiệm vụ',
  })
}