import { ArrowRight, BookOpen, Landmark, Mouse, Move } from 'lucide-react';
import { RomanCrestEmblem } from './RomanIcons';

interface TitleOverlayProps {
  hasSavedGame: boolean;
  notice?: string | null;
  onStartNew: () => void;
  onContinue: () => void;
  onOpenGuide: () => void;
}

export function TitleOverlay({ hasSavedGame, notice, onStartNew, onContinue, onOpenGuide }: TitleOverlayProps) {
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
        <div className="title-actions">
          {hasSavedGame && <button className="title-primary" onClick={onContinue}>
            Continuar partida <ArrowRight size={18} />
          </button>}
          <button data-start="true" className={hasSavedGame ? 'title-secondary' : 'title-primary'} onClick={onStartNew}>
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
