import { describe, expect, it } from 'vitest';
import { quantizeBeatLength, quantizeTapOnsets } from './rhythm';

describe('rhythm tapping quantization', () => {
  it('snaps human timing jitter to the nearest musical duration', () => {
    expect(quantizeBeatLength(0.93)).toMatchObject({ duration: 'q' });
    expect(quantizeBeatLength(0.72)).toMatchObject({ duration: 'e', dotted: true });
    expect(quantizeBeatLength(0.53)).toMatchObject({ duration: 'e' });
  });

  it('uses tap-to-tap spacing instead of creating release-based rests', () => {
    const result = quantizeTapOnsets([
      { type: 'down', time: 0 },
      { type: 'up', time: 80 },
      { type: 'down', time: 510 },
      { type: 'up', time: 590 },
      { type: 'down', time: 1000 },
      { type: 'up', time: 1080 },
    ], 120);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.duration)).toEqual(['q', 'q', 'q']);
  });
});
