import { getTileIndex, inBounds } from './mapGen';
import { PlacedBuilding, WorldState } from './types';

export interface GridPoint {
  x: number;
  y: number;
}

const CARDINAL_DIRS: GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Returns all road tile coordinates directly adjacent (cardinally) to a building's footprint.
 */
export function getBuildingRoadEntries(world: WorldState, b: PlacedBuilding): GridPoint[] {
  const entries: GridPoint[] = [];
  const seen = new Set<number>();
  for (let dy = 0; dy < b.size; dy++) {
    for (let dx = 0; dx < b.size; dx++) {
      const bx = b.x + dx;
      const by = b.y + dy;
      for (const dir of CARDINAL_DIRS) {
        const nx = bx + dir.x;
        const ny = by + dir.y;
        if (!inBounds(nx, ny, world.width, world.height)) continue;
        // Skip tiles inside the building footprint itself
        if (nx >= b.x && nx < b.x + b.size && ny >= b.y && ny < b.y + b.size) continue;
        const idx = getTileIndex(nx, ny, world.width);
        if (world.tiles[idx].isRoad && !seen.has(idx)) {
          seen.add(idx);
          entries.push({ x: nx, y: ny });
        }
      }
    }
  }
  return entries;
}

export function getBuildingCenter(b: PlacedBuilding): { x: number; y: number } {
  return {
    x: b.x + (b.size - 1) * 0.5,
    y: b.y + (b.size - 1) * 0.5,
  };
}

/**
 * Finds the shortest path along road tiles from building `from` to building `to`.
 * Returns the full waypoint list including center of `from`, road tiles, and center of `to`,
 * or null if no road connection exists.
 */
function computeRoadPath(
  world: WorldState,
  from: PlacedBuilding,
  to: PlacedBuilding,
): GridPoint[] | null {
  if (from.id === to.id) return null;

  const startEntries = getBuildingRoadEntries(world, from);
  const endEntries = getBuildingRoadEntries(world, to);
  if (startEntries.length === 0 || endEntries.length === 0) return null;

  const targetSet = new Set<number>(
    endEntries.map((p) => getTileIndex(p.x, p.y, world.width)),
  );

  const total = world.width * world.height;
  const visited = new Uint8Array(total);
  const parent = new Int32Array(total).fill(-1);
  const queue: number[] = [];

  for (const s of startEntries) {
    const idx = getTileIndex(s.x, s.y, world.width);
    visited[idx] = 1;
    queue.push(idx);
    if (targetSet.has(idx)) {
      return [
        getBuildingCenter(from),
        { x: s.x, y: s.y },
        getBuildingCenter(to),
      ];
    }
  }

  let head = 0;
  let foundIdx = -1;

  while (head < queue.length) {
    const currIdx = queue[head++];
    const cx = currIdx % world.width;
    const cy = (currIdx - cx) / world.width;

    for (const dir of CARDINAL_DIRS) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (!inBounds(nx, ny, world.width, world.height)) continue;
      const nIdx = getTileIndex(nx, ny, world.width);
      if (visited[nIdx] || !world.tiles[nIdx].isRoad) continue;
      visited[nIdx] = 1;
      parent[nIdx] = currIdx;
      if (targetSet.has(nIdx)) {
        foundIdx = nIdx;
        break;
      }
      queue.push(nIdx);
    }
    if (foundIdx !== -1) break;
  }

  if (foundIdx === -1) return null;

  const roadWaypoints: GridPoint[] = [];
  let trace = foundIdx;
  while (trace !== -1) {
    const tx = trace % world.width;
    const ty = (trace - tx) / world.width;
    roadWaypoints.push({ x: tx, y: ty });
    trace = parent[trace];
  }
  roadWaypoints.reverse();

  return [getBuildingCenter(from), ...roadWaypoints, getBuildingCenter(to)];
}

interface PathCache {
  roadVersion: number;
  paths: Map<string, GridPoint[] | null>;
}

const pathCaches = new WeakMap<WorldState, PathCache>();

/**
 * Cached road path lookup. The cache is invalidated per world whenever the road
 * network changes, and failures are cached too so disconnected producers do not
 * re-run BFS on every logistics tick.
 */
export function findRoadPathBetweenBuildings(
  world: WorldState,
  from: PlacedBuilding,
  to: PlacedBuilding,
): GridPoint[] | null {
  if (from.id === to.id) return null;

  let cache = pathCaches.get(world);
  if (!cache || cache.roadVersion !== world.roadVersion) {
    cache = { roadVersion: world.roadVersion, paths: new Map() };
    pathCaches.set(world, cache);
  }

  const key = `${from.id}:${to.id}`;
  if (!cache.paths.has(key)) {
    if (cache.paths.size > 1000) cache.paths.clear();
    cache.paths.set(key, computeRoadPath(world, from, to));
  }
  const path = cache.paths.get(key) ?? null;
  return path ? path.map((p) => ({ ...p })) : null;
}
