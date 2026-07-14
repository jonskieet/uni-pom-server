-- ============================================================
-- Migration: Đồng bộ danh sách thiết bị phiếu khảo sát với POM
-- Chạy trên Postgres (VM tự host, Docker Compose)
-- ============================================================
-- Bối cảnh: SurveyItem trước đây là bản sao chép tay của PomItem
-- (product_name, quantity_proposed lưu riêng) → khi kỹ thuật sửa
-- thiết bị trong POM, dữ liệu phiếu khảo sát không tự cập nhật,
-- dễ bị quên đồng bộ, và phải sửa/upload lại file Word thủ công.
--
-- Migration này biến SurveyItem thành bảng THAM CHIẾU tới PomItem
-- (pom_item_id) thay vì lưu trùng dữ liệu — product_name/quantity
-- đề xuất sẽ luôn đọc live từ PomItem/Product qua JOIN.
--
-- Không có dữ liệu thật trong survey_items hiện tại → migrate thẳng,
-- không cần script match dữ liệu cũ.
-- ============================================================

-- 1. Pom: theo dõi thời điểm danh sách thiết bị (PomItem) thay đổi gần nhất
ALTER TABLE poms ADD COLUMN IF NOT EXISTS items_updated_at TIMESTAMP;

-- 2. SurveyReport: theo dõi thời điểm phiếu khảo sát đồng bộ thiết bị gần nhất từ POM
ALTER TABLE survey_reports ADD COLUMN IF NOT EXISTS items_synced_at TIMESTAMP;

-- 3. SurveyItem: bỏ cột trùng lặp, thêm liên kết tới pom_items
ALTER TABLE survey_items DROP COLUMN IF EXISTS quantity_proposed;
ALTER TABLE survey_items ALTER COLUMN product_name DROP NOT NULL;

ALTER TABLE survey_items ADD COLUMN IF NOT EXISTS pom_item_id INTEGER;
ALTER TABLE survey_items ADD COLUMN IF NOT EXISTS is_removed_from_pom BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE survey_items
  ADD CONSTRAINT survey_items_pom_item_id_fkey
  FOREIGN KEY (pom_item_id) REFERENCES pom_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS survey_items_pom_item_id_idx ON survey_items(pom_item_id);

-- 4. Backfill items_updated_at cho các POM đã có sẵn (mốc = updated_at hiện tại)
UPDATE poms SET items_updated_at = updated_at WHERE items_updated_at IS NULL;
