# TX STRUCTURE & METADATA 
---

> Эта глава служит мостом между архитектурой токеномики и реальным исполнением транзакций, формируя основу того, как транзакции структурируются, маркируются, мета-анализируются и передаются внутри AST.
> 
> 
> Она определяет **единый стандарт представления транзакции**, применимый ко всем типам действий (токен, голосование, маршрутизация, запросы).
> 
> Здесь же вводятся понятия: `tx envelope`, `tx header`, `meta-flags`, `transaction fingerprint`, `auth-path`, `replay-proof`, `priority-index` и др.
> 

### 🎯 Назначение главы:

---

## 📂 Структура главы `TX STRUCTURE & METADATA`

```
ast/
└── processing_layer/
    ├── tx_structure_and_metadata.md
    ├── tx_envelope_format.md
    ├── tx_header_spec.md
    ├── tx_metadata_flags.md
    ├── tx_fingerprint_and_hashing.md
    ├── tx_priority_indexing.md
    └── tx_replay_protection.md

```

---

## 📄 Перечень документов:
