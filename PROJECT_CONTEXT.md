# UNI-POM — Tài liệu dự án (Handover / Context)

> **Mục đích file này:** Dùng để khôi phục ngữ cảnh dự án khi bắt đầu lại với Claude ở tài khoản mới.
> Copy toàn bộ nội dung file này, dán vào đầu cuộc trò chuyện mới với Claude và nói: *"Đây là ngữ cảnh dự án uni-pom của tôi, hãy đọc và tiếp tục giúp tôi phát triển."*

---

## 1. Tổng quan dự án

**Tên dự án:** `uni-pom`
**Mục đích:** Phần mềm desktop nội bộ cho công ty kinh doanh thiết bị CNTT (mạng LAN, hội trường, màn hình LED, camera...). Hỗ trợ 2 phòng ban chính:

| Phòng ban | Vai trò trong phần mềm |
|-----------|------------------------|
| **Kinh doanh (sales)** | Quản lý sản phẩm, giá, VAT. Xem & duyệt POM, xuất báo giá Excel |
| **Kỹ thuật (technical)** | Tạo POM (danh sách thiết bị đề xuất), tạo phiếu báo cáo khảo sát, xuất Word |

**Luồng nghiệp vụ chính:**
```
Kỹ thuật đi khảo sát thực tế
  → Tạo Phiếu báo cáo khảo sát (gắn với POM)
  → Tạo POM (danh sách thiết bị đề xuất dựa trên phiếu khảo sát)
  → Submit POM lên kinh doanh
  → Kinh doanh duyệt POM
  → Kinh doanh xuất Excel báo giá gửi khách
```

---

## 2. Tech Stack

```
Electron 30          — Desktop app wrapper (main process)
React 18 + TypeScript — UI (renderer process)
Vite + vite-plugin-electron — Build tool
React Router DOM v7  — Routing (HashRouter)
Zustand              — State management (auth store)
better-sqlite3       — Database SQLite local (không cần server)
ExcelJS              — Xuất file Excel
Tabler Icons Webfont — Icon library (dùng class "ti ti-xxx")
Ant Design (antd)    — UI components (dùng ít, chủ yếu dùng custom UI)
```

**Chạy dev:**
```bash
npm run dev          # Chạy Vite dev server
npm run electron:dev # Chạy Electron
npm run build        # Build production
```

---

## 3. Cấu trúc thư mục

```
uni-pom/
├── electron/
│   ├── main.ts              # Electron main process, khởi động app
│   ├── preload.ts           # Bridge giữa main ↔ renderer (window.api)
│   ├── db.ts                # Init SQLite, migrations, seed data
│   ├── ipcHandlers.ts       # Tất cả IPC handlers (API backend)
│   └── surveyHandlers.ts    # Handler xuất Word báo cáo khảo sát (cũ, ít dùng)
├── src/
│   ├── App.tsx              # Router, AuthContext provider
│   ├── store/
│   │   └── auth.ts          # Zustand auth store (user, login, logout)
│   ├── styles/
│   │   └── theme.ts         # Màu sắc, radius, spacing, commonStyles, formatVND
│   ├── types/               # TypeScript interfaces (Pom, Product, User...)
│   ├── hooks/               # Custom hooks (usePoms, usePomDetail...)
│   ├── services/            # Service layer gọi window.api (PomService...)
│   ├── components/
│   │   ├── ui/              # Shared UI components (Button, Input, Modal, Badge...)
│   │   ├── MainLayout.tsx   # Layout chính có sidebar
│   │   ├── ProtectedRoute.tsx
│   │   └── WindowControls.tsx
│   └── pages/
│       ├── auth/
│       │   └── LoginPage.tsx
│       ├── products/
│       │   └── ProductsPage.tsx    # Kinh doanh: quản lý sản phẩm
│       ├── pom/
│       │   ├── CreatePomPage.tsx   # Kỹ thuật: tạo POM mới
│       │   ├── TechPomPage.tsx     # Kỹ thuật: xem POM của mình
│       │   └── MyPomPage.tsx       # Kinh doanh: xem & duyệt & xuất Excel
│       └── survey/
│           ├── SurveyPage.tsx      # Danh sách phiếu khảo sát (list view)
│           └── SurveyReportPage.tsx # Tạo phiếu báo cáo khảo sát (wizard 3 bước)
```

---

## 4. Database Schema (SQLite)

### Bảng chính

```sql
-- Người dùng
users (id, username, full_name, role[admin|sales|technical], password_hash, is_active)

-- Danh mục sản phẩm
brands     (id, name, short_name, country, website, logo_path, is_active)
categories (id, name, description)
products   (id, brand_id, category_id, name, part_number, unit, price, vat_rate,
            status[active|discontinued|draft], description, spec, image_path, created_by)
price_history (id, product_id, old_price, new_price, changed_by, changed_at)

-- Giải pháp & POM
solutions  (id, name, code[LAN|CONF|CCTV|WIFI|VOIP|SEC|DC], description, is_active)
poms       (id, pom_code, solution_id, created_by, reviewed_by, project_name,
            customer_name, status[draft|submitted|reviewed|exported],
            note, return_reason, exported_at)
pom_items  (id, pom_id, product_id, quantity, unit_price, vat_rate, note, sort_order)

-- Phiếu báo cáo khảo sát
survey_reports (id, report_code, report_type, pom_id, created_by,
               project_name, customer_name, site_address, survey_date,
               surveyor_name, status[draft|completed], general_note)
survey_items   (id, report_id, product_id[nullable], product_name,
               quantity_proposed, quantity_actual, unit, location,
               condition_note, sort_order)
```

### Quan hệ quan trọng
- `survey_reports.pom_id → poms.id` — Mỗi phiếu khảo sát gắn với 1 POM
- `survey_reports.general_note` — Lưu **JSON toàn bộ form** LAN dưới dạng string: `{ kind: 'lan', lanForm: { ... } }`
- `survey_items` — Lưu danh sách thiết bị đề xuất từ phiếu khảo sát (product_id = null vì không bắt buộc link catalog)

---

## 5. IPC API (window.api)

Renderer gọi main process qua `window.api` được expose trong `preload.ts`:

```typescript
window.api = {
  brands:     { getAll, create, update, delete },
  categories: { getAll },
  products:   { getAll, getById, create, update, delete, getPriceHistory },
  solutions:  { getAll },
  poms: {
    getAll,       // filters: { status, created_by, search }
    getById,      // trả về pom + items đầy đủ
    create,       // { solution_id, project_name, customer_name, created_by, items[] }
    update,
    updateStatus, // (id, status, userId)
    return,       // (id, reason, userId) — trả POM về kỹ thuật
    delete,
    exportExcel,  // xuất file .xlsx theo template
  },
  pomItems:   { upsert },
  users:      { getAll, login },
  survey: {
    getAll,       // filters: { status, report_type, created_by, pom_id } ← pom_id mới thêm
    getById,      // trả về report + items[]
    create,       // tạo phiếu mới
    update,       // cập nhật thông tin phiếu
    updateItems,  // xóa & insert lại items (cần có product_id: null nếu không link catalog)
    delete,
  },
}
```

---

## 6. Roles & Phân quyền

| Route | Sales | Technical | Admin |
|-------|-------|-----------|-------|
| `/products` | ✅ | ❌ | ✅ |
| `/pricing` | ✅ | ❌ | ✅ |
| `/my-pom` | ✅ | ❌ | ✅ |
| `/brands` | ✅ | ❌ | ✅ |
| `/create-pom` | ❌ | ✅ | ✅ |
| `/solutions` | ❌ | ✅ | ✅ |
| `/pom-history` | ❌ | ✅ | ✅ |
| `/survey` | ✅ | ✅ | ✅ |
| `/users`, `/settings` | ❌ | ❌ | ✅ |

---

## 7. Module Phiếu Báo Cáo Khảo Sát (đang phát triển)

### Luồng tạo phiếu (`SurveyReportPage.tsx`)

```
Bước 1: Chọn loại khảo sát
  ├── Mạng LAN ✅ (đã có)
  ├── Màn hình LED 🔒 (sắp ra mắt)
  ├── Phòng họp / Hội trường 🔒
  └── Camera CCTV 🔒

Bước 2: Chọn POM liên kết
  └── Search + select POM từ danh sách

Bước 3: Nhập form (dạng card cuộn dọc)
  ├── ① Thông tin chung (đơn vị, ngày, người KS, địa chỉ)
  ├── ② Hiện trạng trang thiết bị CNTT (bảng có thể thêm/xóa dòng)
  ├── ③ Thông tin hiện trạng (5 textarea: Internet, Bảo mật, Switch, Wifi, Cáp)
  ├── ④ Nhu cầu đề xuất nâng cấp (bảng thiết bị đề xuất)
  └── ⑤ Ghi chú / Sơ đồ lắp đặt

→ Lưu DB: survey_reports + survey_items
→ Xuất Word: HTML-to-DOC trick (Blob → .doc)
```

### Dữ liệu lưu

```typescript
// survey_reports.general_note lưu JSON:
{
  kind: 'lan',
  lanForm: {
    unit_name: string,
    survey_date: string,
    surveyor_name: string,
    site_address: string,
    current_devices: LanDeviceRow[],
    current_status: {
      internet_connection: string,
      security_system: string,
      switch_system: string,
      wifi_system: string,
      cable_system: string,
    },
    proposed_devices: LanProposedDevice[],
    general_note: string,
  }
}

// survey_items: thiết bị đề xuất (proposed_devices)
// QUAN TRỌNG: product_id phải là null (không phải undefined) khi gọi updateItems
```

### Xem phiếu trong MyPomPage

`MyPomPage.tsx` — tab "Phiếu khảo sát" trong detail panel POM:
- Danh sách phiếu filter đúng theo `pom_id` (IPC handler đã có filter này)
- Click card → mở `SurveyDetailModal` xem đầy đủ
- Modal hiển thị: thông tin chung, bảng hiện trạng TB, tình trạng hệ thống, bảng đề xuất, ghi chú

---

## 8. Bugs đã fix (quan trọng để không lặp lại)

### Bug 1: `RangeError: Missing named parameter "product_id"`
**Nguyên nhân:** `survey:updateItems` IPC dùng SQL `@product_id` nhưng payload không có field này.
**Fix:** Thêm `product_id: null` vào mỗi item khi gọi `updateItems`.

### Bug 2: Tab "Phiếu khảo sát" hiển thị tất cả phiếu, không lọc theo POM
**Nguyên nhân:** `survey:getAll` handler không có filter `pom_id`.
**Fix:** Thêm vào `ipcHandlers.ts`:
```typescript
if (filters?.pom_id) { q += ' AND sr.pom_id = @pom_id'; params.pom_id = filters.pom_id }
```

---

## 9. Theme & Design System

**File:** `src/styles/theme.ts`

```typescript
colors.primary        = '#3C3489'  // Tím đậm — màu chính
colors.secondary      = '#185FA5'  // Xanh dương
colors.gradientPrimary = 'linear-gradient(90deg, #3C3489, #185FA5)'

// Status POM
STATUS_POM.draft     = { label: 'Nháp',      color: '#444441', bg: '#F1EFE8' }
STATUS_POM.submitted = { label: 'Chờ duyệt', color: '#854F0B', bg: '#FAEEDA' }
STATUS_POM.reviewed  = { label: 'Đã duyệt',  color: '#185FA5', bg: '#E0EDFF' }
STATUS_POM.exported  = { label: 'Đã xuất',   color: '#3B6D11', bg: '#EAF3DE' }

// Icon library: Tabler Icons — dùng className="ti ti-{name}"
// Ví dụ: ti-network, ti-clipboard-list, ti-file-word, ti-device-desktop...
```

---

## 10. Modules chưa làm / Placeholder

Các trang này hiện chỉ là `<Placeholder />`:
- `/pricing` — Bảng giá & quản lý VAT
- `/brands` — Quản lý hãng sản xuất
- `/solutions` — Quản lý giải pháp
- `/users` — Quản lý người dùng
- `/settings` — Cài đặt hệ thống

Các loại khảo sát chưa làm (trong `SurveyReportPage`):
- Màn hình LED
- Phòng họp / Hội trường
- Camera CCTV

---

## 11. Hướng dẫn tiếp tục với Claude

**Khi bắt đầu session mới, dán nội dung file này vào và nói:**

> *"Đây là ngữ cảnh dự án uni-pom của tôi. Đây là ứng dụng Electron + React + SQLite viết bằng TypeScript. Hãy đọc kỹ và giúp tôi tiếp tục phát triển. Tôi sẽ gửi file project [tên file .zip] và mô tả việc cần làm."*

**Luôn gửi kèm file project .zip** để Claude đọc code thực tế, vì code thay đổi theo thời gian.

**Gợi ý các bước tiếp theo:**
1. Hoàn thiện module khảo sát LED / Hội trường / CCTV (tương tự flow LAN)
2. Làm trang `/pricing` — quản lý giá sản phẩm theo thời gian
3. Làm trang `/brands` — CRUD hãng sản xuất
4. Làm trang `/users` — quản lý tài khoản (admin)
5. Thêm chức năng "Hoàn công / Nghiệm thu" vào module survey (route `/survey` subtitle đã có "Hoàn công · Nghiệm thu")
6. Thêm trạng thái `completed` cho phiếu khảo sát (hiện chỉ có `draft`)

---

## 12. File quan trọng cần chú ý khi thay đổi

| File | Lý do quan trọng |
|------|------------------|
| `electron/db.ts` | Schema DB — migrations phải backward compatible |
| `electron/ipcHandlers.ts` | Tất cả business logic backend |
| `electron/preload.ts` | API bridge — thêm handler mới phải expose ở đây |
| `src/styles/theme.ts` | Design system — không hard-code màu trong component |
| `src/pages/survey/SurveyReportPage.tsx` | Module đang phát triển chính |
| `src/pages/pom/MyPomPage.tsx` | View phức tạp nhất, có tab survey |

---

*Cập nhật lần cuối: Tháng 5/2026 — Module phiếu báo cáo khảo sát Mạng LAN hoàn chỉnh, đã fix bug product_id và pom_id filter.*
