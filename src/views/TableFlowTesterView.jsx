// ============================================================
// 🎱 TABLE FLOW TESTER VIEW v1.0
// UI para el tester determinista del flujo de mesas de pool
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TableFlowTester } from '../testing/TableFlowTester';
import {
    ChevronLeft, Play, Square, Copy, CheckCircle2, XCircle,
    TerminalSquare, Trash2, Download, AlertTriangle
} from 'lucide-react';

const SUITE_ICONS = {
    scenario_a: '🎯',
    scenario_b: '🔄',
    scenario_c: '🎱',
    scenario_d: '🔀',
    scenario_e: '👥',
    scenario_f: '🔬',
    scenario_g: '🛒',
};

export const TableFlowTesterView = ({ onBack }) => {
    const [isRunning, setIsRunning]   = useState(false);
    const [logs, setLogs]             = useState([]);
    const [progress, setProgress]     = useState(null);
    const [summary, setSummary]       = useState(null);
    const [copied, setCopied]         = useState(false);
    const [logFilter, setLogFilter]   = useState('all');
    const logsEndRef = useRef(null);

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleRunAll = useCallback(async () => {
        setIsRunning(true);
        setLogs([]);
        setSummary(null);
        setCopied(false);
        try {
            const result = await TableFlowTester.runAll({
                onLog:      (entry) => setLogs(prev => [...prev, entry]),
                onProgress: (p)     => setProgress(p),
                onComplete: (s)     => { setSummary(s); setProgress(null); },
            });
        } catch (err) {
            setLogs(prev => [...prev, {
                time: new Date().toLocaleTimeString(), msg: `💥 Error fatal: ${err.message}`, type: 'error'
            }]);
        }
        setIsRunning(false);
    }, []);

    const handleRunSuite = useCallback(async (suiteKey) => {
        setIsRunning(true);
        setLogs([]);
        setSummary(null);
        setCopied(false);
        try {
            const result = await TableFlowTester.runSuite(suiteKey, {
                onLog: (entry) => setLogs(prev => [...prev, entry]),
            });
            setSummary(result);
        } catch (err) {
            setLogs(prev => [...prev, {
                time: new Date().toLocaleTimeString(), msg: `💥 ${err.message}`, type: 'error'
            }]);
        }
        setIsRunning(false);
    }, []);

    const handleStop = useCallback(() => {
        TableFlowTester.stop();
        setIsRunning(false);
    }, []);

    const handleCopyAll = useCallback(() => {
        let text = '═══ 🎱 TABLE FLOW TESTER v1.0 — Pool Los Diaz ═══\n\n';
        text += logs.map(l => `[${l.time}] ${l.msg}`).join('\n');

        if (summary) {
            text += `\n\n── RESUMEN ──\n`;
            text += `Total checks: ${summary.total || 0} | OK: ${summary.passed || 0} | FALLO: ${summary.failed || 0}\n`;
        }

        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [logs, summary]);

    const handleClear = useCallback(() => {
        setLogs([]);
        setSummary(null);
        setProgress(null);
        setCopied(false);
    }, []);

    const suites = TableFlowTester.suites;

    const logColors = {
        success: 'text-emerald-400',
        error:   'text-rose-400',
        warn:    'text-amber-400',
        info:    'text-slate-400',
        section: 'text-sky-400 font-bold',
        data:    'text-violet-400',
    };

    const totalChecks  = summary?.total || 0;
    const passedChecks = summary?.passed || 0;
    const failedChecks = summary?.failed || 0;

    const visibleLogs = logFilter === 'all'
        ? logs
        : logs.filter(l => l.type === logFilter);

    const errorLogs = logs.filter(l => l.type === 'error');

    return (
        <div className="min-h-screen bg-slate-950 text-white p-3 sm:p-6 space-y-3 sm:space-y-4">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                    <button onClick={onBack}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all active:scale-95">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-sky-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-600/30">
                        <span className="text-lg">🎱</span>
                    </div>
                    <div>
                        <h1 className="text-sm sm:text-lg font-black tracking-tight">Tester de Mesas <span className="text-sky-400">v1.0</span></h1>
                        <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-widest font-bold">Determinista · Sin DB · Flujo Completo</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    {logs.length > 0 && !isRunning && (
                        <button onClick={handleCopyAll}
                            className={`flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                                copied ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                            }`}>
                            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                            <span className="hidden sm:inline">{copied ? '¡Copiado!' : 'Copiar'}</span>
                        </button>
                    )}

                    {isRunning ? (
                        <button onClick={handleStop}
                            className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-rose-600/30 active:scale-95">
                            <Square size={14} /> <span className="hidden sm:inline">Detener</span>
                        </button>
                    ) : (
                        <button onClick={handleRunAll}
                            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-sky-600/30 active:scale-95">
                            <Play size={14} fill="currentColor" /> Ejecutar Todo
                        </button>
                    )}
                </div>
            </div>

            {/* ── Suite Buttons ── */}
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {suites.map(s => (
                    <button
                        key={s.key}
                        onClick={() => handleRunSuite(s.key)}
                        disabled={isRunning}
                        className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[10px] sm:text-xs font-bold transition-all border active:scale-95 bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-slate-500"
                    >
                        <span>{SUITE_ICONS[s.key] || '⚙️'}</span>
                        <span className="hidden sm:inline">{s.name}</span>
                        <span className="sm:hidden">{s.name.split(' ')[0]}</span>
                    </button>
                ))}
            </div>

            {/* ── Progress Bar ── */}
            {progress && (
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400">{progress.name}</span>
                        <span className="text-xs font-mono text-slate-500">{progress.current}/{progress.total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                    </div>
                </div>
            )}

            {/* ── Stats Bar ── */}
            {summary && (
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    <div className="bg-slate-800/80 rounded-xl p-2 sm:p-3 text-center border border-slate-700">
                        <p className="text-lg sm:text-2xl font-black text-white">{totalChecks}</p>
                        <p className="text-[7px] sm:text-[9px] text-slate-500 uppercase font-bold">Checks</p>
                    </div>
                    <div className="bg-emerald-950/50 rounded-xl p-2 sm:p-3 text-center border border-emerald-800/30">
                        <p className="text-lg sm:text-2xl font-black text-emerald-400">{passedChecks}</p>
                        <p className="text-[7px] sm:text-[9px] text-emerald-500 uppercase font-bold">OK</p>
                    </div>
                    <div className="bg-rose-950/50 rounded-xl p-2 sm:p-3 text-center border border-rose-800/30">
                        <p className="text-lg sm:text-2xl font-black text-rose-400">{failedChecks}</p>
                        <p className="text-[7px] sm:text-[9px] text-rose-500 uppercase font-bold">Fallo</p>
                    </div>
                </div>
            )}

            {/* ── Veredicto ── */}
            {summary && (
                <div className={`flex items-center justify-center gap-3 p-3 rounded-xl border ${
                    failedChecks === 0
                        ? 'bg-emerald-950/30 border-emerald-700/30'
                        : 'bg-rose-950/30 border-rose-700/30'
                }`}>
                    <span className="text-3xl sm:text-4xl">
                        {failedChecks === 0 ? '🟢' : '🔴'}
                    </span>
                    <div>
                        <p className={`text-sm sm:text-lg font-black ${
                            failedChecks === 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                            {failedChecks === 0
                                ? 'FLUJO DE MESAS OK'
                                : `${failedChecks} FALLO${failedChecks > 1 ? 'S' : ''} DETECTADO${failedChecks > 1 ? 'S' : ''}`}
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold">
                            {passedChecks}/{totalChecks} checks OK · Determinista · Sin efectos secundarios
                        </p>
                    </div>
                </div>
            )}

            {/* ── Errores ── */}
            {errorLogs.length > 0 && !isRunning && (
                <div className="bg-rose-950/20 rounded-xl border border-rose-800/30 overflow-hidden">
                    <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 border-b border-rose-800/20">
                        <AlertTriangle size={14} className="text-rose-400" />
                        <span className="text-xs sm:text-sm font-black text-rose-300 uppercase tracking-wide">
                            Errores — {errorLogs.length}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 space-y-1.5 max-h-32 overflow-y-auto">
                        {errorLogs.map((l, i) => (
                            <div key={i} className="flex items-start gap-2 px-2 sm:px-3 py-2 bg-rose-950/30 rounded-lg">
                                <XCircle size={12} className="text-rose-500 shrink-0 mt-0.5" />
                                <p className="text-[9px] sm:text-[10px] font-bold text-rose-300 break-all">{l.raw}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Log Console ── */}
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <TerminalSquare size={14} className="text-slate-500" />
                        <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Log</span>
                        {logs.length > 0 && (
                            <span className="text-[8px] sm:text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full font-mono">{logs.length}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="flex gap-1">
                            {['all', 'error', 'success', 'data'].map(f => (
                                <button key={f} onClick={() => setLogFilter(f)}
                                    className={`px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase transition-all ${
                                        logFilter === f
                                            ? f === 'error' ? 'bg-rose-600 text-white'
                                              : f === 'success' ? 'bg-emerald-600 text-white'
                                              : f === 'data' ? 'bg-violet-600 text-white'
                                              : 'bg-sky-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                    }`}>
                                    {f === 'all' ? 'Todo' : f === 'error' ? 'Err' : f === 'success' ? 'OK' : 'Data'}
                                </button>
                            ))}
                        </div>
                        <button onClick={handleClear} disabled={isRunning || logs.length === 0}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-30" title="Limpiar">
                            <Trash2 size={13} />
                        </button>
                        <button
                            onClick={() => {
                                const data = { timestamp: new Date().toISOString(), summary, logs };
                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url; a.download = `table-flow-test-${Date.now()}.json`; a.click();
                                URL.revokeObjectURL(url);
                            }}
                            disabled={logs.length === 0}
                            className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] sm:text-xs font-bold bg-slate-800 text-slate-300 hover:bg-violet-700 hover:text-white border border-slate-700 transition-all disabled:opacity-30">
                            <Download size={12} />
                            <span className="hidden sm:inline">JSON</span>
                        </button>
                    </div>
                </div>

                <div className="max-h-[40vh] sm:max-h-[50vh] overflow-y-auto p-2 sm:p-3 font-mono text-[9px] sm:text-xs space-y-0.5 select-text">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 sm:py-16 gap-3 select-none">
                            <span className="text-4xl opacity-30">🎱</span>
                            <p className="text-slate-600 text-xs sm:text-sm font-bold">Presiona "Ejecutar Todo" para iniciar</p>
                            <p className="text-slate-700 text-[8px] sm:text-[10px]">{suites.length} escenarios · Datos fijos · Determinista</p>
                        </div>
                    ) : (
                        visibleLogs.map((entry, i) => (
                            <div key={i} className={`flex gap-1.5 sm:gap-2 ${logColors[entry.type] || 'text-slate-400'}`}>
                                <span className="text-slate-600 shrink-0">[{entry.time}]</span>
                                <span className="break-all">{entry.msg}</span>
                            </div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-center text-[7px] sm:text-[9px] text-slate-700 font-mono uppercase pb-20 mt-4">
                Pool Los Diaz · Table Flow Tester v1.0 · {new Date().getFullYear()} · Determinista
            </p>
        </div>
    );
};
