# Changelog

## 0.1.3 — 2026-06-13

### Added

- `InteractionInfo` now exposes `declarationIdentifier`, `declarationValueIndex`, `cardinality`, `baseType`, `choices`, and `maxChoices` so consumers can build retry / correct / explanation UIs without re-parsing the source XML.
- Each `choice` interaction's `choices` is the interaction's own list of `qti-simple-choice` children, not the item-level flatten.
- `prepack` script that runs `npm run build` automatically.

### Changed

- `extractInteractions` no longer falls back to a "first loose declaration wins" heuristic. Behavior:
  - Direct identifier match: the interaction gets the matching declaration's values.
  - Legacy ordered `RESPONSE` distribution is supported only when ALL of the following hold: exactly one `qti-response-declaration` exists, its identifier is exactly `RESPONSE`, `cardinality="ordered"`, `base-type="string"`; no interaction matches a declaration directly (`directMatchIds` is empty); every interaction in the item is unmatched (`unmatchedInfo.length === interactionInfo.length`); every interaction's published type is exactly `text-entry` (custom / non-standard interactions reported as `other` are excluded); the unmatched `response-identifier`s are exactly `RESPONSE_1..RESPONSE_N` in document order with no gaps or duplicates; and the value count equals the interaction count. Outside that exact shape, unmatched interactions get `correctResponse: []`. In particular, a literal `RESPONSE` interaction wins by direct match and suppresses the fallback for any sibling `RESPONSE_1` interaction.
- `correctResponse` values are normalized per declaration `base-type`. All newline styles are normalized to `\n`. `base-type="string"` preserves surrounding whitespace, indentation, and blank lines; every other base-type (`identifier`, `boolean`, `integer`, `float`, ..., and the unspecified case) is trimmed of surrounding whitespace.

### Fixed

- Empty / whitespace-only / comment-only `qti-content-body` now returns `explanationHtml: null` (and `candidateExplanationHtml: null`) instead of an empty wrapper. Meaningfulness is now determined recursively: a non-whitespace text node or a self-displaying element (`img`, `hr`, ...) anywhere in the body counts as content, while containers (`p`, `div`, lists, tables) that recurse to nothing — and elements every renderer collapses to `''` (`qti-rubric-block`) — do not.

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
