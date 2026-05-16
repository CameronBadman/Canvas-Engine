# Canvas Engine

Proof-of-concept for a generic event-driven collaborative canvas runtime.

This is not a full drawing application. The repository demonstrates a reusable canvas architecture where Rust/WASM owns canonical document state and TypeScript only adapts that state to browser rendering and integration callbacks.

## Architecture

```text
local input / app code
        |
        v
@canvas-engine/canvas TypeScript adapter
        | create/apply JSON or binary mutations
        v
@canvas-engine/core-wasm Rust/WASM runtime
        | canonical CanvasDocument
        v
renderer-friendly objects JSON
        |
        v
Canvas2D renderers

collaboration transport is external:
runtime A onMutation(binary) -> app/event bus/socket -> runtime B applyMutationBinary(binary)
```

## Packages

```text
packages/
  core-wasm/   Rust crate compiled with wasm-bindgen
  canvas/      TypeScript browser adapter and Canvas2D renderers
  react/       Minimal React hook/component wrapper
examples/
  basic/       Single-canvas Vite demo
  collab-mock/ Two-canvas in-memory binary sync demo
```

## Development

Use the Nix flake for the full toolchain. The ambient shell does not need `pnpm`, `wasm-pack`, or a WASM Rust target installed.

```sh
nix develop
pnpm install
pnpm build
pnpm test
```

Run examples:

```sh
pnpm dev:basic
pnpm dev:collab
```

Build only the WASM package:

```sh
pnpm --filter @canvas-engine/core-wasm build
```

The generated `packages/core-wasm/pkg` directory is build output and is ignored by git.

## Runtime API

`@canvas-engine/canvas` exposes `createCanvasRuntime(options)`.

The returned runtime supports:

- `applyMutation(mutation)`
- `applyMutationBinary(bytes)`
- `createRect(input)`
- `createPath(input)`
- `transformObject(input)`
- `deleteObject(objectId)`
- `render()`
- `getSnapshot()`
- `loadSnapshot(bytes)`
- `exportDocumentJson()`
- `setTool(tool)`
- `destroy()`

Local calls such as `createRect`, `createPath`, `transformObject`, and `deleteObject` emit `onMutation(mutation, binary)`. Remote/programmatic `applyMutation` and `applyMutationBinary` do not re-emit, which prevents echo loops.

## Mutation Model

Every mutation includes:

- `event_id`
- `document_id`
- `actor_id`
- `lamport`
- `event_type`
- optional `target_object_id`
- typed `payload`

MVP event types:

- `object.created`
- `object.updated`
- `object.deleted`
- `object.transformed`
- `document.cleared`

The Rust core deduplicates by `event_id`, advances Lamport time on apply, and applies mutable fields with last-writer-wins ordering by `(lamport, actor_id)`. Deletes tombstone objects instead of removing them. Render output excludes tombstoned objects. Paths are immutable after creation for now.

## JSON And Binary Paths

JSON is the debug path:

- readable mutations
- readable apply results
- document export for inspection

Binary is the integration path:

- mutations encode through `bincode`
- snapshots encode through `bincode`
- the collab mock example relays `Uint8Array` mutations through an in-memory event bus

The TypeScript adapter never owns canonical document state. It asks WASM for render objects and draws them with Canvas2D.

## Limitations

- No text editing
- No full CRDT library
- No Yjs or Automerge integration
- No backend or WebSocket transport
- No WebGL renderer
- Minimal pointer tools only: rectangle creation and freehand path creation
- No object selection or drag editing yet
