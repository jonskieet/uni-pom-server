-- ============================================================
-- Migration: Thêm bảng survey_form_templates
-- Chạy trực tiếp trên Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS survey_form_templates (
  id           SERIAL PRIMARY KEY,
  survey_type  TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  icon         TEXT DEFAULT 'ti-clipboard',
  sections     JSONB NOT NULL DEFAULT '[]',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sft_survey_type ON survey_form_templates(survey_type);
CREATE INDEX IF NOT EXISTS idx_sft_is_active   ON survey_form_templates(is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sft_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sft_updated_at ON survey_form_templates;
CREATE TRIGGER trg_sft_updated_at
  BEFORE UPDATE ON survey_form_templates
  FOR EACH ROW EXECUTE FUNCTION update_sft_updated_at();
