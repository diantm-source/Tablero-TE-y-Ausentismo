import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseOvertimeWorksheet,
  parseAttendanceWorksheet,
} from './excelParser';
import { OFFICIAL_REASONS_CATALOG } from './db';

describe('ExcelJS BioTime Parser Engine', () => {
  it('parses overtime worksheet with institutional headers at row 1-2 and table at row 3', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Tiempo Extra');

    ws.addRow(['GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.']);
    ws.addRow(['REPORTE OFICIAL BIOTIME - TIEMPO EXTRA']);
    ws.addRow([
      'ID de Empleado',
      'Nombre Completo',
      'Empresa',
      'Departamento',
      'Líder',
      'Fecha Inicio',
      'Hora Inicio',
      'Fecha Fin',
      'Hora Fin',
      'Horas Solicitadas',
      'Horas Aprobadas',
      'Estado',
      'Motivo',
    ]);
    ws.addRow([
      '1042',
      'Carlos Hernández',
      'Polaquimia',
      'Producción',
      'Ing. Roberto Saldaña',
      '2024-10-14',
      '14:00',
      '2024-10-14',
      '18:00',
      4,
      4,
      'APROBADO',
      'Auditoría - Externa ISO 9001',
    ]);

    const result = parseOvertimeWorksheet(ws, 'test_ot.xlsx', OFFICIAL_REASONS_CATALOG);

    expect(result.fileType).toBe('overtime');
    expect(result.detectedHeaderRow).toBe(3);
    expect(result.records.length).toBe(1);

    const record = result.records[0];
    expect(record.employeeId).toBe('1042');
    expect(record.company).toBe('Polaquimia');
    expect(record.requestedHours).toBe(4);
    expect(record.approvedHours).toBe(4);
    expect(record.status).toBe('APROBADO');
    expect(record.reasonClassification).toBe('CORRECTO');
    expect(record.isoWeek).toBe(42);
    expect(record.isoYear).toBe(2024);
  });

  it('correctly extracts work date from Hora Inicio datetime (31/08/2026 18:00:00) into Week 36', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Tiempo Extra');

    ws.addRow([
      'ID de Empleado',
      'Nombre',
      'Departamento',
      'Hora Inicio',
      'Hora Fin',
      'Horas de Tiempo Extra',
      'Estado',
      'Motivo',
    ]);
    ws.addRow([
      '50123',
      'Juan Pérez',
      'Mantenimiento',
      '31/08/2026 18:00:00',
      '31/08/2026 22:00:00',
      '04:00',
      'APROBADO',
      'Auditoría - Externa ISO 9001',
    ]);

    const result = parseOvertimeWorksheet(ws, 'ot_biotime.xlsx', OFFICIAL_REASONS_CATALOG);
    expect(result.records.length).toBe(1);
    const rec = result.records[0];
    expect(rec.startDate).toBe('2026-08-31');
    expect(rec.startTime).toBe('18:00:00');
    expect(rec.endTime).toBe('22:00:00');
    expect(rec.requestedHours).toBe(4);
    expect(rec.approvedHours).toBe(4);
    expect(rec.isoWeek).toBe(36);
    expect(rec.isoYear).toBe(2026);
  });

  it('prioritizes actual overtime work date over Fecha de Solicitud (Week 38 vs Week 43)', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Tiempo Extra');

    ws.addRow([
      'ID de Empleado',
      'Nombre',
      'Departamento',
      'Fecha de Solicitud',
      'Hora Inicio',
      'Hora Fin',
      'Horas',
      'Estado',
      'Motivo',
    ]);
    ws.addRow([
      '50124',
      'María López',
      'Calidad',
      '20/10/2026', // Fecha de solicitud en BioTime (Week 43)
      '14/09/2026 08:00:00', // Fecha real laborada (Week 38)
      '14/09/2026 12:00:00',
      '4',
      'AUTORIZADO',
      'Auditoría - Externa ISO 9001',
    ]);

    const result = parseOvertimeWorksheet(ws, 'ot_with_solicitud.xlsx', OFFICIAL_REASONS_CATALOG);
    expect(result.records.length).toBe(1);
    const rec = result.records[0];
    expect(rec.startDate).toBe('2026-09-14');
    expect(rec.requestDate).toBe('2026-10-20');
    expect(rec.isoWeek).toBe(38);
    expect(rec.isoYear).toBe(2026);
  });

  it('parses attendance worksheet detecting absences and schedule eligibility', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Asistencia');

    ws.addRow(['GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.']);
    ws.addRow(['REPORTE OFICIAL ASISTENCIA']);
    ws.addRow([
      'ID de Empleado',
      'Nombre Completo',
      'Empresa',
      'Apodo',
      'Departamento',
      'Líder',
      'Fecha',
      'Horario',
      'Excepción',
      'Hora de Entrada',
      'Hora de Salida',
      'Entrada',
      'Salida',
    ]);
    ws.addRow([
      '1055',
      'Juan Martínez',
      'Polaquimia',
      'Planta Operativa',
      'Mantenimiento',
      'Ing. Sofía Morales',
      '2024-10-14',
      '2',
      '',
      '15:00:00',
      '23:00:00',
      '',
      '',
    ]);

    const result = parseAttendanceWorksheet(ws, 'test_att.xlsx');

    expect(result.fileType).toBe('attendance');
    expect(result.detectedHeaderRow).toBe(3);
    expect(result.records.length).toBe(1);

    const record = result.records[0];
    expect(record.employeeId).toBe('1055');
    expect(record.schedule).toBe('2');
    expect(record.isScheduleEligible).toBe(true);
    expect(record.absenceStatus).toBe('AUSENCIA_CONFIRMADA');
    expect(record.isSyndicated).toBe(true);
    expect(record.isoWeek).toBe(42);
  });
});
