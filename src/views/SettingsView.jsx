import React, { useState, useRef, useEffect } from 'react';
import {
    Store, CreditCard, Database, Users, FileText,
    AlertTriangle, Download, Upload, Share2,
    Sun, Moon, LogOut, Trash2, Copy, Check,
    ChevronRight, ShieldCheck, Package, Printer, Layers, Settings
} from 'lucide-react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import PaymentMethodsManager from '../components/Settings/PaymentMethodsManager';
import UsersManager from '../components/Settings/UsersManager';
import AuditLogViewer from '../components/Settings/AuditLogViewer';
import { useSecurity } from '../hooks/useSecurity';
import { supabaseCloud } from '../config/supabaseCloud';
import { useProductContext } from '../context/ProductContext';
import { useAuthStore } from '../hooks/store/authStore';
import ShareInventoryModal from '../components/ShareInventoryModal';
import { useAudit } from '../hooks/useAudit';
import { useConfirm } from '../hooks/useConfirm.jsx';
import SettingsTabNegocio from '../components/Settings/tabs/SettingsTabNegocio';
import SettingsTabVentas from '../components/Settings/tabs/SettingsTabVentas';
import SettingsTabUsuarios from '../components/Settings/tabs/SettingsTabUsuarios';
import SettingsTabSistema from '../components/Settings/tabs/SettingsTabSistema';
import SettingsTabMesas from '../components/Settings/tabs/SettingsTabMesas';
import SettingsTabBitacora from '../components/Settings/tabs/SettingsTabBitacora';
import { setImportGuard } from '../hooks/useCloudSync';
import SpotlightTour from '../components/SpotlightTour';

// ─── Tour steps por pestaña ────────────────────────────────────────────────────
const SETTINGS_TAB_TOURS = {
    mesas: {
        key: 'pda_settings_tour_mesas',
        steps: [
            { target: null, title: 'Configuración de Mesas', text: 'Aquí configuras las tarifas y creas las mesas físicas de tu local.', emoji: '🎱' },
            { target: '[data-tour="settings-mesas-rates"]', title: 'Tarifas de Juego', text: 'Define el precio por hora prepago y el precio fijo por partida ("La Piña"). Toca "Guardar Tarifas" cuando termines.' },
            { target: '[data-tour="settings-mesas-add"]', title: 'Crear Mesas', text: 'Escribe el nombre de la mesa (ej. "Mesa 1"), elige si es Pool con tiempo o una mesa de Bar normal, y toca "+ Agregar". Repite para cada mesa de tu local.' },
        ],
    },
    ventas: {
        key: 'pda_settings_tour_ventas',
        steps: [
            { target: null, title: 'Configuración de Ventas', text: 'Gestiona los métodos de pago disponibles y los permisos del cajero para este negocio.', emoji: '💳' },
            { target: '[data-tour="settings-payment-methods"]', title: 'Métodos de Pago', text: 'Activa o desactiva los métodos disponibles en el cobro: efectivo USD, Bs, Pago Móvil, Zelle, punto de venta y más.' },
            { target: '[data-tour="settings-cajero-perms"]', title: 'Permisos del Cajero', text: 'Define si el cajero puede abrir y cerrar caja, aplicar descuentos y hasta qué porcentaje máximo.' },
            { target: '[data-tour="settings-stock"]', title: 'Control de Stock', text: 'Activa "Stock Negativo" para permitir ventas aunque el inventario llegue a cero. Útil para productos bajo pedido.' },
        ],
    },
    usuarios: {
        key: 'pda_settings_tour_usuarios',
        steps: [
            { target: null, title: 'Gestión de Usuarios', text: 'Crea y administra el equipo de trabajo: administradores, cajeros y meseros. Cada rol tiene acceso restringido a sus funciones.', emoji: '👥' },
            { target: '[data-tour="settings-user-list"]', title: 'Lista de Usuarios', text: 'Aquí ves todos los usuarios activos. Toca uno para editar su nombre, PIN o rol. Desactiva usuarios que ya no trabajen.' },
            { target: '[data-tour="settings-auto-lock"]', title: 'Auto-Bloqueo', text: 'Configura en cuántos minutos de inactividad el sistema pide PIN nuevamente. Protege contra accesos no autorizados.' },
        ],
    },
    bitacora: {
        key: 'pda_settings_tour_bitacora',
        steps: [
            { target: null, title: 'Bitácora de Auditoría', text: 'Registro detallado de todas las acciones del sistema: ventas, ajustes, inicios de sesión y cambios de configuración.', emoji: '📋' },
            { target: '[data-tour="settings-audit-log"]', title: 'Registro de Eventos', text: 'Cada acción queda registrada con fecha, hora y usuario responsable. Filtra por tipo de evento para encontrar lo que buscas.' },
        ],
    },
    sistema: {
        key: 'pda_settings_tour_sistema',
        steps: [
            { target: null, title: 'Configuración del Sistema', text: 'Respaldo de información, zona de peligro y herramientas de mantenimiento del sistema.', emoji: '⚙️' },
            { target: '[data-tour="settings-backup"]', title: 'Exportar / Importar', text: 'Descarga una copia de todos tus datos en JSON. Úsala como respaldo o para migrar a otro dispositivo. Para restaurar, toca "Importar Backup" y selecciona el archivo .json.' },
        ],
    },
};

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
    { id: 'mesas',     label: 'Mesas',     icon: Layers,       color: 'sky',    adminOnly: true },
    { id: 'ventas',    label: 'Ventas',     icon: CreditCard,   color: 'emerald' },
    { id: 'usuarios',  label: 'Usuarios',   icon: Users,        color: 'violet', adminOnly: true },
    { id: 'bitacora',  label: 'Bitácora',   icon: FileText,     color: 'indigo', adminOnly: true },
    { id: 'sistema',   label: 'Sistema',    icon: Database,     color: 'amber' },
];

const COLOR_MAP = {
    indigo:  { pill: 'bg-indigo-500',  icon: 'text-indigo-500',  iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',  pillText: 'text-white' },
    emerald: { pill: 'bg-emerald-500', icon: 'text-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', pillText: 'text-white' },
    violet:  { pill: 'bg-violet-500',  icon: 'text-violet-500',  iconBg: 'bg-violet-50 dark:bg-violet-500/10',  pillText: 'text-white' },
    sky:     { pill: 'bg-sky-500',     icon: 'text-sky-500',     iconBg: 'bg-sky-50 dark:bg-sky-500/10',       pillText: 'text-white' },
    amber:   { pill: 'bg-amber-500',   icon: 'text-amber-500',   iconBg: 'bg-amber-50 dark:bg-amber-500/10',   pillText: 'text-white' },
};

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsView({ onClose: _onClose, theme, toggleTheme, triggerHaptic }) {
    const {
        products, categories, setProducts, setCategories,
        copEnabled, setCopEnabled,
        autoCopEnabled, setAutoCopEnabled,
        tasaCopManual, setTasaCopManual,
        tasaCop: calculatedTasaCop
    } = useProductContext();

    const role = useAuthStore(s => s.role);
    const isAdmin = role === 'ADMIN';
    
    const { deviceId, forceHeartbeat } = useSecurity();
    const { log: auditLog } = useAudit();
    const confirm = useConfirm();
    const fileInputRef = useRef(null);

    // Cloud session email for header badge
    const [cloudEmail, setCloudEmail] = useState(null);
    useEffect(() => {
        supabaseCloud.auth.getSession().then(({ data: { session } }) => {
            setCloudEmail(session?.user?.email || null);
        });
    }, []);

    const [activeTab, setActiveTab] = useState(() => {
        const pending = localStorage.getItem('settings_open_tab');
        if (pending) { localStorage.removeItem('settings_open_tab'); return pending; }
        return 'ventas';
    });

    // Listen for tab changes from outside (e.g. dashboard quick action)
    useEffect(() => {
        const handler = () => {
            const pending = localStorage.getItem('settings_open_tab');
            if (pending) { localStorage.removeItem('settings_open_tab'); setActiveTab(pending); }
        };
        window.addEventListener('focus', handler);
        const interval = setInterval(handler, 500);
        return () => { window.removeEventListener('focus', handler); clearInterval(interval); };
    }, []);
    const [idCopied, setIdCopied] = useState(false);

    // ── Tour de configuración ──────────────────────────────────────────────────
    // activeTour: { steps, key } | null
    const [activeTour, setActiveTour] = useState(null);
    const activeTourRef = useRef(null);
    activeTourRef.current = activeTour;

    const dismissCurrentTour = () => {
        const t = activeTourRef.current;
        if (t) {
            localStorage.setItem(t.key, 'true');
            setActiveTour(null);
        }
    };

    // Cuando cambia la pestaña activa:
    //  1. Si había un tour activo → lo cierra marcándolo como visto
    //  2. Si la nueva pestaña tiene tour pendiente → lo dispara tras 500ms
    useEffect(() => {
        dismissCurrentTour();
        const tourConfig = SETTINGS_TAB_TOURS[activeTab];
        if (!tourConfig) return;
        if (localStorage.getItem(tourConfig.key) === 'true') return;
        const t = setTimeout(() => {
            setActiveTour({ steps: tourConfig.steps, key: tourConfig.key });
        }, 500);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [shareCustomers, setShareCustomers] = useState([]);
    const [shareSales, setShareSales] = useState([]);
    const [importStatus, setImportStatus] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');

    const [dangerZoneClicks, setDangerZoneClicks] = useState(0);
    const [lastDangerClick, setLastDangerClick] = useState(0);
    const dangerZoneUnlocked = dangerZoneClicks >= 5;

    const handleDangerZoneClick = () => {
        const now = Date.now();
        if (now - lastDangerClick > 2000) {
            setDangerZoneClicks(1);
        } else {
            setDangerZoneClicks(c => c + 1);
        }
        setLastDangerClick(now);
    };

    const [businessName, setBusinessName] = useState(localStorage.getItem('business_name') || 'Pool Imperial');
    const [businessRif, setBusinessRif] = useState(localStorage.getItem('business_rif') || '');
    const [paperWidth, setPaperWidth] = useState(localStorage.getItem('printer_paper_width') || '58');
    const [allowNegativeStock, setAllowNegativeStock] = useState(localStorage.getItem('allow_negative_stock') === 'true');
    const [maxDiscountCajero, setMaxDiscountCajero] = useState(parseInt(localStorage.getItem('max_discount_cajero') ?? '100') || 100);
    const [cajeroAbreCaja, setCajeroAbreCaja] = useState(localStorage.getItem('cajero_puede_abrir_caja') === 'true');
    const [cajeroCierraCaja, setCajeroCierraCaja] = useState(localStorage.getItem('cajero_puede_cerrar_caja') === 'true');
    const [cajeroVeMesas, setCajeroVeMesas] = useState(localStorage.getItem('cajero_puede_ver_mesas') === 'true');
    const [autoLockMinutes, setAutoLockMinutes] = useState(localStorage.getItem('admin_auto_lock_minutes') || '5');
    const [autoLockOnMinimize, setAutoLockOnMinimize] = useState(localStorage.getItem('admin_auto_lock_on_minimize') !== 'false');


    const handleSaveBusinessData = () => {
        localStorage.setItem('business_name', businessName);
        localStorage.setItem('business_rif', businessRif);
        localStorage.setItem('printer_paper_width', paperWidth);
        localStorage.setItem('allow_negative_stock', allowNegativeStock.toString());
        showToast('Datos guardados correctamente', 'success');
        triggerHaptic?.('light');
    };

    const handleFactoryReset = async () => {
        const ok1 = await confirm({
            title: '⚠ Restablecer Fábrica',
            message: 'Esto borrará TODO: productos, ventas, clientes, caja, configuraciones y datos en la nube. La app quedará como nueva instalación. No hay vuelta atrás.',
            confirmText: 'Sí, borrar todo',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok1) return;

        const ok2 = await confirm({
            title: '¿Completamente seguro?',
            message: 'Esta acción es permanente e irreversible. Se perderá todo el historial y el inventario.',
            confirmText: 'Confirmar — Borrar todo',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!ok2) return;

        try {
            showToast('Restableciendo...', 'info');

            // 1. Borrar datos en la nube
            const { data: { session } } = await supabaseCloud.auth.getSession();
            if (session) {
                await Promise.allSettled([
                    supabaseCloud.from('cash_sessions').delete().not('id', 'is', null),
                    supabaseCloud.from('sync_documents').delete().not('doc_id', 'is', null),
                    supabaseCloud.from('cloud_backups').delete().eq('email', session.user.email),
                    supabaseCloud.from('account_devices').delete().not('device_id', 'is', null),
                ]);
                await supabaseCloud.auth.signOut();
            }

            // 2. Borrar IndexedDB (localforage)
            const lf = await import('localforage');
            await lf.default.clear();

            // 3. Borrar localStorage
            localStorage.clear();

            // 4. Recargar
            window.location.reload();
        } catch (err) {
            showToast('Error al restablecer: ' + err.message, 'error');
        }
    };

    const handleExport = async () => {
        try {
            setImportStatus('loading');
            setStatusMessage('Generando backup completo...');
            const idbKeys = [
                'bodega_products_v1', 'poolbar_categories_v1',
                'bodega_sales_v1', 'bodega_customers_v1',
                'bodega_suppliers_v1', 'bodega_supplier_invoices_v1',
                'bodega_accounts_v2', 'bodega_pending_cart_v1',
                'payment_methods_v1', 'payment_methods_v2'
            ];
            const idbData = {};
            for (const key of idbKeys) {
                const data = await storageService.getItem(key, null);
                if (data !== null) idbData[key] = data;
            }
            const lsKeys = [
                'premium_token', 'street_rate_bs', 'catalog_use_auto_usdt',
                'catalog_custom_usdt_price', 'catalog_show_cash_price',
                'monitor_rates_v12', 'business_name', 'business_rif',
                'printer_paper_width', 'allow_negative_stock', 'cop_enabled',
                'auto_cop_enabled', 'tasa_cop', 'bodega_use_auto_rate',
                'bodega_custom_rate', 'bodega_inventory_view'
            ];
            const lsData = {};
            for (const key of lsKeys) {
                const val = localStorage.getItem(key);
                if (val !== null) lsData[key] = val;
            }
            const blob = new Blob([JSON.stringify({ timestamp: new Date().toISOString(), version: '2.0', appName: 'PoolImperial', data: { idb: idbData, ls: lsData } })], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `backup_pool_imperial_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setImportStatus('success'); setStatusMessage('Backup descargado.');
            auditLog('SISTEMA', 'BACKUP_EXPORTADO', 'Backup completo exportado');
            setTimeout(() => setImportStatus(null), 3000);
        } catch (_error) {
            setImportStatus('error'); setStatusMessage('Error al generar backup.');
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        // Reset input so same file can be re-selected if needed
        event.target.value = '';
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                setImportStatus('loading'); setStatusMessage('Restaurando...');
                const json = JSON.parse(e.target.result);
                if (!json.data) throw new Error('Formato invalido.');

                if (json.version === '2.0' && json.data.idb) {
                    // Import IDB keys one by one, tolerating individual sync errors
                    for (const [key, value] of Object.entries(json.data.idb)) {
                        try {
                            await storageService.setItem(key, value);
                        } catch (innerErr) {
                            console.warn(`[Import] Error guardando ${key}, continuando...`, innerErr);
                        }
                    }
                    if (json.data.ls) {
                        for (const [key, value] of Object.entries(json.data.ls)) {
                            localStorage.setItem(key, value);
                        }
                    }
                } else {
                    if (json.data.bodega_products_v1) {
                        await storageService.setItem('bodega_products_v1', typeof json.data.bodega_products_v1 === 'string' ? JSON.parse(json.data.bodega_products_v1) : json.data.bodega_products_v1);
                    }
                }

                setImportStatus('success'); setStatusMessage('Restauracion finalizada. Reiniciando...');
                auditLog('SISTEMA', 'BACKUP_IMPORTADO', 'Backup restaurado'); triggerHaptic?.();
                // Activar guard para que el pull inicial de la nube no sobreescriba los datos importados
                setImportGuard();
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                console.error('[Import] Error critico al restaurar backup:', err);
                setImportStatus('error'); setStatusMessage(`Error: ${err.message || 'archivo invalido'}.`);
            }
        };
        reader.onerror = () => {
            setImportStatus('error'); setStatusMessage('Error: no se pudo leer el archivo.');
        };
        reader.readAsText(file);
    };

    const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);
    const currentTab = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];
    const colors = COLOR_MAP[currentTab?.color] || COLOR_MAP.indigo;

    // ─── RENDER ────────────────────────────────────────────────────────────────
    return (
        <>
        {activeTour && (
            <SpotlightTour
                steps={activeTour.steps}
                onComplete={() => {
                    localStorage.setItem(activeTour.key, 'true');
                    setActiveTour(null);
                }}
                onSkip={() => {
                    localStorage.setItem(activeTour.key, 'true');
                    setActiveTour(null);
                }}
            />
        )}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">

            {/* ── Header ── */}
            <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <div className="px-4 pt-4 pb-0">
                    {/* Title row */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                                    <Settings size={18} className="text-slate-600 dark:text-slate-300" />
                                </div>
                                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Configuración</h1>
                            </div>
                            <p
                                className="text-[11px] text-slate-400 font-medium mt-0.5 select-none cursor-default ml-10 sm:ml-11"
                                onClick={() => setDangerZoneClicks(c => c >= 5 ? c : c + 1)}
                            >
                                {businessName || 'Pool Imperial'}
                            </p>
                        </div>
                        {/* Cloud session badge + logout */}
                        {isAdmin && cloudEmail && (
                            <button
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: 'Cerrar sesión',
                                        message: 'Se cerrará tu acceso a la nube. Deberás iniciar sesión nuevamente.',
                                        confirmText: 'Cerrar sesión',
                                        cancelText: 'Cancelar',
                                        variant: 'logout',
                                    });
                                    if (!ok) return;
                                    await supabaseCloud.auth.signOut();
                                    window.location.reload();
                                }}
                                className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-2.5 pr-3 py-1.5 group hover:border-rose-300 dark:hover:border-rose-700 transition-colors"
                            >
                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                                    <span className="text-[8px] font-black text-white uppercase">{cloudEmail[0]}</span>
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 max-w-[80px] truncate group-hover:text-rose-500 transition-colors">{cloudEmail}</span>
                                <LogOut size={11} className="text-slate-400 group-hover:text-rose-500 transition-colors" />
                            </button>
                        )}
                    </div>

                    {/* Pill tab navigator */}
                    <div className="flex gap-1.5 pb-3 overflow-x-auto scrollbar-hide">
                        {visibleTabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            const c = COLOR_MAP[tab.color];
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        triggerHaptic?.();
                                        if (tab.id === 'sistema') handleDangerZoneClick();
                                    }}
                                    className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                                        isActive
                                            ? `${c.pill} ${c.pillText} shadow-md scale-105`
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <Icon size={12} />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
                <div className="max-w-lg md:max-w-xl lg:max-w-2xl mx-auto p-4 space-y-4">

                    {/* Section header accent */}
                    <div
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl ${colors.iconBg} select-none`}
                    >
                        {React.createElement(currentTab?.icon || Store, { size: 16, className: colors.icon })}
                        <span className={`text-xs font-black tracking-wide uppercase ${colors.icon}`}>
                            {currentTab?.label}
                        </span>
                    </div>

                    {/* ═══ TAB MESAS ═══ */}
                    {activeTab === 'mesas' && isAdmin && (
                        <SettingsTabMesas
                            showToast={showToast}
                            triggerHaptic={triggerHaptic}
                        />
                    )}

                    {/* ═══ TAB VENTAS ═══ */}
                    {activeTab === 'ventas' && (
                        <SettingsTabVentas
                            allowNegativeStock={allowNegativeStock} setAllowNegativeStock={setAllowNegativeStock}
                            maxDiscountCajero={maxDiscountCajero} setMaxDiscountCajero={setMaxDiscountCajero}
                            cajeroAbreCaja={cajeroAbreCaja} setCajeroAbreCaja={setCajeroAbreCaja}
                            cajeroCierraCaja={cajeroCierraCaja} setCajeroCierraCaja={setCajeroCierraCaja}
                            cajeroVeMesas={cajeroVeMesas} setCajeroVeMesas={setCajeroVeMesas}
                            forceHeartbeat={forceHeartbeat}
                            showToast={showToast}
                            triggerHaptic={triggerHaptic}
                        />
                    )}

                    {/* ═══ TAB USUARIOS ═══ */}
                    {activeTab === 'usuarios' && isAdmin && (
                        <SettingsTabUsuarios
                            autoLockMinutes={autoLockMinutes} setAutoLockMinutes={setAutoLockMinutes}
                            autoLockOnMinimize={autoLockOnMinimize} setAutoLockOnMinimize={setAutoLockOnMinimize}
                            showToast={showToast}
                            triggerHaptic={triggerHaptic}
                        />
                    )}

                    {/* ═══ TAB BITÁCORA ═══ */}
                    {activeTab === 'bitacora' && isAdmin && (
                        <SettingsTabBitacora triggerHaptic={triggerHaptic} />
                    )}

                    {/* ═══ TAB SISTEMA ═══ */}
                    {activeTab === 'sistema' && (
                        <SettingsTabSistema
                            theme={theme} toggleTheme={toggleTheme}
                            deviceId={deviceId} idCopied={idCopied} setIdCopied={setIdCopied}
                            isAdmin={isAdmin}
                            importStatus={importStatus} statusMessage={statusMessage}
                            handleExport={handleExport}
                            handleImportClick={handleImportClick}
                            setIsShareOpen={async () => {
                                const { storageService } = await import('../utils/storageService');
                                const [c, s] = await Promise.all([
                                    storageService.getItem('bodega_customers_v1', []),
                                    storageService.getItem('bodega_sales_v1', []),
                                ]);
                                setShareCustomers(c);
                                setShareSales(s);
                                setIsShareOpen(true);
                            }}
                            setShowDeleteConfirm={setShowDeleteConfirm}
                            onFactoryReset={handleFactoryReset}
                            dangerZoneUnlocked={dangerZoneUnlocked}
                            onDangerZoneClick={handleDangerZoneClick}
                            triggerHaptic={triggerHaptic}
                        />
                    )}

                    {/* Version footer */}
                    <div className="text-center pt-2 pb-1">
                        <p className="text-[10px] text-slate-300 dark:text-slate-700 font-bold tracking-widest uppercase">
                            Pool Imperial · v1.0
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Delete Confirm Modal ── */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 text-red-500 rounded-2xl flex items-center justify-center mb-4">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Borrar historial y reportes</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                            Se eliminará <strong>todo el historial de ventas y los reportes generados</strong> de forma permanente. Escribe <span className="font-mono font-black text-red-500">ELIMINAR</span> para confirmar:
                        </p>
                        <input
                            type="text"
                            value={deleteInput}
                            onChange={e => setDeleteInput(e.target.value.toUpperCase())}
                            placeholder="ELIMINAR"
                            className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 focus:border-red-400 rounded-xl px-4 py-3 text-center font-mono font-bold text-slate-800 dark:text-white mb-4 outline-none uppercase transition-colors"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} className="flex-1 py-3.5 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                Cancelar
                            </button>
                            <button
                                disabled={deleteInput !== 'ELIMINAR'}
                                onClick={async () => {
                                    if (deleteInput !== 'ELIMINAR') return;
                                    triggerHaptic?.();
                                    // 1. Borrar local (IndexedDB + localStorage)
                                    await storageService.removeItem('bodega_sales_v1');
                                    localStorage.removeItem('cierre_notified_date');
                                    // 2. Borrar de la nube para que no se restaure al recargar
                                    try {
                                        const { data: { session } } = await supabaseCloud.auth.getSession();
                                        if (session?.user?.id) {
                                            await supabaseCloud.from('sync_documents').delete()
                                                .eq('user_id', session.user.id)
                                                .eq('doc_id', 'bodega_sales_v1');
                                        }
                                    } catch (_e) { /* sin nube configurada, ignorar */ }
                                    auditLog('SISTEMA', 'HISTORIAL_BORRADO', 'Historial y reportes eliminados');
                                    showToast('Historial y reportes eliminados', 'success');
                                    setTimeout(() => window.location.reload(), 1500);
                                }}
                                className="flex-1 py-3.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Sí, borrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ShareInventoryModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                products={products}
                categories={categories}
                customers={shareCustomers}
                sales={shareSales}
                onImport={async (result) => {
                    const { storageService } = await import('../utils/storageService');
                    if (result.categories?.length > 0) setCategories(result.categories);
                    if (result.products?.length > 0) {
                        setProducts(result.products);
                        await storageService.setItem('bodega_products_v1', result.products);
                    }
                    if (result.customers?.length > 0) {
                        await storageService.setItem('bodega_customers_v1', result.customers);
                    }
                    if (result.sales?.length > 0) {
                        await storageService.setItem('bodega_sales_v1', result.sales);
                    }
                    const types = [];
                    if (result.products?.length) types.push('inventario');
                    if (result.customers?.length) types.push('clientes');
                    if (result.sales?.length) types.push('ventas');
                    showToast(`${types.join(', ')} importado(s)`, 'success');
                    setIsShareOpen(false);
                    setTimeout(() => window.location.reload(), 1200);
                }}
            />

            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        </div>
        </>
    );
}
