# Журнал проекта: Parlay Prediction Market

Обновлено: 2025-11-06 14:49 (UTC+03)

## Глобальные цели
- Интеграция Polymarket/Kalshi: корректный резолв CLOB id и получение стаканов/цен.
- Backend API: устойчивые эндпоинты с fallback, батчингом, кэшем, rate-limit.
- Frontend: отображение рынков, книг, сборка парлеев, расчёт fair value.
- Инфраструктура: удобный дев‑цикл (порты/скрипты), готовность к деплою.

## Текущий прогресс
- Подключён Polyrouter (ключ в .env), проверен `/api/polyrouter/platforms`.
- Добавлены passthrough‑эндпоинты:
  - GET `/api/polyrouter/markets-v2`
  - GET `/api/polyrouter/events-v2`
  - GET `/api/polyrouter/search` и `/api/polyrouter/search-v2`
- Добавлен сервис для извлечения CLOB `token_id`:
  - GET `/api/polyrouter/clob-ids?market_id=...` → `{ market_id, title, event_id, clobTokenIds, outcomes }`
- Усилен резолвер `/api/resolve` (обработка percent‑encoded URL и fallback через HTML‑парсинг).
- Проверен end‑to‑end: `clobTokenIds` → `/api/market/:id/orderbook?type=token` и `/price?type=token` (mid ok).

## Завершённые задачи
- [x] Интеграция Polyrouter клиента и конфигов.
- [x] Тест‑роут `/api/polyrouter/platforms`.
- [x] Роуты markets/events/search.
- [x] Роут `/api/polyrouter/clob-ids?market_id=`.
- [x] Исправление вложенности роутов (скобки), перезапуск, валидация.

## Ближайшие приоритеты
- [x] Расширить `/api/resolve` для входов `market_id`/`event_slug` → выдавать рабочие `token_id` (через Polyrouter), fallback CLOB/HTML.
- [x] Добавить `POST /api/books` для батча `token_ids`/`market_id` → стаканы + mid/спред/лучшие котировки.
- [x] Ввести простой rate‑limit и LRU‑кэш 5–10с для Polyrouter/CLOB.

## Новые эндпоинты и примеры
- Resolve:
  - `GET /api/resolve?market_id=516725`
  - `GET /api/resolve?event_slug=fed%20rate%20hike%20in%202025`
- Батч книг:
  - `POST /api/books` — тело: `{ "market_id": 516725 }` или `{ "token_ids": ["<TOKEN_ID>", "<TOKEN_ID>"] }`
  - Ответ: `books[]` с полями `id, bids, asks, mid, bestBid, bestAsk, spread`

## Точки контроля и тесты
- Здоровье: `GET /health`.
- Polyrouter:
  - `GET /api/polyrouter/platforms`
  - `GET /api/polyrouter/markets-v2?platform=polymarket&status=open&limit=20`
  - `GET /api/polyrouter/events-v2?platform=polymarket&limit=10`
  - `GET /api/polyrouter/clob-ids?market_id=516725`
- Книги/цены:
  - `GET /api/market/<token_id>/orderbook?type=token`
  - `GET /api/market/<token_id>/price?type=token`

## Деплой (тестнет, PaaS)

- Backend (Render):
  - Файлы: `backend/Dockerfile`, `.dockerignore`, корневой `render.yaml`.
  - Переменные окружения:
    - `PORT=3002`
    - `POLYMARKET_API=https://clob.polymarket.com`
    - `POLYROUTER_BASE=https://api.polyrouter.io/functions/v1`
    - `POLYROUTER_API_KEY=<SECRET>`
  - Чек: `/health`, `/api/resolve?market_id=516725`, `POST /api/books {"market_id":516725}`

- Frontend (Netlify):
  - Файл: `frontend/netlify.toml`
  - Build: `npm ci && npm run build`, Publish: `dist`
  - Env: `VITE_API_BASE=https://<backend-host>`
  - Чек: открыть главную, блок "Debug: Resolve & Books"

## Заметки
- `tid` из UI Polymarket ≠ CLOB `token_id`. Используем Polyrouter `metadata.clobTokenIds`.
- Держим лимит Polyrouter: 10 req/min. Будет добавлен кэш/бекофф.
- Для нестандартных событий включён HTML‑fallback в резолвере.
