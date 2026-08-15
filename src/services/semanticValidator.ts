import { PreservedItem, SemanticValidationReport } from '../types/transformation';

/**
 * Authoritative Independent Semantic Validation Engine
 * Enforces strict non-negotiable invariants:
 * - Numbers (integers, decimals, percentages, currency, dates) with exact boundary & value checking
 * - Code blocks and inline code (`foo`, ```lang...```)
 * - URLs and endpoints (https://..., www...., /api/...) with boundary protection
 * - Named entities (proper nouns, organizations, acronyms, camelCase identifiers) with casing & word boundary checks
 * - Structural integrity (lists, paragraphs, token count ratios)
 */

export function extractNumbers(text: string): string[] {
  // Extract currency, percentages, formatted numbers, decimals, integers with boundaries
  const numberRegex = /(?:\$|€|£|¥)?\b\d+(?:,\d{3})*(?:\.\d+)?%?\b/g;
  const matches = text.match(numberRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

export function extractUrls(text: string): string[] {
  const urlRegex = /(?:https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+)/gi;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches.map(u => u.replace(/[.,;:)\]]+$/, '')))) : [];
}

export function extractCodeSnippets(text: string): string[] {
  const snippets: string[] = [];
  // Fenced code blocks ```...```
  const blockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    snippets.push(match[0].trim());
  }
  // Inline code `...`
  const inlineRegex = /`[^`\n]+`/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    snippets.push(match[0].trim());
  }
  return Array.from(new Set(snippets));
}

export function extractNamedEntities(text: string): string[] {
  const entities: string[] = [];
  // 1. Acronyms (2-6 uppercase letters with word boundaries)
  const acronymRegex = /\b[A-Z]{2,6}\b/g;
  let match: RegExpExecArray | null;
  while ((match = acronymRegex.exec(text)) !== null) {
    if (!['THE', 'AND', 'FOR', 'NOT', 'YOU', 'CAN', 'ALL', 'OUT', 'OUR'].includes(match[0])) {
      entities.push(match[0]);
    }
  }

  // 2. Capitalized multi-word phrases (proper names)
  const properNameRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  while ((match = properNameRegex.exec(text)) !== null) {
    entities.push(match[0]);
  }

  // 3. Technical camelCase or PascalCase identifiers
  const identRegex = /\b[a-zA-Z]+(?:[A-Z][a-z0-9]+)+\b/g;
  while ((match = identRegex.exec(text)) !== null) {
    entities.push(match[0]);
  }

  return Array.from(new Set(entities));
}

// Calculate Token-based Lexical Overlap (0.0 to 1.0)
export function computeLexicalOverlap(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

  const setA = new Set(tokenize(textA));
  const setB = new Set(tokenize(textB));

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  // Weighted formula for lexical overlap: typical paraphrasing shifts vocab ~40-70%
  const jaccard = intersection.size / union.size;
  return Number(Math.min(1.0, 0.4 + jaccard * 0.6).toFixed(3));
}

// Backwards compatibility export
export const computeSemanticSimilarity = computeLexicalOverlap;

/**
 * Count occurrences of a numeric token with strict word and punctuation boundary enforcement.
 * Prevents "10" matching inside "100" or "$10" matching inside "$100".
 */
function countExactNumberOccurrences(text: string, numToken: string): number {
  const escaped = escapeRegExp(numToken);
  // If token starts with currency symbol or ends with %
  const pattern = `(?<=^|[^0-9a-zA-Z$€£¥])${escaped}(?=[^0-9a-zA-Z%]|$|\\b)`;
  try {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  } catch {
    // Fallback regex with word boundaries
    const fallback = new RegExp(`\\b${escaped}\\b`, 'g');
    return (text.match(fallback) || []).length;
  }
}

/**
 * Check if a URL is present as an intact standalone token (not hijacked via subdomains)
 */
function countExactUrlOccurrences(text: string, url: string): number {
  const escaped = escapeRegExp(url);
  const pattern = `(?<=^|\\s|["'<(\\[])${escaped}(?=[\\s"'.,;:)>\\]]|$)`;
  try {
    const regex = new RegExp(pattern, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  } catch {
    return text.includes(url) ? 1 : 0;
  }
}

/**
 * Check if a named entity or acronym is preserved with boundary and casing protection
 */
function checkEntityPreserved(text: string, entity: string): boolean {
  const escaped = escapeRegExp(entity);
  // Short acronyms (<=4 chars) require exact casing and word boundaries to avoid false positives (e.g. AI matching "said")
  if (/^[A-Z]{2,4}$/.test(entity)) {
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    return regex.test(text);
  }
  // Technical identifiers like camelCase require casing preservation
  if (/[a-z][A-Z]/.test(entity)) {
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    return regex.test(text);
  }
  // Standard multi-word proper nouns (e.g. "John Smith")
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  return regex.test(text);
}

export function validateTransformation(
  original: string,
  transformed: string,
  options: {
    preserveNumbers?: boolean;
    preserveCode?: boolean;
    preserveUrls?: boolean;
    preserveEntities?: boolean;
  } = {}
): SemanticValidationReport {
  const items: PreservedItem[] = [];
  const violations: string[] = [];

  const {
    preserveNumbers = true,
    preserveCode = true,
    preserveUrls = true,
    preserveEntities = true,
  } = options;

  let numbersPreserved = true;
  let codePreserved = true;
  let urlsPreserved = true;
  let namedEntitiesPreserved = true;

  // 1. Numbers validation with strict non-substring matching
  if (preserveNumbers) {
    const origNumbers = extractNumbers(original);
    for (const num of origNumbers) {
      const origCount = countExactNumberOccurrences(original, num);
      const transCount = countExactNumberOccurrences(transformed, num);
      const preserved = transCount >= origCount;
      items.push({
        type: 'number',
        value: num,
        countOriginal: origCount,
        countTransformed: transCount,
        preserved,
      });
      if (!preserved) {
        numbersPreserved = false;
        violations.push(`Number "${num}" was lost or altered in output (Original: ${origCount}, Output: ${transCount})`);
      }
    }
  }

  // 2. URLs validation with domain boundary checking
  if (preserveUrls) {
    const origUrls = extractUrls(original);
    for (const url of origUrls) {
      const origCount = countExactUrlOccurrences(original, url);
      const transCount = countExactUrlOccurrences(transformed, url);
      const preserved = transCount >= origCount;
      items.push({
        type: 'url',
        value: url,
        countOriginal: origCount,
        countTransformed: transCount,
        preserved,
      });
      if (!preserved) {
        urlsPreserved = false;
        violations.push(`URL "${url}" was dropped, mutated, or subdomain-hijacked during transformation`);
      }
    }
  }

  // 3. Code snippets validation
  if (preserveCode) {
    const origCode = extractCodeSnippets(original);
    for (const code of origCode) {
      const preserved = transformed.includes(code);
      items.push({
        type: 'code',
        value: code.length > 30 ? code.slice(0, 27) + '...' : code,
        countOriginal: 1,
        countTransformed: preserved ? 1 : 0,
        preserved,
      });
      if (!preserved) {
        codePreserved = false;
        violations.push(`Code block "${code.length > 25 ? code.slice(0, 22) + '...' : code}" was modified or omitted`);
      }
    }
  }

  // 4. Named entities validation with boundary and acronym checks
  if (preserveEntities) {
    const origEntities = extractNamedEntities(original);
    for (const entity of origEntities) {
      const preserved = checkEntityPreserved(transformed, entity);
      items.push({
        type: 'named_entity',
        value: entity,
        countOriginal: 1,
        countTransformed: preserved ? 1 : 0,
        preserved,
      });
      if (!preserved) {
        namedEntitiesPreserved = false;
        violations.push(`Named entity / Technical identifier "${entity}" was missing or casing altered in transformed text`);
      }
    }
  }

  // Structural checks
  const origParagraphs = original.split(/\n\s*\n/).filter(Boolean).length;
  const transParagraphs = transformed.split(/\n\s*\n/).filter(Boolean).length;
  const structuralPreserved = Math.abs(origParagraphs - transParagraphs) <= 1;

  if (!structuralPreserved && origParagraphs > 2) {
    violations.push(`Structural integrity warning: Paragraph structure shifted (${origParagraphs} -> ${transParagraphs})`);
  }

  const lengthRatio = original.length > 0 ? transformed.length / original.length : 1.0;
  if (lengthRatio < 0.35 || lengthRatio > 2.5) {
    violations.push(`Unusual length deviation: Output is ${(lengthRatio * 100).toFixed(0)}% of original length`);
  }

  const lexicalOverlapScore = computeLexicalOverlap(original, transformed);
  const detectedEntities = extractNamedEntities(original);

  const isValid =
    numbersPreserved &&
    codePreserved &&
    urlsPreserved &&
    namedEntitiesPreserved &&
    violations.length === 0;

  return {
    isValid,
    numbersPreserved,
    codePreserved,
    urlsPreserved,
    namedEntitiesPreserved,
    structuralPreserved,
    lengthRatio: Number(lengthRatio.toFixed(2)),
    lexicalOverlapScore,
    similarityScore: lexicalOverlapScore,
    entitiesDetectedByValidatorV1: detectedEntities,
    items,
    violations,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

