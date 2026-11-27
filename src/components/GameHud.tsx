import React from 'react';
import {
  ArrowUp02Icon,
  BookOpen01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CloudFastWindIcon,
  CloudRainIcon,
  Coins01Icon,
  CourtHouseIcon,
  Cursor01Icon,
  FastForwardIcon,
  FloppyDiskIcon,
  Hammer01Icon,
  Menu01Icon,
  Moon02Icon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
  Sun03Icon,
  SunriseIcon,
  SunsetIcon,
  UserGroupIcon,
  UserSettingsIcon,
  UserStarIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from '@hugeicons/core-free-icons';
import { BUILDINGS, BUILD_MENU_GROUPS, RESOURCE_META, VICTORY_GOALS } from '../game/catalog';
import { getDayPhaseInfo } from '../game/dayCycle';
import { BuildCategory, BuildingType, HudSnapshot, ToolMode } from '../game/types';
import { HugeIcon } from './HugeIcon';
import { BuildingIcon, ResourceIcon } from './RomanIcons';
import { CATEGORY_ICONS, CATEGORY_SHORT_LABELS } from './uiIcons';

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
      <div className="pointer-events-auto w-full flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-1.5 rounded-lg bg-[#191511]/95 border border-[#b78e4a]/35 shadow-xl">
        {/* Left: Denarii, Population & Stock */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <div
            className="flex items-center gap-1.5"
            title={`Denarios: ${hud.denarii} (${hud.netDenariiPerMin >= 0 ? '+' : ''}${hud.netDenariiPerMin}/min)`}
            aria-label={`Denarios: ${hud.denarii}. Balance: ${hud.netDenariiPerMin >= 0 ? '+' : ''}${hud.netDenariiPerMin} por minuto.`}
          >
            <HugeIcon
              icon={Coins01Icon}
              size={16}
              className="text-[#e6b85c] shrink-0"
              aria-hidden="true"
            />
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

          <div
            className="flex items-center gap-1.5"
            title={`Población: ${hud.totalPopulation} (${hud.populationLiberti} libertos, ${hud.populationCives} civiles)`}
          >
            <HugeIcon
              icon={UserGroupIcon}
              size={16}
              className="text-[#cbbd9f] shrink-0"
              aria-hidden="true"
            />
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
        <div className="flex w-full flex-wrap items-center justify-between gap-1 xl:ml-auto xl:w-auto xl:justify-end">
          <div
            data-testid="day-clock"
            data-day-phase={dayInfo.phase}
            className="hidden md:flex items-center gap-1 text-xs pr-2 border-r border-[#5e5140]/60 whitespace-nowrap"
            title={`Hora del día: ${dayInfo.clockText} (${dayInfo.label})`}
          >
            {dayInfo.phase === 'night' ? (
              <HugeIcon icon={Moon02Icon} size={15} className="text-[#8ea8f0]" aria-hidden="true" />
            ) : dayInfo.phase === 'dusk' ? (
              <HugeIcon icon={SunsetIcon} size={15} className="text-[#e88754]" aria-hidden="true" />
            ) : dayInfo.phase === 'dawn' ? (
              <HugeIcon icon={SunriseIcon} size={15} className="text-[#f2aa6b]" aria-hidden="true" />
            ) : (
              <HugeIcon icon={Sun03Icon} size={15} className="text-[#f3ca64]" aria-hidden="true" />
            )}
            <span className="font-mono-num text-[#f3eadb]">{dayInfo.clockText}</span>
          </div>

          <div
            className="hidden xl:flex items-center gap-1.5 text-xs pr-2 border-r border-[#5e5140]/60 whitespace-nowrap"
            title={`Eficiencia agrícola: ${Math.round(hud.farmEfficiencyMultiplier * 100)}%`}
          >
            {hud.weatherKind === 'rain' ? (
              <>
                <HugeIcon icon={CloudRainIcon} size={15} className="text-[#7cc6e8]" aria-hidden="true" />
                <span className="font-mono-num text-[#89c983]">+12%</span>
              </>
            ) : hud.weatherKind === 'wind' ? (
              <>
                <HugeIcon icon={CloudFastWindIcon} size={15} className="text-[#d8b46c]" aria-hidden="true" />
                <span className="font-mono-num text-[#e5986f]">-10%</span>
              </>
            ) : (
              <HugeIcon icon={Sun03Icon} size={15} className="text-[#f0c75e]" aria-hidden="true" />
            )}
          </div>

          <div
            className="hidden lg:flex items-center gap-1.5 text-xs text-[#d6c9b4] pr-2 border-r border-[#5e5140]/60 whitespace-nowrap"
            title={`Progreso del Senado: ${hud.totalPopulation}/${VICTORY_GOALS.targetPopulation} habitantes · ${hud.populationCives}/${VICTORY_GOALS.targetCives} civiles`}
          >
            <span className="flex items-center gap-1" title="Población total / objetivo">
              <HugeIcon icon={UserGroupIcon} size={14} className="text-[#cbbd9f]" aria-hidden="true" />
              <span className="font-mono-num text-[#e6d6b8]">
                {hud.totalPopulation}/{VICTORY_GOALS.targetPopulation}
              </span>
            </span>
            <span className="flex items-center gap-1" title="Civiles / objetivo">
              <HugeIcon icon={UserStarIcon} size={14} className="text-[#d8b46c]" aria-hidden="true" />
              <span className="font-mono-num">
                {hud.populationCives}/{VICTORY_GOALS.targetCives}
              </span>
            </span>
            <span
              className="flex items-center"
              title={hud.hasForum ? 'Foro construido' : 'Foro pendiente'}
              aria-label={hud.hasForum ? 'Foro construido' : 'Foro pendiente'}
            >
              <HugeIcon
                icon={CourtHouseIcon}
                size={14}
                className={hud.hasForum ? 'text-[#89c983]' : 'text-[#b9aa94]'}
                aria-hidden="true"
              />
            </span>
            <span
              className={`flex items-center gap-1 ${
                hud.staffingRatio < 1 ? 'text-[#e5986f]' : 'text-[#89c983]'
              }`}
              title="Mano de obra disponible para talleres (población × 0,75 / demanda)"
            >
              <HugeIcon icon={UserSettingsIcon} size={14} aria-hidden="true" />
              <span className="font-mono-num">{Math.round(hud.staffingRatio * 100)}%</span>
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
              <HugeIcon icon={ZoomOutAreaIcon} size={15} aria-hidden="true" />
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
              <HugeIcon icon={ZoomInAreaIcon} size={15} aria-hidden="true" />
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
              <HugeIcon icon={PauseIcon} size={15} aria-hidden="true" />
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
                    <HugeIcon icon={FastForwardIcon} size={12} aria-hidden="true" />
                  </span>
                ) : spd === 1 ? (
                  <span className="inline-flex items-center gap-0.5">
                    <HugeIcon icon={PlayIcon} size={12} aria-hidden="true" />
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
            aria-label={`Abrir cuentas${hud.alerts.length > 0 ? ` (${hud.alerts.length} avisos)` : ''}`}
            title="Cuentas y avisos"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleLedger();
            }}
            className="relative p-1.5 rounded bg-[#28221b] text-[#f3eadb] border border-[#b78e4a]/40 hover:bg-[#342c23] flex items-center justify-center cursor-pointer shrink-0"
          >
            <HugeIcon icon={BookOpen01Icon} size={15} className="text-[#d4a656]" aria-hidden="true" />
            {hud.alerts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#7d2f26] text-[#ffd9d2] font-mono-num text-[9px] leading-4 text-center">
                {hud.alerts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label="Guardar partida"
            title={saveFeedback ?? 'Guardar partida'}
            onClick={(e) => {
              e.currentTarget.blur();
              onSaveNow();
            }}
            className="p-1.5 rounded bg-[#28221b] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#342c23] flex items-center justify-center cursor-pointer shrink-0"
          >
            <HugeIcon
              icon={saveFeedback ? CheckmarkCircle02Icon : FloppyDiskIcon}
              size={15}
              className={saveFeedback ? 'text-[#89c983]' : 'text-[#d4a656]'}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
            title={muted ? 'Activar sonido' : 'Silenciar sonido'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="p-1.5 rounded bg-[#28221b] text-[#d6c9b4] border border-[#b78e4a]/30 hover:text-[#fff6e8] cursor-pointer shrink-0"
          >
            <HugeIcon
              icon={muted ? VolumeMute01Icon : VolumeHighIcon}
              size={15}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            aria-label="Abrir menú de pausa"
            title="Menú de pausa"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPauseMenu();
            }}
            className="p-1.5 rounded bg-[#28221b] text-[#d6c9b4] border border-[#b78e4a]/30 hover:text-[#fff6e8] cursor-pointer shrink-0"
          >
            <HugeIcon icon={Menu01Icon} size={15} aria-hidden="true" />
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
        {/* Row 1: Categories + Action Tools, wrapping instead of scrolling on narrow screens */}
        <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1.5 pb-1.5 mb-2 border-b border-[#b78e4a]/20">
          <div className="flex w-full flex-wrap items-center gap-1 xl:w-auto">
            {BUILD_MENU_GROUPS.map((group) => {
              const active = activeCategory === group.category;
              const activeBuild = active && toolMode.kind === 'build';
              return (
                <button
                  key={group.category}
                  type="button"
                  aria-label={group.label}
                  aria-pressed={active}
                  title={group.label}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectCategory(group.category);
                    if (toolMode.kind !== 'build') {
                      onSelectTool({ kind: 'build', buildingType: group.items[0] });
                    }
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 border ${
                    activeBuild
                      ? 'bg-[#c9953c] text-[#17120c] font-semibold border-transparent'
                      : active
                        ? 'bg-[#2c241b] text-[#f0c977] border-[#c9953c]/45'
                        : 'bg-[#262019] text-[#d6c9b4] border-transparent hover:bg-[#322a21] hover:text-[#fff5e4]'
                  }`}
                >
                  <HugeIcon icon={CATEGORY_ICONS[group.category]} size={15} aria-hidden="true" />
                  <span className="hidden lg:inline">{CATEGORY_SHORT_LABELS[group.category]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-wrap items-center gap-1 xl:ml-auto xl:w-auto">
            {hud.readyUpgradeCount > 0 && (
              <button
                type="button"
                aria-label={`Ascender ${hud.readyUpgradeCount} viviendas listas`}
                title={`Ascender ${hud.readyUpgradeCount} viviendas listas`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onUpgradeAll();
                }}
                className="px-2 py-1 rounded text-xs font-semibold bg-[#3a2f19] text-[#f4ca64] border border-[#d4a656]/50 hover:bg-[#4b3c20] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <HugeIcon icon={ArrowUp02Icon} size={15} aria-hidden="true" />
                <span className="font-mono-num">{hud.readyUpgradeCount}</span>
              </button>
            )}

            <button
              type="button"
              aria-label={`Autoascenso ${hud.autoUpgradeHouses ? 'activado' : 'desactivado'}`}
              aria-pressed={hud.autoUpgradeHouses}
              title={`Autoascenso de viviendas: ${hud.autoUpgradeHouses ? 'activado' : 'desactivado'}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleAutoUpgrade();
              }}
              className={`p-1.5 rounded border cursor-pointer shrink-0 ${
                hud.autoUpgradeHouses
                  ? 'bg-[#2a3b26] text-[#a7e09b] border-[#669c5b]/50'
                  : 'bg-[#241e18] text-[#b9aa94] border-[#5e5140]/50 hover:text-[#f3eadb]'
              }`}
            >
              <HugeIcon icon={SparklesIcon} size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              aria-label="Inspeccionar"
              aria-pressed={toolMode.kind === 'inspect'}
              title="Inspeccionar (Q)"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'inspect' });
              }}
              className={`px-1.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'inspect'
                  ? 'bg-[#c9953c] text-[#17120c] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]'
              }`}
            >
              <HugeIcon icon={Cursor01Icon} size={15} aria-hidden="true" />
              <span className="text-[9px] font-mono-num opacity-70">Q</span>
            </button>

            <button
              type="button"
              aria-label={`Objetivos: ${objectivesDone} de ${objectivesTotal}`}
              title={`Objetivos: ${objectivesDone}/${objectivesTotal}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenObjectives();
              }}
              className="px-1.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]"
            >
              <HugeIcon icon={CheckListIcon} size={15} aria-hidden="true" />
              <span className="font-mono-num text-[10px]">
                {objectivesDone}/{objectivesTotal}
              </span>
            </button>

            <button
              type="button"
              aria-label="Ascender estructura"
              aria-pressed={toolMode.kind === 'upgrade'}
              title="Ascender estructura (U)"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'upgrade' });
              }}
              className={`px-1.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'upgrade'
                  ? 'bg-[#c9953c] text-[#17120c] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#322a21]'
              }`}
            >
              <HugeIcon icon={ArrowUp02Icon} size={15} aria-hidden="true" />
              <span className="text-[9px] font-mono-num opacity-70">U</span>
            </button>

            <button
              type="button"
              aria-label="Demoler estructura"
              aria-pressed={toolMode.kind === 'demolish'}
              title="Demoler estructura (X)"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectTool({ kind: 'demolish' });
              }}
              className={`px-1.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                toolMode.kind === 'demolish'
                  ? 'bg-[#c64635] text-[#fff6f4] font-semibold'
                  : 'bg-[#262019] text-[#d6c9b4] hover:bg-[#3b221e]'
              }`}
            >
              <HugeIcon icon={Hammer01Icon} size={15} aria-hidden="true" />
              <span className="text-[9px] font-mono-num opacity-70">X</span>
            </button>
          </div>
        </div>

        {/* Row 2: Building Selection Buttons */}
        <div className="flex flex-wrap items-stretch gap-2">
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
                title={`${def.description}${def.hotkey ? ` · Atajo ${def.hotkey}` : ''}`}
                aria-label={`${def.name}. ${def.description}`}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded border text-left transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-[#362c1c] border-[#e2b45d] text-[#fff6e5]'
                    : 'bg-[#211c17] border-[#b78e4a]/20 text-[#e6dccb] hover:bg-[#2c251e] hover:border-[#b78e4a]/45'
                } ${!canAfford ? 'opacity-65' : ''}`}
              >
                <BuildingIcon type={bType} className="w-7 h-7 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold whitespace-nowrap">{def.name}</div>
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-mono-num text-[#cbbd9f] whitespace-nowrap"
                    title={`Coste: ${def.costDenarii} denarios, ${def.costWood} madera, ${def.costStone} piedra`}
                  >
                    <HugeIcon icon={Coins01Icon} size={11} className="text-[#d8b46c]" aria-hidden="true" />
                    {def.costDenarii}
                    {def.costWood > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ResourceIcon resource="wood" className="w-3.5 h-3.5" />
                        {def.costWood}
                      </span>
                    )}
                    {def.costStone > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ResourceIcon resource="stone" className="w-3.5 h-3.5" />
                        {def.costStone}
                      </span>
                    )}
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
