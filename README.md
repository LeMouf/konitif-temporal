# KONITIF Temporal

Composable temporal foundation: clocks, transport, explicit-host scheduling,
invalidation and generic history. No Workbench, UI, robot or browser adapter is
required by the implementation. The candidate for the first public release is
`0.284.1`; publication has not yet been confirmed.

The caller owns transport instances, media sources and history lifecycle. The
package creates no shared product history. Workbench's historical imports re-export
these implementations; product-specific history types and browser wiring stay there.

`@konitif/temporal` exports the selected foundation. The scheduler requires an
explicit host. Root time uses the supplied provider, otherwise performance/Date.
Audio/video rates must be finite and positive; absent media time is static zero,
not a measurement. Unit conversion does not calibrate clocks.

Clock IDs admit one adapter instance per graph. Registering the same instance
again is a no-op; a different instance with the same ID throws before replacement.
Supply a custom `root` in the initial clock list, not after graph construction.
Duplicate distinct instances in that list are also refused. This does not freeze
adapter objects or validate changes made directly to their descriptors.

Fixed-step cadence must also be finite and positive. Transport rates, seek values
and tick/root times must be finite; zero/reverse rates and negative positions
remain supported. Invalid converted seek positions and playback arithmetic overflow
are refused before committing transport state. This does not validate every unit
or output of a custom clock adapter, nor isolate listener exceptions.

Built-in conversions reject unsupported units with `RangeError`: root accepts
seconds/milliseconds, audio additionally accepts samples, and video/fixed-step
additionally accept frames. Beats/ticks require an appropriate separate adapter;
they are not silently treated as seconds.

Graph reads/conversions validate the returned clock ID, expected unit and finite
numeric value, and detach the returned value object. Conversion intermediates must
also be finite. Transport requires root in seconds and validates output positions,
including at construction. Every transition prepares its projected snapshot before
committing state; adapter failures leave transport state and notifications unchanged.
This cannot roll back side effects inside caller-provided adapters or listeners.

History entries are detached from producer data once when recorded, then deeply
frozen. Reads share those immutable entries; snapshot arrays and envelopes remain
independent between subscribers. Payloads support primitives, plain objects and
arrays (including repeated references and cycles). Functions, accessors, class
instances, Date, Map and typed arrays are refused before admission. Convert those
values to plain data explicitly. Producer objects are never frozen. Reader code
must not assign to stored entries; mutable projections should create their own
derived values. Type signatures currently retain their historical shape; runtime
freezing, not TypeScript readonly, enforces this boundary.

The existing PolyForm Noncommercial 1.0.0 license is preserved. There are no runtime
dependencies. TypeScript 5.9.3 is the sole development dependency, pinned in the
lockfile. Public API admission remains separate from the build.

With the approved TypeScript compiler already installed, from the package directory:

```sh
npm run build
```

The standalone configuration emits ESM and declarations into `dist`, without DOM
or Node types and without inheriting Workbench configuration. Package exports
resolve the compiled output; build before consumption through a workspace link.
The application's existing development aliases continue to resolve source files.
The build refuses a different TypeScript version and never installs a compiler.

After building, run the package's native Node contract tests:

```sh
npm test
```

Run this command from the package directory. Tests resolve the compiled public
exports by package name, without Vitest, source aliases or Workbench imports.
They cover clock identity and cadence, transport continuity and failure atomicity,
immutable history, replay units and explicit-host scheduler lifecycle. They require
an existing build and do not install dependencies or rebuild automatically.

`npm run verify:package` creates an offline npm archive and checks its exact file
list and SHA-512 integrity. It runs the 19 ESM contracts and a TypeScript consumer
against the extracted archive, without source aliases. Source maps include their
source content. The evidence archive remains in a temporary directory reported by
the command; nothing is published. An installed npm CLI, tar and the pinned
TypeScript compiler are required; no tool is downloaded automatically.

The publication workflow remains gated by `TEMPORAL_NPM_PUBLISH_ENABLED`, the
`npm-release` environment, an exact version tag on main history, and release-input
checks. The manifest permits public publication; this is not evidence that a
version has been published. Environment approval rules and npm trusted publishing
must be configured separately before workflow activation. These workflow gates
do not prevent an authorized maintainer from publishing directly with npm.
