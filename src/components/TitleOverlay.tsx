import React from 'react';
import { RomanCrestEmblem } from './RomanIcons';

interface TitleOverlayProps {
  hasSavedGame: boolean;
  onStartNew: () => void;
  onContinue: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  hasSavedGame,
  onStartNew,
  onContinue,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Asymmetric dark Mediterranean scrim over left third so live isometric world shows clearly on right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(95deg, rgba(16, 13, 10, 0.92) 0%, rgba(18, 15, 11, 0.72) 38%, rgba(18, 15, 11, 0.14) 72%, rgba(18, 15, 11, 0.25) 100%)',
        }}
      />

      <div className="relative z-10 flex-1 flex items-center px-8 md:px-16">
        <div className="max-w-md pointer-events-auto">
          <div className="flex items-center gap-4 mb-5">
            <RomanCrestEmblem className="w-16 h-16 shrink-0" />
            <div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-wider text-[#f6efe2] leading-none">
                AUREA PAX
              </h1>
              <p className="text-sm text-[#d4a656] mt-1.5 tracking-wide">
                Colonia Romana · Logística y Urbanismo
              </p>
            </div>
          </div>

          <p className="text-sm md:text-base text-[#d8cfc0] leading-relaxed mb-7">
            Traza calzadas de basalto, enlaza campos de trigo, molinos, viñedos y alfarerías, y
            observa tus carretas abastecer el Horreum y los mercados para elevar a tus ciudadanos.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onStartNew}
              className="px-6 py-3 rounded-lg font-semibold text-sm bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] active:translate-y-px transition-all shadow-lg cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2c46c]"
            >
              Fundar Asentamiento
            </button>

            {hasSavedGame && (
              <button
                type="button"
                onClick={onContinue}
                className="px-5 py-3 rounded-lg font-medium text-sm bg-[#27211a] text-[#f3eadb] border border-[#c9953c]/45 hover:bg-[#352d24] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2c46c]"
              >
                Continuar Partida
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Single flat borderless control hint line in bottom safe margin */}
      <div className="relative z-10 px-8 md:px-16 pb-6">
        <p className="text-xs text-[#c7bdad]/85 tracking-wide">
          WASD o Arrastrar: Mover cámara · Rueda: Zoom · Clic: Construir o inspeccionar · B: Libro
          de cuentas · Esc: Pausa
        </p>
      </div>
    </div>
  );
};
