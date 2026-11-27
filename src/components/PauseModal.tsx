import { Modal } from './Modal';
import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { MAX_SAVE_BYTES } from '../game/persistence';

interface PauseModalProps {
  onResume: () => void;
  onOpenGuide: () => void;
  onSaveLocal: () => boolean;
  onExportJson: () => void;
  onImportJson: (raw: string) => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onOpenGuide,
  onSaveLocal,
  onExportJson,
  onImportJson,
  onRestart,
  onReturnTitle,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [exitSaveFailed, setExitSaveFailed] = useState(false);
  const pendingRead = useRef<FileReader | null>(null);
  useEffect(() => () => pendingRead.current?.abort(), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingRead.current?.abort();
    e.target.value = '';
    if (file.size > MAX_SAVE_BYTES) {
      setStatusMsg(null);
      setErrorMsg('El archivo es demasiado grande (máximo 8 MB).');
      return;
    }
    const reader = new FileReader();
    pendingRead.current = reader;
    reader.onerror = () => {
      setStatusMsg(null);
      setErrorMsg('No se pudo leer el archivo.');
    };
    reader.onload = () => {
      try {
        onImportJson(String(reader.result ?? ''));
        setErrorMsg(null);
        setStatusMsg('Partida importada.');
      } catch (err) {
        setStatusMsg(null);
        setErrorMsg(err instanceof Error ? err.message : 'Archivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Modal
        onDismiss={onResume}
        label="Menú de pausa"
        className="w-full max-w-sm rounded-lg bg-[#191511] border border-[#c9953c]/50 shadow-2xl p-6 text-[#f4ede0]"
      >
        <h2 className="font-display text-2xl font-bold text-[#f4ca64] mb-1">
          Asentamiento en Pausa
        </h2>
        <p className="text-xs text-[#b9aa94] mb-5">
          Gestiona tu partida local o exporta un respaldo en formato JSON.
        </p>

        {statusMsg && <p role="status" className="text-xs text-[#89c983] mb-3">{statusMsg}</p>}
        {errorMsg && <p role="alert" className="text-xs text-[#f08b78] mb-3">{errorMsg}</p>}

        <div className="space-y-2.5">
          <button
            type="button"
            autoFocus
            onClick={onResume}
            className="w-full py-2.5 px-4 rounded font-semibold text-sm bg-[#c9953c] text-[#17120c] hover:bg-[#dba84f] cursor-pointer"
          >
            Reanudar
          </button>

          <button
            type="button"
            onClick={() => {
              const saved = onSaveLocal();
              setErrorMsg(saved ? null : 'No se pudo guardar (almacenamiento lleno o bloqueado).');
              setStatusMsg(saved ? 'Guardado en este navegador.' : null);
            }}
            className="w-full py-2 px-4 rounded font-medium text-sm bg-[#27211a] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#332b22] cursor-pointer"
          >
            Guardar ahora
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onExportJson}
              className="py-2 px-3 rounded font-medium text-xs bg-[#27211a] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#332b22] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#d4a656]" />
              <span>Exportar JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-3 rounded font-medium text-xs bg-[#27211a] text-[#f3eadb] border border-[#b78e4a]/35 hover:bg-[#332b22] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#d4a656]" />
              <span>Importar JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <button
            type="button"
            title="Cómo jugar y atajos (H)"
            aria-keyshortcuts="H"
            aria-haspopup="dialog"
            onClick={onOpenGuide}
            className="w-full py-2 px-4 rounded font-medium text-sm text-[#f3eadb] hover:bg-[#332b22] cursor-pointer"
          >
            Cómo jugar y atajos
          </button>

          <div className="pt-2 border-t border-[#b78e4a]/20 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRestart}
              className="py-2 px-3 rounded font-medium text-xs bg-[#2e231f] text-[#f3d4cc] border border-[#c64635]/35 hover:bg-[#3e2b25] cursor-pointer"
            >
              Reiniciar mapa
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSaveLocal()) onReturnTitle();
                else {
                  setStatusMsg(null);
                  setExitSaveFailed(true);
                  setErrorMsg('No se pudo guardar. Exporta una copia JSON para conservar tu progreso.');
                }
              }}
              className="py-2 px-3 rounded font-medium text-xs bg-[#241f19] text-[#d6c9b4] border border-[#b78e4a]/25 hover:bg-[#2f2820] cursor-pointer"
            >
              Guardar y salir
            </button>
            {exitSaveFailed && (
              <button type="button" className="col-span-2 text-sm text-[#f4b0a5] py-2 cursor-pointer"
                onClick={onReturnTitle}>Salir sin guardar</button>
            )}
          </div>
        </div>
    </Modal>
  );
};
