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

interface ActiveRectDrag {
  pointerId: number;
  start: Point;
  current: Point;
}

interface CanvasSurface {
  logicalWidth: number;
  logicalHeight: number;
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

function canvasPoint(canvas: HTMLCanvasElement, surface: CanvasSurface, event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = surface.logicalWidth / rect.width;
  const scaleY = surface.logicalHeight / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function rectFromPoints(start: Point, current: Point): CreateRectInput {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function pointerId(event: PointerEvent): number {
  return Number.isFinite(event.pointerId) ? event.pointerId : 1;
}

function eventPoints(canvas: HTMLCanvasElement, surface: CanvasSurface, event: PointerEvent): Point[] {
  const events = event.getCoalescedEvents?.() ?? [event];
  return events.map((coalescedEvent) => canvasPoint(canvas, surface, coalescedEvent));
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

  const surface: CanvasSurface = {
    logicalWidth: options.canvas.width || 300,
    logicalHeight: options.canvas.height || 150,
  };

  const configureCanvasSurface = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(surface.logicalWidth * dpr));
    const backingHeight = Math.max(1, Math.round(surface.logicalHeight * dpr));

    if (!options.canvas.style.width) {
      options.canvas.style.width = `${surface.logicalWidth}px`;
    }
    if (!options.canvas.style.height) {
      options.canvas.style.height = `${surface.logicalHeight}px`;
    }
    if (options.canvas.width !== backingWidth) {
      options.canvas.width = backingWidth;
    }
    if (options.canvas.height !== backingHeight) {
      options.canvas.height = backingHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  };

  const wasm = new WasmCanvasRuntime(options.documentId, options.actorId);
  const renderers: Record<string, ObjectRenderer> = {
    ...defaultRenderers,
    ...options.renderers,
  };
  let destroyed = false;
  let tool: CanvasTool = options.initialTool ?? "none";
  let activeRectDrag: ActiveRectDrag | null = null;
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

  const drawDraftRect = (): void => {
    if (!activeRectDrag) return;
    const rect = rectFromPoints(activeRectDrag.start, activeRectDrag.current);
    if (rect.width < 1 || rect.height < 1) return;

    ctx.save();
    ctx.fillStyle = "rgba(167, 243, 208, 0.28)";
    ctx.strokeStyle = "#047857";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const redraw = (emitRenderedEvent: boolean): void => {
    configureCanvasSurface();
    const objects = parseJson<RenderObject[]>(wasm.get_render_objects_json());
    ctx.clearRect(0, 0, surface.logicalWidth, surface.logicalHeight);
    for (const object of objects) {
      const renderer = renderers[object.renderer_key];
      if (renderer) {
        renderer(ctx, object);
      }
    }
    drawDraftRect();
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
    const point = canvasPoint(options.canvas, surface, event);
    if (tool === "rect") {
      if (activeRectDrag) return;
      capturePointer(options.canvas, id);
      activeRectDrag = {
        pointerId: id,
        start: point,
        current: point,
      };
      redraw(false);
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
    if (destroyed) return;

    if (tool === "rect" && activeRectDrag) {
      if (pointerId(event) !== activeRectDrag.pointerId) return;
      activeRectDrag = {
        ...activeRectDrag,
        current: canvasPoint(options.canvas, surface, event),
      };
      redraw(false);
      return;
    }

    if (tool !== "pen" || !activePenStroke) return;
    if (pointerId(event) !== activePenStroke.pointerId) return;

    let nextPoints = activePenStroke.points;
    for (const point of eventPoints(options.canvas, surface, event)) {
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
    const point = canvasPoint(options.canvas, surface, event);
    if (tool === "rect" && activeRectDrag && id === activeRectDrag.pointerId) {
      const rect = rectFromPoints(activeRectDrag.start, point);
      activeRectDrag = null;
      if (rect.width >= 3 && rect.height >= 3) {
        createRect(rect);
      } else {
        redraw(false);
      }
      releasePointer(options.canvas, id);
    } else if (tool === "pen" && activePenStroke && id === activePenStroke.pointerId) {
      let completedPath = activePenStroke.points;
      for (const eventPoint of eventPoints(options.canvas, surface, event)) {
        completedPath = appendPathPoint(completedPath, eventPoint);
      }
      activePenStroke = null;
      createPath({ points: completedPath });
      releasePointer(options.canvas, id);
    }
  };

  const onPointerCancel = (event: PointerEvent): void => {
    const id = pointerId(event);
    if (tool === "rect" && activeRectDrag && id === activeRectDrag.pointerId) {
      activeRectDrag = null;
      redraw(false);
      releasePointer(options.canvas, id);
      return;
    }

    if (tool === "pen" && activePenStroke && id === activePenStroke.pointerId) {
      activePenStroke = null;
      redraw(false);
      releasePointer(options.canvas, id);
    }
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
      if (tool === "rect" && nextTool !== "rect" && activeRectDrag) {
        activeRectDrag = null;
        redraw(false);
      }
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
