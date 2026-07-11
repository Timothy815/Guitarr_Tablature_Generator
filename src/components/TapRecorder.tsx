import React, { useState, useEffect, useRef } from 'react';
import { SongProject, Beat, NoteDuration, TabPosition } from '../types';
import { Play, Square, Activity, HelpCircle, Check, Music } from 'lucide-react';

interface TapRecorderProps {
  project: SongProject;
  setProject: React.Dispatch<React.SetStateAction<SongProject>>;
  onTriggerPlayChord: (positions: TabPosition[]) => void;
}

interface TapEvent {
  type: 'down' | 'up';
  time: number;
}

interface ApproximatedRhythm {
  type: 'note' | 'rest';
  duration: NoteDuration;
}

export const TapRecorder: React.FC<TapRecorderProps> = ({ project, setProject, onTriggerPlayChord }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [tapEvents, setTapEvents] = useState<TapEvent[]>([]);
  const [sequenceNotes, setSequenceNotes] = useState<{ id: string; name: string; notesStr: string; positions: TabPosition[]; duration: NoteDuration }[]>([]);
  const [activeNoteIdx, setActiveNoteIdx] = useState(0);
  const [showHelper, setShowHelper] = useState(false);
  const [recordingCompleted, setRecordingCompleted] = useState(false);
  const [approximatedDurations, setApproximatedDurations] = useState<ApproximatedRhythm[]>([]);

  // Collect all notes currently defined in the grid, filtering out empty beats, to give a sequence to "perform"
  const refreshSequence = () => {
    const seq: typeof sequenceNotes = [];
    let noteIdx = 1;

    project.measures.forEach((measure) => {
      measure.beats.forEach((beat) => {
        if (beat.positions.length > 0) {
          const notesStr = beat.positions
            .map((pos) => {
              const strName = ['E', 'B', 'G', 'D', 'A', 'E'][pos.string - 1];
              return `${strName}${pos.fret}`;
            })
            .join(' + ');

          seq.push({
            id: beat.id,
            name: `Note ${noteIdx++}`,
            notesStr,
            positions: beat.positions,
            duration: beat.duration,
          });
        }
      });
    });

    setSequenceNotes(seq);
    setActiveNoteIdx(0);
    setTapEvents([]);
    setRecordingCompleted(false);
    setApproximatedDurations([]);
  };

  useEffect(() => {
    refreshSequence();
  }, [project.measures]);

  const startRecording = () => {
    setIsRecording(true);
    setTapEvents([]);
    setActiveNoteIdx(0);
    setRecordingCompleted(false);
    setApproximatedDurations([]);
  };

  const snapTime = (ms: number, quarterMs: number): NoteDuration | null => {
    const beats = ms / quarterMs;
    if (beats < 0.125) return null; // Too short to be a musical note/rest
    if (beats >= 3.0) return 'w';
    if (beats >= 1.5) return 'h';
    if (beats >= 0.75) return 'q';
    if (beats >= 0.375) return 'e';
    return 's';
  };

  const stopRecordingAndProcess = (events?: TapEvent[]) => {
    setIsRecording(false);
    
    // Process tap intervals
    const bpm = project.bpm;
    const quarterMs = 60000 / bpm;
    const newDurations: ApproximatedRhythm[] = [];
    
    let lastDown = 0;
    let lastUp = 0;

    const eventsToProcess = events || tapEvents;

    for (let i = 0; i < eventsToProcess.length; i++) {
       const event = eventsToProcess[i];
       if (event.type === 'down') {
          if (lastUp > 0) {
             const restTime = event.time - lastUp;
             const restDur = snapTime(restTime, quarterMs);
             if (restDur) newDurations.push({ type: 'rest', duration: restDur });
          }
          lastDown = event.time;
       } else if (event.type === 'up') {
          if (lastDown > 0) {
             const noteTime = event.time - lastDown;
             const noteDur = snapTime(noteTime, quarterMs);
             if (noteDur) newDurations.push({ type: 'note', duration: noteDur });
          }
          lastUp = event.time;
       }
    }

    setApproximatedDurations(newDurations);
    setRecordingCompleted(true);
  };

  const stateRef = useRef({
    isRecording,
    tapEvents,
    activeNoteIdx,
    sequenceNotes,
    bpm: project.bpm,
  });

  useEffect(() => {
    stateRef.current = {
      isRecording,
      tapEvents,
      activeNoteIdx,
      sequenceNotes,
      bpm: project.bpm,
    };
  }, [isRecording, tapEvents, activeNoteIdx, sequenceNotes, project.bpm]);

  const handleDown = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e && e.type !== 'keydown') {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.blur();
      }
    }
    const state = stateRef.current;
    if (!state.isRecording) return;
    
    // Check if we are already down
    if (state.tapEvents.length > 0 && state.tapEvents[state.tapEvents.length - 1].type === 'down') {
      return;
    }

    const now = performance.now();
    const nextEvents = [...state.tapEvents, { type: 'down' as const, time: now }];
    stateRef.current.tapEvents = nextEvents;
    setTapEvents(nextEvents);

    const activeNote = state.sequenceNotes[state.activeNoteIdx];
    if (activeNote && activeNote.positions) {
       onTriggerPlayChord(activeNote.positions);
    }
  };

  const handleUp = (e?: React.MouseEvent | React.KeyboardEvent) => {
    const state = stateRef.current;
    if (!state.isRecording) return;
    
    // Check if we are actually down
    if (state.tapEvents.length === 0 || state.tapEvents[state.tapEvents.length - 1].type === 'up') {
      return;
    }

    const now = performance.now();
    const nextEvents = [...state.tapEvents, { type: 'up' as const, time: now }];
    stateRef.current.tapEvents = nextEvents;
    setTapEvents(nextEvents);

    if (state.activeNoteIdx < state.sequenceNotes.length - 1) {
      const nextIdx = state.activeNoteIdx + 1;
      stateRef.current.activeNoteIdx = nextIdx;
      setActiveNoteIdx(nextIdx);
    } else {
      // Completed the full sequence
      stopRecordingAndProcess(nextEvents);
    }
  };

  // Keyboard Spacebar listener for recording taps
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === ' ') && stateRef.current.isRecording) {
        e.preventDefault();
        e.stopPropagation();
        handleDown();
      }
    };
    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === ' ') && stateRef.current.isRecording) {
        e.preventDefault();
        e.stopPropagation();
        handleUp();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('keyup', handleGlobalKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      window.removeEventListener('keyup', handleGlobalKeyUp, true);
    };
  }, []);

  const getBeatValue = (d: NoteDuration) => {
    if (d === 'w') return 4;
    if (d === 'h') return 2;
    if (d === 'q') return 1;
    if (d === 'e') return 0.5;
    if (d === 's') return 0.25;
    return 1;
  };

  // Apply the tapped durations to the project
  const applyTappedDurations = () => {
    if (approximatedDurations.length === 0) return;

    setProject((prev) => {
      const newBeats: Beat[] = [];
      let beatIdCounter = 0;
      let noteIdx = 0;
      
      const originalNotes = sequenceNotes;

      approximatedDurations.forEach((item) => {
         if (item.type === 'note' && noteIdx < originalNotes.length) {
            newBeats.push({
               id: `tapped_beat_${beatIdCounter++}`,
               duration: item.duration,
               positions: originalNotes[noteIdx++].positions
            });
         } else if (item.type === 'rest') {
            newBeats.push({
               id: `tapped_beat_${beatIdCounter++}`,
               duration: item.duration,
               positions: []
            });
         }
      });

      // Append any remaining notes that were cut off
      while (noteIdx < originalNotes.length) {
         newBeats.push({
             id: `tapped_beat_${beatIdCounter++}`,
             duration: originalNotes[noteIdx].duration,
             positions: originalNotes[noteIdx].positions
         });
         noteIdx++;
      }

      // Group into measures
      const measures: typeof prev.measures = [];
      let currentMeasureBeats: Beat[] = [];
      let currentMeasureTime = 0;
      
      newBeats.forEach(beat => {
         const val = getBeatValue(beat.duration);
         if (currentMeasureTime + val > prev.timeSignature.beats && currentMeasureBeats.length > 0) {
            measures.push({ id: `m_${measures.length + 1}`, beats: currentMeasureBeats });
            currentMeasureBeats = [beat];
            currentMeasureTime = val;
         } else {
            currentMeasureBeats.push(beat);
            currentMeasureTime += val;
         }
      });
      if (currentMeasureBeats.length > 0) {
         measures.push({ id: `m_${measures.length + 1}`, beats: currentMeasureBeats });
      }

      return {
        ...prev,
        measures,
      };
    });

    setRecordingCompleted(false);
    setTapEvents([]);
    setActiveNoteIdx(0);
  };

  const durationFullLabels: Record<NoteDuration, string> = {
    w: 'Whole (4 beats)',
    h: 'Half (2 beats)',
    q: 'Quarter (1 beat)',
    e: 'Eighth (0.5 beats)',
    s: 'Sixteenth (0.25 beats)',
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Rhythm Tapping Composer
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Perform the notes from your grid in real time. We'll capture your timing and write the sheet music.
          </p>
        </div>

        <button
          onClick={() => setShowHelper(!showHelper)}
          className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-indigo-400" />
        </button>
      </div>

      {showHelper && (
        <div className="bg-zinc-950 border border-zinc-800 rounded p-4 text-xs text-zinc-300 leading-relaxed animate-in slide-in-from-top duration-200">
          <h4 className="font-semibold text-zinc-100 mb-1.5">How Tapping Record Works:</h4>
          <ol className="list-decimal pl-4 flex flex-col gap-1">
            <li>Type some frets into the tablature grid.</li>
            <li>Click <strong>Start Record</strong> below.</li>
            <li>Press and hold the <strong>TAP PAD</strong> or <strong>Spacebar</strong> to play each note.</li>
            <li>Holding down creates a note, releasing creates a rest.</li>
            <li>Click <strong>Apply Rhythm</strong> to write the newly approximated values directly into standard notation on the staff!</li>
          </ol>
        </div>
      )}

      {sequenceNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 rounded-xl border border-dashed border-zinc-800 text-zinc-500 font-mono text-xs text-center gap-2">
          <Music className="w-8 h-8 text-zinc-650 mb-1" />
          No notes found in the grid yet.<br />
          Add some frets to the tab grid first to record their rhythm!
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Note Sequence List */}
          <div className="flex-1 flex flex-col gap-2 max-h-[190px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 pr-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
              Note Performance Sequence ({sequenceNotes.length})
            </span>
            {sequenceNotes.map((note, idx) => (
              <div
                key={note.id}
                className={`flex items-center justify-between p-2 rounded border font-mono text-xs transition-colors ${
                  isRecording && idx === activeNoteIdx
                    ? 'bg-indigo-550/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/20'
                    : idx < activeNoteIdx && isRecording
                    ? 'bg-zinc-950/40 border-zinc-800 text-zinc-650'
                    : 'bg-zinc-950/80 border-zinc-800 text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[10px] opacity-70">{note.name}:</span>
                  <span className="font-bold">{note.notesStr}</span>
                </div>
                {idx < activeNoteIdx && isRecording && (
                  <Check className="w-3.5 h-3.5 text-indigo-450" />
                )}
              </div>
            ))}
          </div>

          {/* Interactive Pad Area */}
          <div className="flex-1 flex flex-col justify-center items-center gap-4">
            {!isRecording && !recordingCompleted ? (
              <button
                onClick={startRecording}
                className="w-full h-32 rounded bg-zinc-950 hover:bg-zinc-850 border-2 border-dashed border-zinc-800 hover:border-zinc-700 flex flex-col items-center justify-center text-center gap-2.5 transition-all group cursor-pointer"
              >
                <Play className="w-8 h-8 text-indigo-400 group-hover:scale-110 transition-transform" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-zinc-200">Start Tapping Record</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">Hold notes and rests directly</span>
                </div>
              </button>
            ) : isRecording ? (
              <button
                onMouseDown={handleDown}
                onMouseUp={handleUp}
                onMouseLeave={handleUp}
                onTouchStart={handleDown}
                onTouchEnd={handleUp}
                className="w-full h-32 rounded bg-indigo-900/20 hover:bg-indigo-900/30 border-2 border-indigo-500/30 hover:border-indigo-500 active:bg-indigo-500/30 transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer relative overflow-hidden select-none"
              >
                <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />
                <span className="text-2xl font-black text-indigo-400 tracking-wider uppercase font-mono animate-pulse">
                  TAP AND HOLD
                </span>
                <span className="text-[10px] text-indigo-300 opacity-85 font-medium">
                  Or use <strong className="bg-zinc-800 px-1 py-0.5 rounded border border-zinc-700">Spacebar</strong>
                </span>
                <div className="flex items-center gap-2 mt-1 text-zinc-400 text-xs font-mono">
                  <span>Note {activeNoteIdx + 1} of {sequenceNotes.length}</span>
                </div>
              </button>
            ) : (
              <div className="w-full flex flex-col gap-3">
                {/* Review approximated timings */}
                <div className="bg-zinc-950 border border-zinc-800 rounded p-3 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                    Captured Rhythm Result
                  </span>
                  <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto pr-1">
                    {approximatedDurations.map((dur, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                        <span className="text-zinc-500 text-[10px]">{dur.type === 'note' ? 'Note' : 'Rest'}:</span>
                        <span className="font-bold text-indigo-400 uppercase">{dur.duration}</span>
                        <span className="text-[10px] text-zinc-500">({durationFullLabels[dur.duration]})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={applyTappedDurations}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded transition-colors cursor-pointer text-center"
                  >
                    Apply Rhythm
                  </button>
                  <button
                    onClick={startRecording}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold rounded transition-colors cursor-pointer text-center"
                  >
                    Record Again
                  </button>
                </div>
              </div>
            )}
            
            {isRecording && (
              <button
                onClick={stopRecordingAndProcess}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-450 text-xs font-medium rounded transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                Stop & Process
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
