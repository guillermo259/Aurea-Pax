import { X } from 'lucide-react';
import { BUILDING_SHORTCUTS, SHORTCUTS } from '../game/shortcuts';
import { Modal } from './Modal';

const mapControls = [
  ['W A S D / ↑ ← ↓ →', 'Mover cámara'],
  ['+ / −', 'Acercar y alejar'],
  [SHORTCUTS.center, 'Restablecer la vista inicial'],
];

const gameControls = [
  ['Espacio', 'Pausar o reanudar la simulación'],
  [SHORTCUTS.changeSpeed, 'Cambiar velocidad entre 1×, 2× y 3×'],
  ['Esc / P', 'Abrir o cerrar el menú de pausa'],
  ['G / Ctrl+S / ⌘S', 'Guardar partida'],
  [SHORTCUTS.objectives, 'Abrir o cerrar objetivos'],
  [SHORTCUTS.ledger, 'Abrir o cerrar cuentas'],
  [SHORTCUTS.mute, 'Activar o silenciar sonido'],
  [SHORTCUTS.help, 'Abrir o cerrar la guía'],
];

const constructionControls = [
  [SHORTCUTS.category, 'Cambiar de categoría'],
  [SHORTCUTS.building, 'Elegir la siguiente construcción'],
  [SHORTCUTS.inspect, 'Inspeccionar'],
  [SHORTCUTS.upgrade, 'Ascender viviendas'],
  [SHORTCUTS.demolish, 'Activar la herramienta de demolición'],
  ...Array.from(BUILDING_SHORTCUTS, ([key, building]) => [key, building.name]),
];

function ShortcutList({ heading, controls }: { heading: string; controls: string[][] }) {
  return (
    <section>
      <h3 className="shortcut-heading">{heading}</h3>
      <dl className="shortcut-list">
        {controls.map(([key, action]) => (
          <div key={key}>
            <dt><kbd>{key.length === 1 ? key.toUpperCase() : key}</kbd></dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export type GuideSection = 'guide' | 'shortcuts';

interface GuideModalProps {
  section: GuideSection;
  onSelectSection: (section: GuideSection) => void;
  onClose: () => void;
}

export function GuideModal({ section, onSelectSection, onClose }: GuideModalProps) {
  return (
    <Modal label="Cómo jugar" onDismiss={onClose} className="guide-panel">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl">Cómo jugar</h2>
        <button type="button" aria-label="Cerrar guía" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="guide-sections" role="group" aria-label="Secciones de ayuda">
        <button type="button" aria-pressed={section === 'guide'} onClick={() => onSelectSection('guide')}>
          Primeros pasos
        </button>
        <button type="button" aria-pressed={section === 'shortcuts'} onClick={() => onSelectSection('shortcuts')}>
          Atajos de teclado
        </button>
      </div>
      {section === 'guide' ? (
        <ol>
          <li><strong>Conecta la colonia.</strong> Une las viviendas y los talleres al Horreum con calzadas para que circulen las carretas.</li>
          <li><strong>Produce pan.</strong> Lleva trigo al molino y harina a la panadería. El mercado distribuye el pan a las viviendas cercanas.</li>
          <li><strong>Consulta tus objetivos.</strong> El panel de objetivos muestra qué le falta a tu colonia. En el libro de cuentas puedes revisar las existencias y los gastos.</li>
        </ol>
      ) : (
        <div className="shortcut-groups" aria-label="Atajos de teclado">
          <div>
            <ShortcutList heading="Mapa" controls={mapControls} />
            <ShortcutList heading="Partida" controls={gameControls} />
          </div>
          <ShortcutList heading="Construcción" controls={constructionControls} />
        </div>
      )}
    </Modal>
  );
}
