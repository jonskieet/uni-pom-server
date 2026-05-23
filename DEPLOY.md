# Hướng dẫn Deploy — Module Custom Form Builder

## 1. Chạy Migration trên Supabase

Vào **Supabase Dashboard → SQL Editor**, paste và chạy file:
```
server/prisma/migrations/add_survey_form_templates.sql
```

---

## 2. Deploy Server lên Render

```bash
# Vào thư mục server
cd server

# Sinh Prisma client mới (có model SurveyFormTemplate)
npx prisma generate

# Build TypeScript
npm run build

# Push schema lên Supabase qua Prisma (nếu dùng prisma db push)
npx prisma db push

# Commit & push lên GitHub → Render tự deploy
git add -A
git commit -m "feat: add custom form builder module"
git push origin main
```

Render sẽ tự detect push và redeploy. Kiểm tra logs trên Render Dashboard.

---

## 3. Build Electron App (client)

```bash
# Thư mục gốc
cd ..  # hoặc cd uni-pom

npm install
npm run build        # build React
npm run electron:build  # đóng gói .exe/.dmg
```

---

## 4. Seed Template LAN mặc định (lần đầu)

Sau khi deploy xong, **đăng nhập bằng tài khoản technical_lead**, vào menu
**"Mẫu phiếu KS"** → bấm nút **"Tạo mẫu LAN mặc định"**.

Template Mạng LAN sẽ được tạo tự động với đầy đủ sections/fields.

---

## 5. Kiểm tra API mới

```bash
# Health check
curl https://<your-render-url>/health

# Lấy danh sách templates (cần JWT token)
curl https://<your-render-url>/api/form-templates \
  -H "Authorization: Bearer <token>"
```

---

## Tóm tắt các file đã thêm/sửa

| File | Loại |
|------|------|
| `server/prisma/schema.prisma` | Thêm model `SurveyFormTemplate` |
| `server/prisma/migrations/add_survey_form_templates.sql` | Migration SQL |
| `server/src/controllers/formTemplates.ts` | Controller CRUD mới |
| `server/src/routes/formTemplates.ts` | Routes mới |
| `server/src/app.ts` | Register route `/api/form-templates` |
| `electron/ipcHandlers.ts` | IPC handlers `formTemplates:*` |
| `electron/preload.ts` | Expose `api.formTemplates` |
| `src/types/index.ts` | Types: `FormSection`, `SurveyFormTemplate`, ... |
| `src/services/index.ts` | `FormTemplateService` |
| `src/pages/survey/DynamicFormRenderer.tsx` | Component render form động |
| `src/pages/survey/FormTemplateManager.tsx` | Trang quản lý template (lead) |
| `src/pages/survey/SurveyReportPage.tsx` | Viết lại dùng form động |
| `src/components/MainLayout.tsx` | Thêm menu "Mẫu phiếu KS" |
| `src/App.tsx` | Route `/lead-form-templates` |
