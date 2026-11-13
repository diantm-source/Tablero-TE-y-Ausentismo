import { describe, it, expect } from 'vitest';
import { applyFilters, computeKPIs, extractBaseTeLeaderCatalog, isRecordInLeaderScope } from './kpiEngine';
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

  it('filters both Overtime and Attendance reactively by collaboratorType: SINDICALIZADO', () => {
    const filters: GlobalFilterState = {
      ...defaultFilters,
      collaboratorType: 'SINDICALIZADO',
    };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    // Overtime should ONLY include syndicated employees (EMP001 Juan Perez and EMP003 Luis Hernandez)
    expect(filteredOvertime.length).toBe(2);
    expect(filteredOvertime.map((o) => o.employeeId)).toEqual(['EMP001', 'EMP003']);

    // Attendance should ONLY include syndicated employees (EMP001 and EMP003)
    expect(filteredAttendance.length).toBe(2);
    expect(filteredAttendance.map((a) => a.employeeId)).toEqual(['EMP001', 'EMP003']);

    // computeKPIs should reflect filtered counts and hours for syndicated only
    const kpis = computeKPIs(mockOvertime, mockAttendance, filters, defaultThresholds);
    expect(kpis.totalOtRequests).toBe(2);
    expect(kpis.collaboratorsWithOtCount).toBe(2);
    expect(kpis.totalRequestedHours).toBe(7); // 4 + 3
    expect(kpis.totalApprovedHours).toBe(4); // 4
    expect(kpis.totalPendingHours).toBe(3); // 3
    expect(kpis.totalEligibleShifts).toBe(2);
  });

  it('filters both Overtime and Attendance reactively by collaboratorType: NO_SINDICALIZADO', () => {
    const filters: GlobalFilterState = {
      ...defaultFilters,
      collaboratorType: 'NO_SINDICALIZADO',
    };
    const { filteredOvertime, filteredAttendance } = applyFilters(mockOvertime, mockAttendance, filters);

    // Overtime should ONLY include non-syndicated employees (EMP002, EMP004, EMP005, EMP006)
    expect(filteredOvertime.length).toBe(4);
    expect(filteredOvertime.map((o) => o.employeeId)).toEqual(['EMP002', 'EMP004', 'EMP005', 'EMP006']);

    // Attendance should ONLY include non-syndicated employees (EMP002, EMP004)
    expect(filteredAttendance.length).toBe(2);
    expect(filteredAttendance.map((a) => a.employeeId)).toEqual(['EMP002', 'EMP004']);

    // computeKPIs should reflect filtered counts and hours for non-syndicated only
    const kpis = computeKPIs(mockOvertime, mockAttendance, filters, defaultThresholds);
    expect(kpis.totalOtRequests).toBe(4);
    expect(kpis.collaboratorsWithOtCount).toBe(4);
    expect(kpis.totalRequestedHours).toBe(14); // 4 + 4 + 2 + 4
    expect(kpis.totalApprovedHours).toBe(12); // 4 + 4 + 4
    expect(kpis.totalPendingHours).toBe(2); // 2
    expect(kpis.totalEligibleShifts).toBe(2);
  });

  it('counts exclusively unique collaborators with horasTotales > 0 (excluding 0 hrs)', () => {
    const customOvertime: OvertimeRecord[] = [
      {
        ...mockOvertime[0],
        id: 'ot_zero_1',
        employeeId: 'EMP_ZERO_1',
        requestedHours: 0,
        approvedHours: 0,
        horasTotales: 0,
        status: 'APROBADO',
      },
      {
        ...mockOvertime[0],
        id: 'ot_zero_2',
        employeeId: 'EMP_ZERO_2',
        requestedHours: 0,
        approvedHours: 0,
        horasTotales: 0,
        status: 'APROBADO',
      },
      {
        ...mockOvertime[0],
        id: 'ot_active_1',
        employeeId: 'EMP_ACTIVE_1',
        requestedHours: 4,
        approvedHours: 4,
        horasTotales: 4,
        status: 'APROBADO',
      },
    ];

    const kpis = computeKPIs(customOvertime, [], defaultFilters, defaultThresholds);
    // Total requests = 3, but collaboratorsWithOtCount must be 1 (only EMP_ACTIVE_1 with hours > 0)
    expect(kpis.totalOtRequests).toBe(3);
    expect(kpis.collaboratorsWithOtCount).toBe(1);
  });

  it('extracts real Base TE leader-department catalog and maps leader to departments', () => {
    const baseTeSample = [
      { department: '  Producción  ', leader: '  Ing. Juan Pérez  ' },
      { department: 'Mantenimiento', leader: 'Ing. Juan Pérez' },
      { department: 'Almacén', leader: 'Lic. Laura Soto' },
      { department: 'Calidad', leader: 'Sin Líder Asignado' },
    ];

    const catalog = extractBaseTeLeaderCatalog(baseTeSample);
    expect(catalog.leadersList).toEqual(['Ing. Juan Pérez', 'Lic. Laura Soto']);
    expect(catalog.departmentsList).toEqual(['Almacén', 'Calidad', 'Mantenimiento', 'Producción']);

    const juanDepts = catalog.leaderToDepartments.get('Ing. Juan Pérez');
    expect(juanDepts).toBeDefined();
    expect(Array.from(juanDepts!)).toEqual(['Producción', 'Mantenimiento']);

    // Check isRecordInLeaderScope
    expect(isRecordInLeaderScope({ department: 'Producción' }, ['Ing. Juan Pérez'], catalog.leaderToDepartments)).toBe(true);
    expect(isRecordInLeaderScope({ department: 'Almacén' }, ['Ing. Juan Pérez'], catalog.leaderToDepartments)).toBe(false);
  });

  it('filters overtime and attendance by leader assigned departments using Base TE catalog', () => {
    const baseTeSample = [
      { department: 'Produccion', leader: 'Carlos Lopez' },
      { department: 'Mantenimiento', leader: 'Pedro Ramos' },
      { department: 'Logistica', leader: 'Ana Morales' },
    ];
    const catalog = extractBaseTeLeaderCatalog(baseTeSample);

    const leaderFilter: GlobalFilterState = {
      ...defaultFilters,
      leaders: ['Carlos Lopez'],
    };

    const { filteredOvertime, filteredAttendance } = applyFilters(
      mockOvertime,
      mockAttendance,
      leaderFilter,
      catalog.leaderToDepartments
    );

    // Records in Produccion or with leader Carlos Lopez should pass
    expect(filteredOvertime.every((r) => r.department === 'Produccion' || r.leader === 'Carlos Lopez')).toBe(true);
    expect(filteredOvertime.length).toBeGreaterThan(0);
    expect(filteredAttendance.every((r) => r.department === 'Produccion' || r.leader === 'Carlos Lopez')).toBe(true);
  });

  it('filters records by department matching variations like GENERADOR VAPOR(CALDE vs GENERADORVAPOR(CALDE', () => {
    const otRecords: OvertimeRecord[] = [
      {
        ...mockOvertime[0],
        id: 'ot_gen_1',
        employeeId: '70006',
        employeeName: 'OCHOA TEGOMEX JUAN MANUEL',
        department: 'GENERADORVAPOR(CALDE',
        requestedHours: 7,
        approvedHours: 7,
        status: 'APROBADO',
        isoYear: 2026,
        isoWeek: 45,
        dateOnly: '2026-11-03',
      },
      {
        ...mockOvertime[0],
        id: 'ot_gen_2',
        employeeId: '70016',
        employeeName: 'SANCHEZ FERNANDEZ ARTURO',
        department: 'GENERADOR VAPOR(CALDE',
        requestedHours: 13,
        approvedHours: 13,
        status: 'APROBADO',
        isoYear: 2026,
        isoWeek: 45,
        dateOnly: '2026-11-04',
      },
      {
        ...mockOvertime[0],
        id: 'ot_other',
        employeeId: '99999',
        department: 'CALIDAD',
      },
    ];

    const filter: GlobalFilterState = {
      ...defaultFilters,
      departments: ['GENERADOR VAPOR(CALDE'],
      isoWeek: '2026-W45',
    };

    const { filteredOvertime } = applyFilters(otRecords, [], filter);

    // Ambos registros (con y sin espacio) deben coincidir y mostrarse
    expect(filteredOvertime).toHaveLength(2);
    expect(filteredOvertime.some((r) => r.employeeId === '70006')).toBe(true);
    expect(filteredOvertime.some((r) => r.employeeId === '70016')).toBe(true);

    const emp1 = filteredOvertime.find((r) => r.employeeId === '70006')!;
    const emp2 = filteredOvertime.find((r) => r.employeeId === '70016')!;
    expect(emp1.approvedHours).toBe(7);
    expect(emp2.approvedHours).toBe(13);
  });
});
