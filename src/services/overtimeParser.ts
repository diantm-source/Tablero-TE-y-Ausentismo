import * as XLSX from 'xlsx';
import { getISOWeek, getISOWeekYear, isValid } from 'date-fns';
import { AnnualOvertimeRecord, OvertimeRecord, WeeklyMatrixRecord, WeeklyMatrixDayDetail } from '../types';
import {
  calculateOvertimeEquivalence,
  determineSyndicatedStatus,
  isThirdShift,
} from './businessRules';

export type TrafficLightStatus = 'ROJO' | 'AMARILLO' | 'VERDE';

export type TrafficLightEvaluationMode = 'EQUIVALENCIA' | 'BASE';

export type OvertimeApprovalStatusExact = 'Aprobado' | 'Pendiente';

export interface NormalizedOvertimeRow {
  idEmpleado: string;
  nombre: string;
  apellido: string;
  colaborador: string; // Nombre + Apellido
  departamento: string;
  horaInicio: string; // YYYY-MM-DD HH:mm:ss
  horaFin: string; // YYYY-MM-DD HH:mm:ss
  duracionHoras: number; // Decimal hours
  estado: OvertimeApprovalStatusExact;
  turno?: string;
  company?: string;
  isSyndicated?: boolean; // true = Sindicalizado, false = Confianza / No Sindicalizado
  isThirdShift?: boolean; // true si la jornada cubre o corresponde al 3er turno
  isoYear: number;
  isoWeek: number;
  semanaIso: string; // e.g. "2026-W44"
}

export interface OvertimeAggregationRecord {
  id: string; // ID del Empleado
  nombre: string;
  apellido: string;
  colaborador: string; // Nombre + Apellido
  departamento: string;
  semana: string; // e.g. "2026-W44"
  turno: string; // e.g. "1 - Primer turno (07:00 a 15:00)"
  ultimoRegistroFecha: string; // e.g. "2026-10-29"
  ultimoRegistroHorario: string; // e.g. "18:00 - 22:00"
  ultimoRegistroHoras: number; // e.g. 4.0
  ultimoRegistroCompleto: string; // e.g. "2026-10-29 (18:00 - 22:00)"
  isoYear: number;
  isoWeek: number;
  isSyndicated: boolean; // true = SINDICALIZADO, false = NO SINDICALIZADO
  esSindicalizado?: boolean;
  tipo?: 'SINDICALIZADO' | 'NO SIND.';
  tipoColaborador: 'SINDICALIZADO' | 'NO SIND.'; // Etiqueta descriptiva
  diasLaborados: number; // D_lab: Días distintos con jornada regular o tiempo extra
  diasTercerTurno: number; // Días laborados con cobertura en 3er Turno (compensación 1.0 hr)
  diasTurnosRestantes: number; // Días laborados en turnos 1er/2do/mixtos (compensación 0.5 hr)
  horasProlongacion3erTurno: number; // Horas añadidas por 3er Turno (diasTercerTurno * 1.0)
  horasProlongacionRestantes: number; // Horas añadidas por turnos restantes (diasTurnosRestantes * 0.5)
  horasAprobadas: number; // TE Nominal Aprobado
  horasPendientes: number; // TE Nominal Pendiente
  horasBase: number; // H_base = horasAprobadas + horasPendientes (TE Nominal / Base)
  totalAcumulado: number; // Alias para horasBase
  horasAdicionalesPorDia: number; // H_dias = Horas compensación por prolongación
  equivalenciaHoraria: number; // H_equiv = horasBase + horasAdicionalesPorDia
  semaforoBase: TrafficLightStatus; // Semáforo evaluado sobre H_base
  semaforoEquiv: TrafficLightStatus; // Semáforo evaluado sobre H_equiv
  semaforo: TrafficLightStatus; // Semáforo activo según el modo seleccionado (por defecto H_equiv)
}

export type OvertimeWeeklySummary = OvertimeAggregationRecord;

export interface OvertimeAggregationKPIs {
  totalColaboradores: number;
  sindicalizadosCount: number;
  noSindicalizadosCount: number;
  rojoCount: number;
  amarilloCount: number;
  verdeCount: number;
  totalHorasAprobadas: number;
  totalHorasPendientes: number;
  totalAcumulado: number; // Total H_base
  totalEquivalenciaHoraria: number; // Total H_equiv
  totalDiasLaborados: number;
  totalDiasTercerTurno: number;
  totalHorasProlongacion: number;
}

/**
 * Format a Date object to 'YYYY-MM-DD HH:mm:ss'
 */
export function formatDateTimeISO(date: Date): string {
  if (!isValid(date)) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Separador inteligente de Nombre y Apellidos
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = (fullName || '').trim();
  if (!cleaned) return { firstName: '', lastName: '' };

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  if (parts.length === 3) {
    return { firstName: parts[0], lastName: `${parts[1]} ${parts[2]}` };
  }
  // 4 o más palabras: primeros 2 nombres compuestos (ej. Maria de la Luz o Juan Carlos), resto apellidos
  return {
    firstName: `${parts[0]} ${parts[1]}`,
    lastName: parts.slice(2).join(' '),
  };
}

import { formatOfficialShiftLabel } from './scheduleCatalog';

/**
 * Estandariza la etiqueta del turno/horario conforme al Catálogo Oficial de Turnos
 */
export function formatShiftLabel(rawShift?: string, startTimeStr?: string): string {
  return formatOfficialShiftLabel(rawShift, startTimeStr);
}


/**
 * Parse a datetime value (string, Date, number serial) safely
 */
export function parseDateTime(val: unknown): { dateObj: Date | null; formatted: string } {
  if (val === null || val === undefined || val === '') {
    return { dateObj: null, formatted: '' };
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return { dateObj: null, formatted: '' };
    return { dateObj: val, formatted: formatDateTimeISO(val) };
  }

  if (typeof val === 'number') {
    // Excel serial number
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    return { dateObj, formatted: formatDateTimeISO(dateObj) };
  }

  const str = String(val).trim();
  if (!str) return { dateObj: null, formatted: '' };

  // Format: 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DDTHH:mm:ss'
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const [, y, m, d, h, min, s] = isoMatch;
    const dateObj = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      s ? Number(s) : 0
    );
    return { dateObj, formatted: formatDateTimeISO(dateObj) };
  }

  // Format: 'DD/MM/YYYY HH:mm:ss' or 'DD-MM-YYYY HH:mm:ss'
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dmyMatch) {
    const [, d, m, y, h, min, s] = dmyMatch;
    const dateObj = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      s ? Number(s) : 0
    );
    return { dateObj, formatted: formatDateTimeISO(dateObj) };
  }

  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return { dateObj: fallback, formatted: formatDateTimeISO(fallback) };
  }

  return { dateObj: null, formatted: str };
}

/**
 * 1. Duración de Solicitud:
 * Calcula la diferencia en horas decimales entre 'Hora de Fin de T.E.' y 'Hora de Inicio de T.E.'
 */
export function calculateDurationHours(startDate: Date, endDate: Date): number {
  let diffMs = endDate.getTime() - startDate.getTime();
  // Turno que cruza la medianoche (si fecha de fin es igual pero hora menor)
  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  const hours = diffMs / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

/**
 * 2. Agrupación Temporal:
 * Obtener el año y la Semana ISO 8601 (Lunes a Domingo) utilizando la fecha de 'Hora de Inicio de T.E.'
 */
export function getISOWeekInfo(date: Date): { isoYear: number; isoWeek: number; semanaIso: string } {
  if (!isValid(date)) {
    const now = new Date();
    const isoYear = getISOWeekYear(now);
    const isoWeek = getISOWeek(now);
    return {
      isoYear,
      isoWeek,
      semanaIso: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
    };
  }
  const isoYear = getISOWeekYear(date);
  const isoWeek = getISOWeek(date);
  const semanaIso = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
  return { isoYear, isoWeek, semanaIso };
}

/**
 * 4. Semáforo Condicional:
 * - Rojo: totalHoras > 9
 * - Amarillo: totalHoras >= 7 y totalHoras <= 9
 * - Verde: totalHoras < 7
 */
export function evaluateTrafficLight(totalHoras: number): TrafficLightStatus {
  if (totalHoras > 9) return 'ROJO';
  if (totalHoras >= 7) return 'AMARILLO';
  return 'VERDE';
}

/**
 * Normalización Inteligente de Nombres de Departamento:
 * Convierte a mayúsculas, elimina acentos, colapsa/elimina espacios internos
 * y paréntesis abiertos/cerrados para comparación unificada de claves,
 * conservando el nombre oficial limpio de Base TE en la interfaz y filtros.
 */
export function normalizeDeptKey(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[\(\)\[\]\{\}]/g, '')
    .trim();
}

/**
 * Normalize text for resilient header matching
 */
function normalizeHeaderKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Find the value in an object given possible aliases
 */
function getMatchingValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedEntries = Object.entries(row).map(([key, val]) => ({
    rawKey: key,
    normKey: normalizeHeaderKey(key),
    value: val,
  }));

  for (const alias of aliases) {
    const normAlias = normalizeHeaderKey(alias);
    const found = normalizedEntries.find((e) => e.normKey === normAlias || e.normKey.includes(normAlias));
    if (found && found.value !== undefined && found.value !== null && found.value !== '') {
      return found.value;
    }
  }

  return undefined;
}

/**
 * Normaliza el estado de aprobación: 'Aprobado' o 'Pendiente'
 */
export function normalizeApprovalStatus(rawStatus: unknown): OvertimeApprovalStatusExact {
  const str = String(rawStatus || '').trim().toLowerCase();
  if (str === 'aprobado' || str === 'aprobada' || str.startsWith('aprob') || str === 'autorizado') {
    return 'Aprobado';
  }
  return 'Pendiente';
}

/**
 * Función utilitaria parseOvertimeExcel(file: File)
 * Usa XLSX para leer el archivo saltando las dos primeras filas (encabezados en la fila 3, índice 2)
 * y retorna el dataset normalizado con nombres, apellidos, fechas exactas y turno.
 */
export async function parseOvertimeExcel(file: File): Promise<NormalizedOvertimeRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo Excel no contiene hojas de trabajo legibles.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('No se pudo acceder a la hoja de cálculo del archivo Excel.');
  }

  // Saltando las dos primeras filas (fila 3 es índice 2 en 0-indexed)
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: 2,
    defval: '',
  });

  const normalizedList: NormalizedOvertimeRow[] = [];

  for (const row of rawRows) {
    // Extraer campos según especificación
    const rawId = getMatchingValue(row, [
      'ID del Empleado',
      'ID de Empleado',
      'ID Empleado',
      'Id del Empleado',
      'No. Empleado',
      'Clave',
    ]);
    const idEmpleado = String(rawId || '').trim();

    // Si la fila está completamente vacía o no tiene ID, ignorarla
    if (!idEmpleado) continue;

    const rawNombre = getMatchingValue(row, ['Nombre', 'Nombres', 'Nombre Completo', 'Empleado', 'Colaborador']);
    const rawApellido = getMatchingValue(row, [
      'Apellido',
      'Apellidos',
      'Primer Apellido',
      'Segundo Apellido',
      'Apellido Paterno',
      'Apellido Materno',
    ]);
    const rawDepto = getMatchingValue(row, ['Departamento', 'Área', 'Area']);

    let nombre = String(rawNombre || '').trim();
    let apellido = String(rawApellido || '').trim();

    // Si el archivo no trajo columna Apellido separada pero el Nombre trae nombre completo
    if (!apellido && nombre.includes(' ')) {
      const split = splitFullName(nombre);
      nombre = split.firstName;
      apellido = split.lastName;
    }

    const colaborador = [nombre, apellido].filter(Boolean).join(' ') || `Empleado ${idEmpleado}`;
    const departamento = String(rawDepto || 'Sin Departamento').trim();

    const rawInicio = getMatchingValue(row, [
      'Hora de Inicio de T.E.',
      'Hora de Inicio de TE',
      'Hora Inicio de T.E.',
      'Hora Inicio T.E.',
      'Hora Inicio TE',
      'Hora de Inicio',
      'Hora Inicio',
    ]);
    const rawFin = getMatchingValue(row, [
      'Hora de Fin de T.E.',
      'Hora de Fin de TE',
      'Hora Fin de T.E.',
      'Hora Fin T.E.',
      'Hora Fin TE',
      'Hora de Fin',
      'Hora Fin',
    ]);

    const { dateObj: startDateObj, formatted: horaInicio } = parseDateTime(rawInicio);
    const { dateObj: endDateObj, formatted: horaFin } = parseDateTime(rawFin);

    // Calcular duración en horas decimales
    let duracionHoras = 0;
    if (startDateObj && endDateObj) {
      duracionHoras = calculateDurationHours(startDateObj, endDateObj);
    }

    // Turno / Horario
    const rawTurno = getMatchingValue(row, [
      'Turno',
      'Horario',
      'Código de Horario',
      'Codigo de Horario',
      'Nombre de Horario',
      'Turno de Trabajo',
      'Jornada',
      'Schedule',
    ]);
    const turno = formatShiftLabel(String(rawTurno || ''), horaInicio);

    // Agrupación temporal: Año y Semana ISO 8601 con base en Hora de Inicio de T.E.
    const dateForIso = startDateObj || new Date();
    const { isoYear, isoWeek, semanaIso } = getISOWeekInfo(dateForIso);

    // Estado de aprobación exacto: 'Aprobado' y 'Pendiente'
    const rawEstado = getMatchingValue(row, [
      'Estado de aprobación',
      'Estado de aprobacion',
      'Estado de Aprobación',
      'Estado de Aprobacion',
      'Estado',
      'Estatus',
    ]);
    const estado = normalizeApprovalStatus(rawEstado);

    // Tipo de colaborador (Sindicalizado vs No Sindicalizado / Confianza)
    const rawTipo = getMatchingValue(row, [
      'Tipo de Colaborador',
      'Tipo Colaborador',
      'Tipo',
      'Sindicalizado',
      'Estatus Colaborador',
      'Categoria',
      'Categoría',
    ]);
    const rawCompany = String(getMatchingValue(row, ['Empresa', 'Compañia', 'Compañía']) || 'Polaquimia').trim();
    const isSyndicated = rawTipo
      ? String(rawTipo).toUpperCase().includes('SIND') && !String(rawTipo).toUpperCase().includes('NO')
      : determineSyndicatedStatus(rawCompany, '', departamento);

    const isThird = isThirdShift(turno, horaInicio, horaFin);

    normalizedList.push({
      idEmpleado,
      nombre,
      apellido,
      colaborador,
      departamento,
      horaInicio,
      horaFin,
      duracionHoras,
      estado,
      turno,
      company: rawCompany,
      isSyndicated,
      isThirdShift: isThird,
      isoYear,
      isoWeek,
      semanaIso,
    });
  }

  return normalizedList;
}

export type AttendanceDaysMapValue =
  | Set<string>
  | {
      activeDates: Set<string>;
      thirdShiftDates?: Set<string>;
      isSyndicated?: boolean;
    };

/**
 * 3. Agregación por Empleado:
 * Agrupa por ID del Empleado + Semana ISO:
 * - nombre, apellido y colaborador (sin ocultar nombres ni apellidos)
 * - fecha exacta del último registro de cálculo de horas (inicio, fin, horario y horas)
 * - turno en el que estaban
 * - Días Laborados (D_lab): Conteo de días distintos en la semana con asistencia regular o TE
 * - Días en 3er Turno: Conteo de días distintos con cobertura en Turno Nocturno (3er Turno)
 * - Compensación por Prolongación de Jornada:
 *   - Si es SINDICALIZADO:
 *     - Días en 3er Turno: +1.0 hora por día laborado.
 *     - Días en turnos restantes: +0.5 horas por día laborado.
 *   - Si es NO SINDICALIZADO (o Confianza):
 *     - Compensación = 0 hrs (Equivalencia Horaria = TE Nominal / Base).
 * - TE Nominal Aprobado (horasAprobadas) y Pendiente (horasPendientes)
 * - TE Nominal / Base (H_base): horasAprobadas + horasPendientes
 * - Equivalencia Horaria Acumulada (H_equiv): H_base + H_prolongacion
 * - Semáforo configurable (evaluado sobre H_equiv o H_base): Rojo (>9h), Amarillo (>=7h y <=9h), Verde (<7h)
 */
export function aggregateOvertimeData(
  records: NormalizedOvertimeRow[],
  attendanceDaysByEmployeeWeek?: Map<string, AttendanceDaysMapValue>,
  evalMode: TrafficLightEvaluationMode = 'EQUIVALENCIA'
): {
  aggregated: OvertimeAggregationRecord[];
  kpis: OvertimeAggregationKPIs;
} {
  const groups = new Map<
    string,
    {
      id: string;
      nombre: string;
      apellido: string;
      colaborador: string;
      departamento: string;
      semana: string;
      isoYear: number;
      isoWeek: number;
      horasAprobadas: number;
      horasPendientes: number;
      turno: string;
      isSyndicated: boolean;
      activeDates: Set<string>;
      thirdShiftDates: Set<string>;
      lastRecord: {
        timestamp: number;
        fecha: string;
        horario: string;
        horas: number;
        completo: string;
        turno: string;
      } | null;
    }
  >();

  for (const row of records) {
    const key = `${row.idEmpleado}__${row.semanaIso}`;
    const existing = groups.get(key);

    const horasAprob = row.estado === 'Aprobado' ? row.duracionHoras : 0;
    const horasPend = row.estado === 'Pendiente' ? row.duracionHoras : 0;

    // Calcular timestamp para determinar el registro más reciente de la semana
    const { dateObj: startD } = parseDateTime(row.horaInicio);
    const startMs = startD ? startD.getTime() : 0;

    const fechaStr = row.horaInicio.split(' ')[0] || '';
    const horaInicioOnly = row.horaInicio.split(' ')[1]?.slice(0, 5) || row.horaInicio;
    const horaFinOnly = row.horaFin.split(' ')[1]?.slice(0, 5) || row.horaFin;
    const horarioStr = `${horaInicioOnly} - ${horaFinOnly}`;
    const completoStr = `${fechaStr} (${horarioStr})`;
    const turnoStr = row.turno || formatShiftLabel('', row.horaInicio);

    // Detectar si este registro específico cubre o corresponde al 3er turno
    const isRowThird = row.isThirdShift ?? isThirdShift(turnoStr, horaInicioOnly, horaFinOnly);

    if (!existing) {
      const activeDates = new Set<string>();
      const thirdShiftDates = new Set<string>();
      let isSyndicated = row.isSyndicated;

      if (fechaStr) {
        activeDates.add(fechaStr);
        if (isRowThird) {
          thirdShiftDates.add(fechaStr);
        }
      }

      if (attendanceDaysByEmployeeWeek?.has(key)) {
        const attVal = attendanceDaysByEmployeeWeek.get(key)!;
        if (attVal instanceof Set) {
          for (const d of attVal) activeDates.add(d);
        } else if (typeof attVal === 'object') {
          if (attVal.activeDates) {
            for (const d of attVal.activeDates) activeDates.add(d);
          }
          if (attVal.thirdShiftDates) {
            for (const d of attVal.thirdShiftDates) thirdShiftDates.add(d);
          }
          if (attVal.isSyndicated !== undefined && isSyndicated === undefined) {
            isSyndicated = attVal.isSyndicated;
          }
        }
      }

      if (isSyndicated === undefined) {
        isSyndicated = determineSyndicatedStatus(row.company || 'Polaquimia', '', row.departamento);
      }

      groups.set(key, {
        id: row.idEmpleado,
        nombre: row.nombre,
        apellido: row.apellido,
        colaborador: row.colaborador,
        departamento: row.departamento,
        semana: row.semanaIso,
        isoYear: row.isoYear,
        isoWeek: row.isoWeek,
        horasAprobadas: horasAprob,
        horasPendientes: horasPend,
        turno: turnoStr,
        isSyndicated: Boolean(isSyndicated),
        activeDates,
        thirdShiftDates,
        lastRecord: {
          timestamp: startMs,
          fecha: fechaStr,
          horario: horarioStr,
          horas: row.duracionHoras,
          completo: completoStr,
          turno: turnoStr,
        },
      });
    } else {
      existing.horasAprobadas += horasAprob;
      existing.horasPendientes += horasPend;
      if (fechaStr) {
        existing.activeDates.add(fechaStr);
        if (isRowThird) {
          existing.thirdShiftDates.add(fechaStr);
        }
      }

      if (row.isSyndicated !== undefined) {
        existing.isSyndicated = row.isSyndicated;
      }

      // Actualizar nombre o apellido si antes estaban vacíos
      if (!existing.apellido && row.apellido) {
        existing.apellido = row.apellido;
        existing.colaborador = [existing.nombre, row.apellido].filter(Boolean).join(' ');
      }
      if (!existing.nombre && row.nombre) {
        existing.nombre = row.nombre;
        existing.colaborador = [row.nombre, existing.apellido].filter(Boolean).join(' ');
      }

      // Si este registro es posterior al último registrado, actualizar último cálculo
      if (!existing.lastRecord || startMs >= existing.lastRecord.timestamp) {
        existing.lastRecord = {
          timestamp: startMs,
          fecha: fechaStr,
          horario: horarioStr,
          horas: row.duracionHoras,
          completo: completoStr,
          turno: turnoStr,
        };
        existing.turno = turnoStr;
      }
    }
  }

  let rojoCount = 0;
  let amarilloCount = 0;
  let verdeCount = 0;
  let totalHorasAprobadas = 0;
  let totalHorasPendientes = 0;
  let totalHorasBaseGeneral = 0;
  let totalEquivGeneral = 0;
  let totalDiasLaboradosGeneral = 0;
  let totalDiasTercerTurnoGeneral = 0;
  let totalHorasProlongacionGeneral = 0;
  let sindicalizadosCount = 0;
  let noSindicalizadosCount = 0;

  const aggregated: OvertimeAggregationRecord[] = Array.from(groups.values()).map((g) => {
    const horasAprobadas = Math.round(g.horasAprobadas * 10) / 10;
    const horasPendientes = Math.round(g.horasPendientes * 10) / 10;
    const horasBase = Math.round((horasAprobadas + horasPendientes) * 10) / 10;

    // Conteo de días distintos en la semana con actividad (asistencia regular o TE)
    const diasLaborados = Math.max(1, g.activeDates.size);
    const diasTercerTurno = Math.min(diasLaborados, g.thirdShiftDates.size);

    // Cálculo oficial de prolongación de jornada y equivalencia horaria
    const equiv = calculateOvertimeEquivalence(
      horasBase,
      diasLaborados,
      diasTercerTurno,
      g.isSyndicated
    );

    const {
      diasTurnosRestantes,
      horasProlongacion3erTurno,
      horasProlongacionRestantes,
      horasAdicionalesPorDia,
      equivalenciaHoraria,
    } = equiv;

    // Criterio de Semáforo:
    // Rojo: > 9h
    // Amarillo: >= 7h y <= 9h
    // Verde: < 7h
    const semaforoBase = evaluateTrafficLight(horasBase);
    const semaforoEquiv = evaluateTrafficLight(equivalenciaHoraria);
    const semaforo = evalMode === 'BASE' ? semaforoBase : semaforoEquiv;

    if (semaforo === 'ROJO') rojoCount++;
    else if (semaforo === 'AMARILLO') amarilloCount++;
    else verdeCount++;

    if (g.isSyndicated) {
      sindicalizadosCount++;
    } else {
      noSindicalizadosCount++;
    }

    totalHorasAprobadas += horasAprobadas;
    totalHorasPendientes += horasPendientes;
    totalHorasBaseGeneral += horasBase;
    totalEquivGeneral += equivalenciaHoraria;
    totalDiasLaboradosGeneral += diasLaborados;
    totalDiasTercerTurnoGeneral += diasTercerTurno;
    totalHorasProlongacionGeneral += horasAdicionalesPorDia;

    return {
      id: g.id,
      nombre: g.nombre,
      apellido: g.apellido,
      colaborador: g.colaborador,
      departamento: g.departamento,
      semana: g.semana,
      turno: g.lastRecord?.turno || g.turno || '1 - Primer turno (07:00 a 15:00)',
      ultimoRegistroFecha: g.lastRecord?.fecha || '',
      ultimoRegistroHorario: g.lastRecord?.horario || '',
      ultimoRegistroHoras: g.lastRecord?.horas ? Math.round(g.lastRecord.horas * 10) / 10 : 0,
      ultimoRegistroCompleto: g.lastRecord?.completo || '',
      isoYear: g.isoYear,
      isoWeek: g.isoWeek,
      isSyndicated: g.isSyndicated,
      esSindicalizado: g.isSyndicated,
      tipo: g.isSyndicated ? 'SINDICALIZADO' : 'NO SIND.',
      tipoColaborador: g.isSyndicated ? 'SINDICALIZADO' : 'NO SIND.',
      diasLaborados,
      diasTercerTurno,
      diasTurnosRestantes,
      horasProlongacion3erTurno,
      horasProlongacionRestantes,
      horasAprobadas,
      horasPendientes,
      horasBase,
      totalAcumulado: horasBase,
      horasAdicionalesPorDia,
      equivalenciaHoraria,
      semaforoBase,
      semaforoEquiv,
      semaforo,
    };
  });

  // Ordenar por equivalenciaHoraria descendente (o horasBase si evalMode es BASE)
  aggregated.sort((a, b) => {
    if (evalMode === 'BASE') {
      return b.horasBase - a.horasBase;
    }
    return b.equivalenciaHoraria - a.equivalenciaHoraria;
  });

  return {
    aggregated,
    kpis: {
      totalColaboradores: aggregated.length,
      sindicalizadosCount,
      noSindicalizadosCount,
      rojoCount,
      amarilloCount,
      verdeCount,
      totalHorasAprobadas: Math.round(totalHorasAprobadas * 10) / 10,
      totalHorasPendientes: Math.round(totalHorasPendientes * 10) / 10,
      totalAcumulado: Math.round(totalHorasBaseGeneral * 10) / 10,
      totalEquivalenciaHoraria: Math.round(totalEquivGeneral * 10) / 10,
      totalDiasLaborados: totalDiasLaboradosGeneral,
      totalDiasTercerTurno: totalDiasTercerTurnoGeneral,
      totalHorasProlongacion: Math.round(totalHorasProlongacionGeneral * 10) / 10,
    },
  };
}

/**
 * Detecta si una celda posee un color de relleno activo distinto a blanco o transparente.
 * Inspecciona cell?.s?.fill, cell?.s?.fgColor, cell?.s?.bgColor.
 */
export function hasCellFillColor(cell: any): boolean {
  if (!cell || !cell.s) return false;
  const s = cell.s;

  // patternType explícito transparente
  if (s.patternType === 'none') return false;

  // Inspección de fgColor
  if (s.fgColor) {
    if (s.fgColor.rgb) {
      const rgb = String(s.fgColor.rgb).toUpperCase();
      if (rgb !== 'FFFFFF' && rgb !== 'FFFFFFFF') return true;
    } else if (s.fgColor.theme !== undefined) {
      return true;
    }
  }

  // Inspección de bgColor
  if (s.bgColor) {
    if (s.bgColor.rgb) {
      const rgb = String(s.bgColor.rgb).toUpperCase();
      if (rgb !== 'FFFFFF' && rgb !== 'FFFFFFFF') return true;
    } else if (s.bgColor.theme !== undefined) {
      return true;
    }
  }

  // Inspección de fill genérico
  if (s.fill) {
    if (s.fill.pattern && s.fill.pattern !== 'none') return true;
    if (s.fill.fgColor?.rgb) {
      const rgb = String(s.fill.fgColor.rgb).toUpperCase();
      if (rgb !== 'FFFFFF' && rgb !== 'FFFFFFFF') return true;
    }
  }

  // Patrón solid activo
  if (s.patternType === 'solid') return true;

  return false;
}

const MATRIX_MONTH_MAP: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mzo: 3, marzo: 3, mar: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, septiembre: 9, set: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

const MATRIX_MONTH_NAMES_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface ExtractedPeriod {
  isoYear: number;
  monthNumber: number;
  monthName: string;
  weekNumber: number;
  week: string;
  startDate: string;
  endDate: string;
  fechaDisplay: string;
  periodText: string;
}

function extractPeriodFromWeeklyMatrixSheet(
  ws: XLSX.WorkSheet,
  sheetName: string
): ExtractedPeriod {
  let text = '';
  let foundYear = 2026;
  let startDay: number | null = null;
  let endDay: number | null = null;
  let month: number | null = null;

  for (let r = 0; r <= 3; r++) {
    for (let c = 0; c <= 35; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (v !== undefined && v !== null && v !== '') {
        const str = String(v).trim().toLowerCase();
        text += ' ' + str;
        if (typeof v === 'number' && v >= 2024 && v <= 2030) {
          foundYear = v;
        }
      }
    }
  }

  // Detectar mes en encabezados superiores
  for (const [key, mNum] of Object.entries(MATRIX_MONTH_MAP)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) {
      month = mNum;
      break;
    }
  }

  // Detectar mes en nombre de pestaña
  if (!month) {
    for (const [key, mNum] of Object.entries(MATRIX_MONTH_MAP)) {
      if (new RegExp(`\\b${key}\\b`, 'i').test(sheetName)) {
        month = mNum;
        break;
      }
    }
  }

  // Buscar patrón DEL X AL Y
  const matchDelAl = text.match(/del\s+(\d{1,2})\s+al\s+(\d{1,2})/i);
  if (matchDelAl) {
    startDay = parseInt(matchDelAl[1], 10);
    endDay = parseInt(matchDelAl[2], 10);
  } else {
    const matchSheetDel = sheetName.match(/(\d{1,2})\s*(?:al|-)\s*(\d{1,2})/i);
    if (matchSheetDel) {
      startDay = parseInt(matchSheetDel[1], 10);
      endDay = parseInt(matchSheetDel[2], 10);
    }
  }

  // Extraer número de semana del nombre de la hoja (ej. S2, S3, p26, P34)
  let weekNumber: number | null = null;
  const matchWeek = sheetName.match(/[sp](\d{1,2})/i);
  if (matchWeek) {
    weekNumber = parseInt(matchWeek[1], 10);
  }

  if (!month && weekNumber) {
    month = Math.min(12, Math.max(1, Math.ceil((weekNumber * 7) / 30.5)));
  }
  if (!month) {
    if (sheetName.includes('26-01')) month = 10;
    else if (sheetName.includes('02-08')) month = 11;
    else month = 1;
  }

  if (!startDay) startDay = 1;
  if (!endDay) endDay = Math.min(31, startDay + 6);

  const dateObj = new Date(foundYear, month - 1, startDay);
  if (!weekNumber) {
    weekNumber = getISOWeek(dateObj);
  }

  const startDateStr = `${foundYear}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endMonth = endDay < startDay ? (month === 12 ? 1 : month + 1) : month;
  const endDateStr = `${foundYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  return {
    isoYear: foundYear,
    monthNumber: month,
    monthName: MATRIX_MONTH_NAMES_ES[month] || 'Desconocido',
    weekNumber,
    week: `S${String(weekNumber).padStart(2, '0')}`,
    startDate: startDateStr,
    endDate: endDateStr,
    fechaDisplay: `${String(startDay).padStart(2, '0')}/${String(month).padStart(2, '0')}/${foundYear}`,
    periodText: text.trim(),
  };
}

export interface ParseWeeklyMatrixResult {
  records: WeeklyMatrixRecord[];
  overtimeRecords: OvertimeRecord[];
  stats: {
    sheetCount: number;
    activeEmployees: number;
    totalNormales: number;
    totalProlongacion: number;
    totalHoras: number;
    mismatchCount: number;
  };
}

/**
 * Algoritmo de Parseo de la Matriz Semanal con Detección de Color (SheetJS).
 * Procesa todas las pestañas con estructura de matriz semanal, desglosando
 * Horas Extra Normales y Horas de Prolongación de Jornada celda por celda.
 */
export function parseWeeklyMatrixWorkbook(
  workbook: XLSX.WorkBook,
  sourceFileName = "Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'",
  baseTeRecords?: (AnnualOvertimeRecord | { employeeId?: string; ID?: string; department?: string; Departamento?: string; leader?: string; 'Líder de área'?: string })[]
): ParseWeeklyMatrixResult {
  const weeklyRecords: WeeklyMatrixRecord[] = [];
  const dailyOvertimeRecords: OvertimeRecord[] = [];

  // Diccionario/Mapa para enriquecimiento y cruce de Líder de Área y Departamento Canónico desde Base TE
  const idToLeaderMap = new Map<string, string>();
  const deptToLeaderMap = new Map<string, string>();
  const normDeptToCanonicalMap = new Map<string, string>();
  const idToDeptMap = new Map<string, string>();

  // Departamentos canónicos conocidos por defecto de Base TE
  const KNOWN_CANONICAL_DEPTS: Record<string, string> = {
    [normalizeDeptKey('GENERADOR VAPOR(CALDE')]: 'GENERADOR VAPOR(CALDE',
    [normalizeDeptKey('MANTENIMIENTO TLAX PQ')]: 'MANTENIMIENTO TLAX PQ',
  };
  for (const [key, val] of Object.entries(KNOWN_CANONICAL_DEPTS)) {
    normDeptToCanonicalMap.set(key, val);
  }

  if (baseTeRecords && Array.isArray(baseTeRecords)) {
    for (const b of baseTeRecords) {
      const canonicalDept = ((b as any).department || (b as any).Departamento || '').trim();
      const id = ((b as any).employeeId || (b as any).ID || '').trim();

      if (canonicalDept) {
        const normKey = normalizeDeptKey(canonicalDept);
        if (normKey && !normDeptToCanonicalMap.has(normKey)) {
          normDeptToCanonicalMap.set(normKey, canonicalDept);
        }
        if (id && !idToDeptMap.has(id)) {
          idToDeptMap.set(id, canonicalDept);
        }
      }

      const l = ((b as any).leader || (b as any)['Líder de área'] || '').trim();
      if (l && l !== 'Sin Líder') {
        if (id && !idToLeaderMap.has(id)) {
          idToLeaderMap.set(id, l);
        }
        if (canonicalDept) {
          const normKey = normalizeDeptKey(canonicalDept);
          if (normKey && !deptToLeaderMap.has(normKey)) {
            deptToLeaderMap.set(normKey, l);
          }
          if (!deptToLeaderMap.has(canonicalDept)) {
            deptToLeaderMap.set(canonicalDept, l);
          }
        }
      }
    }
  }

  let sheetCount = 0;
  let activeEmployeesCount = 0;
  let grandTotalNormales = 0;
  let grandTotalProlongacion = 0;
  let mismatchCount = 0;

  const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

  for (const sheetName of workbook.SheetNames) {
    // 1. Descartar de inmediato hojas auxiliares evidentes por nombre antes de decodificar celdas
    const sNameLower = sheetName.trim().toLowerCase();
    if (
      sNameLower.startsWith('hoja') ||
      sNameLower.startsWith('sheet') ||
      sNameLower.includes('resumen') ||
      sNameLower.includes('config') ||
      sNameLower.includes('catalog') ||
      sNameLower.includes('instrucc') ||
      sNameLower.includes('auxiliar') ||
      sNameLower.includes('datos') ||
      sNameLower.includes('param')
    ) {
      continue;
    }

    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;

    const range = XLSX.utils.decode_range(ws['!ref']);
    // Validar rango mínimo para estructura de matriz semanal (al menos 4 filas y cols hasta primer turno)
    if (range.e.r < 3 || range.e.c < 8) {
      continue;
    }

    // 2. Validación de Hoja: Buscar encabezados CLAVE / NOMBRE y días LUNES a DOMINGO en primeras filas
    let headerRow = -1;
    for (let r = 0; r <= Math.min(5, range.e.r); r++) {
      const rowTokens: string[] = [];
      for (let c = 0; c <= Math.min(15, range.e.c); c++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
        if (v) rowTokens.push(String(v).toUpperCase());
      }
      const joined = rowTokens.join(' ');
      if (
        (joined.includes('CLAVE') || joined.includes('ID')) &&
        (joined.includes('NOMBRE') || joined.includes('SAP') || joined.includes('LUNES'))
      ) {
        headerRow = r;
        break;
      }
      if (joined.includes('LUNES') && joined.includes('MARTES')) {
        headerRow = r;
        break;
      }
    }

    // Ignorar hojas auxiliares o sin estructura válida (Hoja1, Hoja2, etc.)
    if (headerRow === -1) {
      continue;
    }

    // Extraer periodo / semana / fechas
    const period = extractPeriodFromWeeklyMatrixSheet(ws, sheetName);
    sheetCount++;

    // Localizar fila de turnos (donde se ubica 38, 39, 40)
    let shiftRow = -1;
    for (let r = headerRow; r <= Math.min(headerRow + 3, range.e.r); r++) {
      for (let c = 7; c <= 15; c++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
        if (v === 38 || v === '38') {
          shiftRow = r;
          break;
        }
      }
      if (shiftRow !== -1) break;
    }

    const dataStartRow = shiftRow !== -1 ? shiftRow + 1 : headerRow + 3;

    // Base date para calcular fecha exacta de cada día de la semana (Lunes = +0 días)
    const [pYear, pMonth, pDay] = period.startDate.split('-').map(Number);
    const mondayDate = new Date(pYear, pMonth - 1, pDay);

    // Límite de filas: usar el rango decode_range sin recorrer todas las llaves del objeto
    const maxRow = range.e.r;

    // 3. Filtrado Rápido de Colaboradores Activos: Columna B (Activo) === 1
    // Saltar de inmediato sin procesar celdas ni estilos si no está activo
    for (let r = dataStartRow; r <= maxRow; r++) {
      const cellActivo = ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
      const isActivo =
        cellActivo === 1 ||
        cellActivo === '1' ||
        String(cellActivo ?? '').trim() === '1';

      if (!isActivo) {
        continue;
      }

      const colA = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v || '').trim(); // Departamento
      const rawColC = ws[XLSX.utils.encode_cell({ r, c: 2 })]?.v; // Clave / ID
      const colD = String(ws[XLSX.utils.encode_cell({ r, c: 3 })]?.v || '').trim(); // Nombre
      const rawColE = ws[XLSX.utils.encode_cell({ r, c: 4 })]?.v; // ID SAP

      if (!rawColC && !colD) continue;

      const employeeId = String(rawColC || '').trim();
      const employeeName = colD || 'Sin Nombre';
      const sapId = String(rawColE || employeeId).trim();

      // Mapeo inteligente hacia el departamento canónico oficial de Base TE
      const normColA = normalizeDeptKey(colA);
      const canonicalFromDept = normColA ? normDeptToCanonicalMap.get(normColA) : undefined;
      const canonicalFromId = employeeId ? idToDeptMap.get(employeeId) : undefined;
      const department = canonicalFromDept || canonicalFromId || colA || 'Sin Departamento';

      // Cruce de Líder de Área con Base TE (ID -> Líder de área y como respaldo Departamento -> Líder de área)
      let resolvedLeader = idToLeaderMap.get(employeeId);
      if (!resolvedLeader || resolvedLeader === 'Sin Líder') {
        resolvedLeader = deptToLeaderMap.get(normalizeDeptKey(department)) || deptToLeaderMap.get(department);
      }
      if (!resolvedLeader) {
        resolvedLeader = department || 'Sin Líder Asignado';
      }

      activeEmployeesCount++;

      let horasNormales = 0;
      let horasProlongacion = 0;
      const shiftHours: { 1: number; 2: number; 3: number } = { 1: 0, 2: 0, 3: 0 };
      const shiftsActive = new Set<number>();
      const diasDetalle: WeeklyMatrixDayDetail[] = [];

      // 4. Reglas de Clasificación Día por Día (Lunes a Domingo - Cols H a AC)
      // Cada día está dividido en 3 columnas: Turno 1 (38), Turno 2 (39), Turno 3 (40)
      // Índice de inicio: Columna I (índice 8)
      const dayColsStart = 8;

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        // Calcular fecha ISO del día
        const currentDayDate = new Date(mondayDate.getTime() + dayIdx * 86400000);
        const dayYear = currentDayDate.getFullYear();
        const dayMonth = String(currentDayDate.getMonth() + 1).padStart(2, '0');
        const dayNum = String(currentDayDate.getDate()).padStart(2, '0');
        const dayDateStr = `${dayYear}-${dayMonth}-${dayNum}`;

        let dayNormales = 0;
        let dayProlongacion = 0;
        const dayShifts: number[] = [];

        for (let shiftIdx = 0; shiftIdx < 3; shiftIdx++) {
          const colIdx = dayColsStart + dayIdx * 3 + shiftIdx;
          const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
          if (!cell || cell.v === undefined || cell.v === null) continue;

          // Parseo seguro de decimales con coma regional y limpieza de textos administrativos
          const rawVal = cell.v;
          let numVal: number;

          if (typeof rawVal === 'number') {
            if (isNaN(rawVal) || rawVal <= 0) continue;
            numVal = rawVal;
          } else {
            const rawStr = String(rawVal).trim();
            if (!rawStr) continue;

            // Convertir coma decimal regional a punto (ej. "0,5" -> "0.5")
            const normalizedNumStr = rawStr.replace(',', '.');

            // Ignorar textos administrativos (vacaciones, sindicato, d, pagado, db7pg2, pg2, pg1, etc.)
            // Aceptando exclusivamente valores numéricos puros (enteros o decimales)
            if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizedNumStr)) {
              continue;
            }

            numVal = parseFloat(normalizedNumStr);
            if (isNaN(numVal) || numVal <= 0) continue;
          }

          const shiftNumber = (shiftIdx + 1) as 1 | 2 | 3; // 1: 38 (1er Turno), 2: 39 (2do Turno), 3: 40 (3er Turno)
          shiftsActive.add(shiftNumber);
          shiftHours[shiftNumber] += numVal;
          dayShifts.push(shiftNumber);

          const hasColor = hasCellFillColor(cell);

          let entryNormales = 0;
          let entryProlongacion = 0;

          // Regla Crítica: Todo registro de la Matriz Semanal se asigna obligatoriamente como SINDICALIZADO.
          // La Prolongación de Jornada (0.5 hrs en T1/T2 y 1.0 hr en T3) se aplica EXCLUSIVAMENTE
          // a personal SINDICALIZADO. Para cualquier registro NO SIND., la prolongación de jornada siempre es 0.0 hrs.
          const isRecordSyndicated = true;

          if (hasColor) {
            // Si la celda TIENE color de relleno: se suma a Horas Extra Normales
            entryNormales = numVal;
          } else {
            // Si la celda NO TIENE color de relleno:
            if (isRecordSyndicated) {
              if ((shiftNumber === 1 || shiftNumber === 2) && numVal === 0.5) {
                entryProlongacion = 0.5;
              } else if (shiftNumber === 3 && numVal === 1) {
                entryProlongacion = 1.0;
              } else {
                entryNormales = numVal;
              }
            } else {
              entryProlongacion = 0.0;
              entryNormales = numVal;
            }
          }

          horasNormales += entryNormales;
          horasProlongacion += entryProlongacion;
          dayNormales += entryNormales;
          dayProlongacion += entryProlongacion;

          // Generar OvertimeRecord diario para el Semáforo Semanal
          const shiftLabel =
            shiftNumber === 1
              ? '1er Turno'
              : shiftNumber === 2
              ? '2do Turno'
              : '3er Turno';

          const nextDayDate = new Date(currentDayDate.getTime() + 86400000);
          const nextDayStr = `${nextDayDate.getFullYear()}-${String(nextDayDate.getMonth() + 1).padStart(2, '0')}-${String(nextDayDate.getDate()).padStart(2, '0')}`;

          dailyOvertimeRecords.push({
            id: `MATRIZ_${employeeId}_${dayDateStr}_T${shiftNumber}_C${colIdx}`,
            employeeId,
            employeeName,
            company: 'POLAQUIMIA',
            department,
            leader: resolvedLeader,
            isSyndicated: true,
            esSindicalizado: true,
            tipo: 'SINDICALIZADO',
            tipoColaborador: 'SINDICALIZADO',
            startDate: dayDateStr,
            startTime: shiftNumber === 1 ? '07:00' : shiftNumber === 2 ? '15:00' : '23:00',
            endDate: shiftNumber === 3 ? nextDayStr : dayDateStr,
            endTime: shiftNumber === 1 ? '15:00' : shiftNumber === 2 ? '23:00' : '07:00',
            requestedHours: numVal,
            approvedHours: numVal,
            pendingHours: 0,
            status: 'APROBADO',
            reason: hasColor
              ? 'Tiempo Extra Puro (Color)'
              : entryProlongacion > 0
              ? 'Prolongación de Jornada'
              : 'Tiempo Extra Normal',
            reasonClassification: 'CORRECTO',
            reviewFormatStatus: 'CORRECTO',
            isoYear: period.isoYear,
            isoWeek: period.weekNumber,
            dateOnly: dayDateStr,
            importBatchId: 'BATCH_CLOUD_MATRIZ_TE',
            sourceFile: sourceFileName,
            horasNormales: entryNormales,
            horasProlongacion: entryProlongacion,
            horasTotales: numVal,
            turno: shiftLabel,
          });
        }

        diasDetalle.push({
          dayIndex: dayIdx,
          dayName: DAY_NAMES[dayIdx],
          dateStr: dayDateStr,
          horasNormales: Math.round(dayNormales * 100) / 100,
          horasProlongacion: Math.round(dayProlongacion * 100) / 100,
          horasTotales: Math.round((dayNormales + dayProlongacion) * 100) / 100,
          shiftsWithHours: dayShifts,
        });
      }

      // Detección de Turno Predominante o Combinación
      let turno = 'Sin Turno';
      if (shiftsActive.size === 1) {
        const s = Array.from(shiftsActive)[0];
        turno = s === 1 ? '1er Turno' : s === 2 ? '2do Turno' : '3er Turno';
      } else if (shiftsActive.size > 1) {
        turno = Array.from(shiftsActive)
          .sort((a, b) => a - b)
          .map((s) => (s === 1 ? '1er Turno' : s === 2 ? '2do Turno' : '3er Turno'))
          .join(', ');
      }

      const horasTotales = Math.round((horasNormales + horasProlongacion) * 100) / 100;
      grandTotalNormales += horasNormales;
      grandTotalProlongacion += horasProlongacion;

      // 5. Totales por Fila/Registro y Validación contra Columna AD (índice 29)
      const rawColAD = ws[XLSX.utils.encode_cell({ r, c: 29 })]?.v;
      let expectedTotalColAD: number | undefined;
      let isConsistentWithColAD = true;

      if (rawColAD !== undefined && rawColAD !== null && rawColAD !== '') {
        let parsedAD: number | undefined;
        if (typeof rawColAD === 'number') {
          parsedAD = isNaN(rawColAD) ? undefined : rawColAD;
        } else {
          const strAD = String(rawColAD).trim().replace(',', '.');
          if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(strAD)) {
            const num = parseFloat(strAD);
            if (!isNaN(num)) parsedAD = num;
          }
        }
        if (parsedAD !== undefined) {
          expectedTotalColAD = parsedAD;
          if (Math.abs(horasTotales - parsedAD) > 0.01) {
            isConsistentWithColAD = false;
            mismatchCount++;
          }
        }
      }

      // Registro resumen por colaborador-semana
      const matrixRecordId = `MATRIZ_${period.isoYear}_W${String(period.weekNumber).padStart(2, '0')}_${employeeId}`;

      weeklyRecords.push({
        id: matrixRecordId,
        sheetName,
        activo: 1,
        periodText: period.periodText,
        startDate: period.startDate,
        endDate: period.endDate,
        fecha: period.startDate,
        fechaDisplay: period.fechaDisplay,
        employeeId,
        employeeName,
        sapId,
        department,
        leader: resolvedLeader,
        liderArea: resolvedLeader,
        turno,
        horasPorTurno: {
          turno1: Math.round(shiftHours[1] * 100) / 100,
          turno2: Math.round(shiftHours[2] * 100) / 100,
          turno3: Math.round(shiftHours[3] * 100) / 100,
        },
        diasDetalle,
        week: period.week,
        weekNumber: period.weekNumber,
        isoYear: period.isoYear,
        monthNumber: period.monthNumber,
        monthName: period.monthName,
        overtimeType:
          horasProlongacion > 0
            ? horasNormales > 0
              ? 'TE Normal + Prolongación'
              : 'Prolongación de Jornada'
            : 'Tiempo Extra Normal',
        hours: horasTotales,
        amount: 0,
        horasNormales: Math.round(horasNormales * 100) / 100,
        horasProlongacion: Math.round(horasProlongacion * 100) / 100,
        horasTotales,
        expectedTotalColAD,
        isConsistentWithColAD,
        isSyndicated: true,
        esSindicalizado: true,
        tipo: 'SINDICALIZADO',
        tipoColaborador: 'SINDICALIZADO',
        company: 'POLAQUIMIA',
        importBatchId: 'BATCH_CLOUD_MATRIZ_TE',
        sourceFile: sourceFileName,
      });
    }
  }

  return {
    records: weeklyRecords,
    overtimeRecords: dailyOvertimeRecords,
    stats: {
      sheetCount,
      activeEmployees: activeEmployeesCount,
      totalNormales: Math.round(grandTotalNormales * 100) / 100,
      totalProlongacion: Math.round(grandTotalProlongacion * 100) / 100,
      totalHoras: Math.round((grandTotalNormales + grandTotalProlongacion) * 100) / 100,
      mismatchCount,
    },
  };
}

/**
 * Enriquecedor de registros de la Matriz Semanal con Líder de Área proveniente de Base TE (Concentrado Anual)
 */
export function enrichMatrixWithLeaders<
  T extends { employeeId?: string; department?: string; leader?: string; liderArea?: string }
>(
  matrixRecords: T[],
  baseTeRecords: {
    employeeId?: string;
    ID?: string;
    department?: string;
    Departamento?: string;
    leader?: string;
    'Líder de área'?: string;
  }[]
): (T & { leader: string; liderArea: string })[] {
  const idToLeaderMap = new Map<string, string>();
  const deptToLeaderMap = new Map<string, string>();
  const normDeptToCanonicalMap = new Map<string, string>();
  const idToDeptMap = new Map<string, string>();

  const KNOWN_CANONICAL_DEPTS: Record<string, string> = {
    [normalizeDeptKey('GENERADOR VAPOR(CALDE')]: 'GENERADOR VAPOR(CALDE',
    [normalizeDeptKey('MANTENIMIENTO TLAX PQ')]: 'MANTENIMIENTO TLAX PQ',
  };
  for (const [key, val] of Object.entries(KNOWN_CANONICAL_DEPTS)) {
    normDeptToCanonicalMap.set(key, val);
  }

  if (baseTeRecords && Array.isArray(baseTeRecords)) {
    for (const b of baseTeRecords) {
      const canonicalDept = ((b as any).department || (b as any).Departamento || '').trim();
      const id = ((b as any).employeeId || (b as any).ID || '').trim();

      if (canonicalDept) {
        const normKey = normalizeDeptKey(canonicalDept);
        if (normKey && !normDeptToCanonicalMap.has(normKey)) {
          normDeptToCanonicalMap.set(normKey, canonicalDept);
        }
        if (id && !idToDeptMap.has(id)) {
          idToDeptMap.set(id, canonicalDept);
        }
      }

      const l = ((b as any).leader || (b as any)['Líder de área'] || '').trim();
      if (l && l !== 'Sin Líder') {
        if (id && !idToLeaderMap.has(id)) {
          idToLeaderMap.set(id, l);
        }
        if (canonicalDept) {
          const normKey = normalizeDeptKey(canonicalDept);
          if (normKey && !deptToLeaderMap.has(normKey)) {
            deptToLeaderMap.set(normKey, l);
          }
          if (!deptToLeaderMap.has(canonicalDept)) {
            deptToLeaderMap.set(canonicalDept, l);
          }
        }
      }
    }
  }

  return matrixRecords.map((rec) => {
    const empId = (rec.employeeId || '').trim();
    const rawDept = (rec.department || '').trim();
    const normDept = normalizeDeptKey(rawDept);
    const resolvedDept =
      normDeptToCanonicalMap.get(normDept) ||
      idToDeptMap.get(empId) ||
      rawDept ||
      'Sin Departamento';

    const resolvedLeader =
      idToLeaderMap.get(empId) ||
      deptToLeaderMap.get(normDept) ||
      deptToLeaderMap.get(rawDept) ||
      (rec.leader && rec.leader !== rawDept ? rec.leader : resolvedDept) ||
      'Sin Líder Asignado';

    return {
      ...rec,
      department: resolvedDept,
      leader: resolvedLeader,
      liderArea: resolvedLeader,
    };
  });
}

/**
 * Estilos Tailwind distintivos por Turno para badges en tablas
 */
export function getTurnoBadgeClass(turno?: string): string {
  if (!turno || turno === 'Sin Turno' || turno === '-') {
    return 'bg-slate-100 text-slate-500 border-slate-200';
  }
  const norm = turno.toLowerCase();
  const has1 = norm.includes('1er') || norm.includes('primer');
  const has2 = norm.includes('2do') || norm.includes('segundo');
  const has3 = norm.includes('3er') || norm.includes('tercer');

  if (has1 && !has2 && !has3) {
    return 'bg-amber-50 text-amber-800 border-amber-300';
  }
  if (has2 && !has1 && !has3) {
    return 'bg-blue-50 text-blue-800 border-blue-300';
  }
  if (has3 && !has1 && !has2) {
    return 'bg-purple-50 text-purple-900 border-purple-300';
  }
  // Combinación de turnos (ej. 1er Turno, 2do Turno)
  return 'bg-teal-50 text-teal-800 border-teal-300';
}
