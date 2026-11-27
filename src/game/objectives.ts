import { WHEAT_HARVESTS_PER_SOWING } from './catalog';
import { WorldState } from './types';

export interface ObjectiveStatus {
  id: string;
  label: string;
  hint: string;
  done: boolean;
}

/** Lightweight onboarding checklist; all values are derived, nothing is stored. */
export function getObjectives(world: WorldState): ObjectiveStatus[] {
  const buildings = world.buildings;
  const explored = world.tiles.length
    ? world.tiles.filter((tile) => tile.discovered).length / world.tiles.length
    : 1;
  return [
    {
      id: 'bread',
      label: 'Pan en la mesa',
      hint: 'Construye Granja de Trigo → Molino → Panadería y conecta cada taller con calzada.',
      done: buildings.some((b) => b.type === 'bakery'),
    },
    {
      id: 'sow',
      label: 'Primera cosecha',
      hint: 'Siembra una Granja de Trigo y deja que madure. Tras varias cosechas el campo pide 1 Trigo para resembrar.',
      done: buildings.some(
        (b) =>
          b.type === 'wheat_farm' &&
          b.sown !== false &&
          (b.harvestsLeft ?? WHEAT_HARVESTS_PER_SOWING) < WHEAT_HARVESTS_PER_SOWING,
      ),
    },
    {
      id: 'population',
      label: '40 habitantes',
      hint: 'Amplía Casas Plebeyas junto a calzada, Fuente y Mercado.',
      done: world.totalPopulation >= 40,
    },
    {
      id: 'cives',
      label: 'Una Insula de Cives',
      hint: 'Asciende una Casa Plebeya con calzada, Fuente, Mercado y Pan.',
      done: buildings.some((b) => b.type === 'house_cives'),
    },
    {
      id: 'temple',
      label: 'Un Templo',
      hint: 'Los Cives exigen Templo o Foro a menos de 9 casillas de su vivienda.',
      done: buildings.some((b) => b.type === 'temple'),
    },
    {
      id: 'forum',
      label: 'El Foro Romano',
      hint: 'Requisito del Senado: construye el Foro y conéctalo a la calzada.',
      done: buildings.some((b) => b.type === 'forum' && b.roadConnected),
    },
    {
      id: 'explore',
      label: 'Explorar la isla',
      hint: `Despeja el 30% del mapa con calzadas y Torres de Vigía (ahora ${Math.round(explored * 100)}%) para descubrir bosques, canteras y vetas lejanas.`,
      done: explored >= 0.3,
    },
    {
      id: 'victory',
      label: 'Laurea del Senado',
      hint: '150 habitantes, 60 Cives, Foro y balance de denarios positivo.',
      done: world.victoryAchieved,
    },
  ];
}
