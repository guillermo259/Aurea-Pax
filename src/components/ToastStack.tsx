import React from 'react';
import { AlertTriangle, Coins, Flame, MapPin, RouteOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ToastNotification } from '../game/types';

interface ToastStackProps {
  toasts: ToastNotification[];
  onDismiss: (id: number) => void;
  onFocus: (toast: ToastNotification) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss, onFocus }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notificaciones críticas"
      className="fixed top-16 left-3 z-20 w-80 max-w-[calc(100vw-1.5rem)] flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const isCritical = toast.severity === 'critical';
          const canFocus = toast.x !== undefined && toast.y !== undefined;

          const Icon =
            toast.kind === 'fire'
              ? Flame
              : toast.kind === 'treasury_low'
                ? Coins
                : toast.kind === 'road_disconnected'
                  ? RouteOff
                  : AlertTriangle;

          return (
            <motion.div
              key={toast.id}
              data-testid="toast-item"
              data-toast-kind={toast.kind}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.16 }}
              className={`pointer-events-auto rounded-lg bg-[#191511]/95 border shadow-2xl p-2.5 flex items-start gap-2.5 ${
                isCritical ? 'border-[#c94432]/75' : 'border-[#d49a3a]/65'
              }`}
            >
              <div
                className={`mt-0.5 p-1.5 rounded shrink-0 ${
                  isCritical
                    ? 'bg-[#3b1c17] text-[#ff8b78]'
                    : 'bg-[#352915] text-[#f3c667]'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-[#f8efe0] leading-snug">
                    {toast.title}
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar notificación"
                    onClick={() => onDismiss(toast.id)}
                    className="p-0.5 text-[#a99a84] hover:text-[#fff6e8] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="mt-0.5 text-[11px] text-[#d6c9b4] leading-snug">
                  {toast.message}
                </p>

                {canFocus && (
                  <button
                    type="button"
                    onClick={() => onFocus(toast)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#f3c667] hover:text-[#ffe09a] cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Centrar cámara</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
