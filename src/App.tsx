import React, { useState, useEffect, useMemo } from 'react';
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
import { AppStorage, DEFAULT_THRESHOLDS } from './services/storage';
import { computeKPIs, extractBaseTeLeaderCatalog } from './services/kpiEngine';
import { enrichMatrixWithLeaders } from './services/overtimeParser';
import { syncRemoteAbsences, syncRemoteAll, syncRemoteMatriz } from './services/cloudSync';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { GlobalFilters } from './components/GlobalFilters';
import { ExecutiveSummaryView } from './components/views/ExecutiveSummaryView';
import { OvertimeAnalysisView } from './components/views/OvertimeAnalysisView';
import { AttendanceAnalysisView } from './components/views/AttendanceAnalysisView';
import { DepartmentsLeadersView } from './components/views/DepartmentsLeadersView';
import { DataAuditView } from './components/views/DataAuditView';
import { FileImportView } from './components/views/FileImportView';
import { CatalogsConfigView } from './components/views/CatalogsConfigView';

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
  const [loading, setLoading] = useState(true);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Global Filters State
  const [filters, setFilters] = useState<GlobalFilterState>(DEFAULT_FILTERS);

  // Sync state helper
  const reloadData = async () => {
    try {
      const [ot, att, annualOt, matriz, absences, leaders, reasons, audit, history, thresh, lastSync] = await Promise.all([
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
      ]);
      setOvertimeRecords(ot);
      setAttendanceRecords(att);
      setAnnualOvertimeRecords(annualOt);
      const enrichedMatriz = enrichMatrixWithLeaders(matriz, annualOt);
      setWeeklyMatrixRecords(enrichedMatriz);
      setAbsenceRecords(absences);
      setDepartmentLeaders(leaders);
      setReasonsCatalog(reasons);
      setAuditIncidents(audit);
      setImportHistory(history);
      setThresholds(thresh);
      if (lastSync) setLastSyncTimestamp(lastSync);
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

  useEffect(() => {
    const initApp = async () => {
      await AppStorage.init();
      // Try initial remote sync (Matriz Semanal + Tiempo Extra + Ausentismo); fallback seamlessly to local IndexedDB
      const [matrizResult, otResult, absResult] = await Promise.allSettled([
        syncRemoteMatriz(),
        syncRemoteAll(),
        syncRemoteAbsences(),
      ]);

      if (matrizResult.status === 'fulfilled') {
        setLastSyncTimestamp(matrizResult.value.syncTime);
      } else {
        console.warn('Sincronización inicial remota de Matriz en espera:', matrizResult.reason);
      }

      if (otResult.status === 'fulfilled') {
        setLastSyncTimestamp(otResult.value.syncTime);
      } else {
        console.warn('Sincronización inicial remota de TE en espera:', otResult.reason);
      }

      if (absResult.status === 'fulfilled') {
        setLastSyncTimestamp(absResult.value.syncTime);
      } else {
        console.warn('Sincronización inicial remota de Ausentismo en espera:', absResult.reason);
      }

      await reloadData();
    };
    initApp();
  }, []);

  // Compute available filter options from current data
  const availableCompanies = useMemo(() => {
    // Lista oficial requerida por el usuario:
    // MLBM, POLAQUIMIA, POLATECNIA, BARTELEU, BECARIOS y EXTERNOS
    const baseList = ['POLAQUIMIA', 'MLBM', 'BARTELEU', 'POLATECNIA', 'BECARIOS', 'EXTERNOS'];
    const set = new Set<string>(baseList);
    overtimeRecords.forEach((r) => r.company && set.add(r.company.trim().toUpperCase()));
    attendanceRecords.forEach((r) => r.company && set.add(r.company.trim().toUpperCase()));
    return Array.from(set);
  }, [overtimeRecords, attendanceRecords]);

  // Extraer catálogo relacional Líder de Área <-> Departamentos exclusivamente desde Base TE
  const baseTeCatalog = useMemo(() => {
    const baseSource = annualOvertimeRecords.length > 0 ? annualOvertimeRecords : overtimeRecords;
    return extractBaseTeLeaderCatalog(baseSource);
  }, [annualOvertimeRecords, overtimeRecords]);

  // Lista única y ordenada alfabéticamente de los valores reales de Líder de Área en Base TE
  const availableLeaders = useMemo(() => {
    return baseTeCatalog.leadersList;
  }, [baseTeCatalog]);

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

  const availableWeeks = useMemo(() => {
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
  }, [overtimeRecords, attendanceRecords, annualOvertimeRecords, weeklyMatrixRecords, absenceRecords]);

  const availableMonths = useMemo(() => {
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
  }, [overtimeRecords, attendanceRecords, annualOvertimeRecords, weeklyMatrixRecords, absenceRecords]);

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
