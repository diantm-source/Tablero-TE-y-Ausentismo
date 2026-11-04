import Dexie, { type Table } from 'dexie';
import {
  AttendanceRecord,
  AuditIncident,
  DepartmentLeader,
  ImportHistoryItem,
  OvertimeRecord,
  ReasonCatalogItem,
  ThresholdConfig,
} from '../types';
import {
  BackupPayload,
  BackupPayloadSchema,
  CompanySchema,
  DepartmentSchema,
  EmployeeSchema,
} from '../schemas';
import { z } from 'zod';

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

export class BioTimeDatabase extends Dexie {
  companies!: Table<CompanyEntity, string>;
  departments!: Table<DepartmentEntity, string>;
  employees!: Table<EmployeeEntity, string>;
  leaders!: Table<DepartmentLeader, string>;
  overtimeRecords!: Table<OvertimeRecord, string>;
  attendanceRecords!: Table<AttendanceRecord, string>;
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
  }
}

export const db = new BioTimeDatabase();

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

export const INITIAL_LEADERS: DepartmentLeader[] = [
  {
    id: 'lead-1',
    company: 'Polaquimia',
    department: 'Producción',
    leaderName: 'Ing. Roberto Saldaña',
    leaderPosition: 'Gerente de Planta',
    leaderEmployeeId: 'EMP-010',
    validFrom: '2023-01-01',
    employeeCount: 42,
  },
  {
    id: 'lead-2',
    company: 'Polaquimia',
    department: 'Mantenimiento',
    leaderName: 'Ing. Sofía Morales',
    leaderPosition: 'Jefa de Mantenimiento',
    leaderEmployeeId: 'EMP-018',
    validFrom: '2023-01-01',
    employeeCount: 18,
  },
  {
    id: 'lead-3',
    company: 'Polaquimia',
    department: 'Almacén',
    leaderName: 'Lic. Fernando Cruz',
    leaderPosition: 'Jefe de Logística y Almacén',
    leaderEmployeeId: 'EMP-025',
    validFrom: '2023-03-15',
    employeeCount: 15,
  },
  {
    id: 'lead-4',
    company: 'Polatecnia',
    department: 'Control de Calidad',
    leaderName: 'QFB. Patricia Mendoza',
    leaderPosition: 'Coordinadora de Calidad',
    leaderEmployeeId: 'EMP-032',
    validFrom: '2023-02-01',
    employeeCount: 12,
  },
  {
    id: 'lead-5',
    company: 'Polaquimia',
    department: 'Seguridad e Higiene',
    leaderName: 'Ing. Alejandro Vega',
    leaderPosition: 'Supervisor EHS',
    leaderEmployeeId: 'EMP-040',
    validFrom: '2023-05-01',
    employeeCount: 8,
  },
  {
    id: 'lead-6',
    company: 'Becarios',
    department: 'Investigación y Desarrollo',
    leaderName: 'Dr. Mario Ruiz',
    leaderPosition: 'Líder I+D',
    leaderEmployeeId: 'EMP-055',
    validFrom: '2023-01-01',
    employeeCount: 6,
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

  // 2. Initialize leaders if empty
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
 * Creates a structured, schema-validated complete backup object
 */
export async function createCompleteBackup(): Promise<BackupPayload> {
  const [
    overtimeRecords,
    attendanceRecords,
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
