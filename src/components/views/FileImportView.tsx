import React, { useState, useRef } from 'react';
import {
  AttendanceRecord,
  ImportHistoryItem,
  OvertimeRecord,
  ReasonCatalogItem,
} from '../../types';
import {
  generateSampleBioTimeFile,
  parseUploadedExcelFile,
} from '../../services/excelParser';
import { AppStorage } from '../../services/storage';
import { db } from '../../services/db';
import { ConfirmationModal } from '../ConfirmationModal';

interface FileImportViewProps {
  reasonsCatalog: ReasonCatalogItem[];
  importHistory: ImportHistoryItem[];
  onImportCompleted: () => void;
  onClearDatabase: () => void;
  onDeleteBatch: (batchId: string, fileName?: string) => void;
  onUpdateBatch: (batchId: string, updated: Partial<ImportHistoryItem>) => void;
  onClearDemoData: () => void;
  onRefreshData: () => void;
  totalRecords: { ot: number; att: number };
}

export const FileImportView: React.FC<FileImportViewProps> = ({
  reasonsCatalog,
  importHistory,
  onImportCompleted,
  onClearDatabase,
  onDeleteBatch,
  onUpdateBatch,
  onClearDemoData,
  onRefreshData,
  totalRecords,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // In-UI Confirmation Modal state (no window.confirm, 100% iframe compatible)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Edit batch modal state
  const [editingBatch, setEditingBatch] = useState<ImportHistoryItem | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editDateRange, setEditDateRange] = useState('');

  // Staged Preview state
  interface StagedImport {
    file: File;
    fileType: 'overtime' | 'attendance' | 'reasons_catalog' | 'unknown';
    detectedHeaderRow: number;
    sheetName: string;
    totalRows: number;
    dateRange: { start: string; end: string } | null;
    columnsFound: string[];
    records: (OvertimeRecord | AttendanceRecord)[];
    newCount: number;
    updatedCount: number;
    ignoredCount: number;
    rejectedCount: number;
  }

  const [staged, setStaged] = useState<StagedImport | null>(null);

  const handleProcessFile = async (file: File) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isExcel && !isCsv) {
      setErrorMessage('Por favor seleccione un archivo válido (.xlsx, .xls o .csv).');
      return;
    }

    try {
      setProcessing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const parsed = await parseUploadedExcelFile(file, reasonsCatalog);

      if (parsed.records.length === 0) {
        setErrorMessage(
          'No se encontraron filas con datos válidos en el archivo. Verifique que las columnas inicien en la fila 3 como en BioTime estándar.'
        );
        setProcessing(false);
        return;
      }

      // Pre-calculate idempotency diff against current database
      let newCount = 0;
      let updatedCount = 0;
      let ignoredCount = 0;
      const rejectedCount = parsed.incidents.filter((i) => i.severity === 'critica').length;

      if (parsed.fileType === 'overtime') {
        const overtimeList = await AppStorage.getOvertimeRecords();
        const currentOT = new Map(overtimeList.map((r) => [r.id, r]));
        (parsed.records as OvertimeRecord[]).forEach((rec) => {
          if (!currentOT.has(rec.id)) {
            newCount++;
            currentOT.set(rec.id, rec);
          } else {
            const cur = currentOT.get(rec.id)!;
            const changed =
              cur.status !== rec.status ||
              cur.approvedHours !== rec.approvedHours ||
              cur.requestedHours !== rec.requestedHours ||
              cur.reason !== rec.reason ||
              cur.startDate !== rec.startDate ||
              cur.endDate !== rec.endDate ||
              cur.isoWeek !== rec.isoWeek ||
              cur.isoYear !== rec.isoYear ||
              cur.dateOnly !== rec.dateOnly ||
              cur.startTime !== rec.startTime ||
              cur.endTime !== rec.endTime;
            if (changed) {
              updatedCount++;
              currentOT.set(rec.id, rec);
            } else {
              ignoredCount++;
            }
          }
        });
      } else {
        const attendanceList = await AppStorage.getAttendanceRecords();
        const currentAtt = new Map(attendanceList.map((r) => [r.id, r]));
        (parsed.records as AttendanceRecord[]).forEach((rec) => {
          if (!currentAtt.has(rec.id)) {
            newCount++;
            currentAtt.set(rec.id, rec);
          } else {
            const cur = currentAtt.get(rec.id)!;
            const changed =
              cur.realIn !== rec.realIn ||
              cur.realOut !== rec.realOut ||
              cur.absenceStatus !== rec.absenceStatus ||
              cur.exception !== rec.exception;
            if (changed) {
              updatedCount++;
              currentAtt.set(rec.id, rec);
            } else {
              ignoredCount++;
            }
          }
        });
      }

      setStaged({
        file,
        fileType: parsed.fileType,
        detectedHeaderRow: parsed.detectedHeaderRow,
        sheetName: parsed.sheetName,
        totalRows: parsed.totalRowsRead,
        dateRange: parsed.dateRange,
        columnsFound: parsed.columnsFound,
        records: parsed.records,
        newCount,
        updatedCount,
        ignoredCount,
        rejectedCount,
      });

      if (parsed.incidents.length > 0) {
        await AppStorage.addAuditIncidents(parsed.incidents);
      }
    } catch (err: unknown) {
      setErrorMessage(
        `Error al procesar el archivo Excel: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!staged) return;

    try {
      setProcessing(true);
      const batchId = `BATCH_${Date.now()}`;

      // Assign the batchId and fileName to records
      const stampedRecords = staged.records.map((r) => ({
        ...r,
        importBatchId: batchId,
        sourceFile: staged.file.name,
      }));

      if (staged.fileType === 'overtime') {
        if (staged.file && staged.file.name) {
          const currentRecords = await AppStorage.getOvertimeRecords();
          const oldFileRecords = currentRecords.filter((r) => r.sourceFile === staged.file.name);
          if (oldFileRecords.length > 0) {
            await db.overtimeRecords.bulkDelete(oldFileRecords.map((r) => r.id));
          }
        }
        await AppStorage.upsertOvertimeRecords(stampedRecords as OvertimeRecord[], batchId);
      } else {
        await AppStorage.upsertAttendanceRecords(stampedRecords as AttendanceRecord[], batchId);
      }

      const historyItem: ImportHistoryItem = {
        id: `hist-${Date.now()}`,
        batchId,
        fileName: staged.file.name,
        fileType: staged.fileType === 'overtime' ? 'overtime' : 'attendance',
        importedAt: new Date().toISOString(),
        user: 'Usuario BioTime Local',
        totalRows: staged.totalRows,
        newRecords: staged.newCount,
        updatedRecords: staged.updatedCount,
        ignoredRecords: staged.ignoredCount,
        rejectedRecords: staged.rejectedCount,
        dateRangeCovered: staged.dateRange
          ? `${staged.dateRange.start} a ${staged.dateRange.end}`
          : 'Periodo no especificado',
        status: staged.rejectedCount > 0 ? 'CON_ADVERTENCIAS' : 'COMPLETADO',
      };

      await AppStorage.addImportBatch(historyItem);

      setStaged(null);
      setSuccessMessage(`Archivo "${staged.file.name}" importado exitosamente a la base de datos local.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      onImportCompleted();
    } catch (err) {
      setErrorMessage(
        `Error al guardar registros en la base de datos: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenEdit = (batch: ImportHistoryItem) => {
    setEditingBatch(batch);
    setEditFileName(batch.fileName);
    setEditDateRange(batch.dateRangeCovered);
  };

  const handleSaveEdit = () => {
    if (!editingBatch) return;
    onUpdateBatch(editingBatch.batchId, {
      fileName: editFileName,
      dateRangeCovered: editDateRange,
    });
    setEditingBatch(null);
    setSuccessMessage('Lote actualizado correctamente.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Safe In-UI Handlers replacing window.confirm
  const handleDeleteBatchClick = (batch: ImportHistoryItem) => {
    setConfirmModal({
      isOpen: true,
      title: `¿Eliminar lote "${batch.fileName}"?`,
      message: `Esta acción eliminará el lote ${batch.batchId} y TODOS sus registros asociados de la base de datos (tanto de Tiempo Extra como de Asistencia). Las estadísticas se recalcularán inmediatamente.`,
      confirmText: 'Sí, Eliminar Lote',
      cancelText: 'Cancelar',
      type: 'danger',
      onConfirm: () => {
        onDeleteBatch(batch.batchId, batch.fileName);
        setSuccessMessage(`Lote "${batch.fileName}" y sus registros fueron eliminados.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      },
    });
  };

  const handleClearDemoClick = () => {
    setConfirmModal({
      isOpen: true,
      title: '¿Eliminar todos los datos ficticios / demo?',
      message:
        'Se eliminarán todos los registros de demostración iniciales para que la aplicación opere ÚNICAMENTE con tus reportes reales de BioTime.',
      confirmText: 'Sí, Eliminar Datos Ficticios',
      cancelText: 'Cancelar',
      type: 'warning',
      onConfirm: () => {
        onClearDemoData();
        setSuccessMessage('Datos ficticios eliminados. La base de datos operará con tus reportes.');
        setTimeout(() => setSuccessMessage(null), 3500);
      },
    });
  };

  const handleClearAllClick = () => {
    setConfirmModal({
      isOpen: true,
      title: '¿Vaciar completamente la base de datos?',
      message:
        'ADVERTENCIA: Esta acción eliminará absolutamente todos los registros de asistencia, tiempo extra y lotes importados. La base de datos quedará en 0 registros.',
      confirmText: 'Sí, Vaciar Base de Datos',
      cancelText: 'Cancelar',
      type: 'danger',
      onConfirm: () => {
        onClearDatabase();
        setSuccessMessage('Base de datos vaciada. Lista para importar reportes desde cero.');
        setTimeout(() => setSuccessMessage(null), 3500);
      },
    });
  };

  const handleRefreshBatchClick = (batch: ImportHistoryItem) => {
    onRefreshData();
    setSuccessMessage(`Estadísticas del lote "${batch.fileName}" recalculadas.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const hasDemoData =
    importHistory.some((h) => h.batchId.startsWith('BATCH_INIT_')) ||
    totalRecords.ot === 7 ||
    totalRecords.att === 132;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
              Centro de Ingestión y Gestión de Datos
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Fuente de la Verdad: Archivos BioTime Importados
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Importación e Historial de Reportes
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Carga tus reportes originales de <strong>Tiempo Extra</strong> y <strong>Total de Asistencia</strong>. Puedes eliminar lotes, actualizarlos o editarlos directamente con los botones de acción.
          </p>
        </div>

        {/* Global Toolbar: Actualizar, Eliminar Datos Ficticios, Limpiar Todo */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              onRefreshData();
              setSuccessMessage('Base de datos y estadísticas recalculadas.');
              setTimeout(() => setSuccessMessage(null), 3000);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recalcular métricas sobre todos los registros cargados"
          >
            <i className="bi bi-arrow-repeat text-blue-600"></i>
            <span>Actualizar Datos</span>
          </button>

          {hasDemoData && (
            <button
              type="button"
              onClick={handleClearDemoClick}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Elimina únicamente los datos de demostración precalibrados"
            >
              <i className="bi bi-trash3 text-amber-700"></i>
              <span>Eliminar Datos Ficticios</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClearAllClick}
            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Borra todos los registros para iniciar desde cero"
          >
            <i className="bi bi-x-circle text-rose-600"></i>
            <span>Limpiar Todo (0 reg.)</span>
          </button>
        </div>
      </div>

      {/* Source of Truth Info Card */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center text-lg border border-blue-500/30">
            <i className="bi bi-database-check"></i>
          </div>
          <div>
            <div className="font-bold text-slate-100">
              Estado de la Base de Datos: {totalRecords.ot} registros TE • {totalRecords.att} registros Asistencia
            </div>
            <div className="text-slate-400 text-[11px]">
              {importHistory.length > 0
                ? `${importHistory.length} lote(s) en historial. Cada fila importada se valida con el Catálogo Oficial de 20 Motivos.`
                : 'Sin lotes importados todavía. Usa el botón azul abajo para seleccionar tu archivo de BioTime.'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => generateSampleBioTimeFile('overtime')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
          >
            <i className="bi bi-file-earmark-spreadsheet text-emerald-400"></i>
            <span>Plantilla TE (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => generateSampleBioTimeFile('attendance')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
          >
            <i className="bi bi-file-earmark-spreadsheet text-blue-400"></i>
            <span>Plantilla Asistencia (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill text-rose-600 text-base"></i>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="bi bi-check-circle-fill text-emerald-600 text-base"></i>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}

      {/* Hidden File Input (Always accessible) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleProcessFile(e.target.files[0]);
            // Reset input value so same file can be selected again if needed
            e.target.value = '';
          }
        }}
      />

      {/* Drag & Drop Upload Zone with Explicit Primary Button */}
      {!staged && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleProcessFile(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-9 text-center transition-all bg-white ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-blue-400'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 ring-8 ring-blue-50/50">
            {processing ? (
              <i className="bi bi-arrow-repeat text-2xl animate-spin"></i>
            ) : (
              <i className="bi bi-cloud-arrow-up-fill text-3xl"></i>
            )}
          </div>

          <h3 className="text-base font-bold text-slate-800">
            {processing ? 'Analizando estructura BioTime...' : 'Cargar reporte de "Total de Asistencia" o "Tiempo Extra"'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto mb-4">
            Soporta archivos Excel (.xlsx, .xls) y CSV (.csv) exportados de BioTime o Google Sheets. Los datos se extraen respetando los encabezados correspondientes.
          </p>

          {/* Primary Action Button */}
          <div className="flex justify-center mb-3">
            <button
              type="button"
              disabled={processing}
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer hover:shadow-lg active:scale-95"
            >
              <i className="bi bi-file-earmark-arrow-up-fill text-base"></i>
              <span>Seleccionar Archivo Excel (.xlsx)</span>
            </button>
          </div>

          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1 font-medium">
              <i className="bi bi-check2-circle text-emerald-600"></i> Detección Automática
            </span>
            <span className="flex items-center gap-1 font-medium">
              <i className="bi bi-shield-check text-blue-600"></i> Validación vs 20 Motivos Oficiales
            </span>
            <span className="flex items-center gap-1 font-medium">
              <i className="bi bi-building text-purple-600"></i> Todas las Empresas en TE | Polaquimia, MLBM, Barteleu en Asistencia
            </span>
          </div>
        </div>
      )}

      {/* Pre-Import Validation Modal / Card */}
      {staged && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-md p-6 space-y-5">
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-blue-600 text-white">
                  Vista Previa de Importación
                </span>
                <span className="text-xs font-mono text-slate-600 font-semibold">
                  {staged.file.name}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                Tipo Detectado: {staged.fileType === 'overtime' ? 'Tiempo Extra' : 'Total de Asistencia'}
              </h3>
              <p className="text-xs text-slate-500">
                Encabezados detectados en la <strong>fila {staged.detectedHeaderRow + 1}</strong> • Hoja: <strong>{staged.sheetName}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStaged(null)}
              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <i className="bi bi-x-lg text-lg"></i>
            </button>
          </div>

          {/* Validation Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-emerald-700 block font-semibold">Nuevos Registros</span>
              <span className="text-2xl font-bold text-emerald-700">{staged.newCount}</span>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-blue-700 block font-semibold">Actualizados (Modificaciones)</span>
              <span className="text-2xl font-bold text-blue-700">{staged.updatedCount}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-100 border border-slate-200">
              <span className="text-slate-600 block font-semibold">Duplicados Ignorados</span>
              <span className="text-2xl font-bold text-slate-700">{staged.ignoredCount}</span>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <span className="text-rose-700 block font-semibold">Rechazados / Anomalías</span>
              <span className="text-2xl font-bold text-rose-700">{staged.rejectedCount}</span>
            </div>
          </div>

          {/* Confirmation Actions */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-600">
              Total de filas leídas: <strong>{staged.totalRows}</strong> • Periodo cubierto:{' '}
              <strong>
                {staged.dateRange
                  ? `${staged.dateRange.start} a ${staged.dateRange.end}`
                  : 'Varias fechas'}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStaged(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={processing}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <i className="bi bi-check2-circle text-base"></i>
                <span>Confirmar y Guardar en BD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial de Importaciones Table with Working Eliminar, Actualizar y Editar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Historial y Control de Lotes Importados</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                {importHistory.length} lotes
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de lotes con botones funcionales de <strong>Eliminar</strong>, <strong>Actualizar</strong> y <strong>Editar</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onRefreshData();
                setSuccessMessage('Historial y métricas actualizados.');
                setTimeout(() => setSuccessMessage(null), 2500);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <i className="bi bi-arrow-repeat text-blue-600"></i>
              <span>Refrescar Lista</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Lote / Batch ID</th>
                <th className="px-3 py-2.5">Archivo Origen</th>
                <th className="px-3 py-2.5">Tipo Reporte</th>
                <th className="px-3 py-2.5">Fecha Importación</th>
                <th className="px-3 py-2.5 text-center">Nuevos</th>
                <th className="px-3 py-2.5 text-center">Actualizados</th>
                <th className="px-3 py-2.5 text-center">Ignorados</th>
                <th className="px-3 py-2.5">Periodo Cubierto</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {importHistory.length > 0 ? (
                importHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-slate-700">{item.batchId}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{item.fileName}</td>
                    <td className="px-3 py-2.5 capitalize text-slate-600 font-medium">
                      {item.fileType === 'overtime' ? (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Tiempo Extra
                        </span>
                      ) : (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Total Asistencia
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {new Date(item.importedAt).toLocaleString('es-MX')}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-emerald-600">
                      {item.newRecords}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-blue-600">
                      {item.updatedRecords}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-500">{item.ignoredRecords}</td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{item.dateRangeCovered}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'COMPLETADO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    {/* Botones funcionales de Eliminar, Actualizar y Editar */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* Botón Editar */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-medium text-[11px] flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
                          title="Editar metadatos del lote"
                        >
                          <i className="bi bi-pencil-square text-blue-600"></i>
                          <span>Editar</span>
                        </button>

                        {/* Botón Actualizar */}
                        <button
                          type="button"
                          onClick={() => handleRefreshBatchClick(item)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-medium text-[11px] flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
                          title="Actualizar y recalcular lote"
                        >
                          <i className="bi bi-arrow-repeat text-emerald-600"></i>
                          <span>Actualizar</span>
                        </button>

                        {/* Botón Eliminar */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBatchClick(item)}
                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] flex items-center gap-1 border border-rose-200 transition-colors cursor-pointer"
                          title="Eliminar lote y sus registros de la BD"
                        >
                          <i className="bi bi-trash3 text-rose-600"></i>
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No hay lotes en el historial. Carga tus archivos de BioTime para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Editar Lote */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <i className="bi bi-pencil-square text-blue-600"></i>
                <span>Editar Información del Lote</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ID del Lote</label>
                <input
                  type="text"
                  disabled
                  value={editingBatch.batchId}
                  className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-1.5 text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Archivo</label>
                <input
                  type="text"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Periodo Cubierto por los Datos
                </label>
                <input
                  type="text"
                  value={editDateRange}
                  onChange={(e) => setEditDateRange(e.target.value)}
                  placeholder="ej. 2024-10-07 a 2024-10-19"
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
                Tipo: <strong>{editingBatch.fileType}</strong> • Filas: <strong>{editingBatch.totalRows}</strong> • Registros Nuevos: <strong>{editingBatch.newRecords}</strong>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-UI Confirmation Modal (100% iframe safe, works on all browsers) */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
