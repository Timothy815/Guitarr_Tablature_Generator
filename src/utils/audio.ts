import { InstrumentType, SongProject, TabPosition, Beat } from '../types';
import { guitarNoteToPitch } from './notation';

export class AudioPlaybackEngine {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private isPlaying = false;
  private currentBeatIndex = 0;
  private bpm = 120;
  private instrument: InstrumentType = 'acoustic';
  
  // Callback to update UI with current playing beat index
  private onBeatUpdate: ((index: number) => void) | null = null;
  private onPlayStateChange: ((playing: boolean) => void) | null = null;
  private project: SongProject | null = null;
  private metronomeTimerId: number | null = null;
  private isMetronomePlaying = false;
  private metronomeBpm = 120;

  public startMetronome(bpm: number) {
    this.initCtx();
    if (!this.ctx || this.isMetronomePlaying) return;
    this.isMetronomePlaying = true;
    this.metronomeBpm = bpm;
    this.metronomeScheduler();
  }

  public stopMetronome() {
    this.isMetronomePlaying = false;
    if (this.metronomeTimerId) {
      clearTimeout(this.metronomeTimerId);
      this.metronomeTimerId = null;
    }
  }

  public toggleMetronome(bpm: number): boolean {
    if (this.isMetronomePlaying) {
      this.stopMetronome();
      return false;
    } else {
      this.startMetronome(bpm);
      return true;
    }
  }

  private metronomeScheduler() {
    if (!this.isMetronomePlaying || !this.ctx) return;

    // Play a click
    this.playClick();

    const qDurationMs = 60000 / this.metronomeBpm;
    this.metronomeTimerId = window.setTimeout(() => {
      this.metronomeScheduler();
    }, qDurationMs);
  }

  private playClick() {
    if (!this.ctx) return;
    
    // Create a short burst of noise or a high pitched beep
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }
  private flatBeats: Beat[] = [];

  constructor() {
    // Lazy initialize AudioContext on user action
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setCallbacks(
    onBeatUpdate: (index: number) => void,
    onPlayStateChange: (playing: boolean) => void
  ) {
    this.onBeatUpdate = onBeatUpdate;
    this.onPlayStateChange = onPlayStateChange;
  }

  public updateProject(project: SongProject) {
    this.project = project;
    this.bpm = project.bpm;
    this.instrument = project.instrument;
    
    // Flatten measures into a list of individual beats for easier sequential playback
    const beats: typeof this.flatBeats = [];
    project.measures.forEach((measure) => {
      measure.beats.forEach((beat) => {
        beats.push(beat);
      });
    });
    this.flatBeats = beats;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentBeatIndex(): number {
    return this.currentBeatIndex;
  }

  public start(startIndex = 0) {
    this.initCtx();
    if (!this.ctx || this.isPlaying || this.flatBeats.length === 0) return;

    this.isPlaying = true;
    this.currentBeatIndex = startIndex >= this.flatBeats.length ? 0 : startIndex;
    if (this.onPlayStateChange) this.onPlayStateChange(true);

    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  public triggerSingleChord(positions: TabPosition[], instrument: InstrumentType) {
    this.initCtx();
    if (!this.ctx || positions.length === 0) return;
    
    positions.forEach((pos) => {
      const pitch = guitarNoteToPitch(pos.string, pos.fret);
      this.playPluckedNote(pitch, 0.8, instrument);
    });
  }

  private scheduler() {
    if (!this.isPlaying || !this.ctx || this.flatBeats.length === 0) return;

    const currentBeat = this.flatBeats[this.currentBeatIndex];
    if (this.onBeatUpdate) {
      this.onBeatUpdate(this.currentBeatIndex);
    }

    // Play the notes in the current beat
    if (currentBeat.positions.length > 0) {
      currentBeat.positions.forEach((pos) => {
        const pitch = guitarNoteToPitch(pos.string, pos.fret || 0);
        if (pos.mute) {
          this.playPluckedNote(pitch, 0.05, this.instrument, 0.1); // dead mute thwack
        } else if (pos.ghost) {
          this.playPluckedNote(pitch, 0.1, this.instrument, 0.2); // short, quiet
        } else {
          this.playPluckedNote(pitch, 0.5, this.instrument);
        }
      });
    } else {
      // It's a rest, we can play a very soft subtle click or nothing
    }

    // Calculate duration in milliseconds based on BPM and current beat's duration
    // Standard quarter note = 60000 / BPM ms
    const qDurationMs = 60000 / this.bpm;
    let nextNoteDelayMs = qDurationMs; // 'q' is 1 quarter

    switch (currentBeat.duration) {
      case 'w': // whole = 4 quarters
        nextNoteDelayMs = qDurationMs * 4;
        break;
      case 'h': // half = 2 quarters
        nextNoteDelayMs = qDurationMs * 2;
        break;
      case 'q': // quarter = 1 quarter
        nextNoteDelayMs = qDurationMs;
        break;
      case 'e': // eighth = 0.5 quarters
        nextNoteDelayMs = qDurationMs * 0.5;
        break;
      case 's': // sixteenth = 0.25 quarters
        nextNoteDelayMs = qDurationMs * 0.25;
        break;
    }

    if (currentBeat.dotted) {
      nextNoteDelayMs *= 1.5;
    }

    // Move to next beat
    this.currentBeatIndex = (this.currentBeatIndex + 1) % this.flatBeats.length;

    // Schedule next call
    this.timerId = window.setTimeout(() => {
      this.scheduler();
    }, nextNoteDelayMs);
  }

  // Create a Karplus-Strong pluck sound or synth sound on-the-fly
  private playPluckedNote(pitch: number, durationSeconds: number, instrument: InstrumentType, gainMultiplier = 1.0) {
    if (!this.ctx) return;
    const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
    
    // If frequency is invalid, skip
    if (isNaN(frequency) || frequency <= 0) return;

    const sampleRate = this.ctx.sampleRate;
    const numSamples = Math.ceil(sampleRate * Math.max(durationSeconds, 1.2));
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    if (instrument === 'synth') {
      // Standard plucked synth (sine wave with fast decay)
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-4 * t);
      }
    } else {
      // Guitar Physical Modeling: Karplus-Strong string synthesis
      const delayLength = Math.round(sampleRate / frequency);
      const delayBuffer = new Float32Array(delayLength);
      
      // Seed with random noise (the pluck)
      for (let i = 0; i < delayLength; i++) {
        delayBuffer[i] = Math.random() * 2 - 1;
      }

      let delayIndex = 0;
      let decay = 0.991; // Nylon Acoustic
      if (instrument === 'electric') {
        decay = 0.996; // Electric Clean rings longer
      }

      for (let i = 0; i < numSamples; i++) {
        const currentSample = delayBuffer[delayIndex];
        const nextSample = delayBuffer[(delayIndex + 1) % delayLength];
        
        // Low pass filter & feedback decay
        const newSample = (currentSample + nextSample) * 0.5 * decay;
        
        delayBuffer[delayIndex] = newSample;
        delayIndex = (delayIndex + 1) % delayLength;

        if (instrument === 'distorted') {
          // Add heavy clipping/tanh waveshaping
          const distortedVal = Math.tanh(newSample * 4.5);
          data[i] = distortedVal * 0.45;
        } else {
          data[i] = newSample;
        }
      }
    }

    // Apply standard exponential fade-out to prevent pops at the end of the sound
    const fadeOutSamples = Math.round(sampleRate * 0.05);
    for (let i = 0; i < fadeOutSamples; i++) {
      const idx = numSamples - fadeOutSamples + i;
      if (idx >= 0 && idx < data.length) {
        data[idx] *= (fadeOutSamples - i) / fadeOutSamples;
      }
    }

    // Play the buffer
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Apply slight volume adjustment based on guitar ranges
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = (instrument === 'distorted' ? 0.6 : 0.8) * gainMultiplier;

    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    source.start();
  }
}
