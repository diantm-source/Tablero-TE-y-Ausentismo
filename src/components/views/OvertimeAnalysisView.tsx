import React, { useMemo, useState } from 'react';
import { FilteredKPIs } from '../../services/kpiEngine';
import {
  AnnualOvertimeRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  WeeklyMatrixRecord,
} from '../../types';
import { determineSyndicatedStatus } from '../../services/businessRules';
import { exportToExcel } from '../../services/excelParser';
import { getTurnoBadgeClass, enrichMatrixWithLeaders } from '../../services/overtimeParser';
import { DataTable } from '../DataTable';
import { OvertimeTrafficLightTable } from '../OvertimeTrafficLightTable';
import { OvertimeGeneralView } from './OvertimeGeneralView';
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
  annualOvertime?: AnnualOvertimeRecord[];
  matrixRecords?: WeeklyMatrixRecord[];
  filters: GlobalFilterState;
  isSyncing?: boolean;
  onSyncCloud?: () => Promise<void>;
}

export const OvertimeAnalysisView: React.FC<OvertimeAnalysisViewProps> = ({
  kpis,
  allOvertime,
  allAttendance,
  annualOvertime = [],
  matrixRecords = [],
  filters,
  isSyncing = false,
  onSyncCloud,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'trafficLight' | 'dashboard' | 'pending'>('general');
  const [trendMode, setTrendMode] = useState<'weekly' | 'daily'>('weekly');
  const [deptChartType, setDeptChartType] = useState<'bar' | 'pie'>('bar');
  const [dayChartType, setDayChartType] = useState<'bar' | 'pie'>('bar');
  const [shiftChartType, setShiftChartType] = useState<'bar' | 'pie'>('bar');
  // Table search & sort state
  const pendingRecords = kpis.filteredOvertime.filter((r) => r.status === 'PENDIENTE');

  // Fuente de datos de la Matriz Semanal (Registro_Prolongacion.xlsx) o Concentrado Anual enriquecida con Líderes
  const sourceMatrixRecords = useMemo(() => {
    const base = matrixRecords && matrixRecords.length > 0 ? matrixRecords : annualOvertime;
    if (annualOvertime && annualOvertime.length > 0) {
      return enrichMatrixWithLeaders(base, annualOvertime);
    }
    return base;
  }, [matrixRecords, annualOvertime]);

  // Totales globales antes de filtros (Colaboradores Únicos con horasTotales > 0)
  const globalKPIs = useMemo(() => {
    let totalRecords = sourceMatrixRecords.length;
    let totalHoras = 0;
    let totalNormal = 0;
    let totalProlongacion = 0;
    const uniqueEmployees = new Set<string>();

    for (const r of sourceMatrixRecords) {
      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || 0);
      const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;
      totalHoras += hTot;
      totalNormal += hNorm;
      totalProlongacion += hProl;
      if (r.employeeId && hTot > 0) uniqueEmployees.add(String(r.employeeId).trim());
    }

    return {
      totalRecords,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalNormal: Math.round(totalNormal * 10) / 10,
      totalProlongacion: Math.round(totalProlongacion * 10) / 10,
      uniqueCollaborators: uniqueEmployees.size,
    };
  }, [sourceMatrixRecords]);

  // Registros filtrados reactivos a la barra de filtros lateral
  const filteredMatrixRecords = useMemo(() => {
    return sourceMatrixRecords.filter((rec) => {
      // Tipo de Colaborador
      const isSynd = rec.isSyndicated !== undefined ? rec.isSyndicated : true;
      if (filters.collaboratorType === 'SINDICALIZADO' && !isSynd) return false;
      if (filters.collaboratorType === 'NO_SINDICALIZADO' && isSynd) return false;

      // Departamento
      if (filters.departments.length > 0 && !filters.departments.includes('ALL')) {
        if (!filters.departments.includes(rec.department)) return false;
      }

      // Líder
      if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
        if (rec.leader && !filters.leaders.includes(rec.leader)) return false;
      }

      // Semana
      if (filters.isoWeek && filters.isoWeek !== 'ALL') {
        const recWeekKey = `${rec.isoYear}-W${String(rec.weekNumber).padStart(2, '0')}`;
        const recShortWeek = rec.week ? rec.week.toUpperCase() : '';
        const filterNorm = filters.isoWeek.toUpperCase();
        if (
          recWeekKey !== filters.isoWeek &&
          recShortWeek !== filterNorm &&
          !filterNorm.endsWith(String(rec.weekNumber).padStart(2, '0'))
        ) {
          return false;
        }
      }

      // Mes
      if (filters.month && filters.month !== 'ALL') {
        const recMonthKey =
          rec.fecha && /^\d{4}-\d{2}/.test(rec.fecha)
            ? rec.fecha.slice(0, 7)
            : `${rec.isoYear}-${String(rec.monthNumber).padStart(2, '0')}`;
        if (recMonthKey !== filters.month) return false;
      }

      // Búsqueda rápida
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const match =
          rec.employeeId.toLowerCase().includes(term) ||
          rec.employeeName.toLowerCase().includes(term) ||
          (rec.sapId && rec.sapId.toLowerCase().includes(term)) ||
          rec.department.toLowerCase().includes(term) ||
          rec.week.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [sourceMatrixRecords, filters]);

  // Totales filtrados reactivos
  const summaryKPIs = useMemo(() => {
    let totalRecords = filteredMatrixRecords.length;
    let totalHoras = 0;
    let totalNormal = 0;
    let totalProlongacion = 0;
    const uniqueEmployees = new Set<string>();

    for (const r of filteredMatrixRecords) {
      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || 0);
      const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;
      totalHoras += hTot;
      totalNormal += hNorm;
      totalProlongacion += hProl;
      if (r.employeeId && hTot > 0) uniqueEmployees.add(String(r.employeeId).trim());
    }

    return {
      totalRecords,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalNormal: Math.round(totalNormal * 10) / 10,
      totalProlongacion: Math.round(totalProlongacion * 10) / 10,
      uniqueCollaborators: uniqueEmployees.size,
    };
  }, [filteredMatrixRecords]);

  const calcPct = (num: number, den: number): string => {
    if (!den || den <= 0) return '100.0';
    return ((num / den) * 100).toFixed(1);
  };

  // Top Colaborador con mayor cantidad de horas extra totales en la selección y Líder a cargo
  const topCollaborator = useMemo(() => {
    if (filteredMatrixRecords.length === 0) return null;

    const empMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        department: string;
        leader: string;
        turno: string;
        horasNormales: number;
        horasProlongacion: number;
        horasTotales: number;
      }
    >();

    for (const r of filteredMatrixRecords) {
      const id = String(r.employeeId || '').trim();
      if (!id) continue;

      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || 0);
      const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;
      const turno = r.turno || 'Sin Turno';
      const leader = r.liderArea || r.leader || 'Sin Líder Asignado';

      const existing = empMap.get(id);
      if (!existing) {
        empMap.set(id, {
          employeeId: id,
          employeeName: r.employeeName || 'Sin Nombre',
          department: r.department || 'Sin Departamento',
          leader,
          turno,
          horasNormales: hNorm,
          horasProlongacion: hProl,
          horasTotales: hTot,
        });
      } else {
        existing.horasNormales += hNorm;
        existing.horasProlongacion += hProl;
        existing.horasTotales += hTot;
        if (existing.turno === 'Sin Turno' && turno !== 'Sin Turno') {
          existing.turno = turno;
        } else if (turno !== 'Sin Turno' && !existing.turno.includes(turno)) {
          existing.turno = `${existing.turno}, ${turno}`;
        }
        if (
          (!existing.leader || existing.leader === 'Sin Líder Asignado') &&
          leader !== 'Sin Líder Asignado'
        ) {
          existing.leader = leader;
        }
      }
    }

    let top: {
      employeeId: string;
      employeeName: string;
      department: string;
      leader: string;
      turno: string;
      horasNormales: number;
      horasProlongacion: number;
      horasTotales: number;
    } | null = null;

    for (const item of empMap.values()) {
      if (!top || item.horasTotales > top.horasTotales) {
        top = item;
      }
    }

    return top && top.horasTotales > 0 ? top : null;
  }, [filteredMatrixRecords]);

  // Gráfica 1: Horas Extra por Departamento
  const deptOvertimeData = useMemo(() => {
    const map = new Map<string, number>();
    let grandTotal = 0;

    for (const r of filteredMatrixRecords) {
      const dept = (r.department || 'Sin Área').trim();
      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      if (hTot > 0) {
        map.set(dept, (map.get(dept) || 0) + hTot);
        grandTotal += hTot;
      }
    }

    const COLORS = [
      '#2563eb',
      '#3b82f6',
      '#06b6d4',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#6366f1',
      '#14b8a6',
      '#f97316',
      '#64748b',
    ];

    const sorted = Array.from(map.entries())
      .map(([department, hours], idx) => {
        const h = Math.round(hours * 10) / 10;
        const pct = grandTotal > 0 ? Number(((hours / grandTotal) * 100).toFixed(1)) : 0;
        return {
          department,
          hours: h,
          percentage: pct,
          color: COLORS[idx % COLORS.length],
        };
      })
      .sort((a, b) => b.hours - a.hours);

    return { data: sorted, grandTotal: Math.round(grandTotal * 10) / 10 };
  }, [filteredMatrixRecords]);

  // Gráfica 2: Distribución por Día de la Semana
  const dailyDistributionData = useMemo(() => {
    const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const DAY_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#eab308', '#f97316', '#8b5cf6', '#ec4899'];

    const daySums = [0, 0, 0, 0, 0, 0, 0];
    const dayDates = ['', '', '', '', '', '', ''];
    let grandTotal = 0;

    let foundDiasDetalle = false;
    for (const r of filteredMatrixRecords) {
      if (r.diasDetalle && r.diasDetalle.length === 7) {
        foundDiasDetalle = true;
        for (let i = 0; i < 7; i++) {
          const d = r.diasDetalle[i];
          const h = d.horasTotales || 0;
          daySums[i] += h;
          grandTotal += h;
          if (!dayDates[i] && d.dateStr) {
            dayDates[i] = d.dateStr;
          }
        }
      }
    }

    if (!foundDiasDetalle) {
      for (const r of filteredMatrixRecords) {
        const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
        if (hTot > 0 && r.fecha) {
          try {
            const [y, m, d] = r.fecha.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            const dayOfWeek = (dt.getDay() + 6) % 7; // 0: Lunes, 6: Domingo
            daySums[dayOfWeek] += hTot;
            grandTotal += hTot;
            if (!dayDates[dayOfWeek]) {
              dayDates[dayOfWeek] = r.fecha;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    const result = DAY_NAMES.map((name, idx) => {
      const h = Math.round(daySums[idx] * 10) / 10;
      const pct = grandTotal > 0 ? Number(((daySums[idx] / grandTotal) * 100).toFixed(1)) : 0;
      let dateLabel = '';
      if (dayDates[idx]) {
        const parts = dayDates[idx].split('-');
        if (parts.length === 3) {
          dateLabel = `${parts[2]}/${parts[1]}`;
        }
      }
      return {
        dayName: name,
        fullLabel: dateLabel ? `${name} (${dateLabel})` : name,
        date: dayDates[idx],
        dateLabel,
        hours: h,
        percentage: pct,
        color: DAY_COLORS[idx],
      };
    });

    return { data: result, grandTotal: Math.round(grandTotal * 10) / 10 };
  }, [filteredMatrixRecords]);

  // Gráfica 3: Turnos con Mayor Solicitud de Tiempo Extra
  const shiftDistributionData = useMemo(() => {
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;

    for (const r of filteredMatrixRecords) {
      if (r.horasPorTurno) {
        t1 += r.horasPorTurno.turno1 || 0;
        t2 += r.horasPorTurno.turno2 || 0;
        t3 += r.horasPorTurno.turno3 || 0;
      } else if (r.turno) {
        const h = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
        const norm = r.turno.toLowerCase();
        const has1 = norm.includes('1er') || norm.includes('primer');
        const has2 = norm.includes('2do') || norm.includes('segundo');
        const has3 = norm.includes('3er') || norm.includes('tercer');
        const count = (has1 ? 1 : 0) + (has2 ? 1 : 0) + (has3 ? 1 : 0);
        if (count > 0) {
          const split = h / count;
          if (has1) t1 += split;
          if (has2) t2 += split;
          if (has3) t3 += split;
        } else {
          t1 += h;
        }
      }
    }

    const grandTotal = t1 + t2 + t3;

    return {
      grandTotal: Math.round(grandTotal * 10) / 10,
      data: [
        {
          turno: '1er Turno',
          shortName: '1er Turno',
          description: '07:00 a 15:00',
          hours: Math.round(t1 * 10) / 10,
          percentage: grandTotal > 0 ? Number(((t1 / grandTotal) * 100).toFixed(1)) : 0,
          color: '#f59e0b', // Amber
        },
        {
          turno: '2do Turno',
          shortName: '2do Turno',
          description: '15:00 a 23:00',
          hours: Math.round(t2 * 10) / 10,
          percentage: grandTotal > 0 ? Number(((t2 / grandTotal) * 100).toFixed(1)) : 0,
          color: '#3b82f6', // Blue
        },
        {
          turno: '3er Turno',
          shortName: '3er Turno',
          description: '23:00 a 07:00',
          hours: Math.round(t3 * 10) / 10,
          percentage: grandTotal > 0 ? Number(((t3 / grandTotal) * 100).toFixed(1)) : 0,
          color: '#8b5cf6', // Purple
        },
      ],
    };
  }, [filteredMatrixRecords]);

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
        accessorKey: 'turno',
        header: 'Turno',
        cell: ({ row }) => {
          const t = row.original.turno || 'Sin Turno';
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${getTurnoBadgeClass(
                t
              )}`}
            >
              {t}
            </span>
          );
        },
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
              <span>{filteredMatrixRecords.length} registros en selección</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Análisis y Auditoría de Tiempo Extra</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Sincronización multi-hoja de la Matriz Semanal y desglose de Horas Extra Normales vs Prolongación de Jornada.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-mono font-bold">
            <i className="bi bi-file-earmark-spreadsheet-fill text-emerald-600"></i>
            <span>Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'</span>
          </div>

          <button
            onClick={handleExportPending}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <i className="bi bi-file-earmark-excel-fill text-sm"></i>
            <span>Exportar Pendientes ({pendingRecords.length})</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Cards Summary (Comparativas contra el total global) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Registros Totales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Registros Totales
            </span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <i className="bi bi-list-check text-sm"></i>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">
              {summaryKPIs.totalRecords.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              de <strong className="text-slate-700">{globalKPIs.totalRecords.toLocaleString('es-MX')}</strong> registros en total ({calcPct(summaryKPIs.totalRecords, globalKPIs.totalRecords)}%)
            </div>
          </div>
        </div>

        {/* 2. Horas Extra Totales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas Extra Totales
            </span>
            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <i className="bi bi-clock-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-indigo-600">
              {summaryKPIs.totalHoras.toFixed(1)} hrs
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              de <strong className="text-slate-700">{globalKPIs.totalHoras.toFixed(1)}</strong> hrs en total ({calcPct(summaryKPIs.totalHoras, globalKPIs.totalHoras)}%)
            </div>
          </div>
        </div>

        {/* 3. Horas Extra Normal */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas Extra Normal
            </span>
            <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <i className="bi bi-lightning-charge-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-sky-600">
              {summaryKPIs.totalNormal.toFixed(1)} hrs
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              de <strong className="text-slate-700">{globalKPIs.totalNormal.toFixed(1)}</strong> hrs TE ({calcPct(summaryKPIs.totalNormal, globalKPIs.totalNormal)}%)
            </div>
          </div>
        </div>

        {/* 4. Horas Prolongación de Jornada */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas Prolongación de Jornada
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <i className="bi bi-hourglass-split text-sm"></i>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-amber-600">
              {summaryKPIs.totalProlongacion.toFixed(1)} hrs
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              de <strong className="text-slate-700">{globalKPIs.totalProlongacion.toFixed(1)}</strong> hrs Prolongación ({calcPct(summaryKPIs.totalProlongacion, globalKPIs.totalProlongacion)}%)
            </div>
          </div>
        </div>

        {/* 5. Colaboradores Únicos */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Colaboradores Únicos
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="bi bi-people-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-emerald-700">
              {summaryKPIs.uniqueCollaborators.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              de <strong className="text-slate-700">{globalKPIs.uniqueCollaborators.toLocaleString('es-MX')}</strong> colaboradores ({calcPct(summaryKPIs.uniqueCollaborators, globalKPIs.uniqueCollaborators)}%)
            </div>
          </div>
        </div>
      </div>

      {/* Sub-view Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'general'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">🗂️</span>
          <span>General</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trafficLight')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'trafficLight'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">🚦</span>
          <span>Semáforo Semanal por Colaborador</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">📈</span>
          <span>Métricas y Tendencias Gráficas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span aria-hidden="true">🕒</span>
          <span>Solicitudes Pendientes ({pendingRecords.length})</span>
        </button>
      </div>

      {/* Sub-view 1: General - Concentrado Anual (TanStack Table) */}
      {activeTab === 'general' && (
        <OvertimeGeneralView
          records={annualOvertime}
          matrixRecords={matrixRecords}
          filters={filters}
          allOvertime={allOvertime}
          allAttendance={allAttendance}
          isSyncing={isSyncing}
          onSyncCloud={onSyncCloud}
        />
      )}

      {/* Sub-view 2: Semáforo Semanal (TanStack Table) */}
      {activeTab === 'trafficLight' && (
        <OvertimeTrafficLightTable
          matrixRecords={filteredMatrixRecords}
          sourceData={kpis.filteredOvertime}
          allAttendance={allAttendance}
        />
      )}

      {/* Sub-view 3: Dashboard de Métricas y Gráficos */}
      {activeTab === 'dashboard' && (
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

          {/* Requerimiento 3.A: Tarjeta Destacada Top Colaborador de la Selección y Líder a Cargo */}
          {topCollaborator ? (
            <div className="bg-gradient-to-r from-amber-50 via-white to-orange-50 rounded-2xl border-2 border-amber-300/80 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-36 h-36 bg-amber-100/60 rounded-full blur-2xl pointer-events-none" />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                    <i className="bi bi-trophy-fill text-amber-100 text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                        Top Colaborador de la Selección
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-600 bg-white/90 px-2.5 py-0.5 rounded border border-slate-200">
                        ID: {topCollaborator.employeeId}
                      </span>
                    </div>
                    <h4 className="text-lg font-black text-slate-900 mt-1">
                      {topCollaborator.employeeName}
                    </h4>
                    <div className="flex items-center gap-2.5 mt-2 flex-wrap text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5 font-medium bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200">
                        <i className="bi bi-building text-slate-500"></i>
                        <span>{topCollaborator.department}</span>
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${getTurnoBadgeClass(
                          topCollaborator.turno
                        )}`}
                      >
                        <i className="bi bi-clock-history mr-1"></i>
                        <span>{topCollaborator.turno}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                        <i className="bi bi-person-badge-fill text-emerald-600"></i>
                        <span>Líder a cargo: <strong className="text-emerald-950">{topCollaborator.leader}</strong></span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-white/95 backdrop-blur-xs px-5 py-3.5 rounded-xl border border-amber-200/90 shrink-0 shadow-2xs">
                  <div className="text-right">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Total Horas Extra
                    </div>
                    <div className="text-3xl font-black text-amber-600">
                      {topCollaborator.horasTotales.toFixed(1)} <span className="text-base font-bold text-slate-600">hrs</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-end gap-2 mt-1">
                      <span className="text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100" title="Horas Extra Normales">
                        {topCollaborator.horasNormales.toFixed(1)} h norm.
                      </span>
                      <span className="text-slate-400">+</span>
                      <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100" title="Horas Prolongación de Jornada">
                        {topCollaborator.horasProlongacion.toFixed(1)} h prol.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-500">
              <i className="bi bi-info-circle mr-1 text-slate-400"></i>
              No hay colaboradores con horas extra registradas (&gt; 0 hrs) en los filtros actuales.
            </div>
          )}

          {/* Requerimiento 3.B: Gráficas Interactivas con Switch Barras / Pastel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfica 1: Horas Extra por Departamento */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Horas Extra por Departamento</span>
                    <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                      {deptOvertimeData.grandTotal.toFixed(1)} hrs tot.
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Departamentos ordenados de mayor a menor con horas y porcentaje (%)
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setDeptChartType('bar')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                      deptChartType === 'bar' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📊</span>
                    <span>Barras</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeptChartType('pie')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                      deptChartType === 'pie' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🥧</span>
                    <span>Pastel</span>
                  </button>
                </div>
              </div>

              <div className="h-64 flex items-center justify-center">
                {deptOvertimeData.data.length > 0 ? (
                  deptChartType === 'bar' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={deptOvertimeData.data.slice(0, 8)}
                        layout="vertical"
                        margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit=" h" />
                        <YAxis
                          dataKey="department"
                          type="category"
                          tick={{ fontSize: 10 }}
                          width={110}
                          tickFormatter={(val) => (val.length > 16 ? `${val.slice(0, 14)}...` : val)}
                        />
                        <Tooltip
                          formatter={(val: any, name: any, item: any) => [
                            `${val} hrs (${item.payload.percentage}%)`,
                            'Horas Extra',
                          ]}
                          labelFormatter={(l) => `Departamento: ${l}`}
                        />
                        <Bar dataKey="hours" name="Horas" radius={[0, 4, 4, 0]}>
                          {deptOvertimeData.data.slice(0, 8).map((entry, idx) => (
                            <Cell key={`dept-b-${idx}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptOvertimeData.data.slice(0, 8)}
                          dataKey="hours"
                          nameKey="department"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {deptOvertimeData.data.slice(0, 8).map((entry, idx) => (
                            <Cell key={`dept-p-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any, name: any, item: any) => [
                            `${val} hrs (${item.payload.percentage}%)`,
                            name,
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                ) : (
                  <div className="text-xs text-slate-400">Sin datos departamentales en la selección</div>
                )}
              </div>

              {/* Badges footer con top departamentos */}
              {deptOvertimeData.data.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap text-[11px]">
                  {deptOvertimeData.data.slice(0, 4).map((d, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                      <strong className="truncate max-w-[90px]">{d.department}:</strong>
                      <span>{d.hours}h ({d.percentage}%)</span>
                    </span>
                  ))}
                  {deptOvertimeData.data.length > 4 && (
                    <span className="text-[10px] text-slate-400">
                      +{deptOvertimeData.data.length - 4} más
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Gráfica 3: Turnos con Mayor Solicitud de Tiempo Extra */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Turnos con Mayor Solicitud de Tiempo Extra</span>
                    <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                      {shiftDistributionData.grandTotal.toFixed(1)} hrs tot.
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Volumen de horas y porcentaje (%) de participación por turno de trabajo
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShiftChartType('bar')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                      shiftChartType === 'bar' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📊</span>
                    <span>Barras</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftChartType('pie')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                      shiftChartType === 'pie' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🥧</span>
                    <span>Pastel</span>
                  </button>
                </div>
              </div>

              <div className="h-64 flex items-center justify-center">
                {shiftDistributionData.grandTotal > 0 ? (
                  shiftChartType === 'bar' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={shiftDistributionData.data} margin={{ top: 15, right: 15, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="shortName" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" h" />
                        <Tooltip
                          formatter={(val: any, name: any, item: any) => [
                            `${val} hrs (${item.payload.percentage}%)`,
                            item.payload.description ? `Horario: ${item.payload.description}` : 'Horas',
                          ]}
                          labelFormatter={(l) => `Turno: ${l}`}
                        />
                        <Bar dataKey="hours" name="Horas" radius={[4, 4, 0, 0]}>
                          {shiftDistributionData.data.map((entry, idx) => (
                            <Cell key={`shift-b-${idx}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={shiftDistributionData.data}
                          dataKey="hours"
                          nameKey="turno"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                        >
                          {shiftDistributionData.data.map((entry, idx) => (
                            <Cell key={`shift-p-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any, name: any, item: any) => [
                            `${val} hrs (${item.payload.percentage}%)`,
                            name,
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                ) : (
                  <div className="text-xs text-slate-400">Sin datos de turnos en la selección</div>
                )}
              </div>

              {/* Desglose de Turnos footer */}
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                {shiftDistributionData.data.map((item, i) => (
                  <div key={i} className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                      {item.shortName}
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">{item.hours} hrs</div>
                    <div className="text-[10px] text-slate-500 font-semibold">{item.percentage}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráfica 2: Distribución por Día de la Semana */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Distribución por Día de la Semana</span>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                    {dailyDistributionData.grandTotal.toFixed(1)} hrs tot.
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Desglose diario (Lunes a Domingo) con fechas correspondientes, total de horas y porcentaje (%)
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setDayChartType('bar')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                    dayChartType === 'bar' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📊</span>
                  <span>Barras</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDayChartType('pie')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                    dayChartType === 'pie' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🥧</span>
                  <span>Pastel</span>
                </button>
              </div>
            </div>

            <div className="h-64 flex items-center justify-center">
              {dailyDistributionData.grandTotal > 0 ? (
                dayChartType === 'bar' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyDistributionData.data} margin={{ top: 15, right: 15, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="dayName"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val, idx) => {
                          const item = dailyDistributionData.data[idx];
                          return item?.dateLabel ? `${val} (${item.dateLabel})` : val;
                        }}
                      />
                      <YAxis tick={{ fontSize: 11 }} unit=" h" />
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} hrs (${item.payload.percentage}%)`,
                          item.payload.date ? `Fecha: ${item.payload.date}` : 'Horas',
                        ]}
                        labelFormatter={(l, items) => {
                          const item = items?.[0]?.payload;
                          return item?.date ? `${l} — ${item.date}` : String(l);
                        }}
                      />
                      <Bar dataKey="hours" name="Horas" radius={[4, 4, 0, 0]}>
                        {dailyDistributionData.data.map((entry, idx) => (
                          <Cell key={`day-b-${idx}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dailyDistributionData.data.filter((d) => d.hours > 0)}
                        dataKey="hours"
                        nameKey="fullLabel"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {dailyDistributionData.data.filter((d) => d.hours > 0).map((entry, idx) => (
                          <Cell key={`day-p-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} hrs (${item.payload.percentage}%)`,
                          item.payload.fullLabel,
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )
              ) : (
                <div className="text-xs text-slate-400">Sin desglose diario con horas en la selección</div>
              )}
            </div>

            {/* Días footer badges */}
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
              {dailyDistributionData.data.map((d, i) => (
                <div key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase truncate">
                    {d.dayName}
                  </div>
                  {d.dateLabel && (
                    <div className="text-[10px] text-slate-400 font-mono">{d.dateLabel}</div>
                  )}
                  <div className="font-bold text-slate-900 mt-0.5">{d.hours} hrs</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{d.percentage}%</div>
                </div>
              ))}
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


      {/* Sub-view 4: Tabla de Solicitudes Pendientes */}
      {activeTab === 'pending' && (
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

