import React, { useState } from 'react';
import { NavigationSection } from '../types';

interface HeaderProps {
  currentSection: NavigationSection;
  onNavigate: (section: NavigationSection) => void;
  dateRange: { start: string; end: string } | null;
  filteredRecordsCount?: { ot: number; att: number };
  totalRecordsCount: { ot: number; att: number };
  onResetSeedData: () => Promise<void> | void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  onNavigate,
  dateRange,
  filteredRecordsCount,
  totalRecordsCount,
  onResetSeedData,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshedToast, setRefreshedToast] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onResetSeedData();
      setRefreshedToast(true);
      setTimeout(() => setRefreshedToast(false), 3000);
    } catch (err) {
      console.error('Error al actualizar datos:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 450);
    }
  };

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
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/80 text-blue-300 border border-blue-700/60">
                BioTime Enterprise
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
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
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {refreshedToast && (
            <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-700/70 px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-in fade-in transition-all">
              <i className="bi bi-check-circle-fill text-emerald-400"></i>
              <span>Datos e indicadores actualizados</span>
            </span>
          )}

          <button
            onClick={() => onNavigate('import')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              currentSection === 'import'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-blue-600/90 hover:bg-blue-600 text-white'
            }`}
          >
            <i className="bi bi-cloud-arrow-up-fill text-sm"></i>
            <span>Importar BioTime (.xlsx)</span>
          </button>

          {/* Actualizar Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Recargar datos desde la base de datos local y recalcular estadísticas"
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer"
          >
            <i
              className={`bi bi-arrow-repeat text-blue-400 text-sm ${
                isRefreshing ? 'animate-spin' : ''
              }`}
            ></i>
            <span>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
