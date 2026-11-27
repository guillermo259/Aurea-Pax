import React from 'react';
import {
  ArrowUpCircle,
  BookOpen,
  Hammer,
  ListChecks,
  MousePointer,
  Pause,
  Play,
  FastForward,
  Save,
  Volume2,
  VolumeX,
  Menu,
  Sun,
  CloudRain,
  Wind,
  Sunrise,
  Sunset,
  Moon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BUILDINGS, BUILD_MENU_GROUPS, RESOURCE_META, VICTORY_GOALS } from '../game/catalog';
import { getDayPhaseInfo } from '../game/dayCycle';
import { BuildCategory, BuildingType, HudSnapshot, ToolMode } from '../game/types';
import { BuildingIcon, ResourceIcon } from './RomanIcons';

interface GameHudProps {
  hud: HudSnapshot;
  activeCategory: BuildCategory;
  onSelectCategory: (cat: BuildCategory) => void;
  toolMode: ToolMode;
  onSelectTool: (mode: ToolMode) => void;
  onSetSpeed: (speed: 0 | 1 | 2 | 3) => void;
  onToggleLedger: () => void;
  onSaveNow: () => void;
  onOpenPauseMenu: () => void;
  onUpgradeAll: () => void;
  onToggleAutoUpgrade: () => void;
  muted: boolean;
  onToggleMute: () => void;
  saveFeedback: string | null;
  placementTooltip: string | null;
  objectivesDone: number;
  objectivesTotal: number;
  onOpenObjectives: () => void;
  onZoom: (factor: number) => void;
}

const TOP_RESOURCES: Array<'wood' | 'stone' | 'bread' | 'wine' | 'pottery'> = [
  'wood',
  'stone',
  'bread',
  'wine',
  'pottery',
];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  activeCategory,
  onSelectCategory,
  toolMode,
  onSelectTool,
  onSetSpeed,
  onToggleLedger,
  onSaveNow,
  onOpenPauseMenu,
  onUpgradeAll,
  onToggleAutoUpgrade,
  muted,
  onToggleMute,
  saveFeedback,
  placementTooltip,
  objectivesDone,
  objectivesTotal,
  onOpenObjectives,
  onZoom,
}) => {
  const currentGroup =
    BUILD_MENU_GROUPS.find((g) => g.category === activeCategory) ?? BUILD_MENU_GROUPS[0];
  const dayInfo = getDayPhaseInfo(hud.dayTime);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3">
      {/* Top Perimeter Resource & Senate Bar */}
      <div className="pointer-events-auto w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/35 shadow-xl overflow-x-auto">
        {/* Left: Denarii, Population & Stock */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#b9aa94]">Denarios</span>
            <span className="font-mono-num text-lg font-semibold text-[#f3c667]">
              {hud.denarii}
            </span>
            <span
              className={`font-mono-num text-xs ${
                hud.netDenariiPerMin >= 0 ? 'text-[#89c983]' : 'text-[#e57c6f]'
              }`}
            >
              {hud.netDenariiPerMin >= 0 ? `+${hud.netDenariiPerMin}` : hud.netDenariiPerMin}/m
            </span>
          </div>

          <span className="text-[#5e5140]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#b9aa94]">Pobl.</span>
            <span className="font-mono-num text-lg font-semibold text-[#f6efe2]">
              {hud.totalPopulation}
            </span>
            <span className="text-xs text-[#cfc3b0] font-mono-num whitespace-nowrap">
              {hud.populationLiberti}L·{hud.populationCives}C
            </span>
          </div>

          <span className="hidden md:inline text-[#5e5140]" aria-hidden="true">
            |
          </span>

          {/* Key Stocked Goods */}
          <div className="hidden md:flex items-center gap-3">
            {TOP_RESOURCES.map((res) => (
              <div
                key={res}
                className="flex items-center gap-1"
                title={`${RESOURCE_META[res].label}: ${Math.floor(hud.stock[res])}`}
              >
                <ResourceIcon resource={res} className="w-4 h-4 shrink-0" />
                <span className="font-mono-num text-xs font-medium text-[#f4ede0]">
                  {Math.floor(hud.stock[res])}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Time + Weather + Goal progress + Speed + Utility Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            data-testid="day-clock"
            data-day-phase={dayInfo.phase}
            className="hidden md:flex items-center gap-1 text-xs pr-2 border-r border-[#5e5140]/60 whitespace-nowrap"
            title={`Hora del día: ${dayInfo.clockText} (${dayInfo.label})`}
          >
            {dayInfo.phase === 'night' ? (
              <Moon className="w-3.5 h-3.5 text-[#8ea8f0]" />
            ) : dayInfo.phase === 'dusk' ? (
              <Sunset className="w-3.5 h-3.5 text-[#e88754]" />
            ) : dayInfo.phase === 'dawn' ? (
              <Sunrise className="w-3.5 h-3.5 text-[#f2aa6b]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-[#f3ca64]" />
            )}
            <span className="font-mono-num text-[#f3eadb]">{dayInfo.clockText}</span>
            <span className="text-[#b9aa94]">{dayInfo.label}</span>
          </div>

          <div
            className="hidden xl:flex items-center gap-1.5 text-xs pr-2 border-r border-[#5e5140]/60 whitespace-nowrap"
            title={`Eficiencia agrícola: ${Math.round(hud.farmEfficiencyMultiplier * 100)}%`}
          >
            {hud.weatherKind === 'rain' ? (
              <>
                <CloudRain className="w-3.5 h-3.5 text-[#7cc6e8]" />
                <span className="text-[#a8daf2]">Lluvia</span>
                <span className="font-mono-num text-[#89c983]">+12%</span>
              </>
            ) : hud.weatherKind === 'wind' ? (
              <>
                <Wind className="w-3.5 h-3.5 text-[#d8b46c]" />
                <span className="text-[#e6ca8d]">Viento</span>
                <span className="font-mono-num text-[#e5986f]">-10%</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-[#f0c75e]" />
                <span className="text-[#d6c9b4]">Despejado</span>
              </>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-[#d6c9b4] pr-2 border-r border-[#5e5140]/60 whitespace-nowrap">
            <span className="text-[#d4a656] font-medium">Senado:</span>
            <span className="font-mono-num">
              {hud.totalPopulation}/{VICTORY_GOALS.targetPopulation}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {hud.populationCives}/{VICTORY_GOALS.targetCives} Civ
            </span>
            <span aria-hidden="true">·</span>
            <span className={hud.hasForum ? 'text-[#89c983]' : 'text-[#b9aa94]'}>
              {hud.hasForum ? 'Foro ✓' : 'Foro ✗'}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={hud.staffingRatio < 1 ? 'text-[#e5986f]' : 'text-[#89c983]'}
              title="Mano de obra disponible para talleres (población × 0,75 / demanda)"
            >
              Obreros {Math.round(hud.staffingRatio * 100)}%
            </span>
          </div>

          {/* Zoom controls (also usable on touch devices without a wheel) */}
          <div className="flex items-center bg-[#120f0c] rounded border border-[#b78e4a]/25 p-0.5 shrink-0">
            <button
              type="button"
              aria-label="Alejar mapa"
              onClick={(e) => {
                e.currentTarget.blur();
                onZoom(0.89);
              }}
              className="p-1 rounded text-[#d1c5b4] hover:text-[#fff6e8] cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Acercar mapa"
              onClick={(e) => {
                e.currentTarget.blur();
                onZoom(1.12);
              }}
              className="p-1 rounded text-[#d1c5b4] hover:text-[#fff6e8] cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Speed controls */}
          <div className="flex items-center bg-[#120f0c] rounded border border-[#b78e4a]/25 p-0.5 shrink-0">
            <button
              type="button"
              aria-label="Pausar simulación"
              onClick={(e) => {
                e.currentTarget.blur();
                onSetSpeed(0);
              }}
              className={`px-1.5 py-1 rounded text-xs font-medium flex items-center cursor-pointer whitespace-nowrap shrink-0 ${
                hud.speed === 0
                  ? 'bg-[#c9953c] text-[#17120c]'
                  : 'text-[#d1c5b4] hover:text-[#fff6e8]'
              }`}
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
            {([1, 2, 3] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                  aria-label={`Velocidad ${spd}x`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSetSpeed(spd);
                }}
                className={`px-1.5 py-1 rounded text-xs font-mono-num font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  hud.speed === spd
                    ? 'bg-[#c9953c] text-[#17120c]'
                    : 'text-[#d1c5b4] hover:text-[#fff6e8]'
                }`}
              >
                {spd === 3 ? (
                  <span className="inline-flex items-center gap-0.5">
                    3x
                    <FastForward className="w-3 h-3" />
                  </span>
                ) : spd === 1 ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Play className="w-3 h-3" />
                    1x
                  </span>
                ) : (
                  '2x'
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleLedger();
            }}
            className="px-2.5 py-1 rounded text-xs font-medium bg-[#28221b] text-[#f3eadb] border border-[#b78e4a]/40 hover:bg-[#342c23] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#d4a656]" />
            <span>Cuentas</span>
            {hud.alerts.length > 0 && (
              <span className="font-mono-num text-[#f08b78]">({hud.alerts.length})</span>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Guardar partida"
            onClick={(e) => {
              e.currentTarget.blur();
              onSaveNow();
            }}
            className="px-2.5 py-1 rounded text-xs font-medium bg-[#28221b] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#342c23] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5 text-[#d4a656]" />
            <span>{saveFeedback ?? 'Guardar'}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="p-1.5 rounded bg-[#28221b] text-[#d6c9b4] border border-[#b78e4a]/30 hover:text-[#fff6e8] cursor-pointer shrink-0"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Abrir menú de pausa"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPauseMenu();
            }}
            className="p-1.5 rounded bg-[#28221b] text-[#d6c9b4] border border-[#b78e4a]/30 hover:text-[#fff6e8] cursor-pointer shrink-0"
          >
            <Menu className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle centered floating feedback if placement invalid */}
      <div className="flex flex-col items-center justify-center pointer-events-none">
        {placementTooltip && (
          <div className="px-3 py-1 rounded bg-[#1d1511]/95 border border-[#e06c58]/60 text-xs font-medium text-[#ffbfb4] shadow-md">
            {placementTooltip}
          </div>
        )}
      </div>

      {/* Bottom Perimeter Build Dock */}
      <div className="pointer-events-auto self-center w-full max-w-6xl rounded-lg bg-[#191511]/95 border border-[#b78e4a]/35 shadow-xl px-3 py-2">
        {/* Row 1: Categories + Action Tools on single compact row */}
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-[#b78e4a]/20 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            {BUILD_MENU_GROUPS.map((group) => {
              const active = activeCategory === group.category && toolMode.kind === 'build';
              return (
                <button
                  key={group.category}
                  type="button"
                      onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectCategory(group.category);
                    if (toolMode.kind !== 'build') {
                      onSelectTool({ kind: 'build', buildingType: group.items[0] });
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#c9953c] text-[#17120c] font-semibold'
                      : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21] hover:text-[#fff5e4]'
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hud.readyUpgradeCount > 0 && (
              <button
                type="button"
                  onClick={(e) => {
                  e.currentTarget.blur();
                  onUpgradeAll();
                }}
                className="px-2 py-1 rounded text-xs font-semibold bg-[#3a2f19] text-[#f4ca64] border border-[#d4a656]/50 hover:bg-[#4b3c20] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>Ascender ({hud.readyUpgradeCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleAutoUpgrade();
              }}
              className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer whitespace-nowrap shrink-0 ${
                hud.autoUpgradeHouses
                  ? 'bg-[#2a3b26] text-[#a7e09b] border-[#669c5b]/50'
                  : 'bg-[#241e18] text-[#b9aa94] border-[#5e5140]/50 hover:text-[#f3eadb]'
              }`}
            >
              Auto: {hud.autoUpgradeHouses ? 'Sí' : 'No'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'inspect' });
              }}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'inspect'
                  ? 'bg-[#c9953c] text-[#17120c] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Inspeccionar [Q]</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenObjectives();
              }}
              className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>
                Objetivos ({objectivesDone}/{objectivesTotal})
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'upgrade' });
              }}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'upgrade'
                  ? 'bg-[#c9953c] text-[#17120c] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]'
              }`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Ascender [U]</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'demolish' });
              }}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'demolish'
                  ? 'bg-[#c64635] text-[#fff6f4] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#3b221e]'
              }`}
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>Demoler [X]</span>
            </button>
          </div>
        </div>

        {/* Row 2: Building Selection Buttons */}
        <div className="flex items-stretch gap-2 overflow-x-auto roman-scroll pb-0.5">
          {currentGroup.items.map((bType: BuildingType) => {
            const def = BUILDINGS[bType];
            const isSelected =
              toolMode.kind === 'build' && toolMode.buildingType === bType;
            const canAfford =
              hud.denarii >= def.costDenarii &&
              hud.stock.wood >= def.costWood &&
              hud.stock.stone >= def.costStone;

            return (
              <button
                key={bType}
                type="button"
                  onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectTool({ kind: 'build', buildingType: bType });
                }}
                title={def.description}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded border text-left transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-[#362c1c] border-[#e2b45d] text-[#fff6e5]'
                    : 'bg-[#211c17] border-[#b78e4a]/20 text-[#e6dccb] hover:bg-[#2c251e] hover:border-[#b78e4a]/45'
                } ${!canAfford ? 'opacity-65' : ''}`}
              >
                <BuildingIcon type={bType} className="w-7 h-7 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold whitespace-nowrap">{def.name}</span>
                    {def.hotkey && (
                      <span className="text-[10px] font-mono-num text-[#b9aa94]">
                        [{def.hotkey}]
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono-num text-[#cbbd9f] whitespace-nowrap">
                    {def.costDenarii}d
                    {def.costWood > 0 ? ` · ${def.costWood}m` : ''}
                    {def.costStone > 0 ? ` · ${def.costStone}p` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
