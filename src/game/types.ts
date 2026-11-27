export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type WeatherKind = 'clear' | 'rain' | 'wind';

export interface WeatherState {
  kind: WeatherKind;
  remainingSeconds: number;
  intensity: number; // 0..1 smooth fade
  rngState: number;
}

export type TerrainKind = 'water' | 'sand' | 'grass' | 'fertile' | 'forest' | 'stone' | 'clay';

export type ResourceId =
  | 'wood'
  | 'stone'
  | 'wheat'
  | 'flour'
  | 'bread'
  | 'grapes'
  | 'wine'
  | 'clay'
  | 'pottery';

export type BuildingType =
  | 'road'
  | 'house_liberti'
  | 'house_cives'
  | 'horreum'
  | 'fountain'
  | 'market'
  | 'temple'
  | 'forum'
  | 'woodcutter'
  | 'stone_quarry'
  | 'clay_pit'
  | 'wheat_farm'
  | 'mill'
  | 'bakery'
  | 'vineyard'
  | 'winery'
  | 'pottery';

export type ToolMode =
  | { kind: 'inspect' }
  | { kind: 'demolish' }
  | { kind: 'upgrade' }
  | { kind: 'build'; buildingType: BuildingType };

export type BuildCategory = 'logistics' | 'civic' | 'food' | 'industry';

export type CitizenTier = 'liberti' | 'cives';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  latinSubtitle: string;
  category: BuildCategory;
  size: 1 | 2;
  costDenarii: number;
  costWood: number;
  costStone: number;
  upkeepPerMin: number;
  requiredTerrain?: TerrainKind;
  serviceRadius?: number;
  produces?: ResourceId;
  consumes?: ResourceId;
  cycleSeconds?: number;
  batchOutput?: number;
  workerNeed?: number;
  isHousing?: boolean;
  tier?: CitizenTier;
  maxResidents?: number;
  taxPerMin?: number;
  needsRoad: boolean;
  description: string;
  hotkey?: string;
}

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainKind;
  elevation: number;
  buildingId: number | null;
  isRoad: boolean;
  variant: number;
}

export type AlertReason =
  | 'on_fire'
  | 'no_road'
  | 'no_input'
  | 'output_full'
  | 'no_warehouse'
  | 'no_water'
  | 'no_market'
  | 'no_bread'
  | 'no_wine'
  | 'no_pottery'
  | 'no_temple';

export type NotificationKind =
  | 'fire'
  | 'resource_shortage'
  | 'treasury_low'
  | 'road_disconnected'
  | 'save_recovered';

export type NotificationSeverity = 'critical' | 'warning';

export interface PendingGameNotification {
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  dedupeKey: string;
  x?: number;
  y?: number;
  buildingId?: number;
  durationMs?: number;
}

export interface ToastNotification extends PendingGameNotification {
  id: number;
  createdAt: number;
}

export interface PlacedBuilding {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  size: 1 | 2;
  roadConnected: boolean;
  cycleProgress: number; // 0..1
  inputBuffer: number;
  outputBuffer: number;
  // Market & Horreum local/distributed buffer
  marketStock: Partial<Record<ResourceId, number>>;
  // Housing fields
  residents: number;
  satisfaction: number; // 0..1
  hasWater: boolean;
  hasMarket: boolean;
  hasTemple: boolean;
  hasBread: boolean;
  hasWine: boolean;
  hasPottery: boolean;
  upgradeReady: boolean;
  onFireTimer: number;
  alerts: AlertReason[];
  // Animation phase
  animSeed: number;
}

export type CartCargoType = ResourceId;

export interface Cart {
  id: number;
  ownerBuildingId: number;
  targetBuildingId: number;
  cargo: CartCargoType;
  amount: number;
  /** 'delivering' goes from origin -> target; 'returning' goes target -> origin */
  state: 'delivering' | 'returning';
  /** Sequence of grid coordinates along roads + endpoints */
  path: Array<{ x: number; y: number }>;
  /** Index of current segment start in path */
  segmentIndex: number;
  /** Progress 0..1 along current segment */
  segmentProgress: number;
  /** World float position for smooth rendering */
  worldX: number;
  worldY: number;
}

export type CitizenRole = 'peon' | 'ciudadano';

export interface Citizen {
  id: number;
  role: CitizenRole;
  originBuildingId: number;
  targetBuildingId: number;
  state: 'to_target' | 'returning';
  path: Array<{ x: number; y: number }>;
  segmentIndex: number;
  segmentProgress: number;
  worldX: number;
  worldY: number;
  speed: number;
  tunicColor: string;
  laneOffset: number;
  walkPhase: number;
}

export interface ProductionBalanceRow {
  resource: ResourceId;
  label: string;
  stock: number;
  prodPerMin: number;
  demandPerMin: number;
  netPerMin: number;
}

export interface AlertSummary {
  buildingId: number;
  buildingType: BuildingType;
  x: number;
  y: number;
  reason: AlertReason;
  message: string;
}

export interface VictoryGoals {
  targetPopulation: number;
  targetCives: number;
  requiresForum: boolean;
  requiresPositiveIncome: boolean;
}

export interface WorldState {
  seed: number;
  width: number;
  height: number;
  tiles: Tile[];
  buildings: PlacedBuilding[];
  carts: Cart[];
  citizens: Citizen[];
  nextBuildingId: number;
  nextCartId: number;
  nextCitizenId: number;
  roadVersion: number;
  elapsedSeconds: number;
  denarii: number;
  stock: Record<ResourceId, number>;
  /** Rolling per-minute rates smoothed over recent intervals */
  prodPerMin: Record<ResourceId, number>;
  demandPerMin: Record<ResourceId, number>;
  taxPerMin: number;
  upkeepPerMin: number;
  netDenariiPerMin: number;
  populationLiberti: number;
  populationCives: number;
  totalPopulation: number;
  totalCartsDelivered: number;
  autoUpgradeHouses: boolean;
  victoryAchieved: boolean;
  victoryDismissed: boolean;
  bankrupt: boolean;
  weather: WeatherState;
  dayTime: number; // 0..1 normalized (0 = 00:00, 0.5 = 12:00)
  fireRngState: number;
  fireCooldownSeconds: number;
  citizenSpawnTimer: number;
  citizenRngState: number;
  pendingNotifications: PendingGameNotification[];
  /** Internal accumulators for rate tracking & notification throttling */
  _rateWindowTimer: number;
  /** Throttles logistics recalculation and replans movers after road edits */
  _logisticsTimer: number;
  _lastReroutedRoadVersion: number;
  _producedInWindow: Record<ResourceId, number>;
  _consumedInWindow: Record<ResourceId, number>;
  _notificationCooldowns: Record<string, number>;
}

export interface HudSnapshot {
  phase: GamePhase;
  speed: 0 | 1 | 2 | 3;
  denarii: number;
  netDenariiPerMin: number;
  taxPerMin: number;
  upkeepPerMin: number;
  populationLiberti: number;
  populationCives: number;
  totalPopulation: number;
  stock: Record<ResourceId, number>;
  balanceRows: ProductionBalanceRow[];
  alerts: AlertSummary[];
  activeCartCount: number;
  totalCartsDelivered: number;
  elapsedSeconds: number;
  hasForum: boolean;
  readyUpgradeCount: number;
  staffingRatio: number;
  autoUpgradeHouses: boolean;
  victoryAchieved: boolean;
  victoryDismissed: boolean;
  bankrupt: boolean;
  weatherKind: WeatherKind;
  weatherIntensity: number;
  farmEfficiencyMultiplier: number;
  dayTime: number;
  selectedBuilding: PlacedBuilding | null;
  selectedCart: Cart | null;
}

export interface SavePayload {
  version: number;
  savedAt: string;
  world: Omit<
    WorldState,
    | '_rateWindowTimer'
    | '_producedInWindow'
    | '_consumedInWindow'
    | 'pendingNotifications'
    | '_notificationCooldowns'
    | '_logisticsTimer'
    | '_lastReroutedRoadVersion'
  >;
}
