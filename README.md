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
```

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

- `renderQtiItemForScoring` → `{ identifier, title, promptHtml, rubricCriteria, choices, candidateExplanationHtml }`
- `renderQtiItemForReport` → `{ identifier, title, questionHtml, rubricCriteria, itemMaxScore, choices }`

## Development

```bash
npm run build
npm test
npm run lint
npm run format
npm run verify
```

## Overview

This repository contains the qti-html-renderer project.

## Development Commands

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Format: `npm run format`
- Typecheck: `npm run typecheck`
- Verify (all checks): `npm run verify`

## Requirements and Configuration

- Node.js 18+ (tested with Node.js built-in test runner)

## Standards Compliance

This repository follows the standards defined in:
- [LICENSE](./LICENSE)
- [SECURITY.md](./SECURITY.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CHANGELOG.md](./CHANGELOG.md)
