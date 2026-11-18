import Dexie, { type Table } from 'dexie';
import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  AttendanceRecord,
  AuditIncident,
  DepartmentLeader,
  ImportHistoryItem,
  OvertimeRecord,
  ReasonCatalogItem,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from '../types';
import {
  BackupPayload,
  BackupPayloadSchema,
  CompanySchema,
  DepartmentSchema,
  EmployeeSchema,
} from '../schemas';
import { z } from 'zod';
import {
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
} from './overtimeParser';

export interface CompanyEntity {
  id: string; // e.g. 'POLAQUIMIA'
  name: string;
  isAttendanceEligible: boolean;
  isActive: boolean;
}

export interface DepartmentEntity {
  id: string;
  name: string;
  company: string;
  leaderName?: string;
}

export interface EmployeeEntity {
  id: string; // company_employeeId
  employeeId: string;
  name: string;
  company: string;
  department: string;
  nickname?: string;
  isSyndicated: boolean;
  isActive: boolean;
}

export interface ExceptionCatalogItem {
  id: string;
  code: string;
  name: string;
  category: 'INCAPACIDAD' | 'VACACIONES' | 'PERMISO' | 'OTRO';
  isJustified: boolean;
  description?: string;
}

export interface ChangeLogEntry {
  id: string;
  entityType: 'overtime' | 'attendance' | 'leader' | 'catalog' | 'threshold';
  entityId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  fieldChanged?: string;
  previousValue?: unknown;
  newValue?: unknown;
  modifiedAt: string;
  reason?: string;
  batchId?: string;
}

export interface DashboardConfigEntity {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface PrecalculatedCatalogs {
  departmentToLeader: Record<string, string>;
  leaderToDepartments: Record<string, string[]>;
  leadersList: string[];
  departmentsList: string[];
  availableWeeks: string[];
  availableMonths: string[];
  minDate: string;
  maxDate: string;
  recordsCount: number;
  calculatedAt: string;
}

export class BioTimeDatabase extends Dexie {
  companies!: Table<CompanyEntity, string>;
  departments!: Table<DepartmentEntity, string>;
  employees!: Table<EmployeeEntity, string>;
  leaders!: Table<DepartmentLeader, string>;
  overtimeRecords!: Table<OvertimeRecord, string>;
  attendanceRecords!: Table<AttendanceRecord, string>;
  annualOvertimeRecords!: Table<AnnualOvertimeRecord, string>;
  absenceRecords!: Table<AbsenceRecord, string>;
  weeklyMatrixRecords!: Table<WeeklyMatrixRecord, string>;
  reasonsCatalog!: Table<ReasonCatalogItem, string>;
  exceptionsCatalog!: Table<ExceptionCatalogItem, string>;
  importBatches!: Table<ImportHistoryItem, string>;
  changeLog!: Table<ChangeLogEntry, string>;
  auditIncidents!: Table<AuditIncident, string>;
  dashboardConfig!: Table<DashboardConfigEntity, string>;

  constructor() {
    super('BioTimeLocalEnterpriseDB');
    this.version(1).stores({
      companies: 'id, name, isAttendanceEligible, isActive',
      departments: 'id, name, company',
      employees: 'id, employeeId, company, department, isSyndicated, isActive',
      leaders: 'id, department, company, leaderName',
      overtimeRecords:
        'id, employeeId, company, department, leader, startDate, status, isoYear, isoWeek, dateOnly, importBatchId, [company+employeeId+dateOnly], [isoYear+isoWeek]',
      attendanceRecords:
        'id, employeeId, company, department, leader, date, absenceStatus, isSyndicated, schedule, isScheduleEligible, isoYear, isoWeek, importBatchId, [company+employeeId+date], [isoYear+isoWeek]',
      reasonsCatalog: 'id, category, officialReason, isActive',
      exceptionsCatalog: 'id, code, name, category, isJustified',
      importBatches: 'id, batchId, fileName, fileType, importedAt, status',
      changeLog: 'id, entityType, entityId, action, modifiedAt, batchId',
      auditIncidents: 'id, type, severity, recordType, date, sourceFile, detectedAt',
      dashboardConfig: 'key',
    });
    this.version(2).stores({
      companies: 'id, name, isAttendanceEligible, isActive',
      departments: 'id, name, company',
      employees: 'id, employeeId, company, department, isSyndicated, isActive',
      leaders: 'id, department, company, leaderName',
      overtimeRecords:
        'id, employeeId, company, department, leader, startDate, status, isoYear, isoWeek, dateOnly, importBatchId, [company+employeeId+dateOnly], [isoYear+isoWeek]',
      attendanceRecords:
        'id, employeeId, company, department, leader, date, absenceStatus, isSyndicated, schedule, isScheduleEligible, isoYear, isoWeek, importBatchId, [company+employeeId+date], [isoYear+isoWeek]',
      annualOvertimeRecords:
        'id, fecha, employeeId, department, leader, weekNumber, isoYear, monthNumber, overtimeType',
      reasonsCatalog: 'id, category, officialReason, isActive',
      exceptionsCatalog: 'id, code, name, category, isJustified',
      importBatches: 'id, batchId, fileName, fileType, importedAt, status',
      changeLog: 'id, entityType, entityId, action, modifiedAt, batchId',
      auditIncidents: 'id, type, severity, recordType, date, sourceFile, detectedAt',
      dashboardConfig: 'key',
    });
    this.version(3).stores({
      companies: 'id, name, isAttendanceEligible, isActive',
      departments: 'id, name, company',
      employees: 'id, employeeId, company, department, isSyndicated, isActive',
      leaders: 'id, department, company, leaderName',
      overtimeRecords:
        'id, employeeId, company, department, leader, startDate, status, isoYear, isoWeek, dateOnly, importBatchId, [company+employeeId+dateOnly], [isoYear+isoWeek]',
      attendanceRecords:
        'id, employeeId, company, department, leader, date, absenceStatus, isSyndicated, schedule, isScheduleEligible, isoYear, isoWeek, importBatchId, [company+employeeId+date], [isoYear+isoWeek]',
      annualOvertimeRecords:
        'id, fecha, employeeId, department, leader, weekNumber, isoYear, monthNumber, overtimeType',
      absenceRecords:
        'id, employeeId, department, leader, absenceType, absenceCategory, startDate, endDate, weekNumber, isoYear',
      reasonsCatalog: 'id, category, officialReason, isActive',
      exceptionsCatalog: 'id, code, name, category, isJustified',
      importBatches: 'id, batchId, fileName, fileType, importedAt, status',
      changeLog: 'id, entityType, entityId, action, modifiedAt, batchId',
      auditIncidents: 'id, type, severity, recordType, date, sourceFile, detectedAt',
      dashboardConfig: 'key',
    });
    this.version(4).stores({
      companies: 'id, name, isAttendanceEligible, isActive',
      departments: 'id, name, company',
      employees: 'id, employeeId, company, department, isSyndicated, isActive',
      leaders: 'id, department, company, leaderName',
      overtimeRecords:
        'id, employeeId, company, department, leader, startDate, status, isoYear, isoWeek, dateOnly, importBatchId, [company+employeeId+dateOnly], [isoYear+isoWeek]',
      attendanceRecords:
        'id, employeeId, company, department, leader, date, absenceStatus, isSyndicated, schedule, isScheduleEligible, isoYear, isoWeek, importBatchId, [company+employeeId+date], [isoYear+isoWeek]',
      annualOvertimeRecords:
        'id, fecha, employeeId, department, leader, weekNumber, isoYear, monthNumber, overtimeType',
      absenceRecords:
        'id, employeeId, department, leader, absenceType, absenceCategory, startDate, endDate, weekNumber, isoYear',
      weeklyMatrixRecords:
        'id, employeeId, department, week, weekNumber, isoYear, monthNumber, importBatchId, [isoYear+weekNumber]',
      reasonsCatalog: 'id, category, officialReason, isActive',
      exceptionsCatalog: 'id, code, name, category, isJustified',
      importBatches: 'id, batchId, fileName, fileType, importedAt, status',
      changeLog: 'id, entityType, entityId, action, modifiedAt, batchId',
      auditIncidents: 'id, type, severity, recordType, date, sourceFile, detectedAt',
      dashboardConfig: 'key',
    });
  }
}

export const db = new BioTimeDatabase();

export const CLOUD_BATCH_ID = 'BATCH_CLOUD_GOOGLE_SHEETS_TE';
export const CLOUD_ATTENDANCE_BATCH_ID = 'BATCH_CLOUD_GOOGLE_SHEETS_ASIST';
export const CLOUD_BATCH_SOURCE = 'Google Sheets (Nube)';
export const CLOUD_SOURCE_FILE = 'GoogleSheets_BioTime_TE.csv';

// Conector adicional independiente: Matriz Semanal de Tiempo Extra y Prolongación de Jornada
export const CLOUD_MATRIZ_BATCH_ID = 'BATCH_CLOUD_MATRIZ_TE';
export const MATRIZ_FILE_NAME = 'Registro_Prolongacion.xlsx';
export const MATRIZ_BATCH_SOURCE = "Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'";

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  overtimeHighWarningDeptHours: 45,
  absenceHighWarningRate: 3.5,
  absenceCriticalRate: 5.0,
};

export const INITIAL_COMPANIES: CompanyEntity[] = [
  { id: 'POLAQUIMIA', name: 'Polaquimia S.A. de C.V.', isAttendanceEligible: true, isActive: true },
  { id: 'MLBM', name: 'MLBM', isAttendanceEligible: true, isActive: true },
  { id: 'BARTELEU', name: 'Barteleu', isAttendanceEligible: true, isActive: true },
  { id: 'POLATECNIA', name: 'Polatecnia', isAttendanceEligible: false, isActive: true },
  { id: 'BECARIOS', name: 'Becarios', isAttendanceEligible: false, isActive: true },
  { id: 'EXTERNOS', name: 'Externos', isAttendanceEligible: false, isActive: true },
];

export const FAKE_LEADER_NAMES = new Set([
  'ing. roberto saldaña',
  'ing. roberto saldana',
  'roberto saldaña',
  'roberto saldana',
  'ing. sofía morales',
  'ing. sofia morales',
  'sofía morales',
  'sofia morales',
  'lic. fernando cruz',
  'fernando cruz',
  'qfb. patricia mendoza',
  'patricia mendoza',
  'ing. alejandro vega',
  'alejandro vega',
  'dr. mario ruiz',
  'mario ruiz',
  'jtzompan',
]);

export const FAKE_DEPARTMENTS = new Set([
  'produccion',
  'producción',
  'control de calidad',
  'seguridad e higiene',
  'investigacion y desarrollo',
  'investigación y desarrollo',
]);

export const INITIAL_LEADERS: DepartmentLeader[] = [
  {
    id: 'lead-1',
    company: 'Polaquimia',
    department: 'AGUA RESIDUAL',
    leaderName: 'Beatriz Trejo',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-2',
    company: 'Polaquimia',
    department: 'ALMACENES TLAX PQ',
    leaderName: 'Imelda Diaz',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-3',
    company: 'Polaquimia',
    department: 'GENERADOR VAPOR(CALDE',
    leaderName: 'Fidel Mendoza',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-4',
    company: 'Polaquimia',
    department: 'MANTENIMIENTO TLAX PQ',
    leaderName: 'Fidel Mendoza',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-5',
    company: 'Polaquimia',
    department: 'PLANTA 3 PQ',
    leaderName: 'Septimio Corona',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-6',
    company: 'Polaquimia',
    department: 'PLANTA 4 PQ',
    leaderName: 'Septimio Corona',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-7',
    company: 'Polaquimia',
    department: 'PLANTA 5 PQ',
    leaderName: 'Armando Hernandez',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-8',
    company: 'Polaquimia',
    department: 'PLANTA 6 PQ',
    leaderName: 'Septimio Corona',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-9',
    company: 'Polaquimia',
    department: 'PLANTA 7 PQ',
    leaderName: 'Carlos Romero',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-10',
    company: 'Polaquimia',
    department: 'PLANTA 8 PQ',
    leaderName: 'Carlos Romero',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-11',
    company: 'Polaquimia',
    department: 'PLANTA 9 PQ',
    leaderName: 'Isaac Turrubiates',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-12',
    company: 'Polaquimia',
    department: 'PLANTA PILOTO PQ',
    leaderName: 'Deysi Cruz',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-13',
    company: 'Polaquimia',
    department: 'PTA TRAT A RESIDUAL',
    leaderName: 'Beatriz Trejo',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-14',
    company: 'Polaquimia',
    department: 'SEGURIDAD TLAX PQ',
    leaderName: 'Pedro Calderon',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-15',
    company: 'Polaquimia',
    department: 'SERV GRALES TLAX PQ',
    leaderName: 'Pedro Calderon',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
  {
    id: 'lead-16',
    company: 'Polaquimia',
    department: 'TRAT BLANQUEO PTA 7A',
    leaderName: 'Carlos Romero',
    leaderPosition: 'Responsable de Área',
    validFrom: '2024-01-01',
  },
];

export const OFFICIAL_REASONS_CATALOG: ReasonCatalogItem[] = [
  {
    id: 'mot-1',
    category: 'Auditoría',
    officialReason: 'Auditoría - Externa ISO 9001',
    keywords: ['auditoria', 'externa', 'iso 9001', 'iso'],
    description: 'Atención a auditoría externa de certificación ISO 9001.',
    isActive: true,
  },
  {
    id: 'mot-2',
    category: 'Auditoría',
    officialReason: 'Auditoría - Cliente SIFATEC',
    keywords: ['auditoria', 'cliente', 'sifatec'],
    description: 'Auditoría técnica y de procesos por cliente SIFATEC.',
    isActive: true,
  },
  {
    id: 'mot-3',
    category: 'Ausentismo',
    officialReason: 'Ausentismo - 50444 Humberto Avendaño',
    keywords: ['ausentismo', '50444', 'humberto avendaño', 'cobertura'],
    description: 'Cobertura por ausencia de colaborador.',
    isActive: true,
  },
  {
    id: 'mot-4',
    category: 'Capacitación',
    officialReason: 'Capacitación - Trabajo en alturas',
    keywords: ['capacitacion', 'alturas', 'trabajo en alturas', 'seguridad'],
    description: 'Entrenamiento de seguridad para maniobras y trabajo en alturas.',
    isActive: true,
  },
  {
    id: 'mot-5',
    category: 'Comisión de servicio',
    officialReason: 'Comisión de servicio - Visita Anajalsa Guadalajara',
    keywords: ['comision de servicio', 'anajalsa', 'guadalajara', 'viaje'],
    description: 'Traslado y visita técnica a planta Anajalsa Guadalajara.',
    isActive: true,
  },
  {
    id: 'mot-6',
    category: 'Incapacidad',
    officialReason: 'Incapacidad - 50444 Humberto Avendaño',
    keywords: ['incapacidad', '50444', 'humberto avendaño', 'imss'],
    description: 'Cobertura de puesto por incapacidad médica oficial.',
    isActive: true,
  },
  {
    id: 'mot-7',
    category: 'Inventario',
    officialReason: 'Inventario - Cierre anual',
    keywords: ['inventario', 'cierre anual', 'conteo', 'existencias'],
    description: 'Levantamiento de inventario físico y conciliación de fin de año.',
    isActive: true,
  },
  {
    id: 'mot-8',
    category: 'Investigación incidentes',
    officialReason: 'Investigación incidentes - Acr 280',
    keywords: ['investigacion incidentes', 'acr 280', 'acr', 'accidente'],
    description: 'Análisis de causa raíz e investigación técnica de incidente Acr 280.',
    isActive: true,
  },
  {
    id: 'mot-9',
    category: 'Mantenimiento correctivo',
    officialReason: 'Mantenimiento correctivo - Reparación de bomba',
    keywords: ['mantenimiento correctivo', 'reparacion de bomba', 'bomba', 'reparacion'],
    description: 'Intervención mecánica correctiva para reparación de bomba.',
    isActive: true,
  },
  {
    id: 'mot-10',
    category: 'Mantenimiento preventivo',
    officialReason: 'Mantenimiento preventivo - Cambio de retenes',
    keywords: ['mantenimiento preventivo', 'cambio de retenes', 'retenes'],
    description: 'Mantenimiento programado y sustitución de retenes en equipos.',
    isActive: true,
  },
  {
    id: 'mot-11',
    category: 'Reprogramación plan mantenimiento',
    officialReason: 'Reprogramación plan mantenimiento - Mantenimiento tanques OE',
    keywords: ['reprogramacion plan mantenimiento', 'mantenimiento tanques oe', 'tanques'],
    description: 'Ajuste de calendario para mantenimiento correctivo/preventivo de tanques OE.',
    isActive: true,
  },
  {
    id: 'mot-12',
    category: 'Liberación de equipo',
    officialReason: 'Liberación de equipo - Cambio de línea del reactor 609',
    keywords: ['liberacion de equipo', 'cambio de linea', 'reactor 609', 'linea'],
    description: 'Lavado, verificación y liberación de línea del reactor 609.',
    isActive: true,
  },
  {
    id: 'mot-13',
    category: 'Permiso contractual',
    officialReason: 'Permiso contractual - Defunción Padre 50444 Humberto Avendaño',
    keywords: ['permiso contractual', 'defuncion padre', 'luto', '50444'],
    description: 'Permiso con goce por defunción familiar directa contractual.',
    isActive: true,
  },
  {
    id: 'mot-14',
    category: 'Permiso contractual',
    officialReason: 'Permiso contractual - Paternidad 50444 Humberto Avendaño',
    keywords: ['permiso contractual', 'paternidad', '50444'],
    description: 'Permiso de paternidad conforme a contrato y ley.',
    isActive: true,
  },
  {
    id: 'mot-15',
    category: 'Permiso sindical',
    officialReason: 'Permiso sindical - Asistencia asamblea',
    keywords: ['permiso sindical', 'asistencia asamblea', 'asamblea', 'sindicato'],
    description: 'Permiso gremial para acudir a la asamblea sindical oficial.',
    isActive: true,
  },
  {
    id: 'mot-16',
    category: 'Producción extraordinaria',
    officialReason: 'Producción extraordinaria - Pedido 2,4-D Cliente Dragón',
    keywords: ['produccion extraordinaria', 'pedido 2,4-d', 'cliente dragon', 'dragon'],
    description: 'Extensión de turno para entrega prioritaria de pedido 2,4-D.',
    isActive: true,
  },
  {
    id: 'mot-17',
    category: 'Producción por mala calidad',
    officialReason: 'Producción por mala calidad - Mal etiquetado',
    keywords: ['produccion por mala calidad', 'mal etiquetado', 'retrabajo', 'calidad'],
    description: 'Retrabajo y corrección operativa por error de etiquetado en lote.',
    isActive: true,
  },
  {
    id: 'mot-18',
    category: 'Vacaciones',
    officialReason: 'Vacaciones - Cubre a 50444 Humberto Avendaño',
    keywords: ['vacaciones', 'cubre', '50444', 'humberto avendaño'],
    description: 'Cobertura de funciones durante vacaciones de colaborador.',
    isActive: true,
  },
  {
    id: 'mot-19',
    category: 'Vacante por nueva creación',
    officialReason: 'Vacante por nueva creación - Posición auxiliar de seguridad',
    keywords: ['vacante por nueva creacion', 'auxiliar de seguridad', 'seguridad', 'vacante'],
    description: 'Atención de funciones de nueva posición auxiliar en seguridad.',
    isActive: true,
  },
  {
    id: 'mot-20',
    category: 'Vacante por rotación',
    officialReason: 'Vacante por rotación - Baja de 50444 Humberto Avendaño',
    keywords: ['vacante por rotacion', 'baja', '50444', 'rotacion'],
    description: 'Cobertura temporal de puesto por baja de colaborador en proceso de reemplazo.',
    isActive: true,
  },
];

export const INITIAL_EXCEPTIONS: ExceptionCatalogItem[] = [
  { id: 'exc-1', code: 'VAC', name: 'Vacaciones', category: 'VACACIONES', isJustified: true },
  { id: 'exc-2', code: 'INC_IMSS', name: 'Incapacidad Médica IMSS', category: 'INCAPACIDAD', isJustified: true },
  { id: 'exc-3', code: 'PERM_CON_GOCE', name: 'Permiso con Goce', category: 'PERMISO', isJustified: true },
  { id: 'exc-4', code: 'PERM_PATERNIDAD', name: 'Permiso Paternidad', category: 'PERMISO', isJustified: true },
  { id: 'exc-5', code: 'PERM_SINDICAL', name: 'Permiso Sindical', category: 'PERMISO', isJustified: true },
  { id: 'exc-6', code: 'LUTO', name: 'Luto / Duelo Familiar', category: 'PERMISO', isJustified: true },
];

/**
 * Initializes database with catalogs and performs transparent migration from localStorage
 */
export async function initDatabaseWithSeed(): Promise<void> {
  // 1. Initialize companies if empty
  const compCount = await db.companies.count();
  if (compCount === 0) {
    await db.companies.bulkAdd(INITIAL_COMPANIES);
  }

  // 2. Initialize leaders if empty or purge any legacy fake leaders
  const currentLeaders = await db.leaders.toArray();
  const fakeIds = currentLeaders
    .filter(
      (l) =>
        FAKE_LEADER_NAMES.has((l.leaderName || '').toLowerCase().trim()) ||
        FAKE_DEPARTMENTS.has(normalizeDeptKey(l.department))
    )
    .map((l) => l.id);

  if (fakeIds.length > 0) {
    await db.leaders.bulkDelete(fakeIds);
  }

  const leaderCount = await db.leaders.count();
  if (leaderCount === 0) {
    await db.leaders.bulkAdd(INITIAL_LEADERS);
  }

  // 3. Initialize reasons if empty
  const reasonsCount = await db.reasonsCatalog.count();
  if (reasonsCount === 0) {
    await db.reasonsCatalog.bulkAdd(OFFICIAL_REASONS_CATALOG);
  }

  // 4. Initialize exceptions if empty
  const excCount = await db.exceptionsCatalog.count();
  if (excCount === 0) {
    await db.exceptionsCatalog.bulkAdd(INITIAL_EXCEPTIONS);
  }

  // 5. Initialize thresholds config if missing
  const existingCfg = await db.dashboardConfig.get('thresholds');
  if (!existingCfg) {
    await db.dashboardConfig.put({
      key: 'thresholds',
      value: DEFAULT_THRESHOLDS,
      updatedAt: new Date().toISOString(),
    });
  }

  // 6. Transparent Migration from localStorage if present
  try {
    const rawOT = localStorage.getItem('pcat_overtime_records_v1');
    if (rawOT) {
      const parsedOT: OvertimeRecord[] = JSON.parse(rawOT);
      if (Array.isArray(parsedOT) && parsedOT.length > 0) {
        const currentCount = await db.overtimeRecords.count();
        if (currentCount === 0) {
          await db.overtimeRecords.bulkPut(parsedOT);
        }
      }
    }

    const rawAtt = localStorage.getItem('pcat_attendance_records_v1');
    if (rawAtt) {
      const parsedAtt: AttendanceRecord[] = JSON.parse(rawAtt);
      if (Array.isArray(parsedAtt) && parsedAtt.length > 0) {
        const currentCount = await db.attendanceRecords.count();
        if (currentCount === 0) {
          await db.attendanceRecords.bulkPut(parsedAtt);
        }
      }
    }

    const rawHist = localStorage.getItem('pcat_import_history_v1');
    if (rawHist) {
      const parsedHist: ImportHistoryItem[] = JSON.parse(rawHist);
      if (Array.isArray(parsedHist) && parsedHist.length > 0) {
        const currentCount = await db.importBatches.count();
        if (currentCount === 0) {
          await db.importBatches.bulkPut(parsedHist);
        }
      }
    }

    const rawAudit = localStorage.getItem('pcat_audit_incidents_v1');
    if (rawAudit) {
      const parsedAudit: AuditIncident[] = JSON.parse(rawAudit);
      if (Array.isArray(parsedAudit) && parsedAudit.length > 0) {
        const currentCount = await db.auditIncidents.count();
        if (currentCount === 0) {
          await db.auditIncidents.bulkPut(parsedAudit);
        }
      }
    }
  } catch (err) {
    console.warn('Advertencia durante migración de localStorage a IndexedDB:', err);
  }

  // 7. Sanitize any duplicate cloud import batches from previous dynamic IDs
  await sanitizeCloudImportBatches();

  // 8. Sanitize department names (e.g. AGUA RESIDUAL -> PTA TRAT A RESIDUAL) and sync latest leaders
  await sanitizeDepartmentNamesAndLeaders();
}

/**
 * Normaliza nombres de departamentos a sus nombres canónicos (ej. "AGUA RESIDUAL" -> "PTA TRAT A RESIDUAL")
 * y sincroniza todos los registros históricos de cada área con el líder más reciente de esa área.
 */
export async function sanitizeDepartmentNamesAndLeaders(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.overtimeRecords,
      db.annualOvertimeRecords,
      db.absenceRecords,
      db.weeklyMatrixRecords,
      db.attendanceRecords,
      db.leaders,
      db.dashboardConfig,
    ],
    async () => {
      const [annualOt, ot, matriz, absences, att, leaders] = await Promise.all([
        db.annualOvertimeRecords.toArray(),
        db.overtimeRecords.toArray(),
        db.weeklyMatrixRecords.toArray(),
        db.absenceRecords.toArray(),
        db.attendanceRecords.toArray(),
        db.leaders.toArray(),
      ]);

      if (
        annualOt.length === 0 &&
        ot.length === 0 &&
        matriz.length === 0 &&
        absences.length === 0 &&
        att.length === 0
      ) {
        return;
      }

      // 1. Obtener líderes más recientes por departamento combinando todas las fuentes
      const allRecords = [...annualOt, ...ot, ...matriz, ...absences];
      const deptToLatestLeader = buildLatestDepartmentLeaderMap(allRecords as any);

      // Si el usuario configuró líderes específicos en el catálogo de líderes, integrarlos
      for (const l of leaders) {
        if (l.department && l.leaderName && l.leaderName.trim()) {
          const cDept = canonicalizeDepartment(l.department);
          deptToLatestLeader.set(normalizeDeptKey(cDept), l.leaderName.trim());
          deptToLatestLeader.set(cDept, l.leaderName.trim());
        }
      }

      let changesMade = false;

      // 2. Actualizar annualOvertimeRecords
      const updatedAnnual = annualOt.map((r) => {
        const cDept = canonicalizeDepartment(r.department);
        const l = deptToLatestLeader.get(normalizeDeptKey(cDept)) || deptToLatestLeader.get(cDept) || r.leader;
        if (cDept !== r.department || (l && l !== r.leader && l !== 'Sin Líder Asignado')) {
          changesMade = true;
          return { ...r, department: cDept, leader: l || r.leader };
        }
        return r;
      });
      if (changesMade) {
        await db.annualOvertimeRecords.bulkPut(updatedAnnual);
      }

      // 3. Actualizar overtimeRecords
      let otChanges = false;
      const updatedOt = ot.map((r) => {
        const cDept = canonicalizeDepartment(r.department);
        const l = deptToLatestLeader.get(normalizeDeptKey(cDept)) || deptToLatestLeader.get(cDept) || r.leader;
        if (cDept !== r.department || (l && l !== r.leader && l !== 'Sin Líder Asignado')) {
          otChanges = true;
          return { ...r, department: cDept, leader: l || r.leader };
        }
        return r;
      });
      if (otChanges) {
        await db.overtimeRecords.bulkPut(updatedOt);
      }

      // 4. Actualizar weeklyMatrixRecords
      let matrizChanges = false;
      const updatedMatriz = matriz.map((r) => {
        const cDept = canonicalizeDepartment(r.department);
        const l = deptToLatestLeader.get(normalizeDeptKey(cDept)) || deptToLatestLeader.get(cDept) || r.leader;
        if (cDept !== r.department || (l && l !== r.leader && l !== 'Sin Líder Asignado')) {
          matrizChanges = true;
          return { ...r, department: cDept, leader: l || r.leader, liderArea: l || r.liderArea };
        }
        return r;
      });
      if (matrizChanges) {
        await db.weeklyMatrixRecords.bulkPut(updatedMatriz);
      }

      // 5. Actualizar absenceRecords
      let absChanges = false;
      const updatedAbs = absences.map((r) => {
        const cDept = canonicalizeDepartment(r.department);
        const l = deptToLatestLeader.get(normalizeDeptKey(cDept)) || deptToLatestLeader.get(cDept) || r.leader;
        if (cDept !== r.department || (l && l !== r.leader && l !== 'Sin Líder Asignado')) {
          absChanges = true;
          return { ...r, department: cDept, leader: l || r.leader };
        }
        return r;
      });
      if (absChanges) {
        await db.absenceRecords.bulkPut(updatedAbs);
      }

      // 6. Actualizar attendanceRecords
      let attChanges = false;
      const updatedAtt = att.map((r) => {
        const cDept = canonicalizeDepartment(r.department);
        const l = deptToLatestLeader.get(normalizeDeptKey(cDept)) || deptToLatestLeader.get(cDept) || r.leader;
        if (cDept !== r.department || (l && l !== r.leader && l !== 'Sin Líder Asignado')) {
          attChanges = true;
          return { ...r, department: cDept, leader: l || r.leader };
        }
        return r;
      });
      if (attChanges) {
        await db.attendanceRecords.bulkPut(updatedAtt);
      }

      // 7. Actualizar leaders
      let leadChanges = false;
      const updatedLeaders = leaders.map((l) => {
        const cDept = canonicalizeDepartment(l.department);
        if (cDept !== l.department) {
          leadChanges = true;
          return { ...l, department: cDept };
        }
        return l;
      });
      if (leadChanges) {
        await db.leaders.bulkPut(updatedLeaders);
      }

      // Si hubo cambios, invalidar caché de catálogos precalculados para recalcular limpiamente
      if (changesMade || otChanges || matrizChanges || absChanges || attChanges || leadChanges) {
        await db.dashboardConfig.delete('precalculated_catalogs');
      }
    }
  );
}

function isCloudOvertimeBatch(
  batch: Partial<ImportHistoryItem> & { batchId?: string; fileName?: string; fileType?: string }
): boolean {
  if (batch.id === CLOUD_ATTENDANCE_BATCH_ID || batch.batchId === CLOUD_ATTENDANCE_BATCH_ID) {
    return false;
  }
  if (batch.id === CLOUD_MATRIZ_BATCH_ID || batch.batchId === CLOUD_MATRIZ_BATCH_ID) {
    return false;
  }
  if (batch.fileType && batch.fileType !== 'overtime') {
    return false;
  }
  return (
    batch.id === CLOUD_BATCH_ID ||
    batch.batchId === CLOUD_BATCH_ID ||
    batch.fileName === CLOUD_BATCH_SOURCE ||
    Boolean(batch.batchId && batch.batchId.startsWith('BATCH_CLOUD_'))
  );
}

function computeOvertimeDateRangeCovered(records: OvertimeRecord[]): string {
  const validDates = records
    .flatMap((r) => [r.startDate, r.endDate])
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();

  if (validDates.length === 0) {
    return 'Periodo no especificado';
  }
  return `${validDates[0]} a ${validDates[validDates.length - 1]}`;
}

function normalizeCloudBatchItem(
  raw: Partial<ImportHistoryItem> & Record<string, unknown>,
  overrides?: Partial<ImportHistoryItem>
): ImportHistoryItem {
  const legacyRecordCount = typeof raw.recordCount === 'number' ? raw.recordCount : 0;
  const legacyNew = typeof raw.newRecordsCount === 'number' ? raw.newRecordsCount : 0;
  const legacyUpdated = typeof raw.updatedRecordsCount === 'number' ? raw.updatedRecordsCount : 0;
  const legacyIgnored = typeof raw.ignoredRecordsCount === 'number' ? raw.ignoredRecordsCount : 0;
  const legacyDateRange =
    typeof raw.periodStart === 'string' && typeof raw.periodEnd === 'string'
      ? `${raw.periodStart} a ${raw.periodEnd}`
      : 'Periodo no especificado';

  const rawStatus = raw.status;
  const normalizedStatus: ImportHistoryItem['status'] =
    overrides?.status ??
    (rawStatus === 'COMPLETADO' || rawStatus === 'CON_ADVERTENCIAS' || rawStatus === 'FALLIDO'
      ? rawStatus
      : 'COMPLETADO');

  return {
    id: CLOUD_BATCH_ID,
    batchId: CLOUD_BATCH_ID,
    fileName: overrides?.fileName ?? (typeof raw.fileName === 'string' && raw.fileName ? raw.fileName : CLOUD_BATCH_SOURCE),
    fileType: 'overtime',
    importedAt:
      overrides?.importedAt ??
      (typeof raw.importedAt === 'string' && raw.importedAt ? raw.importedAt : new Date().toISOString()),
    user:
      overrides?.user ??
      (typeof raw.user === 'string' && raw.user ? raw.user : 'Sincronización Automática (Nube)'),
    totalRows: overrides?.totalRows ?? (typeof raw.totalRows === 'number' ? raw.totalRows : legacyRecordCount),
    newRecords: overrides?.newRecords ?? (typeof raw.newRecords === 'number' ? raw.newRecords : legacyNew),
    updatedRecords:
      overrides?.updatedRecords ?? (typeof raw.updatedRecords === 'number' ? raw.updatedRecords : legacyUpdated),
    ignoredRecords:
      overrides?.ignoredRecords ?? (typeof raw.ignoredRecords === 'number' ? raw.ignoredRecords : legacyIgnored),
    rejectedRecords:
      overrides?.rejectedRecords ?? (typeof raw.rejectedRecords === 'number' ? raw.rejectedRecords : 0),
    dateRangeCovered:
      overrides?.dateRangeCovered ??
      (typeof raw.dateRangeCovered === 'string' && raw.dateRangeCovered ? raw.dateRangeCovered : legacyDateRange),
    status: normalizedStatus,
  };
}

function sanitizeLocalStorageCloudBatches(replacement?: ImportHistoryItem): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const rawHist = localStorage.getItem('pcat_import_history_v1');
    if (!rawHist) return;

    const parsed = JSON.parse(rawHist);
    if (!Array.isArray(parsed)) return;

    const nonCloud = parsed.filter((b) => !isCloudOvertimeBatch(b));
    const cloudOnes = parsed.filter((b) => isCloudOvertimeBatch(b));

    if (replacement) {
      localStorage.setItem('pcat_import_history_v1', JSON.stringify([replacement, ...nonCloud]));
      return;
    }

    if (cloudOnes.length === 0) return;

    cloudOnes.sort(
      (a, b) =>
        (new Date(b?.importedAt || 0).getTime() || 0) -
        (new Date(a?.importedAt || 0).getTime() || 0)
    );
    const latest = normalizeCloudBatchItem(cloudOnes[0] as Record<string, unknown>);
    localStorage.setItem('pcat_import_history_v1', JSON.stringify([latest, ...nonCloud]));
  } catch {
    // localStorage unavailable or malformed
  }
}

/**
 * Deduplicates legacy cloud batches (Google Sheets (Nube)) in IndexedDB and localStorage,
 * keeping only the most recent entry normalized under CLOUD_BATCH_ID.
 */
export async function sanitizeCloudImportBatches(): Promise<void> {
  sanitizeLocalStorageCloudBatches();

  await db.transaction('rw', [db.importBatches, db.overtimeRecords, db.changeLog], async () => {
    const allBatches = await db.importBatches.toArray();
    const cloudBatches = allBatches.filter((b) => isCloudOvertimeBatch(b));

    if (cloudBatches.length === 0) {
      return;
    }

    const sorted = [...cloudBatches].sort(
      (a, b) =>
        (new Date(b.importedAt || 0).getTime() || 0) -
        (new Date(a.importedAt || 0).getTime() || 0)
    );
    const latest = sorted[0];
    const hasLegacyShape =
      latest.id !== CLOUD_BATCH_ID ||
      latest.batchId !== CLOUD_BATCH_ID ||
      (latest.status !== 'COMPLETADO' &&
        latest.status !== 'CON_ADVERTENCIAS' &&
        latest.status !== 'FALLIDO') ||
      typeof latest.newRecords !== 'number' ||
      typeof latest.dateRangeCovered !== 'string';

    if (cloudBatches.length === 1 && !hasLegacyShape) {
      return;
    }

    const oldIds = cloudBatches.map((b) => b.id);
    const oldBatchIds = new Set(cloudBatches.map((b) => b.batchId));
    const normalizedLatest = normalizeCloudBatchItem(latest as unknown as Record<string, unknown>);

    await db.importBatches.bulkDelete(oldIds);
    await db.importBatches.put(normalizedLatest);

    const legacyOtRecords = await db.overtimeRecords
      .filter(
        (r) =>
          (r.importBatchId !== undefined &&
            r.importBatchId !== CLOUD_BATCH_ID &&
            (oldBatchIds.has(r.importBatchId) ||
              (r.importBatchId.startsWith('BATCH_CLOUD_') && r.importBatchId !== CLOUD_ATTENDANCE_BATCH_ID))) ||
          (!r.importBatchId && r.sourceFile === CLOUD_SOURCE_FILE)
      )
      .toArray();

    if (legacyOtRecords.length > 0) {
      await db.overtimeRecords.bulkPut(
        legacyOtRecords.map((r) => ({ ...r, importBatchId: CLOUD_BATCH_ID }))
      );
    }

    const legacyLogs = await db.changeLog
      .filter(
        (l) =>
          l.batchId !== undefined &&
          l.batchId !== CLOUD_BATCH_ID &&
          (oldBatchIds.has(l.batchId) ||
            (l.batchId.startsWith('BATCH_CLOUD_') && l.batchId !== CLOUD_ATTENDANCE_BATCH_ID))
      )
      .toArray();

    if (legacyLogs.length > 0) {
      await db.changeLog.bulkPut(legacyLogs.map((l) => ({ ...l, batchId: CLOUD_BATCH_ID })));
    }
  });
}

/**
 * Idempotent transactional upsert for Overtime Records with change logging
 */
export async function upsertOvertimeTransactional(
  records: OvertimeRecord[],
  batchId?: string
): Promise<{ newCount: number; updatedCount: number; ignoredCount: number }> {
  return await db.transaction('rw', [db.overtimeRecords, db.changeLog, db.employees], async () => {
    let newCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    const ids = records.map((r) => r.id);
    const existingList = await db.overtimeRecords.where('id').anyOf(ids).toArray();
    const existingMap = new Map<string, OvertimeRecord>(existingList.map((r) => [r.id, r]));

    const recordsToPut: OvertimeRecord[] = [];
    const changeLogs: ChangeLogEntry[] = [];

    const now = new Date().toISOString();
    let changeLogSeq = 0;

    for (const incoming of records) {
      const existing = existingMap.get(incoming.id);

      if (!existing) {
        recordsToPut.push(incoming);
        newCount++;
        changeLogSeq++;
        changeLogs.push({
          id: `log_ot_ins_${incoming.id}_${Date.now()}_${changeLogSeq}_${Math.random().toString(36).substring(2, 7)}`,
          entityType: 'overtime',
          entityId: incoming.id,
          action: 'INSERT',
          newValue: incoming,
          modifiedAt: now,
          batchId,
          reason: 'Carga inicial o nuevo registro de Tiempo Extra',
        });
        existingMap.set(incoming.id, incoming);
      } else {
        const hasChanged =
          existing.status !== incoming.status ||
          existing.approvedHours !== incoming.approvedHours ||
          existing.pendingHours !== incoming.pendingHours ||
          existing.requestedHours !== incoming.requestedHours ||
          existing.reason !== incoming.reason ||
          existing.startDate !== incoming.startDate ||
          existing.endDate !== incoming.endDate ||
          existing.isoWeek !== incoming.isoWeek ||
          existing.isoYear !== incoming.isoYear ||
          existing.dateOnly !== incoming.dateOnly ||
          existing.startTime !== incoming.startTime ||
          existing.endTime !== incoming.endTime;

        if (hasChanged) {
          const updatedRecord: OvertimeRecord = {
            ...existing,
            ...incoming,
            updatedAt: now,
          };
          recordsToPut.push(updatedRecord);
          updatedCount++;
          changeLogSeq++;
          changeLogs.push({
            id: `log_ot_upd_${incoming.id}_${Date.now()}_${changeLogSeq}_${Math.random().toString(36).substring(2, 7)}`,
            entityType: 'overtime',
            entityId: incoming.id,
            action: 'UPDATE',
            previousValue: existing,
            newValue: updatedRecord,
            modifiedAt: now,
            batchId,
            reason: 'Conciliación y actualización de registro existente',
          });
          existingMap.set(incoming.id, updatedRecord);
        } else {
          ignoredCount++;
        }
      }
    }

    if (recordsToPut.length > 0) {
      await db.overtimeRecords.bulkPut(recordsToPut);
    }
    if (changeLogs.length > 0) {
      await db.changeLog.bulkPut(changeLogs);
    }

    return { newCount, updatedCount, ignoredCount };
  });
}

/**
 * Upserts remote cloud overtime records and updates (or creates once) the fixed CLOUD_BATCH_ID batch entry.
 * Replaces the previous cloud dataset while keeping manual local Excel imports intact.
 */
export async function upsertCloudOvertimeBatchTransactional(
  records: OvertimeRecord[],
  syncTime = new Date().toISOString()
): Promise<{
  newCount: number;
  updatedCount: number;
  ignoredCount: number;
  batchItem: ImportHistoryItem;
}> {
  const stampedRecords: OvertimeRecord[] = records.map((r) => ({
    ...r,
    importBatchId: CLOUD_BATCH_ID,
  }));

  const dateRangeCovered = computeOvertimeDateRangeCovered(stampedRecords);

  const result = await db.transaction(
    'rw',
    [db.overtimeRecords, db.changeLog, db.employees, db.importBatches],
    async () => {
      const { newCount, updatedCount, ignoredCount } = await upsertOvertimeTransactional(
        stampedRecords,
        CLOUD_BATCH_ID
      );

      const incomingIds = new Set(stampedRecords.map((r) => r.id));

      // Remove stale cloud-sourced records that no longer exist in the remote sheet
      const staleCloudIds = await db.overtimeRecords
        .filter(
          (r) =>
            !incomingIds.has(r.id) &&
            (r.importBatchId === CLOUD_BATCH_ID ||
              Boolean(
                r.importBatchId?.startsWith('BATCH_CLOUD_') &&
                  r.importBatchId !== CLOUD_ATTENDANCE_BATCH_ID
              ) ||
              r.sourceFile === CLOUD_SOURCE_FILE)
        )
        .primaryKeys();

      if (staleCloudIds.length > 0) {
        await db.overtimeRecords.bulkDelete(staleCloudIds);
      }

      // Ensure existing unchanged cloud records carry the fixed CLOUD_BATCH_ID
      const recordsNeedingBatchId = await db.overtimeRecords
        .filter(
          (r) =>
            incomingIds.has(r.id) &&
            r.importBatchId !== CLOUD_BATCH_ID &&
            (Boolean(
              r.importBatchId?.startsWith('BATCH_CLOUD_') &&
                r.importBatchId !== CLOUD_ATTENDANCE_BATCH_ID
            ) ||
              r.sourceFile === CLOUD_SOURCE_FILE)
        )
        .toArray();

      if (recordsNeedingBatchId.length > 0) {
        await db.overtimeRecords.bulkPut(
          recordsNeedingBatchId.map((r) => ({ ...r, importBatchId: CLOUD_BATCH_ID }))
        );
      }

      // Upsert single cloud batch row in importBatches (and purge any legacy duplicates)
      const allBatches = await db.importBatches.toArray();
      const existingCloudBatches = allBatches.filter((b) => isCloudOvertimeBatch(b));
      const duplicateIds = existingCloudBatches
        .map((b) => b.id)
        .filter((id) => id !== CLOUD_BATCH_ID);

      if (duplicateIds.length > 0) {
        await db.importBatches.bulkDelete(duplicateIds);
      }

      const existingTarget =
        existingCloudBatches.find((b) => b.id === CLOUD_BATCH_ID) || existingCloudBatches[0];

      const batchItem: ImportHistoryItem = existingTarget
        ? normalizeCloudBatchItem(existingTarget as unknown as Record<string, unknown>, {
            importedAt: syncTime,
            totalRows: stampedRecords.length,
            newRecords: newCount,
            updatedRecords: updatedCount,
            ignoredRecords: ignoredCount,
            rejectedRecords: 0,
            dateRangeCovered,
            status: 'COMPLETADO',
          })
        : {
            id: CLOUD_BATCH_ID,
            batchId: CLOUD_BATCH_ID,
            fileName: CLOUD_BATCH_SOURCE,
            fileType: 'overtime',
            importedAt: syncTime,
            user: 'Sincronización Automática (Nube)',
            totalRows: stampedRecords.length,
            newRecords: newCount,
            updatedRecords: updatedCount,
            ignoredRecords: ignoredCount,
            rejectedRecords: 0,
            dateRangeCovered,
            status: 'COMPLETADO',
          };

      await db.importBatches.put(batchItem);

      return { newCount, updatedCount, ignoredCount, batchItem };
    }
  );

  sanitizeLocalStorageCloudBatches(result.batchItem);

  return result;
}

/**
 * Idempotent transactional upsert for Attendance Records with change logging
 */
export async function upsertAttendanceTransactional(
  records: AttendanceRecord[],
  batchId?: string
): Promise<{ newCount: number; updatedCount: number; ignoredCount: number }> {
  return await db.transaction('rw', [db.attendanceRecords, db.changeLog, db.employees], async () => {
    let newCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    const ids = records.map((r) => r.id);
    const existingList = await db.attendanceRecords.where('id').anyOf(ids).toArray();
    const existingMap = new Map<string, AttendanceRecord>(existingList.map((r) => [r.id, r]));

    const recordsToPut: AttendanceRecord[] = [];
    const changeLogs: ChangeLogEntry[] = [];
    const now = new Date().toISOString();
    let changeLogSeq = 0;

    for (const incoming of records) {
      const existing = existingMap.get(incoming.id);

      if (!existing) {
        recordsToPut.push(incoming);
        newCount++;
        changeLogSeq++;
        changeLogs.push({
          id: `log_att_ins_${incoming.id}_${Date.now()}_${changeLogSeq}_${Math.random().toString(36).substring(2, 7)}`,
          entityType: 'attendance',
          entityId: incoming.id,
          action: 'INSERT',
          newValue: incoming,
          modifiedAt: now,
          batchId,
          reason: 'Carga inicial de registro de asistencia',
        });
        existingMap.set(incoming.id, incoming);
      } else {
        const hasChanged =
          existing.realIn !== incoming.realIn ||
          existing.realOut !== incoming.realOut ||
          existing.absenceStatus !== incoming.absenceStatus ||
          existing.exception !== incoming.exception;

        if (hasChanged) {
          const updatedRecord: AttendanceRecord = {
            ...existing,
            ...incoming,
            updatedAt: now,
          };
          recordsToPut.push(updatedRecord);
          updatedCount++;
          changeLogSeq++;
          changeLogs.push({
            id: `log_att_upd_${incoming.id}_${Date.now()}_${changeLogSeq}_${Math.random().toString(36).substring(2, 7)}`,
            entityType: 'attendance',
            entityId: incoming.id,
            action: 'UPDATE',
            previousValue: existing,
            newValue: updatedRecord,
            modifiedAt: now,
            batchId,
            reason: 'Conciliación y actualización de marcajes/justificación',
          });
          existingMap.set(incoming.id, updatedRecord);
        } else {
          ignoredCount++;
        }
      }
    }

    if (recordsToPut.length > 0) {
      await db.attendanceRecords.bulkPut(recordsToPut);
    }
    if (changeLogs.length > 0) {
      await db.changeLog.bulkPut(changeLogs);
    }

    return { newCount, updatedCount, ignoredCount };
  });
}

/**
 * Delete a specific import batch and all its records and logs
 */
export async function deleteImportBatchTransactional(batchId: string, fileName?: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.overtimeRecords, db.attendanceRecords, db.auditIncidents, db.importBatches, db.changeLog],
    async () => {
      // 1. Delete Overtime records
      if (fileName) {
        await db.overtimeRecords.filter((r) => r.importBatchId === batchId || r.sourceFile === fileName).delete();
      } else {
        await db.overtimeRecords.where('importBatchId').equals(batchId).delete();
      }

      // 2. Delete Attendance records
      if (fileName) {
        await db.attendanceRecords.filter((r) => r.importBatchId === batchId || r.sourceFile === fileName).delete();
      } else {
        await db.attendanceRecords.where('importBatchId').equals(batchId).delete();
      }

      // 3. Delete Audit Incidents
      if (fileName) {
        await db.auditIncidents.filter((i) => i.sourceFile === fileName).delete();
      }

      // 4. Delete ChangeLogs
      await db.changeLog.where('batchId').equals(batchId).delete();

      // 5. Delete from history
      await db.importBatches.where('batchId').equals(batchId).delete();
    }
  );
}

/**
 * Replaces the cached Concentrado Anual overtime records in IndexedDB
 */
export async function replaceAnnualOvertimeTransactional(
  records: AnnualOvertimeRecord[]
): Promise<void> {
  await db.transaction('rw', db.annualOvertimeRecords, async () => {
    await db.annualOvertimeRecords.clear();
    if (records.length > 0) {
      await db.annualOvertimeRecords.bulkPut(records);
    }
  });
}

/**
 * Replaces the cached Concentrado de Ausencias records in IndexedDB
 */
export async function replaceAbsenceRecordsTransactional(
  records: AbsenceRecord[]
): Promise<void> {
  await db.transaction('rw', db.absenceRecords, async () => {
    await db.absenceRecords.clear();
    if (records.length > 0) {
      await db.absenceRecords.bulkPut(records);
    }
  });
}

/**
 * Upserts the weekly matrix (Registro_Prolongacion.xlsx) records, maintains a single fixed
 * CLOUD_MATRIZ_BATCH_ID history item, and syncs overtime records for Semáforo Semanal.
 */
export async function upsertWeeklyMatrixBatchTransactional(
  matrixRecords: WeeklyMatrixRecord[],
  dailyOvertimeRecords: OvertimeRecord[] = [],
  syncTime = new Date().toISOString()
): Promise<{
  newCount: number;
  updatedCount: number;
  ignoredCount: number;
  batchItem: ImportHistoryItem;
}> {
  return await db.transaction(
    'rw',
    [db.weeklyMatrixRecords, db.overtimeRecords, db.importBatches, db.changeLog],
    async () => {
      // 1. Persist weekly matrix records
      await db.weeklyMatrixRecords.clear();
      if (matrixRecords.length > 0) {
        await db.weeklyMatrixRecords.bulkPut(matrixRecords);
      }

      // 2. Clean old records associated with CLOUD_MATRIZ_BATCH_ID and insert new ones
      const oldMatrizOtIds = await db.overtimeRecords
        .filter((r) => r.importBatchId === CLOUD_MATRIZ_BATCH_ID || r.sourceFile === MATRIZ_BATCH_SOURCE)
        .primaryKeys();
      if (oldMatrizOtIds.length > 0) {
        await db.overtimeRecords.bulkDelete(oldMatrizOtIds);
      }

      if (dailyOvertimeRecords.length > 0) {
        const stamped = dailyOvertimeRecords.map((r) => ({
          ...r,
          importBatchId: CLOUD_MATRIZ_BATCH_ID,
          sourceFile: MATRIZ_BATCH_SOURCE,
        }));
        await db.overtimeRecords.bulkPut(stamped);
      }

      // 3. Date range covered
      const startDates = matrixRecords.map((m) => m.startDate).filter(Boolean).sort();
      const endDates = matrixRecords.map((m) => m.endDate).filter(Boolean).sort();
      const dateRangeCovered =
        startDates.length > 0 && endDates.length > 0
          ? `${startDates[0]} a ${endDates[endDates.length - 1]}`
          : 'Periodo no especificado';

      // 4. Upsert single fixed batch row in importBatches
      const batchItem: ImportHistoryItem = {
        id: CLOUD_MATRIZ_BATCH_ID,
        batchId: CLOUD_MATRIZ_BATCH_ID,
        fileName: MATRIZ_BATCH_SOURCE,
        fileType: 'overtime',
        importedAt: syncTime,
        user: 'Sincronización Automática (Nube)',
        totalRows: matrixRecords.length,
        newRecords: matrixRecords.length,
        updatedRecords: 0,
        ignoredRecords: 0,
        rejectedRecords: 0,
        dateRangeCovered,
        status: 'COMPLETADO',
      };

      await db.importBatches.put(batchItem);

      return {
        newCount: matrixRecords.length,
        updatedCount: 0,
        ignoredCount: 0,
        batchItem,
      };
    }
  );
}

/**
 * Creates a structured, schema-validated complete backup object
 */
export async function createCompleteBackup(): Promise<BackupPayload> {
  const [
    overtimeRecords,
    attendanceRecords,
    annualOvertimeRecords,
    absenceRecords,
    departmentLeaders,
    reasonsCatalog,
    exceptionsCatalog,
    importBatches,
    auditIncidents,
    changeLog,
    thresholdConfigEntry,
  ] = await Promise.all([
    db.overtimeRecords.toArray(),
    db.attendanceRecords.toArray(),
    db.annualOvertimeRecords.toArray(),
    db.absenceRecords.toArray(),
    db.leaders.toArray(),
    db.reasonsCatalog.toArray(),
    db.exceptionsCatalog.toArray(),
    db.importBatches.toArray(),
    db.auditIncidents.toArray(),
    db.changeLog.toArray(),
    db.dashboardConfig.get('thresholds'),
  ]);

  const thresholds = (thresholdConfigEntry?.value as ThresholdConfig) || DEFAULT_THRESHOLDS;

  const payload: BackupPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    app: 'PANEL_CONTROL_AUSENTISMO_TE',
    metadata: {
      overtimeCount: overtimeRecords.length,
      attendanceCount: attendanceRecords.length,
      batchesCount: importBatches.length,
    },
    data: {
      overtimeRecords,
      attendanceRecords,
      annualOvertimeRecords,
      absenceRecords,
      departmentLeaders,
      reasonsCatalog,
      exceptionsCatalog,
      importBatches,
      auditIncidents,
      changeLog,
      thresholds,
    },
  };

  // Validate schema before returning
  return BackupPayloadSchema.parse(payload);
}

/**
 * Restores all database tables from a verified backup payload
 */
export async function restoreCompleteBackup(rawJson: unknown): Promise<{ success: boolean; message: string }> {
  // Validate with Zod
  const validation = BackupPayloadSchema.safeParse(rawJson);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`El archivo de respaldo es inválido o no compatible con la versión 1.0: ${issues}`);
  }

  const payload = validation.data;

  await db.transaction(
    'rw',
    [
      db.overtimeRecords,
      db.attendanceRecords,
      db.annualOvertimeRecords,
      db.absenceRecords,
      db.leaders,
      db.reasonsCatalog,
      db.exceptionsCatalog,
      db.importBatches,
      db.auditIncidents,
      db.changeLog,
      db.dashboardConfig,
    ],
    async () => {
      // Clear existing records
      await Promise.all([
        db.overtimeRecords.clear(),
        db.attendanceRecords.clear(),
        db.annualOvertimeRecords.clear(),
        db.absenceRecords.clear(),
        db.leaders.clear(),
        db.reasonsCatalog.clear(),
        db.exceptionsCatalog.clear(),
        db.importBatches.clear(),
        db.auditIncidents.clear(),
        db.changeLog.clear(),
      ]);

      // Bulk insert restored records
      await Promise.all([
        db.overtimeRecords.bulkAdd(payload.data.overtimeRecords),
        db.attendanceRecords.bulkAdd(payload.data.attendanceRecords),
        payload.data.annualOvertimeRecords
          ? db.annualOvertimeRecords.bulkAdd(payload.data.annualOvertimeRecords)
          : Promise.resolve(),
        payload.data.absenceRecords
          ? db.absenceRecords.bulkAdd(payload.data.absenceRecords)
          : Promise.resolve(),
        db.leaders.bulkAdd(payload.data.departmentLeaders),
        db.reasonsCatalog.bulkAdd(payload.data.reasonsCatalog),
        payload.data.exceptionsCatalog ? db.exceptionsCatalog.bulkAdd(payload.data.exceptionsCatalog) : Promise.resolve(),
        db.importBatches.bulkAdd(payload.data.importBatches),
        db.auditIncidents.bulkAdd(payload.data.auditIncidents),
        payload.data.changeLog ? db.changeLog.bulkAdd(payload.data.changeLog) : Promise.resolve(),
        db.dashboardConfig.put({
          key: 'thresholds',
          value: payload.data.thresholds,
          updatedAt: new Date().toISOString(),
        }),
      ]);
    }
  );

  return {
    success: true,
    message: `Respaldo restaurado exitosamente: ${payload.metadata.overtimeCount} registros de TE, ${payload.metadata.attendanceCount} registros de asistencia.`,
  };
}
