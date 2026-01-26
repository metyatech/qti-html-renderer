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

export interface ParsedItemForScoring {
  identifier: string;
  title: string;
  promptHtml: string;
  rubricCriteria: RubricCriterion[];
  choices: ChoiceOption[];
  candidateExplanationHtml: string | null;
}

export interface ParsedItemForReport {
  identifier: string;
  title: string;
  questionHtml: string;
  rubricCriteria: RubricCriterion[];
  itemMaxScore: number;
  choices: ChoiceOption[];
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

const serializeAttributes = (el: Element): string => {
  const attributes = Array.from(el.attributes)
    .filter((attr) => !(attr.name === 'xmlns' || attr.name.startsWith('xmlns:')))
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join('');
  return attributes;
};

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
  const lines = getElementsByLocalName(scorer, 'qti-p');
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

const detectCodeLanguage = (codeOpen: Element): string | null => {
  const fromData =
    codeOpen.getAttribute('data-lang') ??
    codeOpen.getAttribute('data-language') ??
    codeOpen.getAttribute('data-code-lang');
  if (fromData) return fromData.trim();
  const classAttr = codeOpen.getAttribute('class');
  if (!classAttr) return null;
  const tokens = classAttr.split(/\s+/);
  for (const token of tokens) {
    const match = token.match(/^(?:language|lang)-([A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  }
  return null;
};

const normalizeLanguage = (language: string): string => {
  const normalized = language.toLowerCase();
  if (normalized === 'xml') return 'html';
  if (normalized === 'plaintext') return 'plain';
  return normalized;
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
    case 'qti-p':
      return `<p>${renderChildren()}</p>`;
    case 'qti-h3':
    case 'qti-h4':
    case 'qti-h5':
    case 'qti-h6': {
      const level = name.slice(-2);
      return `<${level}>${renderChildren()}</${level}>`;
    }
    case 'qti-em':
      return `<em>${renderChildren()}</em>`;
    case 'qti-strong':
      return `<strong>${renderChildren()}</strong>`;
    case 'qti-del':
      return `<del>${renderChildren()}</del>`;
    case 'qti-a': {
      const href = el.getAttribute('href');
      const title = el.getAttribute('title');
      const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a${hrefAttr}${titleAttr}>${renderChildren()}</a>`;
    }
    case 'qti-code':
      return `<code>${renderChildren(inPre, true)}</code>`;
    case 'qti-pre': {
      const isBlank = (child: Node) =>
        child.nodeType === NODE_TYPES.ELEMENT_NODE && (child as Element).localName === 'qti-text-entry-interaction';
      const significantNodes = Array.from(el.childNodes).filter((child) => {
        if (child.nodeType !== NODE_TYPES.TEXT_NODE) return true;
        return (child.textContent ?? '').trim() !== '';
      });
      const renderCodeInPre = (codeEl: Element, trimStart: boolean, trimEnd: boolean) => {
        let inner = Array.from(codeEl.childNodes)
          .map((child) => renderNodeForScoring(child, options, blankCounter, true, true))
          .join('');
        if (trimStart) {
          const leading = inner.match(/^\s+/)?.[0] ?? '';
          if (leading && !leading.includes('\n') && !leading.includes('\r')) {
            inner = inner.slice(leading.length);
          }
        }
        if (trimEnd) {
          const trailing = inner.match(/\s+$/)?.[0] ?? '';
          if (trailing && !trailing.includes('\n') && !trailing.includes('\r')) {
            inner = inner.slice(0, inner.length - trailing.length);
          }
        }
        return `<code>${inner}</code>`;
      };
      const hasBlank = significantNodes.some((child) => isBlank(child));
      const rendered = significantNodes
        .map((child, index) => {
          if (child.nodeType === NODE_TYPES.ELEMENT_NODE && (child as Element).localName === 'qti-code') {
            const prevBlank = index > 0 && isBlank(significantNodes[index - 1]);
            const nextBlank =
              index < significantNodes.length - 1 && isBlank(significantNodes[index + 1]);
            return renderCodeInPre(child as Element, prevBlank, nextBlank);
          }
          return renderNodeForScoring(child, options, blankCounter, true, false);
        })
        .join('');
      const classAttr = hasBlank ? ` class="${options.preWithBlanksClassName}"` : '';
      return `<pre${classAttr}>${rendered}</pre>`;
    }
    case 'qti-blockquote':
      return `<blockquote>${renderChildren()}</blockquote>`;
    case 'qti-ul':
      return `<ul>${renderChildren()}</ul>`;
    case 'qti-ol': {
      const start = el.getAttribute('start');
      const startAttr = start ? ` start="${escapeHtml(start)}"` : '';
      return `<ol${startAttr}>${renderChildren()}</ol>`;
    }
    case 'qti-li':
      return `<li>${renderChildren()}</li>`;
    case 'qti-table':
      return `<table>${renderChildren()}</table>`;
    case 'qti-thead':
      return `<thead>${renderChildren()}</thead>`;
    case 'qti-tbody':
      return `<tbody>${renderChildren()}</tbody>`;
    case 'qti-tr':
      return `<tr>${renderChildren()}</tr>`;
    case 'qti-th':
      return `<th>${renderChildren()}</th>`;
    case 'qti-td':
      return `<td>${renderChildren()}</td>`;
    case 'qti-hr':
      return '<hr />';
    case 'qti-img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      const title = el.getAttribute('title');
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr} />`;
    }
    case 'qti-text-entry-interaction': {
      const idx = ++blankCounter.value;
      return options.blankRenderer(idx);
    }
    case 'qti-extended-text-interaction':
      return options.extendedTextRenderer();
    case 'qti-choice-interaction': {
      const choices = getElementsByLocalName(el, 'qti-simple-choice');
      const listItems = choices
        .map((choice) => {
          const id = choice.getAttribute('identifier') ?? '';
          const text = Array.from(choice.childNodes)
            .map((child) => renderNodeForScoring(child, options, blankCounter))
            .join('');
          return `<li data-choice="${escapeHtml(id)}">${text}</li>`;
        })
        .join('');
      return `<ol class="${options.choiceListClassName}">${listItems}</ol>`;
    }
    case 'qti-rubric-block':
      return '';
    default:
      return renderChildren();
  }
};

const parseCandidateExplanation = (
  root: Element,
  options: Required<ScoringRenderOptions>,
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
  const blankCounter = { value: 0 };
  const explanationNodes = Array.from(contentBody.childNodes).filter(
    (node) => node.nodeType !== NODE_TYPES.TEXT_NODE || (node.textContent?.trim() ?? '') !== '',
  );
  return explanationNodes
    .map((node) => renderNodeForScoring(node, options, blankCounter))
    .join('');
};

export const renderQtiItemForScoring = (
  xml: string,
  options: ScoringRenderOptions = {},
): ParsedItemForScoring => {
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
  const promptHtml = Array.from(itemBody.childNodes)
    .map((node) => renderNodeForScoring(node, resolved, blankCounter))
    .join('');
  const rubricCriteria = extractRubricCriteria(itemBody);
  const choices = extractChoices(itemBody);
  const candidateExplanationHtml = parseCandidateExplanation(root, resolved);

  return {
    identifier,
    title,
    promptHtml,
    rubricCriteria,
    choices,
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

const extractInnerXml = (tagBlock: string, tagName: string): string => {
  const pattern = new RegExp(`^<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>$`);
  const match = tagBlock.match(pattern);
  if (!match) {
    throw new Error(`Invalid XML: could not extract inner XML for ${tagName}`);
  }
  return match[1];
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

const normalizePreBlocks = (htmlFragment: string): string => {
  const prePattern = /<pre\b[^>]*>[\s\S]*?<\/pre>/g;
  return htmlFragment.replace(prePattern, (preBlock) => {
    const preOpenMatch = preBlock.match(/^<pre\b[^>]*>/);
    if (!preOpenMatch) return preBlock;
    const preOpen = preOpenMatch[0];
    let inner: string;
    try {
      inner = extractInnerXml(preBlock, 'pre');
    } catch {
      return preBlock;
    }
    const firstCodeOpenMatch = inner.match(/<code\b[^>]*>/);
    if (!firstCodeOpenMatch) return preBlock;
    const firstCodeOpen = firstCodeOpenMatch[0];
    const withoutCodeTags = inner.replace(/<\/?code\b[^>]*>/g, '');
    return `${preOpen}${firstCodeOpen}${withoutCodeTags}</code></pre>`;
  });
};

const enhanceCodeBlocks = (
  htmlFragment: string,
  options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>,
  codeHighlighter?: (code: string, explicitLanguage: string | null) => CodeHighlightResult,
): string => {
  const preCodePattern = /(<pre\b[^>]*>)(\s*)(<code\b[^>]*>)([\s\S]*?)(<\/code>)/g;
  return htmlFragment.replace(
    preCodePattern,
    (_match, preOpen, whitespace, codeOpen, codeContent, codeClose) => {
      const explicitLanguage = detectCodeLanguageFromOpenTag(codeOpen);
      let language = explicitLanguage ? normalizeLanguageForReport(explicitLanguage) : 'plain';
      let content = codeContent;
      if (codeHighlighter) {
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
    },
  );
};

const enhanceInlineCode = (htmlFragment: string, options: Required<Omit<ReportRenderOptions, 'codeHighlighter'>>): string => {
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
    return addOrUpdateAttribute(
      enhancedCode,
      options.dataCodeLangAttribute,
      normalizeLanguageForReport(language),
    );
  });
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
      const classAttr = options.choiceWrapperClassName
        ? ` class="${escapeHtml(options.choiceWrapperClassName)}"`
        : '';
      return `<div${classAttr}>${renderChildren()}</div>`;
    }
    case 'qti-text-entry-interaction':
      return options.clozeInputHtml;
    case 'qti-extended-text-interaction':
      return '';
    case 'qti-pre':
    case 'pre': {
      const attrs = serializeAttributes(el);
      return `<pre${attrs}>${renderChildren(true, false)}</pre>`;
    }
    case 'qti-code':
    case 'code': {
      const attrs = serializeAttributes(el);
      return `<code${attrs}>${renderChildren(inPre, true)}</code>`;
    }
    case 'qti-img':
    case 'img': {
      const attrs = serializeAttributes(el);
      return `<img${attrs} />`;
    }
    case 'qti-hr':
    case 'hr':
      return '<hr />';
    default: {
      const tagName = name.startsWith('qti-') ? name.slice(4) : name;
      const attrs = serializeAttributes(el);
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
  const rawBody = Array.from(itemBody.childNodes)
    .map((node) => renderNodeForReport(node, resolved))
    .join('');
  const wrappedHtml = `<div class="${resolved.itemBodyWrapperClassName}">${rawBody}</div>`;
  const normalizedPreBlocks = normalizePreBlocks(wrappedHtml);
  const withCodeBlocks = enhanceCodeBlocks(normalizedPreBlocks, resolved, options.codeHighlighter);
  const questionHtml = enhanceInlineCode(withCodeBlocks, resolved);
  const choices = extractChoices(itemBody);

  return {
    identifier,
    title,
    questionHtml,
    rubricCriteria,
    itemMaxScore,
    choices,
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
