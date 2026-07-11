import React, { useState, useRef } from 'react';
import { SongProject, Beat, Measure, TabPosition, NoteDuration } from '../types';
import { parseInputToProject, generateMusicXML, pitchToGuitarNote, projectToTextMarkup } from '../utils/notation';
import { FileUp, FileDown, FileText, Code, CheckCircle, Download, Printer } from 'lucide-react';

interface ImportExportPanelProps {
  project: SongProject;
  setProject: React.Dispatch<React.SetStateAction<SongProject>>;
}

export const ImportExportPanel: React.FC<ImportExportPanelProps> = ({
  project,
  setProject,
}) => {
  const [textInput, setTextInput] = useState<string>('5/3, 7/3, 5/2, 5/3, 7/3, 5/2, x, 12/1+12/2+12/3');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [includeMidiRests, setIncludeMidiRests] = useState(false);
  const midiInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 8000);
  };

  // Load from comma-separated list, JSON, or pitch list
  const handleLoadText = () => {
    const parsed = parseInputToProject(textInput);
    if (parsed) {
      setProject((prev) => ({
        ...prev,
        ...parsed,
      }));
      showSuccess('Tablature project updated successfully!');
    } else {
      alert('Could not parse the input. Please check the examples and try again.');
    }
  };

  const handleTextFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contents = await file.text();
      setTextInput(contents.trim());
      showSuccess(`Loaded text markup from "${file.name}". Review it, then choose Load Note Sequence.`);
    } catch {
      showError('Could not read that text file.');
    }
    event.target.value = '';
  };

  const handleExportText = () => {
    const markup = projectToTextMarkup(project);
    const blob = new Blob([`${markup}\n`], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tablature'}.txt`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
    setTextInput(markup);
    showSuccess('Current grid exported as plain-text tablature markup.');
  };

  // Import MIDI File and represent as Tablature
  const handleMidiImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { Midi } = await import('@tonejs/midi');
      const arrayBuffer = await file.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      // Find first track with notes
      const playableTrack = midi.tracks.find((track) => track.notes.length > 0);
      if (!playableTrack) {
        alert('No playable notes found in this MIDI file.');
        return;
      }

      // We will quantize notes into measures of 8 beats (eighth notes) each
      // Let's assume a default tempo if not defined, or read the midi tempo
      const bpm = midi.header.tempos[0]?.bpm || 120;
      
      // Group notes by starting time (e.g., within 50ms is a chord)
      const sortedNotes = [...playableTrack.notes].sort((a, b) => a.time - b.time);
      
      // Quantize step (eighth notes): duration = 60 / BPM / 2 seconds
      const eighthNoteDurationSec = 30 / bpm;
      
      // Create a map of grid indices to notes
      const gridNotesMap: Record<number, number[]> = {}; // index -> midi pitches
      
      sortedNotes.forEach((note) => {
        // Find closest grid index
        const gridIdx = Math.round(note.time / eighthNoteDurationSec);
        if (gridIdx >= 128) return; // limit to maximum 128 beats to prevent memory bloat
        
        if (!gridNotesMap[gridIdx]) {
          gridNotesMap[gridIdx] = [];
        }
        gridNotesMap[gridIdx].push(note.midi);
      });

      // Find max index to define the song length
      const maxGridIdx = Math.max(...Object.keys(gridNotesMap).map(Number), 7);
      const totalMeasures = Math.ceil((maxGridIdx + 1) / 8);

      const measures: Measure[] = [];
      let absoluteBeatCounter = 0;

      for (let m = 0; m < totalMeasures; m++) {
        const mBeats: Beat[] = [];
        for (let b = 0; b < 8; b++) {
          const pitches = gridNotesMap[absoluteBeatCounter] || [];
          
          // Map midi pitches to guitar string/frets
          const positions: TabPosition[] = [];
          
          pitches.forEach((pitch) => {
            const pos = pitchToGuitarNote(pitch);
            // Avoid duplicate strings in the same chord slice
            if (!positions.some((p) => p.string === pos.string)) {
              positions.push(pos);
            }
          });

          mBeats.push({
            id: `imported_m${m + 1}_b${b + 1}`,
            positions,
            duration: 'e', // default to eighth notes for eighth note grid
          });
          absoluteBeatCounter++;
        }

        measures.push({
          id: `imported_measure_${m + 1}`,
          beats: mBeats,
        });
      }

      setProject((prev) => ({
        ...prev,
        bpm: Math.round(bpm),
        measures,
      }));

      showSuccess(`MIDI file "${file.name}" imported into ${measures.length} measures!`);
    } catch (err) {
      console.error(err);
      alert('Failed to parse MIDI file. Please ensure it is a valid format 0 or 1 MIDI file.');
    }
    
    // Clear input
    if (midiInputRef.current) midiInputRef.current.value = '';
  };

  // Export as MIDI File download
  const handleExportMIDI = async () => {
    try {
      const { default: MidiWriter } = await import('midi-writer-js');
      const track = new MidiWriter.Track();
      track.setTempo(project.bpm);
      
      // Track instrument channel/program if desired (24 is nylon acoustic guitar in GM)
      track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 24 }));

      // Process all beats sequentially
      project.measures.forEach((measure) => {
        measure.beats.forEach((beat) => {
          // Empty grid cells are workspace padding unless the user explicitly
          // chooses to preserve them as timed rests in the MIDI export.
          if (beat.positions.length === 0 && !includeMidiRests) return;

          // Duration mapping
          let durationString = '8'; // default eighth
          switch (beat.duration) {
            case 'w': durationString = '1'; break;
            case 'h': durationString = '2'; break;
            case 'q': durationString = '4'; break;
            case 'e': durationString = '8'; break;
            case 's': durationString = '16'; break;
          }

          if (beat.positions.length === 0) {
            // It's a rest, add standard MidiWriter rest
            // MidiWriter expects standard pitch name or empty event
            track.addEvent(new MidiWriter.NoteEvent({
              pitch: [],
              duration: durationString,
              velocity: 0,
            }));
          } else {
            // Collect all pitches for chord
            const pitches = beat.positions.map((pos) => {
              // Get pitch in standard name representation, e.g. "C4"
              const pitchVal = 64 + (pos.string === 1 ? 0 : pos.string === 2 ? -5 : pos.string === 3 ? -9 : pos.string === 4 ? -14 : pos.string === 5 ? -19 : -24) + pos.fret;
              // Simple converter from pitch number to MIDI string
              const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
              const name = noteNames[pitchVal % 12];
              const octave = Math.floor(pitchVal / 12) - 1;
              return `${name}${octave}`;
            });

            track.addEvent(new MidiWriter.NoteEvent({
              pitch: pitches,
              duration: durationString,
              velocity: 85,
            }));
          }
        });
      });

      const writer = new MidiWriter.Writer(track);
      const dataUri = writer.dataUri();

      // Trigger standard anchor download
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `${project.title.toLowerCase().replace(/\s+/g, '_')}.mid`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccess('MIDI file downloaded successfully!');
    } catch (err) {
      console.error(err);
      alert('Could not export MIDI file.');
    }
  };

  // Export as MusicXML
  const handleExportMusicXML = () => {
    try {
      const xmlStr = generateMusicXML(project);
      const blob = new Blob([xmlStr], { type: 'application/vnd.recordare.musicxml+xml' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${project.title.toLowerCase().replace(/\s+/g, '_')}.musicxml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showSuccess('MusicXML file downloaded successfully!');
    } catch (err) {
      console.error(err);
      alert('Could not export MusicXML file.');
    }
  };

  // Export as printable layout (PDF)
  const handleTriggerPrint = async () => {
    try {
      showSuccess('Generating PDF... This may take a moment.');
      
      const canvasElement = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvasElement) {
        showError('Could not find notation canvas to export.');
        return;
      }

      // Lay the continuous editor canvas out as measure-aligned systems on
      // standard US Letter pages. The notation canvas uses one 260px opening
      // measure, 200px following measures, and 20px outer padding.
      const pageMargin = 40;
      const headerHeight = 62;
      const systemGap = 18;
      const measuresPerSystem = 3;
      const firstMeasureWidth = 260;
      const regularMeasureWidth = 200;
      const canvasPadding = 20;
      const repeatedClefWidth = 85;
      const logicalCanvasWidth = firstMeasureWidth
        + Math.max(0, project.measures.length - 1) * regularMeasureWidth
        + canvasPadding * 2;
      const scaleX = canvasElement.width / logicalCanvasWidth;

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - pageMargin * 2;
      let pageNumber = 1;
      let y = pageMargin;

      const drawPageHeader = () => {
        pdf.setFontSize(pageNumber === 1 ? 22 : 13);
        pdf.setFont('helvetica', 'bold');
        pdf.text(project.title || 'Untitled', pageMargin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(90);
        pdf.text(
          `Tempo: ${project.bpm} BPM  •  Instrument: ${project.instrument}`,
          pageMargin,
          y + 17,
        );
        pdf.setTextColor(0);
        y += headerHeight;
      };

      drawPageHeader();

      for (let startMeasure = 0; startMeasure < project.measures.length; startMeasure += measuresPerSystem) {
        const count = Math.min(measuresPerSystem, project.measures.length - startMeasure);
        const isFinalSystem = startMeasure + count >= project.measures.length;
        const logicalStartX = startMeasure === 0
          ? 0
          : canvasPadding + firstMeasureWidth + (startMeasure - 1) * regularMeasureWidth;
        const logicalCropWidth = startMeasure === 0
          ? canvasPadding + firstMeasureWidth + (count - 1) * regularMeasureWidth + (isFinalSystem ? canvasPadding : 0)
          : count * regularMeasureWidth + (isFinalSystem ? canvasPadding : 0);
        const sourceX = Math.round(logicalStartX * scaleX);
        const sourceWidth = Math.min(
          canvasElement.width - sourceX,
          Math.round(logicalCropWidth * scaleX),
        );

        const prefixWidth = startMeasure === 0 ? 0 : Math.round(repeatedClefWidth * scaleX);
        const systemCanvas = document.createElement('canvas');
        systemCanvas.width = prefixWidth + sourceWidth;
        systemCanvas.height = canvasElement.height;
        const systemContext = systemCanvas.getContext('2d');
        if (!systemContext) throw new Error('Could not prepare a printable notation system.');
        systemContext.fillStyle = '#ffffff';
        systemContext.fillRect(0, 0, systemCanvas.width, systemCanvas.height);
        if (prefixWidth > 0) {
          // Repeat the opening bracket, clefs, time signature, and TAB label
          // at the start of every wrapped system, as conventional notation does.
          systemContext.drawImage(
            canvasElement,
            0,
            0,
            prefixWidth,
            canvasElement.height,
            0,
            0,
            prefixWidth,
            canvasElement.height,
          );
        }
        systemContext.drawImage(canvasElement, sourceX, 0, sourceWidth, canvasElement.height, prefixWidth, 0, sourceWidth, canvasElement.height);

        const fullSystemWidth = canvasPadding + measuresPerSystem * regularMeasureWidth;
        const logicalSystemWidth = logicalCropWidth + (startMeasure === 0 ? 0 : repeatedClefWidth);
        const renderedWidth = contentWidth * Math.min(1, logicalSystemWidth / fullSystemWidth);
        const renderedHeight = renderedWidth * (systemCanvas.height / systemCanvas.width);
        if (y + renderedHeight > pageHeight - pageMargin) {
          pdf.addPage();
          pageNumber += 1;
          y = pageMargin;
          drawPageHeader();
        }

        pdf.addImage(systemCanvas.toDataURL('image/png'), 'PNG', pageMargin, y, renderedWidth, renderedHeight);
        y += renderedHeight + systemGap;
      }
      
      pdf.save(`${project.title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
      showSuccess('PDF exported successfully!');
    } catch (err) {
      console.error(err);
      showError('Could not export PDF file.');
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 tracking-tight">Import, Export & Loading Studio</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Load custom text codes, import standard MIDI file, or export files to collaborate.
          </p>
        </div>
      </div>

      {successMsg && (
        <div role="status" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded p-3 flex items-center gap-2.5 text-xs font-medium animate-in fade-in duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-none" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded p-3 flex items-center gap-2.5 text-xs font-medium animate-in fade-in duration-200">
          <div className="flex-none">⚠️</div>
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loading / Importing Area */}
        <div className="flex flex-col gap-4 bg-zinc-950/60 p-5 rounded border border-zinc-800/60">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <FileUp className="w-3.5 h-3.5 text-indigo-400" />
            Import / Loading Methods
          </span>

          {/* Text/Comma/JSON loader */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-300 font-medium flex items-center justify-between">
              <span>Text Entry field</span>
            </label>
            <div className="text-[10px] text-zinc-500 font-mono mb-1 leading-relaxed">
              <strong>Format:</strong> <code>fret/string[:duration][.][x]</code><br/>
              <strong>Rests:</strong> <code>x</code> or empty string<br/>
              <strong>Durations:</strong> <code>:w</code> (whole), <code>:h</code> (half), <code>:q</code> (quarter, default), <code>:e</code> (eighth), <code>:s</code> (16th)<br/>
              <strong>Modifiers:</strong> add <code>.</code> for dotted notes, add <code>x</code> to a note (e.g., <code>5/3x</code>) for a ghost note, or use <code>m</code> instead of a fret number (e.g., <code>m/3</code>) for a muted string.<br/>
              <strong>Chords:</strong> join notes with <code>+</code> (e.g., <code>5/3+m/2</code>)<br/>
              <strong>Measures:</strong> separate measures with <code>|</code><br/>
              <strong>Example:</strong> <code>5/3:e, 7/3:q., 5/2x:s, m/3+5/4:q</code>
            </div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="e.g. 5/3:e, 7/3:q., 5/2x:s, x"
              rows={3}
              className="w-full bg-zinc-900/80 border border-zinc-800 text-zinc-100 p-3 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
            />
            <button
              onClick={handleLoadText}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-750 active:bg-zinc-900 text-zinc-200 border border-zinc-700 text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              Load Note Sequence
            </button>
            <input
              ref={textFileInputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={handleTextFileImport}
              className="hidden"
            />
            <button
              onClick={() => textFileInputRef.current?.click()}
              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileUp className="w-4 h-4" />
              Import Markup from Text File
            </button>
          </div>

          <div className="border-t border-zinc-800/80 my-1" />

          {/* MIDI file importer */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-300 font-medium">Import Standard MIDI File</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".mid,.midi"
                ref={midiInputRef}
                onChange={handleMidiImport}
                className="hidden"
              />
              <button
                onClick={() => midiInputRef.current?.click()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <FileUp className="w-4 h-4" />
                Select MIDI File
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono text-center mt-1">
              Supports standard Format 0 and Format 1 MIDI files.
            </p>
          </div>
        </div>

        {/* Exporting Area */}
        <div className="flex flex-col gap-4 bg-zinc-950/60 p-5 rounded border border-zinc-800/60 justify-between">
          <div className="flex flex-col gap-4">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <FileDown className="w-3.5 h-3.5 text-indigo-400" />
              Professional Export Studio
            </span>

            <div className="flex flex-col gap-2.5">
              {/* PDF Print Button */}
              <button
                onClick={handleTriggerPrint}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-100 rounded text-xs font-semibold flex items-center justify-between px-4 transition-all hover:translate-x-0.5 active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-rose-400" />
                  <span>Export as Printable PDF</span>
                </div>
                <Download className="w-3.5 h-3.5 opacity-60 text-indigo-400" />
              </button>

              {/* MIDI download Button */}
              <button
                onClick={handleExportText}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-100 rounded text-xs font-semibold flex items-center justify-between px-4 transition-all hover:translate-x-0.5 active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Export Grid as Text Markup (.txt)</span>
                </div>
                <Download className="w-3.5 h-3.5 opacity-60 text-indigo-400" />
              </button>

              {/* MIDI download Button */}
              <button
                onClick={handleExportMIDI}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-100 rounded text-xs font-semibold flex items-center justify-between px-4 transition-all hover:translate-x-0.5 active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-emerald-400" />
                  <span>Export as MIDI File (.mid)</span>
                </div>
                <Download className="w-3.5 h-3.5 opacity-60 text-indigo-400" />
              </button>

              <label className="flex items-start gap-2 px-1 text-[10px] text-zinc-400 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMidiRests}
                  onChange={(event) => setIncludeMidiRests(event.target.checked)}
                  className="mt-0.5 accent-indigo-500"
                />
                <span>
                  Include empty grid cells as MIDI rests
                  <span className="block text-zinc-600">Off by default so unused cells do not add silence between written notes.</span>
                </span>
              </label>

              {/* MusicXML download Button */}
              <button
                onClick={handleExportMusicXML}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-100 rounded text-xs font-semibold flex items-center justify-between px-4 transition-all hover:translate-x-0.5 active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Export as MusicXML (.musicxml)</span>
                </div>
                <Download className="w-3.5 h-3.5 opacity-60 text-indigo-400" />
              </button>
            </div>
          </div>

          <div className="text-[10px] text-zinc-400 leading-relaxed font-sans bg-zinc-900 border border-zinc-800/80 rounded p-2.5">
            <strong>Pro Tip:</strong> When printing to PDF, select <span className="font-semibold text-zinc-200">Save as PDF</span> and check the <span className="font-semibold text-zinc-200">Background Graphics</span> box in your system's print dialog to preserve layout colors!
          </div>
        </div>
      </div>
    </div>
  );
};
