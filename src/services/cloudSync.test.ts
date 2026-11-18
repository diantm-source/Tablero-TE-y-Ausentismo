import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  CLOUD_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  DEFAULT_ABSENCE_SHEETS_CSV_URL,
  getEffectiveAbsenceCloudSyncUrl,
  normalizeSheetsUrl,
  parseCSVToAbsenceRecords,
  parseCSVToAnnualOvertimeRecords,
  parseCSVToOvertimeRecords,
  formatSyncTimestampDisplay,
  syncRemoteAbsences,
  syncRemoteAll,
  syncRemoteOvertime,
} from './cloudSync';
import { db, OFFICIAL_REASONS_CATALOG } from './db';
import { AppStorage } from './storage';

describe('cloudSync Service', () => {
  describe('normalizeSheetsUrl', () => {
    it('converts /pubhtml link to /pub?output=csv', () => {
      const pubhtml = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQB-L3Tzyt1IA9t8Ifmjp4z1QVSIvkToguAcoTipw0SZ-WaZp2g5c3dCyWxQQKB95mFQQPYkrRFlrm3/pubhtml';
      const expected = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQB-L3Tzyt1IA9t8Ifmjp4z1QVSIvkToguAcoTipw0SZ-WaZp2g5c3dCyWxQQKB95mFQQPYkrRFlrm3/pub?output=csv';
      expect(normalizeSheetsUrl(pubhtml)).toBe(expected);
    });

    it('converts /pubhtml with query parameters (e.g. gid) to /pub?gid=...&output=csv', () => {
      const pubhtmlWithGid = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vXXX/pubhtml?gid=123456';
      const normalized = normalizeSheetsUrl(pubhtmlWithGid);
      expect(normalized).toContain('/pub?');
      expect(normalized).toContain('gid=123456');
      expect(normalized).toContain('output=csv');
    });

    it('converts standard Google Sheet edit link to /export?format=csv', () => {
      const editUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
      const expected = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv';
      expect(normalizeSheetsUrl(editUrl)).toBe(expected);
    });

    it('keeps already formatted CSV URLs unchanged', () => {
      const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vXXX/pub?output=csv';
      expect(normalizeSheetsUrl(csvUrl)).toBe(csvUrl);
    });

    it('converts /pub?output=xlsx link to /pub?output=csv', () => {
      const xlsxUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSz2h1JxZc13egzLq27hSaPQHeEwRyyeYfcQjgNXXkCun2YYrqv319wa4SDhDo3xF_q0rNl-Vvqxb6C/pub?output=xlsx';
      const expected = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSz2h1JxZc13egzLq27hSaPQHeEwRyyeYfcQjgNXXkCun2YYrqv319wa4SDhDo3xF_q0rNl-Vvqxb6C/pub?output=csv';
      expect(normalizeSheetsUrl(xlsxUrl)).toBe(expected);
    });
  });

  describe('formatSyncTimestampDisplay', () => {
    it('formats ISO timestamps to DD/MM/AAAA HH:mm', () => {
      const iso = '2026-10-14T15:30:00.000Z';
      const formatted = formatSyncTimestampDisplay(iso);
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    });

    it('returns "Sin sincronizar" when timestamp is null or empty', () => {
      expect(formatSyncTimestampDisplay(null)).toBe('Sin sincronizar');
      expect(formatSyncTimestampDisplay('')).toBe('Sin sincronizar');
    });
  });

  describe('parseCSVToOvertimeRecords', () => {
    it('parses BioTime formatted CSV content with header and data rows', () => {
      const csvContent = [
        'ID del Empleado,Nombre,Apellido,Departamento,Hora de Inicio de T.E.,Hora de Fin de T.E.,Estado de aprobación,Motivo',
        '1042,Carlos,Hernández,Producción,2026-10-14 14:00:00,2026-10-14 18:00:00,Aprobado,Mantenimiento correctivo bomba reactor 4',
        '1055,Juan,Martínez,Mantenimiento,2026-10-14 22:00:00,2026-10-15 04:00:00,Pendiente,Atención de fuga',
      ].join('\n');

      const records = parseCSVToOvertimeRecords(csvContent, 'test.csv', OFFICIAL_REASONS_CATALOG);
      expect(records.length).toBe(2);

      const r1 = records[0];
      expect(r1.employeeId).toBe('1042');
      expect(r1.employeeName).toBe('Carlos Hernández');
      expect(r1.firstName).toBe('Carlos');
      expect(r1.lastName).toBe('Hernández');
      expect(r1.department).toBe('Producción');
      expect(r1.startDate).toBe('2026-10-14');
      expect(r1.startTime).toBe('14:00:00');
      expect(r1.requestedHours).toBe(4);
      expect(r1.approvedHours).toBe(4);
      expect(r1.pendingHours).toBe(0);
      expect(r1.status).toBe('APROBADO');

      const r2 = records[1];
      expect(r2.employeeId).toBe('1055');
      expect(r2.requestedHours).toBe(6);
      expect(r2.status).toBe('PENDIENTE');
      expect(r2.pendingHours).toBe(6);
      expect(r2.approvedHours).toBe(0);
    });

    it('detects header row even with preceding title rows', () => {
      const csvContent = [
        'GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.',
        'REPORTE OFICIAL BIOTIME TIEMPO EXTRA',
        'ID del Empleado,Nombre,Apellido,Departamento,Hora de Inicio de T.E.,Hora de Fin de T.E.,Estado de aprobación,Motivo',
        '2014,Laura,Ramírez,Control de Calidad,2026-10-16 17:00:00,2026-10-16 20:00:00,Aprobado,Auditoría - Externa ISO 9001',
      ].join('\n');

      const records = parseCSVToOvertimeRecords(csvContent, 'test.csv', OFFICIAL_REASONS_CATALOG);
      expect(records.length).toBe(1);
      expect(records[0].employeeId).toBe('2014');
      expect(records[0].employeeName).toBe('Laura Ramírez');
      expect(records[0].requestedHours).toBe(3);
      expect(records[0].status).toBe('APROBADO');
      expect(records[0].reasonClassification).toBe('CORRECTO');
    });

    it('splits full name when apellido column is not separated', () => {
      const csvContent = [
        'ID de Empleado,Nombre Completo,Departamento,Hora Inicio,Hora Fin,Estado',
        '3099,Miguel Ángel López Ramírez,Almacén,2026-10-15 16:00:00,2026-10-15 19:30:00,Aprobado',
      ].join('\n');

      const records = parseCSVToOvertimeRecords(csvContent, 'test.csv', OFFICIAL_REASONS_CATALOG);
      expect(records.length).toBe(1);
      expect(records[0].employeeId).toBe('3099');
      expect(records[0].firstName).toBe('Miguel Ángel');
      expect(records[0].lastName).toBe('López Ramírez');
      expect(records[0].employeeName).toBe('Miguel Ángel López Ramírez');
      expect(records[0].requestedHours).toBe(3.5);
    });
  });

  describe('syncRemoteOvertime fixed CLOUD_BATCH_ID upsert', () => {
    beforeEach(async () => {
      await db.overtimeRecords.clear();
      await db.importBatches.clear();
      await db.changeLog.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('updates the single CLOUD_BATCH_ID entry across repeated syncs instead of adding new rows', async () => {
      const csvV1 = [
        'ID del Empleado,Nombre,Apellido,Departamento,Hora de Inicio de T.E.,Hora de Fin de T.E.,Estado de aprobación,Motivo',
        '1042,Carlos,Hernández,Producción,2026-10-14 14:00:00,2026-10-14 18:00:00,Pendiente,Auditoría - Externa ISO 9001',
      ].join('\n');

      const csvV2 = [
        'ID del Empleado,Nombre,Apellido,Departamento,Hora de Inicio de T.E.,Hora de Fin de T.E.,Estado de aprobación,Motivo',
        '1042,Carlos,Hernández,Producción,2026-10-14 14:00:00,2026-10-14 18:00:00,Aprobado,Auditoría - Externa ISO 9001',
      ].join('\n');

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: async () => csvV1,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => csvV2,
        } as Response);

      const sync1 = await syncRemoteOvertime('https://example.com/sheet.csv', OFFICIAL_REASONS_CATALOG);
      expect(sync1.newCount).toBe(1);

      let history = await AppStorage.getImportHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(CLOUD_BATCH_ID);
      expect(history[0].batchId).toBe(CLOUD_BATCH_ID);
      expect(history[0].fileName).toBe(CLOUD_BATCH_SOURCE);
      expect(history[0].newRecords).toBe(1);
      expect(history[0].updatedRecords).toBe(0);
      const firstImportedAt = history[0].importedAt;

      await new Promise((r) => setTimeout(r, 10));

      const sync2 = await syncRemoteOvertime('https://example.com/sheet.csv', OFFICIAL_REASONS_CATALOG);
      expect(sync2.newCount).toBe(0);
      expect(sync2.updatedCount).toBe(1);

      history = await AppStorage.getImportHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(CLOUD_BATCH_ID);
      expect(history[0].batchId).toBe(CLOUD_BATCH_ID);
      expect(history[0].importedAt).not.toBe(firstImportedAt);
      expect(history[0].newRecords).toBe(0);
      expect(history[0].updatedRecords).toBe(1);
      expect(history[0].dateRangeCovered).toBe('2026-10-14 a 2026-10-14');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseCSVToAnnualOvertimeRecords & syncRemoteAll', () => {
    beforeEach(async () => {
      await db.annualOvertimeRecords.clear();
      await db.overtimeRecords.clear();
      await db.importBatches.clear();
      await db.changeLog.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('parses Concentrado Anual CSV columns accurately', () => {
      const csvContent = [
        'Fecha,ID,Nombre del empleado,Departamento,Tipo de TE,Horas,Importe,Semana,Mes Numero,Mes letra,Líder de área',
        '2026-10-22,1042,Carlos Hernández,Producción,Normal,4.0,"$1,250.50",43,10,Octubre,Ing. Roberto Saldaña',
        '25/10/2026,1055,Juan Martínez,Mantenimiento,Fin de Semana,6.5,$2400.00,W43,10,Octubre,Ing. Sofía Morales',
      ].join('\n');

      const records = parseCSVToAnnualOvertimeRecords(csvContent);
      expect(records.length).toBe(2);

      const r1 = records[0];
      expect(r1.fecha).toBe('2026-10-22');
      expect(r1.fechaDisplay).toBe('22/10/2026');
      expect(r1.employeeId).toBe('1042');
      expect(r1.employeeName).toBe('Carlos Hernández');
      expect(r1.department).toBe('Producción');
      expect(r1.overtimeType).toBe('Normal');
      expect(r1.hours).toBe(4);
      expect(r1.amount).toBe(1250.5);
      expect(r1.week).toBe('W43');
      expect(r1.weekNumber).toBe(43);
      expect(r1.monthNumber).toBe(10);
      expect(r1.monthName).toBe('Octubre');
      expect(r1.leader).toBe('Ing. Roberto Saldaña');

      const r2 = records[1];
      expect(r2.fecha).toBe('2026-10-25');
      expect(r2.fechaDisplay).toBe('25/10/2026');
      expect(r2.overtimeType).toBe('Fin de Semana');
      expect(r2.hours).toBe(6.5);
      expect(r2.amount).toBe(2400);
      expect(r2.week).toBe('W43');
    });

    it('syncRemoteAll fetches once and persists annualOvertimeRecords in IndexedDB', async () => {
      const csvAnnual = [
        'Fecha,ID,Nombre del empleado,Departamento,Tipo de TE,Horas,Importe,Semana,Mes Numero,Mes letra,Líder de área',
        '2026-10-22,1042,Carlos Hernández,Producción,Normal,4,"$1,250.50",43,10,Octubre,Ing. Roberto Saldaña',
      ].join('\n');

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => csvAnnual,
      } as Response);

      const result = await syncRemoteAll('https://example.com/annual.csv', OFFICIAL_REASONS_CATALOG);
      expect(result.annualRecords.length).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const storedAnnual = await AppStorage.getAnnualOvertimeRecords();
      expect(storedAnnual.length).toBe(1);
      expect(storedAnnual[0].amount).toBe(1250.5);
    });
  });

  describe('parseCSVToAbsenceRecords & syncRemoteAbsences', () => {
    beforeEach(async () => {
      await db.absenceRecords.clear();
      await db.dashboardConfig.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('resolves Ausentismo Sheets URL converting /pubhtml to /pub?output=csv', () => {
      const pubhtml =
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQBrwUDfzZ94wGnudb02K1U2ZRZSeJlCVlabUQRoAfE4p6Y4hnreTwYgIc7oKKtNIX64HJPyLkpxujg/pubhtml';
      expect(getEffectiveAbsenceCloudSyncUrl(pubhtml)).toBe(DEFAULT_ABSENCE_SHEETS_CSV_URL);
      expect(DEFAULT_ABSENCE_SHEETS_CSV_URL).toContain('/pub?output=csv');
    });

    it('parses all 12 Concentrado de Ausencias CSV columns accurately without colliding Tipo de ausentismo and Tipo Ausentismo', () => {
      const csvContent = [
        'ID,Nombre,Puesto,Departamento,Tipo de ausentismo,Tipo Ausentismo,Ausencias,Importe,Fecha inicial,Fecha final,Semana,Líder de área',
        '1042,Carlos Hernández,Operador A,Producción,FALTA INJUSTIFICADA,Sin Goce,2,"$1,450.75",05/10/2026,06/10/2026,W41,Ing. Roberto Saldaña',
        '1055,Juan Martínez,Técnico,Mantenimiento,INCAPACIDAD,IMSS,3,$0.00,2026-10-12,2026-10-14,42,Ing. Sofía Morales',
      ].join('\n');

      const records = parseCSVToAbsenceRecords(csvContent);
      expect(records.length).toBe(2);

      const r1 = records[0];
      expect(r1.employeeId).toBe('1042');
      expect(r1.employeeName).toBe('Carlos Hernández');
      expect(r1.position).toBe('Operador A');
      expect(r1.department).toBe('Producción');
      expect(r1.absenceType).toBe('FALTA INJUSTIFICADA');
      expect(r1.absenceCategory).toBe('Sin Goce');
      expect(r1.absences).toBe(2);
      expect(r1.amount).toBe(1450.75);
      expect(r1.startDate).toBe('2026-10-05');
      expect(r1.startDateDisplay).toBe('05/10/2026');
      expect(r1.endDate).toBe('2026-10-06');
      expect(r1.endDateDisplay).toBe('06/10/2026');
      expect(r1.week).toBe('W41');
      expect(r1.weekNumber).toBe(41);
      expect(r1.leader).toBe('Ing. Roberto Saldaña');

      const r2 = records[1];
      expect(r2.employeeId).toBe('1055');
      expect(r2.absenceType).toBe('INCAPACIDAD');
      expect(r2.absenceCategory).toBe('IMSS');
      expect(r2.absences).toBe(3);
      expect(r2.amount).toBe(0);
      expect(r2.week).toBe('W42');
    });

    it('syncRemoteAbsences fetches and persists absenceRecords in IndexedDB', async () => {
      const csvAbsences = [
        'ID,Nombre,Puesto,Departamento,Tipo de ausentismo,Tipo Ausentismo,Ausencias,Importe,Fecha inicial,Fecha final,Semana,Líder de área',
        '1042,Carlos Hernández,Operador A,Producción,FALTA INJUSTIFICADA,Sin Goce,1,"$725.00",10/10/2026,10/10/2026,W41,Ing. Roberto Saldaña',
      ].join('\n');

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => csvAbsences,
      } as Response);

      const result = await syncRemoteAbsences('https://example.com/absences.csv');
      expect(result.absenceRecords.length).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const storedAbsences = await AppStorage.getAbsenceRecords();
      expect(storedAbsences.length).toBe(1);
      expect(storedAbsences[0].absenceType).toBe('FALTA INJUSTIFICADA');
      expect(storedAbsences[0].amount).toBe(725);
    });
  });
});

