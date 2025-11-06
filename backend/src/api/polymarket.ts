import axios from 'axios';
import { env } from '../config/env';

const api = axios.create({
  baseURL: env.polymarketApi,
  timeout: 12000,
  headers: {
    'User-Agent': 'parlay-backend/0.1 (+https://localhost)',
    'Accept': 'application/json'
  }
});

// CLOB: simple in-memory cache (10s) and soft rate limiter (~30 req/min)
const CLOB_TTL_MS = 10_000;
const clobCache = new Map<string, { ts: number; data: any }>();
const clobHits: number[] = [];

function clobKey(path: string, body?: any) {
  let b = '';
  if (body !== undefined) {
    try { b = JSON.stringify(body); } catch (_) { b = String(body); }
  }
  return `${path}:${b}`;
}

function clobTakeSlot() {
  const now = Date.now();
  while (clobHits.length && now - clobHits[0] > 60_000) clobHits.shift();
  if (clobHits.length >= 30) throw new Error('clob_rate_limited');
  clobHits.push(now);
}

function clobGet(path: string, body?: any) {
  const k = clobKey(path, body);
  const v = clobCache.get(k);
  if (v && Date.now() - v.ts <= CLOB_TTL_MS) return v.data;
  return null;
}

function clobSet(path: string, body: any, data: any) {
  const k = clobKey(path, body);
  clobCache.set(k, { ts: Date.now(), data });
}

export async function getBooksBatchByTokens(tokenIds: string[]): Promise<NormalizedBookWithMid[]> {
  if (!tokenIds.length) return [];
  const body = tokenIds.map((t) => ({ token_id: String(t) }));
  try {
    const cached = clobGet('POST:/books', body);
    if (cached) return cached;
    clobTakeSlot();
    const { data } = await api.post<any>('/books', body, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    const arr = Array.isArray(data) ? data : [data];
    const out = arr.map((raw: any) => {
      const bids = (raw?.bids || []).map((b: any) => ({ price: Number(b.price), size: Number(b.size) }));
      const asks = (raw?.asks || []).map((a: any) => ({ price: Number(a.price), size: Number(a.size) }));
      const bestBid = bids[0]?.price;
      const bestAsk = asks[0]?.price;
      const mid = (Number.isFinite(bestBid) && Number.isFinite(bestAsk))
        ? (Number(bestBid) + Number(bestAsk)) / 2
        : (Number.isFinite(bestBid) ? Number(bestBid) : (Number.isFinite(bestAsk) ? Number(bestAsk) : null));
      const spread = (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) ? Number(bestAsk) - Number(bestBid) : null;
      return {
        id: String(raw?.token_id || raw?.asset_id || ''),
        bids,
        asks,
        mid: mid as number | null,
        bestBid: Number.isFinite(bestBid) ? Number(bestBid) : null,
        bestAsk: Number.isFinite(bestAsk) ? Number(bestAsk) : null,
        spread: spread as number | null,
      } as NormalizedBookWithMid;
    });
    clobSet('POST:/books', body, out);
    return out;
  } catch (err) {
    return tokenIds.map((t) => ({ id: String(t), bids: [], asks: [], mid: null }));
  }
}

// Debug utility: return raw book payload
export async function getRawBook(tokenId: string): Promise<any> {
  try {
    const cache1 = clobGet('GET:/book', `token_id=${tokenId}`);
    if (cache1) return cache1;
    clobTakeSlot();
    const { data } = await api.get('/book', { params: { token_id: tokenId } });
    if (data && (data.bids?.length || data.asks?.length)) return data;
  } catch (_) {}
  try {
    const body = { token_ids: [tokenId] };
    const cache2 = clobGet('POST:/book', body);
    if (cache2) return cache2;
    clobTakeSlot();
    const { data } = await api.post('/book', body, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    const out = Array.isArray(data) ? data[0] : data;
    clobSet('POST:/book', body, out);
    return out;
  } catch (err) {
    return { error: String((err as any)?.message || err) };
  }
}

/**
 * Resolve a Polymarket event URL or raw id to a working identifier for CLOB (/books).
 * Strategy:
 * - If url contains ?tid=, try token_id first; if empty, try asset_id.
 * - If plain id provided, probe both token_id and asset_id via POST /books and pick the first non-empty.
 */
export async function resolveClobId(input: string): Promise<{ type: 'token' | 'asset' | null; id: string; hasBook: boolean }> {
  let id = input.trim();
  try {
    // Decode percent-encoded input if present
    let raw = input.trim();
    // strip accidental wrappers like [ ... ] or "..."
    if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);

    try { raw = decodeURIComponent(raw); } catch (_) {}
    // Fallback replace for common encodings if decode fails upstream
    raw = raw.replace('%3F', '?').replace('%26', '&');

    const u = new URL(raw);
    const tid = u.searchParams.get('tid');
    if (tid) id = tid;
  } catch (_) {
    // not a URL, treat as raw id
  }

  // Try token_id via /books
  try {
    const { data } = await api.post<any>('/books', [ { token_id: id } ], {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    const hit = Array.isArray(data) ? data[0] : data;
    const hasBook = !!(hit?.bids?.length || hit?.asks?.length);
    if (hasBook) return { type: 'token', id, hasBook };
  } catch (_) {}

  // Try asset_id via /books
  try {
    const { data } = await api.post<any>('/books', [ { asset_id: id } ], {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    const hit = Array.isArray(data) ? data[0] : data;
    const hasBook = !!(hit?.bids?.length || hit?.asks?.length);
    if (hasBook) return { type: 'asset', id, hasBook };
  } catch (_) {}

  // Fallback: try to scrape event page and extract ids
  try {
    let raw = input.trim();
    try { raw = decodeURIComponent(raw); } catch (_) {}
    raw = raw.replace('%3F', '?').replace('%26', '&');
    const page = await axios.get(raw, { headers: { 'User-Agent': 'parlay-backend/0.1' } });
    const html: string = String(page.data || '');
    const tokenIds = new Set<string>();
    const assetIds = new Set<string>();
    // token_id patterns
    for (const m of html.matchAll(/"token_id"\s*:\s*"(\d+)"/g)) tokenIds.add(m[1]);
    for (const m of html.matchAll(/token_id=([0-9]+)/g)) tokenIds.add(m[1]);
    // asset_id patterns
    for (const m of html.matchAll(/"asset_id"\s*:\s*"(\d+)"/g)) assetIds.add(m[1]);

    // Probe tokens via /books
    const probe = async (items: { token_id?: string; asset_id?: string }[]) => {
      if (!items.length) return null as any;
      try {
        const { data } = await api.post<any>('/books', items, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } });
        const arr = Array.isArray(data) ? data : [data];
        for (let i = 0; i < arr.length; i++) {
          const hit = arr[i];
          if (hit?.bids?.length || hit?.asks?.length) return hit;
        }
      } catch (_) {}
      return null;
    };

    const tokenItems = Array.from(tokenIds).map((t) => ({ token_id: t }));
    const assetItems = Array.from(assetIds).map((a) => ({ asset_id: a }));

    let hit = await probe(tokenItems);
    if (hit?.asset_id || hit?.token_id) {
      const foundId = String(hit.asset_id || hit.token_id);
      return { type: hit.token_id ? 'token' : 'asset', id: foundId, hasBook: true };
    }
    hit = await probe(assetItems);
    if (hit?.asset_id || hit?.token_id) {
      const foundId = String(hit.asset_id || hit.token_id);
      return { type: hit.token_id ? 'token' : 'asset', id: foundId, hasBook: true };
    }
  } catch (_) {}

  return { type: null, id, hasBook: false };
}
// Basic normalization types returned by our backend
export interface NormalizedMarket {
  id: string;
  question?: string;
  outcomes?: string[]; // e.g., ["YES","NO"]
  volume24h?: number;
  liquidity?: number;
  endDate?: string;
}

export interface NormalizedOrderbookLevel {
  price: number;
  size: number;
}

export interface NormalizedOrderbook {
  id: string;
  bids: NormalizedOrderbookLevel[]; // highest first
  asks: NormalizedOrderbookLevel[]; // lowest first
}

export interface NormalizedBookWithMid {
  id: string;
  bids: NormalizedOrderbookLevel[];
  asks: NormalizedOrderbookLevel[];
  mid: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  spread?: number | null;
}

// Helper to try multiple endpoint patterns (Polymarket paths can differ by version)
async function tryPaths<T>(paths: string[]): Promise<T> {
  let lastErr: any;
  for (const path of paths) {
    try {
      const { data } = await api.get<T>(path);
      console.debug('[polymarket] GET', path, 'ok');
      return data as T;
    } catch (err: any) {
      const code = err?.response?.status;
      console.debug('[polymarket] GET', path, 'err', code || err?.message);
      lastErr = err;
      continue;
    }
  }
  throw lastErr;
}

export async function listMarkets(): Promise<{ markets: NormalizedMarket[] }> {
  try {
    // Try common patterns
    const raw = await tryPaths<any>([
      '/markets', // e.g., { markets: [...] } or [...]
      '/api/markets',
      '/v1/markets',
    ]);

    const arr: any[] = Array.isArray(raw) ? raw : (raw?.markets ?? []);
    const markets: NormalizedMarket[] = arr.map((m: any) => ({
      id: String(m.id ?? m.market_id ?? m.slug ?? ''),
      question: m.question ?? m.title ?? m.name,
      outcomes: m.outcomes ?? (m.tokens ? m.tokens.map((t: any) => t.ticker || t.symbol) : undefined) ?? ['YES','NO'],
      volume24h: Number(m.volume24h ?? m.volume_24h ?? m.volume ?? 0) || undefined,
      liquidity: Number(m.liquidity ?? m.tvl ?? 0) || undefined,
      endDate: m.endDate ?? m.end_time ?? m.expires_at ?? undefined,
    })).filter((m) => m.id);

    return { markets };
  } catch (_err) {
    // Fallback empty to keep UI unblocked
    return { markets: [] };
  }
}

export async function getOrderbookWithType(id: string, type?: 'token' | 'asset'): Promise<NormalizedOrderbook> {
  try {
    let raw: any;
    if (type === 'token') {
      const cache = clobGet('GET:/book', `token_id=${id}`);
      if (cache) raw = cache; else { clobTakeSlot(); raw = await tryPaths<any>([`/book?token_id=${encodeURIComponent(id)}`]); clobSet('GET:/book', `token_id=${id}`, raw); }
    } else if (type === 'asset') {
      const cache = clobGet('GET:/book', `asset_id=${id}`);
      if (cache) raw = cache; else { clobTakeSlot(); raw = await tryPaths<any>([`/book?asset_id=${encodeURIComponent(id)}`]); clobSet('GET:/book', `asset_id=${id}`, raw); }
    } else {
      clobTakeSlot();
      raw = await tryPaths<any>([
        `/book?token_id=${encodeURIComponent(id)}`,
        `/book?asset_id=${encodeURIComponent(id)}`,
        `/markets/${id}/orderbook`,
        `/orderbook/${id}`,
        `/book?market=${encodeURIComponent(id)}`,
        `/api/markets/${id}/orderbook`,
      ]);
    }

    // Normalize typical shapes: { bids:[[price,size],...], asks:[[price,size],...] } or { bids:[{p,q}], asks:[{p,q}] }
    const mapLevels = (arr: any): NormalizedOrderbookLevel[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((lv: any) => {
        if (Array.isArray(lv) && lv.length >= 2) return { price: Number(lv[0]), size: Number(lv[1]) };
        if (lv && typeof lv === 'object') return { price: Number(lv.p ?? lv.price), size: Number(lv.q ?? lv.size) };
        return { price: NaN, size: NaN };
      }).filter((l: any) => Number.isFinite(l.price) && Number.isFinite(l.size));
    };

    const bids = mapLevels(raw.bids ?? raw.buy ?? raw.bid);
    const asks = mapLevels(raw.asks ?? raw.sell ?? raw.ask);

    // Sort to expected order
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return { id, bids, asks };
  } catch (_err) {
    return { id, bids: [], asks: [] };
  }
}

export async function getOrderbook(id: string): Promise<NormalizedOrderbook> {
  return getOrderbookWithType(id);
}
export async function getMarketPrice(id: string): Promise<{ id: string; price: number | null }> {
  try {
    const ob = await getOrderbook(id);
    const bestBid = ob.bids[0]?.price;
    const bestAsk = ob.asks[0]?.price;
    if (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) {
      return { id, price: (Number(bestBid) + Number(bestAsk)) / 2 };
    }
    if (Number.isFinite(bestBid)) return { id, price: Number(bestBid) };
    if (Number.isFinite(bestAsk)) return { id, price: Number(bestAsk) };
    return { id, price: null };
  } catch (_err) {
    return { id, price: null };
  }
}
