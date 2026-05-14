# UNI-POM Server — Quick Start Guide

Hướng dẫn nhanh để setup và chạy REST API server cho UNI-POM.

---

## 📋 What Was Created

✅ **Hoàn toàn đầy đủ REST API server** với:
- Express.js + TypeScript
- Prisma ORM với PostgreSQL
- JWT Authentication
- CRUD endpoints cho: Users, Products, POMs, Surveys, Brands, Categories, Solutions
- Error handling & validation
- Production-ready configuration

---

## 🚀 Bắt Đầu Nhanh (5 phút)

### 1️⃣ Mở Terminal

```bash
cd server
```

### 2️⃣ Chạy Setup (Windows)

```bash
setup.bat
```

Hoặc (Mac/Linux):
```bash
bash setup.sh
```

Hoặc chạy từng bước:
```bash
npm install
npm run prisma:generate
```

### 3️⃣ Cấu Hình `.env`

Mở file `server/.env` và thay:

```ini
# Lấy từ Supabase Dashboard > Project Settings > Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_ID.supabase.co:5432/postgres

# Tạo secret ngẫu nhiên (32+ ký tự)
JWT_SECRET=your-super-secret-key-here-minimum-32-characters
```

### 4️⃣ Sync Database

```bash
npm run prisma:push
```

### 5️⃣ Chạy Server

```bash
npm run dev
```

✅ Server sẽ chạy tại: **http://localhost:5000**

---

## 🧪 Test API

### Login

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
    "token": "eyJhbGci...",
    "user": {
      "id": 1,
      "username": "admin",
      "full_name": "Quản trị viên",
      "role": "admin"
    }
  }
}
```

### Dùng Token để gọi các API khác

```bash
# Lấy danh sách sản phẩm
curl http://localhost:5000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📂 Cấu Trúc Thư Mục

```
server/
├── src/
│   ├── controllers/       # Business logic
│   ├── routes/           # API endpoints
│   ├── middleware/       # Authentication, errors
│   ├── utils/            # JWT, passwords, responses
│   ├── app.ts            # Express setup
│   └── server.ts         # Entry point
├── prisma/
│   └── schema.prisma     # Database schema
├── dist/                 # Compiled JS (after build)
├── package.json
├── tsconfig.json
├── .env                  # Configuration (bảo mật - không commit)
├── .env.example          # Template
├── README.md             # Full documentation
├── API.md                # API endpoints detail
├── DEPLOYMENT.md         # Deploy instructions
├── Dockerfile            # For Docker deployment
├── docker-compose.yml    # Docker compose
└── TEST_API.sh           # Test scripts
```

---

## 🔐 Default Credentials

Mặc định được tạo trong database:

| Username | Password  | Role      |
|----------|-----------|-----------|
| admin    | CHANGE_ME | admin     |
| sales01  | CHANGE_ME | sales     |
| tech01   | CHANGE_ME | technical |

⚠️ **Đổi mật khẩu ngay sau khi setup!**

```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "old_password": "CHANGE_ME",
    "new_password": "new_strong_password"
  }'
```

---

## 📚 API Endpoints Overview

### Authentication
- `POST /api/auth/login` — Đăng nhập
- `GET /api/auth/me` — Thông tin hiện tại
- `POST /api/auth/change-password` — Đổi mật khẩu

### Resources (CRUD)
- `/api/products` — Sản phẩm
- `/api/poms` — POM & items
- `/api/surveys` — Khảo sát & items
- `/api/brands` — Thương hiệu
- `/api/categories` — Danh mục
- `/api/solutions` — Giải pháp
- `/api/users` — Người dùng (admin only)

**Chi tiết tại:** [server/API.md](./API.md)

---

## 🛠️ Available Commands

```bash
# Development
npm run dev                 # Server với hot reload

# Production
npm run build              # Compile TypeScript
npm start                  # Run compiled app

# Database
npm run prisma:push        # Sync schema
npm run prisma:migrate     # Create migrations
npm run prisma:generate    # Generate client
npm run prisma:studio      # Open Prisma Studio

# Code quality
npm run lint               # ESLint check
npm run format             # Prettier format
```

---

## 🚀 Deploy to Production

### Render (Recommended)

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Click "New Web Service"
4. Connect GitHub repo
5. Set root directory to `server/`
6. Add environment variables
7. Deploy!

**Full guide:** [server/DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🔍 Troubleshooting

### "Cannot find module 'dotenv'"

```bash
npm install
```

### Database connection error

1. Check `.env` DATABASE_URL
2. Verify Supabase IP whitelist (0.0.0.0/0)
3. Test: `psql <DATABASE_URL>`

### Port already in use

```bash
# Change port in .env
PORT=5001
```

### Prisma schema out of sync

```bash
npm run prisma:push
```

---

## 📞 Need Help?

1. **Documentation:**
   - [README.md](./README.md) — Full setup guide
   - [API.md](./API.md) — API endpoints
   - [DEPLOYMENT.md](./DEPLOYMENT.md) — Deploy guide

2. **Test API:**
   - [TEST_API.sh](./TEST_API.sh) — cURL examples
   - Postman collection: (create from API.md)

3. **Common Issues:**
   - Check server logs: `npm run dev`
   - Review Supabase connection
   - Verify JWT_SECRET

---

## ✅ Next Steps

1. ✅ Setup và test API locally
2. ✅ Đổi mật khẩu default users
3. ✅ Deploy to Render
4. ✅ Update Electron app để gọi API
5. ✅ Test end-to-end

---

**Chúc bạn thành công! 🎉**

Need to connect Electron app? Check [../src/services/] for API client setup.
