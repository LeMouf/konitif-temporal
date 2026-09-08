export type PerformanceMode = 'quality' | 'balanced' | 'battery' | 'static';

export interface FrameBudget {
  mode: PerformanceMode;
  targetFps: number;
  frameDurationMs: number;
}

export function createFrameBudget(mode: PerformanceMode = 'balanced'): FrameBudget {
  const targetFps =
    mode === 'quality' ? 120 :
    mode === 'balanced' ? 60 :
    mode === 'battery' ? 30 :
    0;

  return {
    mode,
    targetFps,
    frameDurationMs: targetFps > 0 ? 1000 / targetFps : Infinity,
  };
}
