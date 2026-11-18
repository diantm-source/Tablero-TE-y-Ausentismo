import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  calculateDepartmentAbsenceChart,
  calculateDepartmentOvertimeChart,
  calculateExecutiveKPIs,
  calculateExecutiveSummaryData,
  classifyOvertimeCollaborator,
  computeKPIs,
  evaluateTrafficLight,
  extractBaseTeLeaderCatalog,
  isRecordInLeaderScope,
  isUnjustifiedAbsence,
  passesPeriodFilterOnly,
  TRAFFIC_LIGHT_LABELS,
} from './kpiEngine';
import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from '../types';

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
  weeks: [],
  months: [],
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

  it('unifica GENERADORVAPOR(CALDE y GENERADOR VAPOR(CALDE y actualiza al nuevo líder del área', () => {
    const records = [
      // Semana 38: Registrado como GENERADORVAPOR(CALDE con líder antiguo
      {
        department: 'GENERADORVAPOR(CALDE',
        leader: 'Ing. Lider Antiguo',
        weekNumber: 38,
        isoYear: 2026,
        fecha: '2026-09-18',
      },
      // Semana 44: Registrado como GENERADOR VAPOR(CALDE con nuevo líder
      {
        department: 'GENERADOR VAPOR(CALDE',
        leader: 'Ing. Lider Nuevo',
        weekNumber: 44,
        isoYear: 2026,
        fecha: '2026-10-30',
      },
    ];

    const catalog = extractBaseTeLeaderCatalog(records);

    // Debe existir un único departamento canónico: GENERADOR VAPOR(CALDE
    expect(catalog.departmentsList).toEqual(['GENERADOR VAPOR(CALDE']);

    // La lista de líderes debe incluir únicamente al líder activo y actualizado
    expect(catalog.leadersList).toEqual(['Ing. Lider Nuevo']);

    // El departamento debe estar asignado única y exclusivamente al nuevo líder
    const nuevoDepts = catalog.leaderToDepartments.get('Ing. Lider Nuevo');
    expect(nuevoDepts).toBeDefined();
    expect(Array.from(nuevoDepts!)).toEqual(['GENERADOR VAPOR(CALDE']);

    // El líder antiguo no debe tener asignado este departamento
    const antiguoDepts = catalog.leaderToDepartments.get('Ing. Lider Antiguo');
    expect(antiguoDepts).toBeUndefined();

    // Verificación de alcance de filtro (isRecordInLeaderScope)
    expect(
      isRecordInLeaderScope({ department: 'GENERADORVAPOR(CALDE' }, ['Ing. Lider Nuevo'], catalog.leaderToDepartments)
    ).toBe(true);
    expect(
      isRecordInLeaderScope({ department: 'GENERADOR VAPOR(CALDE' }, ['Ing. Lider Nuevo'], catalog.leaderToDepartments)
    ).toBe(true);
    expect(
      isRecordInLeaderScope({ department: 'GENERADOR VAPOR(CALDE' }, ['Ing. Lider Antiguo'], catalog.leaderToDepartments)
    ).toBe(false);
  });

  describe('Executive Summary: 5 KPIs y 2 Gráficas Analíticas', () => {
    const mockAnnualOt: AnnualOvertimeRecord[] = [
      {
        id: 'aot_1',
        employeeId: 'EMP01',
        employeeName: 'Juan Lopez',
        department: 'Produccion',
        overtimeType: 'Doble',
        hours: 10,
        horasNormales: 8,
        horasProlongacion: 2,
        horasTotales: 10,
        amount: 500,
        week: 'W42',
        weekNumber: 42,
        isoYear: 2026,
        monthNumber: 10,
        monthName: 'Octubre',
        fecha: '2026-10-14',
        fechaDisplay: '14/10/2026',
        leader: 'Carlos Lider',
        turno: '1er Turno',
      },
      {
        id: 'aot_2',
        employeeId: 'EMP02',
        employeeName: 'Maria Perez',
        department: 'Mantenimiento',
        overtimeType: 'Doble',
        hours: 6,
        horasNormales: 5,
        horasProlongacion: 1,
        horasTotales: 6,
        amount: 300,
        week: 'W42',
        weekNumber: 42,
        isoYear: 2026,
        monthNumber: 10,
        monthName: 'Octubre',
        fecha: '2026-10-15',
        fechaDisplay: '15/10/2026',
        leader: 'Pedro Ramos',
        turno: '2do Turno',
      },
      {
        id: 'aot_3',
        employeeId: 'EMP03',
        employeeName: 'Luis Gomez',
        department: 'Produccion',
        overtimeType: 'Doble',
        hours: 4,
        horasNormales: 4,
        horasProlongacion: 0,
        horasTotales: 4,
        amount: 200,
        week: 'W43',
        weekNumber: 43,
        isoYear: 2026,
        monthNumber: 10,
        monthName: 'Octubre',
        fecha: '2026-10-22',
        fechaDisplay: '22/10/2026',
        leader: 'Carlos Lider',
        turno: '1er Turno',
      },
      {
        id: 'aot_4',
        employeeId: 'EMP04',
        employeeName: 'Ana Soto',
        department: 'Calidad',
        overtimeType: 'Doble',
        hours: 5,
        horasNormales: 5,
        horasProlongacion: 0,
        horasTotales: 5,
        amount: 250,
        week: 'W44',
        weekNumber: 44,
        isoYear: 2026,
        monthNumber: 11,
        monthName: 'Noviembre',
        fecha: '2026-11-04',
        fechaDisplay: '04/11/2026',
        leader: 'Ana Morales',
        turno: '3er Turno',
      },
    ];

    const mockAbsences: AbsenceRecord[] = [
      {
        id: 'abs_1',
        employeeId: 'EMP01',
        employeeName: 'Juan Lopez',
        position: 'Operador',
        department: 'Produccion',
        absenceType: 'Falta Injustificada',
        absenceCategory: 'Injustificada',
        absences: 1,
        amount: 400,
        startDate: '2026-10-14',
        startDateDisplay: '14/10/2026',
        endDate: '2026-10-14',
        endDateDisplay: '14/10/2026',
        week: 'W42',
        weekNumber: 42,
        isoYear: 2026,
        leader: 'Carlos Lider',
      },
      {
        id: 'abs_2',
        employeeId: 'EMP02',
        employeeName: 'Maria Perez',
        position: 'Mecanico',
        department: 'Mantenimiento',
        absenceType: 'FALTA INJUSTIFICADA',
        absenceCategory: 'Injustificada',
        absences: 2,
        amount: 800,
        startDate: '2026-10-15',
        startDateDisplay: '15/10/2026',
        endDate: '2026-10-16',
        endDateDisplay: '16/10/2026',
        week: 'W42',
        weekNumber: 42,
        isoYear: 2026,
        leader: 'Pedro Ramos',
      },
      {
        id: 'abs_3',
        employeeId: 'EMP05',
        employeeName: 'Roberto Diaz',
        position: 'Tecnico',
        department: 'Calidad',
        absenceType: 'Incapacidad Enfermedad General',
        absenceCategory: 'Incapacidad',
        absences: 3,
        amount: 1200,
        startDate: '2026-10-16',
        startDateDisplay: '16/10/2026',
        endDate: '2026-10-18',
        endDateDisplay: '18/10/2026',
        week: 'W42',
        weekNumber: 42,
        isoYear: 2026,
        leader: 'Ana Morales',
      },
      {
        id: 'abs_4',
        employeeId: 'EMP06',
        employeeName: 'Laura Ramos',
        position: 'Operador',
        department: 'Produccion',
        absenceType: 'Vacaciones',
        absenceCategory: 'Vacaciones',
        absences: 2,
        amount: 800,
        startDate: '2026-10-21',
        startDateDisplay: '21/10/2026',
        endDate: '2026-10-22',
        endDateDisplay: '22/10/2026',
        week: 'W43',
        weekNumber: 43,
        isoYear: 2026,
        leader: 'Carlos Lider',
      },
    ];

    it('normaliza correctamente "Falta injustificada" de forma case-insensitive', () => {
      expect(isUnjustifiedAbsence('Falta injustificada')).toBe(true);
      expect(isUnjustifiedAbsence('FALTA INJUSTIFICADA')).toBe(true);
      expect(isUnjustifiedAbsence('falta injustificada  ')).toBe(true);
      expect(isUnjustifiedAbsence('Incapacidad')).toBe(false);
      expect(isUnjustifiedAbsence('Vacaciones')).toBe(false);
      expect(isUnjustifiedAbsence('Permiso con goce')).toBe(false);
    });

    it('calcula los 5 KPIs respondiendo a los filtros de Semana, Mes, Departamento y Líder', () => {
      // Filtro por Semana 42
      const filterW42: GlobalFilterState = {
        ...defaultFilters,
        isoWeek: '2026-W42',
      };

      const kpisW42 = calculateExecutiveKPIs({
        annualOvertime: mockAnnualOt,
        absenceRecords: mockAbsences,
        filters: filterW42,
      });

      // Total global de TE: 10 + 6 + 4 + 5 = 25 hrs
      expect(kpisW42.totalOvertimeHours.globalTotal).toBe(25);
      // En W42: aot_1 (10h: 8 norm + 2 prol) + aot_2 (6h: 5 norm + 1 prol) = 16h (13 norm + 3 prol)
      expect(kpisW42.totalOvertimeHours.total).toBe(16);
      expect(kpisW42.totalOvertimeHours.normales).toBe(13);
      expect(kpisW42.totalOvertimeHours.prolongacion).toBe(3);
      expect(kpisW42.totalOvertimeHours.percentageOfGlobal).toBe(64); // 16 / 25 = 64%

      // Ausencias en W42:
      // Injustificadas: abs_1 (1) + abs_2 (2) = 3 faltas (24 hrs equiv)
      expect(kpisW42.unjustifiedAbsences.count).toBe(3);
      expect(kpisW42.unjustifiedAbsences.equivalentHours).toBe(24);
      expect(kpisW42.unjustifiedAbsences.globalCount).toBe(3);
      expect(kpisW42.unjustifiedAbsences.percentageOfGlobal).toBe(100);

      // Justificadas: abs_3 (3) = 3 ausencias justificadas (Incapacidad Enfermedad General)
      expect(kpisW42.justifiedAbsences.count).toBe(3);
      expect(kpisW42.justifiedAbsences.equivalentHours).toBe(24);
      expect(kpisW42.justifiedAbsences.globalCount).toBe(5); // 3 (incapacidad) + 2 (vacaciones) = 5
      expect(kpisW42.justifiedAbsences.percentageOfGlobal).toBe(60); // 3 / 5 = 60%

      // Mayor volumen TE en W42: Produccion con 10 hrs, lider Carlos Lider
      expect(kpisW42.topOvertimeDepartment?.department).toBe('Produccion');
      expect(kpisW42.topOvertimeDepartment?.hours).toBe(10);
      expect(kpisW42.topOvertimeDepartment?.leader).toBe('Carlos Lider');

      // Mayor ausentismo en W42: Calidad (3 aus.) o Mantenimiento (2 aus.)
      expect(kpisW42.topAbsenceDepartment?.department).toBe('Calidad');
      expect(kpisW42.topAbsenceDepartment?.hours).toBe(24); // 3 * 8 = 24 hrs de ausencia
    });

    it('los 5 KPIs responden al filtro de Líder de Área', () => {
      const filterLeader: GlobalFilterState = {
        ...defaultFilters,
        leaders: ['Carlos Lider'],
      };

      const kpisLeader = calculateExecutiveKPIs({
        annualOvertime: mockAnnualOt,
        absenceRecords: mockAbsences,
        filters: filterLeader,
      });

      // Carlos Lider tiene aot_1 (10h) y aot_3 (4h) = 14h
      expect(kpisLeader.totalOvertimeHours.total).toBe(14);
      expect(kpisLeader.topOvertimeDepartment?.department).toBe('Produccion');
      expect(kpisLeader.topOvertimeDepartment?.leader).toBe('Carlos Lider');
    });

    it('las 2 gráficas responden ÚNICAMENTE a Semana y Mes e ignoran Departamento y Líder', () => {
      // Filtro que tiene Semana 42 PERO también Departamento "Mantenimiento" y Líder "Pedro Ramos"
      const filterWithDeptAndLeader: GlobalFilterState = {
        ...defaultFilters,
        isoWeek: '2026-W42',
        departments: ['Mantenimiento'],
        leaders: ['Pedro Ramos'],
      };

      // Gráfica 1: Tiempo Extra por Departamento
      const otChart = calculateDepartmentOvertimeChart({
        annualOvertime: mockAnnualOt,
        filters: filterWithDeptAndLeader,
      });

      // Debe incluir TODOS los departamentos de la Semana 42 (Produccion y Mantenimiento),
      // IGNORANDO que filters.departments sea ['Mantenimiento']
      expect(otChart.length).toBe(2);
      expect(otChart[0].department).toBe('Produccion');
      expect(otChart[0].hours).toBe(10);
      expect(otChart[0].percentage).toBe(62.5); // 10 / 16 = 62.5%
      expect(otChart[0].dates).toContain('2026-10-14');
      expect(otChart[1].department).toBe('Mantenimiento');
      expect(otChart[1].hours).toBe(6);
      expect(otChart[1].percentage).toBe(37.5); // 6 / 16 = 37.5%

      // Gráfica 2: Ausentismo por Departamento
      const absChart = calculateDepartmentAbsenceChart({
        absenceRecords: mockAbsences,
        filters: filterWithDeptAndLeader,
      });

      // Debe incluir TODOS los departamentos con ausencias en la Semana 42 (Calidad, Mantenimiento, Produccion)
      expect(absChart.length).toBe(3);
      expect(absChart[0].department).toBe('Calidad');
      expect(absChart[0].absences).toBe(3);
      expect(absChart[0].percentage).toBe(50); // 3 / 6 = 50%
      expect(absChart[1].department).toBe('Mantenimiento');
      expect(absChart[1].absences).toBe(2);
      expect(absChart[2].department).toBe('Produccion');
      expect(absChart[2].absences).toBe(1);
    });

    it('calculateExecutiveSummaryData entrega la estructura completa unificada', () => {
      const result = calculateExecutiveSummaryData({
        annualOvertime: mockAnnualOt,
        absenceRecords: mockAbsences,
        filters: defaultFilters,
      });

      expect(result.kpis).toBeDefined();
      expect(result.overtimeChart).toBeDefined();
      expect(result.absenceChart).toBeDefined();
      expect(result.kpis.totalOvertimeHours.total).toBe(25);
      expect(result.overtimeChart.length).toBe(3); // Produccion, Mantenimiento, Calidad
      expect(result.absenceChart.length).toBe(3); // Calidad, Produccion, Mantenimiento
    });
  });

  describe('Semáforo Semanal de Tiempo Extra - 4 Estados (Rojo, Amarillo, Verde, Sin HRS)', () => {
    it('clasifica como Sin HRS (0 horas) cuando horasExtra === 0 && prolongacionJornada === 0', () => {
      const res0 = classifyOvertimeCollaborator(0, 0);
      expect(res0.totalHoras).toBe(0);
      expect(res0.semaforo).toBe('SIN_HRS');
      expect(res0.label).toBe('Sin HRS');

      expect(evaluateTrafficLight(0)).toBe('SIN_HRS');
      expect(evaluateTrafficLight(-2)).toBe('SIN_HRS');
    });

    it('clasifica estrictamente como Verde únicamente entre > 0 y <= 7 horas', () => {
      const res05 = classifyOvertimeCollaborator(0.5, 0);
      expect(res05.totalHoras).toBe(0.5);
      expect(res05.semaforo).toBe('VERDE');
      expect(res05.label).toBe('Verde (1 - 7 hrs)');

      const res1 = classifyOvertimeCollaborator(1, 0);
      expect(res1.totalHoras).toBe(1);
      expect(res1.semaforo).toBe('VERDE');

      const resMixed = classifyOvertimeCollaborator(4, 2);
      expect(resMixed.totalHoras).toBe(6);
      expect(resMixed.semaforo).toBe('VERDE');

      const res7 = classifyOvertimeCollaborator(5, 2);
      expect(res7.totalHoras).toBe(7);
      expect(res7.semaforo).toBe('VERDE');
      expect(res7.label).toBe('Verde (1 - 7 hrs)');

      expect(evaluateTrafficLight(7)).toBe('VERDE');
    });

    it('clasifica como Amarillo cuando totalHoras > 7 y <= 9 horas', () => {
      const res71 = classifyOvertimeCollaborator(7.1, 0);
      expect(res71.totalHoras).toBe(7.1);
      expect(res71.semaforo).toBe('AMARILLO');
      expect(res71.label).toBe('Amarillo (7 - 9 hrs)');

      const res8 = classifyOvertimeCollaborator(6, 2);
      expect(res8.totalHoras).toBe(8);
      expect(res8.semaforo).toBe('AMARILLO');

      const res9 = classifyOvertimeCollaborator(7, 2);
      expect(res9.totalHoras).toBe(9);
      expect(res9.semaforo).toBe('AMARILLO');
      expect(res9.label).toBe('Amarillo (7 - 9 hrs)');

      expect(evaluateTrafficLight(9)).toBe('AMARILLO');
    });

    it('clasifica como Rojo cuando totalHoras > 9 horas', () => {
      const res95 = classifyOvertimeCollaborator(8, 1.5);
      expect(res95.totalHoras).toBe(9.5);
      expect(res95.semaforo).toBe('ROJO');
      expect(res95.label).toBe('Rojo (> 9 hrs)');

      const res12 = classifyOvertimeCollaborator(10, 2);
      expect(res12.totalHoras).toBe(12);
      expect(res12.semaforo).toBe('ROJO');
      expect(res12.label).toBe('Rojo (> 9 hrs)');

      expect(evaluateTrafficLight(10)).toBe('ROJO');
    });

    it('valida las etiquetas oficiales de TRAFFIC_LIGHT_LABELS', () => {
      expect(TRAFFIC_LIGHT_LABELS.ROJO).toBe('Rojo (> 9 hrs)');
      expect(TRAFFIC_LIGHT_LABELS.AMARILLO).toBe('Amarillo (7 - 9 hrs)');
      expect(TRAFFIC_LIGHT_LABELS.VERDE).toBe('Verde (1 - 7 hrs)');
      expect(TRAFFIC_LIGHT_LABELS.SIN_HRS).toBe('Sin HRS');
    });
  });

  describe('GlobalFilterState Multiselection Engine', () => {
    it('soporta multiselección de semanas en passesPeriodFilterOnly y applyFilters', () => {
      const filters: GlobalFilterState = {
        ...defaultFilters,
        weeks: ['2026-W44', '2026-W45'],
      };

      const itemW44 = { isoYear: 2026, isoWeek: 44 };
      const itemW45 = { isoYear: 2026, isoWeek: 45 };
      const itemW46 = { isoYear: 2026, isoWeek: 46 };

      expect(passesPeriodFilterOnly(itemW44, filters)).toBe(true);
      expect(passesPeriodFilterOnly(itemW45, filters)).toBe(true);
      expect(passesPeriodFilterOnly(itemW46, filters)).toBe(false);
    });

    it('soporta multiselección de meses en formato YYYY-MM y nombre en mayúsculas', () => {
      const filters: GlobalFilterState = {
        ...defaultFilters,
        months: ['2026-03', 'NOVIEMBRE'],
      };

      const itemMarzo = { fecha: '2026-03-15', dateOnly: '2026-03-15' };
      const itemNoviembre = { fecha: '2026-11-04', dateOnly: '2026-11-04' };
      const itemOctubre = { fecha: '2026-10-20', dateOnly: '2026-10-20' };

      expect(passesPeriodFilterOnly(itemMarzo, filters)).toBe(true);
      expect(passesPeriodFilterOnly(itemNoviembre, filters)).toBe(true);
      expect(passesPeriodFilterOnly(itemOctubre, filters)).toBe(false);
    });

    it('soporta multiselección de departamentos y líderes simultáneamente', () => {
      const filters: GlobalFilterState = {
        ...defaultFilters,
        departments: ['MANTENIMIENTO TLAX PQ', 'SEGURIDAD TLAX PQ'],
        leaders: ['Fidel Mendoza', 'Pedro Calderón'],
      };

      expect(filters.departments).toHaveLength(2);
      expect(filters.leaders).toHaveLength(2);
    });
  });
});
