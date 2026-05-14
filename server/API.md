# API Documentation

## Base URL

```
http://localhost:5000/api
```

---

## Response Format

Tất cả responses đều theo format này:

### Success (2xx)
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

### Error (4xx/5xx)
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Authentication Endpoints

### POST /auth/login

Đăng nhập và nhận JWT token.

**Request:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "full_name": "Quản trị viên",
      "role": "admin"
    }
  }
}
```

---

### GET /auth/me

Lấy thông tin user hiện tại.

**Request:**
```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "full_name": "Quản trị viên",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-05-14T10:00:00Z"
  }
}
```

---

### POST /auth/change-password

Đổi mật khẩu.

**Request:**
```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "old_password": "current_password",
    "new_password": "new_strong_password"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Products Endpoints

### GET /products

Lấy danh sách sản phẩm với pagination và search.

**Query Parameters:**
- `page` (int, default: 1) - Trang
- `limit` (int, default: 20, max: 100) - Số items/trang
- `search` (string) - Tìm kiếm theo name, part_number, description
- `brand_id` (int) - Filter theo brand
- `category_id` (int) - Filter theo category
- `status` (string) - Filter theo status: active, discontinued, draft

**Request:**
```bash
curl "http://localhost:5000/api/products?page=1&limit=20&search=cisco" \
  -H "Authorization: Bearer <token>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": 1,
        "brand_id": 1,
        "category_id": 2,
        "name": "Cisco Catalyst 2960",
        "part_number": "WS-C2960-24TT-L",
        "unit": "Cái",
        "price": 3500000,
        "vat_rate": 0.1,
        "status": "active",
        "description": "Switch 24 cổng",
        "spec": "Layer 2, 24 ports",
        "created_at": "2026-05-14T10:00:00Z",
        "updated_at": "2026-05-14T10:00:00Z",
        "brand": { "id": 1, "name": "Cisco Systems", ... },
        "category": { "id": 2, "name": "Switch", ... }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

---

### POST /products

Tạo sản phẩm mới (Admin/Technical).

**Request:**
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "brand_id": 1,
    "category_id": 2,
    "name": "Cisco Catalyst 2960",
    "part_number": "WS-C2960-24TT-L",
    "unit": "Cái",
    "price": 3500000,
    "vat_rate": 0.1,
    "status": "active",
    "description": "Switch 24 cổng",
    "spec": "Layer 2, 24 ports"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "brand_id": 1,
    "category_id": 2,
    "name": "Cisco Catalyst 2960",
    "part_number": "WS-C2960-24TT-L",
    "unit": "Cái",
    "price": 3500000,
    "vat_rate": 0.1,
    "status": "active",
    "description": "Switch 24 cổng",
    "spec": "Layer 2, 24 ports",
    "created_by": 1,
    "created_at": "2026-05-14T10:00:00Z",
    "updated_at": "2026-05-14T10:00:00Z"
  }
}
```

---

## POMs Endpoints

### POST /poms

Tạo POM mới.

**Request:**
```bash
curl -X POST http://localhost:5000/api/poms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "solution_id": 1,
    "project_name": "Dự án LAN văn phòng XYZ",
    "customer_name": "Công ty ABC",
    "note": "Ghi chú thêm",
    "items": [
      {
        "product_id": 1,
        "quantity": 2,
        "unit_price": 3500000,
        "vat_rate": 0.1,
        "note": "Ghi chú item"
      }
    ]
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "pom_code": "POM-20260514-1234",
    "solution_id": 1,
    "created_by": 1,
    "project_name": "Dự án LAN văn phòng XYZ",
    "customer_name": "Công ty ABC",
    "status": "draft",
    "note": "Ghi chú thêm",
    "created_at": "2026-05-14T10:00:00Z",
    "updated_at": "2026-05-14T10:00:00Z",
    "items": [...]
  }
}
```

---

### POST /poms/:id/items

Thêm item vào POM.

**Request:**
```bash
curl -X POST http://localhost:5000/api/poms/1/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "product_id": 2,
    "quantity": 3,
    "unit_price": 2500000,
    "vat_rate": 0.1,
    "note": "Item thứ 2"
  }'
```

---

### PUT /poms/:id/status

Thay đổi status của POM.

**Request:**
```bash
curl -X PUT http://localhost:5000/api/poms/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "status": "submitted"
  }'
```

**Status values:** draft, submitted, reviewed, exported

---

## Surveys Endpoints

### POST /surveys

Tạo survey report mới.

**Request:**
```bash
curl -X POST http://localhost:5000/api/surveys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "pom_id": 1,
    "report_type": "LAN",
    "project_name": "Dự án LAN văn phòng XYZ",
    "customer_name": "Công ty ABC",
    "site_address": "123 Đường ABC, TP.HCM",
    "surveyor_name": "Nguyễn Văn A"
  }'
```

---

### POST /surveys/:id/items

Thêm item vào survey.

**Request:**
```bash
curl -X POST http://localhost:5000/api/surveys/1/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "product_id": 1,
    "product_name": "Cisco Catalyst 2960",
    "quantity_proposed": 2,
    "quantity_actual": 2,
    "unit": "Cái",
    "location": "Tầng 1",
    "condition_note": "Tình trạng tốt"
  }'
```

---

## Brandsendpoints

### GET /brands

Lấy danh sách brands.

**Query Parameters:**
- `search` (string) - Tìm kiếm theo name
- `is_active` (boolean) - Filter theo status

**Request:**
```bash
curl "http://localhost:5000/api/brands?is_active=true" \
  -H "Authorization: Bearer <token>"
```

---

### POST /brands

Tạo brand mới (Admin only).

**Request:**
```bash
curl -X POST http://localhost:5000/api/brands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Cisco Systems",
    "short_name": "Cisco",
    "country": "USA",
    "website": "https://cisco.com"
  }'
```

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error |

---

## Rate Limiting

Hiện tại không có rate limiting. Có thể thêm sau nếu cần.

---

## Pagination

Endpoints hỗ trợ pagination sử dụng:
- `page` (default: 1)
- `limit` (default: 20, max: 100)

Response trả về:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

## Sorting

Các endpoints sử dụng `created_at DESC` mặc định.

---

## CORS

Server được cấu hình CORS cho domain:
```
http://localhost:5173     (Electron dev server)
http://localhost:3000     (Optional web)
```

Thay đổi tại `.env` hoặc `src/app.ts`

---

**Last Updated:** May 14, 2026
