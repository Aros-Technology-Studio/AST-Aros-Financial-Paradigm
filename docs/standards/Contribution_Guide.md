# Contribution Guide

Thank you for your interest in contributing to the AST Platform! This guide outlines the process for submitting changes, reporting bugs, and proposing new features.

## 1. Code of Conduct
All contributors are expected to adhere to the **[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)**.

## 2. Reporting Bugs
* Ensure the bug was not already reported by searching the GitHub Issues.
* If you're reporting a new bug, please use the **[Bug Report Template](../.github/ISSUE_TEMPLATE/bug_report.md)**.
* Provide a clear title, a detailed description of the bug, steps to reproduce it, and the expected outcome.

## 3. Proposing New Features
* To propose a new feature, please use the **[Feature Request Template](../.github/ISSUE_TEMPLATE/feature_request.md)**.
* Clearly describe the problem you are solving ("Is your feature request related to a problem?") and the solution you are proposing.

## 4. Your First Code Contribution

Ready to submit code? Follow these steps:

1.  **Fork** the repository.
2.  **Create a new branch** from `main` for your feature or bugfix (e.g., `feat/my-new-feature` or `fix/tx-validation-bug`).
3.  **Install dependencies:** `npm install` (based on `package.json`).
4.  **Make your changes:**
    * Ensure your code adheres to the **[Coding_Standards.md](./Coding_Standards.md)**.
    * Run `npm run lint` and `npm run format` to fix any issues.
5.  **Add/Update Tests:**
    * Add new **unit tests** for your logic in the `tests/unit/` directory.
    * Add new **integration tests** in `tests/integration/` if your change affects multiple modules.
    * Run all tests with `npm run test` (based on `package.json` scripts).
6.  **Commit your code:** Use the **Conventional Commits** standard (e.g., `feat(api): add /kyc/status endpoint`).
7.  **Push** your branch to your fork.
8.  **Open a Pull Request (PR)** against the `main` branch of the main repository.
9.  **Fill out the PR Template:** Your PR description must follow the **[PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md)**, linking the Issue it resolves.
10. **Wait for review:** The core team (and our AI-Review bot) will review your code.
