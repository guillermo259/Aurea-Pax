import React from 'react';
import { X } from 'lucide-react';
import { HudSnapshot } from '../game/types';
import { ResourceIcon } from './RomanIcons';

interface BalanceLedgerModalProps {
  open: boolean;
  hud: HudSnapshot;
  onClose: () => void;
  onFocusTile: (x: number, y: number, buildingId: number) => void;
}

export const BalanceLedgerModal: React.FC<BalanceLedgerModalProps> = ({
  open,
  hud,
  onClose,
  onFocusTile,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4">
      <div
        role="dialog"
        aria-label="Libro de Cuentas"
        className="w-full max-w-3xl max-h-[84vh] flex flex-col rounded-lg bg-[#191511] border border-[#c9953c]/45 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#b78e4a]/25">
          <div>
            <h2 className="font-display text-lg font-bold text-[#f4ca64]">
              Libro de Cuentas Imperial
            </h2>
            <p className="text-xs text-[#b9aa94]">
              Impuestos: +{hud.taxPerMin} d/min · Mantenimiento: -{hud.upkeepPerMin} d/min ·
              Carretas activas: {hud.activeCartCount} · Entregas totales: {hud.totalCartsDelivered}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar Libro de Cuentas"
            onClick={onClose}
            className="p-1.5 text-[#b9aa94] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto roman-scroll space-y-6">
          {/* Production vs Demand table */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[#d4a656] font-semibold mb-2.5">
              Producción y Demanda por Minuto
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#b78e4a]/25 text-[#b9aa94]">
                    <th className="py-2 pr-4 font-medium">Recurso</th>
                    <th className="py-2 px-3 font-medium text-right">Horreum</th>
                    <th className="py-2 px-3 font-medium text-right">Prod / min</th>
                    <th className="py-2 px-3 font-medium text-right">Consumo / min</th>
                    <th className="py-2 pl-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#b78e4a]/15">
                  {hud.balanceRows.map((row) => (
                    <tr key={row.resource} className="hover:bg-[#231d17]">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2 font-medium text-[#f4ede0]">
                          <ResourceIcon resource={row.resource} className="w-4 h-4" />
                          <span>{row.label}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num text-[#e6dccb]">
                        {row.stock}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num text-[#89c983]">
                        +{row.prodPerMin.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-num text-[#e5986f]">
                        -{row.demandPerMin.toFixed(1)}
                      </td>
                      <td
                        className={`py-2 pl-3 text-right font-mono-num font-semibold ${
                          row.netPerMin >= 0 ? 'text-[#89c983]' : 'text-[#f08b78]'
                        }`}
                      >
                        {row.netPerMin >= 0 ? `+${row.netPerMin.toFixed(1)}` : row.netPerMin.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottleneck Alerts */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[#d4a656] font-semibold mb-2">
              Diagnóstico de Asentamiento ({hud.alerts.length})
            </h3>
            {hud.alerts.length === 0 ? (
              <p className="text-xs text-[#91c88b]">
                Todas las estructuras y viviendas conectadas operan sin bloqueos.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {hud.alerts.slice(0, 12).map((alert) => (
                  <button
                    key={`${alert.buildingId}-${alert.reason}`}
                    type="button"
                    onClick={() => {
                      onFocusTile(alert.x, alert.y, alert.buildingId);
                      onClose();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded bg-[#251f19] border border-[#b78e4a]/25 hover:border-[#d4a656]/60 text-left text-xs cursor-pointer"
                  >
                    <span className="text-[#f4ede0]">{alert.message}</span>
                    <span className="font-mono-num text-[#b9aa94] ml-2">
                      ({alert.x},{alert.y})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
