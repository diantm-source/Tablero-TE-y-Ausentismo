import React from 'react';
import { NavigationSection } from '../types';

interface SidebarProps {
  currentSection: NavigationSection;
  onNavigate: (section: NavigationSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  pendingOtCount: number;
  auditIncidentsCount: number;
  isMobileDrawer?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onNavigate,
  collapsed,
  onToggleCollapse,
  pendingOtCount,
  auditIncidentsCount,
  isMobileDrawer = false,
}) => {
  const menuItems: {
    id: NavigationSection;
    label: string;
    icon: string;
    badge?: number;
    badgeColor?: string;
  }[] = [
    {
      id: 'executive',
      label: 'Resumen Ejecutivo',
      icon: 'bi-speedometer2',
    },
    {
      id: 'overtime',
      label: 'Análisis de Tiempo Extra',
      icon: 'bi-clock-history',
      badge: pendingOtCount > 0 ? pendingOtCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'attendance',
      label: 'Análisis de Ausentismo',
      icon: 'bi-calendar-check',
    },
    {
      id: 'departments',
      label: 'Departamentos y Líderes',
      icon: 'bi-diagram-3',
    },
    {
      id: 'audit',
      label: 'Auditoría y Calidad de Datos',
      icon: 'bi-shield-check',
      badge: auditIncidentsCount > 0 ? auditIncidentsCount : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    },
    {
      id: 'import',
      label: 'Importación e Historial',
      icon: 'bi-cloud-arrow-up',
    },
    {
      id: 'catalogs',
      label: 'Catálogos y Configuración',
      icon: 'bi-sliders',
    },
  ];

  return (
    <aside
      className={`bg-slate-900 border border-slate-800 flex flex-col transition-all duration-300 z-20 shrink-0 overflow-hidden shadow-sm ${
        isMobileDrawer
          ? 'w-full h-full rounded-none border-0'
          : `rounded-3xl mt-0.5 mb-2.5 ml-4 ${collapsed ? 'w-16' : 'w-64'}`
      }`}
    >
      {/* Brand / Collapse toggle */}
      {!isMobileDrawer && (
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 truncate">
                Módulos del Sistema
              </span>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mx-auto cursor-pointer"
          >
            <i
              className={`bi ${collapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar-inset-reverse'} text-lg`}
            ></i>
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full min-h-[42px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all group cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <i
                className={`bi ${item.icon} text-base shrink-0 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                }`}
              ></i>

              {!collapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border ml-2 ${
                        item.badgeColor || 'bg-slate-700 text-slate-200 border-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Info */}
      <div className="p-3 border-t border-slate-800/80 text-xs text-slate-300">
        {!collapsed ? (
          <div className="space-y-1">
            <div className="font-semibold text-slate-200">BioTime Analytics v2.5</div>
            <div className="text-[11px] text-slate-400">Norma ISO 8601 (Lun-Dom)</div>
          </div>
        ) : (
          <div className="text-center font-bold text-slate-400 text-xs">BT</div>
        )}
      </div>
    </aside>
  );
};
