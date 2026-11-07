import React from 'react';
import { ChevronsLeft, ChevronsRight, Download } from 'lucide-react';

/**
 * Barra lateral de navegación para escritorio (≥1024 px).
 * Va dentro del flujo del layout (no flotante), así que nunca tapa el contenido ni el plano.
 * Es plegable: expandida muestra icono + texto; plegada solo iconos con tooltip.
 */
export default function SideNav({ tabs, activeTab, onSelect, collapsed, onToggle, onInstall }) {
    return (
        <nav
            aria-label="Navegación principal"
            className={`hidden lg:flex flex-col flex-shrink-0 h-full bg-[#1E293B] border-r border-white/10 shadow-xl z-30 transition-[width] duration-200 ease-out ${collapsed ? 'w-[4.5rem]' : 'w-56'}`}
        >
            {/* Marca */}
            <div className={`flex items-center gap-2 h-14 flex-shrink-0 border-b border-white/10 ${collapsed ? 'justify-center' : 'px-4'}`}>
                <span className="text-xl" aria-hidden>🎱</span>
                {!collapsed && <span className="text-sm font-black tracking-wide text-white truncate">Pool Imperial</span>}
            </div>

            {/* Secciones */}
            <div className="flex-1 min-h-0 overflow-y-auto py-3 px-2 flex flex-col gap-1">
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onSelect(tab.id)}
                            title={collapsed ? tab.label : undefined}
                            aria-current={active ? 'page' : undefined}
                            data-tour={`tab-${tab.id}`}
                            className={`group flex items-center gap-3 rounded-xl py-2.5 transition-all active:scale-95 ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                                active
                                    ? 'bg-[#D97706] text-white shadow-md shadow-amber-900/30'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Icon size={20} strokeWidth={active ? 2.75 : 2} className="flex-shrink-0" />
                            {!collapsed && <span className="text-sm font-bold truncate">{tab.label}</span>}
                        </button>
                    );
                })}
            </div>

            {/* Pie: instalar app + plegar */}
            <div className="flex-shrink-0 border-t border-white/10 p-2 flex flex-col gap-1">
                {onInstall && (
                    <button
                        onClick={onInstall}
                        title={collapsed ? 'Instalar app' : undefined}
                        className={`flex items-center gap-3 rounded-xl py-2.5 bg-brand text-white shadow-md ${collapsed ? 'justify-center px-0' : 'px-3'}`}
                    >
                        <Download size={20} className="flex-shrink-0" />
                        {!collapsed && <span className="text-sm font-bold">Instalar app</span>}
                    </button>
                )}
                <button
                    onClick={onToggle}
                    title={collapsed ? 'Expandir menú (Ctrl+B)' : 'Plegar menú (Ctrl+B)'}
                    aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
                    className={`flex items-center gap-3 rounded-xl py-2.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all ${collapsed ? 'justify-center px-0' : 'px-3'}`}
                >
                    {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
                    {!collapsed && <span className="text-xs font-bold">Plegar menú</span>}
                </button>
            </div>
        </nav>
    );
}
