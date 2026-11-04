import { z } from 'zod';

export const OvertimeApprovalStatusSchema = z.enum([
  'APROBADO',
  'PENDIENTE',
  'RECHAZADO',
  'CANCELADO',
]);

export const ReasonClassificationSchema = z.enum([
  'CORRECTO',
  'POSIBLE_ERROR',
  'NO_RECONOCIDO',
  'REVISION',
]);

export const AttendanceAbsenceStatusSchema = z.enum([
  'AUSENCIA_CONFIRMADA',
  'AUSENCIA_PROBABLE',
  'INCIDENCIA_MARCAJE',
  'PRESENTE',
  'EXCLUIDO_HORARIO',
  'JUSTIFICADO_EXCEPCION',
]);

export const CompanySchema = z.object({
  id: z.string(), // e.g. 'POLAQUIMIA', 'MLBM'
  name: z.string(),
  isAttendanceEligible: z.boolean(), // true for Polaquimia, MLBM, Barteleu
  isActive: z.boolean().default(true),
});

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  leaderName: z.string().optional(),
});

export const EmployeeSchema = z.object({
  id: z.string(), // company_employeeId
  employeeId: z.string(),
  name: z.string(),
  company: z.string(),
  department: z.string(),
  nickname: z.string().optional(),
  isSyndicated: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const DepartmentLeaderSchema = z.object({
  id: z.string(),
  company: z.string(),
  department: z.string(),
  leaderName: z.string(),
  leaderPosition: z.string(),
  leaderEmployeeId: z.string().optional(),
  validFrom: z.string(),
  employeeCount: z.number().optional(),
});

export const ReasonCatalogItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  officialReason: z.string(),
  keywords: z.array(z.string()),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const ExceptionCatalogItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.enum(['INCAPACIDAD', 'VACACIONES', 'PERMISO', 'OTRO']),
  isJustified: z.boolean().default(true),
  description: z.string().optional(),
});

export const OvertimeRecordSchema = z.object({
  id: z.string(), // Business key: company_employeeId_startDate_startTime_endTime
  employeeId: z.string(),
  employeeName: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string(),
  department: z.string(),
  leader: z.string(),
  startDate: z.string(), // YYYY-MM-DD
  startTime: z.string(), // HH:mm:ss
  endDate: z.string(), // YYYY-MM-DD
  endTime: z.string(), // HH:mm:ss
  requestedHours: z.number().min(0),
  approvedHours: z.number().min(0),
  pendingHours: z.number().min(0),
  status: OvertimeApprovalStatusSchema,
  reason: z.string(),
  reasonNormalized: z.string().optional(),
  reasonClassification: ReasonClassificationSchema,
  reasonCategory: z.string().optional(),
  suggestedOfficialReason: z.string().optional(),
  requestDate: z.string().optional(),
  reviewFormatStatus: z.enum(['CORRECTO', 'INCORRECTO', 'PENDIENTE']),
  isoYear: z.number(),
  isoWeek: z.number(),
  dateOnly: z.string(),
  importBatchId: z.string().optional(),
  sourceFile: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const AttendanceRecordSchema = z.object({
  id: z.string(), // Business key: company_employeeId_date_schedule
  employeeId: z.string(),
  employeeName: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string(),
  nickname: z.string(),
  isSyndicated: z.boolean(),
  department: z.string(),
  leader: z.string(),
  date: z.string(), // YYYY-MM-DD
  dayOfWeek: z.string(),
  schedule: z.string(),
  isScheduleEligible: z.boolean(),
  exception: z.string(),
  hasException: z.boolean(),
  schedIn: z.string(),
  schedOut: z.string(),
  realIn: z.string().nullable(),
  realOut: z.string().nullable(),
  absenceStatus: AttendanceAbsenceStatusSchema,
  reviewStatus: z.enum(['REVISADO', 'PENDIENTE_REVISION', 'JUSTIFICADO']),
  isoYear: z.number(),
  isoWeek: z.number(),
  importBatchId: z.string().optional(),
  sourceFile: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const AuditIncidentSchema = z.object({
  id: z.string(),
  type: z.enum([
    'DUPLICATE_ROW',
    'EMPTY_ID',
    'INVALID_DATE',
    'INCONSISTENT_HOURS',
    'NEGATIVE_DURATION',
    'INVALID_REASON',
    'UNKNOWN_STATUS',
    'UNASSIGNED_LEADER',
    'UNMAPPED_COMPANY',
    'MISSING_REQUIRED_FIELD',
    'RECORD_UPDATED_PREVIOUSLY',
  ]),
  severity: z.enum(['baja', 'media', 'alta', 'critica']),
  recordType: z.enum(['overtime', 'attendance']),
  sourceFile: z.string().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().optional(),
  department: z.string().optional(),
  date: z.string().optional(),
  message: z.string(),
  details: z.string().optional(),
  detectedAt: z.string(),
});

export const ImportBatchSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  fileName: z.string(),
  fileType: z.enum(['overtime', 'attendance', 'reasons_catalog']),
  importedAt: z.string(),
  user: z.string(),
  totalRows: z.number(),
  newRecords: z.number(),
  updatedRecords: z.number(),
  ignoredRecords: z.number(),
  rejectedRecords: z.number(),
  dateRangeCovered: z.string(),
  status: z.enum(['COMPLETADO', 'CON_ADVERTENCIAS', 'FALLIDO']),
});

export const ChangeLogItemSchema = z.object({
  id: z.string(),
  entityType: z.enum(['overtime', 'attendance', 'leader', 'catalog', 'threshold']),
  entityId: z.string(),
  action: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  fieldChanged: z.string().optional(),
  previousValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  modifiedAt: z.string(),
  reason: z.string().optional(),
  batchId: z.string().optional(),
});

export const ThresholdConfigSchema = z.object({
  overtimeHighWarningDeptHours: z.number().min(0),
  absenceHighWarningRate: z.number().min(0),
  absenceCriticalRate: z.number().min(0),
});

export const BackupPayloadSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string(),
  app: z.literal('PANEL_CONTROL_AUSENTISMO_TE'),
  metadata: z.object({
    overtimeCount: z.number(),
    attendanceCount: z.number(),
    batchesCount: z.number(),
  }),
  data: z.object({
    overtimeRecords: z.array(OvertimeRecordSchema),
    attendanceRecords: z.array(AttendanceRecordSchema),
    departmentLeaders: z.array(DepartmentLeaderSchema),
    reasonsCatalog: z.array(ReasonCatalogItemSchema),
    exceptionsCatalog: z.array(ExceptionCatalogItemSchema).optional(),
    importBatches: z.array(ImportBatchSchema),
    auditIncidents: z.array(AuditIncidentSchema),
    changeLog: z.array(ChangeLogItemSchema).optional(),
    thresholds: ThresholdConfigSchema,
  }),
});

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;
