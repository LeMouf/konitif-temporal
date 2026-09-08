export type TemporalClockUnit = 'seconds' | 'milliseconds' | 'frames' | 'samples' | 'beats' | 'ticks';

export type ClockKind =
  | 'root'
  | 'ui'
  | 'camera'
  | 'timeline'
  | 'animation'
  | 'audio'
  | 'video'
  | 'simulation'
  | 'shader'
  | 'musical'
  | 'custom';

export interface ClockDescriptor {
  id: string;
  kind: ClockKind;
  unit: TemporalClockUnit;
  rate: number;
  parentId?: string;
  sampleRate?: number;
  fps?: number;
  bpm?: number;
  ticksPerBeat?: number;
}

export interface TemporalValue {
  clockId: string;
  unit: TemporalClockUnit;
  value: number;
}

export interface ClockAdapter {
  readonly descriptor: ClockDescriptor;
  now(): TemporalValue;
  toSeconds(value: TemporalValue): number;
  fromSeconds(seconds: number, unit?: TemporalClockUnit): TemporalValue;
}
