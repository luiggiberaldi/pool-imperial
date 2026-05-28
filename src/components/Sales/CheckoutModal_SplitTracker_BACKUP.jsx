/**
 * BACKUP: Split Payment Tracker UI (versión avanzada con tracking por persona)
 *
 * Este archivo contiene el código del tracker avanzado de división de pago
 * que fue reemplazado por una calculadora visual más simple.
 *
 * Para restaurar: copiar el contenido de este archivo de vuelta a CheckoutModal.jsx
 * en la sección "DIVIDIR CUENTA", y restaurar el state/hooks correspondiente.
 *
 * Estado requerido:
 *   const [splitPaid, setSplitPaid] = useState(0);
 *   const [splitBaseTotal, setSplitBaseTotal] = useState(0);
 *   const [splitSnapshots, setSplitSnapshots] = useState([]);
 *   const [flashPerson, setFlashPerson] = useState(null);
 *   const autoAdvanceRef = useRef(false);
 *   + commitCurrentPerson callback
 *   + useEffect for auto-advance
 *
 * Imports requeridos: useRef, useEffect, useCallback (de React)
 *
 * Fecha de backup: 2026-04-11
 */

// ============================================================
// SHARED FUNCTION: commitCurrentPerson (va dentro del componente)
// ============================================================
/*
const commitCurrentPerson = useCallback(() => {
    if (!splitPeople || splitPaid >= splitPeople) return;
    const prevAmounts = {};
    splitSnapshots.forEach(s => {
        Object.entries(s.amounts).forEach(([id, val]) => {
            prevAmounts[id] = (prevAmounts[id] || 0) + val;
        });
    });
    const personAmounts = {};
    let personTotalUsd = 0;
    paymentMethods.forEach(m => {
        const cur = parseFloat(barValues[m.id] || '0') || 0;
        const prev = prevAmounts[m.id] || 0;
        const inc = parseFloat((cur - prev).toFixed(2));
        if (inc > 0.001) {
            personAmounts[m.id] = inc;
            personTotalUsd += m.currency === 'BS' ? inc / effectiveRate : inc;
        }
    });
    const snap = {
        personNum: splitPaid + 1,
        amounts: personAmounts,
        totalUsd: personTotalUsd,
        _cumulativeUsd: totalPaidUsd,
    };
    setSplitSnapshots(prev => [...prev, snap]);
    setSplitBaseTotal(totalPaidUsd);
    setSplitPaid(p => Math.min(splitPeople, p + 1));
    setActiveMethodId(null);
    setFlashPerson(splitPaid);
    setTimeout(() => setFlashPerson(null), 400);
}, [splitPeople, splitPaid, splitSnapshots, paymentMethods, barValues, effectiveRate, totalPaidUsd]);
*/

// ============================================================
// AUTO-ADVANCE useEffect (va dentro del componente)
// ============================================================
/*
useEffect(() => {
    if (!autoAdvanceRef.current) return;
    autoAdvanceRef.current = false;
    if (!splitPeople || splitPaid >= splitPeople) return;
    const basePerPerson = divR(cartTotalUsd, splitPeople);
    const isLast = splitPaid === splitPeople - 1;
    const perPerson = isLast
        ? subR(cartTotalUsd, mulR(basePerPerson, splitPeople - 1))
        : basePerPerson;
    const collected = Math.max(0, subR(totalPaidUsd, splitBaseTotal));
    if (subR(perPerson, collected) < EPSILON && collected >= EPSILON) {
        commitCurrentPerson();
    }
}, [totalPaidUsd, splitPeople, splitPaid, cartTotalUsd, splitBaseTotal, commitCurrentPerson]);
*/

// ============================================================
// JSX: Split Tracker UI completa (reemplaza la sección "DIVIDIR CUENTA")
// ============================================================
/*
{splitPeople && cartTotalUsd > 0 && (() => {
    const basePerPersonUsd = divR(cartTotalUsd, splitPeople);
    const basePerPersonBs = divR(cartTotalBs, splitPeople);
    const isLastPerson = splitPaid === splitPeople - 1;
    const perPersonUsd = isLastPerson
        ? subR(cartTotalUsd, mulR(basePerPersonUsd, splitPeople - 1))
        : basePerPersonUsd;
    const perPersonBs = isLastPerson
        ? subR(cartTotalBs, mulR(basePerPersonBs, splitPeople - 1))
        : basePerPersonBs;
    const collectedForCurrent = Math.max(0, totalPaidUsd - splitBaseTotal);
    const stillNeedsUsd = Math.max(0, perPersonUsd - collectedForCurrent);
    const personDone = stillNeedsUsd < 0.005;
    return (
    <div className="mt-2.5 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-xl">
        {splitPaid < splitPeople ? (
            <div className="mb-3 rounded-xl overflow-hidden shadow-md shadow-violet-500/30">
                <div className="p-3 bg-violet-500 text-white flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Cobrar ahora</p>
                        <p className="text-[11px] font-bold opacity-90">Persona {splitPaid + 1} de {splitPeople}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black leading-none">${perPersonUsd.toFixed(2)}</p>
                        <p className="text-xs font-bold opacity-80 mt-0.5">Bs {formatBs(perPersonBs)}</p>
                    </div>
                </div>
                <div className="p-2 bg-violet-600 flex flex-wrap gap-1.5">
                    <p className="text-[9px] font-black text-white/60 uppercase tracking-widest self-center w-full">+ Añadir parte vía:</p>
                    {[...methodsUsd, ...methodsBs].map(m => {
                        const amount = m.currency === 'BS' ? perPersonBs : perPersonUsd;
                        const label = m.currency === 'BS' ? `Bs ${formatBs(amount)}` : `$${amount.toFixed(2)}`;
                        return (
                            <button key={m.id}
                                onClick={() => {
                                    autoAdvanceRef.current = true;
                                    const prev = parseFloat(barValues[m.id] || '0') || 0;
                                    handleBarChange(m.id, (prev + amount).toFixed(2));
                                    setActiveMethodId(m.id);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white border border-white/20">
                                <span className="text-[10px] font-black">{m.label}</span>
                                <span className="text-[10px] font-bold opacity-80">{label}</span>
                            </button>
                        );
                    })}
                </div>
                <div className={`px-3 pt-2 pb-3 ${personDone ? 'bg-emerald-600' : 'bg-violet-700/60'}`}>
                    <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-white rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (collectedForCurrent / perPersonUsd) * 100)}%` }} />
                    </div>
                    {personDone ? (
                        <p className="text-xs font-black text-white text-center">¡Listo! Pulsa + Cobrado</p>
                    ) : collectedForCurrent > 0 ? (
                        <div className="flex justify-between gap-3">
                            <div className="flex-1 bg-emerald-500/40 rounded-lg px-2 py-1">
                                <p className="text-[9px] font-black text-emerald-200 uppercase tracking-widest">Cobrado</p>
                                <p className="text-sm font-black text-white leading-tight">${collectedForCurrent.toFixed(2)}</p>
                            </div>
                            <div className="flex-1 bg-orange-500/40 rounded-lg px-2 py-1">
                                <p className="text-[9px] font-black text-orange-200 uppercase tracking-widest">Falta</p>
                                <p className="text-sm font-black text-white leading-tight">${stillNeedsUsd.toFixed(2)}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] font-black text-white/70 text-center">Usa los botones de arriba o toca un campo</p>
                    )}
                </div>
            </div>
        ) : (
            <div className="mb-3 p-3 bg-emerald-500 rounded-xl text-white flex items-center justify-center gap-2">
                <span className="text-lg">✓</span>
                <p className="text-sm font-black">¡Cuenta completa!</p>
            </div>
        )}

        <div className="border-t border-violet-200 dark:border-violet-700/40 pt-2.5">
            <div className="flex gap-1.5 flex-wrap mb-2.5">
                {Array.from({ length: splitPeople }).map((_, i) => (
                    <button key={i}
                        onClick={() => setSplitPaid(i < splitPaid ? i : i + 1)}
                        className={`w-7 h-7 rounded-full text-[10px] font-black border-2 transition-all ${
                            flashPerson === i ? 'bg-emerald-400 border-emerald-400 text-white scale-125'
                            : i < splitPaid ? 'bg-violet-500 border-violet-500 text-white'
                            : 'bg-white dark:bg-slate-800 border-violet-300 text-violet-400'
                        }`}>{i + 1}</button>
                ))}
            </div>
            <div className="flex gap-2">
                <button disabled={splitPaid <= 0}
                    onClick={() => { /* undo logic */ }}
                    className="flex-1 py-1.5 rounded-xl text-xs font-black border border-violet-300 text-violet-500 disabled:opacity-30">
                    − Quitar última
                </button>
                <button disabled={splitPaid >= splitPeople || !personDone || collectedForCurrent < EPSILON}
                    onClick={() => commitCurrentPerson()}
                    className="flex-1 py-1.5 rounded-xl text-xs font-black bg-emerald-500 text-white disabled:opacity-30">
                    {personDone ? '✓ + Cobrado' : `+ Cobrado (falta $${stillNeedsUsd.toFixed(2)})`}
                </button>
            </div>
        </div>
    </div>
    );
})()}
*/
