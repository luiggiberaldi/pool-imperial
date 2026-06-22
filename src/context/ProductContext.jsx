import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { logEvent } from '../services/auditService';
import { BODEGA_CATEGORIES } from '../config/categories';
import { supabaseCloud } from '../config/supabaseCloud';
import { fetchCloudProducts } from '../hooks/useCloudSync';
import { useAuthStore } from '../hooks/store/authStore';
import { initialProducts } from '../config/initialProducts';

const ProductContext = createContext();

// ID único por pestaña para evitar procesar mensajes propios
const DEVICE_ID = crypto.randomUUID();

export function ProductProvider({ children, rates }) {
    const [products, _setProducts] = useState([]);
    const [categories, _setCategories] = useState(BODEGA_CATEGORIES);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [isSyncReady, setIsSyncReady] = useState(false);
    const userId = useAuthStore(s => s.cloudSession?.user?.id);

    // Guard ref: prevents app_storage_update loop when user edits locally
    const savingRef = useRef(false);

    // Custom setters to forcefully save user-initiated changes but skip cloud pulls
    const setProducts = (action_or_val) => {
        savingRef.current = true;
        if (typeof action_or_val === 'function') {
            _setProducts(prev => {
                const next = action_or_val(prev);
                storageService.setItem('bodega_products_v1', next).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
                return next;
            });
        } else {
            _setProducts(action_or_val);
            storageService.setItem('bodega_products_v1', action_or_val).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
        }
    };

    const setCategories = (action_or_val) => {
        savingRef.current = true;
        if (typeof action_or_val === 'function') {
            _setCategories(prev => {
                const next = action_or_val(prev);
                storageService.setItem('poolbar_categories_v1', next).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
                return next;
            });
        } else {
            _setCategories(action_or_val);
            storageService.setItem('poolbar_categories_v1', action_or_val).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
        }
    };

    // MARKET LOGIC - Street Rate
    const [streetRate, setStreetRate] = useState(() => {
        const saved = localStorage.getItem('street_rate_bs');
        return saved ? parseFloat(saved) : 0;
    });

    // GLOBAL RATE LOGIC (Sync with SalesView)
    const [useAutoRate, setUseAutoRate] = useState(() => {
        const saved = localStorage.getItem('bodega_use_auto_rate');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [customRate, setCustomRate] = useState(() => {
        const saved = localStorage.getItem('bodega_custom_rate');
        return saved && parseFloat(saved) > 0 ? saved : '';
    });

    // AUTO COP LOGIC
    const [copEnabled, setCopEnabled] = useState(() => {
        return localStorage.getItem('cop_enabled') !== 'false';
    });
    const [autoCopEnabled, setAutoCopEnabled] = useState(() => {
        return localStorage.getItem('auto_cop_enabled') === 'true';
    });
    const [tasaCopManual, setTasaCopManual] = useState(() => {
        return localStorage.getItem('tasa_cop') || '';
    });

    // ── Sincronización de productos entre dispositivos via Supabase Broadcast ──
    // Broadcast = 0 egress. Solo envía el delta (productos que cambiaron).
    const productChannelRef = useRef(null);

    useEffect(() => {
        if (!userId) return;
        const ch = supabaseCloud.channel(`product_sync_v1:${userId}`);
        ch.on('broadcast', { event: 'product_delta' }, ({ payload }) => {
            if (!payload || payload.senderId === DEVICE_ID) return;

            if (payload.type === 'stock_update' && payload.changes) {
                console.log(`[ProductSync] Stock actualizado desde otro dispositivo (${payload.changes.length} productos)`);
                _setProducts(prev => {
                    const map = new Map(payload.changes.map(c => [c.id, c.stock]));
                    const next = prev.map(p => map.has(p.id) ? { ...p, stock: map.get(p.id) } : p);
                    storageService.setItemSilent('bodega_products_v1', next);
                    return next;
                });
            } else if (payload.type === 'product_update' && payload.product) {
                console.log(`[ProductSync] Producto "${payload.product.name}" actualizado desde otro dispositivo`);
                _setProducts(prev => {
                    const next = prev.map(p => p.id === payload.product.id ? { ...p, ...payload.product } : p);
                    storageService.setItemSilent('bodega_products_v1', next);
                    return next;
                });
            } else if (payload.type === 'product_added' && payload.product) {
                console.log(`[ProductSync] Nuevo producto "${payload.product.name}" desde otro dispositivo`);
                _setProducts(prev => {
                    if (prev.some(p => p.id === payload.product.id)) return prev;
                    const next = [payload.product, ...prev];
                    storageService.setItemSilent('bodega_products_v1', next);
                    return next;
                });
            } else if (payload.type === 'full_sync' && payload.products) {
                console.log(`[ProductSync] Sync completo desde otro dispositivo (${payload.products.length} productos)`);
                _setProducts(payload.products);
                storageService.setItemSilent('bodega_products_v1', payload.products);
            }
        });
        ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') console.log('[ProductSync] Canal de sincronización de productos conectado');
        });
        productChannelRef.current = ch;
        return () => { supabaseCloud.removeChannel(ch); };
    }, [userId]);

    const broadcastProductDelta = useCallback((type, data) => {
        if (!productChannelRef.current) return;
        productChannelRef.current.send({
            type: 'broadcast',
            event: 'product_delta',
            payload: { senderId: DEVICE_ID, type, ...data }
        }).catch(() => {});
    }, []);



    const effectiveRate = useAutoRate ? rates.bcv?.price : (parseFloat(customRate) > 0 ? parseFloat(customRate) : rates.bcv?.price);
    
    // Calcula el COP efectivo. rates.autoCopRate es calculado en useRates basado en TRM y la Brecha USDT/BCV.
    const tasaCop = autoCopEnabled && rates.autoCopRate?.price 
        ? rates.autoCopRate.price 
        : (parseFloat(tasaCopManual) > 0 ? parseFloat(tasaCopManual) : 4150);

    // Initial Load — Cloud-First: Supabase es la fuente de verdad
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                // 1. Verificar si hay sesión activa de Supabase
                const { data: { session } } = await supabaseCloud.auth.getSession();

                if (session?.user?.id) {
                    // 2. Intentar cargar de la nube con timeout de 4 segundos
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Cloud timeout')), 4000)
                    );
                    try {
                        const cloudData = await Promise.race([
                            fetchCloudProducts(session.user.id),
                            timeoutPromise
                        ]);

                        if (cloudData && isMounted) {
                            // 3. Nube respondió: usar datos de la nube como fuente de verdad
                            const cloudProducts = cloudData.products || [];
                            const cloudCategories = cloudData.categories || BODEGA_CATEGORIES;

                            // [GUARDIA ANTI-WIPE] Si la nube retorna 0 productos pero localmente sí tenemos productos en caché,
                            // no sobreescribir la memoria local. Conservar local y marcar sincronización de vuelta (autoreparación).
                            const localProducts = await storageService.getItem('bodega_products_v1', []);
                            if (cloudProducts.length === 0 && localProducts.length > 0) {
                                console.warn(`[ProductContext] La nube retornó 0 productos, pero local tiene ${localProducts.length} productos. Conservando caché local para evitar wipes.`);
                                _setProducts(localProducts);
                                _setCategories(cloudCategories);
                                // Sincronizar de vuelta a la nube tras 1.5s para reparar el servidor
                                setTimeout(() => {
                                    setProducts(localProducts);
                                    console.log('[ProductContext] Catálogo local restaurado de vuelta a Supabase con éxito.');
                                }, 1500);
                                if (isMounted) setIsLoadingProducts(false);
                                return;
                            }

                            // [GUARDIA DUAL-EMPTY] Si tanto la nube como el almacenamiento local están en 0 (tablet nueva + nube vacía),
                            // cargar el catálogo semilla de emergencia para mantener el POS operativo.
                            if (cloudProducts.length === 0 && localProducts.length === 0) {
                                console.warn('[ProductContext] Vacío total (nube y local en 0). Cargando catálogo semilla de código.');
                                _setProducts(initialProducts);
                                _setCategories(BODEGA_CATEGORIES);
                                await storageService.setItem('bodega_products_v1', initialProducts);
                                if (isMounted) setIsLoadingProducts(false);
                                return;
                            }

                            _setProducts(cloudProducts);
                            _setCategories(cloudCategories);
                            // Cachear en local para offline (sin triggear push de vuelta)
                            await storageService.setItemSilent('bodega_products_v1', cloudProducts);
                            await storageService.setItemSilent('poolbar_categories_v1', cloudCategories);
                            console.log(`[ProductContext] Cloud-first: ${cloudProducts.length} productos cargados de Supabase`);
                            if (isMounted) setIsLoadingProducts(false);
                            return;
                        }
                    } catch (err) {
                        console.warn('[ProductContext] Cloud no disponible, usando caché local:', err.message);
                    }
                }

                // 4. Fallback: cargar de caché local (sin sesión o sin internet)
                const savedProducts = await storageService.getItem('bodega_products_v1', []);
                const savedCategories = await storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES);
                if (isMounted) {
                    if (savedProducts.length === 0) {
                        console.warn('[ProductContext] Caché local vacío en modo offline. Cargando catálogo semilla de código.');
                        _setProducts(initialProducts);
                        await storageService.setItemSilent('bodega_products_v1', initialProducts);
                    } else {
                        _setProducts(savedProducts);
                    }
                    _setCategories(savedCategories);
                    setIsLoadingProducts(false);
                }
            } catch (err) {
                console.error('[ProductContext] Error en carga inicial:', err);
                // Último recurso: local
                const savedProducts = await storageService.getItem('bodega_products_v1', []);
                const savedCategories = await storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES);
                if (isMounted) {
                    if (savedProducts.length === 0) {
                        _setProducts(initialProducts);
                    } else {
                        _setProducts(savedProducts);
                    }
                    _setCategories(savedCategories);
                    setIsLoadingProducts(false);
                }
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, []);



    // Set Initial Street Rate (from BCV)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (!streetRate && rates.bcv?.price > 0 && !localStorage.getItem('street_rate_bs')) {
            setStreetRate(rates.bcv.price);
        }
    }, [rates.bcv?.price, streetRate]);

    // Auto-save useEffect is REMOVED: Saving is now strictly handled by setProducts explicitly.
    // This entirely removes the Race Condition where boots/reloads overwrite cloud databases.

    useEffect(() => {
        if (streetRate > 0) localStorage.setItem('street_rate_bs', streetRate.toString());
    }, [streetRate]);



    // Listener para actualizar si cambia en otra pestaña/componente
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'bodega_custom_rate') {
                setCustomRate(e.newValue);
            }
            if (e.key === 'bodega_use_auto_rate') {
                setUseAutoRate(!!JSON.parse(e.newValue));
            }
            if (e.key === 'cop_enabled') {
                setCopEnabled(e.newValue === 'true');
            }
            if (e.key === 'auto_cop_enabled') {
                setAutoCopEnabled(e.newValue === 'true');
            }
            if (e.key === 'tasa_cop') {
                setTasaCopManual(e.newValue);
            }
            if (e.key === 'bodega_products_v1') {
                // If modified in another tab, fetch it silently using internal setter
                storageService.getItem('bodega_products_v1', []).then(updatedProducts => _setProducts(updatedProducts));
            }
            if (e.key === 'poolbar_categories_v1') {
                storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES).then(updatedCategories => _setCategories(updatedCategories));
            }
        };

        // Mantener app_storage_update por si algún componente viejo sigue usándolo para sincronizar
        // aunque ahora ProductContext centraliza todo.
        const handleAppStorageUpdate = async (e) => {
            if (savingRef.current) return;

            if (e.detail?.key === 'bodega_products_v1') {
                const updatedProducts = await storageService.getItem('bodega_products_v1', []);
                _setProducts(updatedProducts);
            }
            if (e.detail?.key === 'poolbar_categories_v1') {
                const updatedCategories = await storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES);
                _setCategories(updatedCategories);
            }
        };

        const handleSyncReady = () => {
            console.log("[ProductContext] Detectada sincronización inicial completa.");
            setIsSyncReady(true);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('app_storage_update', handleAppStorageUpdate);
        window.addEventListener('sync_initial_completed', handleSyncReady);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('app_storage_update', handleAppStorageUpdate);
            window.removeEventListener('sync_initial_completed', handleSyncReady);
        };
    }, []);

    // ─── Audit-wrapped setters ─────────────────────────────
    const setCustomRateWithAudit = (val) => {
        const prev = customRate;
        setCustomRate(val);
        if (val) {
            localStorage.setItem('bodega_custom_rate', val.toString());
        } else {
            localStorage.removeItem('bodega_custom_rate');
        }
        if (val && val !== prev) {
            logEvent('CONFIG', 'TASA_MANUAL_CAMBIADA', `Tasa manual cambiada de ${prev || 'vacío'} a ${val}`, null, { prev: prev || null, next: val });
        }
    };

    const setUseAutoRateWithAudit = (val) => {
        const prev = useAutoRate;
        setUseAutoRate(val);
        localStorage.setItem('bodega_use_auto_rate', JSON.stringify(val));
        if (val !== prev) {
            logEvent('CONFIG', 'TASA_AUTO_TOGGLE', `Tasa automática ${val ? 'activada' : 'desactivada'}`, null, { enabled: val });
        }
    };

    const setTasaCopManualWithAudit = (val) => {
        const prev = tasaCopManual;
        setTasaCopManual(val);
        if (val) {
            localStorage.setItem('tasa_cop', val.toString());
        } else {
            localStorage.removeItem('tasa_cop');
        }
        if (val && val !== prev) {
            logEvent('CONFIG', 'TASA_COP_CAMBIADA', `Tasa COP cambiada de ${prev || 'vacío'} a ${val}`, null, { prev: prev || null, next: val });
        }
    };

    const adjustStock = (productId, delta) => {
        const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
        let computedStock;
        setProducts(prevProducts => prevProducts.map(pr => {
            if (pr.id === productId) {
                computedStock = allowNeg ? (pr.stock ?? 0) + delta : Math.max(0, (pr.stock ?? 0) + delta);
                return { ...pr, stock: computedStock };
            }
            return pr;
        }));
        // Broadcast after setProducts schedules the update
        setTimeout(() => {
            if (computedStock !== undefined) {
                broadcastProductDelta('stock_update', { changes: [{ id: productId, stock: computedStock }] });
            }
        }, 0);
    };

    // Actualiza productos después de checkout: guarda local + broadcast instantáneo de stock
    // No hace full cloud push para evitar egress innecesario — el sync_documents
    // se actualiza eventualmente cuando el usuario edita un producto.
    const setProductsAfterCheckout = useCallback((updatedProducts) => {
        _setProducts(updatedProducts);
        storageService.setItem('bodega_products_v1', updatedProducts);
        // Broadcast solo los cambios de stock (delta)
        const changes = [];
        for (const up of updatedProducts) {
            const old = products.find(p => p.id === up.id);
            if (old && old.stock !== up.stock) {
                changes.push({ id: up.id, stock: up.stock });
            }
        }
        if (changes.length > 0) {
            broadcastProductDelta('stock_update', { changes });
        }
    }, [products, broadcastProductDelta]);

    return (
        <ProductContext.Provider value={{
            products,
            setProducts,
            // setProductsSilent: updates UI ONLY, no save to storage/cloud.
            // Use this after receiving data from cloud to avoid re-upload loops.
            setProductsSilent: _setProducts,
            setProductsAfterCheckout,
            broadcastProductDelta,
            categories,
            setCategories,
            isLoadingProducts,
            streetRate,
            setStreetRate,
            useAutoRate,
            setUseAutoRate: setUseAutoRateWithAudit,
            customRate,
            setCustomRate: setCustomRateWithAudit,
            effectiveRate,
            copEnabled,
            setCopEnabled: (val) => { setCopEnabled(val); localStorage.setItem('cop_enabled', String(val)); },
            autoCopEnabled,
            setAutoCopEnabled: (val) => { setAutoCopEnabled(val); localStorage.setItem('auto_cop_enabled', String(val)); },
            tasaCopManual,
            setTasaCopManual: setTasaCopManualWithAudit,
            tasaCop,
            adjustStock
        }}>
            {children}
        </ProductContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProductContext = () => {
    const context = useContext(ProductContext);
    if (!context) {
        throw new Error("useProductContext must be used within a ProductProvider");
    }
    return context;
};
