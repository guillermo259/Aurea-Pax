export const TILE_W = 64;
export const TILE_H = 32;

export function gridToIso(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W * 0.5),
    y: (gx + gy) * (TILE_H * 0.5),
  };
}

export function tracePolygon(ctx: CanvasRenderingContext2D, ...points: number[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) {
    ctx.lineTo(points[index], points[index + 1]);
  }
  ctx.closePath();
}

export function drawIsoDiamond(ctx: CanvasRenderingContext2D, x: number, y: number,
  width = TILE_W, depth = TILE_H): void {
  tracePolygon(ctx, x, y, x + width / 2, y + depth / 2, x, y + depth, x - width / 2, y + depth / 2);
}

export function fillEllipse(ctx: CanvasRenderingContext2D, x: number, y: number,
  radiusX: number, radiusY: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}
