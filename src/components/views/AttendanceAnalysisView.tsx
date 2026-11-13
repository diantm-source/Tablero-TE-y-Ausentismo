import React, { useState } from 'react';
import { FilteredKPIs } from '../../services/kpiEngine';
import {
  AbsenceRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
} from '../../types';
import { exportToExcel } from '../../services/excelParser';
import { AbsenceConcentratedView } from './AbsenceConcentratedView';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface AttendanceAnalysisViewProps {
  kpis: FilteredKPIs;
  allAttendance: AttendanceRecord[];
  allOvertime?: OvertimeRecord[];
  absenceRecords?: AbsenceRecord[];
  filters?: GlobalFilterState;
  isSyncing?: boolean;
  onSyncCloud?: () => Promise<void>;
  leaderToDeptMap?: Map<string, Set<string>>;
}

const FALLBACK_FILTERS: GlobalFilterState = {
  companies: ['ALL'],
  companyPreset: 'ALL',
  departments: ['ALL'],
  leaders: ['ALL'],
  month: 'ALL',
  isoWeek: 'ALL',
  specificDate: '',
  startDate: '',
  endDate: '',
  overtimeStatus: 'ALL',
  collaboratorType: 'ALL',
  searchTerm: '',
};

export const AttendanceAnalysisView: React.FC<AttendanceAnalysisViewProps> = ({
  kpis,
  allAttendance,
  allOvertime = [],
  absenceRecords = [],
  filters = FALLBACK_FILTERS,
  isSyncing = false,
  onSyncCloud,
  leaderToDeptMap,
}) => {
  const [activeTab, setActiveTab] = useState<'concentrated' | 'biotime'>('concentrated');
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AUSENCIAS' | 'INCIDENCIAS' | 'JUSTIFICADAS'>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Filter attendance table
  const filteredRecords = kpis.filteredAttendance.filter((rec) => {
    if (statusFilter === 'AUSENCIAS') {
      if (rec.absenceStatus !== 'AUSENCIA_CONFIRMADA' && rec.absenceStatus !== 'AUSENCIA_PROBABLE') return false;
    } else if (statusFilter === 'INCIDENCIAS') {
      if (rec.absenceStatus !== 'INCIDENCIA_MARCAJE') return false;
    } else if (statusFilter === 'JUSTIFICADAS') {
      if (rec.absenceStatus !== 'JUSTIFICADO_EXCEPCION') return false;
    }

    if (!tableSearch) return true;
    const s = tableSearch.toLowerCase();
    return (
      rec.employeeName.toLowerCase().includes(s) ||
      rec.employeeId.toLowerCase().includes(s) ||
      rec.department.toLowerCase().includes(s) ||
      rec.nickname.toLowerCase().includes(s) ||
      rec.schedule.toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRows = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  // Group absences by day of the week for heat calendar
  const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const dayCountsMap: Record<string, { absences: number; incidents: number; total: number }> = {
    Lunes: { absences: 0, incidents: 0, total: 0 },
    Martes: { absences: 0, incidents: 0, total: 0 },
    Miércoles: { absences: 0, incidents: 0, total: 0 },
    Jueves: { absences: 0, incidents: 0, total: 0 },
    Viernes: { absences: 0, incidents: 0, total: 0 },
    Sábado: { absences: 0, incidents: 0, total: 0 },
    Domingo: { absences: 0, incidents: 0, total: 0 },
  };

  kpis.filteredAttendance.forEach((r) => {
    if (r.isScheduleEligible && dayCountsMap[r.dayOfWeek]) {
      dayCountsMap[r.dayOfWeek].total++;
      if (r.absenceStatus === 'AUSENCIA_CONFIRMADA' || r.absenceStatus === 'AUSENCIA_PROBABLE') {
        dayCountsMap[r.dayOfWeek].absences++;
      } else if (r.absenceStatus === 'INCIDENCIA_MARCAJE') {
        dayCountsMap[r.dayOfWeek].incidents++;
      }
    }
  });

  // Ranking of departments by absence rate
  const deptRanking = [...kpis.departmentsMetrics]
    .filter((d) => d.eligibleShifts > 0)
    .sort((a, b) => b.absenceRate - a.absenceRate);

  // Recurrent absences collaborators
  const recurrentMap = new Map<string, { id: string; name: string; dept: string; count: number }>();
  kpis.filteredAttendance.forEach((r) => {
    if (r.absenceStatus === 'AUSENCIA_CONFIRMADA' || r.absenceStatus === 'AUSENCIA_PROBABLE') {
      const cur = recurrentMap.get(r.employeeId) || {
        id: r.employeeId,
        name: r.employeeName,
        dept: r.department,
        count: 0,
      };
      cur.count++;
      recurrentMap.set(r.employeeId, cur);
    }
  });
  const recurrentCollabs = Array.from(recurrentMap.values())
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count);

  const handleExportAttendance = () => {
    const data = filteredRecords.map((r) => ({
      'ID Empleado': r.employeeId,
      'Nombre Completo': r.employeeName,
      Empresa: r.company,
      Apodo: r.nickname,
      Departamento: r.department,
      Líder: r.leader,
      Fecha: r.date,
      'Día de la Semana': r.dayOfWeek,
      Horario: r.schedule,
      Excepción: r.exception || 'Ninguna',
      'Hora Entrada Prog': r.schedIn,
      'Hora Salida Prog': r.schedOut,
      'Entrada Real (BioTime)': r.realIn || 'VACÍA',
      'Salida Real (BioTime)': r.realOut || 'VACÍA',
      'Clasificación Incidencia': r.absenceStatus,
      'Estado Revisión': r.reviewStatus,
    }));
    exportToExcel(data, 'BioTime_Detalle_Ausentismo');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Module Tabs */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
              Módulo de Ausentismo
            </span>
            {activeTab === 'concentrated' ? (
              <>
                <span className="text-xs text-slate-500">Concentrado Google Sheets / Excel</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                  <i className="bi bi-file-earmark-spreadsheet-fill text-[11px] text-blue-600"></i>
                  <span>{absenceRecords.length} registros en concentrado</span>
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-500">Reglas de elegibilidad estrictas</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <i className="bi bi-funnel-fill text-[11px] text-emerald-600"></i>
                  <span>{kpis.filteredAttendance.length} registros filtrados</span>
                </span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {activeTab === 'concentrated'
              ? 'Análisis de Ausentismo — Concentrado de Ausencias'
              : 'Control de Asistencia y Tasa de Ausentismo'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {activeTab === 'concentrated'
              ? 'Seguimiento de faltas injustificadas, costos por ausentismo, tipos de ausencia y desglose por departamento/semana.'
              : 'Evaluación automatizada sobre horarios permitidos (1, 1s, 2, 2s, 3, 3s, CM, C).'}
          </p>
        </div>

        {activeTab === 'biotime' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportAttendance}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <i className="bi bi-file-earmark-excel-fill text-sm"></i>
              <span>Exportar Detalle ({filteredRecords.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Module Source Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('concentrated')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'concentrated'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">📋</span>
          <span>Concentrado de Ausencias (Sheets)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('biotime')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'biotime'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">⏱️</span>
          <span>Análisis BioTime Enterprise</span>
        </button>
      </div>

      {activeTab === 'concentrated' && (
        <AbsenceConcentratedView
          records={absenceRecords}
          filters={filters}
          allOvertime={allOvertime}
          allAttendance={allAttendance}
          isSyncing={isSyncing}
          onSyncCloud={onSyncCloud}
          leaderToDeptMap={leaderToDeptMap}
        />
      )}

      {activeTab === 'biotime' && (
        <div className="space-y-6">
      {/* Transparent Formula Display Box */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">
            Fórmula Transparente de Tasa de Ausentismo
          </span>
          <div className="text-xs text-slate-300 font-mono flex items-center gap-2 flex-wrap">
            <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
              Tasa (%) = (Ausencias Confirmadas ÷ Jornadas Programadas Elegibles) × 100
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700 shrink-0">
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block uppercase">Numerador (Ausencias)</span>
            <span className="text-lg font-bold text-rose-400">{kpis.totalAbsences}</span>
          </div>
          <span className="text-slate-500 font-bold text-xl">÷</span>
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block uppercase">Denominador (Jornadas)</span>
            <span className="text-lg font-bold text-blue-400">{kpis.totalEligibleShifts}</span>
          </div>
          <span className="text-slate-500 font-bold text-xl">=</span>
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block uppercase">Resultado Real</span>
            <span className="text-xl font-bold text-white">{kpis.absenceRate}%</span>
          </div>
        </div>
      </div>

      {/* Attendance KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Ausencias Confirmadas
          </span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{kpis.totalAbsences}</span>
          <span className="text-[11px] text-slate-400 block mt-1">Sin Entrada ni Salida</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Sindicalizados vs No Sind.
          </span>
          <div className="text-base font-bold text-slate-800 mt-1">
            {kpis.syndicatedAbsenceRate}% <span className="text-xs font-normal text-slate-500">vs</span>{' '}
            {kpis.nonSyndicatedAbsenceRate}%
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            {kpis.syndicatedAbsences} sind. / {kpis.nonSyndicatedAbsences} no sind.
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Incidencias de Marcaje
          </span>
          <span className="text-2xl font-bold text-amber-600 mt-1 block">
            {kpis.punchIncidentsCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">1 marcaje faltante (revisión)</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Ausencias Recurrentes
          </span>
          <span className="text-2xl font-bold text-rose-600 mt-1 block">
            {recurrentCollabs.length}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Colaboradores con 2+ ausencias
          </span>
        </div>
      </div>

      {/* Visual Weekly Day Heatmap / Calendar & Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap by Day of the Week */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Calendario Visual: Concentración de Ausencias por Día
              </h3>
              <p className="text-xs text-slate-500">Distribución de no asistencias e incidencias en la semana</p>
            </div>
            <span className="text-xs text-slate-400">Semana laboral</span>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {dayOrder.map((day) => {
              const item = dayCountsMap[day];
              const absenceRatio = item.total > 0 ? item.absences / item.total : 0;
              let bgClass = 'bg-slate-50 border-slate-200 text-slate-700';
              if (item.absences > 0) {
                if (absenceRatio >= 0.08) bgClass = 'bg-rose-100 border-rose-300 text-rose-900';
                else if (absenceRatio >= 0.04) bgClass = 'bg-amber-100 border-amber-300 text-amber-900';
                else bgClass = 'bg-blue-50 border-blue-200 text-blue-900';
              }

              return (
                <div
                  key={day}
                  className={`p-3 rounded-lg border text-center flex flex-col justify-between min-h-[95px] ${bgClass}`}
                >
                  <span className="font-bold text-xs truncate">{day}</span>
                  <div className="my-1">
                    <span className="text-xl font-extrabold">{item.absences}</span>
                    <span className="text-[10px] block opacity-75">ausencias</span>
                  </div>
                  <span className="text-[10px] opacity-70 truncate">
                    {item.incidents} incid.
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recurrent Absences List */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Colaboradores Recurrentes</h3>
          <p className="text-xs text-slate-500 mb-3">Reincidencia de 2 o más ausencias en el periodo</p>

          <div className="flex-1 overflow-y-auto max-h-56 space-y-2 pr-1 text-xs">
            {recurrentCollabs.length > 0 ? (
              recurrentCollabs.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-100 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-[11px] text-slate-500">
                      ID: {c.id} • {c.dept}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-200 text-rose-800">
                    {c.count} faltas
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No se detectan ausencias recurrentes
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart: Ranking of Departments by Absence Rate */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-1">
          Ranking de Departamentos por Tasa de Ausentismo
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Porcentaje calculado sobre jornadas programadas de cada departamento
        </p>

        <div className="h-64">
          {deptRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptRanking}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(label) => `Departamento: ${label}`}
                  formatter={(val: any) => [`${val}%`, 'Tasa de Ausentismo']}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="absenceRate" name="Tasa de Ausentismo (%)" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Sin datos suficientes
            </div>
          )}
        </div>
      </div>

      {/* Mandatory Detailed Attendance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Tabla Detallada de Asistencia</h3>
              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                {filteredRecords.length} registros filtrados
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditoría registro por registro comparando horario programado vs marcajes efectivos.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Pill */}
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                className={`px-2.5 py-1 ${
                  statusFilter === 'ALL' ? 'bg-slate-800 text-white font-medium' : 'bg-white text-slate-700'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => {
                  setStatusFilter('AUSENCIAS');
                  setPage(1);
                }}
                className={`px-2.5 py-1 ${
                  statusFilter === 'AUSENCIAS'
                    ? 'bg-rose-600 text-white font-medium'
                    : 'bg-white text-slate-700'
                }`}
              >
                Solo Ausencias
              </button>
              <button
                onClick={() => {
                  setStatusFilter('INCIDENCIAS');
                  setPage(1);
                }}
                className={`px-2.5 py-1 ${
                  statusFilter === 'INCIDENCIAS'
                    ? 'bg-amber-600 text-white font-medium'
                    : 'bg-white text-slate-700'
                }`}
              >
                Incidencias (1 marca)
              </button>
            </div>

            <div className="relative">
              <i className="bi bi-search absolute left-2.5 top-2 text-slate-400 text-xs"></i>
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar colaborador..."
                className="pl-7 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Nombre Completo</th>
                <th className="px-3 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Apodo</th>
                <th className="px-3 py-2.5">Departamento</th>
                <th className="px-3 py-2.5">Líder</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Día</th>
                <th className="px-3 py-2.5">Horario</th>
                <th className="px-3 py-2.5">Excepción</th>
                <th className="px-3 py-2.5">Entrada Real</th>
                <th className="px-3 py-2.5">Salida Real</th>
                <th className="px-3 py-2.5">Clasificación Incidencia</th>
                <th className="px-3 py-2.5">Revisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row) => {
                  let badgeClass = 'bg-slate-100 text-slate-700';
                  if (row.absenceStatus === 'AUSENCIA_CONFIRMADA') {
                    badgeClass = 'bg-rose-100 text-rose-800 font-bold';
                  } else if (row.absenceStatus === 'INCIDENCIA_MARCAJE') {
                    badgeClass = 'bg-amber-100 text-amber-800 font-bold';
                  } else if (row.absenceStatus === 'JUSTIFICADO_EXCEPCION') {
                    badgeClass = 'bg-blue-100 text-blue-800';
                  } else if (row.absenceStatus === 'PRESENTE') {
                    badgeClass = 'bg-emerald-100 text-emerald-800';
                  }

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-700">{row.employeeId}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{row.employeeName}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.company}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.nickname}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.department}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.leader}</td>
                      <td className="px-3 py-2.5 text-slate-700">{row.date}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.dayOfWeek}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800">
                        {row.schedule}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {row.exception || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono">
                        {row.realIn ? (
                          <span className="text-emerald-700 font-semibold">{row.realIn}</span>
                        ) : (
                          <span className="text-rose-500 font-semibold italic">VACÍA</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono">
                        {row.realOut ? (
                          <span className="text-emerald-700 font-semibold">{row.realOut}</span>
                        ) : (
                          <span className="text-rose-500 font-semibold italic">VACÍA</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${badgeClass}`}>
                          {row.absenceStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                          {row.reviewStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-400">
                    No hay registros de asistencia con los criterios actuales
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Mostrando {paginatedRows.length} de {filteredRecords.length} registros
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-2 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
