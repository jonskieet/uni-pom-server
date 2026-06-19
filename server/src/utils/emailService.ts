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
// ── GHI CHÚ VỀ TƯƠNG THÍCH OUTLOOK ─────────────────────────────────────
// Toàn bộ layout dùng <table> (bulletproof email layout). Các điểm quan trọng:
//
//   1. OUTER WRAPPER: <div class="wrapper" style="margin:auto"> KHÔNG center
//      được trong Outlook cũ. Phải dùng <table> lồng nhau:
//      body → outer table (background) → inner table 600px (centering) → rows.
//
//   2. SECTION ROWS: .header / .body / .footer phải là <tr><td bgcolor="...">
//      không phải <div>. Thuộc tính bgcolor được Outlook đọc trực tiếp ngay
//      cả khi CSS inline bị override.
//
//   3. rgba() BỊ BỎ QUA HOÀN TOÀN trong Outlook — dùng solid hex thay thế.
//      Mỗi email theme có bộ màu solid riêng gần đúng với rgba overlay.
//
//   4. background-image: linear-gradient bị bỏ qua — bgcolor là fallback.
//      (VML gradient phức tạp, bỏ qua; solid color là đủ dùng.)
//
//   5. border-radius trên <div> / <td> bị bỏ qua trong Outlook (Word engine).
//      Chấp nhận góc vuông — đây là behavior chuẩn của email client Outlook.
//
//   6. SVG / position:absolute / display:flex / display:grid → KHÔNG dùng.
//
//   7. Inline styles được ưu tiên cho các element quan trọng (text màu, padding)
//      để đảm bảo render ngay cả khi <style> block bị strip (Gmail ngoài domain).
// ============================================================

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'
const SENDER_NAME = 'UNI BOM System'

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

function formatDueDate(date?: string | Date | null): string {
  if (!date) return 'Chưa đặt hạn'
  return new Date(date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' } as any)
}

// ── logoBlock
// iconBgHex: solid hex thay thế rgba(255,255,255,0.15) trên nền header tối.
//   Assign  (#312E81): dùng #4340A0
//   Reassign(#064E3B): dùng #1D6050
//   Delete  (#7F1D1D): dùng #9E3232
// ──────────────────────────────────────────────────────────────────────
function logoBlock(iconBgHex: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
  <tr>
    <td width="36" valign="middle" style="padding-right:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
        <tr>
          <td bgcolor="${iconBgHex}" align="center" valign="middle" height="36" width="36"
              style="border-radius:10px; background-color:${iconBgHex}; color:#ffffff; font-weight:700; font-size:14px; font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
            U
          </td>
        </tr>
      </table>
    </td>
    <td valign="middle">
      <div style="font-size:15px; font-weight:700; color:#ffffff; letter-spacing:-0.02em; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM Planner</div>
      <div style="font-size:10px; color:#cccccc; margin-top:1px; font-family:'Segoe UI',Arial,sans-serif;">Quản lý kế hoạch &amp; nhiệm vụ</div>
    </td>
  </tr>
</table>`
}

// ── badgePill
// bgHex / borderHex: solid hex thay thế rgba overlay trên nền header tối.
//   Assign  : bgHex=#4340A0  borderHex=#5a55bb
//   Reassign: bgHex=#1D6050  borderHex=#2e7060
//   Delete  : bgHex=#9E3232  borderHex=#b84545
// ──────────────────────────────────────────────────────────────────────
function badgePill(text: string, bgHex: string, borderHex: string, dotColor: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
  <tr>
    <td bgcolor="${bgHex}" style="background-color:${bgHex}; border:1px solid ${borderHex}; border-radius:999px; padding:5px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:6px;" valign="middle">
            <div style="width:6px; height:6px; background-color:${dotColor}; border-radius:50%; font-size:0; line-height:0;">&nbsp;</div>
          </td>
          <td valign="middle">
            <span style="font-size:11px; color:#ffffff; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(text)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

// ── taskCardHeader ────────────────────────────────────────────────────
function taskCardHeader(title: string, badgeHtml: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="70%" valign="top" style="font-size:17px; font-weight:700; color:#111827; line-height:1.35; font-family:'Segoe UI',Arial,sans-serif;">${title}</td>
    <td width="30%" valign="top" align="right" style="white-space:nowrap; padding-left:10px;">${badgeHtml}</td>
  </tr>
</table>`
}

// ── ctaButton ─────────────────────────────────────────────────────────
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
    <td align="center" bgcolor="${gradientFrom}"
        style="border-radius:999px; background-color:${gradientFrom}; background-image:linear-gradient(135deg,${gradientFrom},${gradientTo});">
      ${inner}
    </td>
  </tr>
</table>`
}

// ── metaGrid (2x2) ────────────────────────────────────────────────────
function metaGrid(
  items: [string, string][],
  cellBg = '#ffffff',
  cellBorder = '#E5E7EB'
): string {
  const cell = (label: string, value: string) =>
    `<td width="48%" valign="top" bgcolor="${cellBg}"
        style="background-color:${cellBg}; border:1px solid ${cellBorder}; border-radius:10px; padding:10px 13px;">
      <div style="font-size:10px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-family:'Segoe UI',Arial,sans-serif;">${label}</div>
      <div style="font-size:13px; font-weight:600; color:#111827; font-family:'Segoe UI',Arial,sans-serif;">${value}</div>
    </td>`

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    ${cell(items[0][0], items[0][1])}
    <td width="4%" style="font-size:0; line-height:0;">&nbsp;</td>
    ${cell(items[1][0], items[1][1])}
  </tr>
  <tr><td colspan="3" height="10" style="font-size:0; line-height:10px;">&nbsp;</td></tr>
  <tr>
    ${cell(items[2][0], items[2][1])}
    <td width="4%" style="font-size:0; line-height:0;">&nbsp;</td>
    ${cell(items[3][0], items[3][1])}
  </tr>
</table>`
}

// ── personRow ─────────────────────────────────────────────────────────
function personRow(opts: {
  rowBg: string
  rowBorder: string
  avatarBg: string
  avatarBg2: string
  name: string
  role?: string | null
  rightLabel: string
  rightLabelColor?: string
}): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${opts.rowBg}"
       style="background-color:${opts.rowBg}; border:1px solid ${opts.rowBorder}; border-radius:12px;">
  <tr>
    <td style="padding:12px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="36" valign="middle" style="padding-right:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
              <tr>
                <td bgcolor="${opts.avatarBg}" align="center" valign="middle" height="36" width="36"
                    style="border-radius:50%; background-color:${opts.avatarBg}; background-image:linear-gradient(135deg,${opts.avatarBg},${opts.avatarBg2}); color:#ffffff; font-size:14px; font-weight:700; font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
                  ${getInitials(opts.name)}
                </td>
              </tr>
            </table>
          </td>
          <td valign="middle">
            <div style="font-size:13px; font-weight:600; color:#111827; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(opts.name)}</div>
            <div style="font-size:11px; color:#6B7280; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(roleLabel(opts.role))}</div>
          </td>
          <td valign="middle" align="right" width="120"
              style="font-size:11px; color:${opts.rightLabelColor ?? '#9CA3AF'}; font-family:'Segoe UI',Arial,sans-serif; font-weight:${opts.rightLabelColor ? '600' : '400'};">
            ${escapeHtml(opts.rightLabel)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

// ── iconTextBox ───────────────────────────────────────────────────────
function iconTextBox(opts: {
  bg: string
  border: string
  textColor: string
  icon: string
  html: string
}): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${opts.bg}"
       style="background-color:${opts.bg}; border:1px solid ${opts.border}; border-radius:12px; margin-bottom:24px;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="26" valign="top" style="font-size:18px; padding-right:10px; padding-top:1px;">${opts.icon}</td>
          <td valign="top" style="font-size:13px; color:${opts.textColor}; line-height:1.6; font-family:'Segoe UI',Arial,sans-serif;">${opts.html}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
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

// ── Shared CSS (chèn vào <head> của mỗi email) ────────────────────────
// Chỉ chứa style cho các element bên trong body/task-card (không có rgba).
// Styles cho header section đều inline trực tiếp vì nằm trong <td>.
const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background-color:#F0F2F5; font-family:'Segoe UI',Arial,sans-serif; -webkit-font-smoothing:antialiased; margin:0; padding:0; }
.greeting { font-size:15px; color:#374151; line-height:1.6; margin-bottom:24px; font-family:'Segoe UI',Arial,sans-serif; }
.greeting strong { color:#111827; }
.task-card { background:#F8FAFF; border:1.5px solid #E0E7FF; border-radius:16px; padding:20px; margin-bottom:24px; }
.task-card-deleted { background:#FFF5F5; border:1.5px solid #FECACA; border-radius:16px; padding:20px; margin-bottom:24px; }
.priority-badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:0.04em; white-space:nowrap; font-family:'Segoe UI',Arial,sans-serif; }
.priority-high { background:#FEF2F2; color:#EF4444; border:1px solid #FECACA; }
.priority-medium { background:#FFFBEB; color:#F59E0B; border:1px solid #FDE68A; }
.priority-low { background:#ECFDF5; color:#10B981; border:1px solid #A7F3D0; }
.task-desc { font-size:13px; color:#6B7280; line-height:1.6; margin:14px 0 16px; background:#fff; border:1px solid #E5E7EB; border-radius:10px; padding:12px 14px; font-family:'Segoe UI',Arial,sans-serif; }
.task-desc-deleted { font-size:13px; color:#9CA3AF; line-height:1.6; margin:14px 0 16px; background:#FEF2F2; border:1px solid #FEE2E2; border-radius:10px; padding:12px 14px; text-decoration:line-through; font-family:'Segoe UI',Arial,sans-serif; }
.task-title-deleted { font-size:17px; font-weight:700; color:#991B1B; line-height:1.35; text-decoration:line-through; opacity:0.8; margin-bottom:14px; font-family:'Segoe UI',Arial,sans-serif; }
.deleted-watermark { display:inline-block; background:#EF4444; color:#fff; font-size:10px; font-weight:700; letter-spacing:0.08em; padding:3px 10px; border-radius:999px; text-transform:uppercase; font-family:'Segoe UI',Arial,sans-serif; }
.divider { height:1px; background:#F3F4F6; margin:24px 0; font-size:0; line-height:0; }
.cta-wrap { margin-bottom:24px; }
.transfer-visual { background-color:#F0FDF4; border:1.5px solid #A7F3D0; border-radius:16px; padding:16px; margin-bottom:24px; }
.person-name { font-size:13px; font-weight:700; color:#111827; margin-top:8px; font-family:'Segoe UI',Arial,sans-serif; }
.person-role { font-size:11px; color:#6B7280; margin-top:2px; font-family:'Segoe UI',Arial,sans-serif; }
.person-tag { display:inline-block; font-size:10px; font-weight:600; padding:2px 8px; border-radius:999px; margin-top:5px; font-family:'Segoe UI',Arial,sans-serif; }
.tag-from { background:#F3F4F6; color:#6B7280; }
.tag-to { background:#D1FAE5; color:#065F46; }
.arrow-icon { font-size:24px; color:#10B981; line-height:1; text-align:center; }
.arrow-label { font-size:10px; font-weight:600; color:#10B981; letter-spacing:0.05em; margin-top:4px; text-align:center; font-family:'Segoe UI',Arial,sans-serif; }
.plan-info { background-color:#EEF2FF; border:1px solid #C7D2FE; border-radius:12px; padding:14px 16px; margin-bottom:24px; }
.plan-name { font-size:13px; font-weight:700; color:#312E81; font-family:'Segoe UI',Arial,sans-serif; }
.plan-bucket { font-size:11px; color:#6366F1; margin-top:2px; font-family:'Segoe UI',Arial,sans-serif; }
`

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
  taskId?: number
  bucketName?: string | null
  status?: string | null
  assignerRole?: string | null
  assignedDate?: string | Date | null
}

function buildAssignEmailHtml(p: TaskAssignEmailParams): string {
  const priority = priorityMeta(p.priority)
  const status = p.status ?? 'not_started'

  // Solid colors cho theme indigo (#312E81 → #1E40AF)
  const ICON_BG   = '#4340A0'   // ≈ rgba(255,255,255,0.15) on #312E81
  const BADGE_BG  = '#4340A0'
  const BADGE_BR  = '#5A55BB'
  const DOT_COLOR = '#34D399'
  const HDR_BG    = '#312E81'

  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Bạn được giao nhiệm vụ mới</title>
  <style>${BASE_CSS}</style>
</head>
<body style="margin:0; padding:0; background-color:#F0F2F5;">

<!-- Outer background table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0F2F5" style="background-color:#F0F2F5;">
  <tr>
    <td align="center" style="padding:32px 16px 40px 16px;">

      <!--[if (gte mso 9)|(IE)]>
      <table width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
      <![endif]-->

      <!-- Inner 600px container -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="600" style="max-width:600px; width:100%;">

        <!-- ══ HEADER ══ -->
        <tr>
          <td bgcolor="${HDR_BG}"
              style="background-color:${HDR_BG}; background-image:linear-gradient(145deg,#312E81,#1E40AF);
                     border-radius:20px 20px 0 0; padding:28px 32px 24px;
                     -webkit-border-radius:20px 20px 0 0;">
            ${logoBlock(ICON_BG)}
            ${badgePill('Nhiệm vụ mới', BADGE_BG, BADGE_BR, DOT_COLOR)}
            <h1 style="font-size:26px; font-weight:700; color:#ffffff; line-height:1.25;
                        letter-spacing:-0.02em; margin-bottom:8px; font-family:'Segoe UI',Arial,sans-serif;">
              Bạn vừa được<br/>giao một nhiệm vụ
            </h1>
            <p style="font-size:14px; color:#c7d2fe; margin:0; line-height:1.5; font-family:'Segoe UI',Arial,sans-serif;">
              Kiểm tra chi tiết bên dưới và bắt đầu thực hiện ngay hôm nay.
            </p>
          </td>
        </tr>

        <!-- ══ BODY ══ -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff; padding:28px 32px;">

            <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
            <strong>${escapeHtml(p.assignerName)}</strong> đã giao cho bạn nhiệm vụ sau trong dự án
            <strong>${escapeHtml(p.planName)}</strong>. Vui lòng xem chi tiết và bắt đầu thực hiện.</p>

            <!-- Task card -->
            <div class="task-card">
              ${taskCardHeader(
                escapeHtml(p.taskTitle),
                `<span class="priority-badge priority-${priority.cssClass}">${priority.label}</span>`
              )}
              ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
              ${metaGrid([
                ['📅 Hạn hoàn thành', `<span style="color:#EF4444; font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
                ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
                ['🚦 Trạng thái', `<span style="color:#10B981; font-weight:600;">${statusLabel(status)}</span>`],
                ['⏱ Ngày giao', formatDateTime(p.assignedDate)],
              ])}
            </div>

            <!-- Plan info -->
            <div class="plan-info">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="38" valign="middle" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38">
                      <tr>
                        <td bgcolor="#4F46E5" align="center" valign="middle" height="38" width="38"
                            style="border-radius:10px; background-color:#4F46E5;
                                   background-image:linear-gradient(135deg,#4F46E5,#1E40AF);
                                   color:#fff; font-weight:700; font-size:15px;
                                   font-family:'Segoe UI',Arial,sans-serif; text-align:center;">P</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle">
                    <div class="plan-name">${escapeHtml(p.planName)}</div>
                    <div class="plan-bucket">Bucket: ${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</div>
                  </td>
                </tr>
              </table>
            </div>

            <!-- CTA -->
            <div class="cta-wrap">
              ${ctaButton('→ Mở nhiệm vụ trong BOM Planner', '#4F46E5', '#1E40AF', p.taskId)}
            </div>

            <div class="divider"></div>

            ${personRow({
              rowBg: '#F9FAFB',
              rowBorder: '#E5E7EB',
              avatarBg: '#4F46E5',
              avatarBg2: '#7C3AED',
              name: p.assignerName,
              role: p.assignerRole,
              rightLabel: 'Người giao việc',
            })}

          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td bgcolor="#111827"
              style="background-color:#111827; border-radius:0 0 20px 20px; padding:24px 32px;
                     -webkit-border-radius:0 0 20px 20px;">
            <p style="text-align:center; font-size:14px; font-weight:700; color:#ffffff;
                       margin-bottom:16px; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM System</p>
            <p style="font-size:11px; color:#6B7280; text-align:center; line-height:1.6;
                       font-family:'Segoe UI',Arial,sans-serif;">
              Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
              &copy; ${new Date().getFullYear()} UNI Technology
            </p>
          </td>
        </tr>

      </table>

      <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>

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

  // Solid colors cho theme green (#064E3B → #065F46)
  const ICON_BG   = '#1D6050'   // ≈ rgba(255,255,255,0.15) on #064E3B
  const BADGE_BG  = '#1D6050'
  const BADGE_BR  = '#2E7060'
  const DOT_COLOR = '#6EE7B7'
  const HDR_BG    = '#064E3B'

  const headerTitle = isNewView
    ? 'Nhiệm vụ vừa được<br/>chuyển giao cho bạn'
    : 'Nhiệm vụ của bạn<br/>đã được chuyển cho người khác'

  const greeting = isNewView
    ? `Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
       <strong>${escapeHtml(p.changedByName)}</strong> đã chuyển nhiệm vụ
       <strong>&quot;${escapeHtml(p.taskTitle)}&quot;</strong> sang cho bạn thực hiện trong dự án
       <strong>${escapeHtml(p.planName)}</strong>.`
    : `Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
       Nhiệm vụ <strong>&quot;${escapeHtml(p.taskTitle)}&quot;</strong> trong dự án
       <strong>${escapeHtml(p.planName)}</strong> mà bạn đang thực hiện đã được chuyển sang
       cho người khác bởi <strong>${escapeHtml(p.changedByName)}</strong>.`

  const infoBox = isNewView
    ? iconTextBox({
        bg: '#EEF2FF', border: '#C7D2FE', textColor: '#374151',
        icon: 'ℹ️',
        html: `Bạn đã được giao trách nhiệm thực hiện nhiệm vụ này. Hãy xem xét thông tin,
               checklist và deadline để bắt đầu ngay. Nếu có thắc mắc, liên hệ
               <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`,
      })
    : iconTextBox({
        bg: '#F0FDF4', border: '#A7F3D0', textColor: '#374151',
        icon: '✅',
        html: `Nhiệm vụ này không còn thuộc trách nhiệm của bạn. Mọi cập nhật về sau sẽ do
               người thực hiện mới đảm nhận. Nếu đây là nhầm lẫn, vui lòng liên hệ
               <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`,
      })

  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Nhiệm vụ đã được chuyển giao</title>
  <style>${BASE_CSS}</style>
</head>
<body style="margin:0; padding:0; background-color:#F0F2F5;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0F2F5" style="background-color:#F0F2F5;">
  <tr>
    <td align="center" style="padding:32px 16px 40px 16px;">

      <!--[if (gte mso 9)|(IE)]>
      <table width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
      <![endif]-->

      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="600" style="max-width:600px; width:100%;">

        <!-- ══ HEADER ══ -->
        <tr>
          <td bgcolor="${HDR_BG}"
              style="background-color:${HDR_BG}; background-image:linear-gradient(145deg,#064E3B,#065F46);
                     border-radius:20px 20px 0 0; padding:28px 32px 24px;
                     -webkit-border-radius:20px 20px 0 0;">
            ${logoBlock(ICON_BG)}
            ${badgePill('Thay đổi người thực hiện', BADGE_BG, BADGE_BR, DOT_COLOR)}
            <h1 style="font-size:26px; font-weight:700; color:#ffffff; line-height:1.25;
                        letter-spacing:-0.02em; margin-bottom:8px; font-family:'Segoe UI',Arial,sans-serif;">
              ${headerTitle}
            </h1>
            <p style="font-size:14px; color:#a7f3d0; margin:0; line-height:1.5; font-family:'Segoe UI',Arial,sans-serif;">
              Xem chi tiết bên dưới về thay đổi người thực hiện nhiệm vụ.
            </p>
          </td>
        </tr>

        <!-- ══ BODY ══ -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff; padding:28px 32px;">

            <p class="greeting">${greeting}</p>

            <!-- Transfer visual -->
            <div class="transfer-visual">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="40%" align="center" valign="top">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td bgcolor="#9CA3AF" align="center" valign="middle" width="48" height="48"
                            style="border-radius:50%; background-color:#9CA3AF;
                                   background-image:linear-gradient(135deg,#9CA3AF,#6B7280);
                                   color:#fff; font-size:18px; font-weight:700;
                                   font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
                          ${getInitials(p.oldAssigneeName)}
                        </td>
                      </tr>
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
                      <tr>
                        <td bgcolor="#10B981" align="center" valign="middle" width="48" height="48"
                            style="border-radius:50%; background-color:#10B981;
                                   background-image:linear-gradient(135deg,#10B981,#064E3B);
                                   color:#fff; font-size:18px; font-weight:700;
                                   font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
                          ${getInitials(p.newAssigneeName)}
                        </td>
                      </tr>
                    </table>
                    <div class="person-name">${escapeHtml(p.newAssigneeName)}</div>
                    <div class="person-role">${escapeHtml(roleLabel(p.newAssigneeRole))}</div>
                    <span class="person-tag tag-to">Người mới</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Task card -->
            <div class="task-card">
              ${taskCardHeader(
                escapeHtml(p.taskTitle),
                `<span class="priority-badge priority-${priority.cssClass}">${priority.label}</span>`
              )}
              ${p.description ? `<div class="task-desc">${escapeHtml(p.description)}</div>` : ''}
              ${metaGrid([
                ['📅 Hạn hoàn thành', `<span style="color:#EF4444; font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
                ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
                ['🚦 Trạng thái', statusLabel(p.status)],
                ['🔄 Ngày chuyển', formatDateTime(p.changedDate)],
              ])}
            </div>

            ${infoBox}

            <div class="cta-wrap">
              ${ctaButton('→ Mở nhiệm vụ trong BOM Planner', '#10B981', '#064E3B', p.taskId)}
            </div>

            <div class="divider"></div>

            ${personRow({
              rowBg: '#F9FAFB',
              rowBorder: '#E5E7EB',
              avatarBg: '#6366F1',
              avatarBg2: '#4F46E5',
              name: p.changedByName,
              role: p.changedByRole,
              rightLabel: 'Người thực hiện thay đổi',
            })}

          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td bgcolor="#111827"
              style="background-color:#111827; border-radius:0 0 20px 20px; padding:24px 32px;
                     -webkit-border-radius:0 0 20px 20px;">
            <p style="text-align:center; font-size:14px; font-weight:700; color:#ffffff;
                       margin-bottom:16px; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM System</p>
            <p style="font-size:11px; color:#6B7280; text-align:center; line-height:1.6;
                       font-family:'Segoe UI',Arial,sans-serif;">
              Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
              &copy; ${new Date().getFullYear()} UNI Technology
            </p>
          </td>
        </tr>

      </table>

      <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>

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
  // Solid colors cho theme red (#7F1D1D → #991B1B)
  const ICON_BG   = '#9E3232'   // ≈ rgba(255,255,255,0.15) on #7F1D1D
  const BADGE_BG  = '#9E3232'
  const BADGE_BR  = '#B84545'
  const DOT_COLOR = '#FCA5A5'
  const HDR_BG    = '#7F1D1D'

  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Nhiệm vụ đã bị xóa</title>
  <style>${BASE_CSS}</style>
</head>
<body style="margin:0; padding:0; background-color:#F0F2F5;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0F2F5" style="background-color:#F0F2F5;">
  <tr>
    <td align="center" style="padding:32px 16px 40px 16px;">

      <!--[if (gte mso 9)|(IE)]>
      <table width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
      <![endif]-->

      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="600" style="max-width:600px; width:100%;">

        <!-- ══ HEADER ══ -->
        <tr>
          <td bgcolor="${HDR_BG}"
              style="background-color:${HDR_BG}; background-image:linear-gradient(145deg,#7F1D1D,#991B1B);
                     border-radius:20px 20px 0 0; padding:28px 32px 24px;
                     -webkit-border-radius:20px 20px 0 0;">
            ${logoBlock(ICON_BG)}
            ${badgePill('Nhiệm vụ đã xóa', BADGE_BG, BADGE_BR, DOT_COLOR)}
            <h1 style="font-size:26px; font-weight:700; color:#ffffff; line-height:1.25;
                        letter-spacing:-0.02em; margin-bottom:8px; font-family:'Segoe UI',Arial,sans-serif;">
              Nhiệm vụ của bạn<br/>đã bị xóa
            </h1>
            <p style="font-size:14px; color:#fca5a5; margin:0; line-height:1.5; font-family:'Segoe UI',Arial,sans-serif;">
              Nhiệm vụ bạn đang thực hiện đã bị xóa khỏi hệ thống. Vui lòng liên hệ người quản lý nếu cần thêm thông tin.
            </p>
          </td>
        </tr>

        <!-- ══ BODY ══ -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff; padding:28px 32px;">

            <p class="greeting">Xin chào <strong>${escapeHtml(p.recipientName)}</strong>, 👋<br/>
            Chúng tôi thông báo rằng nhiệm vụ <strong>&quot;${escapeHtml(p.taskTitle)}&quot;</strong>
            bạn đang thực hiện trong dự án <strong>${escapeHtml(p.planName)}</strong>
            đã bị xóa bởi <strong>${escapeHtml(p.deletedByName)}</strong>.</p>

            <!-- Task card (deleted style) -->
            <div class="task-card-deleted">
              <div style="text-align:right; margin-bottom:10px;">
                <span class="deleted-watermark">Đã xóa</span>
              </div>
              <div class="task-title-deleted">${escapeHtml(p.taskTitle)}</div>
              ${p.description ? `<div class="task-desc-deleted">${escapeHtml(p.description)}</div>` : ''}
              ${metaGrid(
                [
                  ['📅 Hạn hoàn thành (cũ)', formatDueDate(p.dueDate)],
                  ['📋 Cột (Bucket)', escapeHtml(p.bucketName ?? 'Chưa phân loại')],
                  ['🚦 Trạng thái (cũ)', statusLabel(p.status)],
                  ['🗑 Ngày xóa', formatDateTime(p.deletedDate)],
                ],
                '#FEF2F2',
                '#FEE2E2'
              )}
            </div>

            ${iconTextBox({
              bg: '#FFFBEB', border: '#FDE68A', textColor: '#92400E',
              icon: '⚠️',
              html: `Mọi dữ liệu liên quan đến nhiệm vụ này (checklist, ghi chú, file đính kèm)
                     đã bị xóa vĩnh viễn. Nếu đây là nhầm lẫn, vui lòng liên hệ
                     <strong style="color:#78350F;">${escapeHtml(p.deletedByName)}</strong>
                     hoặc quản trị viên hệ thống ngay lập tức.`,
            })}

            <div class="cta-wrap">
              ${ctaButton('→ Xem các nhiệm vụ còn lại', '#1E40AF', '#312E81')}
            </div>

            <div class="divider"></div>

            ${personRow({
              rowBg: '#FEF2F2',
              rowBorder: '#FECACA',
              avatarBg: '#EF4444',
              avatarBg2: '#991B1B',
              name: p.deletedByName,
              role: p.deletedByRole,
              rightLabel: 'Người thực hiện xóa',
              rightLabelColor: '#EF4444',
            })}

          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td bgcolor="#111827"
              style="background-color:#111827; border-radius:0 0 20px 20px; padding:24px 32px;
                     -webkit-border-radius:0 0 20px 20px;">
            <p style="text-align:center; font-size:14px; font-weight:700; color:#ffffff;
                       margin-bottom:16px; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM System</p>
            <p style="font-size:11px; color:#6B7280; text-align:center; line-height:1.6;
                       font-family:'Segoe UI',Arial,sans-serif;">
              Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
              &copy; ${new Date().getFullYear()} UNI Technology
            </p>
          </td>
        </tr>

      </table>

      <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>

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