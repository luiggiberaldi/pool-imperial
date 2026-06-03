import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getAuditLog, getAuditCount, clearAuditLog, exportAuditLog } from '../../../services/auditService';
import { showToast } from '../../Toast';
import { jsPDF } from 'jspdf';
import {
    FileText, Download, Trash2, Filter, Shield, ShoppingCart,
    Package, Users, Settings, Database, Clock, ChevronDown, AlertTriangle,
    Calendar, FileDown, Search, X, ChevronRight, Activity,
    Layers, Hash, User
} from 'lucide-react';

// ─── Config ────────────────────────────────────────────
const CAT_CONFIG = {
    AUTH:       { label: 'Auth',        icon: Shield,       color: 'text-violet-500',  bg: 'bg-violet-100 dark:bg-violet-900/30',  pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
    VENTA:      { label: 'Ventas',      icon: ShoppingCart, color: 'text-blue-500',    bg: 'bg-blue-100 dark:bg-blue-900/30',      pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    INVENTARIO: { label: 'Inventario',  icon: Package,      color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30',pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    CLIENTE:    { label: 'Clientes',    icon: Users,        color: 'text-sky-500',     bg: 'bg-sky-100 dark:bg-sky-900/30',        pill: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
    CONFIG:     { label: 'Config',      icon: Settings,     color: 'text-amber-500',   bg: 'bg-amber-100 dark:bg-amber-900/30',    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    USUARIO:    { label: 'Usuarios',    icon: User,         color: 'text-indigo-500',  bg: 'bg-indigo-100 dark:bg-indigo-900/30',  pill: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
    SISTEMA:    { label: 'Sistema',     icon: Database,     color: 'text-red-500',     bg: 'bg-red-100 dark:bg-red-900/30',        pill: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    MESAS:      { label: 'Mesas',       icon: Layers,       color: 'text-cyan-500',    bg: 'bg-cyan-100 dark:bg-cyan-900/30',      pill: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
    CAJA:       { label: 'Caja',        icon: Activity,     color: 'text-orange-500',  bg: 'bg-orange-100 dark:bg-orange-900/30',  pill: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
    PROVEEDOR:  { label: 'Proveedores', icon: Users,        color: 'text-purple-500',  bg: 'bg-purple-100 dark:bg-purple-900/30',  pill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

function getConf(cat) { return CAT_CONFIG[cat] || CAT_CONFIG.SISTEMA; }

// ─── Legibilidad de metadata ────────────────────────────
const META_LABELS = {
    tableId:       'Mesa (ID)',
    sessionId:     'Sesión (ID)',
    gameMode:      'Modo de juego',
    hoursPaid:     'Horas pagadas',
    newRounds:     'Jugadas',
    totalCost:     'Monto cobrado',
    paymentMethod: 'Forma de pago',
    tableType:     'Tipo de mesa',
    name:          'Nombre',
    type:          'Tipo',
    setting:       'Configuración',
    value:         'Valor',
    saleId:        'Venta (ID)',
    userId:        'Usuario (ID)',
    role:          'Rol',
    itemId:        'Producto (ID)',
    qty:           'Cantidad',
    price:         'Precio',
    delete_sales_history: 'Acción',
    share_db:      'Acción',
    export:        'Acción',
    import:        'Acción',
};
const META_VALUES = {
    NORMAL:        'Normal',
    PINA:          'La Jugada',
    PREPAGO:       'Prepago',
    ADMIN:         'Administrador',
    CAJERO:        'Cajero',
    EFECTIVO:      'Efectivo',
    DIVISAS:       'Divisas',
    TRANSFERENCIA: 'Transferencia',
    true:          'Sí',
    false:         'No',
    backup:        'Exportar backup',
    theme:         'Tema',
    dark:          'Oscuro',
    light:         'Claro',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatMetaValue(key, val) {
    if (val === null || val === undefined) return '—';
    const str = String(val);
    if (META_VALUES[str] !== undefined) return META_VALUES[str];
    if (UUID_RE.test(str)) return `...${str.slice(-8)}`;
    if (key.toLowerCase().includes('cost') || key.toLowerCase().includes('price')) return `$${Number(val).toFixed(2)}`;
    return str;
}

const ACTION_LABELS = {
    LOGIN:                    'Inicio de sesión',
    LOGOUT:                   'Cierre de sesión',
    PIN_CAMBIADO:             'PIN cambiado',
    MESA_ABIERTA:             'Mesa abierta',
    MESA_CERRADA:             'Mesa cobrada',
    MESA_PIÑA_AGREGADA:       'Jugada agregada',
    MESA_PIÑA_QUITADA:        'Jugada quitada',
    MESA_CREADA:              'Mesa creada',
    MESA_ELIMINADA:           'Mesa eliminada',
    ANULACION:                'Mesa anulada',
    VENTA_COMPLETADA:         'Venta completada',
    VENTA_ANULADA:            'Venta anulada',
    USUARIO_CREADO:           'Usuario creado',
    USUARIO_ELIMINADO:        'Usuario eliminado',
    CONFIG_SISTEMA_CAMBIADA:  'Configuración cambiada',
    CAJA_ABIERTA:             'Caja abierta',
    CAJA_CERRADA:             'Caja cerrada',
    INVENTARIO_ACTUALIZADO:   'Inventario actualizado',
};
function actionLabel(action) { return ACTION_LABELS[action] || action; }

function MetaTable({ meta }) {
    const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!entries.length) return null;
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 dark:bg-slate-950 rounded-lg p-2">
            {entries.map(([k, v]) => (
                <div key={k} className="contents">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 truncate">{META_LABELS[k] || k}</span>
                    <span className="text-[9px] text-slate-600 dark:text-slate-300 truncate">{formatMetaValue(k, v)}</span>
                </div>
            ))}
        </div>
    );
}

function getLocalISODate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function startOfDay(dateStr) { return new Date(dateStr + 'T00:00:00').getTime(); }
function endOfDay(dateStr)   { return new Date(dateStr + 'T23:59:59').getTime(); }

function formatTs(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' +
           d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
}
function formatDay(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday:'long', day:'2-digit', month:'long' });
}

// ─── PDF ────────────────────────────────────────────────
async function generateAuditPDF(entries, dateFrom, dateTo) {
    const WIDTH=80, M=4, RIGHT=WIDTH-M, CX=WIDTH/2;
    const H = Math.max(120, 65 + entries.length * 7);
    const doc = new jsPDF({ unit:'mm', format:[WIDTH, H] });
    const INK=[33,37,41], BODY=[73,80,87], MUTED=[134,142,150], BLUE=[37,99,235], RULE=[206,212,218];
    let y=5;
    const dash = yy => { doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.setLineDashPattern([1,1],0); doc.line(M,yy,RIGHT,yy); doc.setLineDashPattern([],0); };
    try {
        const img = new Image(); img.src='/logo-ticket.png';
        await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; });
        doc.addImage(img,'PNG',CX-23,y,46,11); y+=14;
    } catch { y+=2; }
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text('BITACORA DE ACTIVIDAD', CX, y, {align:'center'}); y+=5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const fl = new Date(dateFrom).toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
    const tl = new Date(dateTo).toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'});
    doc.text(`${fl}  —  ${tl}`, CX, y, {align:'center'}); y+=4;
    doc.text(`${entries.length} registros`, CX, y, {align:'center'}); y+=5;
    dash(y); y+=5;
    doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(...BLUE);
    doc.text('#',M,y); doc.text('FECHA/HORA',M+5,y); doc.text('ACCION',M+28,y); doc.text('USUARIO',RIGHT,y,{align:'right'}); y+=3;
    dash(y); y+=3;
    entries.forEach((entry,i) => {
        const num=entries.length-i, dateStr=formatTs(entry.ts);
        const cat=(CAT_CONFIG[entry.cat]?.label||entry.cat).toUpperCase().slice(0,3);
        const desc=entry.desc.length>28?entry.desc.substring(0,28)+'...':entry.desc;
        const user=entry.userName||'Sistema';
        doc.setFont('helvetica','bold'); doc.setFontSize(5); doc.setTextColor(...MUTED); doc.text(String(num),M,y);
        doc.setFont('helvetica','normal'); doc.setFontSize(5); doc.setTextColor(...BODY); doc.text(dateStr,M+5,y);
        doc.setFont('helvetica','bold'); doc.setFontSize(5); doc.setTextColor(...INK); doc.text(`[${cat}]`,M+28,y); y+=3;
        doc.setFont('helvetica','normal'); doc.setFontSize(5); doc.setTextColor(...BODY); doc.text(desc,M+5,y);
        doc.setFont('helvetica','normal'); doc.setFontSize(5); doc.setTextColor(...MUTED); doc.text(user,RIGHT,y,{align:'right'}); y+=4;
    });
    y+=2; dash(y); y+=5;
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...INK); doc.text('Pool Imperial',CX,y,{align:'center'}); y+=3;
    doc.setFont('helvetica','normal'); doc.setFontSize(5); doc.setTextColor(...MUTED);
    doc.text(`Emitido: ${new Date().toLocaleString('es-CO')} - Sin valor fiscal`, CX, y, {align:'center'});
    const filename=`bitacora_${getLocalISODate(new Date(dateFrom))}_${getLocalISODate(new Date(dateTo))}.pdf`;
    const blob=doc.output('blob');
    const file=new File([blob],filename,{type:'application/pdf'});
    const isMobile='ontouchstart' in window && window.innerWidth<768;
    if(isMobile && navigator.canShare?.({files:[file]})) navigator.share({title:'Bitacora',files:[file]}).catch(()=>doc.save(filename));
    else doc.save(filename);
}

// ─── COMPONENT ──────────────────────────────────────────
const DATE_PRESETS = [
    { label: 'Hoy',         getRange: () => { const t=getLocalISODate(); return [t,t]; } },
    { label: 'Ayer',        getRange: () => { const d=new Date(); d.setDate(d.getDate()-1); const s=getLocalISODate(d); return [s,s]; } },
    { label: 'Esta semana', getRange: () => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return [getLocalISODate(d), getLocalISODate()]; } },
    { label: 'Este mes',    getRange: () => { const d=new Date(); d.setDate(1); return [getLocalISODate(d), getLocalISODate()]; } },
    { label: 'Todo',        getRange: () => ['2020-01-01', getLocalISODate()] },
];

export default function SettingsTabBitacora({ triggerHaptic }) {
    const [allEntries, setAllEntries] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState(null);
    const [userFilter, setUserFilter] = useState(null);
    const [datePreset, setDatePreset] = useState(4); // 'Todo' por defecto
    const [customFrom, setCustomFrom] = useState(getLocalISODate());
    const [customTo, setCustomTo] = useState(getLocalISODate());
    const [showCustomDate, setShowCustomDate] = useState(false);
    const [visibleCount, setVisibleCount] = useState(60);
    const [expandedId, setExpandedId] = useState(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // Date range from preset or custom
    const [dateFrom, dateTo] = useMemo(() => {
        if (showCustomDate) return [customFrom, customTo];
        return DATE_PRESETS[datePreset].getRange();
    }, [datePreset, showCustomDate, customFrom, customTo]);

    const load = useCallback(async () => {
        const fromTs = startOfDay(dateFrom);
        const toTs   = endOfDay(dateTo);
        const log = await getAuditLog({ fromTs, toTs });
        setAllEntries(log);
        const count = await getAuditCount();
        setTotalCount(count);
    }, [dateFrom, dateTo]);

    useEffect(() => { load(); }, [load]);

    // Recargar en tiempo real cuando llega un nuevo evento
    useEffect(() => {
        const handler = () => load();
        window.addEventListener('audit-log-updated', handler);
        return () => window.removeEventListener('audit-log-updated', handler);
    }, [load]);

    // Unique users in current period
    const users = useMemo(() => {
        const set = new Set();
        allEntries.forEach(e => { if (e.userName) set.add(e.userName); });
        return Array.from(set).sort();
    }, [allEntries]);

    // Stats per category
    const stats = useMemo(() => {
        const counts = {};
        allEntries.forEach(e => { counts[e.cat] = (counts[e.cat]||0)+1; });
        return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    }, [allEntries]);

    // Filtered list
    const filtered = useMemo(() => {
        let list = allEntries;
        if (catFilter)  list = list.filter(e => e.cat === catFilter);
        if (userFilter) list = list.filter(e => e.userName === userFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                e.desc?.toLowerCase().includes(q) ||
                e.action?.toLowerCase().includes(q) ||
                e.userName?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [allEntries, catFilter, userFilter, search]);

    // Group by day
    const grouped = useMemo(() => {
        const days = {};
        filtered.slice(0, visibleCount).forEach(e => {
            const day = getLocalISODate(new Date(e.ts));
            if (!days[day]) days[day] = [];
            days[day].push(e);
        });
        return Object.entries(days).sort((a,b)=>b[0].localeCompare(a[0]));
    }, [filtered, visibleCount]);

    const handleClear = async () => {
        await clearAuditLog();
        showToast('Bitácora borrada', 'success');
        triggerHaptic?.();
        setShowClearConfirm(false);
        load();
    };

    const handleExportPDF = async () => {
        setIsGenerating(true);
        triggerHaptic?.();
        try {
            const entries = catFilter || userFilter || search.trim() ? filtered : allEntries;
            if (!entries.length) { showToast('Sin registros en este período', 'warning'); setIsGenerating(false); return; }
            await generateAuditPDF(entries, startOfDay(dateFrom), endOfDay(dateTo));
            showToast(`PDF con ${entries.length} registros`, 'success');
        } catch { showToast('Error generando PDF', 'error'); }
        setIsGenerating(false);
    };

    const activeFiltersCount = [catFilter, userFilter, search.trim()].filter(Boolean).length;

    return (
        <div className="space-y-4" data-tour="settings-audit-log">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar acción, descripción, usuario..."
                        className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-white placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={13} />
                        </button>
                    )}
                </div>
                <button
                    onClick={() => { setShowFilters(v=>!v); triggerHaptic?.(); }}
                    className={`relative px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${showFilters || activeFiltersCount > 0 ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'}`}
                >
                    <Filter size={14} />
                    {activeFiltersCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">{activeFiltersCount}</span>
                    )}
                </button>
                <button onClick={handleExportPDF} disabled={isGenerating} className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-blue-500 hover:border-blue-300 transition-all disabled:opacity-50">
                    {isGenerating ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <FileDown size={14} />}
                </button>
                <button onClick={() => exportAuditLog().then(()=>showToast('JSON exportado','success'))} className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-emerald-500 hover:border-emerald-300 transition-all">
                    <Download size={14} />
                </button>
                <button onClick={() => setShowClearConfirm(true)} className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-red-500 hover:border-red-300 transition-all">
                    <Trash2 size={14} />
                </button>
            </div>

            {/* ── Filtros panel ── */}
            {showFilters && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-3 animate-in slide-in-from-top-1 duration-150">

                    {/* Rango de fechas */}
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Período</p>
                        <div className="flex flex-wrap gap-1.5">
                            {DATE_PRESETS.map((p,i) => (
                                <button key={i} onClick={() => { setDatePreset(i); setShowCustomDate(false); triggerHaptic?.(); }}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${!showCustomDate && datePreset===i ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                    {p.label}
                                </button>
                            ))}
                            <button onClick={() => setShowCustomDate(v=>!v)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${showCustomDate ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                <Calendar size={10} /> Rango
                            </button>
                        </div>
                        {showCustomDate && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Desde</label>
                                    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} max={customTo}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Hasta</label>
                                    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} min={customFrom} max={getLocalISODate()}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Categoría */}
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Categoría</p>
                        <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => setCatFilter(null)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${!catFilter ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                Todos
                            </button>
                            {Object.entries(CAT_CONFIG).map(([key, conf]) => (
                                <button key={key} onClick={() => setCatFilter(k => k===key ? null : key)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${catFilter===key ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                    {conf.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Usuario */}
                    {users.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Usuario</p>
                            <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => setUserFilter(null)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${!userFilter ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                    Todos
                                </button>
                                {users.map(u => (
                                    <button key={u} onClick={() => setUserFilter(v => v===u ? null : u)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${userFilter===u ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>
                                        {u}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Stats cards ── */}
            {stats.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <div className="col-span-3 sm:col-span-4 flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Hash size={9} /> {filtered.length} registro{filtered.length!==1?'s':''} · {totalCount} total
                        </span>
                    </div>
                    {stats.slice(0,6).map(([cat, count]) => {
                        const conf = getConf(cat);
                        const Icon = conf.icon;
                        return (
                            <button key={cat} onClick={() => setCatFilter(v => v===cat ? null : cat)}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-[0.97] ${catFilter===cat ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${conf.bg}`}>
                                    <Icon size={13} className={conf.color} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] text-slate-400 font-bold truncate">{conf.label}</p>
                                    <p className="text-sm font-black text-slate-700 dark:text-white leading-none">{count}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Lista agrupada por día ── */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <FileText size={36} className="mx-auto text-slate-200 dark:text-slate-700 mb-3" />
                    <p className="text-sm font-bold text-slate-400">Sin registros</p>
                    <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Ajusta los filtros o el período</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {grouped.map(([day, entries]) => (
                        <div key={day}>
                            {/* Day separator */}
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                                    {formatDay(entries[0].ts)}
                                </span>
                                <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                            </div>
                            <div className="space-y-1.5">
                                {entries.map(entry => {
                                    const conf = getConf(entry.cat);
                                    const Icon = conf.icon;
                                    const isExpanded = expandedId === entry.id;
                                    return (
                                        <div key={entry.id}
                                            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden transition-all"
                                            onClick={() => { setExpandedId(isExpanded ? null : entry.id); triggerHaptic?.(); }}>
                                            <div className="flex items-start gap-2.5 p-3 cursor-pointer">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${conf.bg}`}>
                                                    <Icon size={13} className={conf.color} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-snug">{entry.desc}</p>
                                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${conf.pill}`}>
                                                            {actionLabel(entry.action)}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-bold flex items-center gap-0.5">
                                                            <User size={8} /> {entry.userName || 'Sistema'}
                                                        </span>
                                                        <span className="text-[9px] text-slate-300 dark:text-slate-600 flex items-center gap-0.5">
                                                            <Clock size={8} /> {new Date(entry.ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
                                                        </span>
                                                    </div>
                                                </div>
                                                <ChevronRight size={12} className={`shrink-0 text-slate-300 transition-transform mt-1 ${isExpanded ? 'rotate-90' : ''}`} />
                                            </div>
                                            {isExpanded && (
                                                <div className="px-3 pb-3 pt-0 border-t border-slate-50 dark:border-slate-800 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider">Categoría</p>
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{conf.label}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider">Acción</p>
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{actionLabel(entry.action)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider">Usuario</p>
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{entry.userName || 'Sistema'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider">Fecha y hora</p>
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{formatTs(entry.ts)}</p>
                                                        </div>
                                                        {entry.userId && (
                                                            <div className="col-span-2">
                                                                <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider">ID Usuario</p>
                                                                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">{entry.userId}</p>
                                                            </div>
                                                        )}
                                                        {entry.meta && Object.keys(entry.meta).length > 0 && (
                                                            <div className="col-span-2">
                                                                <p className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-wider mb-1">Datos</p>
                                                                <MetaTable meta={entry.meta} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {filtered.length > visibleCount && (
                        <button onClick={() => { setVisibleCount(v=>v+60); triggerHaptic?.(); }}
                            className="w-full py-2.5 text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-center gap-1.5">
                            <ChevronDown size={12} /> Cargar más ({filtered.length - visibleCount} restantes)
                        </button>
                    )}
                </div>
            )}

            {/* ── Clear confirm ── */}
            {showClearConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl text-center" onClick={e=>e.stopPropagation()}>
                        <div className="w-14 h-14 mx-auto bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Borrar Bitácora</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Se eliminarán todos los registros. Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl">Cancelar</button>
                            <button onClick={handleClear} className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600">Sí, borrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
