# Parlay Prediction Market

DeFi application for trading parlays on prediction markets (Polymarket, Kalshi).

## 🚀 Quick Deploy

### Backend (Render)
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Blueprint**
3. Connect repository: `https://github.com/rubackoff/parlay-prediction-market`
4. Render will detect `render.yaml` and create the service automatically
5. Add environment variable:
   - `POLYROUTER_API_KEY` = `pk_a297a6469f723c4ad1b2cb4453e36ea470ad79f021b1407f59e9649f7fb0bada`
6. Deploy! Your backend URL: `https://parlay-backend.onrender.com` (or similar)

**Test endpoints:**
- `GET /health`
- `GET /api/resolve?market_id=516725`
- `POST /api/books` with body `{"market_id":516725}`

### Frontend (Netlify)
1. Go to [Netlify](https://app.netlify.com/)
2. Click **Add new site** → **Import an existing project**
3. Connect repository: `https://github.com/rubackoff/parlay-prediction-market`
4. Configure:
   - Base directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Publish directory: `frontend/dist`
5. Add environment variable:
   - `VITE_API_BASE` = `https://parlay-backend.onrender.com` (your Render backend URL)
6. Deploy!

**Test:**
- Open your Netlify URL
- Use "Debug: Resolve & Books" section
- Try `market_id=516725` → see clobTokenIds and order books

## 📁 Project Structure

```
├── backend/          # Node.js + TypeScript API
│   ├── src/
│   │   ├── api/      # Polymarket, Polyrouter, routes
│   │   ├── services/ # Fair value calculation
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
├── frontend/         # Vue 3 + Vite
│   ├── src/
│   │   └── components/
│   │       └── DebugBooks.vue
│   ├── netlify.toml
│   └── package.json
├── render.yaml       # Render deployment config
└── docs/
    └── PROJECT_JOURNAL.md
```

## 🔧 Local Development

### Backend
```bash
cd backend
npm install
npm run dev:3002
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📝 Environment Variables

### Backend (.env)
```
PORT=3002
POLYMARKET_API=https://clob.polymarket.com
POLYROUTER_BASE=https://api.polyrouter.io/functions/v1
POLYROUTER_API_KEY=your_key_here
```

### Frontend
```
VITE_API_BASE=http://localhost:3002
```

## 📚 Documentation

- [Project Journal](docs/PROJECT_JOURNAL.md) - Development progress and notes
- [Polymarket CLOB API](https://docs.polymarket.com/)
- [Polyrouter API](https://docs.polyrouter.io/)

## 🎯 Current Features

- ✅ Polymarket integration via CLOB API
- ✅ Polyrouter integration for market discovery
- ✅ Market resolution by `market_id`, `event_slug`, or URL
- ✅ Batch order book fetching
- ✅ Price calculation (mid, bestBid, bestAsk, spread)
- ✅ In-memory caching (10-60s TTL)
- ✅ Rate limiting for API calls
- ✅ Debug UI for testing endpoints

## 🔜 Roadmap

- [ ] Parlay builder UI
- [ ] Fair value calculation with correlation
- [ ] Smart contract integration (Base Sepolia)
- [ ] Wallet connection
- [ ] Order placement

## 📄 License

MIT

## Packages
- contracts/: Foundry project skeleton
- backend/: Node.js + TypeScript API (health check only)
- frontend/: placeholder (to be bootstrapped)

## Getting Started
- See `contracts/foundry.toml` and `backend/README.md` (TBD)
