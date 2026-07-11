import type { NoteDuration } from '../types';

export interface RhythmTapEvent {
  type: 'down' | 'up';
  time: number;
}

export interface QuantizedNoteDuration {
  type: 'note';
  duration: NoteDuration;
  dotted?: boolean;
  measuredBeats: number;
}

const DURATIONS: { beats: number; duration: NoteDuration; dotted?: boolean }[] = [
  { beats: 4, duration: 'w' },
  { beats: 3, duration: 'h', dotted: true },
  { beats: 2, duration: 'h' },
  { beats: 1.5, duration: 'q', dotted: true },
  { beats: 1, duration: 'q' },
  { beats: 0.75, duration: 'e', dotted: true },
  { beats: 0.5, duration: 'e' },
  { beats: 0.375, duration: 's', dotted: true },
  { beats: 0.25, duration: 's' },
];

export function quantizeBeatLength(measuredBeats: number) {
  return DURATIONS.reduce((closest, candidate) =>
    Math.abs(candidate.beats - measuredBeats) < Math.abs(closest.beats - measuredBeats)
      ? candidate
      : closest,
  );
}

export function quantizeTapOnsets(events: RhythmTapEvent[], bpm: number): QuantizedNoteDuration[] {
  const downs = events.filter((event) => event.type === 'down');
  if (downs.length === 0) return [];

  const quarterMs = 60000 / bpm;
  const onsetIntervals = downs.slice(0, -1).map((event, index) => downs[index + 1].time - event.time);

  return downs.map((down, index) => {
    let intervalMs = onsetIntervals[index];
    if (intervalMs === undefined) {
      const matchingUp = events.find((event) => event.type === 'up' && event.time > down.time);
      const heldMs = matchingUp ? matchingUp.time - down.time : 0;
      const previousInterval = onsetIntervals.at(-1) ?? quarterMs;
      // A quick final release is input latency, not an intended 16th note.
      intervalMs = heldMs >= quarterMs * 0.25 ? heldMs : previousInterval;
    }

    const measuredBeats = Math.max(0.25, intervalMs / quarterMs);
    const quantized = quantizeBeatLength(measuredBeats);
    return {
      type: 'note' as const,
      duration: quantized.duration,
      dotted: quantized.dotted,
      measuredBeats,
    };
  });
}
