# AGENT CHAIN REPORT — NodeChain BFT Quorum Implementation

**Module:** 02 NodeChain Engine  
**Branch:** `agent/nodechain-quorum`  
**Commit:** `feat: real BFT quorum implementation for NodeChain`  
**Date:** 2026-05-12  

---

## Проблема

В `src/nodechain_engine/nodechain.service.ts` кворум симулировался — метод
`processProposedSnapshot` считал число валидаторов (строка 115), но никогда не
проверял, достаточно ли голосов «за». Каждый snapshot получал статус `FINALIZED`
независимо от реального согласия сети. Комментарий в коде прямо указывал на это:

```typescript
// Logic for voting simulation would go here...
```

`NodeEntity` не имел поля `nodeWeight`, а `Vote` не включал вес голосующего узла.

---

## Решение

### 1. Новое поле `nodeWeight` — `NodeEntity`

```
src/nodechain_engine/entities/node.entity.ts
```

Добавлена колонка `nodeWeight` (decimal 10,4, default 1.0). Вес отражает
«авторитет» узла в сети и используется при взвешенном кворуме.

### 2. Расширен интерфейс `Vote`

```
src/nodechain_engine/consensus.types.ts
```

Добавлено поле `nodeWeight: number` — вес узла на момент голосования.

### 3. `QuorumEngine` — новый сервис

```
src/nodechain_engine/quorum.engine.ts
```

Реализует реальный BFT-кворум:

| Метод | Формула | Описание |
|---|---|---|
| `computeCountThreshold(n)` | `q = ⌈2/3 × n⌉ + 1` | Порог по числу нод |
| `computeWeightThreshold(W)` | `qw = ⌈2/3 × W⌉ + 1` | Порог по суммарному весу |
| `computeMaxFaults(n)` | `f = ⌊(n−1) / 3⌋` | Макс. Byzantine-отказов |
| `isBftCompliant(n, f)` | `n ≥ 3f + 1` | Проверка BFT-соответствия |
| `evaluate(votes, n, W)` | — | Полная оценка кворума |

**Алгоритм `evaluate`:**

Кворум достигнут только при **одновременном** выполнении двух условий:
1. `approvedCount ≥ countThreshold` — достаточное число различных нод проголосовало «за»
2. `approvedWeight ≥ weightThreshold` — суммарный вес одобривших нод достаточен

Это исключает манипуляцию через одну «тяжёлую» ноду и через множество «лёгких».

### 4. `NodeChainService.processProposedSnapshot` — реальная проверка

```
src/nodechain_engine/nodechain.service.ts
```

Вместо заглушки:
- Загружаются все активные валидаторы из БД → `totalValidatorCount`, `totalValidatorWeight`
- Строится `weightMap` (voterId → nodeWeight) из **авторитетных данных БД**, 
  не из самоотчёта голосующего
- Объединяются голоса из snapshot и `pendingVotes`, дедуплицируются по `voterId`
- Вызывается `quorumEngine.evaluate(...)` 
- При недостатке кворума snapshot сохраняется со статусом `REJECTED` и выбрасывается ошибка
- При успехе — `FINALIZED`

### 5. Модуль обновлён

```
src/nodechain_engine/nodechain_engine.module.ts
```

`QuorumEngine` добавлен в `providers` и `exports`.

---

## Unit-тесты

```
src/nodechain_engine/quorum.engine.spec.ts
```

**Результат: 31/31 тестов прошли ✅**

### Покрытые сценарии

| Группа | Тестов |
|---|---|
| `computeCountThreshold` — формула q = ⌈2/3×n⌉+1 | 6 |
| `computeWeightThreshold` — взвешенный порог | 3 |
| `computeMaxFaults` — Byzantine fault tolerance | 5 |
| `isBftCompliant` — проверка n ≥ 3f+1 | 4 |
| `evaluate` — кворум достигнут | 3 |
| `evaluate` — кворум НЕ достигнут | 3 |
| `evaluate` — учёт NodeWeight | 5 |
| `evaluate` — граничные случаи | 2 |

### Ключевые кейсы NodeWeight

- **Тест 1:** 3 из 4 нод с высоким весом одобряют → кворум по весу ок, но не по счёту → `REJECTED`
- **Тест 2:** 4 из 4 (разные веса) → оба порога выполнены → `FINALIZED`
- **Тест 3:** 4 ноды с весом 0.1 → суммарный вес (0.4) ниже порога (2) → `REJECTED`
- **Тест 4:** 4 × 5.0 (тяжёлые) vs 4 × 0.5 (лёгкие) — разные исходы, 
  доказывая что `nodeWeight` действительно влияет на результат

---

## Изменённые файлы

```
src/nodechain_engine/quorum.engine.ts               (NEW)
src/nodechain_engine/quorum.engine.spec.ts          (NEW)
src/nodechain_engine/nodechain.service.ts           (MODIFIED)
src/nodechain_engine/nodechain_engine.module.ts     (MODIFIED)
src/nodechain_engine/consensus.types.ts             (MODIFIED)
src/nodechain_engine/entities/node.entity.ts        (MODIFIED)
```

---

## BFT Fault Tolerance Reference

| n (validators) | f (max faults) | q (quorum) |
|---|---|---|
| 4 | 1 | 4 |
| 7 | 2 | 6 |
| 10 | 3 | 8 |
| 13 | 4 | 10 |
| 16 | 5 | 12 |
