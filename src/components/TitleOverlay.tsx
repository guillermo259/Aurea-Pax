import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Dices, Landmark, Mouse, Move } from 'lucide-react';
import { createStarterWorld, getTileIndex } from '../game/mapGen';
import type { TerrainKind } from '../game/types';
import { RomanCrestEmblem } from './RomanIcons';

interface TitleOverlayProps {
  hasSavedGame: boolean;
  notice?: string | null;
  initialSeed: number;
  onStartNew: (seed: number) => void;
  onContinue: () => void;
  onOpenGuide: () => void;
}

const TERRAIN_COLORS: Record<TerrainKind, string> = {
  grass: '#788b55',
  fertile: '#9da35e',
  forest: '#3e6242',
  stone: '#8c8980',
  clay: '#b87951',
  sand: '#c9b783',
  water: '#3c7380',
};

function makeSeed() {
  const value = new Uint32Array(1);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(value);
    return value[0];
  }
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export function TitleOverlay({ hasSavedGame, notice, initialSeed, onStartNew, onContinue, onOpenGuide }: TitleOverlayProps) {
  const [seedText, setSeedText] = useState(() => String(initialSeed >>> 0));
  const numericSeed = /^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffff_ffff
    ? Number(seedText)
    : null;
  const preview = useMemo(
    () => numericSeed === null ? null : createStarterWorld(numericSeed),
    [numericSeed],
  );
  const previewTiles = useMemo(() => {
    if (!preview) return [];
    const cells = [];
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        const tile = preview.tiles[getTileIndex(x * 2 + 1, y * 2 + 1, preview.width)];
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x * 2}
            y={y * 2}
            width="2"
            height="2"
            fill={tile.isRoad ? '#c4a56b' : tile.buildingId !== null ? '#e8cd91' : TERRAIN_COLORS[tile.terrain]}
          />,
        );
      }
    }
    return cells;
  }, [preview]);

  return (
    <section className="title-screen" aria-labelledby="game-title">
      <header className="title-mast">
        <div className="title-brand"><RomanCrestEmblem className="size-10" /> Menú principal</div>
        <button type="button" className="guide-link" title="Cómo jugar (H)" aria-keyshortcuts="H" aria-haspopup="dialog" onClick={onOpenGuide}>
          <BookOpen size={16} /> Cómo jugar
        </button>
      </header>
      <div className="title-content">
        <div className="title-genre"><span /> Estrategia y urbanismo</div>
        <h1 id="game-title">Aurea Pax</h1>
        <p>Traza calzadas, abastece los mercados y convierte una pequeña colonia en una próspera ciudad romana.</p>
        {notice && <div role="alert" className="title-notice">{notice}</div>}
        <div className="seed-picker">
          <div className="seed-picker-fields">
            <label htmlFor="world-seed">Semilla del mundo</label>
            <p id="seed-help">Cambia la semilla para explorar otro mapa.</p>
            <div className="seed-picker-controls">
              <input
                id="world-seed"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                value={seedText}
                aria-describedby="seed-help seed-status"
                aria-invalid={numericSeed === null}
                onChange={(event) => setSeedText(event.currentTarget.value.replace(/\D/g, '').slice(0, 10))}
              />
              <button type="button" className="seed-random" onClick={() => setSeedText(String(makeSeed()))}>
                <Dices size={16} /> Aleatoria
              </button>
            </div>
            <div id="seed-status" className={numericSeed === null ? 'seed-status' : 'sr-only'} aria-live="polite">
              {numericSeed === null ? 'Usa un número entre 0 y 4 294 967 295.' : `Mapa ${numericSeed} · vista previa actualizada`}
            </div>
          </div>
          <figure className="seed-preview">
            <svg viewBox="0 0 42 42" role="img" aria-label={numericSeed === null ? 'Vista previa del mapa no disponible' : `Vista previa del mapa con semilla ${numericSeed}`}>
              {previewTiles}
            </svg>
            <figcaption>Vista previa</figcaption>
          </figure>
        </div>
        <div className="title-actions">
          {hasSavedGame && <button className="title-primary" onClick={onContinue}>
            Continuar partida <ArrowRight size={18} />
          </button>}
          <button data-start="true" className={hasSavedGame ? 'title-secondary' : 'title-primary'} disabled={numericSeed === null} onClick={() => numericSeed !== null && onStartNew(numericSeed)}>
            <Landmark size={18} /> Fundar asentamiento
          </button>
        </div>
      </div>
      <footer className="title-controls">
        <span className="desktop-hint"><Move size={16} /><kbd>WASD</kbd> Mover cámara</span>
        <span className="desktop-hint"><Mouse size={16} /> Rueda para acercar</span>
        <span className="desktop-hint"><kbd>Esc</kbd> Pausa</span>
        <span className="touch-hint"><Move size={16} /> Arrastra para explorar el mapa</span>
      </footer>
    </section>
  );
}
