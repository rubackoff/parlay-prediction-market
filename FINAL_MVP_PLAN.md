# ПАРЛЕЙ PREDICTION MARKET: ПОЛНЫЙ ПЛАН РАЗРАБОТКИ MVP

## EXECUTIVE SUMMARY

Данный документ содержит **полную спецификацию, архитектуру и пошаговый план разработки** DeFi-приложения для торговли парлеями на рынках предсказаний поверх Polymarket и Kalshi.

### Ключевые метрики успеха:
- **Testnet MVP**: 12 недель разработки
- **Smart Contracts**: 6 основных контрактов (Solidity)
- **Backend**: Node.js + Ethers.js для интеграции с Polymarket
- **Frontend**: Vue.js 3 с Tailwind CSS
- **Ликвидность**: Hybrid AMM + Orderbook модель
- **Сетевой вывод**: Base Sepolia (testnet) → Base Mainnet (production)

---

## АРХИТЕКТУРА СИСТЕМЫ

### 1. СМАРТ-КОНТРАКТЫ (Solidity)

#### ParlayToken.sol (ERC-1155)
- Токенизирует парлей позиции как NFT
- Хранит: baseMarkets[], outcomes[], potentialPayout, expiryTime
- Функции: mintParlay(), resolveParlay(), getFairValue()

#### ParlayAMM.sol (LMSR)
- Логарифмический маркет-мейкер (Logarithmic Market Scoring Rule)
- Формула: C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))
- Гарантирует ликвидность, слипаж: <3% для малых объемов

#### ParlayOrderbook.sol (CLOB)
- Central Limit Order Book для P2P торговли
- Price-time priority, частичные выполнения
- Комиссии: 0.2% maker, 0.3% taker

#### ParlayRouter.sol
- Smart order routing между AMM и Orderbook
- Выбирает лучший venue автоматически
- Поддерживает splitting крупных ордеров

#### ParlayHedger.sol
- Интеграция с Polymarket для auto-hedging
- Ограничивает tail risk платформы <5% TVL
- Стоимость hedging: ~1% объема

#### ParlayInsurance.sol
- Insurance fund из 10% комиссий
- Защита от экстремальных событий
- Целевой уровень: 20% от TVL за 2 года

### 2. BACKEND (Node.js + TypeScript)

```
api/
  ├─ polymarket.ts       # Интеграция Polymarket API
  ├─ fairValue.ts        # Расчет справедливой стоимости
  └─ orderRouter.ts      # Оптимизация маршрутизации

services/
  ├─ blockchain.ts       # Ethers.js + провайдеры
  ├─ hedging.ts          # Управление hedging позициями
  ├─ priceFeeds.ts       # Chainlink оракулы
  └─ monitor.ts          # Мониторинг событий

utils/
  ├─ math.ts             # LMSR вычисления
  └─ cache.ts            # Redis кэш для цен
```

### 3. FRONTEND (Vue.js 3 + Tailwind)

```
components/
  ├─ ParleyBuilder/       # Конструктор парлеев
  ├─ PositionManager/     # Управление позициями
  ├─ OrderbookViewer/     # Визуализация ордербука
  └─ Dashboard/           # Лидерборд и статистика

pages/
  ├─ Dashboard.vue        # Главная
  ├─ Builder.vue          # Создание парлея
  ├─ Positions.vue        # Мои позиции
  └─ Markets.vue          # Поиск рынков

stores/
  ├─ user.ts             # Pinia: позиции, балансы
  ├─ markets.ts          # Данные Polymarket
  └─ contracts.ts        # Состояние контрактов
```

---

## 12-НЕДЕЛЬНЫЙ ПЛАН РАЗРАБОТКИ

### **НЕДЕЛЯ 1-2: ФУНДАМЕНТ**
- Setup Foundry + OpenZeppelin
- Develop ParlayToken.sol с тестами (90% coverage)
- Develop ParlayAMM.sol с LMSR калькулятором

### **НЕДЕЛЯ 3-4: ОРДЕРБУК И ROUTING**
- Implement ParlayOrderbook.sol
- Smart router с order splitting
- Integration tests

### **НЕДЕЛЯ 5-6: POLYMARKET INTEGRATION**
- ParlayHedger.sol с auto-hedging
- Backend API для fair value расчетов
- Integracija s Polymarket CLOB API

### **НЕДЕЛЯ 7-8: FRONTEND MVP**
- Vue.js app setup с Tailwind
- Parlay builder UI
- Position manager + orderbook viewer
- Dashboard с leaderboard

### **НЕДЕЛЯ 9-10: TESTING & SECURITY**
- End-to-end тесты (место → выход → разрешение)
- Slither анализ, manual code review
- Gas optimizations (<200k за транзакцию)

### **НЕДЕЛЯ 11: ДОКУМЕНТАЦИЯ И DEMO**
- Technical docs (natspec комментарии)
- User guide
- Live demo для инвесторов

### **НЕДЕЛЯ 12: LAUNCH & MONITORING**
- Deploy на Base Sepolia
- Verify контракты на Basescan
- Recruit 50-100 beta-тестеров
- Setup monitoring (TVL, DAU, volume)

---

## ЭКОНОМИЧЕСКАЯ МОДЕЛЬ

### Структура комиссий:
| Источник | % дохода | Пример (100k объема) |
|----------|----------|---------------------|
| AMM торговля | 0.3% | $300 |
| Orderbook торговля | 0.25% | $250 |
| Insurance fund | 10% от комиссий | -$55 |
| **Net platform** | **~0.25%** | **~$250/день** |

### LP APY:
- **Passive LP** (Tier 1): 6-9% (только комиссии)
- **Professional MM** (Tier 2): 25-30% (берут tail risk)

### Масштабирование:
- При $100k/day → $30k/year revenue
- При $1M/day → $300k/year revenue
- При $10M/day → $3M/year revenue

---

## VIBE CODING: PROMPTS ДЛЯ КАЖДОГО КОНТРАКТА

### PROMPT 1: ParlayToken.sol

```
Create a Solidity smart contract implementing ERC-1155 token standard 
for parlay positions.

STRUCTURE:
- Inherit from OpenZeppelin's ERC1155
- Use Ownable and ReentrancyGuard

DATA:
Each token represents:
- baseMarkets: array of Polymarket addresses
- outcomes: boolean array (true=YES, false=NO)
- potentialPayout: final payout amount
- expiryTimestamp: resolution time

FUNCTIONS:
1. mintParlay(baseMarkets[], outcomes[], stake) → tokenId
   - Create new parlay token
   - Collateralize with USDC
   - Emit ParlayCreated event

2. resolveParlay(tokenId) → payout
   - Admin only
   - Check all markets resolved
   - Pay out if all correct, else $0
   - Burn token

SAFETY:
- Prevent double resolution
- Use SafeTransferLib for USDC
- Check expiry before exit

REFERENCE: Uniswap v4 position management
Generate with >90% test coverage.
```

### PROMPT 2: ParlayAMM.sol

```
Create LMSR (Logarithmic Market Scoring Rule) AMM for parlay trading.

MATHEMATICAL MODEL:
Cost function: C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))
Where:
- b = 50000e18 (liquidity parameter)
- q_yes/no = cumulative quantities

Price to sell Δq tokens:
P = C(q) - C(q + Δq)
Simplified: P ≈ Fair_Value * (1 - (Δq/b) * 1.5)

STATE:
- pools: mapping(tokenId → Pool)
- Pool: {yesShares, noShares, lastUpdated}

FUNCTIONS:
1. getSellPrice(tokenId, quantity) → price (view)
2. sellToAMM(tokenId, quantity) → proceeds (0.3% fee)
3. getBuyPrice(tokenId, quantity) → price (view)
4. feeAccumulator: track total fees

SAFETY:
- Slippage bounds (max 50%)
- Prevent zero trades
- Reentrancy guard

REFERENCE: Compound interest rate model
Generate with numerical stability for fixed-point math.
```

### PROMPT 3: ParlayOrderbook.sol

```
Create Central Limit Order Book (CLOB) for P2P parlay trading.

DATA:
struct Order {
    uint256 orderId;
    address trader;
    uint256 tokenId;
    bool isBuy;           // true=bid, false=ask
    uint256 price;
    uint256 quantity;
    uint256 quantityFilled;
    uint256 timestamp;
}

- bids[tokenId]: array of bid orders (highest first)
- asks[tokenId]: array of ask orders (lowest first)

FUNCTIONS:
1. placeBid(tokenId, price, quantity) → orderId
   - Escrow USDC
   - Match immediately
   - Add to book if unmatched

2. placeAsk(tokenId, price, quantity) → orderId
   - Lock parlay tokens
   - Match immediately
   - Add to book if unmatched

3. cancelOrder(orderId)
   - Return escrowed assets

MATCHING ENGINE:
- Price-time priority
- Partial fills allowed
- Stop at price cross

FEES: 0.2% maker, 0.3% taker

REFERENCE: dYdX orderbook implementation
Optimize for gas efficiency.
```

### PROMPT 4: ParlayRouter.sol

```
Create smart router for optimal parlay exit execution.

LOGIC:
When user sells parlay:
1. Query AMM price
2. Query orderbook best bid
3. If bestBid > ammPrice:
     → Sell to orderbook (price improvement)
   Else if ammPrice available:
     → Sell to AMM (guaranteed)
   Else:
     → Revert

ADVANCED: Order splitting
If partial liquidity available:
- Sell to orderbook first
- Route remainder to AMM
- Return weighted average price

FUNCTIONS:
1. sellParlay(tokenId, quantity, minPrice) → (price, received)
2. getBestExecutionPrice(tokenId, quantity) → price (view)
3. queryAmmPrice(tokenId, quantity) → price (view)
4. queryOrderbookBid(tokenId) → price (view)

SAFETY:
- Slippage protection
- Min price validation
- Handle both venues unavailable

Generate with gas-optimized routing logic.
```

---

## DEVELOPMENT TOOLS

### Smart Contracts:
```bash
# Use Foundry (не Hardhat!)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Dependencies
forge install openzeppelin/openzeppelin-contracts
```

### Backend:
```bash
npm install ethers axios express cors typescript ts-node
npm install --save-dev @types/node jest ts-jest
```

### Frontend:
```bash
npm create vite@latest . -- --template vue-ts
npm install tailwindcss pinia wagmi ethers recharts
```

---

## BASE SEPOLIA DEPLOYMENT

### Network Details:
- **Chain ID**: 84532
- **RPC**: https://sepolia.base.org
- **Explorer**: base-sepolia.blockscout.com
- **Faucet**: https://docs.base.org/tools/network-faucets/

### USDC Test Address:
```
0x1c7D4B196Cb0C6f48415470d3ad3B9536FC9cC81 (mock USDC on Base Sepolia)
```

### Deployment Commands:
```bash
# Build
forge build

# Deploy
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://base-sepolia.blockscout.com/api
```

---

## KEY SUCCESS METRICS (TESTNET)

1. **Smart Contract Metrics**:
   - Gas per transaction: <200k
   - Test coverage: >90%
   - Uptime: >99.5%
   - Security audit: ✓ passed

2. **User Metrics**:
   - Daily Active Users: 50-100 (beta)
   - Avg position size: $500-1000
   - Cash-out rate: 30-40%
   - Win rate: 40-45%

3. **Platform Metrics**:
   - TVL: $100k-500k
   - Total volume: $1M+ (first month)
   - LP APY: 6-9% (passive)
   - Fair value accuracy: >99%

---

## ПЕРЕХОД НА MAINNET

### Phase Progression:
1. **Weeks 1-12**: Testnet MVP
2. **Weeks 13-16**: Testnet expansion (3-5 leg, 50+ markets)
3. **Weeks 17-20**: Security audit, insurance fund setup
4. **Week 21+**: Mainnet launch

### Pre-Mainnet Requirements:
- ✓ Formal smart contract audit (Certik/OpenZeppelin)
- ✓ $500k insurance fund initialized
- ✓ Professional market makers recruited
- ✓ Liquidity bootstrapping complete
- ✓ Regulatory compliance confirmed

---

## ФАЙЛЫ В РЕПОЗИТОРИИ

Generated documents (см. previous outputs):
1. **final_product_specification.txt** - 40+ страниц спецификации
2. **implementation_checklist.txt** - Чек-лист разработки
3. **parlay_exit_models_comparison.csv** - Сравнение моделей выхода
4. **amm_stress_test.csv** - Результаты стресс-тестов
5. **lp_models_comparison.csv** - Анализ экономических моделей

---

## NEXT STEPS

### Сейчас:
1. [ ] Create GitHub repository
2. [ ] Setup development environment (Foundry, Node, Vue)
3. [ ] Fork OpenZeppelin contracts locally

### На этой неделе:
1. [ ] Write ParlayToken.sol using Vibe Coding
2. [ ] Generate comprehensive tests
3. [ ] Submit code for security review

### На следующей неделе:
1. [ ] Deploy ParlayToken.sol to Base Sepolia
2. [ ] Write ParlayAMM.sol
3. [ ] Create backend API wrapper

### Более детальный прогресс:
- Следуйте 12-недельному плану выше
- Используйте Vibe Coding с максимальной специфичностью в prompts
- **НИКОГДА** не деплойте аудированный смарт-контракт mainnet

---

## КОНТАКТЫ И РЕСУРСЫ

### Документация:
- [Polymarket CLOB API](https://docs.polymarket.com)
- [Base Network Docs](https://docs.base.org)
- [Foundry Book](https://book.getfoundry.sh)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)

### Инструменты:
- Foundry: https://github.com/foundry-rs/foundry
- Base Faucet: https://docs.base.org/tools/network-faucets
- Vibe Coding Guide: https://audita.io/blog-articles/vibe-coding-smart-contracts

### Community:
- Polymarket Docs: https://docs.polymarket.com
- Base Discord: https://discord.gg/buildbase
- Foundry Discord: https://t.me/foundry_rs

---

**Document Version**: 1.0  
**Last Updated**: November 3, 2025  
**Status**: Ready for Development
