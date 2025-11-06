import axios from 'axios';
import { env } from '../config/env';

const baseURL = env.polyrouterBase || 'https://api.polyrouter.io/functions/v1';

export const poly = axios.create({
  baseURL,
  timeout: 12000,
  headers: {
    'X-API-Key': env.polyrouterKey || '',
    'Accept': 'application/json',
    'User-Agent': 'parlay-backend/0.1'
  }
});

// Simple in-memory cache and limiter
const TTL_MS = 10_000;
const prCache = new Map<string, { ts: number; data: any }>();
const prHits: number[] = [];

function cacheKey(path: string, params?: Record<string, any>) {
  const p = params ? JSON.stringify(Object.keys(params).sort().reduce((a: any, k) => { a[k] = params[k]; return a; }, {})) : '';
  return `${path}?${p}`;
}

function takeSlotOrThrow(): void {
  const now = Date.now();
  while (prHits.length && now - prHits[0] > 60_000) prHits.shift();
  if (prHits.length >= 9) {
    throw new Error('polyrouter_rate_limited');
  }
  prHits.push(now);
}

function getCached(path: string, params?: Record<string, any>) {
  const key = cacheKey(path, params);
  const ent = prCache.get(key);
  if (ent && Date.now() - ent.ts <= TTL_MS) return ent.data;
  return null;
}

function setCached(path: string, params: Record<string, any> | undefined, data: any) {
  const key = cacheKey(path, params);
  prCache.set(key, { ts: Date.now(), data });
}

export async function getPlatforms() {
  const path = '/platforms';
  const cached = getCached(path);
  if (cached) return cached;
  try {
    takeSlotOrThrow();
    const { data } = await poly.get(path);
    setCached(path, undefined, data);
    return data;
  } catch (err: any) {
    if (String(err?.message).includes('polyrouter_rate_limited') && cached) return cached;
    throw err;
  }
}

export async function searchV2(params: { q: string; platform?: string; limit?: number }) {
  const { q, platform = 'polymarket', limit = 10 } = params;
  const path = '/search-v2';
  const cached = getCached(path, { q, platform, limit });
  if (cached) return cached;
  try {
    takeSlotOrThrow();
    const { data } = await poly.get(path, { params: { q, platform, limit } });
    setCached(path, { q, platform, limit }, data);
    return data;
  } catch (err: any) {
    if (String(err?.message).includes('polyrouter_rate_limited') && cached) return cached;
    throw err;
  }
}

export async function marketsV2(params: Record<string, any> = {}) {
  const path = '/markets-v2';
  const cached = getCached(path, params);
  if (cached) return cached;
  try {
    takeSlotOrThrow();
    const { data } = await poly.get(path, { params });
    setCached(path, params, data);
    return data;
  } catch (err: any) {
    if (String(err?.message).includes('polyrouter_rate_limited') && cached) return cached;
    throw err;
  }
}

export async function eventsV2(params: Record<string, any> = {}) {
  const path = '/events-v2';
  const cached = getCached(path, params);
  if (cached) return cached;
  try {
    takeSlotOrThrow();
    const { data } = await poly.get(path, { params });
    setCached(path, params, data);
    return data;
  } catch (err: any) {
    if (String(err?.message).includes('polyrouter_rate_limited') && cached) return cached;
    throw err;
  }
}

export async function getMarketById(marketId: string) {
  const data = await marketsV2({ id: marketId, platform: 'polymarket', limit: 5 });
  const list = Array.isArray(data?.markets) ? data.markets : [];
  const hit = list.find((m: any) => String(m.id) === marketId || String(m.platform_id) === marketId) || list[0];
  return hit || null;
}

export async function findFirstMarketWithClobIds(query: string) {
  const data = await searchV2({ q: query, platform: 'polymarket', limit: 10 });
  const items: any[] = Array.isArray(data?.markets) ? data.markets : (Array.isArray(data?.results) ? data.results : []);
  for (const m of items) {
    const clobs = m?.metadata?.clobTokenIds;
    if (Array.isArray(clobs) && clobs.length) return m;
  }
  return null;
}
