import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  applyResponsesToPromptHtml,
  renderQtiItemForReport,
  renderQtiItemForScoring,
  rewriteHtmlImageSources,
} from "../dist/index.js";

test("renderQtiItemForScoring renders blanks and choices", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-1" title="Item 1">
  <qti-item-body>
    <qti-p>Prompt</qti-p>
    <qti-choice-interaction response-identifier="RESPONSE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="RESPONSE"/></qti-p>
    <qti-rubric-block view="scorer"><qti-p>[2] Good</qti-p></qti-rubric-block>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.equal(parsed.identifier, "item-1");
  assert.ok(parsed.promptHtml.includes("qti-choice-list"));
  assert.ok(parsed.promptHtml.includes("qti-blank-input"));
  assert.equal(parsed.rubricCriteria.length, 1);
});

test("renderQtiItemForReport uses highlighter and cloze input", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-7" title="Item 7">
  <qti-item-body>
    <qti-p>
      <pre><code class="language-css">.modal { opacity: 0.5; }</code></pre>
    </qti-p>
    <qti-p><qti-text-entry-interaction response-identifier="RESPONSE"/></qti-p>
    <qti-rubric-block view="scorer"><qti-p>[1] ok</qti-p></qti-rubric-block>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForReport(xml, "item-7", {
    codeHighlighter: (_code, _lang) => ({ language: "css", html: "<span>css</span>" }),
  });

  assert.ok(parsed.questionHtml.includes("cloze-input"));
  assert.ok(parsed.questionHtml.includes("data-code-lang=\"css\""));
  assert.ok(parsed.questionHtml.includes("code-block"));
});

test("applyResponsesToPromptHtml fills blanks and sizes", () => {
  const { window } = new JSDOM("");
  const domParser = new window.DOMParser();
  const promptHtml =
    '<p>A<input class="qti-blank-input" data-blank="1" type="text" size="6" disabled aria-label="blank 1" />B</p>';

  const resultHtml = applyResponsesToPromptHtml(promptHtml, "TypeScript", { domParser });
  const doc = new JSDOM(resultHtml).window.document;
  const blank = doc.querySelector("input.qti-blank-input");
  assert.equal(blank?.getAttribute("value"), "TypeScript");
  assert.equal(blank?.getAttribute("size"), String("TypeScript".length));
});

test("rewriteHtmlImageSources resolves relative paths", () => {
  const { window } = new JSDOM("");
  const domParser = new window.DOMParser();
  const html = '<img src="images/pic.png" alt="pic" />';
  const rewritten = rewriteHtmlImageSources(html, "items/item-1.qti.xml", {
    domParser,
    resolveUrl: (resolved) => `/assets/${resolved}`,
  });
  const doc = new JSDOM(rewritten).window.document;
  const img = doc.querySelector("img");
  assert.equal(img?.getAttribute("src"), "/assets/items/images/pic.png");
});
