-- ============================================================
-- Migration: Module Workflow (generic engine)
-- Chạy trên Supabase SQL Editor
--
-- LƯU Ý QUAN TRỌNG VỀ PHẠM VI:
-- Bộ bảng này CHỈ dùng làm "engine" chạy các quy trình MỚI,
-- chưa có module riêng trong hệ thống (ví dụ: Tạo hồ sơ nhân viên,
-- Báo cáo sự cố kỹ thuật...).
--
-- KHÔNG dùng bộ bảng này để chạy lại các quy trình đã có module
-- riêng và đã có bảng trạng thái/lịch sử của chính nó:
--   - "Phê duyệt BOM"        → đã có poms.status (10 trạng thái) + audit_logs
--   - "Khảo sát khách hàng"  → đã có survey_reports.status
--   - "Đề xuất công tác phí" → đã có business_trips.status
--   - "Nghỉ phép"            → đã có leave_requests.status
-- Nếu chạy song song 2 hệ thống cho cùng 1 nghiệp vụ sẽ phát sinh
-- 2 nguồn sự thật (dual source of truth) và lệch dữ liệu.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. WORKFLOWS (template / định nghĩa quy trình)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'Chung',
  color       TEXT NOT NULL DEFAULT '#4F46E5',
  icon        TEXT NOT NULL DEFAULT 'ti-git-branch',
  status      TEXT NOT NULL DEFAULT 'active',   -- active | draft | archived
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
CREATE INDEX IF NOT EXISTS idx_workflows_status   ON workflows(status);

-- ───────────────────────────────────────────────────────────
-- 2. WORKFLOW_STEPS (các bước trong 1 template)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_steps (
  id              SERIAL PRIMARY KEY,
  workflow_id     INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  step_order      INTEGER NOT NULL DEFAULT 0,
  step_type       TEXT NOT NULL DEFAULT 'task',   -- task | approval | notify
  assignee_role   TEXT,                            -- vd: 'technical', 'accountant'...
  required        BOOLEAN NOT NULL DEFAULT TRUE,
  duration_days   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);

-- ───────────────────────────────────────────────────────────
-- 3. WORKFLOW_INSTANCES (1 phiên chạy thực tế của 1 template)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instances (
  id            SERIAL PRIMARY KEY,
  workflow_id   INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal',   -- low | normal | high | urgent
  status        TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | paused | cancelled
  assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date      DATE,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow_id ON workflow_instances(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status     ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_assignee   ON workflow_instances(assignee_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_creator    ON workflow_instances(created_by);

-- ───────────────────────────────────────────────────────────
-- 4. WORKFLOW_INSTANCE_STEPS (tiến độ từng bước của 1 phiên)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instance_steps (
  id            SERIAL PRIMARY KEY,
  instance_id   INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id       INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | skipped
  note          TEXT,
  assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wis_instance_id ON workflow_instance_steps(instance_id);
CREATE INDEX IF NOT EXISTS idx_wis_step_id     ON workflow_instance_steps(step_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wis_instance_step ON workflow_instance_steps(instance_id, step_id);

-- ───────────────────────────────────────────────────────────
-- 5. Trigger updated_at (tái dùng function chung đã tạo ở migration khác,
--    tạo lại nếu chưa có để migration này chạy độc lập được)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS workflow_instances_updated_at ON workflow_instances;
CREATE TRIGGER workflow_instances_updated_at
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS workflow_instance_steps_updated_at ON workflow_instance_steps;
CREATE TRIGGER workflow_instance_steps_updated_at
  BEFORE UPDATE ON workflow_instance_steps
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ───────────────────────────────────────────────────────────
-- 6. SEED: chỉ seed 2 quy trình thật sự CHƯA có module riêng
--    (Tạo hồ sơ nhân viên, Báo cáo sự cố). KHÔNG seed
--    "Phê duyệt BOM" / "Khảo sát khách hàng" / "Đề xuất công tác phí"
--    vì các quy trình đó đã được số hóa bằng module riêng.
-- ───────────────────────────────────────────────────────────
INSERT INTO workflows (name, description, category, color, icon, status)
SELECT 'Tạo hồ sơ nhân viên',
       'Quy trình onboard nhân viên mới: thu thập giấy tờ, tạo tài khoản, bàn giao thiết bị',
       'Nhân sự', '#7C3AED', 'ti-user-plus', 'active'
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = 'Tạo hồ sơ nhân viên');

INSERT INTO workflow_steps (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
SELECT w.id, s.name, s.description, s.step_order, s.step_type, s.assignee_role, s.required, s.duration_days
FROM workflows w
JOIN (VALUES
  ('Thu thập hồ sơ giấy tờ',      'CMND/CCCD, bằng cấp, sơ yếu lý lịch', 0, 'task',     'admin', true, 1),
  ('Tạo tài khoản hệ thống',      'Tạo user UNI EMS, cấp role phù hợp',  1, 'task',     'admin', true, 1),
  ('Bàn giao thiết bị/công cụ',   'Laptop, đồng phục, thẻ ra vào...',     2, 'task',     NULL,    true, 1),
  ('Duyệt hoàn tất onboarding',   'Trưởng phòng xác nhận hoàn tất',       3, 'approval', 'technical_lead', true, 1)
) AS s(name, description, step_order, step_type, assignee_role, required, duration_days)
ON TRUE
WHERE w.name = 'Tạo hồ sơ nhân viên'
  AND NOT EXISTS (SELECT 1 FROM workflow_steps WHERE workflow_id = w.id);

INSERT INTO workflows (name, description, category, color, icon, status)
SELECT 'Báo cáo sự cố',
       'Luồng báo cáo và xử lý sự cố kỹ thuật',
       'Kỹ thuật', '#DC2626', 'ti-alert-triangle', 'active'
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = 'Báo cáo sự cố');

INSERT INTO workflow_steps (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
SELECT w.id, s.name, s.description, s.step_order, s.step_type, s.assignee_role, s.required, s.duration_days
FROM workflows w
JOIN (VALUES
  ('Ghi nhận sự cố',     'Mô tả sự cố, vị trí, mức độ ảnh hưởng', 0, 'task',     'technical', true, 1),
  ('Phân loại & gán xử lý','Trưởng phòng KT phân loại và gán người xử lý', 1, 'task', 'technical_lead', true, 1),
  ('Xử lý sự cố',        'Kỹ thuật xử lý tại hiện trường/từ xa',  2, 'task',     'technical', true, 1),
  ('Xác nhận đã khắc phục','Trưởng phòng xác nhận sự cố đã được giải quyết', 3, 'approval', 'technical_lead', true, 1)
) AS s(name, description, step_order, step_type, assignee_role, required, duration_days)
ON TRUE
WHERE w.name = 'Báo cáo sự cố'
  AND NOT EXISTS (SELECT 1 FROM workflow_steps WHERE workflow_id = w.id);
