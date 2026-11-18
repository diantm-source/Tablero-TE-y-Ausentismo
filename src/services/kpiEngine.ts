import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from '../types';
import { determineSyndicatedStatus, getISOWeekDateRange } from './businessRules';
import {
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
  updateRecordsWithLatestLeaders,
  TrafficLightStatus,
  evaluateTrafficLight,
} from './overtimeParser';

export {
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
  updateRecordsWithLatestLeaders,
  evaluateTrafficLight,
};
export type { TrafficLightStatus };

export const TRAFFIC_LIGHT_LABELS = {
  ROJO: 'Rojo (> 9 hrs)',
  AMARILLO: 'Amarillo (7 - 9 hrs)',
  VERDE: 'Verde (1 - 7 hrs)',
  SIN_HRS: 'Sin HRS',
  SIN_HORAS: 'Sin HRS',
} as const;

/**
 * Clasifica a un colaborador según sus horas extra y horas de prolongación de jornada:
 * - Rojo (> 9 horas): totalHoras > 9
 * - Amarillo (7 - 9 horas): totalHoras > 7 && totalHoras <= 9
 * - Verde (1 - 7 horas): totalHoras > 0 && totalHoras <= 7
 * - Sin HRS (0 horas): totalHoras === 0
 */
export function classifyOvertimeCollaborator(
  horasExtra: number = 0,
  prolongacionJornada: number = 0
): { totalHoras: number; semaforo: TrafficLightStatus; label: string } {
  const totalHoras = Math.round((Number(horasExtra || 0) + Number(prolongacionJornada || 0)) * 10) / 10;
  const semaforo = evaluateTrafficLight(totalHoras);
  return {
    totalHoras,
    semaforo,
    label: TRAFFIC_LIGHT_LABELS[semaforo] || 'Sin HRS',
  };
}

export interface DepartmentMetric {
  department: string;
  company: string;
  leader: string;
  requestedHours: number;
  approvedHours: number;
  pendingHours: number;
  otRequestsCount: number;
  eligibleShifts: number;
  absencesCount: number;
  absenceRate: number;
  isSimultaneousAlert: boolean; // Simultaneous high OT and high absence
}

export interface DayMetric {
  date: string;
  dayOfWeek: string;
  requestedHours: number;
  approvedHours: number;
  absences: number;
  incidents: number;
}

export interface WeekMetric {
  isoKey: string; // YYYY-Wxx
  isoYear: number;
  isoWeek: number;
  weekLabel: string; // e.g. "Semana 36: 31 de agosto al 6 de septiembre de 2026"
  requestedHours: number;
  approvedHours: number;
  absences: number;
  eligibleShifts: number;
  absenceRate: number;
}

export interface FilteredKPIs {
  filteredOvertime: OvertimeRecord[];
  filteredAttendance: AttendanceRecord[];

  // Overtime KPIs
  totalOtRequests: number;
  approvedOtRequests: number;
  pendingOtRequests: number;
  rejectedOtRequests: number;
  totalRequestedHours: number;
  totalApprovedHours: number;
  totalPendingHours: number;
  approvalRateByRequests: number;
  approvalRateByHours: number;
  collaboratorsWithOtCount: number;
  avgHoursPerCollaborator: number;
  avgHoursPerDepartment: number;

  // Attendance KPIs
  totalEligibleShifts: number;
  totalAbsences: number;
  absenceRate: number; // (totalAbsences / totalEligibleShifts) * 100
  punchIncidentsCount: number;
  justifiedExceptionsCount: number;
  syndicatedAbsences: number;
  nonSyndicatedAbsences: number;
  syndicatedAbsenceRate: number;
  nonSyndicatedAbsenceRate: number;

  // Comparison vs previous period (week or month)
  previousPeriodAvailable: boolean;
  previousApprovedHours: number | null;
  previousAbsences: number | null;
  previousAbsenceRate: number | null;
  diffApprovedHoursPct: number | null;
  diffAbsenceRatePct: number | null;

  // Aggregations
  departmentsMetrics: DepartmentMetric[];
  dailyMetrics: DayMetric[];
  weeklyMetrics: WeekMetric[];
  reasonsFrequency: { reason: string; category: string; count: number; hours: number }[];
  statusDistribution: { name: string; value: number; color: string }[];

  // Semaphore status
  absenceSemaphore: 'VERDE' | 'AMARILLO' | 'ROJO';
  overtimeSemaphore: 'VERDE' | 'AMARILLO' | 'ROJO';
  dateRangeCovered: { start: string; end: string } | null;
}

export interface BaseTeLeaderCatalog {
  leaderToDepartments: Map<string, Set<string>>;
  departmentToLeaders: Map<string, Set<string>>;
  leadersList: string[];
  departmentsList: string[];
}

/**
 * Extrae y normaliza el catálogo relacional de Líder de Área y Departamentos
 * única y exclusivamente desde los registros de Base TE, garantizando que si
 * un área cambió de líder, quede asociada única y exclusivamente a su líder más reciente.
 */
export function extractBaseTeLeaderCatalog(
  records: {
    department?: string;
    leader?: string;
    'Líder de área'?: string;
    Departamento?: string;
    fecha?: string;
    startDate?: string;
    dateOnly?: string;
    date?: string;
    isoYear?: number;
    weekNumber?: number;
    isoWeek?: number;
  }[],
  activeLeadersCatalog?: { department: string; leaderName: string }[],
  deletedDepartmentsList?: string[]
): BaseTeLeaderCatalog {
  const leaderToDeptMap = new Map<string, Set<string>>();
  const deptToLeaderMap = new Map<string, Set<string>>();
  const allDepts = new Set<string>();
  const allLeaders = new Set<string>();

  const deletedKeys = new Set((deletedDepartmentsList || []).map((d) => normalizeDeptKey(d)));

  // 1. Identificar el líder más reciente / actualizado para cada área desde registros
  const deptToLatestLeader = buildLatestDepartmentLeaderMap(records as any);

  // Integrar activeLeadersCatalog (custom overrides y altas manuales del catálogo)
  if (activeLeadersCatalog && Array.isArray(activeLeadersCatalog)) {
    for (const l of activeLeadersCatalog) {
      if (l.department && l.leaderName && l.leaderName.trim()) {
        const cDept = canonicalizeDepartment(l.department);
        const k = normalizeDeptKey(cDept);
        if (!deletedKeys.has(k)) {
          deptToLatestLeader.set(k, l.leaderName.trim());
          deptToLatestLeader.set(cDept, l.leaderName.trim());
        }
      }
    }
  }

  // 2. Mapear cada departamento canónico a su líder más actualizado
  if (records && Array.isArray(records)) {
    for (const r of records) {
      const rawDept = (r.department || (r as any)['Departamento'] || '').trim();
      if (!rawDept) continue;

      const canonicalDept = canonicalizeDepartment(rawDept);
      const deptKey = normalizeDeptKey(canonicalDept);
      if (deletedKeys.has(deptKey)) continue;

      allDepts.add(canonicalDept);

      const latestLeader = deptToLatestLeader.get(deptKey) || deptToLatestLeader.get(canonicalDept);

      if (latestLeader && latestLeader !== 'Sin Líder Asignado' && latestLeader !== 'Sin Asignar') {
        allLeaders.add(latestLeader);

        if (!leaderToDeptMap.has(latestLeader)) {
          leaderToDeptMap.set(latestLeader, new Set<string>());
        }
        leaderToDeptMap.get(latestLeader)!.add(canonicalDept);

        if (!deptToLeaderMap.has(canonicalDept)) {
          deptToLeaderMap.set(canonicalDept, new Set<string>());
        }
        deptToLeaderMap.get(canonicalDept)!.clear();
        deptToLeaderMap.get(canonicalDept)!.add(latestLeader);
      }
    }
  }

  // 3. Incluir departamentos del catálogo activo que hayan sido agregados manualmente o sin registros
  if (activeLeadersCatalog && Array.isArray(activeLeadersCatalog)) {
    for (const l of activeLeadersCatalog) {
      const cDept = canonicalizeDepartment(l.department);
      const deptKey = normalizeDeptKey(cDept);
      if (deletedKeys.has(deptKey)) continue;

      allDepts.add(cDept);
      const leaderName = l.leaderName?.trim();
      if (leaderName && leaderName !== 'Sin Líder Asignado' && leaderName !== 'Sin Asignar') {
        allLeaders.add(leaderName);

        if (!leaderToDeptMap.has(leaderName)) {
          leaderToDeptMap.set(leaderName, new Set<string>());
        }
        leaderToDeptMap.get(leaderName)!.add(cDept);

        if (!deptToLeaderMap.has(cDept)) {
          deptToLeaderMap.set(cDept, new Set<string>());
        }
        deptToLeaderMap.get(cDept)!.clear();
        deptToLeaderMap.get(cDept)!.add(leaderName);
      }
    }
  }

  return {
    leaderToDepartments: leaderToDeptMap,
    departmentToLeaders: deptToLeaderMap,
    leadersList: Array.from(allLeaders).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    departmentsList: Array.from(allDepts).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
  };
}

/**
 * Comprueba si un registro pertenece al ámbito del líder seleccionado,
 * verificando si el departamento del registro está bajo la responsabilidad de ese líder en Base TE.
 */
export function isRecordInLeaderScope(
  rec: { department?: string; leader?: string },
  selectedLeaders: string[],
  leaderToDeptMap?: Map<string, Set<string>>
): boolean {
  if (!selectedLeaders || selectedLeaders.length === 0 || selectedLeaders.includes('ALL')) {
    return true;
  }
  const recDeptNorm = rec.department ? normalizeDeptKey(rec.department) : '';

  for (const leader of selectedLeaders) {
    if (leader === 'ALL') return true;
    if (rec.leader && rec.leader.trim().toLowerCase() === leader.trim().toLowerCase()) {
      return true;
    }
    if (leaderToDeptMap && rec.department) {
      const depts = leaderToDeptMap.get(leader);
      if (depts) {
        if (depts.has(rec.department.trim())) {
          return true;
        }
        if (recDeptNorm) {
          for (const d of depts) {
            if (normalizeDeptKey(d) === recDeptNorm) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

export function applyFilters(
  overtimeList: OvertimeRecord[],
  attendanceList: AttendanceRecord[],
  filters: GlobalFilterState,
  leaderToDeptMap?: Map<string, Set<string>>
): { filteredOvertime: OvertimeRecord[]; filteredAttendance: AttendanceRecord[] } {
  // 1. Company Filter for Overtime: All companies eligible (MLBM, Polaquimia, Polatecnia, Barteleu, Becarios, Externos, etc.)
  const passesOvertimeCompany = (comp: string) => {
    const norm = (comp || '').toLowerCase();
    if (filters.companyPreset === 'POLAQUIMIA_ONLY') {
      return norm.includes('polaquimia');
    }
    if (filters.companyPreset === 'MAIN_THREE') {
      return norm.includes('polaquimia') || norm.includes('mlbm') || norm.includes('barteleu');
    }
    if (filters.companies.length > 0 && !filters.companies.includes('ALL')) {
      return filters.companies.some((c) => norm.includes(c.toLowerCase()));
    }
    return true; // "Todas las empresas": incluye todas las empresas (Polaquimia, MLBM, Barteleu, Polatecnia, Externos, Becarios, etc.)
  };

  // 2. Company Filter for Attendance:
  const passesAttendanceCompany = (comp: string) => {
    const norm = (comp || '').toLowerCase();
    if (filters.companyPreset === 'POLAQUIMIA_ONLY') {
      return norm.includes('polaquimia');
    }
    if (filters.companyPreset === 'MAIN_THREE') {
      return norm.includes('polaquimia') || norm.includes('mlbm') || norm.includes('barteleu');
    }
    if (filters.companies.length > 0 && !filters.companies.includes('ALL')) {
      return filters.companies.some((c) => norm.includes(c.toLowerCase()));
    }
    return true; // "Todas las empresas": incluye Polaquimia, MLBM, Barteleu, Polatecnia, Externos, Becarios
  };

  // 2. Index attendance syndication status by employeeId for cross-resolution
  const attendanceSyndicatedMap = new Map<string, boolean>();
  for (const att of attendanceList) {
    if (att.employeeId && att.isSyndicated !== undefined) {
      attendanceSyndicatedMap.set(att.employeeId, att.isSyndicated);
    }
  }

  const isOvertimeSyndicated = (rec: OvertimeRecord): boolean => {
    if (rec.isSyndicated !== undefined) return rec.isSyndicated;
    if (rec.employeeId && attendanceSyndicatedMap.has(rec.employeeId)) {
      return attendanceSyndicatedMap.get(rec.employeeId)!;
    }
    return determineSyndicatedStatus(rec.company || 'Polaquimia', '', rec.department);
  };

  // 3. Filter Overtime
  const filteredOvertime = overtimeList.filter((rec) => {
    if (!passesOvertimeCompany(rec.company)) return false;

    if (filters.departments.length > 0 && !filters.departments.includes('ALL')) {
      const recDeptNorm = normalizeDeptKey(rec.department);
      const matchesDept = filters.departments.some(
        (filterDept) =>
          filterDept === rec.department ||
          (recDeptNorm && normalizeDeptKey(filterDept) === recDeptNorm)
      );
      if (!matchesDept) return false;
    }

    if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
      if (!isRecordInLeaderScope(rec, filters.leaders, leaderToDeptMap)) return false;
    }

    if (filters.overtimeStatus !== 'ALL') {
      if (rec.status !== filters.overtimeStatus) return false;
    }

    if (filters.collaboratorType === 'SINDICALIZADO' && !isOvertimeSyndicated(rec)) return false;
    if (filters.collaboratorType === 'NO_SINDICALIZADO' && isOvertimeSyndicated(rec)) return false;

    // Filtro de Semana (Multiselección)
    const selectedWeeks =
      filters.weeks && filters.weeks.length > 0
        ? filters.weeks
        : filters.isoWeek && filters.isoWeek !== 'ALL'
        ? [filters.isoWeek]
        : [];
    if (selectedWeeks.length > 0 && !selectedWeeks.includes('ALL')) {
      const recWeekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
      const matchesWeek = selectedWeeks.some(
        (w) => w === recWeekKey || (rec.isoWeek && w.endsWith(String(rec.isoWeek).padStart(2, '0')))
      );
      if (!matchesWeek) return false;
    }

    // Filtro de Mes (Multiselección)
    const selectedMonths =
      filters.months && filters.months.length > 0
        ? filters.months
        : filters.month && filters.month !== 'ALL'
        ? [filters.month]
        : [];
    if (selectedMonths.length > 0 && !selectedMonths.includes('ALL')) {
      const matchesMonth = selectedMonths.some((m) => {
        if (m === 'ALL') return true;
        if (rec.dateOnly && rec.dateOnly.startsWith(m)) return true;
        const mNorm = m.toUpperCase().trim();
        const mNum =
          MONTH_NAMES_TO_NUM[mNorm] || (mNorm.includes('-') ? mNorm.split('-')[1].padStart(2, '0') : mNorm.padStart(2, '0'));
        if (rec.dateOnly && /^\d{4}-\d{2}/.test(rec.dateOnly) && rec.dateOnly.slice(5, 7) === mNum) return true;
        return false;
      });
      if (!matchesMonth) return false;
    }

    if (filters.specificDate) {
      if (rec.dateOnly !== filters.specificDate) return false;
    }

    if (filters.startDate && rec.dateOnly < filters.startDate) return false;
    if (filters.endDate && rec.dateOnly > filters.endDate) return false;

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const match =
        rec.employeeName.toLowerCase().includes(term) ||
        rec.employeeId.toLowerCase().includes(term) ||
        rec.reason.toLowerCase().includes(term) ||
        rec.department.toLowerCase().includes(term);
      if (!match) return false;
    }

    return true;
  });

  // 3. Filter Attendance (strictly Polaquimia, MLBM, Barteleu)
  const filteredAttendance = attendanceList.filter((rec) => {
    if (!passesAttendanceCompany(rec.company)) return false;

    if (filters.departments.length > 0 && !filters.departments.includes('ALL')) {
      const recDeptNorm = normalizeDeptKey(rec.department);
      const matchesDept = filters.departments.some(
        (filterDept) =>
          filterDept === rec.department ||
          (recDeptNorm && normalizeDeptKey(filterDept) === recDeptNorm)
      );
      if (!matchesDept) return false;
    }

    if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
      if (!isRecordInLeaderScope(rec, filters.leaders, leaderToDeptMap)) return false;
    }

    if (filters.collaboratorType === 'SINDICALIZADO' && !rec.isSyndicated) return false;
    if (filters.collaboratorType === 'NO_SINDICALIZADO' && rec.isSyndicated) return false;

    // Filtro de Semana (Multiselección)
    const selectedWeeks =
      filters.weeks && filters.weeks.length > 0
        ? filters.weeks
        : filters.isoWeek && filters.isoWeek !== 'ALL'
        ? [filters.isoWeek]
        : [];
    if (selectedWeeks.length > 0 && !selectedWeeks.includes('ALL')) {
      const recWeekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
      const matchesWeek = selectedWeeks.some((w) => w === recWeekKey);
      if (!matchesWeek) return false;
    }

    // Filtro de Mes (Multiselección)
    const selectedMonths =
      filters.months && filters.months.length > 0
        ? filters.months
        : filters.month && filters.month !== 'ALL'
        ? [filters.month]
        : [];
    if (selectedMonths.length > 0 && !selectedMonths.includes('ALL')) {
      const matchesMonth = selectedMonths.some((m) => {
        if (m === 'ALL') return true;
        if (rec.date && rec.date.startsWith(m)) return true;
        const mNorm = m.toUpperCase().trim();
        const mNum =
          MONTH_NAMES_TO_NUM[mNorm] || (mNorm.includes('-') ? mNorm.split('-')[1].padStart(2, '0') : mNorm.padStart(2, '0'));
        if (rec.date && /^\d{4}-\d{2}/.test(rec.date) && rec.date.slice(5, 7) === mNum) return true;
        return false;
      });
      if (!matchesMonth) return false;
    }

    if (filters.specificDate) {
      if (rec.date !== filters.specificDate) return false;
    }

    if (filters.startDate && rec.date < filters.startDate) return false;
    if (filters.endDate && rec.date > filters.endDate) return false;

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const match =
        rec.employeeName.toLowerCase().includes(term) ||
        rec.employeeId.toLowerCase().includes(term) ||
        rec.department.toLowerCase().includes(term) ||
        rec.nickname.toLowerCase().includes(term);
      if (!match) return false;
    }

    return true;
  });

  return { filteredOvertime, filteredAttendance };
}

export function computeKPIs(
  allOvertime: OvertimeRecord[],
  allAttendance: AttendanceRecord[],
  filters: GlobalFilterState,
  thresholds: ThresholdConfig,
  leaderToDeptMap?: Map<string, Set<string>>
): FilteredKPIs {
  const { filteredOvertime, filteredAttendance } = applyFilters(allOvertime, allAttendance, filters, leaderToDeptMap);

  // Date range covered
  let minDate = '';
  let maxDate = '';
  filteredOvertime.forEach((r) => {
    if (!minDate || r.dateOnly < minDate) minDate = r.dateOnly;
    if (!maxDate || r.dateOnly > maxDate) maxDate = r.dateOnly;
  });
  filteredAttendance.forEach((r) => {
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;
  });

  // Overtime calculations
  const totalOtRequests = filteredOvertime.length;
  let approvedOtRequests = 0;
  let pendingOtRequests = 0;
  let rejectedOtRequests = 0;
  let totalRequestedHours = 0;
  let totalApprovedHours = 0;
  let totalPendingHours = 0;

  const otEmployeesSet = new Set<string>();
  const deptHoursMap = new Map<string, { requested: number; approved: number; pending: number; count: number; company: string; leader: string }>();
  const dailyMetricsMap = new Map<string, DayMetric>();
  const weeklyMetricsMap = new Map<string, WeekMetric>();
  const reasonsMap = new Map<string, { category: string; count: number; hours: number }>();

  // Helper for weekly metric map
  const getOrCreateWeekMetric = (weekKey: string, isoYear: number, isoWeek: number): WeekMetric => {
    let week = weeklyMetricsMap.get(weekKey);
    if (!week) {
      week = {
        isoKey: weekKey,
        isoYear,
        isoWeek,
        weekLabel: getISOWeekDateRange(weekKey).label,
        requestedHours: 0,
        approvedHours: 0,
        absences: 0,
        eligibleShifts: 0,
        absenceRate: 0,
      };
      weeklyMetricsMap.set(weekKey, week);
    }
    return week;
  };

  filteredOvertime.forEach((rec) => {
    // Contar exclusivamente colaboradores con horasTotales > 0 (TE normal o prolongación)
    const recHours =
      rec.horasTotales !== undefined
        ? rec.horasTotales
        : ((rec.horasNormales || 0) + (rec.horasProlongacion || 0) ||
           rec.approvedHours ||
           rec.requestedHours ||
           0);

    if (recHours > 0 && rec.employeeId) {
      otEmployeesSet.add(rec.employeeId);
    }
    totalRequestedHours += rec.requestedHours;

    if (rec.status === 'APROBADO') {
      approvedOtRequests++;
      totalApprovedHours += rec.approvedHours;
    } else if (rec.status === 'PENDIENTE') {
      pendingOtRequests++;
      totalPendingHours += rec.requestedHours;
    } else if (rec.status === 'RECHAZADO') {
      rejectedOtRequests++;
    }

    // Dept map
    const canonicalDept = canonicalizeDepartment(rec.department);
    let targetDeptKey = canonicalDept;
    const recDeptNorm = normalizeDeptKey(canonicalDept);
    if (!deptHoursMap.has(targetDeptKey) && recDeptNorm) {
      for (const existingKey of deptHoursMap.keys()) {
        if (normalizeDeptKey(existingKey) === recDeptNorm) {
          targetDeptKey = existingKey;
          break;
        }
      }
    }
    const curDept = deptHoursMap.get(targetDeptKey) || {
      requested: 0,
      approved: 0,
      pending: 0,
      count: 0,
      company: rec.company,
      leader: rec.leader,
    };
    curDept.requested += rec.requestedHours;
    curDept.approved += rec.approvedHours;
    curDept.pending += rec.status === 'PENDIENTE' ? rec.requestedHours : 0;
    curDept.count++;
    if (rec.leader && rec.leader !== 'Sin Líder Asignado' && rec.leader !== 'Sin Líder') {
      curDept.leader = rec.leader;
    }
    deptHoursMap.set(targetDeptKey, curDept);

    // Daily metric
    const day = dailyMetricsMap.get(rec.dateOnly) || {
      date: rec.dateOnly,
      dayOfWeek: '',
      requestedHours: 0,
      approvedHours: 0,
      absences: 0,
      incidents: 0,
    };
    day.requestedHours += rec.requestedHours;
    day.approvedHours += rec.approvedHours;
    dailyMetricsMap.set(rec.dateOnly, day);

    // Weekly metric
    const weekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
    const week = getOrCreateWeekMetric(weekKey, rec.isoYear, rec.isoWeek);
    week.requestedHours += rec.requestedHours;
    week.approvedHours += rec.approvedHours;

    // Reason frequency
    const rKey = rec.suggestedOfficialReason || rec.reason || 'Sin Motivo';
    const rVal = reasonsMap.get(rKey) || { category: rec.reasonCategory || 'General', count: 0, hours: 0 };
    rVal.count++;
    rVal.hours += rec.requestedHours;
    reasonsMap.set(rKey, rVal);
  });

  const approvalRateByRequests = totalOtRequests > 0 ? Math.round((approvedOtRequests / totalOtRequests) * 1000) / 10 : 0;
  const approvalRateByHours = totalRequestedHours > 0 ? Math.round((totalApprovedHours / totalRequestedHours) * 1000) / 10 : 0;
  const collaboratorsWithOtCount = otEmployeesSet.size;
  const uniqueDeptCount = Math.max(deptHoursMap.size, 1);
  const avgHoursPerCollaborator = collaboratorsWithOtCount > 0 ? Math.round((totalApprovedHours / collaboratorsWithOtCount) * 10) / 10 : 0;
  const avgHoursPerDepartment = Math.round((totalApprovedHours / uniqueDeptCount) * 10) / 10;

  // Attendance calculations
  let totalEligibleShifts = 0;
  let totalAbsences = 0;
  let punchIncidentsCount = 0;
  let justifiedExceptionsCount = 0;

  let synEligibleShifts = 0;
  let synAbsences = 0;
  let nonSynEligibleShifts = 0;
  let nonSynAbsences = 0;

  const deptAttendanceMap = new Map<string, { eligible: number; absences: number; company: string; leader: string }>();

  filteredAttendance.forEach((rec) => {
    // Only eligible shifts (1, 1s, 2, 2s, 3, 3s, CM, C)
    if (rec.isScheduleEligible) {
      totalEligibleShifts++;

      if (rec.isSyndicated) {
        synEligibleShifts++;
      } else {
        nonSynEligibleShifts++;
      }

      const canonicalAttDept = canonicalizeDepartment(rec.department);
      let targetAttDeptKey = canonicalAttDept;
      const attDeptNorm = normalizeDeptKey(canonicalAttDept);
      if (!deptAttendanceMap.has(targetAttDeptKey) && attDeptNorm) {
        for (const existingKey of deptAttendanceMap.keys()) {
          if (normalizeDeptKey(existingKey) === attDeptNorm) {
            targetAttDeptKey = existingKey;
            break;
          }
        }
      }
      const dAtt = deptAttendanceMap.get(targetAttDeptKey) || {
        eligible: 0,
        absences: 0,
        company: rec.company,
        leader: rec.leader,
      };
      dAtt.eligible++;
      if (rec.leader && rec.leader !== 'Sin Líder Asignado' && rec.leader !== 'Sin Líder') {
        dAtt.leader = rec.leader;
      }

      if (rec.absenceStatus === 'AUSENCIA_CONFIRMADA' || rec.absenceStatus === 'AUSENCIA_PROBABLE') {
        totalAbsences++;
        dAtt.absences++;
        if (rec.isSyndicated) synAbsences++;
        else nonSynAbsences++;

        // Add to daily
        const day = dailyMetricsMap.get(rec.date) || {
          date: rec.date,
          dayOfWeek: rec.dayOfWeek,
          requestedHours: 0,
          approvedHours: 0,
          absences: 0,
          incidents: 0,
        };
        day.absences++;
        day.dayOfWeek = rec.dayOfWeek;
        dailyMetricsMap.set(rec.date, day);

        // Add to weekly
        const weekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
        const week = getOrCreateWeekMetric(weekKey, rec.isoYear, rec.isoWeek);
        week.absences++;
      } else if (rec.absenceStatus === 'INCIDENCIA_MARCAJE') {
        punchIncidentsCount++;
        const day = dailyMetricsMap.get(rec.date) || {
          date: rec.date,
          dayOfWeek: rec.dayOfWeek,
          requestedHours: 0,
          approvedHours: 0,
          absences: 0,
          incidents: 0,
        };
        day.incidents++;
        dailyMetricsMap.set(rec.date, day);
      } else if (rec.absenceStatus === 'JUSTIFICADO_EXCEPCION') {
        justifiedExceptionsCount++;
      }

      deptAttendanceMap.set(targetAttDeptKey, dAtt);

      // Track week eligible shifts
      const weekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
      const week = getOrCreateWeekMetric(weekKey, rec.isoYear, rec.isoWeek);
      week.eligibleShifts++;
    }
  });

  const absenceRate = totalEligibleShifts > 0 ? Math.round((totalAbsences / totalEligibleShifts) * 1000) / 10 : 0;
  const syndicatedAbsenceRate = synEligibleShifts > 0 ? Math.round((synAbsences / synEligibleShifts) * 1000) / 10 : 0;
  const nonSyndicatedAbsenceRate = nonSynEligibleShifts > 0 ? Math.round((nonSynAbsences / nonSynEligibleShifts) * 1000) / 10 : 0;

  // Build combined department metrics
  const allDeptNames = Array.from(new Set([...Array.from(deptHoursMap.keys()), ...Array.from(deptAttendanceMap.keys())]));
  const departmentsMetrics: DepartmentMetric[] = allDeptNames.map((dept) => {
    const ot = deptHoursMap.get(dept);
    const att = deptAttendanceMap.get(dept);

    const reqH = ot ? Math.round(ot.requested * 10) / 10 : 0;
    const appH = ot ? Math.round(ot.approved * 10) / 10 : 0;
    const penH = ot ? Math.round(ot.pending * 10) / 10 : 0;
    const otCount = ot ? ot.count : 0;

    const elShifts = att ? att.eligible : 0;
    const absCount = att ? att.absences : 0;
    const deptAbsRate = elShifts > 0 ? Math.round((absCount / elShifts) * 1000) / 10 : 0;

    const isSimultaneousAlert = appH >= thresholds.overtimeHighWarningDeptHours && deptAbsRate >= thresholds.absenceHighWarningRate;

    return {
      department: dept,
      company: ot?.company || att?.company || 'Polaquimia',
      leader: ot?.leader || att?.leader || 'Sin Asignar',
      requestedHours: reqH,
      approvedHours: appH,
      pendingHours: penH,
      otRequestsCount: otCount,
      eligibleShifts: elShifts,
      absencesCount: absCount,
      absenceRate: deptAbsRate,
      isSimultaneousAlert,
    };
  });

  departmentsMetrics.sort((a, b) => b.approvedHours - a.approvedHours);

  // Daily array sorted
  const dailyMetrics = Array.from(dailyMetricsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Weekly array sorted with rate calculation
  const weeklyMetrics = Array.from(weeklyMetricsMap.values())
    .map((w) => ({
      ...w,
      absenceRate: w.eligibleShifts > 0 ? Math.round((w.absences / w.eligibleShifts) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.isoKey.localeCompare(b.isoKey));

  // Reasons array
  const reasonsFrequency = Array.from(reasonsMap.entries())
    .map(([reason, val]) => ({
      reason,
      category: val.category,
      count: val.count,
      hours: Math.round(val.hours * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // Status distribution
  const statusDistribution = [
    { name: 'Aprobadas', value: approvedOtRequests, color: '#16a34a' },
    { name: 'Pendientes', value: pendingOtRequests, color: '#eab308' },
    { name: 'Rechazadas', value: rejectedOtRequests, color: '#ef4444' },
  ].filter((s) => s.value > 0);

  // Historical comparison logic (Previous week if single week selected, or previous period)
  let previousPeriodAvailable = false;
  let previousApprovedHours: number | null = null;
  let previousAbsences: number | null = null;
  let previousAbsenceRate: number | null = null;
  let diffApprovedHoursPct: number | null = null;
  let diffAbsenceRatePct: number | null = null;

  if (weeklyMetrics.length >= 2) {
    const currentWeekIdx = weeklyMetrics.length - 1;
    const prevWeekIdx = currentWeekIdx - 1;
    const prev = weeklyMetrics[prevWeekIdx];
    const curr = weeklyMetrics[currentWeekIdx];

    previousPeriodAvailable = true;
    previousApprovedHours = prev.approvedHours;
    previousAbsences = prev.absences;
    previousAbsenceRate = prev.absenceRate;

    if (prev.approvedHours > 0) {
      diffApprovedHoursPct = Math.round(((curr.approvedHours - prev.approvedHours) / prev.approvedHours) * 1000) / 10;
    }
    if (prev.absenceRate > 0) {
      diffAbsenceRatePct = Math.round(((curr.absenceRate - prev.absenceRate) / prev.absenceRate) * 1000) / 10;
    }
  }

  // Semaphores
  let absenceSemaphore: 'VERDE' | 'AMARILLO' | 'ROJO' = 'VERDE';
  if (absenceRate >= thresholds.absenceCriticalRate) {
    absenceSemaphore = 'ROJO';
  } else if (absenceRate >= thresholds.absenceHighWarningRate) {
    absenceSemaphore = 'AMARILLO';
  }

  let overtimeSemaphore: 'VERDE' | 'AMARILLO' | 'ROJO' = 'VERDE';
  if (totalPendingHours > 30 || approvalRateByHours < 60) {
    overtimeSemaphore = 'AMARILLO';
  }
  if (totalPendingHours > 60) {
    overtimeSemaphore = 'ROJO';
  }

  return {
    filteredOvertime,
    filteredAttendance,
    totalOtRequests,
    approvedOtRequests,
    pendingOtRequests,
    rejectedOtRequests,
    totalRequestedHours: Math.round(totalRequestedHours * 10) / 10,
    totalApprovedHours: Math.round(totalApprovedHours * 10) / 10,
    totalPendingHours: Math.round(totalPendingHours * 10) / 10,
    approvalRateByRequests,
    approvalRateByHours,
    collaboratorsWithOtCount,
    avgHoursPerCollaborator,
    avgHoursPerDepartment,
    totalEligibleShifts,
    totalAbsences,
    absenceRate,
    punchIncidentsCount,
    justifiedExceptionsCount,
    syndicatedAbsences: synAbsences,
    nonSyndicatedAbsences: nonSynAbsences,
    syndicatedAbsenceRate,
    nonSyndicatedAbsenceRate,
    previousPeriodAvailable,
    previousApprovedHours,
    previousAbsences,
    previousAbsenceRate,
    diffApprovedHoursPct,
    diffAbsenceRatePct,
    departmentsMetrics,
    dailyMetrics,
    weeklyMetrics,
    reasonsFrequency,
    statusDistribution,
    absenceSemaphore,
    overtimeSemaphore,
    dateRangeCovered: minDate && maxDate ? { start: minDate, end: maxDate } : null,
  };
}

// ============================================================================
// SELECTORES Y MOTORES DE CÁLCULO PARA EL RESUMEN EJECUTIVO (5 KPIS + 2 GRÁFICAS)
// ============================================================================

export interface ExecutiveKPIsData {
  totalOvertimeHours: {
    total: number;
    normales: number;
    prolongacion: number;
    globalTotal: number;
    percentageOfGlobal: number;
  };
  unjustifiedAbsences: {
    count: number;
    equivalentHours: number;
    globalCount: number;
    percentageOfGlobal: number;
  };
  justifiedAbsences: {
    count: number;
    equivalentHours: number;
    globalCount: number;
    percentageOfGlobal: number;
    breakdown: { type: string; count: number }[];
    breakdownSummary: string;
  };
  topOvertimeDepartment: {
    department: string;
    hours: number;
    leader: string;
  } | null;
  topAbsenceDepartment: {
    department: string;
    rate: number;
    hours: number;
    absencesCount: number;
  } | null;
}

export interface DepartmentOvertimeChartItem {
  department: string;
  hours: number;
  percentage: number;
  dates: string[];
  datesFormatted: string;
  shifts: {
    '1er Turno': number;
    '2do Turno': number;
    '3er Turno': number;
  };
  shiftsList: string[];
}

export interface DepartmentAbsenceChartItem {
  department: string;
  absences: number;
  percentage: number;
  dates: string[];
  datesFormatted: string;
  shifts: {
    '1er Turno': number;
    '2do Turno': number;
    '3er Turno': number;
  };
  shiftsList: string[];
}

export interface ExecutiveSummaryCalculations {
  kpis: ExecutiveKPIsData;
  overtimeChart: DepartmentOvertimeChartItem[];
  absenceChart: DepartmentAbsenceChartItem[];
}

/**
 * Normaliza y verifica si un tipo de ausencia corresponde a Falta Injustificada.
 */
export function isUnjustifiedAbsence(absenceType?: string): boolean {
  if (!absenceType) return false;
  const norm = absenceType.trim().toLowerCase();
  return norm === 'falta injustificada' || norm === 'faltas injustificadas';
}

/**
 * Normaliza una denominación de turno a '1er Turno' | '2do Turno' | '3er Turno'.
 */
export function normalizeShiftName(rawTurno?: string, schedule?: string): '1er Turno' | '2do Turno' | '3er Turno' {
  const text = `${rawTurno || ''} ${schedule || ''}`.toLowerCase();
  if (text.includes('3') || text.includes('tercer') || text.includes('nocturn')) {
    return '3er Turno';
  }
  if (text.includes('2') || text.includes('segundo') || text.includes('vespertin')) {
    return '2do Turno';
  }
  return '1er Turno';
}

/**
 * Formatea una lista de fechas ordenadas para presentación amigable en tooltips y tablas.
 */
export function formatDatesSummary(dates: string[]): string {
  if (!dates || dates.length === 0) return 'Sin fechas registradas';
  const uniqueSorted = Array.from(new Set(dates)).filter(Boolean).sort();
  if (uniqueSorted.length === 0) return 'Sin fechas registradas';

  if (uniqueSorted.length <= 3) {
    return uniqueSorted
      .map((d) => {
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
      })
      .join(', ');
  }

  const first = uniqueSorted[0];
  const last = uniqueSorted[uniqueSorted.length - 1];
  const fParts = first.split('-');
  const lParts = last.split('-');
  const fStr = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}` : first;
  const lStr = lParts.length === 3 ? `${lParts[2]}/${lParts[1]}` : last;

  return `${fStr} al ${lStr} (${uniqueSorted.length} fechas)`;
}

export interface ExecutiveCalculationParams {
  annualOvertime?: AnnualOvertimeRecord[];
  matrixRecords?: WeeklyMatrixRecord[];
  absenceRecords?: AbsenceRecord[];
  allOvertime?: OvertimeRecord[];
  allAttendance?: AttendanceRecord[];
  filters: GlobalFilterState;
  leaderToDeptMap?: Map<string, Set<string>>;
}

export const MONTH_NAMES_TO_NUM: Record<string, string> = {
  ENERO: '01',
  FEBRERO: '02',
  MARZO: '03',
  ABRIL: '04',
  MAYO: '05',
  JUNIO: '06',
  JULIO: '07',
  AGOSTO: '08',
  SEPTIEMBRE: '09',
  OCTUBRE: '10',
  NOVIEMBRE: '11',
  DICIEMBRE: '12',
};

export const NUM_TO_MONTH_NAME: Record<string, string> = {
  '01': 'ENERO',
  '02': 'FEBRERO',
  '03': 'MARZO',
  '04': 'ABRIL',
  '05': 'MAYO',
  '06': 'JUNIO',
  '07': 'JULIO',
  '08': 'AGOSTO',
  '09': 'SEPTIEMBRE',
  '10': 'OCTUBRE',
  '11': 'NOVIEMBRE',
  '12': 'DICIEMBRE',
};

/**
 * Normaliza y formatea un mes para visualización en mayúsculas (ej. "NOVIEMBRE" o "NOVIEMBRE 2026")
 */
export function formatMonthNameDisplay(monthValue: string, allMonths: string[] = []): string {
  if (!monthValue || monthValue === 'ALL') return 'Todos los meses';
  const val = monthValue.trim();

  // Comprobar si hay múltiples años para incluir el año en el formato
  const years = new Set<string>();
  for (const m of allMonths) {
    if (m && m.includes('-')) {
      years.add(m.split('-')[0]);
    }
  }
  const hasMultipleYears = years.size > 1;

  if (val.includes('-')) {
    const [year, mNum] = val.split('-');
    const padded = mNum.padStart(2, '0');
    const name = NUM_TO_MONTH_NAME[padded] || val;
    return hasMultipleYears ? `${name} ${year}` : name;
  }

  const upper = val.toUpperCase();
  if (MONTH_NAMES_TO_NUM[upper]) return upper;
  const numPadded = val.padStart(2, '0');
  if (NUM_TO_MONTH_NAME[numPadded]) return NUM_TO_MONTH_NAME[numPadded];
  return upper;
}

/**
 * Filtro exclusivo de temporalidad (Semana y Mes) para las dos gráficas analíticas.
 * Ignora Departamento, Líder y Búsqueda rápida.
 */
export function passesPeriodFilterOnly(
  item: {
    fecha?: string;
    startDate?: string;
    endDate?: string;
    dateOnly?: string;
    date?: string;
    isoYear?: number;
    isoWeek?: number;
    weekNumber?: number;
    week?: string;
    monthNumber?: number;
  },
  filters: GlobalFilterState
): boolean {
  // Filtro de Semana (Multiselección con fallback a isoWeek)
  const selectedWeeks =
    filters.weeks && filters.weeks.length > 0
      ? filters.weeks
      : filters.isoWeek && filters.isoWeek !== 'ALL'
      ? [filters.isoWeek]
      : [];

  if (selectedWeeks.length > 0 && !selectedWeeks.includes('ALL')) {
    let recIsoKey = '';
    const wNum = item.isoWeek || item.weekNumber;
    if (item.isoYear && wNum) {
      recIsoKey = `${item.isoYear}-W${String(wNum).padStart(2, '0')}`;
    } else if (item.week) {
      const match = item.week.match(/\d+/);
      if (match) {
        const year = item.isoYear || 2026;
        recIsoKey = `${year}-W${match[0].padStart(2, '0')}`;
      }
    }
    const recShort = item.week ? item.week.toUpperCase() : '';

    const matchesWeek = selectedWeeks.some((sel) => {
      if (sel === 'ALL') return true;
      const selNorm = sel.toUpperCase();
      if (recIsoKey && recIsoKey.toUpperCase() === selNorm) return true;
      if (recShort && recShort === selNorm) return true;
      if (wNum && selNorm.endsWith(String(wNum).padStart(2, '0'))) return true;
      return false;
    });

    if (!matchesWeek) return false;
  }

  // Filtro de Mes (Multiselección con fallback a month)
  const selectedMonths =
    filters.months && filters.months.length > 0
      ? filters.months
      : filters.month && filters.month !== 'ALL'
      ? [filters.month]
      : [];

  if (selectedMonths.length > 0 && !selectedMonths.includes('ALL')) {
    const dStr = item.fecha || item.startDate || item.date || item.dateOnly || '';
    const endStr = item.endDate || dStr;
    const mNumStr = item.monthNumber ? String(item.monthNumber).padStart(2, '0') : '';
    const mYearKey = item.isoYear && item.monthNumber ? `${item.isoYear}-${mNumStr}` : '';

    const matchesMonth = selectedMonths.some((sel) => {
      if (sel === 'ALL') return true;
      const selNorm = sel.toUpperCase().trim();
      if (dStr && dStr.startsWith(sel)) return true;
      if (endStr && endStr.startsWith(sel)) return true;
      if (mYearKey && mYearKey === sel) return true;

      const monthNumFromSel =
        MONTH_NAMES_TO_NUM[selNorm] ||
        (selNorm.includes('-') ? selNorm.split('-')[1].padStart(2, '0') : selNorm.padStart(2, '0'));

      if (dStr && /^\d{4}-\d{2}/.test(dStr) && dStr.slice(5, 7) === monthNumFromSel) return true;
      if (endStr && /^\d{4}-\d{2}/.test(endStr) && endStr.slice(5, 7) === monthNumFromSel) return true;
      if (mNumStr && mNumStr === monthNumFromSel) return true;

      return false;
    });

    if (!matchesMonth) return false;
  }

  return true;
}

/**
 * Filtro completo para los 5 KPIs (Semana, Mes, Departamento, Líder de Área y Búsqueda rápida).
 */
export function passesFullExecutiveFilter(
  item: {
    department?: string;
    Departamento?: string;
    leader?: string;
    liderArea?: string;
    'Líder de área'?: string;
    employeeName?: string;
    Nombre?: string;
    colaborador?: string;
    employeeId?: string;
    ID?: string;
    fecha?: string;
    startDate?: string;
    endDate?: string;
    dateOnly?: string;
    date?: string;
    isoYear?: number;
    isoWeek?: number;
    weekNumber?: number;
    week?: string;
    monthNumber?: number;
    reason?: string;
    absenceType?: string;
    'Tipo de ausentismo'?: string;
  },
  filters: GlobalFilterState,
  leaderToDeptMap?: Map<string, Set<string>>
): boolean {
  // 1. Validar Semana y Mes primero
  if (!passesPeriodFilterOnly(item, filters)) return false;

  // 2. Filtro de Departamento
  const rawDept = item.department || item.Departamento || '';
  if (filters.departments.length > 0 && !filters.departments.includes('ALL')) {
    const cDept = canonicalizeDepartment(rawDept);
    const recDeptNorm = normalizeDeptKey(cDept);
    const matchesDept = filters.departments.some(
      (d) => d === cDept || (recDeptNorm && normalizeDeptKey(d) === recDeptNorm)
    );
    if (!matchesDept) return false;
  }

  // 3. Filtro de Líder de Área (usando ámbito relacional de Base TE)
  if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
    const leaderVal = item.leader || item.liderArea || item['Líder de área'];
    if (!isRecordInLeaderScope({ department: rawDept, leader: leaderVal }, filters.leaders, leaderToDeptMap)) {
      return false;
    }
  }

  // 4. Búsqueda rápida
  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.toLowerCase();
    const name = String(item.employeeName || item.Nombre || item.colaborador || '').toLowerCase();
    const id = String(item.employeeId || item.ID || '').toLowerCase();
    const dept = String(rawDept).toLowerCase();
    const extra = String(item.reason || item.absenceType || item['Tipo de ausentismo'] || '').toLowerCase();

    if (!name.includes(term) && !id.includes(term) && !dept.includes(term) && !extra.includes(term)) {
      return false;
    }
  }

  return true;
}

/**
 * Calcula los 5 Indicadores Clave (KPI Cards) del Resumen Ejecutivo:
 * 1. Horas Extra Totales (normales + prolongación vs global)
 * 2. Ausencias sin Justificación (conteo de "Falta injustificada", hrs equivalentes vs global)
 * 3. Ausencias con Justificación (conteo justificadas, desglose principales vs global)
 * 4. Mayor Volumen de Tiempo Extra (departamento líder en TE, horas y su líder asignado)
 * 5. Mayor Tasa de Ausentismo (departamento con mayor tasa/incidencia y horas de ausencia)
 */
export function calculateExecutiveKPIs(params: ExecutiveCalculationParams): ExecutiveKPIsData {
  const {
    annualOvertime = [],
    matrixRecords = [],
    absenceRecords = [],
    allOvertime = [],
    allAttendance = [],
    filters,
    leaderToDeptMap,
  } = params;

  // 1. Determinar fuente de Tiempo Extra
  const rawOtSource: any[] =
    matrixRecords.length > 0
      ? matrixRecords
      : annualOvertime.length > 0
      ? annualOvertime
      : allOvertime;

  // 2. Determinar fuente de Ausentismo
  const rawAbsSource: any[] =
    absenceRecords.length > 0
      ? absenceRecords
      : allAttendance.filter(
          (a) => a.absenceStatus === 'AUSENCIA_CONFIRMADA' || a.absenceStatus === 'AUSENCIA_PROBABLE'
        );

  // Totales Globales (sin filtros)
  let globalTotalOtHours = 0;
  for (const r of rawOtSource) {
    const hTot =
      r.horasTotales !== undefined
        ? r.horasTotales
        : (r.horasNormales || 0) + (r.horasProlongacion || 0) ||
          r.hours ||
          r.approvedHours ||
          r.requestedHours ||
          0;
    globalTotalOtHours += hTot;
  }

  let globalUnjustifiedCount = 0;
  let globalJustifiedCount = 0;
  for (const r of rawAbsSource) {
    const qty = Number(r.absences) || 1;
    const type = r.absenceType || r['Tipo de ausentismo'] || (r.hasException ? 'Justificado' : 'Falta injustificada');
    if (isUnjustifiedAbsence(type)) {
      globalUnjustifiedCount += qty;
    } else {
      globalJustifiedCount += qty;
    }
  }

  // Filtrar registros para la selección actual (Semana, Mes, Departamento, Líder, etc.)
  const filteredOt = rawOtSource.filter((r) => passesFullExecutiveFilter(r, filters, leaderToDeptMap));
  const filteredAbs = rawAbsSource.filter((r) => passesFullExecutiveFilter(r, filters, leaderToDeptMap));

  // KPI 1: Horas Extra Totales
  let selNormales = 0;
  let selProlongacion = 0;
  let selTotalOt = 0;

  // Mapeo por departamento para KPI 4
  const deptOtMap = new Map<string, { totalHours: number; leader: string }>();

  for (const r of filteredOt) {
    const hNorm = r.horasNormales !== undefined ? r.horasNormales : (r.hours || r.approvedHours || r.requestedHours || 0);
    const hProl = r.horasProlongacion !== undefined ? r.horasProlongacion : 0;
    const hTot = r.horasTotales !== undefined ? r.horasTotales : hNorm + hProl;

    selNormales += hNorm;
    selProlongacion += hProl;
    selTotalOt += hTot;

    const dept = canonicalizeDepartment(r.department || r.Departamento || 'Sin Departamento');
    const existing = deptOtMap.get(dept) || {
      totalHours: 0,
      leader: r.leader || r.liderArea || r['Líder de área'] || 'Sin Asignar',
    };
    existing.totalHours += hTot;
    if (r.leader && r.leader !== 'Sin Líder Asignado' && r.leader !== 'Sin Asignar') {
      existing.leader = r.leader;
    }
    deptOtMap.set(dept, existing);
  }

  const pctOtOfGlobal = globalTotalOtHours > 0 ? Math.round((selTotalOt / globalTotalOtHours) * 1000) / 10 : 0;

  // KPI 2 y KPI 3: Ausencias sin y con Justificación
  let selUnjustifiedCount = 0;
  let selJustifiedCount = 0;
  const justifiedTypeCounts = new Map<string, number>();

  // Mapeo por departamento para KPI 5
  const deptAbsMap = new Map<string, { absences: number; eligibleShifts: number }>();

  for (const r of filteredAbs) {
    const qty = Number(r.absences) || 1;
    const type = r.absenceType || r['Tipo de ausentismo'] || (r.hasException ? 'Justificado' : 'Falta injustificada');
    const dept = canonicalizeDepartment(r.department || r.Departamento || 'Sin Departamento');

    if (isUnjustifiedAbsence(type)) {
      selUnjustifiedCount += qty;
    } else {
      selJustifiedCount += qty;
      const cleanType = String(type).trim() || 'Otras Justificadas';
      justifiedTypeCounts.set(cleanType, (justifiedTypeCounts.get(cleanType) || 0) + qty);
    }

    const cur = deptAbsMap.get(dept) || { absences: 0, eligibleShifts: 0 };
    cur.absences += qty;
    deptAbsMap.set(dept, cur);
  }

  // Si allAttendance está presente, cruzar jornadas elegibles para calcular tasa exacta de ausentismo
  if (allAttendance.length > 0) {
    const filteredAtt = allAttendance.filter((a) => passesFullExecutiveFilter(a, filters, leaderToDeptMap));
    for (const a of filteredAtt) {
      if (a.isScheduleEligible) {
        const dept = canonicalizeDepartment(a.department || 'Sin Departamento');
        const cur = deptAbsMap.get(dept) || { absences: 0, eligibleShifts: 0 };
        cur.eligibleShifts++;
        deptAbsMap.set(dept, cur);
      }
    }
  }

  const pctUnjOfGlobal = globalUnjustifiedCount > 0 ? Math.round((selUnjustifiedCount / globalUnjustifiedCount) * 1000) / 10 : 0;
  const pctJustOfGlobal = globalJustifiedCount > 0 ? Math.round((selJustifiedCount / globalJustifiedCount) * 1000) / 10 : 0;

  // Desglose de tipos justificados ordenados
  const justifiedBreakdown = Array.from(justifiedTypeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const breakdownSummary =
    justifiedBreakdown.length > 0
      ? justifiedBreakdown.slice(0, 3).map((item) => `${item.type} (${item.count})`).join(', ')
      : 'Sin ausencias justificadas';

  // KPI 4: Mayor Volumen de Tiempo Extra
  let topOtDept: { department: string; hours: number; leader: string } | null = null;
  const deptOtArray = Array.from(deptOtMap.entries())
    .map(([dept, data]) => ({
      department: dept,
      hours: Math.round(data.totalHours * 10) / 10,
      leader: data.leader,
    }))
    .sort((a, b) => b.hours - a.hours);

  if (deptOtArray.length > 0 && deptOtArray[0].hours > 0) {
    topOtDept = deptOtArray[0];
  }

  // KPI 5: Mayor Tasa de Ausentismo
  let topAbsDept: { department: string; rate: number; hours: number; absencesCount: number } | null = null;
  const totalSelAbsences = selUnjustifiedCount + selJustifiedCount;

  const deptAbsArray = Array.from(deptAbsMap.entries())
    .map(([dept, data]) => {
      let rate = 0;
      if (data.eligibleShifts > 0) {
        rate = Math.round((data.absences / data.eligibleShifts) * 1000) / 10;
      } else if (totalSelAbsences > 0) {
        rate = Math.round((data.absences / totalSelAbsences) * 1000) / 10;
      }
      return {
        department: dept,
        rate,
        hours: Math.round(data.absences * 8 * 10) / 10,
        absencesCount: data.absences,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.absencesCount - a.absencesCount);

  if (deptAbsArray.length > 0 && deptAbsArray[0].absencesCount > 0) {
    topAbsDept = deptAbsArray[0];
  }

  return {
    totalOvertimeHours: {
      total: Math.round(selTotalOt * 10) / 10,
      normales: Math.round(selNormales * 10) / 10,
      prolongacion: Math.round(selProlongacion * 10) / 10,
      globalTotal: Math.round(globalTotalOtHours * 10) / 10,
      percentageOfGlobal: pctOtOfGlobal,
    },
    unjustifiedAbsences: {
      count: selUnjustifiedCount,
      equivalentHours: Math.round(selUnjustifiedCount * 8 * 10) / 10,
      globalCount: globalUnjustifiedCount,
      percentageOfGlobal: pctUnjOfGlobal,
    },
    justifiedAbsences: {
      count: selJustifiedCount,
      equivalentHours: Math.round(selJustifiedCount * 8 * 10) / 10,
      globalCount: globalJustifiedCount,
      percentageOfGlobal: pctJustOfGlobal,
      breakdown: justifiedBreakdown,
      breakdownSummary,
    },
    topOvertimeDepartment: topOtDept,
    topAbsenceDepartment: topAbsDept,
  };
}

/**
 * Calcula la Gráfica 1: "Tiempo Extra por Departamento".
 * REGLA ESTRICTA: Responde ÚNICAMENTE a Semana (ISO 8601) y Mes.
 * Ignora Departamento, Líder de Área y Búsqueda rápida para mostrar la comparativa completa.
 */
export function calculateDepartmentOvertimeChart(params: {
  annualOvertime?: AnnualOvertimeRecord[];
  matrixRecords?: WeeklyMatrixRecord[];
  allOvertime?: OvertimeRecord[];
  filters: GlobalFilterState;
}): DepartmentOvertimeChartItem[] {
  const { annualOvertime = [], matrixRecords = [], allOvertime = [], filters } = params;

  const rawSource: any[] =
    matrixRecords.length > 0
      ? matrixRecords
      : annualOvertime.length > 0
      ? annualOvertime
      : allOvertime;

  // Filtrado estricto por Semana y Mes únicamente
  const periodFiltered = rawSource.filter((r) => passesPeriodFilterOnly(r, filters));

  const deptMap = new Map<
    string,
    {
      hours: number;
      dates: Set<string>;
      shifts: { '1er Turno': number; '2do Turno': number; '3er Turno': number };
    }
  >();

  let periodTotalHours = 0;

  for (const r of periodFiltered) {
    const hTot =
      r.horasTotales !== undefined
        ? r.horasTotales
        : (r.horasNormales || 0) + (r.horasProlongacion || 0) ||
          r.hours ||
          r.approvedHours ||
          r.requestedHours ||
          0;

    if (hTot <= 0) continue;
    periodTotalHours += hTot;

    const dept = canonicalizeDepartment(r.department || r.Departamento || 'Sin Departamento');
    const existing = deptMap.get(dept) || {
      hours: 0,
      dates: new Set<string>(),
      shifts: { '1er Turno': 0, '2do Turno': 0, '3er Turno': 0 },
    };

    existing.hours += hTot;

    // Fechas asociadas
    if (r.diasDetalle && Array.isArray(r.diasDetalle)) {
      for (const d of r.diasDetalle) {
        if ((d.horasTotales || d.horasNormales || d.horasProlongacion) > 0 && d.dateStr) {
          existing.dates.add(d.dateStr);
        }
      }
    } else {
      const dt = r.fecha || r.startDate || r.dateOnly || '';
      if (dt) existing.dates.add(dt);
    }

    // Turnos asociados
    if (r.horasPorTurno) {
      if (r.horasPorTurno.turno1 > 0) existing.shifts['1er Turno'] += r.horasPorTurno.turno1;
      if (r.horasPorTurno.turno2 > 0) existing.shifts['2do Turno'] += r.horasPorTurno.turno2;
      if (r.horasPorTurno.turno3 > 0) existing.shifts['3er Turno'] += r.horasPorTurno.turno3;
    } else {
      const sName = normalizeShiftName(r.turno);
      existing.shifts[sName] += hTot;
    }

    deptMap.set(dept, existing);
  }

  const result: DepartmentOvertimeChartItem[] = Array.from(deptMap.entries())
    .map(([department, data]) => {
      const hours = Math.round(data.hours * 10) / 10;
      const pct = periodTotalHours > 0 ? Math.round((hours / periodTotalHours) * 1000) / 10 : 0;
      const datesArr = Array.from(data.dates).sort();

      const shifts = {
        '1er Turno': Math.round(data.shifts['1er Turno'] * 10) / 10,
        '2do Turno': Math.round(data.shifts['2do Turno'] * 10) / 10,
        '3er Turno': Math.round(data.shifts['3er Turno'] * 10) / 10,
      };

      const shiftsList: string[] = [];
      if (shifts['1er Turno'] > 0) shiftsList.push(`1er Turno: ${shifts['1er Turno'].toFixed(1)} hrs`);
      if (shifts['2do Turno'] > 0) shiftsList.push(`2do Turno: ${shifts['2do Turno'].toFixed(1)} hrs`);
      if (shifts['3er Turno'] > 0) shiftsList.push(`3er Turno: ${shifts['3er Turno'].toFixed(1)} hrs`);

      return {
        department,
        hours,
        percentage: pct,
        dates: datesArr,
        datesFormatted: formatDatesSummary(datesArr),
        shifts,
        shiftsList: shiftsList.length > 0 ? shiftsList : ['1er Turno'],
      };
    })
    .sort((a, b) => b.hours - a.hours);

  return result;
}

/**
 * Calcula la Gráfica 2: "Ausentismo por Departamento".
 * REGLA ESTRICTA: Responde ÚNICAMENTE a Semana (ISO 8601) y Mes.
 * Ignora Departamento, Líder de Área y Búsqueda rápida para mostrar la comparativa completa.
 */
export function calculateDepartmentAbsenceChart(params: {
  absenceRecords?: AbsenceRecord[];
  allAttendance?: AttendanceRecord[];
  filters: GlobalFilterState;
}): DepartmentAbsenceChartItem[] {
  const { absenceRecords = [], allAttendance = [], filters } = params;

  // Directorio auxiliar de turnos por colaborador y fecha desde BioTime
  const scheduleDirectory = new Map<string, string>();
  for (const att of allAttendance) {
    if (att.employeeId) {
      if (att.date) scheduleDirectory.set(`${att.employeeId.trim()}_${att.date}`, att.schedule);
      scheduleDirectory.set(att.employeeId.trim(), att.schedule);
    }
  }

  const rawSource: any[] =
    absenceRecords.length > 0
      ? absenceRecords
      : allAttendance.filter(
          (a) => a.absenceStatus === 'AUSENCIA_CONFIRMADA' || a.absenceStatus === 'AUSENCIA_PROBABLE'
        );

  // Filtrado estricto por Semana y Mes únicamente
  const periodFiltered = rawSource.filter((r) => passesPeriodFilterOnly(r, filters));

  const deptMap = new Map<
    string,
    {
      absences: number;
      dates: Set<string>;
      shifts: { '1er Turno': number; '2do Turno': number; '3er Turno': number };
    }
  >();

  let periodTotalAbsences = 0;

  for (const r of periodFiltered) {
    const qty = Number(r.absences) || 1;
    if (qty <= 0) continue;
    periodTotalAbsences += qty;

    const dept = canonicalizeDepartment(r.department || r.Departamento || 'Sin Departamento');
    const existing = deptMap.get(dept) || {
      absences: 0,
      dates: new Set<string>(),
      shifts: { '1er Turno': 0, '2do Turno': 0, '3er Turno': 0 },
    };

    existing.absences += qty;

    // Fechas asociadas
    const start = r.startDate || r.date || '';
    const end = r.endDate || start;
    if (start) existing.dates.add(start);
    if (end && end !== start) existing.dates.add(end);

    // Turno asociado
    const empId = String(r.employeeId || r.ID || '').trim();
    const schedMatch = (start && scheduleDirectory.get(`${empId}_${start}`)) || scheduleDirectory.get(empId);
    const sName = normalizeShiftName(r.turno || r.schedule, schedMatch);
    existing.shifts[sName] += qty;

    deptMap.set(dept, existing);
  }

  const result: DepartmentAbsenceChartItem[] = Array.from(deptMap.entries())
    .map(([department, data]) => {
      const absences = Math.round(data.absences * 10) / 10;
      const pct = periodTotalAbsences > 0 ? Math.round((absences / periodTotalAbsences) * 1000) / 10 : 0;
      const datesArr = Array.from(data.dates).sort();

      const shifts = {
        '1er Turno': Math.round(data.shifts['1er Turno'] * 10) / 10,
        '2do Turno': Math.round(data.shifts['2do Turno'] * 10) / 10,
        '3er Turno': Math.round(data.shifts['3er Turno'] * 10) / 10,
      };

      const shiftsList: string[] = [];
      if (shifts['1er Turno'] > 0) shiftsList.push(`1er Turno: ${shifts['1er Turno']} aus.`);
      if (shifts['2do Turno'] > 0) shiftsList.push(`2do Turno: ${shifts['2do Turno']} aus.`);
      if (shifts['3er Turno'] > 0) shiftsList.push(`3er Turno: ${shifts['3er Turno']} aus.`);

      return {
        department,
        absences,
        percentage: pct,
        dates: datesArr,
        datesFormatted: formatDatesSummary(datesArr),
        shifts,
        shiftsList: shiftsList.length > 0 ? shiftsList : ['1er Turno'],
      };
    })
    .sort((a, b) => b.absences - a.absences);

  return result;
}

/**
 * Función unificada para calcular todo el Resumen Ejecutivo en una sola llamada:
 * 5 KPIs y 2 Gráficas analíticas con sus reglas de filtrado respectivas.
 */
export function calculateExecutiveSummaryData(params: ExecutiveCalculationParams): ExecutiveSummaryCalculations {
  const kpis = calculateExecutiveKPIs(params);
  const overtimeChart = calculateDepartmentOvertimeChart({
    annualOvertime: params.annualOvertime,
    matrixRecords: params.matrixRecords,
    allOvertime: params.allOvertime,
    filters: params.filters,
  });
  const absenceChart = calculateDepartmentAbsenceChart({
    absenceRecords: params.absenceRecords,
    allAttendance: params.allAttendance,
    filters: params.filters,
  });

  return { kpis, overtimeChart, absenceChart };
}
