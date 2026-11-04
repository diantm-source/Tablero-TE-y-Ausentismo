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


