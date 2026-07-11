import { useState, useEffect, useRef } from 'react';
import { SongProject, TabPosition, InstrumentType } from './types';
import { NotationCanvas } from './components/NotationCanvas';
import { GridEditor } from './components/GridEditor';
import { TapRecorder } from './components/TapRecorder';
import { ImportExportPanel } from './components/ImportExportPanel';
import { AudioPlaybackEngine } from './utils/audio';
import { Play, Pause, RotateCcw, Volume2, Music, HelpCircle, FileText, CheckCircle, Activity } from 'lucide-react';

const DEFAULT_PROJECT: SongProject = {
  title: 'Smoke on the Water',
  bpm: 112,
  timeSignature: { beats: 4, beatType: 4 },
  instrument: 'electric',
  measures: [
    {
      id: 'm1',
      beats: [
        { id: 'm1_b1', duration: 'e', positions: [{ string: 4, fret: 0 }, { string: 3, fret: 0 }] }, // Open D & G strings
        { id: 'm1_b2', duration: 'e', positions: [] }, // Rest
        { id: 'm1_b3', duration: 'e', positions: [{ string: 4, fret: 3 }, { string: 3, fret: 3 }] }, // 3rd fret D & G strings
        { id: 'm1_b4', duration: 'e', positions: [] },
        { id: 'm1_b5', duration: 'e', positions: [{ string: 4, fret: 5 }, { string: 3, fret: 5 }] }, // 5th fret D & G strings
        { id: 'm1_b6', duration: 'e', positions: [] },
        { id: 'm1_b7', duration: 'e', positions: [] },
        { id: 'm1_b8', duration: 'e', positions: [] },
      ],
    },
    {
      id: 'm2',
      beats: [
        { id: 'm2_b1', duration: 'e', positions: [{ string: 4, fret: 0 }, { string: 3, fret: 0 }] },
        { id: 'm2_b2', duration: 'e', positions: [] },
        { id: 'm2_b3', duration: 'e', positions: [{ string: 4, fret: 3 }, { string: 3, fret: 3 }] },
        { id: 'm2_b4', duration: 'e', positions: [] },
        { id: 'm2_b5', duration: 'e', positions: [{ string: 4, fret: 6 }, { string: 3, fret: 6 }] }, // 6th fret D & G strings
        { id: 'm2_b6', duration: 'e', positions: [] },
        { id: 'm2_b7', duration: 'e', positions: [{ string: 4, fret: 5 }, { string: 3, fret: 5 }] },
        { id: 'm2_b8', duration: 'e', positions: [] },
      ],
    },
    {
      id: 'm3',
      beats: [
        { id: 'm3_b1', duration: 'e', positions: [{ string: 4, fret: 0 }, { string: 3, fret: 0 }] },
        { id: 'm3_b2', duration: 'e', positions: [] },
        { id: 'm3_b3', duration: 'e', positions: [{ string: 4, fret: 3 }, { string: 3, fret: 3 }] },
        { id: 'm3_b4', duration: 'e', positions: [] },
        { id: 'm3_b5', duration: 'e', positions: [{ string: 4, fret: 5 }, { string: 3, fret: 5 }] },
        { id: 'm3_b6', duration: 'e', positions: [] },
        { id: 'm3_b7', duration: 'e', positions: [{ string: 4, fret: 3 }, { string: 3, fret: 3 }] },
        { id: 'm3_b8', duration: 'e', positions: [] },
      ],
    },
    {
      id: 'm4',
      beats: [
        { id: 'm4_b1', duration: 'e', positions: [{ string: 4, fret: 0 }, { string: 3, fret: 0 }] },
        { id: 'm4_b2', duration: 'e', positions: [] },
        { id: 'm4_b3', duration: 'e', positions: [] },
        { id: 'm4_b4', duration: 'e', positions: [] },
        { id: 'm4_b5', duration: 'e', positions: [] },
        { id: 'm4_b6', duration: 'e', positions: [] },
        { id: 'm4_b7', duration: 'e', positions: [] },
        { id: 'm4_b8', duration: 'e', positions: [] },
      ],
    },
  ],
};

export default function App() {
  const [project, setProject] = useState<SongProject>(DEFAULT_PROJECT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null);

  // Initialize and update play state engine
  useEffect(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioPlaybackEngine();
    }
    
    audioEngineRef.current.setCallbacks(
      (index) => setActiveBeatIndex(index),
      (playing) => setIsPlaying(playing)
    );
  }, []);

  // Update playback engine whenever the project state changes (notes, etc.)
  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateProject(project);
    }
  }, [project]);

  // Handle metronome state and BPM changes
  useEffect(() => {
    if (audioEngineRef.current) {
      if (isMetronomeOn) {
        audioEngineRef.current.stopMetronome();
        audioEngineRef.current.startMetronome(project.bpm);
      } else {
        audioEngineRef.current.stopMetronome();
      }
    }
  }, [project.bpm, isMetronomeOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioEngineRef.current) {
        audioEngineRef.current.stop();
        audioEngineRef.current.stopMetronome();
      }
    };
  }, []);

  const handleTogglePlay = () => {
    if (!audioEngineRef.current) return;
    
    if (isPlaying) {
      audioEngineRef.current.stop();
      setActiveBeatIndex(null);
    } else {
      audioEngineRef.current.start(activeBeatIndex || 0);
      if (isMetronomeOn) {
        audioEngineRef.current.stopMetronome();
        audioEngineRef.current.startMetronome(project.bpm);
      }
    }
  };

  const handleResetPlay = () => {
    if (!audioEngineRef.current) return;
    audioEngineRef.current.stop();
    setActiveBeatIndex(null);
  };

  const handleToggleMetronome = () => {
    setIsMetronomeOn((prev) => !prev);
  };

  const handleTriggerPlayChord = (positions: TabPosition[]) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.triggerSingleChord(positions, project.instrument);
    }
  };

  const handleInstrumentChange = (inst: InstrumentType) => {
    setProject((prev) => ({ ...prev, instrument: inst }));
  };

  const handleBpmChange = (bpmVal: number) => {
    setProject((prev) => ({ ...prev, bpm: bpmVal }));
  };

  const handleTitleChange = (newTitle: string) => {
    setProject((prev) => ({ ...prev, title: newTitle || 'Untitled' }));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-12">
      
      {/* 1. Header / Action Bar */}
      <header className="no-print h-14 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold text-base text-white font-display">
            T
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-tight text-white font-display">
              TABULATURE<span className="text-indigo-400 font-extrabold">PRO</span>
            </h1>
            <p className="text-[9px] md:text-[10px] text-zinc-400 font-medium">
              Professional Interactive sheet music &amp; audio workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold cursor-pointer transition-all"
          >
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            Workspace Guide
          </button>
        </div>
      </header>

      {/* Workspace Help Overlay */}
      {showHelp && (
        <div className="no-print max-w-7xl mx-auto mt-6 px-6 animate-in slide-in-from-top-4 duration-200 w-full">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 font-bold text-xs bg-zinc-800 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border border-zinc-700"
            >
              ×
            </button>
            <h2 className="text-base font-bold text-white mb-3 font-display flex items-center gap-1.5">
              💡 Complete Interactive Guide
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
              <div className="flex flex-col gap-2.5">
                <p>
                  <strong>✍️ Real-Time Writing &amp; Sync:</strong> Select any cell in the Interactive Tablature Grid below and type any fret number (0 to 24). It will instantaneously convert your frets and strings into beautiful, standard sheet music notation on the treble staff in real-time!
                </p>
                <p>
                  <strong>🎹 Bidirectional Sound:</strong> Hear your chords immediately as you type them. Select from 4 different premium custom instrument sounds including <em>Physical Modeled Acoustic, Electric Clean, Synth Pluck,</em> and <em>Metal Distortion.</em>
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <p>
                  <strong>🎵 Rhythm Tapping Composer:</strong> Don't know the exact tempo values? Use the Tap composer. Start recording and tap the Spacebar or TAP PAD in the rhythm you want. We automatically approximate your timing into quarters, eighths, halves, and print it right on the sheet!
                </p>
                <p>
                  <strong>📁 MIDI Imports &amp; Exports:</strong> Import any standard MIDI file to auto-transcribe it to guitar tabs! Export your project as Vector PDF, standard MIDI file, or fully featured MusicXML!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Studio Body Container */}
      <main className="max-w-7xl w-full mx-auto px-6 mt-8 flex flex-col gap-6 flex-1">
        
        {/* Printable/Export Header - Only visible during print */}
        <div className="hidden print-only text-center mb-6">
          <h1 className="text-3xl font-bold text-black tracking-tight">{project.title}</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Tempo: {project.bpm} BPM | Instrument: {project.instrument.toUpperCase()}
          </p>
          <div className="border-b border-gray-300 w-full my-4" />
        </div>

        {/* 2. Standard Staff Notation Viewer (Main Stage) */}
        <div className="flex flex-col gap-2 bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-xl">
          <div className="flex items-center justify-between no-print mb-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
              Vector Sheet Music &amp; Tablature Canvas
            </span>
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" />
              <span className="text-indigo-400 font-bold">SVG RENDER ACTIVE</span>
            </div>
          </div>
          
          <NotationCanvas
            project={project}
            activeBeatIndex={activeBeatIndex}
          />
        </div>

        {/* 3. Audio Control Center & Meta Panel */}
        <div className="no-print bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center gap-6 justify-between">
          
          {/* Song Name & Instrument Select */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Song Title</label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-100 px-3 py-1.5 rounded text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-display w-full sm:w-56"
              />
            </div>

            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Sound Preset</label>
              <select
                value={project.instrument}
                onChange={(e) => handleInstrumentChange(e.target.value as InstrumentType)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-100 px-3 py-1.5 rounded text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer w-full sm:w-44"
              >
                <option value="acoustic">Nylon Acoustic Guitar</option>
                <option value="electric">Electric Clean Guitar</option>
                <option value="synth">Plucked Lead Synth</option>
                <option value="distorted">Metal Distortion Guitar</option>
              </select>
            </div>
          </div>

          {/* Interactive Playback Controls */}
          <div className="flex items-center gap-4 justify-center py-2 md:py-0">
            <button
              onClick={handleToggleMetronome}
              className={`w-10 h-10 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                isMetronomeOn 
                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                  : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Toggle Metronome Click Track"
            >
              <Activity className="w-4 h-4" />
            </button>
            <div className="w-px h-8 bg-zinc-800" />
            <button
              onClick={handleTogglePlay}
              className={`w-12 h-12 rounded flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-lg ${
                isPlaying 
                  ? 'bg-rose-500 text-white hover:bg-rose-450 shadow-rose-500/10' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10'
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              onClick={handleResetPlay}
              className="w-10 h-10 rounded bg-zinc-800 hover:bg-zinc-750 active:bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-zinc-400 hover:text-zinc-200" />
            </button>
          </div>

          {/* BPM Adjustable Tempo Slider */}
          <div className="flex flex-col gap-1.5 w-full md:w-56">
            <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
              <span>Adjust Tempo</span>
              <span className="text-indigo-400 font-extrabold">{project.bpm} BPM</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-zinc-600 font-mono">Largo</span>
              <input
                type="range"
                min="40"
                max="220"
                value={project.bpm}
                onChange={(e) => handleBpmChange(parseInt(e.target.value, 10))}
                className="flex-1 accent-indigo-500 h-1.5 bg-zinc-950 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] font-bold text-zinc-600 font-mono">Presto</span>
            </div>
          </div>

        </div>

        {/* 4. Interactive Grid Editor */}
        <div className="no-print">
          <GridEditor
            project={project}
            setProject={setProject}
            activeBeatIndex={activeBeatIndex}
            onTriggerPlayChord={handleTriggerPlayChord}
          />
        </div>

        {/* 5. Tapping Composer & Import/Export Studio side-by-side */}
        <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-6">
          <TapRecorder
            project={project}
            setProject={setProject}
            onTriggerPlayChord={handleTriggerPlayChord}
          />
          <ImportExportPanel
            project={project}
            setProject={setProject}
          />
        </div>

      </main>
    </div>
  );
}
