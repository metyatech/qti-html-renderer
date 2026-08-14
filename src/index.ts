import { DOMParser as XmlDomParser } from '@xmldom/xmldom';
import { resolveRelativePath } from 'qti-xml-core';

export interface RubricCriterion {
  index: number;
  points: number;
  text: string;
}

export interface ChoiceOption {
  identifier: string;
  text: string;
}

export type InteractionType = 'choice' | 'text-entry' | 'extended-text' | 'other';

export type Cardinality = 'single' | 'multiple' | 'ordered';

export interface InteractionInfo {
  id: string;
  type: InteractionType;
  declarationIdentifier: string | null;
  declarationValueIndex: number | null;
  cardinality: Cardinality | null;
  baseType: string | null;
  correctResponse: string[];
  choices: ChoiceOption[];
  maxChoices: number | null;
}

export interface ParsedItemForScoring {
  identifier: string;
  title: string;
  promptHtml: string;
  rubricCriteria: RubricCriterion[];
  choices: ChoiceOption[];
  interactions: InteractionInfo[];
  candidateExplanationHtml: string | null;
}

export interface ParsedItemForReport {
  identifier: string;
  title: string;
  questionHtml: string;
  rubricCriteria: RubricCriterion[];
  itemMaxScore: number;
  choices: ChoiceOption[];
  interactions: InteractionInfo[];
  explanationHtml: string | null;
}

export interface ParsedItemForExplanations {
  identifier: string;
  title: string;
  explanationHtml: string | null;
}

export interface ScoringRenderOptions {
  blankRenderer?: (index: number) => string;
  extendedTextRenderer?: () => string;
  choiceListClassName?: string;
  preWithBlanksClassName?: string;
}

export interface CodeHighlightResult {
  language: string;
  html: string;
}

export interface ReportRenderOptions {
  clozeInputHtml?: string;
  choiceWrapperClassName?: string;
  codeBlockClassName?: string;
  codeBlockCodeClassName?: string;
  inlineCodeClassName?: string;
  dataCodeLangAttribute?: string;
  itemBodyWrapperClassName?: string;
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult;
}

export interface ExplanationRenderOptions {
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult;
}

export interface HtmlDomParser {
  parseFromString(html: string, mimeType: string): Document;
}

export interface HtmlTransformOptions {
  domParser?: HtmlDomParser;
}

export interface RewriteImageSourcesOptions extends HtmlTransformOptions {
  resolveUrl: (resolvedPath: string, originalSrc: string) => string;
  isExternalSource?: (src: string) => boolean;
}

const defaultScoringOptions: Required<ScoringRenderOptions> = {
  blankRenderer: (index) =>
    `<input class="qti-blank-input" data-blank="${index}" type="text" size="6" disabled aria-label="blank ${index}" />`,
  extendedTextRenderer: () => '<span class="qti-extended-placeholder">（記述）</span>',
  choiceListClassName: 'qti-choice-list',
  preWithBlanksClassName: 'qti-pre-with-blanks',
};

const defaultReportOptions: Required<Omit<ReportRenderOptions, 'codeHighlighter'>> = {
  clozeInputHtml: '<input class=cloze-input type=text readonly aria-label=blank>',
  choiceWrapperClassName: 'choice-interaction',
  codeBlockClassName: 'code-block hljs',
  codeBlockCodeClassName: 'code-block-code',
  inlineCodeClassName: 'code-inline',
  dataCodeLangAttribute: 'data-code-lang',
  itemBodyWrapperClassName: 'item-body',
};

const NODE_TYPES = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
};

// Local names that render to something visible on their own, even with no
// children (void / self-displaying HTML elements).
const SELF_DISPLAYING_LOCAL_NAMES = new Set(['img', 'hr', 'br']);
const VOID_HTML_LOCAL_NAMES = new Set(['img', 'hr', 'br']);

// Local names that every renderer in this module converts to an empty string,
// regardless of their descendants. They never contribute meaningful content.
const RENDERS_EMPTY_LOCAL_NAMES = new Set(['qti-rubric-block']);

// Recursively decide whether a node would render any displayable content.
// Rules:
//   - a non-whitespace text node is meaningful
//   - comment / processing-instruction nodes are ignored
//   - self-displaying elements (img, hr, br) are meaningful by themselves
//   - elements every renderer collapses to '' are never meaningful
//   - container elements (p, div, list, table, ...) are meaningful only when a
//     descendant is meaningful
const isMeaningfulNode = (node: Node): boolean => {
  if (node.nodeType === NODE_TYPES.TEXT_NODE) {
    return (node.textContent?.trim() ?? '') !== '';
  }
  if (node.nodeType !== NODE_TYPES.ELEMENT_NODE) return false;
  const el = node as Element;
  const localName = el.localName.toLowerCase();
  if (RENDERS_EMPTY_LOCAL_NAMES.has(localName)) return false;
  if (SELF_DISPLAYING_LOCAL_NAMES.has(localName)) return true;
  return Array.from(el.childNodes).some(isMeaningfulNode);
};

const hasMeaningfulContent = (body: Element): boolean => Array.from(body.childNodes).some(isMeaningfulNode);

const resolveHtmlDomParser = (domParser?: HtmlDomParser): HtmlDomParser => {
  if (domParser) return domParser;
  if (typeof globalThis.DOMParser === 'function') {
    return new globalThis.DOMParser();
  }
  throw new Error('DOMParser is not available. Provide a domParser option (e.g. from linkedom/jsdom).');
};

const defaultIsExternalSource = (src: string) =>
  /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/');

const parseXml = (xml: string): Document => {
  if (typeof globalThis.DOMParser === 'function') {
    return new globalThis.DOMParser().parseFromString(xml, 'application/xml');
  }
  return new XmlDomParser().parseFromString(xml, 'application/xml') as unknown as Document;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const serializeAttributes = (el: Element, extraClassNames: string[] = []): string => {
  const classesToAdd = extraClassNames.flatMap((className) => className.split(/\s+/)).filter(Boolean);
  let hasClassAttribute = false;
  const attributes = Array.from(el.attributes)
    .filter((attr) => !(attr.name === 'xmlns' || attr.name.startsWith('xmlns:')))
    .map((attr) => {
      if (attr.name === 'class' && classesToAdd.length > 0) {
        hasClassAttribute = true;
        const classes = [...new Set([...attr.value.split(/\s+/).filter(Boolean), ...classesToAdd])].join(' ');
        return ` ${attr.name}="${escapeHtml(classes)}"`;
      }
      return ` ${attr.name}="${escapeHtml(attr.value)}"`;
    })
    .join('');
  if (classesToAdd.length > 0 && !hasClassAttribute) {
    return `${attributes} class="${escapeHtml(classesToAdd.join(' '))}"`;
  }
  return attributes;
};

const hasDescendantWithLocalName = (root: Element, localName: string): boolean =>
  Array.from(root.getElementsByTagName('*')).some((element) => element.localName === localName);

const getElementsByLocalName = (root: Element, localName: string) => {
  const withNamespace = Array.from(root.getElementsByTagNameNS('*', localName));
  if (withNamespace.length > 0) return withNamespace;
  return Array.from(root.getElementsByTagName(localName));
};

const parseCriterionText = (rawText: string): { points: number; text: string } => {
  const trimmed = rawText.trim();
  const match = trimmed.match(/^\[(\d+(?:\.\d+)?)\]\s*(.*)$/);
  if (!match) {
    return { points: 0, text: trimmed };
  }
  return { points: Number.parseFloat(match[1]), text: match[2].trim() };
};

const extractRubricCriteria = (itemBody: Element): RubricCriterion[] => {
  const rubricBlocks = getElementsByLocalName(itemBody, 'qti-rubric-block');
  const scorer = rubricBlocks.find((block) => block.getAttribute('view') === 'scorer');
  if (!scorer) return [];
  const lines = getElementsByLocalName(scorer, 'p');
  const criteria: RubricCriterion[] = [];
  for (const line of lines) {
    const text = line.textContent?.trim() ?? '';
    const parsed = parseCriterionText(text);
    criteria.push({ index: criteria.length + 1, points: parsed.points, text: parsed.text });
  }
  return criteria;
};

const extractChoices = (itemBody: Element): ChoiceOption[] => {
  const choices = getElementsByLocalName(itemBody, 'qti-simple-choice');
  return choices.map((choice) => ({
    identifier: choice.getAttribute('identifier') ?? '',
    text: choice.textContent?.trim() ?? '',
  }));
};

const inferInteractionType = (localName: string): InteractionType => {
  const lowered = localName.toLowerCase();
  if (lowered === 'qti-choice-interaction' || lowered === 'choice-interaction') return 'choice';
  if (lowered === 'qti-text-entry-interaction' || lowered === 'text-entry-interaction') return 'text-entry';
  if (lowered === 'qti-extended-text-interaction' || lowered === 'extended-text-interaction') return 'extended-text';
  if (lowered.includes('interaction')) return 'other';
  return 'other';
};

const normalizeCardinality = (raw: string | null): Cardinality | null => {
  if (raw === 'single' || raw === 'multiple' || raw === 'ordered') return raw;
  return null;
};

const normalizeNewlines = (value: string): string => value.replace(/\r\n?/g, '\n');

// Normalize a single qti-value's text according to its declaration base-type.
// All newline styles are normalized to "\n" first. Only `base-type="string"`
// preserves surrounding whitespace / indentation / blank lines; every other
// base-type (identifier, boolean, integer, float, ... and the unspecified
// case) trims surrounding whitespace because that whitespace is never part of
// the value for those types.
const normalizeCorrectValue = (raw: string, baseType: string | null): string => {
  const newlineNormalized = normalizeNewlines(raw);
  if (baseType === 'string') return newlineNormalized;
  return newlineNormalized.trim();
};

const readDeclarationValues = (declaration: Element, baseType: string | null): string[] => {
  const correctResponse = getElementsByLocalName(declaration, 'qti-correct-response')[0];
  if (!correctResponse) return [];
  return getElementsByLocalName(correctResponse, 'qti-value').map((value) =>
    normalizeCorrectValue(value.textContent ?? '', baseType),
  );
};

const collectInteractionChoices = (interaction: Element): ChoiceOption[] => {
  return getElementsByLocalName(interaction, 'qti-simple-choice').map((choice) => ({
    identifier: choice.getAttribute('identifier') ?? '',
    text: choice.textContent?.trim() ?? '',
  }));
};

const parseMaxChoices = (raw: string | null): number | null => {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLegacyOrderedResponse = (
  declaration: { identifier: string; cardinality: Cardinality | null; baseType: string | null },
  unmatchedInteractionIds: string[],
): boolean => {
  if (declaration.identifier !== 'RESPONSE') return false;
  if (declaration.cardinality !== 'ordered') return false;
  if (declaration.baseType !== 'string') return false;
  if (unmatchedInteractionIds.length === 0) return false;
  for (let index = 0; index < unmatchedInteractionIds.length; index += 1) {
    if (unmatchedInteractionIds[index] !== `RESPONSE_${index + 1}`) return false;
  }
  return true;
};

const extractInteractions = (root: Element): InteractionInfo[] => {
  const responseDeclarations = getElementsByLocalName(root, 'qti-response-declaration');
  // Track both the effective (last-wins-when-unambiguous) declaration map and
  // the raw duplicate-identifier count. When two or more response-declaration
  // elements share the same identifier the QTI structure is ambiguous: the
  // renderer must not silently pick one and discard the others, so the
  // interaction binding for that identifier is treated as unresolved.
  const declarationByIdentifier = new Map<
    string,
    { identifier: string; cardinality: Cardinality | null; baseType: string | null; values: string[] }
  >();
  const declarationElementCountByIdentifier = new Map<string, number>();
  for (const decl of responseDeclarations) {
    // Declarations whose identifier attribute is missing or empty are
    // unusable for binding — they cannot be matched to an interaction
    // response-identifier. Skip them silently so the function never
    // throws on otherwise parseable QTI input; the corresponding
    // interaction (if any) is reported as unmatched in the result.
    const identifier = decl.getAttribute('identifier');
    if (!identifier) continue;
    const baseType = decl.getAttribute('base-type');
    declarationByIdentifier.set(identifier, {
      identifier,
      cardinality: normalizeCardinality(decl.getAttribute('cardinality')),
      baseType,
      values: readDeclarationValues(decl, baseType),
    });
    declarationElementCountByIdentifier.set(identifier, (declarationElementCountByIdentifier.get(identifier) ?? 0) + 1);
  }
  const hasDuplicateDeclaration = (identifier: string): boolean =>
    (declarationElementCountByIdentifier.get(identifier) ?? 0) > 1;

  const itemBody = getElementsByLocalName(root, 'qti-item-body')[0];
  if (!itemBody) return [];

  // Gather every interaction element under qti-item-body in document order,
  // regardless of qti- prefix.
  const allTags = Array.from(itemBody.getElementsByTagName('*'));
  const interactionElements = allTags.filter((el) => el.localName.toLowerCase().includes('interaction'));

  const interactionInfo = interactionElements.map((el) => {
    const responseId = el.getAttribute('response-identifier') ?? '';
    const type = inferInteractionType(el.localName);
    return {
      el,
      responseId,
      type,
      isChoice: type === 'choice',
      maxChoices: type === 'choice' ? parseMaxChoices(el.getAttribute('max-choices')) : null,
      choices: type === 'choice' ? collectInteractionChoices(el) : [],
    };
  });

  // A direct identifier match is only trustworthy when exactly one
  // qti-response-declaration element carried that identifier. Duplicates
  // surface as ambiguous; their interactions are reported as unmatched so
  // consumers can flag the item instead of trusting a last-wins fallback.
  const trustworthyDirectMatchIds = new Set<string>();
  for (const info of interactionInfo) {
    if (info.responseId && declarationByIdentifier.has(info.responseId) && !hasDuplicateDeclaration(info.responseId)) {
      trustworthyDirectMatchIds.add(info.responseId);
    }
  }

  const unmatchedInfo = interactionInfo.filter(
    (info) => info.responseId && !trustworthyDirectMatchIds.has(info.responseId),
  );
  const unmatchedIds = unmatchedInfo.map((info) => info.responseId);

  let legacyDistribution: Map<string, number> | null = null;
  // The legacy ordered RESPONSE distribution only applies when the item is the
  // pure cloze shape it was designed for:
  //   1. There is exactly one qti-response-declaration element in the XML
  //      (responseDeclarations.length === 1). A Map.size check is not
  //      sufficient: two declarations sharing the same identifier collapse to
  //      a single entry and would pass an equality test that the XML does
  //      not actually satisfy.
  //   2. Its identifier is exactly RESPONSE with cardinality="ordered" and
  //      base-type="string".
  //   3. No interaction matches a declaration directly.
  //   4. Every interaction in the item is unmatched.
  //   5. Every interaction's published type is exactly text-entry (custom /
  //      non-standard interactions reported as "other" are excluded).
  //   6. The unmatched response-identifiers are RESPONSE_1..RESPONSE_N in
  //      document order with no gaps or duplicates.
  //   7. The value count equals the interaction count.
  // If any of these conditions fails — in particular when multiple
  // qti-response-declaration elements exist or when a literal RESPONSE
  // interaction matches directly — the fallback does not fire and the
  // affected interactions stay unmatched.
  const hasSingleResponseDeclaration = responseDeclarations.length === 1;
  const hasSingleDeclarationInMap = declarationByIdentifier.size === 1;
  const noDirectMatches = trustworthyDirectMatchIds.size === 0;
  const everyInteractionIsUnmatched = unmatchedInfo.length === interactionInfo.length;
  const everyInteractionIsTextEntry =
    interactionInfo.length > 0 && interactionInfo.every((info) => info.type === 'text-entry');
  if (
    hasSingleResponseDeclaration &&
    hasSingleDeclarationInMap &&
    noDirectMatches &&
    everyInteractionIsUnmatched &&
    everyInteractionIsTextEntry
  ) {
    const soleDeclaration = [...declarationByIdentifier.values()][0];
    if (
      soleDeclaration !== undefined &&
      isLegacyOrderedResponse(soleDeclaration, unmatchedIds) &&
      soleDeclaration.values.length === interactionInfo.length
    ) {
      legacyDistribution = new Map<string, number>();
      unmatchedInfo.forEach((info, index) => {
        legacyDistribution!.set(info.responseId, index);
      });
    }
  }

  return interactionInfo.map((info) => {
    if (!info.responseId) {
      return {
        id: '',
        type: info.type,
        declarationIdentifier: null,
        declarationValueIndex: null,
        cardinality: null,
        baseType: null,
        correctResponse: [],
        choices: info.choices,
        maxChoices: info.maxChoices,
      };
    }

    const directDeclaration = declarationByIdentifier.get(info.responseId);
    // A direct match is only honored when the identifier was carried by
    // exactly one qti-response-declaration element. Trustworthy ids were
    // collected up front; anything else is ambiguous and falls through to
    // the unmatched path.
    if (directDeclaration && trustworthyDirectMatchIds.has(info.responseId)) {
      return {
        id: info.responseId,
        type: info.type,
        declarationIdentifier: directDeclaration.identifier,
        declarationValueIndex: null,
        cardinality: directDeclaration.cardinality,
        baseType: directDeclaration.baseType,
        correctResponse: [...directDeclaration.values],
        choices: info.choices,
        maxChoices: info.maxChoices,
      };
    }

    if (legacyDistribution && legacyDistribution.has(info.responseId)) {
      const soleDeclaration = [...declarationByIdentifier.values()][0];
      const valueIndex = legacyDistribution.get(info.responseId)!;
      const value = soleDeclaration.values[valueIndex];
      return {
        id: info.responseId,
        type: info.type,
        declarationIdentifier: soleDeclaration.identifier,
        declarationValueIndex: valueIndex,
        cardinality: soleDeclaration.cardinality,
        baseType: soleDeclaration.baseType,
        correctResponse: value === undefined ? [] : [value],
        choices: info.choices,
        maxChoices: info.maxChoices,
      };
    }

    return {
      id: info.responseId,
      type: info.type,
      declarationIdentifier: null,
      declarationValueIndex: null,
      cardinality: null,
      baseType: null,
      correctResponse: [],
      choices: info.choices,
      maxChoices: info.maxChoices,
    };
  });
};

const renderNodeForScoring = (
  node: Node,
  options: Required<ScoringRenderOptions>,
  blankCounter: { value: number },
  inPre = false,
  preserveWhitespace = false,
): string => {
  if (node.nodeType === NODE_TYPES.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (inPre && !preserveWhitespace && text.trim() === '') {
      return '';
    }
    return escapeHtml(text);
  }
  if (node.nodeType !== NODE_TYPES.ELEMENT_NODE) return '';
  const el = node as Element;
  const name = el.localName;
  const renderChildren = (nextInPre = inPre, nextPreserve = preserveWhitespace) =>
    Array.from(el.childNodes)
      .map((child) => renderNodeForScoring(child, options, blankCounter, nextInPre, nextPreserve))
      .join('');

  switch (name) {
    case 'pre': {
      const hasBlank = hasDescendantWithLocalName(el, 'qti-text-entry-interaction');
      const attrs = serializeAttributes(el, hasBlank ? [options.preWithBlanksClassName] : []);
      return `<pre${attrs}>${renderChildren(true, false)}</pre>`;
    }
    case 'code': {
      const attrs = serializeAttributes(el);
      return `<code${attrs}>${renderChildren(inPre, true)}</code>`;
    }
    case 'img':
    case 'br':
    case 'hr': {
      const attrs = serializeAttributes(el);
      return `<${name}${attrs} />`;
    }
    case 'qti-text-entry-interaction': {
      const idx = ++blankCounter.value;
      const responseId = el.getAttribute('response-identifier') ?? '';
      // data-interaction-id を追加して、親のハンドラが識別できるようにする
      // また、class にも識別用クラスを追加
      const defaultHtml = options.blankRenderer(idx);
      // 単純な置換だと危険なので、inputタグである前提で属性を注入
      return defaultHtml.replace('<input', `<input data-interaction-id="${escapeHtml(responseId)}"`);
    }
    case 'qti-extended-text-interaction':
      return options.extendedTextRenderer();
    case 'qti-choice-interaction': {
      const responseId = el.getAttribute('response-identifier') ?? '';
      const choices = getElementsByLocalName(el, 'qti-simple-choice');
      const listItems = choices
        .map((choice) => {
          const id = choice.getAttribute('identifier') ?? '';
          const text = Array.from(choice.childNodes)
            .map((child) => renderNodeForScoring(child, options, blankCounter))
            .join('');
          return `<li data-choice="${escapeHtml(id)}" data-identifier="${escapeHtml(id)}">${text}</li>`;
        })
        .join('');
      // 親コンテナに interaction ID を持たせる
      return `<ol class="${options.choiceListClassName}" data-interaction-id="${escapeHtml(responseId)}">${listItems}</ol>`;
    }
    case 'qti-rubric-block':
      return '';
    case 'qti-content-body':
      return renderChildren();
    default:
      if (name.startsWith('qti-')) return renderChildren();
      {
        const attrs = serializeAttributes(el);
        return `<${name}${attrs}>${renderChildren()}</${name}>`;
      }
  }
};

// Internal-only shared helper (not exported). Turns a list of QTI flow-content
// child nodes into HTML using the scoring render rules. Both the scoring prompt
// renderer and the explanation body renderer go through this single code path.
const renderFlowContentChildren = (
  nodes: Node[],
  options: Required<ScoringRenderOptions>,
  blankCounter: { value: number },
): string => nodes.map((node) => renderNodeForScoring(node, options, blankCounter)).join('');

const parseCandidateExplanation = (root: Element, options: Required<ScoringRenderOptions>): string | null => {
  const modalFeedbacks = getElementsByLocalName(root, 'qti-modal-feedback');
  const explanationFeedback =
    modalFeedbacks.find(
      (feedback) =>
        feedback.getAttribute('identifier') === 'EXPLANATION' &&
        feedback.getAttribute('outcome-identifier') === 'FEEDBACK',
    ) ?? modalFeedbacks.find((feedback) => feedback.getAttribute('identifier') === 'EXPLANATION');

  if (!explanationFeedback) return null;
  const contentBody = getElementsByLocalName(explanationFeedback, 'qti-content-body')[0];
  if (!contentBody) return null;
  if (!hasMeaningfulContent(contentBody)) return null;
  const blankCounter = { value: 0 };
  return renderFlowContentChildren(Array.from(contentBody.childNodes), options, blankCounter);
};

export const renderQtiItemForScoring = (xml: string, options: ScoringRenderOptions = {}): ParsedItemForScoring => {
  const resolved = { ...defaultScoringOptions, ...options };
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') {
    throw new Error('QTI item XML parse failed');
  }
  const identifier = root.getAttribute('identifier') ?? '';
  const title = root.getAttribute('title') ?? identifier;
  const itemBody = getElementsByLocalName(root, 'qti-item-body')[0];
  if (!itemBody) {
    throw new Error('qti-item-body not found');
  }
  const blankCounter = { value: 0 };
  const promptHtml = renderFlowContentChildren(Array.from(itemBody.childNodes), resolved, blankCounter);
  const rubricCriteria = extractRubricCriteria(itemBody);
  const choices = extractChoices(itemBody);
  const interactions = extractInteractions(root);
  const candidateExplanationHtml = parseCandidateExplanation(root, resolved);

  return {
    identifier,
    title,
    promptHtml,
    rubricCriteria,
    choices,
    interactions,
    candidateExplanationHtml,
  };
};

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const parseAttributes = (tagOpen: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = attributePattern.exec(tagOpen);
  while (match) {
    const value = match[2] ?? match[3] ?? '';
    attributes[match[1]] = value;
    match = attributePattern.exec(tagOpen);
  }
  return attributes;
};

const addOrUpdateAttribute = (tagOpen: string, attributeName: string, attributeValue: string): string => {
  const attributePattern = new RegExp(`\\s${attributeName}="[^"]*"`);
  if (attributePattern.test(tagOpen)) {
    return tagOpen.replace(attributePattern, ` ${attributeName}="${attributeValue}"`);
  }
  return tagOpen.replace(/^<([A-Za-z0-9-]+)/, `<$1 ${attributeName}="${attributeValue}"`);
};

const addClasses = (tagOpen: string, classNames: string[]): string => {
  const attributes = parseAttributes(tagOpen);
  const existing = attributes.class ?? '';
  const merged = new Set(existing.split(/\s+/).filter((token) => token.length > 0));
  classNames.forEach((token) => merged.add(token));
  return addOrUpdateAttribute(tagOpen, 'class', Array.from(merged).join(' '));
};

const detectCodeLanguageFromOpenTag = (tagOpen: string): string | null => {
  const attributes = parseAttributes(tagOpen);
  const fromData = attributes['data-lang'] ?? attributes['data-language'] ?? attributes['data-code-lang'];
  if (fromData) return fromData.trim();
  const classAttr = attributes.class;
  if (!classAttr) return null;
  const tokens = classAttr.split(/\s+/);
  for (const token of tokens) {
    const match = token.match(/^(?:language|lang)-([A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  }
  return null;
};

const normalizeLanguageForReport = (language: string): string => {
  const normalized = language.toLowerCase();
  if (normalized === 'xml') return 'html';
  if (normalized === 'plaintext') return 'plain';
  return normalized;
};

const enhanceCodeBlocks = (
  htmlFragment: string,
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult,
): string => {
  const preCodePattern = /(<pre\b[^>]*>)(\s*)(<code\b[^>]*>)([\s\S]*?)(<\/code>)/g;
  return htmlFragment.replace(preCodePattern, (_match, preOpen, whitespace, codeOpen, codeContent, codeClose) => {
    const explicitLanguage = detectCodeLanguageFromOpenTag(codeOpen);
    let language = explicitLanguage ? normalizeLanguageForReport(explicitLanguage) : 'plain';
    let content = codeContent;
    const containsChildElementMarkup = /<[A-Za-z][^>]*>/.test(codeContent);
    if (codeHighlighter && !containsChildElementMarkup) {
      const highlighted = codeHighlighter(decodeXmlEntities(codeContent), explicitLanguage);
      language = normalizeLanguageForReport(highlighted.language ?? language);
      content = highlighted.html.length > 0 ? highlighted.html : codeContent;
    }
    const enhancedPre = addOrUpdateAttribute(
      addClasses(preOpen, options.codeBlockClassName.split(/\s+/)),
      options.dataCodeLangAttribute,
      language,
    );
    const enhancedCode = addOrUpdateAttribute(
      addClasses(codeOpen, options.codeBlockCodeClassName.split(/\s+/)),
      options.dataCodeLangAttribute,
      language,
    );
    return `${enhancedPre}${whitespace}${enhancedCode}${content}${codeClose}`;
  });
};

const enhanceInlineCode = (
  htmlFragment: string,
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
): string => {
  const codeOpenPattern = /<code\b[^>]*>/g;
  return htmlFragment.replace(codeOpenPattern, (codeOpen) => {
    const attributes = parseAttributes(codeOpen);
    const existingClasses = attributes.class ?? '';
    if (existingClasses.split(/\s+/).includes(options.codeBlockCodeClassName)) {
      return codeOpen;
    }
    const language = detectCodeLanguageFromOpenTag(codeOpen);
    const enhancedCode = addClasses(codeOpen, options.inlineCodeClassName.split(/\s+/));
    if (!language) return enhancedCode;
    return addOrUpdateAttribute(enhancedCode, options.dataCodeLangAttribute, normalizeLanguageForReport(language));
  });
};

// Internal-only shared helper. Renders the children of a `qti-content-body` (or
// any other report-style flow content) with the report path's class and
// code-highlighting contract, wrapping the result in `<div class="item-body">`
// when requested. Used by both the report body and the explanation renderer so
// they produce structurally identical output.
const renderQtiExplanationBody = (
  bodyChildren: Node[],
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult,
): string => {
  const rawBody = bodyChildren.map((node) => renderNodeForReport(node, options)).join('');
  const wrappedHtml = `<div class="${options.itemBodyWrapperClassName}">${rawBody}</div>`;
  const withCodeBlocks = enhanceCodeBlocks(wrappedHtml, options, codeHighlighter);
  return enhanceInlineCode(withCodeBlocks, options);
};

const renderNodeForReport = (
  node: Node,
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
  inPre = false,
  preserveWhitespace = false,
): string => {
  if (node.nodeType === NODE_TYPES.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (inPre && !preserveWhitespace && text.trim() === '') {
      return '';
    }
    return escapeHtml(text);
  }
  if (node.nodeType !== NODE_TYPES.ELEMENT_NODE) return '';
  const el = node as Element;
  const name = el.localName;
  const renderChildren = (nextInPre = inPre, nextPreserve = preserveWhitespace) =>
    Array.from(el.childNodes)
      .map((child) => renderNodeForReport(child, options, nextInPre, nextPreserve))
      .join('');

  switch (name) {
    case 'qti-rubric-block':
      return '';
    case 'qti-choice-interaction': {
      const classAttr = options.choiceWrapperClassName ? ` class="${escapeHtml(options.choiceWrapperClassName)}"` : '';
      const responseId = el.getAttribute('response-identifier') ?? '';
      const idAttr = responseId ? ` data-interaction-id="${escapeHtml(responseId)}"` : '';
      return `<div${classAttr}${idAttr}>${renderChildren()}</div>`;
    }
    case 'qti-text-entry-interaction': {
      const responseId = el.getAttribute('response-identifier') ?? '';
      const html = options.clozeInputHtml;
      if (!responseId || !html.includes('<input')) return html;
      return html.replace('<input', `<input data-interaction-id="${escapeHtml(responseId)}"`);
    }
    case 'qti-extended-text-interaction':
      return '';
    case 'pre': {
      const attrs = serializeAttributes(el);
      return `<pre${attrs}>${renderChildren(true, false)}</pre>`;
    }
    case 'code': {
      const attrs = serializeAttributes(el);
      return `<code${attrs}>${renderChildren(inPre, true)}</code>`;
    }
    case 'img': {
      const attrs = serializeAttributes(el);
      return `<img${attrs} />`;
    }
    case 'hr':
    case 'br': {
      const attrs = serializeAttributes(el);
      return `<${name}${attrs} />`;
    }
    case 'qti-content-body':
      return renderChildren();
    default: {
      const tagName = name.startsWith('qti-') ? name.slice(4) : name;
      const attrs = serializeAttributes(el);
      if (VOID_HTML_LOCAL_NAMES.has(tagName)) return `<${tagName}${attrs} />`;
      return `<${tagName}${attrs}>${renderChildren()}</${tagName}>`;
    }
  }
};

export const renderQtiItemForReport = (
  xml: string,
  expectedIdentifier: string,
  options: ReportRenderOptions = {},
): ParsedItemForReport => {
  const resolved = { ...defaultReportOptions, ...options };
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') {
    throw new Error(`Invalid assessment item: XML parse failed for ${expectedIdentifier}`);
  }
  const identifier = root.getAttribute('identifier') ?? '';
  const title = root.getAttribute('title') ?? expectedIdentifier;
  if (!identifier) {
    throw new Error(`Invalid assessment item: identifier missing in ${expectedIdentifier}`);
  }
  if (identifier !== expectedIdentifier) {
    throw new Error(`Assessment item identifier mismatch: expected ${expectedIdentifier} but found ${identifier}`);
  }
  const itemBody = getElementsByLocalName(root, 'qti-item-body')[0];
  if (!itemBody) {
    throw new Error(`Invalid assessment item: qti-item-body not found for ${identifier}`);
  }

  const rubricCriteria = extractRubricCriteria(itemBody);
  const itemMaxScore = rubricCriteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const questionHtml = renderQtiExplanationBody(Array.from(itemBody.childNodes), resolved, options.codeHighlighter);
  const choices = extractChoices(itemBody);
  const interactions = extractInteractions(root);
  const explanationHtml = parseExplanationBody(root, resolved, options.codeHighlighter);

  return {
    identifier,
    title,
    questionHtml,
    rubricCriteria,
    itemMaxScore,
    choices,
    interactions,
    explanationHtml,
  };
};

const parseExplanationBody = (
  root: Element,
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult,
): string | null => {
  const modalFeedbacks = getElementsByLocalName(root, 'qti-modal-feedback');
  const explanationFeedback =
    modalFeedbacks.find(
      (feedback) =>
        feedback.getAttribute('identifier') === 'EXPLANATION' &&
        feedback.getAttribute('outcome-identifier') === 'FEEDBACK',
    ) ?? modalFeedbacks.find((feedback) => feedback.getAttribute('identifier') === 'EXPLANATION');
  if (!explanationFeedback) return null;
  const contentBody = getElementsByLocalName(explanationFeedback, 'qti-content-body')[0];
  if (!contentBody) return null;
  if (!hasMeaningfulContent(contentBody)) return null;
  return renderQtiExplanationBody(Array.from(contentBody.childNodes), options, codeHighlighter);
};

export const renderQtiItemForExplanations = (
  xml: string,
  expectedIdentifier: string,
  options: ExplanationRenderOptions = {},
): ParsedItemForExplanations => {
  const resolved = { ...defaultReportOptions };
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') {
    throw new Error(`Invalid assessment item: XML parse failed for ${expectedIdentifier}`);
  }
  const identifier = root.getAttribute('identifier') ?? '';
  const title = root.getAttribute('title') ?? expectedIdentifier;
  if (!identifier) {
    throw new Error(`Invalid assessment item: identifier missing in ${expectedIdentifier}`);
  }
  if (identifier !== expectedIdentifier) {
    throw new Error(`Assessment item identifier mismatch: expected ${expectedIdentifier} but found ${identifier}`);
  }
  const itemBody = getElementsByLocalName(root, 'qti-item-body')[0];
  if (!itemBody) {
    throw new Error(`Invalid assessment item: qti-item-body not found for ${identifier}`);
  }

  const explanationHtml = parseExplanationBody(root, resolved, options.codeHighlighter);

  return {
    identifier,
    title,
    explanationHtml,
  };
};

const MIN_BLANK_SIZE = 6;

const normalizeResponses = (response: string | string[] | null | undefined): string[] => {
  if (response === null || response === undefined) return [];
  return Array.isArray(response) ? response : [response];
};

const computeBlankSize = (value: string): number => Math.max(MIN_BLANK_SIZE, value.length);

export const applyResponsesToPromptHtml = (
  promptHtml: string,
  response: string | string[] | null | undefined,
  options: HtmlTransformOptions = {},
): string => {
  if (!promptHtml.includes('qti-blank-input')) {
    return promptHtml;
  }

  const responses = normalizeResponses(response);
  if (responses.length === 0) {
    return promptHtml;
  }

  const parser = resolveHtmlDomParser(options.domParser);
  const doc = parser.parseFromString(promptHtml, 'text/html');
  const blanks = Array.from(doc.querySelectorAll<HTMLInputElement>('input.qti-blank-input'));
  if (blanks.length === 0) {
    return promptHtml;
  }

  blanks.forEach((blank, index) => {
    const value = responses[index];
    if (value === undefined) return;
    blank.setAttribute('value', value);
    blank.setAttribute('size', String(computeBlankSize(value)));
  });

  return doc.body.innerHTML;
};

export const rewriteHtmlImageSources = (
  html: string,
  baseFilePath: string,
  options: RewriteImageSourcesOptions,
): string => {
  const parser = resolveHtmlDomParser(options.domParser);
  const doc = parser.parseFromString(html, 'text/html');
  const images = doc.querySelectorAll('img[src]');
  const isExternalSource = options.isExternalSource ?? defaultIsExternalSource;

  images.forEach((img) => {
    const rawSrc = img.getAttribute('src');
    if (!rawSrc || isExternalSource(rawSrc)) return;
    const resolved = resolveRelativePath(baseFilePath, rawSrc);
    if (!resolved) return;
    img.setAttribute('src', options.resolveUrl(resolved, rawSrc));
  });

  return doc.body.innerHTML;
};
