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
//
// ── GHI CHÚ QUAN TRỌNG VỀ TƯƠNG THÍCH OUTLOOK ──────────────────────────
// Outlook desktop (Windows, bản classic dùng Exchange) KHÔNG render HTML
// bằng engine trình duyệt mà dùng engine của Microsoft Word. Engine này:
//   - KHÔNG hỗ trợ `display: flex` / `display: grid` → mọi layout flex/grid
//     sẽ sụp xuống thành các khối xếp dọc (đây là lỗi "form bị vỡ" khi xem
//     trên Outlook thật, dù xem trước trong trình duyệt vẫn đẹp).
//   - KHÔNG hỗ trợ `background: linear-gradient(...)` → nền sẽ thành trống/
//     trắng, khiến chữ trắng trên header gần như vô hình.
//   - KHÔNG hỗ trợ SVG inline → icon SVG sẽ không hiển thị.
//   - KHÔNG hỗ trợ `position: absolute` một cách đáng tin cậy.
// Vì vậy toàn bộ phần layout flex/grid bên dưới được viết lại bằng
// <table> (kỹ thuật chuẩn cho email HTML — "bulletproof layout"), gradient
// được khai báo dạng longhand (background-color làm fallback +
// background-image: linear-gradient cho client hiện đại), và icon SVG
// được thay bằng emoji để đảm bảo hiển thị ở mọi nơi.
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

// ── Khối logo + tên app trong header (table 2 cột, thay cho flex) ─────
// Dùng chữ cái "U" (kiểu avatar initials) thay icon emoji/SVG: đây là cách
// đã được kiểm chứng hiển thị ổn định trên cả Outlook và Gmail (giống các
// avatar chữ cái khác trong template), tránh rủi ro emoji/SVG không lên
// hình trong một số client.
function logoBlock(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
  <tr>
    <td width="36" valign="middle" style="padding-right:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
        <tr><td class="logo-icon" align="center" valign="middle" height="36">U</td></tr>
      </table>
    </td>
    <td valign="middle">
      <div class="logo-text">UNI BOM Planner</div>
      <div class="logo-sub">Quản lý kế hoạch &amp; nhiệm vụ</div>
    </td>
  </tr>
</table>`
}

// ── Hàng tiêu đề thẻ task: tên nhiệm vụ (trái) + badge mức ưu tiên (phải) ─
// Dùng width % cố định cho cả 2 cột (không dùng mẹo width="1") để tránh
// trường hợp một số client (đã gặp trên Gmail) giãn cột badge ra toàn bộ
// chiều ngang.
function taskCardHeader(title: string, badgeHtml: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="70%" valign="top" class="task-title">${title}</td>
    <td width="30%" valign="top" align="right" style="white-space:nowrap; padding-left:10px;">${badgeHtml}</td>
  </tr>
</table>`
}

// ── Badge tròn nhỏ trong header (table thay cho inline-flex) ──────────
function badgePill(text: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
  <tr>
    <td class="badge-pill">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:6px;" valign="middle"><div class="badge-dot">&nbsp;</div></td>
          <td valign="middle"><span class="badge-text">${escapeHtml(text)}</span></td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

// ── Nút CTA dạng "bulletproof button" (table + bgcolor, không dùng flex) ─
// gradientFrom/gradientTo: 2 màu gradient — gradientFrom cũng dùng làm
// nền fallback đặc (solid) cho Outlook, vì Outlook bỏ qua background-image.
function ctaButton(
  label: string,
  gradientFrom: string,
  gradientTo: string,
  taskId?: number,
  fallbackPath = '/planner'
): string {
  const href = APP_URL ? `${APP_URL}${taskId ? `/planner/task/${taskId}` : fallbackPath}` : null
  const inner = href
    ? `<a href="${href}" style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; letter-spacing:0.01em; font-family:'Segoe UI',Arial,sans-serif;">${label}</a>`
    : `<span style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:700; color:#ffffff; letter-spacing:0.01em; font-family:'Segoe UI',Arial,sans-serif;">${label}</span>`

  return `
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${gradientFrom}" style="border-radius:999px; background-color:${gradientFrom}; background-image:linear-gradient(135deg, ${gradientFrom}, ${gradientTo});">
      ${inner}
    </td>
  </tr>
</table>`
}

// ── Lưới 2x2 thông tin (table thay cho display:grid) ───────────────────
function metaGrid(items: [string, string][]): string {
  const cell = (label: string, value: string) =>
    `<td width="48%" valign="top" class="meta-item"><div class="meta-label">${label}</div><div class="meta-value">${value}</div></td>`

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    ${cell(items[0][0], items[0][1])}
    <td width="4%">&nbsp;</td>
    ${cell(items[1][0], items[1][1])}
  </tr>
  <tr><td colspan="3" height="10" style="font-size:0; line-height:10px;">&nbsp;</td></tr>
  <tr>
    ${cell(items[2][0], items[2][1])}
    <td width="4%">&nbsp;</td>
    ${cell(items[3][0], items[3][1])}
  </tr>
</table>`
}

// ── Hàng "người + vai trò + nhãn" dùng chung (assigner / changer row) ──
function personRow(opts: {
  wrapperClass: string
  avatarClass: string
  name: string
  role?: string | null
  rightLabel: string
}): string {
  return `
<div class="${opts.wrapperClass}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="36" valign="middle" style="padding-right:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
          <tr><td class="${opts.avatarClass}" align="center" valign="middle" height="36">${getInitials(opts.name)}</td></tr>
        </table>
      </td>
      <td valign="middle">
        <div class="assigner-name">${escapeHtml(opts.name)}</div>
        <div class="assigner-role">${escapeHtml(roleLabel(opts.role))}</div>
      </td>
      <td valign="middle" align="right" width="100" class="assigner-label">${escapeHtml(opts.rightLabel)}</td>
    </tr>
  </table>
</div>`
}

// ── Khối icon + nội dung (table thay cho flex, dùng cho info box) ──────
function iconTextBox(boxClass: string, icon: string, html: string): string {
  return `
<div class="${boxClass}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="26" valign="top" style="font-size:18px; padding-right:10px;">${icon}</td>
      <td valign="top" class="info-text">${html}</td>
    </tr>
  </table>
</div>`
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
    .header { background-color: #312E81; background-image: linear-gradient(145deg, #312E81, #1E40AF); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-icon { background-color: rgba(255,255,255,0.15); border-radius: 10px; color: #fff; font-weight: 700; font-size: 14px; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge-pill { background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; }
    .badge-dot { width: 6px; height: 6px; background-color: #34D399; border-radius: 50%; font-size: 0; line-height: 0; }
    .badge-text { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .task-card { background: #F8FAFF; border: 1.5px solid #E0E7FF; border-radius: 16px; padding: 20px; margin-bottom: 24px; }
    .task-title { font-size: 17px; font-weight: 700; color: #111827; line-height: 1.35; }
    .priority-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
    .priority-high { background: #FEF2F2; color: #EF4444; border: 1px solid #FECACA; }
    .priority-medium { background: #FFFBEB; color: #F59E0B; border: 1px solid #FDE68A; }
    .priority-low { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }
    .task-desc { font-size: 13px; color: #6B7280; line-height: 1.6; margin: 14px 0 16px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; }
    .meta-item { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111827; }
    .meta-value.danger { color: #EF4444; }
    .meta-value.success { color: #10B981; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .plan-info { background-color: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
    .plan-icon { background-color: #4F46E5; background-image: linear-gradient(135deg, #4F46E5, #1E40AF); border-radius: 10px; color: #fff; font-weight: 700; font-size: 15px; }
    .plan-name { font-size: 13px; font-weight: 700; color: #312E81; }
    .plan-bucket { font-size: 11px; color: #6366F1; margin-top: 2px; }
    .cta-wrap { margin-bottom: 24px; }
    .assigner-row { background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
    .avatar { background-color: #4F46E5; background-image: linear-gradient(135deg, #4F46E5, #7C3AED); border-radius: 50%; color: #fff; font-size: 14px; font-weight: 700; }
    .assigner-name { font-size: 13px; font-weight: 600; color: #111827; }
    .assigner-role { font-size: 11px; color: #6B7280; }
    .assigner-label { font-size: 11px; color: #9CA3AF; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    ${logoBlock()}
    ${badgePill('Nhiệm vụ mới')}
    <h1>Bạn vừa được<br/>giao một nhiệm vụ</h1>
    <p>Kiểm tra chi tiết bên dưới và bắt đầu thực hiện ngay hôm nay.</p>
  </div>

  <div class="body">
    <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
    <strong>${escapeHtml(p.assignerName)}</strong> đã giao cho bạn nhiệm vụ sau trong dự án <strong>${escapeHtml(p.planName)}</strong>. Vui lòng xem chi tiết và bắt đầu thực hiện.</p>

    <div class="task-card">
      ${taskCardHeader(
        escapeHtml(p.taskTitle),
        `<span class="priority-badge priority-${priority.cssClass}">${priority.label}</span>`
      )}
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      ${metaGrid([
        ['📅 Hạn hoàn thành', `<span class="meta-value danger">${formatDueDate(p.dueDate)}</span>`],
        ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
        ['🚦 Trạng thái', `<span class="meta-value success">${statusLabel(status)}</span>`],
        ['⏱ Ngày giao', formatDateTime(p.assignedDate)],
      ])}
    </div>

    <div class="plan-info">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="38" valign="middle" style="padding-right:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38">
              <tr><td class="plan-icon" align="center" valign="middle" height="38">P</td></tr>
            </table>
          </td>
          <td valign="middle">
            <div class="plan-name">${escapeHtml(p.planName)}</div>
            <div class="plan-bucket">Bucket: ${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div>
          </td>
        </tr>
      </table>
    </div>

    <div class="cta-wrap">${ctaButton('→ Mở nhiệm vụ trong BOM Planner', '#4F46E5', '#1E40AF', p.taskId)}</div>

    <div class="divider"></div>

    ${personRow({
      wrapperClass: 'assigner-row',
      avatarClass: 'avatar',
      name: p.assignerName,
      role: p.assignerRole,
      rightLabel: 'Người giao việc',
    })}
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
    ? iconTextBox(
        'info-box-new',
        'ℹ️',
        `Bạn đã được giao trách nhiệm thực hiện nhiệm vụ này. Hãy xem xét thông tin, checklist và deadline để bắt đầu ngay. Nếu có thắc mắc, liên hệ <strong>${escapeHtml(p.changedByName)}</strong>.`
      )
    : iconTextBox(
        'info-box-relieved',
        '✅',
        `Nhiệm vụ này không còn thuộc trách nhiệm của bạn. Mọi cập nhật về sau sẽ do người thực hiện mới đảm nhận. Nếu đây là nhầm lẫn, vui lòng liên hệ <strong>${escapeHtml(p.changedByName)}</strong>.`
      )

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
    .header { background-color: #064E3B; background-image: linear-gradient(145deg, #064E3B, #065F46); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-icon { background-color: rgba(255,255,255,0.15); border-radius: 10px; color: #fff; font-weight: 700; font-size: 14px; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge-pill { background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; }
    .badge-dot { width: 6px; height: 6px; background-color: #6EE7B7; border-radius: 50%; font-size: 0; line-height: 0; }
    .badge-text { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .transfer-visual { background-color: #F0FDF4; border: 1.5px solid #A7F3D0; border-radius: 16px; padding: 16px; margin-bottom: 24px; }
    .person-avatar { border-radius: 50%; font-size: 18px; font-weight: 700; color: #fff; }
    .from-avatar { background-color: #9CA3AF; background-image: linear-gradient(135deg, #9CA3AF, #6B7280); }
    .to-avatar { background-color: #10B981; background-image: linear-gradient(135deg, #10B981, #064E3B); }
    .person-name { font-size: 13px; font-weight: 700; color: #111827; margin-top: 8px; }
    .person-role { font-size: 11px; color: #6B7280; margin-top: 2px; }
    .person-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin-top: 5px; }
    .tag-from { background: #F3F4F6; color: #6B7280; }
    .tag-to { background: #D1FAE5; color: #065F46; }
    .arrow-icon { font-size: 24px; color: #10B981; line-height: 1; }
    .arrow-label { font-size: 10px; font-weight: 600; color: #10B981; letter-spacing: 0.05em; margin-top: 4px; }
    .task-card { background: #F8FAFF; border: 1.5px solid #E0E7FF; border-radius: 16px; padding: 20px; margin-bottom: 24px; }
    .task-title { font-size: 17px; font-weight: 700; color: #111827; line-height: 1.35; }
    .priority-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }
    .priority-high { background: #FEF2F2; color: #EF4444; border: 1px solid #FECACA; }
    .priority-medium { background: #FFFBEB; color: #F59E0B; border: 1px solid #FDE68A; }
    .priority-low { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }
    .task-desc { font-size: 13px; color: #6B7280; line-height: 1.6; margin: 14px 0 16px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; }
    .meta-item { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111827; }
    .meta-value.danger { color: #EF4444; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .info-box-relieved { background: #F0FDF4; border: 1px solid #A7F3D0; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
    .info-box-new { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
    .info-text { font-size: 13px; color: #374151; line-height: 1.6; }
    .info-text strong { color: #111827; }
    .cta-wrap { margin-bottom: 24px; }
    .changer-row { background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
    .changer-avatar { background-color: #6366F1; background-image: linear-gradient(135deg, #6366F1, #4F46E5); border-radius: 50%; color: #fff; font-size: 14px; font-weight: 700; }
    .assigner-name { font-size: 13px; font-weight: 600; color: #111827; }
    .assigner-role { font-size: 11px; color: #6B7280; }
    .assigner-label { font-size: 11px; color: #9CA3AF; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    ${logoBlock()}
    ${badgePill('Thay đổi người thực hiện')}
    <h1>${headerTitle}</h1>
    <p>Xem chi tiết bên dưới về thay đổi người thực hiện nhiệm vụ.</p>
  </div>

  <div class="body">
    <p class="greeting">${greeting}</p>

    <div class="transfer-visual">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="40%" align="center" valign="top">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td class="person-avatar from-avatar" align="center" valign="middle" width="48" height="48">${getInitials(p.oldAssigneeName)}</td></tr>
            </table>
            <div class="person-name">${escapeHtml(p.oldAssigneeName)}</div>
            <div class="person-role">${escapeHtml(roleLabel(p.oldAssigneeRole))}</div>
            <span class="person-tag tag-from">Người cũ</span>
          </td>
          <td width="20%" align="center" valign="middle">
            <div class="arrow-icon">→</div>
            <div class="arrow-label">Chuyển giao</div>
          </td>
          <td width="40%" align="center" valign="top">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td class="person-avatar to-avatar" align="center" valign="middle" width="48" height="48">${getInitials(p.newAssigneeName)}</td></tr>
            </table>
            <div class="person-name">${escapeHtml(p.newAssigneeName)}</div>
            <div class="person-role">${escapeHtml(roleLabel(p.newAssigneeRole))}</div>
            <span class="person-tag tag-to">Người mới</span>
          </td>
        </tr>
      </table>
    </div>

    <div class="task-card">
      ${taskCardHeader(
        escapeHtml(p.taskTitle),
        `<span class="priority-badge priority-${priority.cssClass}">${priority.label}</span>`
      )}
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      ${metaGrid([
        ['📅 Hạn hoàn thành', `<span class="meta-value danger">${formatDueDate(p.dueDate)}</span>`],
        ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
        ['🚦 Trạng thái', statusLabel(p.status)],
        ['🔄 Ngày chuyển', formatDateTime(p.changedDate)],
      ])}
    </div>

    ${infoBox}

    <div class="cta-wrap">${ctaButton('→ Mở nhiệm vụ trong BOM Planner', '#10B981', '#064E3B', p.taskId)}</div>

    <div class="divider"></div>

    ${personRow({
      wrapperClass: 'changer-row',
      avatarClass: 'changer-avatar',
      name: p.changedByName,
      role: p.changedByRole,
      rightLabel: 'Người thực hiện thay đổi',
    })}
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
    .header { background-color: #7F1D1D; background-image: linear-gradient(145deg, #7F1D1D, #991B1B); border-radius: 20px 20px 0 0; padding: 28px 32px 24px; }
    .logo-icon { background-color: rgba(255,255,255,0.15); border-radius: 10px; color: #fff; font-weight: 700; font-size: 14px; }
    .logo-text { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .logo-sub { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 1px; }
    .badge-pill { background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 5px 12px; }
    .badge-dot { width: 6px; height: 6px; background-color: #FCA5A5; border-radius: 50%; font-size: 0; line-height: 0; }
    .badge-text { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .header h1 { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.25; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 8px; line-height: 1.5; }
    .body { background: #fff; padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 24px; }
    .greeting strong { color: #111827; }
    .task-card { background: #FFF5F5; border: 1.5px solid #FECACA; border-radius: 16px; padding: 20px; margin-bottom: 24px; }
    .deleted-watermark { display: inline-block; background: #EF4444; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .task-title { font-size: 17px; font-weight: 700; color: #991B1B; line-height: 1.35; text-decoration: line-through; opacity: 0.8; margin-bottom: 14px; }
    .task-desc { font-size: 13px; color: #9CA3AF; line-height: 1.6; margin-bottom: 16px; background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 10px; padding: 12px 14px; text-decoration: line-through; }
    .meta-item { background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 10px; padding: 10px 13px; }
    .meta-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #9CA3AF; }
    .divider { height: 1px; background: #F3F4F6; margin: 24px 0; }
    .info-box { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
    .info-text { font-size: 13px; color: #92400E; line-height: 1.6; }
    .info-text strong { color: #78350F; }
    .assigner-row { background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 12px 14px; }
    .avatar { background-color: #EF4444; background-image: linear-gradient(135deg, #EF4444, #991B1B); border-radius: 50%; color: #fff; font-size: 14px; font-weight: 700; }
    .assigner-name { font-size: 13px; font-weight: 600; color: #111827; }
    .assigner-role { font-size: 11px; color: #6B7280; }
    .assigner-label { font-size: 11px; color: #EF4444; font-weight: 600; }
    .cta-wrap { margin-bottom: 24px; }
    .footer { background: #111827; border-radius: 0 0 20px 20px; padding: 24px 32px; }
    .footer-logo { text-align: center; margin-bottom: 16px; }
    .footer-logo span { font-size: 14px; font-weight: 700; color: #fff; }
    .footer-text { font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    ${logoBlock()}
    ${badgePill('Nhiệm vụ đã xóa')}
    <h1>Nhiệm vụ của bạn<br/>đã bị xóa</h1>
    <p>Nhiệm vụ bạn đang thực hiện đã bị xóa khỏi hệ thống. Vui lòng liên hệ người quản lý nếu cần thêm thông tin.</p>
  </div>

  <div class="body">
    <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
    Chúng tôi thông báo rằng nhiệm vụ <strong>"${escapeHtml(p.taskTitle)}"</strong> bạn đang thực hiện trong dự án <strong>${escapeHtml(p.planName)}</strong> đã bị xóa bởi <strong>${escapeHtml(p.deletedByName)}</strong>.</p>

    <div class="task-card">
      <div style="text-align:right; margin-bottom:10px;"><span class="deleted-watermark">Đã xóa</span></div>
      <div class="task-title">${escapeHtml(p.taskTitle)}</div>
      ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
      ${metaGrid([
        ['📅 Hạn hoàn thành (cũ)', formatDueDate(p.dueDate)],
        ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
        ['🚦 Trạng thái (cũ)', statusLabel(p.status)],
        ['🗑 Ngày xóa', formatDateTime(p.deletedDate)],
      ])}
    </div>

    ${iconTextBox(
      'info-box',
      '⚠️',
      `Mọi dữ liệu liên quan đến nhiệm vụ này (checklist, ghi chú, file đính kèm) đã bị xóa vĩnh viễn. Nếu đây là nhầm lẫn, vui lòng liên hệ <strong>${escapeHtml(p.deletedByName)}</strong> hoặc quản trị viên hệ thống ngay lập tức.`
    )}

    <div class="cta-wrap">${ctaButton('→ Xem các nhiệm vụ còn lại', '#1E40AF', '#312E81')}</div>

    <div class="divider"></div>

    ${personRow({
      wrapperClass: 'assigner-row',
      avatarClass: 'avatar',
      name: p.deletedByName,
      role: p.deletedByRole,
      rightLabel: 'Người thực hiện xóa',
    })}
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