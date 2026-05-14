# UNI-POM Server - Deployment Guide

## 📍 Deployment Options

### 1. **Render.com** (Recommended - Free tier available)
### 2. **Railway.app** (Alternative)
### 3. **Vercel** (Not recommended for databases)
### 4. **Self-hosted** (VPS)

---

## 🚀 Deploy to Render

### Prerequisites
- Render.com account (free)
- GitHub repository with server code
- Supabase project

### Step 1: Prepare GitHub Repository

```bash
# Ensure server folder is in GitHub
cd ..  # Go to project root
git add server/
git commit -m "Add REST API server"
git push origin main
```

### Step 2: Create Render Service

1. Go to [render.com](https://render.com)
2. Click **"New +" > "Web Service"**
3. Connect GitHub repository
4. Fill in details:
   - **Name:** `uni-pom-api`
   - **Region:** Singapore or Tokyo (for Asia)
   - **Branch:** main
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

### Step 3: Add Environment Variables

1. On Render dashboard, go to **Environment**
2. Add these variables:

```
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_ID.supabase.co:5432/postgres
JWT_SECRET=your-strong-secret-key-min-32-chars
CORS_ORIGIN=https://your-electron-app-domain.com
```

**Get DATABASE_URL from Supabase:**
- Supabase Dashboard > Project Settings > Database > Connection string > PostgreSQL
- Format: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will automatically deploy
3. Wait for build to complete (2-3 minutes)
4. Your API URL: `https://uni-pom-api.onrender.com`

### Step 5: Initialize Database

```bash
# Run migrations (if needed)
curl -X POST https://uni-pom-api.onrender.com/health
```

---

## 🚀 Deploy to Railway.app

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** > **"Deploy from GitHub"**
3. Select uni-pom repository

### Step 2: Configure Environment

1. Add environment variables:
   - `DATABASE_URL` (from Supabase)
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `CORS_ORIGIN`

### Step 3: Deploy

1. Click **"Deploy"**
2. Railway generates: `https://uni-pom-api-production.up.railway.app`

---

## 🔐 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a strong random value (32+ characters)
- [ ] Update `CORS_ORIGIN` with your actual Electron app domain
- [ ] Set `NODE_ENV=production`
- [ ] Run `npm run build` locally and verify no errors
- [ ] Test all API endpoints with production URL
- [ ] Set up database backups in Supabase
- [ ] Configure SSL/HTTPS (Render does this automatically)
- [ ] Monitor logs for errors
- [ ] Set up error tracking (Sentry.io - optional)

---

## 📊 Database Setup on Supabase

### Ensure IP Whitelist

1. Supabase Dashboard > Project Settings > Network
2. Set **"IP Whitelist"** to allow Render:
   - Add: `0.0.0.0/0` (allows all IPs)
   - Or add specific Render IP ranges

### Create Database Backups

1. Supabase Dashboard > Backups
2. Enable **"Automatic daily backups"**

---

## 🔍 Monitoring

### Check Deployment Status

**Render:**
```bash
curl https://uni-pom-api.onrender.com/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-14T10:00:00Z"
}
```

### View Logs

**Render Dashboard:**
- Select Service > Logs > View real-time logs

---

## 🚨 Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED
```

**Solution:**
1. Verify `DATABASE_URL` is correct
2. Check Supabase IP whitelist (should be 0.0.0.0/0)
3. Test connection: `psql <DATABASE_URL>`

### Build Failed

```
Error: npm install failed
```

**Solution:**
1. Check package.json syntax
2. Ensure node_modules/.gitignore exists
3. Clear Render cache and redeploy

### Prisma Issues

```
Error: The schema is not in sync
```

**Solution:**
1. Run `npm run prisma:push` before deployment
2. Or add to build command: `npm run prisma:push &&`

### CORS Error

```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**
1. Update `CORS_ORIGIN` in environment variables
2. Include protocol: `https://your-domain.com`

---

## 📈 Scaling Tips

- **Database:** Use Supabase's connection pooling (under 20 connections recommended)
- **API Rate Limiting:** Add rate limiter middleware
- **Caching:** Add Redis for frequently accessed data
- **CDN:** Use Cloudflare for API caching

---

## 💰 Cost Estimation (2026)

| Service | Tier | Price |
|---------|------|-------|
| Render | Free (first month) | Free → $7/month |
| Supabase | Free | Free (up to 500MB) |
| Electron App | N/A | Self-hosted |
| **Total** | | **~$7/month** |

---

## 📞 Support & Resources

- [Render Documentation](https://render.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Guide](https://expressjs.com/)

---

**Happy Deployment! 🎉**
