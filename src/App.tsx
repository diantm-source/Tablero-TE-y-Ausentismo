import React, { useState, useEffect, useMemo } from 'react';
import {
  DepartmentLeader,
  GlobalFilterState,
  NavigationSection,
  ReasonCatalogItem,
  ThresholdConfig,
} from './types';
import { AppStorage, DEFAULT_THRESHOLDS } from './services/storage';
import { computeKPIs } from './services/kpiEngine';
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

  // Core Data State
  const [overtimeRecords, setOvertimeRecords] = useState<import('./types').OvertimeRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<import('./types').AttendanceRecord[]>([]);
  const [departmentLeaders, setDepartmentLeaders] = useState<DepartmentLeader[]>([]);
  const [reasonsCatalog, setReasonsCatalog] = useState<ReasonCatalogItem[]>([]);
  const [auditIncidents, setAuditIncidents] = useState<import('./types').AuditIncident[]>([]);
  const [importHistory, setImportHistory] = useState<import('./types').ImportHistoryItem[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);

  // Global Filters State
  const [filters, setFilters] = useState<GlobalFilterState>(DEFAULT_FILTERS);

  // Sync state helper
  const reloadData = async () => {
    try {
      const [ot, att, leaders, reasons, audit, history, thresh] = await Promise.all([
        AppStorage.getOvertimeRecords(),
        AppStorage.getAttendanceRecords(),
        AppStorage.getDepartmentLeaders(),
        AppStorage.getReasonsCatalog(),
        AppStorage.getAuditIncidents(),
        AppStorage.getImportHistory(),
        AppStorage.getThresholds(),
      ]);
      setOvertimeRecords(ot);
      setAttendanceRecords(att);
      setDepartmentLeaders(leaders);
      setReasonsCatalog(reasons);
      setAuditIncidents(audit);
      setImportHistory(history);
      setThresholds(thresh);
    } catch (err) {
      console.error('Error al cargar datos desde IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      await AppStorage.init();
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

  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    overtimeRecords.forEach((r) => r.department && set.add(r.department));
    attendanceRecords.forEach((r) => r.department && set.add(r.department));
    return Array.from(set).sort();
  }, [overtimeRecords, attendanceRecords]);

  const availableLeaders = useMemo(() => {
    const set = new Set<string>();
    overtimeRecords.forEach((r) => r.leader && set.add(r.leader));
    attendanceRecords.forEach((r) => r.leader && set.add(r.leader));
    departmentLeaders.forEach((l) => l.leaderName && set.add(l.leaderName));
    return Array.from(set).sort();
  }, [overtimeRecords, attendanceRecords, departmentLeaders]);

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    overtimeRecords.forEach((r) => {
      set.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`);
    });
    attendanceRecords.forEach((r) => {
      set.add(`${r.isoYear}-W${String(r.isoWeek).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [overtimeRecords, attendanceRecords]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    overtimeRecords.forEach((r) => r.dateOnly && set.add(r.dateOnly.slice(0, 7)));
    attendanceRecords.forEach((r) => r.date && set.add(r.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [overtimeRecords, attendanceRecords]);

  // Compute KPIs with live filters & thresholds
  const kpis = useMemo(() => {
    return computeKPIs(overtimeRecords, attendanceRecords, filters, thresholds);
  }, [overtimeRecords, attendanceRecords, filters, thresholds]);

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
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 antialiased font-sans">
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
      />

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          currentSection={currentSection}
          onNavigate={setCurrentSection}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          pendingOtCount={kpis.pendingOtRequests}
          auditIncidentsCount={auditIncidents.length}
        />

        {/* Global Filter Bar (Accessible in Analytical Views) */}
        {currentSection !== 'import' && currentSection !== 'catalogs' && (
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
          />
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
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
            />
          )}

          {currentSection === 'attendance' && (
            <AttendanceAnalysisView kpis={kpis} allAttendance={attendanceRecords} />
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
    </div>
  );
}
