import { BUILDINGS, RESOURCE_ORDER, WHEAT_HARVESTS_PER_SOWING } from './catalog';
import {
  defaultTileReserve,
  emptyResourceRecord,
  getTileIndex,
  revealAround,
} from './mapGen';
import { recomputeStaticStatuses } from './simulation';
import {
  BuildingType,
  Cart,
  Citizen,
  PlacedBuilding,
  ResourceId,
  SavePayload,
  TerrainKind,
  Tile,
  WeatherKind,
  WorldState,
} from './types';

const STORAGE_KEY = 'aurea_pax_save_v1';
const BACKUP_KEY = 'aurea_pax_save_backup_v1';
const SAVE_VERSION = 2;
const MIN_SAVE_VERSION = 1;

/** Reject oversized saves/imports before parsing so a huge file cannot freeze the tab. */
export const MAX_SAVE_BYTES = 8 * 1024 * 1024;

const MAX_MAP_DIMENSION = 160;
const MAX_COUNTER = 1_000_000_000;
const MAX_STOCK = 1_000_000;
const MAX_PATH_POINTS = 4096;

const VALID_TERRAIN: TerrainKind[] = [
  'water',
  'sand',
  'grass',
  'fertile',
  'forest',
  'stone',
  'clay',
];
const VALID_WEATHER: WeatherKind[] = ['clear', 'rain', 'wind'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Keeps a valid unique positive id, otherwise assigns the next free one. */
function sanitizeId(value: unknown, used: Set<number>): number {
  let id =
    typeof value === 'number' && Number.isInteger(value) && value > 0 && !used.has(value)
      ? value
      : 1;
  while (used.has(id)) id += 1;
  used.add(id);
  return id;
}

function sanitizeStock(value: unknown): Record<ResourceId, number> {
  const out = emptyResourceRecord();
  if (!isRecord(value)) return out;
  for (const res of RESOURCE_ORDER) {
    out[res] = clampNumber(value[res], 0, 0, MAX_STOCK);
  }
  return out;
}

function sanitizeMarketStock(value: unknown): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  if (!isRecord(value)) return out;
  for (const res of RESOURCE_ORDER) {
    if (isFiniteNumber(value[res])) {
      out[res] = clampNumber(value[res], 0, 0, 1000);
    }
  }
  return out;
}

function sanitizePath(
  value: unknown,
  width: number,
  height: number,
): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PATH_POINTS) return null;
  const path: Array<{ x: number; y: number }> = [];
  for (const point of value) {
    if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return null;
    path.push({ x: point.x, y: point.y });
  }
  return path;
}

/** Current segment and world position of a cart/citizen, clamped to the path/map. */
function sanitizePosition(
  raw: Record<string, unknown>,
  path: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): { segmentIndex: number; worldX: number; worldY: number } {
  const segmentIndex = clampInt(raw.segmentIndex, 0, 0, path.length - 1);
  const anchor = path[segmentIndex];
  return {
    segmentIndex,
    worldX: clampNumber(raw.worldX, anchor.x, 0, width),
    worldY: clampNumber(raw.worldY, anchor.y, 0, height),
  };
}

function sanitizeTiles(
  value: unknown,
  width: number,
  height: number,
  seed: number,
  legacySave: boolean,
): Tile[] | null {
  if (!Array.isArray(value) || value.length !== width * height) return null;

  const tiles: Tile[] = new Array(width * height);
  for (let index = 0; index < value.length; index++) {
    const raw = value[index];
    if (!isRecord(raw)) return null;
    const x = index % width;
    const y = (index - x) / width;
    const rawTerrain = raw.terrain as TerrainKind;
    const terrain = VALID_TERRAIN.includes(rawTerrain) ? rawTerrain : 'grass';
    const extractable = terrain === 'forest' || terrain === 'stone' || terrain === 'clay';
    const fallbackReserve = extractable ? defaultTileReserve(terrain, x, y, seed) : 0;
    tiles[index] = {
      x,
      y,
      terrain,
      elevation: clampInt(raw.elevation, 0, 0, 3),
      buildingId: null,
      // Roads cannot exist over open water.
      isRoad: raw.isRoad === true && terrain !== 'water',
      variant: clampInt(raw.variant, 0, 0, 3),
      // v1 saves predate fog; their developed area is revealed below. A v2 tile
      // missing the flag is treated as known rather than unexpectedly hiding land.
      discovered: legacySave ? false : raw.discovered !== false,
      reserve: extractable
        ? clampInt(raw.reserve, fallbackReserve, 0, MAX_COUNTER)
        : 0,
    };
  }
  return tiles;
}

function sanitizeBuildings(
  value: unknown,
  width: number,
  height: number,
  tiles: Tile[],
): PlacedBuilding[] {
  if (!Array.isArray(value)) return [];

  const claimed = new Set<number>();
  const usedIds = new Set<number>();
  const buildings: PlacedBuilding[] = [];

  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const rawType = raw.type;
    if (typeof rawType !== 'string' || !Object.prototype.hasOwnProperty.call(BUILDINGS, rawType)) {
      continue;
    }
    const type = rawType as BuildingType;
    const def = BUILDINGS[type];
    const x = raw.x;
    const y = raw.y;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x + def.size > width ||
      y + def.size > height
    ) {
      continue;
    }

    const footprint: number[] = [];
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        footprint.push(getTileIndex(x + dx, y + dy, width));
      }
    }
    const blocked = footprint.some((index) => {
      const tile = tiles[index];
      return !tile || tile.terrain === 'water' || tile.isRoad || claimed.has(index);
    });
    if (blocked) continue;

    // Derived state (alerts, service coverage, satisfaction) is rebuilt by
    // recomputeStaticStatuses, so only simulation inputs are restored here.
    const isWheatFarm = type === 'wheat_farm';
    const sown = isWheatFarm
      ? typeof raw.sown === 'boolean'
        ? raw.sown
        : true
      : false;
    const building: PlacedBuilding = {
      id: sanitizeId(raw.id, usedIds),
      type,
      x,
      y,
      size: def.size,
      roadConnected: false,
      cycleProgress: clampNumber(raw.cycleProgress, 0, 0, 1),
      inputBuffer: clampInt(raw.inputBuffer, 0, 0, 8),
      outputBuffer: clampInt(raw.outputBuffer, 0, 0, 8),
      marketStock: sanitizeMarketStock(raw.marketStock),
      residents: clampNumber(raw.residents, 0, 0, def.maxResidents ?? 0),
      satisfaction: clampNumber(raw.satisfaction, 1, 0, 1),
      hasWater: false,
      hasMarket: false,
      hasTemple: false,
      hasBread: false,
      hasWine: false,
      hasPottery: false,
      upgradeReady: false,
      onFireTimer: clampNumber(raw.onFireTimer, 0, 0, 3600),
      starvationTimer: clampNumber(raw.starvationTimer, 0, 0, 3600),
      alerts: [],
      sown: isWheatFarm ? sown : undefined,
      harvestsLeft: isWheatFarm
        ? clampInt(
            raw.harvestsLeft,
            sown ? WHEAT_HARVESTS_PER_SOWING : 0,
            0,
            WHEAT_HARVESTS_PER_SOWING,
          )
        : 0,
      animSeed: clampNumber(raw.animSeed, 0, 0, 1),
    };

    for (const index of footprint) {
      tiles[index].buildingId = building.id;
      claimed.add(index);
    }
    buildings.push(building);
  }

  return buildings;
}

function sanitizeCarts(
  value: unknown,
  width: number,
  height: number,
  buildings: PlacedBuilding[],
): Cart[] {
  if (!Array.isArray(value)) return [];
  const buildingIds = new Set(buildings.map((b) => b.id));
  const usedIds = new Set<number>();
  const carts: Cart[] = [];

  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const ownerBuildingId = raw.ownerBuildingId;
    const targetBuildingId = raw.targetBuildingId;
    if (
      typeof ownerBuildingId !== 'number' ||
      typeof targetBuildingId !== 'number' ||
      !buildingIds.has(ownerBuildingId) ||
      !buildingIds.has(targetBuildingId)
    ) {
      continue;
    }
    const rawCargo = raw.cargo;
    if (typeof rawCargo !== 'string' || !RESOURCE_ORDER.includes(rawCargo as ResourceId)) {
      continue;
    }
    const path = sanitizePath(raw.path, width, height);
    if (!path) continue;

    carts.push({
      id: sanitizeId(raw.id, usedIds),
      ownerBuildingId,
      targetBuildingId,
      cargo: rawCargo as ResourceId,
      amount: clampInt(raw.amount, 1, 1, 100),
      state: raw.state === 'returning' ? 'returning' : 'delivering',
      path,
      ...sanitizePosition(raw, path, width, height),
      segmentProgress: clampNumber(raw.segmentProgress, 0, 0, 1),
    });
  }

  return carts;
}

function sanitizeCitizens(
  value: unknown,
  width: number,
  height: number,
  buildings: PlacedBuilding[],
): Citizen[] {
  if (!Array.isArray(value)) return [];
  const buildingIds = new Set(buildings.map((b) => b.id));
  const usedIds = new Set<number>();
  const citizens: Citizen[] = [];

  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const originBuildingId = raw.originBuildingId;
    const targetBuildingId = raw.targetBuildingId;
    if (
      typeof originBuildingId !== 'number' ||
      typeof targetBuildingId !== 'number' ||
      !buildingIds.has(originBuildingId) ||
      !buildingIds.has(targetBuildingId)
    ) {
      continue;
    }
    const path = sanitizePath(raw.path, width, height);
    if (!path) continue;

    citizens.push({
      id: sanitizeId(raw.id, usedIds),
      role: raw.role === 'ciudadano' ? 'ciudadano' : 'peon',
      originBuildingId,
      targetBuildingId,
      state: raw.state === 'returning' ? 'returning' : 'to_target',
      path,
      ...sanitizePosition(raw, path, width, height),
      segmentProgress: clampNumber(raw.segmentProgress, 0, 0, 1),
      speed: clampNumber(raw.speed, 1.5, 0.2, 10),
      tunicColor:
        typeof raw.tunicColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.tunicColor)
          ? raw.tunicColor
          : '#a8643c',
      laneOffset: clampNumber(raw.laneOffset, 0, -1, 1),
      // walkPhase grows without bound while walking; keep it as saved.
      walkPhase: isFiniteNumber(raw.walkPhase) ? raw.walkPhase : 0,
    });
  }

  return citizens;
}

export function serializeWorld(world: WorldState): SavePayload {
  const {
    _rateWindowTimer,
    _producedInWindow,
    _consumedInWindow,
    pendingNotifications,
    _notificationCooldowns,
    _logisticsTimer,
    _lastReroutedRoadVersion,
    ...rest
  } = world;
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    world: {
      ...rest,
      tiles: rest.tiles.map((t) => ({ ...t })),
      buildings: rest.buildings.map((b) => ({
        ...b,
        marketStock: { ...b.marketStock },
        alerts: [...b.alerts],
      })),
      carts: rest.carts.map((c) => ({
        ...c,
        path: c.path.map((p) => ({ ...p })),
      })),
      citizens: rest.citizens.map((c) => ({
        ...c,
        path: c.path.map((p) => ({ ...p })),
      })),
      stock: { ...rest.stock },
      prodPerMin: { ...rest.prodPerMin },
      demandPerMin: { ...rest.demandPerMin },
      weather: { ...rest.weather },
    },
  };
}

function invalidSave(): never {
  throw new Error('Archivo de partida inválido o incompatible.');
}

/** Version seam: v1 is current. Add stepwise migrations here when the schema changes. */
function migrateSavePayload(world: Record<string, unknown>): Record<string, unknown> {
  return world;
}

/**
 * Rebuilds a world from untrusted JSON (imported file or localStorage), rejecting
 * structurally broken saves and sanitizing every field so a tampered file cannot
 * inject invalid tiles, buildings or NaN values into the simulation.
 */
export function deserializeWorld(rawJson: string): WorldState {
  if (rawJson.length > MAX_SAVE_BYTES) {
    throw new Error('El archivo de partida es demasiado grande (máximo 8 MB).');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    invalidSave();
  }

  if (!isRecord(parsed) || !isRecord(parsed.world)) {
    invalidSave();
  }
  const version = parsed.version;
  if (typeof version !== 'number' || version < MIN_SAVE_VERSION || version > SAVE_VERSION) {
    invalidSave();
  }

  const raw = migrateSavePayload(parsed.world);
  const width = raw.width;
  const height = raw.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_MAP_DIMENSION ||
    height > MAX_MAP_DIMENSION
  ) {
    invalidSave();
  }

  const seed = clampInt(raw.seed, 11701, 0, 0xffffffff);
  const legacySave = version < 2;
  const tiles = sanitizeTiles(raw.tiles, width, height, seed, legacySave);
  if (!tiles) invalidSave();

  const buildings = sanitizeBuildings(raw.buildings, width, height, tiles);
  const carts = sanitizeCarts(raw.carts, width, height, buildings);
  const citizens = sanitizeCitizens(raw.citizens, width, height, buildings);

  const rawWeather = isRecord(raw.weather) ? raw.weather : {};
  const rawWeatherKind = rawWeather.kind as WeatherKind;

  const world: WorldState = {
    seed,
    width,
    height,
    tiles,
    buildings,
    carts,
    citizens,
    nextBuildingId: buildings.reduce((max, b) => Math.max(max, b.id), 0) + 1,
    nextCartId: carts.reduce((max, c) => Math.max(max, c.id), 0) + 1,
    nextCitizenId: citizens.reduce((max, c) => Math.max(max, c.id), 0) + 1,
    roadVersion: clampInt(raw.roadVersion, 1, 1, 1_000_000),
    elapsedSeconds: clampNumber(raw.elapsedSeconds, 0, 0, MAX_COUNTER),
    denarii: clampNumber(raw.denarii, 0, -MAX_COUNTER, MAX_COUNTER),
    stock: sanitizeStock(raw.stock),
    prodPerMin: sanitizeStock(raw.prodPerMin),
    demandPerMin: sanitizeStock(raw.demandPerMin),
    taxPerMin: 0,
    upkeepPerMin: 0,
    netDenariiPerMin: 0,
    populationLiberti: 0,
    populationCives: 0,
    totalPopulation: 0,
    totalCartsDelivered: clampInt(raw.totalCartsDelivered, 0, 0, MAX_COUNTER),
    autoUpgradeHouses: toBoolean(raw.autoUpgradeHouses),
    victoryAchieved: toBoolean(raw.victoryAchieved),
    victoryDismissed: toBoolean(raw.victoryDismissed),
    bankrupt: toBoolean(raw.bankrupt),
    weather: {
      kind: VALID_WEATHER.includes(rawWeatherKind) ? rawWeatherKind : 'clear',
      remainingSeconds: clampNumber(rawWeather.remainingSeconds, 16, 0, 600),
      intensity: clampNumber(rawWeather.intensity, 0, 0, 1),
      rngState: clampInt(rawWeather.rngState, (seed ^ 0x9e3779b9) >>> 0, 0, 0xffffffff),
    },
    dayTime: clampNumber(raw.dayTime, 0.375, 0, 1) % 1,
    fireRngState: clampInt(raw.fireRngState, (seed ^ 0x517cc1b7) >>> 0, 0, 0xffffffff),
    fireCooldownSeconds: clampNumber(raw.fireCooldownSeconds, 45, 0, 3600),
    citizenSpawnTimer: clampNumber(raw.citizenSpawnTimer, 0.4, 0, 60),
    citizenRngState: clampInt(raw.citizenRngState, (seed ^ 0x2c1b3c6d) >>> 0, 0, 0xffffffff),
    pendingNotifications: [],
    _rateWindowTimer: 0,
    _producedInWindow: emptyResourceRecord(),
    _consumedInWindow: emptyResourceRecord(),
    _notificationCooldowns: {},
    _logisticsTimer: 0,
    _lastReroutedRoadVersion: 0,
    fogVersion: clampInt(raw.fogVersion, 1, 0, MAX_COUNTER),
  };

  if (legacySave) {
    // Preserve everything an older colony could already see: its buildings and roads.
    for (const building of world.buildings) {
      revealAround(
        world,
        building.x + (building.size - 1) * 0.5,
        building.y + (building.size - 1) * 0.5,
        BUILDINGS[building.type].revealRadius ?? 3,
      );
    }
    for (const tile of world.tiles) {
      if (tile.isRoad) revealAround(world, tile.x, tile.y, 2);
    }
  }

  recomputeStaticStatuses(world);
  return world;
}

export function saveWorldToLocal(world: WorldState): boolean {
  try {
    const payload = JSON.stringify(serializeWorld(world));
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous) {
      try {
        JSON.parse(previous);
        localStorage.setItem(BACKUP_KEY, previous);
      } catch {
        // Never promote a corrupt save to the backup slot.
      }
    }
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export type SavedGameLoadResult =
  | { status: 'ok'; world: WorldState; recovered: boolean }
  | { status: 'corrupt'; message: string }
  | { status: 'none' };

/** Loads the primary save, falling back to the previous autosave if it is damaged. */
export function loadSavedGame(): SavedGameLoadResult {
  let primary: string | null = null;
  let backup: string | null = null;
  try {
    primary = localStorage.getItem(STORAGE_KEY);
    backup = localStorage.getItem(BACKUP_KEY);
  } catch {
    return { status: 'corrupt', message: 'El almacenamiento local no está disponible.' };
  }

  if (!primary && !backup) return { status: 'none' };

  if (primary) {
    try {
      return { status: 'ok', world: deserializeWorld(primary), recovered: false };
    } catch {
      // Fall through to the backup copy.
    }
  }
  if (backup) {
    try {
      return { status: 'ok', world: deserializeWorld(backup), recovered: true };
    } catch {
      // Both copies are unusable.
    }
  }
  return {
    status: 'corrupt',
    message: 'La partida guardada está dañada y no hay una copia de seguridad válida.',
  };
}

export function hasLocalSave(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore storage errors
  }
}
