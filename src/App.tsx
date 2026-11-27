import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BalanceLedgerModal } from './components/BalanceLedgerModal';
import { GameHud } from './components/GameHud';
import { InspectorPanel } from './components/InspectorPanel';
import { OutcomeModal } from './components/OutcomeModal';
import { PauseModal } from './components/PauseModal';
import { TitleOverlay } from './components/TitleOverlay';
import { ToastStack } from './components/ToastStack';
import { romanAudio } from './game/audio';
import { BUILDINGS } from './game/catalog';
import { normalizeDayTime } from './game/dayCycle';
import {
  CameraState,
  findCartNearScreenPoint,
  getInitialCameraForWorld,
  getPlacementTooltip,
  gridToIso,
  renderDayNightOverlay,
  renderWorld,
  screenToGrid,
} from './game/isoRenderer';
import { createStarterWorld, getTileIndex, inBounds } from './game/mapGen';
import {
  deserializeWorld,
  hasLocalSave,
  loadWorldFromLocal,
  saveWorldToLocal,
  serializeWorld,
} from './game/persistence';
import {
  buildHudSnapshot,
  canUpgradeHouse,
  demolishAt,
  extinguishFire,
  placeBuilding,
  recomputeStaticStatuses,
  stepSimulation,
  upgradeAllReadyHouses,
  upgradeHouse,
} from './game/simulation';
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

const HOTKEY_TO_BUILDING: Record<string, { cat: BuildCategory; type: BuildingType }> = {
  '1': { cat: 'logistics', type: 'road' },
  '2': { cat: 'logistics', type: 'horreum' },
  '3': { cat: 'logistics', type: 'market' },
  '4': { cat: 'civic', type: 'house_liberti' },
  '5': { cat: 'civic', type: 'fountain' },
  '6': { cat: 'civic', type: 'temple' },
  '7': { cat: 'civic', type: 'forum' },
  '8': { cat: 'food', type: 'wheat_farm' },
  '9': { cat: 'food', type: 'mill' },
  '0': { cat: 'food', type: 'bakery' },
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialWorldRef = useRef<WorldState | null>(null);
  if (!initialWorldRef.current) {
    const w = createStarterWorld(11701);
    const paramDayTime = getInitialDayTimeParam();
    if (paramDayTime !== null) {
      w.dayTime = paramDayTime;
    }
    recomputeStaticStatuses(w);
    initialWorldRef.current = w;
  }

  const worldRef = useRef<WorldState>(initialWorldRef.current);
  const phaseRef = useRef<GamePhase>(shouldAutostart() ? 'playing' : 'title');
  const speedRef = useRef<0 | 1 | 2 | 3>(1);
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

  const [phase, setPhase] = useState<GamePhase>(phaseRef.current);
  const [activeCategory, setActiveCategory] = useState<BuildCategory>('logistics');
  const [toolMode, setToolMode] = useState<ToolMode>(toolModeRef.current);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const ledgerOpenRef = useRef(false);
  useEffect(() => {
    ledgerOpenRef.current = ledgerOpen;
  }, [ledgerOpen]);
  const [muted, setMuted] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() => hasLocalSave());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [placementTooltip, setPlacementTooltip] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const nextToastIdRef = useRef(1);
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

  const startNewGame = useCallback(() => {
    const fresh = createStarterWorld(11701);
    recomputeStaticStatuses(fresh);
    worldRef.current = fresh;
    cameraRef.current = getInitialCameraForWorld(fresh);
    speedRef.current = 1;
    selectedBuildingIdRef.current = null;
    selectedCartIdRef.current = null;
    setLedgerOpen(false);
    clearAllToasts();
    applyPhase('playing');
    romanAudio.playUpgrade();
  }, [applyPhase, clearAllToasts]);

  const continueSavedGame = useCallback(() => {
    const loaded = loadWorldFromLocal();
    if (loaded) {
      worldRef.current = loaded.world;
      cameraRef.current = getInitialCameraForWorld(loaded.world);
      speedRef.current = 1;
      selectedBuildingIdRef.current = null;
      selectedCartIdRef.current = null;
      setLedgerOpen(false);
      clearAllToasts();
      applyPhase('playing');
      romanAudio.playClick();
    } else {
      startNewGame();
    }
  }, [applyPhase, clearAllToasts, startNewGame]);

  const handleSaveNow = useCallback(() => {
    const ok = saveWorldToLocal(worldRef.current);
    setHasSavedGame(hasLocalSave());
    setSaveFeedback(ok ? 'Guardado' : 'Error');
    romanAudio.playClick();
    window.setTimeout(() => setSaveFeedback(null), 1600);
  }, []);

  const handleExportJson = useCallback(() => {
    const payload = serializeWorld(worldRef.current);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
      cameraRef.current = getInitialCameraForWorld(imported);
      selectedBuildingIdRef.current = null;
      selectedCartIdRef.current = null;
      clearAllToasts();
      saveWorldToLocal(imported);
      setHasSavedGame(true);
      applyPhase('playing');
    },
    [applyPhase, clearAllToasts],
  );

  // Keyboard shortcuts & camera movement keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      if (phaseRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startNewGame();
        }
        return;
      }

      if (e.key === 'Escape' || key === 'p') {
        e.preventDefault();
        if (ledgerOpen) {
          setLedgerOpen(false);
          return;
        }
        if (phaseRef.current === 'playing') {
          applyPhase('paused');
        } else if (phaseRef.current === 'paused') {
          applyPhase('playing');
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      keysPressedRef.current.add(key);

      if (key === 'b') {
        e.preventDefault();
        setLedgerOpen((prev) => !prev);
      } else if (key === 'm') {
        setMuted(romanAudio.toggleMute());
      } else if (key === 'q') {
        handleSelectTool({ kind: 'inspect' });
      } else if (key === 'u') {
        handleSelectTool({ kind: 'upgrade' });
      } else if (key === 'x') {
        handleSelectTool({ kind: 'demolish' });
      } else if (key === ' ') {
        e.preventDefault();
        speedRef.current = speedRef.current === 0 ? 1 : 0;
        syncHudNow();
      } else if (HOTKEY_TO_BUILDING[key]) {
        const entry = HOTKEY_TO_BUILDING[key];
        setActiveCategory(entry.cat);
        handleSelectTool({ kind: 'build', buildingType: entry.type });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
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
  }, [applyPhase, handleSelectTool, ledgerOpen, startNewGame, syncHudNow]);

  // Main 60 FPS Canvas mount & simulation loop (mounted once!)
  useEffect(() => {
    const canvas = canvasRef.current;
    const mount = mountRef.current;
    if (!canvas || !mount) return;
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
    let victorySoundPlayed = false;
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

      if (currPhase === 'title') {
        // Gentle live camera tour shifted left in camera coords so village frames cleanly on the right 60%
        const anchor = gridToIso(18.5, 23.5);
        cameraRef.current.x = anchor.x - 165 + Math.sin(timeSec * 0.2) * 55;
        cameraRef.current.y = anchor.y + Math.cos(timeSec * 0.17) * 35;
        cameraRef.current.zoom = 1.24;
        stepSimulation(world, dt * 0.8);
        world.pendingNotifications.length = 0;
      } else if (currPhase === 'playing') {
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
          if (!victorySoundPlayed) {
            romanAudio.playVictory();
            victorySoundPlayed = true;
          }
          applyPhase('gameover');
        } else if (world.bankrupt) {
          applyPhase('gameover');
        }

        autoSaveAccum += dt;
        if (autoSaveAccum >= 25) {
          autoSaveAccum = 0;
          saveWorldToLocal(world);
          setHasSavedGame(true);
        }

        hudSyncAccum += dt;
        if (hudSyncAccum >= 0.22) {
          hudSyncAccum = 0;
          syncHudNow();
        }
      }

      const renderStart = performance.now();
      const rect = mount.getBoundingClientRect();
      const particleDt =
        currPhase === 'title'
          ? dt * 0.8
          : currPhase === 'playing' && speedRef.current > 0
            ? dt * (0.7 + speedRef.current * 0.3)
            : 0;
      weatherParticles.update(
        particleDt,
        world.weather.kind,
        world.weather.intensity,
        rect.width,
        rect.height,
      );
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
  }, [applyPhase, syncHudNow]);

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
    [drainWorldNotifications, pushToasts, syncHudNow],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { gx, gy } = screenToGrid(e.clientX, e.clientY, rect, cameraRef.current);
    hoverTileRef.current = { gx, gy };

    // Right click resets to inspect mode if in build/demolish, or pans if dragged
    const mode = toolModeRef.current;
    const isRoadOrDemolish =
      (mode.kind === 'build' && mode.buildingType === 'road') || mode.kind === 'demolish';

    dragStateRef.current = {
      active: true,
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      paintMode: e.button === 0 && isRoadOrDemolish,
      lastPaintedKey: '',
    };

    if (e.button === 0 && isRoadOrDemolish) {
      dragStateRef.current.lastPaintedKey = `${gx},${gy}`;
      applyTileAction(gx, gy, e.clientX, e.clientY, false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
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
    if (!drag.active) return;
    drag.active = false;

    if (phaseRef.current !== 'playing') return;
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
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    cameraRef.current.zoom = Math.min(2.2, Math.max(0.65, cameraRef.current.zoom * factor));
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
    }
  };

  const handleDemolishFromInspector = (b: PlacedBuilding) => {
    if (demolishAt(worldRef.current, b.x, b.y)) {
      romanAudio.playDemolish();
      selectedBuildingIdRef.current = null;
      drainWorldNotifications();
      syncHudNow();
    }
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#18252d]">
      <div ref={mountRef} className="w-full h-full">
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          tabIndex={0}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            dragStateRef.current.active = false;
            hoverTileRef.current = null;
          }}
          onWheel={handleWheel}
          className="block w-full h-full outline-none cursor-crosshair"
        />
      </div>

      {phase === 'title' && (
        <TitleOverlay
          hasSavedGame={hasSavedGame}
          onStartNew={startNewGame}
          onContinue={continueSavedGame}
        />
      )}

      {phase !== 'title' && (
        <GameHud
          hud={hud}
          activeCategory={activeCategory}
          onSelectCategory={(cat) => {
            setActiveCategory(cat);
            romanAudio.playClick();
          }}
          toolMode={toolMode}
          onSelectTool={handleSelectTool}
          onSetSpeed={(spd) => {
            speedRef.current = spd;
            romanAudio.playClick();
            syncHudNow();
          }}
          onToggleLedger={() => {
            setLedgerOpen((prev) => !prev);
            romanAudio.playClick();
          }}
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
          onToggleMute={() => setMuted(romanAudio.toggleMute())}
          saveFeedback={saveFeedback}
          placementTooltip={placementTooltip}
        />
      )}

      {phase === 'playing' && !ledgerOpen && (
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
      )}

      {phase === 'playing' && !ledgerOpen && (
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
          onDemolishBuilding={handleDemolishFromInspector}
        />
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

      {phase === 'paused' && (
        <PauseModal
          onResume={() => applyPhase('playing')}
          onSaveLocal={() => {
            saveWorldToLocal(worldRef.current);
            setHasSavedGame(true);
          }}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onRestart={startNewGame}
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
          onRestart={startNewGame}
        />
      )}
    </main>
  );
}
