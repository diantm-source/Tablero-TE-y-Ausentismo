import React, { useMemo, useState } from 'react';
import { FilteredKPIs } from '../../services/kpiEngine';
import { AttendanceRecord, OvertimeRecord } from '../../types';
import { exportToExcel } from '../../services/excelParser';
import { DataTable } from '../DataTable';
import { OvertimeTrafficLightTable } from '../OvertimeTrafficLightTable';
import { ColumnDef } from '@tanstack/react-table';
import {
  LineChart,
  Line,
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
} from 'recharts';

interface OvertimeAnalysisViewProps {
  kpis: FilteredKPIs;
  allOvertime: OvertimeRecord[];
  allAttendance?: AttendanceRecord[];
}

export const OvertimeAnalysisView: React.FC<OvertimeAnalysisViewProps> = ({ kpis, allAttendance }) => {
  const [subView, setSubView] = useState<'trafficLight' | 'dashboard' | 'pending'>('trafficLight');
  const [trendMode, setTrendMode] = useState<'weekly' | 'daily'>('weekly');
  // Table search & sort state
  const pendingRecords = kpis.filteredOvertime.filter((r) => r.status === 'PENDIENTE');


  const columns = useMemo<ColumnDef<OvertimeRecord>[]>(
    () => [
      {
        accessorKey: 'employeeId',
        header: 'ID Empleado',
        cell: (info) => <span className="font-mono font-medium text-slate-700">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'employeeName',
        header: 'Nombre Completo',
        cell: (info) => <span className="font-medium text-slate-900">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'company',
        header: 'Empresa',
      },
      {
        accessorKey: 'department',
        header: 'Departamento',
      },
      {
        accessorKey: 'leader',
        header: 'Líder',
      },
      {
        accessorKey: 'startDate',
        header: 'Fecha TE',
      },
      {
        id: 'scheduleTimes',
        header: 'Horario',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-600">
            {row.original.startTime} - {row.original.endTime}
          </span>
        ),
      },
      {
        accessorKey: 'requestedHours',
        header: 'Horas Solic.',
        cell: (info) => (
          <span className="font-bold text-amber-600 text-right block">
            {info.getValue() as number} hrs
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: 'Motivo',
        cell: (info) => (
          <div className="max-w-xs line-clamp-2" title={info.getValue() as string}>
            {info.getValue() as string}
          </div>
        ),
      },
      {
        accessorKey: 'reviewFormatStatus',
        header: 'Revisión Formato',
        cell: (info) => {
          const val = info.getValue() as string;
          return (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                val === 'CORRECTO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: (info) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
            {info.getValue() as string}
          </span>
        ),
      },
    ],
    []
  );

  const handleExportPending = () => {
    const exportData = pendingRecords.map((r) => ({
      'ID Empleado': r.employeeId,
      'Nombre Completo': r.employeeName,
      Empresa: r.company,
      Departamento: r.department,
      Líder: r.leader,
      'Fecha TE': r.startDate,
      'Hora Inicio': r.startTime,
      'Hora Fin': r.endTime,
      'Horas Solicitadas': r.requestedHours,
      Motivo: r.reason,
      'Revisión Formato': r.reviewFormatStatus,
      'Fecha Solicitud': r.requestDate || r.startDate,
      'Estado Aprobación': r.status,
    }));
    exportToExcel(exportData, 'BioTime_Solicitudes_TE_Pendientes');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
              Módulo de Tiempo Extra
            </span>
            <span className="text-xs text-slate-500">Cálculo de horas cronológicas exactas</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <i className="bi bi-funnel-fill text-[11px] text-emerald-600"></i>
              <span>{kpis.filteredOvertime.length} registros filtrados</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Análisis y Auditoría de Tiempo Extra</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Evaluación de solicitudes, control de turnos cruzando medianoche y motivos de justificación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPending}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <i className="bi bi-file-earmark-excel-fill text-sm"></i>
            <span>Exportar Pendientes ({pendingRecords.length})</span>
          </button>
        </div>
      </div>

      {/* Sub-view Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setSubView('trafficLight')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            subView === 'trafficLight'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <i className="bi bi-traffic-light-fill text-sm text-amber-300"></i>
          <span>Semáforo Semanal por Colaborador</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView('dashboard')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            subView === 'dashboard'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <i className="bi bi-graph-up-arrow text-sm"></i>
          <span>Métricas y Tendencias Gráficas</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView('pending')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            subView === 'pending'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <i className="bi bi-clock-history text-sm text-amber-500"></i>
          <span>Solicitudes Pendientes ({pendingRecords.length})</span>
        </button>
      </div>

      {/* Sub-view 1: Semáforo Semanal (TanStack Table) */}
      {subView === 'trafficLight' && (
        <OvertimeTrafficLightTable
          sourceData={kpis.filteredOvertime}
          allAttendance={allAttendance}
        />
      )}

      {/* Sub-view 2: Dashboard de Métricas y Gráficos */}
      {subView === 'dashboard' && (
        <div className="space-y-6">
          {/* Overtime Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Solicitudes Totales
          </span>
          <span className="text-2xl font-bold text-slate-900">{kpis.totalOtRequests}</span>
          <span className="text-[11px] text-slate-400 block mt-1">
            {kpis.collaboratorsWithOtCount} colaboradores
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Aprobadas
          </span>
          <span className="text-2xl font-bold text-emerald-600">{kpis.approvedOtRequests}</span>
          <span className="text-[11px] text-emerald-700 block mt-1 font-medium">
            {kpis.approvalRateByRequests}% tasa solic.
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Pendientes
          </span>
          <span className="text-2xl font-bold text-amber-600">{kpis.pendingOtRequests}</span>
          <span className="text-[11px] text-amber-700 block mt-1 font-medium">
            {kpis.totalPendingHours} hrs pendientes
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Rechazadas
          </span>
          <span className="text-2xl font-bold text-rose-600">{kpis.rejectedOtRequests}</span>
          <span className="text-[11px] text-slate-400 block mt-1">Rechazadas en BioTime</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Horas Solicitadas
          </span>
          <span className="text-2xl font-bold text-slate-900">{kpis.totalRequestedHours}</span>
          <span className="text-[11px] text-slate-500 block mt-1">Volumen bruto</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Horas Aprobadas
          </span>
          <span className="text-2xl font-bold text-emerald-600">{kpis.totalApprovedHours}</span>
          <span className="text-[11px] text-emerald-700 block mt-1 font-medium">
            {kpis.approvalRateByHours}% tasa horas
          </span>
        </div>
      </div>

      {/* Charts Grid 1: Daily Evolution & Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily / Weekly Evolution Line */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {trendMode === 'weekly' ? 'Evolución Semanal del Tiempo Extra' : 'Evolución Diaria del Tiempo Extra'}
              </h3>
              <p className="text-xs text-slate-500">
                {trendMode === 'weekly'
                  ? 'Horas solicitadas vs aprobadas por Semanas ISO 8601 (Lunes a Domingo)'
                  : 'Horas solicitadas vs aprobadas por fecha real'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setTrendMode('weekly')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  trendMode === 'weekly'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Semana
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('daily')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  trendMode === 'daily'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Día
              </button>
            </div>
          </div>
          <div className="h-64">
            {trendMode === 'weekly' ? (
              kpis.weeklyMetrics.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={kpis.weeklyMetrics}>
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
                    <Line
                      type="monotone"
                      dataKey="requestedHours"
                      name="Horas Solicitadas"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="approvedHours"
                      name="Horas Aprobadas"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Sin registros semanales en el rango seleccionado
                </div>
              )
            ) : (
              kpis.dailyMetrics.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={kpis.dailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(label) => `Fecha: ${label}`}
                      formatter={(val: any, name: any) => [`${val} hrs`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="requestedHours"
                      name="Horas Solicitadas"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="approvedHours"
                      name="Horas Aprobadas"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Sin registros en el rango seleccionado
                </div>
              )
            )}
          </div>
        </div>

        {/* Status Distribution Donut */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Distribución de Estados</h3>
          <p className="text-xs text-slate-500 mb-2">Proporción de solicitudes registradas</p>
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            {kpis.statusDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={kpis.statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {kpis.statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [`${val} solicitudes`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">Sin datos de estados</div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Grid 2: Horizontal Bar - Top Departments & Most Frequent Reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horizontal Bar: Top Departments */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Departamentos con Mayor Volumen de Tiempo Extra
          </h3>
          <p className="text-xs text-slate-500 mb-4">Horas aprobadas acumuladas por área</p>
          <div className="h-64">
            {kpis.departmentsMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kpis.departmentsMetrics.slice(0, 6)}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="department" type="category" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip
                    labelFormatter={(label) => `Departamento: ${label}`}
                    formatter={(val: any, name: any) => [`${val} hrs`, name]}
                  />
                  <Bar dataKey="approvedHours" name="Horas Aprobadas" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Sin datos departamentales
              </div>
            )}
          </div>
        </div>

        {/* Motivos más frecuentes */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Motivos de Tiempo Extra Más Frecuentes
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Homologación y frecuencia de causas reportadas
          </p>
          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-64 pr-1 text-xs">
            {kpis.reasonsFrequency.length > 0 ? (
              kpis.reasonsFrequency.map((r, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between"
                >
                  <div className="pr-2">
                    <div className="font-semibold text-slate-800 line-clamp-1">{r.reason}</div>
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                      {r.category}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900">{r.count} solicitudes</div>
                    <div className="text-[11px] text-slate-500">{r.hours} hrs</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                Sin motivos registrados
              </div>
            )}
          </div>
        </div>
      </div>
        </div>
      )}


      {/* Sub-view 3: Tabla de Solicitudes Pendientes */}
      {subView === 'pending' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Tabla Informativa de Solicitudes Pendientes (TanStack Table)
              </h3>
              <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
                {pendingRecords.length} pendientes
              </span>
            </div>
            <span className="text-xs text-slate-500">Ordenamiento por columna, búsqueda y paginación reactiva</span>
          </div>

          <DataTable
            columns={columns}
            data={pendingRecords}
            searchPlaceholder="Buscar por empleado, área, líder o motivo..."
            defaultPageSize={10}
            emptyMessage="No hay solicitudes pendientes en el rango de filtros seleccionado."
          />
        </div>
      )}
    </div>
  );
};

