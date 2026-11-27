import type { VecLike } from "./model";

export class Bounds {
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {}
  get minX() {
    return this.x;
  }
  get minY() {
    return this.y;
  }
  get maxX() {
    return this.x + this.w;
  }
  get maxY() {
    return this.y + this.h;
  }
  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }
  get point() {
    return { x: this.x, y: this.y };
  }
  contains(point: VecLike) {
    return (
      point.x >= this.x &&
      point.y >= this.y &&
      point.x <= this.maxX &&
      point.y <= this.maxY
    );
  }
  static union(bounds: Bounds[]) {
    if (!bounds.length) return new Bounds(0, 0, 1, 1);
    const x = Math.min(...bounds.map((bound) => bound.x));
    const y = Math.min(...bounds.map((bound) => bound.y));
    return new Bounds(
      x,
      y,
      Math.max(...bounds.map((bound) => bound.maxX)) - x,
      Math.max(...bounds.map((bound) => bound.maxY)) - y,
    );
  }
}
