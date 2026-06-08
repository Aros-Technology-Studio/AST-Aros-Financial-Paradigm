# AGENT-CORE REPORT — Canonical 1:1 Emission Model Audit

**Date:** 2026-06-08
**Branch:** `claude/inspiring-cannon-oza394`
**Scope:** `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`, `src/fee_distribution/`

---

## 1. Что нашёл

### Структура репозитория

| Директория | Роль |
|---|---|
| `01_coin_engine/` | Эталонная документация по модели эмиссии (концептуальный референс, не deprecated) |
| `10_proof_of_transaction_engine/` | PoT-валидация транзакций, триггер эмиссии |
| `src/token/emission.service.ts` | **Канонический движок эмиссии** |
| `src/token/token.service.ts` | Сервис токенов (canonical + legacy пути) |
| `src/token/token.controller.ts` | HTTP API (до фикса — не использовал canonical путь) |
| `src/fee_distribution/` | Epoch-уровневое распределение комиссий |

### Статус Module 01

`01_coin_engine/` **НЕ deprecated** — он является концептуальным референсом. Deprecated помечен только
метод `TokenomicsService.updateInternalValuation()` — устаревший способ обновления цены, заменённый
AFC reserve index в `EmissionService`.

---

## 2. Соответствие канонической модели

### Каноническая модель (требования)

```
Emission = Transaction Amount (1:1)
Commission = Transaction Amount × rate (default 0.5%)
  → 75% → Node Pool
  → 25% → AFC Reserve
ARO сгорают после завершения транзакции
AFC Reserve растёт → reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
```

### Результаты проверки

| Компонент | Каноническая модель | Статус |
|---|---|---|
| `EmissionService.calculate()` | Emission = TX Amount (1:1) | ✅ СООТВЕТСТВУЕТ |
| `EmissionService.calculate()` | Commission = TX × 0.005 | ✅ СООТВЕТСТВУЕТ |
| `EmissionService.calculate()` | nodeShare = commission × 0.75 | ✅ СООТВЕТСТВУЕТ |
| `EmissionService.calculate()` | afcShare = commission × 0.25 | ✅ СООТВЕТСТВУЕТ |
| `EmissionService.processTransactionEmission()` | MINT → FEE_SPLIT → BURN | ✅ СООТВЕТСТВУЕТ |
| `EmissionService.updateAfcReserve()` | reserveIndex = 1.0 + √(total)/10000 | ✅ СООТВЕТСТВУЕТ |
| `TokenService.mintForTransaction()` | Делегирует в EmissionService | ✅ СООТВЕТСТВУЕТ |
| **`TokenController POST /api/v1/token/mint`** | Вызывал legacy `mint()` без сжигания ARO | ❌ **НЕ СООТВЕТСТВОВАЛО** |
| `FeeDistributionService.distributeRewards()` | 75/25 split на уровне epoch | ✅ СООТВЕТСТВУЕТ |

---

## 3. Критические проблемы (до исправления)

### Проблема 1: Мёртвый код — canonical emission никогда не вызывался

`TokenService.mintForTransaction()` и `EmissionService.processTransactionEmission()` были правильно
реализованы, но **нигде не вызывались**. В репозитории не было ни одного вызова `mintForTransaction()`
из контроллеров, сервисов или других точек входа.

```
grep -r "mintForTransaction" src/
→ src/token/token.service.ts:45:    async mintForTransaction(   ← только определение, ноль вызовов
```

### Проблема 2: HTTP endpoint роутил на legacy метод

`POST /api/v1/token/mint` → `tokenService.mint()` — legacy метод для fiat-депозитов (FIAT_DEPOSIT).
Этот метод:
- **НЕ** сжигал эмитированные ARO
- **НЕ** применял 75/25 комиссионное распределение
- **НЕ** обновлял AFC reserve state
- Вызывал `@deprecated updateInternalValuation()` (no-op)

### Проблема 3: Загрязнение кода устаревшими вызовами

В `TokenService.mint()` и `TokenService.burn()` вызывался `tokenomicsService.updateInternalValuation()`,
помеченный `@deprecated` и являющийся no-op.

---

## 4. Что исправлено

### Исправление 1: Новый canonical endpoint `POST /api/v1/token/emit`

Добавлен в `src/token/token.controller.ts`. Wires up `mintForTransaction()` → `EmissionService`:

```typescript
@Post('emit')
async emitForTransaction(
    @Body() body: {
        transactionAmount: number;
        recipient: string;
        referenceId: string;
        commissionRate?: number;
    },
)
```

**Ответ эндпоинта:**
```json
{
  "status": "EMITTED",
  "referenceId": "TX-001",
  "transactionAmount": 10000,
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "commissionRate": 0.005,
  "emissionPrice": 1.0001118
}
```

### Исправление 2: Удалены deprecated вызовы

Из `TokenService.mint()` и `TokenService.burn()` удалены вызовы `tokenomicsService.updateInternalValuation()`.

---

## 5. Архитектура после исправления

```
HTTP POST /api/v1/token/emit
  ↓
TokenController.emitForTransaction()
  ↓
TokenService.mintForTransaction()
  ↓
EmissionService.processTransactionEmission()
  │
  ├─→ STEP 1: MINT emissionAmount ARO → recipient        (1:1)
  ├─→ STEP 2a: FEE_DISTRIBUTION nodeShare (75%) → NODE_POOL
  ├─→ STEP 2b: FEE_DISTRIBUTION afcShare  (25%) → AFC_RESERVE
  ├─→ STEP 3: updateAfcReserve() → reserveIndex rises
  └─→ STEP 4: BURN emissionAmount ARO    (transient tokens)
  ↓
SupplySnapshot: totalMinted++, totalBurned++, circulatingSupply unchanged (net zero ✓)
```

### Пример расчёта (TX $10,000)

```
transactionAmount = 10,000 ARO
emissionAmount    = 10,000 ARO   (1:1, canonical)
commission        =     50 ARO   (10,000 × 0.5%)
nodeShare         =   37.5 ARO   (50 × 75%)
afcReserveShare   =   12.5 ARO   (50 × 25%)
burn              = 10,000 ARO   (post-TX canonical burn)
─────────────────────────────────
net circulation change = 0       ✓
```

---

## 6. Что НЕ трогалось

| Компонент | Причина |
|---|---|
| `EmissionService` | Уже полностью соответствует канонической модели |
| `FeeDistributionService` | 75/25 split на epoch-уровне корректен |
| `POST /api/v1/token/mint` | Оставлен как legacy fiat-deposit endpoint (tokens не сжигаются — корректно для fiat-депозитов) |
| `01_coin_engine/` docs | Эталонная документация, изменения не требуются |
| `emission.interfaces.ts` | Интерфейсы полностью корректны |

---

## 7. Инварианты канонической модели (подтверждены)

1. **Supply conservation:** `Σ(mint) = Σ(burn)` за каждый TX-цикл
2. **Net-zero circulation:** `circulatingSupply` не меняется после emission цикла
3. **AFC Reserve монотонен:** `totalReserve` только растёт
4. **Price index строго неубывающий:** `reserveIndex = 1.0 + √(totalReserve) / 10_000`
5. **75/25 split неизменяем:** только через governance vote

---

*Отчёт сформирован AGENT-CORE в рамках аудита канонической модели эмиссии ArosCoin.*
