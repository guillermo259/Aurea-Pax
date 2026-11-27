export const DAY_CYCLE_SECONDS = 600;

export type DayPhaseKind = 'dawn' | 'day' | 'dusk' | 'night';

export interface DaylightColorFilter {
  r: number;
  g: number;
  b: number;
  alpha: number;
  nightFactor: number;
  cssColor: string;
}

export interface DayPhaseInfo {
  phase: DayPhaseKind;
  label: string;
  hour: number;
  minute: number;
  clockText: string;
}

interface ColorKeyframe {
  hour: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  nightFactor: number;
}

const KEYFRAMES: ColorKeyframe[] = [
  { hour: 0.0, r: 12, g: 18, b: 44, alpha: 0.56, nightFactor: 1.0 },
  { hour: 4.5, r: 16, g: 22, b: 50, alpha: 0.52, nightFactor: 0.94 },
  { hour: 5.75, r: 84, g: 46, b: 68, alpha: 0.32, nightFactor: 0.55 },
  { hour: 6.75, r: 198, g: 122, b: 66, alpha: 0.14, nightFactor: 0.2 },
  { hour: 8.0, r: 245, g: 215, b: 160, alpha: 0.0, nightFactor: 0.0 },
  { hour: 16.75, r: 245, g: 205, b: 145, alpha: 0.0, nightFactor: 0.0 },
  { hour: 18.0, r: 204, g: 98, b: 44, alpha: 0.22, nightFactor: 0.32 },
  { hour: 19.25, r: 82, g: 42, b: 74, alpha: 0.4, nightFactor: 0.72 },
  { hour: 20.5, r: 14, g: 20, b: 48, alpha: 0.54, nightFactor: 0.96 },
  { hour: 24.0, r: 12, g: 18, b: 44, alpha: 0.56, nightFactor: 1.0 },
];

export function normalizeDayTime(dayTime: number): number {
  const mod = dayTime % 1;
  return mod < 0 ? mod + 1 : mod;
}

export function getDaylightColorFilter(dayTime: number): DaylightColorFilter {
  const hour = normalizeDayTime(dayTime) * 24;

  let k0 = KEYFRAMES[0];
  let k1 = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (hour >= KEYFRAMES[i].hour && hour <= KEYFRAMES[i + 1].hour) {
      k0 = KEYFRAMES[i];
      k1 = KEYFRAMES[i + 1];
      break;
    }
  }

  const span = Math.max(0.0001, k1.hour - k0.hour);
  const rawT = Math.min(1, Math.max(0, (hour - k0.hour) / span));
  // Smoothstep for gentle twilight transitions
  const t = rawT * rawT * (3 - 2 * rawT);

  const r = Math.round(k0.r + (k1.r - k0.r) * t);
  const g = Math.round(k0.g + (k1.g - k0.g) * t);
  const b = Math.round(k0.b + (k1.b - k0.b) * t);
  const alpha = k0.alpha + (k1.alpha - k0.alpha) * t;
  const nightFactor = k0.nightFactor + (k1.nightFactor - k0.nightFactor) * t;

  return {
    r,
    g,
    b,
    alpha,
    nightFactor,
    cssColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`,
  };
}

export function getDayPhaseInfo(dayTime: number): DayPhaseInfo {
  const totalMinutes = Math.floor(normalizeDayTime(dayTime) * 24 * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const clockText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const hFloat = totalMinutes / 60;
  let phase: DayPhaseKind = 'day';
  let label = 'Día';

  if (hFloat >= 5.25 && hFloat < 8.0) {
    phase = 'dawn';
    label = 'Amanecer';
  } else if (hFloat >= 8.0 && hFloat < 17.25) {
    phase = 'day';
    label = 'Día';
  } else if (hFloat >= 17.25 && hFloat < 20.25) {
    phase = 'dusk';
    label = 'Atardecer';
  } else {
    phase = 'night';
    label = 'Noche';
  }

  return {
    phase,
    label,
    hour,
    minute,
    clockText,
  };
}
