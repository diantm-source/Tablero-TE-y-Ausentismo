import React, { useState, useEffect } from 'react';
import { DepartmentLeader } from '../../types';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface DepartmentLeaderFormModalProps {
  isOpen: boolean;
  initialData?: DepartmentLeader | null;
  existingLeaders: string[];
  onSave: (leader: DepartmentLeader, originalDepartment?: string) => void;
  onClose: () => void;
}

export const DepartmentLeaderFormModal: React.FC<DepartmentLeaderFormModalProps> = ({
  isOpen,
  initialData,
  existingLeaders,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(initialData);

  const [company, setCompany] = useState('Polaquimia');
  const [department, setDepartment] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [leaderPosition, setLeaderPosition] = useState('Responsable de Área');
  const [validFrom, setValidFrom] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setCompany(initialData.company || 'Polaquimia');
        setDepartment(initialData.department || '');
        setLeaderName(initialData.leaderName || '');
        setLeaderPosition(initialData.leaderPosition || 'Responsable de Área');
        setValidFrom(initialData.validFrom || new Date().toISOString().slice(0, 10));
      } else {
        setCompany('Polaquimia');
        setDepartment('');
        setLeaderName('');
        setLeaderPosition('Responsable de Área');
        setValidFrom(new Date().toISOString().slice(0, 10));
      }
      setError(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDept = department.trim();
    const cleanLeader = leaderName.trim();

    if (!cleanDept) {
      setError('El nombre del departamento es obligatorio.');
      return;
    }
    if (!cleanLeader) {
      setError('El nombre del líder asignado es obligatorio.');
      return;
    }

    const payload: DepartmentLeader = {
      id: initialData?.id || `lead-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company: company.trim() || 'Polaquimia',
      department: cleanDept,
      leaderName: cleanLeader,
      leaderPosition: leaderPosition.trim() || 'Responsable de Área',
      validFrom: validFrom || new Date().toISOString().slice(0, 10),
      employeeCount: initialData?.employeeCount,
    };

    onSave(payload, initialData?.department);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-lg p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-base shrink-0 border border-blue-100">
              <i className={`bi ${isEditing ? 'bi-pencil-square' : 'bi-plus-circle-fill'}`}></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEditing ? 'Editar Asignación Departamental' : 'Nueva Asignación Departamental'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isEditing
                  ? 'Modifica los detalles del área y la persona responsable'
                  : 'Registra un departamento y asocia su líder responsable'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Cerrar"
          >
            <i className="bi bi-x-lg text-sm"></i>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <i className="bi bi-exclamation-circle-fill shrink-0"></i>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Empresa <span className="text-red-500">*</span>
              </label>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              >
                <option value="Polaquimia">Polaquimia</option>
                <option value="MLBM">MLBM</option>
                <option value="Barteleu">Barteleu</option>
                <option value="Polatecnia">Polatecnia</option>
                <option value="Becarios">Becarios</option>
                <option value="Externos">Externos</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Fecha de Vigencia
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nombre del Departamento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ej. PLANTA 3 PQ, MANTENIMIENTO TLAX PQ..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Líder Asignado <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="existing-leaders-datalist"
              value={leaderName}
              onChange={(e) => {
                setLeaderName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Selecciona o escribe el nombre del líder..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
            />
            <datalist id="existing-leaders-datalist">
              {existingLeaders.map((lead) => (
                <option key={lead} value={lead} />
              ))}
            </datalist>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Sugerencia: Puedes seleccionar un líder existente o escribir uno nuevo.
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Puesto / Cargo
            </label>
            <input
              type="text"
              value={leaderPosition}
              onChange={(e) => setLeaderPosition(e.target.value)}
              placeholder="Responsable de Área"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <i className="bi bi-check2"></i>
              <span>{isEditing ? 'Guardar Cambios' : 'Registrar Asignación'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DepartmentLeaderDeleteModalProps {
  isOpen: boolean;
  leader: DepartmentLeader | null;
  onConfirm: (department: string) => void;
  onClose: () => void;
}

export const DepartmentLeaderDeleteModal: React.FC<DepartmentLeaderDeleteModalProps> = ({
  isOpen,
  leader,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !leader) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200">
        {/* Warning Icon in circular container */}
        <div className="w-13 h-13 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
          <i className="bi bi-exclamation-triangle-fill"></i>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-slate-900">
            ¿Eliminar asignación departamental?
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Esta acción retirará el departamento y su líder del catálogo activo y de los filtros.
          </p>
        </div>

        {/* Details Box */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-1.5 text-xs text-left">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Departamento:</span>
            <span className="font-bold text-slate-900">{leader.department}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Líder Asignado:</span>
            <span className="font-bold text-blue-700">{leader.leaderName || 'Sin líder asignado'}</span>
          </div>
          {leader.leaderPosition && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Puesto:</span>
              <span className="text-slate-600">{leader.leaderPosition}</span>
            </div>
          )}
          {leader.company && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Empresa:</span>
              <span className="text-slate-600 font-medium">{leader.company}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors text-center"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(leader.department);
              onClose();
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <i className="bi bi-trash3-fill"></i>
            <span>Sí, eliminar registro</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface ToastNotificationProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  const bgStyles =
    toast.type === 'error'
      ? 'bg-rose-900/95 text-white border-rose-700'
      : toast.type === 'info'
      ? 'bg-blue-900/95 text-white border-blue-700'
      : 'bg-slate-900/95 text-white border-slate-700';

  const iconClass =
    toast.type === 'error'
      ? 'bi-x-circle-fill text-rose-400'
      : toast.type === 'info'
      ? 'bi-info-circle-fill text-blue-400'
      : 'bi-check-circle-fill text-emerald-400';

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-4 duration-250 max-w-sm">
      <div className={`flex items-center gap-2.5 text-xs font-medium ${bgStyles} p-0`}>
        <i className={`bi ${iconClass} text-base shrink-0`}></i>
        <span className="flex-1 text-slate-100">{toast.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
        >
          <i className="bi bi-x-lg text-xs"></i>
        </button>
      </div>
    </div>
  );
};

