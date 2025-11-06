import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { listMarkets, getMarketPrice, getOrderbook, getRawBook, resolveClobId, getOrderbookWithType, getBooksBatchByTokens } from './polymarket';
import { getPlatforms, searchV2, marketsV2, eventsV2, getMarketById } from './polyrouter';
import { calculateFairValue } from '../services/fairValue';

export const api = Router();

// Simple in-memory cache for resolve results (TTL 60s)
const RESOLVE_TTL_MS = 60_000;
const resolveCache = new Map<string, { ts: number; data: any }>();
function rKey(q: any) {
  const k: any = {};
  ['market_id','event_slug','url','id'].forEach((f) => { if (q[f] !== undefined) k[f] = String(q[f]); });
  return JSON.stringify(k);
}
function rGet(q: any) {
  const key = rKey(q);
  const ent = resolveCache.get(key);
  if (ent && Date.now() - ent.ts <= RESOLVE_TTL_MS) return ent.data;
  return null;
}
function rSet(q: any, data: any) { resolveCache.set(rKey(q), { ts: Date.now(), data }); }

api.get('/markets', async (_req: Request, res: Response) => {
  try {
    const data = await listMarkets();
    res.json(data);
  } catch (err) {
    // Fallback stub to keep frontend unblocked
    res.json({ markets: [] });
  }
});

// Polyrouter markets-v2 passthrough
api.get('/polyrouter/markets-v2', async (req: Request, res: Response) => {
  try {
    const params: Record<string, any> = { ...req.query };
    if (!params.platform) params.platform = 'polymarket';
    const data = await marketsV2(params);
    res.json(data);
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter markets failed' });
  }
});

// Polyrouter events-v2 passthrough
api.get('/polyrouter/events-v2', async (req: Request, res: Response) => {
  try {
    const params: Record<string, any> = { ...req.query };
    if (!params.platform) params.platform = 'polymarket';
    const data = await eventsV2(params);
    res.json(data);
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter events failed' });
  }
});

// Polyrouter: get clobTokenIds and outcomes mapping for a market
api.get('/polyrouter/clob-ids', async (req: Request, res: Response) => {
  try {
    const marketId = String(req.query.market_id || '').trim();
    if (!marketId) return res.status(400).json({ error: 'market_id required' });

    // Try direct fetch by id, fallback to filtering
    const data = await marketsV2({ platform: 'polymarket', id: marketId, limit: 5 });
    const list = Array.isArray(data?.markets) ? data.markets : [];
    const hit = list.find((m: any) => String(m.id) === marketId || String(m.platform_id) === marketId) || list[0];
    if (!hit) return res.status(404).json({ error: 'market not found' });

    const clobTokenIds: string[] | null = hit?.metadata?.clobTokenIds || null;
    const outcomes = Array.isArray(hit?.outcomes) ? hit.outcomes : [];

    res.json({
      market_id: String(hit.platform_id || hit.id),
      title: hit.title,
      event_id: hit.event_id,
      clobTokenIds,
      outcomes,
    });
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter clob-ids failed' });
  }
});

// Polyrouter connectivity test
api.get('/polyrouter/platforms', async (_req: Request, res: Response) => {
  try {
    const data = await getPlatforms();
    res.json(data);
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter failed' });
  }
});

// Polyrouter search passthrough
api.get('/polyrouter/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const platform = (req.query.platform as string) || 'polymarket';
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    if (!q) return res.status(400).json({ error: 'q required' });
    const data = await searchV2({ q, platform, limit });
    res.json(data);
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter search failed' });
  }
});

// Alias
api.get('/polyrouter/search-v2', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const platform = (req.query.platform as string) || 'polymarket';
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    if (!q) return res.status(400).json({ error: 'q required' });
    const data = await searchV2({ q, platform, limit });
    res.json(data);
  } catch (err: any) {
    res.status(err?.response?.status || 500).json({ error: err?.message || 'polyrouter search failed' });
  }
});

// Resolve event URL or raw id to CLOB identifier
api.get('/resolve', async (req: Request, res: Response) => {
  try {
    const cached = rGet(req.query);
    if (cached) return res.json(cached);
    const marketId = req.query.market_id ? String(req.query.market_id).trim() : '';
    if (marketId) {
      const m = await getMarketById(marketId);
      if (!m) return res.status(404).json({ error: 'market not found' });
      const clobTokenIds: string[] | null = m?.metadata?.clobTokenIds || null;
      const outcomes = Array.isArray(m?.outcomes) ? m.outcomes : [];
      if (Array.isArray(clobTokenIds) && clobTokenIds.length) {
        const out = {
          type: 'token',
          id: String(clobTokenIds[0]),
          hasBook: true,
          market_id: String(m.platform_id || m.id),
          clobTokenIds,
          outcomes,
          title: m.title,
        };
        rSet(req.query, out);
        return res.json(out);
      }
      const out = { type: null, id: String(marketId), hasBook: false, market_id: String(marketId), clobTokenIds: null, outcomes };
      rSet(req.query, out);
      return res.json(out);
    }

    const eventSlug = req.query.event_slug ? String(req.query.event_slug).trim() : '';
    if (eventSlug) {
      // Try search-v2 to find a polymarket market with clobTokenIds
      const data = await searchV2({ q: eventSlug, platform: 'polymarket', limit: 10 });
      const items: any[] = Array.isArray((data as any)?.markets) ? (data as any).markets : (Array.isArray((data as any)?.results) ? (data as any).results : []);
      const m = items.find((x: any) => Array.isArray(x?.metadata?.clobTokenIds) && x.metadata.clobTokenIds.length);
      if (m) {
        const clobs: string[] = m.metadata.clobTokenIds;
        const outcomes = Array.isArray(m?.outcomes) ? m.outcomes : [];
        const out = {
          type: 'token',
          id: String(clobs[0]),
          hasBook: true,
          market_id: String(m.platform_id || m.id),
          clobTokenIds: clobs,
          outcomes,
          title: m.title,
        };
        rSet(req.query, out);
        return res.json(out);
      }
      const out = { type: null, id: eventSlug, hasBook: false };
      rSet(req.query, out);
      return res.json(out);
    }

    const input = String(req.query.url || req.query.id || '').trim();
    if (!input) return res.status(400).json({ error: 'url or id or market_id is required' });
    const out = await resolveClobId(input);
    rSet(req.query, out);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'resolve failed' });
  }
});

// Debug: raw Polymarket book by token id
api.get('/raw-book/:tid', async (req: Request, res: Response) => {
  try {
    const data = await getRawBook(req.params.tid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'failed' });
  }
});

api.get('/market/:id/price', async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as 'token' | 'asset' | undefined);
    if (type === 'token' || type === 'asset') {
      const ob = await getOrderbookWithType(req.params.id, type);
      const bestBid = ob.bids[0]?.price;
      const bestAsk = ob.asks[0]?.price;
      const price = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
        ? (Number(bestBid) + Number(bestAsk)) / 2
        : (Number.isFinite(bestBid) ? Number(bestBid) : (Number.isFinite(bestAsk) ? Number(bestAsk) : null));
      return res.json({ id: req.params.id, price });
    }
    const data = await getMarketPrice(req.params.id);
    res.json(data);
  } catch (err) {
    res.json({ id: req.params.id, price: null });
  }
});

api.get('/market/:id/orderbook', async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as 'token' | 'asset' | undefined);
    const data = type === 'token' || type === 'asset'
      ? await getOrderbookWithType(req.params.id, type)
      : await getOrderbook(req.params.id);
    res.json(data);
  } catch (err) {
    res.json({ id: req.params.id, bids: [], asks: [] });
  }
});

// Batch books endpoint
api.post('/books', async (req: Request, res: Response) => {
  try {
    const tokenIds: string[] | undefined = req.body?.token_ids;
    const marketId: string | undefined = req.body?.market_id;
    let ids: string[] = [];
    let mapping: Array<{ token_id: string; outcome_id?: string; outcome_name?: string }> | null = null;
    if (Array.isArray(tokenIds) && tokenIds.length) {
      ids = tokenIds.map(String);
    } else if (marketId) {
      const m = await getMarketById(String(marketId));
      const clobs: string[] | null = m?.metadata?.clobTokenIds || null;
      if (Array.isArray(clobs) && clobs.length) {
        ids = clobs.map(String);
        const outs: Array<{ id: string; name: string }> = Array.isArray(m?.outcomes) ? m.outcomes : [];
        // Формируем маппинг первый -> outcomes[0], второй -> outcomes[1] (как правило YES/NO)
        mapping = ids.map((tid, i) => ({ token_id: tid, outcome_id: outs[i]?.id, outcome_name: outs[i]?.name }));
      }
    }
    if (!ids.length) return res.status(400).json({ error: 'Provide token_ids[] or market_id with clobTokenIds' });
    const books = await getBooksBatchByTokens(ids);
    res.json({ books, mapping });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'books failed' });
  }
});

api.get('/fair-value', (req: Request, res: Response) => {
  try {
    // Parse simple query params
    const baseMarkets = (req.query.baseMarkets as string | undefined)?.split(',') ?? [];
    const outcomes = (req.query.outcomes as string | undefined)?.split(',').map(v => v === 'true') ?? [];
    const probs = (req.query.probs as string | undefined)?.split(',').map(Number);
    const covariance = req.query.covariance ? Number(req.query.covariance) : undefined;

    const result = calculateFairValue({ baseMarkets, outcomes, probs, covariance });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid parameters' });
  }
});

// Basic error handler
api.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message });
});
