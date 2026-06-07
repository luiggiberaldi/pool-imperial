import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Check, X, DollarSign, ShoppingBag, Send } from 'lucide-react';
import { Modal } from '../Modal';
import { showToast } from '../Toast';
import { useTablesStore } from '../../hooks/store/useTablesStore';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function AbonoSelectorModal({
    isOpen,
    onClose,
    table,
    session,
    currentItems,
    currentUser,
    grandTotal = 0
}) {
    const [selectedQtys, setSelectedQtys] = useState({});
    const [isMutating, setIsMutating] = useState(false);
    const [activeTab, setActiveTab] = useState('items'); // 'items' | 'monto'
    const [montoLibre, setMontoLibre] = useState('');
    const { updateSessionMetadata } = useTablesStore();
    const wasOpenRef = useRef(false);

    // Calcular el total de abonos previos ya registrados en la sesión
    const abonoTotal = (() => {
        if (!session?.notes || !session.notes.includes('|||HISTORIAL_ABONOS:')) return 0;
        try {
            const histStr = session.notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim();
            const list = JSON.parse(histStr);
            return list.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        } catch (_) {
            return 0;
        }
    })();

    // Límite máximo de abono permitido en esta operación
    const maxAllowedAbono = Math.max(0, grandTotal - abonoTotal);
 
    // Reset selected quantities ONLY when modal transitions from closed to open
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Modal was just opened: reset all quantities to 0
            const initial = {};
            currentItems.forEach(item => {
                initial[item.id] = 0;
            });
            setSelectedQtys(initial);
            setMontoLibre('');
            setActiveTab('items');
        } else if (isOpen) {
            // Modal was already open, but currentItems reference changed.
            // Preserve selection but sync with any changes in items (e.g. quantity changes or items removed)
            setSelectedQtys(prev => {
                const updated = {};
                currentItems.forEach(item => {
                    updated[item.id] = prev[item.id] !== undefined ? Math.min(prev[item.id], Number(item.qty)) : 0;
                });
                return updated;
            });
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, currentItems]);

    if (!isOpen || !session) return null;

    const handleIncrement = (itemId, maxQty) => {
        setSelectedQtys(prev => {
            const current = prev[itemId] || 0;
            if (current >= maxQty) return prev;
            return { ...prev, [itemId]: current + 1 };
        });
    };

    const handleDecrement = (itemId) => {
        setSelectedQtys(prev => {
            const current = prev[itemId] || 0;
            if (current <= 0) return prev;
            return { ...prev, [itemId]: current - 1 };
        });
    };

    const handleSelectAll = () => {
        const updated = {};
        currentItems.forEach(item => {
            updated[item.id] = Number(item.qty);
        });
        setSelectedQtys(updated);
    };

    const handleDeselectAll = () => {
        const updated = {};
        currentItems.forEach(item => {
            updated[item.id] = 0;
        });
        setSelectedQtys(updated);
    };

    const handleMontoChange = (e) => {
        const val = e.target.value.replace(/\D/g, ''); // keep only digits
        if (!val) {
            setMontoLibre('');
            return;
        }
        const formatted = new Intl.NumberFormat('es-CO').format(parseInt(val, 10));
        setMontoLibre(formatted);
    };

    // Calculate subtotal for chosen items
    const selectedItemsList = currentItems.filter(item => (selectedQtys[item.id] || 0) > 0);
    
    const abonoSubtotal = selectedItemsList.reduce((sum, item) => {
        const qty = selectedQtys[item.id] || 0;
        return sum + (qty * Number(item.unit_price_usd));
    }, 0);

    const handleSendRequestToCashier = async () => {
        if (selectedItemsList.length === 0) {
            showToast('Selecciona al menos un artículo para abonar', 'warning');
            return;
        }
        if (abonoSubtotal > maxAllowedAbono + 10) {
            showToast(`El valor de los artículos (${formatCOP(abonoSubtotal)}) supera el saldo pendiente de la mesa (${formatCOP(maxAllowedAbono)})`, 'warning');
            return;
        }
        setIsMutating(true);
        try {
            // Build the abono items payload
            const abonoPayload = selectedItemsList.map(item => ({
                id: item.id, // original order_item id
                product_id: item.product_id,
                product_name: item.product_name,
                qty: selectedQtys[item.id],
                unit_price_usd: Number(item.unit_price_usd),
                seat_id: item.seat_id || null
            }));

            // Clean both kinds of tags: |||ABONO and |||ABONO_MONTO
            const baseNotes = session.notes 
                ? session.notes.split('|||ABONO:')[0].split('|||ABONO_MONTO:')[0].trim() 
                : '';
            const newNotes = baseNotes 
                ? `${baseNotes} |||ABONO:${JSON.stringify(abonoPayload)}`
                : `|||ABONO:${JSON.stringify(abonoPayload)}`;

            // Put session in CHECKOUT status and save the abono notes
            const { requestCheckout } = useTablesStore.getState();
            await updateSessionMetadata(session.id, session.client_name, session.guest_count, session.client_id, newNotes);
            await requestCheckout(session.id);

            showToast('Solicitud de abono enviada a caja con éxito', 'success');
            onClose();
        } catch (error) {
            console.error('[AbonoSelector] Error requesting abono:', error);
            showToast('Error al enviar la solicitud de abono', 'error');
        } finally {
            setIsMutating(false);
        }
    };

    const handleSendMontoLibre = async () => {
        const amount = parseFloat(montoLibre.replace(/\./g, ''));
        if (!amount || amount <= 0) {
            showToast('Ingresa un monto válido mayor a 0', 'warning');
            return;
        }
        if (amount > maxAllowedAbono + 10) {
            showToast(`El monto del abono (${formatCOP(amount)}) supera el saldo pendiente de la mesa (${formatCOP(maxAllowedAbono)})`, 'warning');
            return;
        }
        setIsMutating(true);
        try {
            // Clean both kinds of tags: |||ABONO and |||ABONO_MONTO
            const baseNotes = session.notes 
                ? session.notes.split('|||ABONO:')[0].split('|||ABONO_MONTO:')[0].trim() 
                : '';
            const newNotes = baseNotes
                ? `${baseNotes} |||ABONO_MONTO:${JSON.stringify({ amount })}`
                : `|||ABONO_MONTO:${JSON.stringify({ amount })}`;

            // Put session in CHECKOUT status and save the abono notes
            const { requestCheckout } = useTablesStore.getState();
            await updateSessionMetadata(session.id, session.client_name, session.guest_count, session.client_id, newNotes);
            await requestCheckout(session.id);

            showToast('Solicitud de abono por monto enviada a caja', 'success');
            onClose();
        } catch (error) {
            console.error('[AbonoSelector] Error requesting abono monto:', error);
            showToast('Error al enviar la solicitud de abono', 'error');
        } finally {
            setIsMutating(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Abono Inteligente: ${table.name}`}>
            <div className="flex flex-col gap-4 py-2 text-slate-800 dark:text-white max-h-[75vh]">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {activeTab === 'items' 
                        ? "Selecciona los productos consumidos que deseas abonar (pagar parcialmente). La mesa y el juego seguirán activos."
                        : "Ingresa un monto específico en pesos colombianos (COP) para abonar a la cuenta de la mesa. La mesa y el juego seguirán activos."
                    }
                </p>

                {/* Tabs switcher */}
                <div className="flex bg-slate-100 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800 rounded-xl p-1">
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'items' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <ShoppingBag size={13} /> Por Artículos
                    </button>
                    <button
                        onClick={() => setActiveTab('monto')}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'monto' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <DollarSign size={13} /> Monto Libre
                    </button>
                </div>

                {activeTab === 'items' ? (
                    <>
                        {/* Selectors utility row */}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleSelectAll}
                                className="text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 px-2.5 py-1.5 rounded-lg transition-all"
                            >
                                Seleccionar Todo
                            </button>
                            <button
                                onClick={handleDeselectAll}
                                className="text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 px-2.5 py-1.5 rounded-lg transition-all"
                            >
                                Deseccionar Todo
                            </button>
                        </div>

                        {/* Items list */}
                        <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-[35vh] pr-1">
                            {currentItems.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400 italic">
                                    No hay consumos de bar/bebidas registrados en la comanda.
                                </div>
                            ) : (
                                currentItems.map(item => {
                                    const selectedQty = selectedQtys[item.id] || 0;
                                    const maxQty = Number(item.qty);

                                    return (
                                        <div key={item.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold truncate text-slate-850 dark:text-white">
                                                    {item.product_name}
                                                </p>
                                                <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-0.5">
                                                    {formatCOP(item.unit_price_usd)} c/u · En mesa: <span className="font-extrabold">{maxQty}</span>
                                                </p>
                                            </div>

                                            {/* Selector de cantidad */}
                                            <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-xl p-1">
                                                <button
                                                    onClick={() => handleDecrement(item.id)}
                                                    disabled={selectedQty <= 0}
                                                    className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-95"
                                                >
                                                    <Minus size={12} strokeWidth={2.5} />
                                                </button>
                                                
                                                <span className="w-6 text-center text-sm font-black">
                                                    {selectedQty}
                                                </span>

                                                <button
                                                    onClick={() => handleIncrement(item.id, maxQty)}
                                                    disabled={selectedQty >= maxQty}
                                                    className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-95"
                                                >
                                                    <Plus size={12} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Subtotal preview */}
                        <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl mt-2">
                            <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                                Total de Abono
                            </span>
                            <span className="text-xl font-black text-emerald-600 dark:text-emerald-450">
                                {formatCOP(abonoSubtotal)}
                            </span>
                        </div>

                        {/* Main trigger button */}
                        <div className="flex flex-col gap-2 mt-2">
                            <button
                                disabled={selectedItemsList.length === 0 || isMutating}
                                onClick={handleSendRequestToCashier}
                                className="w-full py-3.5 rounded-xl font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                            >
                                <Send size={15} /> Enviar Abono a Caja
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Custom amount interface */}
                        <div className="flex-1 flex flex-col gap-4 py-2">
                            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850 rounded-2xl p-6 flex flex-col items-center gap-3">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Monto del Abono (COP)</span>
                                <div className="relative w-full max-w-xs flex items-center justify-center">
                                    <span className="absolute left-4 text-2xl font-black text-slate-400">$</span>
                                    <input
                                        type="text"
                                        value={montoLibre}
                                        onChange={handleMontoChange}
                                        placeholder="0"
                                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-center text-2xl font-black text-slate-850 dark:text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-300"
                                    />
                                </div>
                                {montoLibre && (
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200">
                                        Abonando: {formatCOP(parseFloat(montoLibre.replace(/\./g, '')))}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Main trigger button for Monto Libre */}
                        <div className="flex flex-col gap-2 mt-2">
                            <button
                                disabled={!montoLibre || parseFloat(montoLibre.replace(/\./g, '')) <= 0 || isMutating}
                                onClick={handleSendMontoLibre}
                                className="w-full py-3.5 rounded-xl font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                            >
                                <Send size={15} /> Enviar Abono a Caja
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
