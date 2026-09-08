import type { ClockAdapter, ClockDescriptor, TemporalClockUnit, TemporalValue } from './clockTypes.js';

export interface VideoClockOptions {
  id?: string;
  fps: number;
  nowSeconds?: () => number;
}

export function createVideoClock(options: VideoClockOptions): ClockAdapter {
  const fps = options.fps;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError('[VideoClock] fps must be finite and greater than zero');
  }
  const descriptor: ClockDescriptor = {
    id: options.id ?? 'video',
    kind: 'video',
    unit: 'frames',
    rate: 1,
    fps,
  };

  const requireUnit = (unit: TemporalClockUnit): void => {
    if (unit !== 'seconds' && unit !== 'milliseconds' && unit !== 'frames') throw new RangeError(`[VideoClock] Unsupported unit "${unit}"`);
  };

  return {
    descriptor,
    now(): TemporalValue {
      const seconds = options.nowSeconds?.() ?? 0;
      return { clockId: descriptor.id, unit: 'frames', value: seconds * fps };
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
        unit === 'frames' ? seconds * fps :
        unit === 'milliseconds' ? seconds * 1000 :
        seconds;
      return { clockId: descriptor.id, unit, value };
    },
  };
}
