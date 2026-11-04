import React from 'react';
import { FilteredKPIs } from '../../services/kpiEngine';
import { ThresholdConfig } from '../../types';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ExecutiveSummaryViewProps {
  kpis: FilteredKPIs;
  thresholds: ThresholdConfig;
  onNavigate: (section: 'overtime' | 'attendance' | 'departments' | 'audit' | 'import' | 'catalogs') => void;
}

export const ExecutiveSummaryView: React.FC<ExecutiveSummaryViewProps> = ({
  kpis,
  thresholds,
  onNavigate,
}) => {
  const topOtDept = kpis.departmentsMetrics[0];
  const topAbsDept = [...kpis.departmentsMetrics].sort((a, b) => b.absenceRate - a.absenceRate)[0];

  // Helper for trend badge
  const renderTrendBadge = (
    pct: number | null,
    inverted = false
  ) => {
    if (!kpis.previousPeriodAvailable || pct === null) {
      return (
        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
          Datos insuficientes
        </span>
      );
    }
    const isIncrease = pct > 0;
    const isGood = inverted ? !isIncrease : isIncrease;
    return (
      <span
        className={`text-[11px] px-2 py-0.5 rounded font-semibold inline-flex items-center gap-1 ${
          isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
      >
        <i className={`bi ${isIncrease ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}`}></i>
        {Math.abs(pct)}% vs sem. ant.
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Formulas and Context */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-blue-600/30 text-blue-300 border border-blue-500/40">
              Consolidado General BioTime
            </span>
            <span className="text-xs text-slate-400">Semana ISO 8601</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
              <i className="bi bi-funnel-fill text-[11px] text-emerald-400"></i>
              <span>{kpis.filteredOvertime.length} reg. TE | {kpis.filteredAttendance.length} reg. Asistencia</span>
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Resumen Ejecutivo y Semáforo de Control</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Monitoreo en tiempo real de tiempo extraordinario generado y tasa de ausentismo calculada estrictamente sobre jornadas programadas elegibles (turnos 1, 1s, 2, 2s, 3, 3s, CM, C).
          </p>
        </div>

        {/* Global Semaphores */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-700 text-center min-w-[140px]">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
              Semáforo Ausentismo
            </span>
            <div className="flex items-center justify-center gap-2">
              <span
                className={`w-3.5 h-3.5 rounded-full ${
                  kpis.absenceSemaphore === 'VERDE'
                    ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                    : kpis.absenceSemaphore === 'AMARILLO'
                    ? 'bg-amber-500 ring-4 ring-amber-500/20'
                    : 'bg-rose-500 ring-4 ring-rose-500/20'
                }`}
              ></span>
              <span className="font-bold text-sm tracking-wide">
                {kpis.absenceRate}% ({kpis.absenceSemaphore})
              </span>
            </div>
          </div>

          <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-700 text-center min-w-[140px]">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
              Semáforo TE Pendiente
            </span>
            <div className="flex items-center justify-center gap-2">
              <span
                className={`w-3.5 h-3.5 rounded-full ${
                  kpis.overtimeSemaphore === 'VERDE'
                    ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                    : kpis.overtimeSemaphore === 'AMARILLO'
                    ? 'bg-amber-500 ring-4 ring-amber-500/20'
                    : 'bg-rose-500 ring-4 ring-rose-500/20'
                }`}
              ></span>
              <span className="font-bold text-sm tracking-wide">
                {kpis.totalPendingHours} hrs ({kpis.overtimeSemaphore})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 8 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Horas Solicitadas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">TE Solicitado Total</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <i className="bi bi-clock text-base"></i>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{kpis.totalRequestedHours} <span className="text-xs font-normal text-slate-500">hrs</span></span>
            <span className="text-xs text-slate-500 font-medium">{kpis.totalOtRequests} solicitudes</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Promedio/colaborador:</span>
            <span className="font-semibold text-slate-700">{kpis.avgHoursPerCollaborator} hrs</span>
          </div>
        </div>

        {/* KPI 2: Horas Aprobadas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">TE Aprobado</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="bi bi-check2-circle text-base"></i>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-600">{kpis.totalApprovedHours} <span className="text-xs font-normal text-slate-500">hrs</span></span>
            {renderTrendBadge(kpis.diffApprovedHoursPct)}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Tasa aprobación (hrs):</span>
            <span className="font-semibold text-emerald-700">{kpis.approvalRateByHours}%</span>
          </div>
        </div>

        {/* KPI 3: Horas Pendientes */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">TE Pendiente Revisión</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <i className="bi bi-hourglass-split text-base"></i>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-600">{kpis.totalPendingHours} <span className="text-xs font-normal text-slate-500">hrs</span></span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              {kpis.pendingOtRequests} por revisar
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Porcentaje pendiente:</span>
            <span className="font-semibold text-amber-700">
              {kpis.totalRequestedHours > 0
                ? Math.round((kpis.totalPendingHours / kpis.totalRequestedHours) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* KPI 4: Tasa de Ausentismo Real */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Tasa de Ausentismo</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                kpis.absenceSemaphore === 'ROJO'
                  ? 'bg-rose-50 text-rose-600'
                  : kpis.absenceSemaphore === 'AMARILLO'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <i className="bi bi-person-x text-base"></i>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{kpis.absenceRate}%</span>
            {renderTrendBadge(kpis.diffAbsenceRatePct, true)}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Fórmula:</span>
            <span className="font-medium text-slate-700">
              {kpis.totalAbsences} aus. / {kpis.totalEligibleShifts} jorn.
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Secondary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 5: Total de Ausencias Confirmadas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Total Ausencias Confirmadas
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{kpis.totalAbsences}</span>
            <span className="text-xs text-slate-500">días no asistidos</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Sindicalizados: <strong>{kpis.syndicatedAbsences}</strong> | No Sind.:{' '}
            <strong>{kpis.nonSyndicatedAbsences}</strong>
          </div>
        </div>

        {/* KPI 6: Incidencias de Marcaje */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Incidencias de Marcaje (Revisión)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600">{kpis.punchIncidentsCount}</span>
            <span className="text-xs text-slate-500">solo 1 marcaje</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            No computan como ausencia automática según norma
          </div>
        </div>

        {/* KPI 7: Departamento con Mayor TE */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Mayor Volumen Tiempo Extra
          </div>
          <div className="font-bold text-base text-slate-900 truncate">
            {topOtDept ? topOtDept.department : 'Sin datos'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>Aprobado: <strong>{topOtDept ? topOtDept.approvedHours : 0} hrs</strong></span>
            <span className="text-slate-400 truncate max-w-[120px]">{topOtDept?.leader}</span>
          </div>
        </div>

        {/* KPI 8: Departamento con Mayor Ausentismo */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Mayor Tasa Ausentismo
          </div>
          <div className="font-bold text-base text-slate-900 truncate">
            {topAbsDept ? topAbsDept.department : 'Sin datos'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>Tasa: <strong className="text-rose-600">{topAbsDept ? topAbsDept.absenceRate : 0}%</strong></span>
            <span>{topAbsDept ? topAbsDept.absencesCount : 0} ausencias</span>
          </div>
        </div>
      </div>

      {/* Interactive Charts: Weekly Evolution of TE vs Absences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Evolución Semanal: Horas TE Solicitadas vs Aprobadas</h3>
              <p className="text-xs text-slate-500">Agrupado por Semanas ISO 8601 (Lunes a Domingo)</p>
            </div>
            <button
              onClick={() => onNavigate('overtime')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <span>Ver detalles TE</span>
              <i className="bi bi-arrow-right"></i>
            </button>
          </div>

          <div className="h-64">
            {kpis.weeklyMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpis.weeklyMetrics}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorApp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="isoKey"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => `Sem. ${String(val).split('-W')[1] || val}`}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(label) => {
                      const found = kpis.weeklyMetrics.find((m) => m.isoKey === label);
                      return found?.weekLabel || String(label);
                    }}
                    formatter={(val: any, name: any) => [`${val} hrs`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="requestedHours"
                    name="Horas Solicitadas"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorReq)"
                  />
                  <Area
                    type="monotone"
                    dataKey="approvedHours"
                    name="Horas Aprobadas"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorApp)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No hay datos suficientes para graficar
              </div>
            )}
          </div>
        </div>

        {/* Department Comparison Chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tiempo Extra por Departamento (Aprobadas vs Pendientes)</h3>
              <p className="text-xs text-slate-500">Distribución de carga de trabajo extraordinario</p>
            </div>
            <button
              onClick={() => onNavigate('departments')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <span>Ver Fichas</span>
              <i className="bi bi-arrow-right"></i>
            </button>
          </div>

          <div className="h-64">
            {kpis.departmentsMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.departmentsMetrics.slice(0, 5)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(label) => `Departamento: ${label}`}
                    formatter={(val: any, name: any) => [`${val} hrs`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="approvedHours" name="Horas Aprobadas" fill="#10b981" stackId="a" />
                  <Bar dataKey="pendingHours" name="Horas Pendientes" fill="#f59e0b" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No hay datos departamentales para graficar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Executive Interpretations & Risk Alerts Section */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <i className="bi bi-lightbulb-fill text-amber-500"></i>
          <span>Interpretaciones Ejecutivas Respaldadas en Datos</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Finding 1 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-clipboard-data text-blue-600"></i>
              <span>Exactitud del Ausentismo</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              La tasa de ausentismo del <strong>{kpis.absenceRate}%</strong> se calculó sobre{' '}
              <strong>{kpis.totalEligibleShifts}</strong> jornadas programadas elegibles, excluyendo días fuera de jornada y justificaciones válidas.
            </p>
          </div>

          {/* Finding 2 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-exclamation-triangle text-amber-600"></i>
              <span>Pendientes de Aprobación</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Existen <strong>{kpis.totalPendingHours} horas</strong> en <strong>{kpis.pendingOtRequests} solicitudes</strong> en estado PENDIENTE. No se contabilizan como horas pagaderas autorizadas hasta su resolución formal en BioTime.
            </p>
          </div>

          {/* Finding 3: Simultaneous High Alert */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <i className="bi bi-shield-exclamation text-rose-600"></i>
              <span>Departamentos de Alta Concentración</span>
            </div>
            {kpis.departmentsMetrics.some((d) => d.isSimultaneousAlert) ? (
              <p className="text-slate-600 leading-relaxed">
                El departamento{' '}
                <strong>
                  {kpis.departmentsMetrics.find((d) => d.isSimultaneousAlert)?.department}
                </strong>{' '}
                presenta simultáneamente alto TE ({'>'} {thresholds.overtimeHighWarningDeptHours} hrs) y alta tasa de ausentismo ({'>'} {thresholds.absenceHighWarningRate}%).{' '}
                <em className="text-slate-500">Nota técnica: correlación estadística sin afirmar causalidad automática.</em>
              </p>
            ) : (
              <p className="text-slate-600 leading-relaxed">
                No se detectan departamentos con concentración simultánea crítica de tiempo extra y ausentismo por encima de los umbrales configurados.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
