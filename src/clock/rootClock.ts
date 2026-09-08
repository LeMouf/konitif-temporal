import type { ClockAdapter, ClockDescriptor, TemporalClockUnit, TemporalValue } from './clockTypes.js';

export interface RootClockOptions {
  id?: string;
  kind?: ClockDescriptor['kind'];
  now?: () => number;
}

export function createRootClock(options: RootClockOptions = {}): ClockAdapter {
  const nowProvider = options.now ?? (() => {
    const host = globalThis as { performance?: { now(): number } };
    if (host.performance !== undefined) return host.performance.now() / 1000;
    return Date.now() / 1000;
  });

  const descriptor: ClockDescriptor = {
    id: options.id ?? 'root',
    kind: options.kind ?? 'root',
    unit: 'seconds',
    rate: 1,
  };

  const requireUnit = (unit: TemporalClockUnit): void => {
    if (unit !== 'seconds' && unit !== 'milliseconds') throw new RangeError(`[RootClock] Unsupported unit "${unit}"`);
  };

  return {
    descriptor,
    now(): TemporalValue {
      return { clockId: descriptor.id, unit: 'seconds', value: nowProvider() };
    },
    toSeconds(value: TemporalValue): number {
      requireUnit(value.unit);
      if (value.unit === 'milliseconds') return value.value / 1000;
      return value.value;
    },
    fromSeconds(seconds: number, unit: TemporalClockUnit = 'seconds'): TemporalValue {
      requireUnit(unit);
      return {
        clockId: descriptor.id,
        unit,
        value: unit === 'milliseconds' ? seconds * 1000 : seconds,
      };
    },
  };
}
