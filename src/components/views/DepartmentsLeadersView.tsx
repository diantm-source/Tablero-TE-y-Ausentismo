import React, { useState, useMemo } from 'react';
import { DepartmentMetric, FilteredKPIs } from '../../services/kpiEngine';
import { DepartmentLeader, ThresholdConfig } from '../../types';
import {
  DepartmentLeaderFormModal,
  DepartmentLeaderDeleteModal,
  ToastNotification,
  ToastMessage,
} from '../modals/DepartmentLeaderModals';
import { normalizeDeptKey } from '../../services/overtimeParser';

interface DepartmentsLeadersViewProps {
  kpis: FilteredKPIs;
  leadersCatalog: DepartmentLeader[];
  onSaveLeader: (updated: DepartmentLeader, originalDepartment?: string) => void;
  onDeleteLeader?: (department: string) => void;
  onCreateLeader?: (newLeader: DepartmentLeader) => void;
  thresholds: ThresholdConfig;
}

export const DepartmentsLeadersView: React.FC<DepartmentsLeadersViewProps> = ({
  kpis,
  leadersCatalog,
  onSaveLeader,
  onDeleteLeader,
  onCreateLeader,
  thresholds,
}) => {
  const [selectedDept, setSelectedDept] = useState<DepartmentMetric | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingLeader, setEditingLeader] = useState<DepartmentLeader | null>(null);
  const [deletingLeader, setDeletingLeader] = useState<DepartmentLeader | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ id: String(Date.now()), type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  // Map leaders by normalized department key
  const leadersMap = useMemo(() => {
    const map = new Map<string, DepartmentLeader>();
    for (const l of leadersCatalog) {
      map.set(normalizeDeptKey(l.department), l);
      map.set(l.department.toLowerCase(), l);
    }
    return map;
  }, [leadersCatalog]);

  // Unique leaders list for autocomplete
  const existingLeaderNames = useMemo(() => {
    const set = new Set<string>();
    for (const l of leadersCatalog) {
      if (l.leaderName && l.leaderName.trim()) {
        set.add(l.leaderName.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [leadersCatalog]);

  // Conteo unificado real
  const uniqueLeadersCount = existingLeaderNames.length;
  const uniqueAreasCount = leadersCatalog.length;

  // Combine metrics with all active departments in catalog
  const displayDepartments = useMemo(() => {
    const metricsMap = new Map<string, DepartmentMetric>();
    for (const m of kpis.departmentsMetrics) {
      metricsMap.set(normalizeDeptKey(m.department), m);
    }

    const combined: DepartmentMetric[] = [];
    const visitedKeys = new Set<string>();

    // First include departments that have leader catalog records
    for (const l of leadersCatalog) {
      const key = normalizeDeptKey(l.department);
      visitedKeys.add(key);

      const metric = metricsMap.get(key);
      if (metric) {
        combined.push({
          ...metric,
          company: l.company || metric.company,
          leader: l.leaderName || metric.leader,
        });
      } else {
        // Department exists in catalog but had 0 hours/records in current filter
        combined.push({
          department: l.department,
          company: l.company || 'Polaquimia',
          leader: l.leaderName || 'Sin Líder Asignado',
          requestedHours: 0,
          approvedHours: 0,
          pendingHours: 0,
          otRequestsCount: 0,
          eligibleShifts: 0,
          absencesCount: 0,
          absenceRate: 0,
          isSimultaneousAlert: false,
        });
      }
    }

    // Also include any metrics not in visitedKeys (if not in catalog)
    for (const m of kpis.departmentsMetrics) {
      const key = normalizeDeptKey(m.department);
      if (!visitedKeys.has(key)) {
        combined.push(m);
      }
    }

    return combined.sort((a, b) => {
      if (b.approvedHours !== a.approvedHours) {
        return b.approvedHours - a.approvedHours;
      }
      return a.department.localeCompare(b.department, 'es', { sensitivity: 'base' });
    });
  }, [kpis.departmentsMetrics, leadersCatalog]);

  const handleOpenCreate = () => {
    setEditingLeader(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (leader: DepartmentLeader) => {
    setEditingLeader(leader);
    setFormModalOpen(true);
  };

  const handleFormSave = (leader: DepartmentLeader, originalDept?: string) => {
    const isNew = !originalDept;
    if (isNew && onCreateLeader) {
      onCreateLeader(leader);
    } else {
      onSaveLeader(leader, originalDept);
    }
    showToast(
      'success',
      isNew
        ? `Departamento "${leader.department}" registrado con éxito.`
        : `Asignación de "${leader.department}" actualizada correctamente.`
    );
  };

  const handleDeleteConfirm = (department: string) => {
    if (onDeleteLeader) {
      onDeleteLeader(department);
      showToast('success', `Departamento "${department}" eliminado del catálogo.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
              Módulo de Estructura Organizacional
            </span>
            <span className="text-xs text-slate-500 font-medium">Catálogo verificado Base TE</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Departamentos y Líderes Responsables</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Fichas departamentales con balance de Tiempo Extra, Ausentismo y alertas de concentración simultánea.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-200 shadow-2xs">
            <i className="bi bi-shield-check text-emerald-600 mr-1.5"></i>
            {uniqueLeadersCount} líderes asignados / {uniqueAreasCount} áreas
          </span>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <i className="bi bi-plus-lg"></i>
            <span>Agregar Asignación</span>
          </button>
        </div>
      </div>

      {/* Simultaneous High Overtime + High Absence Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <i className="bi bi-info-circle-fill text-amber-600 text-base shrink-0 mt-0.5"></i>
        <div>
          <span className="font-bold block">Criterio de Monitoreo de Concentración Simultánea:</span>
          <span>
            Se señalan aquellos departamentos con tiempo extra aprobado superior a {thresholds.overtimeHighWarningDeptHours} hrs y tasa de ausentismo mayor al {thresholds.absenceHighWarningRate}%.{' '}
            <strong>Nota metodológica:</strong> Esta correlación estadística permite focalizar auditorías de campo, sin asumir relación de causa y efecto automática.
          </span>
        </div>
      </div>

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayDepartments.map((dept) => {
          const leaderInfo =
            leadersMap.get(normalizeDeptKey(dept.department)) ||
            leadersMap.get(dept.department.toLowerCase());

          return (
            <div
              key={dept.department}
              className={`bg-white rounded-xl border p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between ${
                dept.isSimultaneousAlert
                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                  : 'border-slate-200'
              }`}
            >
              <div>
                {/* Header of Card */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 block">
                      {dept.company}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 leading-tight">
                      {dept.department}
                    </h3>
                  </div>

                  {dept.isSimultaneousAlert && (
                    <span
                      title="Alto TE y Alto Ausentismo simultáneo"
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 shrink-0"
                    >
                      <i className="bi bi-exclamation-triangle-fill"></i>
                      <span>Alerta Dual</span>
                    </span>
                  )}
                </div>

                {/* Assigned Leader Box with Edit and Delete actions */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                      <i className="bi bi-person-badge"></i>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        {leaderInfo?.leaderName || dept.leader || 'Sin líder asignado'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {leaderInfo?.leaderPosition || 'Responsable de Área'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenEdit(
                          leaderInfo || {
                            id: `lead-${Date.now()}`,
                            company: dept.company,
                            department: dept.department,
                            leaderName: dept.leader || '',
                            leaderPosition: 'Responsable de Área',
                            validFrom: '2024-01-01',
                          }
                        )
                      }
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                      title="Editar departamento y líder"
                    >
                      <i className="bi bi-pencil-square text-xs"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDeletingLeader(
                          leaderInfo || {
                            id: `lead-${Date.now()}`,
                            company: dept.company,
                            department: dept.department,
                            leaderName: dept.leader || '',
                            leaderPosition: 'Responsable de Área',
                            validFrom: '2024-01-01',
                          }
                        )
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                      title="Eliminar asignación departamental"
                    >
                      <i className="bi bi-trash3 text-xs"></i>
                    </button>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                    <span className="text-[10px] text-blue-700 block font-medium">TE Aprobado</span>
                    <span className="text-base font-bold text-blue-900">{dept.approvedHours} hrs</span>
                    <span className="text-[10px] text-slate-500 block">
                      {dept.otRequestsCount} solicitudes
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100">
                    <span className="text-[10px] text-amber-700 block font-medium">TE Pendiente</span>
                    <span className="text-base font-bold text-amber-900">{dept.pendingHours} hrs</span>
                    <span className="text-[10px] text-slate-500 block">Por autorizar</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100">
                    <span className="text-[10px] text-rose-700 block font-medium">Ausencias</span>
                    <span className="text-base font-bold text-rose-900">{dept.absencesCount}</span>
                    <span className="text-[10px] text-slate-500 block">de {dept.eligibleShifts} jorn.</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-100/70 border border-slate-200">
                    <span className="text-[10px] text-slate-600 block font-medium">Tasa Ausentismo</span>
                    <span className="text-base font-bold text-slate-900">{dept.absenceRate}%</span>
                    <span className="text-[10px] text-slate-500 block">del total área</span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <button
                type="button"
                onClick={() => setSelectedDept(dept)}
                className="w-full mt-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span>Ver Ficha Detallada</span>
                <i className="bi bi-chevron-right text-[10px]"></i>
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal: Ficha Detallada */}
      {selectedDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-blue-600 uppercase">
                  {selectedDept.company}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{selectedDept.department}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDept(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-700 block mb-1">Líder Oficial:</span>
                <div className="text-sm font-bold text-slate-900">{selectedDept.leader}</div>
                <div className="text-slate-500 text-[11px]">
                  {leadersMap.get(normalizeDeptKey(selectedDept.department))?.leaderPosition ||
                    'Responsable de Área'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block mb-1">Tiempo Extra Total Solicitado</span>
                  <span className="text-lg font-bold text-slate-900">{selectedDept.requestedHours} hrs</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block mb-1">Tiempo Extra Aprobado</span>
                  <span className="text-lg font-bold text-emerald-600">{selectedDept.approvedHours} hrs</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block mb-1">Jornadas Programadas</span>
                  <span className="text-lg font-bold text-slate-900">{selectedDept.eligibleShifts}</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block mb-1">Tasa de Ausentismo</span>
                  <span className="text-lg font-bold text-rose-600">{selectedDept.absenceRate}%</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDept(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CRUD: Crear / Editar Departamento y Líder */}
      <DepartmentLeaderFormModal
        isOpen={formModalOpen}
        initialData={editingLeader}
        existingLeaders={existingLeaderNames}
        onSave={handleFormSave}
        onClose={() => {
          setFormModalOpen(false);
          setEditingLeader(null);
        }}
      />

      {/* Modal de Confirmación Premium para Eliminar */}
      <DepartmentLeaderDeleteModal
        isOpen={Boolean(deletingLeader)}
        leader={deletingLeader}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeletingLeader(null)}
      />

      {/* Toast Notification */}
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
