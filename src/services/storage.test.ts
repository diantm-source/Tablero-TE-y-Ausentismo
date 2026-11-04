import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, upsertOvertimeTransactional, upsertAttendanceTransactional, createCompleteBackup, restoreCompleteBackup } from './db';
import { OvertimeRecord, AttendanceRecord } from '../types';

describe('Dexie.js IndexedDB Enterprise Storage & Anti-Duplicates', () => {
  beforeEach(async () => {
    await db.overtimeRecords.clear();
    await db.attendanceRecords.clear();
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
});
