-- ============================================================
-- 08_migration_warehouse_ims_v2.sql — UNI IMS giai đoạn 2
-- Bổ sung nghiệp vụ cho công ty giải pháp & thi công mạng:
--   1. Tồn khả dụng + giữ hàng cho dự án (reservation)
--   2. Đối chiếu POM với kho (dùng product_id có sẵn)
--   3. Phiếu đề nghị vật tư + duyệt
--   4. Hoàn trả vật tư thừa từ công trình
--   5. Kho theo đội / theo xe
--   6. Serial / MAC / bảo hành thiết bị
--   7. Đơn mua hàng (biết "hàng đang về") + đề xuất mua
--   8. Quy đổi đơn vị đóng gói (cuộn 305m → mét)
--
-- CHẠY SAU 07_migration_warehouse_ims.sql.
-- Idempotent — chạy lại nhiều lần an toàn.
-- ============================================================

-- ============================================================
-- 1. KHO THEO ĐỘI / THEO XE
--    kind = main   : kho chính (kho cứng của công ty)
--           crew   : kho của đội thi công
--           vehicle: kho trên xe
--           virtual: kho ảo (hàng đang đi đường, hàng lỗi...)
--    Hàng đã rời kho chính nhưng chưa lắp ở công trình thì nằm ở đây
--    → luôn biết tổng tài sản công ty đang ở đâu.
-- ============================================================
ALTER TABLE public.wh_warehouses
  ADD COLUMN IF NOT EXISTS kind     VARCHAR(20) NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.wh_warehouses
    ADD CONSTRAINT wh_warehouses_kind_check
    CHECK (kind IN ('main','crew','vehicle','virtual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_wh_warehouses_kind  ON public.wh_warehouses(kind);
CREATE INDEX IF NOT EXISTS idx_wh_warehouses_owner ON public.wh_warehouses(owner_id);

-- ============================================================
-- 2. HÀNG HOÁ: quy cách đóng gói, serial, bảo hành
--    pack_size: 1 pack_unit = pack_size unit (1 cuộn = 305 mét)
--    track_serial: thiết bị mạng quản theo từng con (switch, AP, router)
-- ============================================================
ALTER TABLE public.wh_items
  ADD COLUMN IF NOT EXISTS pack_unit       VARCHAR(30),
  ADD COLUMN IF NOT EXISTS pack_size       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_serial    BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_months INTEGER       NOT NULL DEFAULT 0;

-- ============================================================
-- 3. TỒN KHO: thêm số lượng đang giữ
--    tồn khả dụng = quantity - reserved_qty
--    reserved_qty do trigger ở mục 4 tự duy trì, KHÔNG sửa tay.
-- ============================================================
ALTER TABLE public.wh_stocks
  ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 4. GIỮ HÀNG CHO DỰ ÁN (RESERVATION)
--    Dự án chốt rồi nhưng chưa xuất → hàng vẫn nằm trong kho
--    nhưng KHÔNG được tính là khả dụng cho dự án khác.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_reservations (
  id           SERIAL PRIMARY KEY,
  pom_id       INTEGER REFERENCES public.poms(id) ON DELETE CASCADE,
  project_name VARCHAR(250),                 -- khi giữ hàng cho việc chưa có POM
  warehouse_id INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES public.wh_items(id)      ON DELETE CASCADE,
  quantity     NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','released','fulfilled')),
  expire_date  DATE,
  note         TEXT,
  created_by   INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  released_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wh_res_pom    ON public.wh_reservations(pom_id);
CREATE INDEX IF NOT EXISTS idx_wh_res_item   ON public.wh_reservations(warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_wh_res_status ON public.wh_reservations(status);

-- Trigger đồng bộ wh_stocks.reserved_qty — không bao giờ lệch
CREATE OR REPLACE FUNCTION public.wh_sync_reserved() RETURNS TRIGGER AS $$
DECLARE
  w INTEGER;
  i INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    w := OLD.warehouse_id; i := OLD.item_id;
  ELSE
    w := NEW.warehouse_id; i := NEW.item_id;
  END IF;

  INSERT INTO public.wh_stocks (warehouse_id, item_id, quantity, avg_cost)
  VALUES (w, i, 0, 0)
  ON CONFLICT (warehouse_id, item_id) DO NOTHING;

  UPDATE public.wh_stocks s
     SET reserved_qty = COALESCE((
           SELECT SUM(r.quantity) FROM public.wh_reservations r
            WHERE r.warehouse_id = w AND r.item_id = i AND r.status = 'active'
         ), 0)
   WHERE s.warehouse_id = w AND s.item_id = i;

  -- Khi UPDATE đổi kho/mặt hàng thì phải đồng bộ cả dòng cũ
  IF TG_OP = 'UPDATE' AND (OLD.warehouse_id <> NEW.warehouse_id OR OLD.item_id <> NEW.item_id) THEN
    UPDATE public.wh_stocks s
       SET reserved_qty = COALESCE((
             SELECT SUM(r.quantity) FROM public.wh_reservations r
              WHERE r.warehouse_id = OLD.warehouse_id AND r.item_id = OLD.item_id AND r.status = 'active'
           ), 0)
     WHERE s.warehouse_id = OLD.warehouse_id AND s.item_id = OLD.item_id;
  END IF;

  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wh_sync_reserved ON public.wh_reservations;
CREATE TRIGGER trg_wh_sync_reserved
  AFTER INSERT OR UPDATE OR DELETE ON public.wh_reservations
  FOR EACH ROW EXECUTE FUNCTION public.wh_sync_reserved();

-- ============================================================
-- 5. ĐƠN MUA HÀNG — để biết "hàng đang về"
--    Thiếu bảng này thì công thức đề xuất mua sẽ đề nghị mua lại
--    những thứ đã đặt rồi.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_purchase_orders (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(40) NOT NULL UNIQUE,
  supplier_id   INTEGER REFERENCES public.wh_suppliers(id)  ON DELETE SET NULL,
  warehouse_id  INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  pom_id        INTEGER REFERENCES public.poms(id) ON DELETE SET NULL,
  order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  reference_no  VARCHAR(80),
  note          TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','ordered','received','cancelled')),
  total_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_po_status   ON public.wh_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_wh_po_supplier ON public.wh_purchase_orders(supplier_id);

CREATE TABLE IF NOT EXISTS public.wh_po_items (
  id           SERIAL PRIMARY KEY,
  po_id        INTEGER NOT NULL REFERENCES public.wh_purchase_orders(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES public.wh_items(id) ON DELETE RESTRICT,
  quantity     NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  received_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price   NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_po_items_po   ON public.wh_po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_wh_po_items_item ON public.wh_po_items(item_id);

-- ============================================================
-- 6. PHIẾU ĐỀ NGHỊ VẬT TƯ
--    Đội kỹ thuật đề nghị trước khi đi → quản lý duyệt →
--    thủ kho soạn hàng → sinh phiếu xuất.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_requests (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(40) NOT NULL UNIQUE,
  warehouse_id      INTEGER NOT NULL REFERENCES public.wh_warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   INTEGER REFERENCES public.wh_warehouses(id) ON DELETE SET NULL, -- kho đội nhận (nếu giao cho đội)
  pom_id            INTEGER REFERENCES public.poms(id) ON DELETE SET NULL,
  project_name      VARCHAR(250),
  requester_id      INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  need_date         DATE,
  purpose           VARCHAR(30) NOT NULL DEFAULT 'project'
                      CHECK (purpose IN ('project','internal','warranty','other')),
  note              TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','approved','rejected','issued','cancelled')),
  approved_by       INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  reject_reason     TEXT,
  issue_id          INTEGER REFERENCES public.wh_issues(id)    ON DELETE SET NULL,
  transfer_id       INTEGER REFERENCES public.wh_transfers(id) ON DELETE SET NULL,
  created_by        INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_requests_status ON public.wh_requests(status);
CREATE INDEX IF NOT EXISTS idx_wh_requests_pom    ON public.wh_requests(pom_id);

CREATE TABLE IF NOT EXISTS public.wh_request_items (
  id           SERIAL PRIMARY KEY,
  request_id   INTEGER NOT NULL REFERENCES public.wh_requests(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES public.wh_items(id) ON DELETE RESTRICT,
  quantity     NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  approved_qty NUMERIC(14,2),
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_request_items_req ON public.wh_request_items(request_id);

-- ============================================================
-- 7. SERIAL / MAC / BẢO HÀNH
--    status: in_stock (trong kho) | issued (đã xuất, chưa lắp)
--            installed (đã lắp ở công trình) | returned (thu hồi về)
--            broken (hỏng) | sold (bán đứt)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wh_serials (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES public.wh_items(id) ON DELETE CASCADE,
  serial       VARCHAR(120) NOT NULL,
  mac          VARCHAR(60),
  warehouse_id INTEGER REFERENCES public.wh_warehouses(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'in_stock'
                 CHECK (status IN ('in_stock','issued','installed','returned','broken','sold')),
  pom_id       INTEGER REFERENCES public.poms(id)          ON DELETE SET NULL,
  supplier_id  INTEGER REFERENCES public.wh_suppliers(id)  ON DELETE SET NULL,
  receipt_id   INTEGER REFERENCES public.wh_receipts(id)   ON DELETE SET NULL,
  issue_id     INTEGER REFERENCES public.wh_issues(id)     ON DELETE SET NULL,
  warranty_end DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, serial)
);
CREATE INDEX IF NOT EXISTS idx_wh_serials_item   ON public.wh_serials(item_id);
CREATE INDEX IF NOT EXISTS idx_wh_serials_serial ON public.wh_serials(serial);
CREATE INDEX IF NOT EXISTS idx_wh_serials_status ON public.wh_serials(status);
CREATE INDEX IF NOT EXISTS idx_wh_serials_pom    ON public.wh_serials(pom_id);
CREATE INDEX IF NOT EXISTS idx_wh_serials_wh     ON public.wh_serials(warehouse_id);

-- ============================================================
-- 8. HOÀN TRẢ VẬT TƯ THỪA TỪ CÔNG TRÌNH
--    Thi công xong luôn dư cáp, đầu bấm, ốc vít, có khi dư cả thiết bị.
--    receipt_type: purchase (mua mới) | site_return (thu hồi từ công trình)
--                  | crew_return (đội trả về kho) | other
-- ============================================================
ALTER TABLE public.wh_receipts
  ADD COLUMN IF NOT EXISTS receipt_type VARCHAR(20) NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS pom_id       INTEGER REFERENCES public.poms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS po_id        INTEGER REFERENCES public.wh_purchase_orders(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.wh_receipts
    ADD CONSTRAINT wh_receipts_type_check
    CHECK (receipt_type IN ('purchase','site_return','crew_return','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_wh_receipts_type ON public.wh_receipts(receipt_type);
CREATE INDEX IF NOT EXISTS idx_wh_receipts_pom  ON public.wh_receipts(pom_id);

-- Phiếu xuất: liên kết ngược về phiếu đề nghị đã duyệt
ALTER TABLE public.wh_issues
  ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES public.wh_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wh_issues_pom ON public.wh_issues(pom_id);

-- Điều chuyển: gắn dự án + phiếu đề nghị (giao hàng cho đội thi công)
ALTER TABLE public.wh_transfers
  ADD COLUMN IF NOT EXISTS pom_id     INTEGER REFERENCES public.poms(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES public.wh_requests(id) ON DELETE SET NULL;

-- ============================================================
-- 9. VIEW TỒN KHO — bổ sung tồn khả dụng
-- ============================================================
DROP VIEW IF EXISTS public.wh_stock_overview CASCADE;
CREATE VIEW public.wh_stock_overview AS
SELECT
  s.id            AS stock_id,
  s.warehouse_id,
  w.code          AS warehouse_code,
  w.name          AS warehouse_name,
  w.kind          AS warehouse_kind,
  s.item_id,
  i.sku,
  i.name          AS item_name,
  i.unit,
  i.spec,
  i.pack_unit,
  i.pack_size,
  i.track_serial,
  i.min_qty,
  i.max_qty,
  c.name          AS category_name,
  b.name          AS brand_name,
  s.quantity,
  s.reserved_qty,
  GREATEST(s.quantity - s.reserved_qty, 0) AS available_qty,
  s.avg_cost,
  (s.quantity * s.avg_cost) AS stock_value,
  CASE
    WHEN s.quantity <= 0 THEN 'out'
    WHEN i.min_qty > 0 AND s.quantity <= i.min_qty THEN 'low'
    ELSE 'ok'
  END AS stock_status,
  CASE
    WHEN GREATEST(s.quantity - s.reserved_qty, 0) <= 0 THEN 'out'
    WHEN i.min_qty > 0 AND GREATEST(s.quantity - s.reserved_qty, 0) <= i.min_qty THEN 'low'
    ELSE 'ok'
  END AS avail_status,
  s.updated_at
FROM public.wh_stocks s
JOIN public.wh_items i      ON i.id = s.item_id
JOIN public.wh_warehouses w ON w.id = s.warehouse_id
LEFT JOIN public.categories c ON c.id = i.category_id
LEFT JOIN public.brands b     ON b.id = i.brand_id;

-- ============================================================
-- 10. VIEW KHẢ DỤNG TOÀN HỆ THỐNG (theo mặt hàng)
--     Dùng cho đối chiếu POM và đề xuất mua hàng.
--     available = on_hand - reserved
--     incoming  = đã đặt mua nhưng chưa về
-- ============================================================
DROP VIEW IF EXISTS public.wh_item_availability CASCADE;
CREATE VIEW public.wh_item_availability AS
SELECT
  i.id            AS item_id,
  i.sku,
  i.name          AS item_name,
  i.unit,
  i.product_id,
  i.min_qty,
  i.unit_cost,
  i.track_serial,
  i.is_active,
  COALESCE(st.on_hand,  0) AS on_hand,
  COALESCE(st.reserved, 0) AS reserved,
  GREATEST(COALESCE(st.on_hand, 0) - COALESCE(st.reserved, 0), 0) AS available,
  COALESCE(po.incoming, 0) AS incoming,
  COALESCE(st.avg_cost, i.unit_cost) AS avg_cost,
  st.main_warehouse_id,
  st.main_warehouse_name
FROM public.wh_items i
LEFT JOIN LATERAL (
  SELECT SUM(s.quantity)      AS on_hand,
         SUM(s.reserved_qty)  AS reserved,
         MAX(s.avg_cost)      AS avg_cost,
         (SELECT s2.warehouse_id FROM public.wh_stocks s2
           WHERE s2.item_id = i.id ORDER BY s2.quantity DESC LIMIT 1) AS main_warehouse_id,
         (SELECT w2.name FROM public.wh_stocks s2
            JOIN public.wh_warehouses w2 ON w2.id = s2.warehouse_id
           WHERE s2.item_id = i.id ORDER BY s2.quantity DESC LIMIT 1) AS main_warehouse_name
    FROM public.wh_stocks s
   WHERE s.item_id = i.id
) st ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(pi.quantity - pi.received_qty, 0)) AS incoming
    FROM public.wh_po_items pi
    JOIN public.wh_purchase_orders p ON p.id = pi.po_id
   WHERE pi.item_id = i.id AND p.status = 'ordered'
) po ON TRUE;

-- ============================================================
-- 11. VIEW QUYẾT TOÁN VẬT TƯ THEO DỰ ÁN
--     đã xuất - đã hoàn trả = thực dùng
-- ============================================================
DROP VIEW IF EXISTS public.wh_project_usage CASCADE;
CREATE VIEW public.wh_project_usage AS
SELECT
  p.id                AS pom_id,
  p.pom_code,
  p.project_name,
  p.customer_name,
  u.item_id,
  i.sku,
  i.name              AS item_name,
  i.unit,
  COALESCE(SUM(u.issued),   0) AS issued_qty,
  COALESCE(SUM(u.returned), 0) AS returned_qty,
  COALESCE(SUM(u.issued), 0) - COALESCE(SUM(u.returned), 0) AS used_qty,
  COALESCE(SUM(u.cost),     0) AS cost
FROM public.poms p
JOIN LATERAL (
  SELECT ii.item_id,
         SUM(ii.quantity)                AS issued,
         0::numeric                      AS returned,
         SUM(ii.quantity * ii.unit_price) AS cost
    FROM public.wh_issues s
    JOIN public.wh_issue_items ii ON ii.issue_id = s.id
   WHERE s.pom_id = p.id AND s.status = 'posted'
   GROUP BY ii.item_id
  UNION ALL
  SELECT ri.item_id,
         0::numeric,
         SUM(ri.quantity),
         -SUM(ri.quantity * ri.unit_price)
    FROM public.wh_receipts r
    JOIN public.wh_receipt_items ri ON ri.receipt_id = r.id
   WHERE r.pom_id = p.id AND r.status = 'posted'
     AND r.receipt_type IN ('site_return','crew_return')
   GROUP BY ri.item_id
) u ON TRUE
JOIN public.wh_items i ON i.id = u.item_id
GROUP BY p.id, p.pom_code, p.project_name, p.customer_name,
         u.item_id, i.sku, i.name, i.unit;

-- ============================================================
-- 12. ĐỒNG BỘ LẠI reserved_qty (phòng khi chạy migration nhiều lần)
-- ============================================================
UPDATE public.wh_stocks s
   SET reserved_qty = COALESCE((
         SELECT SUM(r.quantity) FROM public.wh_reservations r
          WHERE r.warehouse_id = s.warehouse_id
            AND r.item_id = s.item_id
            AND r.status = 'active'
       ), 0);

-- ============================================================
-- 13. TRIGGER updated_at cho các bảng mới
-- ============================================================
DROP TRIGGER IF EXISTS trg_wh_po_touch ON public.wh_purchase_orders;
CREATE TRIGGER trg_wh_po_touch BEFORE UPDATE ON public.wh_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.wh_touch_updated_at();

DROP TRIGGER IF EXISTS trg_wh_requests_touch ON public.wh_requests;
CREATE TRIGGER trg_wh_requests_touch BEFORE UPDATE ON public.wh_requests
  FOR EACH ROW EXECUTE FUNCTION public.wh_touch_updated_at();

DROP TRIGGER IF EXISTS trg_wh_serials_touch ON public.wh_serials;
CREATE TRIGGER trg_wh_serials_touch BEFORE UPDATE ON public.wh_serials
  FOR EACH ROW EXECUTE FUNCTION public.wh_touch_updated_at();

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name LIKE 'wh\_%' ORDER BY 1;
-- SELECT * FROM public.wh_item_availability LIMIT 20;
-- SELECT * FROM public.wh_stock_overview LIMIT 20;
