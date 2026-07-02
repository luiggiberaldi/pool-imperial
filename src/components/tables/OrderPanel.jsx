import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, X, Plus, Minus, Trash2, Loader2, Search, ChevronDown, UtensilsCrossed, Users } from 'lucide-react';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useProductContext } from '../../context/ProductContext';
import { showToast } from '../Toast';
import CustomSelect from '../CustomSelect';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

// Category color mapping for visual variety
const CAT_COLORS = {
    bebidas: 'from-sky-500 to-blue-600',
    cervezas: 'from-amber-500 to-orange-600',
    licores: 'from-purple-500 to-violet-600',
    snacks: 'from-emerald-500 to-teal-600',
    comida: 'from-rose-500 to-pink-600',
    tabacos: 'from-stone-500 to-stone-700',
    default: 'from-slate-500 to-slate-700',
};

function getCatColor(category) {
    if (!category) return CAT_COLORS.default;
    const key = category.toLowerCase();
    return Object.entries(CAT_COLORS).find(([k]) => key.includes(k))?.[1] || CAT_COLORS.default;
}

export function OrderPanel({ session, table, onClose }) {
    const { addItemToSession, deleteItem, updateItemQty, syncOrders } = useOrdersStore();
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const { currentUser } = useAuthStore();
    const { products, isLoadingProducts: loadingProducts, effectiveRate, adjustStock } = useProductContext();

    const [addingItem, setAddingItem] = useState(null);
    const [removingItem, setRemovingItem] = useState(null);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('Todos');
    const [qtyModalItem, setQtyModalItem] = useState(null);
    const [qtyInputValue, setQtyInputValue] = useState(1);
    const searchRef = useRef(null);

    // Seats support
    const seats = session?.seats || [];
    const hasSeats = seats.length > 1; // Only show seat UI when 2+ clients
    const [selectedSeatId, setSelectedSeatId] = useState(() => seats.length === 1 ? seats[0].id : null);

    const getFinalPriceOfItem = (item) => {
        const p = products.find(prod => prod.id === item.product_id);
        if (!p) return Number(item.unit_price_usd);
        const config = useTablesStore.getState().config;
        const taxRate = p.taxType === 'iva_19'
            ? (config?.taxRateIva ?? 19) / 100
            : p.taxType === 'impoconsumo_8'
                ? (config?.taxRateImpoconsumo ?? 8) / 100
                : 0;
        const isExclusive = p.taxMode === 'exclusive' && taxRate > 0;
        return isExclusive ? Number(item.unit_price_usd) * (1 + taxRate) : Number(item.unit_price_usd);
    };

    // Derive order and items
    const order = allOrders.find(o => o.table_session_id === session.id) || null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumed = currentItems.reduce((acc, item) => acc + (getFinalPriceOfItem(item) * Number(item.qty)), 0);

    // Items filtered by selected seat (null = show all)
    const visibleItems = hasSeats && selectedSeatId !== null
        ? currentItems.filter(i => i.seat_id === selectedSeatId)
        : currentItems;
    const visibleTotal = visibleItems.reduce((acc, item) => acc + (getFinalPriceOfItem(item) * Number(item.qty)), 0);

    // Categories derived from products
    const categories = ['Todos', ...new Set(products.map(p => p.category).filter(Boolean))];

    // Filtered products
    const filteredProducts = products.filter(p => {
        const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
        const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
        return matchSearch && matchCat;
    });

    useEffect(() => {
        syncOrders();
    }, []);

    // ── Stock adjustment helper (handles combos) ──
    const adjustStockForProduct = (productId, delta) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        if (product.isCombo) {
            // Deduct from underlying products
            if (product.comboItems && product.comboItems.length > 0) {
                product.comboItems.forEach(ci => {
                    adjustStock(ci.productId, delta * (ci.qty || 1));
                });
            } else if (product.linkedProductId) {
                adjustStock(product.linkedProductId, delta * (product.linkedQty || 1));
            }
        } else {
            adjustStock(productId, delta);
        }
    };

    // ── Stock validation helper ──
    const allowNegativeStock = localStorage.getItem('allow_negative_stock') === 'true';

    const getAvailableStock = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return 0;
        if (product.isUnlimitedStock) return Infinity;
        if (product.isCombo) {
            // Combo stock = min(componentStock / componentQty)
            if (product.comboItems && product.comboItems.length > 0) {
                return Math.min(...product.comboItems.map(ci => {
                    const comp = products.find(p => p.id === ci.productId);
                    return comp ? Math.floor((comp.stock ?? 0) / (ci.qty || 1)) : 0;
                }));
            } else if (product.linkedProductId) {
                const linked = products.find(p => p.id === product.linkedProductId);
                return linked ? Math.floor((linked.stock ?? 0) / (product.linkedQty || 1)) : 0;
            }
            return 9999;
        }
        return product.stock ?? 0;
    };

    const getQtyInOrder = (productId) => {
        return currentItems
            .filter(i => i.product_id === productId)
            .reduce((sum, i) => sum + Number(i.qty), 0);
    };

    const handleAddProduct = async (product, seatIdOverride) => {
        if (!currentUser) {
            showToast('Sin sesión', 'No hay usuario activo. Vuelve a iniciar sesión.', 'error');
            return;
        }
        if (addingItem) return;

        // Stock validation
        const available = getAvailableStock(product.id);
        const inOrder = getQtyInOrder(product.id);
        if (!allowNegativeStock) {
            if (available <= 0) {
                showToast(`${product.name}: stock máximo alcanzado (${available + inOrder})`, 'warning');
                return;
            }
        } else {
            if (available <= 0) {
                showToast(`${product.name}: sin stock disponible (vendiendo en negativo)`, 'warning');
            }
        }
        setAddingItem(product.id);
        const productForOrder = {
            id: product.id,
            name: product.name,
            price: product.priceUsdt || product.priceUsd || product.price || 0,
            priceBs: product.priceBs || null
        };
        const seatId = seatIdOverride !== undefined ? seatIdOverride : selectedSeatId;
        try {
            await addItemToSession(table.id, session.id, currentUser.id, productForOrder, effectiveRate, seatId);
            // Descontar stock al agregar al consumo
            adjustStockForProduct(product.id, -1);
        } catch (e) {
            console.error(e);
            const msg = e?.message || e?.details || e?.hint || JSON.stringify(e) || 'Error desconocido';
            showToast(`Error al agregar: ${msg}`, 'error', 8000);
        } finally {
            setTimeout(() => setAddingItem(null), 300);
        }
    };

    const handleRemoveItem = async (itemId) => {
        const item = allItems.find(i => i.id === itemId);
        setRemovingItem(itemId);
        await deleteItem(itemId);
        // Revertir stock al eliminar
        if (item) adjustStockForProduct(item.product_id, item.qty);
        setRemovingItem(null);
    };

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] z-50 flex flex-col bg-slate-50 shadow-2xl">

            {/* ── HEADER ── */}
            <div className="px-5 pt-6 pb-4 flex justify-between items-start shrink-0">
                <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/30">
                            <ShoppingBag size={16} className="text-white" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">Consumo</h2>
                    </div>
                    <p className="text-sm text-slate-500 font-medium ml-10">{table.name}</p>
                </div>
                <button onClick={onClose}
                    className="w-9 h-9 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all active:scale-90 mt-1">
                    <X size={18} />
                </button>
            </div>

            {/* ── SEAT SELECTOR BAR ── */}
            {hasSeats && (
                <div className="px-5 mb-3 shrink-0">
                    <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                        <button
                            onClick={() => setSelectedSeatId(null)}
                            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                selectedSeatId === null
                                    ? 'bg-slate-700 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            <Users size={11} /> Compartido
                        </button>
                        {seats.map(seat => {
                            const seatItemCount = currentItems.filter(i => i.seat_id === seat.id).length;
                            return (
                            <button
                                key={seat.id}
                                onClick={() => !seat.paid && setSelectedSeatId(seat.id)}
                                disabled={seat.paid}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                    selectedSeatId === seat.id
                                        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                        : seat.paid
                                            ? 'bg-emerald-50 text-emerald-400 line-through opacity-50 cursor-not-allowed'
                                            : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-500'
                                }`}
                            >
                                {seat.label || `Persona ${seats.indexOf(seat) + 1}`}
                                {seatItemCount > 0 && (
                                    <span className={`text-[9px] px-1 py-0.5 rounded-full leading-none ${
                                        selectedSeatId === seat.id ? 'bg-white/20' : 'bg-indigo-100 text-indigo-500'
                                    }`}>{seatItemCount}</span>
                                )}
                            </button>
                            );
                        })}
                    </div>
                    {/* Active target indicator */}
                    {selectedSeatId !== null && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-indigo-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            Agregando a: {seats.find(s => s.id === selectedSeatId)?.label || 'Cliente'}
                        </div>
                    )}
                </div>
            )}

            {/* ── ORDER ITEMS SECTION ── */}
            <div className="px-5 mb-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                        {hasSeats && selectedSeatId !== null
                            ? `${seats.find(s => s.id === selectedSeatId)?.label || 'Cliente'} · ${visibleItems.length} ${visibleItems.length === 1 ? 'item' : 'items'}`
                            : `En la mesa · ${currentItems.length} ${currentItems.length === 1 ? 'item' : 'items'}`
                        }
                    </span>
                    {(hasSeats && selectedSeatId !== null ? visibleTotal : totalConsumed) > 0 && (
                        <span className="text-emerald-400 font-black text-lg tabular-nums">
                            {formatCOP(hasSeats && selectedSeatId !== null ? visibleTotal : totalConsumed)}
                        </span>
                    )}
                </div>

                {visibleItems.length === 0 ? (
                    <div className="flex items-center gap-3 py-4 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <UtensilsCrossed size={20} className="text-slate-400 shrink-0" />
                        <p className="text-sm text-slate-500 font-medium">Sin productos aún. Añade del menú abajo.</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {visibleItems.map(item => {
                            const itemPrice = getFinalPriceOfItem(item);
                            const lineTotal = itemPrice * Number(item.qty);
                            const seatLabel = (hasSeats && selectedSeatId === null) ? (item.seat_id ? (seats.find(s => s.id === item.seat_id)?.label || '?') : 'Compartido') : null;
                            return (
                            <div key={item.id}
                                className={`flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3 transition-all duration-300 ${removingItem === item.id ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                                {/* Editable Qty badge — solo admin/cajero pueden editar */}
                                {currentUser?.role !== 'MESERO' && currentUser?.role !== 'BARRA' ? (
                                <button
                                    onClick={() => {
                                        setQtyModalItem(item);
                                        setQtyInputValue(item.qty);
                                    }}
                                    className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 hover:bg-indigo-200 hover:scale-105 active:scale-95 transition-all shadow-sm group"
                                >
                                    <span className="text-indigo-700 font-black text-sm group-hover:hidden">{item.qty}</span>
                                    <span className="text-indigo-700 font-black text-lg hidden group-hover:block">#</span>
                                </button>
                                ) : (
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                                    <span className="text-indigo-700 font-black text-sm">{item.qty}</span>
                                </div>
                                )}
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-slate-800 font-bold text-sm truncate">{item.product_name}</div>
                                    <div className="text-slate-500 text-xs font-medium">
                                        {formatCOP(itemPrice)} c/u · <span className="text-emerald-500 font-bold">{formatCOP(lineTotal)}</span>
                                        {seatLabel && <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md font-bold">{seatLabel}</span>}
                                    </div>
                                </div>
                                {/* Controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => {
                                        const p = products.find(prod => prod.id === item.product_id);
                                        if (p) handleAddProduct(p, item.seat_id || null);
                                    }}
                                        disabled={!!addingItem}
                                        className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
                                        <Plus size={14} />
                                    </button>
                                    {currentUser?.role !== 'MESERO' && currentUser?.role !== 'BARRA' && (
                                    <>
                                    <button onClick={async () => {
                                            if (item.qty <= 1) { handleRemoveItem(item.id); }
                                            else { adjustStockForProduct(item.product_id, 1); await updateItemQty(item.id, item.qty - 1); }
                                        }}
                                        className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-all active:scale-90">
                                        <Minus size={14} />
                                    </button>
                                    <button onClick={() => handleRemoveItem(item.id)}
                                        className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center transition-all active:scale-90">
                                        <Trash2 size={13} />
                                    </button>
                                    </>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── DIVIDER ── */}
            <div className="mx-5 border-t border-slate-200 mb-4 shrink-0" />

            {/* ── MENU SECTION ── */}
            <div className="flex flex-col flex-1 min-h-0 px-5">
                {/* Search bar */}
                <div className="relative mb-3 shrink-0">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar producto..."
                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                    />
                </div>

                {/* Category dropdown */}
                {categories.length > 1 && (
                    <div className="relative mb-3 shrink-0">
                        <CustomSelect
                            value={activeCategory}
                            onChange={e => setActiveCategory(e.target.value)}
                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm cursor-pointer"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </CustomSelect>
                    </div>
                )}

                {/* Product grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingProducts ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={28} className="animate-spin text-indigo-400" />
                            <span className="text-sm text-slate-500">Cargando menú...</span>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                            <p className="text-sm font-medium">Sin resultados para "{search}"</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5 pb-4">
                            {filteredProducts.map(p => {
                                // Seat-aware: when a seat is selected, only match items for that seat
                                const inOrder = hasSeats && selectedSeatId !== null
                                    ? currentItems.find(i => i.product_id === p.id && i.seat_id === selectedSeatId)
                                    : hasSeats && selectedSeatId === null
                                        ? currentItems.find(i => i.product_id === p.id && !i.seat_id)
                                        : currentItems.find(i => i.product_id === p.id);
                                const isAdding = addingItem === p.id;
                                const availableStock = getAvailableStock(p.id);
                                const qtyInOrder = getQtyInOrder(p.id);
                                const isOutOfStock = !allowNegativeStock && availableStock <= 0 && !p.isCombo;
                                const isNegativeStock = allowNegativeStock && availableStock <= 0 && !p.isCombo;
                                const isMaxReached = !allowNegativeStock && availableStock <= 0;
                                const isLowStock = availableStock > 0 && availableStock <= (p.lowStockAlert ?? 5);
                                return (
                                    <div key={p.id}
                                        className={`relative text-left rounded-2xl p-3.5 border transition-all group overflow-hidden ${
                                            isOutOfStock
                                                ? 'bg-slate-50 border-slate-200 opacity-50'
                                                : inOrder
                                                    ? 'bg-indigo-50 border-indigo-200 shadow-sm shadow-indigo-100'
                                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md shadow-sm'
                                        } ${isAdding ? 'opacity-60' : ''}`}>
                                        {/* Category accent dot */}
                                        <div className={`w-2 h-2 rounded-full mb-2.5 bg-gradient-to-br ${getCatColor(p.category)}`} />
                                        <div className="font-bold text-slate-800 text-sm leading-tight mb-1 line-clamp-2">{p.name}</div>
                                        {p.category && (
                                            <div className="text-[10px] text-slate-400 mb-2">{p.category}</div>
                                        )}
                                        {/* Stock indicator */}
                                        {!p.isCombo && (
                                            <div className={`text-[9px] font-bold mb-1.5 ${isOutOfStock ? 'text-red-500' : isNegativeStock ? 'text-amber-500' : isLowStock ? 'text-amber-500' : 'text-slate-400'}`}>
                                                {p.isUnlimitedStock ? 'Stock: Ilimitado' : isOutOfStock ? 'Agotado' : isNegativeStock ? 'Sin stock' : `Stock: ${availableStock}`}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mt-auto">
                                            {(() => {
                                                 const config = useTablesStore.getState().config;
                                                 const taxRate = p.taxType === 'iva_19'
                                                     ? (config?.taxRateIva ?? 19) / 100
                                                     : p.taxType === 'impoconsumo_8'
                                                         ? (config?.taxRateImpoconsumo ?? 8) / 100
                                                         : 0;
                                                 const isExclusive = p.taxMode === 'exclusive' && taxRate > 0;
                                                 const finalPrice = isExclusive ? (p.priceUsdt || 0) * (1 + taxRate) : (p.priceUsdt || p.priceUsd || p.price || 0);
                                                return (
                                                    <span className="text-emerald-500 font-black text-sm">
                                                        {formatCOP(finalPrice)}
                                                    </span>
                                                );
                                            })()}
                                            {inOrder && (
                                                <div className="flex items-center gap-1 ml-auto">
                                                    {currentUser?.role !== 'MESERO' && currentUser?.role !== 'BARRA' && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); if (inOrder.qty <= 1) handleRemoveItem(inOrder.id); else { adjustStockForProduct(inOrder.product_id, 1); updateItemQty(inOrder.id, inOrder.qty - 1); } }}
                                                        className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center active:scale-90 transition-all">
                                                        <Minus size={10} />
                                                    </button>
                                                    )}
                                                    <span className="text-[10px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded-full min-w-[22px] text-center">
                                                        {inOrder.qty}
                                                    </span>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleAddProduct(p); }}
                                                        disabled={isAdding || isMaxReached}
                                                        className="w-6 h-6 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none">
                                                        {isAdding ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Add button (only when not in order and has stock) */}
                                        {!inOrder && !isOutOfStock && (
                                            <button
                                                onClick={() => handleAddProduct(p)}
                                                disabled={isAdding}
                                                className="absolute inset-0 w-full h-full"
                                                aria-label={`Agregar ${p.name}`}
                                            />
                                        )}
                                        {!inOrder && !isOutOfStock && (
                                            <div className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all pointer-events-none ${
                                                isAdding ? 'bg-indigo-500' : 'bg-transparent group-hover:bg-slate-100'
                                            }`}>
                                                {isAdding
                                                    ? <Loader2 size={10} className="animate-spin text-white" />
                                                    : <Plus size={10} className="text-slate-300 group-hover:text-slate-600" />
                                                }
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── QTY MODAL ── */}
            {qtyModalItem && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setQtyModalItem(null)} />
                    
                    {/* Modal Content */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200 text-center relative z-10 text-slate-800">
                        <div className="w-12 h-12 mx-auto bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center mb-3">
                            <ShoppingBag size={24} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-0.5 line-clamp-1">
                            {qtyModalItem.product_name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                            Modifica la cantidad en la orden
                        </p>
                        
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <button onClick={() => setQtyInputValue(Math.max(1, qtyInputValue - 1))} className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-2xl flex items-center justify-center transition-all active:scale-95">
                                -
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="w-24 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-3xl font-black text-indigo-600 focus:border-indigo-500 focus:ring-0 py-2.5 transition-all shadow-inner"
                                value={qtyInputValue}
                                onChange={e => { const v = parseInt(e.target.value); setQtyInputValue(isNaN(v) ? '' : v); }}
                                onBlur={e => { if (!qtyInputValue || qtyInputValue < 1) setQtyInputValue(1); }}
                                onFocus={e => { setTimeout(() => e.target.select(), 0); }}
                                autoFocus
                            />
                            <button onClick={() => {
                                if (!allowNegativeStock) {
                                    const available = getAvailableStock(qtyModalItem.product_id);
                                    if ((qtyInputValue + 1 - qtyModalItem.qty) > available) {
                                        showToast(`Stock máximo: ${qtyModalItem.qty + available}`, 'warning');
                                        return;
                                    }
                                }
                                setQtyInputValue(qtyInputValue + 1);
                            }} className="w-12 h-12 rounded-2xl bg-indigo-100 hover:bg-indigo-200 text-indigo-600 font-black text-2xl flex items-center justify-center transition-all active:scale-95">
                                +
                            </button>
                        </div>
                        
                        {/* Quick presets */}
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            {[6, 12, 24].map(preset => (
                                <button key={preset} onClick={() => setQtyInputValue(preset)} className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 active:bg-slate-200 text-slate-600 font-bold text-sm transition-colors cursor-pointer">
                                    {preset} un
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setQtyModalItem(null)} className="flex-1 py-3.5 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition-all active:scale-95">
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    const oldQty = qtyModalItem.qty;
                                    const newQty = qtyInputValue;
                                    // Validate stock when increasing
                                    if (!allowNegativeStock && newQty > oldQty) {
                                        const available = getAvailableStock(qtyModalItem.product_id);
                                        if ((newQty - oldQty) > available) {
                                            showToast(`Stock máximo: ${oldQty + available}`, 'warning');
                                            return;
                                        }
                                    }
                                    const delta = oldQty - newQty; // positive = stock returned, negative = stock consumed
                                    if (delta !== 0) adjustStockForProduct(qtyModalItem.product_id, delta);
                                    try {
                                        await updateItemQty(qtyModalItem.id, qtyInputValue);
                                    } catch(e) { /* ignore update errors */ }
                                    setQtyModalItem(null);
                                }}
                                className="flex-1 py-3.5 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all shadow-md shadow-indigo-500/20"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── BOTTOM SAFE AREA ── */}
            <div className="h-safe-bottom shrink-0" />
        </div>
    );
}
