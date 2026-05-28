import React from 'react';
import { Clock, Users, Check, ChevronLeft } from 'lucide-react';
import { SeatEditor } from './SeatEditor';
import { TargetIcon } from './TargetIcon';
import { Modal } from '../Modal';

export function OpenWizardModal({
    isOpen, onClose,
    wizardStep, setWizardStep,
    sessionSeats, onSeatsChange,
    seatValidationError, setSeatValidationError,
    onSearchCustomerForSeat,
    pendingOpen,
    modePina, setModePina,
    modeHora, setModeHora,
    selectedHours, setSelectedHours,
    initialChargeTarget, setInitialChargeTarget,
    config, tableName,
    onFinish,
}) {
    const title = wizardStep === 1 ? 'Abrir Mesa'
        : wizardStep === 2 ? 'Modo de Juego'
        : wizardStep === 3 ? '¿A quién cobrar?'
        : 'Confirmar Apertura';

    return (
        <Modal isOpen={isOpen} onClose={() => { onClose(); setWizardStep(1); }} title={title}>
            <div className="flex flex-col gap-4 py-2">

                {/* ── Step 1: Clientes ── */}
                {wizardStep === 1 && (
                    <>
                        <SeatEditor
                            seats={sessionSeats}
                            onSeatsChange={(s) => { setSeatValidationError(false); onSeatsChange(s); }}
                            onSearchCustomerForSeat={onSearchCustomerForSeat}
                        />
                        {seatValidationError && (
                            <p className="text-xs font-bold text-red-500 animate-pulse px-1 -mt-2">
                                Cada cliente debe tener un nombre
                            </p>
                        )}
                        <button
                            onClick={() => {
                                if (sessionSeats.length > 0 && sessionSeats.some(s => !s.label?.trim())) {
                                    setSeatValidationError(true);
                                    return;
                                }
                                if (pendingOpen?.mode === 'SHOW_MODE') {
                                    setWizardStep(2);
                                } else {
                                    onFinish();
                                }
                            }}
                            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                        >
                            {pendingOpen?.mode === 'SHOW_MODE' ? 'Continuar' : (pendingOpen?.mode === 'CONSUMPTION' ? 'Ocupar Mesa' : 'Abrir Mesa')}
                        </button>
                    </>
                )}

                {/* ── Step 2: Modo de Juego (pool tables) ── */}
                {wizardStep === 2 && (
                    <>
                        <div className="flex flex-col gap-2.5">
                            {/* Toggle Piña */}
                            <button
                                onClick={() => setModePina(!modePina)}
                                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    modePina
                                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 shadow-sm shadow-amber-200/50'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-amber-300'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    modePina ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                }`}>
                                    <TargetIcon size={20} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className={`font-black text-sm ${modePina ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        La Piña
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        ${config.pricePina || 0} por partida
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    modePina ? 'bg-amber-500 border-amber-500' : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                    {modePina && <Check size={14} className="text-white" />}
                                </div>
                            </button>

                            {/* Toggle Hora */}
                            <button
                                onClick={() => { setModeHora(!modeHora); if (!modeHora) setSelectedHours(null); }}
                                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    modeHora
                                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 shadow-sm shadow-emerald-200/50'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    modeHora ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                }`}>
                                    <Clock size={20} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className={`font-black text-sm ${modeHora ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        Por Hora
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        ${config.pricePerHour || 0}/hora · Prepago
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    modeHora ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                    {modeHora && <Check size={14} className="text-white" />}
                                </div>
                            </button>
                        </div>

                        {/* Selector de tiempo */}
                        {modeHora && (
                            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seleccionar tiempo</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {[0.5, 1, 2, 3, 4].map(h => (
                                        <button
                                            key={h}
                                            onClick={() => setSelectedHours(h)}
                                            className={`p-2.5 rounded-xl font-black transition-colors flex flex-col items-center justify-center ${
                                                selectedHours === h
                                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'
                                            }`}
                                        >
                                            <span className="text-lg">{h === 0.5 ? '30' : h}</span>
                                            <span className="text-[10px] font-semibold opacity-70">{h === 0.5 ? 'MIN' : 'HRS'}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Resumen */}
                        {(modePina || modeHora) && (
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>Modo:</span>
                                <div className="flex gap-1.5">
                                    {modePina && <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">Piña</span>}
                                    {modePina && modeHora && <span>+</span>}
                                    {modeHora && selectedHours > 0 && <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">{selectedHours === 0.5 ? '30 min' : `${selectedHours}h`}</span>}
                                    {modeHora && !selectedHours && <span className="bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">Selecciona tiempo</span>}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => setWizardStep(1)}
                                className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={16} /> Volver
                            </button>
                            <button
                                onClick={() => {
                                    if (!modePina && !modeHora) return;
                                    const needsAttribution = sessionSeats.length > 1 && !(modePina && modeHora);
                                    if (needsAttribution) {
                                        setInitialChargeTarget(null);
                                        setWizardStep(3);
                                    } else {
                                        setWizardStep(4);
                                    }
                                }}
                                disabled={!modePina && !modeHora || (modeHora && !selectedHours)}
                                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95 disabled:active:scale-100"
                            >
                                {!modePina && !modeHora ? 'Selecciona un modo' : (modeHora && !selectedHours) ? 'Selecciona tiempo' : 'Continuar'}
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 3: Atribución ── */}
                {wizardStep === 3 && (
                    <>
                        <p className="text-xs text-slate-500">
                            {modePina && !modeHora
                                ? '¿Quién paga la primera piña?'
                                : '¿Quién paga las primeras horas?'
                            }
                        </p>
                        {sessionSeats.map(seat => (
                            <button
                                key={seat.id || seat.label}
                                onClick={() => setInitialChargeTarget(seat.id || seat.label)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left active:scale-95 ${
                                    initialChargeTarget === (seat.id || seat.label)
                                        ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-400 shadow-sm'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-sky-300'
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                    initialChargeTarget === (seat.id || seat.label) ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                }`}>
                                    {(seat.label || 'C').charAt(0).toUpperCase()}
                                </div>
                                <span className={`font-bold text-sm ${
                                    initialChargeTarget === (seat.id || seat.label) ? 'text-sky-700 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'
                                }`}>{seat.label || `Cliente ${sessionSeats.indexOf(seat) + 1}`}</span>
                                {initialChargeTarget === (seat.id || seat.label) && <Check size={16} className="text-sky-500 ml-auto" />}
                            </button>
                        ))}
                        <button
                            onClick={() => setInitialChargeTarget(null)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-all text-left active:scale-95 ${
                                initialChargeTarget === null
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-400'
                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 hover:border-slate-400'
                            }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                initialChargeTarget === null ? 'bg-slate-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            }`}>
                                <Users size={14} />
                            </div>
                            <div>
                                <p className={`font-bold text-sm ${initialChargeTarget === null ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>Compartido</p>
                                <p className="text-[10px] text-slate-400">Se divide entre todos al cobrar</p>
                            </div>
                            {initialChargeTarget === null && <Check size={16} className="text-slate-500 ml-auto" />}
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setWizardStep(2)}
                                className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={16} /> Volver
                            </button>
                            <button
                                onClick={() => setWizardStep(4)}
                                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                            >
                                Continuar
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 4: Confirmar ── */}
                {wizardStep === 4 && (() => {
                    const modeLabel = modePina && modeHora
                        ? `Piña + ${selectedHours === 0.5 ? '30 min' : `${selectedHours}h`}`
                        : modePina ? 'La Piña'
                        : selectedHours === 0.5 ? 'Prepago 30 min'
                        : `Prepago ${selectedHours}h`;
                    const clientsLabel = sessionSeats.length > 0
                        ? sessionSeats.map(s => s.label).join(', ')
                        : 'Sin registrar';
                    const chargeLabel = initialChargeTarget === null
                        ? 'Compartido'
                        : sessionSeats.find(s => (s.id || s.label) === initialChargeTarget)?.label || '?';
                    const showChargeInfo = sessionSeats.length > 1 && !(modePina && modeHora);

                    return (
                        <>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mesa</span>
                                    <span className="font-black text-slate-700 dark:text-white">{tableName}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modo</span>
                                    <span className="font-black text-slate-700 dark:text-white">{modeLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes</span>
                                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm text-right max-w-[60%] truncate">{clientsLabel}</span>
                                </div>
                                {showChargeInfo && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primer cobro</span>
                                        <span className="font-bold text-sky-600 dark:text-sky-400 text-sm">{chargeLabel}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const needsAttribution = sessionSeats.length > 1 && !(modePina && modeHora);
                                        setWizardStep(needsAttribution ? 3 : 2);
                                    }}
                                    className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronLeft size={16} /> Volver
                                </button>
                                <button
                                    onClick={onFinish}
                                    className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-black py-3.5 rounded-xl shadow-md transition-all active:scale-95"
                                >
                                    Abrir Mesa
                                </button>
                            </div>
                        </>
                    );
                })()}
            </div>
        </Modal>
    );
}
