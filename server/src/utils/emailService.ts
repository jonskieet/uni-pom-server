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
  low:    { label: 'Thấp',      cssClass: 'low'    },
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

// ── Block wrapper: thay margin-bottom/margin-top trên <table> (Outlook bỏ qua
// hoàn toàn margin trên table) bằng padding trên 1 <td> bọc ngoài duy nhất.
// Cách này còn triệt tiêu luôn bug "float không clear" của các table
// align="left"/"right" (badgePill, deletedWatermark...): vì mỗi block giờ nằm
// trong 1 <td> riêng, không còn phần tử nào đứng cạnh nó trong cùng ô để bị
// Outlook xếp lệch/đè lên nhau như đã thấy ở ảnh chụp Outlook (badge đè lên H1).
function block(html: string, paddingBottom = 0, paddingTop = 0): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding-top:${paddingTop}px; padding-bottom:${paddingBottom}px;">${html}</td></tr>
</table>`
}

function roleLabel(role?: string | null)   { return role ? (ROLE_LABEL[role] ?? role) : '' }
function statusLabel(s?: string | null)    { return s ? (STATUS_LABEL[s] ?? s) : 'Không rõ' }
function priorityMeta(p?: string | null)   { return PRIORITY_META[p ?? ''] ?? { label: p ?? 'Không rõ', cssClass: 'medium' } }

function formatDueDate(date?: string | Date | null): string {
  if (!date) return 'Chưa đặt hạn'
  return new Date(date).toLocaleDateString('vi-VN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
}
function formatDateTime(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' } as any)
}

// ── BASE CSS (chèn vào <head>) ─────────────────────────────────────────
// Chỉ chứa style KHÔNG dùng rgba / không quan trọng nếu bị strip.
// Mọi style quan trọng (màu nền, màu chữ) đều có inline duplicate.
const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background-color:#F0F2F5; font-family:'Segoe UI',Arial,sans-serif; margin:0; padding:0; }
a { color:inherit; text-decoration:none; }
/* Outlook (Word engine) tự gán class MsoHyperlink/MsoHyperlinkFollowed (xanh +
   gạch chân) cho mọi <a>, kể cả khi đã set color/text-decoration inline.
   Override trực tiếp 2 class này để chặn từ gốc. */
span.MsoHyperlink, span.MsoHyperlinkFollowed { color:inherit !important; text-decoration:none !important; }
`
// LƯU Ý: .priority-badge / .deleted-watermark / .person-tag đã bị XOÁ khỏi CSS này.
// Outlook (Word rendering engine) KHÔNG hỗ trợ display:inline-block — class nào dùng
// thuộc tính này sẽ bị render thành block full-width (chính là lỗi bạn gặp).
// → Ba thành phần này đã được chuyển thành table-based badge (xem priorityBadge,
//   deletedWatermark, personTag bên dưới) để đảm bảo render đúng trên cả Gmail và Outlook.

const PRIORITY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  high:   { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA' },
  medium: { bg: '#FFFBEB', color: '#F59E0B', border: '#FDE68A' },
  low:    { bg: '#ECFDF5', color: '#10B981', border: '#A7F3D0' },
}

// ── Priority badge (table-based, thay <span class="priority-badge">) ──
// align="right" ép Outlook shrink-wrap table theo nội dung,
// tránh bug "table không width sẽ stretch full chiều ngang" trên Outlook.
function priorityBadge(label: string, cssClass: string): string {
  const c = PRIORITY_COLORS[cssClass] ?? PRIORITY_COLORS.medium
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
  <tr>
    <td bgcolor="${c.bg}" align="center" valign="middle"
        style="background-color:${c.bg}; border:1px solid ${c.border}; border-radius:999px; padding:3px 10px;
               font-size:11px; font-weight:700; letter-spacing:0.04em; color:${c.color}; white-space:nowrap;
               font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(label)}</td>
  </tr>
</table>`
}

// ── "Đã xóa" watermark badge (table-based, thay <span class="deleted-watermark">) ──
function deletedWatermark(): string {
  const inner = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
  <tr>
    <td bgcolor="#EF4444" align="center" valign="middle"
        style="background-color:#EF4444; border-radius:999px; padding:3px 10px; font-size:10px; font-weight:700;
               letter-spacing:0.08em; color:#ffffff; text-transform:uppercase; white-space:nowrap;
               font-family:'Segoe UI',Arial,sans-serif;">Đã xóa</td>
  </tr>
</table>`
  return block(inner, 10)
}

// ── Person tag "Người cũ" / "Người mới" (table-based, thay <span class="person-tag">) ──
function personTag(text: string, variant: 'from' | 'to'): string {
  const bg    = variant === 'from' ? '#F3F4F6' : '#D1FAE5'
  const color = variant === 'from' ? '#6B7280' : '#065F46'
  const inner = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr>
    <td bgcolor="${bg}" align="center" valign="middle"
        style="background-color:${bg}; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:600;
               color:${color}; white-space:nowrap; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(text)}</td>
  </tr>
</table>`
  return block(inner, 0, 5)
}

// ══════════════════════════════════════════════════════════════════════
// SHARED BUILDING BLOCKS
// ══════════════════════════════════════════════════════════════════════

// ── Logo block (header top) ────────────────────────────────────────────
// iconBgHex: solid màu thay thế rgba(255,255,255,0.15) trên nền tối
//   Assign   #312E81 → #4340A0
//   Reassign #064E3B → #1D6050
//   Delete   #7F1D1D → #9E3232
function logoBlock(iconBgHex: string): string {
  const inner = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="36" valign="middle" style="padding-right:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="36">
        <tr>
          <td bgcolor="${iconBgHex}" align="center" valign="middle" width="36" height="36"
              style="background-color:${iconBgHex}; border-radius:10px; color:#ffffff;
                     font-weight:700; font-size:14px; font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
            U
          </td>
        </tr>
      </table>
    </td>
    <td valign="middle">
      <div style="font-size:15px; font-weight:700; color:#ffffff; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM Planner</div>
      <div style="font-size:10px; color:#cccccc; margin-top:2px; font-family:'Segoe UI',Arial,sans-serif;">Quản lý kế hoạch &amp; nhiệm vụ</div>
    </td>
  </tr>
</table>`
  return block(inner, 24)
}

// ── Badge pill (header) ────────────────────────────────────────────────
// Dùng ký tự &#9679; (●) thay div tròn vì Outlook không support border-radius trên div
function badgePill(text: string, bgHex: string, borderHex: string, dotColor: string): string {
  const inner = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left">
  <tr>
    <td bgcolor="${bgHex}"
        style="background-color:${bgHex}; border:1px solid ${borderHex}; border-radius:999px; padding:5px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding-right:7px; font-size:10px; color:${dotColor}; line-height:1; font-family:Arial,sans-serif;">&#9679;</td>
          <td valign="middle" style="font-size:11px; color:#ffffff; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; font-family:'Segoe UI',Arial,sans-serif; white-space:nowrap;">${escapeHtml(text)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
  // Không dùng <div style="clear:both"> nữa — Outlook (Word engine) không clear
  // float một cách đáng tin cậy bằng div. Thay vào đó bọc cả pill trong 1 <td>
  // riêng (block()) để float "align=left" bị giam trong đúng ô đó, không tràn
  // sang phần tử kế tiếp (h1 tiêu đề) như bug đã thấy trên Outlook.
  return block(inner, 14)
}

// ── Task card wrapper (table thay div) ────────────────────────────────
function taskCard(bg: string, border: string, content: string): string {
  const inner = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${bg}" style="background-color:${bg}; border:1px solid ${border}; border-radius:16px;">
  <tr><td style="padding:20px;">${content}</td></tr>
</table>`
  return block(inner, 24)
}

// ── Task card header row (title + priority badge) ──────────────────────
function taskCardHeader(title: string, badgeHtml: string): string {
  const inner = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="68%" valign="top" style="font-size:17px; font-weight:700; color:#111827; line-height:1.35; font-family:'Segoe UI',Arial,sans-serif;">${title}</td>
    <td width="32%" valign="top" align="right" style="padding-left:8px;">${badgeHtml}</td>
  </tr>
</table>`
  return block(inner, 12)
}

// ── Meta grid 2x2 ─────────────────────────────────────────────────────
// Spacer dùng width pixel cố định (8px) — không dùng % để tránh artifact Outlook
function metaGrid(items: [string, string][], cellBg = '#ffffff', cellBorder = '#E5E7EB'): string {
  const cell = (label: string, value: string) =>
    `<td width="46%" valign="top" bgcolor="${cellBg}"
         style="background-color:${cellBg}; border:1px solid ${cellBorder}; border-radius:10px; padding:10px 13px;">
       <div style="font-size:10px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-family:'Segoe UI',Arial,sans-serif;">${label}</div>
       <div style="font-size:13px; font-weight:600; color:#111827; font-family:'Segoe UI',Arial,sans-serif;">${value}</div>
     </td>`
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    ${cell(items[0][0], items[0][1])}
    <td width="8" style="font-size:0; line-height:0;">&nbsp;</td>
    ${cell(items[1][0], items[1][1])}
  </tr>
  <tr><td colspan="3" height="8" style="font-size:0; line-height:8px;">&nbsp;</td></tr>
  <tr>
    ${cell(items[2][0], items[2][1])}
    <td width="8" style="font-size:0; line-height:0;">&nbsp;</td>
    ${cell(items[3][0], items[3][1])}
  </tr>
</table>`
}

// ── Divider (table thay div) ───────────────────────────────────────────
function dividerRow(): string {
  const inner = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#F3F4F6" height="1" style="background-color:#F3F4F6; font-size:0; line-height:1px;">&nbsp;</td>
  </tr>
</table>`
  return block(inner, 24, 24)
}

// ── Info/warning box (table) ───────────────────────────────────────────
// icon: ký tự text/HTML entity — KHÔNG dùng emoji
function infoBox(bg: string, border: string, textColor: string, icon: string, html: string): string {
  const inner = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${bg}" style="background-color:${bg}; border:1px solid ${border}; border-radius:12px;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="28" valign="top" style="font-size:18px; padding-right:10px; padding-top:1px; font-family:Arial,sans-serif; color:${textColor};">${icon}</td>
          <td valign="top" style="font-size:13px; color:${textColor}; line-height:1.6; font-family:'Segoe UI',Arial,sans-serif;">${html}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
  return block(inner, 24)
}

// ── CTA Button (bulletproof table button) ──────────────────────────────
function ctaButton(label: string, bgFrom: string, bgTo: string, taskId?: number, fallbackPath = '/planner'): string {
  const href = APP_URL ? `${APP_URL}${taskId ? `/planner/task/${taskId}` : fallbackPath}` : null
  // Outlook (Word engine) tự gán style "Hyperlink" mặc định (xanh + gạch chân)
  // cho MỌI thẻ <a>, đè lên color/text-decoration inline đã set. !important
  // trên <a> giúp một phần, nhưng cách chắc chắn nhất là bọc chữ trong 1
  // <span> riêng có color rõ ràng — style Hyperlink của Word chỉ áp vào <a>,
  // không đè được lên <span> con bên trong nó.
  const inner = href
    ? `<a href="${href}" style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:700; color:#ffffff!important; text-decoration:none!important; letter-spacing:0.01em; font-family:'Segoe UI',Arial,sans-serif;"><span style="color:#ffffff; text-decoration:none; font-weight:700; font-family:'Segoe UI',Arial,sans-serif; mso-text-raise:1px;">${label}</span></a>`
    : `<span style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:700; color:#ffffff; font-family:'Segoe UI',Arial,sans-serif;">${label}</span>`
  const buttonTable = `
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" bgcolor="${bgFrom}"
        style="background-color:${bgFrom}; background-image:linear-gradient(135deg,${bgFrom},${bgTo}); border-radius:999px;">
      ${inner}
    </td>
  </tr>
</table>`
  return block(buttonTable, 24)
}

// ── Person row (người giao/thay đổi/xóa) ──────────────────────────────
function personRow(opts: {
  rowBg: string; rowBorder: string
  avatarBg: string; avatarBg2: string
  name: string; role?: string | null
  rightLabel: string; rightLabelColor?: string
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
                <td bgcolor="${opts.avatarBg}" align="center" valign="middle" width="36" height="36"
                    style="background-color:${opts.avatarBg}; background-image:linear-gradient(135deg,${opts.avatarBg},${opts.avatarBg2}); border-radius:50%; color:#ffffff; font-size:14px; font-weight:700; font-family:'Segoe UI',Arial,sans-serif; text-align:center;">
                  ${getInitials(opts.name)}
                </td>
              </tr>
            </table>
          </td>
          <td valign="middle">
            <div style="font-size:13px; font-weight:600; color:#111827; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(opts.name)}</div>
            <div style="font-size:11px; color:#6B7280; font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(roleLabel(opts.role))}</div>
          </td>
          <td valign="middle" align="right" width="130"
              style="font-size:11px; color:${opts.rightLabelColor ?? '#9CA3AF'}; font-weight:${opts.rightLabelColor ? '600' : '400'}; font-family:'Segoe UI',Arial,sans-serif;">
            ${escapeHtml(opts.rightLabel)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

// ── Footer row ─────────────────────────────────────────────────────────
function footerRow(): string {
  return `
<tr>
  <td bgcolor="#111827"
      style="background-color:#111827; border-radius:0 0 20px 20px; padding:24px 32px; -webkit-border-radius:0 0 20px 20px;">
    <p style="text-align:center; font-size:14px; font-weight:700; color:#ffffff; margin:0 0 14px; font-family:'Segoe UI',Arial,sans-serif;">UNI BOM System</p>
    <p style="font-size:11px; color:#6B7280; text-align:center; line-height:1.6; margin:0; font-family:'Segoe UI',Arial,sans-serif;">
      Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
      &copy; ${new Date().getFullYear()} UNI Technology
    </p>
  </td>
</tr>`
}

// ── Brevo send ─────────────────────────────────────────────────────────
async function sendBrevoEmail(params: { toEmail:string; toName:string; subject:string; html:string; logTag:string }): Promise<void> {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('[Email] BREVO_API_KEY/EMAIL_FROM chưa cấu hình — bỏ qua')
    return
  }
  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
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

// ── Outer HTML shell ───────────────────────────────────────────────────
function htmlShell(title: string, innerRows: string): string {
  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escapeHtml(title)}</title>
  <style>${BASE_CSS}</style>
</head>
<body style="margin:0;padding:0;background-color:#F0F2F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0F2F5" style="background-color:#F0F2F5;">
  <tr>
    <td align="center" style="padding:32px 16px 40px;">
      <!--[if (gte mso 9)|(IE)]><table width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
        ${innerRows}
      </table>
      <!--[if (gte mso 9)|(IE)]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
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
  const pri    = priorityMeta(p.priority)
  const status = p.status ?? 'not_started'
  // Indigo theme
  const HDR   = '#312E81', HDR2 = '#1E40AF'
  const ICBG  = '#4340A0', BBDG = '#4340A0', BORD = '#5A55BB', DOT = '#34D399'

  const headerContent = `
${logoBlock(ICBG)}
${badgePill('Nhiệm vụ mới', BBDG, BORD, DOT)}
<h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;letter-spacing:-0.02em;margin:0 0 8px;font-family:'Segoe UI',Arial,sans-serif;">Bạn vừa được<br/>giao một nhiệm vụ</h1>
<p style="font-size:14px;color:#c7d2fe;margin:0;line-height:1.5;font-family:'Segoe UI',Arial,sans-serif;">Kiểm tra chi tiết bên dưới và bắt đầu thực hiện ngay hôm nay.</p>`

  const taskContent = `
${taskCardHeader(escapeHtml(p.taskTitle), priorityBadge(pri.label, pri.cssClass))}
${p.description ? `<div style="font-size:13px;color:#6B7280;line-height:1.6;margin:12px 0 16px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.description)}</div>` : ''}
${metaGrid([
  ['Han hoan thanh', `<span style="color:#EF4444;font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
  ['Cot (Bucket)',   escapeHtml(p.bucketName ?? 'Chua phan loai')],
  ['Trang thai',    `<span style="color:#10B981;font-weight:600;">${statusLabel(status)}</span>`],
  ['Ngay giao',     formatDateTime(p.assignedDate)],
])}`

  const planContent = block(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#EEF2FF" style="background-color:#EEF2FF;border:1px solid #C7D2FE;border-radius:12px;">
  <tr><td style="padding:14px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="38" valign="middle" style="padding-right:12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38">
            <tr><td bgcolor="#4F46E5" align="center" valign="middle" width="38" height="38"
                    style="background-color:#4F46E5;background-image:linear-gradient(135deg,#4F46E5,#1E40AF);border-radius:10px;color:#fff;font-weight:700;font-size:15px;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">P</td></tr>
          </table>
        </td>
        <td valign="middle">
          <div style="font-size:13px;font-weight:700;color:#312E81;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.planName)}</div>
          <div style="font-size:11px;color:#6366F1;margin-top:2px;font-family:'Segoe UI',Arial,sans-serif;">Bucket: ${escapeHtml(p.bucketName ?? 'Chua phan loai')}</div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`, 24)

  const rows = `
<tr>
  <td bgcolor="${HDR}" style="background-color:${HDR};background-image:linear-gradient(145deg,${HDR},${HDR2});border-radius:20px 20px 0 0;padding:28px 32px 24px;-webkit-border-radius:20px 20px 0 0;">
    ${headerContent}
  </td>
</tr>
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">
    <p style="font-size:15px;color:#374151;line-height:1.6;margin-bottom:24px;font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      <strong style="color:#111827;">${escapeHtml(p.assignerName)}</strong> đã giao cho bạn nhiệm vụ trong dự án
      <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>. Vui lòng xem chi tiết và bắt đầu thực hiện.
    </p>
    ${taskCard('#F8FAFF', '#E0E7FF', taskContent)}
    ${planContent}
    ${ctaButton('Mở nhiệm vụ trong BOM Planner', '#4F46E5', '#1E40AF', p.taskId)}
    ${dividerRow()}
    ${personRow({ rowBg:'#F9FAFB', rowBorder:'#E5E7EB', avatarBg:'#4F46E5', avatarBg2:'#7C3AED', name:p.assignerName, role:p.assignerRole, rightLabel:'Người giao việc' })}
  </td>
</tr>
${footerRow()}`

  return htmlShell('Bạn được giao nhiệm vụ mới', rows)
}

export async function sendTaskAssignEmail(params: TaskAssignEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail, toName: params.recipientName,
    subject: `[UNI] Bạn được giao việc: ${params.taskTitle}`,
    html: buildAssignEmailHtml(params), logTag: 'Giao việc',
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
  // Green theme
  const HDR  = '#064E3B', HDR2 = '#065F46'
  const ICBG = '#1D6050', BBDG = '#1D6050', BORD = '#2E7060', DOT = '#6EE7B7'

  const headerContent = `
${logoBlock(ICBG)}
${badgePill('Thay đổi người thực hiện', BBDG, BORD, DOT)}
<h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;letter-spacing:-0.02em;margin:0 0 8px;font-family:'Segoe UI',Arial,sans-serif;">
  ${isNewView ? 'Nhiệm vụ vừa được<br/>chuyển giao cho bạn' : 'Nhiệm vụ của bạn<br/>đã được chuyển cho người khác'}
</h1>
<p style="font-size:14px;color:#a7f3d0;margin:0;line-height:1.5;font-family:'Segoe UI',Arial,sans-serif;">Xem chi tiết bên dưới về thay đổi người thực hiện nhiệm vụ.</p>`

  const greeting = isNewView
    ? `<strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong> đã chuyển nhiệm vụ <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong> sang cho bạn trong dự án <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>.`
    : `Nhiệm vụ <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong> trong dự án <strong style="color:#111827;">${escapeHtml(p.planName)}</strong> đã được chuyển sang cho người khác bởi <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`

  const transferVisual = block(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#F0FDF4" style="background-color:#F0FDF4;border:1px solid #A7F3D0;border-radius:16px;">
  <tr><td style="padding:16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="42%" align="center" valign="top">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr><td bgcolor="#9CA3AF" align="center" valign="middle" width="48" height="48"
                    style="background-color:#9CA3AF;background-image:linear-gradient(135deg,#9CA3AF,#6B7280);border-radius:50%;color:#fff;font-size:18px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
              ${getInitials(p.oldAssigneeName)}
            </td></tr>
          </table>
          <div style="font-size:13px;font-weight:700;color:#111827;margin-top:8px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.oldAssigneeName)}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(roleLabel(p.oldAssigneeRole))}</div>
          ${personTag('Người cũ', 'from')}
        </td>
        <td width="16%" align="center" valign="middle">
          <div style="font-size:22px;color:#10B981;text-align:center;font-family:Arial,sans-serif;">&#8594;</div>
          <div style="font-size:10px;font-weight:600;color:#10B981;letter-spacing:0.05em;text-align:center;margin-top:4px;font-family:'Segoe UI',Arial,sans-serif;">Chuyển giao</div>
        </td>
        <td width="42%" align="center" valign="top">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr><td bgcolor="#10B981" align="center" valign="middle" width="48" height="48"
                    style="background-color:#10B981;background-image:linear-gradient(135deg,#10B981,#064E3B);border-radius:50%;color:#fff;font-size:18px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
              ${getInitials(p.newAssigneeName)}
            </td></tr>
          </table>
          <div style="font-size:13px;font-weight:700;color:#111827;margin-top:8px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.newAssigneeName)}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(roleLabel(p.newAssigneeRole))}</div>
          ${personTag('Người mới', 'to')}
        </td>
      </tr>
    </table>
  </td></tr>
</table>`, 24)

  const taskContent = `
${taskCardHeader(escapeHtml(p.taskTitle), priorityBadge(pri.label, pri.cssClass))}
${p.description ? `<div style="font-size:13px;color:#6B7280;line-height:1.6;margin:12px 0 16px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.description)}</div>` : ''}
${metaGrid([
  ['Han hoan thanh', `<span style="color:#EF4444;font-weight:600;">${formatDueDate(p.dueDate)}</span>`],
  ['Cot (Bucket)',   escapeHtml(p.bucketName ?? 'Chua phan loai')],
  ['Trang thai',    statusLabel(p.status)],
  ['Ngay chuyen',   formatDateTime(p.changedDate)],
])}`

  const noteBox = isNewView
    ? infoBox('#EEF2FF','#C7D2FE','#374151', '[i]',
        `Bạn đã được giao trách nhiệm thực hiện nhiệm vụ này. Hãy xem xét thông tin, checklist và deadline để bắt đầu ngay. Nếu có thắc mắc, liên hệ <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`)
    : infoBox('#F0FDF4','#A7F3D0','#374151', '[ok]',
        `Nhiệm vụ này không còn thuộc trách nhiệm của bạn. Mọi cập nhật về sau sẽ do người thực hiện mới đảm nhận. Nếu đây là nhầm lẫn, liên hệ <strong style="color:#111827;">${escapeHtml(p.changedByName)}</strong>.`)

  const rows = `
<tr>
  <td bgcolor="${HDR}" style="background-color:${HDR};background-image:linear-gradient(145deg,${HDR},${HDR2});border-radius:20px 20px 0 0;padding:28px 32px 24px;-webkit-border-radius:20px 20px 0 0;">
    ${headerContent}
  </td>
</tr>
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">
    <p style="font-size:15px;color:#374151;line-height:1.6;margin-bottom:24px;font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      ${greeting}
    </p>
    ${transferVisual}
    ${taskCard('#F8FAFF', '#E0E7FF', taskContent)}
    ${noteBox}
    ${ctaButton('Mở nhiệm vụ trong BOM Planner', '#10B981', '#064E3B', p.taskId)}
    ${dividerRow()}
    ${personRow({ rowBg:'#F9FAFB', rowBorder:'#E5E7EB', avatarBg:'#6366F1', avatarBg2:'#4F46E5', name:p.changedByName, role:p.changedByRole, rightLabel:'Người thực hiện thay đổi' })}
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
    toEmail: params.toEmail, toName: params.recipientName, subject,
    html: buildReassignEmailHtml(params),
    logTag: params.viewpoint === 'new' ? 'Chuyển giao (mới)' : 'Chuyển giao (cũ)',
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
  // Red theme
  const HDR  = '#7F1D1D', HDR2 = '#991B1B'
  const ICBG = '#9E3232', BBDG = '#9E3232', BORD = '#B84545', DOT = '#FCA5A5'

  const headerContent = `
${logoBlock(ICBG)}
${badgePill('Nhiệm vụ đã xóa', BBDG, BORD, DOT)}
<h1 style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;letter-spacing:-0.02em;margin:0 0 8px;font-family:'Segoe UI',Arial,sans-serif;">Nhiệm vụ của bạn<br/>đã bị xóa</h1>
<p style="font-size:14px;color:#fca5a5;margin:0;line-height:1.5;font-family:'Segoe UI',Arial,sans-serif;">Nhiệm vụ bạn đang thực hiện đã bị xóa khỏi hệ thống. Vui lòng liên hệ người quản lý nếu cần thêm thông tin.</p>`

  const taskContent = `
${deletedWatermark()}
<div style="font-size:17px;font-weight:700;color:#991B1B;line-height:1.35;text-decoration:line-through;opacity:0.8;margin-bottom:12px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.taskTitle)}</div>
${p.description ? `<div style="font-size:13px;color:#9CA3AF;line-height:1.6;margin-bottom:16px;background:#FEF2F2;border:1px solid #FEE2E2;border-radius:10px;padding:12px 14px;text-decoration:line-through;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(p.description)}</div>` : ''}
${metaGrid([
  ['Han hoan thanh (cu)', formatDueDate(p.dueDate)],
  ['Cot (Bucket)',        escapeHtml(p.bucketName ?? 'Chua phan loai')],
  ['Trang thai (cu)',     statusLabel(p.status)],
  ['Ngay xoa',           formatDateTime(p.deletedDate)],
], '#FEF2F2', '#FEE2E2')}`

  const rows = `
<tr>
  <td bgcolor="${HDR}" style="background-color:${HDR};background-image:linear-gradient(145deg,${HDR},${HDR2});border-radius:20px 20px 0 0;padding:28px 32px 24px;-webkit-border-radius:20px 20px 0 0;">
    ${headerContent}
  </td>
</tr>
<tr>
  <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;">
    <p style="font-size:15px;color:#374151;line-height:1.6;margin-bottom:24px;font-family:'Segoe UI',Arial,sans-serif;">
      Xin chào <strong style="color:#111827;">${escapeHtml(p.recipientName)}</strong>, &#128075;<br/>
      Chúng tôi thông báo rằng nhiệm vụ <strong style="color:#111827;">&quot;${escapeHtml(p.taskTitle)}&quot;</strong>
      bạn đang thực hiện trong dự án <strong style="color:#111827;">${escapeHtml(p.planName)}</strong>
      đã bị xóa bởi <strong style="color:#111827;">${escapeHtml(p.deletedByName)}</strong>.
    </p>
    ${taskCard('#FFF5F5', '#FECACA', taskContent)}
    ${infoBox('#FFFBEB','#FDE68A','#92400E', '[!]',
      `Mọi dữ liệu liên quan đến nhiệm vụ này (checklist, ghi chú, file đính kèm) đã bị xóa vĩnh viễn.
       Nếu đây là nhầm lẫn, vui lòng liên hệ <strong style="color:#78350F;">${escapeHtml(p.deletedByName)}</strong>
       hoặc quản trị viên hệ thống ngay lập tức.`)}
    ${ctaButton('Xem các nhiệm vụ còn lại', '#1E40AF', '#312E81')}
    ${dividerRow()}
    ${personRow({ rowBg:'#FEF2F2', rowBorder:'#FECACA', avatarBg:'#EF4444', avatarBg2:'#991B1B', name:p.deletedByName, role:p.deletedByRole, rightLabel:'Người thực hiện xóa', rightLabelColor:'#EF4444' })}
  </td>
</tr>
${footerRow()}`

  return htmlShell('Nhiệm vụ đã bị xóa', rows)
}

export async function sendTaskDeleteEmail(params: TaskDeleteEmailParams): Promise<void> {
  await sendBrevoEmail({
    toEmail: params.toEmail, toName: params.recipientName,
    subject: `[UNI] Nhiệm vụ đã bị xóa: ${params.taskTitle}`,
    html: buildDeleteEmailHtml(params), logTag: 'Xóa nhiệm vụ',
  })
}