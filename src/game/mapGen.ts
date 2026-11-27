import { BUILDINGS, WHEAT_HARVESTS_PER_SOWING } from './catalog';
import { PlacedBuilding, ResourceId, TerrainKind, Tile, WorldState } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2d(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi, seed);
  const b = hash2d(xi + 1, yi, seed);
  const c = hash2d(xi, yi + 1, seed);
  const d = hash2d(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 3; i++) {
    val += amp * valueNoise2d(x * freq, y * freq, seed + i * 97);
    freq *= 2;
    amp *= 0.5;
  }
  return val;
}

export function emptyResourceRecord(): Record<ResourceId, number> {
  return {
    wood: 0,
    stone: 0,
    wheat: 0,
    flour: 0,
    bread: 0,
    grapes: 0,
    wine: 0,
    clay: 0,
    pottery: 0,
  };
}

export function getTileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * Extraction units stored in a natural tile. Near the starting valley the
 * deposits are thin; the rich seams lie beyond the fog, so a growing colony
 * must eventually push roads and watchtowers toward the frontier.
 */
export function defaultTileReserve(
  terrain: TerrainKind,
  x: number,
  y: number,
  seed: number,
): number {
  const distance = Math.hypot(x - 19, y - 24);
  const richness = distance > 14 ? 1.8 : distance > 9 ? 1.25 : 1;
  if (terrain === 'forest') return Math.round((90 + hash2d(x, y, seed) * 40) * richness);
  if (terrain === 'stone') {
    return Math.round((70 + hash2d(x, y, seed + 31) * 30) * richness);
  }
  if (terrain === 'clay') return Math.round((80 + hash2d(x, y, seed + 67) * 30) * richness);
  return 0;
}

/** Lifts the fog in a circle and bumps fogVersion so the cached fog layer refreshes. */
export function revealAround(
  world: WorldState,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(world.width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(world.height - 1, Math.ceil(centerY + radius));
  const radiusSq = radius * radius;
  let changed = false;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radiusSq) continue;
      const tile = world.tiles[getTileIndex(x, y, world.width)];
      if (!tile.discovered) {
        tile.discovered = true;
        changed = true;
      }
    }
  }
  if (changed) world.fogVersion += 1;
  return changed;
}

export function createBuildingRecord(
  id: number,
  type: PlacedBuilding['type'],
  x: number,
  y: number,
  seedVal: number,
): PlacedBuilding {
  const def = BUILDINGS[type];
  return {
    id,
    type,
    x,
    y,
    size: def.size,
    roadConnected: false,
    cycleProgress: 0,
    inputBuffer: 0,
    outputBuffer: 0,
    marketStock: {},
    residents: def.isHousing ? (def.tier === 'cives' ? 10 : 4) : 0,
    satisfaction: def.isHousing ? 0.8 : 1,
    hasWater: false,
    hasMarket: false,
    hasTemple: false,
    hasBread: false,
    hasWine: false,
    hasPottery: false,
    upgradeReady: false,
    onFireTimer: 0,
    starvationTimer: 0,
    alerts: [],
    sown: type === 'wheat_farm' ? true : undefined,
    harvestsLeft: type === 'wheat_farm' ? WHEAT_HARVESTS_PER_SOWING : 0,
    animSeed: seedVal,
  };
}

export function placeInitialStructure(
  world: WorldState,
  type: PlacedBuilding['type'],
  x: number,
  y: number,
): PlacedBuilding | null {
  const def = BUILDINGS[type];
  if (x < 0 || y < 0 || x + def.size > world.width || y + def.size > world.height) return null;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const tile = world.tiles[getTileIndex(x + dx, y + dy, world.width)];
      if (tile.terrain === 'water' || tile.buildingId !== null || tile.isRoad) return null;
      // Flatten/ensure buildable grass for starter buildings
      if (type === 'road') {
        tile.isRoad = true;
      }
    }
  }
  if (type === 'road') {
    world.roadVersion += 1;
    return null;
  }
  const id = world.nextBuildingId++;
  const building = createBuildingRecord(id, type, x, y, (id * 0.37) % 1);
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const tile = world.tiles[getTileIndex(x + dx, y + dy, world.width)];
      tile.buildingId = id;
    }
  }
  world.buildings.push(building);
  return building;
}

export function createStarterWorld(seed = 11701): WorldState {
  const width = 42;
  const height = 42;
  const rand = mulberry32(seed);
  const tiles: Tile[] = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Mediterranean coast along the bottom/left edge (y >= 34 or x <= 3 gently curved)
      const coastWave = Math.sin(x * 0.22 + 0.5) * 1.8 + Math.cos(y * 0.19) * 1.3;
      const isSea = y > 35 + coastWave * 0.5 || x < 2 + Math.sin(y * 0.25) * 1.1;
      // Gentle river curving through east-center into the sea
      const riverCenter = 28 + Math.sin(y * 0.18) * 3.2;
      const distRiver = Math.abs(x - riverCenter);
      const isRiver = !isSea && distRiver < 1.35 && y > 6;

      let terrain: TerrainKind = 'grass';
      let elevation = 0;

      if (isSea || isRiver) {
        terrain = 'water';
      } else {
        const nearSea = y > 33.4 + coastWave * 0.5 || x < 3.4 + Math.sin(y * 0.25) * 1.1;
        const nFertile = fbm(x * 0.12 + 3.1, y * 0.12 + 7.4, seed);
        const nForest = fbm(x * 0.16 + 14.2, y * 0.16 + 2.8, seed + 17);
        const nStone = fbm(x * 0.18 + 25.4, y * 0.18 + 19.1, seed + 53);

        if (nearSea) {
          terrain = 'sand';
        } else if (distRiver < 3.1 && y > 10 && nFertile > 0.36) {
          terrain = 'clay';
        } else if (nStone > 0.69 && y < 18) {
          terrain = 'stone';
          elevation = 1;
        } else if (nForest > 0.62 && y > 8 && y < 32) {
          terrain = 'forest';
        } else if (nFertile > 0.56 && y > 10 && y < 33) {
          terrain = 'fertile';
        } else {
          terrain = 'grass';
        }
      }

      tiles[getTileIndex(x, y, width)] = {
        x,
        y,
        terrain,
        elevation,
        buildingId: null,
        isRoad: false,
        variant: Math.floor(rand() * 4),
        discovered: false,
        reserve: 0,
      };
    }
  }

  // Ensure guaranteed reachable resource pockets near starter valley (around center x: 12..25, y: 15..29)
  const paintCluster = (cx: number, cy: number, radius: number, kind: TerrainKind) => {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= radius * radius + 0.4) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (!inBounds(tx, ty, width, height)) continue;
          const tile = tiles[getTileIndex(tx, ty, width)];
          if (tile && tile.terrain !== 'water' && tile.terrain !== 'sand') {
            tile.terrain = kind;
            tile.elevation = kind === 'stone' ? 1 : 0;
          }
        }
      }
    }
  };

  // Clear starter plaza flat grass around (16..23, 20..27)
  for (let y = 19; y <= 28; y++) {
    for (let x = 14; x <= 23; x++) {
      const tile = tiles[getTileIndex(x, y, width)];
      if (tile.terrain !== 'water') {
        tile.terrain = 'grass';
        tile.elevation = 0;
      }
    }
  }

  // Guaranteed nearby resource zones so every playthrough has fair, discoverable geography
  paintCluster(12, 23, 2.5, 'fertile'); // Wheat & Vineyards west of settlement
  paintCluster(19, 14, 2.2, 'fertile'); // Northern fertile meadow
  paintCluster(25, 22, 1.8, 'clay'); // River clay bank east
  paintCluster(15, 13, 1.7, 'stone'); // Quarry outcrop north-west
  paintCluster(22, 18, 2.0, 'forest'); // Timber grove north-east

  // Remote, fogged resource grounds: the reward for road-building and watchtowers.
  paintCluster(8, 8, 2.4, 'forest');
  paintCluster(10, 12, 1.8, 'stone');
  paintCluster(33, 9, 2.2, 'stone');
  paintCluster(33, 18, 2.0, 'forest');
  paintCluster(35, 29, 2.0, 'clay');
  paintCluster(8, 34, 2.2, 'fertile');

  // Assign finite reserves after all terrain painting has finished.
  for (const tile of tiles) {
    if (tile.terrain === 'forest' || tile.terrain === 'stone' || tile.terrain === 'clay') {
      tile.reserve = defaultTileReserve(tile.terrain, tile.x, tile.y, seed);
    }
  }

  const world: WorldState = {
    seed,
    width,
    height,
    tiles,
    buildings: [],
    carts: [],
    citizens: [],
    nextBuildingId: 1,
    nextCartId: 1,
    nextCitizenId: 1,
    roadVersion: 1,
    elapsedSeconds: 0,
    denarii: 950,
    stock: {
      ...emptyResourceRecord(),
      wood: 45,
      stone: 26,
      wheat: 6,
      bread: 14,
    },
    prodPerMin: emptyResourceRecord(),
    demandPerMin: emptyResourceRecord(),
    taxPerMin: 0,
    upkeepPerMin: 0,
    netDenariiPerMin: 0,
    populationLiberti: 0,
    populationCives: 0,
    totalPopulation: 0,
    totalCartsDelivered: 0,
    autoUpgradeHouses: false,
    victoryAchieved: false,
    victoryDismissed: false,
    bankrupt: false,
    weather: {
      kind: 'clear',
      remainingSeconds: 16,
      intensity: 0,
      rngState: (seed ^ 0x9e3779b9) >>> 0,
    },
    dayTime: 0.375,
    fireRngState: (seed ^ 0x517cc1b7) >>> 0,
    fireCooldownSeconds: 45,
    citizenSpawnTimer: 0.35,
    citizenRngState: (seed ^ 0x2c1b3c6d) >>> 0,
    pendingNotifications: [],
    _rateWindowTimer: 0,
    _logisticsTimer: 0,
    _lastReroutedRoadVersion: 0,
    _producedInWindow: emptyResourceRecord(),
    _consumedInWindow: emptyResourceRecord(),
    _notificationCooldowns: {},
    fogVersion: 1,
  };

  // Via Principalis (main starter road)
  for (let x = 15; x <= 22; x++) {
    placeInitialStructure(world, 'road', x, 24);
  }
  for (let y = 19; y <= 27; y++) {
    placeInitialStructure(world, 'road', 18, y);
  }

  // Starter Horreum (2x2 at 16,22)
  placeInitialStructure(world, 'horreum', 16, 22);
  // Starter Fountain (at 19,23)
  placeInitialStructure(world, 'fountain', 19, 23);
  // Starter Market (2x2 at 19,25)
  const starterMarket = placeInitialStructure(world, 'market', 19, 25);
  if (starterMarket) {
    starterMarket.marketStock.bread = 6;
  }
  // Two starter Casas (Liberti)
  placeInitialStructure(world, 'house_liberti', 16, 25);
  placeInitialStructure(world, 'house_liberti', 17, 25);
  // Starter Woodcutter on the timber grove edge so carts move immediately
  const woodcutter = placeInitialStructure(world, 'woodcutter', 21, 19);
  if (woodcutter) {
    // Connect road up to woodcutter
    for (let x = 18; x <= 20; x++) {
      placeInitialStructure(world, 'road', x, 19);
    }
    woodcutter.outputBuffer = 1;
  }

  // The settled valley starts visible; the rest of the island is terra incognita.
  revealAround(world, 19, 24, 10);
  for (const building of world.buildings) {
    revealAround(
      world,
      building.x + (building.size - 1) * 0.5,
      building.y + (building.size - 1) * 0.5,
      BUILDINGS[building.type].revealRadius ?? 3,
    );
  }

  return world;
}
