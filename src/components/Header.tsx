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
  onOpenMobileMenu?: () => void;
  onOpenMobileFilters?: () => void;
  activeFiltersCount?: number;
  showFiltersButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  onNavigate,
  dateRange,
  filteredRecordsCount: _filteredRecordsCount,
  totalRecordsCount: _totalRecordsCount,
  onResetSeedData,
  onSyncCloud,
  lastSyncTimestamp,
  isSyncing = false,
  onOpenMobileMenu,
  onOpenMobileFilters,
  activeFiltersCount = 0,
  showFiltersButton = true,
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
    <header className="mx-4 mt-3.5 mb-1.5 bg-[#0f172a] text-white px-8 py-6 min-h-[116px] rounded-3xl border border-white/15 shadow-[0_8px_30px_rgba(100,116,139,0.18)] shrink-0 z-30 transition-all flex flex-col justify-center">
      <div className="flex items-center justify-between gap-3 sm:gap-6">
        {/* Left: Mobile Menu Toggle + Large Logo + Title and Metadata */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          {/* ☰ Menú Button (Mobile & Tablet only < 1024px) */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title="Abrir menú de módulos"
            aria-label="Abrir menú de módulos"
          >
            <i className="bi bi-list text-xl leading-none"></i>
          </button>

          {/* Brand Logo Container (Ample and eye-catching) */}
          <div className="h-16 w-16 sm:h-18 sm:w-18 p-2.5 rounded-2xl bg-white/95 flex items-center justify-center shrink-0 shadow-md border border-slate-700/50">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Logo Polak Grupo"
              className="h-full w-full object-contain"
            />
          </div>

          {/* Title & Metadata Hierarchy */}
          <div className="min-w-0 flex flex-col justify-center">
            <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold tracking-tight text-white truncate leading-tight">
              Panel de Control de Ausentismo y TE
            </h1>

            <div className="hidden sm:flex items-center gap-3 text-sm text-slate-300 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <i className="bi bi-calendar3 text-blue-400 text-sm sm:text-base"></i>
                {dateRange ? (
                  <span>
                    Periodo: <strong className="text-white font-semibold">{dateRange.start}</strong> a{' '}
                    <strong className="text-white font-semibold">{dateRange.end}</strong>
                  </span>
                ) : (
                  <span className="text-slate-400">Sin datos cargados</span>
                )}
              </span>
              <span className="text-slate-600 text-xs">•</span>
              <span
                className="inline-flex items-center gap-1.5 text-slate-300"
                title="Fecha y hora de la última sincronización con la nube"
              >
                <i className="bi bi-cloud-check text-blue-400 text-sm sm:text-base"></i>
                <span>
                  Última sincronización: <strong className="text-white font-semibold">{syncLabel}</strong>
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          {/* Notification Toast */}
          {toast && (
            <div
              className={`hidden md:flex text-xs px-3.5 py-2 rounded-xl items-center gap-2 border transition-all animate-in fade-in ${
                toast.type === 'success'
                  ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700'
                  : 'bg-rose-950/90 text-rose-200 border-rose-700'
              }`}
            >
              <i
                className={`bi ${
                  toast.type === 'success'
                    ? 'bi-check-circle-fill text-emerald-400 text-sm'
                    : 'bi-exclamation-triangle-fill text-rose-400 text-sm'
                }`}
              ></i>
              <span className="truncate max-w-[220px] font-medium">{toast.message}</span>
            </div>
          )}

          {/* 🌪️ Filtros Button (Mobile & Tablet only < 1024px) */}
          {showFiltersButton && (
            <button
              type="button"
              onClick={onOpenMobileFilters}
              className="lg:hidden px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80 flex items-center gap-1.5 text-sm font-semibold shadow-sm transition-all cursor-pointer relative"
              title="Abrir panel de filtros globales"
              aria-label="Abrir panel de filtros globales"
            >
              <span className="text-sm leading-none" aria-hidden="true">
                🌪️
              </span>
              <span className="hidden xs:inline">Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          )}

          {/* Manual Import Button */}
          <button
            onClick={() => onNavigate('import')}
            className={`px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm cursor-pointer ${
              currentSection === 'import'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-blue-600/90 hover:bg-blue-600 text-white hover:shadow-md'
            }`}
            title="Importar archivos de respaldo locales (.xlsx, .xls o .csv)"
          >
            <i className="bi bi-cloud-arrow-up-fill text-base"></i>
            <span className="hidden md:inline">Importar BioTime (.xlsx / .csv)</span>
            <span className="md:hidden">Importar</span>
          </button>

          {/* Sincronizar / Actualizar Button */}
          <button
            onClick={handleSyncOrRefresh}
            disabled={loadingActive}
            title="Sincronizar automáticamente con Google Sheets / Servidor en la nube"
            className="px-5 py-3 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80 flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer"
          >
            <i
              className={`bi ${
                loadingActive ? 'bi-arrow-repeat animate-spin text-blue-400' : 'bi-arrow-clockwise text-blue-400'
              } text-base`}
            ></i>
            <span className="hidden sm:inline">{loadingActive ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* Mobile-only secondary info bar */}
      {(dateRange || syncLabel) && (
        <div className="flex sm:hidden items-center justify-between gap-2 text-xs text-slate-300 mt-2.5 pt-2.5 border-t border-slate-800/80">
          <span className="truncate">
            {dateRange ? (
              <span>
                Periodo: <strong>{dateRange.start}</strong> a <strong>{dateRange.end}</strong>
              </span>
            ) : (
              <span className="text-slate-400">Sin datos cargados</span>
            )}
          </span>
          {syncLabel && (
            <span className="text-slate-400 text-xs shrink-0 truncate max-w-[160px]">
              Sync: {syncLabel.split(',')[0]}
            </span>
          )}
        </div>
      )}
    </header>
  );
};
