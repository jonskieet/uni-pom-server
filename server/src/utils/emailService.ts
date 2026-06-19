// ============================================================
// server/src/utils/emailService.ts
// Gửi email thông báo qua Brevo HTTP API (https://api.brevo.com)
//
// ── OUTLOOK COMPATIBILITY NOTES ──────────────────────────────────────
//  1. Tất cả layout dùng <table> — không dùng div cho container/card
//  2. bgcolor="" attribute trên <td> — không dùng CSS background-color đơn thuần
//  3. Không dùng rgba() — chỉ dùng solid hex
//  4. Không dùng border-radius trên <div> — chỉ dùng inline style trên <td> (ignored gracefully)
//  5. Divider là <table height="1" bgcolor> — không phải <div style="height:1px">
//  6. Badge dot dùng ký tự &#9679; (●) — không dùng <div border-radius:50%>
//  7. Emoji trong label bị render thành ô vuông pixel → đã bỏ hoàn toàn
//  8. Outer wrapper là 2 lớp table lồng nhau (background + centering 600px)
//  9. Template mới (v2) dùng table-based layout hoàn toàn, tương thích Gmail + Outlook
// ============================================================

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'
const SENDER_NAME   = 'UNI BOM System'
const APP_URL       = process.env.APP_URL || process.env.FRONTEND_URL || ''

// ── Lookup tables ──────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress:  'Đang làm',
  completed:    'Hoàn thành',
  deferred:     'Tạm hoãn',
}

const PRIORITY_META: Record<string, { label: string; cssClass: string }> = {
  low:    { label: 'Thấp',       cssClass: 'low'    },
  medium: { label: 'Trung bình', cssClass: 'medium' },
  urgent: { label: 'Khẩn cấp',  cssClass: 'high'   },
}

const ROLE_LABEL: Record<string, string> = {
  admin:          'Quản trị viên',
  sales:          'Sale',
  sales_admin:    'Sale Admin',
  technical:      'Kỹ thuật',
  technical_lead: 'Trưởng phòng KT',
  ke_toan:        'Kế toán',
}

// ── Helpers ────────────────────────────────────────────────────────────
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function getInitials(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function roleLabel(role?: string | null)  { return role ? (ROLE_LABEL[role] ?? role) : '' }
function statusLabel(s?: string | null)   { return s ? (STATUS_LABEL[s] ?? s) : 'Không rõ' }
function priorityMeta(p?: string | null)  { return PRIORITY_META[p ?? ''] ?? { label: p ?? 'Không rõ', cssClass: 'medium' } }

function formatDueDate(date?: string | Date | null): string {
  if (!date) return 'Chưa đặt hạn'
  return new Date(date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
function formatDateTime(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' } as any)
}

// ── Brevo send ─────────────────────────────────────────────────────────
async function sendBrevoEmail(params: {
  toEmail: string; toName: string; subject: string; html: string; logTag: string
}): Promise<void> {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('[Email] BREVO_API_KEY/EMAIL_FROM chưa cấu hình — bỏ qua')
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
        sender:      { name: SENDER_NAME, email: process.env.EMAIL_FROM },
        to:          [{ email: params.toEmail, name: params.toName }],
        subject:     params.subject,
        htmlContent: params.html,
      }),
    })
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { messageId?: string }
    console.log(`[Email] ${params.logTag} → ${params.toEmail} — messageId: ${data.messageId}`)
  } catch (err) {
    console.error(`[Email] Lỗi gửi (${params.logTag}):`, err)
  }
}

// ── Priority colors ────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  high:   { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA' },
  medium: { bg: '#FFFBEB', color: '#F59E0B', border: '#FDE68A' },
  low:    { bg: '#ECFDF5', color: '#10B981', border: '#A7F3D0' },
}

// ── Shared building blocks ─────────────────────────────────────────────

/** Badge ưu tiên — table-based, align=right để shrink-wrap trên Outlook */
function priorityBadge(label: string, cssClass: string): string {
  const c = PRIORITY_COLORS[cssClass] ?? PRIORITY_COLORS.medium
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
  <tr>
    <td bgcolor="${c.bg}" align="center" valign="middle"
        style="background-color:${c.bg};border:1px solid ${c.border};border-radius:999px;padding:3px 10px;
               font-size:11px;font-weight:700;letter-spacing:0.04em;color:${c.color};white-space:nowrap;
               font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(label)}</td>
  </tr>
</table>`
}

/** Meta grid 2×2 dùng table với spacer pixel cố định */
function metaGrid(
  items: [string, string][],
  cellBg = '#ffffff',
  cellBorder = '#E5E7EB',
): string {
  const cell = (label: string, value: string) =>
    `<td width="46%" valign="top" bgcolor="${cellBg}"
         style="background-color:${cellBg};border:1px solid ${cellBorder};border-radius:10px;padding:10px 13px;">
       <div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;
                   margin-bottom:4px;font-family:'Segoe UI',Arial,sans-serif;">${label}</div>
       <div style="font-size:13px;font-weight:600;color:#111827;font-family:'Segoe UI',Arial,sans-serif;">${value}</div>
     </td>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    ${cell(items[0][0], items[0][1])}
    <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
    ${cell(items[1][0], items[1][1])}
  </tr>
  <tr><td colspan="3" height="8" style="font-size:0;line-height:8px;">&nbsp;</td></tr>
  <tr>
    ${cell(items[2][0], items[2][1])}
    <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
    ${cell(items[3][0], items[3][1])}
  </tr>
</table>`
}

/** Divider ngang */
function dividerRow(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin:24px 0;">
  <tr>
    <td bgcolor="#F3F4F6" height="1"
        style="background-color:#F3F4F6;font-size:0;line-height:1px;">&nbsp;</td>
  </tr>
</table>`
}

/** Info / warning box */
function infoBox(
  bg: string, border: string, textColor: string,
  icon: string, html: string,
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        bgcolor="${bg}"
        style="background-color:${bg};border:1px solid ${border};border-radius:12px;margin-bottom:24px;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="28" valign="top"
              style="font-size:18px;padding-right:10px;padding-top:1px;
                     font-family:Arial,sans-serif;color:${textColor};">${icon}</td>
          <td valign="top"
              style="font-size:13px;color:${textColor};line-height:1.6;
                     font-family:'Segoe UI',Arial,sans-serif;">${html}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/**
 * Bulletproof CTA button — bo tròn thật trên cả Gmail lẫn Outlook.
 * - Outlook: VML <v:roundrect> arcsize=50% → pill tròn hoàn hảo
 * - Gmail / Apple Mail: <a> table-cell với border-radius:999px
 * - <span> bọc chữ để chặn Outlook override màu Hyperlink xanh
 */
function ctaButton(
  label: string,
  bgColor: string,
  taskId?: number,
  fallbackPath = '/planner',
): string {
  const href = APP_URL
    ? `${APP_URL}${taskId ? `/planner/task/${taskId}` : fallbackPath}`
    : '#'

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin-bottom:24px;">
  <tr>
    <td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${href}" style="height:46px;v-text-anchor:middle;width:260px;"
        arcsize="50%" fillcolor="${bgColor}" stroke="f">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;
                       text-decoration:none;letter-spacing:0.01em;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="${bgColor}"
              style="background-color:${bgColor};border-radius:999px;">
            <a href="${href}"
               style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;
                      color:#ffffff!important;text-decoration:none!important;
                      letter-spacing:0.01em;font-family:'Segoe UI',Arial,sans-serif;">
              <span style="color:#ffffff;text-decoration:none;font-weight:700;
                           font-family:'Segoe UI',Arial,sans-serif;">${label}</span>
            </a>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    </td>
  </tr>
</table>`
}

/** Row hiển thị người giao / thay đổi / xóa */
function personRow(opts: {
  rowBg: string; rowBorder: string
  avatarBg: string
  name: string; role?: string | null
  rightLabel: string; rightLabelColor?: string
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        bgcolor="${opts.rowBg}"
        style="background-color:${opts.rowBg};border:1px solid ${opts.rowBorder};border-radius:12px;">
  <tr>
    <td style="padding:12px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="46" valign="middle" style="padding-right:10px;">
            <!--[if mso]>
            <v:oval xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              style="height:36px;v-text-anchor:middle;width:36px;" fillcolor="${opts.avatarBg}" stroke="f">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;">${getInitials(opts.name)}</center>
            </v:oval>
            <![endif]-->
            <!--[if !mso]><!-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
              <tr>
                <td bgcolor="${opts.avatarBg}" align="center" valign="middle"
                    width="36" height="36"
                    style="background-color:${opts.avatarBg};border-radius:50%;color:#ffffff;
                           font-size:14px;font-weight:700;line-height:36px;
                           font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
                  ${getInitials(opts.name)}
                </td>
              </tr>
            </table>
            <!--<![endif]-->
          </td>
          <td valign="middle">
            <div style="font-size:13px;font-weight:600;color:#111827;
                        font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(opts.name)}</div>
            <div style="font-size:11px;color:#6B7280;
                        font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(roleLabel(opts.role))}</div>
          </td>
          <td align="right" valign="middle" width="140"
              style="font-size:11px;color:${opts.rightLabelColor ?? '#9CA3AF'};
                     font-weight:${opts.rightLabelColor ? '600' : '400'};
                     font-family:'Segoe UI',Arial,sans-serif;">
            ${escapeHtml(opts.rightLabel)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/** Logo + tên app trong header */
function logoBlock(iconBgHex: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin-bottom:24px;">
  <tr>
    <td width="46" valign="middle">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        style="height:36px;v-text-anchor:middle;width:36px;" arcsize="28%" fillcolor="${iconBgHex}" stroke="f">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;">U</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
        <tr>
          <td bgcolor="${iconBgHex}" align="center" valign="middle" width="36" height="36"
              style="background-color:${iconBgHex};border-radius:10px;color:#ffffff;
                     font-weight:700;font-size:14px;line-height:36px;
                     font-family:'Segoe UI',Arial,sans-serif;text-align:center;">U</td>
        </tr>
      </table>
      <!--<![endif]-->
    </td>
    <td valign="middle" style="padding-left:10px;">
      <div style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;
                  line-height:1.2;font-family:'Segoe UI',Arial,sans-serif;">UNI BOM Planner</div>
      <div style="font-size:10px;color:#cccccc;margin-top:2px;
                  font-family:'Segoe UI',Arial,sans-serif;">Quản lý kế hoạch &amp; nhiệm vụ</div>
    </td>
  </tr>
</table>`
}

/** Badge pill trong header (dùng ký tự ● thay div tròn) */
function badgePill(
  text: string,
  bgHex: string,
  borderHex: string,
  dotColor: string,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="margin-bottom:14px;">
  <tr>
    <td bgcolor="${bgHex}"
        style="background-color:${bgHex};border:1px solid ${borderHex};
               border-radius:999px;padding:5px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle"
              style="padding-right:6px;font-size:10px;color:${dotColor};
                     line-height:1;font-family:Arial,sans-serif;">&#9679;</td>
          <td valign="middle"
              style="font-size:11px;color:#ffffff;font-weight:600;letter-spacing:0.05em;
                     text-transform:uppercase;white-space:nowrap;
                     font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(text)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/** Footer chung */
function footerRow(): string {
  return `<tr>
  <td bgcolor="#111827"
      style="background-color:#111827;border-radius:0 0 20px 20px;padding:24px 32px;">
    <p style="text-align:center;font-size:14px;font-weight:700;color:#ffffff;
              margin:0 0 14px;font-family:'Segoe UI',Arial,sans-serif;">UNI BOM System</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-bottom:14px;">
      <tr>
        <td align="center">
          <a href="#" style="font-size:12px;color:#9CA3AF;text-decoration:none;
                             font-family:'Segoe UI',Arial,sans-serif;">Về chúng tôi</a>
          <span style="color:#374151;padding:0 10px;">|</span>
          <a href="#" style="font-size:12px;color:#9CA3AF;text-decoration:none;
                             font-family:'Segoe UI',Arial,sans-serif;">Hỗ trợ</a>
          <span style="color:#374151;padding:0 10px;">|</span>
          <a href="#" style="font-size:12px;color:#9CA3AF;text-decoration:none;
                             font-family:'Segoe UI',Arial,sans-serif;">Chính sách bảo mật</a>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-bottom:14px;">
      <tr>
        <td bgcolor="#374151" height="1"
            style="background-color:#374151;font-size:0;line-height:1px;">&nbsp;</td>
      </tr>
    </table>
    <p style="font-size:11px;color:#6B7280;text-align:center;line-height:1.6;
              margin:0;font-family:'Segoe UI',Arial,sans-serif;">
      Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
      &copy; ${new Date().getFullYear()} UNI Technology
    </p>
  </td>
</tr>`
}

/** Outer HTML shell */
function htmlShell(title: string, innerRows: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="vi">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escapeHtml(title)}</title>
  <style type="text/css">
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background-color:#F0F2F5; font-family:'Segoe UI',Arial,sans-serif;
           margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:inherit; text-decoration:none; }
    /* Chặn Outlook tự gán màu xanh + gạch chân cho hyperlink */
    span.MsoHyperlink, span.MsoHyperlinkFollowed {
      color:inherit !important; text-decoration:none !important;
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F0F2F5;">
<!--[if (gte mso 9)|(IE)]>
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F0F2F5">
<tr><td align="center"><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0F2F5" style="background-color:#F0F2F5;">
  <tr>
    <td align="center" style="padding:32px 16px 40px;">
      <!--[if (gte mso 9)|(IE)]>
      <table width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
      <![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="600" style="max-width:600px;width:100%;">
        ${innerRows}
      </table>
      <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
<!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->
</body>
</html>`
}

// ============================================================
// 1. GIAO VIỆC
// ============================================================

export interface TaskAssignEmailParams {
  toEmail: string; recipientName: string
  taskTitle: string; planName: string; assignerName: string
  priority: string; dueDate?: string | Date | null; description?: string | null
  taskId?: number; bucketName?: string | null; status?: string | null
  assignerRole?: string | null; assignedDate?: string | Date | null
}

function buildAssignEmailHtml(p: TaskAssignEmailParams): string {
  const pri = priorityMeta(p.priority)

  // ── Indigo theme ──
  const HDR_BG   = '#1E40AF'   // header td bgcolor (solid fallback)
  const ICON_BG  = '#2D3BA0'   // logo icon bg (solid thay rgba)
  const BADGE_BG = '#2D3BA0'
  const BADGE_BD = '#4B56CC'
  const DOT_CLR  = '#34D399'

  const rows = `
<!-- HEADER -->
<tr>
  <td bgcolor="${HDR_BG}"
      style="background-color:${HDR_BG};
             background-image:linear-gradient(145deg,#312E81,#1E40AF);
             border-radius:20px 20px 0 0;padding:28px 32px 24px;">
    ${logoBlock(ICON_BG)}
    ${badgePill('Nhiệm vụ mới', BADGE_BG, BADGE_BD, DOT_CLR)}
    <h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;
               letter-spacing:-0.02em;margin:0 0 8px;
               font-family:'Segoe UI',Arial,sans-serif;">
      Bạn vừa được<br/>giao một nhiệm vụ
    </h1>
    <p style="font-size:14px;color:#c7d2fe;margin:0;line-height:1.5;
              font-family:'Segoe UI',Arial,sans-serif;">
      Kiểm tra chi tiết bên dưới và bắt đầu thực hiện ngay hôm nay.
    </p>
  </td>
</tr>

<!-- BODY -->
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">

    <!-- Greeting -->
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;
              font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      <strong style="color:#111827;">${escapeHtml(p.assignerName)}</strong>
      đã giao cho bạn nhiệm vụ sau trong dự án
      <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>.
      Vui lòng xem chi tiết và bắt đầu thực hiện.
    </p>

    <!-- Task card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           bgcolor="#F8FAFF"
           style="background-color:#F8FAFF;border:1.5px solid #E0E7FF;
                  border-radius:16px;margin-bottom:24px;">
      <tr><td style="padding:20px;">

        <!-- Title + priority -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-bottom:14px;">
          <tr>
            <td valign="top"
                style="font-size:17px;font-weight:700;color:#111827;line-height:1.35;
                       font-family:'Segoe UI',Arial,sans-serif;">
              ${escapeHtml(p.taskTitle)}
            </td>
            <td valign="top" align="right" style="padding-left:10px;white-space:nowrap;">
              ${priorityBadge(pri.label, pri.cssClass)}
            </td>
          </tr>
        </table>

        <!-- Description -->
        ${p.description ? `
        <div style="font-size:13px;color:#6B7280;line-height:1.6;margin-bottom:16px;
                    background:#ffffff;border:1px solid #E5E7EB;border-radius:10px;
                    padding:12px 14px;font-family:'Segoe UI',Arial,sans-serif;">
          ${escapeHtml(p.description)}
        </div>` : ''}

        <!-- Meta grid -->
        ${metaGrid([
          ['Hạn hoàn thành', `<span style="color:#EF4444;font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
          ['Cột (Bucket)',   escapeHtml(p.bucketName ?? 'Chưa phân loại')],
          ['Trạng thái',    `<span style="color:#10B981;font-weight:600;">${statusLabel(p.status)}</span>`],
          ['Ngày giao',     formatDateTime(p.assignedDate)],
        ])}

      </td></tr>
    </table>

    <!-- Plan info box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           bgcolor="#EEF2FF"
           style="background-color:#EEF2FF;border:1px solid #C7D2FE;
                  border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50" valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38">
                <tr>
                  <td bgcolor="#1E40AF" align="center" valign="middle" width="38" height="38"
                      style="background-color:#1E40AF;border-radius:10px;color:#ffffff;
                             font-size:16px;font-family:'Segoe UI',Arial,sans-serif;
                             text-align:center;">P</td>
                </tr>
              </table>
            </td>
            <td valign="middle" style="padding-left:12px;">
              <div style="font-size:13px;font-weight:700;color:#312E81;
                          font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.planName)}</div>
              <div style="font-size:11px;color:#6366F1;margin-top:2px;
                          font-family:'Segoe UI',Arial,sans-serif;">
                Bucket: ${escapeHtml(p.bucketName ?? 'Chưa phân loại')}
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA -->
    ${ctaButton('&#8594; Mở nhiệm vụ trong BOM Planner', '#1E40AF', p.taskId)}

    ${dividerRow()}

    <!-- Assigner -->
    ${personRow({
      rowBg: '#F9FAFB', rowBorder: '#E5E7EB',
      avatarBg: '#4F46E5',
      name: p.assignerName, role: p.assignerRole,
      rightLabel: 'Người giao việc',
    })}

  </td>
</tr>

${footerRow()}`

  return htmlShell('Bạn được giao nhiệm vụ mới', rows)
}

export async function sendTaskAssignEmail(params: TaskAssignEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName:  params.recipientName,
    subject: `[UNI] Bạn được giao việc: ${params.taskTitle}`,
    html:    buildAssignEmailHtml(params),
    logTag:  'Giao việc',
  })
}

// ============================================================
// 2. CHUYỂN GIAO
// ============================================================

export interface TaskReassignEmailParams {
  toEmail: string; viewpoint: 'new' | 'old'; recipientName: string
  oldAssigneeName: string; oldAssigneeRole?: string | null
  newAssigneeName: string; newAssigneeRole?: string | null
  taskId?: number; taskTitle: string; description?: string | null
  planName: string; bucketName?: string | null; status?: string | null
  priority: string; dueDate?: string | Date | null
  changedByName: string; changedByRole?: string | null; changedDate?: string | Date | null
}

function buildReassignEmailHtml(p: TaskReassignEmailParams): string {
  const pri       = priorityMeta(p.priority)
  const isNewView = p.viewpoint === 'new'

  // ── Green theme ──
  const HDR_BG   = '#065F46'
  const ICON_BG  = '#1D6050'
  const BADGE_BG = '#1D6050'
  const BADGE_BD = '#2E7060'
  const DOT_CLR  = '#6EE7B7'

  const rows = `
<!-- HEADER -->
<tr>
  <td bgcolor="${HDR_BG}"
      style="background-color:${HDR_BG};
             background-image:linear-gradient(145deg,#064E3B,#065F46);
             border-radius:20px 20px 0 0;padding:28px 32px 24px;">
    ${logoBlock(ICON_BG)}
    ${badgePill('Thay đổi người thực hiện', BADGE_BG, BADGE_BD, DOT_CLR)}
    <h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;
               letter-spacing:-0.02em;margin:0 0 8px;
               font-family:'Segoe UI',Arial,sans-serif;">
      ${isNewView
        ? 'Nhiệm vụ vừa được<br/>chuyển giao cho bạn'
        : 'Nhiệm vụ của bạn<br/>đã được chuyển cho người khác'}
    </h1>
    <p style="font-size:14px;color:#a7f3d0;margin:0;line-height:1.5;
              font-family:'Segoe UI',Arial,sans-serif;">
      Xem chi tiết bên dưới về thay đổi người thực hiện nhiệm vụ.
    </p>
  </td>
</tr>

<!-- BODY -->
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">

    <!-- Greeting -->
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;
              font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      ${isNewView
        ? `<strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>
           đã chuyển nhiệm vụ <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong>
           sang cho bạn thực hiện trong dự án
           <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>.`
        : `Nhiệm vụ <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong>
           trong dự án <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>
           đã được chuyển sang cho người khác bởi
           <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`}
    </p>

    <!-- Transfer visual -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           bgcolor="#F0FDF4"
           style="background-color:#F0FDF4;border:1.5px solid #A7F3D0;
                  border-radius:16px;margin-bottom:24px;">
      <tr><td style="padding:16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <!-- Old person -->
            <td width="42%" align="center" valign="top" style="padding:10px;">
              <!--[if mso]>
              <v:oval xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                style="height:48px;v-text-anchor:middle;width:48px;" fillcolor="#9CA3AF" stroke="f">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:700;">${getInitials(p.oldAssigneeName)}</center>
              </v:oval>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto 8px;">
                <tr>
                  <td bgcolor="#9CA3AF" align="center" valign="middle" width="48" height="48"
                      style="background-color:#9CA3AF;border-radius:50%;
                             color:#ffffff;font-size:18px;font-weight:700;line-height:48px;
                             font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
                    ${getInitials(p.oldAssigneeName)}
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
              <div style="font-size:13px;font-weight:700;color:#111827;
                          font-family:'Segoe UI',Arial,sans-serif;">
                ${escapeHtml(p.oldAssigneeName)}
              </div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px;
                          font-family:'Segoe UI',Arial,sans-serif;">
                ${escapeHtml(roleLabel(p.oldAssigneeRole))}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     align="center" style="margin-top:5px;">
                <tr>
                  <td bgcolor="#F3F4F6" align="center" valign="middle"
                      style="background-color:#F3F4F6;border-radius:999px;
                             padding:2px 8px;font-size:10px;font-weight:600;
                             color:#6B7280;white-space:nowrap;
                             font-family:'Segoe UI',Arial,sans-serif;">Người cũ</td>
                </tr>
              </table>
            </td>

            <!-- Arrow -->
            <td width="16%" align="center" valign="middle">
              <div style="font-size:28px;color:#10B981;text-align:center;
                          font-family:Arial,sans-serif;">&#8594;</div>
              <div style="font-size:10px;font-weight:600;color:#10B981;
                          letter-spacing:0.05em;text-align:center;margin-top:4px;
                          font-family:'Segoe UI',Arial,sans-serif;">Chuyển giao</div>
            </td>

            <!-- New person -->
            <td width="42%" align="center" valign="top" style="padding:10px;">
              <!--[if mso]>
              <v:oval xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                style="height:48px;v-text-anchor:middle;width:48px;" fillcolor="#10B981" stroke="f">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:18px;font-weight:700;">${getInitials(p.newAssigneeName)}</center>
              </v:oval>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto 8px;">
                <tr>
                  <td bgcolor="#10B981" align="center" valign="middle" width="48" height="48"
                      style="background-color:#10B981;border-radius:50%;
                             color:#ffffff;font-size:18px;font-weight:700;line-height:48px;
                             font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
                    ${getInitials(p.newAssigneeName)}
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
              <div style="font-size:13px;font-weight:700;color:#111827;
                          font-family:'Segoe UI',Arial,sans-serif;">
                ${escapeHtml(p.newAssigneeName)}
              </div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px;
                          font-family:'Segoe UI',Arial,sans-serif;">
                ${escapeHtml(roleLabel(p.newAssigneeRole))}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     align="center" style="margin-top:5px;">
                <tr>
                  <td bgcolor="#D1FAE5" align="center" valign="middle"
                      style="background-color:#D1FAE5;border-radius:999px;
                             padding:2px 8px;font-size:10px;font-weight:600;
                             color:#065F46;white-space:nowrap;
                             font-family:'Segoe UI',Arial,sans-serif;">Người mới</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Task card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           bgcolor="#F8FAFF"
           style="background-color:#F8FAFF;border:1.5px solid #E0E7FF;
                  border-radius:16px;margin-bottom:24px;">
      <tr><td style="padding:20px;">

        <!-- Title + priority -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-bottom:14px;">
          <tr>
            <td valign="top"
                style="font-size:17px;font-weight:700;color:#111827;line-height:1.35;
                       font-family:'Segoe UI',Arial,sans-serif;">
              ${escapeHtml(p.taskTitle)}
            </td>
            <td valign="top" align="right" style="padding-left:10px;white-space:nowrap;">
              ${priorityBadge(pri.label, pri.cssClass)}
            </td>
          </tr>
        </table>

        <!-- Description -->
        ${p.description ? `
        <div style="font-size:13px;color:#6B7280;line-height:1.6;margin-bottom:16px;
                    background:#ffffff;border:1px solid #E5E7EB;border-radius:10px;
                    padding:12px 14px;font-family:'Segoe UI',Arial,sans-serif;">
          ${escapeHtml(p.description)}
        </div>` : ''}

        <!-- Meta grid -->
        ${metaGrid([
          ['Hạn hoàn thành', `<span style="color:#EF4444;font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
          ['Cột (Bucket)',   escapeHtml(p.bucketName ?? 'Chưa phân loại')],
          ['Trạng thái',    statusLabel(p.status)],
          ['Ngày chuyển',   formatDateTime(p.changedDate)],
        ])}

      </td></tr>
    </table>

    <!-- Info box -->
    ${isNewView
      ? infoBox('#EEF2FF', '#C7D2FE', '#374151', 'i',
          `Bạn đã được giao trách nhiệm thực hiện nhiệm vụ này. Hãy xem xét thông tin,
           checklist và deadline để bắt đầu ngay. Nếu có thắc mắc, liên hệ
           <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`)
      : infoBox('#F0FDF4', '#A7F3D0', '#374151', 'ok',
          `Nhiệm vụ này không còn thuộc trách nhiệm của bạn. Mọi cập nhật về sau sẽ do
           người thực hiện mới đảm nhận. Nếu đây là nhầm lẫn, liên hệ
           <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`)}

    <!-- CTA -->
    ${ctaButton('&#8594; Mở nhiệm vụ trong BOM Planner', '#065F46', p.taskId)}

    ${dividerRow()}

    <!-- Changed by -->
    ${personRow({
      rowBg: '#F9FAFB', rowBorder: '#E5E7EB',
      avatarBg: '#6366F1',
      name: p.changedByName, role: p.changedByRole,
      rightLabel: 'Người thực hiện thay đổi',
    })}

  </td>
</tr>

${footerRow()}`

  return htmlShell('Nhiệm vụ đã được chuyển giao', rows)
}

export async function sendTaskReassignEmail(params: TaskReassignEmailParams): Promise<void> {
  const subject = params.viewpoint === 'new'
    ? `[UNI] Nhiệm vụ được chuyển giao cho bạn: ${params.taskTitle}`
    : `[UNI] Nhiệm vụ đã được chuyển cho người khác: ${params.taskTitle}`
  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName:  params.recipientName,
    subject,
    html:    buildReassignEmailHtml(params),
    logTag:  params.viewpoint === 'new' ? 'Chuyển giao (mới)' : 'Chuyển giao (cũ)',
  })
}

// ============================================================
// 3. XÓA NHIỆM VỤ
// ============================================================

export interface TaskDeleteEmailParams {
  toEmail: string; recipientName: string
  taskTitle: string; description?: string | null
  planName: string; bucketName?: string | null; status?: string | null
  dueDate?: string | Date | null
  deletedByName: string; deletedByRole?: string | null; deletedDate?: string | Date | null
}

function buildDeleteEmailHtml(p: TaskDeleteEmailParams): string {
  // ── Red theme ──
  const HDR_BG   = '#991B1B'
  const ICON_BG  = '#9E3232'
  const BADGE_BG = '#9E3232'
  const BADGE_BD = '#B84545'
  const DOT_CLR  = '#FCA5A5'

  const rows = `
<!-- HEADER -->
<tr>
  <td bgcolor="${HDR_BG}"
      style="background-color:${HDR_BG};
             background-image:linear-gradient(145deg,#7F1D1D,#991B1B);
             border-radius:20px 20px 0 0;padding:28px 32px 24px;">
    ${logoBlock(ICON_BG)}
    ${badgePill('Nhiệm vụ đã xóa', BADGE_BG, BADGE_BD, DOT_CLR)}
    <h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;
               letter-spacing:-0.02em;margin:0 0 8px;
               font-family:'Segoe UI',Arial,sans-serif;">
      Nhiệm vụ của bạn<br/>đã bị xóa
    </h1>
    <p style="font-size:14px;color:#fca5a5;margin:0;line-height:1.5;
              font-family:'Segoe UI',Arial,sans-serif;">
      Nhiệm vụ bạn đang thực hiện đã bị xóa khỏi hệ thống.
      Vui lòng liên hệ người quản lý nếu cần thêm thông tin.
    </p>
  </td>
</tr>

<!-- BODY -->
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">

    <!-- Greeting -->
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;
              font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      Chúng tôi thông báo rằng nhiệm vụ
      <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong>
      bạn đang thực hiện trong dự án
      <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>
      đã bị xóa bởi
      <strong style="color:#111827;">${escapeHtml(p.deletedByName)}</strong>.
    </p>

    <!-- Deleted task card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           bgcolor="#FFF5F5"
           style="background-color:#FFF5F5;border:1.5px solid #FECACA;
                  border-radius:16px;margin-bottom:24px;">
      <tr><td style="padding:20px;">

        <!-- "Đã xóa" watermark badge (table, align=right) + title -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-bottom:12px;">
          <tr>
            <td valign="top"
                style="font-size:17px;font-weight:700;color:#991B1B;line-height:1.35;
                       text-decoration:line-through;
                       font-family:'Segoe UI',Arial,sans-serif;">
              ${escapeHtml(p.taskTitle)}
            </td>
            <td valign="top" align="right" style="padding-left:10px;white-space:nowrap;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
                <tr>
                  <td bgcolor="#EF4444" align="center" valign="middle"
                      style="background-color:#EF4444;border-radius:999px;
                             padding:3px 10px;font-size:10px;font-weight:700;
                             letter-spacing:0.08em;color:#ffffff;text-transform:uppercase;
                             white-space:nowrap;font-family:'Segoe UI',Arial,sans-serif;">
                    Đã xóa
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Description (struck-through) -->
        ${p.description ? `
        <div style="font-size:13px;color:#9CA3AF;line-height:1.6;margin-bottom:16px;
                    background:#FEF2F2;border:1px solid #FEE2E2;border-radius:10px;
                    padding:12px 14px;text-decoration:line-through;
                    font-family:'Segoe UI',Arial,sans-serif;">
          ${escapeHtml(p.description)}
        </div>` : ''}

        <!-- Meta grid (red tones) -->
        ${metaGrid([
          ['Hạn hoàn thành (cũ)', `<span style="color:#9CA3AF;">${formatDueDate(p.dueDate)}</span>`],
          ['Cột (Bucket)',         `<span style="color:#9CA3AF;">${escapeHtml(p.bucketName ?? 'Chưa phân loại')}</span>`],
          ['Trạng thái (cũ)',     `<span style="color:#9CA3AF;">${statusLabel(p.status)}</span>`],
          ['Ngày xóa',            `<span style="color:#9CA3AF;">${formatDateTime(p.deletedDate)}</span>`],
        ], '#FEF2F2', '#FEE2E2')}

      </td></tr>
    </table>

    <!-- Warning box -->
    ${infoBox('#FFFBEB', '#FDE68A', '#92400E', '!',
      `Mọi dữ liệu liên quan đến nhiệm vụ này (checklist, ghi chú, file đính kèm)
       đã bị xóa vĩnh viễn. Nếu đây là nhầm lẫn, vui lòng liên hệ
       <strong style="color:#78350F;">${escapeHtml(p.deletedByName)}</strong>
       hoặc quản trị viên hệ thống ngay lập tức.`)}

    <!-- CTA -->
    ${ctaButton('&#8594; Xem các nhiệm vụ còn lại', '#1E40AF')}

    ${dividerRow()}

    <!-- Deleted by -->
    ${personRow({
      rowBg: '#FEF2F2', rowBorder: '#FECACA',
      avatarBg: '#EF4444',
      name: p.deletedByName, role: p.deletedByRole,
      rightLabel: 'Người thực hiện xóa',
      rightLabelColor: '#EF4444',
    })}

  </td>
</tr>

${footerRow()}`

  return htmlShell('Nhiệm vụ đã bị xóa', rows)
}

export async function sendTaskDeleteEmail(params: TaskDeleteEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail,
    toName:  params.recipientName,
    subject: `[UNI] Nhiệm vụ đã bị xóa: ${params.taskTitle}`,
    html:    buildDeleteEmailHtml(params),
    logTag:  'Xóa nhiệm vụ',
  })
}