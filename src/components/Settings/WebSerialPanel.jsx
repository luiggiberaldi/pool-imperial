import React, { useState, useEffect } from 'react';
import {
    Printer, Usb, AlertTriangle, CheckCircle, RefreshCw,
    SmartphoneNfc, Scan, RotateCcw, Monitor, Zap,
    WifiOff, ChevronRight, Info, Settings2, PlugZap
} from 'lucide-react';
import { SectionCard, Toggle } from '../SettingsShared';
import {
    detectAndAutoConfig, getConnectedPrinter, openCashDrawerWebSerial,
    printTestWebSerial, getWebSerialConfig, saveWebSerialConfig, clearPrinterConfig
} from '../../services/webSerialPrinter';
import { TYPE_LABELS } from '../../services/printerDatabase';
import { showToast } from '../Toast';

// ── Badge de estado ────────────────────────────────────────────────────────────
function StatusBadge({ connected, printerType }) {
    if (printerType === 'system') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                <Monitor size={9} /> Sistema
            </span>
        );
    }
    return connected ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Conectada
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <WifiOff size={9} /> Sin señal
        </span>
    );
}

// ── Tarjeta de impresora configurada ──────────────────────────────────────────
function PrinterCard({ config, connected }) {
    const isThermal = config.printerType === 'thermal' || config.printerType === 'thermal_serial';
    const isSystem  = config.printerType === 'system';
    const label     = TYPE_LABELS[config.printerType]?.label || config.printerType;

    return (
        <div className={`rounded-2xl border-2 p-4 ${
            isSystem
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/50'
                : connected
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
        }`}>
            <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isSystem ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    : connected ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                }`}>
                    {isSystem ? <Monitor size={20} /> : <Usb size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-slate-800 dark:text-white truncate">
                            {config.printerBrand}
                        </p>
                        <StatusBadge connected={connected} printerType={config.printerType} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{config.printerModel}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{label}{isThermal && config.baudRate ? ` · ${config.baudRate} baud` : ''}</p>
                </div>
                <CheckCircle size={18} className={`shrink-0 mt-0.5 ${
                    isSystem ? 'text-indigo-500' : connected ? 'text-emerald-500' : 'text-amber-500'
                }`} />
            </div>

            {isSystem && (
                <div className="mt-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-800/40 space-y-2">
                    <div className="flex items-start gap-2">
                        <Info size={12} className="text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                            Imprime via diálogo del sistema. Para <strong>eliminar el diálogo permanentemente</strong>, sigue los pasos de abajo.
                        </p>
                    </div>
                    <div className="bg-indigo-100/60 dark:bg-indigo-900/30 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-indigo-800 dark:text-indigo-200">Cómo imprimir sin diálogo en Chrome/Edge:</p>
                        <div className="space-y-1.5">
                            {[
                                'Establece la térmica como impresora predeterminada en Windows',
                                'Haz clic derecho en el acceso directo de Chrome → Propiedades',
                                'En "Destino" agrega al final: --kiosk-printing',
                                'Guarda y abre Chrome desde ese acceso directo',
                            ].map((step, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-[10px] font-black text-indigo-500 shrink-0 mt-px">{i + 1}.</span>
                                    <p className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 italic">Con ese flag Chrome imprime directo sin mostrar ningún diálogo.</p>
                    </div>
                </div>
            )}

            {!isSystem && !connected && (
                <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 flex items-start gap-2">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                        Impresora no detectada. Conecta el cable USB y pulsa <strong>"Redetectar"</strong>. Si no imprime, ajusta el <strong>Baud Rate</strong> en ajustes avanzados (prueba 9600 → 115200).
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Panel de primeros pasos (sin configurar) ───────────────────────────────────
function SetupGuide() {
    const steps = [
        { num: 1, text: 'Conecta la impresora por USB' },
        { num: 2, text: 'Pulsa "Detectar impresora"' },
        { num: 3, text: 'Selecciona el puerto en el navegador' },
    ];
    return (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <Printer size={18} className="text-slate-400" />
                <p className="text-sm font-black text-slate-600 dark:text-slate-300">Sin impresora configurada</p>
            </div>
            <div className="space-y-2">
                {steps.map(s => (
                    <div key={s.num} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-black">{s.num}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{s.text}</p>
                    </div>
                ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-start gap-2">
                <Info size={12} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                    Requiere <strong>Chrome o Edge</strong> en escritorio. La impresión directa sin diálogo funciona solo con impresoras térmicas USB.
                </p>
            </div>
        </div>
    );
}

// ── Error display ──────────────────────────────────────────────────────────────
function ErrorBox({ message, onDismiss }) {
    return (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-700 dark:text-red-400">Error</p>
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">{message}</p>
            </div>
            <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors text-[10px] font-bold shrink-0">✕</button>
        </div>
    );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function WebSerialPanel() {
    const [config, setConfig]       = useState(getWebSerialConfig);
    const [connected, setConnected] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [testing, setTesting]     = useState(false);
    const [drawerBusy, setDrawerBusy] = useState(false);
    const [error, setError]         = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);

    const isConfigured = !!config.printerType;
    const isThermal    = config.printerType === 'thermal' || config.printerType === 'thermal_serial';
    const isSystem     = config.printerType === 'system';
    const isSupported  = 'serial' in navigator;

    useEffect(() => {
        getConnectedPrinter().then(port => setConnected(!!port));
        setConfig(getWebSerialConfig());
    }, []);

    // ── Reconectar (re-pedir permiso al puerto) ────────────────────────────
    const handleReconnect = async () => {
        setReconnecting(true);
        setError('');
        try {
            // Forzar al usuario a seleccionar el puerto otra vez
            const port = await navigator.serial.requestPort();
            if (port) {
                setConnected(true);
                showToast('Puerto reconectado', 'success');
            }
        } catch (err) {
            if (!err.message?.includes('cancel') && !err.name?.includes('NotFound')) {
                setError('No se pudo reconectar. Verifica que la impresora esté encendida y conectada por USB.');
            }
        } finally {
            setReconnecting(false);
        }
    };

    // ── Detectar ───────────────────────────────────────────────────────────
    const handleDetect = async () => {
        setDetecting(true);
        setError('');
        try {
            const detected = await detectAndAutoConfig();
            setConfig(detected);
            if (detected.printerType !== 'system') setConnected(true);
            showToast(`✓ ${detected.printerBrand} ${detected.printerModel} detectada`, 'success');
        } catch (err) {
            if (!err.message?.includes('Cancelaste')) {
                setError(err.message || 'No se pudo detectar la impresora. Verifica la conexión USB.');
            }
        } finally {
            setDetecting(false);
        }
    };

    // ── Usar sistema ───────────────────────────────────────────────────────
    const handleUseSystem = () => {
        const newCfg = {
            ...getWebSerialConfig(),
            printerType:  'system',
            printerBrand: 'Impresora del Sistema',
            printerModel: 'Driver del Sistema',
            noVidPid: false,
        };
        saveWebSerialConfig(newCfg);
        setConfig(newCfg);
        setConnected(false);
        showToast('Configurado: Impresora del sistema', 'success');
    };

    // ── Test ───────────────────────────────────────────────────────────────
    const handleTestPrint = async () => {
        setTesting(true);
        setError('');
        try {
            if (isSystem) {
                window.print();
                showToast('Diálogo de impresión abierto', 'success');
            } else {
                await printTestWebSerial();
                showToast('Ticket de prueba enviado', 'success');
            }
        } catch (err) {
            setError(err.message || 'Error al imprimir. Reconecta la impresora.');
            showToast('Error al imprimir', 'error');
        } finally {
            setTesting(false);
        }
    };

    // ── Cajón ──────────────────────────────────────────────────────────────
    const handleOpenDrawer = async () => {
        setDrawerBusy(true);
        setError('');
        try {
            await openCashDrawerWebSerial();
            showToast('Pulso enviado al cajón', 'success');
        } catch (err) {
            setError(err.message || 'No se pudo abrir el cajón. Verifica la conexión.');
            showToast('Error al abrir cajón', 'error');
        } finally {
            setDrawerBusy(false);
        }
    };

    // ── Baud rate ──────────────────────────────────────────────────────────
    const handleBaudRate = (baud) => {
        const newCfg = { ...config, baudRate: Number(baud) };
        setConfig(newCfg);
        saveWebSerialConfig(newCfg);
    };

    // ── Apertura automática ────────────────────────────────────────────────
    const toggleAutoOpen = () => {
        const newCfg = { ...config, autoOpenDrawer: !config.autoOpenDrawer };
        setConfig(newCfg);
        saveWebSerialConfig(newCfg);
        showToast(newCfg.autoOpenDrawer ? 'Cajón automático activado' : 'Cajón automático desactivado', 'success');
    };

    // ── Reset ──────────────────────────────────────────────────────────────
    const handleReset = () => {
        clearPrinterConfig();
        setConfig(getWebSerialConfig());
        setConnected(false);
        setError('');
        showToast('Configuración eliminada', 'success');
    };

    // ── Navegador no soportado ─────────────────────────────────────────────
    if (!isSupported) {
        return (
            <SectionCard icon={Printer} title="Impresora" subtitle="Impresión directa" iconColor="text-indigo-500">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-2xl flex items-start gap-3 border border-red-200 dark:border-red-800/40">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-black mb-1">Navegador no compatible</p>
                        <p className="text-xs leading-relaxed opacity-90">
                            La impresión directa sin diálogo requiere <strong>Chrome o Edge</strong> en escritorio (Windows/Mac/Linux). Los dispositivos iOS no son compatibles.
                        </p>
                        <p className="text-xs mt-2 opacity-90">
                            Puedes usar <strong>"Impresora del Sistema"</strong> para imprimir con diálogo desde cualquier navegador.
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleUseSystem}
                    className="w-full mt-3 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                >
                    <Monitor size={15} /> Usar impresora del sistema
                </button>
            </SectionCard>
        );
    }

    return (
        <SectionCard icon={Printer} title="Impresora" subtitle="Impresión directa sin diálogo" iconColor="text-indigo-500">
            <div className="space-y-3">

                {/* ── Estado actual ── */}
                {isConfigured
                    ? <PrinterCard config={config} connected={connected} />
                    : <SetupGuide />
                }

                {/* ── Error ── */}
                {error && <ErrorBox message={error} onDismiss={() => setError('')} />}

                {/* ── Botones principales ── */}
                <div className={`grid gap-2 ${isConfigured && !isSystem ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button
                        onClick={handleDetect}
                        disabled={detecting}
                        className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
                    >
                        {detecting
                            ? <><RefreshCw size={14} className="animate-spin" /> Detectando...</>
                            : <><Scan size={14} /> {isConfigured ? 'Redetectar' : 'Detectar impresora'}</>
                        }
                    </button>

                    {isConfigured && !isSystem && (
                        <button
                            onClick={handleTestPrint}
                            disabled={testing}
                            className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                        >
                            {testing
                                ? <><RefreshCw size={14} className="animate-spin" /> Imprimiendo...</>
                                : <><Zap size={14} /> Test</>
                            }
                        </button>
                    )}

                    {isConfigured && isSystem && (
                        <button
                            onClick={handleTestPrint}
                            disabled={testing}
                            className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        >
                            {testing
                                ? <><RefreshCw size={14} className="animate-spin" /> Abriendo...</>
                                : <><Printer size={14} /> Test de impresión</>
                            }
                        </button>
                    )}
                </div>

                {/* ── Reconectar puerto (térmica sin señal) ── */}
                {isThermal && (
                    <button
                        onClick={handleReconnect}
                        disabled={reconnecting}
                        className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                        {reconnecting
                            ? <><RefreshCw size={12} className="animate-spin" /> Reconectando...</>
                            : <><PlugZap size={12} /> Reconectar puerto USB</>
                        }
                    </button>
                )}

                {/* ── Usar sistema (si no está configurado o si es térmica) ── */}
                {(!isConfigured || isThermal) && (
                    <button
                        onClick={handleUseSystem}
                        className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                        <Monitor size={13} /> Usar impresora del sistema (con diálogo)
                    </button>
                )}

                {/* ── Cajón (solo térmicas) ── */}
                {isThermal && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                            <div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-200">Cajón de Dinero</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Puerto RJ11 de la impresora</p>
                            </div>
                            <button
                                onClick={handleOpenDrawer}
                                disabled={drawerBusy}
                                className="px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 shadow-sm"
                            >
                                {drawerBusy
                                    ? <RefreshCw size={13} className="animate-spin" />
                                    : <SmartphoneNfc size={13} />
                                }
                                Abrir
                            </button>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                            <div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Apertura automática</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Al completar una venta</p>
                            </div>
                            <Toggle enabled={!!config.autoOpenDrawer} onChange={toggleAutoOpen} color="indigo" />
                        </div>
                    </div>
                )}

                {/* ── Ajustes avanzados (solo térmicas) ── */}
                {isThermal && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <button
                            onClick={() => setShowAdvanced(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Settings2 size={13} className="text-slate-400" />
                                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Ajustes avanzados</p>
                            </div>
                            <ChevronRight size={14} className={`text-slate-400 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                        </button>
                        {showAdvanced && (
                            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                <div>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Velocidad (Baud Rate)</p>
                                    <p className="text-[10px] text-slate-400 mb-2">Si nada imprime, prueba cada valor y haz Test después de cada cambio.</p>
                                    <div className="grid grid-cols-5 gap-1">
                                        {[9600, 19200, 38400, 57600, 115200].map(b => (
                                            <button
                                                key={b}
                                                onClick={() => handleBaudRate(b)}
                                                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                                                    (config.baudRate || 9600) === b
                                                        ? 'bg-indigo-500 text-white border-indigo-500'
                                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                                                }`}
                                            >
                                                {b >= 1000 ? (b/1000)+'k' : b}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Eliminar configuración ── */}
                {isConfigured && (
                    <button
                        onClick={handleReset}
                        className="w-full py-2 rounded-xl text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center gap-1.5 transition-colors"
                    >
                        <RotateCcw size={11} /> Eliminar configuración
                    </button>
                )}
            </div>
        </SectionCard>
    );
}
