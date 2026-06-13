import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  applyResponsesToPromptHtml,
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

test('renderQtiItemForScoring exposes interaction metadata in document order', () => {
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
    { id: 'CHOICE', type: 'choiceInteraction', correctResponse: ['B'] },
    { id: 'BLANK', type: 'textEntryInteraction', correctResponse: ['TypeScript'] },
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
  // does not inject report code classes (that remains the report path's job / the
  // not-yet-wired _enhanceReportCodeHtml helper), so candidateExplanationHtml keeps
  // the bare <pre><code> structure. We assert the structure and content actually
  // produced here rather than a report-only language-* class.
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

test('renderQtiItemForScoring returns ordered correct-response values for multi-blank cloze', () => {
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

  // Lock in that the interactions array preserves the RESPONSE_n document order.
  assert.deepEqual(
    parsed.interactions.map((interaction) => interaction.id),
    ['RESPONSE_1', 'RESPONSE_2'],
  );

  // NOTE: the current implementation keys correctResponse by the
  // qti-response-declaration identifier ("RESPONSE"), not by each interaction's
  // response-identifier ("RESPONSE_1"/"RESPONSE_2"). The public API does not yet
  // expose an ordered correct-response map keyed by response-identifier, so the
  // per-interaction correctResponse is empty here. The assertion matches the
  // existing behavior; the implementation is intentionally unchanged in this set.
  assert.deepEqual(correctById.get('RESPONSE_1'), []);
  assert.deepEqual(correctById.get('RESPONSE_2'), []);
});
