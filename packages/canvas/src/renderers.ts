import { drawSmoothPath } from "./path";
import type { Geometry, ObjectRenderer, RenderObject, Style } from "./types";

function applyTransform(ctx: CanvasRenderingContext2D, object: RenderObject): void {
  const transform = object.transform;
  ctx.translate(transform.x, transform.y);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale_x, transform.scale_y);
}

function applyStyle(ctx: CanvasRenderingContext2D, style: Style): void {
  ctx.fillStyle = style.fill ?? "transparent";
  ctx.strokeStyle = style.stroke ?? "#111827";
  ctx.lineWidth = style.stroke_width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function fillAndStroke(ctx: CanvasRenderingContext2D, style: Style): void {
  if (style.fill) {
    ctx.fill();
  }
  if (style.stroke && style.stroke_width > 0) {
    ctx.stroke();
  }
}

export function geometryKind(geometry: Geometry): "Rect" | "Ellipse" | "Path" {
  if ("Rect" in geometry) return "Rect";
  if ("Ellipse" in geometry) return "Ellipse";
  return "Path";
}

export const defaultRenderers: Record<string, ObjectRenderer> = {
  "core.rect": (ctx, object) => {
    if (!("Rect" in object.geometry)) return;
    const { width, height } = object.geometry.Rect;
    ctx.save();
    applyTransform(ctx, object);
    applyStyle(ctx, object.style);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    fillAndStroke(ctx, object.style);
    ctx.restore();
  },
  "core.ellipse": (ctx, object) => {
    if (!("Ellipse" in object.geometry)) return;
    const { rx, ry } = object.geometry.Ellipse;
    ctx.save();
    applyTransform(ctx, object);
    applyStyle(ctx, object.style);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    fillAndStroke(ctx, object.style);
    ctx.restore();
  },
  "core.path": (ctx, object) => {
    if (!("Path" in object.geometry)) return;
    const points = object.geometry.Path.points;
    if (points.length === 0) return;
    ctx.save();
    applyTransform(ctx, object);
    applyStyle(ctx, object.style);
    ctx.beginPath();
    drawSmoothPath(ctx, points);
    fillAndStroke(ctx, { ...object.style, fill: null });
    ctx.restore();
  },
};
