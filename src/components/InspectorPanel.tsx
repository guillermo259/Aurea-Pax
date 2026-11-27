import React from 'react';
import { ArrowUpCircle, Flame, X } from 'lucide-react';
import { ALERT_HINTS, ALERT_LABELS, BUILDINGS, RESOURCE_META } from '../game/catalog';
import { EXTINGUISH_COST, UPGRADE_CIVES_COST } from '../game/simulation';
import { Cart, HudSnapshot, PlacedBuilding, ResourceId } from '../game/types';
import { BuildingIcon, ResourceIcon } from './RomanIcons';

interface InspectorPanelProps {
  hud: HudSnapshot;
  building: PlacedBuilding | null;
  cart: Cart | null;
  allBuildings: PlacedBuilding[];
  onClose: () => void;
  onUpgradeBuilding: (id: number) => void;
  onExtinguishFire: (id: number) => void;
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
  onDemolishBuilding,
}) => {
  if (!building && !cart) return null;

  if (cart) {
    const origin = allBuildings.find((b) => b.id === cart.ownerBuildingId);
    const target = allBuildings.find((b) => b.id === cart.targetBuildingId);
    return (
      <aside className="fixed right-3 top-20 z-20 w-72 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/45 shadow-2xl p-4 text-sm text-[#f4ede0]">
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
            <X className="w-4 h-4" />
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

  return (
    <aside className="fixed right-3 top-20 z-20 w-80 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/45 shadow-2xl p-4 text-sm text-[#f4ede0]">
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
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-[#d6c9b4] leading-relaxed mb-3">{def.description}</p>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[#b9aa94]">Calzada</span>
          <span className={building.roadConnected ? 'text-[#89c983]' : 'text-[#f08b78]'}>
            {building.roadConnected ? 'Conectada' : 'Sin conexión'}
          </span>
        </div>

        {def.upkeepPerMin > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[#b9aa94]">Mantenimiento</span>
            <span className="font-mono-num text-[#e57c6f]">-{def.upkeepPerMin} d/min</span>
          </div>
        )}

        {/* Producer details */}
        {def.produces && (
          <>
            {def.consumes && (
              <div className="flex items-center justify-between">
                <span className="text-[#b9aa94]">
                  Insumo ({RESOURCE_META[def.consumes].label})
                </span>
                <span className="font-mono-num">{building.inputBuffer} / 8</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">
                Salida ({RESOURCE_META[def.produces].label})
              </span>
              <span className="font-mono-num">{building.outputBuffer} / 8</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">Mano de obra</span>
              <span
                className={`font-mono-num ${
                  hud.staffingRatio < 1 ? 'text-[#e5986f]' : 'text-[#89c983]'
                }`}
              >
                {Math.round(hud.staffingRatio * 100)}%
              </span>
            </div>
            {(building.type === 'wheat_farm' || building.type === 'vineyard') && (
              <div className="flex items-center justify-between">
                <span className="text-[#b9aa94]">Rendimiento climático</span>
                <span
                  className={`font-mono-num ${
                    hud.farmEfficiencyMultiplier > 1
                      ? 'text-[#89c983]'
                      : hud.farmEfficiencyMultiplier < 1
                        ? 'text-[#e5986f]'
                        : 'text-[#d6c9b4]'
                  }`}
                >
                  {Math.round(hud.farmEfficiencyMultiplier * 100)}%
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#b9aa94]">Ciclo de trabajo</span>
                <span className="font-mono-num">{Math.round(building.cycleProgress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 rounded bg-[#2d261e] overflow-hidden">
                <div
                  className="h-full bg-[#d4a656]"
                  style={{ width: `${Math.round(building.cycleProgress * 100)}%` }}
                />
              </div>
            </div>
          </>
        )}

        {/* Market inventory */}
        {building.type === 'market' && (
          <div className="pt-2 border-t border-[#b78e4a]/20 space-y-1.5">
            <div className="text-[#d4a656] font-medium">Existencias del Mercado</div>
            {(['bread', 'wine', 'pottery'] as ResourceId[]).map((good) => (
              <div key={good} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[#cfc3b0]">
                  <ResourceIcon resource={good} className="w-3.5 h-3.5" />
                  {RESOURCE_META[good].label}
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
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">Habitantes</span>
              <span className="font-mono-num font-semibold">
                {Math.round(building.residents)} / {def.maxResidents}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">Agua (Fuente)</span>
              <span className={building.hasWater ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                {building.hasWater ? 'Cubierta' : 'Falta'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">Mercado</span>
              <span className={building.hasMarket ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                {building.hasMarket ? 'Cubierto' : 'Falta'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#b9aa94]">Pan</span>
              <span className={building.hasBread ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                {building.hasBread ? 'Abastecido' : 'Falta'}
              </span>
            </div>
            {building.type === 'house_cives' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[#b9aa94]">Vino</span>
                  <span className={building.hasWine ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                    {building.hasWine ? 'Abastecido' : 'Falta'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#b9aa94]">Cerámica</span>
                  <span className={building.hasPottery ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                    {building.hasPottery ? 'Abastecida' : 'Falta'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#b9aa94]">Templo / Foro</span>
                  <span className={building.hasTemple ? 'text-[#89c983]' : 'text-[#f08b78]'}>
                    {building.hasTemple ? 'Cubierto' : 'Falta'}
                  </span>
                </div>
              </>
            )}

            {building.type === 'house_liberti' && (
              <button
                type="button"
                disabled={!canUpgradeAfford}
                onClick={() => onUpgradeBuilding(building.id)}
                className={`mt-2 w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  canUpgradeAfford
                    ? 'bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer'
                    : 'bg-[#2a231c] text-[#8d7f6b] cursor-not-allowed'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  Ascender a Insula ({UPGRADE_CIVES_COST.denarii}d · {UPGRADE_CIVES_COST.wood}m ·{' '}
                  {UPGRADE_CIVES_COST.stone}p)
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
              onClick={() => onExtinguishFire(building.id)}
              className={`w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 ${
                canAffordFireBrigade
                  ? 'bg-[#c94432] text-[#fff6f2] hover:bg-[#dc5340] cursor-pointer'
                  : 'bg-[#2a231c] text-[#8d7f6b] cursor-not-allowed'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>
                Extinguir incendio ({EXTINGUISH_COST} d)
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
            onClick={() => onDemolishBuilding(building)}
            className="w-full py-1.5 px-3 rounded text-xs font-medium bg-[#351f1c] text-[#f4b0a5] border border-[#c64635]/40 hover:bg-[#492723] cursor-pointer"
          >
            Demoler estructura
          </button>
        </div>
      </div>
    </aside>
  );
};
