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
  parseOvertimeExcel,
  NormalizedOvertimeRow,
  TrafficLightEvaluationMode,
  TrafficLightStatus,
  evaluateTrafficLight,
  getTurnoBadgeClass,
} from '../services/overtimeParser';
import { useOvertimeAggregation } from '../hooks/useOvertimeAggregation';
import { AnnualOvertimeRecord, AttendanceRecord, OvertimeRecord, WeeklyMatrixRecord } from '../types';
import { exportToExcel } from '../services/excelParser';

export interface TrafficLightTableRow {
  id: string;
  employeeId: string;
  sapId?: string;
  nombre: string;
  apellido?: string;
  colaborador: string;
  department: string;
  tipoColaborador: 'SINDICALIZADO' | 'NO SIND.';
  isSyndicated: boolean;
  semana: string;
  turno?: string;
  registrosCount?: number; // Número de registros en el archivo para este colaborador
  horasNormales: number; // Horas Extra (horas puras con color)
  horasProlongacion: number; // Prolongación de jornada
  horasTotales: number; // Total Horas Extra (Horas Extra + Prolongación de jornada)
  semaforo: TrafficLightStatus; // ROJO (>9h), AMARILLO (7-9h), VERDE (1-7h), SIN_HRS (0h)
  diasLaborados?: number;
  horasAprobadas?: number;
  horasPendientes?: number;
}

interface OvertimeTrafficLightTableProps {
  sourceData?: OvertimeRecord[] | NormalizedOvertimeRow[];
  matrixRecords?: (WeeklyMatrixRecord | AnnualOvertimeRecord)[];
  allAttendance?: AttendanceRecord[];
  onParsedNewData?: (rows: NormalizedOvertimeRow[]) => void;
}

export const OvertimeTrafficLightTable: React.FC<OvertimeTrafficLightTableProps> = ({
  sourceData,
  matrixRecords,
  allAttendance,
  onParsedNewData,
}) => {
  const [localParsedRows, setLocalParsedRows] = useState<NormalizedOvertimeRow[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [trafficFilter, setTrafficFilter] = useState<'ALL' | 'ROJO' | 'AMARILLO' | 'VERDE' | 'SIN_HRS'>('ALL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [evalMode, setEvalMode] = useState<TrafficLightEvaluationMode>('EQUIVALENCIA');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'horasTotales', desc: true },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determinar si opera bajo el conector de la Matriz Semanal (Formato A) o por archivo local/legacy
  const isMatrixMode = Boolean(
    localParsedRows === null && matrixRecords && matrixRecords.length > 0
  );

  // Modo Legacy / Upload local
  const activeLegacyData = localParsedRows !== null ? localParsedRows : (sourceData || []);
  const { aggregatedData: legacyAggregated, kpis: legacyKpis } = useOvertimeAggregation(
    activeLegacyData,
    allAttendance,
    evalMode
  );

  // Filas normalizadas según la fuente activa
  // Se agrupan los registros por Número de Control / ID único del colaborador para que 1 ID = 1 trabajador real
  const allRows: TrafficLightTableRow[] = useMemo(() => {
    if (isMatrixMode && matrixRecords) {
      const empMap = new Map<
        string,
        {
          id: string;
          employeeId: string;
          sapId?: string;
          nombre: string;
          colaborador: string;
          department: string;
          tipoColaborador: 'SINDICALIZADO' | 'NO SIND.';
          isSyndicated: boolean;
          semanas: Set<string>;
          turnos: Set<string>;
          horasNormales: number;
          horasProlongacion: number;
          horasTotales: number;
          registrosCount: number;
        }
      >();

      for (const m of matrixRecords) {
        const id = String(m.employeeId || '').trim();
        if (!id) continue;

        const hNorm = m.horasNormales !== undefined ? m.horasNormales : (m.hours || 0);
        const hProl = m.horasProlongacion !== undefined ? m.horasProlongacion : 0;
        const hTot = m.horasTotales !== undefined ? m.horasTotales : (hNorm + hProl);
        const sem = m.week ? String(m.week) : '';
        const turno = m.turno && m.turno !== 'Sin Turno' ? String(m.turno) : '';

        const existing = empMap.get(id);
        if (!existing) {
          const semanasSet = new Set<string>();
          if (sem) semanasSet.add(sem);
          const turnosSet = new Set<string>();
          if (turno) turnosSet.add(turno);

          empMap.set(id, {
            id: m.id || `${id}_${sem}`,
            employeeId: id,
            sapId: m.sapId || id,
            nombre: m.employeeName || 'Sin Nombre',
            colaborador: m.employeeName || 'Sin Nombre',
            department: m.department || 'Sin Departamento',
            tipoColaborador: 'SINDICALIZADO' as const,
            isSyndicated: m.isSyndicated !== undefined ? m.isSyndicated : true,
            semanas: semanasSet,
            turnos: turnosSet,
            horasNormales: hNorm,
            horasProlongacion: hProl,
            horasTotales: hTot,
            registrosCount: 1,
          });
        } else {
          existing.horasNormales += hNorm;
          existing.horasProlongacion += hProl;
          existing.horasTotales += hTot;
          existing.registrosCount += 1;
          if (sem) existing.semanas.add(sem);
          if (turno) existing.turnos.add(turno);
          if (m.sapId && (!existing.sapId || existing.sapId === existing.employeeId)) {
            existing.sapId = m.sapId;
          }
          if (m.department && (!existing.department || existing.department === 'Sin Departamento')) {
            existing.department = m.department;
          }
        }
      }

      return Array.from(empMap.values()).map((e) => {
        const hNorm = Math.round(e.horasNormales * 10) / 10;
        const hProl = Math.round(e.horasProlongacion * 10) / 10;
        const hTot = Math.round(e.horasTotales * 10) / 10;
        const sem = evaluateTrafficLight(hTot);

        const semanaLabel =
          e.semanas.size === 1
            ? Array.from(e.semanas)[0]
            : e.semanas.size > 1
            ? `${Array.from(e.semanas).sort().join(', ')}`
            : 'Sin Semana';

        const turnoLabel =
          e.turnos.size === 1
            ? Array.from(e.turnos)[0]
            : e.turnos.size > 1
            ? Array.from(e.turnos).join(', ')
            : 'Sin Turno';

        return {
          id: e.id,
          employeeId: e.employeeId,
          sapId: e.sapId,
          nombre: e.nombre,
          apellido: '',
          colaborador: e.colaborador,
          department: e.department,
          tipoColaborador: e.tipoColaborador,
          isSyndicated: e.isSyndicated,
          semana: semanaLabel,
          turno: turnoLabel,
          registrosCount: e.registrosCount,
          horasNormales: hNorm,
          horasProlongacion: hProl,
          horasTotales: hTot,
          semaforo: sem,
        };
      });
    }

    // Modo Legacy / BioTime (ya viene consolidado por empleado en useOvertimeAggregation)
    return legacyAggregated.map((r) => ({
      id: r.id,
      employeeId: r.id,
      nombre: r.nombre,
      apellido: r.apellido,
      colaborador: r.colaborador,
      department: r.departamento,
      tipoColaborador: r.tipoColaborador,
      isSyndicated: r.isSyndicated,
      semana: r.semana,
      turno: r.turno,
      registrosCount: r.diasLaborados || 1,
      horasNormales: r.horasBase,
      horasProlongacion: r.horasAdicionalesPorDia,
      horasTotales: evalMode === 'EQUIVALENCIA' ? r.equivalenciaHoraria : r.horasBase,
      semaforo: r.semaforo,
      diasLaborados: r.diasLaborados,
      horasAprobadas: r.horasAprobadas,
      horasPendientes: r.horasPendientes,
    }));
  }, [isMatrixMode, matrixRecords, legacyAggregated, evalMode]);

  // KPIs unificados diferenciando Número de Trabajadores Reales vs Número de Registros
  const currentKPIs = useMemo(() => {
    let rCount = 0;
    let aCount = 0;
    let vCount = 0;
    let sCount = 0;
    let rRegs = 0;
    let aRegs = 0;
    let vRegs = 0;
    let sRegs = 0;
    let totNorm = 0;
    let totProl = 0;
    let totH = 0;
    let totRegs = 0;

    for (const row of allRows) {
      const regs = row.registrosCount || 1;
      totRegs += regs;

      if (row.semaforo === 'ROJO') {
        rCount++;
        rRegs += regs;
      } else if (row.semaforo === 'AMARILLO') {
        aCount++;
        aRegs += regs;
      } else if (row.semaforo === 'VERDE') {
        vCount++;
        vRegs += regs;
      } else {
        sCount++;
        sRegs += regs;
      }

      totNorm += row.horasNormales;
      totProl += row.horasProlongacion;
      totH += row.horasTotales;
    }

    return {
      totalColaboradores: allRows.length, // Número real de trabajadores (IDs únicos)
      totalRegistros: totRegs, // Número de registros procesados
      sindicalizadosCount: allRows.length,
      noSindicalizadosCount: 0,
      rojoCount: rCount,
      rojoRegistros: rRegs,
      amarilloCount: aCount,
      amarilloRegistros: aRegs,
      verdeCount: vCount,
      verdeRegistros: vRegs,
      sinHrsCount: sCount,
      sinHrsRegistros: sRegs,
      totalHorasAprobadas: Math.round(totNorm * 10) / 10,
      totalHorasPendientes: 0,
      totalAcumulado: Math.round(totNorm * 10) / 10,
      totalEquivalenciaHoraria: Math.round(totH * 10) / 10,
      totalDiasLaborados: allRows.length,
      totalDiasTercerTurno: 0,
      totalHorasProlongacion: Math.round(totProl * 10) / 10,
    };
  }, [allRows]);

  // Filtrado por la pestaña del semáforo seleccionada
  const filteredData = useMemo(() => {
    if (trafficFilter === 'ALL') return allRows;
    if (trafficFilter === 'SIN_HRS') {
      return allRows.filter((item) => item.semaforo === 'SIN_HRS' || item.semaforo === 'SIN_HORAS');
    }
    return allRows.filter((item) => item.semaforo === trafficFilter);
  }, [allRows, trafficFilter]);

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
      'ID del Empleado': r.employeeId,
      'ID SAP': r.sapId || r.employeeId,
      Colaborador: r.colaborador,
      Departamento: r.department,
      Tipo: r.tipoColaborador,
      Sindicalizado: r.isSyndicated ? 'SÍ' : 'NO',
      Semana: r.semana,
      Turno: r.turno || 'Sin Turno',
      'Número de Registros': r.registrosCount || 1,
      'Horas Extra': r.horasNormales,
      'Prolongación de jornada': r.horasProlongacion,
      'Total Horas Extra': r.horasTotales,
      Semáforo:
        r.semaforo === 'ROJO'
          ? 'Rojo (> 9 hrs)'
          : r.semaforo === 'AMARILLO'
          ? 'Amarillo (7 - 9 hrs)'
          : r.semaforo === 'VERDE'
          ? 'Verde (1 - 7 hrs)'
          : 'Sin HRS',
    }));
    exportToExcel(exportRows, `Semaforo_TE_Matriz_${trafficFilter}`);
  };

  // Definición de columnas de TanStack Table ordenadas con los nuevos requerimientos
  const columns = useMemo<ColumnDef<TrafficLightTableRow>[]>(
    () => [
      {
        accessorKey: 'employeeId',
        header: 'ID',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-mono font-bold text-slate-800 text-xs">
              {row.original.employeeId}
            </span>
            {row.original.sapId && row.original.sapId !== row.original.employeeId && (
              <span className="font-mono text-[10px] text-slate-400">
                SAP: {row.original.sapId}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'colaborador',
        header: 'Colaborador',
        cell: ({ row }) => (
          <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
              {(row.original.colaborador || 'E').charAt(0).toUpperCase()}
            </span>
            <span className="truncate max-w-[170px]" title={row.original.colaborador}>
              {row.original.colaborador || 'Sin Nombre'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Departamento',
        cell: ({ row }) => (
          <span
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-block max-w-[150px] truncate"
            title={row.original.department}
          >
            {row.original.department}
          </span>
        ),
      },
      {
        accessorKey: 'tipoColaborador',
        header: 'Tipo',
        cell: ({ row }) => (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
              row.original.isSyndicated
                ? 'bg-blue-100 text-blue-800 border-blue-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
            title={
              row.original.isSyndicated
                ? 'Colaborador Sindicalizado: Aplica compensación por prolongación de jornada'
                : 'Colaborador No Sindicalizado: No aplica prolongación de jornada'
            }
          >
            {row.original.tipoColaborador}
          </span>
        ),
      },
      {
        accessorKey: 'registrosCount',
        header: 'Registros',
        cell: ({ row }) => {
          const count = row.original.registrosCount || 1;
          return (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                count > 1
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title={`${count} registro(s) en los archivos para este número de control (ID único)`}
            >
              <i className="bi bi-file-earmark-text text-[9px]"></i>
              <span>{count} {count === 1 ? 'reg.' : 'regs.'}</span>
            </span>
          );
        },
      },
      {
        accessorKey: 'semana',
        header: 'Semana',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {row.original.semana}
          </span>
        ),
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
        header: 'Horas Extra',
        cell: ({ row }) => (
          <span
            className="font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded border border-sky-200 text-xs inline-block text-right"
            title="Horas Extra"
          >
            {row.original.horasNormales.toFixed(1)} hrs
          </span>
        ),
      },
      {
        accessorKey: 'horasProlongacion',
        header: 'Prolongación de jornada',
        cell: ({ row }) => (
          <span
            className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200 text-xs inline-block text-right"
            title="Prolongación de jornada"
          >
            {row.original.horasProlongacion.toFixed(1)} hrs
          </span>
        ),
      },
      {
        accessorKey: 'horasTotales',
        header: 'Total Horas Extra',
        cell: ({ row }) => (
          <span
            className="font-mono font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded border border-slate-300 text-xs inline-block text-right shadow-2xs"
            title={`Suma exacta: ${row.original.horasNormales.toFixed(1)} hrs Horas Extra + ${row.original.horasProlongacion.toFixed(1)} hrs Prolongación de jornada`}
          >
            {row.original.horasTotales.toFixed(1)} hrs
          </span>
        ),
      },
      {
        accessorKey: 'semaforo',
        header: 'Semáforo',
        cell: ({ row }) => {
          const status = row.original.semaforo;
          const tot = row.original.horasTotales;

          if (status === 'ROJO') {
            return (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-500 shadow-xs"
                title={`Semáforo legal: ${tot.toFixed(1)} hrs (> 9 hrs)`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Rojo (&gt; 9 hrs)</span>
              </span>
            );
          }

          if (status === 'AMARILLO') {
            return (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-500 shadow-xs"
                title={`Semáforo legal: ${tot.toFixed(1)} hrs (7 - 9 hrs)`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Amarillo (7 - 9 hrs)</span>
              </span>
            );
          }

          if (status === 'VERDE') {
            return (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-500 shadow-xs"
                title={`Semáforo legal: ${tot.toFixed(1)} hrs (1 - 7 hrs)`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Verde (1 - 7 hrs)</span>
              </span>
            );
          }

          return (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300 shadow-xs"
              title={`Sin Horas: ${tot.toFixed(1)} hrs (0 hrs)`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>⚪ Sin HRS</span>
            </span>
          );
        },
      },
    ],
    []
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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
              Rojo (&gt; 9 hrs)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
              Límite Crítico
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-rose-600">{currentKPIs.rojoCount}</span>
              <span className="text-[11px] font-semibold text-rose-700 ml-1">trabajadores</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {currentKPIs.rojoRegistros || currentKPIs.rojoCount} regs. ({currentKPIs.totalColaboradores > 0
                ? `${Math.round((currentKPIs.rojoCount / currentKPIs.totalColaboradores) * 100)}%`
                : '0%'})
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
              Amarillo (7 - 9 hrs)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
              Alerta Preventiva
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-amber-600">{currentKPIs.amarilloCount}</span>
              <span className="text-[11px] font-semibold text-amber-700 ml-1">trabajadores</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {currentKPIs.amarilloRegistros || currentKPIs.amarilloCount} regs. ({currentKPIs.totalColaboradores > 0
                ? `${Math.round((currentKPIs.amarilloCount / currentKPIs.totalColaboradores) * 100)}%`
                : '0%'})
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
              Verde (1 - 7 hrs)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
              Dentro de Norma
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-emerald-600">{currentKPIs.verdeCount}</span>
              <span className="text-[11px] font-semibold text-emerald-700 ml-1">trabajadores</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {currentKPIs.verdeRegistros || currentKPIs.verdeCount} regs. ({currentKPIs.totalColaboradores > 0
                ? `${Math.round((currentKPIs.verdeCount / currentKPIs.totalColaboradores) * 100)}%`
                : '0%'})
            </span>
          </div>
        </div>

        {/* Sin HRS Card */}
        <div
          onClick={() => setTrafficFilter(trafficFilter === 'SIN_HRS' ? 'ALL' : 'SIN_HRS')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            trafficFilter === 'SIN_HRS'
              ? 'bg-slate-200 border-slate-500 ring-2 ring-slate-500/30 text-slate-700'
              : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              Sin HRS (0 HORAS)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600">
              0 Horas
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-slate-700">{currentKPIs.sinHrsCount || 0}</span>
              <span className="text-[11px] font-semibold text-slate-600 ml-1">trabajadores</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {currentKPIs.sinHrsRegistros || currentKPIs.sinHrsCount || 0} regs. ({currentKPIs.totalColaboradores > 0
                ? `${Math.round(((currentKPIs.sinHrsCount || 0) / currentKPIs.totalColaboradores) * 100)}%`
                : '0%'})
            </span>
          </div>
        </div>

        {/* Totales Card */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas Acumuladas
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800" title="Número real de trabajadores con número de control (ID único)">
                {currentKPIs.totalColaboradores} trab.
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600 border border-slate-200" title="Total de registros en los archivos">
                {currentKPIs.totalRegistros} regs.
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex flex-col">
              <span className="text-xl font-black text-indigo-900" title="Total Horas Extra">
                {currentKPIs.totalEquivalenciaHoraria.toFixed(1)}h <span className="text-xs font-normal text-slate-500">(Total TE)</span>
              </span>
              <span className="text-xs font-semibold text-slate-600" title="Horas Extra">
                {currentKPIs.totalAcumulado.toFixed(1)}h Horas Extra
              </span>
              {currentKPIs.totalHorasProlongacion > 0 && (
                <span className="text-[10px] text-indigo-600 font-semibold font-mono" title="Prolongación de jornada">
                  +{currentKPIs.totalHorasProlongacion.toFixed(1)}h Prolongación de jornada
                </span>
              )}
            </div>
            <div className="text-[11px] text-right text-slate-500">
              <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                100% SINDICALIZADO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Excel Upload, Filter Tabs & Export */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Left Side: Filter Tabs */}
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
              Todos ({allRows.length} trab.)
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
              Rojo ({currentKPIs.rojoCount})
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
              Amarillo ({currentKPIs.amarilloCount})
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
              Verde ({currentKPIs.verdeCount})
            </button>
            <button
              type="button"
              onClick={() => setTrafficFilter('SIN_HRS')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                trafficFilter === 'SIN_HRS'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              Sin HRS ({currentKPIs.sinHrsCount || 0})
            </button>
          </div>

          {isMatrixMode && (
            <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
              <i className="bi bi-file-earmark-spreadsheet-fill text-emerald-600"></i>
              <span>Matriz Semanal Activa</span>
            </span>
          )}

          {!isMatrixMode && (
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
              >
                <span>Equivalencia</span>
              </button>
              <button
                type="button"
                onClick={() => setEvalMode('BASE')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all text-xs flex items-center gap-1.5 ${
                  evalMode === 'BASE'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>Base Nominal</span>
              </button>
            </div>
          )}
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
              placeholder="Buscar por colaborador, ID, SAP, depto o semana..."
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
            trabajadores únicos ({filteredData.reduce((acc, r) => acc + (r.registrosCount || 1), 0)} registros)
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
