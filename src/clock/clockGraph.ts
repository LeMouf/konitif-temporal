import type { ClockAdapter, TemporalClockUnit, TemporalValue } from './clockTypes.js';
import { createRootClock } from './rootClock.js';

export interface ClockConversionRequest {
  from: string;
  to: string;
  value: number;
  unit?: TemporalClockUnit;
  targetUnit?: TemporalClockUnit;
}

export interface ClockGraph {
  register(clock: ClockAdapter): void;
  get(clockId: string): ClockAdapter | undefined;
  now(clockId?: string): TemporalValue;
  convert(request: ClockConversionRequest): TemporalValue;
  list(): ClockAdapter[];
}

export function createClockGraph(initialClocks: ClockAdapter[] = []): ClockGraph {
  const clocks = new Map<string, ClockAdapter>();
  const root = initialClocks.find(clock => clock.descriptor.id === 'root') ?? createRootClock();
  clocks.set(root.descriptor.id, root);

  const register = (clock: ClockAdapter): void => {
    const id = clock.descriptor.id;
    const existing = clocks.get(id);
    if (existing && existing !== clock) {
      throw new Error(`[ClockGraph] Clock "${id}" is already registered`);
    }
    clocks.set(id, clock);
  };

  for (const clock of initialClocks) register(clock);

  const checked = (value: TemporalValue, id: string, unit: TemporalClockUnit): TemporalValue => {
    if (!['seconds', 'milliseconds', 'frames', 'samples', 'beats', 'ticks'].includes(unit) ||
        !value || value.clockId !== id || value.unit !== unit || !Number.isFinite(value.value)) {
      throw new RangeError(`[ClockGraph] Invalid output from clock "${id}"`);
    }
    return { clockId: id, unit, value: value.value };
  };

  return {
    register,
    get(clockId) {
      return clocks.get(clockId);
    },
    now(clockId = 'root') {
      const clock = clocks.get(clockId);
      if (!clock) throw new Error(`[ClockGraph] Unknown clock "${clockId}"`);
      return checked(clock.now(), clockId, clock.descriptor.unit);
    },
    convert(request) {
      const from = clocks.get(request.from);
      const to = clocks.get(request.to);
      if (!from) throw new Error(`[ClockGraph] Unknown source clock "${request.from}"`);
      if (!to) throw new Error(`[ClockGraph] Unknown target clock "${request.to}"`);
      if (!Number.isFinite(request.value)) throw new RangeError('[ClockGraph] Input must be finite');

      const seconds = from.toSeconds({
        clockId: request.from,
        unit: request.unit ?? from.descriptor.unit,
        value: request.value,
      });
      if (!Number.isFinite(seconds)) throw new RangeError('[ClockGraph] Converted seconds must be finite');

      const unit = request.targetUnit ?? to.descriptor.unit;
      return checked(to.fromSeconds(seconds, unit), request.to, unit);
    },
    list() {
      return [...clocks.values()];
    },
  };
}
