import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  label: string;
  className: string;
  onDismiss?: () => void;
  children: ReactNode;
}

/** Native modal stacking keeps the map and any underlying dialogs inert. */
export function Modal({ label, className, onDismiss, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`roman-modal ${className}`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:enabled, input:enabled, a[href], [tabindex="0"]',
        )).filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        const boundary = event.shiftKey ? first : last;
        if (boundary && document.activeElement === boundary) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss?.();
      }}
    >
      {children}
    </dialog>
  );
}
