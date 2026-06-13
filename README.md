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
- `domParser` — reserved for future HTML transforms; not used by the current
  implementation.

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

`InteractionInfo.type` is the typed union `'choice' | 'text-entry' | 'extended-text' | 'other'`. Both `ParsedItemForScoring.interactions` and `ParsedItemForReport.interactions` share the same array, with `correctResponse` populated from the matching `qti-response-declaration`. For shared declarations across multiple interactions, values are distributed in document order.

## Development

```bash
npm run build
npm test
npm run lint
npm run format
```

## Maintenance and Policies

- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [LICENSE](LICENSE)
- [CHANGELOG.md](CHANGELOG.md)
