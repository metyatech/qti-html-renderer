# Changelog

## Unreleased

### Internal

- Refactor `src/index.ts` so the scoring prompt renderer and the explanation
  body renderer share a single private `renderFlowContentChildren` helper that
  turns a list of QTI flow-content child nodes into HTML. No public API,
  signature, or output change.
- Add a private, not-yet-wired `_enhanceReportCodeHtml` helper that applies the
  report path's `pre` / code-block / inline-code class injection to
  pre-rendered flow-content HTML, reserved for future reuse. Not exported.

### Tests

- Add tests covering `candidateExplanationHtml` for items with `EXPLANATION`
  modal feedback (paragraph, inline code, code block) and `null` when no modal
  feedback exists, plus a test locking in the `RESPONSE_n` document order of the
  `interactions` array for a multi-blank cloze item.

## 0.1.1 — 2026-02-23

### Fixes

- Resolve npm audit vulnerabilities by upgrading `ajv` and adding `minimatch` override.
- Use `--audit-level=high` for npm audit to allow moderate dev-dependency vulnerabilities in CI.

### Chores

- Add ESLint and Prettier with enforced formatting and linting rules.
- Add `lint`, `format`, `typecheck`, and `verify` scripts to `package.json`.
- Update CI to use `npm run verify` and add `npm audit` check.
- Add `engines` field (`node >= 20`) to `package.json`.
- Update README with dev commands and policy links.
- Add `.prettierignore`, `eslint.config.js`, `prettier.config.js`.
- Fix lint errors (remove unused internal helper functions).

## 0.1.0

- Initial release of shared QTI 3.0 HTML rendering utilities.
