import type { Point } from "./types";

const MIN_POINT_DISTANCE = 2;
const SIMPLIFY_TOLERANCE = 1.4;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return distance(point, start);
  }
  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  return numerator / Math.hypot(dx, dy);
}

function ramerDouglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;
  const start = points[0]!;
  const end = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i += 1) {
    const currentDistance = perpendicularDistance(points[i]!, start, end);
    if (currentDistance > maxDistance) {
      index = i;
      maxDistance = currentDistance;
    }
  }

  if (maxDistance <= tolerance) {
    return [start, end];
  }

  const before = ramerDouglasPeucker(points.slice(0, index + 1), tolerance);
  const after = ramerDouglasPeucker(points.slice(index), tolerance);
  return before.slice(0, -1).concat(after);
}

export function appendPathPoint(points: Point[], point: Point): Point[] {
  const previous = points.at(-1);
  if (previous && distance(previous, point) < MIN_POINT_DISTANCE) {
    return points;
  }
  return [...points, point];
}

export function normalizePathPoints(points: Point[]): Point[] {
  const filtered = points.reduce<Point[]>((acc, point) => appendPathPoint(acc, point), []);
  if (filtered.length <= 2) {
    return filtered;
  }
  return ramerDouglasPeucker(filtered, SIMPLIFY_TOLERANCE);
}

export function drawSmoothPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return;

  ctx.moveTo(points[0]!.x, points[0]!.y);
  if (points.length === 1) {
    return;
  }
  if (points.length === 2) {
    ctx.lineTo(points[1]!.x, points[1]!.y);
    return;
  }

  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const midPoint = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    };
    ctx.quadraticCurveTo(current.x, current.y, midPoint.x, midPoint.y);
  }

  const last = points[points.length - 1]!;
  ctx.lineTo(last.x, last.y);
}
