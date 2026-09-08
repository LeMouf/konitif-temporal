import type { SeekRequest, TransportListener, TransportOptions, TransportSnapshot, TransportState } from './transportTypes.js';

export interface TemporalTransport {
  readonly clockGraph: TransportOptions['clockGraph'];
  snapshot(): TransportSnapshot;
  play(): void;
  pause(): void;
  stop(): void;
  seek(request: SeekRequest): void;
  setRate(rate: number): void;
  tick(rootSeconds?: number): TransportSnapshot;
  subscribe(listener: TransportListener): () => void;
}

export function createTemporalTransport(options: TransportOptions): TemporalTransport {
  const finite = (value: number, label: string): number => {
    if (!Number.isFinite(value)) throw new RangeError(`[TemporalTransport] ${label} must be finite`);
    return value;
  };
  const requireRoot = () => {
    if (options.clockGraph.get('root')?.descriptor.unit !== 'seconds') {
      throw new RangeError('[TemporalTransport] root must use seconds');
    }
  };
  const rootNow = () => {
    requireRoot();
    const value = options.clockGraph.now('root');
    if (value.clockId !== 'root' || value.unit !== 'seconds') {
      throw new RangeError('[TemporalTransport] Invalid root output');
    }
    return finite(value.value, 'root time');
  };
  const clockId = options.clockId ?? 'root';
  const requireClock = (id: string) => {
    const clock = options.clockGraph.get(id);
    if (!clock) throw new Error(`[TemporalTransport] Unknown clock "${id}"`);
    return clock;
  };
  requireClock(clockId);
  const listeners = new Set<TransportListener>();

  let state: TransportState = 'idle';
  let rate = finite(options.rate ?? 1, 'rate');
  let positionSeconds = 0;
  let startedAtRootSeconds = rootNow();
  let updatedAtRootSeconds = startedAtRootSeconds;

  const project = (seconds: number) => {
    const clock = requireClock(clockId);
    const unit = clock.descriptor.unit;
    const value = clock.fromSeconds(seconds);
    if (!['seconds', 'milliseconds', 'frames', 'samples', 'beats', 'ticks'].includes(unit) ||
        !value || value.clockId !== clockId || value.unit !== unit || !Number.isFinite(value.value)) {
      throw new RangeError('[TemporalTransport] Invalid output position');
    }
    return { clockId, unit, value: value.value };
  };
  const snapshot = (): TransportSnapshot => ({
    state,
    rate,
    position: project(positionSeconds),
    startedAtRootSeconds,
    updatedAtRootSeconds,
  });

  const emit = (current: TransportSnapshot) => {
    for (const listener of listeners) listener(current);
  };

  // All fallible adapter work precedes the assignment of transport state.
  const commit = (next: {
    state: TransportState; rate: number; seconds: number; started: number; updated: number;
  }, notify: boolean): TransportSnapshot => {
    const current: TransportSnapshot = {
      state: next.state, rate: next.rate, position: project(next.seconds),
      startedAtRootSeconds: next.started, updatedAtRootSeconds: next.updated,
    };
    state = next.state;
    rate = next.rate;
    positionSeconds = next.seconds;
    startedAtRootSeconds = next.started;
    updatedAtRootSeconds = next.updated;
    if (notify) emit(current);
    return current;
  };
  const advance = (time: number) => state === 'playing'
    ? finite(positionSeconds + Math.max(0, time - updatedAtRootSeconds) * rate, 'position')
    : positionSeconds;
  project(positionSeconds);

  const api: TemporalTransport = {
    clockGraph: options.clockGraph,
    snapshot,
    play() {
      if (state === 'playing') return;
      const time = rootNow();
      commit({ state: 'playing', rate, seconds: positionSeconds, started: time, updated: time }, true);
    },
    pause() {
      if (state !== 'playing') return;
      const time = rootNow();
      commit({ state: 'paused', rate, seconds: advance(time), started: startedAtRootSeconds, updated: time }, true);
    },
    stop() {
      const time = rootNow();
      commit({ state: 'stopped', rate, seconds: 0, started: startedAtRootSeconds, updated: time }, true);
    },
    seek(request) {
      finite(request.value, 'seek value');
      const sourceClock = request.clockId ?? clockId;
      const nextPositionSeconds = finite(requireClock(sourceClock).toSeconds({
        clockId: sourceClock,
        unit: request.unit ?? 'seconds',
        value: request.value,
      }), 'converted position');

      const time = rootNow();
      commit({ state: state === 'playing' ? 'playing' : 'seeking', rate,
        seconds: nextPositionSeconds, started: startedAtRootSeconds, updated: time }, true);
    },
    setRate(nextRate) {
      finite(nextRate, 'rate');
      const time = rootNow();
      commit({ state, rate: nextRate, seconds: advance(time), started: startedAtRootSeconds, updated: time }, true);
    },
    tick(rootSeconds = rootNow()) {
      finite(rootSeconds, 'tick time');
      requireRoot();
      return commit({ state, rate, seconds: advance(rootSeconds), started: startedAtRootSeconds, updated: rootSeconds }, false);
    },
    subscribe(listener) {
      const current = snapshot();
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return api;
}
