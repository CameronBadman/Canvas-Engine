import { WasmCanvasRuntime } from "@canvas-engine/core-wasm";
import { appendPathPoint, drawSmoothPath, finalizePathPoints } from "./path";
import { defaultRenderers } from "./renderers";
import type {
  ApplyResult,
  CanvasMutation,
  CanvasRuntime,
  CanvasRuntimeEvent,
  CanvasTool,
  CreateCanvasRuntimeOptions,
  CreatePathInput,
  CreateRectInput,
  ObjectRenderer,
  Point,
  RenderObject,
  Style,
  Transform,
  TransformObjectInput,
} from "./types";

const DEFAULT_STYLE: Style = {
  fill: "#a7f3d0",
  stroke: "#064e3b",
  stroke_width: 2,
};

const DEFAULT_PATH_STYLE: Style = {
  fill: null,
  stroke: "#1f2937",
  stroke_width: 3,
};

interface ActivePenStroke {
  pointerId: number;
  points: Point[];
}

function parseJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function mergeStyle(base: Style, input?: Partial<Style>): Style {
  return {
    fill: input?.fill ?? base.fill ?? null,
    stroke: input?.stroke ?? base.stroke ?? null,
    stroke_width: input?.stroke_width ?? base.stroke_width,
  };
}

function defaultTransform(x = 0, y = 0): Transform {
  return {
    x,
    y,
    rotation: 0,
    scale_x: 1,
    scale_y: 1,
  };
}

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function pointerId(event: PointerEvent): number {
  return Number.isFinite(event.pointerId) ? event.pointerId : 1;
}

function eventPoints(canvas: HTMLCanvasElement, event: PointerEvent): Point[] {
  const events = event.getCoalescedEvents?.() ?? [event];
  return events.map((coalescedEvent) => canvasPoint(canvas, coalescedEvent));
}

function capturePointer(canvas: HTMLCanvasElement, id: number): void {
  try {
    canvas.setPointerCapture(id);
  } catch {
    // Pointer capture can fail in tests or if the browser already released it.
  }
}

function releasePointer(canvas: HTMLCanvasElement, id: number): void {
  try {
    canvas.releasePointerCapture(id);
  } catch {
    // Releasing an already-released pointer should not affect runtime state.
  }
}

export function createCanvasRuntime(options: CreateCanvasRuntimeOptions): CanvasRuntime {
  const ctx = options.canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas2D context is not available");
  }

  const wasm = new WasmCanvasRuntime(options.documentId, options.actorId);
  const renderers: Record<string, ObjectRenderer> = {
    ...defaultRenderers,
    ...options.renderers,
  };
  let destroyed = false;
  let tool: CanvasTool = options.initialTool ?? "none";
  let dragStart: Point | null = null;
  let activePenStroke: ActivePenStroke | null = null;

  const emitRuntimeEvent = (event: CanvasRuntimeEvent): void => {
    options.onRuntimeEvent?.(event);
  };

  const encodeMutation = (mutation: CanvasMutation): Uint8Array =>
    wasm.encode_mutation_json_to_binary(stringify(mutation));

  const emitLocalMutation = (mutation: CanvasMutation): void => {
    options.onMutation?.(mutation, encodeMutation(mutation));
  };

  const drawDraftPath = (): void => {
    if (!activePenStroke || activePenStroke.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = DEFAULT_PATH_STYLE.stroke ?? "#1f2937";
    ctx.lineWidth = DEFAULT_PATH_STYLE.stroke_width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    drawSmoothPath(ctx, finalizePathPoints(activePenStroke.points));
    ctx.stroke();
    ctx.restore();
  };

  const redraw = (emitRenderedEvent: boolean): void => {
    const objects = parseJson<RenderObject[]>(wasm.get_render_objects_json());
    ctx.clearRect(0, 0, options.canvas.width, options.canvas.height);
    for (const object of objects) {
      const renderer = renderers[object.renderer_key];
      if (renderer) {
        renderer(ctx, object);
      }
    }
    drawDraftPath();
    if (emitRenderedEvent) {
      emitRuntimeEvent({ type: "rendered", objectCount: objects.length });
    }
  };

  const render = (): void => {
    redraw(true);
  };

  const applyMutation = (mutation: CanvasMutation): ApplyResult => {
    const result = parseJson<ApplyResult>(wasm.apply_mutation_json(stringify(mutation)));
    render();
    emitRuntimeEvent({ type: "mutation-applied", result, source: "remote" });
    return result;
  };

  const applyMutationBinary = (bytes: Uint8Array): ApplyResult => {
    const resultBytes = wasm.apply_mutation_binary(bytes);
    const result = parseJson<ApplyResult>(wasm.decode_apply_result_binary_to_json(resultBytes));
    render();
    emitRuntimeEvent({ type: "mutation-applied", result, source: "remote" });
    return result;
  };

  const createRect = (input: CreateRectInput): CanvasMutation => {
    const mutation = parseJson<CanvasMutation>(
      wasm.create_object_json(
        stringify({
          object_id: input.objectId ?? null,
          object_kind: "shape",
          renderer_key: "core.rect",
          transform: defaultTransform(input.x, input.y),
          geometry: { Rect: { width: input.width, height: input.height } },
          style: mergeStyle(DEFAULT_STYLE, input.style),
          metadata: input.metadata ?? null,
        }),
      ),
    );
    render();
    emitLocalMutation(mutation);
    emitRuntimeEvent({
      type: "mutation-applied",
      result: {
        applied: true,
        duplicate: false,
        document_id: mutation.document_id,
        event_id: mutation.event_id,
        lamport_clock: mutation.lamport,
        target_object_id: mutation.target_object_id,
        message: "local object created",
      },
      source: "local",
    });
    return mutation;
  };

  const createPath = (input: CreatePathInput): CanvasMutation => {
    const mutation = parseJson<CanvasMutation>(
      wasm.create_object_json(
        stringify({
          object_id: input.objectId ?? null,
          object_kind: "path",
          renderer_key: "core.path",
          transform: defaultTransform(),
          geometry: { Path: { points: finalizePathPoints(input.points) } },
          style: mergeStyle(DEFAULT_PATH_STYLE, input.style),
          metadata: input.metadata ?? null,
        }),
      ),
    );
    render();
    emitLocalMutation(mutation);
    emitRuntimeEvent({
      type: "mutation-applied",
      result: {
        applied: true,
        duplicate: false,
        document_id: mutation.document_id,
        event_id: mutation.event_id,
        lamport_clock: mutation.lamport,
        target_object_id: mutation.target_object_id,
        message: "local path created",
      },
      source: "local",
    });
    return mutation;
  };

  const transformObject = (input: TransformObjectInput): CanvasMutation => {
    const mutation = parseJson<CanvasMutation>(
      wasm.transform_object_json(
        stringify({
          object_id: input.objectId,
          transform: input.transform,
        }),
      ),
    );
    render();
    emitLocalMutation(mutation);
    return mutation;
  };

  const deleteObject = (objectId: string): CanvasMutation => {
    const mutation = parseJson<CanvasMutation>(wasm.delete_object(objectId));
    render();
    emitLocalMutation(mutation);
    return mutation;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || tool === "none") return;
    if (event.isPrimary === false) return;
    const id = pointerId(event);
    const point = canvasPoint(options.canvas, event);
    if (tool === "rect") {
      capturePointer(options.canvas, id);
      dragStart = point;
    } else if (tool === "pen") {
      if (activePenStroke) return;
      capturePointer(options.canvas, id);
      activePenStroke = {
        pointerId: id,
        points: appendPathPoint([], point),
      };
      redraw(false);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (destroyed || tool !== "pen" || !activePenStroke) return;
    if (pointerId(event) !== activePenStroke.pointerId) return;

    let nextPoints = activePenStroke.points;
    for (const point of eventPoints(options.canvas, event)) {
      nextPoints = appendPathPoint(nextPoints, point);
    }
    if (nextPoints !== activePenStroke.points) {
      activePenStroke = { ...activePenStroke, points: nextPoints };
      redraw(false);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (destroyed) return;
    const id = pointerId(event);
    const point = canvasPoint(options.canvas, event);
    if (tool === "rect" && dragStart) {
      const x = Math.min(dragStart.x, point.x);
      const y = Math.min(dragStart.y, point.y);
      const width = Math.abs(point.x - dragStart.x);
      const height = Math.abs(point.y - dragStart.y);
      if (width >= 3 && height >= 3) {
        createRect({ x, y, width, height });
      }
      dragStart = null;
      releasePointer(options.canvas, id);
    } else if (tool === "pen" && activePenStroke && id === activePenStroke.pointerId) {
      let completedPath = activePenStroke.points;
      for (const eventPoint of eventPoints(options.canvas, event)) {
        completedPath = appendPathPoint(completedPath, eventPoint);
      }
      activePenStroke = null;
      createPath({ points: completedPath });
      releasePointer(options.canvas, id);
    }
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (tool !== "pen" || !activePenStroke) return;
    const id = pointerId(event);
    if (id !== activePenStroke.pointerId) return;
    activePenStroke = null;
    redraw(false);
    releasePointer(options.canvas, id);
  };

  options.canvas.style.touchAction = "none";
  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointercancel", onPointerCancel);

  render();

  return {
    applyMutation,
    applyMutationBinary,
    createRect,
    createPath,
    transformObject,
    deleteObject,
    render,
    getSnapshot: () => wasm.get_snapshot_binary(),
    loadSnapshot: (bytes) => {
      wasm.load_snapshot_binary(bytes);
      render();
    },
    exportDocumentJson: () => parseJson<unknown>(wasm.export_document_json()),
    setTool: (nextTool) => {
      if (tool === "pen" && nextTool !== "pen" && activePenStroke) {
        activePenStroke = null;
        redraw(false);
      }
      tool = nextTool;
      emitRuntimeEvent({ type: "tool-changed", tool });
    },
    getTool: () => tool,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointercancel", onPointerCancel);
      wasm.free();
      emitRuntimeEvent({ type: "destroyed" });
    },
  };
}
