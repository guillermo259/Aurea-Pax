import {
  Castle01Icon,
  Hammer01Icon,
  Road01Icon,
  WheatIcon,
} from '@hugeicons/core-free-icons';
import { BuildCategory } from '../game/types';
import type { IconData } from './HugeIcon';

export const CATEGORY_ICONS: Record<BuildCategory, IconData> = {
  logistics: Road01Icon,
  civic: Castle01Icon,
  food: WheatIcon,
  industry: Hammer01Icon,
};

export const CATEGORY_SHORT_LABELS: Record<BuildCategory, string> = {
  logistics: 'Vías',
  civic: 'Civismo',
  food: 'Alimentos',
  industry: 'Talleres',
};
