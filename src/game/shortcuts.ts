import { BUILDINGS } from './catalog';

export const SHORTCUTS = {
  help: 'h',
  center: 'c',
  zoomIn: '+',
  zoomOut: '-',
  pauseMenu: 'p',
  pauseSimulation: ' ',
  changeSpeed: 'v',
  save: 'g',
  ledger: 'b',
  objectives: 'o',
  mute: 'm',
  category: 'f',
  building: 'e',
  inspect: 'q',
  upgrade: 'u',
  demolish: 'x',
} as const;

export const CAMERA_KEYS = new Set([
  'w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright',
]);

export const BUILDING_SHORTCUTS = new Map(
  Object.values(BUILDINGS).flatMap((building) => building.hotkey ? [[building.hotkey, building] as const] : []),
);
