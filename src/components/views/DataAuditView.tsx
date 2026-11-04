import React, { useState } from 'react';
import { AuditIncident } from '../../types';
import { exportToExcel } from '../../services/excelParser';

interface DataAuditViewProps {
  incidents: AuditIncident[];
  onClearIncidents: () => void;
}

export const DataAuditView: React.FC<DataAuditViewProps> = ({
  incidents,
  onClearIncidents,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critica' | 'alta' | 'media' | 'baja'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filteredIncidents = incidents.filter((inc) => {
    if (severityFilter !== 'ALL' && inc.severity !== severityFilter) return false;
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      inc.message.toLowerCase().includes(s) ||
      (inc.employeeId && inc.employeeId.toLowerCase().includes(s)) ||
      (inc.sourceFile && inc.sourceFile.toLowerCase().includes(s)) ||
      (inc.type && inc.type.toLowerCase().includes(s))
    );
  });

  const criticalCount = incidents.filter((i) => i.severity === 'critica').length;
  const highCount = incidents.filter((i) => i.severity === 'alta').length;
  const mediumCount = incidents.filter((i) => i.severity === 'media').length;
  const lowCount = incidents.filter((i) => i.severity === 'baja').length;

  const totalPages = Math.ceil(filteredIncidents.length / pageSize) || 1;
  const paginatedRows = filteredIncidents.slice((page - 1) * pageSize, page * pageSize);

  const handleExportAudit = () => {
    const exportData = incidents.map((i) => ({
      ID: i.id,
      Tipo: i.type,
      Severidad: i.severity,
      'Tipo de Reporte': i.recordType,
      'Archivo de Origen': i.sourceFile || 'BioTime',
      'ID Colaborador': i.employeeId || 'N/A',
      Fecha: i.date || 'N/A',
      Mensaje: i.message,
      'Fecha Detección': i.detectedAt,
    }));
    exportToExcel(exportData, 'Reporte_Auditoria_Calidad_BioTime');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
              Control de Integridad de Datos
            </span>
            <span className="text-xs text-slate-500">Detección automática de anomalías</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Auditoría y Calidad de Reportes BioTime</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Inspección de marcajes incompletos, IDs vacíos, inconsistencias de turnos y formatos de motivos no autorizados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAudit}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <i className="bi bi-file-earmark-excel-fill text-sm"></i>
            <span>Exportar Informe de Auditoría</span>
          </button>
        </div>
      </div>

      {/* Severity Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => {
            setSeverityFilter('critica');
            setPage(1);
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            severityFilter === 'critica'
              ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 text-xs font-bold uppercase">
            <span>Crítica</span>
            <i className="bi bi-shield-x text-lg"></i>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">{criticalCount}</div>
          <span className="text-[11px] text-slate-500">IDs nulos o corrupción de datos</span>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('alta');
            setPage(1);
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            severityFilter === 'alta'
              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase">
            <span>Alta</span>
            <i className="bi bi-exclamation-octagon text-lg"></i>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{highCount}</div>
          <span className="text-[11px] text-slate-500">Horarios incompletos / duplicados</span>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('media');
            setPage(1);
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            severityFilter === 'media'
              ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between text-blue-700 text-xs font-bold uppercase">
            <span>Media</span>
            <i className="bi bi-info-circle text-lg"></i>
          </div>
          <div className="text-2xl font-black text-blue-600 mt-2">{mediumCount}</div>
          <span className="text-[11px] text-slate-500">Motivos no homologados / 1 marcaje</span>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('baja');
            setPage(1);
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            severityFilter === 'baja'
              ? 'bg-slate-100 border-slate-500 ring-2 ring-slate-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-700 text-xs font-bold uppercase">
            <span>Baja</span>
            <i className="bi bi-check-circle text-lg"></i>
          </div>
          <div className="text-2xl font-black text-slate-700 mt-2">{lowCount}</div>
          <span className="text-[11px] text-slate-500">Posibles errores tipográficos</span>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Listado de Hallazgos Detectados</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
              {filteredIncidents.length} de {incidents.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {severityFilter !== 'ALL' && (
              <button
                onClick={() => setSeverityFilter('ALL')}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Limpiar filtro de severidad
              </button>
            )}
            <div className="relative">
              <i className="bi bi-search absolute left-2.5 top-2 text-slate-400 text-xs"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar hallazgo..."
                className="pl-7 pr-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
            {incidents.length > 0 && (
              <button
                onClick={onClearIncidents}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded border border-slate-200"
                title="Limpiar registro de auditoría"
              >
                <i className="bi bi-trash"></i>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Severidad</th>
                <th className="px-3 py-2.5">Tipo de Incidencia</th>
                <th className="px-3 py-2.5">Reporte</th>
                <th className="px-3 py-2.5">Archivo Origen</th>
                <th className="px-3 py-2.5">Colaborador / ID</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Detalle del Hallazgo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((inc) => {
                  let badge = 'bg-slate-100 text-slate-700';
                  if (inc.severity === 'critica') badge = 'bg-rose-100 text-rose-800 font-bold';
                  else if (inc.severity === 'alta') badge = 'bg-amber-100 text-amber-800 font-bold';
                  else if (inc.severity === 'media') badge = 'bg-blue-100 text-blue-800 font-medium';
                  else if (inc.severity === 'baja') badge = 'bg-slate-100 text-slate-700 font-medium';

                  return (
                    <tr key={inc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${badge}`}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-800">{inc.type}</td>
                      <td className="px-3 py-2.5 capitalize text-slate-600">
                        {inc.recordType === 'overtime' ? 'Tiempo Extra' : 'Asistencia'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] truncate max-w-[150px]">
                        {inc.sourceFile || 'BioTime'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {inc.employeeId ? (
                          <span>
                            {inc.employeeName ? `${inc.employeeName} (${inc.employeeId})` : inc.employeeId}
                          </span>
                        ) : (
                          <span className="text-rose-500 font-bold">VACÍO</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{inc.date || '-'}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{inc.message}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No hay incidencias de auditoría que coincidan con los filtros seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Mostrando {paginatedRows.length} de {filteredIncidents.length} hallazgos
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="px-2 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
