import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  applyResponsesToPromptHtml,
  renderQtiItemForExplanations,
  renderQtiItemForReport,
  renderQtiItemForScoring,
  rewriteHtmlImageSources,
} from '../dist/index.js';

test('renderQtiItemForScoring renders blanks and choices', () => {
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
  assert.equal(parsed.identifier, 'item-1');
  assert.ok(parsed.promptHtml.includes('qti-choice-list'));
  assert.ok(parsed.promptHtml.includes('qti-blank-input'));
  assert.equal(parsed.rubricCriteria.length, 1);
});

test('renderQtiItemForScoring exposes typed-union interaction metadata in document order', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-2" title="Item 2">
  <qti-response-declaration identifier="CHOICE">
    <qti-correct-response>
      <qti-value>B</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="BLANK">
    <qti-correct-response>
      <qti-value>TypeScript</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="BLANK"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);

  assert.deepEqual(parsed.interactions, [
    { id: 'CHOICE', type: 'choice', correctResponse: ['B'] },
    { id: 'BLANK', type: 'text-entry', correctResponse: ['TypeScript'] },
  ]);
  assert.match(parsed.promptHtml, /data-interaction-id="CHOICE"/);
  assert.match(parsed.promptHtml, /data-interaction-id="BLANK"/);
  assert.match(parsed.promptHtml, /data-identifier="A"/);
  assert.match(parsed.promptHtml, /data-identifier="B"/);
});

test('renderQtiItemForReport uses highlighter and cloze input', () => {
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

  const parsed = renderQtiItemForReport(xml, 'item-7', {
    codeHighlighter: (_code, _lang) => ({ language: 'css', html: '<span>css</span>' }),
  });

  assert.ok(parsed.questionHtml.includes('cloze-input'));
  assert.ok(parsed.questionHtml.includes('data-code-lang="css"'));
  assert.ok(parsed.questionHtml.includes('code-block'));
});

test('applyResponsesToPromptHtml fills blanks and sizes', () => {
  const { window } = new JSDOM('');
  const domParser = new window.DOMParser();
  const promptHtml =
    '<p>A<input class="qti-blank-input" data-blank="1" type="text" size="6" disabled aria-label="blank 1" />B</p>';

  const resultHtml = applyResponsesToPromptHtml(promptHtml, 'TypeScript', { domParser });
  const doc = new JSDOM(resultHtml).window.document;
  const blank = doc.querySelector('input.qti-blank-input');
  assert.equal(blank?.getAttribute('value'), 'TypeScript');
  assert.equal(blank?.getAttribute('size'), String('TypeScript'.length));
});

test('rewriteHtmlImageSources resolves relative paths', () => {
  const { window } = new JSDOM('');
  const domParser = new window.DOMParser();
  const html = '<img src="images/pic.png" alt="pic" />';
  const rewritten = rewriteHtmlImageSources(html, 'items/item-1.qti.xml', {
    domParser,
    resolveUrl: (resolved) => `/assets/${resolved}`,
  });
  const doc = new JSDOM(rewritten).window.document;
  const img = doc.querySelector('img');
  assert.equal(img?.getAttribute('src'), '/assets/items/images/pic.png');
});

test('renderQtiItemForScoring exposes candidateExplanationHtml for items with EXPLANATION modal feedback', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-exp" title="Item Exp">
  <qti-item-body>
    <qti-p>Body prompt.</qti-p>
  </qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>
      <qti-p>Use <qti-em>emphasis</qti-em> and <qti-code>inlineFn()</qti-code> in code.</qti-p>
      <qti-pre><qti-code class="language-ts">const answer: number = 42;</qti-code></qti-pre>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  const html = parsed.candidateExplanationHtml;

  assert.equal(typeof html, 'string');
  assert.ok(html.length > 0);
  // Paragraph rendered through the shared flow-content helper, including the qti-em.
  assert.match(html, /<p>Use <em>emphasis<\/em> and <code>inlineFn\(\)<\/code> in code\.<\/p>/);
  // Inline code element for the inline qti-code.
  assert.match(html, /<code>inlineFn\(\)<\/code>/);
  // Code block. NOTE: the scoring/explanation flow-content renderer intentionally
  // does not inject report code classes (that remains the report path's job), so
  // candidateExplanationHtml keeps the bare <pre><code> structure. We assert
  // the structure and content actually produced here rather than a report-only
  // language-* class.
  assert.match(html, /<pre><code>const answer: number = 42;<\/code><\/pre>/);
});

test('renderQtiItemForScoring returns null candidateExplanationHtml when no modal feedback exists', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-no-exp" title="No Exp">
  <qti-item-body>
    <qti-p>Just a prompt with no feedback.</qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.equal(parsed.candidateExplanationHtml, null);
});

test('renderQtiItemForScoring distributes shared-declaration values across interactions in document order', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cloze" title="Cloze">
  <qti-response-declaration identifier="RESPONSE">
    <qti-correct-response>
      <qti-value>first</qti-value>
      <qti-value>second</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  const correctById = new Map(parsed.interactions.map((interaction) => [interaction.id, interaction.correctResponse]));

  // Interactions are in qti-item-body document order, each mapped to its own
  // response-identifier. The shared RESPONSE declaration distributes its values
  // across those interactions in document order.
  assert.deepEqual(
    parsed.interactions.map((interaction) => interaction.id),
    ['RESPONSE_1', 'RESPONSE_2'],
  );
  assert.deepEqual(correctById.get('RESPONSE_1'), ['first']);
  assert.deepEqual(correctById.get('RESPONSE_2'), ['second']);
});

test('renderQtiItemForScoring honors per-blank response-declarations', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cloze2" title="Cloze 2">
  <qti-response-declaration identifier="RESPONSE_1">
    <qti-correct-response><qti-value>first</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="RESPONSE_2">
    <qti-correct-response><qti-value>second</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(parsed.interactions, [
    { id: 'RESPONSE_1', type: 'text-entry', correctResponse: ['first'] },
    { id: 'RESPONSE_2', type: 'text-entry', correctResponse: ['second'] },
  ]);
});

test('renderQtiItemForScoring returns multi-value correctResponse for multi-cardinality choice', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-multi" title="Multi">
  <qti-response-declaration identifier="CHOICE" cardinality="multiple">
    <qti-correct-response>
      <qti-value>A</qti-value>
      <qti-value>C</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="2">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
      <qti-simple-choice identifier="C">Gamma</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(parsed.interactions, [{ id: 'CHOICE', type: 'choice', correctResponse: ['A', 'C'] }]);
});

test('renderQtiItemForScoring returns one interaction per qti-choice-interaction in document order', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-two-choices" title="Two Choices">
  <qti-response-declaration identifier="CHOICE_A">
    <qti-correct-response><qti-value>A</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="CHOICE_B">
    <qti-correct-response><qti-value>Y</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE_A" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p>second</qti-p>
    <qti-choice-interaction response-identifier="CHOICE_B" max-choices="1">
      <qti-simple-choice identifier="X">X</qti-simple-choice>
      <qti-simple-choice identifier="Y">Y</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.equal(parsed.interactions.length, 2);
  assert.equal(parsed.interactions[0].id, 'CHOICE_A');
  assert.deepEqual(parsed.interactions[0].correctResponse, ['A']);
  assert.equal(parsed.interactions[0].type, 'choice');
  assert.equal(parsed.interactions[1].id, 'CHOICE_B');
  assert.deepEqual(parsed.interactions[1].correctResponse, ['Y']);
  assert.equal(parsed.interactions[1].type, 'choice');
});

test('renderQtiItemForScoring keeps the same per-interaction mapping regardless of declaration order', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-rev" title="Reverse">
  <qti-response-declaration identifier="RESPONSE_2">
    <qti-correct-response><qti-value>second</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="RESPONSE_1">
    <qti-correct-response><qti-value>first</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(parsed.interactions, [
    { id: 'RESPONSE_1', type: 'text-entry', correctResponse: ['first'] },
    { id: 'RESPONSE_2', type: 'text-entry', correctResponse: ['second'] },
  ]);
});

test('renderQtiItemForScoring reports extended-text interaction with its correct value', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ext" title="Extended">
  <qti-response-declaration identifier="LONG" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>TypeScript is great.</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>Describe TypeScript.</qti-p>
    <qti-extended-text-interaction response-identifier="LONG"/>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(parsed.interactions, [
    { id: 'LONG', type: 'extended-text', correctResponse: ['TypeScript is great.'] },
  ]);
});

test('renderQtiItemForReport emits data-interaction-id on choice wrappers and cloze inputs', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cw" title="CW">
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE_X" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="BLANK_X"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForReport(xml, 'item-cw');
  assert.match(parsed.questionHtml, /<div class="choice-interaction" data-interaction-id="CHOICE_X">/);
  assert.match(parsed.questionHtml, /<input[^>]*data-interaction-id="BLANK_X"/);
  // Interactions metadata is also exposed on the report object.
  assert.deepEqual(parsed.interactions, [
    { id: 'CHOICE_X', type: 'choice', correctResponse: [] },
    { id: 'BLANK_X', type: 'text-entry', correctResponse: [] },
  ]);
});

test('renderQtiItemForReport leaves a custom non-input cloze template untouched', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cu" title="CU">
  <qti-item-body>
    <qti-p><qti-text-entry-interaction response-identifier="BLANK_C"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const customHtml = '<span class="my-cloze">[blank]</span>';
  const parsed = renderQtiItemForReport(xml, 'item-cu', { clozeInputHtml: customHtml });
  assert.ok(parsed.questionHtml.includes(customHtml));
  assert.ok(!parsed.questionHtml.includes('data-interaction-id="BLANK_C"'));
});

test('renderQtiItemForReport exposes explanationHtml and interactions on the same parsed object', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-r" title="R">
  <qti-response-declaration identifier="CHOICE">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>
      <qti-p>Pick B.</qti-p>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  const parsed = renderQtiItemForReport(xml, 'item-r');
  assert.equal(typeof parsed.explanationHtml, 'string');
  assert.match(parsed.explanationHtml, /Pick B\./);
  assert.deepEqual(parsed.interactions, [{ id: 'CHOICE', type: 'choice', correctResponse: ['B'] }]);
});

test('renderQtiItemForExplanations returns null when no qti-modal-feedback is present', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-nx" title="NX">
  <qti-item-body><qti-p>No feedback.</qti-p></qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForExplanations(xml, 'item-nx');
  assert.equal(parsed.identifier, 'item-nx');
  assert.equal(parsed.title, 'NX');
  assert.equal(parsed.explanationHtml, null);
});

test('renderQtiItemForExplanations renders full report-style explanation with code blocks and images', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ex" title="EX">
  <qti-item-body>
    <qti-p>Body prompt.</qti-p>
  </qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>
      <qti-p>Use <qti-em>emphasis</qti-em> and inline <qti-code>name</qti-code> elements.</qti-p>
      <qti-pre><qti-code class="language-ts">const answer: number = 42;</qti-code></qti-pre>
      <qti-p><qti-img src="images/sample.svg" alt="sample image" /></qti-p>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  const parsed = renderQtiItemForExplanations(xml, 'item-ex', {
    codeHighlighter: (_code, _lang) => ({ language: 'ts', html: '<span>highlighted</span>' }),
  });

  assert.equal(parsed.identifier, 'item-ex');
  const html = parsed.explanationHtml;
  assert.equal(typeof html, 'string');
  // Wrapped in item-body, code-block & code-block-code classes injected, data-code-lang present.
  assert.match(html, /<div class="item-body">/);
  assert.match(html, /class="code-block hljs"/);
  assert.match(html, /class="[^"]*\bcode-block-code\b/);
  assert.match(html, /data-code-lang="ts"/);
  // Inline code got the code-inline class.
  assert.match(html, /<code class="code-inline"[^>]*>name<\/code>/);
  // Paragraph and emphasis rendered.
  assert.match(html, /<p>Use <em>emphasis<\/em>/);
  // Image rendered with the report-image class on the wrapping <div> — in the
  // report path qti-img becomes <img> directly.
  assert.match(html, /<img[^>]*src="images\/sample\.svg"[^>]*alt="sample image"[^>]*\/>/);
});

test('renderQtiItemForExplanations falls back to identifier-only EXPLANATION modal feedback', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-fb" title="FB">
  <qti-item-body><qti-p>Body.</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION">
    <qti-content-body>
      <qti-p>Fallback explanation.</qti-p>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  const parsed = renderQtiItemForExplanations(xml, 'item-fb');
  assert.match(parsed.explanationHtml ?? '', /Fallback explanation\./);
});
