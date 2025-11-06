import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { api } from './api/routes';

const app = express();
app.use(cors());
app.use(express.json());

// Basic logger
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ 
    name: 'Parlay Prediction Market API',
    version: '0.1.0',
    status: 'running',
    endpoints: {
      health: '/health',
      resolve: '/api/resolve?market_id=516725',
      markets: '/api/markets',
      books: 'POST /api/books',
      polyrouter: '/api/polyrouter/platforms'
    }
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api', api);

const port = env.port;
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
});
