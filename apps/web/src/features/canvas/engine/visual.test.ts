import { expect, it } from "vite-plus/test";
import { freehandPath } from "./visual";

it("preserves stylus pressure in smooth exported stroke outlines", () => {
  const points = [0, 20, 40, 60].map((x) => ({ x, y: 0 }));
  const thin = freehandPath(
    points.map((point) => ({ ...point, z: 0.1 })),
    "m",
    true,
  );
  const thick = freehandPath(
    points.map((point) => ({ ...point, z: 0.9 })),
    "m",
    true,
  );
  const extent = (path: string) => {
    const values = path
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number)
      .filter((_, index) => index % 2 === 1);
    return Math.max(...values) - Math.min(...values);
  };
  expect(extent(thick)).toBeGreaterThan(extent(thin));
  expect(thick).not.toContain("NaN");
});
it("ignores invalid freehand points rather than emitting invalid SVG coordinates", () => {
  expect(
    freehandPath(
      [
        { x: NaN, y: 10 },
        { x: Infinity, y: 0 },
      ],
      "m",
    ),
  ).toBe("");
});
