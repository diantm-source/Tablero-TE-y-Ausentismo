export type NavigationSection =
  | 'executive'
  | 'overtime'
  | 'attendance'
  | 'departments'
  | 'audit'
  | 'import'
  | 'catalogs';

export type OvertimeApprovalStatus = 'APROBADO' | 'PENDIENTE' | 'RECHAZADO' | 'CANCELADO';

export type ReasonClassification =
  | 'CORRECTO'
  | 'POSIBLE_ERROR'
  | 'NO_RECONOCIDO'
  | 'REVISION';

export interface OvertimeRecord {
  id: string; // Business key: company_employeeId_date_startTime_endTime
  rawId?: string;
  employeeId: string;
  employeeName: string;
  firstName?: string; // Nombre (hasta dos nombres, ej. JUAN MANUEL)
  lastName?: string; // Apellido (hasta dos apellidos, ej. OCHOA TEGOMEX)
  company: string;
  department: string;
  leader: string;
  isSyndicated?: boolean; // SINDICALIZADO vs NO SINDICALIZADO
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss or HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm:ss or HH:mm
  requestedHours: number;
  approvedHours: number;
  pendingHours: number;
  status: OvertimeApprovalStatus;
  reason: string;
  reasonNormalized?: string;
  reasonClassification: ReasonClassification;
  reasonCategory?: string;
  suggestedOfficialReason?: string;
  requestDate?: string; // Fecha de solicitud
  reviewFormatStatus: 'CORRECTO' | 'INCORRECTO' | 'PENDIENTE';
  isoYear: number;
  isoWeek: number;
  dateOnly: string;
  importBatchId?: string;
  sourceFile?: string;
  horasNormales?: number;
  horasProlongacion?: number;
  horasTotales?: number;
  tipo?: 'SINDICALIZADO' | 'NO SIND.' | string;
  esSindicalizado?: boolean;
  tipoColaborador?: 'SINDICALIZADO' | 'NO SIND.';
  turno?: string;
  updatedAt?: string;
}

export type AttendanceAbsenceStatus =
  | 'AUSENCIA_CONFIRMADA'
  | 'AUSENCIA_PROBABLE'
  | 'INCIDENCIA_MARCAJE'
  | 'PRESENTE'
  | 'EXCLUIDO_HORARIO'
  | 'JUSTIFICADO_EXCEPCION';

export interface AttendanceRecord {
  id: string; // Business key: company_employeeId_date_schedule
  employeeId: string;
  employeeName: string;
  firstName?: string;
  lastName?: string;
  company: string;
  nickname: string;
  isSyndicated: boolean;
  department: string;
  leader: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Lunes, Martes, etc.
  schedule: string; // e.g. '1', '1s', '2', '2s', '3', '3s', 'CM', 'C'
  isScheduleEligible: boolean;
  exception: string; // Excepcion justificada o vacia
  hasException: boolean;
  schedIn: string; // Hora de Entrada programada
  schedOut: string; // Hora de Salida programada
  realIn: string | null; // Entrada efectiva biométrica
  realOut: string | null; // Salida efectiva biométrica
  absenceStatus: AttendanceAbsenceStatus;
  reviewStatus: 'REVISADO' | 'PENDIENTE_REVISION' | 'JUSTIFICADO';
  isoYear: number;
  isoWeek: number;
  importBatchId?: string;
  sourceFile?: string;
  horasNormales?: number;
  horasProlongacion?: number;
  horasTotales?: number;
  tipo?: 'SINDICALIZADO' | 'NO SIND.' | string;
  esSindicalizado?: boolean;
  tipoColaborador?: 'SINDICALIZADO' | 'NO SIND.';
  turno?: string;
  updatedAt?: string;
}

export interface DepartmentLeader {
  id: string;
  company: string;
  department: string;
  leaderName: string;
  leaderPosition: string;
  leaderEmployeeId?: string;
  validFrom: string;
  employeeCount?: number;
}

export interface ReasonCatalogItem {
  id: string;
  category: string;
  officialReason: string;
  keywords: string[];
  description?: string;
  isActive: boolean;
}

export interface AuditIncident {
  id: string;
  type:
    | 'DUPLICATE_ROW'
    | 'EMPTY_ID'
    | 'INVALID_DATE'
    | 'INCONSISTENT_HOURS'
    | 'NEGATIVE_DURATION'
    | 'INVALID_REASON'
    | 'UNKNOWN_STATUS'
    | 'UNASSIGNED_LEADER'
    | 'UNMAPPED_COMPANY'
    | 'MISSING_REQUIRED_FIELD'
    | 'RECORD_UPDATED_PREVIOUSLY';
  severity: 'baja' | 'media' | 'alta' | 'critica';
  recordType: 'overtime' | 'attendance';
  sourceFile?: string;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  date?: string;
  message: string;
  details?: string;
  detectedAt: string;
}

export interface ImportHistoryItem {
  id: string;
  batchId: string;
  fileName: string;
  fileType: 'overtime' | 'attendance' | 'reasons_catalog';
  importedAt: string;
  user: string;
  totalRows: number;
  newRecords: number;
  updatedRecords: number;
  ignoredRecords: number;
  rejectedRecords: number;
  dateRangeCovered: string;
  status: 'COMPLETADO' | 'CON_ADVERTENCIAS' | 'FALLIDO';
}

export interface GlobalFilterState {
  companies: string[];
  companyPreset: 'ALL' | 'MAIN_THREE' | 'POLAQUIMIA_ONLY' | 'CUSTOM';
  departments: string[];
  leaders: string[];
  month: string; // 'ALL' or 'YYYY-MM'
  isoWeek: string; // 'ALL' or 'YYYY-Wxx'
  specificDate: string; // '' or 'YYYY-MM-DD'
  startDate: string;
  endDate: string;
  overtimeStatus: 'ALL' | 'APROBADO' | 'PENDIENTE' | 'RECHAZADO';
  collaboratorType: 'ALL' | 'SINDICALIZADO' | 'NO_SINDICALIZADO';
  searchTerm: string;
}

export interface ThresholdConfig {
  overtimeHighWarningDeptHours: number; // e.g. 50 horas por semana
  absenceHighWarningRate: number; // e.g. 3.5%
  absenceCriticalRate: number; // e.g. 5.0%
}

export type TrafficLightStatus = 'ROJO' | 'AMARILLO' | 'VERDE';

export type TrafficLightEvaluationMode = 'EQUIVALENCIA' | 'BASE';

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
  diasLaborados: number; // D_lab: Días distintos con jornada o tiempo extra
  horasAprobadas: number; // TE Nominal Aprobado
  horasPendientes: number; // TE Nominal Pendiente
  horasBase: number; // H_base = horasAprobadas + horasPendientes (TE Nominal / Base)
  totalAcumulado: number; // Alias para horasBase (mantiene compatibilidad)
  horasAdicionalesPorDia: number; // H_dias = diasLaborados * 0.5 hrs
  equivalenciaHoraria: number; // H_equiv = horasBase + horasAdicionalesPorDia
  semaforoBase: TrafficLightStatus; // Semáforo evaluado sobre H_base
  semaforoEquiv: TrafficLightStatus; // Semáforo evaluado sobre H_equiv
  semaforo: TrafficLightStatus; // Semáforo activo según el modo de evaluación (por defecto H_equiv)
}

export type OvertimeWeeklySummary = OvertimeAggregationRecord;

/**
 * Estructura exacta de columnas del archivo Concentrado Anual de Google Sheets
 */
export interface ConcentradoAnualRawRow {
  Fecha: string;
  ID: string;
  'Nombre del empleado': string;
  Departamento: string;
  'Tipo de TE': string;
  Horas: number;
  Importe: number;
  Semana: string;
  'Mes Numero': number;
  'Mes letra': string;
  'Líder de área': string;
}

export interface WeeklyMatrixDayDetail {
  dayIndex: number; // 0 (Lunes) a 6 (Domingo)
  dayName: 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';
  dateStr: string; // YYYY-MM-DD
  horasNormales: number;
  horasProlongacion: number;
  horasTotales: number;
  shiftsWithHours?: number[];
}

/**
 * Registro normalizado del Concentrado Anual de Tiempo Extra
 */
export interface AnnualOvertimeRecord {
  id: string;
  fecha: string; // YYYY-MM-DD (para ordenamiento y filtros)
  fechaDisplay: string; // DD/MM/AAAA
  employeeId: string; // ID
  employeeName: string; // Nombre del empleado
  department: string; // Departamento
  overtimeType: string; // Tipo de TE
  hours: number; // Horas
  amount: number; // Importe
  week: string; // ej. W43 o S04
  weekNumber: number; // ej. 43
  isoYear: number; // Año ISO derivado de fecha
  monthNumber: number; // Mes Numero (1-12)
  monthName: string; // Mes letra (ej. Octubre)
  leader: string; // Líder de área
  liderArea?: string; // Líder de área (alias/compatibilidad)
  turno?: string;
  horasPorTurno?: { turno1: number; turno2: number; turno3: number };
  diasDetalle?: WeeklyMatrixDayDetail[];
  isSyndicated?: boolean;
  esSindicalizado?: boolean;
  tipo?: 'SINDICALIZADO' | 'NO SIND.' | string;
  tipoColaborador?: 'SINDICALIZADO' | 'NO SIND.';
  company?: string;
  // Campos complementarios del conector de Matriz Semanal (Registro_Prolongacion):
  horasNormales?: number; // Horas Extra Normales (celdas con color / TE puro)
  horasProlongacion?: number; // Horas Prolongación de Jornada (0.5 T1/T2, 1.0 T3 sin relleno)
  horasTotales?: number; // Suma (horasNormales + horasProlongacion)
  sapId?: string; // ID SAP (Columna E)
  activo?: number; // Columna B (1 = Activo)
  sourceFile?: string;
  importBatchId?: string;
}

export type ConcentradoAnualRecord = AnnualOvertimeRecord;

/**
 * Registro de desglose semanal por colaborador de la Matriz Semanal (Formato A / Registro_Prolongacion.xlsx)
 */
export interface WeeklyMatrixRecord extends AnnualOvertimeRecord {
  sheetName: string;
  activo: number;
  periodText?: string;
  startDate: string;
  endDate: string;
  horasNormales: number;
  horasProlongacion: number;
  horasTotales: number;
  expectedTotalColAD?: number;
  isConsistentWithColAD: boolean;
  importBatchId: string;
  sourceFile: string;
}

/**
 * Estructura exacta de columnas del archivo Concentrado de Ausencias (Google Sheets / Excel)
 */
export interface AbsenceConcentratedRawRow {
  ID: string;
  Nombre: string;
  Puesto: string;
  Departamento: string;
  'Tipo de ausentismo': string;
  'Tipo Ausentismo': string;
  Ausencias: number;
  Importe: number;
  'Fecha inicial': string;
  'Fecha final': string;
  Semana: string;
  'Líder de área': string;
}

/**
 * Registro normalizado del Concentrado de Ausencias (Google Sheets / Excel)
 * Incluye las 12 columnas del archivo fuente más metadatos normalizados para filtrado y ordenamiento.
 */
export interface AbsenceRecord {
  id: string;
  employeeId: string; // ID
  employeeName: string; // Nombre
  position: string; // Puesto
  department: string; // Departamento
  absenceType: string; // Tipo de ausentismo (ej. 'FALTA INJUSTIFICADA', 'PERMISO', 'INCAPACIDAD')
  absenceCategory: string; // Tipo Ausentismo
  absences: number; // Ausencias (número de días/incidencias ausentes)
  amount: number; // Importe (costo monetario del ausentismo)
  startDate: string; // Fecha inicial normalizada YYYY-MM-DD
  startDateDisplay: string; // Fecha inicial DD/MM/AAAA
  endDate: string; // Fecha final normalizada YYYY-MM-DD
  endDateDisplay: string; // Fecha final DD/MM/AAAA
  week: string; // Semana (ej. W43)
  weekNumber: number; // Número de semana ISO
  isoYear: number; // Año ISO derivado de fecha inicial
  leader: string; // Líder de área
  isSyndicated?: boolean;
  esSindicalizado?: boolean;
  tipo?: 'SINDICALIZADO' | 'NO SIND.' | string;
  tipoColaborador?: 'SINDICALIZADO' | 'NO SIND.';
  company?: string;
}


