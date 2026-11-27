import { emptyResourceRecord } from './mapGen';
import { recomputeStaticStatuses } from './simulation';
import { SavePayload, WorldState } from './types';

const STORAGE_KEY = 'aurea_pax_save_v1';
const SAVE_VERSION = 1;

export function serializeWorld(world: WorldState): SavePayload {
  const {
    _rateWindowTimer,
    _producedInWindow,
    _consumedInWindow,
    pendingNotifications,
    _notificationCooldowns,
    ...rest
  } = world;
  void pendingNotifications;
  void _notificationCooldowns;
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
    },
  };
}

export function deserializeWorld(rawJson: string): WorldState {
  const parsed = JSON.parse(rawJson) as SavePayload;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.version !== SAVE_VERSION ||
    !parsed.world ||
    !Array.isArray(parsed.world.tiles) ||
    !Array.isArray(parsed.world.buildings) ||
    typeof parsed.world.width !== 'number' ||
    typeof parsed.world.height !== 'number'
  ) {
    throw new Error('Archivo de partida inválido o incompatible.');
  }

  const world: WorldState = {
    ...parsed.world,
    buildings: parsed.world.buildings.map((b) => ({
      ...b,
      onFireTimer: b.onFireTimer ?? 0,
    })),
    carts: Array.isArray(parsed.world.carts) ? parsed.world.carts : [],
    citizens: Array.isArray(parsed.world.citizens) ? parsed.world.citizens : [],
    nextCitizenId: typeof parsed.world.nextCitizenId === 'number' ? parsed.world.nextCitizenId : 1,
    weather: parsed.world.weather ?? {
      kind: 'clear',
      remainingSeconds: 16,
      intensity: 0,
      rngState: ((parsed.world.seed ?? 11701) ^ 0x9e3779b9) >>> 0,
    },
    dayTime: typeof parsed.world.dayTime === 'number' ? parsed.world.dayTime : 0.375,
    fireRngState: parsed.world.fireRngState ?? (((parsed.world.seed ?? 11701) ^ 0x517cc1b7) >>> 0),
    fireCooldownSeconds: parsed.world.fireCooldownSeconds ?? 45,
    citizenSpawnTimer: typeof parsed.world.citizenSpawnTimer === 'number' ? parsed.world.citizenSpawnTimer : 0.4,
    citizenRngState: parsed.world.citizenRngState ?? (((parsed.world.seed ?? 11701) ^ 0x2c1b3c6d) >>> 0),
    pendingNotifications: [],
    _rateWindowTimer: 0,
    _producedInWindow: emptyResourceRecord(),
    _consumedInWindow: emptyResourceRecord(),
    _notificationCooldowns: {},
  };
  recomputeStaticStatuses(world);
  return world;
}

export function saveWorldToLocal(world: WorldState): boolean {
  try {
    const payload = serializeWorld(world);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadWorldFromLocal(): { world: WorldState; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavePayload;
    const world = deserializeWorld(raw);
    return { world, savedAt: parsed.savedAt ?? '' };
  } catch {
    return null;
  }
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
  } catch {
    // ignore storage errors
  }
}
