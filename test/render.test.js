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
    {
      id: 'CHOICE',
      type: 'choice',
      declarationIdentifier: 'CHOICE',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['B'],
      choices: [
        { identifier: 'A', text: 'Alpha' },
        { identifier: 'B', text: 'Beta' },
      ],
      maxChoices: 1,
    },
    {
      id: 'BLANK',
      type: 'text-entry',
      declarationIdentifier: 'BLANK',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['TypeScript'],
      choices: [],
      maxChoices: null,
    },
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
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
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
    {
      id: 'RESPONSE_1',
      type: 'text-entry',
      declarationIdentifier: 'RESPONSE_1',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['first'],
      choices: [],
      maxChoices: null,
    },
    {
      id: 'RESPONSE_2',
      type: 'text-entry',
      declarationIdentifier: 'RESPONSE_2',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['second'],
      choices: [],
      maxChoices: null,
    },
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
  assert.deepEqual(parsed.interactions, [
    {
      id: 'CHOICE',
      type: 'choice',
      declarationIdentifier: 'CHOICE',
      declarationValueIndex: null,
      cardinality: 'multiple',
      baseType: null,
      correctResponse: ['A', 'C'],
      choices: [
        { identifier: 'A', text: 'Alpha' },
        { identifier: 'B', text: 'Beta' },
        { identifier: 'C', text: 'Gamma' },
      ],
      maxChoices: 2,
    },
  ]);
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
    {
      id: 'RESPONSE_1',
      type: 'text-entry',
      declarationIdentifier: 'RESPONSE_1',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['first'],
      choices: [],
      maxChoices: null,
    },
    {
      id: 'RESPONSE_2',
      type: 'text-entry',
      declarationIdentifier: 'RESPONSE_2',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['second'],
      choices: [],
      maxChoices: null,
    },
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
    {
      id: 'LONG',
      type: 'extended-text',
      declarationIdentifier: 'LONG',
      declarationValueIndex: null,
      cardinality: 'single',
      baseType: 'string',
      correctResponse: ['TypeScript is great.'],
      choices: [],
      maxChoices: null,
    },
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
    {
      id: 'CHOICE_X',
      type: 'choice',
      declarationIdentifier: null,
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: [],
      choices: [
        { identifier: 'A', text: 'Alpha' },
        { identifier: 'B', text: 'Beta' },
      ],
      maxChoices: 1,
    },
    {
      id: 'BLANK_X',
      type: 'text-entry',
      declarationIdentifier: null,
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: [],
      choices: [],
      maxChoices: null,
    },
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
  assert.deepEqual(parsed.interactions, [
    {
      id: 'CHOICE',
      type: 'choice',
      declarationIdentifier: 'CHOICE',
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: ['B'],
      choices: [
        { identifier: 'A', text: 'Alpha' },
        { identifier: 'B', text: 'Beta' },
      ],
      maxChoices: 1,
    },
  ]);
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

// ---------------------------------------------------------------------------
// 0.1.3 — strict binding tests for extractInteractions
// ---------------------------------------------------------------------------

// A small helper to find an interaction by id and keep the tests readable.
const findInteraction = (parsed, id) => parsed.interactions.find((interaction) => interaction.id === id);

test('0.1.3 extractInteractions: direct identifier match populates full binding on every interaction type', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-direct" title="Direct">
  <qti-response-declaration identifier="CHOICE" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="BLANK" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>TypeScript</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="LONG" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>  first line\n    indented\n  last  </qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="BLANK"/></qti-p>
    <qti-extended-text-interaction response-identifier="LONG"/>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  const [choice, blank, long] = parsed.interactions;

  assert.equal(choice.id, 'CHOICE');
  assert.equal(choice.type, 'choice');
  assert.equal(choice.declarationIdentifier, 'CHOICE');
  assert.equal(choice.declarationValueIndex, null);
  assert.equal(choice.cardinality, 'single');
  assert.equal(choice.baseType, 'identifier');
  assert.deepEqual(choice.correctResponse, ['B']);
  assert.deepEqual(
    choice.choices.map((c) => c.identifier),
    ['A', 'B'],
  );
  assert.equal(choice.maxChoices, 1);

  assert.equal(blank.id, 'BLANK');
  assert.equal(blank.type, 'text-entry');
  assert.equal(blank.declarationIdentifier, 'BLANK');
  assert.equal(blank.declarationValueIndex, null);
  assert.equal(blank.cardinality, 'single');
  assert.equal(blank.baseType, 'string');
  assert.deepEqual(blank.correctResponse, ['TypeScript']);
  assert.deepEqual(blank.choices, []);
  assert.equal(blank.maxChoices, null);

  assert.equal(long.id, 'LONG');
  assert.equal(long.type, 'extended-text');
  assert.equal(long.declarationIdentifier, 'LONG');
  assert.equal(long.declarationValueIndex, null);
  assert.equal(long.cardinality, 'single');
  assert.equal(long.baseType, 'string');
  assert.equal(long.correctResponse[0], '  first line\n    indented\n  last  ');
  assert.deepEqual(long.choices, []);
  assert.equal(long.maxChoices, null);
});

test('0.1.3 extractInteractions: reverse declaration order still maps each interaction to its own declaration', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-rev" title="Reverse">
  <qti-response-declaration identifier="RESPONSE_2" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>second</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="RESPONSE_1" cardinality="single" base-type="string">
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
  assert.deepEqual(
    parsed.interactions.map((interaction) => [
      interaction.id,
      interaction.declarationIdentifier,
      interaction.correctResponse,
    ]),
    [
      ['RESPONSE_1', 'RESPONSE_1', ['first']],
      ['RESPONSE_2', 'RESPONSE_2', ['second']],
    ],
  );
});

test('0.1.3 extractInteractions: multiple-cardinality choice returns full list, max-choices parsed', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-mc" title="MC">
  <qti-response-declaration identifier="CHOICE" cardinality="multiple" base-type="identifier">
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
  const [choice] = parsed.interactions;
  assert.equal(choice.cardinality, 'multiple');
  assert.equal(choice.baseType, 'identifier');
  assert.deepEqual(choice.correctResponse, ['A', 'C']);
  assert.equal(choice.maxChoices, 2);
  assert.deepEqual(
    choice.choices.map((c) => c.identifier),
    ['A', 'B', 'C'],
  );
});

test('0.1.3 extractInteractions: two choice interactions in one item have independent choices', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-2c" title="Two Choices">
  <qti-response-declaration identifier="CHOICE_A" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>A</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="CHOICE_B" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>Y</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE_A" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p>middle</qti-p>
    <qti-choice-interaction response-identifier="CHOICE_B" max-choices="1">
      <qti-simple-choice identifier="X">X</qti-simple-choice>
      <qti-simple-choice identifier="Y">Y</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForScoring(xml);
  const a = findInteraction(parsed, 'CHOICE_A');
  const b = findInteraction(parsed, 'CHOICE_B');
  assert.deepEqual(
    a.choices.map((c) => c.identifier),
    ['A', 'B'],
  );
  assert.deepEqual(
    b.choices.map((c) => c.identifier),
    ['X', 'Y'],
  );
  assert.deepEqual(a.correctResponse, ['A']);
  assert.deepEqual(b.correctResponse, ['Y']);
});

test('0.1.3 report path: data-interaction-id is on choice wrappers and cloze inputs', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cw2" title="CW2">
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE_X" max-choices="1">
      <qti-simple-choice identifier="A">Alpha</qti-simple-choice>
      <qti-simple-choice identifier="B">Beta</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="BLANK_X"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;

  const parsed = renderQtiItemForReport(xml, 'item-cw2');
  assert.match(parsed.questionHtml, /<div class="choice-interaction" data-interaction-id="CHOICE_X">/);
  assert.match(parsed.questionHtml, /<input[^>]*data-interaction-id="BLANK_X"/);
  const clozeMatch = parsed.questionHtml.match(/<input[^>]*data-interaction-id="BLANK_X"[^>]*>/);
  assert.ok(clozeMatch, 'expected a cloze input element with data-interaction-id="BLANK_X"');
});

test('0.1.3 explanation highlighter: actually called with code and language, returned HTML embedded', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-hl" title="HL">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>
      <qti-pre><qti-code class="language-ts">const answer: number = 42;</qti-code></qti-pre>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  let calls = 0;
  const seen = [];
  const parsed = renderQtiItemForExplanations(xml, 'item-hl', {
    codeHighlighter: (code, explicitLanguage) => {
      calls += 1;
      seen.push([code, explicitLanguage]);
      return { language: 'ts', html: '<span class="hljs-keyword">const</span> answer' };
    },
  });

  assert.equal(calls, 1);
  assert.equal(seen[0][0], 'const answer: number = 42;');
  assert.equal(seen[0][1], 'ts');
  assert.ok(parsed.explanationHtml.includes('<span class="hljs-keyword">const</span> answer'));
});

test('0.1.3 report path highlighter: called for code blocks, returned HTML embedded', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-hl2" title="HL2">
  <qti-item-body>
    <qti-pre><qti-code class="language-ts">const x = 1;</qti-code></qti-pre>
  </qti-item-body>
</qti-assessment-item>`;

  let calls = 0;
  const seen = [];
  const parsed = renderQtiItemForReport(xml, 'item-hl2', {
    codeHighlighter: (code, explicitLanguage) => {
      calls += 1;
      seen.push([code, explicitLanguage]);
      return { language: 'ts', html: '<span class="hljs-keyword">const</span> x' };
    },
  });

  assert.equal(calls, 1);
  assert.equal(seen[0][0], 'const x = 1;');
  assert.equal(seen[0][1], 'ts');
  assert.ok(parsed.questionHtml.includes('<span class="hljs-keyword">const</span> x'));
});

test('0.1.3 explanation with paragraph, emphasis, list, table, image renders all parts', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-rich" title="Rich">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>
      <qti-p>Hello <qti-em>emphasized</qti-em> world.</qti-p>
      <qti-ul>
        <qti-li>one</qti-li>
        <qti-li>two</qti-li>
      </qti-ul>
      <qti-table>
        <qti-tbody>
          <qti-tr><qti-th>head</qti-th></qti-tr>
          <qti-tr><qti-td>cell</qti-td></qti-tr>
        </qti-tbody>
      </qti-table>
      <qti-p><qti-img src="images/sample.png" alt="sample" /></qti-p>
    </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;

  const parsed = renderQtiItemForExplanations(xml, 'item-rich');
  const html = parsed.explanationHtml;
  assert.match(html, /<p>Hello <em>emphasized<\/em> world\.<\/p>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>head<\/th>/);
  assert.match(html, /<td>cell<\/td>/);
  assert.match(html, /<img[^>]*src="images\/sample\.png"[^>]*alt="sample"[^>]*\/>/);
});

test('0.1.3 explanation: no qti-modal-feedback returns null', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-nf" title="NF">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForExplanations(xml, 'item-nf');
  assert.equal(parsed.explanationHtml, null);
});

test('0.1.3 explanation: empty qti-content-body returns null', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ec" title="EC">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body></qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;
  const parsed = renderQtiItemForExplanations(xml, 'item-ec');
  assert.equal(parsed.explanationHtml, null);
});

test('0.1.3 explanation: whitespace-only qti-content-body returns null', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ws" title="WS">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body>   \n  </qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;
  const parsed = renderQtiItemForExplanations(xml, 'item-ws');
  assert.equal(parsed.explanationHtml, null);
});

test('0.1.3 explanation: comment-only qti-content-body returns null', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-co" title="CO">
  <qti-item-body><qti-p>body</qti-p></qti-item-body>
  <qti-modal-feedback identifier="EXPLANATION" outcome-identifier="FEEDBACK">
    <qti-content-body><!-- foo --></qti-content-body>
  </qti-modal-feedback>
</qti-assessment-item>`;
  const parsed = renderQtiItemForExplanations(xml, 'item-co');
  assert.equal(parsed.explanationHtml, null);
});

test('0.1.3 extractInteractions: extended-text preserves newlines and surrounding whitespace', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ws2" title="WS2">
  <qti-response-declaration identifier="LONG" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>  first line\n    indented\n  last  </qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-extended-text-interaction response-identifier="LONG"/>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  const long = findInteraction(parsed, 'LONG');
  assert.equal(long.correctResponse[0], '  first line\n    indented\n  last  ');
});

test('0.1.3 extractInteractions: legacy ordered RESPONSE distribution under strict conditions', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ord" title="Ordered">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
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
  const a = findInteraction(parsed, 'RESPONSE_1');
  const b = findInteraction(parsed, 'RESPONSE_2');
  assert.equal(a.declarationIdentifier, 'RESPONSE');
  assert.equal(a.declarationValueIndex, 0);
  assert.deepEqual(a.correctResponse, ['first']);
  assert.equal(b.declarationIdentifier, 'RESPONSE');
  assert.equal(b.declarationValueIndex, 1);
  assert.deepEqual(b.correctResponse, ['second']);
});

// ----------------- Negative cases -----------------

test('0.1.3 extractInteractions (negative): unrelated LOOSE declaration does not bind to RESPONSE_1', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-loose" title="Loose">
  <qti-response-declaration identifier="LOOSE" cardinality="ordered" base-type="string">
    <qti-correct-response><qti-value>oops</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p><qti-text-entry-interaction response-identifier="RESPONSE_1"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  const interaction = findInteraction(parsed, 'RESPONSE_1');
  assert.equal(interaction.declarationIdentifier, null);
  assert.equal(interaction.declarationValueIndex, null);
  assert.deepEqual(interaction.correctResponse, []);
});

test('0.1.3 extractInteractions (negative): ANSWER declaration with RESPONSE_1 interaction does not bind', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-ans" title="ANS">
  <qti-response-declaration identifier="ANSWER" cardinality="ordered" base-type="string">
    <qti-correct-response><qti-value>only</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p><qti-text-entry-interaction response-identifier="RESPONSE_1"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  const interaction = findInteraction(parsed, 'RESPONSE_1');
  assert.equal(interaction.declarationIdentifier, null);
  assert.deepEqual(interaction.correctResponse, []);
});

test('0.1.3 extractInteractions (negative): cardinality=single shared RESPONSE does not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cs" title="CS">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>only</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_2').correctResponse, []);
  assert.equal(findInteraction(parsed, 'RESPONSE_1').declarationIdentifier, null);
  assert.equal(findInteraction(parsed, 'RESPONSE_2').declarationIdentifier, null);
});

test('0.1.3 extractInteractions (negative): cardinality=multiple shared RESPONSE does not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-cm" title="CM">
  <qti-response-declaration identifier="RESPONSE" cardinality="multiple" base-type="string">
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
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_2').correctResponse, []);
});

test('0.1.3 extractInteractions (negative): mixed choice+text-entry on shared RESPONSE does not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-mix" title="Mix">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
    <qti-correct-response>
      <qti-value>first</qti-value>
      <qti-value>second</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-choice-interaction response-identifier="CHOICE" max-choices="1">
      <qti-simple-choice identifier="A">A</qti-simple-choice>
    </qti-choice-interaction>
    <qti-p><qti-text-entry-interaction response-identifier="RESPONSE_1"/></qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(findInteraction(parsed, 'CHOICE').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
});

test('0.1.3 extractInteractions (negative): gap in RESPONSE_N numbering does not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-gap" title="Gap">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
    <qti-correct-response>
      <qti-value>first</qti-value>
      <qti-value>second</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_3"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_3').correctResponse, []);
});

test('0.1.3 extractInteractions (negative): value count mismatch does not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-mis" title="Mismatch">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
    <qti-correct-response>
      <qti-value>first</qti-value>
      <qti-value>second</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
      C <qti-text-entry-interaction response-identifier="RESPONSE_3"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_2').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_3').correctResponse, []);
});

test('0.1.3 extractInteractions (negative): two competing loose declarations do not distribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-2l" title="Two Loose">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
    <qti-correct-response><qti-value>a</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="LOOSE" cardinality="ordered" base-type="string">
    <qti-correct-response><qti-value>b</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_1').correctResponse, []);
  assert.deepEqual(findInteraction(parsed, 'RESPONSE_2').correctResponse, []);
});

test('0.1.3 extractInteractions (negative): direct RESPONSE_1 wins, RESPONSE_2 not distributed', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-mx" title="Mixed">
  <qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="string">
    <qti-correct-response>
      <qti-value>a</qti-value>
      <qti-value>b</qti-value>
    </qti-correct-response>
  </qti-response-declaration>
  <qti-response-declaration identifier="RESPONSE_1" cardinality="single" base-type="string">
    <qti-correct-response><qti-value>direct</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-p>
      A <qti-text-entry-interaction response-identifier="RESPONSE_1"/>
      B <qti-text-entry-interaction response-identifier="RESPONSE_2"/>
    </qti-p>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  const direct = findInteraction(parsed, 'RESPONSE_1');
  assert.equal(direct.declarationIdentifier, 'RESPONSE_1');
  assert.equal(direct.declarationValueIndex, null);
  assert.deepEqual(direct.correctResponse, ['direct']);
  const other = findInteraction(parsed, 'RESPONSE_2');
  assert.deepEqual(other.correctResponse, []);
  assert.equal(other.declarationIdentifier, null);
});

test('0.1.3 extractInteractions: unknown interaction type falls back to "other"', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqti_v3p0" identifier="item-up" title="Upload">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="file">
    <qti-correct-response><qti-value>file.pdf</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <qti-upload-interaction response-identifier="RESPONSE"/>
  </qti-item-body>
</qti-assessment-item>`;
  const parsed = renderQtiItemForScoring(xml);
  const interaction = findInteraction(parsed, 'RESPONSE');
  assert.equal(interaction.type, 'other');
  // The direct match still applies, so the binding is populated; we only assert
  // that the type-detection fallback is "other" and the structural fields are
  // well-formed.
  assert.equal(interaction.declarationIdentifier, 'RESPONSE');
  assert.equal(interaction.declarationValueIndex, null);
  assert.equal(interaction.cardinality, 'single');
  assert.equal(interaction.baseType, 'file');
  assert.deepEqual(interaction.correctResponse, ['file.pdf']);
  assert.deepEqual(interaction.choices, []);
  assert.equal(interaction.maxChoices, null);
});
