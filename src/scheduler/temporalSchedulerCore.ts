import type { TemporalTransport } from '../transport/temporalTransport.js';
import type { InvalidationController } from '../invalidation/invalidationController.js';
import { createFrameBudget, type PerformanceMode } from './frameBudget.js';

export type VisibilityPolicy = 'pause' | 'catch-up' | 'drop-elapsed';

/** Requested frame callbacks must run asynchronously. */
export interface TemporalSchedulerHost {
  isVisible(): boolean;
  requestFrame?(callback: () => void): number | undefined;
  cancelFrame?(handle: number): void;
}

export interface TemporalSchedulerOptions {
  transport: TemporalTransport;
  invalidation?: InvalidationController;
  mode?: PerformanceMode;
  visibilityPolicy?: VisibilityPolicy;
  externalLoop?: boolean;
  onFrame?: (snapshot: ReturnType<TemporalTransport['snapshot']>, deltaSeconds: number) => void;
}

export interface TemporalScheduler {
  start(): void;
  stop(): void;
  setMode(mode: PerformanceMode): void;
  frame(rootSeconds?: number): void;
  isRunning(): boolean;
}

export function createTemporalSchedulerCore(
  options: TemporalSchedulerOptions,
  host: TemporalSchedulerHost,
): TemporalScheduler {
  let budget = createFrameBudget(options.mode ?? 'balanced');
  let running = false;
  let rafId: number | undefined;
  let lastRootSeconds = options.transport.clockGraph.now('root').value;

  const shouldRender = () => {
    if (budget.mode !== 'static') return true;
    return options.invalidation?.hasInvalidation() ?? false;
  };

  const runFrame = (rootSeconds = options.transport.clockGraph.now('root').value) => {
    if (!host.isVisible() && options.visibilityPolicy !== 'catch-up') {
      if (options.visibilityPolicy === 'drop-elapsed') {
        lastRootSeconds = rootSeconds;
      }
      return;
    }

    const deltaSeconds = Math.max(0, rootSeconds - lastRootSeconds);
    const snapshot = options.transport.tick(rootSeconds);

    if (shouldRender()) {
      options.onFrame?.(snapshot, deltaSeconds);
      options.invalidation?.consume();
    }

    lastRootSeconds = rootSeconds;
  };

  const loop = () => {
    if (!running) return;
    runFrame();

    rafId = host.requestFrame?.(loop);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastRootSeconds = options.transport.clockGraph.now('root').value;
      if (!options.externalLoop) {
        rafId = host.requestFrame?.(loop);
      }
    },
    stop() {
      running = false;
      if (rafId !== undefined) {
        host.cancelFrame?.(rafId);
      }
    },
    setMode(mode) {
      budget = createFrameBudget(mode);
    },
    frame(rootSeconds) {
      runFrame(rootSeconds);
    },
    isRunning() {
      return running;
    },
  };
}
