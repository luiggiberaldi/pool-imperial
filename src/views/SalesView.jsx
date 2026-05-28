import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { FinancialEngine } from '../core/FinancialEngine';
import { storageService } from '../utils/storageService';
import { useSounds } from '../hooks/useSounds';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { calculateFullTableBreakdown } from '../utils/tableBillingEngine';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useNotifications } from '../hooks/useNotifications';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { showToast } from '../components/Toast';
import { ShoppingCart, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useProductContext } from '../context/ProductContext';

// Components
import SalesHeader from '../components/Sales/SalesHeader';
import SearchBar from '../components/Sales/SearchBar';
import CategoryBar from '../components/Sales/CategoryBar';
import CartPanel from '../components/Sales/CartPanel';
import ReceiptModal from '../components/Sales/ReceiptModal';
import CheckoutModal from '../components/Sales/CheckoutModal';
import CustomAmountModal from '../components/Sales/CustomAmountModal';
import KeyboardHelpModal from '../components/Sales/KeyboardHelpModal';
import DiscountModal from '../components/Sales/DiscountModal';
import CajaCerradaOverlay from '../components/Sales/CajaCerradaOverlay';
import { buildReceiptWhatsAppUrl } from '../components/Sales/ReceiptShareHelper';
import ConfirmModal from '../components/ConfirmModal';
import Confetti from '../components/Confetti';
import { useSalesKeyboard } from '../hooks/useSalesKeyboard';
import { TableQueuePanel } from '../components/tables/TableQueuePanel';
import TableBillModal from '../components/tables/TableBillModal';
import { useCashStore } from '../hooks/store/cashStore';
import { useAuthStore } from '../hooks/store/authStore';

// Extracted hooks
import { useSalesData } from '../hooks/useSalesData';
import { useSalesCheckout } from '../hooks/useSalesCheckout';

export default function SalesView({ rates: _rates, triggerHaptic, onNavigate, isActive }) {
    const { playAdd, playRemove, playCheckout, playError } = useSounds();
    const { notifyLowStock } = useNotifications();

    const { products, setProductsSilent, setProductsAfterCheckout, isLoadingProducts, useAutoRate, setUseAutoRate, customRate, setCustomRate, effectiveRate, copEnabled, tasaCop } = useProductContext();
    const { activeCashSession } = useCashStore();
    const { role: userRole } = useAuthStore();
    const maxDiscountPercent = parseInt(localStorage.getItem('max_discount_cajero') ?? '100') || 100;
    const { cart, setCart, cartRef, pendingNavigate, setPendingNavigate, discount, setDiscount } = useCart();

    // ── UI State ──
    const [showConfetti, setShowConfetti] = useState(false);
    const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
    const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showReceipt, setShowReceipt] = useState(null);
    const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
    const [showRateConfig, setShowRateConfig] = useState(false);

    // ── Search ──
    const searchInputRef = useRef(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState('todos');
    const [cartSelectedIndex, setCartSelectedIndex] = useState(-1);

    // ── Modals ──
    const [hierarchyPending, setHierarchyPending] = useState(null);
    const [weightPending, setWeightPending] = useState(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [tableCheckoutData, setTableCheckoutData] = useState(null);
    const [showTablePayment, setShowTablePayment] = useState(false);
    const [postPaymentSession, setPostPaymentSession] = useState(null); // { sessionId, tableName } — shown after payment

    // ── Data hook ──
    const { customers, setCustomers, paymentMethods, salesData, setSalesData, isLoadingLocal, buildCurrentFloat } = useSalesData({
        isActive, setProductsSilent, cart, cartRef, setCart
    });
    const isLoading = isLoadingProducts || isLoadingLocal;
    const currentFloat = useMemo(() => buildCurrentFloat(salesData), [salesData, buildCurrentFloat]);

    // ── Cart totals ──
    const { subtotalUsd: cartSubtotalUsd, discountAmountUsd, totalUsd: cartTotalUsd } = useMemo(() =>
        FinancialEngine.buildCartTotals(cart, discount, 1, 1),
        [cart, discount]);

    const discountData = { active: discount?.value > 0, amountUsd: discountAmountUsd, amountBs: 0, type: discount?.type, value: discount?.value };
    const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

    // ── Checkout hook ──
    const { handleCheckoutWithCustomer, handleTableCheckout, handleCreateCustomer, handleAddCustomAmount } = useSalesCheckout({
        cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd,
        effectiveRate, tasaCop, copEnabled, discountData, useAutoRate,
        customers, setCustomers, products,
        setProductsAfterCheckout, setSalesData,
        setCart, setShowCheckout, setShowReceipt, setSelectedCustomerId, setCartSelectedIndex,
        setShowConfetti, tableCheckoutData, setTableCheckoutData,
        playCheckout, playError, triggerHaptic, notifyLowStock,
    });

    const handleSetSearchTerm = (text) => { setSearchTerm(text); setSelectedIndex(0); };

    // ── Voice Search ──
    const { isRecording, isProcessingAudio, startRecording, stopRecording } = useVoiceSearch({
        onResult: (text) => {
            if (!text) return;
            const normalizedTerm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const bestMatches = products.filter(p => p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalizedTerm));
            if (bestMatches.length > 0) { addToCart(bestMatches[0]); handleSetSearchTerm(''); }
            else { playError(); showToast(`No encontré ningún producto parecido a "${text}"`, 'warning'); handleSetSearchTerm(text); searchInputRef.current?.focus(); }
        },
        triggerHaptic,
    });

    // ── Barcode Scanner ──
    const scanProduct = (barcode) => {
        if (showCheckout || showReceipt || showClearCartConfirm) return;
        if (barcode.startsWith('21') && barcode.length >= 13) {
            const pluCode = parseInt(barcode.substring(2, 7), 10).toString();
            const weightKg = parseInt(barcode.substring(7, 12), 10) / 1000;
            const p = products.find(p => p.id === pluCode || p.barcode?.includes(pluCode) || p.barcode?.includes(barcode.substring(0, 7)));
            if (p) { addToCart({ ...p, isWeight: true }, weightKg); return; }
        }
        const product = products.find(p => p.barcode === barcode || p.id === barcode);
        if (product) addToCart(product);
        else { playError(); showToast(`Producto no encontrado (${barcode})`, 'warning'); }
    };
    useBarcodeScanner({ onScan: scanProduct, enabled: !isLoading && isActive && !!activeCashSession });

    const handlePasteBarcode = (pastedText) => {
        if (showCheckout || showReceipt || showClearCartConfirm) return;
        if (pastedText.startsWith('21') && pastedText.length >= 13) {
            const pluCode = parseInt(pastedText.substring(2, 7), 10).toString();
            const weightKg = parseInt(pastedText.substring(7, 12), 10) / 1000;
            const p = products.find(p => p.id === pluCode || p.barcode?.includes(pluCode) || p.barcode?.includes(pastedText.substring(0, 7)));
            if (p) { addToCart({ ...p, isWeight: true }, weightKg); setTimeout(() => setSearchTerm(''), 10); return; }
        }
        const product = products.find(p => p.barcode === pastedText || p.id === pastedText);
        if (product) { addToCart(product); setTimeout(() => setSearchTerm(''), 10); }
    };

    // ── Derived ──
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const searchResults = useMemo(() => {
        if (deferredSearchTerm.length < 1) return [];
        const normalizedTerm = deferredSearchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return products.filter(p => p.barcode?.includes(deferredSearchTerm) || p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalizedTerm)).slice(0, 6);
    }, [deferredSearchTerm, products]);

    const filteredByCategory = useMemo(() => selectedCategory === 'todos' ? products : products.filter(p => p.category === selectedCategory), [selectedCategory, products]);

    // ── Effects ──
    useEffect(() => { if (cart.length > 0) setCartSelectedIndex(prev => prev !== -1 ? Math.min(prev, cart.length - 1) : prev); else setCartSelectedIndex(-1); }, [cart.length]);
    useEffect(() => { if (pendingNavigate && cart.length > 0 && isActive) setPendingNavigate(null); }, [pendingNavigate, cart, isActive, setPendingNavigate]);
    useEffect(() => { if (!isLoading && searchInputRef.current) searchInputRef.current.focus(); }, [isLoading]);
    useEffect(() => { if (!showCheckout && !showReceipt && searchInputRef.current) searchInputRef.current.focus(); }, [showCheckout, showReceipt]);

    // Persist cart
    const isCartInitialized = useRef(false);
    useEffect(() => {
        if (!isCartInitialized.current) { isCartInitialized.current = true; return; }
        const timer = setTimeout(() => {
            if (cart.length > 0) storageService.setItem('bodega_pending_cart_v1', cart);
            else storageService.removeItem('bodega_pending_cart_v1');
        }, 1000);
        return () => clearTimeout(timer);
    }, [cart]);

    // F9/Escape shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'F9') { e.preventDefault(); if (cart.length > 0 && !showCheckout && !showReceipt) setShowCheckout(true); }
            if (e.key === 'Escape') {
                if (showCheckout) { setShowCheckout(false); setSelectedCustomerId(''); }
                if (showReceipt) { setShowReceipt(null); setSelectedCustomerId(''); }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [cart, showCheckout, showReceipt]);

    // ── Cart Handlers ──
    const addToCart = useCallback((product, qtyOverride = null, forceMode = null) => {
        triggerHaptic && triggerHaptic();
        if (!product.priceUsdt || isNaN(product.priceUsdt) || product.priceUsdt <= 0) { playError(); showToast('Este producto no tiene precio válido. Edítalo primero.', 'warning'); return; }
        const allowNegativeStock = localStorage.getItem('allow_negative_stock') === 'true';
        let currentStock = parseFloat(product.stock) || 0;
        if (product.isCombo) {
            const comboIngredients = product.comboItems?.length > 0
                ? product.comboItems.map(ci => ({ product: products.find(lp => lp.id === ci.productId), qty: ci.qty }))
                : product.linkedProductId
                    ? [{ product: products.find(lp => lp.id === product.linkedProductId), qty: product.linkedQty || 1 }]
                    : [];
            if (comboIngredients.length > 0 && comboIngredients.every(i => i.product && i.qty > 0))
                currentStock = Math.min(...comboIngredients.map(i => Math.floor((i.product.stock ?? 0) / i.qty)));
        }
        if (!allowNegativeStock && currentStock <= 0) { playError(); showToast(`${product.name}: sin stock`, 'warning'); return; }
        playAdd();
        if (product.sellByUnit && product.unitPriceUsd && !forceMode && !qtyOverride) { setHierarchyPending(product); return; }
        if ((product.unit === 'kg' || product.unit === 'litro') && !qtyOverride) { setWeightPending(product); return; }

        let priceToUse = parseFloat(product.priceUsdt) || 0;
        let cartId = product.id;
        let cartName = product.name;
        let qtyToAdd = qtyOverride || 1;

        if (forceMode === 'unit') { priceToUse = product.unitPriceUsd; cartId = product.id + '_unit'; cartName = product.name + ' (Ud.)'; }

        if (!allowNegativeStock) {
            const currentCart = cartRef.current;
            const existingInCart = currentCart.find(i => i.id === cartId && i.priceUsd === priceToUse);
            const addingQty = existingInCart ? (qtyOverride || 1) : qtyToAdd;
            const existingQtyForThis = existingInCart ? existingInCart.qty : 0;
            const newQty = existingQtyForThis + addingQty;
            const stockNeeded = forceMode === 'unit' ? newQty / (product.unitsPerPackage || 1) : newQty;
            const otherCartItems = currentCart.filter(i => (i._originalId || i.id) === product.id && i.id !== cartId);
            const otherStockUsed = otherCartItems.reduce((sum, item) => item._mode === 'unit' ? sum + (item.qty / (item._unitsPerPackage || 1)) : sum + item.qty, 0);
            if (stockNeeded + otherStockUsed > currentStock) { playError(); showToast(`${product.name}: stock maximo alcanzado`, 'warning'); return; }
        }

        if (allowNegativeStock && currentStock > 0) {
            const currentCart = cartRef.current;
            const existingInCart = currentCart.find(i => i.id === cartId && i.priceUsd === priceToUse);
            const existingQtyForThis = existingInCart ? existingInCart.qty : 0;
            const newQty = existingQtyForThis + (qtyOverride || 1);
            const stockNeeded = forceMode === 'unit' ? newQty / (product.unitsPerPackage || 1) : newQty;
            const otherCartItems = currentCart.filter(i => (i._originalId || i.id) === product.id && i.id !== cartId);
            const otherStockUsed = otherCartItems.reduce((sum, item) => item._mode === 'unit' ? sum + (item.qty / (item._unitsPerPackage || 1)) : sum + item.qty, 0);
            if (stockNeeded + otherStockUsed > currentStock) showToast(`${product.name}: stock agotado, vendiendo sin inventario`, 'info');
        }

        setCart(prev => {
            const existing = prev.find(i => i.id === cartId && i.priceUsd === priceToUse);
            if (existing && !qtyOverride) return prev.map(i => i.id === cartId ? { ...i, qty: i.qty + 1 } : i);
            if (existing && qtyOverride) return prev.map(i => i.id === cartId ? { ...i, qty: i.qty + qtyOverride } : i);
            const itemCostBs = product.costBs || (product.costUsd ? product.costUsd * effectiveRate : 0);
            return [{
                ...product, id: cartId, name: cartName, priceUsd: priceToUse, exactBs: product.exactBs || (product.isCombo && product.priceBs ? product.priceBs : null),
                costBs: forceMode === 'unit' ? itemCostBs / (product.unitsPerPackage || 1) : itemCostBs,
                costUsd: forceMode === 'unit' ? (product.costUsd || 0) / (product.unitsPerPackage || 1) : (product.costUsd || 0),
                qty: qtyToAdd, isWeight: !!qtyOverride,
                _originalId: product.id, _mode: forceMode || 'package', _unitsPerPackage: product.unitsPerPackage || 1,
            }, ...prev];
        });
        handleSetSearchTerm('');
        setHierarchyPending(null);
        setTimeout(() => { searchInputRef.current?.blur(); setCartSelectedIndex(0); }, 50);
    }, [triggerHaptic, effectiveRate, playAdd, playError, cartRef, setCart]);

    const updateQty = (id, delta) => {
        triggerHaptic && triggerHaptic();
        if (delta < 0) playRemove();
        const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
        if (!allowNeg && delta > 0) {
            const currentCart = cartRef.current;
            const cartItem = currentCart.find(i => i.id === id);
            if (cartItem) {
                const originalId = cartItem._originalId || cartItem.id;
                const productData = products.find(p => p.id === originalId);
                if (productData) {
                    const availableStock = parseFloat(productData.stock) || 0;
                    const newQty = Math.round((cartItem.qty + delta) * 1000) / 1000;
                    const totalUsed = currentCart.reduce((sum, item) => {
                        if ((item._originalId || item.id) !== originalId) return sum;
                        if (item.id === id) return sum;
                        return item._mode === 'unit' ? sum + (item.qty / (item._unitsPerPackage || 1)) : sum + item.qty;
                    }, 0);
                    const thisItemStock = cartItem._mode === 'unit' ? newQty / (cartItem._unitsPerPackage || 1) : newQty;
                    if (totalUsed + thisItemStock > availableStock) { playError(); showToast(`${cartItem.name}: stock maximo alcanzado`, 'warning'); return; }
                }
            }
        }
        setCart(prev => prev.map(i => { if (i.id !== id) return i; let newQty = Math.round((i.qty + delta) * 1000) / 1000; if (newQty < 0) newQty = 0; return newQty === 0 ? null : { ...i, qty: newQty }; }).filter(Boolean));
    };

    const removeFromCart = (id) => { triggerHaptic && triggerHaptic(); playRemove(); setCart(prev => prev.filter(i => i.id !== id)); };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => Math.max(prev - 1, 0)); }
        else if (e.key === 'ArrowRight') { if (cart.length > 0) { e.preventDefault(); searchInputRef.current?.blur(); } }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchTerm.startsWith('21') && searchTerm.length >= 13) {
                const pluCode = parseInt(searchTerm.substring(2, 7), 10).toString();
                const weightKg = parseInt(searchTerm.substring(7, 12), 10) / 1000;
                const p = products.find(p => p.id === pluCode || p.barcode?.includes(pluCode));
                if (p) { addToCart({ ...p, isWeight: true }, weightKg); handleSetSearchTerm(''); return; }
            }
            if (searchResults[selectedIndex]) addToCart(searchResults[selectedIndex]);
            else if (searchResults.length === 1) addToCart(searchResults[0]);
            else if (searchTerm.length >= 3 && searchResults.length === 0) {
                const exactMatch = products.find(p => p.barcode === searchTerm);
                if (exactMatch) addToCart(exactMatch);
            }
        }
    };

    useSalesKeyboard({
        todayAperturaData: activeCashSession, showCheckout, showReceipt, hierarchyPending, weightPending,
        showClearCartConfirm, showCustomAmountModal, showRateConfig, showKeyboardHelp,
        showDiscountModal, searchInputRef, setCartSelectedIndex, setShowClearCartConfirm,
        cartRef, setShowCheckout, cartSelectedIndex, updateQty, removeFromCart
    });

    if (isLoading) {
        return <div className="flex-1 flex flex-col items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-emerald-500 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col dark:bg-slate-950 p-2 sm:p-4 sm:pb-4 overflow-hidden relative">

            <SalesHeader effectiveRate={effectiveRate} useAutoRate={useAutoRate} setUseAutoRate={setUseAutoRate}
                customRate={customRate} setCustomRate={setCustomRate}
                showRateConfig={showRateConfig} setShowRateConfig={setShowRateConfig}
                setShowKeyboardHelp={setShowKeyboardHelp} triggerHaptic={triggerHaptic} />

            <TableQueuePanel onCheckoutTable={setTableCheckoutData} effectiveRate={effectiveRate} />

            {!activeCashSession ? (
                <CajaCerradaOverlay cartCount={cart.length} onOpenApertura={() => onNavigate && onNavigate('inicio')} />
            ) : (
                <>
                    <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-4">
                        <div className="flex-1 min-h-0 flex flex-col lg:min-w-0 overflow-y-auto lg:overflow-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <div className="shrink-0 mb-3 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border border-slate-100 dark:border-slate-800">
                                <SearchBar ref={searchInputRef} searchTerm={searchTerm} onSearchChange={handleSetSearchTerm}
                                    onKeyDown={handleSearchKeyDown} onPasteBarcode={handlePasteBarcode}
                                    searchResults={searchResults} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex}
                                    effectiveRate={effectiveRate} addToCart={addToCart} allProducts={products}
                                    isRecording={isRecording} isProcessingAudio={isProcessingAudio} startRecording={startRecording} stopRecording={stopRecording}
                                    hierarchyPending={hierarchyPending} setHierarchyPending={setHierarchyPending}
                                    weightPending={weightPending} setWeightPending={setWeightPending} />
                            </div>
                            {!showCheckout && !showReceipt && (
                                <CategoryBar selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
                                    filteredByCategory={filteredByCategory} addToCart={addToCart}
                                    triggerHaptic={triggerHaptic} searchTerm={searchTerm}
                                    onOpenCustomAmount={() => setShowCustomAmountModal(true)} products={products} />
                            )}
                        </div>

                        <div className="hidden lg:flex lg:w-[380px] lg:shrink-0 lg:flex-col">
                            <CartPanel cart={cart} effectiveRate={1}
                                cartSubtotalUsd={cartSubtotalUsd}
                                cartTotalUsd={cartTotalUsd} cartItemCount={cartItemCount}
                                discountData={discountData} onOpenDiscount={() => setShowDiscountModal(true)}
                                updateQty={updateQty} removeFromCart={removeFromCart}
                                onCheckout={() => { triggerHaptic && triggerHaptic(); setShowCheckout(true); }}
                                onClearCart={() => { triggerHaptic && triggerHaptic(); setShowClearCartConfirm(true); }}
                                triggerHaptic={triggerHaptic} cartSelectedIndex={cartSelectedIndex} />
                        </div>
                    </div>

                    {/* Mobile Cart FAB & Sheet */}
                    <div className="lg:hidden">
                        {cart.length > 0 && !isCartSheetOpen && !showCheckout && !showReceipt && (
                            <button onClick={() => { triggerHaptic && triggerHaptic(); setIsCartSheetOpen(true); }}
                                className="fixed bottom-[max(5rem,env(safe-area-inset-bottom)+4.5rem)] left-4 right-4 bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center justify-between z-40 active:scale-95 transition-all animate-in slide-in-from-bottom">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/20 p-2 rounded-xl"><ShoppingCart size={20} /></div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Ver Cesta</div>
                                        <div className="font-black leading-none">{cartItemCount} artículo{cartItemCount !== 1 && 's'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black leading-none">
                                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cartTotalUsd)}
                                    </div>
                                </div>
                            </button>
                        )}
                        {isCartSheetOpen && !showCheckout && !showReceipt && (
                            <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 pb-[max(0px,env(safe-area-inset-bottom))]"
                                onClick={() => setIsCartSheetOpen(false)}>
                                <div className="bg-slate-50 dark:bg-slate-950 w-full rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
                                    <div className="shrink-0 flex justify-center pt-3 pb-2" onClick={() => setIsCartSheetOpen(false)}>
                                        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full cursor-pointer" />
                                    </div>
                                    <div className="shrink-0 px-4 pb-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                                        <h3 className="font-black text-slate-800 dark:text-white text-lg flex items-center gap-2"><ShoppingCart size={20} className="text-emerald-500" /> Cesta Actual</h3>
                                        <button onClick={() => setIsCartSheetOpen(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><X size={20} /></button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        <CartPanel cart={cart} effectiveRate={1}
                                            cartSubtotalUsd={cartSubtotalUsd}
                                            cartTotalUsd={cartTotalUsd} cartItemCount={cartItemCount}
                                            discountData={discountData} onOpenDiscount={() => { setIsCartSheetOpen(false); setShowDiscountModal('sheet'); }}
                                            updateQty={updateQty} removeFromCart={removeFromCart}
                                            onCheckout={() => { triggerHaptic && triggerHaptic(); setShowCheckout(true); setIsCartSheetOpen(false); }}
                                            onClearCart={() => { triggerHaptic && triggerHaptic(); setShowClearCartConfirm(true); }}
                                            triggerHaptic={triggerHaptic} cartSelectedIndex={cartSelectedIndex} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {showCheckout && (
                <CheckoutModal onClose={() => { setShowCheckout(false); setSelectedCustomerId(''); }}
                    cartSubtotalUsd={cartSubtotalUsd}
                    cartTotalUsd={cartTotalUsd}
                    discountData={discountData} effectiveRate={1}
                    customers={customers} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId}
                    paymentMethods={paymentMethods}
                    onConfirmSale={(payments, change, splitMeta) => handleCheckoutWithCustomer(payments, change, selectedCustomerId, splitMeta)}
                    onCreateCustomer={handleCreateCustomer}
                    triggerHaptic={triggerHaptic}
                    currentFloatUsd={currentFloat.usd} />
            )}

            <ReceiptModal receipt={showReceipt} onClose={() => { setShowReceipt(null); setSelectedCustomerId(''); }}
                onShareWhatsApp={(r) => { window.open(buildReceiptWhatsAppUrl(r, effectiveRate), '_blank'); }}
                currentRate={effectiveRate} />

            {showCustomAmountModal && (
                <CustomAmountModal onClose={() => setShowCustomAmountModal(false)}
                    onConfirm={(amount, currency) => handleAddCustomAmount(amount, currency, addToCart, setShowCustomAmountModal)}
                    effectiveRate={effectiveRate} triggerHaptic={triggerHaptic} />
            )}

            <ConfirmModal isOpen={showClearCartConfirm} onClose={() => setShowClearCartConfirm(false)}
                onConfirm={() => { setCart([]); setDiscount({ type: 'percentage', value: 0 }); setShowClearCartConfirm(false); setCartSelectedIndex(-1); }}
                title="¿Vaciar toda la cesta?" message="Todos los productos serán eliminados de la cesta actual. Esta acción no se puede deshacer."
                confirmText="Sí, vaciar" variant="cart" />

            {showDiscountModal && (
                <DiscountModal currentDiscount={discount}
                    onApply={(newDiscount) => { setDiscount(newDiscount); setShowDiscountModal(false); if (showDiscountModal === 'sheet') setIsCartSheetOpen(true); }}
                    onClose={() => { setShowDiscountModal(false); if (showDiscountModal === 'sheet') setIsCartSheetOpen(true); }}
                    cartSubtotalUsd={cartSubtotalUsd} effectiveRate={effectiveRate} tasaCop={tasaCop} copEnabled={copEnabled}
                    userRole={userRole || 'ADMIN'} maxDiscountPercent={maxDiscountPercent} />
            )}

            {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
            <KeyboardHelpModal isOpen={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />

            {tableCheckoutData && !showTablePayment && (
                <TableBillModal data={tableCheckoutData} onClose={() => { setTableCheckoutData(null); }}
                    onProceedToPayment={(disc, itemDiscs, seatId, seatTotal) => {
                        // Calculate discount amounts and attach to checkout data
                        const _itemDiscs = itemDiscs || {};
                        const _itemDiscAmt = (tableCheckoutData.currentItems || []).reduce((acc, item) => {
                            const d = _itemDiscs[item.id];
                            if (!d || d.value <= 0) return acc;
                            const lt = Number(item.unit_price_usd) * Number(item.qty);
                            return acc + (d.type === 'percentage' ? lt * (d.value / 100) : Math.min(d.value * Number(item.qty), lt));
                        }, 0);

                        // If per-seat, use seatTotal (already includes shared division) or recalculate
                        let baseTotal = tableCheckoutData.grandTotal;
                        let seatDisplayInfo = null;
                        if (seatId) {
                            const seats = tableCheckoutData.session?.seats || [];
                            const config = useTablesStore.getState().config;
                            const { paidHoursOffsets, paidRoundsOffsets } = useTablesStore.getState();
                            const _ho = (paidHoursOffsets || {})[tableCheckoutData.session?.id] || 0;
                            const _ro = (paidRoundsOffsets || {})[tableCheckoutData.session?.id] || 0;
                            const fb = calculateFullTableBreakdown(tableCheckoutData.session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, tableCheckoutData.frozenDivisor || null, tableCheckoutData.table?.type === 'NORMAL', _ho, _ro);
                            const seatBd = fb?.seats.find(s => s.seat.id === seatId);
                            if (seatBd) {
                                baseTotal = seatTotal != null ? seatTotal : seatBd.subtotal;
                                seatDisplayInfo = {
                                    timeCost: seatBd.timeCost,
                                    items: seatBd.items,
                                    sharedPortion: seatBd.sharedPortion,
                                    sharedItems: fb.sharedItems,
                                    sharedTimeTotal: fb.sharedTimeTotal,
                                    divisor: fb.seats.filter(s => !s.seat.paid).length,
                                };
                            } else if (seatTotal != null) {
                                baseTotal = seatTotal;
                            }
                        } else {
                            // "Cobrar Todo" con cuantas divididas: usar grandTotal del seat breakdown (solo asientos no pagados)
                            const seats = tableCheckoutData.session?.seats || [];
                            if (seats.length > 0) {
                                const config = useTablesStore.getState().config;
                                const { paidHoursOffsets, paidRoundsOffsets } = useTablesStore.getState();
                                const _ho = (paidHoursOffsets || {})[tableCheckoutData.session?.id] || 0;
                                const _ro = (paidRoundsOffsets || {})[tableCheckoutData.session?.id] || 0;
                                const fb = calculateFullTableBreakdown(tableCheckoutData.session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, tableCheckoutData.frozenDivisor || null, tableCheckoutData.table?.type === 'NORMAL', _ho, _ro);
                                if (fb && fb.grandTotal > 0) baseTotal = fb.grandTotal;
                            }
                        }

                        const _sub = baseTotal - _itemDiscAmt;
                        const _totalDisc = disc && disc.value > 0 ? (disc.type === 'percentage' ? _sub * (disc.value / 100) : Math.min(disc.value, _sub)) : 0;
                        const totalDiscAmt = _totalDisc + _itemDiscAmt;
                        setTableCheckoutData(prev => ({
                            ...prev,
                            discountData: { active: totalDiscAmt > 0, amountUsd: totalDiscAmt, amountBs: 0, type: disc?.type || 'percentage', value: disc?.value || 0 },
                            grandTotal: baseTotal - totalDiscAmt,
                            ...(seatId ? { seatId } : {}),
                            ...(seatDisplayInfo ? { seatDisplayInfo } : { seatDisplayInfo: null }),
                        }));
                        setShowTablePayment(true);
                        // Si el seat tiene customerId, pre-seleccionarlo en el checkout
                        const seatCustomer = seatId ? tableCheckoutData.session?.seats?.find(s => s.id === seatId)?.customerId : null;
                        if (seatCustomer) setSelectedCustomerId(seatCustomer);
                        else if (tableCheckoutData?.session?.client_id) setSelectedCustomerId(tableCheckoutData.session.client_id);
                    }} />
            )}

            {tableCheckoutData && showTablePayment && (() => {
                const discData = tableCheckoutData.discountData || { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 };
                const finalTotal = tableCheckoutData.grandTotal;
                return (
                <CheckoutModal onClose={() => { setTableCheckoutData(null); setShowTablePayment(false); setSelectedCustomerId(''); }}
                    cartSubtotalUsd={finalTotal}
                    cartTotalUsd={finalTotal}
                    discountData={discData} effectiveRate={1}
                    customers={customers} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId}
                    paymentMethods={paymentMethods}
                    onConfirmSale={(payments, change, splitMeta) => {
                        const sessionId = tableCheckoutData.session?.id;
                        const tableName = tableCheckoutData.table?.name || 'Mesa';
                        const isSeatPayment = !!tableCheckoutData.seatId;
                        handleTableCheckout(payments, change, selectedCustomerId, null, splitMeta).then((res) => {
                            if (res && res.success === false) return; // checkout failed — don't show success dialog
                            setShowTablePayment(false);
                            // Solo mostrar diálogo liberar/mantener cuando es cobro completo o todos los asientos pagados
                            // Para pagos per-seat parciales, el bill modal se reabre automáticamente via setTableCheckoutData refresh
                            if (!isSeatPayment) {
                                setPostPaymentSession({ sessionId, tableName });
                            } else {
                                // Verificar si todos quedaron pagados (allPaid triggers postPayment from useSalesCheckout)
                                const updatedSeats = tableCheckoutData.session?.seats || [];
                                const allPaid = updatedSeats.every(s => s.paid || s.id === tableCheckoutData.seatId);
                                if (allPaid) {
                                    setPostPaymentSession({ sessionId, tableName });
                                }
                            }
                        });
                    }}
                    onCreateCustomer={handleCreateCustomer} triggerHaptic={triggerHaptic}
                    currentFloatUsd={currentFloat.usd} tableContext={tableCheckoutData} />
                );
            })()}

            {/* Post-payment dialog: ¿Liberar mesa o dejar activa? */}
            {postPaymentSession && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={e => e.stopPropagation()}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full animate-in fade-in zoom-in-95">
                        <div className="text-center mb-5">
                            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                                <span className="text-2xl">✓</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">Cobro Exitoso</h3>
                            <p className="text-sm text-slate-500 mt-1">¿Qué deseas hacer con <strong>{postPaymentSession.tableName}</strong>?</p>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={async () => {
                                    try {
                                        await useTablesStore.getState().closeSession(postPaymentSession.sessionId);
                                    } catch { showToast("Error al liberar mesa", "warning"); }
                                    setPostPaymentSession(null);
                                    setTableCheckoutData(null);
                                }}
                                className="w-full py-3.5 rounded-xl font-black text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                            >
                                Liberar Mesa
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await useTablesStore.getState().resetSessionAfterPayment(postPaymentSession.sessionId);
                                        await useOrdersStore.getState().cancelOrderBySessionId(postPaymentSession.sessionId);
                                    } catch { showToast("Error al resetear mesa", "warning"); }
                                    setPostPaymentSession(null);
                                    setTableCheckoutData(null);
                                }}
                                className="w-full py-3.5 rounded-xl font-black text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border-2 border-violet-200 dark:border-violet-700/50 hover:bg-violet-100 dark:hover:bg-violet-900/50 active:scale-95 transition-all"
                            >
                                Dejar Activa
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
