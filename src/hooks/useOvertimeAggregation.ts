import { useMemo } from 'react';
import {
  aggregateOvertimeData,
  formatShiftLabel,
  NormalizedOvertimeRow,
  OvertimeAggregationKPIs,
  OvertimeAggregationRecord,
  splitFullName,
  TrafficLightEvaluationMode,
} from '../services/overtimeParser';
import { AttendanceRecord, OvertimeRecord } from '../types';

export interface UseOvertimeAggregationResult {
  aggregatedData: OvertimeAggregationRecord[];
  kpis: OvertimeAggregationKPIs;
  totalRecordsCount: number;
}

interface EmployeeAttendanceInfo {
  fullName: string;
  firstName: string;
  lastName: string;
  schedulesByDate: Map<string, string>;
  defaultSchedule: string;
}

/**
 * Adapter to allow passing OvertimeRecord[] (existing app model)
 * or NormalizedOvertimeRow[] (direct output from parseOvertimeExcel),
 * enriched with Attendance records to guarantee full names, surnames and shifts.
 */
function convertToNormalizedRows(
  data: (NormalizedOvertimeRow | OvertimeRecord)[],
  attendanceDirectory?: Map<string, EmployeeAttendanceInfo>
): NormalizedOvertimeRow[] {
  if (!data || data.length === 0) return [];

  return data.map((item) => {
    // Check if it is already NormalizedOvertimeRow
    if ('idEmpleado' in item && 'duracionHoras' in item) {
      const row = item as NormalizedOvertimeRow;
      // If apellido is empty, try resolving from directory
      if (!row.apellido && attendanceDirectory?.has(row.idEmpleado)) {
        const info = attendanceDirectory.get(row.idEmpleado)!;
        if (info.lastName) {
          return {
            ...row,
            apellido: info.lastName,
            colaborador: [row.nombre, info.lastName].filter(Boolean).join(' '),
            turno: row.turno || formatShiftLabel(info.defaultSchedule, row.horaInicio),
          };
        }
      }
      return row;
    }

    // Convert from OvertimeRecord
    const ot = item as OvertimeRecord;
    const duracionHoras =
      ot.requestedHours || (ot.status === 'APROBADO' ? ot.approvedHours : ot.pendingHours) || 0;
    const estado = ot.status === 'APROBADO' ? 'Aprobado' : 'Pendiente';
    const semanaIso = `${ot.isoYear}-W${String(ot.isoWeek).padStart(2, '0')}`;

    // Extraer nombre y apellidos sin truncar ni ocultar información
    // 1. Priorizar campos explícitos firstName y lastName si existen
    let nombre = ot.firstName || '';
    let apellido = ot.lastName || '';

    // 2. Si faltan, consultar el directorio cruzado de asistencia
    const attInfo = attendanceDirectory?.get(ot.employeeId);
    if (!nombre && attInfo?.firstName) nombre = attInfo.firstName;
    if (!apellido && attInfo?.lastName) apellido = attInfo.lastName;

    // 3. Si aún falta alguno, aplicar separación inteligente
    if (!nombre && !apellido) {
      const split = splitFullName(ot.employeeName);
      nombre = split.firstName || ot.employeeName;
      apellido = split.lastName;
    } else if (!nombre) {
      nombre = ot.employeeName;
    }

    const colaborador = [nombre, apellido].filter(Boolean).join(' ') || ot.employeeName;

    // Determine shift (turno):
    // 1. From attendance record on that specific date
    // 2. From default employee schedule in attendance
    // 3. Inferred from start time
    const schedOnDate = attInfo?.schedulesByDate.get(ot.startDate) || attInfo?.defaultSchedule;
    const turno = formatShiftLabel(schedOnDate, ot.startTime);

    return {
      idEmpleado: ot.employeeId,
      nombre,
      apellido,
      colaborador,
      departamento: ot.department || 'Sin Departamento',
      horaInicio: `${ot.startDate} ${ot.startTime}`,
      horaFin: `${ot.endDate} ${ot.endTime}`,
      duracionHoras,
      estado,
      turno,
      isoYear: ot.isoYear,
      isoWeek: ot.isoWeek,
      semanaIso,
    };
  });
}

/**
 * Hook React: useOvertimeAggregation(data, allAttendance, evalMode)
 * Retorna:
 * - aggregatedData: Datos agrupados por empleado + Semana ISO con:
 *   - Nombre (hasta dos nombres) y Apellidos (hasta dos apellidos)
 *   - Días Laborados (D_lab): Días distintos trabajados en la semana
 *   - Horas Base (H_base): TE Nominal
 *   - Bono por Día Laborado (H_dias = D_lab * 0.5)
 *   - Equivalencia Horaria (H_equiv = H_base + H_dias)
 *   - Semáforo configurable (evaluado sobre H_equiv o H_base)
 *   - Turno oficial y fecha del último registro
 * - kpis: Contadores totales (rojo, amarillo, verde, total base y total equivalencia)
 * - totalRecordsCount: Número de solicitudes procesadas
 */
export function useOvertimeAggregation(
  data: (NormalizedOvertimeRow | OvertimeRecord)[] | null | undefined,
  allAttendance?: AttendanceRecord[],
  evalMode: TrafficLightEvaluationMode = 'EQUIVALENCIA'
): UseOvertimeAggregationResult {
  // Construir índice de asistencia y mapa de días laborados por empleado y semana
  const { attendanceDirectory, attendanceDaysByEmployeeWeek } = useMemo(() => {
    const map = new Map<string, EmployeeAttendanceInfo>();
    const daysMap = new Map<string, Set<string>>();

    if (!allAttendance || allAttendance.length === 0) {
      return { attendanceDirectory: map, attendanceDaysByEmployeeWeek: daysMap };
    }

    for (const att of allAttendance) {
      if (!att.employeeId) continue;

      // 1. Directorio de nombres y apellidos
      let entry = map.get(att.employeeId);
      if (!entry) {
        let fName = att.firstName || '';
        let lName = att.lastName || '';
        if (!fName && !lName) {
          const split = splitFullName(att.employeeName);
          fName = split.firstName;
          lName = split.lastName;
        }
        entry = {
          fullName: att.employeeName,
          firstName: fName,
          lastName: lName,
          schedulesByDate: new Map(),
          defaultSchedule: att.schedule || '',
        };
        map.set(att.employeeId, entry);
      }

      if (att.date && att.schedule) {
        entry.schedulesByDate.set(att.date, att.schedule);
      }
      if (att.firstName && !entry.firstName) entry.firstName = att.firstName;
      if (att.lastName && !entry.lastName) entry.lastName = att.lastName;

      // 2. Conteo de días laborados en la semana
      if (att.date) {
        const sched = (att.schedule || '').trim().toUpperCase();
        const isDescanso =
          sched === 'D' ||
          sched === 'F' ||
          sched.includes('DESCANSO') ||
          sched.includes('FESTIVO') ||
          att.absenceStatus === 'AUSENCIA_CONFIRMADA';
        const hasPunch = Boolean(att.realIn || att.realOut);
        const isWorked = hasPunch || att.absenceStatus === 'PRESENTE' || (!isDescanso && att.absenceStatus !== 'EXCLUIDO_HORARIO');

        if (isWorked) {
          const semanaIso = `${att.isoYear}-W${String(att.isoWeek).padStart(2, '0')}`;
          const weekKey = `${att.employeeId}__${semanaIso}`;
          if (!daysMap.has(weekKey)) {
            daysMap.set(weekKey, new Set<string>());
          }
          daysMap.get(weekKey)!.add(att.date);
        }
      }
    }

    return { attendanceDirectory: map, attendanceDaysByEmployeeWeek: daysMap };
  }, [allAttendance]);

  return useMemo(() => {
    if (!data || data.length === 0) {
      return {
        aggregatedData: [],
        kpis: {
          totalColaboradores: 0,
          rojoCount: 0,
          amarilloCount: 0,
          verdeCount: 0,
          totalHorasAprobadas: 0,
          totalHorasPendientes: 0,
          totalAcumulado: 0,
          totalEquivalenciaHoraria: 0,
          totalDiasLaborados: 0,
        },
        totalRecordsCount: 0,
      };
    }

    const normalizedRows = convertToNormalizedRows(data, attendanceDirectory);
    const { aggregated, kpis } = aggregateOvertimeData(
      normalizedRows,
      attendanceDaysByEmployeeWeek,
      evalMode
    );

    return {
      aggregatedData: aggregated,
      kpis,
      totalRecordsCount: data.length,
    };
  }, [data, attendanceDirectory, attendanceDaysByEmployeeWeek, evalMode]);
}
