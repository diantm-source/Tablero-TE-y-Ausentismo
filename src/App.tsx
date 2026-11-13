import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  DepartmentLeader,
  GlobalFilterState,
  NavigationSection,
  ReasonCatalogItem,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from './types';
import { AppStorage, DEFAULT_THRESHOLDS, PrecalculatedCatalogs } from './services/storage';
import { computeKPIs, extractBaseTeLeaderCatalog } from './services/kpiEngine';
import {
  enrichMatrixWithLeaders,
  canonicalizeDepartment,
  normalizeDeptKey,
  buildLatestDepartmentLeaderMap,
  updateRecordsWithLatestLeaders,
} from './services/overtimeParser';
import { syncRemoteAbsences, syncRemoteAll, syncRemoteMatriz } from './services/cloudSync';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { GlobalFilters } from './components/GlobalFilters';
import { ExecutiveSummaryView } from './components/views/ExecutiveSummaryView';

// Code-splitting / Lazy loading de vistas secundarias pesadas
const OvertimeAnalysisView = React.lazy(() =>
  import('./components/views/OvertimeAnalysisView').then((m) => ({ default: m.OvertimeAnalysisView }))
);
const AttendanceAnalysisView = React.lazy(() =>
  import('./components/views/AttendanceAnalysisView').then((m) => ({ default: m.AttendanceAnalysisView }))
);
const DepartmentsLeadersView = React.lazy(() =>
  import('./components/views/DepartmentsLeadersView').then((m) => ({ default: m.DepartmentsLeadersView }))
);
const DataAuditView = React.lazy(() =>
  import('./components/views/DataAuditView').then((m) => ({ default: m.DataAuditView }))
);
const FileImportView = React.lazy(() =>
  import('./components/views/FileImportView').then((m) => ({ default: m.FileImportView }))
);
const CatalogsConfigView = React.lazy(() =>
  import('./components/views/CatalogsConfigView').then((m) => ({ default: m.CatalogsConfigView }))
);

const ViewSkeleton = () => (
  <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3 p-8">
    <div className="w-9 h-9 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    <p className="text-slate-400 text-xs font-medium">Cargando módulo...</p>
  </div>
);

function buildPrecalculatedCatalogs(
  ot: import('./types').OvertimeRecord[],
  att: import('./types').AttendanceRecord[],
  annualOt: AnnualOvertimeRecord[],
  matriz: WeeklyMatrixRecord[],
  absences: AbsenceRecord[]
): PrecalculatedCatalogs {
  const baseSource = annualOt.length > 0 ? annualOt : ot;
  const rawCatalog = extractBaseTeLeaderCatalog(baseSource);

  const leaderToDepartments: Record<string, string[]> = {};
  rawCatalog.leaderToDepartments.forEach((depts, leader) => {
    leaderToDepartments[leader] = Array.from(depts);
  });

  const departmentToLeader: Record<string, string> = {};
  rawCatalog.departmentToLeaders.forEach((leaders, dept) => {
    const first = Array.from(leaders)[0];
    if (first) departmentToLeader[dept] = first;
  });

  const weeksSet = new Set<string>();
  ot.forEach((r) => weeksSet.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`));
  att.forEach((r) => weeksSet.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`));
  annualOt.forEach((r) => {
    if (r.isoYear && r.weekNumber) weeksSet.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
  });
  matriz.forEach((r) => {
    if (r.isoYear && r.weekNumber) weeksSet.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
  });
  absences.forEach((r) => {
    if (r.isoYear && r.weekNumber) weeksSet.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
  });
  const availableWeeks = Array.from(weeksSet).sort().reverse();

  const monthsSet = new Set<string>();
  ot.forEach((r) => r.dateOnly && monthsSet.add(r.dateOnly.slice(0, 7)));
  att.forEach((r) => r.date && monthsSet.add(r.date.slice(0, 7)));
  annualOt.forEach((r) => {
    if (r.fecha && /^\d{4}-\d{2}/.test(r.fecha)) {
      monthsSet.add(r.fecha.slice(0, 7));
    } else if (r.isoYear && r.monthNumber) {
      monthsSet.add(`${r.isoYear}-${String(r.monthNumber).padStart(2, '0')}`);
    }
  });
  matriz.forEach((r) => {
    if (r.isoYear && r.monthNumber) {
      monthsSet.add(`${r.isoYear}-${String(r.monthNumber).padStart(2, '0')}`);
    }
  });
  absences.forEach((r) => {
    if (r.startDate && /^\d{4}-\d{2}/.test(r.startDate)) {
      monthsSet.add(r.startDate.slice(0, 7));
    }
  });
  const availableMonths = Array.from(monthsSet).sort().reverse();

  let minDate = '';
  let maxDate = '';
  const dateCandidates: string[] = [];
  if (ot.length > 0) {
    ot.forEach((r) => r.dateOnly && dateCandidates.push(r.dateOnly));
  }
  if (dateCandidates.length > 0) {
    dateCandidates.sort();
    minDate = dateCandidates[0];
    maxDate = dateCandidates[dateCandidates.length - 1];
  }

  const recordsCount = ot.length + att.length + annualOt.length + matriz.length + absences.length;

  return {
    departmentToLeader,
    leaderToDepartments,
    leadersList: rawCatalog.leadersList,
    departmentsList: rawCatalog.departmentsList,
    availableWeeks,
    availableMonths,
    minDate,
    maxDate,
    recordsCount,
    calculatedAt: new Date().toISOString(),
  };
}

const DEFAULT_FILTERS: GlobalFilterState = {
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

export default function App() {
  const [currentSection, setCurrentSection] = useState<NavigationSection>('executive');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Core Data State
  const [overtimeRecords, setOvertimeRecords] = useState<import('./types').OvertimeRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<import('./types').AttendanceRecord[]>([]);
  const [annualOvertimeRecords, setAnnualOvertimeRecords] = useState<AnnualOvertimeRecord[]>([]);
  const [weeklyMatrixRecords, setWeeklyMatrixRecords] = useState<WeeklyMatrixRecord[]>([]);
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  const [departmentLeaders, setDepartmentLeaders] = useState<DepartmentLeader[]>([]);
  const [reasonsCatalog, setReasonsCatalog] = useState<ReasonCatalogItem[]>([]);
  const [auditIncidents, setAuditIncidents] = useState<import('./types').AuditIncident[]>([]);
  const [importHistory, setImportHistory] = useState<import('./types').ImportHistoryItem[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [cachedCatalogs, setCachedCatalogs] = useState<PrecalculatedCatalogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Global Filters State
  const [filters, setFilters] = useState<GlobalFilterState>(DEFAULT_FILTERS);

  // Sync state helper: Carga inmediata desde IndexedDB sin red
  const reloadData = async () => {
    try {
      const [
        ot,
        att,
        annualOt,
        matriz,
        absences,
        leaders,
        reasons,
        audit,
        history,
        thresh,
        lastSync,
        storedCatalogs,
      ] = await Promise.all([
        AppStorage.getOvertimeRecords(),
        AppStorage.getAttendanceRecords(),
        AppStorage.getAnnualOvertimeRecords(),
        AppStorage.getWeeklyMatrixRecords(),
        AppStorage.getAbsenceRecords(),
        AppStorage.getDepartmentLeaders(),
        AppStorage.getReasonsCatalog(),
        AppStorage.getAuditIncidents(),
        AppStorage.getImportHistory(),
        AppStorage.getThresholds(),
        AppStorage.getLastSyncTimestamp(),
        AppStorage.getPrecalculatedCatalogs(),
      ]);

      // 1. Unificar y determinar líderes más recientes por área
      const allSourceRecords = [...annualOt, ...ot, ...matriz, ...absences];
      const deptToLatestLeader = buildLatestDepartmentLeaderMap(allSourceRecords as any);

      // Integrar líderes asignados en catálogo de líderes
      for (const l of leaders) {
        if (l.department && l.leaderName && l.leaderName.trim()) {
          const cDept = canonicalizeDepartment(l.department);
          deptToLatestLeader.set(normalizeDeptKey(cDept), l.leaderName.trim());
          deptToLatestLeader.set(cDept, l.leaderName.trim());
        }
      }

      // 2. Actualizar todas las colecciones con departamento canónico y su líder más reciente
      const updatedAnnualOt = updateRecordsWithLatestLeaders(annualOt, deptToLatestLeader);
      const updatedOt = updateRecordsWithLatestLeaders(ot, deptToLatestLeader);
      const enrichedMatriz = updateRecordsWithLatestLeaders(
        enrichMatrixWithLeaders(matriz, updatedAnnualOt),
        deptToLatestLeader
      );
      const updatedAbsences = updateRecordsWithLatestLeaders(absences, deptToLatestLeader);
      const updatedAtt = updateRecordsWithLatestLeaders(att, deptToLatestLeader);

      setOvertimeRecords(updatedOt);
      setAttendanceRecords(updatedAtt);
      setAnnualOvertimeRecords(updatedAnnualOt);
      setWeeklyMatrixRecords(enrichedMatriz);
      setAbsenceRecords(updatedAbsences);
      setDepartmentLeaders(leaders);
      setReasonsCatalog(reasons);
      setAuditIncidents(audit);
      setImportHistory(history);
      setThresholds(thresh);
      if (lastSync) setLastSyncTimestamp(lastSync);

      const currentTotal =
        updatedOt.length +
        updatedAtt.length +
        updatedAnnualOt.length +
        enrichedMatriz.length +
        updatedAbsences.length;

      if (storedCatalogs && storedCatalogs.recordsCount === currentTotal && currentTotal > 0) {
        setCachedCatalogs(storedCatalogs);
      } else if (currentTotal > 0) {
        // Calcular de forma diferida y persistir en IndexedDB
        const calculated = buildPrecalculatedCatalogs(
          updatedOt,
          updatedAtt,
          updatedAnnualOt,
          enrichedMatriz,
          updatedAbsences
        );
        setCachedCatalogs(calculated);
        AppStorage.savePrecalculatedCatalogs(calculated).catch((err) =>
          console.warn('Error al guardar catálogos precalculados:', err)
        );
      }
    } catch (err) {
      console.error('Error al cargar datos desde IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCloud = async () => {
    setIsSyncing(true);
    try {
      const [otResult, absResult, matrizResult] = await Promise.allSettled([
        syncRemoteAll(undefined, reasonsCatalog),
        syncRemoteAbsences(),
        syncRemoteMatriz(),
      ]);

      if (matrizResult.status === 'fulfilled') {
        setLastSyncTimestamp(matrizResult.value.syncTime);
      } else {
        console.warn('Error al sincronizar Matriz Semanal desde Sheets:', matrizResult.reason);
      }

      if (otResult.status === 'fulfilled') {
        setLastSyncTimestamp(otResult.value.syncTime);
      } else {
        console.warn('Error al sincronizar Tiempo Extra desde Sheets:', otResult.reason);
      }

      if (absResult.status === 'fulfilled') {
        setLastSyncTimestamp(absResult.value.syncTime);
      } else {
        console.warn('Error al sincronizar Ausentismo desde Sheets:', absResult.reason);
      }

      if (otResult.status === 'rejected' && absResult.status === 'rejected' && matrizResult.status === 'rejected') {
        throw (matrizResult.reason || otResult.reason);
      }

      await reloadData();
    } finally {
      setIsSyncing(false);
    }
  };

  // Arquitectura Cache-First Instantánea:
  // 1. Mostrar de inmediato datos procesados de IndexedDB al montar sin esperar a la red
  // 2. Si IndexedDB ya contiene datos, NO descargar automáticamente desde Google Sheets
  // 3. Descargar únicamente si la base está completamente vacía (primera visita) o por clic manual
  useEffect(() => {
    let isMounted = true;
    const initApp = async () => {
      try {
        await AppStorage.init();
        await reloadData();

        // Verificar si la base local está completamente vacía
        const [otCount, attCount, matrizCount] = await Promise.all([
          AppStorage.getOvertimeRecords().then((r) => r.length),
          AppStorage.getAttendanceRecords().then((r) => r.length),
          AppStorage.getWeeklyMatrixRecords().then((r) => r.length),
        ]);

        const isCompletelyEmpty = otCount === 0 && attCount === 0 && matrizCount === 0;
        if (isCompletelyEmpty && isMounted) {
          // Descarga inicial solo cuando IndexedDB no tiene registros
          handleSyncCloud();
        }
      } catch (err) {
        console.error('Error inicializando aplicación:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initApp();

    return () => {
      isMounted = false;
    };
  }, []);

  // Lista oficial estática de empresas
  const availableCompanies = useMemo(() => {
    return ['POLAQUIMIA', 'MLBM', 'BARTELEU', 'POLATECNIA', 'BECARIOS', 'EXTERNOS'];
  }, []);

  // Catálogo relacional Líder de Área <-> Departamentos obtenido de caché en O(1)
  const baseTeCatalog = useMemo(() => {
    if (cachedCatalogs) {
      const leaderToDepartments = new Map<string, Set<string>>();
      Object.entries(cachedCatalogs.leaderToDepartments).forEach(([l, depts]) => {
        leaderToDepartments.set(l, new Set(depts));
      });
      const departmentToLeaders = new Map<string, Set<string>>();
      Object.entries(cachedCatalogs.departmentToLeader).forEach(([d, l]) => {
        departmentToLeaders.set(d, new Set([l]));
      });
      return {
        leaderToDepartments,
        departmentToLeaders,
        leadersList: cachedCatalogs.leadersList,
        departmentsList: cachedCatalogs.departmentsList,
      };
    }
    const baseSource = annualOvertimeRecords.length > 0 ? annualOvertimeRecords : overtimeRecords;
    return extractBaseTeLeaderCatalog(baseSource);
  }, [cachedCatalogs, annualOvertimeRecords, overtimeRecords]);

  // Lista única y ordenada alfabéticamente de Líderes de Área
  const availableLeaders = useMemo(() => {
    return baseTeCatalog.leadersList;
  }, [baseTeCatalog.leadersList]);

  // Departamentos reales de Base TE (filtrados en cascada si hay un Líder seleccionado)
  const availableDepartments = useMemo(() => {
    if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) {
      const depts = new Set<string>();
      for (const l of filters.leaders) {
        const assigned = baseTeCatalog.leaderToDepartments.get(l);
        if (assigned) {
          assigned.forEach((d) => depts.add(d));
        }
      }
      if (depts.size > 0) {
        return Array.from(depts).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      }
    }
    return baseTeCatalog.departmentsList;
  }, [baseTeCatalog, filters.leaders]);

  // Semanas disponibles utilizando caché para no recorrer 42,000+ filas en cada render
  const availableWeeks = useMemo(() => {
    if (cachedCatalogs && cachedCatalogs.availableWeeks.length > 0) {
      return cachedCatalogs.availableWeeks;
    }
    const set = new Set<string>();
    overtimeRecords.forEach((r) => {
      set.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`);
    });
    attendanceRecords.forEach((r) => {
      set.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`);
    });
    annualOvertimeRecords.forEach((r) => {
      if (r.isoYear && r.weekNumber) {
        set.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
      }
    });
    weeklyMatrixRecords.forEach((r) => {
      if (r.isoYear && r.weekNumber) {
        set.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
      }
    });
    absenceRecords.forEach((r) => {
      if (r.isoYear && r.weekNumber) {
        set.add(`${r.isoYear}-W${String(r.weekNumber).padStart(2, '0')}`);
      }
    });
    return Array.from(set).sort().reverse();
  }, [cachedCatalogs, overtimeRecords, attendanceRecords, annualOvertimeRecords, weeklyMatrixRecords, absenceRecords]);

  // Meses disponibles utilizando caché para no recorrer 42,000+ filas en cada render
  const availableMonths = useMemo(() => {
    if (cachedCatalogs && cachedCatalogs.availableMonths.length > 0) {
      return cachedCatalogs.availableMonths;
    }
    const set = new Set<string>();
    overtimeRecords.forEach((r) => r.dateOnly && set.add(r.dateOnly.slice(0, 7)));
    attendanceRecords.forEach((r) => r.date && set.add(r.date.slice(0, 7)));
    annualOvertimeRecords.forEach((r) => {
      if (r.fecha && /^\d{4}-\d{2}/.test(r.fecha)) {
        set.add(r.fecha.slice(0, 7));
      } else if (r.isoYear && r.monthNumber) {
        set.add(`${r.isoYear}-${String(r.monthNumber).padStart(2, '0')}`);
      }
    });
    weeklyMatrixRecords.forEach((r) => {
      if (r.isoYear && r.monthNumber) {
        set.add(`${r.isoYear}-${String(r.monthNumber).padStart(2, '0')}`);
      }
    });
    absenceRecords.forEach((r) => {
      if (r.startDate && /^\d{4}-\d{2}/.test(r.startDate)) {
        set.add(r.startDate.slice(0, 7));
      }
    });
    return Array.from(set).sort().reverse();
  }, [cachedCatalogs, overtimeRecords, attendanceRecords, annualOvertimeRecords, weeklyMatrixRecords, absenceRecords]);

  // Compute KPIs with live filters, thresholds & leader-department relational scope
  const kpis = useMemo(() => {
    return computeKPIs(overtimeRecords, attendanceRecords, filters, thresholds, baseTeCatalog.leaderToDepartments);
  }, [overtimeRecords, attendanceRecords, filters, thresholds, baseTeCatalog.leaderToDepartments]);

  // Número de filtros activos para badge en botón de móvil
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.leaders.length > 0 && !filters.leaders.includes('ALL')) count++;
    if (filters.departments.length > 0 && !filters.departments.includes('ALL')) count++;
    if (filters.isoWeek && filters.isoWeek !== 'ALL') count++;
    if (filters.month && filters.month !== 'ALL') count++;
    if (filters.startDate || filters.endDate || filters.specificDate) count++;
    if (filters.overtimeStatus && filters.overtimeStatus !== 'ALL') count++;
    if (filters.searchTerm && filters.searchTerm.trim()) count++;
    return count;
  }, [filters]);

  const handleFilterChange = (updated: Partial<GlobalFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleResetSeedData = async () => {
    await reloadData();
  };

  const handleClearDatabase = async () => {
    await AppStorage.clearAllData();
    await reloadData();
    handleResetFilters();
  };

  const handleSaveLeader = async (updated: DepartmentLeader) => {
    const cur = await AppStorage.getDepartmentLeaders();
    const map = new Map(cur.map((l) => [l.department.toLowerCase(), l]));
    map.set(updated.department.toLowerCase(), updated);
    const list = Array.from(map.values());
    await AppStorage.saveDepartmentLeaders(list);
    await reloadData();
  };

  const handleSaveReasons = async (reasons: ReasonCatalogItem[]) => {
    await AppStorage.saveReasonsCatalog(reasons);
    await reloadData();
  };

  const handleSaveThresholds = async (newThresholds: ThresholdConfig) => {
    await AppStorage.saveThresholds(newThresholds);
    await reloadData();
  };

  const handleClearIncidents = async () => {
    await AppStorage.saveAuditIncidents([]);
    await reloadData();
  };

  const handleDeleteBatch = async (batchId: string, fileName?: string) => {
    await AppStorage.deleteImportBatch(batchId, fileName);
    await reloadData();
  };

  const handleUpdateBatch = async (batchId: string, updated: Partial<import('./types').ImportHistoryItem>) => {
    await AppStorage.updateImportBatch(batchId, updated);
    await reloadData();
  };

  const handleClearDemoData = async () => {
    await AppStorage.clearDemoData();
    await reloadData();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-100 text-slate-800 antialiased font-sans">
      {/* Top Application Header */}
      <Header
        currentSection={currentSection}
        onNavigate={setCurrentSection}
        dateRange={kpis.dateRangeCovered}
        filteredRecordsCount={{
          ot: kpis.filteredOvertime.length,
          att: kpis.filteredAttendance.length,
        }}
        totalRecordsCount={{
          ot: overtimeRecords.length,
          att: attendanceRecords.length,
        }}
        onResetSeedData={handleResetSeedData}
        onSyncCloud={handleSyncCloud}
        lastSyncTimestamp={lastSyncTimestamp}
        isSyncing={isSyncing}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        activeFiltersCount={activeFiltersCount}
        showFiltersButton={currentSection !== 'import' && currentSection !== 'catalogs'}
      />

      {/* Main Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Desktop Navigation Sidebar (Fijo y Estático) */}
        <div className="hidden lg:flex shrink-0 h-full">
          <Sidebar
            currentSection={currentSection}
            onNavigate={setCurrentSection}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            pendingOtCount={kpis.pendingOtRequests}
            auditIncidentsCount={auditIncidents.length}
          />
        </div>

        {/* Desktop Global Filter Bar (Fijo y Estático en vistas analíticas) */}
        {currentSection !== 'import' && currentSection !== 'catalogs' && (
          <div className="hidden lg:flex shrink-0 h-full">
            <GlobalFilters
              filters={filters}
              onChangeFilters={handleFilterChange}
              onResetFilters={handleResetFilters}
              availableCompanies={availableCompanies}
              availableDepartments={availableDepartments}
              availableLeaders={availableLeaders}
              availableWeeks={availableWeeks}
              availableMonths={availableMonths}
              filteredCounts={{
                ot: kpis.filteredOvertime.length,
                att: kpis.filteredAttendance.length,
              }}
              totalRecordsCount={{
                ot: overtimeRecords.length,
                att: attendanceRecords.length,
              }}
              isCollapsed={filtersCollapsed}
              onToggleCollapsed={() => setFiltersCollapsed(!filtersCollapsed)}
              leaderToDeptMap={baseTeCatalog.leaderToDepartments}
            />
          </div>
        )}

        {/* Content Area (Scroll independiente únicamente en tablas y gráficas) */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-6">
          <Suspense fallback={<ViewSkeleton />}>
            {currentSection === 'executive' && (
              <ExecutiveSummaryView
                kpis={kpis}
                thresholds={thresholds}
                onNavigate={setCurrentSection}
              />
            )}

            {currentSection === 'overtime' && (
              <OvertimeAnalysisView
                kpis={kpis}
                allOvertime={overtimeRecords}
                allAttendance={attendanceRecords}
                annualOvertime={annualOvertimeRecords}
                matrixRecords={weeklyMatrixRecords}
                filters={filters}
                isSyncing={isSyncing}
                onSyncCloud={handleSyncCloud}
                leaderToDeptMap={baseTeCatalog.leaderToDepartments}
              />
            )}

            {currentSection === 'attendance' && (
              <AttendanceAnalysisView
                kpis={kpis}
                allAttendance={attendanceRecords}
                allOvertime={overtimeRecords}
                absenceRecords={absenceRecords}
                filters={filters}
                isSyncing={isSyncing}
                onSyncCloud={handleSyncCloud}
                leaderToDeptMap={baseTeCatalog.leaderToDepartments}
              />
            )}

            {currentSection === 'departments' && (
              <DepartmentsLeadersView
                kpis={kpis}
                leadersCatalog={departmentLeaders}
                onSaveLeader={handleSaveLeader}
                thresholds={thresholds}
              />
            )}

            {currentSection === 'audit' && (
              <DataAuditView
                incidents={auditIncidents}
                onClearIncidents={handleClearIncidents}
              />
            )}

            {currentSection === 'import' && (
              <FileImportView
                reasonsCatalog={reasonsCatalog}
                importHistory={importHistory}
                onImportCompleted={() => {
                  reloadData();
                  setCurrentSection('executive');
                }}
                onClearDatabase={handleClearDatabase}
                onDeleteBatch={handleDeleteBatch}
                onUpdateBatch={handleUpdateBatch}
                onClearDemoData={handleClearDemoData}
                onRefreshData={reloadData}
                totalRecords={{
                  ot: overtimeRecords.length,
                  att: attendanceRecords.length,
                }}
              />
            )}

            {currentSection === 'catalogs' && (
              <CatalogsConfigView
                reasonsCatalog={reasonsCatalog}
                onSaveReasons={handleSaveReasons}
                leadersCatalog={departmentLeaders}
                onSaveLeaders={setDepartmentLeaders}
                thresholds={thresholds}
                onSaveThresholds={handleSaveThresholds}
                onRefreshData={reloadData}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Drawer Móvil: Menú Lateral (☰) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-slate-900 z-10 shadow-2xl flex flex-col animate-in slide-in-from-left duration-250">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <i className="bi bi-grid-fill text-blue-400"></i>
                <span className="font-bold text-sm">Módulos del Sistema</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar menú móvil"
              >
                <i className="bi bi-x-lg text-base"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar
                currentSection={currentSection}
                onNavigate={(sec) => {
                  setCurrentSection(sec);
                  setMobileMenuOpen(false);
                }}
                collapsed={false}
                onToggleCollapse={() => {}}
                pendingOtCount={kpis.pendingOtRequests}
                auditIncidentsCount={auditIncidents.length}
                isMobileDrawer={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drawer Móvil: Filtros Globales (🌪️) con botón "Aplicar / Cerrar" */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-80 max-w-[90vw] h-full bg-slate-900 z-10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <span className="text-sm" aria-hidden="true">🌪️</span>
                <span className="font-bold text-sm">Filtros Globales</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                    {activeFiltersCount} activo{activeFiltersCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar filtros"
              >
                <i className="bi bi-x-lg text-base"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <GlobalFilters
                filters={filters}
                onChangeFilters={handleFilterChange}
                onResetFilters={handleResetFilters}
                availableCompanies={availableCompanies}
                availableDepartments={availableDepartments}
                availableLeaders={availableLeaders}
                availableWeeks={availableWeeks}
                availableMonths={availableMonths}
                filteredCounts={{
                  ot: kpis.filteredOvertime.length,
                  att: kpis.filteredAttendance.length,
                }}
                totalRecordsCount={{
                  ot: overtimeRecords.length,
                  att: attendanceRecords.length,
                }}
                isCollapsed={false}
                onToggleCollapsed={() => {}}
                hideCollapseButton={true}
                leaderToDeptMap={baseTeCatalog.leaderToDepartments}
              />
            </div>

            {/* Botón Aplicar / Cerrar en la parte inferior */}
            <div className="p-3.5 bg-slate-900 border-t border-slate-800 shadow-lg">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                <i className="bi bi-check2 text-base"></i>
                <span>Aplicar / Cerrar Filtros</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-blue-800 text-blue-100 text-[10px] font-mono px-2 py-0.5 rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
