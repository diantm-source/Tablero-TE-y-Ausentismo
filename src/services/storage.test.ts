import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  CLOUD_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  upsertOvertimeTransactional,
  upsertCloudOvertimeBatchTransactional,
  sanitizeCloudImportBatches,
  createCompleteBackup,
  restoreCompleteBackup,
} from './db';
import { OvertimeRecord, ImportHistoryItem } from '../types';

describe('Dexie.js IndexedDB Enterprise Storage & Anti-Duplicates', () => {
  beforeEach(async () => {
    await db.overtimeRecords.clear();
    await db.attendanceRecords.clear();
    await db.importBatches.clear();
    await db.changeLog.clear();
  });

  it('performs idempotent upsert of overtime records and avoids duplicates', async () => {
    const record: OvertimeRecord = {
      id: 'polaquimia_1042_2024-10-14_14:00_18:00',
      employeeId: '1042',
      employeeName: 'Carlos Hernández',
      company: 'Polaquimia',
      department: 'Producción',
      leader: 'Ing. Roberto Saldaña',
      startDate: '2024-10-14',
      startTime: '14:00',
      endDate: '2024-10-14',
      endTime: '18:00',
      requestedHours: 4,
      approvedHours: 0,
      pendingHours: 4,
      status: 'PENDIENTE',
      reason: 'Auditoría - Externa ISO 9001',
      reasonClassification: 'CORRECTO',
      reviewFormatStatus: 'CORRECTO',
      isoYear: 2024,
      isoWeek: 42,
      dateOnly: '2024-10-14',
      updatedAt: new Date().toISOString(),
    };

    // 1st insertion: should create 1 new record
    const res1 = await upsertOvertimeTransactional([record], 'batch-1');
    expect(res1.newCount).toBe(1);
    expect(res1.updatedCount).toBe(0);
    expect(res1.ignoredCount).toBe(0);

    const stored1 = await db.overtimeRecords.toArray();
    expect(stored1.length).toBe(1);
    expect(stored1[0].status).toBe('PENDIENTE');

    // 2nd insertion with exact same data: should be ignored (no duplicates)
    const res2 = await upsertOvertimeTransactional([record], 'batch-2');
    expect(res2.newCount).toBe(0);
    expect(res2.updatedCount).toBe(0);
    expect(res2.ignoredCount).toBe(1);

    const stored2 = await db.overtimeRecords.toArray();
    expect(stored2.length).toBe(1);

    // 3rd insertion with changed status: should update the record and log to changeLog
    const updatedRecord: OvertimeRecord = {
      ...record,
      status: 'APROBADO',
      approvedHours: 4,
      pendingHours: 0,
    };
    const res3 = await upsertOvertimeTransactional([updatedRecord], 'batch-3');
    expect(res3.newCount).toBe(0);
    expect(res3.updatedCount).toBe(1);
    expect(res3.ignoredCount).toBe(0);

    const stored3 = await db.overtimeRecords.toArray();
    expect(stored3.length).toBe(1);
    expect(stored3[0].status).toBe('APROBADO');

    // Verify changeLog recorded the update
    const logs = await db.changeLog.toArray();
    expect(logs.length).toBe(2); // 1 INSERT, 1 UPDATE
    expect(logs[1].action).toBe('UPDATE');
  });

  it('exports and restores complete backup with zero data loss', async () => {
    const record: OvertimeRecord = {
      id: 'polaquimia_1042_2024-10-14_14:00_18:00',
      employeeId: '1042',
      employeeName: 'Carlos Hernández',
      company: 'Polaquimia',
      department: 'Producción',
      leader: 'Ing. Roberto Saldaña',
      startDate: '2024-10-14',
      startTime: '14:00',
      endDate: '2024-10-14',
      endTime: '18:00',
      requestedHours: 4,
      approvedHours: 4,
      pendingHours: 0,
      status: 'APROBADO',
      reason: 'Auditoría - Externa ISO 9001',
      reasonClassification: 'CORRECTO',
      reviewFormatStatus: 'CORRECTO',
      isoYear: 2024,
      isoWeek: 42,
      dateOnly: '2024-10-14',
      updatedAt: new Date().toISOString(),
    };
    await upsertOvertimeTransactional([record], 'batch-backup');

    const backup = await createCompleteBackup();
    expect(backup.app).toBe('PANEL_CONTROL_AUSENTISMO_TE');
    expect(backup.metadata.overtimeCount).toBe(1);

    // Clear db
    await db.overtimeRecords.clear();
    expect(await db.overtimeRecords.count()).toBe(0);

    // Restore from backup
    const restoreResult = await restoreCompleteBackup(backup);
    expect(restoreResult.success).toBe(true);

    const restoredRecords = await db.overtimeRecords.toArray();
    expect(restoredRecords.length).toBe(1);
    expect(restoredRecords[0].id).toBe(record.id);
  });

  it('handles intra-batch duplicate records gracefully without changeLog ConstraintError', async () => {
    const record1: OvertimeRecord = {
      id: 'polaquimia_1042_2024-10-14_14:00_18:00',
      employeeId: '1042',
      employeeName: 'Carlos Hernández',
      company: 'Polaquimia',
      department: 'Producción',
      leader: 'Ing. Roberto Saldaña',
      startDate: '2024-10-14',
      startTime: '14:00',
      endDate: '2024-10-14',
      endTime: '18:00',
      requestedHours: 4,
      approvedHours: 0,
      pendingHours: 4,
      status: 'PENDIENTE',
      reason: 'Mantenimiento urgente',
      reasonClassification: 'CORRECTO',
      reviewFormatStatus: 'CORRECTO',
      isoYear: 2024,
      isoWeek: 42,
      dateOnly: '2024-10-14',
      updatedAt: new Date().toISOString(),
    };

    // Duplicate of record1 in the exact same incoming batch
    const duplicateRecord: OvertimeRecord = { ...record1 };

    // Batch with 10 duplicate instances of the same record
    const batch = Array(10).fill(duplicateRecord);

    const res = await upsertOvertimeTransactional(batch, 'batch-duplicates');
    expect(res.newCount).toBe(1);
    expect(res.ignoredCount).toBe(9);
    expect(res.updatedCount).toBe(0);

    const stored = await db.overtimeRecords.toArray();
    expect(stored.length).toBe(1);

    const logs = await db.changeLog.toArray();
    expect(logs.length).toBe(1);
  });

  it('upserts remote cloud batch using fixed CLOUD_BATCH_ID without creating duplicate history rows', async () => {
    const manualRecord: OvertimeRecord = {
      id: 'polaquimia_9001_2026-10-10_07:00_09:00',
      employeeId: '9001',
      employeeName: 'Ana Local',
      company: 'Polaquimia',
      department: 'Almacén',
      leader: 'Lic. Fernando Cruz',
      startDate: '2026-10-10',
      startTime: '07:00:00',
      endDate: '2026-10-10',
      endTime: '09:00:00',
      requestedHours: 2,
      approvedHours: 2,
      pendingHours: 0,
      status: 'APROBADO',
      reason: 'Inventario - Cierre anual',
      reasonClassification: 'CORRECTO',
      reviewFormatStatus: 'CORRECTO',
      isoYear: 2026,
      isoWeek: 41,
      dateOnly: '2026-10-10',
      importBatchId: 'BATCH_LOCAL_1',
      sourceFile: 'Manual.xlsx',
    };
    await db.overtimeRecords.put(manualRecord);
    await db.importBatches.put({
      id: 'BATCH_LOCAL_1',
      batchId: 'BATCH_LOCAL_1',
      fileName: 'Manual.xlsx',
      fileType: 'overtime',
      importedAt: '2026-10-10T10:00:00.000Z',
      user: 'Usuario BioTime Local',
      totalRows: 1,
      newRecords: 1,
      updatedRecords: 0,
      ignoredRecords: 0,
      rejectedRecords: 0,
      dateRangeCovered: '2026-10-10 a 2026-10-10',
      status: 'COMPLETADO',
    });

    const cloudRec1: OvertimeRecord = {
      id: 'polaquimia_1042_2026-10-14_14:00_18:00',
      employeeId: '1042',
      employeeName: 'Carlos Hernández',
      company: 'Polaquimia',
      department: 'Producción',
      leader: 'Ing. Roberto Saldaña',
      startDate: '2026-10-14',
      startTime: '14:00:00',
      endDate: '2026-10-14',
      endTime: '18:00:00',
      requestedHours: 4,
      approvedHours: 0,
      pendingHours: 4,
      status: 'PENDIENTE',
      reason: 'Auditoría - Externa ISO 9001',
      reasonClassification: 'CORRECTO',
      reviewFormatStatus: 'CORRECTO',
      isoYear: 2026,
      isoWeek: 42,
      dateOnly: '2026-10-14',
      sourceFile: 'GoogleSheets_BioTime_TE.csv',
    };

    const sync1Time = '2026-10-15T08:00:00.000Z';
    const res1 = await upsertCloudOvertimeBatchTransactional([cloudRec1], sync1Time);
    expect(res1.newCount).toBe(1);
    expect(res1.updatedCount).toBe(0);
    expect(res1.batchItem.id).toBe(CLOUD_BATCH_ID);
    expect(res1.batchItem.batchId).toBe(CLOUD_BATCH_ID);
    expect(res1.batchItem.fileName).toBe(CLOUD_BATCH_SOURCE);
    expect(res1.batchItem.importedAt).toBe(sync1Time);
    expect(res1.batchItem.dateRangeCovered).toBe('2026-10-14 a 2026-10-14');

    // Second sync: record 1 updated, record 2 added; only importedAt and metrics update on the single cloud batch
    const cloudRec1Updated: OvertimeRecord = {
      ...cloudRec1,
      status: 'APROBADO',
      approvedHours: 4,
      pendingHours: 0,
    };
    const cloudRec2: OvertimeRecord = {
      ...cloudRec1,
      id: 'polaquimia_1055_2026-10-16_18:00_20:00',
      employeeId: '1055',
      employeeName: 'Juan Martínez',
      startDate: '2026-10-16',
      endDate: '2026-10-16',
      dateOnly: '2026-10-16',
    };

    const sync2Time = '2026-10-16T09:30:00.000Z';
    const res2 = await upsertCloudOvertimeBatchTransactional([cloudRec1Updated, cloudRec2], sync2Time);
    expect(res2.newCount).toBe(1);
    expect(res2.updatedCount).toBe(1);
    expect(res2.batchItem.importedAt).toBe(sync2Time);
    expect(res2.batchItem.newRecords).toBe(1);
    expect(res2.batchItem.updatedRecords).toBe(1);
    expect(res2.batchItem.dateRangeCovered).toBe('2026-10-14 a 2026-10-16');

    const batches = await db.importBatches.toArray();
    expect(batches.length).toBe(2); // 1 local + 1 cloud
    const cloudBatches = batches.filter((b) => b.fileName === CLOUD_BATCH_SOURCE);
    expect(cloudBatches.length).toBe(1);
    expect(cloudBatches[0].id).toBe(CLOUD_BATCH_ID);
    expect(cloudBatches[0].importedAt).toBe(sync2Time);

    // Third sync: cloudRec1 removed from remote sheet; replaced dataset retains cloudRec2 + manualRecord
    const sync3Time = '2026-10-17T10:00:00.000Z';
    await upsertCloudOvertimeBatchTransactional([cloudRec2], sync3Time);
    const allRecords = await db.overtimeRecords.toArray();
    expect(allRecords.map((r) => r.id).sort()).toEqual([
      cloudRec2.id,
      manualRecord.id,
    ].sort());
  });

  it('sanitizes duplicate legacy Google Sheets cloud batches keeping only the most recent under CLOUD_BATCH_ID', async () => {
    const older: ImportHistoryItem = {
      id: 'BATCH_CLOUD_1000',
      batchId: 'BATCH_CLOUD_1000',
      fileName: CLOUD_BATCH_SOURCE,
      fileType: 'overtime',
      importedAt: '2026-10-10T08:00:00.000Z',
      user: 'Sistema',
      totalRows: 10,
      newRecords: 10,
      updatedRecords: 0,
      ignoredRecords: 0,
      rejectedRecords: 0,
      dateRangeCovered: '2026-10-01 a 2026-10-10',
      status: 'COMPLETADO',
    };
    const newer: ImportHistoryItem = {
      ...older,
      id: 'BATCH_CLOUD_2000',
      batchId: 'BATCH_CLOUD_2000',
      importedAt: '2026-10-15T12:00:00.000Z',
      totalRows: 15,
      newRecords: 5,
      ignoredRecords: 10,
      dateRangeCovered: '2026-10-01 a 2026-10-15',
    };
    const localBatch: ImportHistoryItem = {
      ...older,
      id: 'BATCH_LOCAL_999',
      batchId: 'BATCH_LOCAL_999',
      fileName: 'Reporte_Local.xlsx',
      importedAt: '2026-10-11T08:00:00.000Z',
    };

    await db.importBatches.bulkPut([older, newer, localBatch]);

    await sanitizeCloudImportBatches();

    const batches = await db.importBatches.toArray();
    expect(batches.length).toBe(2);

    const cloud = batches.find((b) => b.fileName === CLOUD_BATCH_SOURCE);
    expect(cloud).toBeDefined();
    expect(cloud?.id).toBe(CLOUD_BATCH_ID);
    expect(cloud?.batchId).toBe(CLOUD_BATCH_ID);
    expect(cloud?.importedAt).toBe('2026-10-15T12:00:00.000Z');
    expect(cloud?.totalRows).toBe(15);

    const local = batches.find((b) => b.batchId === 'BATCH_LOCAL_999');
    expect(local).toBeDefined();
  });
});
