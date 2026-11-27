import {
  ALERT_LABELS,
  BUILDINGS,
  RESOURCE_META,
  RESOURCE_ORDER,
  VICTORY_GOALS,
  WHEAT_HARVESTS_PER_SOWING,
  WHEAT_SOW_COST,
} from './catalog';
import { DAY_CYCLE_SECONDS, normalizeDayTime } from './dayCycle';
import {
  createBuildingRecord,
  defaultTileReserve,
  emptyResourceRecord,
  getTileIndex,
  inBounds,
  revealAround,
} from './mapGen';
import { findRoadPathBetweenBuildings, getBuildingCenter, getBuildingRoadEntries } from './pathfinding';
import {
  AlertReason,
  AlertSummary,
  BuildingType,
  Cart,
  Citizen,
  CitizenRole,
  HudSnapshot,
  PendingGameNotification,
  PlacedBuilding,
  ProductionBalanceRow,
  ResourceId,
  WeatherKind,
  WorldState,
} from './types';

export function getFarmEfficiencyMultiplier(kind: WeatherKind): number {
  if (kind === 'rain') return 1.12;
  if (kind === 'wind') return 0.9;
  return 1;
}

function nextWeatherRandom(state: number): { nextState: number; value: number } {
  const nextState = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { nextState, value: nextState / 4294967296 };
}

function advanceWeather(world: WorldState, simDt: number): void {
  const w = world.weather;
  const targetIntensity = w.kind === 'clear' ? 0 : 1;
  const rampRate = 0.45 * simDt;
  if (w.intensity < targetIntensity) {
    w.intensity = Math.min(targetIntensity, w.intensity + rampRate);
  } else if (w.intensity > targetIntensity) {
    w.intensity = Math.max(targetIntensity, w.intensity - rampRate);
  }

  w.remainingSeconds -= simDt;
  if (w.remainingSeconds <= 0) {
    const r1 = nextWeatherRandom(w.rngState);
    const r2 = nextWeatherRandom(r1.nextState);
    w.rngState = r2.nextState;

    let nextKind: WeatherKind = 'clear';
    if (w.kind === 'clear') {
      nextKind = r1.value < 0.54 ? 'rain' : 'wind';
    } else {
      if (r1.value < 0.52) nextKind = 'clear';
      else if (r1.value < 0.78) nextKind = 'rain';
      else nextKind = 'wind';
    }
    w.kind = nextKind;
    w.remainingSeconds = 20 + Math.floor(r2.value * 22);
  }
}

const FIRE_SUSCEPTIBLE_TYPES = new Set<BuildingType>([
  'bakery',
  'pottery',
  'winery',
  'mill',
  'house_liberti',
  'house_cives',
]);

/** Bread-free seconds before hunger starts killing residents. */
export const STARVATION_GRACE_SECONDS = 12;
/** Residents lost per second, per starving household, once the grace period ends. */
export const STARVATION_DEATH_RATE = 0.35;

export function queueNotification(
  world: WorldState,
  notif: PendingGameNotification,
  cooldownSec = 20,
): boolean {
  const lastAt = world._notificationCooldowns[notif.dedupeKey];
  if (lastAt !== undefined && world.elapsedSeconds < lastAt + cooldownSec) {
    return false;
  }
  world._notificationCooldowns[notif.dedupeKey] = world.elapsedSeconds;
  world.pendingNotifications.push(notif);
  if (world.pendingNotifications.length > 12) {
    world.pendingNotifications.shift();
  }
  return true;
}

export function extinguishFire(world: WorldState, buildingId: number): boolean {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b || b.onFireTimer <= 0) return false;
  if (world.denarii < EXTINGUISH_COST) return false;
  world.denarii -= EXTINGUISH_COST;
  b.onFireTimer = 0;
  recomputeStaticStatuses(world);
  return true;
}

function destroyBurnedBuilding(world: WorldState, b: PlacedBuilding): void {
  const def = BUILDINGS[b.type];
  for (let dy = 0; dy < b.size; dy++) {
    for (let dx = 0; dx < b.size; dx++) {
      const tile = world.tiles[getTileIndex(b.x + dx, b.y + dy, world.width)];
      if (tile?.buildingId === b.id) tile.buildingId = null;
    }
  }

  world.buildings = world.buildings.filter((item) => item.id !== b.id);
  world.carts = world.carts.filter(
    (cart) => cart.ownerBuildingId !== b.id && cart.targetBuildingId !== b.id,
  );
  world.citizens = world.citizens.filter(
    (citizen) => citizen.originBuildingId !== b.id && citizen.targetBuildingId !== b.id,
  );
  recomputeStaticStatuses(world);

  queueNotification(
    world,
    {
      kind: 'fire',
      severity: 'critical',
      title: 'Edificio calcinado',
      message: `${def.name} no pudo sofocarse y ha quedado destruido.`,
      dedupeKey: `fire_destroyed:${b.id}`,
      x: b.x,
      y: b.y,
      durationMs: 7500,
    },
    5,
  );
}

function advanceFires(world: WorldState, simDt: number): void {
  const fountains = world.buildings.filter((b) => b.type === 'fountain' && b.roadConnected);
  let anyBurning = false;
  const burned: PlacedBuilding[] = [];

  for (const b of world.buildings) {
    if (b.onFireTimer <= 0) continue;
    anyBurning = true;
    const nearFountain = fountains.some(
      (f) => distanceBetweenBuildings(b, f) <= (BUILDINGS.fountain.serviceRadius ?? 6),
    );
    const coolRate = nearFountain ? 2.0 : 1.0;
    b.onFireTimer = Math.max(0, b.onFireTimer - simDt * coolRate);
    if (b.onFireTimer <= 0) burned.push(b);
  }

  for (const b of burned) destroyBurnedBuilding(world, b);

  world.fireCooldownSeconds = Math.max(0, world.fireCooldownSeconds - simDt);

  if (
    !anyBurning &&
    world.elapsedSeconds >= 45 &&
    world.buildings.length >= 6 &&
    world.fireCooldownSeconds <= 0
  ) {
    const candidates = world.buildings.filter((b) => FIRE_SUSCEPTIBLE_TYPES.has(b.type));
    if (candidates.length === 0) return;

    const r1 = nextWeatherRandom(world.fireRngState);
    const r2 = nextWeatherRandom(r1.nextState);
    world.fireRngState = r2.nextState;

    // 25% check trigger when cooldown elapses; retry every 14s if clear
    if (r1.value < 0.35) {
      const idx = Math.floor(r2.value * candidates.length) % candidates.length;
      const target = candidates[idx];
      target.onFireTimer = 24;
      world.fireCooldownSeconds = 55;
      queueNotification(
        world,
        {
          kind: 'fire',
          severity: 'critical',
          title: '¡Incendio en la ciudad!',
          message: `${BUILDINGS[target.type].name} en llamas. Inspecciónelo para extinguir el fuego antes de que se pierda.`,
          dedupeKey: `fire:${target.id}`,
          x: target.x,
          y: target.y,
          buildingId: target.id,
          durationMs: 7500,
        },
        20,
      );
    } else {
      world.fireCooldownSeconds = 14;
    }
  }
}

export const UPGRADE_CIVES_COST = {
  denarii: 20,
  wood: 2,
  stone: 2,
};

/** Cost in denarii of sending the fire brigade to a burning building. */
export const EXTINGUISH_COST = 15;

const EXTRACTION_TYPES = new Set<BuildingType>(['woodcutter', 'stone_quarry', 'clay_pit']);

/** Remaining extraction units for a woodcutter/quarry/clay pit, or null otherwise. */
export function getExtractionReserve(world: WorldState, b: PlacedBuilding): number | null {
  if (!EXTRACTION_TYPES.has(b.type)) return null;
  const tile = world.tiles[getTileIndex(b.x, b.y, world.width)];
  return Math.max(0, Math.floor(tile?.reserve ?? 0));
}

function isProducerIdle(world: WorldState, b: PlacedBuilding): boolean {
  if (b.type === 'wheat_farm' && b.sown === false) return true;
  if (EXTRACTION_TYPES.has(b.type)) return (getExtractionReserve(world, b) ?? 0) <= 0;
  return false;
}

/**
 * Share of the workforce actually available to production buildings.
 * Housing supplies 75% of its residents as workers; understaffing slows every
 * workshop down to a floor of 50% instead of stopping the economy outright.
 */
export function getStaffingRatio(world: WorldState): number {
  let demand = 0;
  for (const b of world.buildings) {
    if (b.roadConnected && b.onFireTimer <= 0 && !isProducerIdle(world, b)) {
      demand += BUILDINGS[b.type].workerNeed ?? 0;
    }
  }
  if (demand === 0) return 1;
  const available = world.totalPopulation * 0.75;
  if (available <= 0) return 0;
  return Math.min(1, Math.max(0.5, available / demand));
}

const PRODUCER_NEXT_PROCESSOR: Partial<Record<ResourceId, BuildingType>> = {
  wheat: 'mill',
  flour: 'bakery',
  grapes: 'winery',
  clay: 'pottery',
};

const CONSUMER_GOODS: ResourceId[] = ['bread', 'wine', 'pottery'];

export interface PlacementCheckResult {
  ok: boolean;
  reason?: string;
}

export function canPlaceBuilding(
  world: WorldState,
  type: BuildingType,
  x: number,
  y: number,
): PlacementCheckResult {
  const def = BUILDINGS[type];
  if (x < 0 || y < 0 || x + def.size > world.width || y + def.size > world.height) {
    return { ok: false, reason: 'Fuera del mapa' };
  }

  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const tile = world.tiles[getTileIndex(x + dx, y + dy, world.width)];
      if (!tile.discovered) {
        return { ok: false, reason: 'Terreno inexplorado: despeja la niebla primero' };
      }
      if (tile.terrain === 'water') {
        return { ok: false, reason: 'No se puede construir sobre agua' };
      }
      if (tile.buildingId !== null || tile.isRoad) {
        return { ok: false, reason: 'Terreno ocupado' };
      }
      if (def.requiredTerrain && tile.terrain !== def.requiredTerrain) {
        const terrainNames: Record<string, string> = {
          fertile: 'tierra fértil',
          forest: 'bosque',
          stone: 'yacimiento de piedra',
          clay: 'depósito de arcilla',
        };
        return {
          ok: false,
          reason: `Requiere ${terrainNames[def.requiredTerrain] ?? def.requiredTerrain}`,
        };
      }
    }
  }

  if (world.denarii < def.costDenarii) {
    return { ok: false, reason: `Faltan denarios (${def.costDenarii})` };
  }
  if (world.stock.wood < def.costWood) {
    return { ok: false, reason: `Falta madera (${def.costWood})` };
  }
  if (world.stock.stone < def.costStone) {
    return { ok: false, reason: `Falta piedra (${def.costStone})` };
  }

  return { ok: true };
}

export function placeBuilding(
  world: WorldState,
  type: BuildingType,
  x: number,
  y: number,
): { ok: boolean; building?: PlacedBuilding; reason?: string } {
  const check = canPlaceBuilding(world, type, x, y);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  const def = BUILDINGS[type];
  world.denarii -= def.costDenarii;
  world.stock.wood -= def.costWood;
  world.stock.stone -= def.costStone;

  if (type === 'road') {
    const tile = world.tiles[getTileIndex(x, y, world.width)];
    tile.isRoad = true;
    world.roadVersion += 1;
    revealAround(world, x, y, 2);
    recomputeStaticStatuses(world);
    return { ok: true };
  }

  const id = world.nextBuildingId++;
  const building = createBuildingRecord(id, type, x, y, (id * 0.41) % 1);
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const tile = world.tiles[getTileIndex(x + dx, y + dy, world.width)];
      tile.buildingId = id;
    }
  }
  world.buildings.push(building);
  if (EXTRACTION_TYPES.has(type)) {
    const deposit = world.tiles[getTileIndex(x, y, world.width)];
    if (!deposit.reserve) {
      deposit.reserve = defaultTileReserve(deposit.terrain, x, y, world.seed);
    }
  }
  revealAround(
    world,
    x + (def.size - 1) * 0.5,
    y + (def.size - 1) * 0.5,
    def.revealRadius ?? 3,
  );
  recomputeStaticStatuses(world);
  return { ok: true, building };
}

export function demolishAt(world: WorldState, x: number, y: number): boolean {
  if (!inBounds(x, y, world.width, world.height)) return false;
  const tile = world.tiles[getTileIndex(x, y, world.width)];

  if (tile.isRoad) {
    const previouslyConnected = new Set(
      world.buildings.filter((b) => b.roadConnected).map((b) => b.id),
    );
    tile.isRoad = false;
    world.denarii += Math.floor(BUILDINGS.road.costDenarii * 0.5);
    world.roadVersion += 1;
    // Remove carts and citizens that were on or traversing this road cleanly
    world.carts = world.carts.filter(
      (cart) => !cart.path.some((pt) => pt.x === x && pt.y === y),
    );
    world.citizens = world.citizens.filter(
      (citizen) => !citizen.path.some((pt) => pt.x === x && pt.y === y),
    );
    recomputeStaticStatuses(world);
    const newlyDisconnected = world.buildings.find(
      (b) => previouslyConnected.has(b.id) && !b.roadConnected && BUILDINGS[b.type].needsRoad,
    );
    if (newlyDisconnected) {
      queueNotification(
        world,
        {
          kind: 'road_disconnected',
          severity: 'warning',
          title: 'Edificio aislado de calzada',
          message: `${BUILDINGS[newlyDisconnected.type].name} quedó sin conexión vial.`,
          dedupeKey: `road:${newlyDisconnected.id}`,
          x: newlyDisconnected.x,
          y: newlyDisconnected.y,
          buildingId: newlyDisconnected.id,
          durationMs: 5500,
        },
        12,
      );
    }
    return true;
  }

  if (tile.buildingId !== null) {
    const id = tile.buildingId;
    const idx = world.buildings.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const building = world.buildings[idx];
    const def = BUILDINGS[building.type];

    for (let dy = 0; dy < building.size; dy++) {
      for (let dx = 0; dx < building.size; dx++) {
        const t = world.tiles[getTileIndex(building.x + dx, building.y + dy, world.width)];
        t.buildingId = null;
      }
    }

    world.buildings.splice(idx, 1);
    world.carts = world.carts.filter(
      (c) => c.ownerBuildingId !== id && c.targetBuildingId !== id,
    );
    world.citizens = world.citizens.filter(
      (c) => c.originBuildingId !== id && c.targetBuildingId !== id,
    );

    // Partial salvage refund
    world.denarii += Math.floor(def.costDenarii * 0.4);
    world.stock.wood += Math.floor(def.costWood * 0.5);
    world.stock.stone += Math.floor(def.costStone * 0.5);

    recomputeStaticStatuses(world);
    return true;
  }

  return false;
}

/** Re-sows a fallow wheat field, consuming one unit of wheat as seed. */
export function sowWheatFarm(world: WorldState, buildingId: number): boolean {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b || b.type !== 'wheat_farm' || b.sown) return false;
  if (world.stock.wheat < WHEAT_SOW_COST) return false;

  world.stock.wheat -= WHEAT_SOW_COST;
  world._consumedInWindow.wheat += WHEAT_SOW_COST;
  b.sown = true;
  b.harvestsLeft = WHEAT_HARVESTS_PER_SOWING;
  b.cycleProgress = 0;
  recomputeStaticStatuses(world);
  return true;
}

/**
 * A household first shrinks toward its reduced target while bread is missing.
 * If the shortage persists, residents start dying instead of stabilizing at
 * the target floor. Bread returning resets the hunger clock.
 */
function advanceStarvation(
  world: WorldState,
  b: PlacedBuilding,
  targetPop: number,
  declineRate: number,
  simDt: number,
): void {
  b.starvationTimer += simDt;

  if (b.residents > targetPop) {
    b.residents = Math.max(targetPop, b.residents - simDt * declineRate);
    return;
  }
  if (b.starvationTimer < STARVATION_GRACE_SECONDS) return;

  const wasAlive = b.residents > 0;
  b.residents = Math.max(0, b.residents - simDt * STARVATION_DEATH_RATE);
  if (!wasAlive) return;

  queueNotification(
    world,
    {
      kind: 'resource_shortage',
      severity: 'critical',
      title: 'Hambruna',
      message: 'La falta de Pan está matando a la población. Abastece el Mercado.',
      dedupeKey: 'starvation:famine',
      x: b.x,
      y: b.y,
      buildingId: b.id,
      durationMs: 6500,
    },
    45,
  );
}

export function canUpgradeHouse(world: WorldState, building: PlacedBuilding): PlacementCheckResult {
  if (building.type !== 'house_liberti') {
    return { ok: false, reason: 'Solo las Casas Plebeyas pueden ascender' };
  }
  if (!building.upgradeReady) {
    return { ok: false, reason: 'Cubre calzada, Fuente, Mercado y Pan primero' };
  }
  if (world.denarii < UPGRADE_CIVES_COST.denarii) {
    return { ok: false, reason: `Faltan ${UPGRADE_CIVES_COST.denarii} denarios` };
  }
  if (world.stock.wood < UPGRADE_CIVES_COST.wood) {
    return { ok: false, reason: `Falta ${UPGRADE_CIVES_COST.wood} madera` };
  }
  if (world.stock.stone < UPGRADE_CIVES_COST.stone) {
    return { ok: false, reason: `Falta ${UPGRADE_CIVES_COST.stone} piedra` };
  }
  return { ok: true };
}

export function upgradeHouse(world: WorldState, buildingId: number): boolean {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b) return false;
  const check = canUpgradeHouse(world, b);
  if (!check.ok) return false;

  world.denarii -= UPGRADE_CIVES_COST.denarii;
  world.stock.wood -= UPGRADE_CIVES_COST.wood;
  world.stock.stone -= UPGRADE_CIVES_COST.stone;

  b.type = 'house_cives';
  b.upgradeReady = false;
  b.residents = Math.max(b.residents, 10);
  recomputeStaticStatuses(world);
  return true;
}

export function upgradeAllReadyHouses(world: WorldState): number {
  let upgraded = 0;
  for (const b of world.buildings) {
    if (b.type === 'house_liberti' && b.upgradeReady) {
      if (upgradeHouse(world, b.id)) {
        upgraded += 1;
      } else {
        break;
      }
    }
  }
  return upgraded;
}

function distanceBetweenBuildings(a: PlacedBuilding, b: PlacedBuilding): number {
  const ca = getBuildingCenter(a);
  const cb = getBuildingCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

export function recomputeStaticStatuses(world: WorldState): void {
  for (const b of world.buildings) {
    const def = BUILDINGS[b.type];
    b.roadConnected = !def.needsRoad || getBuildingRoadEntries(world, b).length > 0;
  }

  const fountains = world.buildings.filter((b) => b.type === 'fountain' && b.roadConnected);
  const markets = world.buildings.filter((b) => b.type === 'market' && b.roadConnected);
  const temples = world.buildings.filter(
    (b) => (b.type === 'temple' || b.type === 'forum') && b.roadConnected,
  );
  const horreums = world.buildings.filter((b) => b.type === 'horreum' && b.roadConnected);

  let popLiberti = 0;
  let popCives = 0;
  let taxPerMin = 0;
  let upkeepPerMin = 0;
  let hasForum = false;

  for (const b of world.buildings) {
    const def = BUILDINGS[b.type];
    upkeepPerMin += def.upkeepPerMin;
    if (b.type === 'forum' && b.roadConnected) {
      hasForum = true;
    }

    const alerts: AlertReason[] = [];
    if (b.onFireTimer > 0) {
      alerts.push('on_fire');
    }
    if (def.needsRoad && !b.roadConnected) {
      alerts.push('no_road');
    }
    if (b.type === 'wheat_farm' && b.sown === false) {
      alerts.push('needs_seed');
    }
    if (EXTRACTION_TYPES.has(b.type) && (getExtractionReserve(world, b) ?? 0) <= 0) {
      alerts.push('depleted');
    }

    if (def.isHousing) {
      b.hasWater = fountains.some(
        (f) => distanceBetweenBuildings(b, f) <= (BUILDINGS.fountain.serviceRadius ?? 6),
      );
      const coveringMarkets = markets.filter(
        (m) => distanceBetweenBuildings(b, m) <= (BUILDINGS.market.serviceRadius ?? 8),
      );
      b.hasMarket = coveringMarkets.length > 0;
      b.hasTemple = temples.some(
        (t) => distanceBetweenBuildings(b, t) <= (BUILDINGS[t.type].serviceRadius ?? 9),
      );
      b.hasBread = coveringMarkets.some((m) => (m.marketStock.bread ?? 0) > 0.05);
      b.hasWine = coveringMarkets.some((m) => (m.marketStock.wine ?? 0) > 0.05);
      b.hasPottery = coveringMarkets.some((m) => (m.marketStock.pottery ?? 0) > 0.05);

      if (!b.hasWater) alerts.push('no_water');
      if (!b.hasMarket) alerts.push('no_market');
      else if (!b.hasBread) alerts.push('no_bread');

      if (b.type === 'house_liberti') {
        b.upgradeReady =
          b.onFireTimer <= 0 && b.roadConnected && b.hasWater && b.hasMarket && b.hasBread;
        const score =
          (b.roadConnected ? 0.25 : 0) +
          (b.hasWater ? 0.25 : 0) +
          (b.hasMarket ? 0.2 : 0) +
          (b.hasBread ? 0.3 : 0);
        b.satisfaction = score;
        popLiberti += Math.round(b.residents);
      } else {
        b.upgradeReady = false;
        if (b.hasMarket && !b.hasWine) alerts.push('no_wine');
        if (b.hasMarket && !b.hasPottery) alerts.push('no_pottery');
        if (!b.hasTemple) alerts.push('no_temple');
        const score =
          (b.roadConnected ? 0.15 : 0) +
          (b.hasWater ? 0.15 : 0) +
          (b.hasBread ? 0.2 : 0) +
          (b.hasWine ? 0.2 : 0) +
          (b.hasPottery ? 0.15 : 0) +
          (b.hasTemple ? 0.15 : 0);
        b.satisfaction = score;
        popCives += Math.round(b.residents);
      }

      const maxRes = def.maxResidents ?? 8;
      if (b.onFireTimer <= 0) {
        taxPerMin += (b.residents / maxRes) * (def.taxPerMin ?? 0) * (0.5 + 0.5 * b.satisfaction);
      }
    } else if (def.produces) {
      if (def.consumes && b.inputBuffer < 1) {
        alerts.push('no_input');
      }
      if (b.outputBuffer >= 6) {
        alerts.push('output_full');
      }
      if (b.roadConnected && horreums.length === 0 && !PRODUCER_NEXT_PROCESSOR[def.produces]) {
        alerts.push('no_warehouse');
      }
    }

    b.alerts = alerts;
  }

  world.populationLiberti = popLiberti;
  world.populationCives = popCives;
  world.totalPopulation = popLiberti + popCives;
  world.taxPerMin = taxPerMin;
  world.upkeepPerMin = upkeepPerMin;
  world.netDenariiPerMin = taxPerMin - upkeepPerMin;

  const forumGoalMet = !VICTORY_GOALS.requiresForum || hasForum;
  const incomeGoalMet = !VICTORY_GOALS.requiresPositiveIncome || world.netDenariiPerMin > 0;
  if (
    !world.victoryAchieved &&
    world.totalPopulation >= VICTORY_GOALS.targetPopulation &&
    world.populationCives >= VICTORY_GOALS.targetCives &&
    forumGoalMet &&
    incomeGoalMet
  ) {
    world.victoryAchieved = true;
  }

  if (world.denarii <= -300 && world.netDenariiPerMin < 0) {
    world.bankrupt = true;
  }
}

function countIncomingForTarget(
  world: WorldState,
  targetId: number,
  cargo: ResourceId,
): number {
  let sum = 0;
  for (const c of world.carts) {
    if (c.state === 'delivering' && c.targetBuildingId === targetId && c.cargo === cargo) {
      sum += c.amount;
    }
  }
  return sum;
}

function spawnCart(
  world: WorldState,
  owner: PlacedBuilding,
  target: PlacedBuilding,
  cargo: ResourceId,
  amount: number,
  path: Array<{ x: number; y: number }>,
): void {
  const start = path[0];
  world.carts.push({
    id: world.nextCartId++,
    ownerBuildingId: owner.id,
    targetBuildingId: target.id,
    cargo,
    amount,
    state: 'delivering',
    path,
    segmentIndex: 0,
    segmentProgress: 0,
    worldX: start.x,
    worldY: start.y,
  });
}

function dispatchProducerCarts(world: WorldState): void {
  const horreums = world.buildings.filter((b) => b.type === 'horreum' && b.roadConnected);
  const markets = world.buildings.filter((b) => b.type === 'market' && b.roadConnected);

  for (const b of world.buildings) {
    const def = BUILDINGS[b.type];
    if (!def.produces || !b.roadConnected || b.outputBuffer < 1) continue;

    // Limit 1 active cart per producer
    const activeOwned = world.carts.some((c) => c.ownerBuildingId === b.id);
    if (activeOwned) continue;

    const cargo = def.produces;
    const nextProcType = PRODUCER_NEXT_PROCESSOR[cargo];

    let chosenTarget: PlacedBuilding | null = null;
    let chosenPath: Array<{ x: number; y: number }> | null = null;

    // Priority 1: Direct delivery to nearest processor needing this input
    if (nextProcType) {
      const candidates = world.buildings
        .filter(
          (t) =>
            t.type === nextProcType &&
            t.roadConnected &&
            t.inputBuffer + countIncomingForTarget(world, t.id, cargo) < 5,
        )
        .sort((a, c) => distanceBetweenBuildings(b, a) - distanceBetweenBuildings(b, c));

      for (const cand of candidates) {
        const path = findRoadPathBetweenBuildings(world, b, cand);
        if (path) {
          chosenTarget = cand;
          chosenPath = path;
          break;
        }
      }
    }

    // Priority 2: Deliver to nearest connected Horreum
    if (!chosenTarget && horreums.length > 0) {
      const sortedHorreums = [...horreums].sort(
        (a, c) => distanceBetweenBuildings(b, a) - distanceBetweenBuildings(b, c),
      );
      for (const h of sortedHorreums) {
        const path = findRoadPathBetweenBuildings(world, b, h);
        if (path) {
          chosenTarget = h;
          chosenPath = path;
          break;
        }
      }
    }

    // Priority 3: Fallback direct delivery to Market if it's a consumer good and no Horreum reached
    if (!chosenTarget && CONSUMER_GOODS.includes(cargo) && markets.length > 0) {
      const sortedMarkets = [...markets].sort(
        (a, c) => (a.marketStock[cargo] ?? 0) - (c.marketStock[cargo] ?? 0),
      );
      for (const m of sortedMarkets) {
        const path = findRoadPathBetweenBuildings(world, b, m);
        if (path) {
          chosenTarget = m;
          chosenPath = path;
          break;
        }
      }
    }

    if (chosenTarget && chosenPath) {
      const sendAmount = Math.min(2, Math.floor(b.outputBuffer));
      b.outputBuffer -= sendAmount;
      spawnCart(world, b, chosenTarget, cargo, sendAmount, chosenPath);
    }
  }
}

function dispatchHorreumCarts(world: WorldState): void {
  const horreums = world.buildings.filter((b) => b.type === 'horreum' && b.roadConnected);
  const markets = world.buildings.filter((b) => b.type === 'market' && b.roadConnected);
  const processors = world.buildings.filter(
    (b) => BUILDINGS[b.type].consumes !== undefined && b.roadConnected,
  );

  for (const h of horreums) {
    const activeOwned = world.carts.filter((c) => c.ownerBuildingId === h.id).length;
    if (activeOwned >= 3) continue;

    let slotsLeft = 3 - activeOwned;

    // 1. Supply markets running low on Bread, Wine, or Pottery
    for (const m of markets) {
      if (slotsLeft <= 0) break;
      // Pick the good most in need at this market that Horreum has in stock
      const neededGoods = CONSUMER_GOODS.filter((good) => {
        const current = (m.marketStock[good] ?? 0) + countIncomingForTarget(world, m.id, good);
        return current < 10 && world.stock[good] >= 1;
      }).sort((g1, g2) => (m.marketStock[g1] ?? 0) - (m.marketStock[g2] ?? 0));

      if (neededGoods.length > 0) {
        const good = neededGoods[0];
        const path = findRoadPathBetweenBuildings(world, h, m);
        if (path) {
          const amount = Math.min(2, Math.floor(world.stock[good]));
          world.stock[good] -= amount;
          spawnCart(world, h, m, good, amount, path);
          slotsLeft -= 1;
        }
      }
    }

    // 2. Supply processors needing raw inputs stored in Horreum
    for (const proc of processors) {
      if (slotsLeft <= 0) break;
      const inputRes = BUILDINGS[proc.type].consumes;
      if (!inputRes) continue;
      const current = proc.inputBuffer + countIncomingForTarget(world, proc.id, inputRes);
      if (current >= 4 || world.stock[inputRes] < 1) continue;

      const path = findRoadPathBetweenBuildings(world, h, proc);
      if (path) {
        const amount = Math.min(2, Math.floor(world.stock[inputRes]));
        world.stock[inputRes] -= amount;
        spawnCart(world, h, proc, inputRes, amount, path);
        slotsLeft -= 1;
      }
    }
  }
}

function advanceCarts(world: WorldState, simDt: number): void {
  const speedTilesPerSec = 3.4;
  const remainingCarts: Cart[] = [];

  for (const cart of world.carts) {
    let distBudget = speedTilesPerSec * simDt;
    let finished = false;

    while (distBudget > 0 && !finished) {
      if (cart.segmentIndex >= cart.path.length - 1) {
        if (cart.state === 'delivering') {
          const target = world.buildings.find((b) => b.id === cart.targetBuildingId);
          if (target) {
            const targetDef = BUILDINGS[target.type];
            if (targetDef.consumes === cart.cargo) {
              target.inputBuffer = Math.min(8, target.inputBuffer + cart.amount);
            } else if (target.type === 'market') {
              target.marketStock[cart.cargo] = Math.min(
                20,
                (target.marketStock[cart.cargo] ?? 0) + cart.amount,
              );
            } else if (target.type === 'horreum') {
              world.stock[cart.cargo] += cart.amount;
            }
            world.totalCartsDelivered += 1;
          }
          cart.state = 'returning';
          cart.path = [...cart.path].reverse();
          cart.segmentIndex = 0;
          cart.segmentProgress = 0;
        } else {
          finished = true;
        }
        continue;
      }

      const p0 = cart.path[cart.segmentIndex];
      const p1 = cart.path[cart.segmentIndex + 1];
      const segLen = Math.max(0.001, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      const remainingSegDist = segLen * (1 - cart.segmentProgress);

      if (distBudget >= remainingSegDist) {
        distBudget -= remainingSegDist;
        cart.segmentIndex += 1;
        cart.segmentProgress = 0;
        cart.worldX = p1.x;
        cart.worldY = p1.y;
      } else {
        cart.segmentProgress += distBudget / segLen;
        distBudget = 0;
        cart.worldX = p0.x + (p1.x - p0.x) * cart.segmentProgress;
        cart.worldY = p0.y + (p1.y - p0.y) * cart.segmentProgress;
      }
    }

    if (!finished) {
      remainingCarts.push(cart);
    }
  }

  world.carts = remainingCarts;
}

const PEON_TUNICS = ['#a8643c', '#c79a58', '#7d6a52', '#91523a'];
const CIUDADANO_TUNICS = ['#e6dcc6', '#b84a39', '#6b4c7a', '#d4a84e'];

function nextCitizenRand(world: WorldState): number {
  const res = nextWeatherRandom(world.citizenRngState);
  world.citizenRngState = res.nextState;
  return res.value;
}

function spawnAndAdvanceCitizens(world: WorldState, simDt: number): void {
  const maxCitizens = Math.min(18, Math.max(3, Math.floor(world.totalPopulation / 4) + 1));
  world.citizenSpawnTimer -= simDt;

  if (world.citizenSpawnTimer <= 0 && world.citizens.length < maxCitizens) {
    world.citizenSpawnTimer = world.citizens.length < 2 ? 0.65 : 1.5;

    const producers = world.buildings.filter(
      (b) => b.roadConnected && (BUILDINGS[b.type].produces !== undefined || b.type === 'horreum'),
    );
    const markets = world.buildings.filter((b) => b.roadConnected && b.type === 'market');
    const civicOrHousing = world.buildings.filter(
      (b) =>
        b.roadConnected &&
        (BUILDINGS[b.type].isHousing ||
          b.type === 'fountain' ||
          b.type === 'temple' ||
          b.type === 'forum'),
    );

    const rRole = nextCitizenRand(world);
    let origin: PlacedBuilding | null = null;
    let target: PlacedBuilding | null = null;
    let role: CitizenRole = 'peon';

    // Prioritize producer <-> market routes for peones, or housing <-> market/civic for ciudadanos
    if (producers.length > 0 && markets.length > 0 && (rRole < 0.65 || civicOrHousing.length === 0)) {
      role = 'peon';
      const pIdx = Math.floor(nextCitizenRand(world) * producers.length) % producers.length;
      const mIdx = Math.floor(nextCitizenRand(world) * markets.length) % markets.length;
      origin = producers[pIdx];
      target = markets[mIdx];
    } else if (civicOrHousing.length > 0 && markets.length > 0) {
      role = 'ciudadano';
      const hIdx = Math.floor(nextCitizenRand(world) * civicOrHousing.length) % civicOrHousing.length;
      const mIdx = Math.floor(nextCitizenRand(world) * markets.length) % markets.length;
      origin = civicOrHousing[hIdx];
      target = markets[mIdx];
    } else if (producers.length >= 2) {
      role = 'peon';
      const i1 = Math.floor(nextCitizenRand(world) * producers.length) % producers.length;
      const i2 = (i1 + 1) % producers.length;
      origin = producers[i1];
      target = producers[i2];
    }

    if (origin && target && origin.id !== target.id) {
      const path = findRoadPathBetweenBuildings(world, origin, target);
      if (path && path.length >= 2) {
        const palette = role === 'peon' ? PEON_TUNICS : CIUDADANO_TUNICS;
        const colorIdx = Math.floor(nextCitizenRand(world) * palette.length) % palette.length;
        const speed = 1.35 + nextCitizenRand(world) * 0.45;
        const laneOffset = nextCitizenRand(world) < 0.5 ? -0.18 : 0.18;
        const start = path[0];
        world.citizens.push({
          id: world.nextCitizenId++,
          role,
          originBuildingId: origin.id,
          targetBuildingId: target.id,
          state: 'to_target',
          path,
          segmentIndex: 0,
          segmentProgress: 0,
          worldX: start.x,
          worldY: start.y,
          speed,
          tunicColor: palette[colorIdx],
          laneOffset,
          walkPhase: nextCitizenRand(world) * Math.PI * 2,
        });
      }
    }
  }

  const remaining: Citizen[] = [];
  for (const citizen of world.citizens) {
    let distBudget = citizen.speed * simDt;
    let finished = false;
    citizen.walkPhase += simDt * 9;

    while (distBudget > 0 && !finished) {
      if (citizen.segmentIndex >= citizen.path.length - 1) {
        if (citizen.state === 'to_target') {
          citizen.state = 'returning';
          citizen.path = [...citizen.path].reverse();
          citizen.segmentIndex = 0;
          citizen.segmentProgress = 0;
        } else {
          finished = true;
        }
        continue;
      }

      const p0 = citizen.path[citizen.segmentIndex];
      const p1 = citizen.path[citizen.segmentIndex + 1];
      const segLen = Math.max(0.001, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      const remainingSegDist = segLen * (1 - citizen.segmentProgress);

      if (distBudget >= remainingSegDist) {
        distBudget -= remainingSegDist;
        citizen.segmentIndex += 1;
        citizen.segmentProgress = 0;
        citizen.worldX = p1.x;
        citizen.worldY = p1.y;
      } else {
        citizen.segmentProgress += distBudget / segLen;
        distBudget = 0;
        citizen.worldX = p0.x + (p1.x - p0.x) * citizen.segmentProgress;
        citizen.worldY = p0.y + (p1.y - p0.y) * citizen.segmentProgress;
      }
    }

    if (!finished) {
      remaining.push(citizen);
    }
  }

  world.citizens = remaining;
}

/**
 * Replans every cart and citizen after the road network changed. Movers that can
 * no longer reach their destination are removed instead of crossing missing roads.
 */
export function rerouteLogistics(world: WorldState): void {
  world.carts = world.carts.filter((cart) => {
    const owner = world.buildings.find((b) => b.id === cart.ownerBuildingId);
    const target = world.buildings.find((b) => b.id === cart.targetBuildingId);
    if (!owner || !target) return false;
    const delivering = cart.state === 'delivering';
    const path = findRoadPathBetweenBuildings(
      world,
      delivering ? owner : target,
      delivering ? target : owner,
    );
    if (!path) return false;
    cart.path = path;
    cart.segmentIndex = 0;
    cart.segmentProgress = 0;
    cart.worldX = path[0].x;
    cart.worldY = path[0].y;
    return true;
  });

  world.citizens = world.citizens.filter((citizen) => {
    const origin = world.buildings.find((b) => b.id === citizen.originBuildingId);
    const target = world.buildings.find((b) => b.id === citizen.targetBuildingId);
    if (!origin || !target) return false;
    const going = citizen.state === 'to_target';
    const path = findRoadPathBetweenBuildings(
      world,
      going ? origin : target,
      going ? target : origin,
    );
    if (!path) return false;
    citizen.path = path;
    citizen.segmentIndex = 0;
    citizen.segmentProgress = 0;
    citizen.worldX = path[0].x;
    citizen.worldY = path[0].y;
    return true;
  });
}

export function stepSimulation(world: WorldState, simDt: number): void {
  if (simDt <= 0) return;

  world.elapsedSeconds += simDt;
  world.dayTime = normalizeDayTime(world.dayTime + simDt / DAY_CYCLE_SECONDS);
  advanceWeather(world, simDt);
  advanceFires(world, simDt);
  const farmMultiplier = getFarmEfficiencyMultiplier(world.weather.kind);
  const staffingRatio = getStaffingRatio(world);
  world._logisticsTimer += simDt;
  const logisticsDue = world._logisticsTimer >= 0.2;

  // 1. Update production cycles
  let statusDirty = false;
  for (const b of world.buildings) {
    const def = BUILDINGS[b.type];
    if (!def.produces || !def.cycleSeconds || !b.roadConnected || b.onFireTimer > 0) continue;
    if (b.outputBuffer >= 6) continue;
    if (def.consumes && b.inputBuffer < 1) continue;
    if (isProducerIdle(world, b)) continue;

    const isExtractor = EXTRACTION_TYPES.has(b.type);
    const depositTile = isExtractor
      ? world.tiles[getTileIndex(b.x, b.y, world.width)]
      : null;
    const isFarm = b.type === 'wheat_farm' || b.type === 'vineyard';
    const effMultiplier = isFarm ? farmMultiplier : 1;
    b.cycleProgress += (simDt * effMultiplier * staffingRatio) / def.cycleSeconds;
    if (b.cycleProgress >= 1) {
      b.cycleProgress -= 1;
      if (def.consumes) {
        b.inputBuffer -= 1;
        world._consumedInWindow[def.consumes] += 1;
      }
      const produced = def.batchOutput ?? 1;
      b.outputBuffer = Math.min(8, b.outputBuffer + produced);
      world._producedInWindow[def.produces] += produced;

      if (isExtractor && depositTile) {
        depositTile.reserve = Math.max(0, (depositTile.reserve ?? 0) - 1);
        if (depositTile.reserve <= 0) {
          // The exhausted node becomes barren so it cannot be farmed forever.
          depositTile.terrain = 'grass';
          depositTile.elevation = 0;
          // Also forces the cached terrain layer to repaint the new barren ground.
          world.fogVersion += 1;
          statusDirty = true;
        }
      }

      if (b.type === 'wheat_farm') {
        b.harvestsLeft = Math.max(0, (b.harvestsLeft ?? WHEAT_HARVESTS_PER_SOWING) - 1);
        if (b.harvestsLeft <= 0) {
          b.sown = false;
          b.cycleProgress = 0;
          statusDirty = true;
        }
      }
    }
  }

  if (statusDirty) recomputeStaticStatuses(world);

  // 2. Housing consumption & population adjustment
  const markets = world.buildings.filter((b) => b.type === 'market' && b.roadConnected);

  for (const b of world.buildings) {
    const def = BUILDINGS[b.type];
    if (!def.isHousing) continue;

    const coveringMarkets = markets.filter(
      (m) => distanceBetweenBuildings(b, m) <= (BUILDINGS.market.serviceRadius ?? 8),
    );

    const consumeFromMarkets = (good: ResourceId, ratePerMin: number) => {
      const amount = (ratePerMin * simDt) / 60;
      const supplier = coveringMarkets.find((m) => (m.marketStock[good] ?? 0) > 0.001);
      if (supplier) {
        const taken = Math.min(supplier.marketStock[good] ?? 0, amount);
        supplier.marketStock[good] = Math.max(0, (supplier.marketStock[good] ?? 0) - taken);
        world._consumedInWindow[good] += taken;
      }
    };

    const starving = !b.hasBread;

    if (b.type === 'house_liberti') {
      consumeFromMarkets('bread', 1.5);
      const targetPop =
        b.roadConnected && b.hasWater && b.hasMarket && b.hasBread
          ? 8
          : b.roadConnected && b.hasWater
            ? 4
            : 2;
      if (starving) {
        advanceStarvation(world, b, targetPop, 0.6, simDt);
      } else {
        b.starvationTimer = 0;
        if (b.residents < targetPop) {
          b.residents = Math.min(targetPop, b.residents + simDt * 0.9);
        } else if (b.residents > targetPop) {
          b.residents = Math.max(targetPop, b.residents - simDt * 0.6);
        }
      }
    } else {
      consumeFromMarkets('bread', 2.2);
      consumeFromMarkets('wine', 1.8);
      consumeFromMarkets('pottery', 1.8);
      let targetPop = 8;
      if (b.hasBread) targetPop += 3;
      if (b.hasWine) targetPop += 2;
      if (b.hasPottery) targetPop += 2;
      if (b.hasTemple) targetPop += 1;
      if (!b.roadConnected || !b.hasWater) targetPop = Math.min(targetPop, 6);
      if (starving) {
        advanceStarvation(world, b, targetPop, 0.7, simDt);
      } else {
        b.starvationTimer = 0;
        if (b.residents < targetPop) {
          b.residents = Math.min(targetPop, b.residents + simDt * 1.1);
        } else if (b.residents > targetPop) {
          b.residents = Math.max(targetPop, b.residents - simDt * 0.7);
        }
      }
    }
  }

  // 3. Recompute statuses, taxes, upkeep, and victory/bankruptcy (throttled to ~5 Hz)
  if (logisticsDue) {
    world._logisticsTimer = 0;
    recomputeStaticStatuses(world);
    if (world._lastReroutedRoadVersion !== world.roadVersion) {
      rerouteLogistics(world);
      world._lastReroutedRoadVersion = world.roadVersion;
    }
  }

  // 3b. Emit critical shortage or treasury notifications (throttled via dedupeKey)
  if (logisticsDue && world.elapsedSeconds >= 4) {
    const houseNoBread = world.buildings.find((b) => {
      const def = BUILDINGS[b.type];
      return def.isHousing && b.hasMarket && !b.hasBread;
    });
    if (houseNoBread) {
      queueNotification(
        world,
        {
          kind: 'resource_shortage',
          severity: 'critical',
          title: 'Escasez de Pan',
          message:
            'El Mercado se quedó sin Pan. Si no llega pronto, la población empezará a morir.',
          dedupeKey: 'shortage:bread',
          x: houseNoBread.x,
          y: houseNoBread.y,
          buildingId: houseNoBread.id,
          durationMs: 6500,
        },
        24,
      );
    }

    const workshopNoInput = world.buildings.find((b) => {
      const def = BUILDINGS[b.type];
      return Boolean(def.consumes && b.roadConnected && b.inputBuffer < 1);
    });
    if (workshopNoInput) {
      const def = BUILDINGS[workshopNoInput.type];
      const inputRes = def.consumes!;
      queueNotification(
        world,
        {
          kind: 'resource_shortage',
          severity: 'warning',
          title: `Falta ${RESOURCE_META[inputRes].label}`,
          message: `${def.name} detenida por falta de ${RESOURCE_META[inputRes].label}.`,
          dedupeKey: `shortage:input:${inputRes}`,
          x: workshopNoInput.x,
          y: workshopNoInput.y,
          buildingId: workshopNoInput.id,
          durationMs: 5500,
        },
        26,
      );
    }

    if (world.denarii < 60 && world.netDenariiPerMin < 0) {
      queueNotification(
        world,
        {
          kind: 'treasury_low',
          severity: 'critical',
          title: 'Tesoro crítico',
          message: `Quedan ${Math.max(0, Math.round(world.denarii))} denarios y el balance es negativo.`,
          dedupeKey: 'treasury:low',
          durationMs: 6500,
        },
        24,
      );
    }
  }

  // 4. Auto-upgrade houses if enabled
  if (logisticsDue && world.autoUpgradeHouses) {
    upgradeAllReadyHouses(world);
  }

  // 5. Apply Denarii flow
  world.denarii += (world.netDenariiPerMin * simDt) / 60;

  // 6. Dispatch (throttled) and move carts & road-walking citizens
  if (logisticsDue) {
    dispatchProducerCarts(world);
    dispatchHorreumCarts(world);
  }
  advanceCarts(world, simDt);
  spawnAndAdvanceCitizens(world, simDt);

  // 7. Rolling 12-second window for smooth per-minute balance ledger
  world._rateWindowTimer += simDt;
  if (world._rateWindowTimer >= 6) {
    const factor = 60 / world._rateWindowTimer;
    for (const res of RESOURCE_ORDER) {
      const sampleProd = world._producedInWindow[res] * factor;
      const sampleCons = world._consumedInWindow[res] * factor;
      world.prodPerMin[res] = world.prodPerMin[res] * 0.45 + sampleProd * 0.55;
      world.demandPerMin[res] = world.demandPerMin[res] * 0.45 + sampleCons * 0.55;
    }
    world._rateWindowTimer = 0;
    world._producedInWindow = emptyResourceRecord();
    world._consumedInWindow = emptyResourceRecord();
  }
}

export function buildHudSnapshot(
  world: WorldState,
  phase: HudSnapshot['phase'],
  speed: HudSnapshot['speed'],
  selectedBuildingId: number | null,
  selectedCartId: number | null,
): HudSnapshot {
  const balanceRows: ProductionBalanceRow[] = RESOURCE_ORDER.map((res) => {
    const prod = Math.round(world.prodPerMin[res] * 10) / 10;
    const demand = Math.round(world.demandPerMin[res] * 10) / 10;
    return {
      resource: res,
      label: RESOURCE_META[res].label,
      stock: Math.floor(world.stock[res]),
      prodPerMin: prod,
      demandPerMin: demand,
      netPerMin: Math.round((prod - demand) * 10) / 10,
    };
  });

  const alerts: AlertSummary[] = [];
  let hasForum = false;
  let readyUpgradeCount = 0;

  for (const b of world.buildings) {
    if (b.type === 'forum' && b.roadConnected) hasForum = true;
    if (b.type === 'house_liberti' && b.upgradeReady) readyUpgradeCount += 1;
    if (b.alerts.length > 0) {
      const primary = b.alerts[0];
      alerts.push({
        buildingId: b.id,
        buildingType: b.type,
        x: b.x,
        y: b.y,
        reason: primary,
        message: `${BUILDINGS[b.type].name}: ${ALERT_LABELS[primary] ?? primary}`,
      });
    }
  }

  const selectedBuilding =
    selectedBuildingId !== null
      ? world.buildings.find((b) => b.id === selectedBuildingId) ?? null
      : null;
  const selectedCart =
    selectedCartId !== null
      ? world.carts.find((c) => c.id === selectedCartId) ?? null
      : null;

  return {
    phase,
    speed,
    denarii: Math.round(world.denarii),
    netDenariiPerMin: Math.round(world.netDenariiPerMin),
    taxPerMin: Math.round(world.taxPerMin),
    upkeepPerMin: Math.round(world.upkeepPerMin),
    populationLiberti: world.populationLiberti,
    populationCives: world.populationCives,
    totalPopulation: world.totalPopulation,
    stock: { ...world.stock },
    balanceRows,
    alerts,
    activeCartCount: world.carts.length,
    totalCartsDelivered: world.totalCartsDelivered,
    elapsedSeconds: Math.floor(world.elapsedSeconds),
    hasForum,
    readyUpgradeCount,
    staffingRatio: getStaffingRatio(world),
    autoUpgradeHouses: world.autoUpgradeHouses,
    victoryAchieved: world.victoryAchieved,
    victoryDismissed: world.victoryDismissed,
    bankrupt: world.bankrupt,
    weatherKind: world.weather.kind,
    weatherIntensity: world.weather.intensity,
    farmEfficiencyMultiplier: getFarmEfficiencyMultiplier(world.weather.kind),
    dayTime: world.dayTime,
    selectedBuilding: selectedBuilding ? { ...selectedBuilding, marketStock: { ...selectedBuilding.marketStock }, alerts: [...selectedBuilding.alerts] } : null,
    selectedCart: selectedCart ? { ...selectedCart } : null,
    selectedReserve:
      selectedBuilding && EXTRACTION_TYPES.has(selectedBuilding.type)
        ? getExtractionReserve(world, selectedBuilding)
        : null,
  };
}
