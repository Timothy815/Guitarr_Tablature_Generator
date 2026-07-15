import { TabPosition, SongProject, Measure, Beat, NoteDuration } from '../types';

export const GUITAR_TUNING_PITCHES = [64, 59, 55, 50, 45, 40]; // String 1 (High E) to 6 (Low E)

// Convert guitar string and fret to MIDI pitch
export function guitarNoteToPitch(stringNum: number, fret: number): number {
  if (stringNum < 1 || stringNum > 6) return 0;
  return GUITAR_TUNING_PITCHES[stringNum - 1] + fret;
}

// Map a MIDI pitch back to a string and fret
// If previousFret is provided, tries to find the fret closest to the previous position
export function pitchToGuitarNote(pitch: number, previousFret?: number): TabPosition {
  const candidates: TabPosition[] = [];

  for (let s = 1; s <= 6; s++) {
    const basePitch = GUITAR_TUNING_PITCHES[s - 1];
    const fret = pitch - basePitch;
    if (fret >= 0 && fret <= 24) {
      candidates.push({ string: s, fret });
    }
  }

  if (candidates.length === 0) {
    // If pitch is too low, clamp to low E string fret 0
    if (pitch < 40) return { string: 6, fret: 0 };
    // If pitch is too high, clamp to high E string fret 24
    return { string: 1, fret: 24 };
  }

  if (previousFret !== undefined) {
    // Return candidate that minimizes distance to previousFret
    candidates.sort((a, b) => Math.abs(a.fret - previousFret) - Math.abs(b.fret - previousFret));
    return candidates[0];
  }

  // Otherwise, prefer lower frets, but if there's an open string (fret 0), it's highly preferred
  // We sort: prefer frets closer to 0-8. Let's score them:
  // Fret 0 gets high score. Frets > 12 get penalized.
  const scoreCandidate = (c: TabPosition) => {
    if (c.fret === 0) return 0; // open string is very easy
    if (c.fret <= 5) return c.fret; // low frets are very comfortable
    if (c.fret <= 12) return c.fret + 2; // mid frets
    return c.fret + 10; // high frets (harder)
  };

  candidates.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  return candidates[0];
}

function playablePositionsForPitch(pitch: number): TabPosition[] {
  return GUITAR_TUNING_PITCHES.flatMap((openPitch, index) => {
    const fret = pitch - openPitch;
    return fret >= 0 && fret <= 24 ? [{ string: index + 1, fret }] : [];
  });
}

function transposePositions(positions: TabPosition[], semitones: number): TabPosition[] | null {
  const fixedStrings = new Set(positions.filter((position) => position.mute).map((position) => position.string));
  const pitched = positions
    .map((position, index) => ({ position, index }))
    .filter(({ position }) => !position.mute)
    .map(({ position, index }) => ({
      position,
      index,
      candidates: playablePositionsForPitch(guitarNoteToPitch(position.string, position.fret) + semitones)
        .filter((candidate) => !fixedStrings.has(candidate.string))
        .map((candidate) => ({
          candidate,
          cost: (candidate.string === position.string ? 0 : 100) + Math.abs(candidate.fret - position.fret),
        }))
        .sort((a, b) => a.cost - b.cost),
    }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  if (pitched.some(({ candidates }) => candidates.length === 0)) return null;

  let bestCost = Number.POSITIVE_INFINITY;
  let bestAssignments: Array<{ index: number; candidate: TabPosition }> | null = null;

  const assign = (
    noteIndex: number,
    occupiedStrings: Set<number>,
    assignments: Array<{ index: number; candidate: TabPosition }>,
    cost: number,
  ) => {
    if (cost >= bestCost) return;
    if (noteIndex === pitched.length) {
      bestCost = cost;
      bestAssignments = [...assignments];
      return;
    }

    const note = pitched[noteIndex];
    for (const option of note.candidates) {
      if (occupiedStrings.has(option.candidate.string)) continue;
      occupiedStrings.add(option.candidate.string);
      assignments.push({ index: note.index, candidate: option.candidate });
      assign(noteIndex + 1, occupiedStrings, assignments, cost + option.cost);
      assignments.pop();
      occupiedStrings.delete(option.candidate.string);
    }
  };

  assign(0, new Set(fixedStrings), [], 0);
  if (!bestAssignments) return null;

  const assignmentByIndex = new Map(
    (bestAssignments as Array<{ index: number; candidate: TabPosition }>).map(({ index, candidate }) => [index, candidate]),
  );
  return positions.map((position, index) => position.mute
    ? { ...position }
    : { ...position, ...assignmentByIndex.get(index)! });
}

/**
 * Transpose every pitched note while keeping the result playable on a
 * standard six-string guitar. Notes stay on their current string whenever
 * possible and are moved to another string only at a fretboard boundary.
 * Muted strings are left unchanged because they have no definite pitch.
 */
export function transposeProject(project: SongProject, semitones: number): SongProject | null {
  if (semitones === 0) return project;

  const nextMeasures: Measure[] = [];

  for (const measure of project.measures) {
    const nextBeats: Beat[] = [];

    for (const beat of measure.beats) {
      const nextPositions = transposePositions(beat.positions, semitones);
      if (!nextPositions) return null;

      nextBeats.push({ ...beat, positions: nextPositions });
    }

    nextMeasures.push({ ...measure, beats: nextBeats });
  }

  return { ...project, measures: nextMeasures };
}

export function canTransposeProject(project: SongProject, semitones: number): boolean {
  return transposeProject(project, semitones) !== null;
}

export function clearProjectTablature(project: SongProject): SongProject {
  return {
    ...project,
    measures: project.measures.map((measure) => ({
      ...measure,
      beats: measure.beats.map((beat) => ({ ...beat, positions: [] })),
    })),
  };
}

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function durationToQuarterBeats(duration: NoteDuration, dotted = false): number {
  const beats = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }[duration];
  return dotted ? beats * 1.5 : beats;
}

export function groupBeatsIntoMeasures(beats: Beat[], capacity = 4): Measure[] {
  const measures: Measure[] = [];
  let current: Beat[] = [];
  let used = 0;

  beats.forEach((beat) => {
    const value = durationToQuarterBeats(beat.duration, beat.dotted);
    if (current.length > 0 && used + value > capacity) {
      measures.push({ id: `m_${measures.length + 1}`, beats: current });
      current = [];
      used = 0;
    }
    current.push(beat);
    used += value;
    if (used >= capacity) {
      measures.push({ id: `m_${measures.length + 1}`, beats: current });
      current = [];
      used = 0;
    }
  });

  if (current.length > 0) measures.push({ id: `m_${measures.length + 1}`, beats: current });
  return measures;
}

export function projectToTextMarkup(project: SongProject): string {
  return project.measures
    .map((measure) => {
      const annotationParts = [
        measure.annotation?.rehearsalMark && `rehearsal=${measure.annotation.rehearsalMark}`,
        measure.annotation?.section && `section=${measure.annotation.section}`,
        measure.annotation?.lyricCue && `lyric=${measure.annotation.lyricCue}`,
        measure.annotation?.performanceNote && `note=${measure.annotation.performanceNote}`,
      ].filter(Boolean);
      const annotation = annotationParts.length > 0 ? `[${annotationParts.join('; ')}] ` : '';
      return annotation + measure.beats.map((beat) => {
      const duration = `:${beat.duration}${beat.dotted ? '.' : ''}`;
      if (beat.positions.length === 0) return `x${duration}`;

      const notes = [...beat.positions]
        .sort((a, b) => a.string - b.string)
        .map((position) => {
          const fret = position.mute ? 'm' : String(position.fret);
          return `${fret}/${position.string}${position.ghost ? 'x' : ''}`;
        })
        .join('+');
      return `${notes}${duration}`;
      }).join(', ');
    })
    .join(' | ');
}

// Convert MIDI pitch to VexFlow key representation (e.g., 60 -> 'c/4')
export function pitchToVexKey(pitch: number): { key: string; accidental: string | null } {
  const noteIndex = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[noteIndex];
  
  if (name.includes('#')) {
    // Vexflow keys should be e.g. "c#/4"
    return { key: `${name}/${octave}`, accidental: '#' };
  }
  return { key: `${name}/${octave}`, accidental: null };
}

// Convert VexFlow key representation (e.g., 'c/4' or 'c#/4') back to MIDI pitch
export function vexKeyToPitch(keyStr: string): number {
  const parts = keyStr.toLowerCase().replace(/\s+/g, '').split('/');
  if (parts.length < 2) return 60;
  const name = parts[0];
  const octave = parseInt(parts[1], 10);
  
  const idx = NOTE_NAMES.indexOf(name);
  if (idx === -1) return 60;
  return (octave + 1) * 12 + idx;
}

// Generates a well-formatted MusicXML 4.0 string for the project
export function generateMusicXML(project: SongProject, includeEmptyRests = false): string {
  const bpm = project.bpm;
  const title = escapeXml(project.title || 'Untitled');
  const beatsPerMeasure = project.timeSignature.beats;
  const beatType = project.timeSignature.beatType;

  // XML headers
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${title}</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">`;

  // Process measures
  const exportMeasures = project.measures
    .map((measure) => ({
      ...measure,
      beats: includeEmptyRests ? measure.beats : measure.beats.filter((beat) => beat.positions.length > 0),
    }))
    .filter((measure) => measure.beats.length > 0 || Object.values(measure.annotation ?? {}).some(Boolean));

  exportMeasures.forEach((measure, mIdx) => {
    const durationTicksForBeat = (beat: Beat) => Math.round(durationToQuarterBeats(beat.duration, beat.dotted) * 16);
    const measureTicks = measure.beats.reduce((total, beat) => total + durationTicksForBeat(beat), 0);
    const expectedTicks = beatsPerMeasure * (4 / beatType) * 16;
    const implicitAttribute = measureTicks !== expectedTicks ? ' implicit="yes"' : '';
    xml += `
    <measure number="${mIdx + 1}"${implicitAttribute}>`;

    // Only add attributes on first measure
    if (mIdx === 0) {
      xml += `
      <attributes>
        <divisions>16</divisions> <!-- 16 ticks per quarter note -->
        <key>
          <fifths>0</fifths>
          <mode>major</mode>
        </key>
        <time>
          <beats>${beatsPerMeasure}</beats>
          <beat-type>${beatType}</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1">
            <tuning-step>E</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
          <staff-tuning line="2">
            <tuning-step>A</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
          <staff-tuning line="3">
            <tuning-step>D</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="4">
            <tuning-step>G</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="5">
            <tuning-step>B</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="6">
            <tuning-step>E</tuning-step>
            <tuning-octave>4</tuning-octave>
          </staff-tuning>
        </staff-details>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${bpm}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${bpm}"/>
      </direction>`;
    }

    if (measure.annotation?.rehearsalMark) {
      xml += `
      <direction placement="above"><direction-type><rehearsal>${escapeXml(measure.annotation.rehearsalMark)}</rehearsal></direction-type></direction>`;
    }
    const annotationWords = [measure.annotation?.section, measure.annotation?.lyricCue, measure.annotation?.performanceNote].filter(Boolean).join(' — ');
    if (annotationWords) {
      xml += `
      <direction placement="above"><direction-type><words>${escapeXml(annotationWords)}</words></direction-type></direction>`;
    }

    // Process beats in this measure
    measure.beats.forEach((beat) => {
      // Determine XML note durations in division ticks (1 quarter = 16 divisions)
      let durationTicks = 16; // quarter note
      let typeName = 'quarter';
      switch (beat.duration) {
        case 'w':
          durationTicks = 64;
          typeName = 'whole';
          break;
        case 'h':
          durationTicks = 32;
          typeName = 'half';
          break;
        case 'q':
          durationTicks = 16;
          typeName = 'quarter';
          break;
        case 'e':
          durationTicks = 8;
          typeName = 'eighth';
          break;
        case 's':
          durationTicks = 4;
          typeName = '16th';
          break;
      }

      if (beat.dotted) durationTicks = Math.round(durationTicks * 1.5);
      const dotElement = beat.dotted ? '\n        <dot/>' : '';

      if (beat.positions.length === 0) {
        // Rest note
        xml += `
      <note>
        <rest/>
        <duration>${durationTicks}</duration>
        <voice>1</voice>
        <type>${typeName}</type>${dotElement}
      </note>`;
      } else {
        // Playable notes (can be a chord)
        beat.positions.forEach((pos, posIdx) => {
          const pitch = guitarNoteToPitch(pos.string, pos.fret);
          const noteIndex = pitch % 12;
          const octave = Math.floor(pitch / 12) - 1;
          const noteName = NOTE_NAMES[noteIndex].toUpperCase();
          const step = noteName[0];
          const alter = noteName.includes('#') ? '1' : '';

          xml += `
      <note>
        ${posIdx > 0 ? '<chord/>' : ''}
        <pitch>
          <step>${step}</step>
          ${alter ? `<alter>${alter}</alter>` : ''}
          <octave>${octave}</octave>
        </pitch>
        <duration>${durationTicks}</duration>
        <voice>1</voice>
        <type>${typeName}</type>${dotElement}
        <notations>
          <technical>
            <string>${pos.string}</string>
            <fret>${pos.fret}</fret>
          </technical>
        </notations>
      </note>`;
        });
      }
    });

    xml += `
    </measure>`;
  });

  xml += `
  </part>
</score-partwise>`;

  return xml;
}

// Parses string-based note inputs from user
export function parseInputToProject(inputStr: string): Partial<SongProject> | null {
  const cleanInput = inputStr.trim();
  if (!cleanInput) return null;

  // 1. JSON input detection
  if (cleanInput.startsWith('{') || cleanInput.startsWith('[')) {
    try {
      const parsed = JSON.parse(cleanInput);
      if (parsed.measures && Array.isArray(parsed.measures)) {
        return parsed as SongProject;
      } else if (Array.isArray(parsed)) {
        // Just a list of beats
        return {
          measures: [{ id: 'm1', beats: parsed }]
        };
      }
    } catch (e) {
      // Fall through to other parsers
    }
  }

  // 2. Fret/String comma list (e.g. "5/3, 7/3, 5/2, x, 7/2:q.", "5/3:e")
  // Format is: fret/string[:duration][.][x], where 'x' represents a rest, or multiple notes stacked like '5/3+5/2'
  if (cleanInput.includes('/') || cleanInput.includes(',') || cleanInput.includes('|') || cleanInput.startsWith('[') || /^x(?::|$)/i.test(cleanInput)) {
    const measureGroups = cleanInput.split('|').map((group) => group.trim()).filter(Boolean);
    const annotations = measureGroups.map((group) => {
      const match = group.match(/^\[([^\]]+)\]\s*/);
      if (!match) return undefined;
      const fields = Object.fromEntries(match[1].split(';').map((part) => {
        const [key, ...value] = part.trim().split('=');
        return [key.trim(), value.join('=').trim()];
      }));
      return {
        rehearsalMark: fields.rehearsal || undefined,
        section: fields.section || undefined,
        lyricCue: fields.lyric || undefined,
        performanceNote: fields.note || undefined,
      };
    });
    const tokenGroups = measureGroups.map((group) => group.replace(/^\[[^\]]+\]\s*/, '').split(',').map((token) => token.trim()));
    const tokens = tokenGroups.flat();
    const beats: Beat[] = tokens.map((token, idx) => {
      // Parse main token and modifiers
      let tokenBase = token.toLowerCase();
      let isRest = false;

      let chordStr = token;
      let duration: NoteDuration = 'q';
      let dotted = false;

      // Extract duration modifier if present (e.g. ":w", ":h", ":q.", ":ex")
      if (token.includes(':')) {
        const parts = token.split(':');
        chordStr = parts[0];
        const modifierStr = parts[1].toLowerCase();
        
        if (modifierStr.includes('w')) duration = 'w';
        else if (modifierStr.includes('h')) duration = 'h';
        else if (modifierStr.includes('q')) duration = 'q';
        else if (modifierStr.includes('e')) duration = 'e';
        else if (modifierStr.includes('s')) duration = 's';
        
        if (modifierStr.includes('.')) dotted = true;
      }

      if (chordStr.toLowerCase() === 'x' || chordStr === '') {
        return { id: `b_${idx}`, positions: [], duration, dotted: dotted ? true : undefined };
      }

      // Check for chord '+' separator
      const chordNotes = chordStr.split('+');
      const positions: TabPosition[] = [];
      
      chordNotes.forEach(chordToken => {
        let noteToken = chordToken;
        let ghost = false;
        if (noteToken.toLowerCase().endsWith('x')) {
          ghost = true;
          noteToken = noteToken.slice(0, -1);
        }

        const parts = noteToken.split('/');
        if (parts.length === 2) {
          const fretStr = parts[0].trim().toLowerCase();
          const stringNum = parseInt(parts[1], 10);
          
          let fret = 0;
          let mute = false;
          
          if (fretStr === 'm') {
            mute = true;
          } else {
            fret = parseInt(fretStr, 10);
          }

          if ((mute || !isNaN(fret)) && !isNaN(stringNum) && stringNum >= 1 && stringNum <= 6) {
             positions.push({ string: stringNum, fret, ghost, mute: mute ? true : undefined });
          }
        }
      });

      return {
        id: `b_${idx}`,
        positions,
        duration,
        dotted: dotted ? true : undefined
      };
    });

    if (cleanInput.includes('|')) {
      let cursor = 0;
      const measures = tokenGroups.map((group, index) => {
        const measureBeats = beats.slice(cursor, cursor + group.length);
        cursor += group.length;
        return { id: `m_${index + 1}`, beats: measureBeats, annotation: annotations[index] };
      });
      return { measures };
    }

    return { measures: groupBeatsIntoMeasures(beats) };
  }

  // 3. Simple space-separated midi pitches (e.g. "60 62 64 65")
  const numbers = cleanInput.split(/\s+/).map(n => parseInt(n, 10));
  if (numbers.length > 0 && numbers.every(n => !isNaN(n))) {
    const beats: Beat[] = numbers.map((pitch, idx) => {
      if (pitch === 0) return { id: `b_${idx}`, positions: [], duration: 'q' };
      const pos = pitchToGuitarNote(pitch);
      return {
        id: `b_${idx}`,
        positions: [pos],
        duration: 'q'
      };
    });

    return { measures: groupBeatsIntoMeasures(beats) };
  }

  return null;
}
