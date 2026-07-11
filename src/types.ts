export interface TabPosition {
  string: number; // 1 (High E) to 6 (Low E)
  fret: number;   // 0 to 24
  ghost?: boolean;
  mute?: boolean;
}

export type NoteDuration = 'w' | 'h' | 'q' | 'e' | 's'; // whole, half, quarter, eighth, sixteenth

export interface Beat {
  id: string;
  positions: TabPosition[]; // List of strings and frets played at this time slice (chord support)
  duration: NoteDuration;
  dotted?: boolean;
}

export interface Measure {
  id: string;
  beats: Beat[]; // For 4/4 time signature, if grid is eighths, we have 8 beats
  annotation?: {
    rehearsalMark?: string;
    section?: string;
    lyricCue?: string;
    performanceNote?: string;
  };
}

export type InstrumentType = 'acoustic' | 'electric' | 'synth' | 'distorted';

export interface SongProject {
  title: string;
  bpm: number;
  timeSignature: {
    beats: number; // Numerator, e.g., 4
    beatType: number; // Denominator, e.g., 4
  };
  instrument: InstrumentType;
  measures: Measure[];
}
