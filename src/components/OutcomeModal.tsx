import React from 'react';
import { HudSnapshot } from '../game/types';

interface OutcomeModalProps {
  hud: HudSnapshot;
  onContinueSandbox: () => void;
  onRestart: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  hud,
  onContinueSandbox,
  onRestart,
}) => {
  const isVictory = hud.victoryAchieved && !hud.bankrupt;
  const minutes = Math.floor(hud.elapsedSeconds / 60);
  const seconds = hud.elapsedSeconds % 60;
  const timeLabel = `${minutes}m ${String(seconds).padStart(2, '0')}s`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-label={isVictory ? 'Victoria del Senado' : 'Bancarrota'}
        className="w-full max-w-md rounded-lg bg-[#191511] border border-[#c9953c]/60 shadow-2xl p-6 text-[#f4ede0]"
      >
        <h2 className="font-display text-2xl font-bold text-[#f4ca64] mb-1">
          {isVictory ? 'Gloria del Senado' : 'Tesorería Agotada'}
        </h2>
        <p className="text-sm text-[#d6c9b4] leading-relaxed mb-5">
          {isVictory
            ? 'Tu colonia romana ha florecido con Cives prósperos, un Foro activo y finanzas saneadas.'
            : 'Los gastos de mantenimiento superaron los ingresos fiscales hasta vaciar las arcas provinciales.'}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 py-3 border-y border-[#b78e4a]/25 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b9aa94]">Población</div>
            <div className="font-mono-num text-xl font-semibold text-[#f6efe2] mt-0.5">
              {hud.totalPopulation}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b9aa94]">Cives</div>
            <div className="font-mono-num text-xl font-semibold text-[#f4ca64] mt-0.5">
              {hud.populationCives}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b9aa94]">
              {isVictory ? 'Tiempo' : 'Carretas'}
            </div>
            <div className="font-mono-num text-xl font-semibold text-[#f6efe2] mt-0.5">
              {isVictory ? timeLabel : hud.totalCartsDelivered}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isVictory && (
            <button
              type="button"
              onClick={onContinueSandbox}
              className="flex-1 py-2.5 px-4 rounded font-semibold text-sm bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer"
            >
              Seguir construyendo
            </button>
          )}
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className={`flex-1 py-2.5 px-4 rounded font-semibold text-sm cursor-pointer ${
              isVictory
                ? 'bg-[#27211a] text-[#f3eadb] border border-[#b78e4a]/40 hover:bg-[#332b22]'
                : 'bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f]'
            }`}
          >
            {isVictory ? 'Nueva partida' : 'Intentar de nuevo'}
          </button>
        </div>
      </div>
    </div>
  );
};
