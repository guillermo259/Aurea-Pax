import React, { useEffect } from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg bg-[#191511] border border-[#c9953c]/55 shadow-2xl p-6 text-[#f4ede0]"
      >
        <h2 className="font-display text-xl font-bold text-[#f4ca64] mb-2">{title}</h2>
        <p className="text-sm text-[#d6c9b4] leading-relaxed mb-5">{message}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="flex-1 py-2 px-3 rounded font-medium text-sm bg-[#27211a] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#332b22] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2 px-3 rounded font-semibold text-sm cursor-pointer ${
              destructive
                ? 'bg-[#c64635] text-[#fff6f4] hover:bg-[#d95542]'
                : 'bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
