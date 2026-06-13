# Changelog

## 0.1.3 — 2026-06-13

### Added

- `renderQtiItemForExplanations(xml, expectedIdentifier, options?)` — public function that returns the explanation body rendered with the report path's flow-content + code-highlighting contract.
- `ParsedItemForReport.interactions: InteractionInfo[]` and `ParsedItemForReport.explanationHtml: string | null` so the reporter can drive retry / correct / explanation bodies entirely from renderer output.
- `data-interaction-id="<response-identifier>"` attribute on the report path's `choice-interaction` wrappers and cloze inputs so consumers can attach correct values by id without XML parsing.
- `InteractionInfo.type` is now the typed union `'choice' | 'text-entry' | 'extended-text' | 'other'`.

### Changed

- `extractInteractions` (private) now matches each interaction's `response-identifier` to the corresponding `qti-response-declaration` and copies the declaration's `qti-value` list into the interaction's `correctResponse`. For shared declarations across multiple interactions, values are distributed in document order.
- `InteractionInfo.type` (now exposed on both `ParsedItemForScoring` and `ParsedItemForReport`) is `'choice' | 'text-entry' | 'extended-text' | 'other'` (was the never-documented `'choiceInteraction' | 'textEntryInteraction'` strings).

### Security

- Bumped `@xmldom/xmldom` to `^0.9.10`.
- Added `picomatch` override at `^4.0.4`.
- Bumped `minimatch` override to `^10.2.3`.
- Added `flatted` override at `^3.4.2` to clear the recursion DoS / prototype pollution advisory pulled in by the eslint v9 chain.
- `npm audit --audit-level=high` now exits 0.

### Removed

- The unused private `_enhanceReportCodeHtml` helper (the explanation path now renders through the same flow as the report body).

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
