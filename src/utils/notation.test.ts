import { describe, expect, it } from 'vitest';
import { canTransposeProject, clearProjectTablature, durationToQuarterBeats, escapeXml, generateMusicXML, guitarNoteToPitch, parseInputToProject, projectToTextMarkup, transposeProject } from './notation';
import type { SongProject } from '../types';
import { buildNotationLayout, getNotationMeasureWidth, NOTATION_CANVAS_PADDING, PDF_REPEATED_CLEF_WIDTH } from './notationLayout';

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

describe('tablature transposition', () => {
  const project: SongProject = {
    title: 'Transpose', bpm: 120, instrument: 'electric', timeSignature: { beats: 4, beatType: 4 },
    measures: [{ id: 'm1', beats: [{
      id: 'b1', duration: 'q', positions: [
        { string: 1, fret: 3 },
        { string: 2, fret: 0, ghost: true },
        { string: 6, fret: 5, mute: true },
      ],
    }] }],
  };

  it('moves every pitched note by one semitone and preserves modifiers', () => {
    const transposed = transposeProject(project, 1);
    expect(transposed).not.toBeNull();

    const originalPitches = project.measures[0].beats[0].positions
      .filter((position) => !position.mute)
      .map((position) => guitarNoteToPitch(position.string, position.fret));
    const transposedPositions = transposed!.measures[0].beats[0].positions;
    const transposedPitches = transposedPositions
      .filter((position) => !position.mute)
      .map((position) => guitarNoteToPitch(position.string, position.fret));

    expect(transposedPitches).toEqual(originalPitches.map((pitch) => pitch + 1));
    expect(transposedPositions[1].ghost).toBe(true);
    expect(transposedPositions[2]).toEqual(project.measures[0].beats[0].positions[2]);
  });

  it('re-strings an open note when transposing down at a string boundary', () => {
    const transposed = transposeProject(project, -1)!;
    const original = project.measures[0].beats[0].positions[1];
    const result = transposed.measures[0].beats[0].positions[1];

    expect(result.string).not.toBe(original.string);
    expect(guitarNoteToPitch(result.string, result.fret)).toBe(guitarNoteToPitch(original.string, original.fret) - 1);
  });

  it('disables transposition beyond the guitar range', () => {
    const lowProject: SongProject = {
      ...project,
      measures: [{ id: 'm1', beats: [{ id: 'low', duration: 'q', positions: [{ string: 6, fret: 0 }] }] }],
    };
    expect(canTransposeProject(lowProject, -1)).toBe(false);
    expect(transposeProject(lowProject, -1)).toBeNull();
  });
});

describe('notation layout', () => {
  it('gives dense accidental-heavy measures more horizontal space', () => {
    const sparse = { id: 'sparse', beats: [{ id: 'r', duration: 'q' as const, positions: [] }] };
    const dense = {
      id: 'dense',
      beats: Array.from({ length: 8 }, (_, index) => ({
        id: `b${index}`,
        duration: 'e' as const,
        positions: [{ string: 1, fret: index % 2 === 0 ? 2 : 4 }],
      })),
    };

    expect(getNotationMeasureWidth(dense, false)).toBeGreaterThan(getNotationMeasureWidth(sparse, false));
  });

  it('builds contiguous measure boundaries with outer canvas padding', () => {
    const measures = [
      { id: 'm1', beats: [{ id: 'b1', duration: 'q' as const, positions: [] }] },
      { id: 'm2', beats: [{ id: 'b2', duration: 'q' as const, positions: [] }] },
    ];
    const layout = buildNotationLayout(measures);

    expect(layout.measureStarts[0]).toBe(NOTATION_CANVAS_PADDING);
    expect(layout.measureStarts[1]).toBe(layout.measureStarts[0] + layout.measureWidths[0]);
    expect(layout.totalWidth).toBe(layout.measureStarts[1] + layout.measureWidths[1] + NOTATION_CANVAS_PADDING);
  });

  it('keeps the repeated PDF clef crop clear of the first note area', () => {
    expect(PDF_REPEATED_CLEF_WIDTH).toBeLessThan(70);
  });
});

describe('clear tablature', () => {
  it('clears all positions while preserving the project and beat structure', () => {
    const project: SongProject = {
      title: 'Keep Me',
      bpm: 96,
      instrument: 'acoustic',
      timeSignature: { beats: 3, beatType: 4 },
      measures: [{
        id: 'm1',
        annotation: { section: 'Verse' },
        beats: [{ id: 'b1', duration: 'q', dotted: true, positions: [{ string: 4, fret: 7, ghost: true }] }],
      }],
    };

    const cleared = clearProjectTablature(project);
    expect(cleared).toMatchObject({
      title: 'Keep Me',
      bpm: 96,
      instrument: 'acoustic',
      timeSignature: { beats: 3, beatType: 4 },
      measures: [{
        id: 'm1',
        annotation: { section: 'Verse' },
        beats: [{ id: 'b1', duration: 'q', dotted: true, positions: [] }],
      }],
    });
    expect(project.measures[0].beats[0].positions).toHaveLength(1);
  });
});
