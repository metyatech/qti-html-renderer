# Changelog

## 0.1.3 — 2026-06-13

### Added

- `InteractionInfo` now exposes `declarationIdentifier`, `declarationValueIndex`, `cardinality`, `baseType`, `choices`, and `maxChoices` so consumers can build retry / correct / explanation UIs without re-parsing the source XML.
- Each `choice` interaction's `choices` is the interaction's own list of `qti-simple-choice` children, not the item-level flatten.
- `prepack` script that runs `npm run build` automatically.

### Changed

- `extractInteractions` no longer falls back to a "first loose declaration wins" heuristic. Behavior:
  - Direct identifier match: the interaction gets the matching declaration's values.
  - Legacy ordered `RESPONSE` distribution is supported only when ALL of the following hold: declaration identifier is exactly `RESPONSE`, `cardinality="ordered"`, `base-type="string"`, all `RESPONSE_1..RESPONSE_N` text-entry interactions are present in document order with no gaps, value count matches interaction count, and no other declaration is present. Outside of that exact shape, unmatched interactions get `correctResponse: []`.
- `correctResponse` values preserve newlines, indentation, and surrounding whitespace (no `.trim()`); only `\r\n`/`\r` is normalized to `\n`.

### Fixed

- Empty / whitespace-only / comment-only `qti-content-body` now returns `explanationHtml: null` instead of an empty wrapper.

### Security

- Bumped `@xmldom/xmldom` to `^0.9.10`.
- Added `picomatch` override at `^4.0.4`.
- Bumped `minimatch` override to `^10.2.3`.
- Added `flatted` override at `^3.4.2` to clear the recursion DoS / prototype pollution advisory pulled in by the eslint v9 chain.
- `npm audit --audit-level=high` now exits 0.

### Removed

- `ExplanationRenderOptions.domParser` (was a non-functional future option).

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
