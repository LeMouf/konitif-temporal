import type { ClockAdapter, ClockDescriptor, TemporalClockUnit, TemporalValue } from './clockTypes.js';

export interface AudioClockOptions {
  id?: string;
  audioContext?: { currentTime: number; sampleRate: number };
  sampleRate?: number;
}

export function createAudioClock(options: AudioClockOptions = {}): ClockAdapter {
  const sampleRate = options.audioContext?.sampleRate ?? options.sampleRate ?? 48000;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('[AudioClock] sampleRate must be finite and greater than zero');
  }

  const descriptor: ClockDescriptor = {
    id: options.id ?? 'audio',
    kind: 'audio',
    unit: 'seconds',
    rate: 1,
    sampleRate,
  };

  const requireUnit = (unit: TemporalClockUnit): void => {
    if (unit !== 'seconds' && unit !== 'milliseconds' && unit !== 'samples') throw new RangeError(`[AudioClock] Unsupported unit "${unit}"`);
  };

  return {
    descriptor,
    now(): TemporalValue {
      return {
        clockId: descriptor.id,
        unit: 'seconds',
        value: options.audioContext?.currentTime ?? 0,
      };
    },
    toSeconds(value: TemporalValue): number {
      requireUnit(value.unit);
      if (value.unit === 'samples') return value.value / sampleRate;
      if (value.unit === 'milliseconds') return value.value / 1000;
      return value.value;
    },
    fromSeconds(seconds: number, unit: TemporalClockUnit = 'seconds'): TemporalValue {
      requireUnit(unit);
      const value =
        unit === 'samples' ? seconds * sampleRate :
        unit === 'milliseconds' ? seconds * 1000 :
        seconds;
      return { clockId: descriptor.id, unit, value };
    },
  };
}
