import { DiffSegment, HumanEditSession } from '../types/transformation';
import { generateUuid } from './crypto';

/**
 * Word-level difference calculation and human-in-the-loop reconstruction
 */

export function computeWordDiff(original: string, modified: string): DiffSegment[] {
  const origWords = original.split(/(\s+)/);
  const modWords = modified.split(/(\s+)/);

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  let wordIndex = 0;

  // Simple LCS-based or token alignment for words
  while (i < origWords.length || j < modWords.length) {
    if (i < origWords.length && j < modWords.length && origWords[i] === modWords[j]) {
      segments.push({
        id: generateUuid(),
        type: 'unchanged',
        value: origWords[i],
        accepted: true,
        wordIndex: wordIndex++,
      });
      i++;
      j++;
    } else if (j < modWords.length && (i >= origWords.length || !origWords.slice(i, i + 5).includes(modWords[j]))) {
      // Insertion / Added
      segments.push({
        id: generateUuid(),
        type: 'added',
        value: modWords[j],
        originalValue: i < origWords.length ? origWords[i] : '',
        accepted: true,
        wordIndex: wordIndex++,
      });
      j++;
    } else if (i < origWords.length && (j >= modWords.length || !modWords.slice(j, j + 5).includes(origWords[i]))) {
      // Deletion / Removed
      segments.push({
        id: generateUuid(),
        type: 'removed',
        value: origWords[i],
        originalValue: origWords[i],
        accepted: false,
        wordIndex: wordIndex++,
      });
      i++;
    } else {
      // Substitution / Modified
      segments.push({
        id: generateUuid(),
        type: 'modified',
        value: modWords[j] || '',
        originalValue: origWords[i] || '',
        accepted: true,
        wordIndex: wordIndex++,
      });
      i++;
      j++;
    }
  }

  return segments;
}

export function reconstructTextFromSegments(segments: DiffSegment[]): string {
  let output = '';
  for (const seg of segments) {
    if (seg.type === 'unchanged') {
      output += seg.value;
    } else if (seg.type === 'added') {
      if (seg.accepted) {
        output += seg.value;
      }
    } else if (seg.type === 'removed') {
      if (!seg.accepted) {
        // If removal is rejected, keep original
        output += seg.value;
      }
    } else if (seg.type === 'modified') {
      if (seg.accepted) {
        output += seg.value;
      } else if (seg.originalValue) {
        output += seg.originalValue;
      }
    }
  }
  return output;
}

export function createHumanEditSession(
  originalText: string,
  proposedText: string,
  modelId: string,
  transformationType: string,
  watermarkId: string
): HumanEditSession {
  const segments = computeWordDiff(originalText, proposedText);
  return {
    id: generateUuid(),
    originalText,
    proposedText,
    currentText: proposedText,
    segments,
    provenance: {
      baseModel: modelId,
      transformationType,
      timestamp: Date.now(),
      watermarkId,
      revisionCount: 1,
    },
    auditTrail: [
      {
        timestamp: Date.now(),
        action: 'manual_edit',
        details: 'Initial transformation proposed by local sidecar',
      },
    ],
  };
}
