import { describe, expect, it } from "vitest";
import { createCanvasRuntime, type CanvasMutation } from "../src";

function canvas(): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = 800;
  element.height = 500;
  document.body.appendChild(element);
  return element;
}

function pointerEvent(type: string, x: number, y: number): Event {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
  }) as Event;
}

describe("createCanvasRuntime", () => {
  it("emits local mutations through the callback", () => {
    const emitted: Array<{ mutation: CanvasMutation; binary: Uint8Array }> = [];
    const runtime = createCanvasRuntime({
      canvas: canvas(),
      documentId: "doc-local",
      actorId: "actor-a",
      onMutation: (mutation, binary) => emitted.push({ mutation, binary }),
    });

    const mutation = runtime.createRect({ x: 10, y: 20, width: 100, height: 50 });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.mutation.event_id).toBe(mutation.event_id);
    expect(emitted[0]!.binary.byteLength).toBeGreaterThan(0);
    runtime.destroy();
  });

  it("does not re-emit remote JSON mutations", () => {
    const source = createCanvasRuntime({
      canvas: canvas(),
      documentId: "doc-remote",
      actorId: "actor-source",
    });
    const mutation = source.createRect({ x: 0, y: 0, width: 40, height: 40 });
    let emitted = 0;
    const target = createCanvasRuntime({
      canvas: canvas(),
      documentId: "doc-remote",
      actorId: "actor-target",
      onMutation: () => {
        emitted += 1;
      },
    });

    const result = target.applyMutation(mutation);

    expect(result.applied).toBe(true);
    expect(emitted).toBe(0);
    source.destroy();
    target.destroy();
  });

  it("applies binary mutations and deduplicates repeats", () => {
    let binary: Uint8Array | null = null;
    const source = createCanvasRuntime({
      canvas: canvas(),
      documentId: "doc-binary",
      actorId: "actor-source",
      onMutation: (_mutation, bytes) => {
        binary = bytes;
      },
    });
    source.createRect({ x: 5, y: 6, width: 70, height: 30 });
    expect(binary).not.toBeNull();

    const target = createCanvasRuntime({
      canvas: canvas(),
      documentId: "doc-binary",
      actorId: "actor-target",
    });

    const first = target.applyMutationBinary(binary!);
    const second = target.applyMutationBinary(binary!);

    expect(first.applied).toBe(true);
    expect(second.duplicate).toBe(true);
    source.destroy();
    target.destroy();
  });

  it("previews pen strokes but emits only when the pointer is released", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    element.dispatchEvent(pointerEvent("pointermove", 20, 20));
    element.dispatchEvent(pointerEvent("pointermove", 30, 25));

    expect(emitted).toHaveLength(0);

    element.dispatchEvent(pointerEvent("pointerup", 40, 30));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.event_type).toBe("object.created");
    expect(emitted[0]!.payload.object?.renderer_key).toBe("core.path");
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Path: {
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
          { x: 40, y: 30 },
        ],
      },
    });
    runtime.destroy();
  });
});
