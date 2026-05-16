import { describe, expect, it } from "vitest";
import { appendPathPoint, normalizePathPoints } from "../src/path";

describe("path utilities", () => {
  it("ignores tiny pointer samples while appending", () => {
    const points = appendPathPoint([{ x: 10, y: 10 }], { x: 11, y: 10.5 });

    expect(points).toEqual([{ x: 10, y: 10 }]);
  });

  it("keeps meaningful bends while simplifying", () => {
    const points = normalizePathPoints([
      { x: 0, y: 0 },
      { x: 1, y: 0.3 },
      { x: 2, y: 0.5 },
      { x: 20, y: 18 },
      { x: 40, y: 0 },
      { x: 41, y: 0.2 },
    ]);

    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.length).toBeLessThan(6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 40, y: 0 });
  });
});
