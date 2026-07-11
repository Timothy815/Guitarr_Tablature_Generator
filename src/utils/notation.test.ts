import { describe, expect, it } from 'vitest';
import { durationToQuarterBeats, escapeXml, generateMusicXML, parseInputToProject } from './notation';
import type { SongProject } from '../types';

describe('notation timing', () => {
  it('calculates plain and dotted note lengths', () => {
    expect(durationToQuarterBeats('q')).toBe(1);
    expect(durationToQuarterBeats('e', true)).toBe(0.75);
    expect(durationToQuarterBeats('h', true)).toBe(3);
  });

  it('groups text input by musical duration', () => {
    const parsed = parseInputToProject('3/6:h, 5/6:q, 7/6:q, 8/6:h, 10/6:h');
    expect(parsed?.measures).toHaveLength(2);
    expect(parsed?.measures?.[0].beats).toHaveLength(3);
    expect(parsed?.measures?.[1].beats).toHaveLength(2);
  });
});

describe('MusicXML export', () => {
  it('escapes project titles and exports dotted duration data', () => {
    const project: SongProject = {
      title: 'Rock & Roll <Demo>',
      bpm: 120,
      instrument: 'electric',
      timeSignature: { beats: 4, beatType: 4 },
      measures: [{ id: 'm1', beats: [{ id: 'b1', duration: 'q', dotted: true, positions: [{ string: 6, fret: 3 }] }] }],
    };
    const xml = generateMusicXML(project);
    expect(xml).toContain('<work-title>Rock &amp; Roll &lt;Demo&gt;</work-title>');
    expect(xml).toContain('<duration>24</duration>');
    expect(xml).toContain('<dot/>');
    expect(escapeXml('"A&B"')).toBe('&quot;A&amp;B&quot;');
  });
});
