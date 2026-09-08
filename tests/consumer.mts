import { createClockGraph, createRootClock, createTemporalTransport, createTemporalHistoryRecorder } from '@konitif/temporal';
import { createVideoClock } from '@konitif/temporal/clock/videoClock';
const transport = createTemporalTransport({ clockGraph: createClockGraph([createRootClock({ now: () => 0 })]) });
transport.seek({ value: 2, unit: 'seconds' });
const history = createTemporalHistoryRecorder<{ timeSeconds: number; temperature: number }, { timeSeconds: number; type: string }>();
history.recordSample({ timeSeconds: 2, temperature: 18 });
const seconds: number = createVideoClock({ fps: 25 }).toSeconds({ clockId: 'video', unit: 'frames', value: 50 });
// @ts-expect-error The declaration consumer must retain payload type safety.
history.recordSample({ timeSeconds: seconds, temperature: 'hot' });
