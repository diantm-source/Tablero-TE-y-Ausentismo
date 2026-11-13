import React, { useState } from 'react';
import { NavigationSection } from '../types';
import { formatSyncTimestampDisplay } from '../services/cloudSync';

interface HeaderProps {
  currentSection: NavigationSection;
  onNavigate: (section: NavigationSection) => void;
  dateRange: { start: string; end: string } | null;
  filteredRecordsCount?: { ot: number; att: number };
  totalRecordsCount: { ot: number; att: number };
  onResetSeedData?: () => Promise<void> | void;
  onSyncCloud?: () => Promise<void>;
  lastSyncTimestamp?: string | null;
  isSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  onNavigate,
  dateRange,
  filteredRecordsCount,
  totalRecordsCount,
  onResetSeedData,
  onSyncCloud,
  lastSyncTimestamp,
  isSyncing = false,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const handleSyncOrRefresh = async () => {
    setInternalLoading(true);
    try {
      if (onSyncCloud) {
        await onSyncCloud();
        showToast('success', 'Datos sincronizados exitosamente desde la nube.');
      } else if (onResetSeedData) {
        await onResetSeedData();
        showToast('success', 'Datos e indicadores locales actualizados.');
      }
    } catch (err) {
      console.error('Error durante la sincronización:', err);
      showToast(
        'error',
        'No se pudo sincronizar con la nube. Mostrando datos de la última sesión guardada.'
      );
    } finally {
      setTimeout(() => setInternalLoading(false), 450);
    }
  };

  const loadingActive = isSyncing || internalLoading;
  const syncLabel = formatSyncTimestampDisplay(lastSyncTimestamp);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-6 py-3.5 sticky top-0 z-30 shadow-md">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Title and Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm ring-1 ring-blue-400/30">
            <i className="bi bi-clock-history text-xl"></i>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">
                Panel de Control de Ausentismo y TE
              </h1>
              <span
                className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-600/60 flex items-center gap-1.5 shadow-2xs"
                title="Archivo matriz sincronizado en el tablero"
              >
                <i className="bi bi-file-earmark-spreadsheet-fill text-emerald-400"></i>
                <span>Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5 flex-wrap">
              <span className="flex items-center gap-1">
                <i className="bi bi-calendar3 text-blue-400"></i>
                {dateRange ? (
                  <span>
                    Periodo cubierto: <strong>{dateRange.start}</strong> a <strong>{dateRange.end}</strong>
                  </span>
                ) : (
                  <span className="text-slate-400">Sin datos cargados</span>
                )}
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1">
                <i className="bi bi-funnel text-blue-400"></i>
                {filteredRecordsCount ? (
                  <span>
                    <strong className="text-white">{filteredRecordsCount.ot}</strong>
                    <span className="text-slate-400">/{totalRecordsCount.ot}</span> reg. TE |{' '}
                    <strong className="text-white">{filteredRecordsCount.att}</strong>
                    <span className="text-slate-400">/{totalRecordsCount.att}</span> reg. Asistencia
                  </span>
                ) : (
                  <span>
                    {totalRecordsCount.ot} reg. TE | {totalRecordsCount.att} reg. Asistencia
                  </span>
                )}
              </span>
              <span className="text-slate-600">•</span>
              <span
                className="flex items-center gap-1 text-slate-300"
                title="Fecha y hora de la última sincronización con la nube"
              >
                <i className="bi bi-cloud-check text-blue-400"></i>
                <span>
                  Última sincronización: <strong className="text-white">{syncLabel}</strong>
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Notification Toast */}
          {toast && (
            <div
              className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 border transition-all animate-in fade-in ${
                toast.type === 'success'
                  ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700'
                  : 'bg-rose-950/90 text-rose-200 border-rose-700'
              }`}
            >
              <i
                className={`bi ${
                  toast.type === 'success' ? 'bi-check-circle-fill text-emerald-400' : 'bi-exclamation-triangle-fill text-rose-400'
                }`}
              ></i>
              <span>{toast.message}</span>
            </div>
          )}

          {/* Manual Import Button */}
          <button
            onClick={() => onNavigate('import')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              currentSection === 'import'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-blue-600/90 hover:bg-blue-600 text-white'
            }`}
            title="Importar archivos de respaldo locales (.xlsx, .xls o .csv)"
          >
            <i className="bi bi-cloud-arrow-up-fill text-sm"></i>
            <span>Importar BioTime (.xlsx / .csv)</span>
          </button>

          {/* Sincronizar / Actualizar Button */}
          <button
            onClick={handleSyncOrRefresh}
            disabled={loadingActive}
            title="Sincronizar automáticamente con Google Sheets / Servidor en la nube"
            className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer"
          >
            <i
              className={`bi ${
                loadingActive ? 'bi-arrow-repeat animate-spin text-blue-400' : 'bi-arrow-clockwise text-blue-400'
              } text-sm`}
            ></i>
            <span>{loadingActive ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
