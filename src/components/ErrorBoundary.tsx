import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Aurea Pax crashed:', error, info);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#161411] p-6 text-[#f4ede0]">
        <div className="w-full max-w-md rounded-lg bg-[#191511] border border-[#c64635]/60 shadow-2xl p-6">
          <h1 className="font-display text-2xl font-bold text-[#f4ca64] mb-2">
            La ciudad se ha detenido
          </h1>
          <p className="text-sm text-[#d6c9b4] leading-relaxed mb-4">
            Se produjo un error inesperado. Tu partida guardada en este navegador no se ha
            borrado; recarga la página para continuar desde el último autoguardado.
          </p>
          <p className="text-xs font-mono-num text-[#a99a84] mb-5 break-words">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 px-4 rounded font-semibold text-sm bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer"
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('aurea_pax_save_v1');
                  localStorage.removeItem('aurea_pax_save_backup_v1');
                } catch {
                  // ignore storage errors
                }
                window.location.reload();
              }}
              className="flex-1 py-2.5 px-4 rounded font-medium text-sm bg-[#2e231f] text-[#f3d4cc] border border-[#c64635]/35 hover:bg-[#3e2b25] cursor-pointer"
            >
              Borrar partida y recargar
            </button>
          </div>
        </div>
      </main>
    );
  }
}
