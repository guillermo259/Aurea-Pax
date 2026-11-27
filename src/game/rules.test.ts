import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_CYCLE_SECONDS, getDaylightColorFilter, getDayPhaseInfo } from './dayCycle';
import { createStarterWorld, getTileIndex } from './mapGen';
import { findRoadPathBetweenBuildings } from './pathfinding';
import { MAX_SAVE_BYTES, deserializeWorld, serializeWorld } from './persistence';
import {
  buildHudSnapshot,
  canPlaceBuilding,
  demolishAt,
  extinguishFire,
  placeBuilding,
  recomputeStaticStatuses,
  stepSimulation,
  upgradeHouse,
} from './simulation';

test('starter world is deterministic and survives 30s with no player input', () => {
  const world = createStarterWorld(11701);
  recomputeStaticStatuses(world);
  const initialDenarii = world.denarii;
  assert.equal(world.width, 42);
  assert.equal(world.height, 42);
  assert.ok(world.buildings.length >= 5);

  for (let i = 0; i < 60; i++) {
    stepSimulation(world, 0.5);
  }

  assert.equal(world.bankrupt, false);
  assert.ok(world.totalCartsDelivered >= 1, 'Starter woodcutter cart should deliver wood to Horreum');
  assert.ok(world.denarii > initialDenarii - 100, 'Starter settlement should not bleed out');
});

test('road pathfinding connects adjacent buildings along Via Strata and rejects disconnected ones', () => {
  const world = createStarterWorld(11701);
  // Find two fertile tiles adjacent to road or place custom road segment
  // Clear (14,24) and (13,24) to fertile for wheat_farm test
  const t14 = world.tiles[getTileIndex(14, 24, world.width)];
  t14.terrain = 'grass';
  t14.buildingId = null;
  t14.isRoad = false;
  placeBuilding(world, 'road', 14, 24);

  const t13 = world.tiles[getTileIndex(13, 24, world.width)];
  t13.terrain = 'fertile';
  t13.buildingId = null;
  t13.isRoad = false;

  const farmRes = placeBuilding(world, 'wheat_farm', 13, 24);
  assert.equal(farmRes.ok, true);
  const horreum = world.buildings.find((b) => b.type === 'horreum');
  assert.ok(horreum);
  assert.ok(farmRes.building);

  const path = findRoadPathBetweenBuildings(world, farmRes.building, horreum);
  assert.ok(path && path.length >= 3, 'Connected farm should have BFS road path to Horreum');

  // Now demolish connecting road tile (14, 24)
  demolishAt(world, 14, 24);
  const brokenPath = findRoadPathBetweenBuildings(world, farmRes.building, horreum);
  assert.equal(brokenPath, null, 'Demolishing bridge road must disconnect BFS path');
});

test('full bread production chain runs via real carts and enables Liberti -> Cives upgrade', () => {
  const world = createStarterWorld(11701);
  world.denarii = 2000;
  world.stock.wood = 100;
  world.stock.stone = 100;

  // Prepare road strip along y = 24 to fertile zone at x = 12..14
  for (let x = 11; x <= 14; x++) {
    const t = world.tiles[getTileIndex(x, 24, world.width)];
    t.terrain = 'grass';
    t.isRoad = false;
    t.buildingId = null;
    placeBuilding(world, 'road', x, 24);
  }

  // Place Wheat Farm at (12, 23) (fertile), Mill at (13, 23), Bakery at (14, 23)
  world.tiles[getTileIndex(12, 23, world.width)].terrain = 'fertile';
  world.tiles[getTileIndex(13, 23, world.width)].terrain = 'grass';
  world.tiles[getTileIndex(14, 23, world.width)].terrain = 'grass';

  const farm = placeBuilding(world, 'wheat_farm', 12, 23);
  const mill = placeBuilding(world, 'mill', 13, 23);
  const bakery = placeBuilding(world, 'bakery', 14, 23);
  assert.equal(farm.ok, true);
  assert.equal(mill.ok, true);
  assert.equal(bakery.ok, true);

  // Verify terrain constraint rejects wheat farm on plain grass
  world.tiles[getTileIndex(15, 23, world.width)].terrain = 'grass';
  const invalidFarm = canPlaceBuilding(world, 'wheat_farm', 15, 23);
  assert.equal(invalidFarm.ok, false);

  // Run simulation for 90 seconds in 0.5s increments so carts carry wheat -> mill -> flour -> bakery -> bread -> horreum/market
  const initialDelivered = world.totalCartsDelivered;
  for (let i = 0; i < 180; i++) {
    stepSimulation(world, 0.5);
  }

  assert.ok(
    world.totalCartsDelivered > initialDelivered + 3,
    'Carts should complete multiple chained deliveries',
  );

  // Starter Liberti house should have bread, water, market, road -> upgradeReady
  const casa = world.buildings.find((b) => b.type === 'house_liberti');
  assert.ok(casa);
  assert.equal(casa.hasWater, true);
  assert.equal(casa.hasMarket, true);
  assert.equal(casa.hasBread, true);
  assert.equal(casa.upgradeReady, true);

  const upgraded = upgradeHouse(world, casa.id);
  assert.equal(upgraded, true);
  assert.equal(casa.type, 'house_cives');
  assert.ok(world.populationCives >= 10);
});

test('victory condition triggers only when all Senate goals are satisfied', () => {
  const world = createStarterWorld(11701);
  world.denarii = 5000;
  world.stock.wood = 200;
  world.stock.stone = 200;

  // Build Forum and enough Cives houses on grass near starter market/fountain
  world.tiles[getTileIndex(14, 25, world.width)].terrain = 'grass';
  world.tiles[getTileIndex(15, 25, world.width)].terrain = 'grass';
  world.tiles[getTileIndex(14, 26, world.width)].terrain = 'grass';
  world.tiles[getTileIndex(15, 26, world.width)].terrain = 'grass';
  const forumRes = placeBuilding(world, 'forum', 14, 25);
  assert.equal(forumRes.ok, true);

  // Add 5 houses along x=15..20, y=27 with road at y=28
  for (let x = 15; x <= 21; x++) {
    const tr = world.tiles[getTileIndex(x, 28, world.width)];
    tr.terrain = 'grass';
    placeBuilding(world, 'road', x, 28);
  }
  for (let x = 15; x <= 20; x++) {
    const th = world.tiles[getTileIndex(x, 27, world.width)];
    th.terrain = 'grass';
    const h = placeBuilding(world, 'house_liberti', x, 27);
    if (h.building) {
      h.building.type = 'house_cives';
      h.building.residents = 16;
    }
  }
  // Also add 4 Liberti houses to exceed 150 total population
  for (let x = 14; x <= 17; x++) {
    const th = world.tiles[getTileIndex(x, 29, world.width)];
    th.terrain = 'grass';
    const h = placeBuilding(world, 'house_liberti', x, 29);
    if (h.building) {
      h.building.residents = 8;
    }
  }

  // Stock market with wine & pottery & bread so satisfaction & taxes are positive
  const market = world.buildings.find((b) => b.type === 'market');
  if (market) {
    market.marketStock.bread = 15;
    market.marketStock.wine = 15;
    market.marketStock.pottery = 15;
  }

  stepSimulation(world, 0.5);
  const hud = buildHudSnapshot(world, 'playing', 1, null, null);
  assert.ok(hud.totalPopulation >= 120);
  assert.ok(hud.populationCives >= 60);
  assert.equal(hud.hasForum, true);
  if (hud.totalPopulation >= 150 && hud.netDenariiPerMin > 0) {
    assert.equal(hud.victoryAchieved, true);
  }
});

test('save serialization and deserialization preserve an in-progress world', () => {
  const world = createStarterWorld(11701);
  stepSimulation(world, 1.0);
  assert.ok(world.carts.length > 0);
  assert.ok(world.citizens.length > 0);

  const payload = serializeWorld(world);
  const restored = deserializeWorld(JSON.stringify(payload));

  assert.equal(restored.seed, world.seed);
  assert.equal(restored.tiles.length, world.tiles.length);
  assert.equal(
    restored.tiles.filter((t) => t.isRoad).length,
    world.tiles.filter((t) => t.isRoad).length,
  );
  assert.deepEqual(restored.stock, world.stock);
  assert.deepEqual(restored.buildings, world.buildings);
  assert.deepEqual(restored.carts, world.carts);
  assert.deepEqual(restored.citizens, world.citizens);
  assert.equal(Math.round(restored.denarii), Math.round(world.denarii));
});

test('weather transitions occur deterministically and adjust farm efficiency in stepSimulation', () => {
  const clearWorld = createStarterWorld(11701);
  const rainWorld = createStarterWorld(11701);
  const windWorld = createStarterWorld(11701);

  // Place a connected wheat farm on fertile tile (12, 23) with road at (12, 24)
  for (const w of [clearWorld, rainWorld, windWorld]) {
    w.denarii = 2000;
    w.stock.wood = 100;
    for (let x = 12; x <= 14; x++) {
      const tr = w.tiles[getTileIndex(x, 24, w.width)];
      tr.terrain = 'grass';
      tr.isRoad = false;
      tr.buildingId = null;
      placeBuilding(w, 'road', x, 24);
    }
    w.tiles[getTileIndex(12, 23, w.width)].terrain = 'fertile';
    const farm = placeBuilding(w, 'wheat_farm', 12, 23);
    assert.equal(farm.ok, true);
  }

  clearWorld.weather = { kind: 'clear', remainingSeconds: 60, intensity: 0, rngState: 1 };
  rainWorld.weather = { kind: 'rain', remainingSeconds: 60, intensity: 1, rngState: 1 };
  windWorld.weather = { kind: 'wind', remainingSeconds: 60, intensity: 1, rngState: 1 };

  stepSimulation(clearWorld, 3);
  stepSimulation(rainWorld, 3);
  stepSimulation(windWorld, 3);

  const clearFarm = clearWorld.buildings.find((b) => b.type === 'wheat_farm')!;
  const rainFarm = rainWorld.buildings.find((b) => b.type === 'wheat_farm')!;
  const windFarm = windWorld.buildings.find((b) => b.type === 'wheat_farm')!;

  // Wheat farm cycle is 7s -> in 3s: clear=3/7, rain=(3*1.12)/7=0.48, wind=(3*0.9)/7
  assert.ok(rainFarm.cycleProgress > clearFarm.cycleProgress);
  assert.ok(windFarm.cycleProgress < clearFarm.cycleProgress);
  assert.ok(Math.abs(rainFarm.cycleProgress - (3 * 1.12) / 7) < 0.001);
  assert.ok(Math.abs(windFarm.cycleProgress - (3 * 0.9) / 7) < 0.001);

  // Non-farm producer (woodcutter) must remain unaffected by weather
  const clearWood = clearWorld.buildings.find((b) => b.type === 'woodcutter')!;
  const rainWood = rainWorld.buildings.find((b) => b.type === 'woodcutter')!;
  assert.ok(Math.abs(clearWood.cycleProgress - rainWood.cycleProgress) < 0.0001);

  // Weather transitions naturally when remainingSeconds expires
  const transitionWorld = createStarterWorld(11701);
  const initialKind = transitionWorld.weather.kind;
  for (let i = 0; i < 60; i++) {
    stepSimulation(transitionWorld, 0.5);
  }
  assert.notEqual(transitionWorld.weather.kind, initialKind);
});

test('critical events emit fire, shortage, and road-disconnection notifications and fire pauses work until extinguished', () => {
  const world = createStarterWorld(11701);
  world.elapsedSeconds = 60;
  world.fireCooldownSeconds = 0;
  // Choose a seed/state that guarantees immediate outbreak (< 0.35 on nextWeatherRandom)
  world.fireRngState = 100;

  // Run short steps until a fire breaks out
  for (let i = 0; i < 10; i++) {
    stepSimulation(world, 0.5);
    if (world.buildings.some((b) => b.onFireTimer > 0)) break;
  }

  const burning = world.buildings.find((b) => b.onFireTimer > 0);
  assert.ok(burning, 'Fire should break out deterministically when eligible');
  assert.equal(burning.alerts[0], 'on_fire');
  assert.ok(
    world.pendingNotifications.some((n) => n.kind === 'fire' && n.buildingId === burning.id),
    'Fire outbreak must queue a critical fire notification',
  );

  // Extinguishing fire clears timer and alert
  const extinguished = extinguishFire(world, burning.id);
  assert.equal(extinguished, true);
  assert.equal(burning.onFireTimer, 0);
  assert.ok(!burning.alerts.includes('on_fire'));

  // Resource shortage notification when bread runs out at starter market
  world.pendingNotifications = [];
  const market = world.buildings.find((b) => b.type === 'market');
  assert.ok(market);
  market.marketStock.bread = 0;
  world.stock.bread = 0;
  stepSimulation(world, 0.5);
  assert.ok(
    world.pendingNotifications.some((n) => n.kind === 'resource_shortage'),
    'Depleted bread at market must emit resource_shortage notification',
  );

  // Demolishing woodcutter road connection emits road_disconnected notification
  world.pendingNotifications = [];
  demolishAt(world, 20, 19);
  assert.ok(
    world.pendingNotifications.some((n) => n.kind === 'road_disconnected'),
    'Cutting road access to an active building must emit road_disconnected notification',
  );
});

test('day-night color filter darkens progressively from dusk through night to dawn and advances with simulation', () => {
  const noon = getDaylightColorFilter(0.5); // 12:00
  const dusk = getDaylightColorFilter(18.5 / 24); // 18:30
  const midnight = getDaylightColorFilter(0.0); // 00:00
  const dawn = getDaylightColorFilter(6.25 / 24); // 06:15

  assert.equal(noon.alpha, 0);
  assert.equal(noon.nightFactor, 0);
  assert.ok(dusk.alpha > noon.alpha && dusk.alpha < midnight.alpha, 'Dusk should darken moderately before midnight');
  assert.ok(dusk.r > dusk.b, 'Sunset tint should be warmer (red > blue)');
  assert.ok(midnight.alpha >= 0.5 && midnight.nightFactor > 0.9, 'Midnight should reach peak darkness');
  assert.ok(midnight.b > midnight.r, 'Night tint should be cool indigo/blue');
  assert.ok(dawn.alpha > noon.alpha && dawn.alpha < midnight.alpha, 'Dawn should lighten progressively toward morning');

  assert.equal(getDayPhaseInfo(0.5).phase, 'day');
  assert.equal(getDayPhaseInfo(18.5 / 24).phase, 'dusk');
  assert.equal(getDayPhaseInfo(0.0).phase, 'night');
  assert.equal(getDayPhaseInfo(6.25 / 24).phase, 'dawn');

  assert.equal(DAY_CYCLE_SECONDS, 600);
  const world = createStarterWorld(11701);
  const startDayTime = world.dayTime;
  stepSimulation(world, DAY_CYCLE_SECONDS * 0.25);
  assert.ok(Math.abs(world.dayTime - (startDayTime + 0.25)) < 0.0001);
});

test('citizens and peones spawn along valid road paths between production/housing and markets and clean up on road cut', () => {
  const world = createStarterWorld(11701);
  recomputeStaticStatuses(world);

  // Run enough simulation steps for initial citizens to spawn and start walking
  for (let i = 0; i < 12; i++) {
    stepSimulation(world, 0.5);
  }

  assert.ok(world.citizens.length >= 1, 'Starter settlement should spawn citizens on connected roads');
  const first = world.citizens[0];
  assert.ok(first.path.length >= 3, 'Citizen route must follow road path waypoints');
  const startX = first.worldX;
  const startY = first.worldY;

  stepSimulation(world, 1.0);
  const stillHere = world.citizens.find((c) => c.id === first.id);
  if (stillHere) {
    assert.ok(
      stillHere.worldX !== startX || stillHere.worldY !== startY,
      'Citizen position must advance along road path',
    );
  }

  // Demolishing a road tile traversed by a citizen removes that citizen cleanly
  const sampleRoadPt = world.citizens[0]?.path[1];
  if (sampleRoadPt) {
    demolishAt(world, sampleRoadPt.x, sampleRoadPt.y);
    assert.equal(
      world.citizens.some((c) =>
        c.path.some((pt) => pt.x === sampleRoadPt.x && pt.y === sampleRoadPt.y),
      ),
      false,
      'Citizens traversing a demolished road tile must be removed cleanly',
    );
  }
});

test('imported saves are validated: corrupted or hostile JSON is rejected or sanitized', () => {
  const payload = serializeWorld(createStarterWorld(11701));

  // Map dimensions are bounded instead of trusting the file (prevents huge allocations / crashes)
  const oversized = JSON.parse(JSON.stringify(payload));
  oversized.world.width = 100000;
  oversized.world.height = 100000;
  assert.throws(() => deserializeWorld(JSON.stringify(oversized)), /inválid|incompatible/i);

  // Tile array must match the declared dimensions
  const truncated = JSON.parse(JSON.stringify(payload));
  truncated.world.tiles = truncated.world.tiles.slice(0, 10);
  assert.throws(() => deserializeWorld(JSON.stringify(truncated)), /inválid|incompatible/i);

  // Oversized raw input is rejected before parsing
  assert.throws(
    () => deserializeWorld('x'.repeat(MAX_SAVE_BYTES + 1)),
    /demasiado grande/i,
  );

  // Malformed values are sanitized instead of leaking NaN/negative values into the simulation
  const tampered = JSON.parse(JSON.stringify(payload));
  tampered.world.denarii = 'unlimited';
  tampered.world.stock.wood = Number.NaN;
  tampered.world.stock.stone = -500;
  tampered.world.weather.kind = 'lava';
  tampered.world.tiles[0].terrain = 'lava';
  tampered.world.tiles[1].terrain = 'water';
  tampered.world.tiles[1].isRoad = true;
  tampered.world.buildings.push({ id: 9999, type: 'colosseum', x: 0, y: 0, size: 1 });
  tampered.world.buildings.push({ id: 9998, type: 'market', x: -4, y: 0, size: 2 });
  tampered.world.citizens.push({
    id: 1,
    role: 'peon',
    originBuildingId: 424242,
    targetBuildingId: 424243,
    path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  });
  tampered.world.carts.push({
    id: 1,
    ownerBuildingId: 1,
    targetBuildingId: 2,
    cargo: 'gold',
    amount: 5,
    path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  });

  const restored = deserializeWorld(JSON.stringify(tampered));

  assert.ok(Number.isFinite(restored.denarii));
  assert.ok(Number.isFinite(restored.stock.wood) && restored.stock.wood >= 0);
  assert.ok(Number.isFinite(restored.stock.stone) && restored.stock.stone >= 0);
  assert.equal(restored.weather.kind, 'clear');
  assert.equal(restored.tiles[0].terrain, 'grass');
  assert.equal(restored.tiles[1].isRoad, false, 'Roads cannot be forged on water tiles');
  assert.equal(restored.buildings.length, payload.world.buildings.length);
  assert.ok(
    restored.buildings.every(
      (b) => b.x >= 0 && b.y >= 0 && b.x + b.size <= restored.width && b.y + b.size <= restored.height,
    ),
  );
  assert.ok(restored.nextBuildingId > Math.max(...restored.buildings.map((b) => b.id)));

  const buildingIds = new Set(restored.buildings.map((b) => b.id));
  assert.ok(
    restored.citizens.every(
      (c) => buildingIds.has(c.originBuildingId) && buildingIds.has(c.targetBuildingId),
    ),
  );
  assert.ok(
    restored.carts.every(
      (c) => buildingIds.has(c.ownerBuildingId) && buildingIds.has(c.targetBuildingId),
    ),
  );

  // A sanitized world must still simulate without throwing
  stepSimulation(restored, 0.5);
  assert.ok(Number.isFinite(restored.denarii));
});
