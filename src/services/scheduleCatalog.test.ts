import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_SCHEDULES_CATALOG,
  findOfficialSchedule,
  formatOfficialShiftLabel,
} from './scheduleCatalog';

describe('Catálogo Oficial de Turnos y Horarios', () => {
  it('contains all 41 official company shift definitions', () => {
    expect(OFFICIAL_SCHEDULES_CATALOG.length).toBe(41);
  });

  it('correctly disambiguates 1P based on shift name or entry time', () => {
    const s1 = findOfficialSchedule('Primer turno a pago');
    expect(s1?.name).toBe('Primer turno a pago');
    expect(s1?.entryTime).toBe('14:30:00');

    const s2 = findOfficialSchedule('1P', '14:30:00');
    expect(s2?.name).toBe('Primer turno a pago');

    const s3 = findOfficialSchedule('1P', '07:00:00');
    expect(s3?.name).toBe('Primer turno pago');
  });

  it('correctly finds shift 1 (Primer turno 07:00 a 15:00)', () => {
    const s = findOfficialSchedule('1');
    expect(s).toBeDefined();
    expect(s?.name).toBe('Primer turno');
    expect(s?.entryTime).toBe('07:00:00');
    expect(s?.exitTime).toBe('15:00:00');
    expect(s?.workMinutes).toBe(480);
    expect(formatOfficialShiftLabel('1')).toBe('1 - Primer turno (07:00 a 15:00)');
  });

  it('correctly finds shift 2 (Segundo turno 15:00 a 23:00)', () => {
    const s = findOfficialSchedule('2');
    expect(s).toBeDefined();
    expect(s?.name).toBe('Segundo turno');
    expect(s?.entryTime).toBe('15:00:00');
    expect(s?.exitTime).toBe('23:00:00');
    expect(formatOfficialShiftLabel('2')).toBe('2 - Segundo turno (15:00 a 23:00)');
  });

  it('correctly finds shift 3 (Tercer turno 23:00 a 07:00+1)', () => {
    const s = findOfficialSchedule('3');
    expect(s).toBeDefined();
    expect(s?.name).toBe('Tercer turno');
    expect(s?.entryTime).toBe('23:00:00');
    expect(formatOfficialShiftLabel('3')).toContain('3 - Tercer turno (23:00 a 07:00+1)');
  });

  it('correctly finds shift 4 (Cuarto turno 11:00 a 19:00)', () => {
    const s = findOfficialSchedule('4');
    expect(s).toBeDefined();
    expect(s?.name).toBe('Cuarto turno');
    expect(formatOfficialShiftLabel('4')).toBe('4 - Cuarto turno (11:00 a 19:00)');
  });

  it('correctly finds CMN (Primer turno Mantenimiento 07:00 a 14:00)', () => {
    const s = findOfficialSchedule('CMN');
    expect(s).toBeDefined();
    expect(s?.name).toBe('Primer turno Mantenimiento');
    expect(s?.workMinutes).toBe(420);
    expect(formatOfficialShiftLabel('CMN')).toBe('CMN - Primer turno Mantenimiento (07:00 a 14:00)');
  });

  it('correctly finds 12M and 12V (12x12 matutino y vespertino)', () => {
    const m = findOfficialSchedule('12M');
    expect(m?.workMinutes).toBe(720);
    expect(formatOfficialShiftLabel('12M')).toBe('12M - 12x12 matutino (07:00 a 19:00)');

    const v = findOfficialSchedule('12V');
    expect(v?.workMinutes).toBe(720);
    expect(formatOfficialShiftLabel('12V')).toContain('12V - 12x12 vespertino');
  });

  it('correctly finds supervision shifts (1S, 2S, 3S)', () => {
    expect(formatOfficialShiftLabel('1S')).toBe('1S - Primer turno supervision (06:30 a 14:30)');
    expect(formatOfficialShiftLabel('2S')).toBe('2S - Segundo turno supervision (14:30 a 22:30)');
    expect(formatOfficialShiftLabel('3S')).toContain('3S - Tercer turno supervision');
  });

  it('correctly finds Central shifts (C, CA, CB, CE, CM)', () => {
    expect(formatOfficialShiftLabel('C')).toBe('C - Central (08:00 a 17:30)');
    expect(formatOfficialShiftLabel('CA')).toBe('CA - Central A (08:30 a 18:00)');
    expect(formatOfficialShiftLabel('CM')).toBe('CM - Central matutino (08:00 a 15:00)');
  });

  it('correctly finds descanso and festivo (D, F)', () => {
    expect(formatOfficialShiftLabel('D')).toBe('D - Horario Dia_Descanso_default');
    expect(formatOfficialShiftLabel('F')).toBe('F - Festivo');
  });

  it('correctly finds double turn coverage (CT1, CT2, CT3, CT4, CT1S, CT2S, CT3S, CT4S)', () => {
    const ct1 = findOfficialSchedule('CT1');
    expect(ct1?.workMinutes).toBe(960);
    expect(ct1?.description).toContain('NO GENERA TIEMPO EXTRA');
  });
});
