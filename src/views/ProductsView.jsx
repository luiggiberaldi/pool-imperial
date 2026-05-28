import React, { useState } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { Package, Plus, Trash2, X, Tag, Pencil, Search, ChevronLeft, ChevronRight, AlertTriangle, LayoutGrid, List, Minus, ArrowUpDown, Percent, Printer, CheckSquare, Warehouse, Gift, ArrowDownUp } from 'lucide-react';
import { Modal } from '../components/Modal';
import { ProductShareModal } from '../components/ProductShareModal';
import ShareInventoryModal from '../components/ShareInventoryModal';
import { formatBs } from '../utils/calculatorUtils';
import { generarEtiquetas } from '../utils/ticketGenerator';
import { useWallet } from '../hooks/useWallet';
import ProductCard from '../components/Products/ProductCard';
import ProductFormModal from '../components/Products/ProductFormModal';
import ConfirmModal from '../components/ConfirmModal';
import CategoryManagerModal from '../components/Products/CategoryManagerModal';
import BulkPriceAdjustModal from '../components/Products/BulkPriceAdjustModal';
import StockAdjustmentModal from '../components/Products/StockAdjustmentModal';
import ComboFormModal from '../components/Products/ComboFormModal';
import { useProductContext } from '../context/ProductContext';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import SwipeableItem from '../components/SwipeableItem';
import { useInventoryVelocity } from '../hooks/useInventoryVelocity';
import { useProductForm } from '../hooks/useProductForm';
import { useProductPagination } from '../hooks/useProductPagination';
import { useAuthStore } from '../hooks/store/authStore';
import { useAudit } from '../hooks/useAudit';
import { forcePushToCloud } from '../hooks/useCloudSync';

export const ProductsView = ({ rates, triggerHaptic }) => {
    const {
        products, setProducts, categories, setCategories, isLoadingProducts,
        streetRate, useAutoRate, setUseAutoRate, customRate, setCustomRate,
        effectiveRate, copEnabled, tasaCop, adjustStock: baseAdjustStock, broadcastProductDelta
    } = useProductContext();
    const { role } = useAuthStore();
    const isCajero = role === 'CAJERO';
    const { log: auditLog } = useAudit();

    const adjustStock = async (productId, delta) => {
        baseAdjustStock(productId, delta);
        triggerHaptic && triggerHaptic();
        try {
            const product = products.find(p => p.id === productId);
            auditLog('INVENTARIO', 'AJUSTE_STOCK', `Stock de ${product?.name || 'Producto'}: ${delta > 0 ? '+' : ''}${delta}`, { productoId: productId, productName: product?.name || 'Producto', delta, stockAnterior: product?.stock ?? 0 });
            const record = {
                id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                timestamp: new Date().toISOString(),
                tipo: delta > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
                items: [{ id: productId, name: product?.name || 'Producto', qty: Math.abs(delta) }],
                totalUsd: 0, totalBs: 0, status: 'COMPLETADA',
            };
            const sales = await storageService.getItem('bodega_sales_v1', []);
            sales.push(record);
            await storageService.setItem('bodega_sales_v1', sales);
        } catch (e) { /* silencioso */ }
    };

    const handleConfirmStock = async (productId, delta) => {
        await adjustStock(productId, delta);
        await new Promise(r => setTimeout(r, 150));
        try { await forcePushToCloud(); } catch (e) { console.warn('[ProductsView] Force push falló:', e); }
    };

    // ── Form hook ──
    const form = useProductForm({ products, effectiveRate, setProducts, broadcastProductDelta, triggerHaptic, auditLog, onClose: () => setIsModalOpen(false) });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isComboModalOpen, setIsComboModalOpen] = useState(false);
    const [editingCombo, setEditingCombo] = useState(null);

    const handleEdit = async (product) => {
        if (product.isCombo) {
            setEditingCombo(product);
            setIsComboModalOpen(true);
        } else {
            await form.handleEdit(product);
            setIsModalOpen(true);
        }
    };
    const handleClose = () => { form.handleClose(); setIsModalOpen(false); };

    const handleComboSave = (comboProduct) => {
        if (editingCombo) {
            setProducts(products.map(p => p.id === comboProduct.id ? comboProduct : p));
            if (broadcastProductDelta) {
                const { image: _img, ...withoutImage } = comboProduct;
                broadcastProductDelta('product_update', { product: withoutImage });
            }
            auditLog('INVENTARIO', 'COMBO_EDITADO', `Combo "${comboProduct.name}" editado - $${comboProduct.priceUsdt}`);
        } else {
            setProducts([comboProduct, ...products]);
            if (broadcastProductDelta) {
                const { image: _img, ...withoutImage } = comboProduct;
                broadcastProductDelta('product_added', { product: withoutImage });
            }
            auditLog('INVENTARIO', 'COMBO_CREADO', `Combo "${comboProduct.name}" creado - $${comboProduct.priceUsdt}`);
        }
        setIsComboModalOpen(false);
        setEditingCombo(null);
        triggerHaptic && triggerHaptic();
    };

    // ── Pagination hook ──
    const pagination = useProductPagination({ products, effectiveRate, triggerHaptic });
    const { searchTerm, handleSetSearchTerm, activeCategory, handleSetActiveCategory,
        currentPage, setCurrentPage, viewMode, toggleViewMode,
        sortField, sortDir, handleSort, paginatedProducts, totalPages, lowStockCount,
        categoryScrollRef, filteredProducts } = pagination;

    // ── Selection state ──
    const [selectedIds, setSelectedIds] = useState(new Set());
    const handleToggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setSelectedIds(newSet);
    };
    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(paginatedProducts.map(p => p.id)) : new Set());
    };
    const handlePrintSelected = () => {
        generarEtiquetas(products.filter(p => selectedIds.has(p.id)), effectiveRate, copEnabled, tasaCop);
        setSelectedIds(new Set());
        showToast(`Generando ${selectedIds.size} etiquetas`, 'success');
    };
    const handlePrintSingle = (p) => generarEtiquetas([p], effectiveRate, copEnabled, tasaCop);

    // ── Delete state ──
    const [deleteId, setDeleteId] = useState(null);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
    const handleDelete = (id) => { triggerHaptic && triggerHaptic(); setDeleteId(id); };
    const confirmDelete = () => {
        if (deleteId) {
            const p = products.find(x => x.id === deleteId);
            auditLog('INVENTARIO', 'PRODUCTO_ELIMINADO', `Producto "${p?.name || '?'}" eliminado`);
            setProducts(products.filter(p => p.id !== deleteId));
            setDeleteId(null);
            triggerHaptic && triggerHaptic();
        }
    };
    const confirmDeleteSelected = () => {
        const count = selectedIds.size;
        setProducts(products.filter(p => !selectedIds.has(p.id)));
        auditLog('INVENTARIO', 'ELIMINACION_MASIVA', `Eliminados ${count} productos seleccionados`);
        setSelectedIds(new Set());
        setIsDeleteSelectedModalOpen(false);
        triggerHaptic && triggerHaptic();
        showToast(`${count} productos eliminados correctamente`, 'success');
    };

    // ── Category management ──
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
    const [deleteCategoryConfirmId, setDeleteCategoryConfirmId] = useState(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryIcon, setNewCategoryIcon] = useState('📦');
    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const newCat = { id: newCategoryName.trim().toLowerCase().replace(/\s+/g, '_'), label: newCategoryName.trim(), icon: newCategoryIcon, color: 'slate' };
        if (categories.find(c => c.id === newCat.id)) { showToast('Esta categoría ya existe', 'warning'); return; }
        setCategories([...categories, newCat]);
        setNewCategoryName('');
        setNewCategoryIcon('📦');
        triggerHaptic && triggerHaptic();
    };
    const handleDeleteCategory = (categoryId) => {
        if (categoryId === 'todos' || categoryId === 'otros') { showToast('No puedes eliminar una categoría del sistema', 'warning'); return; }
        if (products.some(p => p.category === categoryId)) { showToast('No puedes borrar esta categoría porque tiene productos. Cámbialos primero.', 'warning'); return; }
        setDeleteCategoryConfirmId(categoryId);
    };
    const confirmDeleteCategory = () => {
        if (!deleteCategoryConfirmId) return;
        setCategories(categories.filter(c => c.id !== deleteCategoryConfirmId));
        if (activeCategory === deleteCategoryConfirmId) handleSetActiveCategory('todos');
        triggerHaptic && triggerHaptic();
        setDeleteCategoryConfirmId(null);
    };
    const handleEditCategory = (categoryId, newName) => {
        if (!newName.trim() || categoryId === 'todos' || categoryId === 'otros') return;
        setCategories(categories.map(c => c.id === categoryId ? { ...c, label: newName.trim() } : c));
        showToast('Categoría renombrada', 'success');
        triggerHaptic && triggerHaptic();
    };

    // ── Share / Bulk ──
    const [shareProduct, setShareProduct] = useState(null);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isBulkPriceOpen, setIsBulkPriceOpen] = useState(false);
    const [isStockAdjustOpen, setIsStockAdjustOpen] = useState(false);
    const { accounts } = useWallet();
    const { salesVelocityMap } = useInventoryVelocity(products.length);

    // ── RENDER ──
    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 overflow-y-auto">

            {/* Header */}
            <div className="shrink-0 mb-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                            <Warehouse size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-lg sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight truncate">Inventario</h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {products.length > 0 && !isCajero && (
                            <>
                                <button onClick={() => { triggerHaptic && triggerHaptic(); setIsStockAdjustOpen(true); }}
                                    className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400 rounded-xl transition-all active:scale-95" title="Ingreso / Egreso de Inventario">
                                    <ArrowDownUp size={16} strokeWidth={2.5} />
                                </button>
                                <button onClick={() => { triggerHaptic && triggerHaptic(); setIsBulkPriceOpen(true); }}
                                    className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 rounded-xl transition-all active:scale-95" title="Ajuste Masivo de Precios">
                                    <Percent size={16} strokeWidth={2.5} />
                                </button>
                                <button onClick={() => { triggerHaptic && triggerHaptic(); setIsDeleteAllModalOpen(true); }}
                                    className="p-2 bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl transition-all active:scale-95" title="Borrar Todo">
                                    <Trash2 size={16} strokeWidth={2.5} />
                                </button>
                            </>
                        )}
                        {!isCajero && (
                            <>
                            <button onClick={() => { triggerHaptic && triggerHaptic(); setIsComboModalOpen(true); setEditingCombo(null); }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl shadow-md shadow-violet-500/20 transition-all active:scale-95 font-bold text-sm">
                                <Gift size={16} strokeWidth={2.5} />
                                <span className="hidden sm:inline">Combo</span>
                            </button>
                            <button data-tour="add-product" onClick={() => { triggerHaptic && triggerHaptic(); setIsModalOpen(true); }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl shadow-md shadow-brand/20 transition-all active:scale-95 font-bold text-sm">
                                <Plus size={16} strokeWidth={2.5} />
                                <span className="hidden sm:inline">Nuevo</span>
                            </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Stats + View Toggle */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1 rounded-full">{products.length} productos</span>
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                    <button onClick={() => { triggerHaptic && triggerHaptic(); setSelectedIds(new Set(products.map(p => p.id))); showToast('Todo el inventario seleccionado', 'success'); }}
                        className="text-[10px] font-bold bg-brand/10 text-brand px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer hover:bg-brand/20 transition-colors active:scale-95">
                        <CheckSquare size={12} /> <span className="hidden sm:inline">Seleccionar todo</span><span className="sm:hidden">Todos</span>
                    </button>
                    {lowStockCount > 0 && (
                        <>
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                            <button onClick={() => { handleSetActiveCategory('bajo-stock'); triggerHaptic && triggerHaptic(); }}
                                className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">
                                ⚠️ {lowStockCount} bajo stock
                            </button>
                        </>
                    )}
                    <div className="ml-auto" />
                    <button onClick={toggleViewMode}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-brand hover:border-brand-light transition-all active:scale-95"
                        title={viewMode === 'grid' ? 'Cambiar a vista lista' : 'Cambiar a vista cuadrícula'}>
                        {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
                    </button>
                </div>

                {/* Category Pills */}
                <div className="relative">
                    <div ref={categoryScrollRef} className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide scroll-smooth snap-x">
                        {categories.map(cat => (
                            <button key={cat.id} onClick={() => { handleSetActiveCategory(cat.id); triggerHaptic && triggerHaptic(); }}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all snap-start border ${activeCategory === cat.id ? 'bg-brand text-white shadow-sm shadow-brand/20 border-brand' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 active:scale-95'}`}>
                                {cat.label}
                            </button>
                        ))}
                        <button onClick={() => { triggerHaptic && triggerHaptic(); setIsCategoryManagerOpen(true); }}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-transparent active:scale-95 flex items-center gap-1 snap-start">
                            <Pencil size={12} /> Editar
                        </button>
                    </div>
                    <div className="pointer-events-none absolute right-0 top-0 bottom-1.5 w-8 bg-gradient-to-l from-slate-50 dark:from-slate-950 to-transparent sm:hidden" />
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar producto..." value={searchTerm}
                        onChange={(e) => handleSetSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 sm:py-3 pl-9 sm:pl-12 pr-4 text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 shadow-sm" />
                </div>
            </div>

            {/* Selection bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-2 p-2 px-3 bg-brand/10 border border-brand/20 rounded-xl mb-3 shrink-0 animate-in slide-in-from-top-2">
                    <span className="text-sm font-bold text-brand flex items-center gap-1">
                        <CheckSquare size={16} /> {selectedIds.size} seleccionados
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">Cancelar</button>
                        {!isCajero && (
                            <button onClick={() => { triggerHaptic && triggerHaptic(); setIsDeleteSelectedModalOpen(true); }}
                                className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all flex items-center gap-1">
                                <Trash2 size={14} /> <span className="hidden sm:inline">Eliminar seleccionados</span><span className="sm:hidden">Borrar</span>
                            </button>
                        )}
                        <button onClick={handlePrintSelected} className="px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-lg shadow-sm hover:bg-brand-dark transition-all flex items-center gap-1">
                            <Printer size={14} /> <span className="hidden sm:inline">Imprimir Etiquetas</span><span className="sm:hidden">Imprimir</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            {isLoadingProducts ? (
                <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {[1,2,3,4,5,6,7,8,9,10].map(i => (
                            <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 h-56 flex flex-col justify-between">
                                <div><Skeleton className="w-12 h-12 rounded-xl mb-3" /><Skeleton className="w-3/4 h-4 rounded mb-2" /><Skeleton className="w-1/2 h-3 rounded" /></div>
                                <div><Skeleton className="w-full h-8 rounded-lg mb-2" /><div className="flex justify-between"><Skeleton className="w-1/3 h-6 rounded-lg" /><Skeleton className="w-1/3 h-6 rounded-lg" /></div></div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : products.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
                    <EmptyState icon={Package} title="Inventario Vacío"
                        description="Aún no tienes productos registrados. Empieza a llenar tus anaqueles para poder vender."
                        actionLabel="NUEVO PRODUCTO" onAction={() => { triggerHaptic && triggerHaptic(); setIsModalOpen(true); }} />
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
                    <EmptyState icon={Search} title="Sin resultados"
                        description={`No encontramos productos para "${searchTerm || activeCategory}".`}
                        secondaryActionLabel="Limpiar Filtros"
                        onSecondaryAction={() => { handleSetSearchTerm(''); handleSetActiveCategory('todos'); triggerHaptic && triggerHaptic(); }} />
                </div>
            ) : (
                <>
                    {activeCategory === 'bajo-stock' && (
                        <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 px-3 py-2 rounded-xl mb-3 shrink-0">
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Mostrando productos con stock bajo</span>
                            <button onClick={() => handleSetActiveCategory('todos')} className="text-xs font-bold text-amber-500 hover:text-amber-700 transition-colors">× Ver todos</button>
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                                {paginatedProducts.map(p => (
                                    <SwipeableItem key={p.id} onEdit={() => handleEdit(p)} onDelete={() => handleDelete(p.id)} triggerHaptic={triggerHaptic}>
                                        <ProductCard product={p} effectiveRate={effectiveRate} streetRate={streetRate}
                                            categories={categories} copEnabled={copEnabled} tasaCop={tasaCop}
                                            onAdjustStock={adjustStock} onConfirmStock={handleConfirmStock}
                                            onShare={setShareProduct} onEdit={handleEdit} onDelete={handleDelete}
                                            readOnly={isCajero}
                                            allProducts={products}
                                            daysRemaining={salesVelocityMap[p.id] > 0 && (p.stock ?? 0) > 0 ? Math.round((p.stock ?? 0) / salesVelocityMap[p.id]) : null}
                                            isSelected={selectedIds.has(p.id)}
                                            onToggleSelect={() => handleToggleSelect(p.id)}
                                            onPrint={() => handlePrintSingle(p)}
                                        />
                                    </SwipeableItem>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="hidden sm:grid sm:grid-cols-[40px_1fr_100px_100px_70px_80px_110px] gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <div className="flex items-center justify-center">
                                        <input type="checkbox" onChange={handleSelectAll} checked={selectedIds.size > 0 && selectedIds.size === paginatedProducts.length} className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer" />
                                    </div>
                                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-left">Producto {sortField === 'name' && <ArrowUpDown size={10} />}</button>
                                    <button onClick={() => handleSort('price')} className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Precio {sortField === 'price' && <ArrowUpDown size={10} />}</button>
                                    <span>{!isCajero && 'Costo'}</span>
                                    {!isCajero && <button onClick={() => handleSort('margin')} className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Margen {sortField === 'margin' && <ArrowUpDown size={10} />}</button>}
                                    <button onClick={() => handleSort('stock')} className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Stock {sortField === 'stock' && <ArrowUpDown size={10} />}</button>
                                    <span className="text-right">Acciones</span>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {paginatedProducts.map(p => {
                                        const valBs = p.priceBs > 0 ? p.priceBs : p.priceUsdt * effectiveRate;
                                        const isLowStock = (p.stock ?? 0) <= (p.lowStockAlert ?? 5);
                                        const margin = p.costBs > 0 ? ((valBs - p.costBs) / p.costBs * 100) : null;
                                        const catInfo = categories.find(c => c.id === p.category);
                                        return (
                                            <div key={p.id} className={`grid grid-cols-[auto_1fr_auto] sm:grid-cols-[40px_1fr_100px_100px_70px_80px_110px] gap-2 px-4 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${selectedIds.has(p.id) ? 'bg-brand/5 dark:bg-brand/10' : ''} ${isLowStock ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}`}>
                                                <div className="flex items-center justify-center px-1">
                                                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => handleToggleSelect(p.id)} className="w-5 h-5 sm:w-4 sm:h-4 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer focus:ring-offset-0" />
                                                </div>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {p.image ? <img src={p.image} className="w-full h-full object-contain" alt={p.name} loading="lazy" /> : <Tag size={16} className="text-slate-300 dark:text-slate-600" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {catInfo && catInfo.id !== 'todos' && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{catInfo.label}</span>}
                                                            {isLowStock && <span className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5"><AlertTriangle size={9} /> Bajo</span>}
                                                            <span className="sm:hidden text-[11px] font-black text-emerald-600 dark:text-emerald-400">${(p.priceUsdt || 0).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Mobile actions */}
                                                <div className="flex items-center gap-1.5 sm:hidden">
                                                    <button onClick={() => handlePrintSingle(p)} className="p-1.5 text-slate-300 hover:text-brand transition-colors"><Printer size={14} /></button>
                                                    {!isCajero && (
                                                        <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                            <button onClick={() => adjustStock(p.id, -1)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Minus size={14} /></button>
                                                            <span className={`text-xs font-black min-w-[28px] text-center ${isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>{p.stock ?? 0}</span>
                                                            <button onClick={() => adjustStock(p.id, 1)} className="p-1.5 text-slate-400 hover:text-emerald-500 transition-colors"><Plus size={14} /></button>
                                                        </div>
                                                    )}
                                                    {isCajero && <span className={`text-xs font-black ${isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>{p.stock ?? 0}</span>}
                                                    {!isCajero && <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-300 hover:text-amber-500 transition-colors"><Pencil size={14} /></button>}
                                                </div>
                                                {/* Desktop columns */}
                                                <div className="hidden sm:block">
                                                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${(p.priceUsdt || 0).toFixed(2)}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{formatBs(valBs)} Bs</p>
                                                    {copEnabled && <p className="text-[10px] font-bold text-amber-500/80 mt-0.5">{(p.priceUsdt * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</p>}
                                                </div>
                                                <div className="hidden sm:block">{!isCajero ? <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{p.costUsd ? `$${p.costUsd.toFixed(2)}` : '-'}</p> : <span className="text-[10px] text-slate-300">-</span>}</div>
                                                <div className="hidden sm:block">
                                                    {!isCajero ? (margin !== null ? (
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>{margin >= 0 ? '+' : ''}{margin.toFixed(0)}%</span>
                                                    ) : <span className="text-[10px] text-slate-300">-</span>) : <span className="text-[10px] text-slate-300">-</span>}
                                                </div>
                                                <div className="hidden sm:flex items-center gap-1">
                                                    {!isCajero && <button onClick={() => adjustStock(p.id, -1)} className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors active:scale-90"><Minus size={14} /></button>}
                                                    <span className={`text-sm font-black min-w-[32px] text-center ${isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>{p.stock ?? 0}</span>
                                                    {!isCajero && <button onClick={() => adjustStock(p.id, 1)} className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-colors active:scale-90"><Plus size={14} /></button>}
                                                </div>
                                                <div className="hidden sm:flex items-center justify-end gap-1">
                                                    <button onClick={() => handlePrintSingle(p)} className="p-1.5 rounded-lg text-slate-300 hover:text-brand hover:bg-brand/10 transition-all" title="Imprimir Etiqueta"><Printer size={14} /></button>
                                                    {!isCajero && <button onClick={() => handleEdit(p)} className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"><Pencil size={14} /></button>}
                                                    {!isCajero && <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"><Trash2 size={14} /></button>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 py-4 shrink-0">
                                <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}
                                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <ChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
                                </button>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Página {currentPage} de {totalPages}</span>
                                <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}
                                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <ChevronRight size={20} className="text-slate-600 dark:text-slate-400" />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modales */}
            <ProductFormModal
                isOpen={isModalOpen} onClose={handleClose} isEditing={!!form.editingId}
                image={form.image} setImage={form.setImage}
                name={form.name} setName={form.setName}
                barcode={form.barcode} setBarcode={form.setBarcode}
                category={form.category} setCategory={form.setCategory}
                unit={form.unit} setUnit={form.setUnit}
                priceUsd={form.priceUsd} handlePriceUsdChange={form.handlePriceUsdChange}
                priceBs={form.priceBs} handlePriceBsChange={form.handlePriceBsChange}
                costUsd={form.costUsd} handleCostUsdChange={form.handleCostUsdChange}
                costBs={form.costBs} handleCostBsChange={form.handleCostBsChange}
                stock={form.stock} setStock={form.setStock}
                lowStockAlert={form.lowStockAlert} setLowStockAlert={form.setLowStockAlert}
                unitsPerPackage={form.unitsPerPackage} setUnitsPerPackage={form.setUnitsPerPackage}
                sellByUnit={form.sellByUnit} setSellByUnit={form.setSellByUnit}
                unitPriceUsd={form.unitPriceUsd} setUnitPriceUsd={form.setUnitPriceUsd}
                packagingType={form.packagingType} setPackagingType={form.setPackagingType}
                stockInLotes={form.stockInLotes} setStockInLotes={form.setStockInLotes}
                granelUnit={form.granelUnit} setGranelUnit={form.setGranelUnit}
                effectiveRate={effectiveRate} copEnabled={copEnabled} tasaCop={tasaCop}
                isFormShaking={form.isFormShaking}
                handleImageUpload={form.handleImageUpload}
                handleSave={form.handleSave}
                categories={categories} products={products}
                productMovements={form.editingId ? form.productMovements : null}
                isCombo={form.isCombo}
            />

            <ComboFormModal
                isOpen={isComboModalOpen}
                onClose={() => { setIsComboModalOpen(false); setEditingCombo(null); }}
                products={products}
                categories={categories}
                effectiveRate={effectiveRate}
                copEnabled={copEnabled}
                tasaCop={tasaCop}
                onSave={handleComboSave}
                editingCombo={editingCombo}
            />

            <ProductShareModal isOpen={!!shareProduct} onClose={() => setShareProduct(null)}
                product={shareProduct} accounts={accounts} streetRate={streetRate}
                rates={{ ...rates, bcv: { ...rates.bcv, price: effectiveRate } }} />

            <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Eliminar Producto">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-2"><Trash2 size={32} className="text-red-500" /></div>
                    <div>
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white">¿Estás seguro?</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 px-4">Esta acción eliminará el producto permanentemente.</p>
                    </div>
                    <div className="flex gap-3 w-full pt-2">
                        <button onClick={() => setDeleteId(null)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">Cancelar</button>
                        <button onClick={confirmDelete} className="flex-1 py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-lg shadow-red-500/30 active:scale-95 transition-all">¡Sí, eliminar!</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteAllModalOpen} onClose={() => { setIsDeleteAllModalOpen(false); setDeleteAllConfirmText(''); }} title="⚠️ Borrado de Inventario">
                <div className="p-4 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 text-red-500 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} /></div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">¿Estás absolutamente seguro?</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 px-2">Esta acción borrará <strong className="text-red-500">{products.length} productos</strong> y no se puede deshacer.</p>
                    <div className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Para confirmar, escribe "BORRAR":</p>
                        <input type="text" value={deleteAllConfirmText} onChange={(e) => setDeleteAllConfirmText(e.target.value)} placeholder="Ej. BORRAR"
                            className="w-full form-input bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-center font-black text-red-500 uppercase tracking-widest focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                    <button onClick={() => { setIsDeleteAllModalOpen(false); setDeleteAllConfirmText(''); }}
                        className="flex-1 py-3.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-white font-bold rounded-xl active:scale-[0.98] transition-all">Cancelar</button>
                    <button onClick={async () => {
                        triggerHaptic && triggerHaptic();
                        if (deleteAllConfirmText.trim().toUpperCase() === 'BORRAR') {
                            const count = products.length;
                            await storageService.setItem('bodega_products_v1', []);
                            setProducts([]);
                            auditLog('INVENTARIO', 'BORRADO_TOTAL', `Borrado total: ${count} productos eliminados`);
                            setIsDeleteAllModalOpen(false);
                            setDeleteAllConfirmText('');
                        }
                    }} disabled={deleteAllConfirmText.trim().toUpperCase() !== 'BORRAR'}
                        className="flex-1 py-3.5 bg-red-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2">
                        <Trash2 size={18} /> Borrar Todo
                    </button>
                </div>
            </Modal>

            <ShareInventoryModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} products={products} categories={categories}
                onImport={(result) => {
                    if (result.categories?.length > 0) setCategories(result.categories);
                    if (result.products?.length > 0) setProducts(result.products);
                    showToast('Inventario importado correctamente', 'success');
                }} />

            <BulkPriceAdjustModal isOpen={isBulkPriceOpen} onClose={() => setIsBulkPriceOpen(false)}
                products={products} setProducts={setProducts} categories={categories}
                activeCategory={activeCategory} effectiveRate={effectiveRate}
                triggerHaptic={triggerHaptic} showToast={showToast} />

            <StockAdjustmentModal isOpen={isStockAdjustOpen} onClose={() => setIsStockAdjustOpen(false)}
                products={products} adjustStock={handleConfirmStock} triggerHaptic={triggerHaptic} />

            <CategoryManagerModal isOpen={isCategoryManagerOpen} onClose={() => setIsCategoryManagerOpen(false)}
                categories={categories} onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory} onEditCategory={handleEditCategory}
                newCategoryIcon={newCategoryIcon} setNewCategoryIcon={setNewCategoryIcon}
                newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} />

            <ConfirmModal isOpen={!!deleteCategoryConfirmId} onClose={() => setDeleteCategoryConfirmId(null)}
                onConfirm={confirmDeleteCategory} title="Eliminar categoría"
                message="¿Seguro que deseas borrar esta categoría? Los productos no se eliminarán, pero quedarán sin categoría asignada."
                confirmText="Sí, eliminar" variant="warning" />

            <ConfirmModal isOpen={isDeleteSelectedModalOpen} onClose={() => setIsDeleteSelectedModalOpen(false)}
                onConfirm={confirmDeleteSelected} title="Eliminar productos seleccionados"
                message={`¿Estás seguro que deseas eliminar los ${selectedIds.size} productos seleccionados? Esta acción no se puede deshacer.`}
                confirmText="Sí, eliminar seleccionados" variant="danger" />
        </div>
    );
};

export default ProductsView;
