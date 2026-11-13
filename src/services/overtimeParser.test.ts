import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseOvertimeExcel,
  calculateDurationHours,
  getISOWeekInfo,
  evaluateTrafficLight,
  aggregateOvertimeData,
  NormalizedOvertimeRow,
  hasCellFillColor,
  parseWeeklyMatrixWorkbook,
  enrichMatrixWithLeaders,
  getTurnoBadgeClass,
  normalizeDeptKey,
} from './overtimeParser';

describe('Overtime Parser & Traffic Light Logic', () => {
  describe('1. Estructura del Archivo de Entrada y parseOvertimeExcel', () => {
    it('parses Excel with headers in row 3 (index 2), skipping first 2 rows', async () => {
      // Build a worksheet where row 1 and 2 are title/metadata, and row 3 has headers
      const aoa = [
        ['GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.'], // Row 1 (index 0)
        ['REPORTE OFICIAL BIOTIME - TIEMPO EXTRA'],   // Row 2 (index 1)
        [                                            // Row 3 (index 2 - Headers)
          'ID del Empleado',
          'Nombre',
          'Apellido',
          'Departamento',
          'Hora de Inicio de T.E.',
          'Hora de Fin de T.E.',
          'Estado de aprobación',
        ],
        [
          '1001',
          'Carlos',
          'Mendoza',
          'Producción',
          '2026-10-26 08:00:00',
          '2026-10-26 12:30:00',
          'Aprobado',
        ],
        [
          '1001',
          'Carlos',
          'Mendoza',
          'Producción',
          '2026-10-27 18:00:00',
          '2026-10-27 23:00:00',
          'Pendiente',
        ],
        [
          '1002',
          'Lucia',
          'Torres',
          'Calidad',
          '2026-10-26 07:00:00',
          '2026-10-26 15:00:00',
          'Aprobado',
        ],
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tiempo Extra');

      const wbBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const file = new File([wbBuf], 'reporte_te.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const parsed = await parseOvertimeExcel(file);

      expect(parsed).toHaveLength(3);

      const r1 = parsed[0];
      expect(r1.idEmpleado).toBe('1001');
      expect(r1.nombre).toBe('Carlos');
      expect(r1.apellido).toBe('Mendoza');
      expect(r1.colaborador).toBe('Carlos Mendoza');
      expect(r1.departamento).toBe('Producción');
      expect(r1.horaInicio).toBe('2026-10-26 08:00:00');
      expect(r1.horaFin).toBe('2026-10-26 12:30:00');
      expect(r1.duracionHoras).toBe(4.5);
      expect(r1.estado).toBe('Aprobado');
      expect(r1.isoYear).toBe(2026);
      expect(r1.isoWeek).toBe(44); // 2026-10-26 is Monday of week 44
      expect(r1.semanaIso).toBe('2026-W44');

      const r2 = parsed[1];
      expect(r2.duracionHoras).toBe(5);
      expect(r2.estado).toBe('Pendiente');

      const r3 = parsed[2];
      expect(r3.idEmpleado).toBe('1002');
      expect(r3.colaborador).toBe('Lucia Torres');
      expect(r3.duracionHoras).toBe(8);
      expect(r3.estado).toBe('Aprobado');
    });
  });

  describe('2. Duración de Solicitud en Horas Decimales', () => {
    it('calculates duration in decimal hours accurately', () => {
      // 08:00 to 11:30 = 3.5 hrs
      const start = new Date(2026, 9, 26, 8, 0, 0);
      const end = new Date(2026, 9, 26, 11, 30, 0);
      expect(calculateDurationHours(start, end)).toBe(3.5);
    });

    it('handles shifts crossing midnight correctly', () => {
      // 22:00 to 02:00 next day = 4.0 hrs
      const start = new Date(2026, 9, 26, 22, 0, 0);
      const end = new Date(2026, 9, 26, 2, 0, 0);
      expect(calculateDurationHours(start, end)).toBe(4);
    });
  });

  describe('3. Agrupación Temporal ISO 8601 (Lunes a Domingo)', () => {
    it('extracts ISO year and week for Monday', () => {
      // 2026-10-26 is Monday of week 44
      const d = new Date(2026, 9, 26, 8, 0, 0);
      const info = getISOWeekInfo(d);
      expect(info.isoYear).toBe(2026);
      expect(info.isoWeek).toBe(44);
      expect(info.semanaIso).toBe('2026-W44');
    });

    it('extracts ISO year and week for Sunday in the same week', () => {
      // 2026-11-01 is Sunday of week 44
      const d = new Date(2026, 10, 1, 20, 0, 0);
      const info = getISOWeekInfo(d);
      expect(info.isoYear).toBe(2026);
      expect(info.isoWeek).toBe(44);
      expect(info.semanaIso).toBe('2026-W44');
    });
  });

  describe('4. Semáforo Condicional', () => {
    it('classifies Verde when totalHoras < 7', () => {
      expect(evaluateTrafficLight(0)).toBe('VERDE');
      expect(evaluateTrafficLight(4.5)).toBe('VERDE');
      expect(evaluateTrafficLight(6.99)).toBe('VERDE');
    });

    it('classifies Amarillo when totalHoras >= 7 and <= 9', () => {
      expect(evaluateTrafficLight(7)).toBe('AMARILLO');
      expect(evaluateTrafficLight(8.25)).toBe('AMARILLO');
      expect(evaluateTrafficLight(9.0)).toBe('AMARILLO');
    });

    it('classifies Rojo when totalHoras > 9', () => {
      expect(evaluateTrafficLight(9.01)).toBe('ROJO');
      expect(evaluateTrafficLight(12)).toBe('ROJO');
      expect(evaluateTrafficLight(20.5)).toBe('ROJO');
    });
  });

  describe('5. Agregación por Empleado + Semana ISO y KPIs', () => {
    it('aggregates approved, pending and total hours, and assigns traffic light', () => {
      const records: NormalizedOvertimeRow[] = [
        // Employee 101 in week 44: 5h approved + 4.5h pending = 9.5h => ROJO
        {
          idEmpleado: '101',
          nombre: 'Juan',
          apellido: 'Pérez',
          colaborador: 'Juan Pérez',
          departamento: 'Mantenimiento',
          horaInicio: '2026-10-26 14:00:00',
          horaFin: '2026-10-26 19:00:00',
          duracionHoras: 5,
          estado: 'Aprobado',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
        {
          idEmpleado: '101',
          nombre: 'Juan',
          apellido: 'Pérez',
          colaborador: 'Juan Pérez',
          departamento: 'Mantenimiento',
          horaInicio: '2026-10-27 14:00:00',
          horaFin: '2026-10-27 18:30:00',
          duracionHoras: 4.5,
          estado: 'Pendiente',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
        // Employee 102 in week 44: 8h approved = 8h => AMARILLO (7 <= h <= 9)
        {
          idEmpleado: '102',
          nombre: 'Ana',
          apellido: 'Soto',
          colaborador: 'Ana Soto',
          departamento: 'Producción',
          horaInicio: '2026-10-28 08:00:00',
          horaFin: '2026-10-28 16:00:00',
          duracionHoras: 8,
          estado: 'Aprobado',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
        // Employee 103 in week 44: 4h approved = 4h => VERDE (< 7)
        {
          idEmpleado: '103',
          nombre: 'Pedro',
          apellido: 'Ruiz',
          colaborador: 'Pedro Ruiz',
          departamento: 'Logística',
          horaInicio: '2026-10-29 08:00:00',
          horaFin: '2026-10-29 12:00:00',
          duracionHoras: 4,
          estado: 'Aprobado',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
      ];

      const { aggregated, kpis } = aggregateOvertimeData(records);

      expect(aggregated).toHaveLength(3);

      // Juan: 5 approved + 4.5 pending = 9.5 total -> ROJO
      const juan = aggregated.find((a) => a.id === '101');
      expect(juan).toBeDefined();
      expect(juan?.horasAprobadas).toBe(5);
      expect(juan?.horasPendientes).toBe(4.5);
      expect(juan?.totalAcumulado).toBe(9.5);
      expect(juan?.semaforo).toBe('ROJO');

      // Ana: 8 approved + 0 pending = 8 total -> AMARILLO
      const ana = aggregated.find((a) => a.id === '102');
      expect(ana).toBeDefined();
      expect(ana?.horasAprobadas).toBe(8);
      expect(ana?.horasPendientes).toBe(0);
      expect(ana?.totalAcumulado).toBe(8);
      expect(ana?.semaforo).toBe('AMARILLO');

      // Pedro: 4 approved + 0 pending = 4 total -> VERDE
      const pedro = aggregated.find((a) => a.id === '103');
      expect(pedro).toBeDefined();
      expect(pedro?.horasAprobadas).toBe(4);
      expect(pedro?.horasPendientes).toBe(0);
      expect(pedro?.totalAcumulado).toBe(4);
      expect(pedro?.semaforo).toBe('VERDE');

      // KPIs
      expect(kpis.totalColaboradores).toBe(3);
      expect(kpis.rojoCount).toBe(1);
      expect(kpis.amarilloCount).toBe(1);
      expect(kpis.verdeCount).toBe(1);
      expect(kpis.totalHorasAprobadas).toBe(17);
      expect(kpis.totalHorasPendientes).toBe(4.5);
      expect(kpis.totalAcumulado).toBe(21.5);
    });

    it('adapts OvertimeRecord array from database seamlessly', () => {
      const otRecords = [
        {
          id: 'rec_1',
          employeeId: 'EMP001',
          employeeName: 'Roberto Gomez',
          company: 'Polaquimia',
          department: 'Producción',
          leader: 'Ing. Perez',
          startDate: '2026-10-26',
          startTime: '08:00',
          endDate: '2026-10-26',
          endTime: '18:00',
          requestedHours: 10,
          approvedHours: 10,
          pendingHours: 0,
          status: 'APROBADO' as const,
          reason: 'Operacional',
          reasonClassification: 'CORRECTO' as const,
          reviewFormatStatus: 'CORRECTO' as const,
          isoYear: 2026,
          isoWeek: 44,
          dateOnly: '2026-10-26',
        },
      ];

      // Test conversion logic used by useOvertimeAggregation
      const { aggregated, kpis } = aggregateOvertimeData([
        {
          idEmpleado: otRecords[0].employeeId,
          nombre: otRecords[0].employeeName,
          apellido: '',
          colaborador: otRecords[0].employeeName,
          departamento: otRecords[0].department,
          horaInicio: `${otRecords[0].startDate} ${otRecords[0].startTime}`,
          horaFin: `${otRecords[0].endDate} ${otRecords[0].endTime}`,
          duracionHoras: otRecords[0].approvedHours,
          estado: 'Aprobado',
          isoYear: otRecords[0].isoYear,
          isoWeek: otRecords[0].isoWeek,
          semanaIso: `${otRecords[0].isoYear}-W${otRecords[0].isoWeek}`,
        },
      ]);

      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].totalAcumulado).toBe(10);
      expect(aggregated[0].semaforo).toBe('ROJO'); // 10 > 9 => ROJO
    });

    it('tracks last calculated record date and shift correctly in aggregateOvertimeData', () => {
      const records: NormalizedOvertimeRow[] = [
        // Two overtime entries in week 44 for Juan: Monday 2026-10-26 and Thursday 2026-10-29
        {
          idEmpleado: '2001',
          nombre: 'Arturo',
          apellido: 'Hernández López',
          colaborador: 'Arturo Hernández López',
          departamento: 'Calderas',
          horaInicio: '2026-10-26 18:00:00',
          horaFin: '2026-10-26 22:00:00',
          duracionHoras: 4,
          estado: 'Aprobado',
          turno: 'Turno 2 (14:00 - 22:00)',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
        {
          idEmpleado: '2001',
          nombre: 'Arturo',
          apellido: 'Hernández López',
          colaborador: 'Arturo Hernández López',
          departamento: 'Calderas',
          horaInicio: '2026-10-29 19:00:00',
          horaFin: '2026-10-29 23:00:00',
          duracionHoras: 4,
          estado: 'Aprobado',
          turno: 'Turno 2 (14:00 - 22:00)',
          isoYear: 2026,
          isoWeek: 44,
          semanaIso: '2026-W44',
        },
      ];

      const { aggregated } = aggregateOvertimeData(records);
      expect(aggregated).toHaveLength(1);

      const arturo = aggregated[0];
      expect(arturo.nombre).toBe('Arturo');
      expect(arturo.apellido).toBe('Hernández López');
      expect(arturo.colaborador).toBe('Arturo Hernández López');
      expect(arturo.turno).toContain('Turno 2');
      // Latest record was on 2026-10-29
      expect(arturo.ultimoRegistroFecha).toBe('2026-10-29');
      expect(arturo.ultimoRegistroHorario).toBe('19:00 - 23:00');
      expect(arturo.ultimoRegistroHoras).toBe(4);
      expect(arturo.ultimoRegistroCompleto).toBe('2026-10-29 (19:00 - 23:00)');
    });
    it('calculates Equivalencia Horaria according to the exact company formula', () => {
      // User scenario: Juan Daniel Ochoa Pérez
      // Labora 5 días (Lunes a Viernes). Genera TE el Lunes (4 hrs) y el Jueves (8 hrs)
      // TE Nominal / Base = 12.0 hrs
      // Bono D_lab: 5 * 0.5 = 2.5 hrs
      // Equivalencia Horaria = 12.0 + 2.5 = 14.5 hrs
      const records: NormalizedOvertimeRow[] = [
        {
          idEmpleado: '70006',
          nombre: 'JUAN DANIEL',
          apellido: 'OCHOA PÉREZ',
          colaborador: 'JUAN DANIEL OCHOA PÉREZ',
          departamento: 'PRODUCCIÓN',
          horaInicio: '2026-10-12 18:00:00', // Lunes
          horaFin: '2026-10-12 22:00:00',
          duracionHoras: 4,
          estado: 'Aprobado',
          isoYear: 2026,
          isoWeek: 42,
          semanaIso: '2026-W42',
        },
        {
          idEmpleado: '70006',
          nombre: 'JUAN DANIEL',
          apellido: 'OCHOA PÉREZ',
          colaborador: 'JUAN DANIEL OCHOA PÉREZ',
          departamento: 'PRODUCCIÓN',
          horaInicio: '2026-10-15 15:00:00', // Jueves
          horaFin: '2026-10-15 23:00:00',
          duracionHoras: 8,
          estado: 'Aprobado',
          isoYear: 2026,
          isoWeek: 42,
          semanaIso: '2026-W42',
        },
      ];

      // Simulamos que el mapa de asistencia registra que laboró los 5 días (Lun, Mar, Mie, Jue, Vie)
      const attendanceWorkedDays = new Map<string, Set<string>>();
      attendanceWorkedDays.set(
        '70006__2026-W42',
        new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
      );

      const { aggregated } = aggregateOvertimeData(records, attendanceWorkedDays, 'EQUIVALENCIA');
      expect(aggregated).toHaveLength(1);

      const item = aggregated[0];
      expect(item.nombre).toBe('JUAN DANIEL');
      expect(item.apellido).toBe('OCHOA PÉREZ');
      expect(item.diasLaborados).toBe(5);
      expect(item.horasBase).toBe(12.0);
      expect(item.horasAdicionalesPorDia).toBe(2.5);
      expect(item.equivalenciaHoraria).toBe(14.5);
      expect(item.semaforoEquiv).toBe('ROJO'); // 14.5 > 9 => ROJO
    });

    it('correctly shifts traffic light when evaluating on BASE vs EQUIVALENCIA', () => {
      // Colaborador con 6.0 hrs base (VERDE) y 4 días laborados (4 * 0.5 = 2.0 hrs bono)
      // Equivalencia = 6.0 + 2.0 = 8.0 hrs (AMARILLO)
      const records: NormalizedOvertimeRow[] = [
        {
          idEmpleado: '50390',
          nombre: 'MARIO ALBERTO',
          apellido: 'LOPEZ FERNANDEZ',
          colaborador: 'MARIO ALBERTO LOPEZ FERNANDEZ',
          departamento: 'LABORATORIO',
          horaInicio: '2026-10-14 14:30:00',
          horaFin: '2026-10-14 20:30:00',
          duracionHoras: 6,
          estado: 'Aprobado',
          isSyndicated: true,
          isoYear: 2026,
          isoWeek: 42,
          semanaIso: '2026-W42',
        },
      ];

      const attendanceWorkedDays = new Map<string, Set<string>>();
      attendanceWorkedDays.set(
        '50390__2026-W42',
        new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']) // 4 días
      );

      // Evaluación por EQUIVALENCIA (default)
      const resEquiv = aggregateOvertimeData(records, attendanceWorkedDays, 'EQUIVALENCIA');
      expect(resEquiv.aggregated[0].diasLaborados).toBe(4);
      expect(resEquiv.aggregated[0].horasBase).toBe(6.0);
      expect(resEquiv.aggregated[0].horasAdicionalesPorDia).toBe(2.0);
      expect(resEquiv.aggregated[0].equivalenciaHoraria).toBe(8.0);
      expect(resEquiv.aggregated[0].semaforo).toBe('AMARILLO'); // 8.0 is between 7 and 9
      expect(resEquiv.kpis.amarilloCount).toBe(1);

      // Evaluación por BASE NOMINAL
      const resBase = aggregateOvertimeData(records, attendanceWorkedDays, 'BASE');
      expect(resBase.aggregated[0].semaforo).toBe('VERDE'); // 6.0 < 7
      expect(resBase.kpis.verdeCount).toBe(1);
    });
  });

  describe('9. hasCellFillColor & parseWeeklyMatrixWorkbook (Multi-hoja con detección de color)', () => {
    describe('hasCellFillColor', () => {
      it('returns false for undefined, null, or empty cell/style', () => {
        expect(hasCellFillColor(null)).toBe(false);
        expect(hasCellFillColor(undefined)).toBe(false);
        expect(hasCellFillColor({})).toBe(false);
        expect(hasCellFillColor({ s: {} })).toBe(false);
      });

      it('returns false when patternType is none and no colored fill', () => {
        expect(hasCellFillColor({ s: { patternType: 'none' } })).toBe(false);
      });

      it('returns false when fgColor or bgColor is white (FFFFFF)', () => {
        expect(hasCellFillColor({ s: { fgColor: { rgb: 'FFFFFF' } } })).toBe(false);
        expect(hasCellFillColor({ s: { bgColor: { rgb: 'FFFFFFFF' } } })).toBe(false);
      });

      it('returns true when patternType is solid', () => {
        expect(hasCellFillColor({ s: { patternType: 'solid' } })).toBe(true);
      });

      it('returns true when fgColor.rgb is a non-white color (e.g. gray AEABAB or yellow)', () => {
        expect(hasCellFillColor({ s: { fgColor: { rgb: 'AEABAB' } } })).toBe(true);
        expect(hasCellFillColor({ s: { fgColor: { rgb: 'FFFF00' } } })).toBe(true);
      });

      it('returns true when bgColor.rgb is non-white', () => {
        expect(hasCellFillColor({ s: { bgColor: { rgb: 'D0CECE' } } })).toBe(true);
      });

      it('returns true when theme color is specified', () => {
        expect(hasCellFillColor({ s: { fgColor: { theme: 4 } } })).toBe(true);
      });
    });

    describe('parseWeeklyMatrixWorkbook', () => {
      it('skips auxiliary sheets like Hoja1 or sheets without valid matrix headers', () => {
        const wb = XLSX.utils.book_new();
        const wsAux = XLSX.utils.aoa_to_sheet([['Notas internas'], ['Sin datos']]);
        XLSX.utils.book_append_sheet(wb, wsAux, 'Hoja1');

        const result = parseWeeklyMatrixWorkbook(wb);
        expect(result.stats.sheetCount).toBe(0);
        expect(result.records).toHaveLength(0);
      });

      it('parses valid sheet, filters Activo === 1, and splits Horas Normales vs Prolongación by color and shift rules', () => {
        const wb = XLSX.utils.book_new();

        // Build a mock matrix sheet
        // Row 0: Title with date
        // Row 1: Subtitle
        // Row 2: Headers (Col A: DEPTO, B: ACTIVO, C: CLAVE, D: NOMBRE, E: SAP, F: ign, G: ign, H: *, I..K: LUNES (38,39,40), L..N: MARTES, etc.)
        // Row 3: Turno row: 38, 39, 40 ...
        // Row 4: Employee 1 (Activo = 1)
        // Row 5: Employee 2 (Activo = 0 -> should be skipped)
        // Row 2: Headers (Col A: DEPTO, B: ACTIVO, C: CLAVE, D: NOMBRE, E: SAP, F: ign, G: ign, H: *, I..AC: 7 days * 3 shifts = 21 cols, AD: TOTAL)
        const headerRow = ['DEPTO', 'ACTIVO', 'CLAVE', 'NOMBRE', 'ID SAP', 'NV1', 'NV2', '*'];
        const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
        for (const d of days) {
          headerRow.push(d, '', '');
        }
        headerRow.push('TOTAL'); // Col AD (index 29)

        const shiftRow = ['', '', '', '', '', '', '', ''];
        for (let i = 0; i < 7; i++) {
          shiftRow.push('38', '39', '40');
        }
        shiftRow.push('');

        const rowEmp1: any[] = ['PRODUCCION', 1, '5001', 'JUAN PEREZ', 'SAP-101', '', '', ''];
        // Lunes: T1=0.5 (no color), T2=0.5 (color), T3=1.0 (no color)
        rowEmp1.push(0.5, 0.5, 1.0);
        // Martes: T1=2.0 (no color), T2='', T3=1.0 (color)
        rowEmp1.push(2.0, '', 1.0);
        // Miércoles to Domingo (5 days * 3 shifts = 15 empty cols)
        for (let i = 0; i < 15; i++) {
          rowEmp1.push('');
        }
        rowEmp1.push(5.0); // Col AD: Total = 5.0

        const rowEmp2: any[] = ['CALIDAD', 0, '5002', 'PEDRO GOMEZ', 'SAP-102', '', '', ''];
        for (let i = 0; i < 21; i++) {
          rowEmp2.push(1.0);
        }
        rowEmp2.push(21.0);

        const aoa: any[][] = [
          ['GRUPO INDUSTRIAL', 'DEL 26 AL 1 octubre DEL 2026'],
          ['MATRIZ SEMANAL DE TIEMPO EXTRA'],
          headerRow,
          shiftRow,
          rowEmp1,
          rowEmp2,
        ];

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Add cell styles:
        // Col 9 (Lunes T2): colored fill
        ws[XLSX.utils.encode_cell({ r: 4, c: 9 })].s = {
          patternType: 'solid',
          fgColor: { rgb: 'AEABAB' },
        };
        // Col 13 (Martes T3): colored fill
        ws[XLSX.utils.encode_cell({ r: 4, c: 13 })].s = {
          patternType: 'solid',
          fgColor: { rgb: 'D0CECE' },
        };

        XLSX.utils.book_append_sheet(wb, ws, '26-01');

        const result = parseWeeklyMatrixWorkbook(wb);
        expect(result.stats.sheetCount).toBe(1);
        expect(result.stats.activeEmployees).toBe(1);
        expect(result.records).toHaveLength(1);

        const rec = result.records[0];
        expect(rec.employeeId).toBe('5001');
        expect(rec.employeeName).toBe('JUAN PEREZ');
        expect(rec.department).toBe('PRODUCCION');
        expect(rec.sapId).toBe('SAP-101');
        expect(rec.week).toBe('S44');
        expect(rec.monthName).toBe('Octubre');
        expect(rec.monthNumber).toBe(10);

        // Verify breakdown:
        // Prolongación:
        // - Lunes T1: 0.5 (no color) = 0.5
        // - Lunes T3: 1.0 (no color) = 1.0
        // Total Prolongación = 1.5
        expect(rec.horasProlongacion).toBe(1.5);

        // Horas Normales:
        // - Lunes T2: 0.5 (colored) = 0.5
        // - Martes T1: 2.0 (no color, value > 0.5) = 2.0
        // - Martes T3: 1.0 (colored) = 1.0
        // Total Normales = 3.5
        expect(rec.horasNormales).toBe(3.5);

        // Total Horas:
        expect(rec.horasTotales).toBe(5.0);
        expect(rec.horasNormales + rec.horasProlongacion).toBe(rec.horasTotales);

        // Regla: Todo registro de la matriz debe ser SINDICALIZADO obligatoriamente
        expect(rec.isSyndicated).toBe(true);
        expect(rec.esSindicalizado).toBe(true);
        expect(rec.tipo).toBe('SINDICALIZADO');
        expect(rec.tipoColaborador).toBe('SINDICALIZADO');
        expect(rec.tipo).not.toBe('NO SIND.');

        // Registros diarios
        expect(result.overtimeRecords.length).toBeGreaterThan(0);
        result.overtimeRecords.forEach((daily) => {
          expect(daily.isSyndicated).toBe(true);
          expect(daily.esSindicalizado).toBe(true);
          expect(daily.tipo).toBe('SINDICALIZADO');
          expect(daily.tipoColaborador).toBe('SINDICALIZADO');
          expect(daily.tipo).not.toBe('NO SIND.');
        });

        // Verificación de Turno
        expect(rec.turno).toBe('1er Turno, 2do Turno, 3er Turno');
      });

      it('cross-references Líder de Área from Base TE (by ID and by Department)', () => {
        const wb = XLSX.utils.book_new();
        const aoa: any[][] = [
          ['CLAVE', 'NOMBRE', 'LUNES', 'MARTES'],
          ['SEMANA 44', 'PERIODO DEL 26 AL 01 DE NOVIEMBRE 2026'],
          ['DEPTO', 'ACTIVO', 'ID', 'NOMBRE', 'ID SAP', '', '', '', '38', '39', '40'],
          ['MANTENIMIENTO', 1, '7001', 'CARLOS LOPEZ', 'SAP-7001', '', '', '', 4.0, '', ''],
          ['CALIDAD', 1, '7002', 'ANA GOMEZ', 'SAP-7002', '', '', '', '', 3.5, ''],
        ];

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, '26-01');

        const baseTe = [
          { employeeId: '7001', department: 'MANTENIMIENTO', leader: 'Ing. Fernando Ruiz' },
          { employeeId: '9999', department: 'CALIDAD', leader: 'Lic. Patricia Vega' }, // Matching by Department fallback
        ];

        const result = parseWeeklyMatrixWorkbook(wb, undefined, baseTe);
        expect(result.records).toHaveLength(2);

        // 7001 matched by employeeId
        expect(result.records[0].leader).toBe('Ing. Fernando Ruiz');
        expect(result.records[0].liderArea).toBe('Ing. Fernando Ruiz');
        expect(result.records[0].turno).toBe('1er Turno');

        // 7002 matched by department fallback
        expect(result.records[1].leader).toBe('Lic. Patricia Vega');
        expect(result.records[1].liderArea).toBe('Lic. Patricia Vega');
        expect(result.records[1].turno).toBe('2do Turno');
      });

      it('enrichMatrixWithLeaders successfully enriches existing matrix records with leaders', () => {
        const matrixRecords = [
          { employeeId: '1001', department: 'ALMACEN', leader: 'ALMACEN' },
          { employeeId: '1002', department: 'LOGISTICA', leader: 'LOGISTICA' },
        ];
        const baseTe = [
          { employeeId: '1001', department: 'ALMACEN', leader: 'Ing. Alberto Garza' },
          { employeeId: '9999', department: 'LOGISTICA', leader: 'Lic. Monica Treviño' },
        ];

        const enriched = enrichMatrixWithLeaders(matrixRecords, baseTe);
        expect(enriched[0].leader).toBe('Ing. Alberto Garza');
        expect(enriched[0].liderArea).toBe('Ing. Alberto Garza');
        expect(enriched[1].leader).toBe('Lic. Monica Treviño');
        expect(enriched[1].liderArea).toBe('Lic. Monica Treviño');
      });

      it('getTurnoBadgeClass returns appropriate styling for each shift', () => {
        expect(getTurnoBadgeClass('1er Turno')).toContain('amber');
        expect(getTurnoBadgeClass('2do Turno')).toContain('blue');
        expect(getTurnoBadgeClass('3er Turno')).toContain('purple');
        expect(getTurnoBadgeClass('1er Turno, 2do Turno')).toContain('teal');
        expect(getTurnoBadgeClass('Sin Turno')).toContain('slate');
      });

      describe('Normalización Inteligente de Departamentos y Parseo Robusto de la Matriz', () => {
        it('normalizes department keys correctly with normalizeDeptKey', () => {
          expect(normalizeDeptKey('GENERADOR VAPOR(CALDE')).toBe(normalizeDeptKey('GENERADORVAPOR(CALDE'));
          expect(normalizeDeptKey('GENERADOR VAPOR(CALDE')).toBe('GENERADORVAPORCALDE');
          expect(normalizeDeptKey('MANTENIMIENTO TLAX PQ')).toBe(normalizeDeptKey('MANTENIMIENTO TLAXPQ'));
          expect(normalizeDeptKey('MANTENIMIENTO TLAX PQ')).toBe('MANTENIMIENTOTLAXPQ');
          expect(normalizeDeptKey('PRODUCCIÓN (PLANTA 1)')).toBe('PRODUCCIONPLANTA1');
          expect(normalizeDeptKey('')).toBe('');
          expect(normalizeDeptKey(null)).toBe('');
          expect(normalizeDeptKey(undefined)).toBe('');
        });

        it('reads hidden rows from visual autofilter (!rows), handles regional comma decimals and administrative text in Semana 45', () => {
          const wb = XLSX.utils.book_new();

          const headerRow = ['DEPTO', 'ACTIVO', 'CLAVE', 'NOMBRE', 'ID SAP', 'NV1', 'NV2', '*'];
          const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
          for (const d of days) {
            headerRow.push(d, '', '');
          }
          headerRow.push('TOTAL'); // Col AD (index 29)

          const shiftRow = ['', '', '', '', '', '', '', ''];
          for (let i = 0; i < 7; i++) {
            shiftRow.push('38', '39', '40');
          }
          shiftRow.push('');

          // Empleado 1: 70006 - OCHOA TEGOMEX JUAN MANUEL (7.0 hrs totales)
          // Departamento en matriz: GENERADORVAPOR(CALDE (sin espacio)
          // Contiene coma decimal: "0,5" y "5,5" y textos administrativos: "vacaciones", "db7pg2"
          const rowEmp1: any[] = ['GENERADORVAPOR(CALDE', 1, '70006', 'OCHOA TEGOMEX JUAN MANUEL', 'SAP-70006', '', '', ''];
          // Lunes: T1="0,5" (prolongación), T2="vacaciones" (texto admin ignorado), T3="db7pg2" (texto admin ignorado)
          rowEmp1.push('0,5', 'vacaciones', 'db7pg2');
          // Martes: T1="5,5" (color = TE normal 5.5 hrs), T2="", T3="1,0" (prolongación 1.0 hr)
          // Total de horas numéricas = 0.5 + 5.5 + 1.0 = 7.0 hrs
          rowEmp1.push('5,5', '', '1,0');
          // Miércoles a Domingo (15 celdas vacías o con textos admin)
          rowEmp1.push('sindicato', 'd', 'pagado'); // Miércoles (todos ignorados)
          rowEmp1.push('pg2', 'pg1', 'por 7 nov'); // Jueves (todos ignorados)
          rowEmp1.push('dby pg1', 'db turno', 'rev led'); // Viernes (todos ignorados)
          rowEmp1.push('por2', 'db2nov', ''); // Sábado (todos ignorados)
          rowEmp1.push('', '', ''); // Domingo
          rowEmp1.push('7,0'); // Col AD Total

          // Empleado 2: 70016 - SANCHEZ FERNANDEZ ARTURO (13.0 hrs totales)
          // Esta fila estará oculta por un Autofiltro visual simulado (ws['!rows'][5] = { hidden: true })
          const rowEmp2: any[] = ['GENERADORVAPOR(CALDE', 1, '70016', 'SANCHEZ FERNANDEZ ARTURO', 'SAP-70016', '', '', ''];
          // Lunes: T1=4.0 (color = TE normal), T2=4.0 (color = TE normal), T3=""
          rowEmp2.push(4.0, 4.0, '');
          // Martes: T1=5.0 (color = TE normal), T2="", T3=""
          // Total = 4.0 + 4.0 + 5.0 = 13.0 hrs
          rowEmp2.push(5.0, '', '');
          for (let i = 0; i < 15; i++) {
            rowEmp2.push('');
          }
          rowEmp2.push(13.0);

          const aoa: any[][] = [
            ['GRUPO INDUSTRIAL', 'DEL 02 AL 08 DE NOVIEMBRE 2026'],
            ['MATRIZ SEMANAL DE TIEMPO EXTRA - SEMANA 45'],
            headerRow,
            shiftRow,
            rowEmp1,
            rowEmp2,
          ];

          const ws = XLSX.utils.aoa_to_sheet(aoa);

          // Simular estilos de color para celdas de TE Normal
          // Row 4 (rowEmp1), Martes T1 (col 11): 5.5 hrs TE normal con color
          ws[XLSX.utils.encode_cell({ r: 4, c: 11 })].s = {
            patternType: 'solid',
            fgColor: { rgb: 'AEABAB' },
          };
          // Row 5 (rowEmp2), Lunes T1 (col 8): 4.0 hrs TE normal con color
          ws[XLSX.utils.encode_cell({ r: 5, c: 8 })].s = {
            patternType: 'solid',
            fgColor: { rgb: 'AEABAB' },
          };
          // Row 5 (rowEmp2), Lunes T2 (col 9): 4.0 hrs TE normal con color
          ws[XLSX.utils.encode_cell({ r: 5, c: 9 })].s = {
            patternType: 'solid',
            fgColor: { rgb: 'AEABAB' },
          };
          // Row 5 (rowEmp2), Martes T1 (col 11): 5.0 hrs TE normal con color
          ws[XLSX.utils.encode_cell({ r: 5, c: 11 })].s = {
            patternType: 'solid',
            fgColor: { rgb: 'AEABAB' },
          };

          // Simular Autofiltro en Excel donde la fila 5 (Empleado 2) fue oculta por filtro
          ws['!rows'] = [
            {},
            {},
            {},
            {},
            {},
            { hidden: true, hpt: 0 }, // Fila 5 oculta visualmente
          ];

          XLSX.utils.book_append_sheet(wb, ws, '02-08 S45');

          // Base TE con departamento canónico oficial: GENERADOR VAPOR(CALDE
          const baseTeRecords = [
            { employeeId: '70006', department: 'GENERADOR VAPOR(CALDE', leader: 'Ing. Roberto Saldaña' },
            { employeeId: '70016', department: 'GENERADOR VAPOR(CALDE', leader: 'Ing. Roberto Saldaña' },
          ];

          const result = parseWeeklyMatrixWorkbook(wb, undefined, baseTeRecords);

          // 1. Debe haber leído AMBAS filas activas a pesar de que rowEmp2 tenía hidden: true
          expect(result.stats.activeEmployees).toBe(2);
          expect(result.records).toHaveLength(2);

          // 2. Verificar Empleado 1: 70006 - OCHOA TEGOMEX JUAN MANUEL
          const emp1 = result.records.find((r) => r.employeeId === '70006')!;
          expect(emp1).toBeDefined();
          expect(emp1.employeeName).toBe('OCHOA TEGOMEX JUAN MANUEL');
          // Debe haberse unificado con el nombre canónico de Base TE
          expect(emp1.department).toBe('GENERADOR VAPOR(CALDE');
          expect(emp1.weekNumber).toBe(45);
          expect(emp1.horasTotales).toBe(7.0);
          expect(emp1.horasProlongacion).toBe(1.5); // 0.5 (T1) + 1.0 (T3)
          expect(emp1.horasNormales).toBe(5.5); // 5.5 (T1 con color)
          expect(emp1.expectedTotalColAD).toBe(7.0);
          expect(emp1.isConsistentWithColAD).toBe(true);

          // 3. Verificar Empleado 2: 70016 - SANCHEZ FERNANDEZ ARTURO
          const emp2 = result.records.find((r) => r.employeeId === '70016')!;
          expect(emp2).toBeDefined();
          expect(emp2.employeeName).toBe('SANCHEZ FERNANDEZ ARTURO');
          expect(emp2.department).toBe('GENERADOR VAPOR(CALDE');
          expect(emp2.weekNumber).toBe(45);
          expect(emp2.horasTotales).toBe(13.0);
          expect(emp2.horasNormales).toBe(13.0);
          expect(emp2.expectedTotalColAD).toBe(13.0);
          expect(emp2.isConsistentWithColAD).toBe(true);

          // 4. Verificar que enrichMatrixWithLeaders conserve el departamento canónico
          const enriched = enrichMatrixWithLeaders(result.records, baseTeRecords);
          expect(enriched[0].department).toBe('GENERADOR VAPOR(CALDE');
          expect(enriched[1].department).toBe('GENERADOR VAPOR(CALDE');
        });
      });
    });
  });
});



