-- ============================================================
-- 07_migration_warehouse_ims.sql — UNI IMS (Inventory Management System)
-- Module quản lý kho: danh mục kho, nhà cung cấp, hàng hoá,
-- tồn kho, phiếu nhập / xuất / điều chuyển / kiểm kê + sổ nhật ký.
--
-- Chạy TOÀN BỘ file này trong Supabase → SQL Editor → New query → Run.
-- File idempotent (IF NOT EXISTS / ON CONFLICT) → chạy lại nhiều lần an toàn.
-- Prefix `wh_` để không đụng bảng nghiệp vụ hiện có (products, poms...).
-- ============================================================

-- ============================================================
-- 1. DANH MỤC KHO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_warehouses (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(30)  NOT NULL UNIQUE,
  name       VARCHAR(150) NOT NULL,
  address    TEXT,
  phone      VARCHAR(30),
  manager_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  note       TEXT,
  is_active  BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. NHÀ CUNG CẤP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_suppliers (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(30)  NOT NULL UNIQUE,
  name           VARCHAR(200) NOT NULL,
  tax_code       VARCHAR(30),
  phone          VARCHAR(30),
  email          VARCHAR(150),
  address        TEXT,
  contact_person VARCHAR(150),
  note           TEXT,
  is_active      BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. HÀNG HOÁ TRONG KHO (SKU)
--    product_id: liên kết tuỳ chọn tới catalog sản phẩm sẵn có.
--    Vật tư phụ (ốc vít, dây rút...) không cần có trong products.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_items (
  id          SERIAL PRIMARY KEY,
  sku         VARCHAR(60)  NOT NULL UNIQUE,
  name        VARCHAR(300) NOT NULL,
  product_id  INTEGER REFERENCES public.products(id)   ON DELETE SET NULL,
  category_id INTEGER REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id    INTEGER REFERENCES public.brands(id)     ON DELETE SET NULL,
  unit        VARCHAR(30)  NOT NULL DEFAULT 'Cái',
  spec        TEXT,
  barcode     VARCHAR(80),
  min_qty     NUMERIC(14,2) DEFAULT 0,   -- định mức tồn tối thiểu (cảnh báo)
  max_qty     NUMERIC(14,2) DEFAULT 0,   -- định mức tồn tối đa (0 = không giới hạn)
  unit_cost   NUMERIC(16,2) DEFAULT 0,   -- giá vốn tham chiếu
  image_url   TEXT,
  note        TEXT,
  is_active   BOOLEAN     DEFAULT TRUE,
  created_by  INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_items_sku      ON public.wh_items(sku);
CREATE INDEX IF NOT EXISTS idx_wh_items_name     ON public.wh_items(name);
CREATE INDEX IF NOT EXISTS idx_wh_items_category ON public.wh_items(category_id);
CREATE INDEX IF NOT EXISTS idx_wh_items_product  ON public.wh_items(product_id);

-- ============================================================
-- 4. TỒN KHO (kho × mặt hàng)
--    avg_cost: giá vốn bình quân gia quyền, cập nhật khi ghi sổ phiếu nhập.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_stocks (
  id           SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES public.wh_items(id)      ON DELETE CASCADE,
  quantity     NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_cost     NUMERIC(16,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (warehouse_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_wh_stocks_wh   ON public.wh_stocks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_stocks_item ON public.wh_stocks(item_id);

-- ============================================================
-- 5. PHIẾU NHẬP KHO
--    status: draft (nháp, chưa cộng tồn) | posted (đã ghi sổ) | cancelled
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_receipts (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(40) NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  supplier_id  INTEGER REFERENCES public.wh_suppliers(id) ON DELETE SET NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no VARCHAR(80),                 -- số hoá đơn / số PO của NCC
  note         TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','posted','cancelled')),
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_receipts_wh     ON public.wh_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_receipts_status ON public.wh_receipts(status);
CREATE INDEX IF NOT EXISTS idx_wh_receipts_date   ON public.wh_receipts(receipt_date);

CREATE TABLE IF NOT EXISTS public.wh_receipt_items (
  id         SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES public.wh_receipts(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES public.wh_items(id)    ON DELETE RESTRICT,
  quantity   NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_receipt_items_receipt ON public.wh_receipt_items(receipt_id);

-- ============================================================
-- 6. PHIẾU XUẤT KHO
--    issue_type: sale (bán hàng) | project (dự án/thi công)
--                | internal (nội bộ) | return (trả NCC) | other
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_issues (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(40) NOT NULL UNIQUE,
  warehouse_id  INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  issue_type    VARCHAR(20) NOT NULL DEFAULT 'sale'
                  CHECK (issue_type IN ('sale','project','internal','return','other')),
  pom_id        INTEGER REFERENCES public.poms(id) ON DELETE SET NULL,
  customer_name VARCHAR(250),
  receiver      VARCHAR(150),               -- người nhận hàng
  issue_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  note          TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','posted','cancelled')),
  total_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_by     INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_issues_wh     ON public.wh_issues(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_issues_status ON public.wh_issues(status);
CREATE INDEX IF NOT EXISTS idx_wh_issues_date   ON public.wh_issues(issue_date);

CREATE TABLE IF NOT EXISTS public.wh_issue_items (
  id         SERIAL PRIMARY KEY,
  issue_id   INTEGER NOT NULL REFERENCES public.wh_issues(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES public.wh_items(id)  ON DELETE RESTRICT,
  quantity   NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_issue_items_issue ON public.wh_issue_items(issue_id);

-- ============================================================
-- 7. PHIẾU ĐIỀU CHUYỂN GIỮA CÁC KHO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_transfers (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(40) NOT NULL UNIQUE,
  from_warehouse_id INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  transfer_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  note              TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','posted','cancelled')),
  created_by        INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_by         INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT wh_transfers_diff_wh CHECK (from_warehouse_id <> to_warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_wh_transfers_status ON public.wh_transfers(status);

CREATE TABLE IF NOT EXISTS public.wh_transfer_items (
  id          SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES public.wh_transfers(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES public.wh_items(id)     ON DELETE RESTRICT,
  quantity    NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_transfer_items_transfer ON public.wh_transfer_items(transfer_id);

-- ============================================================
-- 8. PHIẾU KIỂM KÊ
--    counted_qty: số đếm thực tế; khi ghi sổ sẽ điều chỉnh tồn = counted_qty
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_counts (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(40) NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  count_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','posted','cancelled')),
  created_by   INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  posted_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_counts_status ON public.wh_counts(status);

CREATE TABLE IF NOT EXISTS public.wh_count_items (
  id          SERIAL PRIMARY KEY,
  count_id    INTEGER NOT NULL REFERENCES public.wh_counts(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES public.wh_items(id)  ON DELETE RESTRICT,
  system_qty  NUMERIC(14,2) NOT NULL DEFAULT 0,   -- tồn sổ sách tại thời điểm tạo phiếu
  counted_qty NUMERIC(14,2) NOT NULL DEFAULT 0,   -- tồn đếm thực tế
  diff        NUMERIC(14,2) NOT NULL DEFAULT 0,   -- counted - system
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_count_items_count ON public.wh_count_items(count_id);

-- ============================================================
-- 9. SỔ NHẬT KÝ NHẬP / XUẤT (audit trail — chỉ ghi khi phiếu được ghi sổ)
--    quantity mang dấu: + nhập, − xuất
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_movements (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES public.wh_items(id)      ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL
                  CHECK (movement_type IN ('receipt','issue','transfer_in','transfer_out','count_adjust')),
  ref_table     VARCHAR(40),
  ref_id        INTEGER,
  ref_code      VARCHAR(40),
  quantity      NUMERIC(14,2) NOT NULL,
  unit_price    NUMERIC(16,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  note          TEXT,
  created_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_movements_wh      ON public.wh_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_movements_item    ON public.wh_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_wh_movements_created ON public.wh_movements(created_at DESC);

-- ============================================================
-- 10. TRIGGER updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.wh_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wh_warehouses','wh_suppliers','wh_items','wh_stocks',
    'wh_receipts','wh_issues','wh_transfers','wh_counts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.wh_touch_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- 11. VIEW tổng hợp tồn kho (dùng cho danh sách + cảnh báo)
-- ============================================================
CREATE OR REPLACE VIEW public.wh_stock_overview AS
SELECT
  s.id                AS stock_id,
  s.warehouse_id,
  w.code              AS warehouse_code,
  w.name              AS warehouse_name,
  i.id                AS item_id,
  i.sku,
  i.name              AS item_name,
  i.unit,
  i.spec,
  i.min_qty,
  i.max_qty,
  c.name              AS category_name,
  b.name              AS brand_name,
  s.quantity,
  s.avg_cost,
  ROUND(s.quantity * s.avg_cost, 2) AS stock_value,
  CASE
    WHEN s.quantity <= 0                          THEN 'out'
    WHEN i.min_qty > 0 AND s.quantity <= i.min_qty THEN 'low'
    ELSE 'ok'
  END                 AS stock_status,
  s.updated_at
FROM public.wh_stocks s
JOIN public.wh_warehouses w ON w.id = s.warehouse_id
JOIN public.wh_items      i ON i.id = s.item_id
LEFT JOIN public.categories c ON c.id = i.category_id
LEFT JOIN public.brands     b ON b.id = i.brand_id;

-- ============================================================
-- 12. DỮ LIỆU KHỞI TẠO — kho mặc định
--     (sửa lại tên/địa chỉ cho đúng thực tế công ty rồi chạy)
-- ============================================================
INSERT INTO public.wh_warehouses (code, name, address)
VALUES
  ('KHO-HN',  'Kho Hà Nội',    'Hà Nội'),
  ('KHO-DN',  'Kho Đà Nẵng',   'Đà Nẵng'),
  ('KHO-HCM', 'Kho TP.HCM',    'TP. Hồ Chí Minh')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 13. ĐĂNG KÝ MODULE VÀO SIDEBAR (system_settings.modules)
--     Chỉ THÊM nếu chưa có — không ghi đè danh sách module hiện tại.
-- ============================================================
UPDATE public.system_settings
SET value = value || '[{"key":"warehouse","icon":"ti-building-warehouse","group":"Vận hành","label":"UNI IMS - Kho hàng","isSystem":true}]'::jsonb,
    updated_at = NOW()
WHERE key = 'modules'
  AND NOT (value @> '[{"key":"warehouse"}]'::jsonb);

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name LIKE 'wh\_%' ORDER BY 1;
-- SELECT * FROM public.wh_warehouses;
-- SELECT value FROM public.system_settings WHERE key='modules';
