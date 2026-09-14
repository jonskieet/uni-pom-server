-- UNI EMS · Workflow hardening (idempotent)
-- Chạy sau migration_workflows.sql và migration_linked_workflows.sql.

ALTER TYPE "PomStatus" ADD VALUE IF NOT EXISTS 'construction';
ALTER TYPE "PomStatus" ADD VALUE IF NOT EXISTS 'inspection';
ALTER TYPE "PomStatus" ADD VALUE IF NOT EXISTS 'project_completed';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'construction_started';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'inspection_started';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'project_completed';

ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS pom_id INTEGER;

DO $$ BEGIN
  ALTER TABLE workflow_instances
    ADD CONSTRAINT workflow_instances_pom_id_fkey
    FOREIGN KEY (pom_id) REFERENCES poms(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE workflow_instance_steps
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by INTEGER;

DO $$ BEGIN
  ALTER TABLE workflow_instance_steps
    ADD CONSTRAINT workflow_instance_steps_rejected_by_fkey
    FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_active_pom
  ON workflow_instances(pom_id)
  WHERE pom_id IS NOT NULL AND status IN ('in_progress', 'paused');
CREATE INDEX IF NOT EXISTS idx_workflow_instances_due_date
  ON workflow_instances(due_date) WHERE due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id     INTEGER REFERENCES workflow_steps(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_activity_instance
  ON workflow_activity_logs(instance_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pom_construction_logs (
  id         BIGSERIAL PRIMARY KEY,
  pom_id     INTEGER NOT NULL REFERENCES poms(id) ON DELETE CASCADE,
  log_type   TEXT NOT NULL DEFAULT 'progress',
  title      TEXT NOT NULL,
  content    TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pom_construction_logs_type_check
    CHECK (log_type IN ('progress', 'incident', 'resolved', 'handover'))
);
CREATE INDEX IF NOT EXISTS idx_pom_construction_logs_pom
  ON pom_construction_logs(pom_id, created_at DESC);

-- Sửa các phiên cũ bị kẹt ở trạng thái tất cả bước đều pending.
WITH stuck AS (
  SELECT wi.id
  FROM workflow_instances wi
  WHERE wi.status = 'in_progress'
    AND EXISTS (SELECT 1 FROM workflow_instance_steps x WHERE x.instance_id = wi.id)
    AND NOT EXISTS (
      SELECT 1 FROM workflow_instance_steps x
      WHERE x.instance_id = wi.id AND x.status IN ('in_progress', 'completed')
    )
), first_steps AS (
  SELECT DISTINCT ON (wis.instance_id) wis.instance_id, wis.step_id
  FROM workflow_instance_steps wis
  JOIN workflow_steps ws ON ws.id = wis.step_id
  JOIN stuck s ON s.id = wis.instance_id
  ORDER BY wis.instance_id, ws.step_order
)
UPDATE workflow_instance_steps wis
SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
FROM first_steps fs
WHERE wis.instance_id = fs.instance_id AND wis.step_id = fs.step_id;

-- View liên kết tiếp tục đọc từ bảng nghiệp vụ gốc; project_completed mới là
-- điểm hoàn tất dự án, closed_won chỉ là điểm bắt đầu giai đoạn thi công.
CREATE OR REPLACE VIEW vw_linked_workflow_instances AS
SELECT 'bom' AS source_key, p.id AS source_id, 'bom-' || p.id AS uid,
  p.project_name AS title,
  CASE WHEN p.status::text = 'project_completed' THEN 'completed'
       WHEN p.status::text = 'closed_lost' THEN 'cancelled' ELSE 'in_progress' END AS status,
  p.status::text AS raw_status, cu.full_name AS assignee_name,
  cr.full_name AS creator_name, p.created_at, p.updated_at
FROM poms p
LEFT JOIN users cu ON cu.id = p.assigned_sale_id
LEFT JOIN users cr ON cr.id = p.created_by
UNION ALL
SELECT 'survey', s.id, 'survey-' || s.id, s.project_name,
  CASE WHEN s.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
  s.status::text, NULL, cr.full_name, s.created_at, s.updated_at
FROM survey_reports s LEFT JOIN users cr ON cr.id = s.created_by
UNION ALL
SELECT 'trip', t.id, 'trip-' || t.id, COALESCE(t.note, 'Đề xuất công tác phí #' || t.id),
  CASE WHEN t.status = 'approved' THEN 'completed' WHEN t.status = 'rejected' THEN 'cancelled' ELSE 'in_progress' END,
  t.status::text, NULL, u.full_name, t.created_at, t.updated_at
FROM business_trips t LEFT JOIN users u ON u.id = t.user_id
UNION ALL
SELECT 'leave', l.id, 'leave-' || l.id,
  'Nghỉ phép ' || to_char(l.start_date, 'DD/MM') || '–' || to_char(l.end_date, 'DD/MM'),
  CASE WHEN l.status = 'approved' THEN 'completed'
       WHEN l.status IN ('rejected', 'cancelled') THEN 'cancelled' ELSE 'in_progress' END,
  l.status::text, ap.full_name, u.full_name, l.created_at, l.updated_at
FROM leave_requests l
LEFT JOIN users u ON u.id = l.user_id
LEFT JOIN users ap ON ap.id = l.approved_by;
