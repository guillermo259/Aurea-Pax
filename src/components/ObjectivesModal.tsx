import React, { useEffect } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { getObjectives } from '../game/objectives';
import { WorldState } from '../game/types';

interface ObjectivesModalProps {
  world: WorldState;
  onClose: () => void;
}

export const ObjectivesModal: React.FC<ObjectivesModalProps> = ({ world, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const objectives = getObjectives(world);
  const done = objectives.filter((o) => o.done).length;
  const percent = Math.round((done / objectives.length) * 100);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Objetivos del asentamiento"
        className="w-full max-w-lg max-h-[84vh] flex flex-col rounded-lg bg-[#191511] border border-[#c9953c]/45 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#b78e4a]/25">
          <div>
            <h2 className="font-display text-lg font-bold text-[#f4ca64]">
              Objetivos del Asentamiento
            </h2>
            <p className="text-xs text-[#b9aa94]">
              {done} de {objectives.length} completados
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar objetivos"
            onClick={onClose}
            className="p-1.5 text-[#b9aa94] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="w-full h-1.5 rounded bg-[#2d261e] overflow-hidden">
            <div className="h-full bg-[#d4a656]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <ul className="p-5 overflow-y-auto roman-scroll space-y-2.5">
          {objectives.map((objective) => (
            <li
              key={objective.id}
              className={`flex items-start gap-2.5 rounded border px-3 py-2.5 ${
                objective.done
                  ? 'bg-[#232b1e] border-[#669c5b]/40'
                  : 'bg-[#211c17] border-[#b78e4a]/25'
              }`}
            >
              {objective.done ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#89c983]" />
              ) : (
                <Circle className="w-4 h-4 mt-0.5 shrink-0 text-[#8d7f6b]" />
              )}
              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold ${
                    objective.done ? 'text-[#c9e6bd]' : 'text-[#f4ede0]'
                  }`}
                >
                  {objective.label}
                </div>
                <p className="text-xs text-[#b9aa94] leading-relaxed mt-0.5">{objective.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
