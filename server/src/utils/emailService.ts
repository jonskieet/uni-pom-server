// ============================================================
// server/src/utils/emailService.ts
// Gửi email thông báo qua Gmail SMTP (uni-thongbao@gmail.com)
// ============================================================

import nodemailer from 'nodemailer'

// ── Tạo transporter một lần (singleton) ──────────────────────────────
let _transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (_transporter) return _transporter

  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.EMAIL_USER,   // uni-thongbao@gmail.com
      pass: process.env.EMAIL_PASS,   // App Password từ Google (16 ký tự)
    },
  })

  return _transporter
}

// ── Template email giao việc ──────────────────────────────────────────
function buildAssignEmailHtml(params: {
  recipientName: string
  taskTitle: string
  planName: string
  assignerName: string
  priority: string
  dueDate?: string | null
  description?: string | null
}) {
  const { recipientName, taskTitle, planName, assignerName, priority, dueDate, description } = params

  const priorityLabel: Record<string, string> = {
    low: '🟢 Thấp',
    medium: '🟡 Trung bình',
    urgent: '🔴 Khẩn cấp',
  }

  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Chưa đặt hạn'

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Thông báo giao việc</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%);padding:28px 32px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <span style="font-size:28px;">📋</span>
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">UNI BOM System</span>
            </div>
            <p style="color:#a8c8e8;margin:6px 0 0;font-size:13px;">Hệ thống quản lý dự án</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Xin chào <strong>${recipientName}</strong>,</p>
            <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
              Bạn vừa được giao một nhiệm vụ mới trong hệ thống UNI BOM. Vui lòng xem chi tiết bên dưới.
            </p>

            <!-- Task card -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2d6a9f;border-radius:8px;padding:20px;margin-bottom:20px;">
              <p style="color:#1e3a5f;font-size:18px;font-weight:700;margin:0 0 16px;">📌 ${taskTitle}</p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">📂 Kế hoạch:</td>
                  <td style="padding:6px 0;color:#374151;font-size:13px;font-weight:600;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:13px;">👤 Giao bởi:</td>
                  <td style="padding:6px 0;color:#374151;font-size:13px;font-weight:600;">${assignerName}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:13px;">⚡ Độ ưu tiên:</td>
                  <td style="padding:6px 0;color:#374151;font-size:13px;font-weight:600;">${priorityLabel[priority] ?? priority}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:13px;">📅 Hạn hoàn thành:</td>
                  <td style="padding:6px 0;color:${dueDate ? '#d97706' : '#9ca3af'};font-size:13px;font-weight:600;">${dueDateStr}</td>
                </tr>
                ${description ? `
                <tr>
                  <td colspan="2" style="padding:12px 0 0;">
                    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:12px;">
                      <p style="color:#6b7280;font-size:12px;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Mô tả</p>
                      <p style="color:#374151;font-size:13px;margin:0;line-height:1.6;">${description}</p>
                    </div>
                  </td>
                </tr>` : ''}
              </table>
            </div>

            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
              Vui lòng đăng nhập vào <strong>UNI BOM System</strong> để xem chi tiết và cập nhật tiến độ nhiệm vụ.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              Email này được gửi tự động từ hệ thống UNI BOM. Vui lòng không trả lời email này.<br/>
              © ${new Date().getFullYear()} UNI Technology
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Hàm gửi email thông báo giao việc ────────────────────────────────
export async function sendTaskAssignEmail(params: {
  toEmail: string
  recipientName: string
  taskTitle: string
  planName: string
  assignerName: string
  priority: string
  dueDate?: string | null
  description?: string | null
}): Promise<void> {
  console.log('[Email] EMAIL_USER:', process.env.EMAIL_USER ?? '✗ THIẾU')
  console.log('[Email] EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ có' : '✗ THIẾU')
  console.log('[Email] Đang gửi tới:', params.toEmail)
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] EMAIL_USER hoặc EMAIL_PASS chưa được cấu hình — bỏ qua gửi email')
    return
  }

  try {
    const transporter = getTransporter()
    await transporter.sendMail({
      from: `"UNI BOM System" <${process.env.EMAIL_USER}>`,
      to: params.toEmail,
      subject: `[UNI] Bạn được giao việc: ${params.taskTitle}`,
      html: buildAssignEmailHtml(params),
    })
    console.log(`[Email] Đã gửi thông báo giao việc tới ${params.toEmail}`)
  } catch (err) {
    // Không throw — lỗi email không được làm hỏng API chính
    console.error('[Email] Lỗi gửi email:', err)
  }
}   