import { useMemo } from 'react';
import {
  aggregateOvertimeData,
  AttendanceDaysMapValue,
  formatShiftLabel,
  NormalizedOvertimeRow,
  OvertimeAggregationKPIs,
  OvertimeAggregationRecord,
  splitFullName,
  TrafficLightEvaluationMode,
} from '../services/overtimeParser';
import { determineSyndicatedStatus, isThirdShift } from '../services/businessRules';
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
  isSyndicated?: boolean;
}

/**
 * Adapter to allow passing OvertimeRecord[] (existing app model)
 * or NormalizedOvertimeRow[] (direct output from parseOvertimeExcel),
 * enriched with Attendance records to guarantee full names, surnames, shifts,
 * syndicated status and 3rd shift coverage.
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
      const attInfo = attendanceDirectory?.get(row.idEmpleado);
      const isSyndicated =
        row.isSyndicated !== undefined
          ? row.isSyndicated
          : attInfo?.isSyndicated !== undefined
          ? attInfo.isSyndicated
          : determineSyndicatedStatus(row.company || 'Polaquimia', '', row.departamento);

      const turno = row.turno || formatShiftLabel(attInfo?.defaultSchedule, row.horaInicio);
      const isThird = row.isThirdShift ?? isThirdShift(turno, row.horaInicio, row.horaFin);

      // If apellido is empty, try resolving from directory
      if (!row.apellido && attInfo?.lastName) {
        return {
          ...row,
          apellido: attInfo.lastName,
          colaborador: [row.nombre, attInfo.lastName].filter(Boolean).join(' '),
          turno,
          isSyndicated,
          isThirdShift: isThird,
        };
      }

      return {
        ...row,
        turno,
        isSyndicated,
        isThirdShift: isThird,
      };
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

    // Detección de 3er Turno y Estatus Sindicalizado
    const isThird = isThirdShift(turno, ot.startTime, ot.endTime, ot.reason);
    const isSyndicated =
      ot.isSyndicated !== undefined
        ? ot.isSyndicated
        : attInfo?.isSyndicated !== undefined
        ? attInfo.isSyndicated
        : determineSyndicatedStatus(ot.company || 'Polaquimia', '', ot.department);

    return {
      idEmpleado: ot.employeeId,
      nombre,
      apellido,
      colaborador,
      departamento: ot.department || 'Sin Departamento',
      company: ot.company,
      horaInicio: `${ot.startDate} ${ot.startTime}`,
      horaFin: `${ot.endDate} ${ot.endTime}`,
      duracionHoras,
      estado,
      turno,
      isSyndicated,
      isThirdShift: isThird,
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
 *   - Nombre y Apellidos completos
 *   - Segmentación: SINDICALIZADO vs NO SINDICALIZADO (Confianza)
 *   - Días Laborados (D_lab): Días distintos trabajados en la semana
 *   - Días en 3er Turno: Días en que se cubrió o laboró Turno Nocturno
 *   - Horas Base (H_base): TE Nominal
 *   - Prolongación de Jornada:
 *     - Sindicalizados: +1.0 hr/día en 3er turno y +0.5 hr/día en turnos restantes
 *     - No Sindicalizados: 0.0 hrs (No aplica)
 *   - Equivalencia Horaria (H_equiv = H_base + H_prolongacion)
 *   - Semáforo configurable (evaluado sobre H_equiv o H_base)
 * - kpis: Contadores totales (rojo, amarillo, verde, sindicalizados, no sind, etc.)
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
    const daysMap = new Map<
      string,
      {
        activeDates: Set<string>;
        thirdShiftDates: Set<string>;
        isSyndicated?: boolean;
      }
    >();

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
          isSyndicated: att.isSyndicated,
        };
        map.set(att.employeeId, entry);
      }

      if (att.date && att.schedule) {
        entry.schedulesByDate.set(att.date, att.schedule);
      }
      if (att.firstName && !entry.firstName) entry.firstName = att.firstName;
      if (att.lastName && !entry.lastName) entry.lastName = att.lastName;
      if (att.isSyndicated !== undefined) entry.isSyndicated = att.isSyndicated;

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
        const isWorked =
          hasPunch ||
          att.absenceStatus === 'PRESENTE' ||
          (!isDescanso && att.absenceStatus !== 'EXCLUIDO_HORARIO');

        if (isWorked) {
          const semanaIso = `${att.isoYear}-W${String(att.isoWeek).padStart(2, '0')}`;
          const weekKey = `${att.employeeId}__${semanaIso}`;
          if (!daysMap.has(weekKey)) {
            daysMap.set(weekKey, {
              activeDates: new Set<string>(),
              thirdShiftDates: new Set<string>(),
              isSyndicated: att.isSyndicated,
            });
          }
          const weekEntry = daysMap.get(weekKey)!;
          weekEntry.activeDates.add(att.date);

          // Verificar si este registro de asistencia regular corresponde al 3er turno
          if (
            isThirdShift(
              att.schedule,
              att.schedIn || att.realIn || undefined,
              att.schedOut || att.realOut || undefined
            )
          ) {
            weekEntry.thirdShiftDates.add(att.date);
          }
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
          sindicalizadosCount: 0,
          noSindicalizadosCount: 0,
          rojoCount: 0,
          amarilloCount: 0,
          verdeCount: 0,
          totalHorasAprobadas: 0,
          totalHorasPendientes: 0,
          totalAcumulado: 0,
          totalEquivalenciaHoraria: 0,
          totalDiasLaborados: 0,
          totalDiasTercerTurno: 0,
          totalHorasProlongacion: 0,
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
