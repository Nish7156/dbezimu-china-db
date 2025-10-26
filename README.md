# China Backend - Deployment to Render

This is the China backend ready for deployment to Render.

## 🚀 Quick Deploy

### 1. Deploy to Render

1. Go to: https://dashboard.render.com
2. Click: "+ New" → "Web Service"
3. Connect this repository
4. Configure:
   - **Name**: `china-backend`
   - **Root Directory**: `.` (root)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2. Set Environment Variables

Add these in Render Dashboard → Environment:

```env
NODE_ENV=production
PORT=10000
REGION=china

DB_HOST=dpg-d3v19o3e5dus73a1ksg0-a.oregon-postgres.render.com
DB_PORT=5432
DB_NAME=china_db
DB_USER=china_db_user
DB_PASSWORD=7eBMnv0dSARcoZ8evAA4hvdwpXllIc3O

JWT_SECRET=your_strong_jwt_secret_here
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

API_KEY=your_strong_api_key_here

KAFKA_BROKER=31.97.232.235:9092

CORS_ORIGIN=*
```

Generate secrets:
```bash
# JWT_SECRET
openssl rand -hex 32

# API_KEY
openssl rand -hex 16
```

### 3. Database

Database is already initialized on Render:
- Host: `dpg-d3v19o3e5dus73a1ksg0-a.oregon-postgres.render.com`
- Database: `china_db`

## 🧪 Test After Deployment

```bash
# Health check
curl https://china-backend-xxxx.onrender.com/health

# Expected: {"status":"healthy","region":"china",...}
```

## 📊 Architecture

- **Database**: PostgreSQL on Render
- **Backend**: Node.js Express on Render
- **Kafka**: Connects to Hostinger Kafka (31.97.232.235:9092)
- **Sync**: Receives changes from India backend

## 📝 Endpoints

- `GET /health` - Health check
- `GET /api` - API info
- `POST /api/auth/login` - Login
- `GET /api/products` - Products (protected)
- `GET /api/sales` - Sales (protected)
- `GET /api/stats` - Statistics (protected)

## 🔗 Connected Services

- **India Backend**: http://31.97.232.235:3000
- **Kafka**: http://31.97.232.235:9092
- **Kafka UI**: http://31.97.232.235:8080

## 🐛 Troubleshooting

Check Render logs for:
- Database connection issues
- Kafka connection issues
- Application errors

---

**Status**: Ready for deployment 🚀

