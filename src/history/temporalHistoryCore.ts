/** Domain-independent history. now()/tick() use milliseconds; entry timeSeconds uses seconds. */
export type TemporalHistoryReplayState = 'live' | 'paused' | 'playing';
export interface TemporalHistoryData { timeSeconds: number }
export type TemporalHistoryEntry<T extends TemporalHistoryData> = T & { id: number; recordedAt: number };

export interface TemporalHistorySpan {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface TemporalHistorySnapshot<S extends TemporalHistoryData, E extends TemporalHistoryData> {
  isRecording: boolean;
  windowSeconds: number;
  replayState: TemporalHistoryReplayState;
  replaySpeed: number;
  replayTimeSeconds: number | null;
  span: TemporalHistorySpan | null;
  samples: TemporalHistoryEntry<S>[];
  events: TemporalHistoryEntry<E>[];
  latestSample: TemporalHistoryEntry<S> | null;
  selectedSample: TemporalHistoryEntry<S> | null;
}

export interface TemporalHistoryRecorderOptions {
  isRecording?: boolean;
  windowSeconds?: number;
  maxSamples?: number;
  maxEvents?: number;
  now?: () => number;
}

export interface TemporalHistoryRecorder<S extends TemporalHistoryData, E extends TemporalHistoryData> {
  isRecording(): boolean;
  setRecording(isRecording: boolean): void;
  recordSample(sample: S & { recordedAt?: number }): TemporalHistoryEntry<S>;
  recordEvent(event: E & { recordedAt?: number }): TemporalHistoryEntry<E>;
  setWindowSeconds(windowSeconds: number): void;
  setReplayState(state: TemporalHistoryReplayState): void;
  setReplaySpeed(speed: number): void;
  seek(timeSeconds: number): void;
  tick(rootNow?: number): void;
  sampleAt(timeSeconds: number): TemporalHistoryEntry<S> | null;
  snapshot(): TemporalHistorySnapshot<S, E>;
  subscribe(listener: (snapshot: TemporalHistorySnapshot<S, E>) => void): () => void;
  removeSamples(predicate: (sample: TemporalHistoryEntry<S>) => boolean): number;
  clear(): void;
}

const DEFAULT_RUNTIME_HISTORY_WINDOW_SECONDS = 10;
const DEFAULT_RUNTIME_HISTORY_MAX_SAMPLES = 1_200;
const DEFAULT_RUNTIME_HISTORY_MAX_EVENTS = 2_000;
const MIN_RUNTIME_HISTORY_WINDOW_SECONDS = 1;
const MAX_RUNTIME_HISTORY_WINDOW_SECONDS = 120;

/** Detach producer-owned data once; readers may share the immutable stored value. */
function immutableHistoryData<T>(input: T): T {
  const seen = new WeakMap<object, object>();
  const clone = (value: unknown): unknown => {
    if (typeof value === 'function') throw new TypeError('[TemporalHistory] Functions are not history data');
    if (value === null || typeof value !== 'object') return value;
    const existing = seen.get(value);
    if (existing) return existing;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) {
      throw new TypeError('[TemporalHistory] Expected plain objects or arrays');
    }
    const copy = Array.isArray(value) ? new Array(value.length) : Object.create(prototype);
    seen.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new TypeError('[TemporalHistory] Accessors are not history data');
      Object.defineProperty(copy, key, {
        value: clone(descriptor.value), enumerable: descriptor.enumerable,
        writable: false, configurable: false,
      });
    }
    return Object.freeze(copy);
  };
  return clone(input) as T;
}

export function createTemporalHistoryRecorder<
  S extends TemporalHistoryData = TemporalHistoryData,
  E extends TemporalHistoryData = TemporalHistoryData,
>(options: TemporalHistoryRecorderOptions = {}): TemporalHistoryRecorder<S, E> {
  type RuntimeHistorySample = TemporalHistoryEntry<S>;
  type RuntimeHistoryEvent = TemporalHistoryEntry<E>;
  type RuntimeHistorySnapshot = TemporalHistorySnapshot<S, E>;
  type RuntimeHistoryRecorder = TemporalHistoryRecorder<S, E>;
  const now = options.now ?? (() => Date.now());
  let windowSeconds = clampWindowSeconds(options.windowSeconds ?? DEFAULT_RUNTIME_HISTORY_WINDOW_SECONDS);
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_RUNTIME_HISTORY_MAX_SAMPLES));
  const maxEvents = Math.max(1, Math.floor(options.maxEvents ?? DEFAULT_RUNTIME_HISTORY_MAX_EVENTS));
  let isRecording = options.isRecording === true;
  let nextSampleId = 1;
  let nextEventId = 1;
  let samples: RuntimeHistorySample[] = [];
  let events: RuntimeHistoryEvent[] = [];
  let replayState: TemporalHistoryReplayState = 'live';
  let replaySpeed = 1;
  let replayTimeSeconds: number | null = null;
  let lastReplayTickAt: number | null = null;
  const listeners = new Set<(snapshot: RuntimeHistorySnapshot) => void>();

  function emit(): void {
    const current = snapshot();
    for (const listener of listeners) {
      listener({
        ...current,
        span: current.span ? { ...current.span } : null,
        samples: [...current.samples], events: [...current.events],
      });
    }
  }

  function prune(referenceSeconds = lastEntry(samples)?.timeSeconds ?? lastEntry(events)?.timeSeconds ?? 0): void {
    const minTime = referenceSeconds - windowSeconds;
    samples = samples.filter((sample) => sample.timeSeconds >= minTime).slice(-maxSamples);
    events = events.filter((event) => event.timeSeconds >= minTime).slice(-maxEvents);

    const span = resolveSpan(samples);
    if (!span) {
      replayTimeSeconds = null;
      return;
    }

    if (replayTimeSeconds !== null) {
      replayTimeSeconds = clamp(replayTimeSeconds, span.startSeconds, span.endSeconds);
    }
  }

  function snapshot(): RuntimeHistorySnapshot {
    const span = resolveSpan(samples);
    const liveSample = lastEntry(samples) ?? null;
    const selectedTime = replayState === 'live' ? liveSample?.timeSeconds ?? null : replayTimeSeconds;
    const selectedSample = selectedTime === null ? liveSample : sampleAt(selectedTime);

    return {
      isRecording,
      windowSeconds,
      replayState,
      replaySpeed,
      replayTimeSeconds,
      span,
      samples: [...samples],
      events: [...events],
      latestSample: liveSample,
      selectedSample
    };
  }

  function sampleAt(timeSeconds: number): RuntimeHistorySample | null {
    if (samples.length === 0) {
      return null;
    }

    let bestSample = samples[0];
    let bestDistance = Math.abs(bestSample.timeSeconds - timeSeconds);

    for (let index = 1; index < samples.length; index += 1) {
      const sample = samples[index];
      const distance = Math.abs(sample.timeSeconds - timeSeconds);

      if (distance > bestDistance && sample.timeSeconds > timeSeconds) {
        break;
      }

      if (distance < bestDistance) {
        bestSample = sample;
        bestDistance = distance;
      }
    }

    return bestSample;
  }

  const recorder: RuntimeHistoryRecorder = {
    isRecording() {
      return isRecording;
    },
    setRecording(nextIsRecording) {
      if (isRecording === nextIsRecording) {
        return;
      }

      isRecording = nextIsRecording;
      emit();
    },
    recordSample(input) {
      const data = immutableHistoryData(input);
      const recordedAt = data.recordedAt ?? now();
      const sample: RuntimeHistorySample = Object.freeze({
        ...data,
        id: nextSampleId,
        recordedAt
      });
      nextSampleId += 1;
      const latestSample = lastEntry(samples);
      samples = !latestSample || latestSample.timeSeconds <= sample.timeSeconds
        ? [...samples, sample]
        : [...samples, sample].sort(
            (left, right) => left.timeSeconds - right.timeSeconds || left.id - right.id
          );
      prune(sample.timeSeconds);

      if (replayState === 'live') {
        replayTimeSeconds = sample.timeSeconds;
      }

      emit();
      return sample;
    },
    recordEvent(input) {
      const data = immutableHistoryData(input);
      const recordedAt = data.recordedAt ?? now();
      const event: RuntimeHistoryEvent = Object.freeze({
        ...data,
        id: nextEventId,
        recordedAt
      });
      nextEventId += 1;
      events = [...events, event];
      prune(event.timeSeconds);
      emit();
      return event;
    },
    setWindowSeconds(nextWindowSeconds) {
      windowSeconds = clampWindowSeconds(nextWindowSeconds);
      const referenceSeconds = lastEntry(samples)?.timeSeconds ?? lastEntry(events)?.timeSeconds ?? 0;
      prune(referenceSeconds);
      emit();
    },
    setReplayState(nextState) {
      replayState = nextState;
      lastReplayTickAt = nextState === 'playing' ? now() : null;

      if (nextState === 'live') {
        replayTimeSeconds = lastEntry(samples)?.timeSeconds ?? null;
      } else if (replayTimeSeconds === null) {
        replayTimeSeconds = lastEntry(samples)?.timeSeconds ?? null;
      }

      emit();
    },
    setReplaySpeed(nextSpeed) {
      replaySpeed = clamp(Number.isFinite(nextSpeed) ? nextSpeed : 1, 0.05, 8);
      emit();
    },
    seek(timeSeconds) {
      const span = resolveSpan(samples);
      replayTimeSeconds = span ? clamp(timeSeconds, span.startSeconds, span.endSeconds) : null;
      replayState = 'paused';
      lastReplayTickAt = null;
      emit();
    },
    tick(rootNow = now()) {
      if (replayState !== 'playing') {
        return;
      }

      const span = resolveSpan(samples);
      if (!span) {
        replayTimeSeconds = null;
        replayState = 'live';
        lastReplayTickAt = null;
        emit();
        return;
      }

      const previousTickAt = lastReplayTickAt ?? rootNow;
      const elapsedSeconds = Math.max(0, (rootNow - previousTickAt) / 1000) * replaySpeed;
      const baseTime = replayTimeSeconds ?? span.startSeconds;
      const nextTime = baseTime + elapsedSeconds;
      lastReplayTickAt = rootNow;

      if (nextTime >= span.endSeconds) {
        replayTimeSeconds = span.endSeconds;
        replayState = 'paused';
        lastReplayTickAt = null;
      } else {
        replayTimeSeconds = nextTime;
      }

      emit();
    },
    sampleAt,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());

      return () => {
        listeners.delete(listener);
      };
    },
    removeSamples(predicate) {
      const previousLength = samples.length;
      samples = samples.filter((sample) => !predicate(sample));
      const removedCount = previousLength - samples.length;

      if (removedCount === 0) {
        return 0;
      }

      const span = resolveSpan(samples);
      if (!span) {
        replayState = 'live';
        replayTimeSeconds = null;
        lastReplayTickAt = null;
      } else if (replayTimeSeconds !== null) {
        replayTimeSeconds = clamp(replayTimeSeconds, span.startSeconds, span.endSeconds);
      }

      emit();
      return removedCount;
    },
    clear() {
      samples = [];
      events = [];
      replayState = 'live';
      replayTimeSeconds = null;
      lastReplayTickAt = null;
      nextSampleId = 1;
      nextEventId = 1;
      emit();
    }
  };

  return recorder;
}

function resolveSpan(samples: readonly TemporalHistoryData[]): TemporalHistorySpan | null {
  const first = samples[0];
  const last = lastEntry(samples);

  if (!first || !last) {
    return null;
  }

  return {
    startSeconds: first.timeSeconds,
    endSeconds: last.timeSeconds,
    durationSeconds: Math.max(0, last.timeSeconds - first.timeSeconds)
  };
}

function clampWindowSeconds(value: number): number {
  return clamp(Number.isFinite(value) ? value : DEFAULT_RUNTIME_HISTORY_WINDOW_SECONDS, MIN_RUNTIME_HISTORY_WINDOW_SECONDS, MAX_RUNTIME_HISTORY_WINDOW_SECONDS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lastEntry<T>(entries: readonly T[]): T | undefined {
  return entries.length > 0 ? entries[entries.length - 1] : undefined;
}
