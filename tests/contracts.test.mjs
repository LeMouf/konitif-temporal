import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRootClock, createClockGraph, createAudioClock, createVideoClock,
  createFixedStepClock, createTemporalTransport, createTemporalHistoryRecorder,
  createTemporalSchedulerCore, createInvalidationController,
} from '@konitif/temporal';
import { createRootClock as rootSubpath } from '@konitif/temporal/clock/rootClock';

const graphAtZero = () => createClockGraph([createRootClock({ now: () => 0 })]);

test('compiled barrel and subpath share the same implementation', () => {
  assert.equal(rootSubpath, createRootClock);
});

test('clock identity cannot be replaced and media conversion retains units', () => {
  const audio = createAudioClock({ sampleRate: 48000 });
  const graph = createClockGraph([audio, createVideoClock({ fps: 24 })]);
  graph.register(audio);
  assert.throws(() => graph.register(createAudioClock()), Error);
  assert.equal(graph.get('audio'), audio);
  assert.equal(graph.convert({ from: 'audio', to: 'video', unit: 'samples', value: 24000 }).value, 12);
  assert.throws(() => audio.fromSeconds(1, 'beats'), RangeError);
});

for (const rate of [0, -1, NaN, Infinity, -Infinity]) {
  test(`invalid cadence ${rate} is refused without reading media time`, () => {
    let reads = 0;
    assert.throws(() => createAudioClock({ sampleRate: rate }), RangeError);
    assert.throws(() => createFixedStepClock({ fps: rate }), RangeError);
    assert.throws(() => createVideoClock({ fps: rate, nowSeconds: () => { reads++; return 1; } }), RangeError);
    assert.equal(reads, 0);
  });
}

test('transport pause, resume and rate changes preserve temporal continuity', () => {
  let now = 0;
  const transport = createTemporalTransport({ clockGraph: createClockGraph([createRootClock({ now: () => now })]) });
  transport.play();
  now = 2;
  transport.pause();
  assert.equal(transport.snapshot().position.value, 2);
  now = 10;
  transport.play();
  now = 11;
  transport.setRate(-1);
  assert.equal(transport.snapshot().position.value, 3);
  assert.equal(transport.tick(12).position.value, 2);
  transport.stop();
  assert.equal(transport.snapshot().position.value, 0);
});

for (const value of [NaN, Infinity, -Infinity]) {
  test(`invalid transport value ${value} leaves state and notifications unchanged`, () => {
    const transport = createTemporalTransport({ clockGraph: graphAtZero() });
    transport.play();
    let calls = 0;
    const unsubscribe = transport.subscribe(() => calls++);
    const before = transport.snapshot();
    for (const action of [() => transport.seek({ value }), () => transport.setRate(value), () => transport.tick(value)]) {
      assert.throws(action, RangeError);
      assert.deepEqual(transport.snapshot(), before);
      assert.equal(calls, 1);
    }
    unsubscribe();
    transport.stop();
    assert.equal(calls, 1);
  });
}

test('output adapter failure does not commit a transition', () => {
  let broken = false;
  const output = createVideoClock({ fps: 25 });
  const graph = graphAtZero();
  graph.register({ ...output, fromSeconds: seconds => broken
    ? { clockId: 'foreign', unit: 'frames', value: seconds }
    : output.fromSeconds(seconds) });
  const transport = createTemporalTransport({ clockGraph: graph, clockId: 'video' });
  const before = transport.snapshot();
  let calls = 0;
  transport.subscribe(() => calls++);
  broken = true;
  assert.throws(() => transport.play(), RangeError);
  broken = false;
  assert.deepEqual(transport.snapshot(), before);
  assert.equal(calls, 1);
});

test('history owns immutable data, not producer objects or subscriber envelopes', () => {
  const history = createTemporalHistoryRecorder({ now: () => 1000 });
  const payload = { values: [1] };
  const entry = history.recordSample({ timeSeconds: 0, payload });
  payload.values[0] = 9;
  assert.equal(entry.payload.values[0], 1);
  assert.equal(Object.isFrozen(payload), false);
  assert.throws(() => { entry.payload.values[0] = 2; }, TypeError);
  history.subscribe(snapshot => { snapshot.samples.length = 0; });
  let observed;
  history.subscribe(snapshot => { observed = snapshot.samples; });
  history.recordSample({ timeSeconds: 1 });
  assert.equal(observed.length, 2);
  assert.equal(history.sampleAt(0), entry);
});

for (const payload of [new Date(0), new Map(), new Uint8Array(1), () => 0]) {
  test(`history refuses ${typeof payload === 'function' ? 'functions' : payload.constructor.name} before admission`, () => {
    let reads = 0;
    const history = createTemporalHistoryRecorder({ now: () => { reads++; return 0; } });
    const before = reads;
    assert.throws(() => history.recordSample({ timeSeconds: 0, payload }), TypeError);
    assert.equal(reads, before);
    assert.equal(history.snapshot().samples.length, 0);
    assert.equal(history.recordSample({ timeSeconds: 0 }).id, 1);
  });
}

test('history replay uses milliseconds while samples and seek use seconds', () => {
  let now = 1000;
  const history = createTemporalHistoryRecorder({ now: () => now });
  history.recordSample({ timeSeconds: 0 });
  history.recordSample({ timeSeconds: 2 });
  history.seek(0);
  history.setReplayState('playing');
  now += 500;
  history.tick();
  assert.equal(history.snapshot().replayTimeSeconds, 0.5);
  history.clear();
  assert.equal(history.snapshot().replayState, 'live');
  assert.equal(history.recordSample({ timeSeconds: 4 }).id, 1);
});

test('explicit scheduler host owns scheduling and cancellation', () => {
  const transport = createTemporalTransport({ clockGraph: graphAtZero() });
  const invalidation = createInvalidationController();
  let requests = 0;
  const cancelled = [];
  let frames = 0;
  const scheduler = createTemporalSchedulerCore({ transport, invalidation, mode: 'static', onFrame: () => frames++ }, {
    isVisible: () => true,
    requestFrame: () => ++requests,
    cancelFrame: handle => cancelled.push(handle),
  });
  scheduler.start();
  scheduler.start();
  assert.equal(requests, 1);
  scheduler.frame(1);
  assert.equal(frames, 0);
  invalidation.invalidate('state');
  scheduler.frame(2);
  assert.equal(frames, 1);
  assert.equal(invalidation.hasInvalidation(), false);
  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
  assert.deepEqual(cancelled, [1]);
});
