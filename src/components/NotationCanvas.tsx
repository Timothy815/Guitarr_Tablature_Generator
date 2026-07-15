import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, TabStave, StaveNote, TabNote, Formatter, Voice, Accidental, StaveConnector, GhostNote, Dot, Barline } from 'vexflow';
import { SongProject } from '../types';
import { guitarNoteToPitch, pitchToVexKey } from '../utils/notation';
import { buildNotationLayout, NOTATION_CANVAS_HEIGHT } from '../utils/notationLayout';

interface NotationCanvasProps {
  project: SongProject;
  activeBeatIndex?: number | null; // Currently playing beat (flat index)
  onCellClick?: (measureIdx: number, beatIdx: number, stringNum: number) => void;
}

const mapDurationToVex = (duration: string): string => {
  const map: Record<string, string> = {
    'w': 'w',
    'h': 'h',
    'q': 'q',
    'e': '8',
    's': '16',
  };
  return map[duration] || duration;
};

export const NotationCanvas: React.FC<NotationCanvasProps> = ({
  project,
  activeBeatIndex = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Clear previous drawing
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    const measures = project.measures;
    if (measures.length === 0) return;

    // Give dense measures more room for accidentals and multi-digit frets.
    // The same boundaries are exposed on the canvas for measure-aligned PDF crops.
    const layout = buildNotationLayout(measures);
    const canvasWidth = layout.totalWidth;
    const canvasHeight = NOTATION_CANVAS_HEIGHT;
    canvasRef.current.dataset.notationLayout = JSON.stringify(layout);

    // Create VexFlow Renderer
    const renderer = new Renderer(canvasRef.current, Renderer.Backends.CANVAS);
    renderer.resize(canvasWidth, canvasHeight);
    const context = renderer.getContext();
    
    // Fill with white background using native context to ensure it covers the high-DPI scaled area
    const nativeCtx = canvasRef.current.getContext('2d');
    if (nativeCtx) {
      nativeCtx.save();
      nativeCtx.fillStyle = 'white';
      nativeCtx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      nativeCtx.restore();
    }

    let flatBeatCounter = 0;

    measures.forEach((measure, mIdx) => {
      const isFirst = mIdx === 0;
      const currentX = layout.measureStarts[mIdx];
      const measureWidth = layout.measureWidths[mIdx];

      // 1. Create standard stave
      const stave = new Stave(currentX, 20, measureWidth);
      if (mIdx === measures.length - 1) stave.setEndBarType(Barline.type.END);
      if (isFirst) {
        stave.addClef('treble').addTimeSignature(`${project.timeSignature.beats}/${project.timeSignature.beatType}`);
      }
      stave.setContext(context).draw();

      // 2. Create tab stave
      const tabStave = new TabStave(currentX, 120, measureWidth);
      if (mIdx === measures.length - 1) tabStave.setEndBarType(Barline.type.END);
      if (isFirst) {
        tabStave.addClef('tab');
      }
      tabStave.setContext(context).draw();

      const annotation = measure.annotation;
      if (annotation && Object.values(annotation).some(Boolean)) {
        const cue = [
          annotation.rehearsalMark ? `[${annotation.rehearsalMark}]` : '',
          annotation.section,
          annotation.lyricCue,
          annotation.performanceNote,
        ].filter(Boolean).join(' · ');
        context.save();
        context.setFillStyle('#3f3f46');
        context.setFont('Arial', 9, annotation.rehearsalMark ? 'bold' : 'normal');
        context.fillText(cue.length > 42 ? `${cue.slice(0, 41)}…` : cue, currentX + (isFirst ? 100 : 8), 13);
        context.restore();
      }

      // 3. Connect staves with line and bracket
      if (isFirst) {
        const connectorBracket = new StaveConnector(stave, tabStave);
        connectorBracket.setType('bracket');
        connectorBracket.setContext(context).draw();
        
        const connectorLine = new StaveConnector(stave, tabStave);
        connectorLine.setType('single');
        connectorLine.setContext(context).draw();
      } else {
        // Draw standard connector lines between measures
        const connectorLine = new StaveConnector(stave, tabStave);
        connectorLine.setType('single');
        connectorLine.setContext(context).draw();
      }

      // 4. Create notes
      const staveNotes: StaveNote[] = [];
      const tabNotes: (TabNote | GhostNote)[] = [];

      measure.beats.forEach((beat) => {
        const isActive = flatBeatCounter === activeBeatIndex;
        flatBeatCounter++;

        const isRest = beat.positions.length === 0;
        const vexDuration = mapDurationToVex(beat.duration);
        
        if (isRest) {
          // Render a rest note
          const staveNote = new StaveNote({
            keys: ['b/4'], // middle line of treble staff
            duration: `${vexDuration}r${beat.dotted ? 'd' : ''}`, // 'r' suffix for rest, 'd' for dotted
          });

          if (beat.dotted) staveNote.addModifier(new Dot(), 0);

          const tabNote = new GhostNote({
            duration: `${vexDuration}${beat.dotted ? 'd' : ''}`,
          });

          if (isActive) {
            const activeColor = '#6366f1'; // Indigo-500 matching the theme accent
            staveNote.setStyle({ fillStyle: activeColor, strokeStyle: activeColor });
            tabNote.setStyle({ fillStyle: activeColor, strokeStyle: activeColor });
          }

          staveNotes.push(staveNote);
          tabNotes.push(tabNote);
        } else {
          // Playable note or chord
          const keys: string[] = [];
          const accidentals: { index: number; type: string }[] = [];

          // Sort positions so standard staff notes are in ascending pitch order (required by VexFlow for chords)
          const sortedPositions = [...beat.positions].sort((a, b) => {
            const pitchA = guitarNoteToPitch(a.string, a.fret);
            const pitchB = guitarNoteToPitch(b.string, b.fret);
            return pitchA - pitchB;
          });

          sortedPositions.forEach((pos, idx) => {
            const pitch = guitarNoteToPitch(pos.string, pos.fret);
            const { key, accidental } = pitchToVexKey(pitch);
            keys.push(key);
            if (accidental) {
              accidentals.push({ index: idx, type: accidental });
            }
          });

          const staveNote = new StaveNote({
            keys,
            duration: `${vexDuration}${beat.dotted ? 'd' : ''}`,
          });

          // Add accidental modifiers
          accidentals.forEach((acc) => {
            staveNote.addModifier(new Accidental(acc.type), acc.index);
          });
          
          if (beat.dotted) {
            keys.forEach((_, i) => staveNote.addModifier(new Dot(), i));
          }

          // Create TabNote positions (Vexflow TabNote positions expect { str: number, fret: number | string })
          const tabPositions = beat.positions.map((pos) => ({
            str: pos.string,
            fret: pos.mute ? 'X' : pos.ghost ? `(${pos.fret})` : pos.fret,
          }));

          const tabNote = new TabNote({
            positions: tabPositions,
            duration: `${vexDuration}${beat.dotted ? 'd' : ''}`,
          });
          
          if (beat.dotted) {
            tabPositions.forEach((_, i) => tabNote.addModifier(new Dot(), i));
          }

          // Render ghost notes and muted notes on stave
          sortedPositions.forEach((pos, idx) => {
             if (pos.mute) {
                staveNote.setKeyStyle(idx, { fillStyle: '#9ca3af' }); // dead note
             } else if (pos.ghost) {
                staveNote.setKeyStyle(idx, { fillStyle: '#9ca3af' }); // ghost note
             }
          });

          if (isActive) {
            const activeColor = '#6366f1'; // Indigo-500 matching the theme accent
            staveNote.setStyle({ fillStyle: activeColor, strokeStyle: activeColor });
            tabNote.setStyle({ fillStyle: activeColor, strokeStyle: activeColor });
          }

          staveNotes.push(staveNote);
          tabNotes.push(tabNote);
        }
      });

      // 5. Create voices and draw if there are notes
      if (staveNotes.length > 0) {
        // Simple duration-based beat calculation for voice
        // Vexflow voice needs to know total beats. For 4/4 measure, beats is 4.
        const voiceStaff = new Voice({
          numBeats: project.timeSignature.beats,
          beatValue: project.timeSignature.beatType,
        });
        voiceStaff.setStrict(false); // Disable strict ticks check to be resilient to varied grid slices
        voiceStaff.addTickables(staveNotes);

        const voiceTab = new Voice({
          numBeats: project.timeSignature.beats,
          beatValue: project.timeSignature.beatType,
        });
        voiceTab.setStrict(false);
        voiceTab.addTickables(tabNotes);

        // Format and align the staves
        const formatter = new Formatter();
        formatter
          .joinVoices([voiceStaff])
          .joinVoices([voiceTab])
          .formatToStave([voiceStaff, voiceTab], stave);

        // Draw voices on their respective staves
        voiceStaff.draw(context, stave);
        voiceTab.draw(context, tabStave);
      }

    });
  }, [project, activeBeatIndex]);

  return (
    <div className="w-full overflow-x-auto bg-white rounded-xl border border-zinc-200/80 p-4 scrollbar-thin scrollbar-thumb-zinc-200">
      <div className="min-w-max">
        <canvas ref={canvasRef} className="mx-auto" />
      </div>
    </div>
  );
};
