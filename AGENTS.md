# Agent Guidelines

These instructions apply to the entire repository.

## Commit rules

- Use Conventional Commits, e.g., `feat:`, `fix:`, `docs:`.
- Write the summary line in the imperative mood and keep it under 72 characters.
- Separate the commit body from the summary with a blank line when needed.

## Tests before PR

- Run all programmatic checks before opening a pull request.
- At minimum, execute:

  ```bash
  npm test
  ```

- Include a citation to the test results in your PR message.

## Citation requirements

- Cite file changes using `F:<path>†Lx(-Ly)`.
- Cite terminal output using `<chunk_id>†Lx(-Ly)`.
- Every code or documentation reference and all test results must have a citation.

## Reference guides

- Code style: see [CONTRIBUTING.md#code-style-and-standards](CONTRIBUTING.md#code-style-and-standards) and the configuration files [`.eslintrc.json`](.eslintrc.json) and [`.prettierrc`](.prettierrc).
- Documentation: follow the general guidance in [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md).
- Community standards: abide by the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
