# UNI-POM REST API Server

REST API Server cho ứng dụng UNI-POM (Electron + React).

**Tech Stack:**
- Node.js + Express
- Prisma ORM
- PostgreSQL (Supabase)
- JWT Authentication
- TypeScript

---

## 🚀 Quick Start

### 1️⃣ Setup Environment

```bash
cd server

# Copy .env.example to .env
cp .env.example .env

# Edit .env với thông tin Supabase
# DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[database]
# JWT_SECRET=your-secret-key
```

**Database URL Format từ Supabase:**
```
postgresql://postgres:[PASSWORD]@db.[SUPABASE_ID].supabase.co:5432/postgres
```

Lấy thông tin tại Supabase Dashboard → Project Settings → Database

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Setup Prisma & Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Sync database schema (không tạo migration)
npm run prisma:push

# (Optional) Run migrations if you have .sql files
npm run prisma:migrate
```

### 4️⃣ Run Development Server

```bash
npm run dev
```

Server sẽ chạy tại: `http://localhost:5000`

### 5️⃣ Test API

```bash
# Health check
curl http://localhost:5000/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"CHANGE_ME"}'
```

---

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` — Đăng nhập
- `POST /api/auth/change-password` — Đổi mật khẩu
- `GET /api/auth/me` — Thông tin user hiện tại

### Users (Admin only)
- `GET /api/users` — Lấy danh sách users
- `GET /api/users/:id` — Chi tiết user
- `POST /api/users` — Tạo user
- `PUT /api/users/:id` — Cập nhật user
- `DELETE /api/users/:id` — Xóa user

### Products
- `GET /api/products` — Lấy danh sách sản phẩm (có pagination, search, filter)
- `GET /api/products/:id` — Chi tiết sản phẩm
- `POST /api/products` — Tạo sản phẩm (admin/technical)
- `PUT /api/products/:id` — Cập nhật sản phẩm
- `DELETE /api/products/:id` — Xóa sản phẩm

### POMs
- `GET /api/poms` — Danh sách POM (filter by status, created_by)
- `GET /api/poms/:id` — Chi tiết POM + items
- `POST /api/poms` — Tạo POM mới
- `PUT /api/poms/:id` — Cập nhật POM
- `PUT /api/poms/:id/status` — Thay đổi status
- `DELETE /api/poms/:id` — Xóa POM
- `POST /api/poms/:id/items` — Thêm item vào POM
- `PUT /api/poms/items/:itemId` — Cập nhật POM item
- `DELETE /api/poms/items/:itemId` — Xóa POM item

### Survey Reports
- `GET /api/surveys` — Danh sách survey (filter by status)
- `GET /api/surveys/:id` — Chi tiết survey + items
- `POST /api/surveys` — Tạo survey mới
- `PUT /api/surveys/:id` — Cập nhật survey
- `DELETE /api/surveys/:id` — Xóa survey
- `POST /api/surveys/:id/items` — Thêm item vào survey
- `PUT /api/surveys/items/:itemId` — Cập nhật survey item
- `DELETE /api/surveys/items/:itemId` — Xóa survey item

### Brands
- `GET /api/brands` — Danh sách brands (search, filter)
- `GET /api/brands/:id` — Chi tiết brand
- `POST /api/brands` — Tạo brand (admin)
- `PUT /api/brands/:id` — Cập nhật brand
- `DELETE /api/brands/:id` — Xóa brand

### Categories
- `GET /api/categories` — Danh sách categories (search)
- `GET /api/categories/:id` — Chi tiết category
- `POST /api/categories` — Tạo category (admin)
- `PUT /api/categories/:id` — Cập nhật category
- `DELETE /api/categories/:id` — Xóa category

### Solutions
- `GET /api/solutions` — Danh sách solutions (search, filter)
- `GET /api/solutions/:id` — Chi tiết solution
- `POST /api/solutions` — Tạo solution (admin)
- `PUT /api/solutions/:id` — Cập nhật solution
- `DELETE /api/solutions/:id` — Xóa solution

---

## 🔐 Authentication

### JWT Token

Tất cả endpoints (trừ `/api/auth/login`) yêu cầu JWT token trong header:

```bash
Authorization: Bearer <token>
```

**Lấy token:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "CHANGE_ME"
  }'
```

**Response:**
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

### Roles & Permissions

- **admin**: Có quyền truy cập tất cả endpoints, CRUD users, brands, categories, solutions
- **sales**: CRUD POMs, xem products
- **technical**: CRUD POMs, CRUD products, tạo survey

---

## 📁 Project Structure

```
server/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── controllers/           # Business logic
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── products.ts
│   │   ├── poms.ts
│   │   ├── surveys.ts
│   │   ├── brands.ts
│   │   ├── categories.ts
│   │   └── solutions.ts
│   ├── routes/               # API routes
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── products.ts
│   │   ├── poms.ts
│   │   ├── surveys.ts
│   │   ├── brands.ts
│   │   ├── categories.ts
│   │   └── solutions.ts
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts          # JWT authentication
│   │   └── errorHandler.ts  # Error handling
│   ├── utils/               # Helper functions
│   │   ├── jwt.ts           # JWT utilities
│   │   ├── password.ts      # Password hashing
│   │   └── response.ts      # Response formatting
│   ├── app.ts               # Express setup
│   └── server.ts            # Entry point
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── .env                      # Environment variables
```

---

## 🔧 Available Scripts

```bash
# Development
npm run dev                 # Run with hot reload

# Production
npm run build              # Compile TypeScript
npm start                  # Run compiled app

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations
npm run prisma:push        # Sync schema
npm run prisma:studio      # Open Prisma Studio UI

# Code quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

---

## 🚀 Deployment on Render

### Steps:

1. **Create Render Service**
   - Connect GitHub repo
   - Select Node.js environment
   - Set root directory: `server/`

2. **Environment Variables** (Render Dashboard)
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=postgresql://[...]
   JWT_SECRET=your-strong-secret
   CORS_ORIGIN=https://your-app-domain.com
   ```

3. **Build Command**
   ```bash
   npm install && npm run build
   ```

4. **Start Command**
   ```bash
   npm start
   ```

5. **Deploy**
   - Click Deploy
   - Render sẽ automatically build & start server

**API URL trên Render:**
```
https://uni-pom-api.onrender.com
```

---

## 🐛 Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED
```
- Check `DATABASE_URL` env variable
- Verify IP whitelist trên Supabase (cho phép tất cả: 0.0.0.0/0)
- Test connection: `psql <DATABASE_URL>`

### JWT Error
```
Error: Invalid or expired token
```
- Ensure `Authorization: Bearer <token>` format
- Check token expiry: 24 hours
- Verify `JWT_SECRET` is same on server

### Prisma Schema Error
```
Error: The schema is not in sync with the database
```
```bash
npm run prisma:push        # Force sync
# hoặc
npm run prisma:migrate     # Create migration
```

---

## 📝 Default Credentials

Sau khi import migrations, các user mặc định:

| Username | Password  | Role      |
|----------|-----------|-----------|
| admin    | CHANGE_ME | admin     |
| sales01  | CHANGE_ME | sales     |
| tech01   | CHANGE_ME | technical |

**⚠️ IMPORTANT:** Đổi mật khẩu ngay sau khi setup!

```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "old_password": "CHANGE_ME",
    "new_password": "your-new-strong-password"
  }'
```

---

## 📞 Support

Nếu gặp lỗi:
1. Check `.env` configuration
2. Verify database connection
3. Review Prisma schema
4. Check network logs (curl/Postman)

---

**Happy Coding! 🎉**
