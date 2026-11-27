import { drawIsoDiamond, fillEllipse, tracePolygon } from './isoDrawing';
import { getTileIndex, inBounds } from './mapGen';
import type { TerrainKind, Tile, WorldState } from './types';

const GROUND: Record<TerrainKind, readonly string[]> = {
  water: ['#236973', '#246d76', '#276d77', '#246a73'],
  sand: ['#bca878', '#c5b080', '#d0ba8b', '#c1ad7f'],
  grass: ['#788e53', '#7d9256', '#819559', '#869959'],
  fertile: ['#7f8e4e', '#83924e', '#889653', '#8d9b55'],
  forest: ['#526e46', '#597348', '#617b4a', '#566f43'],
  stone: ['#99917e', '#a39b87', '#aea28b', '#9d9683'],
  clay: ['#a97755', '#ac7b59', '#b98260', '#aa7551'],
};

export const TILE_EDGES = [
  { dx: 0, dy: -1, x1: 0, y1: 0, x2: 32, y2: 16 },
  { dx: 1, dy: 0, x1: 32, y1: 16, x2: 0, y2: 32 },
  { dx: 0, dy: 1, x1: 0, y1: 32, x2: -32, y2: 16 },
  { dx: -1, dy: 0, x1: -32, y1: 16, x2: 0, y2: 0 },
];

export function adjacentTile(world: WorldState, tile: Tile, dx: number, dy: number): Tile | undefined {
  const x = tile.x + dx;
  const y = tile.y + dy;
  return inBounds(x, y, world.width, world.height) ? world.tiles[getTileIndex(x, y, world.width)] : undefined;
}

function noise(seed: number, sample: number): number {
  const mixed = Math.imul(seed ^ Math.imul(sample, 0x45d9f3b), 0x119de1f3);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 0x100000000;
}

function drawShallows(ctx: CanvasRenderingContext2D, world: WorldState, tile: Tile,
  x: number, y: number): void {
  ctx.save();
  ctx.clip();
  for (const edge of TILE_EDGES) {
    const near = adjacentTile(world, tile, edge.dx, edge.dy);
    if (!near?.discovered || near.terrain === 'water') continue;

    const x1 = x + edge.x1;
    const y1 = y + edge.y1;
    const x2 = x + edge.x2;
    const y2 = y + edge.y2;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const shiftX = (y1 - y2) / length;
    const shiftY = (x2 - x1) / length;
    const depth = 9;
    const gradient = ctx.createLinearGradient(midX, midY, midX + shiftX * depth, midY + shiftY * depth);
    gradient.addColorStop(0, '#98b89a');
    gradient.addColorStop(0.27, '#64a695');
    gradient.addColorStop(1, '#31898200');
    tracePolygon(ctx, x1, y1, x2, y2, x2 + shiftX * depth, y2 + shiftY * depth,
      x1 + shiftX * depth, y1 + shiftY * depth);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x1 * 0.93 + x2 * 0.07 + shiftX, y1 * 0.93 + y2 * 0.07 + shiftY);
    ctx.quadraticCurveTo(midX + shiftX * 4, midY + shiftY * 4, x2 * 0.93 + x1 * 0.07 + shiftX, y2 * 0.93 + y1 * 0.07 + shiftY);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#c6dac09c';
    ctx.stroke();
  }
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, cypress: boolean): void {
  fillEllipse(ctx, x + 5 * scale, y + 1, 9 * scale, 3.1 * scale, '#29372155');
  ctx.fillStyle = '#5c4737';
  ctx.fillRect(x - scale, y - scale * 7, scale * 2, scale * 7);
  if (cypress) {
    ctx.beginPath();
    ctx.moveTo(x, y - 25 * scale);
    ctx.bezierCurveTo(x + 4 * scale, y - 18 * scale, x + 7 * scale, y - 5 * scale, x, y - 4 * scale);
    ctx.bezierCurveTo(x - 7 * scale, y - 5 * scale, x - 4 * scale, y - 19 * scale, x, y - 25 * scale);
    ctx.fillStyle = '#274a38';
    ctx.fill();
    fillEllipse(ctx, x - 1.6 * scale, y - 14 * scale, 2.8 * scale, 7.4 * scale, '#416b47');
    fillEllipse(ctx, x - 2 * scale, y - 15 * scale, scale, 4.8 * scale, '#5d8251');
  } else {
    fillEllipse(ctx, x, y - 8 * scale, 8.8 * scale, 5.8 * scale, '#31513d');
    fillEllipse(ctx, x - 3 * scale, y - 11 * scale, 6.5 * scale, 5.6 * scale, '#486e48');
    fillEllipse(ctx, x + 4.5 * scale, y - 11 * scale, 4.7 * scale, 4.4 * scale, '#51784f');
    fillEllipse(ctx, x - 3.6 * scale, y - 13 * scale, 4 * scale, 2.7 * scale, '#74915a');
  }
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  fillEllipse(ctx, x + size * 0.18, y + 1, size * 0.58, size * 0.2, '#403d3463');
  tracePolygon(ctx, x - size / 2, y, x - size * 0.37, y - size * 0.32, x + size * 0.04, y - size * 0.43,
    x + size * 0.36, y - size * 0.29, x + size * 0.46, y - 1, x - size * 0.04, y + size * 0.13);
  ctx.fillStyle = '#777465';
  ctx.fill();
  tracePolygon(ctx, x - size * 0.37, y - size * 0.32, x + size * 0.04, y - size * 0.43,
    x + size * 0.36, y - size * 0.29, x + size * 0.05, y - size * 0.14, x - size * 0.24, y - size * 0.17);
  ctx.fillStyle = '#c5bca4';
  ctx.fill();
  tracePolygon(ctx, x - size / 2, y, x - size * 0.37, y - size * 0.32, x - size * 0.24, y - size * 0.17,
    x + size * 0.05, y - size * 0.14, x - size * 0.04, y + size * 0.13);
  ctx.fillStyle = '#a79f8b';
  ctx.fill();
}

export function drawTerrainTile(ctx: CanvasRenderingContext2D, world: WorldState, tile: Tile,
  x: number, y: number): void {
  const cy = y - tile.elevation * 5;
  const seed = Math.imul(tile.x + 1, 421) ^ Math.imul(tile.y + 1, 677) ^ world.seed;
  if (tile.elevation > 0) {
    tracePolygon(ctx, x - 32, cy + 16, x, cy + 32, x, y + 32, x - 32, y + 16);
    ctx.fillStyle = '#706753';
    ctx.fill();
    tracePolygon(ctx, x, cy + 32, x + 32, cy + 16, x + 32, y + 16, x, y + 32);
    ctx.fillStyle = '#5b574d';
    ctx.fill();
  }

  drawIsoDiamond(ctx, x, cy);
  const rollingColor = 2 + Math.sin(tile.x * 0.32 + tile.y * 0.23) * 1.22 +
    Math.sin(tile.y * 0.46 - tile.x * 0.21) * 0.62;
  const palette = GROUND[tile.terrain];
  const variant = tile.terrain === 'grass' || tile.terrain === 'fertile' ? Math.floor(rollingColor) : tile.variant % 4;
  ctx.fillStyle = palette[variant];
  ctx.fill();
  ctx.strokeStyle = ctx.fillStyle; // Seal antialiasing seams between diamonds.
  ctx.lineWidth = 0.85;
  ctx.stroke();

  if (tile.terrain === 'water') {
    drawShallows(ctx, world, tile, x, cy);
    ctx.fillStyle = '#a4d6c61d';
    ctx.fillRect(x - 10 + noise(seed, 22) * 12, cy + 15, 6 + noise(seed, 3) * 9, 0.8);
    return;
  }

  if (tile.terrain !== 'sand') {
    ctx.strokeStyle = '#263a2112';
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  const fertile = tile.terrain === 'fertile';
  for (let i = 0; i < 9; i++) {
    const u = 0.10 + noise(seed, i * 17 + 1) * 0.80;
    const v = 0.10 + noise(seed, i * 17 + 3) * 0.80;
    const gx = x + (u - v) * 32;
    const gy = cy + (u + v) * 16;
    ctx.fillStyle = i < 4 ? '#e8d6993a' : '#26392234';
    ctx.fillRect(gx, gy, 1 + noise(seed, i * 17 + 7) * 2.8, fertile && i < 3 ? 1.5 : 0.8);
  }

  if (tile.isRoad || tile.buildingId !== null) return;
  if (tile.terrain === 'forest') {
    drawTree(ctx, x - 8 + noise(seed, 91) * 5, cy + 12, 0.67 + noise(seed, 93) * 0.44, true);
    drawTree(ctx, x + 8 + noise(seed, 95) * 4, cy + 17, 0.58 + noise(seed, 97) * 0.48, noise(seed, 99) > 0.42);
    if (noise(seed, 10) > 0.48) drawTree(ctx, x - 3, cy + 22, 0.62, false);
  } else if (tile.terrain === 'stone') {
    drawStone(ctx, x - 8, cy + 15, 11 + noise(seed, 89) * 7);
    drawStone(ctx, x + 8, cy + 20, 9 + noise(seed, 90) * 7);
  } else if (tile.terrain === 'clay') {
    fillEllipse(ctx, x, cy + 17, 12, 4.6, '#854d37');
    fillEllipse(ctx, x - 1, cy + 15.8, 10.9, 3.5, '#c38561');
    fillEllipse(ctx, x - 3, cy + 15, 5.5, 1.25, '#e09f765c');
  } else if (tile.terrain === 'grass' || fertile) {
    const vegetation = noise(seed, 60);
    if (!fertile && vegetation > 0.89) {
      drawTree(ctx, x - 6 + noise(seed, 62) * 12, cy + 18, 0.48 + noise(seed, 70) * 0.29, false);
    } else if (vegetation < 0.63) {
      const gx = x - 11 + noise(seed, 72) * 19;
      const gy = cy + 12 + noise(seed, 74) * 10;
      fillEllipse(ctx, gx, gy, 6, 2.2, '#4a65482c');
      ctx.beginPath();
      for (let blade = 0; blade < 4; blade++) {
        const px = gx + blade * 1.8 - 2.7;
        ctx.moveTo(px, gy + 0.7);
        ctx.lineTo(px - 1.5 + blade, gy - 2 - noise(seed, 80 + blade) * 2);
      }
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = fertile ? '#d0bd6e9c' : '#4a6b43a5';
      ctx.stroke();
    }
  }
}

const PAVING_STONES = ['#a49880', '#b4a78b', '#8f836c', '#9e9077'];

function roadQuad(ctx: CanvasRenderingContext2D, x: number, y: number, direction: typeof TILE_EDGES[number],
  start: number, end: number, left: number, right: number): void {
  const alongX = (direction.dx - direction.dy) * 32;
  const alongY = (direction.dx + direction.dy) * 16;
  const acrossX = alongY * 2;
  const acrossY = -alongX / 2;
  tracePolygon(ctx,
    x + alongX * start + acrossX * left, y + alongY * start + acrossY * left,
    x + alongX * end + acrossX * left, y + alongY * end + acrossY * left,
    x + alongX * end + acrossX * right, y + alongY * end + acrossY * right,
    x + alongX * start + acrossX * right, y + alongY * start + acrossY * right);
  ctx.fill();
}

export function drawRoadTile(ctx: CanvasRenderingContext2D, world: WorldState, tile: Tile,
  x: number, y: number): void {
  const cy = y + 16 - tile.elevation * 5;
  const arms = TILE_EDGES.filter(({ dx, dy }) => {
    const near = adjacentTile(world, tile, dx, dy);
    return near?.discovered && (near.isRoad || near.buildingId !== null);
  });
  const seed = tile.x * 417 ^ tile.y * 593;
  ctx.fillStyle = '#746953';
  for (const arm of arms) roadQuad(ctx, x, cy, arm, 0, 0.52, -0.24, 0.24);
  drawIsoDiamond(ctx, x, cy - 7.7, 32, 16);
  ctx.fill();
  ctx.fillStyle = '#998c72';
  for (const arm of arms) roadQuad(ctx, x, cy - 0.7, arm, 0, 0.51, -0.19, 0.19);
  drawIsoDiamond(ctx, x, cy - 7, 25, 12.5);
  ctx.fill();

  for (const arm of arms) {
    for (let row = 0; row < 3; row++) {
      const start = 0.12 + row * 0.13;
      for (let col = 0; col < 3; col++) {
        const left = -0.175 + col * 0.118 + (row % 2) * 0.01;
        ctx.fillStyle = PAVING_STONES[Math.floor(noise(seed, row * 13 + col * 7 + arm.dx * 41 + arm.dy * 31) * 4)];
        roadQuad(ctx, x, cy - 0.8, arm, start, Math.min(0.49, start + 0.105), left, left + 0.097);
      }
    }
  }
  fillEllipse(ctx, x, cy - 1, 4.1, 1.8, '#b7a88b');
}
