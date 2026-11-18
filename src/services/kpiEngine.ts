import {
  AttendanceRecord,
  GlobalFilterState,
  OvertimeRecord,
  ThresholdConfig,
} from '../types';
import { determineSyndicatedStatus, getISOWeekDateRange } from './businessRules';
import {
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
  updateRecordsWithLatestLeaders,
} from './overtimeParser';

export {
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
  updateRecordsWithLatestLeaders,
};

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

    if (filters.isoWeek && filters.isoWeek !== 'ALL') {
      const recWeekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
      if (recWeekKey !== filters.isoWeek) return false;
    }

    if (filters.month && filters.month !== 'ALL') {
      if (!rec.dateOnly.startsWith(filters.month)) return false;
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

    if (filters.isoWeek && filters.isoWeek !== 'ALL') {
      const recWeekKey = `${rec.isoYear}-W${String(rec.isoWeek).padStart(2, '0')}`;
      if (recWeekKey !== filters.isoWeek) return false;
    }

    if (filters.month && filters.month !== 'ALL') {
      if (!rec.date.startsWith(filters.month)) return false;
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
