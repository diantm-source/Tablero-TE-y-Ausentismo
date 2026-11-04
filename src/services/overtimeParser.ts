import * as XLSX from 'xlsx';
import { getISOWeek, getISOWeekYear, isValid } from 'date-fns';

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
  diasLaborados: number; // D_lab: Días distintos con jornada regular o tiempo extra
  horasAprobadas: number; // TE Nominal Aprobado
  horasPendientes: number; // TE Nominal Pendiente
  horasBase: number; // H_base = horasAprobadas + horasPendientes (TE Nominal / Base)
  totalAcumulado: number; // Alias para horasBase
  horasAdicionalesPorDia: number; // H_dias = diasLaborados * 0.5 hrs
  equivalenciaHoraria: number; // H_equiv = horasBase + horasAdicionalesPorDia
  semaforoBase: TrafficLightStatus; // Semáforo evaluado sobre H_base
  semaforoEquiv: TrafficLightStatus; // Semáforo evaluado sobre H_equiv
  semaforo: TrafficLightStatus; // Semáforo activo según el modo seleccionado (por defecto H_equiv)
}

export type OvertimeWeeklySummary = OvertimeAggregationRecord;

export interface OvertimeAggregationKPIs {
  totalColaboradores: number;
  rojoCount: number;
  amarilloCount: number;
  verdeCount: number;
  totalHorasAprobadas: number;
  totalHorasPendientes: number;
  totalAcumulado: number; // Total H_base
  totalEquivalenciaHoraria: number; // Total H_equiv
  totalDiasLaborados: number;
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
      isoYear,
      isoWeek,
      semanaIso,
    });
  }

  return normalizedList;
}

/**
 * 3. Agregación por Empleado:
 * Agrupa por ID del Empleado + Semana ISO:
 * - nombre, apellido y colaborador (sin ocultar nombres ni apellidos)
 * - fecha exacta del último registro de cálculo de horas (inicio, fin, horario y horas)
 * - turno en el que estaban
 * - Días Laborados (D_lab): Conteo de días distintos en la semana con asistencia regular o TE
 * - TE Nominal Aprobado (horasAprobadas) y Pendiente (horasPendientes)
 * - TE Nominal / Base (H_base): horasAprobadas + horasPendientes
 * - Bono por Día Laborado (H_dias): D_lab * 0.5 hrs
 * - Equivalencia Horaria Acumulada (H_equiv): H_base + H_dias
 * - Semáforo configurable (evaluado sobre H_equiv o H_base): Rojo (>9h), Amarillo (>=7h y <=9h), Verde (<7h)
 */
export function aggregateOvertimeData(
  records: NormalizedOvertimeRow[],
  attendanceDaysByEmployeeWeek?: Map<string, Set<string>>,
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
      activeDates: Set<string>;
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

    if (!existing) {
      const activeDates = new Set<string>();
      if (fechaStr) activeDates.add(fechaStr);
      if (attendanceDaysByEmployeeWeek?.has(key)) {
        for (const d of attendanceDaysByEmployeeWeek.get(key)!) {
          activeDates.add(d);
        }
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
        activeDates,
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
      if (fechaStr) existing.activeDates.add(fechaStr);

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

  const aggregated: OvertimeAggregationRecord[] = Array.from(groups.values()).map((g) => {
    const horasAprobadas = Math.round(g.horasAprobadas * 10) / 10;
    const horasPendientes = Math.round(g.horasPendientes * 10) / 10;
    const horasBase = Math.round((horasAprobadas + horasPendientes) * 10) / 10;

    // Conteo de días distintos en la semana con actividad (asistencia regular o TE)
    const diasLaborados = Math.max(1, g.activeDates.size);
    // Bono / Adicional por día laborado: D_lab * 0.5 hrs
    const horasAdicionalesPorDia = Math.round(diasLaborados * 0.5 * 10) / 10;
    // Equivalencia Horaria: H_equiv = H_base + H_dias
    const equivalenciaHoraria = Math.round((horasBase + horasAdicionalesPorDia) * 10) / 10;

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

    totalHorasAprobadas += horasAprobadas;
    totalHorasPendientes += horasPendientes;
    totalHorasBaseGeneral += horasBase;
    totalEquivGeneral += equivalenciaHoraria;
    totalDiasLaboradosGeneral += diasLaborados;

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
      diasLaborados,
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
      rojoCount,
      amarilloCount,
      verdeCount,
      totalHorasAprobadas: Math.round(totalHorasAprobadas * 10) / 10,
      totalHorasPendientes: Math.round(totalHorasPendientes * 10) / 10,
      totalAcumulado: Math.round(totalHorasBaseGeneral * 10) / 10,
      totalEquivalenciaHoraria: Math.round(totalEquivGeneral * 10) / 10,
      totalDiasLaborados: totalDiasLaboradosGeneral,
    },
  };
}
