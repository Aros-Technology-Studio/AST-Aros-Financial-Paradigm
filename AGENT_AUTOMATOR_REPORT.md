# AGENT_AUTOMATOR_REPORT

**Дата:** 2026-05-12  
**Ветка:** `agent/self-healing-pipeline`  
**Автор:** AGENT-AUTOMATOR

---

## Что создано

### 1. `.github/workflows/auto-fix.yml` — Auto-Fix CI

**Назначение:** Автоматическое исправление кода при падении CI.

**Триггер:** Завершение workflow `AST CI` с результатом `failure`.

**Логика:**
1. Получает список упавших jobs через GitHub API.
2. Запускает `claude --print` с контекстом ошибок.
3. Claude читает связанные файлы, находит причину, исправляет код, запускает `npm run build && npm test`, коммитит и пушит.
4. Если Claude не может исправить — пишет `ESCALATE: [причина]`, workflow завершается с ошибкой.
5. При эскалации автоматически создаётся GitHub Issue с метками `needs-human` и `auto-fix-failed`.

**Агент-исполнитель:** `AGENT-FIXER` (git identity: `agent@aros.finance`)

---

### 2. `.github/workflows/agent-dispatcher.yml` — Agent Dispatcher

**Назначение:** Маршрутизация агентов по изменённым модулям в PR.

**Триггер:** Открытие или обновление Pull Request.

**Логика:**
1. Получает список изменённых файлов через GitHub API.
2. Определяет задействованные агенты по путям файлов:
   - `02_nodechain` → `AGENT-CHAIN`
   - `05_bridge` → `AGENT-BRIDGE`
   - `06_governance` → `AGENT-GOV`
   - `10_proof_of_transaction` → `AGENT-EMISSION`
   - Всегда добавляется `AGENT-TEST-INT` (интеграционное тестирование)
3. Запускает соответствующих агентов через Claude Code для проверки изменений.

---

### 3. `.github/workflows/nightly-audit.yml` — Nightly Audit

**Назначение:** Ежедневный ночной аудит всего репозитория.

**Триггер:** Cron `0 0 * * *` (полночь UTC) + ручной запуск (`workflow_dispatch`).

**Логика:**
1. `npm audit --audit-level=high` — проверка уязвимостей зависимостей.
2. `npm test -- --coverage` — полный прогон тестов с покрытием.
3. Claude проводит аудит по 7 пунктам:
   - TODO/FIXME/mock/заглушки
   - Completeness всех 14 модулей AFC
   - Модули без тестов или coverage < 80%
   - Security: hardcoded secrets, SQL injection risks
   - Архитектурные инварианты: non-custodial, role isolation, ArosCoin 1:1 emission
   - Генерация отчёта `reports/NIGHTLY_AUDIT_YYYYMMDD.md`
   - Создание GitHub Issue при критических проблемах
4. Отчёт загружается как артефакт GitHub Actions.

---

## Директория `reports/`

Создана директория `/reports/` для хранения ночных аудит-отчётов в формате `NIGHTLY_AUDIT_YYYYMMDD.md`.

---

## Архитектура Self-Healing Pipeline

```
CI падает
    ↓
auto-fix.yml (AGENT-FIXER)
    ↓
[исправлено?] → да → git push → CI зелёный
    ↓ нет
GitHub Issue (needs-human, auto-fix-failed)
```

```
PR открыт/обновлён
    ↓
agent-dispatcher.yml
    ↓
Детектирует модули → назначает агентов
    ↓
AGENT-CHAIN / AGENT-BRIDGE / AGENT-GOV / AGENT-EMISSION + AGENT-TEST-INT
```

```
Каждую ночь (00:00 UTC)
    ↓
nightly-audit.yml
    ↓
npm audit + npm test --coverage
    ↓
Claude: аудит 14 модулей AFC
    ↓
reports/NIGHTLY_AUDIT_YYYYMMDD.md
    ↓
[критично?] → GitHub Issue
```

---

## Требования

- GitHub Secret `ANTHROPIC_API_KEY` — уже добавлен в репозиторий.
- `GITHUB_TOKEN` — предоставляется GitHub Actions автоматически.
- Node.js 20 — используется во всех workflows.
- `@anthropic-ai/claude-code` — устанавливается в каждом job через `npm install -g`.
