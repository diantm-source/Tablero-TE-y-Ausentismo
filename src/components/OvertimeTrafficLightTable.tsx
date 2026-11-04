import React, { useMemo, useState, useRef } from 'react';
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
  OvertimeAggregationRecord,
  parseOvertimeExcel,
  NormalizedOvertimeRow,
  TrafficLightEvaluationMode,
} from '../services/overtimeParser';
import { useOvertimeAggregation } from '../hooks/useOvertimeAggregation';
import { AttendanceRecord, OvertimeRecord } from '../types';
import { exportToExcel } from '../services/excelParser';

interface OvertimeTrafficLightTableProps {
  sourceData?: OvertimeRecord[] | NormalizedOvertimeRow[];
  allAttendance?: AttendanceRecord[];
  onParsedNewData?: (rows: NormalizedOvertimeRow[]) => void;
}

export const OvertimeTrafficLightTable: React.FC<OvertimeTrafficLightTableProps> = ({
  sourceData,
  allAttendance,
  onParsedNewData,
}) => {
  const [localParsedRows, setLocalParsedRows] = useState<NormalizedOvertimeRow[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [trafficFilter, setTrafficFilter] = useState<'ALL' | 'ROJO' | 'AMARILLO' | 'VERDE'>('ALL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [evalMode, setEvalMode] = useState<TrafficLightEvaluationMode>('EQUIVALENCIA');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'equivalenciaHoraria', desc: true },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Usar los registros locales si se importó un archivo en esta vista, sino usar sourceData
  const activeData = localParsedRows !== null ? localParsedRows : (sourceData || []);

  const { aggregatedData, kpis } = useOvertimeAggregation(activeData, allAttendance, evalMode);

  // Filtrado por la pestaña del semáforo seleccionada
  const filteredData = useMemo(() => {
    if (trafficFilter === 'ALL') return aggregatedData;
    return aggregatedData.filter((item) => item.semaforo === trafficFilter);
  }, [aggregatedData, trafficFilter]);

  // Manejo de carga directa de archivo Excel BioTime de Tiempo Extra
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      const normalized = await parseOvertimeExcel(file);

      if (normalized.length === 0) {
        setUploadError(
          'No se encontraron registros de tiempo extra válidos en el archivo. Verifique que los encabezados estén en la fila 3.'
        );
        return;
      }

      setLocalParsedRows(normalized);
      if (onParsedNewData) {
        onParsedNewData(normalized);
      }
    } catch (err) {
      console.error('Error al analizar archivo Excel de Tiempo Extra:', err);
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Error desconocido al procesar el archivo Excel.'
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportData = () => {
    const exportRows = filteredData.map((r) => ({
      'ID del Empleado': r.id,
      Nombre: r.nombre,
      Apellidos: r.apellido || '(Sin apellido)',
      'Colaborador Completo': r.colaborador,
      Departamento: r.departamento,
      'Semana ISO': r.semana,
      Turno: r.turno,
      'Fecha Último Registro': r.ultimoRegistroFecha,
      'Horario Último Registro': r.ultimoRegistroHorario,
      'Horas Último Registro': r.ultimoRegistroHoras,
      'Días Laborados': r.diasLaborados,
      'TE Nominal Aprobado (hrs)': r.horasAprobadas,
      'TE Nominal Pendiente (hrs)': r.horasPendientes,
      'TE Acumulado Base H_base (hrs)': r.horasBase,
      'Bono Días Laborados H_dias (hrs)': r.horasAdicionalesPorDia,
      'Equivalencia Horaria H_equiv (hrs)': r.equivalenciaHoraria,
      'Semáforo Base': r.semaforoBase,
      'Semáforo Equivalencia': r.semaforoEquiv,
      'Semáforo Activo':
        r.semaforo === 'ROJO'
          ? 'ROJO (> 9h)'
          : r.semaforo === 'AMARILLO'
          ? 'AMARILLO (7 - 9h)'
          : 'VERDE (< 7h)',
    }));
    exportToExcel(exportRows, `Semaforo_TE_Equivalencia_${trafficFilter}_${evalMode}`);
  };

  // Badge para el turno oficial conforme al catálogo de horarios de la empresa
  const renderShiftBadge = (turno: string) => {
    const upper = turno.toUpperCase();
    let badgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
    let icon = <i className="bi bi-clock-fill text-slate-500 text-xs"></i>;

    if (
      upper.startsWith('1 ') ||
      upper.startsWith('1 -') ||
      upper.includes('PRIMER TURNO') ||
      upper.includes('1S') ||
      upper.includes('CMN') ||
      upper.includes('12M')
    ) {
      badgeClass = 'bg-sky-50 text-sky-800 border-sky-300';
      icon = <i className="bi bi-sun-fill text-amber-500 text-xs"></i>;
    } else if (
      upper.startsWith('2 ') ||
      upper.startsWith('2 -') ||
      upper.includes('SEGUNDO TURNO') ||
      upper.includes('2S') ||
      upper.startsWith('4 ') ||
      upper.startsWith('4 -') ||
      upper.includes('CUARTO')
    ) {
      badgeClass = 'bg-amber-50 text-amber-800 border-amber-300';
      icon = <i className="bi bi-cloud-sun-fill text-amber-600 text-xs"></i>;
    } else if (
      upper.startsWith('3 ') ||
      upper.startsWith('3 -') ||
      upper.includes('TERCER TURNO') ||
      upper.includes('3S') ||
      upper.includes('12V')
    ) {
      badgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-300';
      icon = <i className="bi bi-moon-stars-fill text-indigo-500 text-xs"></i>;
    } else if (
      upper.includes('CENTRAL') ||
      upper.startsWith('C ') ||
      upper.startsWith('C -') ||
      upper.startsWith('CA') ||
      upper.startsWith('CM') ||
      upper.startsWith('CB') ||
      upper.startsWith('CE')
    ) {
      badgeClass = 'bg-teal-50 text-teal-800 border-teal-300';
      icon = <i className="bi bi-building text-teal-600 text-xs"></i>;
    } else if (
      upper.includes('DESCANSO') ||
      upper.startsWith('D ') ||
      upper.startsWith('D -') ||
      upper.includes('FESTIVO') ||
      upper.startsWith('F ')
    ) {
      badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
      icon = <i className="bi bi-calendar-event text-emerald-600 text-xs"></i>;
    } else if (upper.includes('CUBRE') || upper.startsWith('CT')) {
      badgeClass = 'bg-purple-50 text-purple-800 border-purple-300';
      icon = <i className="bi bi-arrow-left-right text-purple-600 text-xs"></i>;
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeClass} max-w-[210px] truncate`}
        title={turno}
      >
        {icon}
        <span className="truncate">{turno}</span>
      </span>
    );
  };

  // Definición de columnas de TanStack Table ordenadas con los nuevos requerimientos consecutivos
  const columns = useMemo<ColumnDef<OvertimeAggregationRecord>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: (info) => (
          <span className="font-mono font-bold text-slate-800 text-xs">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        cell: (info) => (
          <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
              {((info.getValue() as string) || 'E').charAt(0).toUpperCase()}
            </span>
            <span className="truncate max-w-[150px]" title={info.getValue() as string}>
              {(info.getValue() as string) || 'Sin Nombre'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'apellido',
        header: 'Apellidos',
        cell: (info) => {
          const val = info.getValue() as string;
          return val ? (
            <span className="font-semibold text-slate-800 text-xs truncate max-w-[170px] block" title={val}>
              {val}
            </span>
          ) : (
            <span className="text-[11px] italic text-slate-400">Sin apellido</span>
          );
        },
      },
      {
        accessorKey: 'departamento',
        header: 'Departamento',
        cell: (info) => (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-block max-w-[150px] truncate"
            title={info.getValue() as string}
          >
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'semana',
        header: 'Semana',
        cell: (info) => (
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'turno',
        header: 'Turno',
        cell: (info) => renderShiftBadge((info.getValue() as string) || '1 - Primer turno (07:00 a 15:00)'),
      },
      {
        id: 'ultimoRegistro',
        header: 'Último Registro TE',
        cell: ({ row }) => (
          <div
            className="flex flex-col text-xs max-w-[170px]"
            title={`Último cálculo de horas: ${row.original.ultimoRegistroCompleto}`}
          >
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <i className="bi bi-calendar-check text-blue-600 text-xs"></i>
              {row.original.ultimoRegistroFecha || 'Sin fecha'}
            </span>
            <span className="text-[11px] font-mono text-slate-500 mt-0.5">
              {row.original.ultimoRegistroHorario} ({row.original.ultimoRegistroHoras.toFixed(1)}h)
            </span>
          </div>
        ),
      },
      // 1. Días Laborados
      {
        accessorKey: 'diasLaborados',
        header: 'Días Laborados',
        cell: ({ row }) => {
          const dias = row.original.diasLaborados;
          const bono = row.original.horasAdicionalesPorDia;
          return (
            <div
              className="flex flex-col text-xs"
              title={`Días activos en la semana: ${dias} días (+${bono.toFixed(1)} hrs adicionadas por equivalencia)`}
            >
              <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 w-fit">
                <i className="bi bi-calendar2-week text-blue-600 text-[11px]"></i>
                {dias} {dias === 1 ? 'día' : 'días'}
              </span>
              <span className="text-[10px] text-indigo-600 font-semibold font-mono mt-0.5">
                +{bono.toFixed(1)} hrs bono
              </span>
            </div>
          );
        },
      },
      // 2. TE Nominal Aprobado
      {
        accessorKey: 'horasAprobadas',
        header: 'TE Nominal Aprobado',
        cell: (info) => (
          <span className="font-bold text-emerald-600 text-xs font-mono">
            {(info.getValue() as number).toFixed(1)} hrs
          </span>
        ),
      },
      // 3. TE Nominal Pendiente
      {
        accessorKey: 'horasPendientes',
        header: 'TE Nominal Pendiente',
        cell: (info) => {
          const val = info.getValue() as number;
          return (
            <span className={`font-bold text-xs font-mono ${val > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {val.toFixed(1)} hrs
            </span>
          );
        },
      },
      // 4. TE Acumulado (H_base)
      {
        accessorKey: 'horasBase',
        header: () => (
          <div className="flex flex-col items-start">
            <span className="whitespace-nowrap">TE Acumulado (H_base)</span>
            {evalMode === 'BASE' && (
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                Semáforo Activo
              </span>
            )}
          </div>
        ),
        cell: (info) => (
          <span className="font-bold text-slate-900 text-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200 inline-block">
            {(info.getValue() as number).toFixed(1)} hrs
          </span>
        ),
      },
      // 5. Equivalencia Horaria (H_equiv)
      {
        accessorKey: 'equivalenciaHoraria',
        header: () => (
          <div className="flex flex-col items-start">
            <span className="whitespace-nowrap">Equivalencia Horaria (H_equiv)</span>
            {evalMode === 'EQUIVALENCIA' && (
              <span className="text-[9px] font-black text-purple-600 uppercase tracking-tight flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                Semáforo Activo
              </span>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const val = row.original.equivalenciaHoraria;
          const status = row.original.semaforoEquiv;

          let badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-300';
          let dotColor = 'bg-emerald-500';
          if (status === 'ROJO') {
            badgeColor = 'bg-rose-50 text-rose-800 border-rose-300';
            dotColor = 'bg-rose-500 animate-pulse';
          } else if (status === 'AMARILLO') {
            badgeColor = 'bg-amber-50 text-amber-800 border-amber-300';
            dotColor = 'bg-amber-500';
          }

          return (
            <div className="flex items-center gap-2">
              <span className="font-black text-indigo-950 text-xs font-mono bg-indigo-50/80 px-2.5 py-1 rounded-md border border-indigo-200 shadow-xs">
                {val.toFixed(1)} hrs
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}
                title={`Equivalencia: ${val.toFixed(1)} hrs | Semáforo: ${status}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                {status}
              </span>
            </div>
          );
        },
      },
      // Semáforo Activo (Columna de Control Legal)
      {
        accessorKey: 'semaforo',
        header: 'Semáforo',
        cell: ({ row }) => {
          const status = row.original.semaforo;
          const evaluatedOn = evalMode === 'EQUIVALENCIA' ? 'H_equiv' : 'H_base';
          const hoursValue = evalMode === 'EQUIVALENCIA' ? row.original.equivalenciaHoraria : row.original.horasBase;

          if (status === 'ROJO') {
            return (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-500 shadow-xs"
                title={`Semáforo evaluado sobre ${evaluatedOn}: ${hoursValue.toFixed(1)} hrs (> 9h)`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Rojo (&gt; 9h)</span>
              </span>
            );
          }

          if (status === 'AMARILLO') {
            return (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-500 shadow-xs"
                title={`Semáforo evaluado sobre ${evaluatedOn}: ${hoursValue.toFixed(1)} hrs (7 - 9h)`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Amarillo (7 - 9h)</span>
              </span>
            );
          }

          return (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-500 shadow-xs"
              title={`Semáforo evaluado sobre ${evaluatedOn}: ${hoursValue.toFixed(1)} hrs (< 7h)`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Verde (&lt; 7h)</span>
            </span>
          );
        },
      },
    ],
    [evalMode]
  );

  const table = useReactTable({
    data: filteredData,
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

  return (
    <div className="space-y-4">
      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Rojo Card */}
        <div
          onClick={() => setTrafficFilter(trafficFilter === 'ROJO' ? 'ALL' : 'ROJO')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            trafficFilter === 'ROJO'
              ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-white border-slate-200 hover:border-rose-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              Rojo (&gt; 9 horas)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
              Límite Crítico
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600">{kpis.rojoCount}</span>
            <span className="text-xs text-slate-500">
              {kpis.totalColaboradores > 0
                ? `${Math.round((kpis.rojoCount / kpis.totalColaboradores) * 100)}% de colaboradores`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Amarillo Card */}
        <div
          onClick={() => setTrafficFilter(trafficFilter === 'AMARILLO' ? 'ALL' : 'AMARILLO')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            trafficFilter === 'AMARILLO'
              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white border-slate-200 hover:border-amber-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              Amarillo (7 - 9 horas)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
              Alerta Preventiva
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600">{kpis.amarilloCount}</span>
            <span className="text-xs text-slate-500">
              {kpis.totalColaboradores > 0
                ? `${Math.round((kpis.amarilloCount / kpis.totalColaboradores) * 100)}% de colaboradores`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Verde Card */}
        <div
          onClick={() => setTrafficFilter(trafficFilter === 'VERDE' ? 'ALL' : 'VERDE')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            trafficFilter === 'VERDE'
              ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-white border-slate-200 hover:border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Verde (&lt; 7 horas)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
              Dentro de Norma
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600">{kpis.verdeCount}</span>
            <span className="text-xs text-slate-500">
              {kpis.totalColaboradores > 0
                ? `${Math.round((kpis.verdeCount / kpis.totalColaboradores) * 100)}% de colaboradores`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Totales Card */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas Acumuladas
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800">
              {kpis.totalColaboradores} colaboradores
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex flex-col">
              <span className="text-xl font-black text-indigo-900" title="Total con Equivalencia Horaria">
                {kpis.totalEquivalenciaHoraria.toFixed(1)}h <span className="text-xs font-normal text-slate-500">(Equiv)</span>
              </span>
              <span className="text-xs font-semibold text-slate-600" title="Total TE Nominal Base">
                {kpis.totalAcumulado.toFixed(1)}h base
              </span>
            </div>
            <div className="text-[11px] text-right text-slate-500">
              <span className="text-emerald-600 font-semibold">{kpis.totalHorasAprobadas.toFixed(0)}h Aprob.</span>
              {' / '}
              <span className="text-amber-600 font-semibold">{kpis.totalHorasPendientes.toFixed(0)}h Pend.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Excel Upload, Evaluation Mode Toggle, Filter Tabs & Export */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Left Side: Filter Tabs & Eval Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Traffic Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setTrafficFilter('ALL')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
                trafficFilter === 'ALL'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({aggregatedData.length})
            </button>
            <button
              type="button"
              onClick={() => setTrafficFilter('ROJO')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                trafficFilter === 'ROJO'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Rojo ({kpis.rojoCount})
            </button>
            <button
              type="button"
              onClick={() => setTrafficFilter('AMARILLO')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                trafficFilter === 'AMARILLO'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Amarillo ({kpis.amarilloCount})
            </button>
            <button
              type="button"
              onClick={() => setTrafficFilter('VERDE')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                trafficFilter === 'VERDE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Verde ({kpis.verdeCount})
            </button>
          </div>

          {/* Toggle de Política de Semáforo: Equivalencia vs Nominal Base */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-600 font-semibold px-2 flex items-center gap-1 text-[11px]">
              <i className="bi bi-sliders2 text-blue-600"></i>
              <span>Semáforo por:</span>
            </span>
            <button
              type="button"
              onClick={() => setEvalMode('EQUIVALENCIA')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1.5 ${
                evalMode === 'EQUIVALENCIA'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Semáforo evalúa sobre H_equiv = H_base + (Días Laborados × 0.5h)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-300"></span>
              <span>Equivalencia (H_equiv)</span>
            </button>
            <button
              type="button"
              onClick={() => setEvalMode('BASE')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1.5 ${
                evalMode === 'BASE'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Semáforo evalúa sobre TE Nominal Acumulado H_base (Horas extra puras)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300"></span>
              <span>Nominal Base (H_base)</span>
            </button>
          </div>
        </div>

        {/* Action Buttons: Direct File Upload & Export */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Importar archivo Excel de Tiempo Extra (encabezados en fila 3)"
          >
            <i className={`bi ${isUploading ? 'bi-hourglass-split animate-spin' : 'bi-cloud-arrow-up-fill'}`}></i>
            <span>{isUploading ? 'Procesando...' : 'Cargar Excel TE'}</span>
          </button>

          {localParsedRows && (
            <button
              type="button"
              onClick={() => setLocalParsedRows(null)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="Volver a los datos de la base de datos"
            >
              Restablecer
            </button>
          )}

          <button
            type="button"
            onClick={handleExportData}
            disabled={filteredData.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <i className="bi bi-file-earmark-excel-fill"></i>
            <span>Exportar ({filteredData.length})</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill text-rose-600 text-sm"></i>
          <span>{uploadError}</span>
        </div>
      )}

      {/* TanStack Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Search and Table Options Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Buscar por colaborador, apellido, ID, depto, semana o turno..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600">
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

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 select-none">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isSortable = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`py-3 px-3.5 text-xs tracking-wider whitespace-nowrap ${
                          isSortable ? 'cursor-pointer hover:bg-slate-200/70 transition-colors' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && (
                            <span className="text-[10px] text-slate-400">
                              {sortDirection === 'asc' ? (
                                <i className="bi bi-arrow-up text-blue-600"></i>
                              ) : sortDirection === 'desc' ? (
                                <i className="bi bi-arrow-down text-blue-600"></i>
                              ) : (
                                <i className="bi bi-arrow-down-up opacity-40"></i>
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

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <i className="bi bi-inbox text-3xl text-slate-300"></i>
                      <span>No se encontraron registros para los filtros seleccionados.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2.5 px-3.5 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Mostrando{' '}
            <span className="font-semibold text-slate-900">
              {table.getRowModel().rows.length > 0
                ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1
                : 0}
            </span>{' '}
            a{' '}
            <span className="font-semibold text-slate-900">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}
            </span>{' '}
            de <span className="font-semibold text-slate-900">{table.getFilteredRowModel().rows.length}</span>{' '}
            colaboradores
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Primera página"
            >
              <i className="bi bi-chevron-double-left text-xs"></i>
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2.5 py-1.5 rounded border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium shadow-xs"
            >
              Anterior
            </button>

            <span className="px-2 text-xs font-semibold text-slate-700">
              Pág. {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
            </span>

            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2.5 py-1.5 rounded border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium shadow-xs"
            >
              Siguiente
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Última página"
            >
              <i className="bi bi-chevron-double-right text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
