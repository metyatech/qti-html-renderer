# qti-html-renderer

Shared utilities for rendering QTI 3.0 assessment item XML into HTML.

## Install

```bash
npm install qti-html-renderer
```

## Usage

```ts
import {
  applyResponsesToPromptHtml,
  renderQtiItemForExplanations,
  renderQtiItemForReport,
  renderQtiItemForScoring,
  rewriteHtmlImageSources,
} from 'qti-html-renderer';
```

### Rendering for scoring UI

Use this when you need prompt HTML, rubric criteria, choices, and optional explanation.

```ts
const parsed = renderQtiItemForScoring(xml);

parsed.identifier;
parsed.title;
parsed.promptHtml;
parsed.rubricCriteria;
parsed.choices;
parsed.interactions;
parsed.candidateExplanationHtml;
```

You can customize generated HTML via options:

```ts
const parsed = renderQtiItemForScoring(xml, {
  blankRenderer: (index) => `<input class="my-blank" data-blank="${index}" />`,
  extendedTextRenderer: () => '<span class=answer-long>(long answer)</span>',
  choiceListClassName: 'my-choice-list',
  preWithBlanksClassName: 'my-pre-with-blanks',
});
```

### Rendering for reports

Use this when you need a full HTML fragment for reports with code highlighting hooks.

```ts
const reportItem = renderQtiItemForReport(xml, expectedIdentifier, {
  clozeInputHtml: '<input class=cloze-input type=text readonly>',
  choiceWrapperClassName: 'choice-interaction',
  codeBlockClassName: 'code-block hljs',
  codeBlockCodeClassName: 'code-block-code',
  inlineCodeClassName: 'code-inline',
  dataCodeLangAttribute: 'data-code-lang',
  itemBodyWrapperClassName: 'item-body',
  codeHighlighter: (code, explicitLanguage) => {
    // return highlighted HTML plus language label
    return { language: explicitLanguage ?? 'plain', html: code };
  },
});

reportItem.questionHtml;
reportItem.interactions; // typed InteractionInfo[] for retry / correct attach
reportItem.explanationHtml; // null when the item has no qti-modal-feedback explanation
```

The report body wrapper element for `qti-choice-interaction` carries a
`data-interaction-id="<response-identifier>"` attribute, and the rendered cloze
`<input>` (when the default or any custom template that contains `<input` is
used) carries the same attribute. Consumers can attach correct values by id
without re-parsing the source XML.

Custom `clozeInputHtml` templates that do not contain an `<input` element are
left untouched.

### Interaction binding

`InteractionInfo` is the public contract every consumer (retry UI, correct
attach, scoring) MUST use to look up the correct response for an interaction.
Two binding rules apply:

- **Direct match** — when the interaction's `response-identifier` equals a
  `qti-response-declaration` identifier, the interaction gets the matching
  declaration's values in full.
- **Legacy ordered `RESPONSE` distribution** — when there is exactly one
  `qti-response-declaration` with `identifier="RESPONSE"`,
  `cardinality="ordered"`, `base-type="string"`, and the unmatched
  interactions are all `qti-text-entry-interaction` elements whose
  `response-identifier`s are exactly `RESPONSE_1`..`RESPONSE_N` in document
  order with no gaps and no duplicates, and the value count equals the
  interaction count, the declaration's values are distributed to the
  interactions in document order. In that case
  `declarationValueIndex` records the 0-based position assigned to the
  interaction.

If neither rule applies, the interaction's `declarationIdentifier`,
`declarationValueIndex`, `cardinality`, and `baseType` are `null` and
`correctResponse` is `[]`. Consumers must treat `correctResponse: []` as
"no declared correct value" rather than guessing from a fallback.

### Rendering explanations

When you only need the rendered explanation body (no question, no rubric),
call `renderQtiItemForExplanations`. It applies the same
`normalizePreBlocks` → `enhanceCodeBlocks` → `enhanceInlineCode` flow as the
report body, so the resulting HTML has the same `code-block` /
`code-block-code` / `code-inline` / `data-code-lang` contract.

```ts
const explanation = renderQtiItemForExplanations(xml, expectedIdentifier, {
  codeHighlighter: (code, explicitLanguage) => ({ language: explicitLanguage ?? 'plain', html: code }),
});

explanation.explanationHtml; // null when the item has no qti-modal-feedback
```

`ExplanationRenderOptions`:

- `codeHighlighter(code, explicitLanguage) => CodeHighlightResult` — optional
  highlighter applied to `<pre><code>` blocks the same way the report path
  applies it.

`explanationHtml` is `null` when the item has no `qti-modal-feedback`, no
`qti-content-body`, or the body is empty / contains only whitespace text
nodes / contains only XML comments.

### HTML utilities

```ts
const rewritten = rewriteHtmlImageSources(html, baseFilePath, {
  resolveUrl: (resolvedPath) => `/assets/${resolvedPath}`,
});

const withResponses = applyResponsesToPromptHtml(promptHtml, responses);
```

### Node.js DOMParser

`applyResponsesToPromptHtml` and `rewriteHtmlImageSources` require a DOMParser in Node.js.
Pass one via options:

```ts
import { JSDOM } from 'jsdom';

const domParser = new JSDOM('').window.DOMParser();

const withResponses = applyResponsesToPromptHtml(promptHtml, responses, { domParser });
const rewritten = rewriteHtmlImageSources(html, baseFilePath, {
  domParser,
  resolveUrl: (resolvedPath) => `/assets/${resolvedPath}`,
});
```

### Return Types

- `renderQtiItemForScoring` → `{ identifier, title, promptHtml, rubricCriteria, choices, interactions, candidateExplanationHtml }`
- `renderQtiItemForReport` → `{ identifier, title, questionHtml, rubricCriteria, itemMaxScore, choices, interactions, explanationHtml }`
- `renderQtiItemForExplanations` → `{ identifier, title, explanationHtml }`

`InteractionInfo` shape (exposed on both `ParsedItemForScoring.interactions`
and `ParsedItemForReport.interactions`):

```ts
interface InteractionInfo {
  id: string; // the response-identifier on the interaction element
  type: 'choice' | 'text-entry' | 'extended-text' | 'other';
  declarationIdentifier: string | null; // the qti-response-declaration identifier that bound to this interaction
  declarationValueIndex: number | null; // 0-based index into the declaration's values (legacy ordered RESPONSE distribution only; null otherwise)
  cardinality: 'single' | 'multiple' | 'ordered' | null; // from the declaration, normalized; null if absent
  baseType: string | null; // from the declaration; null if absent
  correctResponse: string[]; // values in document order, whitespace preserved (only \r\n/\r normalized to \n)
  choices: ChoiceOption[]; // for choice interactions, this interaction's own qti-simple-choice children
  maxChoices: number | null; // parsed from max-choices, only meaningful for choice interactions
}
```

`correctResponse` values preserve newlines, indentation, and surrounding
whitespace (no `.trim()` is applied); only `\r\n` and `\r` are normalized to
`\n`. Consumers that want trimmed values must trim at the assertion site.

## Development

```bash
npm ci
npm run build      # tsc -p tsconfig.json (also runs automatically via `prepack`)
npm test           # build + node --test
npm run verify     # prettier --check + eslint + typecheck + test
npm run lint
npm run format
```

## Publishing

The package is published from a clean `main` after CI is green. The
recommended sequence is:

```bash
npm ci
npm run build     # explicit; `prepack` also runs it automatically before `npm pack`/`npm publish`
npm publish --access public
```

`prepack` runs `npm run build` automatically, so a fresh checkout that has
not built `dist/` can still be packed or published. There is no
`prepublishOnly` step.

## Maintenance and Policies

- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [LICENSE](LICENSE)
- [CHANGELOG.md](CHANGELOG.md)
