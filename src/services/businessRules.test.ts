import { describe, it, expect } from 'vitest';
import {
  calculateOvertimeHours,
  evaluateAttendance,
  getISOWeekAndYear,
  isAttendanceEligibleCompany,
  validateOvertimeReason,
  levenshteinDistance,
  formatDateISO,
} from './businessRules';
import { OFFICIAL_REASONS_CATALOG } from './db';

describe('Business Rules & ISO 8601 Engine', () => {
  it('correctly calculates ISO 8601 week and year', () => {
    // 2024-10-14 is Monday of ISO week 42
    const d1 = new Date(2024, 9, 14); // Note: month is 0-indexed (9 = Oct)
    const res1 = getISOWeekAndYear(d1);
    expect(res1.isoYear).toBe(2024);
    expect(res1.isoWeek).toBe(42);

    // 2024-10-20 is Sunday of same ISO week 42
    const d2 = new Date(2024, 9, 20);
    const res2 = getISOWeekAndYear(d2);
    expect(res2.isoYear).toBe(2024);
    expect(res2.isoWeek).toBe(42);

    // 2024-10-21 is Monday of ISO week 43
    const d3 = new Date(2024, 9, 21);
    const res3 = getISOWeekAndYear(d3);
    expect(res3.isoYear).toBe(2024);
    expect(res3.isoWeek).toBe(43);
  });

  it('formats dates consistently to ISO YYYY-MM-DD', () => {
    const d = new Date(2024, 9, 15);
    expect(formatDateISO(d)).toBe('2024-10-15');
  });

  it('filters attendance eligible companies strictly (Polaquimia, MLBM, Barteleu)', () => {
    expect(isAttendanceEligibleCompany('POLAQUIMIA')).toBe(true);
    expect(isAttendanceEligibleCompany('Polaquimia S.A. de C.V.')).toBe(true);
    expect(isAttendanceEligibleCompany('MLBM')).toBe(true);
    expect(isAttendanceEligibleCompany('Barteleu')).toBe(true);
    expect(isAttendanceEligibleCompany('POLATECNIA')).toBe(false);
    expect(isAttendanceEligibleCompany('Becarios')).toBe(false);
    expect(isAttendanceEligibleCompany('Externos')).toBe(false);
  });

  it('calculates overtime hours accurately including midnight crossing', () => {
    // Normal day overtime: 14:00 to 18:00 = 4.0 hrs
    const hrs1 = calculateOvertimeHours('2024-10-14', '14:00', '2024-10-14', '18:00');
    expect(hrs1).toBe(4.0);

    // Midnight crossing on same date: 22:00 to 04:00 = 6.0 hrs
    const hrs2 = calculateOvertimeHours('2024-10-14', '22:00', '2024-10-14', '04:00');
    expect(hrs2).toBe(6.0);

    // Explicit next date: 22:00 to 06:00 = 8.0 hrs
    const hrs3 = calculateOvertimeHours('2024-10-14', '22:00', '2024-10-15', '06:00');
    expect(hrs3).toBe(8.0);
  });

  it('evaluates attendance according to corporate absence rules', () => {
    // 1. Ineligible schedule -> EXCLUIDO_HORARIO
    const r1 = evaluateAttendance('DESCANSO', '', null, null);
    expect(r1.absenceStatus).toBe('EXCLUIDO_HORARIO');
    expect(r1.isScheduleEligible).toBe(false);

    // 2. Eligible schedule with justified exception -> JUSTIFICADO_EXCEPCION
    const r2 = evaluateAttendance('1', 'Incapacidad IMSS', null, null);
    expect(r2.absenceStatus).toBe('JUSTIFICADO_EXCEPCION');
    expect(r2.hasException).toBe(true);

    // 3. Eligible schedule, no punches and no exception -> AUSENCIA_CONFIRMADA
    const r3 = evaluateAttendance('1', '', null, null);
    expect(r3.absenceStatus).toBe('AUSENCIA_CONFIRMADA');

    // 4. Only one punch (missed punch out) -> INCIDENCIA_MARCAJE
    const r4 = evaluateAttendance('2', '', '15:02:00', null);
    expect(r4.absenceStatus).toBe('INCIDENCIA_MARCAJE');

    // 5. Both punches present -> PRESENTE
    const r5 = evaluateAttendance('3', '', '22:58:00', '07:05:00');
    expect(r5.absenceStatus).toBe('PRESENTE');
  });

  it('validates overtime reasons against official catalog using Levenshtein distance', () => {
    // Exact official reason
    const val1 = validateOvertimeReason('Auditoría - Externa ISO 9001', OFFICIAL_REASONS_CATALOG);
    expect(val1.classification).toBe('CORRECTO');

    // Minor typo match (Levenshtein)
    const val2 = validateOvertimeReason('Auditoria - Externa ISO 9001', OFFICIAL_REASONS_CATALOG);
    expect(val2.classification).toBe('CORRECTO');

    // Structured category: "Mantenimiento correctivo - Reparación urgente bomba 5"
    const val3 = validateOvertimeReason('Mantenimiento correctivo - Reparación urgente bomba 5', OFFICIAL_REASONS_CATALOG);
    expect(val3.classification).toBe('CORRECTO');
    expect(val3.category).toBe('Mantenimiento correctivo');

    // Unrecognized reason
    const val4 = validateOvertimeReason('motivo totalmente desconocido xyz123', OFFICIAL_REASONS_CATALOG);
    expect(val4.classification).toBe('NO_RECONOCIDO');
  });
});
