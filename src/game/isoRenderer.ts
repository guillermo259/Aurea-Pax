import { BUILDINGS, RESOURCE_META } from './catalog';
import { getDaylightColorFilter } from './dayCycle';
import { drawIsoDiamond, fillEllipse, gridToIso, TILE_H, TILE_W, tracePolygon } from './isoDrawing';
import { adjacentTile, drawRoadTile, drawTerrainTile, TILE_EDGES } from './isoTerrain';
import { getTileIndex, inBounds } from './mapGen';
import { getBuildingCenter } from './pathfinding';
import { canPlaceBuilding } from './simulation';
import { BuildingType, Cart, Citizen, PlacedBuilding, Tile, ToolMode, WorldState } from './types';

export { gridToIso, TILE_H, TILE_W } from './isoDrawing';

export interface CameraState {
  x: number; // world screen-space X center
  y: number; // world screen-space Y center
  zoom: number;
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
  const halfW = w / 2;
  const halfD = d / 2;
  const top = cy - baseHeight;
  const left = { x: cx - halfW, y: top + halfD };
  const front = { x: cx, y: top + d };
  const right = { x: cx + halfW, y: top + halfD };
  const back = { x: cx, y: top };
  const ridgeLeft = { x: cx - halfW / 2, y: top + halfD / 2 - peakExtra };
  const ridgeRight = { x: cx + halfW / 2, y: top + halfD * 1.5 - peakExtra };

  tracePolygon(ctx, front.x, front.y, right.x, right.y, ridgeRight.x, ridgeRight.y);
  ctx.fillStyle = '#d9c4a0';
  ctx.fill();

  for (const { a, b, color, lit } of [
    { a: left, b: front, color: frontColor, lit: true },
    { a: back, b: right, color: backColor, lit: false },
  ]) {
    tracePolygon(ctx, a.x, a.y, b.x, b.y, ridgeRight.x, ridgeRight.y, ridgeLeft.x, ridgeLeft.y);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 0.85;
    ctx.strokeStyle = '#482b23a0';
    ctx.stroke();

    // Raised terracotta seams run down the slope with darker joints between rows.
    ctx.beginPath();
    const tileCount = Math.max(6, Math.floor(w / 7));
    for (let i = 1; i < tileCount; i++) {
      const t = i / tileCount;
      ctx.moveTo(ridgeLeft.x + (ridgeRight.x - ridgeLeft.x) * t, ridgeLeft.y + (ridgeRight.y - ridgeLeft.y) * t);
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    ctx.strokeStyle = lit ? '#ffd1a458' : '#ebba9144';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    ctx.beginPath();
    for (const t of [0.28, 0.55, 0.81]) {
      ctx.moveTo(a.x + (ridgeLeft.x - a.x) * t, a.y + (ridgeLeft.y - a.y) * t);
      ctx.lineTo(b.x + (ridgeRight.x - b.x) * t, b.y + (ridgeRight.y - b.y) * t);
    }
    ctx.strokeStyle = '#512c2b55';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(ridgeRight.x, ridgeRight.y);
  ctx.lineTo(right.x, right.y);
  ctx.moveTo(ridgeLeft.x, ridgeLeft.y);
  ctx.lineTo(ridgeRight.x, ridgeRight.y);
  ctx.strokeStyle = '#ed926a';
  ctx.lineWidth = 1.35;
  ctx.stroke();
}

function drawArch(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number,
  lean: number, opening = '#443027',
): void {
  ctx.save();
  ctx.transform(1, lean, 0, 1, x, y);
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(-width / 2, -height + width / 2);
  ctx.arc(0, -height + width / 2, width / 2, Math.PI, 0);
  ctx.lineTo(width / 2, 0);
  ctx.closePath();
  ctx.fillStyle = opening;
  ctx.fill();
  ctx.strokeStyle = '#e1c29b';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawStall(ctx: CanvasRenderingContext2D, x: number, y: number, cloth: string, shade: string): void {
  fillEllipse(ctx, x + 4, y + 13, 13, 4.8, '#51473940');
  ctx.fillStyle = '#68432f';
  ctx.fillRect(x - 10, y - 1, 1.5, 12);
  ctx.fillRect(x + 9, y, 1.5, 11);
  drawIsoBox(ctx, x, y + 5, 20, 9, 4, '#bd8950', '#826144', '#9d7249');
  fillEllipse(ctx, x - 4, y + 8, 2.3, 1.25, '#c36b37');
  fillEllipse(ctx, x + 3, y + 7, 3, 1.25, '#b2a264');

  for (let stripe = 0; stripe < 6; stripe++) {
    const dx = stripe * 3.5;
    tracePolygon(ctx, x - 11 + dx, y - 2 + dx * 0.23, x - 7.5 + dx, y - 1.2 + dx * 0.23,
      x + 1 + dx, y - 10.6 + dx * 0.23, x - 2.5 + dx, y - 11.4 + dx * 0.23);
    ctx.fillStyle = stripe % 2 === 0 ? cloth : '#f4dfb8';
    ctx.fill();
  }
  tracePolygon(ctx, x - 11, y - 2, x + 10, y + 2.8, x + 10, y + 5, x - 11, y + 0.3);
  ctx.fillStyle = shade;
  ctx.fill();
}

function drawPavedYard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, depth: number): void {
  drawIsoBox(ctx, x, y, width, depth, 2, '#c8b797', '#948369', '#aa977a');
  drawIsoDiamond(ctx, x, y - 2, width, depth);
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#8e795956';
  ctx.beginPath();
  for (let offset = -width / 2; offset <= width / 2; offset += 13) {
    ctx.moveTo(x + offset - depth, y - 5);
    ctx.lineTo(x + offset + depth, y + depth - 5);
    ctx.moveTo(x + offset + depth, y - 5);
    ctx.lineTo(x + offset - depth, y + depth - 5);
  }
  ctx.stroke();
  ctx.restore();
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

function drawBuildingStructure(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  fallow: boolean,
  sx: number,
  baseY: number,
): void {
  const size = BUILDINGS[type].size;
  const footprintW = TILE_W * size * 0.82;
  const footprintD = TILE_H * size * 0.82;
  const groundY = baseY + TILE_H * size * 0.5;
  fillEllipse(ctx, sx + size * 7, groundY + 3, footprintW * 0.40, footprintD * 0.34, '#23312452');
  fillEllipse(ctx, sx + size * 3, groundY + 1, footprintW * 0.36, footprintD * 0.29, '#26302542');

  switch (type) {
    case 'house_liberti': {
      drawIsoBox(ctx, sx, baseY + 3, 38, 19, 12, '#e6dac3', '#c8b99d', '#dfd2b8', 'rgba(60,42,24,0.35)');
      drawGableRoof(ctx, sx, baseY + 3, 42, 21, 12, 9, '#b95335', '#963f26');
      drawArch(ctx, sx + 6, baseY + 18.5, 5.5, 8, -0.5);
      drawArch(ctx, sx - 10, baseY + 13.6, 4, 4.5, 0.5);
      drawIsoBox(ctx, sx + 8, baseY + 18, 11, 4.5, 1.4, '#e5d1a9', '#b7a080', '#c6ad89');
      fillEllipse(ctx, sx + 18, baseY + 20, 3.3, 1.6, '#77573d');
      fillEllipse(ctx, sx + 18, baseY + 17.6, 3, 2.9, '#557449');
      break;
    }
    case 'house_cives': {
      // Multi-story Roman Insula / Domus with colonnade
      drawIsoBox(ctx, sx, baseY + 2, 44, 22, 22, '#efe5d0', '#cbbba0', '#e3d6bc', 'rgba(60,42,24,0.4)');
      // Second floor terracotta trim
      drawIsoBox(ctx, sx, baseY + 2 - 11, 46, 23, 2, '#b95335', '#963f26', '#ad4c2f');
      drawGableRoof(ctx, sx, baseY + 2, 48, 24, 22, 10, '#c25736', '#9e4125');
      drawArch(ctx, sx - 12, baseY + 2, 5, 6, 0.5);
      drawArch(ctx, sx - 4, baseY + 6, 5, 6, 0.5);
      drawArch(ctx, sx + 8, baseY + 5, 5, 6, -0.5);
      drawArch(ctx, sx + 10, baseY + 17, 7, 9, -0.5);
      drawIsoBox(ctx, sx + 10, baseY + 18, 14, 7, 2, '#e0cdaa', '#9f8d72', '#baab91');
      break;
    }
    case 'horreum': {
      drawPavedYard(ctx, sx, baseY + 6, footprintW, footprintD);
      drawIsoBox(ctx, sx, baseY + 8, footprintW * 0.88, footprintD * 0.88, 6, '#b8ab96', '#8d816f', '#a29682', '#50382965');
      drawIsoBox(ctx, sx, baseY + 3, footprintW * 0.78, footprintD * 0.78, 22, '#e4d4b7', '#c7b393', '#a7957d', '#4b342366');
      drawGableRoof(ctx, sx, baseY + 3, footprintW * 0.84, footprintD * 0.84, 22, 13, '#bc5d3b', '#93462e');
      for (const off of [7, 19, 31]) {
        drawArch(ctx, sx + off, baseY + 38 - off * 0.5, 7.8, 13, -0.5);
      }
      for (const off of [-29, -18, -7]) {
        drawArch(ctx, sx + off, baseY + 28 + off * 0.5, 5, 6, 0.5);
      }
      drawIsoBox(ctx, sx - 15, baseY + 38, 10, 5, 6, '#aa8050', '#755538', '#8d6542', '#46372470');
      drawIsoBox(ctx, sx - 6, baseY + 43, 8, 4, 4, '#c09a61', '#785839', '#a87a4f');
      break;
    }
    case 'market': {
      drawPavedYard(ctx, sx, baseY + 4, footprintW * 0.98, footprintD * 0.98);
      drawStall(ctx, sx - 20, baseY + 16, '#af4d3b', '#7e352e');
      drawStall(ctx, sx + 11, baseY + 19, '#b3843b', '#957035');
      drawStall(ctx, sx - 2, baseY + 32, '#4b7771', '#395c56');
      drawIsoBox(ctx, sx + 17, baseY + 37, 10, 5, 4, '#ac8857', '#70573d', '#8f704b');
      break;
    }
    case 'fountain': {
      drawPavedYard(ctx, sx, baseY + 4, 47, 23);
      drawIsoBox(ctx, sx, baseY + 6, 36, 18, 6, '#e6dbc2', '#a99b83', '#c5b498', '#5e56486b');
      drawIsoDiamond(ctx, sx, baseY + 3, 27, 13.5);
      ctx.fillStyle = '#367f85';
      ctx.fill();
      fillEllipse(ctx, sx, baseY + 10.5, 8.5, 2.5, '#6fc2b5');
      drawIsoBox(ctx, sx, baseY + 6, 9, 4.5, 10, '#f0e1c2', '#c1ae90', '#ddc9aa');
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
    case 'watchtower': {
      // Squat stone base, narrow shaft and a crenellated lookout gallery.
      drawIsoBox(ctx, sx, baseY + 7, 38, 19, 7, '#cfc5b2', '#9d9381', '#b8ae9b', 'rgba(40,35,30,0.4)');
      drawIsoBox(ctx, sx, baseY + 2, 21, 11, 33, '#e2d8c4', '#b6ab96', '#cfc4ae', 'rgba(40,35,30,0.35)');

      // Masonry courses and an arrow slit make the shaft read as a tower.
      ctx.strokeStyle = 'rgba(112, 101, 84, 0.38)';
      ctx.lineWidth = 1;
      for (let row = 1; row <= 4; row++) {
        ctx.beginPath();
        ctx.moveTo(sx - 8, baseY - row * 6);
        ctx.lineTo(sx + 8, baseY - row * 6);
        ctx.stroke();
      }
      ctx.fillStyle = '#3d3428';
      ctx.fillRect(sx - 1.5, baseY - 18, 3, 8);

      // Wider timber-and-stone gallery with battlements.
      drawIsoBox(ctx, sx, baseY - 24, 34, 17, 5, '#d7cdb9', '#a99e89', '#c3b8a2');
      ctx.fillStyle = '#b9ae99';
      for (const off of [-11, 0, 11]) {
        drawIsoBox(ctx, sx + off, baseY - 29, 7, 4, 4, '#e1d6c2', '#aaa08c', '#c6bba5');
      }

      // Banner and signal brazier on the platform.
      ctx.strokeStyle = '#5b3b22';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 29);
      ctx.lineTo(sx, baseY - 44);
      ctx.stroke();
      ctx.fillStyle = '#a63b2c';
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 44);
      ctx.lineTo(sx + 10, baseY - 41);
      ctx.lineTo(sx, baseY - 37);
      ctx.closePath();
      ctx.fill();

      drawIsoBox(ctx, sx + 5, baseY - 31, 7, 4, 2, '#96735a', '#5f3f32', '#76533c');
      break;
    }
    case 'wheat_farm': {
      drawIsoDiamond(ctx, sx, baseY + 2, 57, 28.5);
      ctx.fillStyle = fallow ? '#91714c' : '#a88543';
      ctx.fill();
      ctx.save();
      ctx.clip();
      for (let row = -2; row <= 2; row++) {
        for (let plant = 0; plant < 7; plant++) {
          const x = sx - 20 + plant * 5 + row * 4;
          const y = baseY + 10 + plant * 2.6 - row * 2.1;
          ctx.fillStyle = fallow ? '#624a37' : '#e5bb63';
          ctx.fillRect(x, y - (fallow ? 0 : 3), 1.4, fallow ? 1 : 4);
          ctx.fillStyle = fallow ? '#b39566' : '#c89c4f';
          ctx.fillRect(x + 2, y - 1, 1.2, 2);
        }
      }
      ctx.restore();
      drawIsoBox(ctx, sx - 11, baseY + 7, 17, 8.5, 8, '#dfd2b8', '#b0a186', '#cbbca0');
      drawGableRoof(ctx, sx - 11, baseY + 7, 19, 9.5, 8, 5, '#b65436', '#8f3f26');
      break;
    }
    case 'mill': {
      // Stone windmill tower + rotating sails
      drawIsoBox(ctx, sx, baseY + 4, 30, 15, 20, '#d8ceb9', '#a79c87', '#c2b7a1', 'rgba(50,40,30,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 32, 16, 20, 8, '#a64d32', '#823922');
      break;
    }
    case 'bakery': {
      drawIsoBox(ctx, sx, baseY + 4, 38, 19, 12, '#e3d5bd', '#b7a68d', '#d1c1a7', 'rgba(50,35,20,0.4)');
      drawGableRoof(ctx, sx, baseY + 4, 40, 20, 12, 8, '#b85032', '#913c23');
      // Brick oven dome & glowing hearth
      drawIsoBox(ctx, sx + 10, baseY + 12, 14, 7, 8, '#a9482e', '#7e331f', '#963f28');
      ctx.fillStyle = '#ff9f38';
      ctx.fillRect(sx + 11, baseY + 15, 4, 4);
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
      break;
    }
  }

}

interface BuildingSprite {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  width: number;
  height: number;
}

const buildingSprites = new Map<string, BuildingSprite>();

function getBuildingSprite(type: BuildingType, fallow: boolean): BuildingSprite {
  const key = fallow ? type + ':fallow' : type;
  const cached = buildingSprites.get(key);
  if (cached) return cached;

  const size = BUILDINGS[type].size;
  const left = -(TILE_W * size / 2 + 16);
  const top = -54;
  const width = -left * 2;
  const height = TILE_H * size + 10 - top;
  const canvas = document.createElement('canvas');
  // A shared high-resolution sprite stays crisp when the player zooms in.
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(2, 0, 0, 2, -left * 2, -top * 2);
    drawBuildingStructure(ctx, type, fallow, 0, 0);
  }
  const sprite = { canvas, left, top, width, height };
  buildingSprites.set(key, sprite);
  return sprite;
}

function drawBuilding(
  ctx: CanvasRenderingContext2D, b: PlacedBuilding, isSelected: boolean,
  timeSec: number, sx: number, baseY: number,
): void {
  if (isSelected) {
    drawIsoDiamond(ctx, sx, baseY, TILE_W * b.size, TILE_H * b.size);
    ctx.strokeStyle = '#ffda87';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  const fallow = b.type === 'wheat_farm' && b.sown === false;
  const sprite = getBuildingSprite(b.type, fallow);
  ctx.drawImage(sprite.canvas, sx + sprite.left, baseY + sprite.top, sprite.width, sprite.height);

  if (b.type === 'fountain') {
    const pulse = Math.sin(timeSec * 5 + b.id);
    ctx.strokeStyle = '#d6f4e6';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(sx, baseY - 2);
    ctx.quadraticCurveTo(sx - 5, baseY - 5 - pulse, sx - 5.5, baseY + 9);
    ctx.moveTo(sx, baseY - 2);
    ctx.quadraticCurveTo(sx + 5, baseY - 5 + pulse, sx + 5.5, baseY + 9);
    ctx.stroke();
    fillEllipse(ctx, sx, baseY + 10, 3.7 + pulse, 0.8, '#cdf0de9c');
  } else if (b.type === 'watchtower') {
    const flicker = Math.sin(timeSec * 9 + b.id);
    fillEllipse(ctx, sx + 5, baseY - 34, 3, 4.5 + flicker, '#e78238');
    fillEllipse(ctx, sx + 5, baseY - 33, 1.4, 2.5 + flicker * 0.4, '#ffdc87');
  } else if (b.type === 'mill') {
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
  } else if ((b.type === 'bakery' || b.type === 'pottery') && b.roadConnected && b.inputBuffer >= 1) {
    drawSmokePuff(ctx, sx + (b.type === 'bakery' ? 10 : 12), baseY + 2, timeSec, b.animSeed);
  }

  if (b.type === 'house_liberti' && b.upgradeReady && b.alerts.length === 0) {
    const y = baseY - 23 + Math.sin(timeSec * 3.2 + b.id) * 1.5;
    tracePolygon(ctx, sx - 7, y, sx, y - 7, sx + 7, y, sx, y + 7);
    ctx.fillStyle = '#2f372a';
    ctx.fill();
    ctx.strokeStyle = '#f3c575';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 2.5, y + 0.5);
    ctx.lineTo(sx, y - 2.3);
    ctx.lineTo(sx + 2.5, y + 0.5);
    ctx.stroke();
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

interface LayerCache {
  canvas: HTMLCanvasElement;
  scale: number;
  minX: number;
  minY: number;
  key: string;
  opacity?: number;
}

let terrainCache: LayerCache | null = null;
let fogCache: LayerCache | null = null;

/** Drops cached layers so a different save is never drawn with stale terrain or roads. */
export function invalidateTerrainCache(): void {
  terrainCache = null;
  fogCache = null;
  waterGlints = [];
}

function createLayerCanvas(
  world: WorldState,
  draw: (ctx: CanvasRenderingContext2D, tile: Tile, sx: number, sy: number) => void,
  finish?: (ctx: CanvasRenderingContext2D) => void,
): LayerCache {
  const minX = -world.height * (TILE_W * 0.5) - 32;
  const maxX = world.width * (TILE_W * 0.5) + 32;
  const minY = -32;
  const maxY = (world.width + world.height) * (TILE_H * 0.5) + 40;

  const canvas = document.createElement('canvas');
  // Keep each raster layer within four megapixels, including for larger imported maps.
  const scale = Math.min(1, Math.sqrt(4_000_000 / ((maxX - minX) * (maxY - minY))));
  canvas.width = Math.ceil((maxX - minX) * scale);
  canvas.height = Math.ceil((maxY - minY) * scale);
  const cctx = canvas.getContext('2d');
  if (cctx) {
    cctx.save();
    cctx.scale(scale, scale);
    cctx.translate(-minX, -minY);
    const maxDiag = world.width + world.height - 2;
    for (let diag = 0; diag <= maxDiag; diag++) {
      const startX = Math.max(0, diag - world.height + 1);
      const endX = Math.min(world.width - 1, diag);
      for (let x = startX; x <= endX; x++) {
        const y = diag - x;
        const tile = world.tiles[getTileIndex(x, y, world.width)];
        const iso = gridToIso(x, y);
        draw(cctx, tile, iso.x, iso.y);
      }
    }
    finish?.(cctx);
    cctx.restore();
  }

  return { canvas, scale, minX, minY, key: '' };
}

function getOrBuildTerrainCache(world: WorldState): LayerCache {
  // Scenery and road edges both depend on the structures occupying the ground.
  const key = `${world.seed}:${world.width}x${world.height}:${world.fogVersion}:${world.roadVersion}:${world.nextBuildingId}:${world.buildings.length}`;
  if (terrainCache?.key === key) return terrainCache;

  const roads: Array<{ tile: Tile; x: number; y: number }> = [];
  waterGlints = [];
  const layer = createLayerCanvas(world, (ctx, tile, x, y) => {
    if (!tile.discovered) return;
    drawTerrainTile(ctx, world, tile, x, y);
    if (tile.isRoad) roads.push({ tile, x, y });
    const pattern = (tile.x * 7 + tile.y * 11) % 5;
    if (tile.terrain === 'water' && pattern < 3) {
      waterGlints.push({ x: x - 9 + pattern * 8, y: y + 12 + pattern * 4,
        phase: tile.x * 0.7 + tile.y * 1.29, length: 7 + pattern * 4 });
    }
  }, (ctx) => {
    for (const { tile, x, y } of roads) drawRoadTile(ctx, world, tile, x, y);
  });
  layer.key = key;
  terrainCache = layer;
  return layer;
}

let fogPatternSource: HTMLCanvasElement | null = null;

/** A soft, seamlessly repeating cloud texture so fog is not a flat slate plane. */
function getFogPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!fogPatternSource) {
    const size = 256;
    const texture = document.createElement('canvas');
    texture.width = size;
    texture.height = size;
    const tctx = texture.getContext('2d');
    if (!tctx) return null;
    tctx.fillStyle = '#344847';
    tctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 34; i++) {
      const x = (i * 97 + 31) % size;
      const y = (i * 53 + 71) % size;
      const radius = 26 + ((i * 37) % 42);
      const glow = tctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, 'rgba(177, 191, 171, 0.13)');
      glow.addColorStop(0.55, 'rgba(145, 166, 157, 0.07)');
      glow.addColorStop(1, 'rgba(145, 166, 157, 0)');
      tctx.fillStyle = glow;
      tctx.beginPath();
      tctx.arc(x, y, radius, 0, Math.PI * 2);
      tctx.fill();
      // Wrap the puff across the seam for a tileable texture.
      if (x < radius || x > size - radius || y < radius || y > size - radius) {
        for (const ox of [-size, 0, size]) {
          for (const oy of [-size, 0, size]) {
            if (ox === 0 && oy === 0) continue;
            const wrapped = tctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
            wrapped.addColorStop(0, 'rgba(177, 191, 171, 0.13)');
            wrapped.addColorStop(1, 'rgba(145, 166, 157, 0)');
            tctx.fillStyle = wrapped;
            tctx.beginPath();
            tctx.arc(x + ox, y + oy, radius, 0, Math.PI * 2);
            tctx.fill();
          }
        }
      }
    }
    fogPatternSource = texture;
  }
  return ctx.createPattern(fogPatternSource, 'repeat');
}

function getOrBuildFogCache(world: WorldState): LayerCache {
  const key = `${world.seed}:${world.width}x${world.height}:${world.fogVersion ?? 0}`;
  if (fogCache?.key === key) return fogCache;

  // Opaque tile fills first so overlaps never create a checkerboard.
  const layer = createLayerCanvas(world, (ctx, tile, sx, sy) => {
    if (tile.discovered) return;
    // Slight overlap hides antialiased seams between neighbouring diamonds.
    drawIsoDiamond(ctx, sx, sy, TILE_W * 1.04, TILE_H * 1.04);
    ctx.fillStyle = '#344847';
    ctx.fill();
  });

  const lctx = layer.canvas.getContext('2d');
  if (lctx) {
    // Paint a single continuous cloud pattern clipped to the fog silhouette.
    lctx.save();
    lctx.globalCompositeOperation = 'source-in';
    const clouds = getFogPattern(lctx);
    if (clouds) {
      lctx.fillStyle = clouds;
      lctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
    }
    lctx.restore();

    // Trace only the boundary of the explored region, without outlining fog tiles.
    lctx.save();
    lctx.scale(layer.scale, layer.scale);
    lctx.translate(-layer.minX, -layer.minY);
    lctx.beginPath();
    for (const tile of world.tiles) {
      if (tile.discovered) continue;
      const { x, y } = gridToIso(tile.x, tile.y);
      for (const edge of TILE_EDGES) {
        if (!adjacentTile(world, tile, edge.dx, edge.dy)?.discovered) continue;
        lctx.moveTo(x + edge.x1, y + edge.y1);
        lctx.lineTo(x + edge.x2, y + edge.y2);
      }
    }
    lctx.lineWidth = 5;
    lctx.strokeStyle = '#b7c4a22b';
    lctx.stroke();
    lctx.lineWidth = 1.15;
    lctx.strokeStyle = '#d6d0a977';
    lctx.stroke();
    lctx.restore();
  }

  layer.key = key;
  layer.opacity = 0.98;
  fogCache = layer;
  return layer;
}

function blitLayer(
  ctx: CanvasRenderingContext2D,
  layer: LayerCache,
  viewLeft: number,
  viewTop: number,
  viewW: number,
  viewH: number,
): void {
  const srcX = Math.max(0, Math.floor((viewLeft - layer.minX) * layer.scale));
  const srcY = Math.max(0, Math.floor((viewTop - layer.minY) * layer.scale));
  const srcRight = Math.min(layer.canvas.width, Math.ceil((viewLeft + viewW - layer.minX) * layer.scale));
  const srcBottom = Math.min(layer.canvas.height, Math.ceil((viewTop + viewH - layer.minY) * layer.scale));
  const srcW = srcRight - srcX;
  const srcH = srcBottom - srcY;
  if (srcW <= 0 || srcH <= 0) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity ?? 1;
  ctx.drawImage(
    layer.canvas,
    srcX,
    srcY,
    srcW,
    srcH,
    layer.minX + srcX / layer.scale,
    layer.minY + srcY / layer.scale,
    srcW / layer.scale,
    srcH / layer.scale,
  );
  ctx.restore();
}

interface WaterGlint {
  x: number;
  y: number;
  phase: number;
  length: number;
}

let waterGlints: WaterGlint[] = [];
let vignette: { width: number; height: number; paint: CanvasGradient } | null = null;

function drawWaterGlints(
  ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number, time: number,
): void {
  ctx.beginPath();
  for (const glint of waterGlints) {
    if (glint.x < left - 22 || glint.x > right + 22 || glint.y < top || glint.y > bottom) continue;
    const wave = Math.sin(time * 1.5 + glint.phase);
    if (wave < 0.25) continue;
    const x = glint.x + wave * 3;
    ctx.moveTo(x - glint.length * wave, glint.y);
    ctx.quadraticCurveTo(x, glint.y - 1.15, x + glint.length * wave, glint.y);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#b2e4cf60';
  ctx.stroke();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (vignette?.width !== width || vignette.height !== height) {
    const radius = Math.hypot(width, height) / 2;
    const paint = ctx.createRadialGradient(width / 2, height / 2, radius * 0.34,
      width / 2, height / 2, radius);
    paint.addColorStop(0, '#111d1c00');
    paint.addColorStop(0.73, '#111d1c0d');
    paint.addColorStop(1, '#111d1c49');
    vignette = { width, height, paint };
  }
  ctx.fillStyle = vignette.paint;
  ctx.fillRect(0, 0, width, height);
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
  ctx.fillStyle = '#243735';
  ctx.fillRect(0, 0, widthPx, heightPx);

  ctx.save();
  ctx.translate(widthPx * 0.5 - camera.x * camera.zoom, heightPx * 0.5 - camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  // 1. Blit only the visible portion of the cached terrain and road layers
  const viewLeft = camera.x - (widthPx * 0.5) / camera.zoom;
  const viewTop = camera.y - (heightPx * 0.5) / camera.zoom;
  const viewW = widthPx / camera.zoom;
  const viewH = heightPx / camera.zoom;
  blitLayer(ctx, getOrBuildTerrainCache(world), viewLeft, viewTop, viewW, viewH);

  const viewRight = viewLeft + viewW;
  const viewBottom = viewTop + viewH;
  drawWaterGlints(ctx, viewLeft, viewTop, viewRight, viewBottom, timeSec);

  // 1b. Unexplored land: drawn over terrain and water so nothing leaks through the fog.
  blitLayer(ctx, getOrBuildFogCache(world), viewLeft, viewTop, viewW, viewH);

  // 2. Service radius overlay for selected building or active build tool
  if (toolMode.kind === 'build') {
    const def = BUILDINGS[toolMode.buildingType];
    const radius = def.revealRadius ?? def.serviceRadius;
    if (radius && hoverTile) {
      const cx = hoverTile.gx + (def.size - 1) * 0.5;
      const cy = hoverTile.gy + (def.size - 1) * 0.5;
      drawServiceRadiusOverlay(ctx, cx, cy, radius, def.revealRadius ? '#e6c76a' : '#e8bc55');
    }
  } else if (selectedBuildingId !== null) {
    const sel = world.buildings.find((b) => b.id === selectedBuildingId);
    if (sel) {
      const def = BUILDINGS[sel.type];
      const radius = def.revealRadius ?? def.serviceRadius;
      if (radius) {
        const center = getBuildingCenter(sel);
        drawServiceRadiusOverlay(
          ctx,
          center.x,
          center.y,
          radius,
          def.revealRadius ? '#e6c76a' : '#72c5d8',
        );
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
          drawIsoDiamond(ctx, iso.x, iso.y - world.tiles[getTileIndex(tx, ty, world.width)].elevation * 5);
          ctx.fillStyle = check.ok ? 'rgba(92, 198, 122, 0.38)' : 'rgba(220, 74, 62, 0.42)';
          ctx.fill();
          ctx.strokeStyle = check.ok ? '#8ef0a8' : '#ff8a80';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    } else {
      const iso = gridToIso(hoverTile.gx, hoverTile.gy);
      const tile = world.tiles[getTileIndex(hoverTile.gx, hoverTile.gy, world.width)];
      drawIsoDiamond(ctx, iso.x, iso.y - tile.elevation * 5);
      if (toolMode.kind === 'demolish') {
        ctx.fillStyle = 'rgba(220, 74, 62, 0.42)';
        ctx.fill();
        ctx.strokeStyle = '#ff8a80';
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = 'rgba(245, 224, 168, 0.55)';
        ctx.lineWidth = 1.2;
      }
      ctx.stroke();
    }
  }

  // 4. Depth-sort buildings, carts, and citizens cleanly
  type RenderEntity =
    | { kind: 'building'; depth: number; b: PlacedBuilding; sx: number; baseY: number }
    | { kind: 'cart'; depth: number; c: Cart }
    | { kind: 'citizen'; depth: number; w: Citizen };

  const entities: RenderEntity[] = [];
  for (const b of world.buildings) {
    const sx = (b.x - b.y) * TILE_W * 0.5;
    const tile = world.tiles[getTileIndex(b.x, b.y, world.width)];
    const baseY = (b.x + b.y) * TILE_H * 0.5 - (b.size === 1 ? tile.elevation * 5 : 0);
    const margin = TILE_W * b.size * 0.5 + 16;
    if (sx + margin < viewLeft || sx - margin > viewRight ||
        baseY + TILE_H * b.size + 10 < viewTop || baseY - 54 > viewBottom) continue;
    const depth = b.x + b.y + (b.size - 1) * 2;
    entities.push({ kind: 'building', depth, b, sx, baseY });
  }
  for (const c of world.carts) {
    const iso = gridToIso(c.worldX, c.worldY);
    if (iso.x < viewLeft - 24 || iso.x > viewRight + 24 ||
        iso.y < viewTop - 26 || iso.y > viewBottom + 10) continue;
    const depth = c.worldX + c.worldY + 0.15;
    entities.push({ kind: 'cart', depth, c });
  }
  for (const w of world.citizens) {
    const iso = gridToIso(w.worldX, w.worldY);
    if (iso.x < viewLeft - 24 || iso.x > viewRight + 24 ||
        iso.y < viewTop - 26 || iso.y > viewBottom + 10) continue;
    const depth = w.worldX + w.worldY + 0.12;
    entities.push({ kind: 'citizen', depth, w });
  }

  entities.sort((a, b) => a.depth - b.depth);

  for (const item of entities) {
    if (item.kind === 'building') {
      drawBuilding(ctx, item.b, item.b.id === selectedBuildingId, timeSec, item.sx, item.baseY);
    } else if (item.kind === 'cart') {
      drawCart(ctx, item.c, item.c.id === selectedCartId);
    } else {
      drawCitizen(ctx, item.w);
    }
  }

  ctx.restore();
  drawVignette(ctx, widthPx, heightPx);
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

let lanternGlow: HTMLCanvasElement | undefined;
let fireGlow: HTMLCanvasElement | undefined;

function createGlow(center: string, edge: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    glow.addColorStop(0, center);
    glow.addColorStop(0.38, center.slice(0, 7) + '42');
    glow.addColorStop(1, edge);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
  }
  return canvas;
}

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
    const halfWidth = widthPx / camera.zoom / 2;
    const halfHeight = heightPx / camera.zoom / 2;
    lanternGlow ??= createGlow('#ffce738a', '#ffae5800');
    fireGlow ??= createGlow('#ff8e43cc', '#fa632e00');
    for (const b of world.buildings) {
      const burning = b.onFireTimer > 0;
      if (!burning && (!b.roadConnected || !WARM_LIT_TYPES.has(b.type))) continue;

      const center = getBuildingCenter(b);
      const iso = gridToIso(center.x, center.y);
      const sx = iso.x + (b.type === 'market' ? 0 : 7);
      const sy = iso.y + TILE_H * 0.5 - 3;
      const rx = burning ? 38 : 19 + b.size * 5;
      const ry = burning ? 28 : 12 + b.size * 4;
      if (Math.abs(sx - camera.x) > halfWidth + rx || Math.abs(sy - camera.y) > halfHeight + ry) continue;

      const flicker = 0.92 + Math.sin(timeSec * 4.2 + b.id * 1.7) * 0.08;
      ctx.globalAlpha = glowStrength * flicker;
      ctx.drawImage(burning ? fireGlow : lanternGlow, sx - rx, sy - ry, rx * 2, ry * 2);
      if (!burning) fillEllipse(ctx, sx, sy - 3, 1.2, 1.5, '#ffdd94');
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
