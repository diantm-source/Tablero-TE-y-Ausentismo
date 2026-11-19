import React, { useMemo } from 'react';
import { GlobalFilterState } from '../types';
import { getISOWeekDateRange } from '../services/businessRules';
import { formatMonthNameDisplay } from '../services/kpiEngine';
import { MultiSelectFilterDropdown } from './MultiSelectFilterDropdown';

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
  onToggleCollapse?: () => void;
  onToggleCollapsed?: () => void;
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
  onToggleCollapse,
  onToggleCollapsed,
  hideCollapseButton = false,
  leaderToDeptMap,
}) => {
  const handleToggle = onToggleCollapse || onToggleCollapsed || (() => { });
  const [localSearchTerm, setLocalSearchTerm] = React.useState(filters.searchTerm);

  // Sincronizar el estado local cuando filters.searchTerm cambie externamente (ej. restablecer)
  React.useEffect(() => {
    setLocalSearchTerm(filters.searchTerm);
  }, [filters.searchTerm]);

  // Debounce de 250ms para evitar recalcular 42,000+ registros en cada pulsación
  React.useEffect(() => {
    if (localSearchTerm === filters.searchTerm) return;
    const timer = setTimeout(() => {
      onChangeFilters({ searchTerm: localSearchTerm });
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearchTerm, filters.searchTerm, onChangeFilters]);
  return (
    <div
      className={`bg-slate-900/95 transition-all duration-300 flex flex-col shrink-0 text-slate-200 z-10 overflow-hidden ${hideCollapseButton
          ? 'w-full h-full'
          : isCollapsed
            ? 'w-16 mt-0.5 mb-2.5 ml-2 mr-2 rounded-3xl border border-slate-800 shadow-sm'
            : 'w-72 mt-0.5 mb-2.5 ml-2 mr-2 rounded-3xl border border-slate-800 shadow-sm'
        }`}
    >
      {/* Header bar of Filters */}
      <div className={`border-b border-slate-800 flex items-center ${isCollapsed ? 'p-2 justify-center' : 'p-3.5 justify-between'}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <i className="bi bi-funnel-fill text-blue-400 text-sm"></i>
            <span className="font-bold text-sm uppercase tracking-wider text-slate-200">
              Filtros Globales
            </span>
          </div>
        )}
        {!hideCollapseButton && (
          <button
            type="button"
            onClick={handleToggle}
            title={isCollapsed ? 'Expandir panel de filtros' : 'Ocultar panel de filtros'}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <i
              className={`bi ${isCollapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'
                } text-xs`}
            ></i>
          </button>
        )}
      </div>

      {isCollapsed ? (
        <div className="py-4 flex flex-col items-center gap-3 text-slate-400">
          <button
            type="button"
            onClick={handleToggle}
            title="Expandir filtros"
            className="p-2 hover:bg-slate-800 hover:text-white rounded-xl transition-colors cursor-pointer text-blue-400 hover:text-blue-300"
          >
            <i className="bi bi-funnel text-base"></i>
          </button>
          <button
            type="button"
            onClick={onResetFilters}
            title="Restablecer filtros"
            className="p-2.5 hover:bg-slate-800 hover:text-amber-400 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-h-[42px] min-w-[42px]"
          >
            <i className="bi bi-arrow-counterclockwise text-base"></i>
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          {filteredCounts && totalRecordsCount && (
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5 text-[11px] space-y-1 shadow-sm">
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
                className={`text-left px-2 py-1.5 rounded-xl transition-colors flex items-center justify-between ${filters.companyPreset === 'ALL'
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
                className={`text-left px-2 py-1.5 rounded-xl transition-colors flex items-center justify-between ${filters.companyPreset === 'MAIN_THREE'
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
                className={`text-left px-2 py-1.5 rounded-xl transition-colors flex items-center justify-between ${filters.companyPreset === 'POLAQUIMIA_ONLY'
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
                className={`py-1 px-1.5 rounded-xl text-center truncate ${filters.collaboratorType === 'ALL'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
              >
                Ambos
              </button>
              <button
                onClick={() => onChangeFilters({ collaboratorType: 'SINDICALIZADO' })}
                className={`py-1 px-1.5 rounded-xl text-center truncate ${filters.collaboratorType === 'SINDICALIZADO'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
              >
                Sindicalizado
              </button>
              <button
                onClick={() => onChangeFilters({ collaboratorType: 'NO_SINDICALIZADO' })}
                className={`py-1 px-1.5 rounded-xl text-center truncate ${filters.collaboratorType === 'NO_SINDICALIZADO'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
              >
                No Sind.
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2 space-y-3.5">
            {/* Search filter */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-200 mb-1">
                Búsqueda Rápida
              </label>
              <div className="relative">
                <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  value={localSearchTerm}
                  onChange={(e) => setLocalSearchTerm(e.target.value)}
                  placeholder="Nombre, ID, Motivo..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs text-xs"
                />
              </div>
            </div>

            {/* 3. Empresa Dropdown - Ocultado temporalmente por requerimiento manteniendo estado neutro */}
            <div className="hidden" aria-hidden="true">
              <label className="block text-[13px] font-semibold text-slate-200 mb-1">
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500 shadow-xs text-xs cursor-pointer"
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

            {/* Líder de Área (Multiselección) */}
            <MultiSelectFilterDropdown
              label="Líder de Área"
              placeholder="Todos los líderes"
              options={useMemo(
                () => availableLeaders.map((l) => ({ value: l, label: l })),
                [availableLeaders]
              )}
              selectedValues={filters.leaders}
              onChange={(newLeaders) => {
                if (newLeaders.length === 0) {
                  onChangeFilters({ leaders: [] });
                } else {
                  // Cascade to departments: retain only departments belonging to chosen leaders
                  const allowedDepts = new Set<string>();
                  for (const l of newLeaders) {
                    const depts = leaderToDeptMap?.get(l);
                    if (depts) {
                      depts.forEach((d) => allowedDepts.add(d));
                    }
                  }
                  const curDepts = filters.departments.filter((d) => d !== 'ALL');
                  const validDepts = curDepts.filter((d) => allowedDepts.has(d));
                  onChangeFilters({
                    leaders: newLeaders,
                    departments: validDepts,
                  });
                }
              }}
            />

            {/* Departamento (Multiselección) */}
            <MultiSelectFilterDropdown
              label="Departamento"
              subLabel={filters.leaders.length > 0 && !filters.leaders.includes('ALL') ? 'Por líder' : undefined}
              placeholder="Todos los departamentos"
              options={useMemo(
                () => availableDepartments.map((d) => ({ value: d, label: d })),
                [availableDepartments]
              )}
              selectedValues={filters.departments}
              onChange={(newDepartments) => onChangeFilters({ departments: newDepartments })}
            />

            {/* Semana (Multiselección) */}
            <MultiSelectFilterDropdown
              label="Semana"
              subLabel="Lun - Dom"
              placeholder="Todas las semanas"
              options={useMemo(
                () =>
                  availableWeeks.map((w) => {
                    const weekInfo = getISOWeekDateRange(w);
                    return {
                      value: w,
                      label: weekInfo.label,
                    };
                  }),
                [availableWeeks]
              )}
              selectedValues={
                filters.weeks && filters.weeks.length > 0
                  ? filters.weeks
                  : filters.isoWeek && filters.isoWeek !== 'ALL'
                    ? [filters.isoWeek]
                    : []
              }
              onChange={(newWeeks) =>
                onChangeFilters({
                  weeks: newWeeks,
                  isoWeek: newWeeks.length === 1 ? newWeeks[0] : 'ALL',
                })
              }
            />

            {/* Mes (Multiselección con nombre en mayúsculas) */}
            <MultiSelectFilterDropdown
              label="Mes"
              placeholder="Todos los meses"
              options={useMemo(
                () =>
                  availableMonths.map((m) => ({
                    value: m,
                    label: formatMonthNameDisplay(m, availableMonths),
                  })),
                [availableMonths]
              )}
              selectedValues={
                filters.months && filters.months.length > 0
                  ? filters.months
                  : filters.month && filters.month !== 'ALL'
                    ? [filters.month]
                    : []
              }
              onChange={(newMonths) =>
                onChangeFilters({
                  months: newMonths,
                  month: newMonths.length === 1 ? newMonths[0] : 'ALL',
                })
              }
            />

            {/* Rango Personalizado de Fechas */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-slate-200">
                Rango Personalizado
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Desde</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => onChangeFilters({ startDate: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-blue-500 shadow-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hasta</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => onChangeFilters({ endDate: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-blue-500 shadow-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reset Filters Button (Azul sólido/llamativo) */}
          <div className="pt-2">
            <button
              onClick={onResetFilters}
              className="w-full min-h-[42px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer text-xs active:scale-98"
            >
              <i className="bi bi-arrow-counterclockwise text-white"></i>
              <span>Restablecer Filtros</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
