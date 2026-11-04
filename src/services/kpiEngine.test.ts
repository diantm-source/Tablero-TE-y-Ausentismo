import { describe, it, expect } from 'vitest';
import { applyFilters, computeKPIs } from './kpiEngine';
import { OvertimeRecord, AttendanceRecord, GlobalFilterState, ThresholdConfig } from '../types';

const mockOvertime: OvertimeRecord[] = [
  {
    id: 'ot_1',
    employeeId: 'EMP001',
    employeeName: 'Juan Perez',
    company: 'Polaquimia',
    department: 'Produccion',
    leader: 'Carlos Lopez',
    startDate: '2026-10-12',
    startTime: '16:00',
    endDate: '2026-10-12',
    endTime: '20:00',
    requestedHours: 4,
    approvedHours: 4,
    pendingHours: 0,
    status: 'APROBADO',
    reason: 'Cubrir turno',
    reasonNormalized: 'cubrir turno',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Produccion',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-12',
  },
  {
    id: 'ot_2',
    employeeId: 'EMP002',
    employeeName: 'Maria Gomez',
    company: 'MLBM',
    department: 'Mantenimiento',
    leader: 'Pedro Ramos',
    startDate: '2026-10-13',
    startTime: '18:00',
    endDate: '2026-10-13',
    endTime: '22:00',
    requestedHours: 4,
    approvedHours: 4,
    pendingHours: 0,
    status: 'APROBADO',
    reason: 'Reparacion',
    reasonNormalized: 'reparacion',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Mantenimiento',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-13',
  },
  {
    id: 'ot_3',
    employeeId: 'EMP003',
    employeeName: 'Luis Hernandez',
    company: 'Barteleu',
    department: 'Logistica',
    leader: 'Ana Morales',
    startDate: '2026-10-14',
    startTime: '15:00',
    endDate: '2026-10-14',
    endTime: '18:00',
    requestedHours: 3,
    approvedHours: 0,
    pendingHours: 3,
    status: 'PENDIENTE',
    reason: 'Carga urgente',
    reasonNormalized: 'carga urgente',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Logistica',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-14',
  },
  {
    id: 'ot_4',
    employeeId: 'EMP004',
    employeeName: 'Sofia Castro',
    company: 'Polatecnia',
    department: 'Calidad',
    leader: 'David Ortiz',
    startDate: '2026-10-14',
    startTime: '17:00',
    endDate: '2026-10-14',
    endTime: '21:00',
    requestedHours: 4,
    approvedHours: 4,
    pendingHours: 0,
    status: 'APROBADO',
    reason: 'Muestreo',
    reasonNormalized: 'muestreo',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Calidad',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-14',
  },
  {
    id: 'ot_5',
    employeeId: 'EMP005',
    employeeName: 'Becario 1',
    company: 'Becarios',
    department: 'Laboratorio',
    leader: 'Laura Cruz',
    startDate: '2026-10-15',
    startTime: '14:00',
    endDate: '2026-10-15',
    endTime: '16:00',
    requestedHours: 2,
    approvedHours: 0,
    pendingHours: 2,
    status: 'PENDIENTE',
    reason: 'Apoyo',
    reasonNormalized: 'apoyo',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Laboratorio',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-15',
  },
  {
    id: 'ot_6',
    employeeId: 'EMP006',
    employeeName: 'Externo 1',
    company: 'Externos',
    department: 'Seguridad',
    leader: 'Jorge Sanchez',
    startDate: '2026-10-15',
    startTime: '08:00',
    endDate: '2026-10-15',
    endTime: '12:00',
    requestedHours: 4,
    approvedHours: 4,
    pendingHours: 0,
    status: 'APROBADO',
    reason: 'Vigilancia',
    reasonNormalized: 'vigilancia',
    reasonClassification: 'CORRECTO',
    reasonCategory: 'Seguridad',
    reviewFormatStatus: 'CORRECTO',
    isoYear: 2026,
    isoWeek: 42,
    dateOnly: '2026-10-15',
  },
];

const mockAttendance: AttendanceRecord[] = [
  {
    id: 'att_1',
    employeeId: 'EMP001',
    employeeName: 'Juan Perez',
    nickname: 'Juan',
    company: 'Polaquimia',
    department: 'Produccion',
    leader: 'Carlos Lopez',
    date: '2026-10-12',
    dayOfWeek: 'Lunes',
    schedule: '1',
    isScheduleEligible: true,
    exception: '',
    hasException: false,
    isSyndicated: true,
    schedIn: '06:00',
    schedOut: '14:00',
    realIn: '05:55',
    realOut: '14:05',
    absenceStatus: 'PRESENTE',
    reviewStatus: 'REVISADO',
    isoYear: 2026,
    isoWeek: 42,
  },
  {
    id: 'att_2',
    employeeId: 'EMP002',
    employeeName: 'Maria Gomez',
    nickname: 'Maria',
    company: 'MLBM',
    department: 'Mantenimiento',
    leader: 'Pedro Ramos',
    date: '2026-10-13',
    dayOfWeek: 'Martes',
    schedule: '1',
    isScheduleEligible: true,
    exception: '',
    hasException: false,
    isSyndicated: false,
    schedIn: '06:00',
    schedOut: '14:00',
    realIn: '',
    realOut: '',
    absenceStatus: 'AUSENCIA_CONFIRMADA',
    reviewStatus: 'PENDIENTE_REVISION',
    isoYear: 2026,
    isoWeek: 42,
  },
  {
    id: 'att_3',
    employeeId: 'EMP003',
    employeeName: 'Luis Hernandez',
    nickname: 'Luis',
    company: 'Barteleu',
    department: 'Logistica',
    leader: 'Ana Morales',
    date: '2026-10-14',
    dayOfWeek: 'Miércoles',
    schedule: '2',
    isScheduleEligible: true,
    exception: '',
    hasException: false,
    isSyndicated: true,
    schedIn: '14:00',
    schedOut: '22:00',
    realIn: '14:00',
    realOut: '',
    absenceStatus: 'INCIDENCIA_MARCAJE',
    reviewStatus: 'PENDIENTE_REVISION',
    isoYear: 2026,
    isoWeek: 42,
  },
  {
    id: 'att_4',
    employeeId: 'EMP004',
    employeeName: 'Sofia Castro',
    nickname: 'Sofia',
    company: 'Polatecnia',
    department: 'Calidad',
    leader: 'David Ortiz',
    date: '2026-10-14',
    dayOfWeek: 'Miércoles',
    schedule: '1',
    isScheduleEligible: true,
    exception: '',
    hasException: false,
    isSyndicated: false,
    schedIn: '06:00',
    schedOut: '14:00',
    realIn: '',
    realOut: '',
    absenceStatus: 'AUSENCIA_CONFIRMADA',
    reviewStatus: 'PENDIENTE_REVISION',
    isoYear: 2026,
    isoWeek: 42,
  },
];

const defaultFilters: GlobalFilterState = {
  companies: ['ALL'],
  companyPreset: 'ALL',
  departments: ['ALL'],
  leaders: ['ALL'],
  month: 'ALL',
  isoWeek: 'ALL',
  specificDate: '',
  startDate: '',
  endDate: '',
  overtimeStatus: 'ALL',
  collaboratorType: 'ALL',
  searchTerm: '',
};

const defaultThresholds: ThresholdConfig = {
  overtimeHighWarningDeptHours: 50,
  absenceHighWarningRate: 3.5,
  absenceCriticalRate: 5.0,
};

describe('kpiEngine Company Presets & Filtering', () => {
  it('Preset "ALL": TE and Attendance include all companies (Polaquimia, MLBM, Barteleu, Polatecnia, Becarios, Externos)', () => {
    const filters: GlobalFilterState = { ...defaultFilters, companyPreset: 'ALL', companies: ['ALL'] };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    // Overtime includes all 6 companies
    expect(filteredOvertime.length).toBe(6);

    // Attendance includes all companies (including Polatecnia)
    expect(filteredAttendance.length).toBe(4);
    expect(filteredAttendance.map((a) => a.company)).toEqual(['Polaquimia', 'MLBM', 'Barteleu', 'Polatecnia']);
  });

  it('Preset "MAIN_THREE": TE and Attendance strictly Polaquimia, MLBM, Barteleu', () => {
    const filters: GlobalFilterState = {
      ...defaultFilters,
      companyPreset: 'MAIN_THREE',
      companies: ['POLAQUIMIA', 'MLBM', 'BARTELEU'],
    };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    // Overtime only Polaquimia, MLBM, Barteleu
    expect(filteredOvertime.length).toBe(3);
    expect(filteredOvertime.map((o) => o.company)).toEqual(['Polaquimia', 'MLBM', 'Barteleu']);

    // Attendance only Polaquimia, MLBM, Barteleu
    expect(filteredAttendance.length).toBe(3);
    expect(filteredAttendance.map((a) => a.company)).toEqual(['Polaquimia', 'MLBM', 'Barteleu']);
  });

  it('Preset "POLAQUIMIA_ONLY": only Polaquimia records for TE and Attendance', () => {
    const filters: GlobalFilterState = {
      ...defaultFilters,
      companyPreset: 'POLAQUIMIA_ONLY',
      companies: ['POLAQUIMIA'],
    };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    expect(filteredOvertime.length).toBe(1);
    expect(filteredOvertime[0].company).toBe('Polaquimia');

    expect(filteredAttendance.length).toBe(1);
    expect(filteredAttendance[0].company).toBe('Polaquimia');
  });

  it('Specific company filter for e.g. Polatecnia', () => {
    const filters: GlobalFilterState = {
      ...defaultFilters,
      companyPreset: 'CUSTOM',
      companies: ['POLATECNIA'],
    };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    // Overtime has Polatecnia
    expect(filteredOvertime.length).toBe(1);
    expect(filteredOvertime[0].company).toBe('Polatecnia');

    // Attendance has Polatecnia
    expect(filteredAttendance.length).toBe(1);
    expect(filteredAttendance[0].company).toBe('Polatecnia');
  });

  it('computes KPIs accurately for Preset ALL', () => {
    const filters: GlobalFilterState = { ...defaultFilters, companyPreset: 'ALL', companies: ['ALL'] };
    const kpis = computeKPIs(mockOvertime, mockAttendance, filters, defaultThresholds);

    expect(kpis.totalOtRequests).toBe(6);
    expect(kpis.totalRequestedHours).toBe(21);
    expect(kpis.totalApprovedHours).toBe(16);
    expect(kpis.totalPendingHours).toBe(5);
    expect(kpis.totalEligibleShifts).toBe(4);
    expect(kpis.totalAbsences).toBe(2);
    expect(kpis.punchIncidentsCount).toBe(1);
    expect(kpis.absenceRate).toBe(50.0); // 2 / 4 * 100
  });
});
