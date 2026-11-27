import { BUILDINGS, RESOURCE_META } from './catalog';
import { getDaylightColorFilter } from './dayCycle';
import { getTileIndex, inBounds } from './mapGen';
import { getBuildingCenter } from './pathfinding';
import { canPlaceBuilding } from './simulation';
import { BuildingType, Cart, Citizen, PlacedBuilding, TerrainKind, Tile, ToolMode, WorldState } from './types';

export const TILE_W = 64;
export const TILE_H = 32;

export interface CameraState {
  x: number; // world screen-space X center
  y: number; // world screen-space Y center
  zoom: number;
}

export function gridToIso(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W * 0.5),
    y: (gx + gy) * (TILE_H * 0.5),
  };
}

export function screenToGrid(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: CameraState,
): { gx: number; gy: number } {
  const sx = (clientX - rect.left - rect.width * 0.5) / camera.zoom + camera.x;
  const sy = (clientY - rect.top - rect.height * 0.5) / camera.zoom + camera.y;
  const halfW = TILE_W * 0.5;
  const halfH = TILE_H * 0.5;
  const gx = Math.floor((sx / halfW + sy / halfH) * 0.5);
  const gy = Math.floor((sy / halfH - sx / halfW) * 0.5);
  return { gx, gy };
}

function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w = TILE_W,
  h = TILE_H,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + w * 0.5, cy + h * 0.5);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w * 0.5, cy + h * 0.5);
  ctx.closePath();
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  d: number,
  height: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
  strokeColor?: string,
): void {
  // Base center is bottom-ish; let's compute diamond corners around (cx, cy + TILE_H*0.5)
  const hw = w * 0.5;
  const hh = d * 0.5;
  const baseTopY = cy;
  const baseMidY = cy + hh;
  const baseBotY = cy + d;

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, baseMidY - height);
  ctx.lineTo(cx, baseBotY - height);
  ctx.lineTo(cx, baseBotY);
  ctx.lineTo(cx - hw, baseMidY);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx, baseBotY - height);
  ctx.lineTo(cx + hw, baseMidY - height);
  ctx.lineTo(cx + hw, baseMidY);
  ctx.lineTo(cx, baseBotY);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, baseTopY - height);
  ctx.lineTo(cx + hw, baseMidY - height);
  ctx.lineTo(cx, baseBotY - height);
  ctx.lineTo(cx - hw, baseMidY - height);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function drawGableRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  d: number,
  baseHeight: number,
  peakExtra: number,
  frontColor: string,
  backColor: string,
): void {
  const hw = w * 0.5;
  const hh = d * 0.5;
  const ridgeY = cy + hh - baseHeight - peakExtra;

  // Ridge runs from left-top to right-bottom or along X
  const ridgeLeftX = cx - hw * 0.45;
  const ridgeLeftY = ridgeY - hh * 0.45;
  const ridgeRightX = cx + hw * 0.45;
  const ridgeRightY = ridgeY + hh * 0.45;

  // Front-left slope
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy + hh - baseHeight);
  ctx.lineTo(cx, cy + d - baseHeight);
  ctx.lineTo(ridgeRightX, ridgeRightY);
  ctx.lineTo(ridgeLeftX, ridgeLeftY);
  ctx.closePath();
  ctx.fillStyle = frontColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(42, 22, 14, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Back-right slope
  ctx.beginPath();
  ctx.moveTo(cx, cy - baseHeight);
  ctx.lineTo(cx + hw, cy + hh - baseHeight);
  ctx.lineTo(ridgeRightX, ridgeRightY);
  ctx.lineTo(ridgeLeftX, ridgeLeftY);
  ctx.closePath();
  ctx.fillStyle = backColor;
  ctx.fill();
  ctx.stroke();

  // Gable triangle front-right
  ctx.beginPath();
  ctx.moveTo(cx, cy + d - baseHeight);
  ctx.lineTo(cx + hw, cy + hh - baseHeight);
  ctx.lineTo(ridgeRightX, ridgeRightY);
  ctx.closePath();
  ctx.fillStyle = '#d9ccb2';
  ctx.fill();
  ctx.stroke();
}

const TERRAIN_COLORS: Record<TerrainKind, [string, string]> = {
  water: ['#266b82', '#2b748d'],
  sand: ['#dec797', '#d8bf8b'],
  grass: ['#768f49', '#6e8743'],
  fertile: ['#637c2d', '#5c7428'],
  forest: ['#4f6d36', '#486531'],
  stone: ['#8d897e', '#837f75'],
  clay: ['#a36142', '#98593b'],
};

function drawTerrainTile(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  tile: Tile,
  sx: number,
  sy: number,
  timeSec: number,
): void {
  const palette = TERRAIN_COLORS[tile.terrain];
  const color = palette[tile.variant % palette.length];
  const elevOffset = tile.elevation * 5;
  const cy = sy - elevOffset;

  // Draw cliff side for elevated stone outcrops
  if (tile.elevation > 0) {
    ctx.beginPath();
    ctx.moveTo(sx - TILE_W * 0.5, cy + TILE_H * 0.5);
    ctx.lineTo(sx, cy + TILE_H);
    ctx.lineTo(sx, sy + TILE_H);
    ctx.lineTo(sx - TILE_W * 0.5, sy + TILE_H * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#625e55';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx, cy + TILE_H);
    ctx.lineTo(sx + TILE_W * 0.5, cy + TILE_H * 0.5);
    ctx.lineTo(sx + TILE_W * 0.5, sy + TILE_H * 0.5);
    ctx.lineTo(sx, sy + TILE_H);
    ctx.closePath();
    ctx.fillStyle = '#736f65';
    ctx.fill();
  }

  drawIsoDiamond(ctx, sx, cy);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle =
    tile.terrain === 'water' ? 'rgba(255,255,255,0.06)' : 'rgba(25, 22, 16, 0.14)';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  if (tile.terrain === 'water') {
    const wave = Math.sin(timeSec * 1.9 + tile.x * 0.7 + tile.y * 0.5);
    if (wave > 0.15) {
      ctx.strokeStyle = 'rgba(205, 240, 248, 0.25)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx - 9 + wave * 3, cy + TILE_H * 0.5);
      ctx.lineTo(sx + 7 + wave * 3, cy + TILE_H * 0.45);
      ctx.stroke();
    }
    return;
  }

  // Terrain visual cues for non-occupied tiles
  if (tile.terrain === 'fertile' && tile.buildingId === null && !tile.isRoad) {
    ctx.strokeStyle = 'rgba(182, 162, 69, 0.45)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(sx - 10 + i * 5, cy + 12 + i * 2);
      ctx.lineTo(sx + 6 + i * 5, cy + 20 + i * 2);
      ctx.stroke();
    }
  } else if (tile.terrain === 'clay' && tile.buildingId === null && !tile.isRoad) {
    ctx.fillStyle = '#7d4429';
    ctx.beginPath();
    ctx.ellipse(sx, cy + 16, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c47a54';
    ctx.beginPath();
    ctx.ellipse(sx - 2, cy + 15, 5, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.terrain === 'stone' && tile.buildingId === null && !tile.isRoad) {
    drawIsoBox(ctx, sx - 6, cy + 8, 16, 8, 6, '#aba79b', '#757168', '#8d897f');
    drawIsoBox(ctx, sx + 7, cy + 12, 14, 7, 4, '#b8b3a6', '#7d796f', '#979388');
  } else if (tile.terrain === 'forest' && tile.buildingId === null && !tile.isRoad) {
    // Draw 2 Mediterranean cypress/pine silhouettes
    const offsets = [
      { ox: -7, oy: 12, h: 17 },
      { ox: 6, oy: 17, h: 14 },
    ];
    for (const tr of offsets) {
      ctx.fillStyle = 'rgba(20, 26, 15, 0.25)';
      ctx.beginPath();
      ctx.ellipse(sx + tr.ox + 2, cy + tr.oy + 2, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4e3824';
      ctx.fillRect(sx + tr.ox - 1, cy + tr.oy - 4, 2, 5);

      ctx.fillStyle = '#2f5327';
      ctx.beginPath();
      ctx.moveTo(sx + tr.ox, cy + tr.oy - tr.h);
      ctx.lineTo(sx + tr.ox + 5, cy + tr.oy - 3);
      ctx.lineTo(sx + tr.ox - 5, cy + tr.oy - 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3f6b34';
      ctx.beginPath();
      ctx.moveTo(sx + tr.ox, cy + tr.oy - tr.h);
      ctx.lineTo(sx + tr.ox + 4, cy + tr.oy - 5);
      ctx.lineTo(sx + tr.ox, cy + tr.oy - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Roman Via Strata (connected flagstones)
  if (tile.isRoad) {
    drawIsoDiamond(ctx, sx, cy + 1, TILE_W * 0.88, TILE_H * 0.88);
    ctx.fillStyle = '#6f695f';
    ctx.fill();

    // Directional road arms toward neighboring roads or buildings
    const dirs = [
      { dx: 0, dy: -1, ox: 14, oy: 7 },
      { dx: 1, dy: 0, ox: 14, oy: -7 },
      { dx: 0, dy: 1, ox: -14, oy: -7 },
      { dx: -1, dy: 0, ox: -14, oy: 7 },
    ];
    ctx.strokeStyle = '#7e786d';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (const d of dirs) {
      const nx = tile.x + d.dx;
      const ny = tile.y + d.dy;
      if (!inBounds(nx, ny, world.width, world.height)) continue;
      const nb = world.tiles[getTileIndex(nx, ny, world.width)];
      if (nb.isRoad || nb.buildingId !== null) {
        const nIso = gridToIso(nx, ny);
        ctx.beginPath();
        ctx.moveTo(sx, cy + TILE_H * 0.5);
        ctx.lineTo((sx + nIso.x) * 0.5, (cy + nIso.y) * 0.5 + TILE_H * 0.5);
        ctx.stroke();
      }
    }

    // Center flagstone detail
    ctx.fillStyle = '#979083';
    ctx.beginPath();
    ctx.ellipse(sx - 4, cy + 14, 4, 2, 0.2, 0, Math.PI * 2);
    ctx.ellipse(sx + 5, cy + 17, 4.5, 2.2, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSmokePuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeSec: number,
  seed: number,
): void {
  for (let i = 0; i < 3; i++) {
    const phase = (timeSec * 0.55 + seed + i * 0.33) % 1;
    const py = y - phase * 18;
    const px = x + Math.sin(phase * 6 + seed * 10) * 3;
    const radius = 2.2 + phase * 3.5;
    const alpha = (1 - phase) * 0.42;
    ctx.fillStyle = `rgba(235, 230, 222, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: PlacedBuilding,
  isSelected: boolean,
  timeSec: number,
): void {
  const center = getBuildingCenter(b);
  const iso = gridToIso(center.x, center.y);
  const sx = iso.x;
  const sy = iso.y;
  const footprintW = TILE_W * b.size * 0.82;
  const footprintD = TILE_H * b.size * 0.82;
  const baseY = sy - (b.size - 1) * (TILE_H * 0.5);

  if (isSelected) {
    drawIsoDiamond(ctx, sx, baseY - 2, TILE_W * b.size, TILE_H * b.size);
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  switch (b.type) {
    case 'house_liberti': {
      drawIsoBox(ctx, sx, baseY + 3, 38, 19, 12, '#e6dac3', '#c8b99d', '#dfd2b8', 'rgba(60,42,24,0.35)');
      drawGableRoof(ctx, sx, baseY + 3, 42, 21, 12, 9, '#b95335', '#963f26');
      // Doorway
      ctx.fillStyle = '#4f3524';
      ctx.fillRect(sx + 6, baseY + 13, 4, 7);
      if (b.upgradeReady) {
        const bob = Math.sin(timeSec * 4 + b.id) * 2;
        ctx.fillStyle = '#f3c14b';
        ctx.beginPath();
        ctx.moveTo(sx, baseY - 28 + bob);
        ctx.lineTo(sx + 7, baseY - 20 + bob);
        ctx.lineTo(sx + 3, baseY - 20 + bob);
        ctx.lineTo(sx + 3, baseY - 15 + bob);
        ctx.lineTo(sx - 3, baseY - 15 + bob);
        ctx.lineTo(sx - 3, baseY - 20 + bob);
        ctx.lineTo(sx - 7, baseY - 20 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3b240c';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    }
    case 'house_cives': {
      // Multi-story Roman Insula / Domus with colonnade
      drawIsoBox(ctx, sx, baseY + 2, 44, 22, 22, '#efe5d0', '#cbbba0', '#e3d6bc', 'rgba(60,42,24,0.4)');
      // Second floor terracotta trim
      drawIsoBox(ctx, sx, baseY + 2 - 11, 46, 23, 2, '#b95335', '#963f26', '#ad4c2f');
      drawGableRoof(ctx, sx, baseY + 2, 48, 24, 22, 10, '#c25736', '#9e4125');
      // Arched windows
      ctx.fillStyle = '#533c2a';
      ctx.fillRect(sx - 10, baseY + 2, 3, 5);
      ctx.fillRect(sx - 3, baseY + 6, 3, 5);
      ctx.fillRect(sx + 7, baseY + 5, 4, 6);
      break;
    }
    case 'horreum': {
      // Grand 2x2 stone & brick imperial warehouse
      drawIsoBox(ctx, sx, baseY + 8, footprintW * 0.88, footprintD * 0.88, 6, '#b8ab96', '#8d816f', '#a29682', 'rgba(40,30,20,0.45)');
      drawIsoBox(ctx, sx, baseY + 3, footprintW * 0.78, footprintD * 0.78, 22, '#dfd3bd', '#b9ab94', '#cfbfa6', 'rgba(50,35,22,0.45)');
      drawGableRoof(ctx, sx, baseY + 3, footprintW * 0.84, footprintD * 0.84, 22, 13, '#a9482c', '#88371f');
      // Warehouse loading arches
      ctx.fillStyle = '#3b2b1d';
      ctx.fillRect(sx + 8, baseY + 26, 7, 11);
      ctx.fillRect(sx + 20, baseY + 20, 7, 11);
      break;
    }
    case 'market': {
      // 2x2 Macellum plaza with striped awnings
      drawIsoBox(ctx, sx, baseY + 8, footprintW * 0.9, footprintD * 0.9, 4, '#d9ceb8', '#a89c86', '#c2b69f', 'rgba(50,40,30,0.35)');
      // Three colorful market stalls
      drawIsoBox(ctx, sx - 16, baseY + 14, 22, 11, 9, '#b83c2b', '#8f2c1f', '#a63424');
      drawIsoBox(ctx, sx + 14, baseY + 14, 22, 11, 9, '#d6a43c', '#a87d28', '#c49231');
      drawIsoBox(ctx, sx, baseY + 23, 24, 12, 9, '#f1e7d2', '#b5a78f', '#d8cab1');
      // Striped canopy accents
      ctx.fillStyle = '#f6efe0';
      ctx.fillRect(sx - 20, baseY + 6, 4, 4);
      ctx.fillRect(sx + 12, baseY + 6, 4, 4);
      break;
    }
    case 'fountain': {
      drawIsoBox(ctx, sx, baseY + 4, 34, 17, 6, '#e7dfd0', '#b7ae9f', '#d1c8b8', 'rgba(50,45,35,0.35)');
      drawIsoDiamond(ctx, sx, baseY + 3, 26, 13);
      ctx.fillStyle = '#3b9eb8';
      ctx.fill();
      // Center pedestal + water shimmer
      drawIsoBox(ctx, sx, baseY + 6, 10, 5, 9, '#f2ece0', '#bfb7a9', '#dbd3c5');
      const pulse = Math.sin(timeSec * 6 + b.id) * 1.5;
      ctx.strokeStyle = '#bcecf7';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 2);
      ctx.lineTo(sx - 4, baseY + 4 + pulse * 0.4);
      ctx.moveTo(sx, baseY - 2);
      ctx.lineTo(sx + 4, baseY + 4 - pulse * 0.4);
      ctx.stroke();
      break;
    }
    case 'temple': {
      // 2x2 Classical marble temple with columns & triangular pediment
      drawIsoBox(ctx, sx, baseY + 8, footprintW * 0.85, footprintD * 0.85, 8, '#e8e2d5', '#b9b2a4', '#d4cdc0', 'rgba(40,35,30,0.4)');
      drawIsoBox(ctx, sx, baseY + 2, footprintW * 0.72, footprintD * 0.72, 22, '#f5f0e6', '#c9c1b3', '#e4ddd0', 'rgba(40,35,30,0.4)');
      drawGableRoof(ctx, sx, baseY + 2, footprintW * 0.78, footprintD * 0.78, 22, 13, '#c8603a', '#9f4627');
      // Gold finial + front marble columns
      ctx.fillStyle = '#f8f4eb';
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(sx + 6 + i * 6, baseY + 18 - i * 2.5, 2.5, 16);
      }
      ctx.fillStyle = '#e5b74a';
      ctx.beginPath();
      ctx.arc(sx, baseY - 24, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'forum': {
      // 2x2 Monumental Roman Forum
      drawIsoBox(ctx, sx, baseY + 8, footprintW * 0.92, footprintD * 0.92, 6, '#ece5d6', '#bab2a2', '#d6cebe', 'rgba(40,35,30,0.45)');
      // Basilica wing
      drawIsoBox(ctx, sx - 12, baseY + 4, 46, 23, 24, '#f5efe3', '#c8c0b1', '#e2dacc', 'rgba(40,35,30,0.4)');
      drawGableRoof(ctx, sx - 12, baseY + 4, 48, 24, 24, 12, '#b9482e', '#92351f');
      // Golden triumphal statue in plaza
      drawIsoBox(ctx, sx + 18, baseY + 22, 12, 6, 8, '#dfd7c6', '#ada494', '#c9c0b0');
      ctx.fillStyle = '#dfb144';
      ctx.beginPath();
      ctx.arc(sx + 18, baseY + 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wheat_farm': {
      // Golden wheat rows + small barn
      drawIsoDiamond(ctx, sx, baseY + 1, TILE_W * 0.88, TILE_H * 0.88);
      ctx.fillStyle = '#c89b32';
      ctx.fill();
      ctx.strokeStyle = '#e7c35a';
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        const sway = Math.sin(timeSec * 2.5 + i + b.id) * 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - 12 + i * 4, baseY + 12 + i * 2);
        ctx.lineTo(sx + 6 + i * 4 + sway, baseY + 20 + i * 2);
        ctx.stroke();
      }
      drawIsoBox(ctx, sx - 10, baseY + 5, 18, 9, 8, '#dfd2b8', '#b0a186', '#cbbca0');
      drawGableRoof(ctx, sx - 10, baseY + 5, 20, 10, 8, 5, '#b65436', '#8f3f26');
      break;
    }
    case 'mill': {
      // Stone windmill tower + rotating sails
      drawIsoBox(ctx, sx, baseY + 4, 30, 15, 20, '#d8ceb9', '#a79c87', '#c2b7a1', 'rgba(50,40,30,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 32, 16, 20, 8, '#a64d32', '#823922');
      const cx = sx + 8;
      const cy = baseY - 8;
      const angle = timeSec * (b.roadConnected && b.inputBuffer >= 1 ? 2.4 : 0.4) + b.id;
      ctx.strokeStyle = '#5a3b22';
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = angle + (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
        ctx.stroke();
        // Sail cloth
        ctx.strokeStyle = '#f3ebd8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
        ctx.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13);
        ctx.stroke();
        ctx.strokeStyle = '#5a3b22';
        ctx.lineWidth = 2;
      }
      break;
    }
    case 'bakery': {
      drawIsoBox(ctx, sx, baseY + 4, 38, 19, 12, '#e3d5bd', '#b7a68d', '#d1c1a7', 'rgba(50,35,20,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 40, 20, 12, 8, '#b85032', '#913c23');
      // Brick oven dome & glowing hearth
      drawIsoBox(ctx, sx + 10, baseY + 12, 14, 7, 8, '#a9482e', '#7e331f', '#963f28');
      ctx.fillStyle = '#ff9f38';
      ctx.fillRect(sx + 11, baseY + 15, 4, 4);
      if (b.roadConnected && b.inputBuffer >= 1) {
        drawSmokePuff(ctx, sx + 10, baseY + 2, timeSec, b.animSeed);
      }
      break;
    }
    case 'vineyard': {
      drawIsoDiamond(ctx, sx, baseY + 1, TILE_W * 0.88, TILE_H * 0.88);
      ctx.fillStyle = '#597434';
      ctx.fill();
      for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = '#3b5724';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(sx - 12 + i * 4, baseY + 12 + i * 2);
        ctx.lineTo(sx + 10 + i * 4, baseY + 22 + i * 2);
        ctx.stroke();
        ctx.fillStyle = '#752d5c';
        ctx.beginPath();
        ctx.arc(sx + i * 4, baseY + 16 + i * 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'winery': {
      drawIsoBox(ctx, sx, baseY + 4, 40, 20, 13, '#ddd0b7', '#b0a087', '#cbba9f', 'rgba(50,35,20,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 42, 21, 13, 8, '#8a3444', '#6b2532');
      // Oak wine barrels
      ctx.fillStyle = '#6f4627';
      ctx.beginPath();
      ctx.arc(sx + 14, baseY + 18, 3.5, 0, Math.PI * 2);
      ctx.arc(sx + 19, baseY + 15, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'woodcutter': {
      drawIsoBox(ctx, sx - 3, baseY + 5, 30, 15, 10, '#8d5e38', '#664123', '#7a502d', 'rgba(40,25,12,0.45)');
      drawGableRoof(ctx, sx - 3, baseY + 5, 34, 17, 10, 7, '#684327', '#4e311b');
      // Timber stack
      ctx.fillStyle = '#a97448';
      ctx.fillRect(sx + 9, baseY + 16, 10, 3);
      ctx.fillRect(sx + 10, baseY + 13, 8, 3);
      break;
    }
    case 'stone_quarry': {
      drawIsoBox(ctx, sx, baseY + 6, 40, 20, 5, '#89857b', '#5f5c54', '#757168');
      drawIsoBox(ctx, sx - 6, baseY + 3, 18, 9, 10, '#aba79c', '#747067', '#8e8a80');
      // Crane beam
      ctx.strokeStyle = '#6b4728';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 8, baseY + 16);
      ctx.lineTo(sx + 8, baseY - 4);
      ctx.lineTo(sx - 2, baseY + 1);
      ctx.stroke();
      break;
    }
    case 'clay_pit': {
      drawIsoDiamond(ctx, sx, baseY + 2, TILE_W * 0.86, TILE_H * 0.86);
      ctx.fillStyle = '#8b492c';
      ctx.fill();
      drawIsoBox(ctx, sx - 7, baseY + 6, 18, 9, 8, '#c57751', '#935233', '#af6542');
      break;
    }
    case 'pottery': {
      drawIsoBox(ctx, sx, baseY + 4, 38, 19, 11, '#dfd1b8', '#b0a087', '#cbba9f', 'rgba(50,35,20,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 40, 20, 11, 7, '#be5c37', '#964527');
      // Kiln + amphorae
      drawIsoBox(ctx, sx + 12, baseY + 12, 12, 6, 9, '#b55632', '#823b20', '#9c4828');
      if (b.roadConnected && b.inputBuffer >= 1) {
        drawSmokePuff(ctx, sx + 12, baseY + 2, timeSec, b.animSeed);
      }
      break;
    }
  }

  // Animated fire flames & dark smoke when building is burning
  if (b.onFireTimer > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(235, 75, 32, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, baseY + 12, b.size === 2 ? 32 : 18, b.size === 2 ? 16 : 9, 0, 0, Math.PI * 2);
    ctx.stroke();

    for (let f = 0; f < 3; f++) {
      const phase = timeSec * 7.5 + f * 2.1 + b.id;
      const fx = sx + (f - 1) * 7 + Math.sin(phase) * 2;
      const fy = baseY - 2 + (f % 2) * 3;
      const h = 11 + Math.sin(phase * 1.4) * 3.5;

      // Outer crimson/orange flame
      ctx.fillStyle = '#e54d24';
      ctx.beginPath();
      ctx.moveTo(fx - 4.5, fy);
      ctx.quadraticCurveTo(fx - 2, fy - h * 0.65, fx, fy - h);
      ctx.quadraticCurveTo(fx + 2, fy - h * 0.65, fx + 4.5, fy);
      ctx.closePath();
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.moveTo(fx - 2.2, fy);
      ctx.lineTo(fx, fy - h * 0.62);
      ctx.lineTo(fx + 2.2, fy);
      ctx.closePath();
      ctx.fill();
    }

    // Rising dark smoke plumes
    for (let s = 0; s < 2; s++) {
      const p = (timeSec * 0.7 + s * 0.5 + b.animSeed) % 1;
      ctx.fillStyle = `rgba(42, 34, 28, ${(1 - p) * 0.55})`;
      ctx.beginPath();
      ctx.arc(sx + Math.sin(p * 6 + s) * 4, baseY - 12 - p * 22, 4 + p * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Diagnostic alert badge above buildings with issues (missing road, missing input, fire, etc.)
  if (b.alerts.length > 0) {
    const primary = b.alerts[0];
    const isCritical =
      primary === 'on_fire' ||
      primary === 'no_road' ||
      primary === 'no_water' ||
      primary === 'no_market';
    const badgeY = baseY - (b.size === 2 ? 36 : 26) + Math.sin(timeSec * 3.2 + b.id) * 1.5;
    ctx.fillStyle = isCritical ? '#c93b2b' : '#d18b26';
    ctx.beginPath();
    ctx.arc(sx, badgeY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1d1610';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#fff9ef';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', sx, badgeY + 0.5);
  }
}

function drawCart(
  ctx: CanvasRenderingContext2D,
  cart: Cart,
  isSelected: boolean,
): void {
  const iso = gridToIso(cart.worldX, cart.worldY);
  const sx = iso.x;
  const sy = iso.y + TILE_H * 0.5;

  // Shadow
  ctx.fillStyle = 'rgba(20, 15, 10, 0.35)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isSelected) {
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1, 11, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cart wooden bed
  drawIsoBox(ctx, sx, sy - 6, 12, 6, 4, '#9b6b3e', '#6f4a28', '#835932', '#3a2512');

  // Wheels
  ctx.strokeStyle = '#3e2714';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx - 3, sy, 2.5, 0, Math.PI * 2);
  ctx.arc(sx + 3, sy, 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // Cargo crate/amphorae only when delivering!
  if (cart.state === 'delivering') {
    const cargoColor = RESOURCE_META[cart.cargo].color;
    drawIsoBox(ctx, sx, sy - 10, 8, 4, 4, cargoColor, cargoColor, cargoColor, 'rgba(20,15,10,0.4)');
  }
}

function drawCitizen(ctx: CanvasRenderingContext2D, citizen: Citizen): void {
  const iso = gridToIso(citizen.worldX, citizen.worldY);
  const sx = iso.x + citizen.laneOffset * 18;
  const sy = iso.y + TILE_H * 0.5 + citizen.laneOffset * 6;
  const stride = Math.sin(citizen.walkPhase);
  const bob = Math.abs(stride) * 1.3;

  // Ground shadow
  ctx.fillStyle = 'rgba(20, 15, 10, 0.32)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 1.5, 3.2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs stride
  ctx.strokeStyle = '#3b2819';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(sx - 1, sy - 2 - bob);
  ctx.lineTo(sx - 1 - stride * 1.4, sy + 1);
  ctx.moveTo(sx + 1, sy - 2 - bob);
  ctx.lineTo(sx + 1 + stride * 1.4, sy + 1);
  ctx.stroke();

  // Roman tunic torso
  ctx.fillStyle = citizen.tunicColor;
  ctx.fillRect(sx - 2.3, sy - 7.5 - bob, 4.6, 5.5);

  // Subtle toga sash for ciudadanos or satchel for peones
  if (citizen.role === 'ciudadano') {
    ctx.fillStyle = '#c84b36';
    ctx.fillRect(sx - 2.3, sy - 7 - bob, 1.5, 4.2);
  } else {
    ctx.fillStyle = '#5c3c22';
    ctx.fillRect(sx + 1.6, sy - 6.2 - bob, 2, 2.4);
  }

  // Head
  ctx.fillStyle = '#dfb38c';
  ctx.beginPath();
  ctx.arc(sx, sy - 9.3 - bob, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Hair cap
  ctx.fillStyle = '#3a2718';
  ctx.beginPath();
  ctx.arc(sx, sy - 9.8 - bob, 1.7, Math.PI, Math.PI * 2);
  ctx.fill();
}

function drawServiceRadiusOverlay(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
): void {
  const iso = gridToIso(centerX, centerY);
  const rx = radius * TILE_W * 0.52;
  const ry = radius * TILE_H * 0.52;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(iso.x, iso.y + TILE_H * 0.5, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14;
  ctx.fill();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.restore();
}

interface TerrainCacheEntry {
  canvas: HTMLCanvasElement;
  minX: number;
  minY: number;
  seed: number;
  roadVersion: number;
  width: number;
  height: number;
}

let terrainCache: TerrainCacheEntry | null = null;

function getOrBuildTerrainCache(world: WorldState): TerrainCacheEntry {
  if (
    terrainCache &&
    terrainCache.seed === world.seed &&
    terrainCache.roadVersion === world.roadVersion &&
    terrainCache.width === world.width &&
    terrainCache.height === world.height
  ) {
    return terrainCache;
  }

  const minX = -world.height * (TILE_W * 0.5) - 32;
  const maxX = world.width * (TILE_W * 0.5) + 32;
  const minY = -32;
  const maxY = (world.width + world.height) * (TILE_H * 0.5) + 40;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(maxX - minX);
  canvas.height = Math.ceil(maxY - minY);
  const cctx = canvas.getContext('2d');
  if (cctx) {
    cctx.save();
    cctx.translate(-minX, -minY);
    const maxDiag = world.width + world.height - 2;
    for (let diag = 0; diag <= maxDiag; diag++) {
      const startX = Math.max(0, diag - world.height + 1);
      const endX = Math.min(world.width - 1, diag);
      for (let x = startX; x <= endX; x++) {
        const y = diag - x;
        const tile = world.tiles[getTileIndex(x, y, world.width)];
        const iso = gridToIso(x, y);
        drawTerrainTile(cctx, world, tile, iso.x, iso.y, 0);
      }
    }
    cctx.restore();
  }

  terrainCache = {
    canvas,
    minX,
    minY,
    seed: world.seed,
    roadVersion: world.roadVersion,
    width: world.width,
    height: world.height,
  };
  return terrainCache;
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  world: WorldState,
  camera: CameraState,
  hoverTile: { gx: number; gy: number } | null,
  toolMode: ToolMode,
  selectedBuildingId: number | null,
  selectedCartId: number | null,
  timeSec: number,
): void {
  // Deep Mediterranean horizon backdrop
  ctx.fillStyle = '#18252d';
  ctx.fillRect(0, 0, widthPx, heightPx);

  ctx.save();
  ctx.translate(widthPx * 0.5 - camera.x * camera.zoom, heightPx * 0.5 - camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  // 1. Blit only the visible portion of cached terrain & flagstones
  const cache = getOrBuildTerrainCache(world);
  const viewLeft = camera.x - (widthPx * 0.5) / camera.zoom;
  const viewTop = camera.y - (heightPx * 0.5) / camera.zoom;
  const viewW = widthPx / camera.zoom;
  const viewH = heightPx / camera.zoom;

  const srcX = Math.max(0, Math.floor(viewLeft - cache.minX));
  const srcY = Math.max(0, Math.floor(viewTop - cache.minY));
  const srcRight = Math.min(cache.canvas.width, Math.ceil(viewLeft + viewW - cache.minX));
  const srcBottom = Math.min(cache.canvas.height, Math.ceil(viewTop + viewH - cache.minY));
  const srcW = srcRight - srcX;
  const srcH = srcBottom - srcY;

  if (srcW > 0 && srcH > 0) {
    ctx.drawImage(
      cache.canvas,
      srcX,
      srcY,
      srcW,
      srcH,
      cache.minX + srcX,
      cache.minY + srcY,
      srcW,
      srcH,
    );
  }

  // Subtle animated Mediterranean water shimmer along sparse water tiles
  ctx.strokeStyle = 'rgba(205, 240, 248, 0.22)';
  ctx.lineWidth = 1.1;
  for (let y = 4; y < world.height; y += 3) {
    for (let x = 2; x < world.width; x += 3) {
      const tile = world.tiles[getTileIndex(x, y, world.width)];
      if (tile.terrain !== 'water') continue;
      const wave = Math.sin(timeSec * 1.8 + x * 0.7 + y * 0.5);
      if (wave > 0.1) {
        const iso = gridToIso(x, y);
        ctx.beginPath();
        ctx.moveTo(iso.x - 8 + wave * 3, iso.y + TILE_H * 0.5);
        ctx.lineTo(iso.x + 8 + wave * 3, iso.y + TILE_H * 0.45);
        ctx.stroke();
      }
    }
  }

  // 2. Service radius overlay for selected building or active build tool
  if (toolMode.kind === 'build') {
    const def = BUILDINGS[toolMode.buildingType];
    if (def.serviceRadius && hoverTile) {
      const cx = hoverTile.gx + (def.size - 1) * 0.5;
      const cy = hoverTile.gy + (def.size - 1) * 0.5;
      drawServiceRadiusOverlay(ctx, cx, cy, def.serviceRadius, '#e8bc55');
    }
  } else if (selectedBuildingId !== null) {
    const sel = world.buildings.find((b) => b.id === selectedBuildingId);
    if (sel) {
      const def = BUILDINGS[sel.type];
      if (def.serviceRadius) {
        const center = getBuildingCenter(sel);
        drawServiceRadiusOverlay(ctx, center.x, center.y, def.serviceRadius, '#72c5d8');
      }
    }
  }

  // 3. Hover preview (Build / Demolish / Upgrade)
  if (hoverTile && inBounds(hoverTile.gx, hoverTile.gy, world.width, world.height)) {
    if (toolMode.kind === 'build') {
      const def = BUILDINGS[toolMode.buildingType];
      const check = canPlaceBuilding(world, toolMode.buildingType, hoverTile.gx, hoverTile.gy);
      for (let dy = 0; dy < def.size; dy++) {
        for (let dx = 0; dx < def.size; dx++) {
          const tx = hoverTile.gx + dx;
          const ty = hoverTile.gy + dy;
          if (!inBounds(tx, ty, world.width, world.height)) continue;
          const iso = gridToIso(tx, ty);
          drawIsoDiamond(ctx, iso.x, iso.y);
          ctx.fillStyle = check.ok ? 'rgba(92, 198, 122, 0.38)' : 'rgba(220, 74, 62, 0.42)';
          ctx.fill();
          ctx.strokeStyle = check.ok ? '#8ef0a8' : '#ff8a80';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    } else if (toolMode.kind === 'demolish') {
      const iso = gridToIso(hoverTile.gx, hoverTile.gy);
      drawIsoDiamond(ctx, iso.x, iso.y);
      ctx.fillStyle = 'rgba(220, 74, 62, 0.42)';
      ctx.fill();
      ctx.strokeStyle = '#ff8a80';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      const iso = gridToIso(hoverTile.gx, hoverTile.gy);
      drawIsoDiamond(ctx, iso.x, iso.y);
      ctx.strokeStyle = 'rgba(245, 224, 168, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // 4. Depth-sort buildings, carts, and citizens cleanly
  type RenderEntity =
    | { kind: 'building'; depth: number; b: PlacedBuilding }
    | { kind: 'cart'; depth: number; c: Cart }
    | { kind: 'citizen'; depth: number; w: Citizen };

  const entities: RenderEntity[] = [];
  for (const b of world.buildings) {
    // Bottom-most corner drives painter order
    const depth = b.x + b.y + (b.size - 1) * 1.1;
    entities.push({ kind: 'building', depth, b });
  }
  for (const c of world.carts) {
    const depth = c.worldX + c.worldY + 0.15;
    entities.push({ kind: 'cart', depth, c });
  }
  for (const w of world.citizens) {
    const depth = w.worldX + w.worldY + 0.12;
    entities.push({ kind: 'citizen', depth, w });
  }

  entities.sort((a, b) => a.depth - b.depth);

  for (const item of entities) {
    if (item.kind === 'building') {
      drawBuilding(ctx, item.b, item.b.id === selectedBuildingId, timeSec);
    } else if (item.kind === 'cart') {
      drawCart(ctx, item.c, item.c.id === selectedCartId);
    } else {
      drawCitizen(ctx, item.w);
    }
  }

  ctx.restore();
}

const WARM_LIT_TYPES = new Set<BuildingType>([
  'house_liberti',
  'house_cives',
  'bakery',
  'pottery',
  'market',
  'temple',
  'forum',
  'horreum',
  'fountain',
]);

export function renderDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  world: WorldState,
  camera: CameraState,
  timeSec: number,
): void {
  const filter = getDaylightColorFilter(world.dayTime);
  if (filter.alpha <= 0.005) return;

  ctx.save();
  ctx.fillStyle = filter.cssColor;
  ctx.fillRect(0, 0, widthPx, heightPx);

  if (filter.nightFactor > 0.15) {
    ctx.translate(widthPx * 0.5 - camera.x * camera.zoom, heightPx * 0.5 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);

    const glowStrength = Math.min(1, (filter.nightFactor - 0.15) / 0.85);
    for (const b of world.buildings) {
      const isBurning = b.onFireTimer > 0;
      if (!isBurning && (!b.roadConnected || !WARM_LIT_TYPES.has(b.type))) continue;

      const center = getBuildingCenter(b);
      const iso = gridToIso(center.x, center.y);
      const sx = iso.x;
      const sy = iso.y + TILE_H * 0.45;
      const flicker = 0.9 + Math.sin(timeSec * 4.2 + b.id * 1.7) * 0.1;

      if (isBurning) {
        ctx.fillStyle = `rgba(255, 118, 42, ${(0.34 * glowStrength * flicker).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 34, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const radiusX = b.size === 2 ? 28 : 17;
        const radiusY = b.size === 2 ? 16 : 10;
        ctx.fillStyle = `rgba(255, 198, 98, ${(0.18 * glowStrength * flicker).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle warm window/lantern speck
        ctx.fillStyle = `rgba(255, 222, 138, ${(0.72 * glowStrength).toFixed(3)})`;
        ctx.fillRect(sx - 2, sy - 6, 3, 3);
      }
    }
  }

  ctx.restore();
}

export function getPlacementTooltip(
  world: WorldState,
  toolMode: ToolMode,
  hoverTile: { gx: number; gy: number } | null,
): string | null {
  if (!hoverTile || !inBounds(hoverTile.gx, hoverTile.gy, world.width, world.height)) return null;
  if (toolMode.kind === 'build') {
    const check = canPlaceBuilding(world, toolMode.buildingType, hoverTile.gx, hoverTile.gy);
    if (!check.ok && check.reason) return check.reason;
  }
  return null;
}

export function findCartNearScreenPoint(
  world: WorldState,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: CameraState,
): Cart | null {
  const sx = (clientX - rect.left - rect.width * 0.5) / camera.zoom + camera.x;
  const sy = (clientY - rect.top - rect.height * 0.5) / camera.zoom + camera.y;
  let best: Cart | null = null;
  let bestDist = 18;
  for (const cart of world.carts) {
    const iso = gridToIso(cart.worldX, cart.worldY);
    const dist = Math.hypot(sx - iso.x, sy - (iso.y + TILE_H * 0.5 - 4));
    if (dist < bestDist) {
      bestDist = dist;
      best = cart;
    }
  }
  return best;
}

export function getInitialCameraForWorld(world: WorldState): CameraState {
  // Center on starter Horreum / Via Principalis around (18, 24)
  const iso = gridToIso(18.5, 23.5);
  return {
    x: iso.x,
    y: iso.y,
    zoom: 1.22,
  };
}
