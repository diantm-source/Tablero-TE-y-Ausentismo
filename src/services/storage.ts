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
  db,
  initDatabaseWithSeed,
  upsertOvertimeTransactional,
  upsertAttendanceTransactional,
  deleteImportBatchTransactional,
  createCompleteBackup,
  restoreCompleteBackup,
  DEFAULT_THRESHOLDS,
  INITIAL_LEADERS,
  OFFICIAL_REASONS_CATALOG,
} from './db';
import { BackupPayload } from '../schemas';

export { DEFAULT_THRESHOLDS, INITIAL_LEADERS, OFFICIAL_REASONS_CATALOG };

export class AppStorage {
  /**
   * Initializes database and migrates any existing localStorage records
   */
  static async init(): Promise<void> {
    await initDatabaseWithSeed();
  }

  static async getOvertimeRecords(): Promise<OvertimeRecord[]> {
    return await db.overtimeRecords.toArray();
  }

  static async saveOvertimeRecords(records: OvertimeRecord[]): Promise<void> {
    await db.transaction('rw', db.overtimeRecords, async () => {
      await db.overtimeRecords.clear();
      await db.overtimeRecords.bulkAdd(records);
    });
  }

  static async getAttendanceRecords(): Promise<AttendanceRecord[]> {
    return await db.attendanceRecords.toArray();
  }

  static async saveAttendanceRecords(records: AttendanceRecord[]): Promise<void> {
    await db.transaction('rw', db.attendanceRecords, async () => {
      await db.attendanceRecords.clear();
      await db.attendanceRecords.bulkAdd(records);
    });
  }

  static async getDepartmentLeaders(): Promise<DepartmentLeader[]> {
    const list = await db.leaders.toArray();
    if (list.length === 0) {
      await db.leaders.bulkAdd(INITIAL_LEADERS);
      return INITIAL_LEADERS;
    }
    return list;
  }

  static async saveDepartmentLeaders(leaders: DepartmentLeader[]): Promise<void> {
    await db.transaction('rw', db.leaders, async () => {
      await db.leaders.clear();
      await db.leaders.bulkAdd(leaders);
    });
  }

  static async getReasonsCatalog(): Promise<ReasonCatalogItem[]> {
    const list = await db.reasonsCatalog.toArray();
    if (list.length === 0) {
      await db.reasonsCatalog.bulkAdd(OFFICIAL_REASONS_CATALOG);
      return OFFICIAL_REASONS_CATALOG;
    }
    return list;
  }

  static async saveReasonsCatalog(reasons: ReasonCatalogItem[]): Promise<void> {
    await db.transaction('rw', db.reasonsCatalog, async () => {
      await db.reasonsCatalog.clear();
      await db.reasonsCatalog.bulkAdd(reasons);
    });
  }

  static async getAuditIncidents(): Promise<AuditIncident[]> {
    return await db.auditIncidents.toArray();
  }

  static async saveAuditIncidents(incidents: AuditIncident[]): Promise<void> {
    await db.transaction('rw', db.auditIncidents, async () => {
      await db.auditIncidents.clear();
      await db.auditIncidents.bulkAdd(incidents);
    });
  }

  static async addAuditIncidents(newIncidents: AuditIncident[]): Promise<void> {
    await db.auditIncidents.bulkPut(newIncidents);
  }

  static async getImportHistory(): Promise<ImportHistoryItem[]> {
    return await db.importBatches.orderBy('importedAt').reverse().toArray();
  }

  static async saveImportHistory(history: ImportHistoryItem[]): Promise<void> {
    await db.transaction('rw', db.importBatches, async () => {
      await db.importBatches.clear();
      await db.importBatches.bulkAdd(history);
    });
  }

  static async addImportBatch(batch: ImportHistoryItem): Promise<void> {
    await db.importBatches.put(batch);
  }

  static async getThresholds(): Promise<ThresholdConfig> {
    const entry = await db.dashboardConfig.get('thresholds');
    if (entry && entry.value) {
      return { ...DEFAULT_THRESHOLDS, ...(entry.value as ThresholdConfig) };
    }
    return DEFAULT_THRESHOLDS;
  }

  static async saveThresholds(cfg: ThresholdConfig): Promise<void> {
    await db.dashboardConfig.put({
      key: 'thresholds',
      value: cfg,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Idempotent transactional upsert for Overtime Records (Anti-Duplicates)
   */
  static async upsertOvertimeRecords(
    incoming: OvertimeRecord[],
    batchId?: string
  ): Promise<{ newCount: number; updatedCount: number; ignoredCount: number }> {
    return await upsertOvertimeTransactional(incoming, batchId);
  }

  /**
   * Idempotent transactional upsert for Attendance Records (Anti-Duplicates)
   */
  static async upsertAttendanceRecords(
    incoming: AttendanceRecord[],
    batchId?: string
  ): Promise<{ newCount: number; updatedCount: number; ignoredCount: number }> {
    return await upsertAttendanceTransactional(incoming, batchId);
  }

  /**
   * Deletes a specific import batch and all its associated records
   */
  static async deleteImportBatch(batchId: string, fileName?: string): Promise<void> {
    await deleteImportBatchTransactional(batchId, fileName);
  }

  /**
   * Updates metadata of an import batch
   */
  static async updateImportBatch(batchId: string, updated: Partial<ImportHistoryItem>): Promise<void> {
    const item = await db.importBatches.get(batchId);
    if (item) {
      await db.importBatches.put({ ...item, ...updated });
    }
  }

  /**
   * Clears all business data to start with fresh BioTime import
   */
  static async clearAllData(): Promise<void> {
    await Promise.all([
      db.overtimeRecords.clear(),
      db.attendanceRecords.clear(),
      db.auditIncidents.clear(),
      db.importBatches.clear(),
      db.changeLog.clear(),
    ]);
  }

  /**
   * Removes only demo/seed records, keeping real uploaded files
   */
  static async clearDemoData(): Promise<void> {
    const isDemoFile = (name?: string) =>
      !name ||
      name.includes('BioTime_Asistencia_Inicial') ||
      name.includes('BioTime_TE_Inicial') ||
      name.includes('Plantilla');

    await db.transaction('rw', [db.overtimeRecords, db.attendanceRecords, db.importBatches], async () => {
      const allOT = await db.overtimeRecords.toArray();
      const demoOTIds = allOT.filter((r) => isDemoFile(r.sourceFile)).map((r) => r.id);
      await db.overtimeRecords.bulkDelete(demoOTIds);

      const allAtt = await db.attendanceRecords.toArray();
      const demoAttIds = allAtt.filter((r) => isDemoFile(r.sourceFile)).map((r) => r.id);
      await db.attendanceRecords.bulkDelete(demoAttIds);

      const allBatches = await db.importBatches.toArray();
      const demoBatchIds = allBatches.filter((b) => b.batchId.startsWith('BATCH_INIT_')).map((b) => b.batchId);
      await db.importBatches.bulkDelete(demoBatchIds);
    });
  }

  /**
   * Export all database tables into a validated JSON backup
   */
  static async exportBackup(): Promise<BackupPayload> {
    return await createCompleteBackup();
  }

  /**
   * Restore database from a validated JSON backup
   */
  static async restoreBackup(rawJson: unknown): Promise<{ success: boolean; message: string }> {
    return await restoreCompleteBackup(rawJson);
  }
}
