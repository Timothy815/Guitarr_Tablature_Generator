import React, { useState, useEffect, useRef } from 'react';
import { SongProject, TabPosition, NoteDuration } from '../types';
import { Plus, Trash2, ArrowLeft, ArrowRight, CornerDownLeft } from 'lucide-react';

interface GridEditorProps {
  project: SongProject;
  setProject: React.Dispatch<React.SetStateAction<SongProject>>;
  activeBeatIndex: number | null;
  onTriggerPlayChord: (positions: TabPosition[]) => void;
}

export const GridEditor: React.FC<GridEditorProps> = ({
  project,
  setProject,
  activeBeatIndex,
  onTriggerPlayChord,
}) => {
  // Store focused cell coordinates: { stringIndex, absoluteBeatIndex }
  // stringIndex: 1 (High E) to 6 (Low E)
  // absoluteBeatIndex: 0 to totalBeats - 1
  const [focusedCell, setFocusedCell] = useState<{ stringNum: number; beatIdx: number } | null>(null);
  
  // Flatten beats reference
  const flatBeats: { measureIdx: number; beatIdxInMeasure: number; absoluteIdx: number; positions: TabPosition[]; duration: NoteDuration; dotted?: boolean }[] = [];
  let absoluteCounter = 0;
  project.measures.forEach((measure, mIdx) => {
    measure.beats.forEach((beat, bIdx) => {
      flatBeats.push({
        measureIdx: mIdx,
        beatIdxInMeasure: bIdx,
        absoluteIdx: absoluteCounter++,
        positions: beat.positions,
        duration: beat.duration,
        dotted: beat.dotted
      });
    });
  });

  const totalBeats = flatBeats.length;

  // Clear focused cell if outside clicked
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.grid-editor-container')) {
        setFocusedCell(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Keyboard navigation & editing handler
  useEffect(() => {
    if (!focusedCell) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const { stringNum, beatIdx } = focusedCell;

      // Arrow Key Navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (stringNum > 1) {
          setFocusedCell({ stringNum: stringNum - 1, beatIdx });
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (stringNum < 6) {
          setFocusedCell({ stringNum: stringNum + 1, beatIdx });
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (beatIdx > 0) {
          setFocusedCell({ stringNum, beatIdx: beatIdx - 1 });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (beatIdx < totalBeats - 1) {
          setFocusedCell({ stringNum, beatIdx: beatIdx + 1 });
        }
      }

      // Input Fret Values
      else if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const typedVal = parseInt(e.key, 10);
        updateCellFret(stringNum, beatIdx, typedVal);
      }

      // Backspace / Delete / 'x' to Clear Fret
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key.toLowerCase() === 'x') {
        e.preventDefault();
        clearCellFret(stringNum, beatIdx);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, project, totalBeats]);

  // Update a single cell's fret value in the state
  const updateCellFret = (stringNum: number, absoluteBeatIndex: number, fretVal: number) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      const targetBeat = { ...targetBeats[beatInfo.beatIdxInMeasure] };
      
      // Filter out existing note on this string
      let nextPositions = targetBeat.positions.filter((pos) => pos.string !== stringNum);
      
      // If we already typed a single digit, and type another digit within 800ms, combine them!
      // This allows entering double-digit frets like 12, 14, 24!
      const existingPos = targetBeat.positions.find((pos) => pos.string !== stringNum); // other strings
      const currentPos = targetBeat.positions.find((pos) => pos.string === stringNum);
      
      let finalFret = fretVal;
      if (currentPos !== undefined) {
        // If they had a fret 1, and type 2, make it 12! Clamp to max 24.
        const combined = parseInt(`${currentPos.fret}${fretVal}`, 10);
        if (combined <= 24) {
          finalFret = combined;
        }
      }

      nextPositions.push({ string: stringNum, fret: finalFret });
      targetBeat.positions = nextPositions;
      targetBeats[beatInfo.beatIdxInMeasure] = targetBeat;
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      // Play back the chord in real-time as a dynamic feedback loop!
      setTimeout(() => {
        onTriggerPlayChord(nextPositions);
      }, 50);

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  const updateCellModifier = (stringNum: number, absoluteBeatIndex: number, modifier: 'mute' | 'ghost' | 'none') => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      const targetBeat = { ...targetBeats[beatInfo.beatIdxInMeasure] };
      
      const currentPos = targetBeat.positions.find((pos) => pos.string === stringNum);
      if (!currentPos) return prev; // Must have a note to modify

      const nextPositions = targetBeat.positions.filter((pos) => pos.string !== stringNum);
      
      nextPositions.push({
        ...currentPos,
        mute: modifier === 'mute' ? true : undefined,
        ghost: modifier === 'ghost' ? true : undefined,
      });

      targetBeat.positions = nextPositions;
      targetBeats[beatInfo.beatIdxInMeasure] = targetBeat;
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  const clearCellFret = (stringNum: number, absoluteBeatIndex: number) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      const targetBeat = { ...targetBeats[beatInfo.beatIdxInMeasure] };
      
      targetBeat.positions = targetBeat.positions.filter((pos) => pos.string !== stringNum);
      targetBeats[beatInfo.beatIdxInMeasure] = targetBeat;
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  const clearBeat = (absoluteBeatIndex: number) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      const targetBeat = { ...targetBeats[beatInfo.beatIdxInMeasure] };
      
      targetBeat.positions = []; // clear all notes
      targetBeats[beatInfo.beatIdxInMeasure] = targetBeat;
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  const deleteBeatAndShift = (absoluteBeatIndex: number) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      
      targetBeats.splice(beatInfo.beatIdxInMeasure, 1);
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
    setFocusedCell(null);
  };

  const updateBeatDuration = (absoluteBeatIndex: number, duration: NoteDuration, dotted?: boolean) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      const targetBeat = { ...targetBeats[beatInfo.beatIdxInMeasure], duration, dotted };
      
      targetBeats[beatInfo.beatIdxInMeasure] = targetBeat;
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  const insertRestAfterBeat = (absoluteBeatIndex: number) => {
    const beatInfo = flatBeats[absoluteBeatIndex];
    if (!beatInfo) return;

    setProject((prev) => {
      const nextMeasures = [...prev.measures];
      const targetMeasure = { ...nextMeasures[beatInfo.measureIdx] };
      const targetBeats = [...targetMeasure.beats];
      
      const newBeat = {
        id: `inserted_rest_${Date.now()}_${Math.random()}`,
        positions: [],
        duration: targetBeats[beatInfo.beatIdxInMeasure].duration,
        dotted: targetBeats[beatInfo.beatIdxInMeasure].dotted
      };

      targetBeats.splice(beatInfo.beatIdxInMeasure + 1, 0, newBeat);
      targetMeasure.beats = targetBeats;
      nextMeasures[beatInfo.measureIdx] = targetMeasure;

      return {
        ...prev,
        measures: nextMeasures,
      };
    });
  };

  // Add a new empty measure (8 eighth beats) to the song
  const addMeasure = () => {
    setProject((prev) => {
      const newMeasureId = `measure_${prev.measures.length + 1}`;
      const newBeats = Array.from({ length: 8 }, (_, idx) => ({
        id: `${newMeasureId}_beat_${idx + 1}`,
        positions: [],
        duration: 'e' as const, // eighth notes for 8 slots in 4/4
      }));

      return {
        ...prev,
        measures: [
          ...prev.measures,
          {
            id: newMeasureId,
            beats: newBeats,
          },
        ],
      };
    });
  };

  // Remove the last measure
  const removeLastMeasure = () => {
    if (project.measures.length <= 1) return;
    setProject((prev) => ({
      ...prev,
      measures: prev.measures.slice(0, -1),
    }));
    setFocusedCell(null);
  };

  const stringLabels = ['E', 'B', 'G', 'D', 'A', 'E'];
  const stringColors = [
    'text-rose-500 bg-rose-50 border-rose-200/50',
    'text-amber-500 bg-amber-50 border-amber-200/50',
    'text-emerald-500 bg-emerald-50 border-emerald-200/50',
    'text-cyan-500 bg-cyan-50 border-cyan-200/50',
    'text-blue-500 bg-blue-50 border-blue-200/50',
    'text-violet-500 bg-violet-50 border-violet-200/50',
  ];

  return (
    <div className="grid-editor-container bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 tracking-tight">Interactive Tablature Grid</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Click any cell and type <span className="text-indigo-400 font-medium">0–24</span> on keyboard or use the fret helper below. Press <span className="text-zinc-200 bg-zinc-850 px-1 py-0.5 rounded border border-zinc-700">Arrows</span> to navigate.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={addMeasure}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Measure
          </button>
          <button
            onClick={removeLastMeasure}
            disabled={project.measures.length <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 text-rose-450 border border-zinc-700/80 text-xs font-medium rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Measure
          </button>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 pb-2">
        <div className="min-w-max flex flex-col gap-[3px]">
          {/* Header Row (Beats/Measure Markers) */}
          <div className="flex items-center h-8">
            <div className="w-16 flex-none text-zinc-500 font-mono text-[10px] uppercase font-bold tracking-wider text-center">
              String
            </div>
            {project.measures.map((measure, mIdx) => (
              <div
                key={measure.id}
                className="flex flex-none border-l border-zinc-800"
                style={{ width: `${measure.beats.length * 40}px` }}
              >
                <div className="pl-2 font-mono text-xs font-bold text-zinc-400">
                  M.{mIdx + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Guitar Strings Rows */}
          {[1, 2, 3, 4, 5, 6].map((stringNum) => {
            const label = stringLabels[stringNum - 1];
            const colorClass = stringColors[stringNum - 1];

            return (
              <div key={stringNum} className="flex items-center h-10 relative">
                {/* Horizontal String Line Overlay running through cells */}
                <div className="absolute left-16 right-0 h-[2px] bg-zinc-800 pointer-events-none z-0" />

                {/* String Label Indicator */}
                <div className="w-16 flex-none pr-3 flex justify-end z-10">
                  <div className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs font-bold border ${colorClass}`}>
                    {label}
                  </div>
                </div>

                {/* String Fret Beats Columns */}
                {flatBeats.map((beat) => {
                  const isPlaybackActive = beat.absoluteIdx === activeBeatIndex;
                  const isCellFocused = focusedCell?.stringNum === stringNum && focusedCell?.beatIdx === beat.absoluteIdx;
                  
                  // Find if there is a note for this string on this beat
                  const currentNote = beat.positions.find((pos) => pos.string === stringNum);
                  let displayVal: string | number = '';
                  if (currentNote !== undefined) {
                    displayVal = currentNote.mute ? 'X' : currentNote.ghost ? `(${currentNote.fret})` : currentNote.fret;
                  }

                  // Every measure boundary is accented
                  const isMeasureStart = beat.beatIdxInMeasure === 0;

                  return (
                    <button
                      key={`${stringNum}_${beat.absoluteIdx}`}
                      onClick={() => setFocusedCell({ stringNum, beatIdx: beat.absoluteIdx })}
                      className={`
                        w-10 h-10 flex-none flex items-center justify-center font-mono text-sm font-bold z-10 transition-all cursor-pointer relative
                        ${isMeasureStart ? 'border-l border-zinc-800' : ''}
                        ${isPlaybackActive ? 'bg-indigo-500/20' : ''}
                        ${isCellFocused ? 'ring-1 ring-indigo-500 bg-zinc-800/80' : 'hover:bg-zinc-800/30'}
                      `}
                    >
                      {/* Interactive circular fret bubble */}
                      <div className={`
                        w-7 h-7 rounded flex items-center justify-center border transition-all
                        ${displayVal !== '' 
                          ? 'bg-zinc-100 text-zinc-950 border-white shadow shadow-black/20 font-bold' 
                          : 'bg-transparent border-transparent text-zinc-500'
                        }
                      `}>
                        {displayVal}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Subheader timeline beats indexes (e.g. 1 2 3 4 5 6 7 8) */}
          <div className="flex items-center h-6 mt-1">
            <div className="w-16 flex-none" />
            {flatBeats.map((beat) => (
              <div
                key={`sub_${beat.absoluteIdx}`}
                className={`w-10 flex-none text-center font-mono text-[9px] font-medium text-zinc-500 ${
                  beat.beatIdxInMeasure === 0 ? 'border-l border-zinc-850 font-bold text-zinc-400' : ''
                }`}
              >
                {beat.beatIdxInMeasure + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Fret Click Panel */}
      {focusedCell && (
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-zinc-300 font-mono uppercase bg-zinc-800 px-2 py-1 rounded">
                String {focusedCell.stringNum} ({stringLabels[focusedCell.stringNum - 1]}), Beat {focusedCell.beatIdx + 1}
              </span>
              <span className="text-zinc-700 text-xs hidden md:inline">|</span>
              <span className="text-zinc-400 text-xs">Fret:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0, 1, 2, 3, 4, 5, 7, 9, 12, 14, 15, 17].map((f) => (
                  <button
                    key={f}
                    onClick={() => updateCellFret(focusedCell.stringNum, focusedCell.beatIdx, f)}
                    className="w-8 h-8 rounded bg-zinc-800 hover:bg-indigo-600 hover:text-white border border-zinc-700 text-zinc-200 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    {f}
                  </button>
                ))}
                
                <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-700 pl-3">
                  <button
                    onClick={() => updateCellModifier(focusedCell.stringNum, focusedCell.beatIdx, 'mute')}
                    className={`px-2 h-8 rounded border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer ${
                      flatBeats[focusedCell.beatIdx]?.positions.find(p => p.string === focusedCell.stringNum)?.mute
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-zinc-800 hover:bg-indigo-600/50 hover:text-white border-zinc-700 text-zinc-200'
                    }`}
                    title="Muted String (X)"
                  >
                    Mute (X)
                  </button>
                  <button
                    onClick={() => updateCellModifier(focusedCell.stringNum, focusedCell.beatIdx, 'ghost')}
                    className={`px-2 h-8 rounded border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer ${
                      flatBeats[focusedCell.beatIdx]?.positions.find(p => p.string === focusedCell.stringNum)?.ghost
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-zinc-800 hover:bg-indigo-600/50 hover:text-white border-zinc-700 text-zinc-200'
                    }`}
                    title="Ghost Note"
                  >
                    Ghost ( )
                  </button>
                  <button
                    onClick={() => updateCellModifier(focusedCell.stringNum, focusedCell.beatIdx, 'none')}
                    className="px-2 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                    title="Remove Modifiers"
                  >
                    Normal
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap md:border-l md:border-zinc-800 md:pl-3">
              <button
                onClick={() => clearCellFret(focusedCell.stringNum, focusedCell.beatIdx)}
                className="px-2.5 h-8 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 text-xs font-medium transition-all active:scale-95 cursor-pointer"
                title="Clear current fret"
              >
                Clear Fret
              </button>
              <button
                onClick={() => clearBeat(focusedCell.beatIdx)}
                className="px-2.5 h-8 rounded bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-white border border-amber-500/20 text-xs font-medium transition-all active:scale-95 cursor-pointer"
                title="Make entire beat a rest"
              >
                Clear Beat (Rest)
              </button>
              <button
                onClick={() => deleteBeatAndShift(focusedCell.beatIdx)}
                className="px-2.5 h-8 rounded bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 text-xs font-medium transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                title="Remove beat and close gap"
              >
                <Trash2 className="w-3 h-3" />
                Delete Beat
              </button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center gap-4 pt-3 border-t border-zinc-800/50">
             <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-400 text-xs">Duration:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['w', 'h', 'q', 'e', 's'] as const).map((dur) => (
                    <button
                      key={dur}
                      onClick={() => updateBeatDuration(focusedCell.beatIdx, dur, flatBeats[focusedCell.beatIdx]?.dotted)}
                      className={`w-8 h-8 rounded border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer ${
                        flatBeats[focusedCell.beatIdx]?.duration === dur 
                          ? 'bg-indigo-600 text-white border-indigo-500' 
                          : 'bg-zinc-800 hover:bg-indigo-600/50 hover:text-white border-zinc-700 text-zinc-200'
                      }`}
                      title={`${dur === 'w' ? 'Whole' : dur === 'h' ? 'Half' : dur === 'q' ? 'Quarter' : dur === 'e' ? 'Eighth' : '16th'} note`}
                    >
                      {dur}
                    </button>
                  ))}
                  <button
                    onClick={() => updateBeatDuration(focusedCell.beatIdx, flatBeats[focusedCell.beatIdx]?.duration || 'q', !flatBeats[focusedCell.beatIdx]?.dotted)}
                    className={`w-8 h-8 rounded border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer ${
                      flatBeats[focusedCell.beatIdx]?.dotted 
                        ? 'bg-indigo-600 text-white border-indigo-500' 
                        : 'bg-zinc-800 hover:bg-indigo-600/50 hover:text-white border-zinc-700 text-zinc-200'
                    }`}
                    title="Toggle dotted"
                  >
                    .
                  </button>
                </div>
             </div>
             
             <div className="flex gap-1.5 flex-wrap md:border-l md:border-zinc-800 md:pl-3">
                <button
                  onClick={() => insertRestAfterBeat(focusedCell.beatIdx)}
                  className="px-2.5 h-8 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 text-xs font-medium transition-all active:scale-95 cursor-pointer"
                  title="Insert a rest beat after this one"
                >
                  Insert Rest After
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
