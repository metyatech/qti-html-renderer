# qti-html-renderer

Shared utilities for rendering QTI 3.0 assessment item XML into HTML.

## Install

```bash
npm install github:metyatech/qti-html-renderer
```

## Usage

```ts
import {
  applyResponsesToPromptHtml,
  renderQtiItemForReport,
  renderQtiItemForScoring,
  rewriteHtmlImageSources,
} from "qti-html-renderer";
```

### HTML utilities

```ts
const rewritten = rewriteHtmlImageSources(html, baseFilePath, {
  resolveUrl: (resolvedPath) => `/assets/${resolvedPath}`,
});

const withResponses = applyResponsesToPromptHtml(promptHtml, responses);
```

When running in Node.js, provide a DOMParser implementation via the `domParser` option
(for example, from `linkedom` or `jsdom`).

## Development

```bash
npm run build
npm test
```
