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
  AnnualOvertimeRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  WeeklyMatrixRecord,
} from '../../types';
import { determineSyndicatedStatus } from '../../services/businessRules';
import { exportToExcel } from '../../services/excelParser';
import { getTurnoBadgeClass, enrichMatrixWithLeaders } from '../../services/overtimeParser';

interface OvertimeGeneralViewProps {
  records: AnnualOvertimeRecord[];
  matrixRecords?: WeeklyMatrixRecord[];
  filters: GlobalFilterState;
  allOvertime?: OvertimeRecord[];
  allAttendance?: AttendanceRecord[];
  isSyncing?: boolean;
  onSyncCloud?: () => Promise<void>;
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatHoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.001) {
    return `${rounded.toFixed(1)} hrs`;
  }
  return `${rounded.toFixed(2)} hrs`;
}

function getOvertimeTypeBadgeClass(overtimeType: string): string {
  const norm = (overtimeType || '').toLowerCase();
  if (norm.includes('fin de semana') || norm.includes('sabado') || norm.includes('sábado') || norm.includes('domingo')) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  if (norm.includes('festivo') || norm.includes('feriado') || norm.includes('triple')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (norm.includes('doble') || norm.includes('extra')) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (norm.includes('nocturn') || norm.includes('3er') || norm.includes('tercer')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

export const OvertimeGeneralView: React.FC<OvertimeGeneralViewProps> = ({
  records,
  matrixRecords = [],
  filters,
  allOvertime = [],
  allAttendance = [],
  isSyncing = false,
  onSyncCloud,
}) => {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'fecha', desc: true },
  ]);

  // Selección de fuente: Matriz Semanal (Registro_Prolongacion.xlsx) o Concentrado Anual
  const sourceRecords = useMemo(() => {
    const base = matrixRecords.length > 0 ? matrixRecords : records;
    if (records && records.length > 0) {
      return enrichMatrixWithLeaders(base, records);
    }
    return base;
  }, [matrixRecords, records]);

  // Cross-reference employee syndication and company from BioTime Overtime / Attendance records
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

  // Totales acumulados globales (antes de aplicar filtros de selección)
  const globalKPIs = useMemo(() => {
    let totalRecords = sourceRecords.length;
    let totalHoras = 0;
    let totalNormal = 0;
    let totalProlongacion = 0;
    const uniqueEmployees = new Set<string>();

    for (const r of sourceRecords) {
      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || 0);
      const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;

      totalHoras += hTot;
      totalNormal += hNorm;
      totalProlongacion += hProl;

      if (r.employeeId && hTot > 0) {
        uniqueEmployees.add(String(r.employeeId).trim());
      }
    }

    return {
      totalRecords,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalNormal: Math.round(totalNormal * 10) / 10,
      totalProlongacion: Math.round(totalProlongacion * 10) / 10,
      uniqueCollaborators: uniqueEmployees.size,
    };
  }, [sourceRecords]);

  // Apply GlobalFilters reactively
  const filteredRecords = useMemo(() => {
    return sourceRecords.filter((rec) => {
      const meta = employeeMetaMap.get((rec.employeeId || '').trim());
      const resolvedCompany = rec.company || meta?.company || 'Polaquimia';
      const resolvedSyndicated =
        rec.isSyndicated !== undefined
          ? rec.isSyndicated
          : meta?.isSyndicated !== undefined
          ? meta.isSyndicated
          : determineSyndicatedStatus(resolvedCompany, '', rec.department);

      // Company filter
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

      // Leader filter (matches Líder de área si está disponible)
      if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
        if (rec.leader && !filters.leaders.includes(rec.leader)) {
          return false;
        }
      }

      // ISO Week filter (soporta formato '2026-W04', 'S04', 'W04')
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

      // Month filter (YYYY-MM)
      if (filters.month && filters.month !== 'ALL') {
        const recMonthKey =
          rec.fecha && /^\d{4}-\d{2}/.test(rec.fecha)
            ? rec.fecha.slice(0, 7)
            : `${rec.isoYear}-${String(rec.monthNumber).padStart(2, '0')}`;
        if (recMonthKey !== filters.month) {
          return false;
        }
      }

      // Specific date and custom date range
      if (filters.specificDate && rec.fecha !== filters.specificDate) {
        return false;
      }
      if (filters.startDate && rec.fecha && rec.fecha < filters.startDate) {
        return false;
      }
      if (filters.endDate && rec.fecha && rec.fecha > filters.endDate) {
        return false;
      }

      // Global sidebar quick text search
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const match =
          rec.employeeId.toLowerCase().includes(term) ||
          rec.employeeName.toLowerCase().includes(term) ||
          (rec.sapId && rec.sapId.toLowerCase().includes(term)) ||
          rec.department.toLowerCase().includes(term) ||
          (rec.leader && rec.leader.toLowerCase().includes(term)) ||
          (rec.overtimeType && rec.overtimeType.toLowerCase().includes(term)) ||
          rec.week.toLowerCase().includes(term) ||
          rec.monthName.toLowerCase().includes(term) ||
          rec.fechaDisplay.toLowerCase().includes(term) ||
          rec.fecha.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [sourceRecords, filters, employeeMetaMap]);

  // Reactive KPI Cards summary sobre registros filtrados
  const summaryKPIs = useMemo(() => {
    let totalHoras = 0;
    let totalNormal = 0;
    let totalProlongacion = 0;
    const uniqueEmployees = new Set<string>();

    for (const r of filteredRecords) {
      const hTot = r.horasTotales !== undefined ? r.horasTotales : (r.hours || 0);
      const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || 0);
      const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;

      totalHoras += hTot;
      totalNormal += hNorm;
      totalProlongacion += hProl;

      if (r.employeeId && hTot > 0) {
        uniqueEmployees.add(String(r.employeeId).trim());
      }
    }

    return {
      totalRecords: filteredRecords.length,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalNormal: Math.round(totalNormal * 10) / 10,
      totalProlongacion: Math.round(totalProlongacion * 10) / 10,
      uniqueCollaborators: uniqueEmployees.size,
    };
  }, [filteredRecords]);

  const calcPct = (num: number, den: number): string => {
    if (!den || den <= 0) return '100.0';
    return ((num / den) * 100).toFixed(1);
  };

  // TanStack Table columns
  const columns = useMemo<ColumnDef<AnnualOvertimeRecord>[]>(
    () => [
      {
        accessorKey: 'fecha',
        header: 'Fecha / Periodo',
        cell: ({ row }) => (
          <div className="font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
            <div>{row.original.fechaDisplay}</div>
            {row.original.week && (
              <span className="text-[10px] text-blue-600 font-semibold">{row.original.week}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'employeeId',
        header: 'ID / Clave',
        cell: (info) => (
          <span className="font-mono font-bold text-slate-800 text-xs">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'employeeName',
        header: 'Nombre del Empleado',
        cell: (info) => {
          const name = (info.getValue() as string) || 'Sin Nombre';
          return (
            <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate max-w-[200px]" title={name}>
                {name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'sapId',
        header: 'ID SAP',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">
            {row.original.sapId || row.original.employeeId}
          </span>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Departamento',
        cell: (info) => (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-block max-w-[160px] truncate"
            title={info.getValue() as string}
          >
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'leader',
        header: 'Líder de Área',
        cell: ({ row }) => {
          const l = row.original.liderArea || row.original.leader || 'Sin Líder';
          return (
            <span
              className="text-xs text-slate-700 font-medium truncate max-w-[140px] inline-block"
              title={l}
            >
              {l}
            </span>
          );
        },
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
              title={`Turno: ${t}`}
            >
              {t}
            </span>
          );
        },
      },
      {
        accessorKey: 'horasNormales',
        header: 'H. Extra Normal',
        cell: ({ row }) => {
          const val =
            row.original.horasNormales !== undefined ? row.original.horasNormales : row.original.hours;
          return (
            <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-sky-50 text-sky-700 border border-sky-200 block text-right whitespace-nowrap">
              {formatHoursLabel(val || 0)}
            </span>
          );
        },
      },
      {
        accessorKey: 'horasProlongacion',
        header: 'H. Prolongación',
        cell: ({ row }) => {
          const val = row.original.horasProlongacion ?? 0;
          return (
            <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-50 text-amber-700 border border-amber-200 block text-right whitespace-nowrap">
              {formatHoursLabel(val || 0)}
            </span>
          );
        },
      },
      {
        accessorKey: 'hours',
        header: 'Total Horas',
        cell: ({ row }) => {
          const val =
            row.original.horasTotales !== undefined ? row.original.horasTotales : row.original.hours;
          return (
            <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 block text-right whitespace-nowrap">
              {formatHoursLabel(val || 0)}
            </span>
          );
        },
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
      {
        accessorKey: 'monthNumber',
        header: 'Mes',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className="font-medium text-slate-800">{row.original.monthName}</span>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              {String(row.original.monthNumber).padStart(2, '0')}
            </span>
          </div>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredRecords,
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
        Fecha: r.fechaDisplay,
        ID: r.employeeId,
        'ID SAP': r.sapId || r.employeeId,
        'Nombre del empleado': r.employeeName,
        Departamento: r.department,
        'Líder de área': r.liderArea || r.leader,
        Turno: r.turno || 'Sin Turno',
        'Horas Extra Normales (TE)': r.horasNormales !== undefined ? r.horasNormales : r.hours,
        'Horas Prolongación': r.horasProlongacion ?? 0,
        'Horas Totales': r.horasTotales !== undefined ? r.horasTotales : r.hours,
        'Tipo de TE': r.overtimeType,
        Importe: r.amount || 0,
        Semana: r.week,
        'Mes Numero': r.monthNumber,
        'Mes letra': r.monthName,
      };
    });
    exportToExcel(rowsToExport, 'Matriz_Tiempo_Extra_y_Prolongacion', 'Tiempo Extra');
  };

  return (
    <div className="space-y-4">
      {/* Banner Visual del Conector de Matriz Semanal */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-xl p-4 border border-blue-900/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0">
            <i className="bi bi-file-earmark-spreadsheet-fill text-xl"></i>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/50">
                Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Conector Activo
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1">
              Desglose automatizado de <strong>Horas Extra Normales</strong> (color de celda) y <strong>Horas de Prolongación de Jornada</strong> (0.5 T1/T2 y 1.0 T3 sin color).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSyncCloud && (
            <button
              onClick={onSyncCloud}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
            >
              <i className={`bi ${isSyncing ? 'bi-arrow-repeat animate-spin' : 'bi-arrow-clockwise'}`}></i>
              <span>{isSyncing ? 'Sincronizando...' : 'Actualizar Matriz'}</span>
            </button>
          )}
        </div>
      </div>

      {/* TanStack Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Table Toolbar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Buscar por ID, colaborador, departamento, líder, tipo o semana..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            {onSyncCloud && (
              <button
                type="button"
                onClick={onSyncCloud}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Actualizar datos desde Google Sheets"
              >
                <i className={`bi ${isSyncing ? 'bi-arrow-repeat animate-spin text-blue-600' : 'bi-cloud-arrow-down text-blue-600'}`}></i>
                <span>{isSyncing ? 'Sincronizando...' : 'Actualizar Sheets'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={table.getFilteredRowModel().rows.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <i className="bi bi-file-earmark-excel-fill"></i>
              <span>Exportar Excel ({table.getFilteredRowModel().rows.length})</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-1">
              <span>Mostrar:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 shadow-xs"
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
                    const isNumericCol = header.id === 'hours' || header.id === 'amount';

                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`px-3 py-2.5 whitespace-nowrap transition-colors ${
                          isSortable ? 'cursor-pointer hover:bg-slate-200/70' : ''
                        }`}
                      >
                        <div className={`flex items-center gap-1 ${isNumericCol ? 'justify-end' : ''}`}>
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
                        <span>Cargando datos del Concentrado Anual desde Google Sheets...</span>
                      </div>
                    ) : records.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <i className="bi bi-table text-2xl text-slate-300"></i>
                        <span>No hay registros del Concentrado Anual sincronizados todavía.</span>
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
                      'No hay registros que coincidan con los filtros globales o búsqueda seleccionados.'
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
            de <span className="font-semibold text-slate-800">{Math.max(table.getPageCount(), 1)}</span> (Total:{' '}
            <span className="font-semibold text-slate-800">{table.getFilteredRowModel().rows.length}</span> registros)
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

