import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  subLabel?: string;
}

interface MultiSelectFilterDropdownProps {
  label: string;
  subLabel?: string;
  placeholder: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (newSelected: string[]) => void;
  badgeText?: string;
  className?: string;
}

export const MultiSelectFilterDropdown: React.FC<MultiSelectFilterDropdownProps> = ({
  label,
  subLabel,
  placeholder,
  options,
  selectedValues,
  onChange,
  badgeText,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Map to quickly look up option labels for chips
  const optionsMap = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const opt of options) {
      map.set(opt.value, opt);
    }
    return map;
  }, [options]);

  // Clean effective selection: filter out 'ALL' if present
  const cleanSelected = useMemo(() => {
    return selectedValues.filter((v) => v !== 'ALL');
  }, [selectedValues]);

  const isAllSelected = cleanSelected.length === 0;

  // Filter options based on local search inside dropdown
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(term))
    );
  }, [options, searchTerm]);

  const handleToggleOption = (val: string) => {
    if (cleanSelected.includes(val)) {
      const next = cleanSelected.filter((v) => v !== val);
      onChange(next);
    } else {
      const next = [...cleanSelected, val];
      // Si seleccionó todas individualmente, convertir a estado neutro []
      if (next.length === options.length && options.length > 0) {
        onChange([]);
      } else {
        onChange(next);
      }
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleRemoveChip = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = cleanSelected.filter((v) => v !== val);
    onChange(next);
  };

  // Button summary text
  const buttonSummary = useMemo(() => {
    if (isAllSelected) {
      return `${placeholder} (${options.length})`;
    }
    if (cleanSelected.length === 1) {
      const single = optionsMap.get(cleanSelected[0]);
      return single ? single.label : cleanSelected[0];
    }
    return `${cleanSelected.length} seleccionados`;
  }, [isAllSelected, cleanSelected, options.length, placeholder, optionsMap]);

  return (
    <div className={`space-y-1.5 ${className}`} ref={dropdownRef}>
      {/* Header con Etiqueta y Sub-etiqueta */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-slate-200">
          {label}
        </label>
        {subLabel && (
          <span className="text-[10px] text-blue-400 font-medium">{subLabel}</span>
        )}
        {badgeText && !subLabel && (
          <span className="text-[10px] text-blue-400 font-medium">{badgeText}</span>
        )}
      </div>

      {/* Selector Trigger Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-slate-800 border ${
            isOpen ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-700 hover:border-slate-600'
          } rounded-xl px-3 py-2 text-slate-100 flex items-center justify-between shadow-xs text-xs cursor-pointer transition-colors text-left`}
          aria-expanded={isOpen}
        >
          <span className="truncate pr-2 font-medium">
            {buttonSummary}
          </span>
          <i
            className={`bi ${isOpen ? 'bi-chevron-up text-blue-400' : 'bi-chevron-down text-slate-400'} text-xs shrink-0 transition-transform`}
          ></i>
        </button>

        {/* Desplegable Multiselección */}
        {isOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900/98 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl p-2 space-y-1.5">
            {/* Buscador interno si hay más de 5 opciones */}
            {options.length > 5 && (
              <div className="relative pb-1">
                <i className="bi bi-search absolute left-2.5 top-2 text-slate-400 text-[11px]"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar en lista..."
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-lg pl-7 pr-2.5 py-1 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            )}

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {/* Opción "Todos" */}
              <div
                onClick={handleSelectAll}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                  isAllSelected ? 'bg-blue-600/15 text-white' : 'hover:bg-slate-800/80 text-slate-300'
                }`}
              >
                {/* Checkbox Cristal */}
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    isAllSelected
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                      : 'border-white/25 bg-white/10 backdrop-blur-sm'
                  }`}
                >
                  {isAllSelected && (
                    <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="truncate font-semibold">
                  Todos ({options.length})
                </div>
              </div>

              {/* Lista de Opciones */}
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => {
                  const isChecked = cleanSelected.includes(opt.value);
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleToggleOption(opt.value)}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                        isChecked ? 'bg-emerald-500/10 text-white' : 'hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      {/* Checkbox Estilo Cristal con Paloma Verde */}
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                          isChecked
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                            : 'border-white/25 bg-white/10 backdrop-blur-sm'
                        }`}
                      >
                        {isChecked && (
                          <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>

                      <div className="truncate flex-1">
                        <div className="truncate font-medium">{opt.label}</div>
                        {opt.subLabel && (
                          <div className="text-[10px] text-slate-400 truncate">{opt.subLabel}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-2 text-[11px] text-slate-400">
                  No se encontraron coincidencias
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tarjetas / Chips Concentrados Debajo del Filtro */}
      {cleanSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {cleanSelected.map((val) => {
            const opt = optionsMap.get(val);
            const displayLabel = opt ? opt.label : val;
            return (
              <span
                key={val}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 shadow-xs max-w-full"
                title={displayLabel}
              >
                <span className="truncate max-w-[190px]">{displayLabel}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveChip(val, e)}
                  className="text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded p-0.5 transition-colors cursor-pointer"
                  title={`Quitar ${displayLabel}`}
                  aria-label={`Quitar ${displayLabel}`}
                >
                  <i className="bi bi-x text-sm leading-none font-bold"></i>
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

