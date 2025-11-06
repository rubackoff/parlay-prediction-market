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

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'parlay-backend', ts: Date.now() });
});

app.use('/api', api);

const port = env.port;
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
});
