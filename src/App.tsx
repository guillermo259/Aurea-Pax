import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BalanceLedgerModal } from './components/BalanceLedgerModal';
import { ConfirmModal } from './components/ConfirmModal';
import { GameHud } from './components/GameHud';
import { GuideModal, type GuideSection } from './components/GuideModal';
import { InspectorPanel } from './components/InspectorPanel';
import { ObjectivesModal } from './components/ObjectivesModal';
import { OutcomeModal } from './components/OutcomeModal';
import { PauseModal } from './components/PauseModal';
import { TitleOverlay } from './components/TitleOverlay';
import { ToastStack } from './components/ToastStack';
import { romanAudio } from './game/audio';
import { BUILDINGS, BUILD_MENU_GROUPS, WHEAT_SOW_COST } from './game/catalog';
import { normalizeDayTime } from './game/dayCycle';
import {
  CameraState,
  findCartNearScreenPoint,
  getInitialCameraForWorld,
  getPlacementTooltip,
  gridToIso,
  invalidateTerrainCache,
  renderDayNightOverlay,
  renderWorld,
  screenToGrid,
} from './game/isoRenderer';
import { createStarterWorld, getTileIndex, inBounds } from './game/mapGen';
import { getObjectives } from './game/objectives';
import {
  deserializeWorld,
  hasLocalSave,
  loadSavedGame,
  saveWorldToLocal,
  serializeWorld,
} from './game/persistence';
import {
  buildHudSnapshot,
  canUpgradeHouse,
  demolishAt,
  EXTINGUISH_COST,
  extinguishFire,
  placeBuilding,
  recomputeStaticStatuses,
  sowWheatFarm,
  stepSimulation,
  upgradeAllReadyHouses,
  upgradeHouse,
} from './game/simulation';
import { BUILDING_SHORTCUTS, CAMERA_KEYS, SHORTCUTS } from './game/shortcuts';
import { WeatherParticlePool } from './game/weatherParticles';
import {
  BuildCategory,
  BuildingType,
  GamePhase,
  HudSnapshot,
  PendingGameNotification,
  PlacedBuilding,
  ToastNotification,
  ToolMode,
  WorldState,
} from './game/types';

function shouldAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function getInitialDayTimeParam(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('dayTime');
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? normalizeDayTime(parsed) : null;
}

/** `?seed=123` lets players share or revisit a map; otherwise the demo seed is used. */
function getInitialSeedParam(): number {
  if (typeof window === 'undefined') return 11701;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return 11701;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffff_ffff ? parsed : 11701;
}

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialWorldRef = useRef<WorldState | null>(null);
  if (!initialWorldRef.current) {
    const w = createStarterWorld(getInitialSeedParam());
    const paramDayTime = getInitialDayTimeParam();
    if (paramDayTime !== null) {
      w.dayTime = paramDayTime;
    }
    recomputeStaticStatuses(w);
    initialWorldRef.current = w;
  }

  const worldRef = useRef<WorldState>(initialWorldRef.current);
  const [phase, setPhase] = useState<GamePhase>(() => shouldAutostart() && !hasLocalSave() ? 'playing' : 'title');
  const phaseRef = useRef<GamePhase>(phase);
  const speedRef = useRef<HudSnapshot['speed']>(1);
  const lastRunningSpeedRef = useRef<1 | 2 | 3>(1);
  const cameraRef = useRef<CameraState>(getInitialCameraForWorld(worldRef.current));
  const toolModeRef = useRef<ToolMode>({ kind: 'build', buildingType: 'road' });
  const hoverTileRef = useRef<{ gx: number; gy: number } | null>(null);
  const selectedBuildingIdRef = useRef<number | null>(null);
  const selectedCartIdRef = useRef<number | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());

  const dragStateRef = useRef<{
    active: boolean;
    button: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    paintMode: boolean;
    lastPaintedKey: string;
  }>({
    active: false,
    button: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    paintMode: false,
    lastPaintedKey: '',
  });

  const isTitle = phase === 'title';
  const [activeCategory, setActiveCategory] = useState<BuildCategory>('logistics');
  const [toolMode, setToolMode] = useState<ToolMode>(toolModeRef.current);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const ledgerOpenRef = useRef(false);
  useEffect(() => {
    ledgerOpenRef.current = ledgerOpen;
  }, [ledgerOpen]);
  const [muted, setMuted] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() => hasLocalSave());
  const [saveFeedback, setSaveFeedback] = useState<'Guardado' | 'Error' | null>(null);
  useEffect(() => {
    if (saveFeedback !== 'Guardado') return;
    const timer = window.setTimeout(() => setSaveFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);
  const [placementTooltip, setPlacementTooltip] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSection | null>(null);
  useEffect(() => {
    if (ledgerOpen || objectivesOpen || guideSection || confirmRequest) keysPressedRef.current.clear();
  }, [ledgerOpen, objectivesOpen, guideSection, confirmRequest]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const nextToastIdRef = useRef(1);
  const victorySoundPlayedRef = useRef(false);
  const toastCooldownRef = useRef<Map<string, number>>(new Map());
  const toastTimersRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
    toastCooldownRef.current.clear();
    setToasts([]);
  }, []);

  const pushToasts = useCallback(
    (incoming: PendingGameNotification[]) => {
      if (incoming.length === 0) return;
      const now = Date.now();
      const accepted: ToastNotification[] = [];

      for (const item of incoming) {
        const lastShown = toastCooldownRef.current.get(item.dedupeKey);
        if (lastShown !== undefined && now - lastShown < 4000) {
          continue;
        }
        toastCooldownRef.current.set(item.dedupeKey, now);
        accepted.push({
          ...item,
          id: nextToastIdRef.current++,
          createdAt: now,
        });
      }

      if (accepted.length === 0) return;

      const hasCritical = accepted.some((t) => t.severity === 'critical');
      romanAudio.playAlert(hasCritical);

      setToasts((prev) => {
        const merged = [...prev, ...accepted];
        if (merged.length > 3) {
          const evicted = merged.slice(0, merged.length - 3);
          for (const ev of evicted) {
            const t = toastTimersRef.current.get(ev.id);
            if (t !== undefined) {
              window.clearTimeout(t);
              toastTimersRef.current.delete(ev.id);
            }
          }
          return merged.slice(-3);
        }
        return merged;
      });

      for (const toast of accepted) {
        const ms = toast.durationMs ?? 5500;
        const timer = window.setTimeout(() => {
          toastTimersRef.current.delete(toast.id);
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, ms);
        toastTimersRef.current.set(toast.id, timer);
      }
    },
    [],
  );

  const drainWorldNotifications = useCallback(() => {
    const queue = worldRef.current.pendingNotifications;
    if (queue.length > 0) {
      const batch = queue.splice(0, queue.length);
      pushToasts(batch);
    }
  }, [pushToasts]);

  const drainNotificationsRef = useRef(drainWorldNotifications);
  useEffect(() => {
    drainNotificationsRef.current = drainWorldNotifications;
  }, [drainWorldNotifications]);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  const [hud, setHud] = useState<HudSnapshot>(() =>
    buildHudSnapshot(
      worldRef.current,
      phaseRef.current,
      speedRef.current,
      selectedBuildingIdRef.current,
      selectedCartIdRef.current,
    ),
  );

  const syncHudNow = useCallback(() => {
    setHud(
      buildHudSnapshot(
        worldRef.current,
        phaseRef.current,
        speedRef.current,
        selectedBuildingIdRef.current,
        selectedCartIdRef.current,
      ),
    );
  }, []);

  const applyPhase = useCallback(
    (next: GamePhase) => {
      phaseRef.current = next;
      setPhase(next);
      document.body.dataset.state = next;
      keysPressedRef.current.clear();
      if (next === 'playing') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        canvasRef.current?.focus();
      }
      syncHudNow();
    },
    [syncHudNow],
  );

  useEffect(() => {
    document.body.dataset.state = phaseRef.current;
  }, []);

  const handleSelectTool = useCallback((mode: ToolMode) => {
    toolModeRef.current = mode;
    setToolMode(mode);
    setPlacementTooltip(null);
    romanAudio.playClick();
  }, []);

  const handleSelectCategory = useCallback((category: BuildCategory) => {
    setActiveCategory(category);
    const group = BUILD_MENU_GROUPS.find((item) => item.category === category);
    const tool = toolModeRef.current;
    if (group && (tool.kind !== 'build' || !group.items.includes(tool.buildingType))) {
      handleSelectTool({ kind: 'build', buildingType: group.items[0] });
    } else {
      romanAudio.playClick();
    }
  }, [handleSelectTool]);

  const handleSetSpeed = useCallback((speed: HudSnapshot['speed']) => {
    speedRef.current = speed;
    if (speed !== 0) lastRunningSpeedRef.current = speed;
    romanAudio.playClick();
    syncHudNow();
  }, [syncHudNow]);

  const handleToggleLedger = useCallback(() => {
    setLedgerOpen((open) => !open);
    romanAudio.playClick();
  }, []);

  const handleOpenObjectives = useCallback(() => {
    setLedgerOpen(false);
    setObjectivesOpen(true);
    romanAudio.playClick();
  }, []);

  const handleToggleMute = useCallback(() => setMuted(romanAudio.toggleMute()), []);

  const handleZoomBy = useCallback((factor: number) => {
    cameraRef.current.zoom = Math.min(2.2, Math.max(0.65, cameraRef.current.zoom * factor));
  }, []);

  const startNewGame = useCallback((requestedSeed?: number) => {
    let seed = requestedSeed;
    if (seed === undefined) {
      const randomSeed = new Uint32Array(1);
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(randomSeed);
        seed = randomSeed[0];
      } else {
        seed = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
      }
    }
    seed >>>= 0;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(seed));
      window.history.replaceState(null, '', url.toString());
    }
    const fresh = createStarterWorld(seed);
    recomputeStaticStatuses(fresh);
    worldRef.current = fresh;
    invalidateTerrainCache();
    cameraRef.current = getInitialCameraForWorld(fresh);
    speedRef.current = 1;
    lastRunningSpeedRef.current = 1;
    selectedBuildingIdRef.current = null;
    selectedCartIdRef.current = null;
    victorySoundPlayedRef.current = false;
    setActiveCategory('logistics');
    toolModeRef.current = { kind: 'build', buildingType: 'road' };
    setToolMode(toolModeRef.current);
    setPlacementTooltip(null);
    setLedgerOpen(false);
    setObjectivesOpen(false);
    setConfirmRequest(null);
    setSaveNotice(null);
    clearAllToasts();
    applyPhase('playing');
    romanAudio.playUpgrade();
  }, [applyPhase, clearAllToasts]);

  const continueSavedGame = useCallback(() => {
    const result = loadSavedGame();
    if (result.status === 'ok') {
      const loaded = result.world;
      worldRef.current = loaded;
      invalidateTerrainCache();
      cameraRef.current = getInitialCameraForWorld(loaded);
      speedRef.current = 1;
      lastRunningSpeedRef.current = 1;
      selectedBuildingIdRef.current = null;
      selectedCartIdRef.current = null;
      victorySoundPlayedRef.current = false;
      setLedgerOpen(false);
      setObjectivesOpen(false);
      setConfirmRequest(null);
      setSaveNotice(null);
      clearAllToasts();
      applyPhase('playing');
      romanAudio.playClick();
      if (result.recovered) {
        pushToasts([
          {
            kind: 'save_recovered',
            severity: 'warning',
            title: 'Partida recuperada',
            message:
              'La copia principal estaba dañada; se cargó el autoguardado anterior. Guarda de nuevo para fijar la partida.',
            dedupeKey: 'save_recovered',
            durationMs: 8000,
          },
        ]);
      }
    } else if (result.status === 'corrupt') {
      setSaveNotice(result.message);
    } else {
      startNewGame();
    }
  }, [applyPhase, clearAllToasts, pushToasts, startNewGame]);

  const handleSaveNow = useCallback(() => {
    const ok = saveWorldToLocal(worldRef.current);
    setHasSavedGame(hasLocalSave());
    setSaveFeedback(ok ? 'Guardado' : 'Error');
    romanAudio.playClick();
  }, []);

  const handleExportJson = useCallback(() => {
    const payload = serializeWorld(worldRef.current);
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurea-pax-partida.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportJson = useCallback(
    (raw: string) => {
      const imported = deserializeWorld(raw);
      worldRef.current = imported;
      invalidateTerrainCache();
      cameraRef.current = getInitialCameraForWorld(imported);
      selectedBuildingIdRef.current = null;
      selectedCartIdRef.current = null;
      victorySoundPlayedRef.current = false;
      setSaveNotice(null);
      clearAllToasts();
      const saved = saveWorldToLocal(imported);
      setSaveFeedback(saved ? 'Guardado' : 'Error');
      setHasSavedGame(hasLocalSave());
      applyPhase('playing');
    },
    [applyPhase, clearAllToasts],
  );

  const requestNewGame = useCallback((seed?: number) => {
    romanAudio.playClick();
    setConfirmRequest({
      title: 'Nueva colonia',
      message:
        'El autoguardado de la nueva colonia reemplazará tu partida. Para conservarla, exporta una copia desde el menú de pausa.',
      confirmLabel: 'Empezar de nuevo',
      onConfirm: () => {
        setConfirmRequest(null);
        startNewGame(seed);
      },
    });
  }, [startNewGame]);

  const requestDemolish = useCallback(
    (building: PlacedBuilding) => {
      setConfirmRequest({
        title: `Demoler ${BUILDINGS[building.type].name}`,
        message:
          'Se recuperará parte del coste, pero la estructura y su producción desaparecerán.',
        confirmLabel: 'Demoler',
        destructive: true,
        onConfirm: () => {
          setConfirmRequest(null);
          if (demolishAt(worldRef.current, building.x, building.y)) {
            romanAudio.playDemolish();
            selectedBuildingIdRef.current = null;
            drainWorldNotifications();
            syncHudNow();
          }
        },
      });
    },
    [drainWorldNotifications, syncHudNow],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select')) return;

      const key = event.key.toLowerCase();
      const currentPhase = phaseRef.current;
      const modalOpen = document.querySelector('dialog[open]') !== null;
      if (event.ctrlKey || event.metaKey) {
        // Let the browser handle its own shortcuts outside the active map.
        if (key === 's' && currentPhase === 'playing' && !modalOpen && !event.shiftKey) {
          event.preventDefault();
          if (!event.repeat) handleSaveNow();
        }
        return;
      }

      if (modalOpen) {
        if (event.repeat || confirmRequest) return;
        // Escape is handled by the topmost native dialog.
        if (guideSection) {
          if (key === SHORTCUTS.help) setGuideSection(null);
        } else if (ledgerOpen && key === SHORTCUTS.ledger) {
          handleToggleLedger();
        } else if (objectivesOpen && key === SHORTCUTS.objectives) {
          setObjectivesOpen(false);
        } else if (currentPhase === 'paused') {
          if (key === SHORTCUTS.help) setGuideSection('shortcuts');
          if (key === SHORTCUTS.pauseMenu) applyPhase('playing');
        }
        return;
      }

      if ((key === 'enter' || key === ' ') && target?.closest('button, a')) return;
      if (key === SHORTCUTS.help && (currentPhase === 'title' || currentPhase === 'playing')) {
        if (!event.repeat) setGuideSection('shortcuts');
        return;
      }
      if (currentPhase === 'title') {
        if (key === 'enter' || key === ' ') {
          event.preventDefault();
          if (event.repeat) return;
          if (hasSavedGame) continueSavedGame();
          else startNewGame();
        }
        return;
      }
      if (currentPhase !== 'playing') return;

      if (CAMERA_KEYS.has(key)) {
        event.preventDefault();
        keysPressedRef.current.add(key);
        return;
      }
      if (key === SHORTCUTS.zoomIn || key === '=' || key === SHORTCUTS.zoomOut) {
        event.preventDefault();
        handleZoomBy(key === SHORTCUTS.zoomOut ? 1 / 1.12 : 1.12);
        return;
      }
      if (key === SHORTCUTS.pauseSimulation) event.preventDefault();
      if (event.repeat) return;

      const building = BUILDING_SHORTCUTS.get(key);
      if (building) {
        setActiveCategory(building.category);
        handleSelectTool({ kind: 'build', buildingType: building.type });
        return;
      }

      switch (key) {
        case 'escape':
        case SHORTCUTS.pauseMenu:
          applyPhase('paused');
          break;
        case SHORTCUTS.pauseSimulation:
          handleSetSpeed(speedRef.current === 0 ? lastRunningSpeedRef.current : 0);
          break;
        case SHORTCUTS.changeSpeed:
          handleSetSpeed(speedRef.current === 1 ? 2 : speedRef.current === 2 ? 3 : 1);
          break;
        case SHORTCUTS.center:
          cameraRef.current = getInitialCameraForWorld(worldRef.current);
          hoverTileRef.current = null;
          setPlacementTooltip(null);
          break;
        case SHORTCUTS.save:
          handleSaveNow();
          break;
        case SHORTCUTS.ledger:
          handleToggleLedger();
          break;
        case SHORTCUTS.objectives:
          handleOpenObjectives();
          break;
        case SHORTCUTS.mute:
          handleToggleMute();
          break;
        case SHORTCUTS.inspect:
          handleSelectTool({ kind: 'inspect' });
          break;
        case SHORTCUTS.upgrade:
          handleSelectTool({ kind: 'upgrade' });
          break;
        case SHORTCUTS.demolish:
          handleSelectTool({ kind: 'demolish' });
          break;
        case SHORTCUTS.category: {
          const currentIndex = BUILD_MENU_GROUPS.findIndex((group) => group.category === activeCategory);
          const next = BUILD_MENU_GROUPS[(currentIndex + 1) % BUILD_MENU_GROUPS.length];
          handleSelectCategory(next.category);
          break;
        }
        case SHORTCUTS.building: {
          const group = BUILD_MENU_GROUPS.find((item) => item.category === activeCategory);
          if (!group) break;
          const tool = toolModeRef.current;
          const currentIndex = tool.kind === 'build' ? group.items.indexOf(tool.buildingType) : -1;
          handleSelectTool({ kind: 'build', buildingType: group.items[(currentIndex + 1) % group.items.length] });
          break;
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysPressedRef.current.delete(event.key.toLowerCase());
    };

    const clearHeld = () => {
      keysPressedRef.current.clear();
      dragStateRef.current.active = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', clearHeld);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', clearHeld);
    };
  }, [
    activeCategory,
    applyPhase,
    confirmRequest,
    continueSavedGame,
    guideSection,
    handleOpenObjectives,
    handleSaveNow,
    handleSelectCategory,
    handleSelectTool,
    handleSetSpeed,
    handleToggleLedger,
    handleToggleMute,
    handleZoomBy,
    hasSavedGame,
    ledgerOpen,
    objectivesOpen,
    startNewGame,
  ]);

  // Main 60 FPS Canvas mount & simulation loop (mounted once!)
  useEffect(() => {
    const canvas = canvasRef.current;
    const mount = mountRef.current;
    if (isTitle || !canvas || !mount) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = mount.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(mount);

    let rafId = 0;
    let lastTime = performance.now();
    let lastRenderTime = 0;
    let lastRenderCostMs = 0;
    let hudSyncAccum = 0;
    let autoSaveAccum = 0;
    const weatherParticles = new WeatherParticlePool();

    const tick = (now: number) => {
      // Skip busy redraws when covered by Pause/Ledger/GameOver modal, paused at 0x, or on slow software renderers
      if (
        (phaseRef.current === 'paused' || phaseRef.current === 'gameover' || ledgerOpenRef.current) &&
        now - lastRenderTime < 250
      ) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (
        phaseRef.current === 'playing' &&
        speedRef.current === 0 &&
        keysPressedRef.current.size === 0 &&
        !dragStateRef.current.active &&
        now - lastRenderTime < 120
      ) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (lastRenderCostMs > 4 && now - lastRenderTime < 45) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      const timeSec = now / 1000;

      const world = worldRef.current;
      const currPhase = phaseRef.current;

      if (currPhase === 'playing') {
        // Keyboard panning (WASD / Arrow keys)
        const panSpeed = 380 / cameraRef.current.zoom;
        const keys = keysPressedRef.current;
        if (keys.has('w') || keys.has('arrowup')) cameraRef.current.y -= panSpeed * dt;
        if (keys.has('s') || keys.has('arrowdown')) cameraRef.current.y += panSpeed * dt;
        if (keys.has('a') || keys.has('arrowleft')) cameraRef.current.x -= panSpeed * dt;
        if (keys.has('d') || keys.has('arrowright')) cameraRef.current.x += panSpeed * dt;

        const simDt = dt * speedRef.current;
        if (simDt > 0) {
          stepSimulation(world, simDt);
          drainNotificationsRef.current();
        }

        if (world.victoryAchieved && !world.victoryDismissed) {
          if (!victorySoundPlayedRef.current) {
            romanAudio.playVictory();
            victorySoundPlayedRef.current = true;
          }
          applyPhase('gameover');
        } else if (world.bankrupt) {
          applyPhase('gameover');
        }

        autoSaveAccum += dt;
        if (autoSaveAccum >= 25) {
          autoSaveAccum = 0;
          const saved = saveWorldToLocal(world);
          setSaveFeedback(previous => saved ? (previous === 'Error' ? null : previous) : 'Error');
          setHasSavedGame(hasLocalSave());
        }

        hudSyncAccum += dt;
        if (hudSyncAccum >= 0.22) {
          hudSyncAccum = 0;
          syncHudNow();
        }
      }

      const renderStart = performance.now();
      const rect = mount.getBoundingClientRect();
      const particleDt = currPhase === 'playing' && speedRef.current > 0
        ? dt * (0.7 + speedRef.current * 0.3) : 0;
      if (!reducedMotionRef.current) {
        weatherParticles.update(
          particleDt,
          world.weather.kind,
          world.weather.intensity,
          rect.width,
          rect.height,
        );
      }
      renderWorld(
        ctx,
        rect.width,
        rect.height,
        world,
        cameraRef.current,
        currPhase === 'playing' ? hoverTileRef.current : null,
        toolModeRef.current,
        selectedBuildingIdRef.current,
        selectedCartIdRef.current,
        timeSec,
      );
      weatherParticles.render(
        ctx,
        world.weather.kind,
        world.weather.intensity,
        rect.width,
        rect.height,
      );
      renderDayNightOverlay(
        ctx,
        rect.width,
        rect.height,
        world,
        cameraRef.current,
        timeSec,
      );
      lastRenderTime = performance.now();
      lastRenderCostMs = lastRenderTime - renderStart;

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [applyPhase, isTitle, syncHudNow]);

  // Persist when the tab is hidden or closed so the last autosave window is not lost.
  useEffect(() => {
    const persist = () => {
      if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
        saveWorldToLocal(worldRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const applyTileAction = useCallback(
    (gx: number, gy: number, clientX: number, clientY: number, isDragPaint: boolean) => {
      const world = worldRef.current;
      const mode = toolModeRef.current;

      if (!inBounds(gx, gy, world.width, world.height)) return;

      if (mode.kind === 'build') {
        if (isDragPaint && mode.buildingType !== 'road') return;
        const res = placeBuilding(world, mode.buildingType, gx, gy);
        if (res.ok) {
          romanAudio.playBuild(mode.buildingType === 'road');
          setPlacementTooltip(null);
          if (res.building) {
            selectedBuildingIdRef.current = res.building.id;
            selectedCartIdRef.current = null;
          }
          syncHudNow();
        } else if (!isDragPaint && res.reason) {
          setPlacementTooltip(res.reason);
          if (
            res.reason.startsWith('Faltan denarios') ||
            res.reason.startsWith('Falta madera') ||
            res.reason.startsWith('Falta piedra')
          ) {
            pushToasts([
              {
                kind: 'resource_shortage',
                severity: 'warning',
                title: 'Recursos insuficientes',
                message: `${res.reason} para construir ${BUILDINGS[mode.buildingType].name}.`,
                dedupeKey: `build_shortage:${mode.buildingType}:${res.reason}`,
                durationMs: 4500,
              },
            ]);
          }
        }
        return;
      }

      if (mode.kind === 'demolish') {
        const demolishTile = world.tiles[getTileIndex(gx, gy, world.width)];
        if (demolishTile.buildingId !== null) {
          if (isDragPaint) return;
          const building = world.buildings.find((b) => b.id === demolishTile.buildingId);
          if (building) requestDemolish(building);
          return;
        }
        if (demolishAt(world, gx, gy)) {
          romanAudio.playDemolish();
          selectedBuildingIdRef.current = null;
          drainWorldNotifications();
          syncHudNow();
        }
        return;
      }

      if (mode.kind === 'upgrade') {
        const tile = world.tiles[getTileIndex(gx, gy, world.width)];
        if (tile.buildingId !== null) {
          const b = world.buildings.find((item) => item.id === tile.buildingId);
          if (b) {
            const check = canUpgradeHouse(world, b);
            if (check.ok && upgradeHouse(world, b.id)) {
              romanAudio.playUpgrade();
              syncHudNow();
            } else if (!check.ok && check.reason && check.reason.startsWith('Falta')) {
              pushToasts([
                {
                  kind: 'resource_shortage',
                  severity: 'warning',
                  title: 'Recursos insuficientes',
                  message: `${check.reason} para ascender a Insula.`,
                  dedupeKey: `upgrade_shortage:${check.reason}`,
                  x: b.x,
                  y: b.y,
                  buildingId: b.id,
                  durationMs: 4500,
                },
              ]);
            }
          }
        }
        return;
      }

      // Inspect mode: check cart near pointer first, then tile building
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cart = findCartNearScreenPoint(world, clientX, clientY, rect, cameraRef.current);
        if (cart) {
          selectedCartIdRef.current = cart.id;
          selectedBuildingIdRef.current = null;
          romanAudio.playClick();
          syncHudNow();
          return;
        }
      }

      const tile = world.tiles[getTileIndex(gx, gy, world.width)];
      if (tile.buildingId !== null) {
        selectedBuildingIdRef.current = tile.buildingId;
        selectedCartIdRef.current = null;
        romanAudio.playClick();
      } else {
        selectedBuildingIdRef.current = null;
        selectedCartIdRef.current = null;
      }
      syncHudNow();
    },
    [drainWorldNotifications, pushToasts, requestDemolish, syncHudNow],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { gx, gy } = screenToGrid(e.clientX, e.clientY, rect, cameraRef.current);
    hoverTileRef.current = { gx, gy };

    // Right click resets to inspect mode if in build/demolish, or pans if dragged
    const mode = toolModeRef.current;
    const isRoadOrDemolish =
      (mode.kind === 'build' && mode.buildingType === 'road') || mode.kind === 'demolish';

    canvas.setPointerCapture(e.pointerId);
    const paintMode = e.button === 0 && isRoadOrDemolish && e.pointerType !== 'touch';
    dragStateRef.current = {
      active: true,
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      paintMode,
      lastPaintedKey: '',
    };

    if (paintMode) {
      dragStateRef.current.lastPaintedKey = `${gx},${gy}`;
      applyTileAction(gx, gy, e.clientX, e.clientY, false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { gx, gy } = screenToGrid(e.clientX, e.clientY, rect, cameraRef.current);
    hoverTileRef.current = { gx, gy };

    const tip = getPlacementTooltip(worldRef.current, toolModeRef.current, hoverTileRef.current);
    if (tip !== placementTooltip) {
      setPlacementTooltip(tip);
    }

    const drag = dragStateRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) {
      drag.moved = true;
    }

    if (drag.paintMode && drag.button === 0) {
      const key = `${gx},${gy}`;
      if (key !== drag.lastPaintedKey) {
        drag.lastPaintedKey = key;
        applyTileAction(gx, gy, e.clientX, e.clientY, true);
      }
    } else if (drag.button === 2 || drag.button === 1 || drag.button === 0) {
      // Pan camera smoothly
      if (drag.moved) {
        cameraRef.current.x -= dx / cameraRef.current.zoom;
        cameraRef.current.y -= dy / cameraRef.current.zoom;
      }
    }

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!e.isPrimary || !drag.active) return;
    drag.active = false;

    if (!e.isPrimary || phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { gx, gy } = screenToGrid(e.clientX, e.clientY, rect, cameraRef.current);

    if (e.button === 2 && !drag.moved) {
      if (toolModeRef.current.kind !== 'inspect') {
        handleSelectTool({ kind: 'inspect' });
      }
      return;
    }

    if (e.button === 0 && !drag.moved && !drag.paintMode) {
      applyTileAction(gx, gy, e.clientX, e.clientY, false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
    if (e.deltaY !== 0) handleZoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const handleUpgradeFromInspector = (id: number) => {
    if (upgradeHouse(worldRef.current, id)) {
      romanAudio.playUpgrade();
      syncHudNow();
    }
  };

  const handleExtinguishFromInspector = (id: number) => {
    if (extinguishFire(worldRef.current, id)) {
      romanAudio.playClick();
      syncHudNow();
    } else {
      pushToasts([
        {
          kind: 'resource_shortage',
          severity: 'warning',
          title: 'Sin denarios para la brigada',
          message: `Extinguir el incendio cuesta ${EXTINGUISH_COST} denarios.`,
          dedupeKey: 'extinguish_no_funds',
          durationMs: 4000,
        },
      ]);
    }
  };

  const handleSowFromInspector = (id: number) => {
    if (sowWheatFarm(worldRef.current, id)) {
      romanAudio.playBuild(false);
      syncHudNow();
    } else {
      pushToasts([
        {
          kind: 'resource_shortage',
          severity: 'warning',
          title: 'Sin trigo para sembrar',
          message: `Necesitas ${WHEAT_SOW_COST} Trigo en el Horreum para volver a sembrar el campo.`,
          dedupeKey: 'sow_no_wheat',
          durationMs: 4000,
        },
      ]);
    }
  };

  const objectives = getObjectives(worldRef.current);
  const objectivesDone = objectives.filter((o) => o.done).length;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#18252d]">
      <div ref={mountRef} className="w-full h-full">
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          role="application"
          aria-label="Mapa del asentamiento romano"
          tabIndex={isTitle ? -1 : 0}
          aria-hidden={isTitle}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragStateRef.current.active = false; }}
          onLostPointerCapture={() => { dragStateRef.current.active = false; }}
          onPointerLeave={() => {
            dragStateRef.current.active = false;
            hoverTileRef.current = null;
          }}
          onWheel={handleWheel}
          className="block w-full h-full outline-none cursor-crosshair touch-none"
        />
      </div>

      {phase === 'title' && (
        <TitleOverlay
          hasSavedGame={hasSavedGame}
          notice={saveNotice}
          initialSeed={worldRef.current.seed}
          onStartNew={(seed) => hasSavedGame ? requestNewGame(seed) : startNewGame(seed)}
          onContinue={continueSavedGame}
          onOpenGuide={() => setGuideSection('guide')}
        />
      )}

      {phase !== 'title' && (
        <GameHud
          hud={hud}
          activeCategory={activeCategory}
          onSelectCategory={handleSelectCategory}
          toolMode={toolMode}
          onSelectTool={handleSelectTool}
          onSetSpeed={handleSetSpeed}
          onToggleLedger={handleToggleLedger}
          onSaveNow={handleSaveNow}
          onOpenPauseMenu={() => applyPhase('paused')}
          onUpgradeAll={() => {
            const count = upgradeAllReadyHouses(worldRef.current);
            if (count > 0) {
              romanAudio.playUpgrade();
              syncHudNow();
            }
          }}
          onToggleAutoUpgrade={() => {
            worldRef.current.autoUpgradeHouses = !worldRef.current.autoUpgradeHouses;
            romanAudio.playClick();
            syncHudNow();
          }}
          muted={muted}
          onToggleMute={handleToggleMute}
          saveFeedback={saveFeedback}
          placementTooltip={placementTooltip}
          objectivesDone={objectivesDone}
          objectivesTotal={objectives.length}
          onOpenObjectives={handleOpenObjectives}
          onZoom={handleZoomBy}
        >
          {phase === 'playing' && !ledgerOpen && !objectivesOpen && (
            <>
              <ToastStack
                toasts={toasts}
                onDismiss={dismissToast}
                onFocus={(toast) => {
                  if (toast.x !== undefined && toast.y !== undefined) {
                    const iso = gridToIso(toast.x, toast.y);
                    cameraRef.current.x = iso.x;
                    cameraRef.current.y = iso.y;
                    if (toast.buildingId !== undefined) {
                      selectedBuildingIdRef.current = toast.buildingId;
                      selectedCartIdRef.current = null;
                      syncHudNow();
                    }
                  }
                }}
              />

              <InspectorPanel
                hud={hud}
                building={hud.selectedBuilding}
                cart={hud.selectedCart}
                allBuildings={worldRef.current.buildings}
                onClose={() => {
                  selectedBuildingIdRef.current = null;
                  selectedCartIdRef.current = null;
                  syncHudNow();
                }}
                onUpgradeBuilding={handleUpgradeFromInspector}
                onExtinguishFire={handleExtinguishFromInspector}
                onSowWheat={handleSowFromInspector}
                onDemolishBuilding={requestDemolish}
              />
            </>
          )}
        </GameHud>
      )}

      {phase === 'playing' && (
        <BalanceLedgerModal
          open={ledgerOpen}
          hud={hud}
          onClose={() => setLedgerOpen(false)}
          onFocusTile={(x, y, buildingId) => {
            const iso = gridToIso(x, y);
            cameraRef.current.x = iso.x;
            cameraRef.current.y = iso.y;
            selectedBuildingIdRef.current = buildingId;
            selectedCartIdRef.current = null;
            syncHudNow();
          }}
        />
      )}

      {phase === 'playing' && objectivesOpen && (
        <ObjectivesModal
          world={worldRef.current}
          onClose={() => setObjectivesOpen(false)}
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          onResume={() => applyPhase('playing')}
          onOpenGuide={() => setGuideSection('shortcuts')}
          onSaveLocal={() => {
            const ok = saveWorldToLocal(worldRef.current);
            setHasSavedGame(hasLocalSave());
            return ok;
          }}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onRestart={requestNewGame}
          onReturnTitle={() => applyPhase('title')}
        />
      )}

      {phase === 'gameover' && (
        <OutcomeModal
          hud={hud}
          onContinueSandbox={() => {
            worldRef.current.victoryDismissed = true;
            applyPhase('playing');
          }}
          onRestart={requestNewGame}
        />
      )}

      {guideSection && (
        <GuideModal
          section={guideSection}
          onSelectSection={setGuideSection}
          onClose={() => setGuideSection(null)}
        />
      )}

      {confirmRequest && (
        <ConfirmModal
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          destructive={confirmRequest.destructive}
          onConfirm={confirmRequest.onConfirm}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
    </main>
  );
}
