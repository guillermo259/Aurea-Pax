import React from 'react';
import {
  AmphoraIcon,
  ArrowUp02Icon,
  Bread01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChurchIcon,
  Clock01Icon,
  CloudFogIcon,
  Coins01Icon,
  DrinkIcon,
  FireIcon,
  Hammer01Icon,
  Layers01Icon,
  Road01Icon,
  SproutIcon,
  Store01Icon,
  SunCloud01Icon,
  UserGroupIcon,
  WaterPumpIcon,
} from '@hugeicons/core-free-icons';
import {
  ALERT_HINTS,
  ALERT_LABELS,
  BUILDINGS,
  RESOURCE_META,
  WHEAT_HARVESTS_PER_SOWING,
  WHEAT_SOW_COST,
} from '../game/catalog';
import { EXTINGUISH_COST, UPGRADE_CIVES_COST } from '../game/simulation';
import { Cart, HudSnapshot, PlacedBuilding, ResourceId } from '../game/types';
import { HugeIcon, type IconData } from './HugeIcon';
import { BuildingIcon, ResourceIcon } from './RomanIcons';

const StatRow: React.FC<{
  icon: IconData;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}> = ({ icon, label, value, valueClassName = '' }) => (
  <div className="flex items-center justify-between gap-2" title={label}>
    <span className="flex items-center gap-1.5 text-[#b9aa94]">
      <HugeIcon icon={icon} size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
    <span className={`font-mono-num ${valueClassName}`}>{value}</span>
  </div>
);

const ResourceStatRow: React.FC<{
  resource: ResourceId;
  label: string;
  value: React.ReactNode;
}> = ({ resource, label, value }) => (
  <div className="flex items-center justify-between gap-2" title={label}>
    <span className="flex items-center gap-1.5 text-[#b9aa94]">
      <ResourceIcon resource={resource} className="w-3.5 h-3.5" />
      <span>{label}</span>
    </span>
    <span className="font-mono-num">{value}</span>
  </div>
);

interface InspectorPanelProps {
  hud: HudSnapshot;
  building: PlacedBuilding | null;
  cart: Cart | null;
  allBuildings: PlacedBuilding[];
  onClose: () => void;
  onUpgradeBuilding: (id: number) => void;
  onExtinguishFire: (id: number) => void;
  onSowWheat: (id: number) => void;
  onDemolishBuilding: (b: PlacedBuilding) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  hud,
  building,
  cart,
  allBuildings,
  onClose,
  onUpgradeBuilding,
  onExtinguishFire,
  onSowWheat,
  onDemolishBuilding,
}) => {
  if (!building && !cart) return null;

  if (cart) {
    const origin = allBuildings.find((b) => b.id === cart.ownerBuildingId);
    const target = allBuildings.find((b) => b.id === cart.targetBuildingId);
    return (
      <aside className="inspector roman-scroll fixed right-3 top-28 z-20 w-72 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/45 shadow-2xl p-4 text-sm text-[#f4ede0]">
        <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-[#b78e4a]/25">
          <div>
            <h3 className="font-display text-base font-bold text-[#f4ca64]">
              Carreta #{cart.id}
            </h3>
            <p className="text-xs text-[#b9aa94]">
              {cart.state === 'delivering' ? 'Entregando mercancía' : 'Regresando vacía'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar inspector"
            onClick={onClose}
            className="p-1 text-[#b9aa94] hover:text-white cursor-pointer"
          >
            <HugeIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#b9aa94]">Carga</span>
            <span className="flex items-center gap-1.5 font-medium">
              <ResourceIcon resource={cart.cargo} className="w-4 h-4" />
              {RESOURCE_META[cart.cargo].label} ({cart.amount})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#b9aa94]">Origen</span>
            <span>{origin ? BUILDINGS[origin.type].name : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#b9aa94]">Destino</span>
            <span>{target ? BUILDINGS[target.type].name : '—'}</span>
          </div>
        </div>
      </aside>
    );
  }

  if (!building) return null;
  const def = BUILDINGS[building.type];
  const canAffordFireBrigade = hud.denarii >= EXTINGUISH_COST;
  const canUpgradeAfford =
    building.type === 'house_liberti' &&
    building.upgradeReady &&
    hud.denarii >= UPGRADE_CIVES_COST.denarii &&
    hud.stock.wood >= UPGRADE_CIVES_COST.wood &&
    hud.stock.stone >= UPGRADE_CIVES_COST.stone;

  const housingNeeds: Array<{ icon: IconData; label: string; short: string; ok: boolean }> = [
    { icon: WaterPumpIcon, label: 'Agua (Fuente)', short: 'Agua', ok: building.hasWater },
    { icon: Store01Icon, label: 'Mercado', short: 'Mercado', ok: building.hasMarket },
    { icon: Bread01Icon, label: 'Pan', short: 'Pan', ok: building.hasBread },
    ...(building.type === 'house_cives'
      ? [
          { icon: DrinkIcon, label: 'Vino', short: 'Vino', ok: building.hasWine },
          { icon: AmphoraIcon, label: 'Cerámica', short: 'Cerámica', ok: building.hasPottery },
          { icon: ChurchIcon, label: 'Templo / Foro', short: 'Templo', ok: building.hasTemple },
        ]
      : []),
  ];

  return (
    <aside className="inspector roman-scroll fixed right-3 top-28 z-20 w-80 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/45 shadow-2xl p-4 text-sm text-[#f4ede0]">
      <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-[#b78e4a]/25">
        <div className="flex items-center gap-2.5">
          <BuildingIcon type={building.type} className="w-8 h-8 shrink-0" />
          <div>
            <h3 className="font-display text-base font-bold text-[#f4ca64] leading-tight">
              {def.name}
            </h3>
            <p className="text-xs text-[#b9aa94]">{def.latinSubtitle}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar inspector"
          onClick={onClose}
          className="p-1 text-[#b9aa94] hover:text-white cursor-pointer"
        >
          <HugeIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-[#d6c9b4] leading-relaxed mb-3">{def.description}</p>

      <div className="space-y-2 text-xs">
        <StatRow
          icon={Road01Icon}
          label="Calzada"
          value={building.roadConnected ? 'Conectada' : 'Sin conexión'}
          valueClassName={building.roadConnected ? 'text-[#89c983]' : 'text-[#f08b78]'}
        />

        {def.upkeepPerMin > 0 && (
          <StatRow
            icon={Coins01Icon}
            label="Mantenimiento"
            value={`-${def.upkeepPerMin}/m`}
            valueClassName="text-[#e57c6f]"
          />
        )}

        {/* Producer details */}
        {def.produces && (
          <>
            {def.consumes && (
              <ResourceStatRow
                resource={def.consumes}
                label={`Insumo: ${RESOURCE_META[def.consumes].label}`}
                value={`${building.inputBuffer}/8`}
              />
            )}
            <ResourceStatRow
              resource={def.produces}
              label={`Salida: ${RESOURCE_META[def.produces].label}`}
              value={`${building.outputBuffer}/8`}
            />
            <StatRow
              icon={UserGroupIcon}
              label="Mano de obra"
              value={`${Math.round(hud.staffingRatio * 100)}%`}
              valueClassName={
                hud.staffingRatio < 1 ? 'text-[#e5986f]' : 'text-[#89c983]'
              }
            />
            {(building.type === 'wheat_farm' || building.type === 'vineyard') && (
              <StatRow
                icon={SunCloud01Icon}
                label="Rendimiento climático"
                value={`${Math.round(hud.farmEfficiencyMultiplier * 100)}%`}
                valueClassName={
                  hud.farmEfficiencyMultiplier > 1
                    ? 'text-[#89c983]'
                    : hud.farmEfficiencyMultiplier < 1
                      ? 'text-[#e5986f]'
                      : 'text-[#d6c9b4]'
                }
              />
            )}
            <div title="Ciclo de trabajo">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-[#b9aa94]">
                  <HugeIcon icon={Clock01Icon} size={14} aria-hidden="true" />
                  <span>Ciclo de trabajo</span>
                </span>
                <span className="font-mono-num">{Math.round(building.cycleProgress * 100)}%</span>
              </div>
              <progress className="roman-progress" aria-label="Ciclo de trabajo" max={1} value={building.cycleProgress} />
            </div>
          </>
        )}

        {/* Finite extraction deposit */}
        {hud.selectedReserve !== null && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1.5">
            <StatRow
              icon={Layers01Icon}
              label="Reserva del yacimiento"
              value={`${hud.selectedReserve} uds.`}
              valueClassName={
                hud.selectedReserve < 40 ? 'text-[#e5986f] font-semibold' : 'text-[#e6dccb] font-semibold'
              }
            />
            <p className="text-[11px] leading-relaxed text-[#b9aa94]">
              Al agotarse, el filón se vuelve terreno baldío. Tendrás que explorar y llevar una
              calzada hasta otro bosque, cantera o veta.
            </p>
          </div>
        )}

        {/* Wheat sowing cycle */}
        {building.type === 'wheat_farm' && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1.5">
            <StatRow
              icon={SproutIcon}
              label="Siembra"
              value={
                building.sown
                  ? `Sembrado · ${building.harvestsLeft ?? 0} cosechas`
                  : 'En barbecho'
              }
              valueClassName={building.sown ? 'text-[#89c983]' : 'text-[#f08b78]'}
            />
            <button
              type="button"
              disabled={Boolean(building.sown) || hud.stock.wheat < WHEAT_SOW_COST}
              onClick={() => onSowWheat(building.id)}
              className={`w-full py-2 px-3 rounded text-xs font-semibold transition-colors ${
                !building.sown && hud.stock.wheat >= WHEAT_SOW_COST
                  ? 'bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer'
                  : 'bg-[#2a231c] text-[#8d7f6b] cursor-not-allowed'
              }`}
            >
              {building.sown
                ? 'Campo ya sembrado'
                : `Sembrar (${WHEAT_SOW_COST} Trigo) · ${WHEAT_HARVESTS_PER_SOWING} cosechas`}
            </button>
            {!building.sown && hud.stock.wheat < WHEAT_SOW_COST && (
              <p className="text-[11px] text-[#e5986f]">
                No queda Trigo en el Horreum. Reserva una cosecha para poder sembrar.
              </p>
            )}
          </div>
        )}

        {/* Watchtower reveal radius */}
        {def.revealRadius !== undefined && (
          <StatRow
            icon={CloudFogIcon}
            label="Despeja niebla"
            value={`radio ${def.revealRadius}`}
            valueClassName="text-[#e6dccb]"
          />
        )}

        {/* Market inventory */}
        {building.type === 'market' && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[#d4a656]" title="Existencias del Mercado">
              <HugeIcon icon={Store01Icon} size={14} aria-hidden="true" />
              <span>Existencias del Mercado</span>
            </div>
            {(['bread', 'wine', 'pottery'] as ResourceId[]).map((good) => (
              <div
                key={good}
                className="flex items-center justify-between"
                title={RESOURCE_META[good].label}
              >
                <span className="flex items-center gap-1.5 text-[#cfc3b0]">
                  <ResourceIcon resource={good} className="w-3.5 h-3.5" />
                  <span>{RESOURCE_META[good].label}</span>
                </span>
                <span className="font-mono-num">
                  {(building.marketStock[good] ?? 0).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Housing needs */}
        {def.isHousing && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1.5">
            <StatRow
              icon={UserGroupIcon}
              label="Habitantes"
              value={`${Math.round(building.residents)} / ${def.maxResidents}`}
              valueClassName="font-semibold"
            />
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {housingNeeds.map((need) => (
                <div
                  key={need.label}
                  title={`${need.label}: ${need.ok ? 'cubierta' : 'pendiente'}`}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded border ${
                    need.ok
                      ? 'bg-[#26321f] text-[#89c983] border-[#669c5b]/35'
                      : 'bg-[#351f1c] text-[#f08b78] border-[#c64635]/35'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <HugeIcon icon={need.icon} size={15} aria-hidden="true" />
                    <HugeIcon
                      icon={need.ok ? CheckmarkCircle02Icon : Cancel01Icon}
                      size={11}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-[10px] leading-none opacity-90">{need.short}</span>
                  <span className="sr-only">
                    {need.label}: {need.ok ? 'cubierta' : 'pendiente'}
                  </span>
                </div>
              ))}
            </div>

            {building.type === 'house_liberti' && (
              <button
                type="button"
                disabled={!canUpgradeAfford}
                title={`Ascender a Insula: ${UPGRADE_CIVES_COST.denarii} denarios, ${UPGRADE_CIVES_COST.wood} madera y ${UPGRADE_CIVES_COST.stone} piedra`}
                aria-label={`Ascender a Insula: ${UPGRADE_CIVES_COST.denarii} denarios, ${UPGRADE_CIVES_COST.wood} madera y ${UPGRADE_CIVES_COST.stone} piedra`}
                onClick={() => onUpgradeBuilding(building.id)}
                className={`mt-2 w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  canUpgradeAfford
                    ? 'bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer'
                    : 'bg-[#2a231c] text-[#8d7f6b] cursor-not-allowed'
                }`}
              >
                <HugeIcon icon={ArrowUp02Icon} size={15} aria-hidden="true" />
                <span>Insula</span>
                <span className="opacity-85">
                  {UPGRADE_CIVES_COST.denarii}d · {UPGRADE_CIVES_COST.wood}m ·{' '}
                  {UPGRADE_CIVES_COST.stone}p
                </span>
              </button>
            )}
          </div>
        )}

        {/* Active alerts */}
        {building.alerts.length > 0 && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1">
            {building.alerts.map((al) => (
              <div key={al} className="text-xs">
                <div className="text-[#f08b78]">· {ALERT_LABELS[al] ?? al}</div>
                {ALERT_HINTS[al] && (
                  <div className="pl-3 text-[11px] leading-relaxed text-[#b9aa94]">
                    {ALERT_HINTS[al]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {building.onFireTimer > 0 && (
          <div className="pt-2 border-t border-[#b78e4a]/20">
            <button
              type="button"
              disabled={!canAffordFireBrigade}
              title={`Extinguir incendio: ${EXTINGUISH_COST} denarios`}
              aria-label={`Extinguir incendio: ${EXTINGUISH_COST} denarios`}
              onClick={() => onExtinguishFire(building.id)}
              className={`w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 ${
                canAffordFireBrigade
                  ? 'bg-[#c94432] text-[#fff6f2] hover:bg-[#dc5340] cursor-pointer'
                  : 'bg-[#2a231c] text-[#8d7f6b] cursor-not-allowed'
              }`}
            >
              <HugeIcon icon={FireIcon} size={15} aria-hidden="true" />
              <span>Extinguir</span>
              <span className="flex items-center gap-1 opacity-85">
                <HugeIcon icon={Coins01Icon} size={11} aria-hidden="true" />
                {EXTINGUISH_COST}
              </span>
            </button>
            {!canAffordFireBrigade && (
              <p className="text-[11px] text-[#e5986f] text-center">
                Necesitas {EXTINGUISH_COST} denarios para la brigada de incendios.
              </p>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-[#b78e4a]/20">
          <button
            type="button"
            title="Demoler estructura"
            aria-label="Demoler estructura"
            onClick={() => onDemolishBuilding(building)}
            className="w-full py-1.5 px-3 rounded text-xs font-medium bg-[#351f1c] text-[#f4b0a5] border border-[#c64635]/40 hover:bg-[#492723] cursor-pointer"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <HugeIcon icon={Hammer01Icon} size={14} aria-hidden="true" />
              Demoler
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
};
