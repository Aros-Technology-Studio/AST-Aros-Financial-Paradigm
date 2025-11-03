# AST Platform: Coding Standards

This document defines the coding style, formatting, and best practices for all code submitted to the AST repository. This ensures consistency, readability, and maintainability.

These standards are based on the rules defined in `.eslintrc.json`, `.prettierrc`, and `.editorconfig`.

## 1. Formatting (Enforced by Prettier)

Formatting is non-negotiable and is enforced automatically by Prettier (`.prettierrc`).

* **Semicolons:** **Required** (`"semi": true`).
* **Quotes:** **Single quotes** must be used (`"singleQuote": true`).
* **Trailing Commas:** Required for multi-line objects/arrays (`"trailingComma": "all"`).
* **Print Width:** Code lines should not exceed **120 characters** (`"printWidth": 120`).
* **Indentation:** Use **spaces**, not tabs. Indent size is **2 spaces** (from `.editorconfig`).

## 2. JavaScript / TypeScript (Enforced by ESLint)

These rules (`.eslintrc.json`) help prevent common bugs.

* **Type Checking:** This is a **TypeScript-first** project.
    * Explicit `any` is **forbidden** (`"@typescript-eslint/no-explicit-any": "error"`).
    * Non-null assertions (`!`) are **forbidden** (`"@typescript-eslint/no-non-null-assertion": "error"`).
* **Variables:**
    * `var` is **forbidden**. Use `let` or `const`.
    * Unused variables are **forbidden** (`"@typescript-eslint/no-unused-vars": "error"`).
* **Best Practices:**
    * `console.log()` statements are **forbidden** in production code (`"no-console": "warn"`). Use the official `logger.ts` module.
    * `eval()` is **forbidden** (`"no-eval": "error"`).
    * Empty code blocks (e.g., `try {} catch (e) {}`) are **forbidden** (`"no-empty": "error"`).

## 3. Naming Conventions

* **Files:** Use `snake_case` (e.g., `file_name.ts`) or `kebab-case` (e.g., `file-name.ts`). (Based on repo structure).
* **TypeScript - Interfaces:** Must be prefixed with `I` (e.g., `interface ITransaction`).
* **TypeScript - Enums:** Must use `PascalCase` (e.g., `enum NodeStatus {...}`).
* **Functions & Variables:** Use `camelCase` (e.g., `function handleRequest() {}`).
* **Constants:** Use `UPPER_SNAKE_CASE` (e.g., `const MAX_TTL = 300;`).

## 4. Git & Commits

* All commit messages should follow the **Conventional Commits** standard (e.g., `feat: add AI risk scoring endpoint`).
* All Pull Requests must reference a tracking Issue.
