import React, { useMemo, useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
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
} from 'recharts';
import {
  AbsenceRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
} from '../../types';
import { determineSyndicatedStatus } from '../../services/businessRules';
import { exportToExcel } from '../../services/excelParser';
import { isRecordInLeaderScope } from '../../services/kpiEngine';

interface AbsenceConcentratedViewProps {
  records: AbsenceRecord[];
  filters: GlobalFilterState;
  allOvertime?: OvertimeRecord[];
  allAttendance?: AttendanceRecord[];
  isSyncing?: boolean;
  onSyncCloud?: () => Promise<void>;
  leaderToDeptMap?: Map<string, Set<string>>;
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const TYPE_PALETTE = [
  '#2563eb', // blue-600
  '#f59e0b', // amber-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#10b981', // emerald-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#64748b', // slate-500
];

function isUnjustifiedAbsence(absenceType: string): boolean {
  return (absenceType || '').trim().toUpperCase() === 'FALTA INJUSTIFICADA';
}

function getAbsenceTypeBadgeClass(absenceType: string): string {
  if (isUnjustifiedAbsence(absenceType)) {
    return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
  }
  const norm = (absenceType || '').trim().toUpperCase();
  if (norm.includes('INCAPACIDAD')) {
    return 'bg-sky-50 text-sky-800 border-sky-200 font-semibold';
  }
  if (norm.includes('PERMISO')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 font-semibold';
  }
  if (norm.includes('VACACION')) {
    return 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
}

export const AbsenceConcentratedView: React.FC<AbsenceConcentratedViewProps> = ({
  records,
  filters,
  allOvertime = [],
  allAttendance = [],
  isSyncing = false,
  onSyncCloud,
  leaderToDeptMap,
}) => {
  // Chart 1 controls: X-axis dimension & breakdown mode
  const [chartDimension, setChartDimension] = useState<'dept' | 'week' | 'date'>('dept');
  const [chartBreakdown, setChartBreakdown] = useState<'ALL' | 'UNJUSTIFIED'>('ALL');

  // Chart 2 controls: Bar vs Pie toggle
  const [typeChartMode, setTypeChartMode] = useState<'bar' | 'pie'>('bar');

  // Table quick filter & TanStack Table state
  const [tableTypeFilter, setTableTypeFilter] = useState<'ALL' | 'UNJUSTIFIED'>('ALL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'startDate', desc: true },
  ]);

  // Cross-reference employee syndication and company from BioTime records
  const employeeMetaMap = useMemo(() => {
    const map = new Map<string, { isSyndicated?: boolean; company?: string }>();

    for (const att of allAttendance) {
      const id = (att.employeeId || '').trim();
      if (!id) continue;
      map.set(id, {
        isSyndicated: att.isSyndicated,
        company: att.company,
      });
    }

    for (const ot of allOvertime) {
      const id = (ot.employeeId || '').trim();
      if (!id) continue;
      const prev = map.get(id);
      map.set(id, {
        isSyndicated: prev?.isSyndicated !== undefined ? prev.isSyndicated : ot.isSyndicated,
        company: prev?.company || ot.company,
      });
    }

    return map;
  }, [allAttendance, allOvertime]);

  // Reactive GlobalFilters filtering
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const meta = employeeMetaMap.get((rec.employeeId || '').trim());
      const resolvedCompany = rec.company || meta?.company;
      const resolvedSyndicated =
        rec.isSyndicated !== undefined
          ? rec.isSyndicated
          : meta?.isSyndicated !== undefined
          ? meta.isSyndicated
          : determineSyndicatedStatus(
              resolvedCompany || 'Polaquimia',
              rec.position || '',
              rec.department
            );

      // Company filter (applied when company metadata is available)
      if (resolvedCompany) {
        const compNorm = resolvedCompany.toLowerCase();
        if (filters.companyPreset === 'POLAQUIMIA_ONLY' && !compNorm.includes('polaquimia')) {
          return false;
        }
        if (
          filters.companyPreset === 'MAIN_THREE' &&
          !compNorm.includes('polaquimia') &&
          !compNorm.includes('mlbm') &&
          !compNorm.includes('barteleu')
        ) {
          return false;
        }
        if (
          filters.companyPreset === 'CUSTOM' &&
          filters.companies.length > 0 &&
          !filters.companies.includes('ALL') &&
          !filters.companies.some((c) => compNorm.includes(c.toLowerCase()))
        ) {
          return false;
        }
      }

      // Collaborator Type: Sindicalizado / No Sind. / Ambos
      if (filters.collaboratorType === 'SINDICALIZADO' && !resolvedSyndicated) {
        return false;
      }
      if (filters.collaboratorType === 'NO_SINDICALIZADO' && resolvedSyndicated) {
        return false;
      }

      // Department filter
      if (filters.departments.length > 0 && !filters.departments.includes('ALL')) {
        if (!filters.departments.includes(rec.department)) {
          return false;
        }
      }

      // Leader filter (linked to Líder de área y departamentos del líder en Base TE)
      if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
        if (!isRecordInLeaderScope(rec, filters.leaders, leaderToDeptMap)) {
          return false;
        }
      }

      // ISO Week filter
      if (filters.isoWeek && filters.isoWeek !== 'ALL') {
        const recWeekKey = `${rec.isoYear}-W${String(rec.weekNumber).padStart(2, '0')}`;
        if (recWeekKey !== filters.isoWeek) {
          return false;
        }
      }

      // Month filter (YYYY-MM)
      if (filters.month && filters.month !== 'ALL') {
        const startMatches = rec.startDate && rec.startDate.startsWith(filters.month);
        const endMatches = rec.endDate && rec.endDate.startsWith(filters.month);
        if (!startMatches && !endMatches) {
          return false;
        }
      }

      // Specific date filter (checks range overlap)
      const effStart = rec.startDate || '';
      const effEnd = rec.endDate || effStart;
      if (filters.specificDate && effStart) {
        if (effStart > filters.specificDate || effEnd < filters.specificDate) {
          return false;
        }
      }

      // Custom Date Range filter (checks interval overlap)
      if (filters.startDate && effEnd && effEnd < filters.startDate) {
        return false;
      }
      if (filters.endDate && effStart && effStart > filters.endDate) {
        return false;
      }

      // Global sidebar quick text search
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const match =
          rec.employeeId.toLowerCase().includes(term) ||
          rec.employeeName.toLowerCase().includes(term) ||
          rec.position.toLowerCase().includes(term) ||
          rec.department.toLowerCase().includes(term) ||
          rec.leader.toLowerCase().includes(term) ||
          rec.absenceType.toLowerCase().includes(term) ||
          rec.absenceCategory.toLowerCase().includes(term) ||
          rec.week.toLowerCase().includes(term) ||
          rec.startDateDisplay.toLowerCase().includes(term) ||
          rec.endDateDisplay.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [records, filters, employeeMetaMap]);

  // Top KPI Summary Calculations
  const summaryKPIs = useMemo(() => {
    let totalAbsences = 0;
    let unjustifiedAbsences = 0;
    let unjustifiedCount = 0;
    let totalAmount = 0;
    let unjustifiedAmount = 0;
    const uniqueEmployees = new Set<string>();

    for (const r of filteredRecords) {
      const qty = Number(r.absences) || 0;
      const amt = Number(r.amount) || 0;
      totalAbsences += qty;
      totalAmount += amt;

      if (isUnjustifiedAbsence(r.absenceType)) {
        unjustifiedAbsences += qty;
        unjustifiedCount += 1;
        unjustifiedAmount += amt;
      }

      if (r.employeeId) {
        uniqueEmployees.add(r.employeeId.trim());
      }
    }

    const unjustifiedPercentage =
      totalAbsences > 0 ? Math.round((unjustifiedAbsences / totalAbsences) * 1000) / 10 : 0;

    return {
      totalRecords: filteredRecords.length,
      totalAbsences: Math.round(totalAbsences * 100) / 100,
      unjustifiedAbsences: Math.round(unjustifiedAbsences * 100) / 100,
      unjustifiedCount,
      unjustifiedPercentage,
      totalAmount: Math.round(totalAmount * 100) / 100,
      unjustifiedAmount: Math.round(unjustifiedAmount * 100) / 100,
      uniqueCollaborators: uniqueEmployees.size,
    };
  }, [filteredRecords]);

  // Chart 1 Data: Ausencias por Departamento / Semana / Fecha
  const chart1Data = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        sortKey: string;
        injustificadas: number;
        otras: number;
        total: number;
      }
    >();

    for (const rec of filteredRecords) {
      const qty = Number(rec.absences) || 0;
      const isUnj = isUnjustifiedAbsence(rec.absenceType);

      if (chartBreakdown === 'UNJUSTIFIED' && !isUnj) {
        continue;
      }

      let key = '';
      let label = '';
      let sortKey = '';

      if (chartDimension === 'dept') {
        key = rec.department || 'Sin Departamento';
        label = key;
        sortKey = key;
      } else if (chartDimension === 'week') {
        key = `${rec.isoYear}-W${String(rec.weekNumber).padStart(2, '0')}`;
        label = rec.week || `W${String(rec.weekNumber).padStart(2, '0')}`;
        sortKey = key;
      } else {
        key = rec.startDate || rec.startDateDisplay || 'Sin Fecha';
        label = rec.startDateDisplay && rec.startDateDisplay !== '-' ? rec.startDateDisplay : key;
        sortKey = rec.startDate || key;
      }

      const cur = map.get(key) || {
        key,
        label,
        sortKey,
        injustificadas: 0,
        otras: 0,
        total: 0,
      };

      if (isUnj) {
        cur.injustificadas += qty;
      } else {
        cur.otras += qty;
      }
      cur.total += qty;
      map.set(key, cur);
    }

    const list = Array.from(map.values()).map((item) => ({
      ...item,
      injustificadas: Math.round(item.injustificadas * 100) / 100,
      otras: Math.round(item.otras * 100) / 100,
      total: Math.round(item.total * 100) / 100,
    }));

    if (chartDimension === 'dept') {
      list.sort((a, b) => b.total - a.total);
    } else {
      list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    return list;
  }, [filteredRecords, chartDimension, chartBreakdown]);

  // Chart 2 Data: Distribución por Tipo de Ausentismo
  const typeDistributionData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; absences: number; count: number; amount: number }
    >();

    let grandTotal = 0;

    for (const rec of filteredRecords) {
      const typeName = rec.absenceType || 'Sin Especificar';
      const qty = Number(rec.absences) || 0;
      const amt = Number(rec.amount) || 0;
      grandTotal += qty;

      const cur = map.get(typeName) || {
        name: typeName,
        absences: 0,
        count: 0,
        amount: 0,
      };
      cur.absences += qty;
      cur.count += 1;
      cur.amount += amt;
      map.set(typeName, cur);
    }

    let paletteIdx = 0;
    return Array.from(map.values())
      .sort((a, b) => b.absences - a.absences || b.count - a.count)
      .map((item) => {
        const isUnj = isUnjustifiedAbsence(item.name);
        const color = isUnj
          ? '#e11d48'
          : TYPE_PALETTE[paletteIdx++ % TYPE_PALETTE.length];
        const percentage =
          grandTotal > 0 ? Math.round((item.absences / grandTotal) * 1000) / 10 : 0;
        return {
          ...item,
          absences: Math.round(item.absences * 100) / 100,
          amount: Math.round(item.amount * 100) / 100,
          percentage,
          color,
        };
      });
  }, [filteredRecords]);

  // Table filtered data (applies tableTypeFilter on top of GlobalFilters)
  const tableData = useMemo(() => {
    if (tableTypeFilter === 'UNJUSTIFIED') {
      return filteredRecords.filter((rec) => isUnjustifiedAbsence(rec.absenceType));
    }
    return filteredRecords;
  }, [filteredRecords, tableTypeFilter]);

  // TanStack Table Columns (all 12 columns from concentrated sheet)
  const columns = useMemo<ColumnDef<AbsenceRecord>[]>(
    () => [
      {
        accessorKey: 'startDate',
        header: 'Fecha inicial',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
            {row.original.startDateDisplay}
          </span>
        ),
      },
      {
        accessorKey: 'endDate',
        header: 'Fecha final',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600 whitespace-nowrap">
            {row.original.endDateDisplay}
          </span>
        ),
      },
      {
        accessorKey: 'employeeId',
        header: 'ID',
        cell: (info) => (
          <span className="font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'employeeName',
        header: 'Nombre',
        cell: (info) => {
          const name = (info.getValue() as string) || 'Sin Nombre';
          return (
            <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate max-w-[190px]" title={name}>
                {name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'position',
        header: 'Puesto',
        cell: (info) => (
          <span
            className="text-xs text-slate-700 truncate max-w-[160px] block"
            title={info.getValue() as string}
          >
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Departamento',
        cell: (info) => (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-block max-w-[155px] truncate"
            title={info.getValue() as string}
          >
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'leader',
        header: 'Líder de área',
        cell: (info) => (
          <span
            className="text-xs text-slate-700 truncate max-w-[160px] block"
            title={info.getValue() as string}
          >
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'absenceType',
        header: 'Tipo de ausentismo',
        cell: (info) => {
          const val = (info.getValue() as string) || 'Sin Especificar';
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border whitespace-nowrap ${getAbsenceTypeBadgeClass(
                val
              )}`}
            >
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: 'absenceCategory',
        header: 'Tipo Ausentismo',
        cell: (info) => {
          const val = (info.getValue() as string) || '';
          return val ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
              {val}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          );
        },
      },
      {
        accessorKey: 'absences',
        header: 'Ausencias',
        cell: (info) => (
          <span className="font-mono font-bold text-slate-900 text-xs text-right block whitespace-nowrap">
            {numberFormatter.format((info.getValue() as number) || 0)}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Importe',
        cell: (info) => (
          <span className="font-mono font-bold text-emerald-700 text-xs text-right block whitespace-nowrap">
            {currencyFormatter.format((info.getValue() as number) || 0)}
          </span>
        ),
      },
      {
        accessorKey: 'weekNumber',
        header: 'Semana',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 whitespace-nowrap">
            {row.original.week}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const handleExportExcel = () => {
    const rowsToExport = table.getFilteredRowModel().rows.map((row) => {
      const r = row.original;
      return {
        ID: r.employeeId,
        Nombre: r.employeeName,
        Puesto: r.position,
        Departamento: r.department,
        'Tipo de ausentismo': r.absenceType,
        'Tipo Ausentismo': r.absenceCategory || '-',
        Ausencias: r.absences,
        Importe: r.amount,
        'Fecha inicial': r.startDateDisplay,
        'Fecha final': r.endDateDisplay,
        Semana: r.week,
        'Líder de área': r.leader,
      };
    });
    exportToExcel(rowsToExport, 'Concentrado_Ausencias_Sheets', 'Concentrado Ausencias');
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Ausencias Registradas */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Ausencias Registradas
            </span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <i className="bi bi-calendar-x-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black text-slate-900">
              {numberFormatter.format(summaryKPIs.totalAbsences)}
            </span>
            <span className="text-[11px] text-slate-500">
              {summaryKPIs.totalRecords.toLocaleString('es-MX')} registros
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Sumatoria columna Ausencias (de {records.length.toLocaleString('es-MX')} totales)
          </span>
        </div>

        {/* KPI 2: Faltas Injustificadas (Ausencias Reales) */}
        <div className="bg-white p-4 rounded-xl border border-rose-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
              Faltas Injustificadas (Reales)
            </span>
            <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <i className="bi bi-exclamation-octagon-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-700">
                {numberFormatter.format(summaryKPIs.unjustifiedAbsences)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                {summaryKPIs.unjustifiedPercentage}%
              </span>
            </div>
            <span className="text-[11px] text-rose-600 font-semibold">
              {summaryKPIs.unjustifiedCount} incid.
            </span>
          </div>
          <span
            className="text-[10px] text-slate-500 block mt-1"
            title="(Ausencias por Falta Injustificada ÷ Total de Ausencias Registradas) × 100"
          >
            % Falta Injustificada sobre total de ausencias
          </span>
        </div>

        {/* KPI 3: Costo Total por Ausentismo ($) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Costo Total por Ausentismo
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="bi bi-currency-dollar text-sm"></i>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black text-emerald-700">
              {currencyFormatter.format(summaryKPIs.totalAmount)}
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">MXN</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            En Falta Injustificada: {currencyFormatter.format(summaryKPIs.unjustifiedAmount)}
          </span>
        </div>

        {/* KPI 4: Colaboradores Únicos Afectados */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Colaboradores Únicos Afectados
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <i className="bi bi-people-fill text-sm"></i>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-black text-slate-900">
              {summaryKPIs.uniqueCollaborators.toLocaleString('es-MX')}
            </span>
            <span className="text-[11px] text-slate-500">IDs distintos</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Personal distinto registrado con ausencias
          </span>
        </div>
      </div>

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Ausencias por Departamento y por Fecha/Semana */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Ausencias por{' '}
                {chartDimension === 'dept'
                  ? 'Departamento'
                  : chartDimension === 'week'
                  ? 'Semana'
                  : 'Fecha Inicial'}
              </h3>
              <p className="text-xs text-slate-500">
                Acumulado de ausencias ({chartBreakdown === 'ALL' ? 'todas las incidencias' : 'solo faltas injustificadas'})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Eje X Dimension Selector */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setChartDimension('dept')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartDimension === 'dept'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Depto
                </button>
                <button
                  type="button"
                  onClick={() => setChartDimension('week')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartDimension === 'week'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => setChartDimension('date')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartDimension === 'date'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Fecha
                </button>
              </div>

              {/* Breakdown Selector */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setChartBreakdown('ALL')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartBreakdown === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setChartBreakdown('UNJUSTIFIED')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartBreakdown === 'UNJUSTIFIED'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Falta Injustificada
                </button>
              </div>
            </div>
          </div>

          <div className="h-72">
            {chart1Data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart1Data} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={chart1Data.length > 6 ? -20 : 0}
                    textAnchor={chart1Data.length > 6 ? 'end' : 'middle'}
                    height={chart1Data.length > 6 ? 50 : 30}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val: unknown, name: unknown) => [
                      `${numberFormatter.format(Number(val) || 0)} ausencias`,
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="injustificadas"
                    name="Falta Injustificada"
                    stackId="abs"
                    fill="#e11d48"
                    radius={chartBreakdown === 'UNJUSTIFIED' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                  {chartBreakdown === 'ALL' && (
                    <Bar
                      dataKey="otras"
                      name="Otros Tipos de Ausencia"
                      stackId="abs"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Sin datos para mostrar con los filtros actuales
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Distribución de Tipos de Ausentismo (Barras con Toggle a Pastel) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Distribución de Tipos de Ausentismo
              </h3>
              <p className="text-xs text-slate-500">
                Frecuencia acumulada por tipo de ausencia
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTypeChartMode('bar')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  typeChartMode === 'bar'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span aria-hidden="true">📊</span>
                <span>Barras</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeChartMode('pie')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  typeChartMode === 'pie'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span aria-hidden="true">🥧</span>
                <span>Pastel</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[280px] flex flex-col justify-center">
            {typeDistributionData.length > 0 ? (
              typeChartMode === 'bar' ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={typeDistributionData}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 10 }}
                        width={130}
                      />
                      <Tooltip
                        formatter={(val: any, _name: any, item: any) => {
                          const num = Number(val) || 0;
                          const payload = item?.payload as { percentage?: number; count?: number } | undefined;
                          return [
                            `${numberFormatter.format(num)} ausencias${
                              payload
                                ? ` (${payload.percentage ?? 0}% • ${payload.count ?? 0} reg.)`
                                : ''
                            }`,
                            'Acumulado',
                          ];
                        }}
                      />
                      <Bar dataKey="absences" name="Ausencias" radius={[0, 4, 4, 0]}>
                        {typeDistributionData.map((entry, idx) => (
                          <Cell key={`bar-cell-${idx}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-1/2 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={typeDistributionData}
                          dataKey="absences"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={78}
                          paddingAngle={2}
                        >
                          {typeDistributionData.map((entry, idx) => (
                            <Cell key={`pie-cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any, name: any, item: any) => {
                            const payload = item?.payload as { percentage?: number; count?: number } | undefined;
                            return [
                              `${numberFormatter.format(Number(val) || 0)} ausencias (${
                                payload?.percentage ?? 0
                              }% • ${payload?.count ?? 0} reg.)`,
                              String(name ?? ''),
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Percentage Legend */}
                  <div className="w-full sm:w-1/2 max-h-56 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {typeDistributionData.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate font-medium text-slate-800" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 font-mono">
                          <span className="text-slate-600 font-semibold">
                            {numberFormatter.format(item.absences)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Sin tipos de ausentismo registrados
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TanStack Detailed Absences Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Table Toolbar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            {/* Quick Type Filter Pills */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setTableTypeFilter('ALL')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  tableTypeFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Todos los Tipos de Ausencia ({filteredRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setTableTypeFilter('UNJUSTIFIED')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  tableTypeFilter === 'UNJUSTIFIED'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Solo Faltas Injustificadas (Reales) ({summaryKPIs.unjustifiedCount})
              </button>
            </div>

            <div className="relative flex-1 max-w-md">
              <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
              <input
                type="text"
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Buscar por ID, nombre, puesto, departamento, líder o tipo..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end xl:self-auto">
            {onSyncCloud && (
              <button
                type="button"
                onClick={onSyncCloud}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Actualizar concentrado de ausencias desde Google Sheets"
              >
                <i
                  className={`bi ${
                    isSyncing
                      ? 'bi-arrow-repeat animate-spin text-blue-600'
                      : 'bi-cloud-arrow-down text-blue-600'
                  }`}
                ></i>
                <span>{isSyncing ? 'Sincronizando...' : 'Actualizar Sheets'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={table.getFilteredRowModel().rows.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <i className="bi bi-file-earmark-excel-fill"></i>
              <span>Exportar Excel ({table.getFilteredRowModel().rows.length})</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-1">
              <span>Mostrar:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 shadow-2xs"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} filas
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 select-none">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isSortable = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    const isNumericCol =
                      header.id === 'absences' || header.id === 'amount';

                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`px-3 py-2.5 whitespace-nowrap transition-colors ${
                          isSortable ? 'cursor-pointer hover:bg-slate-200/70' : ''
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1 ${
                            isNumericCol ? 'justify-end' : ''
                          }`}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && (
                            <span className="text-slate-400">
                              {sortDir === 'asc' ? (
                                <i className="bi bi-arrow-up text-blue-600 font-bold"></i>
                              ) : sortDir === 'desc' ? (
                                <i className="bi bi-arrow-down text-blue-600 font-bold"></i>
                              ) : (
                                <i className="bi bi-arrow-down-up text-[10px]"></i>
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 text-slate-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                    {isSyncing ? (
                      <div className="flex flex-col items-center gap-2">
                        <i className="bi bi-arrow-repeat animate-spin text-xl text-blue-500"></i>
                        <span>
                          Cargando Concentrado de Ausencias desde Google Sheets...
                        </span>
                      </div>
                    ) : records.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <i className="bi bi-table text-2xl text-slate-300"></i>
                        <span>
                          No hay registros del Concentrado de Ausencias sincronizados todavía.
                        </span>
                        {onSyncCloud && (
                          <button
                            type="button"
                            onClick={onSyncCloud}
                            className="mt-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                          >
                            Sincronizar desde Google Sheets
                          </button>
                        )}
                      </div>
                    ) : (
                      'No hay registros de ausencia que coincidan con los filtros o búsqueda seleccionados.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
          <div>
            Mostrando página{' '}
            <span className="font-semibold text-slate-800">
              {table.getState().pagination.pageIndex + 1}
            </span>{' '}
            de{' '}
            <span className="font-semibold text-slate-800">
              {Math.max(table.getPageCount(), 1)}
            </span>{' '}
            (Total:{' '}
            <span className="font-semibold text-slate-800">
              {table.getFilteredRowModel().rows.length}
            </span>{' '}
            registros)
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 font-semibold"
              title="Primera página"
            >
              <i className="bi bi-chevron-double-left"></i>
            </button>
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
            >
              Siguiente
            </button>
            <button
              type="button"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 font-semibold"
              title="Última página"
            >
              <i className="bi bi-chevron-double-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
