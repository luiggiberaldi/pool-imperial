import React, { useState, useEffect } from 'react';
import { Package, CreditCard, ShieldCheck, KeyRound, Layers } from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import PaymentMethodsManager from '../PaymentMethodsManager';
import { useTablesStore } from '../../../hooks/store/useTablesStore';

export default function SettingsTabVentas({
    allowNegativeStock, setAllowNegativeStock,
    maxDiscountCajero, setMaxDiscountCajero,
    cajeroAbreCaja, setCajeroAbreCaja,
    cajeroCierraCaja, setCajeroCierraCaja,
    cajeroVeMesas, setCajeroVeMesas,
    forceHeartbeat, showToast, triggerHaptic
}) {
    const { config, updateConfig } = useTablesStore();

    const [taxRateIva, setTaxRateIva] = useState(config?.taxRateIva ?? 19);
    const [taxRateImpoconsumo, setTaxRateImpoconsumo] = useState(config?.taxRateImpoconsumo ?? 8);
    const [isSavingTax, setIsSavingTax] = useState(false);

    // Sync from store when config changes (cross-tab / cloud sync)
    const configTaxRateIva = config?.taxRateIva;
    const configTaxRateImpoconsumo = config?.taxRateImpoconsumo;
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            if (configTaxRateIva != null) setTaxRateIva(configTaxRateIva);
            if (configTaxRateImpoconsumo != null) setTaxRateImpoconsumo(configTaxRateImpoconsumo);
        });
        return () => cancelAnimationFrame(raf);
    }, [configTaxRateIva, configTaxRateImpoconsumo]);

    const handleSaveTaxRates = async () => {
        const iva = parseFloat(taxRateIva);
        const impo = parseFloat(taxRateImpoconsumo);
        if (isNaN(iva) || iva < 0 || iva > 100 || isNaN(impo) || impo < 0 || impo > 100) {
            showToast('Los porcentajes deben estar entre 0 y 100', 'error');
            return;
        }
        setIsSavingTax(true);
        try {
            await updateConfig({ taxRateIva: iva, taxRateImpoconsumo: impo });
            showToast('Tasas de impuestos guardadas', 'success');
            triggerHaptic?.('light');
        } catch {
            showToast('Error al guardar tasas', 'error');
        } finally {
            setIsSavingTax(false);
        }
    };
    return (
        <>
            {/* ── Tasas de Impuestos ── */}
            <SectionCard icon={Layers} title="Tasas de Impuestos" subtitle="Porcentajes aplicados a productos y mesas" iconColor="text-emerald-500">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">IVA (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={taxRateIva}
                                onChange={e => setTaxRateIva(e.target.value)}
                                onWheel={e => e.target.blur()}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 pr-8 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all dark:text-white outline-none"
                            />
                            <span className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-400">%</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Impoconsumo (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={taxRateImpoconsumo}
                                onChange={e => setTaxRateImpoconsumo(e.target.value)}
                                onWheel={e => e.target.blur()}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 pr-8 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all dark:text-white outline-none"
                            />
                            <span className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-400">%</span>
                        </div>
                    </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                    Estos porcentajes se aplican globalmente a todos los productos y servicios de mesa que tengan IVA o Impoconsumo activado.
                </p>
                <button
                    onClick={handleSaveTaxRates}
                    disabled={isSavingTax}
                    className="w-full flex items-center justify-center gap-2 py-2.5 mt-3 font-bold text-xs uppercase tracking-wider rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                    {isSavingTax ? 'Guardando...' : '✓ Guardar Tasas'}
                </button>
            </SectionCard>

            <div data-tour="settings-stock">
            <SectionCard icon={Package} title="Inventario" subtitle="Reglas de ventas" iconColor="text-emerald-500">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Vender sin Stock</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Permitir ventas si el inventario es 0</p>
                    </div>
                    <Toggle
                        enabled={allowNegativeStock}
                        onChange={() => {
                            const newVal = !allowNegativeStock;
                            setAllowNegativeStock(newVal);
                            localStorage.setItem('allow_negative_stock', newVal.toString());
                            forceHeartbeat();
                            showToast(newVal ? 'Se permite vender sin stock' : 'No se permite vender sin stock', 'success');
                            triggerHaptic?.();
                        }}
                    />
                </div>
            </SectionCard>
            </div>

            <div data-tour="settings-cajero-perms">
            <SectionCard icon={KeyRound} title="Permisos de Cajero" subtitle="Acciones permitidas al cajero" iconColor="text-amber-500">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Puede abrir caja</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">El cajero puede iniciar el turno sin admin</p>
                    </div>
                    <Toggle
                        enabled={cajeroAbreCaja}
                        onChange={() => {
                            const newVal = !cajeroAbreCaja;
                            setCajeroAbreCaja(newVal);
                            localStorage.setItem('cajero_puede_abrir_caja', newVal.toString());
                            // Si se desactiva abrir caja, también se desactiva cerrar caja
                            if (!newVal && cajeroCierraCaja) {
                                setCajeroCierraCaja(false);
                                localStorage.setItem('cajero_puede_cerrar_caja', 'false');
                            }
                            showToast(newVal ? 'Cajero puede abrir caja' : 'Solo el admin puede abrir caja', 'success');
                            triggerHaptic?.();
                        }}
                    />
                </div>

                <div className={`flex items-center justify-between ${!cajeroAbreCaja ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Puede cerrar caja</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            {cajeroAbreCaja ? 'El cajero puede cerrar el turno' : 'Requiere activar "Puede abrir caja"'}
                        </p>
                    </div>
                    <Toggle
                        enabled={cajeroCierraCaja}
                        onChange={() => {
                            if (!cajeroAbreCaja) return;
                            const newVal = !cajeroCierraCaja;
                            setCajeroCierraCaja(newVal);
                            localStorage.setItem('cajero_puede_cerrar_caja', newVal.toString());
                            showToast(newVal ? 'Cajero puede cerrar caja' : 'Solo el admin puede cerrar caja', 'success');
                            triggerHaptic?.();
                        }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Acceso a Mesas</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">El cajero puede ver y gestionar la zona de mesas</p>
                    </div>
                    <Toggle
                        enabled={cajeroVeMesas}
                        onChange={() => {
                            const newVal = !cajeroVeMesas;
                            setCajeroVeMesas(newVal);
                            localStorage.setItem('cajero_puede_ver_mesas', newVal.toString());
                            showToast(newVal ? 'Cajero tiene acceso a mesas' : 'Cajero sin acceso a mesas', 'success');
                            triggerHaptic?.();
                        }}
                    />
                </div>
            </SectionCard>
            </div>

            <SectionCard icon={ShieldCheck} title="Seguridad de Descuentos" subtitle="Control de descuentos por rol" iconColor="text-violet-500">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Límite de descuento para cajeros</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Descuentos mayores requieren PIN de admin. Pon 100 para sin límite.</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="100"
                            value={maxDiscountCajero}
                            onFocus={e => e.target.select()}
                            onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') { setMaxDiscountCajero(''); return; }
                                const val = Math.min(100, Math.max(0, parseInt(raw) || 0));
                                setMaxDiscountCajero(val);
                                localStorage.setItem('max_discount_cajero', String(val));
                                triggerHaptic?.();
                            }}
                            onBlur={() => {
                                if (maxDiscountCajero === '' || maxDiscountCajero === null) {
                                    setMaxDiscountCajero(0);
                                    localStorage.setItem('max_discount_cajero', '0');
                                }
                            }}
                            className="w-16 text-center text-sm font-black text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <span className="text-sm font-bold text-slate-500">%</span>
                    </div>
                </div>
            </SectionCard>

            <div data-tour="settings-payment-methods">
            <SectionCard icon={CreditCard} title="Metodos de Pago" subtitle="Configura como te pagan" iconColor="text-blue-500">
                <PaymentMethodsManager triggerHaptic={triggerHaptic} />
            </SectionCard>
            </div>
        </>
    );
}

