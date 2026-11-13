import React, { useState, useRef } from 'react';
import {
  AbsenceRecord,
  DepartmentLeader,
  OvertimeRecord,
  ReasonCatalogItem,
  ThresholdConfig,
  WeeklyMatrixRecord,
} from '../../types';
import { ELIGIBLE_SCHEDULES } from '../../services/businessRules';
import { OFFICIAL_SCHEDULES_CATALOG } from '../../services/scheduleCatalog';
import { AppStorage } from '../../services/storage';
import {
  formatSyncTimestampDisplay,
  getEffectiveAbsenceCloudSyncUrl,
  getEffectiveCloudSyncUrl,
  getEffectiveMatrizCloudSyncUrl,
  getLastSyncTimestamp,
  normalizeMatrizSheetsUrl,
  normalizeSheetsUrl,
  setStoredAbsenceCloudSyncUrl,
  setStoredCloudSyncUrl,
  setStoredMatrizCloudSyncUrl,
  syncRemoteAbsences,
  syncRemoteAll,
  syncRemoteMatriz,
  testRemoteAbsenceConnection,
  testRemoteConnection,
  testRemoteMatrizConnection,
} from '../../services/cloudSync';

interface CatalogsConfigViewProps {
  reasonsCatalog: ReasonCatalogItem[];
  onSaveReasons: (reasons: ReasonCatalogItem[]) => void;
  leadersCatalog: DepartmentLeader[];
  onSaveLeaders: (leaders: DepartmentLeader[]) => void;
  thresholds: ThresholdConfig;
  onSaveThresholds: (thresholds: ThresholdConfig) => void;
  onRefreshData?: () => void;
}

export const CatalogsConfigView: React.FC<CatalogsConfigViewProps> = ({
  reasonsCatalog,
  leadersCatalog,
  thresholds,
  onSaveThresholds,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'reasons' | 'leaders' | 'schedules' | 'thresholds' | 'cloud' | 'backup'>('reasons');
  const [reasonSearch, setReasonSearch] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');

  // Cloud Sync state (Tiempo Extra)
  const [cloudUrl, setCloudUrl] = useState(() => getEffectiveCloudSyncUrl());
  const [cloudSaved, setCloudSaved] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    rowCount?: number;
    preview?: OvertimeRecord[];
  } | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => getLastSyncTimestamp());

  // Cloud Sync state (Ausentismo)
  const [absenceCloudUrl, setAbsenceCloudUrl] = useState(() => getEffectiveAbsenceCloudSyncUrl());
  const [absenceCloudSaved, setAbsenceCloudSaved] = useState(false);
  const [isTestingAbsenceCloud, setIsTestingAbsenceCloud] = useState(false);
  const [absenceTestResult, setAbsenceTestResult] = useState<{
    success: boolean;
    message: string;
    rowCount?: number;
    preview?: AbsenceRecord[];
  } | null>(null);

  // Cloud Sync state (Matriz Semanal - Registro_Prolongacion.xlsx)
  const [matrizCloudUrl, setMatrizCloudUrl] = useState(() => getEffectiveMatrizCloudSyncUrl());
  const [matrizCloudSaved, setMatrizCloudSaved] = useState(false);
  const [isTestingMatrizCloud, setIsTestingMatrizCloud] = useState(false);
  const [matrizTestResult, setMatrizTestResult] = useState<{
    success: boolean;
    message: string;
    sheetCount?: number;
    rowCount?: number;
    totalNormales?: number;
    totalProlongacion?: number;
    preview?: WeeklyMatrixRecord[];
  } | null>(null);
  const [isSyncingMatriz, setIsSyncingMatriz] = useState(false);

  // Thresholds local state
  const [localThresholds, setLocalThresholds] = useState<ThresholdConfig>(thresholds);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  // Backup & Restore local state
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveThresholds = () => {
    onSaveThresholds(localThresholds);
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2500);
  };

  const handleSaveCloudUrl = async () => {
    const normalized = normalizeSheetsUrl(cloudUrl);
    setCloudUrl(normalized);
    setStoredCloudSyncUrl(normalized);
    await AppStorage.saveSheetsUrl(normalized);
    setCloudSaved(true);
    setTimeout(() => setCloudSaved(false), 2500);
  };

  const handleTestCloudConnection = async () => {
    setIsTestingCloud(true);
    setTestResult(null);
    try {
      const normalized = normalizeSheetsUrl(cloudUrl);
      const res = await testRemoteConnection(normalized);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleSyncCloudNow = async () => {
    setIsSyncingCloud(true);
    setSyncFeedback(null);
    try {
      const normalized = normalizeSheetsUrl(cloudUrl);
      setStoredCloudSyncUrl(normalized);
      await AppStorage.saveSheetsUrl(normalized);

      const normalizedAbsence = normalizeSheetsUrl(absenceCloudUrl);
      setStoredAbsenceCloudSyncUrl(normalizedAbsence);
      await AppStorage.saveAbsenceSheetsUrl(normalizedAbsence);

      const [otRes, absRes] = await Promise.allSettled([
        syncRemoteAll(normalized, reasonsCatalog),
        syncRemoteAbsences(normalizedAbsence),
      ]);

      const parts: string[] = [];
      let latestTime = lastSyncTime;

      if (otRes.status === 'fulfilled') {
        latestTime = otRes.value.syncTime;
        parts.push(
          `Tiempo Extra: ${otRes.value.newCount} nuevos, ${otRes.value.updatedCount} actualizados (${otRes.value.records.length} totales)`
        );
      }
      if (absRes.status === 'fulfilled') {
        latestTime = absRes.value.syncTime;
        parts.push(`Ausentismo: ${absRes.value.absenceRecords.length} registros sincronizados`);
      }

      if (parts.length === 0) {
        const firstErr = otRes.status === 'rejected' ? otRes.reason : absRes.status === 'rejected' ? absRes.reason : 'Error desconocido';
        throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
      }

      if (latestTime) setLastSyncTime(latestTime);
      setSyncFeedback({
        type: 'success',
        message: `Sincronización exitosa — ${parts.join(' | ')}.`,
      });
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSaveAbsenceCloudUrl = async () => {
    const normalized = normalizeSheetsUrl(absenceCloudUrl);
    setAbsenceCloudUrl(normalized);
    setStoredAbsenceCloudSyncUrl(normalized);
    await AppStorage.saveAbsenceSheetsUrl(normalized);
    setAbsenceCloudSaved(true);
    setTimeout(() => setAbsenceCloudSaved(false), 2500);
  };

  const handleTestAbsenceCloudConnection = async () => {
    setIsTestingAbsenceCloud(true);
    setAbsenceTestResult(null);
    try {
      const normalized = normalizeSheetsUrl(absenceCloudUrl);
      const res = await testRemoteAbsenceConnection(normalized);
      setAbsenceTestResult(res);
    } catch (err) {
      setAbsenceTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingAbsenceCloud(false);
    }
  };

  const handleSaveMatrizCloudUrl = async () => {
    const normalized = normalizeMatrizSheetsUrl(matrizCloudUrl);
    setMatrizCloudUrl(normalized);
    setStoredMatrizCloudSyncUrl(normalized);
    await AppStorage.saveMatrizSheetsUrl(normalized);
    setMatrizCloudSaved(true);
    setTimeout(() => setMatrizCloudSaved(false), 2500);
  };

  const handleTestMatrizCloudConnection = async () => {
    setIsTestingMatrizCloud(true);
    setMatrizTestResult(null);
    try {
      const normalized = normalizeMatrizSheetsUrl(matrizCloudUrl);
      const res = await testRemoteMatrizConnection(normalized);
      setMatrizTestResult(res);
    } catch (err) {
      setMatrizTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingMatrizCloud(false);
    }
  };

  const handleSyncMatrizNow = async () => {
    setIsSyncingMatriz(true);
    setSyncFeedback(null);
    try {
      const normalized = normalizeMatrizSheetsUrl(matrizCloudUrl);
      setStoredMatrizCloudSyncUrl(normalized);
      await AppStorage.saveMatrizSheetsUrl(normalized);
      const res = await syncRemoteMatriz(normalized);
      setLastSyncTime(res.syncTime);
      setSyncFeedback({
        type: 'success',
        message: `Sincronización de Matriz exitosa: ${res.sheetCount} semanas y ${res.records.length} registros procesados (${res.totalNormales} hrs TE Normal / ${res.totalProlongacion} hrs Prolongación).`,
      });
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido al sincronizar la Matriz Semanal.',
      });
    } finally {
      setIsSyncingMatriz(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      setBackupLoading(true);
      const backup = await AppStorage.exportBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `BioTime_Respaldo_Completo_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error al generar respaldo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setBackupLoading(true);
      setRestoreMessage(null);
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await AppStorage.restoreBackup(parsed);
      setRestoreMessage({ type: 'success', text: res.message });
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      setRestoreMessage({
        type: 'error',
        text: `Error al restaurar respaldo: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBackupLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredReasons = reasonsCatalog.filter((r) => {
    if (!reasonSearch) return true;
    const s = reasonSearch.toLowerCase();
    return (
      r.officialReason.toLowerCase().includes(s) ||
      r.category.toLowerCase().includes(s) ||
      r.keywords.some((k) => k.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
              Parametrización Oficial del Sistema
            </span>
            <span className="text-xs text-slate-500 font-medium">Reglas de Negocio Validadas</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Catálogos y Configuración</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Catálogo Oficial de Motivos de Tiempo Extra, relación de líderes, umbrales y respaldo local.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap rounded-lg border border-slate-300 p-1 bg-slate-100 text-xs font-medium gap-1">
          <button
            onClick={() => setActiveTab('reasons')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'reasons' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            Motivos Oficiales TE ({reasonsCatalog.length})
          </button>
          <button
            onClick={() => setActiveTab('leaders')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'leaders' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            Líderes de Área ({leadersCatalog.length})
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'schedules' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            Horarios Oficiales (8 turnos)
          </button>
          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'thresholds' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            Umbrales Semáforos
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'cloud' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            <i className="bi bi-cloud-arrow-down-fill text-xs"></i>
            <span>Sincronización en la Nube</span>
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'backup' ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            <i className="bi bi-shield-check mr-1"></i> Respaldo y Restauración
          </button>
        </div>
      </div>

      {/* Tab: Motivos Oficiales TE */}
      {activeTab === 'reasons' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-center gap-2">
            <i className="bi bi-shield-lock-fill text-amber-600 text-base"></i>
            <span>
              <strong>Catálogo Institucional Protegido:</strong> Estos motivos son la referencia corporativa oficial contra la cual se validan los archivos de Tiempo Extra de BioTime mediante comparación semántica y distancia de Levenshtein.
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                placeholder="Buscar motivo por palabra clave o categoría..."
                value={reasonSearch}
                onChange={(e) => setReasonSearch(e.target.value)}
                className="w-full max-w-md bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs text-slate-500">Mostrando {filteredReasons.length} motivos</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Motivo Oficial</th>
                    <th className="py-2.5 px-3">Palabras Clave de Detección</th>
                    <th className="py-2.5 px-3">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReasons.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{r.category}</td>
                      <td className="py-2.5 px-3 font-mono text-blue-700 font-medium">{r.officialReason}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {r.keywords.map((k, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                              {k}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{r.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Líderes de Área */}
      {activeTab === 'leaders' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Catálogo de Líderes Departamentales</h3>
            <span className="text-xs text-slate-500">{leadersCatalog.length} líderes activos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Empresa</th>
                  <th className="py-2.5 px-3">Departamento</th>
                  <th className="py-2.5 px-3">Líder Asignado</th>
                  <th className="py-2.5 px-3">Puesto</th>
                  <th className="py-2.5 px-3">Vigencia Desde</th>
                  <th className="py-2.5 px-3">Colaboradores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leadersCatalog.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{l.company}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{l.department}</td>
                    <td className="py-2.5 px-3 font-semibold text-blue-700">{l.leaderName}</td>
                    <td className="py-2.5 px-3 text-slate-500">{l.leaderPosition}</td>
                    <td className="py-2.5 px-3 font-mono">{l.validFrom}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{l.employeeCount || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Horarios Oficiales */}
      {activeTab === 'schedules' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Catálogo Maestro Oficial de Turnos y Horarios ({OFFICIAL_SCHEDULES_CATALOG.length} turnos)</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Reglas maestras de turnos de la empresa: entradas, salidas, tiempos de trabajo y condiciones de horas extra.
              </p>
            </div>

            <div className="relative max-w-xs w-full">
              <i className="bi bi-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
              <input
                type="text"
                value={scheduleSearch}
                onChange={(e) => setScheduleSearch(e.target.value)}
                placeholder="Buscar por código, nombre o tipo..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>
          </div>

          {/* Turnos Elegibles Ausentismo (Resumen Superior) */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4">
            <span className="text-xs font-bold text-blue-900 block mb-1">
              Turnos Elegibles para Ausentismo (8 Códigos Clave):
            </span>
            <p className="text-[11px] text-blue-800 mb-2">
              Los colaboradores asignados a estos 8 turnos son evaluados para ausentismo. Cualquier otro horario se clasifica como EXCLUIDO_HORARIO.
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from(ELIGIBLE_SCHEDULES).map((code) => {
                const item = OFFICIAL_SCHEDULES_CATALOG.find((s) => s.code === code);
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 bg-white border border-blue-300 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 shadow-2xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{code}</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {item ? `(${item.entryTime.slice(0, 5)} - ${item.exitTime.replace(':00+1', '+1').slice(0, 7)})` : ''}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Tabla Maestra de los 38 Turnos */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Código</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Nombre del Horario</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Entrada</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Salida</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tiempo Trabajo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipo de Trabajo</th>
                  <th className="py-2.5 px-3 min-w-[240px]">Descripción / Condición</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {OFFICIAL_SCHEDULES_CATALOG.filter((s) => {
                  if (!scheduleSearch.trim()) return true;
                  const term = scheduleSearch.toLowerCase();
                  return (
                    s.code.toLowerCase().includes(term) ||
                    s.name.toLowerCase().includes(term) ||
                    s.description.toLowerCase().includes(term) ||
                    s.workType.toLowerCase().includes(term)
                  );
                }).map((item, idx) => (
                  <tr key={`${item.code}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                      {item.code}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {item.entryTime}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {item.exitTime}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                      {item.workMinutes > 0 ? `${item.workMinutes} min (${(item.workMinutes / 60).toFixed(1)}h)` : '0 min'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {item.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.workType === 'Día de Descanso'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.workType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {item.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Umbrales Semáforos */}
      {activeTab === 'thresholds' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-slate-800">Configuración de Umbrales de Semáforos</h3>
          <p className="text-xs text-slate-600">
            Ajusta los porcentajes y horas límite para activar los semáforos de alerta amarilla y crítica en el dashboard ejecutivo.
          </p>

          <div className="space-y-4 pt-2 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tasa de Ausentismo - Advertencia Amarilla (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={localThresholds.absenceHighWarningRate}
                onChange={(e) =>
                  setLocalThresholds({
                    ...localThresholds,
                    absenceHighWarningRate: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tasa de Ausentismo - Alerta Crítica Roja (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={localThresholds.absenceCriticalRate}
                onChange={(e) =>
                  setLocalThresholds({
                    ...localThresholds,
                    absenceCriticalRate: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tiempo Extra Departamental - Umbral de Alerta Dual (Horas semanales)
              </label>
              <input
                type="number"
                step="1"
                value={localThresholds.overtimeHighWarningDeptHours}
                onChange={(e) =>
                  setLocalThresholds({
                    ...localThresholds,
                    overtimeHighWarningDeptHours: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleSaveThresholds}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-sm"
              >
                Guardar Umbrales
              </button>

              {thresholdSaved && (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <i className="bi bi-check2"></i> Umbrales actualizados exitosamente
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Sincronización en la Nube */}
      {activeTab === 'cloud' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 max-w-3xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                Sincronización Remota BioTime
              </span>
              <span className="text-xs text-slate-500 font-medium">Google Sheets / CSV Endpoint</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">Conexión con Hoja de Cálculo en la Nube</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Configura la URL pública de Google Sheets en formato CSV. Los datos de Tiempo Extra se descargarán y conciliarán automáticamente con IndexedDB local, evitando la carga manual en cada sesión.
            </p>
          </div>

          {/* Sync Status Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/10 border border-emerald-300 text-emerald-700 flex items-center justify-center">
                <i className="bi bi-cloud-check-fill text-xl"></i>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-800">Estado de Sincronización</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Última sincronización:{' '}
                  <strong className="text-slate-800">
                    {formatSyncTimestampDisplay(lastSyncTime)}
                  </strong>
                </div>
              </div>
            </div>

            <button
              onClick={handleSyncCloudNow}
              disabled={isSyncingCloud || isTestingCloud}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <i className={`bi ${isSyncingCloud ? 'bi-arrow-repeat animate-spin' : 'bi-arrow-clockwise'}`}></i>
              <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Datos Ahora'}</span>
            </button>
          </div>

          {/* URL Input Form */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              URL de Google Sheets publicado o endpoint CSV:
            </label>
            <div className="relative">
              <input
                type="text"
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            {cloudUrl.includes('/pubhtml') && (
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start gap-2">
                <i className="bi bi-info-circle-fill text-blue-600 mt-0.5"></i>
                <span>
                  <strong>Detección automática:</strong> El enlace ingresado contiene <code className="bg-blue-100 px-1 py-0.5 rounded">/pubhtml</code>. Al guardar o probar, se convertirá automáticamente a formato CSV descargable (<code className="bg-blue-100 px-1 py-0.5 rounded">/pub?output=csv</code>).
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleTestCloudConnection}
                disabled={isTestingCloud || !cloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className={`bi ${isTestingCloud ? 'bi-arrow-repeat animate-spin' : 'bi-lightning-charge-fill'} text-amber-400`}></i>
                <span>{isTestingCloud ? 'Probando...' : 'Probar Conexión'}</span>
              </button>

              <button
                onClick={handleSaveCloudUrl}
                disabled={!cloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className="bi bi-check-lg"></i>
                <span>Guardar URL</span>
              </button>

              {cloudSaved && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
                  <i className="bi bi-check-circle-fill"></i> URL guardada exitosamente
                </span>
              )}
            </div>
          </div>

          {/* Test Connection Results */}
          {testResult && (
            <div
              className={`p-3.5 rounded-lg text-xs border ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <i
                  className={`bi ${
                    testResult.success ? 'bi-check-circle-fill text-emerald-600' : 'bi-x-circle-fill text-rose-600'
                  }`}
                ></i>
                <span>{testResult.success ? 'Conexión Exitosa' : 'Fallo de Conexión'}</span>
              </div>
              <p className="mt-0.5 text-xs">{testResult.message}</p>
              {testResult.preview && testResult.preview.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs">
                  <span className="font-semibold text-emerald-950">Muestra de datos reconocidos:</span>
                  <div className="mt-1 space-y-1 font-mono text-[11px] text-emerald-900">
                    {testResult.preview.map((p, i) => (
                      <div key={i} className="truncate">
                        • {p.employeeId} - {p.employeeName} ({p.department}): {p.startDate} [{p.startTime} - {p.endTime}] ({p.requestedHours} hrs) - {p.status}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* URL Input Form - Ausentismo */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-bold text-slate-800">
                URL de Google Sheets — Concentrado de AUSENTISMO:
              </label>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                AUSENTISMO
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={absenceCloudUrl}
                onChange={(e) => setAbsenceCloudUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleTestAbsenceCloudConnection}
                disabled={isTestingAbsenceCloud || !absenceCloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className={`bi ${isTestingAbsenceCloud ? 'bi-arrow-repeat animate-spin' : 'bi-lightning-charge-fill'} text-amber-400`}></i>
                <span>{isTestingAbsenceCloud ? 'Probando...' : 'Probar Conexión Ausentismo'}</span>
              </button>

              <button
                onClick={handleSaveAbsenceCloudUrl}
                disabled={!absenceCloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className="bi bi-check-lg"></i>
                <span>Guardar URL Ausentismo</span>
              </button>

              {absenceCloudSaved && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
                  <i className="bi bi-check-circle-fill"></i> URL de Ausentismo guardada
                </span>
              )}
            </div>

            {absenceTestResult && (
              <div
                className={`p-3.5 rounded-lg text-xs border ${
                  absenceTestResult.success
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <i
                    className={`bi ${
                      absenceTestResult.success ? 'bi-check-circle-fill text-emerald-600' : 'bi-x-circle-fill text-rose-600'
                    }`}
                  ></i>
                  <span>{absenceTestResult.success ? 'Conexión Exitosa (Ausentismo)' : 'Fallo de Conexión (Ausentismo)'}</span>
                </div>
                <p className="mt-0.5 text-xs">{absenceTestResult.message}</p>
                {absenceTestResult.preview && absenceTestResult.preview.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs">
                    <span className="font-semibold text-emerald-950">Muestra de datos reconocidos:</span>
                    <div className="mt-1 space-y-1 font-mono text-[11px] text-emerald-900">
                      {absenceTestResult.preview.map((p, i) => (
                        <div key={i} className="truncate">
                          • {p.employeeId} - {p.employeeName} ({p.department}): {p.startDateDisplay} a {p.endDateDisplay} [{p.absenceType}] ({p.absences} aus. / ${p.amount})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* URL Input Form - Matriz Semanal (Registro_Prolongacion.xlsx) */}
          <div className="space-y-3 pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="block text-xs font-bold text-slate-800">
                  URL de Google Sheets — Matriz Semanal de Tiempo Extra y Prolongación:
                </label>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Registro_Prolongacion
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                  Formato A (.xlsx)
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-600 font-bold bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Enlace de Google Sheets publicado como libro de Excel completo (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-blue-700">...pub?output=xlsx</code>). Procesa todas las pestañas semanales con lectura del color de celdas para desglosar Horas Normales y Horas de Prolongación.
            </p>

            <div className="relative">
              <input
                type="text"
                value={matrizCloudUrl}
                onChange={(e) => setMatrizCloudUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=xlsx"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleTestMatrizCloudConnection}
                disabled={isTestingMatrizCloud || !matrizCloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className={`bi ${isTestingMatrizCloud ? 'bi-arrow-repeat animate-spin' : 'bi-lightning-charge-fill'} text-amber-400`}></i>
                <span>{isTestingMatrizCloud ? 'Probando...' : 'Probar Conexión Matriz'}</span>
              </button>

              <button
                onClick={handleSaveMatrizCloudUrl}
                disabled={!matrizCloudUrl.trim()}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <i className="bi bi-check-lg"></i>
                <span>Guardar URL Matriz</span>
              </button>

              <button
                onClick={handleSyncMatrizNow}
                disabled={isSyncingMatriz || isTestingMatrizCloud}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                <i className={`bi ${isSyncingMatriz ? 'bi-arrow-repeat animate-spin' : 'bi-cloud-download-fill'}`}></i>
                <span>{isSyncingMatriz ? 'Sincronizando Matriz...' : 'Sincronizar Matriz Ahora'}</span>
              </button>

              {matrizCloudSaved && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
                  <i className="bi bi-check-circle-fill"></i> URL de Matriz guardada exitosamente
                </span>
              )}
            </div>

            {matrizTestResult && (
              <div
                className={`p-3.5 rounded-lg text-xs border ${
                  matrizTestResult.success
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <i
                    className={`bi ${
                      matrizTestResult.success ? 'bi-check-circle-fill text-emerald-600' : 'bi-x-circle-fill text-rose-600'
                    }`}
                  ></i>
                  <span>{matrizTestResult.success ? 'Conexión Exitosa con Matriz Semanal' : 'Fallo de Conexión'}</span>
                </div>
                <p className="mt-0.5 text-xs">{matrizTestResult.message}</p>
                {matrizTestResult.preview && matrizTestResult.preview.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs">
                    <span className="font-semibold text-emerald-950">Muestra de colaboradores procesados:</span>
                    <div className="mt-1 space-y-1 font-mono text-[11px] text-emerald-900">
                      {matrizTestResult.preview.map((p, i) => (
                        <div key={i} className="truncate">
                          • {p.employeeId} - {p.employeeName} ({p.department}) [{p.week}]: {p.horasNormales} hrs Normales + {p.horasProlongacion} hrs Prolongación = {p.horasTotales} hrs totales
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sync Feedback Message */}
          {syncFeedback && (
            <div
              className={`p-3.5 rounded-lg text-xs border ${
                syncFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 mb-0.5">
                <i
                  className={`bi ${
                    syncFeedback.type === 'success' ? 'bi-check-circle-fill text-emerald-600' : 'bi-exclamation-octagon-fill text-rose-600'
                  }`}
                ></i>
                <span>{syncFeedback.type === 'success' ? 'Sincronización Completada' : 'Error al Sincronizar'}</span>
              </div>
              <p>{syncFeedback.message}</p>
            </div>
          )}

          {/* Quick Guide Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <i className="bi bi-question-circle text-blue-600"></i>
              <span>¿Cómo publicar una hoja de cálculo de Google Sheets?</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>Abre tu hoja de cálculo en Google Drive / Google Sheets.</li>
              <li>Ve al menú principal: <strong>Archivo &gt; Compartir &gt; Publicar en la web</strong>.</li>
              <li>En la pestaña <em>Enlace</em>, selecciona la hoja deseada y en el desplegable de formato elige <strong>Valores separados por comas (.csv)</strong>.</li>
              <li>Haz clic en <strong>Publicar</strong> y copia el enlace generado.</li>
              <li>Pega el enlace en el campo de arriba y haz clic en <strong>Probar Conexión</strong>.</li>
            </ol>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
              * Nota: Si pegas un vínculo con terminación <code className="text-slate-700 font-mono">/pubhtml</code>, el sistema lo adaptará automáticamente para consultar los datos CSV directos.
            </p>
          </div>
        </div>
      )}

      {/* Tab: Respaldo y Restauración Local */}
      {activeTab === 'backup' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-900">Respaldo y Restauración de Base de Datos Local</h3>
            <p className="text-xs text-slate-600 mt-1">
              Todos los datos están almacenados 100% de manera local en tu equipo mediante IndexedDB. Puedes generar copias de seguridad periódicas y restaurarlas en cualquier momento con validación íntegra de esquema (Zod v1.0).
            </p>
          </div>

          {/* Export card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <i className="bi bi-download text-blue-600 text-base"></i> Exportar Respaldo Completo
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Descarga un archivo estructurado <span className="font-mono font-semibold">.json</span> con todos los registros de Tiempo Extra, Asistencia, Líderes, Motivos e Historial.
              </p>
            </div>
            <button
              onClick={handleDownloadBackup}
              disabled={backupLoading}
              className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 whitespace-nowrap self-start sm:self-auto disabled:opacity-50"
            >
              <i className="bi bi-cloud-arrow-down"></i> Descargar Respaldo
            </button>
          </div>

          {/* Import card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <i className="bi bi-upload text-purple-600 text-base"></i> Restaurar Respaldo
            </h4>
            <p className="text-xs text-slate-500">
              Selecciona un archivo de respaldo generado previamente para restaurar toda la información a la base de datos local.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleRestoreFileSelected}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={backupLoading}
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <i className="bi bi-folder-check"></i> Seleccionar Archivo de Respaldo (.json)
            </button>

            {restoreMessage && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  restoreMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <i
                  className={`bi ${
                    restoreMessage.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'
                  } mr-1`}
                ></i>
                {restoreMessage.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
