import type { Measure } from '../types';
import { guitarNoteToPitch } from './notation';

export const NOTATION_CANVAS_PADDING = 20;
export const NOTATION_CANVAS_HEIGHT = 240;
export const PDF_MEASURES_PER_SYSTEM = 3;
// Crop only the opening bracket and clefs when building later PDF systems.
// A wider crop reaches the first formatted note and duplicates it in print.
export const PDF_REPEATED_CLEF_WIDTH = 64;

export interface NotationLayout {
  measureStarts: number[];
  measureWidths: number[];
  totalWidth: number;
}

const ACCIDENTAL_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function getNotationMeasureWidth(measure: Measure, isFirst: boolean): number {
  const modifierSpace = isFirst ? 112 : 24;
  const endSpace = 24;
  const noteSpace = measure.beats.reduce((total, beat) => {
    const accidentalCount = beat.positions.filter((position) =>
      ACCIDENTAL_PITCH_CLASSES.has(guitarNoteToPitch(position.string, position.fret) % 12),
    ).length;
    const widestFret = beat.positions.reduce((digits, position) =>
      Math.max(digits, String(position.fret).length), 1);

    // Accidentals and double-digit frets need more than the rhythmic slot's
    // baseline width so their modifiers do not collide with adjacent notes.
    return total + 36 + accidentalCount * 6 + Math.max(0, widestFret - 1) * 4;
  }, 0);

  const minimumWidth = isFirst ? 300 : 220;
  return Math.max(minimumWidth, modifierSpace + noteSpace + endSpace);
}

export function buildNotationLayout(measures: Measure[]): NotationLayout {
  const measureStarts: number[] = [];
  const measureWidths: number[] = [];
  let currentX = NOTATION_CANVAS_PADDING;

  measures.forEach((measure, index) => {
    const width = getNotationMeasureWidth(measure, index === 0);
    measureStarts.push(currentX);
    measureWidths.push(width);
    currentX += width;
  });

  return {
    measureStarts,
    measureWidths,
    totalWidth: currentX + NOTATION_CANVAS_PADDING,
  };
}
