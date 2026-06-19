// ============================================================
// server/src/utils/emailService.ts
// Gửi email thông báo qua Brevo HTTP API (https://api.brevo.com)
// Dùng HTTP API thay vì SMTP vì Render chặn outbound tới port 25/465/587
// trên free web service — HTTP API đi qua port 443 nên không bị chặn.
// ============================================================

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

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

  type PriorityMeta = { label: string; color: string; dot: string }
  const priorityMap: Record<string, PriorityMeta> = {
    low:    { label: 'THẤP',       color: '#059669', dot: '#d1fae5' },
    medium: { label: 'TRUNG BÌNH', color: '#d97706', dot: '#fef3c7' },
    urgent: { label: 'KHẨN CẤP',  color: '#dc2626', dot: '#fee2e2' },
  }
  const pri: PriorityMeta = priorityMap[priority] ?? { label: priority.toUpperCase(), color: '#6b7280', dot: '#f3f4f6' }

  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('vi-VN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  const year = new Date().getFullYear()

  // Divider dùng lại
  const divider = `<tr><td colspan="3" style="padding:0;"><div style="height:1px;background:#f1f5f9;font-size:0;line-height:0;">&nbsp;</div></td></tr>`

  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Thông báo nhiệm vụ</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:#eef2f7;">
  <tr>
    <td align="center" style="padding:48px 16px;">

      <!-- ══ OUTER SHELL 600px ══════════════════════════════════════ -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;">

        <!-- ── WORDMARK ─────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 12px 0 0;border-right:2px solid #cbd5e1;line-height:1;">
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;
                    font-weight:900;letter-spacing:3px;color:#0f172a;
                    text-transform:uppercase;">UNI</span>
                </td>
                <td style="padding:0 0 0 12px;line-height:1;">
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                    font-weight:600;letter-spacing:1.8px;color:#64748b;
                    text-transform:uppercase;">BOM System</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── MAIN CARD ─────────────────────────────────────────── -->
        <tr>
          <td style="background:#ffffff;border-radius:2px;
            box-shadow:0 2px 8px rgba(15,23,42,0.06),0 0 1px rgba(15,23,42,0.08);">

            <!-- Top rule — màu accent 3px -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#1d4ed8;height:3px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- HEADER ZONE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:36px 48px 28px;">

                  <!-- Category pill -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                    style="margin-bottom:20px;">
                    <tr>
                      <td style="background:#eff6ff;border-radius:2px;padding:5px 12px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                          font-weight:700;letter-spacing:2px;color:#1d4ed8;
                          text-transform:uppercase;">Thông báo nhiệm vụ</span>
                      </td>
                    </tr>
                  </table>

                  <!-- Greeting -->
                  <p style="font-family:Georgia,'Times New Roman',serif;font-size:24px;
                    font-weight:400;color:#0f172a;margin:0 0 10px;line-height:1.35;">
                    Xin chào, <em>${recipientName}</em>
                  </p>
                  <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                    color:#64748b;margin:0;line-height:1.75;">
                    Bạn vừa được giao một nhiệm vụ mới trong hệ thống
                    <strong style="color:#0f172a;font-weight:700;">UNI BOM</strong>.
                    Vui lòng xem thông tin chi tiết bên dưới.
                  </p>

                </td>
              </tr>
            </table>

            <!-- TASK BLOCK -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 48px;">

                  <!-- Task title bar — nền tối -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="background:#0f172a;border-radius:2px 2px 0 0;">
                    <tr>
                      <td style="padding:22px 28px;">
                        <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                          font-weight:700;letter-spacing:2px;color:#475569;
                          text-transform:uppercase;margin:0 0 8px;">Nhiệm vụ</p>
                        <p style="font-family:Georgia,'Times New Roman',serif;font-size:19px;
                          color:#f8fafc;margin:0;line-height:1.4;">${taskTitle}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Meta table — nền trắng viền -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 2px 2px;">

                    <!-- Kế hoạch -->
                    <tr>
                      <td style="padding:14px 28px;width:32px;vertical-align:middle;">
                        <div style="width:6px;height:6px;background:#cbd5e1;border-radius:50%;"></div>
                      </td>
                      <td style="padding:14px 0;vertical-align:middle;width:120px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                          font-weight:700;letter-spacing:0.8px;color:#94a3b8;
                          text-transform:uppercase;">Kế hoạch</span>
                      </td>
                      <td style="padding:14px 28px 14px 0;vertical-align:middle;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                          font-weight:600;color:#1e293b;">${planName}</span>
                      </td>
                    </tr>
                    ${divider}

                    <!-- Giao bởi -->
                    <tr>
                      <td style="padding:14px 28px;width:32px;vertical-align:middle;">
                        <div style="width:6px;height:6px;background:#cbd5e1;border-radius:50%;"></div>
                      </td>
                      <td style="padding:14px 0;vertical-align:middle;width:120px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                          font-weight:700;letter-spacing:0.8px;color:#94a3b8;
                          text-transform:uppercase;">Giao bởi</span>
                      </td>
                      <td style="padding:14px 28px 14px 0;vertical-align:middle;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                          font-weight:600;color:#1e293b;">${assignerName}</span>
                      </td>
                    </tr>
                    ${divider}

                    <!-- Độ ưu tiên -->
                    <tr>
                      <td style="padding:14px 28px;width:32px;vertical-align:middle;">
                        <div style="width:6px;height:6px;background:#cbd5e1;border-radius:50%;"></div>
                      </td>
                      <td style="padding:14px 0;vertical-align:middle;width:120px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                          font-weight:700;letter-spacing:0.8px;color:#94a3b8;
                          text-transform:uppercase;">Ưu tiên</span>
                      </td>
                      <td style="padding:14px 28px 14px 0;vertical-align:middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="background:${pri.dot};border-radius:2px;padding:4px 11px;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                                font-weight:700;letter-spacing:1px;color:${pri.color};
                                text-transform:uppercase;">${pri.label}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    ${divider}

                    <!-- Hạn hoàn thành -->
                    <tr>
                      <td style="padding:14px 28px;width:32px;vertical-align:middle;">
                        <div style="width:6px;height:6px;background:#cbd5e1;border-radius:50%;"></div>
                      </td>
                      <td style="padding:14px 0;vertical-align:middle;width:120px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                          font-weight:700;letter-spacing:0.8px;color:#94a3b8;
                          text-transform:uppercase;">Hạn nộp</span>
                      </td>
                      <td style="padding:14px 28px 14px 0;vertical-align:middle;">
                        ${dueDateStr
                          ? `<span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                              font-weight:700;color:#b45309;">${dueDateStr}</span>`
                          : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                              color:#94a3b8;font-style:italic;">Chưa đặt hạn</span>`
                        }
                      </td>
                    </tr>

                    ${description ? `
                    ${divider}
                    <!-- Mô tả -->
                    <tr>
                      <td style="padding:14px 28px;width:32px;vertical-align:top;padding-top:18px;">
                        <div style="width:6px;height:6px;background:#cbd5e1;border-radius:50%;margin-top:4px;"></div>
                      </td>
                      <td style="padding:14px 0;vertical-align:top;width:120px;padding-top:18px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                          font-weight:700;letter-spacing:0.8px;color:#94a3b8;
                          text-transform:uppercase;">Mô tả</span>
                      </td>
                      <td style="padding:14px 28px 20px 0;vertical-align:top;padding-top:18px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                          color:#475569;line-height:1.75;">${description}</span>
                      </td>
                    </tr>` : ''}

                  </table>

                </td>
              </tr>
            </table>

            <!-- NOTE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:28px 48px 36px;">
                  <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;
                    color:#64748b;margin:0;line-height:1.8;">
                    Vui lòng đăng nhập vào
                    <strong style="color:#0f172a;">UNI BOM System</strong>
                    để xem chi tiết và cập nhật tiến độ nhiệm vụ.
                  </p>
                </td>
              </tr>
            </table>

            <!-- FOOTER STRIP -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid #e2e8f0;padding:16px 48px;">
                  <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                    color:#94a3b8;margin:0;line-height:1.7;">
                    Email này được gửi tự động — vui lòng không trả lời trực tiếp.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── LEGAL FOOTER ───────────────────────────────────── -->
        <tr>
          <td align="center" style="padding:24px 0 0;">
            <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
              color:#94a3b8;margin:0;">
              © ${year} UNI Technology &nbsp;&nbsp;·&nbsp;&nbsp;
              Hệ thống quản lý dự án nội bộ
            </p>
          </td>
        </tr>

      </table>
      <!-- ══ END OUTER SHELL ══════════════════════════════════════ -->

    </td>
  </tr>
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
        sender: { name: 'UNI BOM System', email: process.env.EMAIL_FROM },
        to: [{ email: params.toEmail, name: params.recipientName }],
        subject: `[UNI] Bạn được giao việc: ${params.taskTitle}`,
        htmlContent: buildAssignEmailHtml(params),
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Brevo API trả lỗi ${res.status}: ${errText}`)
    }

    const data = (await res.json()) as { messageId?: string }
    console.log(`[Email] Đã gửi thông báo giao việc tới ${params.toEmail} — messageId: ${data.messageId}`)
  } catch (err) {
    console.error('[Email] Lỗi gửi email:', err)
  }
}