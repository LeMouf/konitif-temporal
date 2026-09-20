# @konitif/temporal

Composable clocks, transport, scheduling, invalidation and immutable history
for application runtimes.

## Installation

```sh
npm install @konitif/temporal
```

## What it provides

- Root, fixed-step, audio and video clock adapters.
- A clock graph with explicit unit conversion.
- Transactional transport operations for play, pause, seek, rate and tick.
- Explicit-host frame scheduling and invalidation control.
- Immutable temporal history and replay-oriented contracts.

## Authority boundary

Callers own clock providers, media sources, scheduler hosts and history
lifecycle. This package does not create an implicit global clock, temporal UI,
browser adapter or shared history. Unit conversion aligns representations; it
does not calibrate independent clocks or confirm an external effect.

## Quick start

```ts
import {
  createClockGraph,
  createRootClock,
  createTemporalTransport,
} from '@konitif/temporal';

let now = 0;
const clockGraph = createClockGraph([createRootClock({ now: () => now })]);
const transport = createTemporalTransport({ clockGraph });

transport.play();
now = 1.25;
console.log(transport.tick().position);
```

Clock identifiers are unique within a graph. Invalid units and non-finite
values are rejected before transport state is committed.

## Public entry points

| Entry family | Purpose |
| --- | --- |
| `@konitif/temporal` | Complete public surface. |
| `@konitif/temporal/clock/*` | Clock descriptors, adapters and graph helpers. |
| `@konitif/temporal/transport/*` | Transport contracts and implementation. |
| `@konitif/temporal/scheduler/*` | Frame budget and explicit-host scheduler. |
| `@konitif/temporal/invalidation/*` | Invalidation controller. |
| `@konitif/temporal/history/*` | Immutable temporal history. |

## Reference

See [`reference/`](reference/) for the machine-readable capability catalog and
authority diagrams.

## License

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE.md), not OSI open
source. Commercial use requires separate written authorization.
