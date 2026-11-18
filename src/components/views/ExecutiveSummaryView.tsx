import React, { useMemo, useState } from 'react';
import {
  calculateExecutiveSummaryData,
  DepartmentAbsenceChartItem,
  DepartmentOvertimeChartItem,
  FilteredKPIs,
} from '../../services/kpiEngine';
import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from '../../types';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { formatMonthNameDisplay } from '../../services/kpiEngine';

export interface ExecutiveSummaryViewProps {
  kpis: FilteredKPIs;
  thresholds: ThresholdConfig;
  onNavigate: (section: 'overtime' | 'attendance' | 'departments' | 'audit' | 'import' | 'catalogs') => void;
  annualOvertime?: AnnualOvertimeRecord[];
  matrixRecords?: WeeklyMatrixRecord[];
  absenceRecords?: AbsenceRecord[];
  allOvertime?: OvertimeRecord[];
  allAttendance?: AttendanceRecord[];
  filters?: GlobalFilterState;
  leaderToDeptMap?: Map<string, Set<string>>;
}

const PIE_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#64748b', // slate-500
];

const DEFAULT_FILTER_FALLBACK: GlobalFilterState = {
  companies: [],
  companyPreset: 'ALL',
  departments: [],
  leaders: [],
  weeks: [],
  months: [],
  month: 'ALL',
  isoWeek: 'ALL',
  specificDate: '',
  startDate: '',
  endDate: '',
  overtimeStatus: 'ALL',
  collaboratorType: 'ALL',
  searchTerm: '',
};

export const ExecutiveSummaryView: React.FC<ExecutiveSummaryViewProps> = ({
  kpis,
  thresholds,
  onNavigate,
  annualOvertime = [],
  matrixRecords = [],
  absenceRecords = [],
  allOvertime = [],
  allAttendance = [],
  filters = DEFAULT_FILTER_FALLBACK,
  leaderToDeptMap,
}) => {
  // Selector de visualización (Barras vs Pastel) independiente para cada gráfica
  const [otChartType, setOtChartType] = useState<'bar' | 'pie'>('bar');
  const [absChartType, setAbsChartType] = useState<'bar' | 'pie'>('bar');

  // Detalle desplegable de tabla para cada gráfica
  const [showOtTable, setShowOtTable] = useState(false);
  const [showAbsTable, setShowAbsTable] = useState(false);

  // Motor de cálculo unificado para los 5 KPIs y las 2 Gráficas analíticas
  const { kpis: execKPIs, overtimeChart, absenceChart } = useMemo(() => {
    return calculateExecutiveSummaryData({
      annualOvertime,
      matrixRecords,
      absenceRecords,
      allOvertime,
      allAttendance,
      filters,
      leaderToDeptMap,
    });
  }, [
    annualOvertime,
    matrixRecords,
    absenceRecords,
    allOvertime,
    allAttendance,
    filters,
    leaderToDeptMap,
  ]);

  // Contexto del periodo temporal activo para badges de las gráficas
  const periodLabel = useMemo(() => {
    const parts: string[] = [];
    if (filters.weeks && filters.weeks.length > 0 && !filters.weeks.includes('ALL')) {
      parts.push(`Semana ${filters.weeks.map((w) => w.split('-W')[1] || w).join(', ')}`);
    } else if (filters.isoWeek && filters.isoWeek !== 'ALL') {
      parts.push(`Semana ${filters.isoWeek.split('-W')[1] || filters.isoWeek}`);
    }

    if (filters.months && filters.months.length > 0 && !filters.months.includes('ALL')) {
      parts.push(
        `Mes: ${filters.months.map((m) => formatMonthNameDisplay(m)).join(', ')}`
      );
    } else if (filters.month && filters.month !== 'ALL') {
      parts.push(`Mes: ${formatMonthNameDisplay(filters.month)}`);
    }
    return parts.length > 0 ? parts.join(' • ') : 'Periodo Completo Acumulado';
  }, [filters.weeks, filters.months, filters.isoWeek, filters.month]);

  // Tooltip personalizado para Gráfica 1 (Tiempo Extra por Departamento)
  const CustomOvertimeTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data: DepartmentOvertimeChartItem = payload[0].payload;
    if (!data) return null;

    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs space-y-2">
        <div className="border-b border-slate-700 pb-1.5 flex items-center justify-between gap-3">
          <span className="font-bold text-slate-100 truncate">{data.department}</span>
          <span className="font-mono text-blue-400 font-bold shrink-0">{data.hours.toFixed(1)} hrs</span>
        </div>
        <div className="text-slate-300">
          <span className="text-slate-400">Participación:</span>{' '}
          <strong className="text-emerald-400 font-semibold">{data.percentage}%</strong> del total en el periodo
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5 font-medium">Turnos registrados:</span>
          <div className="flex flex-wrap gap-1">
            {data.shiftsList.map((s, idx) => (
              <span key={idx} className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5 font-medium">Fechas registradas:</span>
          <span className="text-slate-300 text-[11px] font-mono leading-tight block">
            {data.datesFormatted}
          </span>
        </div>
      </div>
    );
  };

  // Tooltip personalizado para Gráfica 2 (Ausentismo por Departamento)
  const CustomAbsenceTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data: DepartmentAbsenceChartItem = payload[0].payload;
    if (!data) return null;

    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs space-y-2">
        <div className="border-b border-slate-700 pb-1.5 flex items-center justify-between gap-3">
          <span className="font-bold text-slate-100 truncate">{data.department}</span>
          <span className="font-mono text-rose-400 font-bold shrink-0">{data.absences} ausencias</span>
        </div>
        <div className="text-slate-300">
          <span className="text-slate-400">Participación:</span>{' '}
          <strong className="text-rose-400 font-semibold">{data.percentage}%</strong> del total en el periodo
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5 font-medium">Turnos con ausencias:</span>
          <div className="flex flex-wrap gap-1">
            {data.shiftsList.map((s, idx) => (
              <span key={idx} className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5 font-medium">Fechas registradas:</span>
          <span className="text-slate-300 text-[11px] font-mono leading-tight block">
            {data.datesFormatted}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Banner Superior Simplificado */}
      <div className="bg-slate-900 text-white rounded-xl py-4 px-6 shadow-sm border border-slate-800 flex items-center">
        <h2 className="text-xl font-bold tracking-tight text-white">Resumen General</h2>
      </div>

      {/* ========================================================================= */}
      {/* 5 INDICADORES CLAVE (KPI CARDS EN RESUMEN GENERAL)                        */}
      {/* Reactivos a Semana, Mes, Departamento y Líder de Área                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Horas Extra Totales */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Horas Extra Totales</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <i className="bi bi-clock-history text-base"></i>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {execKPIs.totalOvertimeHours.total.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="text-xs font-medium text-slate-500">hrs</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-slate-700">
              {execKPIs.totalOvertimeHours.normales.toFixed(1)} hrs Normales + {execKPIs.totalOvertimeHours.prolongacion.toFixed(1)} hrs Prolongación
            </div>
            <div className="text-[11px] text-slate-500">
              de <span className="font-semibold text-slate-700">{execKPIs.totalOvertimeHours.globalTotal.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs</span> en total ({execKPIs.totalOvertimeHours.percentageOfGlobal}%)
            </div>
          </div>
        </div>

        {/* KPI 2: Faltas injustificadas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Faltas injustificadas</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <i className="bi bi-person-x-fill text-base"></i>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600 tracking-tight">
                {execKPIs.unjustifiedAbsences.count.toLocaleString('es-MX')}
              </span>
              <span className="text-xs font-medium text-slate-500">faltas</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-rose-700">
              {execKPIs.unjustifiedAbsences.equivalentHours.toFixed(1)} hrs equivalentes de ausencia
            </div>
            <div className="text-[11px] text-slate-500">
              de <span className="font-semibold text-slate-700">{execKPIs.unjustifiedAbsences.globalCount.toLocaleString('es-MX')} faltas</span> en total ({execKPIs.unjustifiedAbsences.percentageOfGlobal}%)
            </div>
          </div>
        </div>

        {/* KPI 3: Faltas justificadas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Faltas justificadas</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <i className="bi bi-clipboard-check-fill text-base"></i>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 tracking-tight">
                {execKPIs.justifiedAbsences.count.toLocaleString('es-MX')}
              </span>
              <span className="text-xs font-medium text-slate-500">justificadas</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-emerald-700 truncate" title={execKPIs.justifiedAbsences.breakdownSummary}>
              {execKPIs.justifiedAbsences.breakdownSummary}
            </div>
            <div className="text-[11px] text-slate-500">
              de <span className="font-semibold text-slate-700">{execKPIs.justifiedAbsences.globalCount.toLocaleString('es-MX')} justificadas</span> en total ({execKPIs.justifiedAbsences.percentageOfGlobal}%)
            </div>
          </div>
        </div>

        {/* KPI 4: Área con mayor TE */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Área con mayor TE</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <i className="bi bi-lightning-charge-fill text-base"></i>
              </div>
            </div>
            <div className="text-base font-bold text-slate-900 truncate" title={execKPIs.topOvertimeDepartment?.department || 'Sin datos'}>
              {execKPIs.topOvertimeDepartment ? execKPIs.topOvertimeDepartment.department : 'Sin registros'}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-amber-700">
              {execKPIs.topOvertimeDepartment ? `${execKPIs.topOvertimeDepartment.hours.toFixed(1)} hrs totales` : '0.0 hrs'}
            </div>
            <div className="text-[11px] text-slate-500 truncate" title={execKPIs.topOvertimeDepartment?.leader}>
              Líder: <span className="font-semibold text-slate-700">{execKPIs.topOvertimeDepartment?.leader || 'Sin Asignar'}</span>
            </div>
          </div>
        </div>

        {/* KPI 5: Área con mayor ausentismo */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Área con mayor ausentismo</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <i className="bi bi-shield-exclamation text-base"></i>
              </div>
            </div>
            <div className="text-base font-bold text-slate-900 truncate" title={execKPIs.topAbsenceDepartment?.department || 'Sin datos'}>
              {execKPIs.topAbsenceDepartment ? execKPIs.topAbsenceDepartment.department : 'Sin registros'}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-xs font-semibold text-rose-600">
              Tasa: {execKPIs.topAbsenceDepartment ? `${execKPIs.topAbsenceDepartment.rate.toFixed(1)}%` : '0.0%'}
            </div>
            <div className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{execKPIs.topAbsenceDepartment ? `${execKPIs.topAbsenceDepartment.hours.toFixed(1)} hrs` : '0.0 hrs'}</span> de ausencia ({execKPIs.topAbsenceDepartment?.absencesCount || 0} aus.)
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2 GRÁFICAS INTERACTIVAS CON SWITCH BARRAS / PASTEL                         */}
      {/* Regla Estricta: Responden ÚNICAMENTE a Semana ISO 8601 y Mes              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRÁFICA 1: TIEMPO EXTRA POR DEPARTAMENTO */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header con Título, Regla de Filtrado y Switch Barras / Pastel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Tiempo Extra por Departamento</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Semana y Mes
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparativa completa ordenada de mayor a menor ({periodLabel})
                </p>
              </div>

              {/* Segmented Control / Toggle Switch */}
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setOtChartType('bar')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                    otChartType === 'bar'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver Gráfica de Barras"
                >
                  <i className="bi bi-bar-chart-fill"></i>
                  <span>Barras</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtChartType('pie')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                    otChartType === 'pie'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver Gráfica de Pastel"
                >
                  <i className="bi bi-pie-chart-fill"></i>
                  <span>Pastel</span>
                </button>
              </div>
            </div>

            {/* Contenedor Gráfico */}
            <div className="h-72 w-full">
              {overtimeChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {otChartType === 'bar' ? (
                    <BarChart
                      data={overtimeChart.slice(0, 10)}
                      margin={{ top: 25, right: 10, left: -15, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={40}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(val) => `${val}h`}
                      />
                      <Tooltip content={<CustomOvertimeTooltip />} />
                      <Bar
                        dataKey="hours"
                        name="Horas TE"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList
                          dataKey="hours"
                          position="top"
                          formatter={(val: any) => {
                            const num = Number(val) || 0;
                            const formatted = num % 1 === 0 ? num.toString() : num.toFixed(1);
                            return `${formatted} hrs`;
                          }}
                          style={{ fill: '#1e293b', fontSize: 10, fontWeight: 700 }}
                        />
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={overtimeChart.slice(0, 8)}
                        dataKey="hours"
                        nameKey="department"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        innerRadius={35}
                        paddingAngle={2}
                      >
                        {overtimeChart.slice(0, 8).map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomOvertimeTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                        formatter={(value) => <span className="text-slate-700">{value}</span>}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                  <i className="bi bi-inbox text-3xl mb-1 text-slate-300"></i>
                  <span>No hay registros de tiempo extra para el periodo seleccionado</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer con Tabla / Detalle Desplegable */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowOtTable(!showOtTable)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1.5 transition-colors"
              >
                <i className={`bi ${showOtTable ? 'bi-chevron-up' : 'bi-table'}`}></i>
                <span>{showOtTable ? 'Ocultar desglose detallado' : 'Ver tabla y detalle desplegable'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('overtime')}
                className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 transition-colors"
              >
                <span>Ficha TE</span>
                <i className="bi bi-arrow-right"></i>
              </button>
            </div>

            {/* Acordeón de Tabla Desplegable */}
            {showOtTable && (
              <div className="mt-2 overflow-x-auto max-h-60 rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">#</th>
                      <th className="py-2 px-2.5">Departamento</th>
                      <th className="py-2 px-2.5 text-right">Horas</th>
                      <th className="py-2 px-2.5 text-right">% Periodo</th>
                      <th className="py-2 px-2.5">Turnos</th>
                      <th className="py-2 px-2.5">Fechas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overtimeChart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-medium text-slate-900 truncate max-w-[140px]">{item.department}</td>
                        <td className="py-1.5 px-2.5 text-right font-bold text-blue-600 font-mono">{item.hours.toFixed(1)} h</td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-700">{item.percentage}%</td>
                        <td className="py-1.5 px-2.5 text-slate-600 text-[11px] truncate max-w-[150px]" title={item.shiftsList.join(', ')}>
                          {item.shiftsList.join(', ')}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-500 text-[11px] font-mono truncate max-w-[140px]" title={item.dates.join(', ')}>
                          {item.datesFormatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* GRÁFICA 2: AUSENTISMO POR DEPARTAMENTO */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header con Título, Regla de Filtrado y Switch Barras / Pastel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Ausentismo por Departamento</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    Semana y Mes
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total de ausencias ordenadas de mayor a menor ({periodLabel})
                </p>
              </div>

              {/* Segmented Control / Toggle Switch */}
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAbsChartType('bar')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                    absChartType === 'bar'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver Gráfica de Barras"
                >
                  <i className="bi bi-bar-chart-fill"></i>
                  <span>Barras</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbsChartType('pie')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                    absChartType === 'pie'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver Gráfica de Pastel"
                >
                  <i className="bi bi-pie-chart-fill"></i>
                  <span>Pastel</span>
                </button>
              </div>
            </div>

            {/* Contenedor Gráfico */}
            <div className="h-72 w-full">
              {absenceChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {absChartType === 'bar' ? (
                    <BarChart
                      data={absenceChart.slice(0, 10)}
                      margin={{ top: 25, right: 10, left: -15, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={40}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(val) => `${val}`}
                      />
                      <Tooltip content={<CustomAbsenceTooltip />} />
                      <Bar
                        dataKey="absences"
                        name="Ausencias"
                        fill="#e11d48"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList
                          dataKey="absences"
                          position="top"
                          formatter={(val: any) => {
                            const num = Number(val) || 0;
                            return num % 1 === 0 ? num.toString() : num.toFixed(1);
                          }}
                          style={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }}
                        />
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={absenceChart.slice(0, 8)}
                        dataKey="absences"
                        nameKey="department"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        innerRadius={35}
                        paddingAngle={2}
                      >
                        {absenceChart.slice(0, 8).map((_, index) => (
                          <Cell
                            key={`cell-abs-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomAbsenceTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                        formatter={(value) => <span className="text-slate-700">{value}</span>}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                  <i className="bi bi-inbox text-3xl mb-1 text-slate-300"></i>
                  <span>No hay registros de ausencias para el periodo seleccionado</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer con Tabla / Detalle Desplegable */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAbsTable(!showAbsTable)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 inline-flex items-center gap-1.5 transition-colors"
              >
                <i className={`bi ${showAbsTable ? 'bi-chevron-up' : 'bi-table'}`}></i>
                <span>{showAbsTable ? 'Ocultar desglose detallado' : 'Ver tabla y detalle desplegable'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 transition-colors"
              >
                <span>Ficha Ausentismo</span>
                <i className="bi bi-arrow-right"></i>
              </button>
            </div>

            {/* Acordeón de Tabla Desplegable */}
            {showAbsTable && (
              <div className="mt-2 overflow-x-auto max-h-60 rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">#</th>
                      <th className="py-2 px-2.5">Departamento</th>
                      <th className="py-2 px-2.5 text-right">Ausencias</th>
                      <th className="py-2 px-2.5 text-right">% Periodo</th>
                      <th className="py-2 px-2.5">Turnos</th>
                      <th className="py-2 px-2.5">Fechas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {absenceChart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-medium text-slate-900 truncate max-w-[140px]">{item.department}</td>
                        <td className="py-1.5 px-2.5 text-right font-bold text-rose-600 font-mono">{item.absences}</td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-700">{item.percentage}%</td>
                        <td className="py-1.5 px-2.5 text-slate-600 text-[11px] truncate max-w-[150px]" title={item.shiftsList.join(', ')}>
                          {item.shiftsList.join(', ')}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-500 text-[11px] font-mono truncate max-w-[140px]" title={item.dates.join(', ')}>
                          {item.datesFormatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN INFORMATIVA DE AUDITORÍA Y ANÁLISIS EJECUTIVO                     */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <i className="bi bi-lightbulb-fill text-amber-500"></i>
          <span>Interpretaciones Ejecutivas Respaldadas en Datos</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Finding 1 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-clock-history text-blue-600"></i>
              <span>Tiempo Extra y Prolongación</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Se han consolidado <strong>{execKPIs.totalOvertimeHours.total} hrs</strong> de tiempo extra en la selección actual, integrando de forma exacta horas normales de TE y prolongación de jornada laboral.
            </p>
          </div>

          {/* Finding 2 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-shield-x text-rose-600"></i>
              <span>Faltas Injustificadas</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Se registran <strong>{execKPIs.unjustifiedAbsences.count} faltas injustificadas</strong> ({execKPIs.unjustifiedAbsences.equivalentHours} hrs equivalentes de ausencia), representando el <strong>{execKPIs.unjustifiedAbsences.percentageOfGlobal}%</strong> de las faltas injustificadas globales.
            </p>
          </div>

          {/* Finding 3 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-shield-check text-emerald-600"></i>
              <span>Justificaciones Válidas</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Existen <strong>{execKPIs.justifiedAbsences.count} ausencias justificadas</strong> ({execKPIs.justifiedAbsences.breakdownSummary}), computadas y diferenciadas de las faltas sin justificación.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
