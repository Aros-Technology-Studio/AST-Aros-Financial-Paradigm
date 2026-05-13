# AGENT_AUTOMATOR_REPORT

**Дата:** 2026-05-13
**Агент:** AGENT-AUTOMATOR
**Репозиторий:** AST-Aros-Financial-Paradigm
**Ветка:** `agent/self-healing-pipeline`

---

## Что создано

### 1. `.github/workflows/auto-fix.yml` — Auto-Fix CI (Self-Healing)

**Назначение:** Автоматически исправляет упавший CI без участия человека.

**Триггер:** `workflow_run` на workflow `"AST CI"` → `completed` (только при `conclusion: failure`).

**Логика:**
- Получает список упавших jobs и шагов через GitHub API (`listJobsForWorkflowRun`)
- Устанавливает `@anthropic-ai/claude-code`
- Запускает Claude (`--dangerously-skip-permissions`) с контекстом упавших jobs — агент читает код, находит причину, исправляет и пушит коммит `auto-fix: ...`
- При эскалации (агент не смог исправить) — создаёт GitHub Issue с лейблами `needs-human`, `auto-fix-failed`

**Переменные:**
- `ANTHROPIC_API_KEY` — из GitHub Secrets
- `GITHUB_TOKEN` — стандартный токен Actions

**Permissions:** `contents: write`, `issues: write`, `actions: read`

---

### 2. `.github/workflows/agent-dispatcher.yml` — Agent Dispatcher

**Назначение:** При открытии/обновлении PR определяет затронутые модули AFC и запускает специализированных агентов.

**Триггер:** `pull_request` → `[opened, synchronize]` (только не-draft PR)

**Матрица агентов:**

| Агент | Модуль | Условие запуска |
|-------|--------|-----------------|
| `AGENT-CHAIN` | `02_nodechain` | изменения в `02_nodechain/` |
| `AGENT-BRIDGE` | `05_bridge` | изменения в `05_bridge/` |
| `AGENT-GOV` | `06_governance` | изменения в `06_governance/` |
| `AGENT-EMISSION` | `10_proof_of_transaction` | изменения в `10_proof_of_transaction/` |
| `AGENT-TEST-INT` | все модули | запускается **всегда** на каждый PR |

**Permissions:** `contents: read`, `pull-requests: read`

---

### 3. `.github/workflows/nightly-audit.yml` — Nightly Audit

**Назначение:** Ежедневный автоматический аудит всего репозитория в 00:00 UTC.

**Триггер:** `schedule: cron '0 0 * * *'` + `workflow_dispatch` (ручной запуск)

**6 шагов аудита:**
1. `npm ci` — установка зависимостей
2. `npm audit --audit-level=high` — security проверка (не блокирует, `continue-on-error: true`)
3. `npm test -- --coverage` — полный тест-сьют с покрытием
4. Claude Nightly Audit — полная проверка:
   - Поиск TODO, FIXME, mock, заглушек
   - Completeness всех 14 модулей AFC
   - Выявление модулей без тестов / coverage < 80%
   - Security: hardcoded secrets, SQL injection
   - Архитектурные инварианты AFC (non-custodial, role isolation, ArosCoin 1:1 emission)
   - Генерация файла `reports/NIGHTLY_AUDIT_YYYYMMDD.md`
   - Критические проблемы → автоматический GitHub Issue
5. Загрузка отчёта как артефакт Actions (retention: default)

**Permissions:** `contents: write`, `issues: write`

---

## Архитектура Self-Healing Pipeline

```
Push/PR ──→ AST CI
               │
               ▼ (failure)
         auto-fix.yml
               │
         ┌─────┴──────┐
         │             │
    Fix applied    Claude ESCALATE
    (commit+push)       │
                   GitHub Issue
                   (needs-human, auto-fix-failed)

PR opened (non-draft) ──→ agent-dispatcher.yml
                                │
                          detect-changes
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
         AGENT-CHAIN      AGENT-BRIDGE        AGENT-GOV
         (02_nodechain)   (05_bridge)         (06_governance)
                                              AGENT-EMISSION
                                              (10_proof_of_tx)
                          + AGENT-TEST-INT (всегда)

00:00 UTC ──→ nightly-audit.yml
                   │
             6-step audit
                   │
        reports/NIGHTLY_AUDIT_YYYYMMDD.md
                   │
             (if critical)
                   │
            GitHub Issue (needs-human)
```

---

## Используемые секреты

| Секрет | Workflows |
|--------|-----------|
| `ANTHROPIC_API_KEY` | auto-fix, agent-dispatcher, nightly-audit |
| `GITHUB_TOKEN` | auto-fix (авто-предоставляется GitHub Actions) |

**Статус:** `ANTHROPIC_API_KEY` уже добавлен в секреты репозитория.

---

## Файлы

```
.github/workflows/auto-fix.yml          — Self-Healing CI (claude --dangerously-skip-permissions)
.github/workflows/agent-dispatcher.yml  — Agent Dispatcher по модулям AFC
.github/workflows/nightly-audit.yml     — Ночной аудит с Claude
AGENT_AUTOMATOR_REPORT.md              — этот файл
```

---

*Сгенерировано AGENT-AUTOMATOR · AST-Aros-Financial-Paradigm · 2026-05-13*
