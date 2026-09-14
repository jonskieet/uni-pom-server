-- ============================================================
-- Migration: View tổng hợp cho 4 quy trình ĐÃ có module riêng
-- Chạy trên Supabase SQL Editor (chạy SAU migration_workflows.sql)
--
-- Nguyên tắc: CHỈ ĐỌC (view), KHÔNG có bảng vật lý mới, KHÔNG insert
-- vào poms/survey_reports/business_trips/leave_requests.
-- Nguồn sự thật vẫn là các bảng gốc 100%.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. View danh sách instance hợp nhất (mỗi dòng = 1 hồ sơ thật)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_linked_workflow_instances AS
SELECT
  'bom'                                AS source_key,
  p.id                                  AS source_id,
  'bom-' || p.id                        AS uid,
  p.project_name                        AS title,
  CASE
    WHEN p.status = 'closed_won'  THEN 'completed'
    WHEN p.status = 'closed_lost' THEN 'cancelled'
    ELSE 'in_progress'
  END                                    AS status,
  p.status::text                        AS raw_status,
  cu.full_name                          AS assignee_name,   -- người đang giữ bước hiện tại (xấp xỉ = sale phụ trách)
  cr.full_name                          AS creator_name,
  p.created_at,
  p.updated_at
FROM poms p
LEFT JOIN users cu ON cu.id = p.assigned_sale_id
LEFT JOIN users cr ON cr.id = p.created_by

UNION ALL

SELECT
  'survey', s.id, 'survey-' || s.id, s.project_name,
  CASE WHEN s.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
  s.status::text,
  NULL,
  cr.full_name,
  s.created_at, s.updated_at
FROM survey_reports s
LEFT JOIN users cr ON cr.id = s.created_by

UNION ALL

SELECT
  'trip', t.id, 'trip-' || t.id,
  COALESCE(t.note, 'Đề xuất công tác phí #' || t.id),
  CASE
    WHEN t.status = 'approved' THEN 'completed'
    WHEN t.status = 'rejected' THEN 'cancelled'
    ELSE 'in_progress'
  END,
  t.status,
  NULL,
  u.full_name,
  t.created_at, t.updated_at
FROM business_trips t
LEFT JOIN users u ON u.id = t.user_id

UNION ALL

SELECT
  'leave', l.id, 'leave-' || l.id,
  'Nghỉ phép ' || to_char(l.start_date, 'DD/MM') || '–' || to_char(l.end_date, 'DD/MM'),
  CASE
    WHEN l.status = 'approved' THEN 'completed'
    WHEN l.status IN ('rejected', 'cancelled') THEN 'cancelled'
    ELSE 'in_progress'
  END,
  l.status,
  ap.full_name,
  u.full_name,
  l.created_at, l.updated_at
FROM leave_requests l
LEFT JOIN users u  ON u.id = l.user_id
LEFT JOIN users ap ON ap.id = l.approved_by;

-- ───────────────────────────────────────────────────────────
-- 2. View thống kê theo từng module liên kết (cho dashboard card)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_linked_workflow_stats AS
WITH meta(source_key, name, category, color, icon) AS (
  VALUES
    ('bom',    'Phê duyệt BOM',        'Kinh doanh', '#F59E0B', 'ti-clipboard-check'),
    ('survey', 'Khảo sát khách hàng',  'Kỹ thuật',   '#16A34A', 'ti-map-pin'),
    ('trip',   'Đề xuất công tác phí', 'Kế toán',    '#0EA5E9', 'ti-route'),
    ('leave',  'Nghỉ phép',            'Nhân sự',    '#8B5CF6', 'ti-calendar-off')
),
agg AS (
  SELECT
    source_key,
    COUNT(*)::int                                                AS instance_count,
    COUNT(*) FILTER (WHERE status = 'completed')::int            AS completed_count,
    COUNT(*) FILTER (WHERE status = 'in_progress')::int          AS in_progress_count,
    COUNT(*) FILTER (WHERE status = 'cancelled')::int            AS cancelled_count
  FROM vw_linked_workflow_instances
  GROUP BY source_key
)
SELECT
  m.source_key,
  m.name, m.category, m.color, m.icon,
  COALESCE(a.instance_count, 0)     AS instance_count,
  COALESCE(a.completed_count, 0)    AS completed_count,
  COALESCE(a.in_progress_count, 0)  AS in_progress_count,
  COALESCE(a.cancelled_count, 0)    AS cancelled_count,
  CASE WHEN COALESCE(a.instance_count, 0) > 0
       THEN ROUND(a.completed_count::numeric / a.instance_count * 100)
       ELSE 0 END                  AS completion_rate
FROM meta m
LEFT JOIN agg a ON a.source_key = m.source_key;
