import React from 'react';
import { GlobalFilterState } from '../types';
import { getISOWeekDateRange } from '../services/businessRules';

interface GlobalFiltersProps {
  filters: GlobalFilterState;
  onChangeFilters: (updated: Partial<GlobalFilterState>) => void;
  onResetFilters: () => void;
  availableCompanies: string[];
  availableDepartments: string[];
  availableLeaders: string[];
  availableWeeks: string[];
  availableMonths: string[];
  filteredCounts?: { ot: number; att: number };
  totalRecordsCount?: { ot: number; att: number };
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  hideCollapseButton?: boolean;
  leaderToDeptMap?: Map<string, Set<string>>;
}

export const GlobalFilters: React.FC<GlobalFiltersProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  availableCompanies,
  availableDepartments,
  availableLeaders,
  availableWeeks,
  availableMonths,
  filteredCounts,
  totalRecordsCount,
  isCollapsed,
  onToggleCollapsed,
  hideCollapseButton = false,
  leaderToDeptMap,
}) => {
  return (
    <div
      className={`bg-slate-900/95 border-r border-slate-800 transition-all duration-300 flex flex-col shrink-0 text-slate-200 z-10 h-full ${
        isCollapsed ? 'w-10' : 'w-72'
      }`}
    >
      {/* Header bar of Filters */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <i className="bi bi-funnel-fill text-blue-400 text-sm"></i>
            <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">
              Filtros Globales
            </span>
          </div>
        )}
        {!hideCollapseButton && (
          <button
            onClick={onToggleCollapsed}
            title={isCollapsed ? 'Expandir panel de filtros' : 'Ocultar panel de filtros'}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 mx-auto cursor-pointer"
          >
            <i
              className={`bi ${
                isCollapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'
              } text-xs`}
            ></i>
          </button>
        )}
      </div>

      {isCollapsed ? (
        <div className="py-4 flex flex-col items-center gap-4 text-slate-400">
          <button
            onClick={onToggleCollapsed}
            title="Abrir filtros"
            className="p-2 hover:bg-slate-800 hover:text-white rounded"
          >
            <i className="bi bi-funnel text-base"></i>
          </button>
          <button
            onClick={onResetFilters}
            title="Restablecer filtros"
            className="p-2 hover:bg-slate-800 hover:text-amber-400 rounded"
          >
            <i className="bi bi-arrow-counterclockwise text-base"></i>
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          {filteredCounts && totalRecordsCount && (
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg p-2.5 text-[11px] space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <i className="bi bi-funnel-fill text-blue-400"></i>
                  <span>Calculando datos:</span>
                </span>
                <span className="font-semibold text-blue-300">
                  {filters.companyPreset === 'ALL'
                    ? 'Todas'
                    : filters.companyPreset === 'MAIN_THREE'
                    ? '3 Principales'
                    : filters.companyPreset === 'POLAQUIMIA_ONLY'
                    ? 'Solo Polaquimia'
                    : 'Personalizado'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] pt-1 border-t border-slate-700/50">
                <span className="text-slate-300">
                  TE: <strong className="text-emerald-400">{filteredCounts.ot}</strong>
                  <span className="text-slate-500">/{totalRecordsCount.ot}</span>
                </span>
                <span className="text-slate-300">
                  Asist: <strong className="text-emerald-400">{filteredCounts.att}</strong>
                  <span className="text-slate-500">/{totalRecordsCount.att}</span>
                </span>
              </div>
            </div>
          )}

          {/* 1. FILTROS DE EMPRESA - Ocultado temporalmente por requerimiento manteniendo estado neutro */}
          <div className="hidden" aria-hidden="true">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Filtros de Empresa
              </label>
              <span className="text-[10px] text-blue-400 font-mono">BioTime</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    companyPreset: 'ALL',
                    companies: ['ALL'],
                  })
                }
                className={`text-left px-2 py-1.5 rounded transition-colors flex items-center justify-between ${
                  filters.companyPreset === 'ALL'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div>
                  <span className="block font-medium">Todas las empresas</span>
                  <span className="text-[10px] opacity-75 block">Polaquimia, MLBM, Barteleu, Polatecnia, Externos y Becarios</span>
                </div>
                {filters.companyPreset === 'ALL' && <i className="bi bi-check2 text-xs"></i>}
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    companyPreset: 'MAIN_THREE',
                    companies: ['POLAQUIMIA', 'MLBM', 'BARTELEU'],
                  })
                }
                className={`text-left px-2 py-1.5 rounded transition-colors flex items-center justify-between ${
                  filters.companyPreset === 'MAIN_THREE'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span>Solo Polaquimia, MLBM y Barteleu</span>
                {filters.companyPreset === 'MAIN_THREE' && <i className="bi bi-check2 text-xs"></i>}
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    companyPreset: 'POLAQUIMIA_ONLY',
                    companies: ['POLAQUIMIA'],
                  })
                }
                className={`text-left px-2 py-1.5 rounded transition-colors flex items-center justify-between ${
                  filters.companyPreset === 'POLAQUIMIA_ONLY'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span>Solamente Polaquimia</span>
                {filters.companyPreset === 'POLAQUIMIA_ONLY' && <i className="bi bi-check2 text-xs"></i>}
              </button>
            </div>
          </div>

          {/* 2. TIPO DE COLABORADOR - Ocultado temporalmente por requerimiento manteniendo estado neutro */}
          <div className="hidden" aria-hidden="true">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Tipo de Colaborador
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => onChangeFilters({ collaboratorType: 'ALL' })}
                className={`py-1 px-1.5 rounded text-center truncate ${
                  filters.collaboratorType === 'ALL'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Ambos
              </button>
              <button
                onClick={() => onChangeFilters({ collaboratorType: 'SINDICALIZADO' })}
                className={`py-1 px-1.5 rounded text-center truncate ${
                  filters.collaboratorType === 'SINDICALIZADO'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Sindicalizado
              </button>
              <button
                onClick={() => onChangeFilters({ collaboratorType: 'NO_SINDICALIZADO' })}
                className={`py-1 px-1.5 rounded text-center truncate ${
                  filters.collaboratorType === 'NO_SINDICALIZADO'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                No Sind.
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2 space-y-3">
            {/* Search filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Búsqueda Rápida
              </label>
              <div className="relative">
                <i className="bi bi-search absolute left-2.5 top-2 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => onChangeFilters({ searchTerm: e.target.value })}
                  placeholder="Nombre, ID, Motivo..."
                  className="w-full pl-7 pr-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 3. Empresa Dropdown - Ocultado temporalmente por requerimiento manteniendo estado neutro */}
            <div className="hidden" aria-hidden="true">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Empresa
              </label>
              <select
                value={
                  filters.companyPreset === 'POLAQUIMIA_ONLY'
                    ? (availableCompanies.find((c) => c.toUpperCase() === 'POLAQUIMIA') || 'POLAQUIMIA')
                    : filters.companyPreset === 'MAIN_THREE'
                    ? 'MAIN_THREE'
                    : filters.companies.length === 1 && filters.companies[0] !== 'ALL'
                    ? (availableCompanies.find((c) => c.toUpperCase() === filters.companies[0].toUpperCase()) || filters.companies[0])
                    : 'ALL'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'ALL') {
                    onChangeFilters({
                      companies: ['ALL'],
                      companyPreset: 'ALL',
                    });
                  } else if (val === 'MAIN_THREE') {
                    onChangeFilters({
                      companies: ['POLAQUIMIA', 'MLBM', 'BARTELEU'],
                      companyPreset: 'MAIN_THREE',
                    });
                  } else if (val.toUpperCase().includes('POLAQUIMIA') && !val.toUpperCase().includes('POLATECNIA')) {
                    onChangeFilters({
                      companies: [val],
                      companyPreset: 'POLAQUIMIA_ONLY',
                    });
                  } else {
                    onChangeFilters({
                      companies: [val],
                      companyPreset: 'CUSTOM',
                    });
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todas las empresas ({availableCompanies.length})</option>
                <option value="MAIN_THREE">Solo Polaquimia, MLBM y Barteleu</option>
                {availableCompanies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Líder de Departamento / Líder de Área (Exclusivo desde Base TE) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Líder de Área
              </label>
              <select
                value={filters.leaders[0] || 'ALL'}
                onChange={(e) => {
                  const selectedLeader = e.target.value;
                  if (selectedLeader === 'ALL') {
                    onChangeFilters({ leaders: ['ALL'] });
                  } else {
                    const allowedDepts = leaderToDeptMap?.get(selectedLeader);
                    const curDept = filters.departments[0];
                    const keepDept = curDept && curDept !== 'ALL' && allowedDepts?.has(curDept);
                    onChangeFilters({
                      leaders: [selectedLeader],
                      departments: keepDept ? [curDept] : ['ALL'],
                    });
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos los líderes ({availableLeaders.length})</option>
                {availableLeaders.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Departamento (Exclusivo desde Base TE - Filtrado en cascada si hay Líder activo) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Departamento
                </label>
                {filters.leaders.length > 0 && !filters.leaders.includes('ALL') && (
                  <span className="text-[10px] text-blue-400 font-medium">Por líder</span>
                )}
              </div>
              <select
                value={filters.departments[0] || 'ALL'}
                onChange={(e) => onChangeFilters({ departments: [e.target.value] })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">
                  {filters.leaders.length > 0 && !filters.leaders.includes('ALL')
                    ? `Todos del líder (${availableDepartments.length})`
                    : `Todos los departamentos (${availableDepartments.length})`}
                </option>
                {availableDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Semana ISO 8601 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Semana ISO 8601
                </label>
                <span className="text-[10px] text-blue-400">Lun - Dom</span>
              </div>
              <select
                value={filters.isoWeek}
                onChange={(e) => onChangeFilters({ isoWeek: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todas las semanas ({availableWeeks.length})</option>
                {availableWeeks.map((w) => {
                  const weekInfo = getISOWeekDateRange(w);
                  return (
                    <option key={w} value={w}>
                      {weekInfo.label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Mes */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Mes
              </label>
              <select
                value={filters.month}
                onChange={(e) => onChangeFilters({ month: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos los meses ({availableMonths.length})</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Rango Personalizado de Fechas */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300">
                Rango Personalizado
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[10px] text-slate-400 block">Desde</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => onChangeFilters({ startDate: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Hasta</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => onChangeFilters({ endDate: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Estado de Tiempo Extra */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Estado Tiempo Extra
              </label>
              <select
                value={filters.overtimeStatus}
                onChange={(e) =>
                  onChangeFilters({
                    overtimeStatus: e.target.value as GlobalFilterState['overtimeStatus'],
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos los estados</option>
                <option value="APROBADO">Solamente Aprobado</option>
                <option value="PENDIENTE">Solamente Pendiente</option>
                <option value="RECHAZADO">Solamente Rechazado</option>
              </select>
            </div>
          </div>

          {/* Reset Filters Button */}
          <div className="pt-2">
            <button
              onClick={onResetFilters}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center justify-center gap-1.5 font-medium transition-colors"
            >
              <i className="bi bi-arrow-counterclockwise text-amber-400"></i>
              <span>Restablecer Filtros</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
