import React from 'react';
import { Activity, Play, Pause, Check, Eye } from 'lucide-react';
import { formatElapsedTime } from '../../utils/tableBillingEngine';
import { TargetIcon } from './TargetIcon';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function TableCardTimerDisplay({
    table, session, elapsed,
    isAvailable, isTimeFree, isPaidIdle, isMixedMode,
    hasPinas, hasHoursActive, hasLimit, remainingMins, isExceeded,
    isPaused, isLockedForMe,
    timeCost, grandTotal, totalConsumption,
    config,
    roundsOffset, hoursOffset,
    onAdjustTime, onPauseTimer, onResumeTimer, onShowTotalDetails,
}) {
    return (
        <div className="flex-1 flex flex-col justify-center items-center py-1 sm:py-3 min-h-[90px]">
            {isAvailable ? (
                <div className="flex flex-col items-center gap-2">
                    <Activity
                        size={28}
                        className={`sm:w-9 sm:h-9 opacity-25 ${table.type === 'NORMAL' ? 'text-slate-400' : 'text-sky-400'}`}
                        strokeWidth={1.5}
                    />
                    <span className={`text-xs sm:text-sm font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                        table.type === 'NORMAL'
                            ? 'text-slate-500 bg-slate-100 border-slate-200'
                            : 'text-sky-600 bg-sky-50 border-sky-200'
                    }`}>
                        {table.type === 'NORMAL' ? 'Mesa Normal' : 'Mesa de Pool'}
                    </span>
                </div>
            ) : (
                <>
                    {isTimeFree ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 mt-2">
                            <div className="text-lg sm:text-xl font-black text-center">
                                Orden Activa
                            </div>
                            <div className="text-xs font-medium opacity-80">Acumulando Consumo</div>
                            <div className="text-[10px] sm:text-xs font-bold opacity-60 text-slate-200 bg-white/10 px-2 py-0.5 rounded-full mt-0.5">
                                Tiempo en mesa: {formatElapsedTime(elapsed)}
                            </div>
                        </div>
                    ) : (isPaidIdle && !hasLimit) ? (
                        <div className="flex flex-col items-center gap-2 mt-2">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                <Check size={20} className="text-emerald-400" />
                            </div>
                            <div className="text-sm font-black text-emerald-400 uppercase tracking-wider">Pagado · {formatCOP(0)}</div>
                            <div className="text-[10px] font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                                {formatElapsedTime(elapsed)} en mesa
                            </div>
                        </div>
                    ) : (
                        <>
                            {isMixedMode ? (
                                /* ── Display mixto: piñas + timer ── */
                                <div className="flex flex-col items-center gap-1.5 mt-1 w-full">
                                    {/* Timer */}
                                    <div className="flex items-center justify-center gap-2">
                                        <div className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tighter drop-shadow-md leading-none ${isExceeded ? 'text-rose-400 animate-pulse' : ''}`}>
                                            {hasLimit ? formatElapsedTime(Math.max(0, remainingMins)) : formatElapsedTime(elapsed)}
                                        </div>
                                        {!isLockedForMe && (
                                            <button
                                                onClick={isPaused ? onResumeTimer : onPauseTimer}
                                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                                            >
                                                {isPaused ? <Play size={10} fill="currentColor" /> : <Pause size={10} />}
                                            </button>
                                        )}
                                    </div>
                                    {hasLimit && (
                                        <div className={`text-[9px] font-black tracking-wider uppercase ${isExceeded ? 'text-rose-400' : 'text-amber-300'}`}>
                                            {isExceeded ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                                        </div>
                                    )}
                                    {/* Piñas (compacto) */}
                                    {(() => {
                                        const sharedRounds = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                                        const seatRounds = (session?.seats || []).reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
                                        const totalRounds = sharedRounds + seatRounds;
                                        const paidRounds = roundsOffset || 0;
                                        return (
                                            <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-center flex items-center gap-1.5">
                                                <TargetIcon size={10} />
                                                {totalRounds} piña{totalRounds !== 1 ? 's' : ''}
                                                {paidRounds > 0 && <span className="text-emerald-400">({paidRounds} pagada{paidRounds !== 1 ? 's' : ''})</span>}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : session.game_mode === 'PINA' || (hasPinas && !hasHoursActive) ? (
                                <div className="flex flex-col items-center gap-1 mt-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center shrink-0">
                                            <TargetIcon size={16} />
                                        </div>
                                        <div className="text-lg font-black tracking-tight text-amber-400 uppercase leading-none">
                                            Modo Piña
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                                        {formatElapsedTime(elapsed)} en mesa
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-center gap-2">
                                        <div className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tighter drop-shadow-md leading-none ${isExceeded ? 'text-rose-400 animate-pulse' : ''}`}>
                                            {hasLimit ? formatElapsedTime(Math.max(0, remainingMins)) : formatElapsedTime(elapsed)}
                                        </div>
                                        {session?.game_mode !== 'PINA' && !isLockedForMe && (
                                        <button
                                            onClick={isPaused ? onResumeTimer : onPauseTimer}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                                            title={isPaused ? 'Reanudar tiempo' : 'Pausar tiempo'}
                                        >
                                            {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} />}
                                        </button>
                                        )}
                                    </div>
                                    {hasLimit && (
                                        <div className={`text-[10px] font-black tracking-wider uppercase mt-1 ${isExceeded ? 'text-rose-400' : 'text-amber-300'}`}>
                                            {isExceeded ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                                        </div>
                                    )}
                                    {hasLimit && hoursOffset > 0 && (
                                        <div className="text-[9px] font-bold text-emerald-300 mt-0.5">
                                            {hoursOffset === 0.5 ? '30min' : `${hoursOffset}h`} pagada{hoursOffset !== 1 ? 's' : ''} de {session.hours_paid === 0.5 ? '30min' : `${Number(session.hours_paid)}h`}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {/* Total + Eye — visible for ALL occupied sessions */}
                    <div className="flex items-center justify-center gap-1.5 mt-3">
                        <div className="bg-white/10 px-3 py-1.5 rounded-xl flex flex-col items-center justify-center backdrop-blur-sm shadow-inner overflow-hidden max-w-full">
                            <div className="flex items-center gap-1.5">
                                <span className="text-lg sm:text-xl font-black text-emerald-300 truncate">{formatCOP(grandTotal)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onShowTotalDetails}
                            className="bg-sky-500/80 hover:bg-sky-500 p-2 rounded-xl text-white transition-all active:scale-95 shrink-0 shadow-sm"
                            title="Ver detalles"
                        >
                            <Eye size={16} />
                        </button>
                    </div>
                    {hasPinas && !isMixedMode && (() => {
                        const sharedRounds = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                        const seatRounds = (session?.seats || []).reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
                        const totalRounds = sharedRounds + seatRounds;
                        const paidRounds = roundsOffset || 0;
                        return (
                        <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full mt-1 text-center">
                            {totalRounds} piña{totalRounds !== 1 ? 's' : ''}
                            {paidRounds > 0 && <span className="text-emerald-400 ml-1">({paidRounds} pagada{paidRounds !== 1 ? 's' : ''})</span>}
                        </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
}
