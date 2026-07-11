import { describe, expect, it } from 'vitest';
import { durationToQuarterBeats, escapeXml, generateMusicXML, parseInputToProject, projectToTextMarkup } from './notation';
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

describe('plain-text markup', () => {
  it('round-trips grid notes, rests, modifiers, dots, and measure boundaries', () => {
    const project: SongProject = {
      title: 'Text Demo',
      bpm: 90,
      instrument: 'acoustic',
      timeSignature: { beats: 4, beatType: 4 },
      measures: [
        { id: 'm1', annotation: { rehearsalMark: 'A', section: 'Verse 1', lyricCue: 'Goodbye Albert', performanceNote: 'Build' }, beats: [
          { id: 'b1', duration: 'q', dotted: true, positions: [{ string: 2, fret: 5, ghost: true }, { string: 3, fret: 7 }] },
          { id: 'b2', duration: 'e', positions: [] },
        ] },
        { id: 'm2', beats: [
          { id: 'b3', duration: 'h', positions: [{ string: 6, fret: 0, mute: true }] },
        ] },
      ],
    };

    const markup = projectToTextMarkup(project);
    expect(markup).toBe('[rehearsal=A; section=Verse 1; lyric=Goodbye Albert; note=Build] 5/2x+7/3:q., x:e | m/6:h');
    const parsed = parseInputToProject(markup);
    expect(parsed?.measures).toHaveLength(2);
    expect(parsed?.measures?.[0].annotation).toEqual({
      rehearsalMark: 'A', section: 'Verse 1', lyricCue: 'Goodbye Albert', performanceNote: 'Build',
    });
    expect(parsed?.measures?.[0].beats[0]).toMatchObject({
      duration: 'q',
      dotted: true,
      positions: [{ string: 2, fret: 5, ghost: true }, { string: 3, fret: 7, ghost: false }],
    });
    expect(parsed?.measures?.[1].beats[0].positions[0]).toMatchObject({ string: 6, mute: true });
  });

  it('does not export unused empty cells as timed MusicXML rests by default', () => {
    const project: SongProject = {
      title: 'No Pause', bpm: 120, instrument: 'electric', timeSignature: { beats: 4, beatType: 4 },
      measures: [{ id: 'm1', beats: [
        { id: 'note', duration: 'q', positions: [{ string: 6, fret: 3 }] },
        { id: 'padding', duration: 'e', positions: [] },
      ] }],
    };
    const withoutPadding = generateMusicXML(project);
    expect(withoutPadding).not.toContain('<rest/>');
    expect(withoutPadding).toContain('<measure number="1" implicit="yes">');
    expect(generateMusicXML(project, true)).toContain('<rest/>');
  });
});
