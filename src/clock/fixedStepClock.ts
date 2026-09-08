import type { ClockAdapter, ClockDescriptor, TemporalClockUnit, TemporalValue } from './clockTypes.js';

export interface FixedStepClockOptions {
  id?: string;
  kind?: ClockDescriptor['kind'];
  fps?: number;
}

export function createFixedStepClock(options: FixedStepClockOptions = {}): ClockAdapter {
  const fps = options.fps ?? 60;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError('[FixedStepClock] fps must be finite and greater than zero');
  }

  const descriptor: ClockDescriptor = {
    id: options.id ?? 'simulation',
    kind: options.kind ?? 'simulation',
    unit: 'frames',
    rate: 1,
    fps,
  };

  const frame = 0;

  const requireUnit = (unit: TemporalClockUnit): void => {
    if (unit !== 'seconds' && unit !== 'milliseconds' && unit !== 'frames') throw new RangeError(`[FixedStepClock] Unsupported unit "${unit}"`);
  };

  return {
    descriptor,
    now(): TemporalValue {
      return { clockId: descriptor.id, unit: 'frames', value: frame };
    },
    toSeconds(value: TemporalValue): number {
      requireUnit(value.unit);
      if (value.unit === 'frames') return value.value / fps;
      if (value.unit === 'milliseconds') return value.value / 1000;
      return value.value;
    },
    fromSeconds(seconds: number, unit: TemporalClockUnit = 'frames'): TemporalValue {
      requireUnit(unit);
      const value =
        unit === 'frames' ? Math.round(seconds * fps) :
        unit === 'milliseconds' ? seconds * 1000 :
        seconds;
      return { clockId: descriptor.id, unit, value };
    },
  };
}
