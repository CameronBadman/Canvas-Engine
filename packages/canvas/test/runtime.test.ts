import { afterEach, describe, expect, it } from "vitest";
import { createCanvasRuntime, type CanvasMutation } from "../src";

function canvas(): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = 800;
  element.height = 500;
  document.body.appendChild(element);
  return element;
}

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, "devicePixelRatio", {
    value,
    configurable: true,
  });
}

function pointerEvent(
  type: string,
  x: number,
  y: number,
  options: {
    pointerId?: number;
    isPrimary?: boolean;
    coalesced?: Array<{ x: number; y: number }>;
  } = {},
): Event {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    isPrimary: { value: options.isPrimary ?? true },
    getCoalescedEvents: {
      value: options.coalesced
        ? () => options.coalesced!.map((point) => pointerEvent(type, point.x, point.y, options))
        : undefined,
    },
  });
  return event;
}

describe("createCanvasRuntime", () => {
  afterEach(() => {
    setDevicePixelRatio(1);
  });

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

  it("previews rect drags but emits only when the pointer is released", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-rect-drag",
      actorId: "actor-a",
      initialTool: "rect",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 80, 90));
    element.dispatchEvent(pointerEvent("pointermove", 180, 160));

    expect(emitted).toHaveLength(0);

    element.dispatchEvent(pointerEvent("pointerup", 180, 160));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.event_type).toBe("object.created");
    expect(emitted[0]!.payload.object?.renderer_key).toBe("core.rect");
    expect(emitted[0]!.payload.object?.transform).toMatchObject({ x: 80, y: 90 });
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Rect: { width: 100, height: 70 },
    });
    runtime.destroy();
  });

  it("normalizes rect drags from bottom-right to top-left", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-rect-normalized",
      actorId: "actor-a",
      initialTool: "rect",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 180, 160));
    element.dispatchEvent(pointerEvent("pointerup", 80, 90));

    expect(emitted[0]!.payload.object?.transform).toMatchObject({ x: 80, y: 90 });
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Rect: { width: 100, height: 70 },
    });
    runtime.destroy();
  });

  it("cancels rect drags without emitting a mutation", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-rect-cancel",
      actorId: "actor-a",
      initialTool: "rect",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 20, 30));
    element.dispatchEvent(pointerEvent("pointermove", 120, 130));
    element.dispatchEvent(pointerEvent("pointercancel", 120, 130));

    expect(emitted).toHaveLength(0);
    runtime.destroy();
  });

  it("keeps rect drags owned by the initial pointer", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-rect-pointer",
      actorId: "actor-a",
      initialTool: "rect",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 10, 20, { pointerId: 1 }));
    element.dispatchEvent(pointerEvent("pointermove", 300, 300, { pointerId: 2 }));
    element.dispatchEvent(pointerEvent("pointermove", 110, 120, { pointerId: 1 }));
    element.dispatchEvent(pointerEvent("pointerup", 110, 120, { pointerId: 1 }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.object?.transform).toMatchObject({ x: 10, y: 20 });
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Rect: { width: 100, height: 100 },
    });
    runtime.destroy();
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

  it("commits a pen tap as a small dot path", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen-dot",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 50, 60));
    element.dispatchEvent(pointerEvent("pointerup", 50, 60));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Path: {
        points: [
          { x: 49.75, y: 60 },
          { x: 50.25, y: 60 },
        ],
      },
    });
    runtime.destroy();
  });

  it("cancels pen strokes without emitting a mutation", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen-cancel",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    element.dispatchEvent(pointerEvent("pointermove", 30, 30));
    element.dispatchEvent(pointerEvent("pointercancel", 30, 30));

    expect(emitted).toHaveLength(0);
    runtime.destroy();
  });

  it("keeps pen strokes owned by the initial pointer", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen-pointer",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 10, 10, { pointerId: 1 }));
    element.dispatchEvent(pointerEvent("pointermove", 200, 200, { pointerId: 2 }));
    element.dispatchEvent(pointerEvent("pointermove", 20, 20, { pointerId: 1 }));
    element.dispatchEvent(pointerEvent("pointerup", 30, 30, { pointerId: 1 }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Path: {
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 30 },
        ],
      },
    });
    runtime.destroy();
  });

  it("collects coalesced pen samples before committing", () => {
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen-coalesced",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    element.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    element.dispatchEvent(
      pointerEvent("pointermove", 20, 20, {
        coalesced: [
          { x: 8, y: 18 },
          { x: 16, y: 8 },
          { x: 24, y: 18 },
        ],
      }),
    );
    element.dispatchEvent(pointerEvent("pointerup", 32, 0));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Path: {
        points: [
          { x: 0, y: 0 },
          { x: 8, y: 18 },
          { x: 16, y: 8 },
          { x: 24, y: 18 },
          { x: 32, y: 0 },
        ],
      },
    });
    runtime.destroy();
  });

  it("uses high-DPI backing pixels without changing pen coordinates", () => {
    setDevicePixelRatio(2);
    const emitted: CanvasMutation[] = [];
    const element = canvas();
    element.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        toJSON: () => ({}),
      }) as DOMRect;

    const runtime = createCanvasRuntime({
      canvas: element,
      documentId: "doc-pen-dpr",
      actorId: "actor-a",
      initialTool: "pen",
      onMutation: (mutation) => emitted.push(mutation),
    });

    expect(element.width).toBe(1600);
    expect(element.height).toBe(1000);

    element.dispatchEvent(pointerEvent("pointerdown", 100, 120));
    element.dispatchEvent(pointerEvent("pointerup", 100, 120));

    expect(emitted[0]!.payload.object?.geometry).toEqual({
      Path: {
        points: [
          { x: 99.75, y: 120 },
          { x: 100.25, y: 120 },
        ],
      },
    });
    runtime.destroy();
  });
});
