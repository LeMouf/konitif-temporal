import type { ClockGraph } from '../clock/clockGraph.js';
import type { TemporalValue } from '../clock/clockTypes.js';

export type TransportState = 'idle' | 'playing' | 'paused' | 'seeking' | 'stopped';

export interface TransportSnapshot {
  state: TransportState;
  rate: number;
  position: TemporalValue;
  startedAtRootSeconds: number;
  updatedAtRootSeconds: number;
}

export interface TransportOptions {
  clockGraph: ClockGraph;
  clockId?: string;
  rate?: number;
}

export interface SeekRequest {
  clockId?: string;
  unit?: TemporalValue['unit'];
  value: number;
}

export type TransportListener = (snapshot: TransportSnapshot) => void;
