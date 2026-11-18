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
  db,
  CLOUD_BATCH_ID,
  CLOUD_ATTENDANCE_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  CLOUD_MATRIZ_BATCH_ID,
  MATRIZ_FILE_NAME,
  MATRIZ_BATCH_SOURCE,
  initDatabaseWithSeed,
  sanitizeCloudImportBatches,
  upsertOvertimeTransactional,
  upsertCloudOvertimeBatchTransactional,
  upsertWeeklyMatrixBatchTransactional,
  replaceAnnualOvertimeTransactional,
  replaceAbsenceRecordsTransactional,
  upsertAttendanceTransactional,
  deleteImportBatchTransactional,
  createCompleteBackup,
  restoreCompleteBackup,
  DEFAULT_THRESHOLDS,
  INITIAL_LEADERS,
  OFFICIAL_REASONS_CATALOG,
  PrecalculatedCatalogs,
  FAKE_LEADER_NAMES,
  FAKE_DEPARTMENTS,
} from './db';
import { BackupPayload } from '../schemas';
import { canonicalizeDepartment, normalizeDeptKey } from './overtimeParser';

export const STORAGE_KEY_DELETED_DEPTS = 'pcat_deleted_departments';
export const STORAGE_KEY_CUSTOM_LEADER_OVERRIDES = 'pcat_custom_leader_overrides';

export {
  CLOUD_BATCH_ID,
  CLOUD_ATTENDANCE_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  CLOUD_MATRIZ_BATCH_ID,
  MATRIZ_FILE_NAME,
  MATRIZ_BATCH_SOURCE,
  DEFAULT_THRESHOLDS,
  INITIAL_LEADERS,
  OFFICIAL_REASONS_CATALOG,
  type PrecalculatedCatalogs,
};

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

  static async getAnnualOvertimeRecords(): Promise<AnnualOvertimeRecord[]> {
    return await db.annualOvertimeRecords.toArray();
  }

  static async saveAnnualOvertimeRecords(records: AnnualOvertimeRecord[]): Promise<void> {
    await replaceAnnualOvertimeTransactional(records);
  }

  static async getAbsenceRecords(): Promise<AbsenceRecord[]> {
    return await db.absenceRecords.toArray();
  }

  static async saveAbsenceRecords(records: AbsenceRecord[]): Promise<void> {
    await replaceAbsenceRecordsTransactional(records);
  }

  static async getWeeklyMatrixRecords(): Promise<WeeklyMatrixRecord[]> {
    return await db.weeklyMatrixRecords.toArray();
  }

  static async saveWeeklyMatrixRecords(records: WeeklyMatrixRecord[]): Promise<void> {
    await db.transaction('rw', db.weeklyMatrixRecords, async () => {
      await db.weeklyMatrixRecords.clear();
      await db.weeklyMatrixRecords.bulkAdd(records);
    });
  }

  static async upsertWeeklyMatrixBatch(
    matrixRecords: WeeklyMatrixRecord[],
    dailyOvertimeRecords: OvertimeRecord[] = [],
    syncTime?: string
  ) {
    return await upsertWeeklyMatrixBatchTransactional(matrixRecords, dailyOvertimeRecords, syncTime);
  }

  static async getMatrizSheetsUrl(): Promise<string | null> {
    const entry = await db.dashboardConfig.get('matrizSheetsUrl');
    if (entry && typeof entry.value === 'string') {
      return entry.value;
    }
    try {
      return localStorage.getItem('pcat_matriz_sheets_url');
    } catch {
      return null;
    }
  }

  static async saveMatrizSheetsUrl(url: string): Promise<void> {
    try {
      localStorage.setItem('pcat_matriz_sheets_url', url);
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'matrizSheetsUrl',
      value: url,
      updatedAt: new Date().toISOString(),
    });
  }

  static async saveAttendanceRecords(records: AttendanceRecord[]): Promise<void> {
    await db.transaction('rw', db.attendanceRecords, async () => {
      await db.attendanceRecords.clear();
      await db.attendanceRecords.bulkAdd(records);
    });
  }

  static getDeletedDepartments(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DELETED_DEPTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // LocalStorage unavailable
    }
    return [];
  }

  static async saveDeletedDepartments(depts: string[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED_DEPTS, JSON.stringify(depts));
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'deletedDepartments',
      value: depts,
      updatedAt: new Date().toISOString(),
    });
    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static getCustomLeaderOverrides(): Record<string, Partial<DepartmentLeader>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_LEADER_OVERRIDES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // LocalStorage unavailable
    }
    return {};
  }

  static async saveCustomLeaderOverrides(
    overrides: Record<string, Partial<DepartmentLeader>>
  ): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_LEADER_OVERRIDES, JSON.stringify(overrides));
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'customLeaderOverrides',
      value: overrides,
      updatedAt: new Date().toISOString(),
    });
    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static async getDepartmentLeaders(): Promise<DepartmentLeader[]> {
    const list = await db.leaders.toArray();
    const deletedList = this.getDeletedDepartments();
    const deletedKeys = new Set(deletedList.map((d) => normalizeDeptKey(d)));
    const overrides = this.getCustomLeaderOverrides();

    // 1. Purge any legacy fake seed entries
    const fakeIds: string[] = [];
    for (const l of list) {
      const lName = (l.leaderName || '').toLowerCase().trim();
      const dKey = normalizeDeptKey(l.department);
      if (
        FAKE_LEADER_NAMES.has(lName) ||
        FAKE_DEPARTMENTS.has(dKey) ||
        dKey === 'produccion' ||
        dKey === 'mantenimiento' ||
        dKey === 'almacen'
      ) {
        fakeIds.push(l.id);
      }
    }
    if (fakeIds.length > 0) {
      await db.leaders.bulkDelete(fakeIds);
    }

    const currentList = await db.leaders.toArray();

    // If completely empty, populate with INITIAL_LEADERS (excluding any deleted)
    if (currentList.length === 0) {
      const toAdd = INITIAL_LEADERS.filter(
        (l) => !deletedKeys.has(normalizeDeptKey(l.department))
      );
      if (toAdd.length > 0) {
        await db.leaders.bulkAdd(toAdd);
      }
      return toAdd;
    }

    // Ensure all 16 initial leaders exist if they weren't deleted
    const existingDeptKeys = new Set(currentList.map((l) => normalizeDeptKey(l.department)));
    const missingInitial: DepartmentLeader[] = [];
    for (const initL of INITIAL_LEADERS) {
      const initKey = normalizeDeptKey(initL.department);
      if (!existingDeptKeys.has(initKey) && !deletedKeys.has(initKey)) {
        missingInitial.push(initL);
      }
    }
    if (missingInitial.length > 0) {
      await db.leaders.bulkAdd(missingInitial);
      currentList.push(...missingInitial);
    }

    // Filter out deleted and apply overrides
    const result: DepartmentLeader[] = [];
    for (const item of currentList) {
      const deptKey = normalizeDeptKey(item.department);
      if (deletedKeys.has(deptKey)) continue;

      const override = overrides[deptKey] || overrides[item.department];
      if (override) {
        result.push({
          ...item,
          ...override,
          department: override.department || item.department,
          leaderName: override.leaderName || item.leaderName,
          leaderPosition: override.leaderPosition || item.leaderPosition,
        });
      } else {
        result.push(item);
      }
    }

    // Include any custom department added in overrides that is not in currentList and not deleted
    for (const [key, ov] of Object.entries(overrides)) {
      const normKey = normalizeDeptKey(key);
      if (
        !deletedKeys.has(normKey) &&
        !result.some((r) => normalizeDeptKey(r.department) === normKey)
      ) {
        result.push({
          id: ov.id || `lead-custom-${normKey}`,
          company: ov.company || 'Polaquimia',
          department: ov.department || key,
          leaderName: ov.leaderName || 'Sin Líder Asignado',
          leaderPosition: ov.leaderPosition || 'Responsable de Área',
          validFrom: ov.validFrom || new Date().toISOString().slice(0, 10),
        });
      }
    }

    return result.sort((a, b) =>
      a.department.localeCompare(b.department, 'es', { sensitivity: 'base' })
    );
  }

  static async saveDepartmentLeaders(leaders: DepartmentLeader[]): Promise<void> {
    await db.transaction('rw', db.leaders, async () => {
      await db.leaders.clear();
      await db.leaders.bulkAdd(leaders);
    });
    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static async addDepartmentLeader(newLeader: DepartmentLeader): Promise<void> {
    const canonicalDept = canonicalizeDepartment(newLeader.department);
    const deptKey = normalizeDeptKey(canonicalDept);

    const leaderToAdd: DepartmentLeader = {
      ...newLeader,
      id: newLeader.id || `lead-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      department: canonicalDept,
      leaderName: newLeader.leaderName.trim(),
      leaderPosition: newLeader.leaderPosition?.trim() || 'Responsable de Área',
      company: newLeader.company?.trim() || 'Polaquimia',
      validFrom: newLeader.validFrom || new Date().toISOString().slice(0, 10),
    };

    // Remove from deletedDepartments if it was previously deleted
    const deleted = this.getDeletedDepartments();
    const updatedDeleted = deleted.filter(
      (d) => normalizeDeptKey(d) !== deptKey && normalizeDeptKey(canonicalDept) !== normalizeDeptKey(d)
    );
    await this.saveDeletedDepartments(updatedDeleted);

    // Add to customLeaderOverrides
    const overrides = this.getCustomLeaderOverrides();
    overrides[deptKey] = leaderToAdd;
    await this.saveCustomLeaderOverrides(overrides);

    // Save into Dexie db.leaders
    await db.transaction('rw', db.leaders, async () => {
      const existing = await db.leaders
        .filter((l) => normalizeDeptKey(l.department) === deptKey)
        .first();
      if (existing) {
        await db.leaders.put({ ...existing, ...leaderToAdd, id: existing.id });
      } else {
        await db.leaders.put(leaderToAdd);
      }
    });

    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static async updateDepartmentLeader(
    originalDepartment: string,
    updated: DepartmentLeader
  ): Promise<void> {
    const originalDeptKey = normalizeDeptKey(originalDepartment);
    const canonicalDept = canonicalizeDepartment(updated.department);
    const newDeptKey = normalizeDeptKey(canonicalDept);

    const leaderToSave: DepartmentLeader = {
      ...updated,
      department: canonicalDept,
      leaderName: updated.leaderName.trim(),
      leaderPosition: updated.leaderPosition?.trim() || 'Responsable de Área',
      company: updated.company?.trim() || 'Polaquimia',
      validFrom: updated.validFrom || new Date().toISOString().slice(0, 10),
    };

    // Update overrides
    const overrides = this.getCustomLeaderOverrides();
    if (originalDeptKey !== newDeptKey) {
      delete overrides[originalDeptKey];
    }
    overrides[newDeptKey] = leaderToSave;
    await this.saveCustomLeaderOverrides(overrides);

    // If department was renamed, ensure it's not in deletedDepartments
    const deleted = this.getDeletedDepartments();
    const updatedDeleted = deleted.filter((d) => normalizeDeptKey(d) !== newDeptKey);
    await this.saveDeletedDepartments(updatedDeleted);

    // Save into Dexie db.leaders
    await db.transaction('rw', db.leaders, async () => {
      const existing = await db.leaders
        .filter((l) => normalizeDeptKey(l.department) === originalDeptKey)
        .first();
      if (existing) {
        await db.leaders.delete(existing.id);
      }
      await db.leaders.put(leaderToSave);
    });

    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static async deleteDepartmentLeader(department: string): Promise<void> {
    const canonicalDept = canonicalizeDepartment(department);
    const deptKey = normalizeDeptKey(canonicalDept);

    // 1. Add to deletedDepartments
    const deleted = this.getDeletedDepartments();
    if (!deleted.some((d) => normalizeDeptKey(d) === deptKey)) {
      deleted.push(canonicalDept);
      await this.saveDeletedDepartments(deleted);
    }

    // 2. Remove from customLeaderOverrides
    const overrides = this.getCustomLeaderOverrides();
    delete overrides[deptKey];
    delete overrides[canonicalDept];
    await this.saveCustomLeaderOverrides(overrides);

    // 3. Remove from db.leaders
    await db.transaction('rw', db.leaders, async () => {
      const toDelete = await db.leaders
        .filter(
          (l) =>
            normalizeDeptKey(l.department) === deptKey ||
            normalizeDeptKey(l.department) === normalizeDeptKey(department)
        )
        .primaryKeys();
      if (toDelete.length > 0) {
        await db.leaders.bulkDelete(toDelete);
      }
    });

    await db.dashboardConfig.delete('precalculated_catalogs');
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

  static async getLastSyncTimestamp(): Promise<string | null> {
    const entry = await db.dashboardConfig.get('lastSyncTimestamp');
    if (entry && typeof entry.value === 'string') {
      return entry.value;
    }
    try {
      return localStorage.getItem('pcat_last_sync_timestamp');
    } catch {
      return null;
    }
  }

  static async saveLastSyncTimestamp(isoTimestamp: string): Promise<void> {
    try {
      localStorage.setItem('pcat_last_sync_timestamp', isoTimestamp);
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'lastSyncTimestamp',
      value: isoTimestamp,
      updatedAt: new Date().toISOString(),
    });
  }

  static async getPrecalculatedCatalogs(): Promise<PrecalculatedCatalogs | null> {
    const entry = await db.dashboardConfig.get('precalculated_catalogs');
    if (entry && entry.value) {
      return entry.value as PrecalculatedCatalogs;
    }
    return null;
  }

  static async savePrecalculatedCatalogs(catalogs: PrecalculatedCatalogs): Promise<void> {
    await db.dashboardConfig.put({
      key: 'precalculated_catalogs',
      value: catalogs,
      updatedAt: new Date().toISOString(),
    });
  }

  static async clearPrecalculatedCatalogs(): Promise<void> {
    await db.dashboardConfig.delete('precalculated_catalogs');
  }

  static async getSheetsUrl(): Promise<string | null> {
    const entry = await db.dashboardConfig.get('sheetsCsvUrl');
    if (entry && typeof entry.value === 'string') {
      return entry.value;
    }
    try {
      return localStorage.getItem('pcat_sheets_csv_url');
    } catch {
      return null;
    }
  }

  static async saveSheetsUrl(url: string): Promise<void> {
    try {
      localStorage.setItem('pcat_sheets_csv_url', url);
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'sheetsCsvUrl',
      value: url,
      updatedAt: new Date().toISOString(),
    });
  }

  static async getAbsenceSheetsUrl(): Promise<string | null> {
    const entry = await db.dashboardConfig.get('absenceSheetsCsvUrl');
    if (entry && typeof entry.value === 'string') {
      return entry.value;
    }
    try {
      return localStorage.getItem('pcat_absence_sheets_csv_url');
    } catch {
      return null;
    }
  }

  static async saveAbsenceSheetsUrl(url: string): Promise<void> {
    try {
      localStorage.setItem('pcat_absence_sheets_csv_url', url);
    } catch {
      // LocalStorage unavailable
    }
    await db.dashboardConfig.put({
      key: 'absenceSheetsCsvUrl',
      value: url,
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
   * Upserts remote cloud overtime records and maintains a single fixed CLOUD_BATCH_ID history entry
   */
  static async upsertCloudOvertimeBatch(
    incoming: OvertimeRecord[],
    syncTime?: string
  ): Promise<{
    newCount: number;
    updatedCount: number;
    ignoredCount: number;
    batchItem: ImportHistoryItem;
  }> {
    return await upsertCloudOvertimeBatchTransactional(incoming, syncTime);
  }

  /**
   * Deduplicates legacy Google Sheets cloud batches, keeping only the latest under CLOUD_BATCH_ID
   */
  static async sanitizeCloudImportBatches(): Promise<void> {
    await sanitizeCloudImportBatches();
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
      db.annualOvertimeRecords.clear(),
      db.absenceRecords.clear(),
      db.weeklyMatrixRecords.clear(),
      db.auditIncidents.clear(),
      db.importBatches.clear(),
      db.changeLog.clear(),
      db.dashboardConfig.delete('precalculated_catalogs'),
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
