import { useState, useEffect } from 'react';
import { Users, Plus, Search, Truck, Receipt } from 'lucide-react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, mulR, divR } from '../utils/dinero';
import TransactionModal from '../components/Customers/TransactionModal';
import { processCustomerTransaction } from '../utils/customerTransactionProcessor';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import SwipeableItem from '../components/SwipeableItem';
import { useProductContext } from '../context/ProductContext';
import { useAudit } from '../hooks/useAudit';
import { useAuthStore } from '../hooks/store/authStore';

// Componentes de Clientes
import CustomerCard from '../components/Customers/CustomerCard';
import { CustomerDetailSheet, EditCustomerModal, AddCustomerModal } from '../components/Customers/CustomerModals';

// Componentes de Proveedores
import SuppliersList from '../components/Suppliers/SuppliersList';
import { AddSupplierModal, AddInvoiceModal, PayInvoiceModal, SupplierDetailsSheet } from '../components/Suppliers/SupplierModals';
import { getActivePaymentMethods } from '../config/paymentMethods';

// Componentes de Empleados (Deudas)
import DebtsPanel from '../components/Settings/DebtsPanel';

export default function CustomersView({ triggerHaptic, rates, isActive }) {
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all' | 'deuda' | 'favor'
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const { role } = useAuthStore();
    const isAdmin = role === 'ADMIN';

    const [transactionModal, setTransactionModal] = useState({ isOpen: false, type: null, customer: null });
    const [transactionAmount, setTransactionAmount] = useState('');
    const [currencyMode, setCurrencyMode] = useState('BS');
    const [paymentMethod, setPaymentMethod] = useState('efectivo_bs');
    const [activePaymentMethods, setActivePaymentMethods] = useState([]);
    const [resetBalanceCustomer, setResetBalanceCustomer] = useState(null);
    const { effectiveRate: bcvRate, tasaCop, copEnabled } = useProductContext();
    const { log: auditLog } = useAudit();
    const [historyData, setHistoryData] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [deleteCustomerTarget, setDeleteCustomerTarget] = useState(null);

    // ── ESTADOS DE PROVEEDORES ──
    const [activeTab, setActiveTab] = useState('clientes');
    const [suppliers, setSuppliers] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [isAddInvoiceModalOpen, setIsAddInvoiceModalOpen] = useState(false);
    const [isPayInvoiceModalOpen, setIsPayInvoiceModalOpen] = useState(false);
    const [deleteSupplierTarget, setDeleteSupplierTarget] = useState(null);
    const [supplierHistoryData, setSupplierHistoryData] = useState([]);

    const loadData = async () => {
        const [savedCustomers, savedSuppliers, savedInvoices, savedMethods] = await Promise.all([
            storageService.getItem('bodega_customers_v1', []),
            storageService.getItem('bodega_suppliers_v1', []),
            storageService.getItem('bodega_supplier_invoices_v1', []),
            getActivePaymentMethods()
        ]);
        setCustomers(savedCustomers);
        setSuppliers(savedSuppliers);
        setInvoices(savedInvoices);
        setActivePaymentMethods(savedMethods);
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadData(); }, []);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (isActive) loadData(); }, [isActive]);

    // localStorage signal: dashboard quick action → auto-switch tab
    useEffect(() => {
        const pending = localStorage.getItem('cuentas_open_tab');
        if (pending) {
            setActiveTab(pending);
            localStorage.removeItem('cuentas_open_tab');
        }
    }, [isActive]);

    const saveCustomers = async (updatedCustomers) => {
        setCustomers(updatedCustomers);
        await storageService.setItem('bodega_customers_v1', updatedCustomers);
    };

    const saveSuppliers = async (updatedSuppliers) => {
        setSuppliers(updatedSuppliers);
        await storageService.setItem('bodega_suppliers_v1', updatedSuppliers);
    };

    const saveInvoices = async (updatedInvoices) => {
        setInvoices(updatedInvoices);
        await storageService.setItem('bodega_supplier_invoices_v1', updatedInvoices);
    };

    // ── LÓGICA DE CLIENTES ──
    const handleDeleteCustomerRequest = (customer) => {
        const deuda = customer.deuda || 0;
        const saldo = customer.saldoFavor || 0;
        if (deuda > 0.005) { showToast(`No se puede eliminar: ${customer.name} tiene una deuda de $${deuda.toFixed(2)} pendiente.`, 'error'); return; }
        if (saldo > 0.005) { showToast(`No se puede eliminar: ${customer.name} tiene un saldo a favor de $${saldo.toFixed(2)}.`, 'error'); return; }
        setDeleteCustomerTarget(customer);
    };

    const toggleHistory = async (customerId) => {
        triggerHaptic && triggerHaptic();
        const allSales = await storageService.getItem('bodega_sales_v1', []);
        const customerSales = allSales
            .filter(s => s.customerId === customerId || s.clienteId === customerId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);
        setHistoryData(customerSales);
    };

    const confirmResetBalance = async () => {
        const customer = resetBalanceCustomer;
        if (!customer) return;
        const updatedCustomer = { ...customer, deuda: 0, favor: 0 };
        const newCustomers = customers.map(c => c.id === customer.id ? updatedCustomer : c);
        await saveCustomers(newCustomers);
        showToast(`Saldo reiniciado a cero para ${customer.name}`, 'success');
        auditLog('CLIENTE', 'DEUDA_CONDONADA', `Saldo reiniciado a $0 para ${customer.name}`);
        setResetBalanceCustomer(null);
    };

    const handleTransaction = async () => {
        if (!transactionAmount || isNaN(transactionAmount) || parseFloat(transactionAmount) <= 0) return;
        triggerHaptic();
        const { newCustomers } = await processCustomerTransaction({
            transactionAmount, currencyMode, type: transactionModal.type,
            customer: transactionModal.customer, paymentMethod, bcvRate, tasaCop, copEnabled
        });
        await saveCustomers(newCustomers);
        showToast(`Operación de ${transactionModal.type} exitosa`, 'success');
        auditLog('CLIENTE', transactionModal.type === 'ABONO' ? 'ABONO_REGISTRADO' : 'CREDITO_REGISTRADO',
            `${transactionModal.type} de ${transactionAmount} ${currencyMode} para ${transactionModal.customer?.name}`);
        setTransactionModal({ isOpen: false, type: null, customer: null });
        setTransactionAmount('');
        setCurrencyMode('BS');
        setPaymentMethod('efectivo_bs');
    };

    // ── LÓGICA DE PROVEEDORES ──
    const handleSaveSupplier = async (supplierData) => {
        triggerHaptic && triggerHaptic();
        let updated;
        if (editingSupplier) {
            updated = suppliers.map(s => s.id === supplierData.id ? supplierData : s);
            showToast('Proveedor actualizado', 'success');
            auditLog('PROVEEDOR', 'PROVEEDOR_EDITADO', `Proveedor "${supplierData.name}" actualizado`);
        } else {
            updated = [...suppliers, supplierData];
            showToast('Proveedor agregado', 'success');
            auditLog('PROVEEDOR', 'PROVEEDOR_CREADO', `Proveedor "${supplierData.name}" creado`);
        }
        await saveSuppliers(updated);
        setIsAddSupplierModalOpen(false);
        setEditingSupplier(null);
        if (selectedSupplier && selectedSupplier.id === supplierData.id) setSelectedSupplier(supplierData);
    };

    const refreshSupplierHistory = async (supplierId) => {
        const allSales = await storageService.getItem('bodega_sales_v1', []);
        const supplierInvoices = invoices.filter(i => i.supplierId === supplierId);
        const supplierPayments = allSales.filter(s => s.tipo === 'PAGO_PROVEEDOR' && s.supplierId === supplierId);
        setSupplierHistoryData(
            [...supplierInvoices, ...supplierPayments]
                .sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp))
        );
    };

    const handleSelectSupplier = (supplier) => {
        triggerHaptic && triggerHaptic();
        setSelectedSupplier(supplier);
        refreshSupplierHistory(supplier.id);
    };

    const handleAddInvoice = async (invoiceData) => {
        triggerHaptic && triggerHaptic();
        await saveInvoices([...invoices, invoiceData]);
        const supplier = suppliers.find(s => s.id === invoiceData.supplierId);
        if (supplier) {
            const updatedSupplier = { ...supplier, deuda: round2((supplier.deuda || 0) + invoiceData.amountUsd) };
            await saveSuppliers(suppliers.map(s => s.id === supplier.id ? updatedSupplier : s));
            setSelectedSupplier(updatedSupplier);
        }
        setIsAddInvoiceModalOpen(false);
        showToast('Factura registrada', 'success');
        auditLog('PROVEEDOR', 'FACTURA_REGISTRADA', `Factura $${invoiceData.amountUsd?.toFixed(2)} - ${suppliers.find(s => s.id === invoiceData.supplierId)?.name || '?'}`);
        refreshSupplierHistory(invoiceData.supplierId);
    };

    const handlePayInvoice = async (amountUsd, amountBs, methodId, currency) => {
        triggerHaptic && triggerHaptic();
        const supplier = selectedSupplier;
        if (!supplier) return;
        const updatedSupplier = { ...supplier, deuda: Math.max(0, round2((supplier.deuda || 0) - amountUsd)) };
        await saveSuppliers(suppliers.map(s => s.id === supplier.id ? updatedSupplier : s));
        setSelectedSupplier(updatedSupplier);

        const sales = await storageService.getItem('bodega_sales_v1', []);
        const totalEnBs = currency === 'BS' ? amountBs : mulR(amountUsd, bcvRate);
        const totalEnUsd = currency === 'USD' ? amountUsd : (bcvRate > 0 ? divR(amountBs, bcvRate) : 0);
        const totalEnCop = currency === 'COP' ? amountBs : mulR(amountUsd, tasaCop);
        sales.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            tipo: 'PAGO_PROVEEDOR',
            supplierId: supplier.id,
            supplierName: supplier.name,
            totalBs: -totalEnBs,
            totalUsd: -totalEnUsd,
            ...(copEnabled && { totalCop: -totalEnCop }),
            paymentMethod: methodId,
            payments: [{ methodId, amountUsd: currency === 'USD' ? -totalEnUsd : 0, amountBs: currency === 'BS' ? -totalEnBs : 0, ...(copEnabled && { amountCop: currency === 'COP' ? -totalEnCop : 0 }), currency, methodLabel: 'Pago a Proveedor' }],
            items: [{ name: `Pago a proveedor: ${supplier.name}`, qty: 1, priceUsd: -totalEnUsd, costBs: 0 }]
        });
        await storageService.setItem('bodega_sales_v1', sales);
        setIsPayInvoiceModalOpen(false);
        showToast('Pago registrado correctamente', 'success');
        auditLog('PROVEEDOR', 'PAGO_PROVEEDOR', `Pago $${amountUsd.toFixed(2)} a ${supplier.name}`);
        refreshSupplierHistory(supplier.id);
    };

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.phone && c.phone.includes(searchTerm));
        if (!matchesSearch) return false;
        if (filterType === 'deuda') return c.deuda > 0.01;
        if (filterType === 'favor') return c.deuda < -0.01;
        return true;
    });

    // ── SEGMENTED CONTROL (compartido) ──
    const TabControl = () => (
        <div className="px-3 sm:px-6 pt-3 sm:pt-6 shrink-0 z-10 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-xl">
            <div className="flex bg-slate-200/50 dark:bg-slate-800/80 p-1 sm:p-1.5 rounded-2xl shadow-inner">
                <button
                    onClick={() => { setActiveTab('clientes'); triggerHaptic && triggerHaptic(); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === 'clientes' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400 scale-100 ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}
                >
                    <Users size={16} /> Clientes
                </button>
                {isAdmin && (
                    <button
                        onClick={() => { setActiveTab('proveedores'); triggerHaptic && triggerHaptic(); }}
                        className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === 'proveedores' ? 'bg-white dark:bg-slate-900 shadow-sm text-purple-600 dark:text-purple-400 scale-100 ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}
                    >
                        <Truck size={16} /> <span className="hidden xs:inline">Proveedor</span><span className="xs:hidden">Proveed.</span>
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => { setActiveTab('empleados'); triggerHaptic && triggerHaptic(); }}
                        className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === 'empleados' ? 'bg-white dark:bg-slate-900 shadow-sm text-rose-600 dark:text-rose-400 scale-100 ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}
                    >
                        <Receipt size={16} /> Empleados
                    </button>
                )}
            </div>
        </div>
    );

    // ── TAB EMPLEADOS (Deudas) ──
    if (activeTab === 'empleados') {
        return (
            <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
                <TabControl />
                <div className="flex-1 overflow-y-auto scrollbar-hide p-3 sm:p-6 pb-20">
                    <DebtsPanel />
                </div>
            </div>
        );
    }

    // ── TAB PROVEEDORES ──
    if (activeTab === 'proveedores') {
        return (
            <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
                <TabControl />
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    <SuppliersList
                        suppliers={suppliers} bcvRate={bcvRate} tasaCop={tasaCop} copEnabled={copEnabled}
                        triggerHaptic={triggerHaptic} isAdmin={isAdmin}
                        onAddSupplier={() => setIsAddSupplierModalOpen(true)}
                        onSelectSupplier={handleSelectSupplier}
                        onDeleteSupplier={(s) => setDeleteSupplierTarget(s)}
                    />
                </div>
                {isAddSupplierModalOpen && (
                    <AddSupplierModal editingSupplier={editingSupplier}
                        onClose={() => { setIsAddSupplierModalOpen(false); setEditingSupplier(null); }}
                        onSave={handleSaveSupplier} />
                )}
                {isAddInvoiceModalOpen && selectedSupplier && (
                    <AddInvoiceModal supplier={selectedSupplier} bcvRate={bcvRate}
                        onClose={() => setIsAddInvoiceModalOpen(false)} onSave={handleAddInvoice} />
                )}
                {isPayInvoiceModalOpen && selectedSupplier && (
                    <PayInvoiceModal supplier={selectedSupplier} bcvRate={bcvRate} tasaCop={tasaCop}
                        copEnabled={copEnabled} activePaymentMethods={activePaymentMethods}
                        onClose={() => setIsPayInvoiceModalOpen(false)} onSave={handlePayInvoice} />
                )}
                <SupplierDetailsSheet
                    supplier={selectedSupplier} isOpen={!!selectedSupplier} isAdmin={isAdmin}
                    bcvRate={bcvRate} tasaCop={tasaCop} copEnabled={copEnabled}
                    historyData={supplierHistoryData} onClose={() => setSelectedSupplier(null)}
                    onAddInvoice={() => setIsAddInvoiceModalOpen(true)}
                    onPayInvoice={() => setIsPayInvoiceModalOpen(true)}
                    onEdit={() => { setEditingSupplier(selectedSupplier); setIsAddSupplierModalOpen(true); }}
                    onDelete={() => setDeleteSupplierTarget(selectedSupplier)}
                />
                <ConfirmModal
                    isOpen={!!deleteSupplierTarget} onClose={() => setDeleteSupplierTarget(null)}
                    onConfirm={async () => {
                        await saveSuppliers(suppliers.filter(s => s.id !== deleteSupplierTarget.id));
                        showToast(`Proveedor ${deleteSupplierTarget.name} eliminado`, 'success');
                        auditLog('PROVEEDOR', 'PROVEEDOR_ELIMINADO', `Proveedor ${deleteSupplierTarget.name} eliminado`, { proveedorId: deleteSupplierTarget.id });
                        setSelectedSupplier(null);
                        setDeleteSupplierTarget(null);
                    }}
                    title="Eliminar Proveedor"
                    message={deleteSupplierTarget ? `¿Eliminar a ${deleteSupplierTarget.name}? Esta acción no se puede deshacer.` : ''}
                    confirmText="Sí, eliminar" variant="danger"
                />
            </div>
        );
    }

    // ── TAB CLIENTES ──
    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
            <TabControl />

            <div className="flex-1 overflow-y-auto scrollbar-hide p-3 sm:p-6 pb-20">
                {/* Header */}
                <div className="shrink-0 mb-5 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                            <Users size={26} className="text-blue-500" /> Contactos
                        </h2>
                        <p className="text-sm text-slate-400 font-medium ml-1">Deudas y Saldos a Favor</p>
                    </div>
                    <button
                        onClick={() => { triggerHaptic(); setIsAddModalOpen(true); }}
                        className="p-3 bg-blue-500 text-white rounded-2xl shadow-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Plus size={20} className="shrink-0" />
                        <span className="text-sm font-bold hidden sm:inline">Nuevo Contacto</span>
                    </button>
                </div>

                {/* Búsqueda y Filtros */}
                <div className="mb-5 shrink-0 flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input type="text" placeholder="Buscar cliente..." value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3.5 pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm" />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {[
                            { key: 'all', label: 'Todos', activeColor: 'bg-blue-500 shadow-blue-500/30' },
                            { key: 'deuda', label: 'Con Deuda', activeColor: 'bg-red-500 shadow-red-500/30', dot: 'bg-red-500' },
                            { key: 'favor', label: 'Saldo a Favor', activeColor: 'bg-emerald-500 shadow-emerald-500/30', dot: 'bg-emerald-500' },
                        ].map(({ key, label, activeColor, dot }) => (
                            <button key={key} onClick={() => { setFilterType(key); triggerHaptic && triggerHaptic(); }}
                                className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${filterType === key ? `${activeColor} text-white shadow-sm` : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'}`}>
                                {dot && <div className={`w-2 h-2 rounded-full ${filterType === key ? 'bg-white' : dot}`} />}
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Listado */}
                <div className="flex-1 space-y-3 pb-20">
                    {customers.length === 0 ? (
                        <EmptyState icon={Users} title="Sin Clientes"
                            description="Registra a tus clientes habituales para llevar un control de sus fiados y saldos a favor."
                            actionLabel="NUEVO CLIENTE" onAction={() => { triggerHaptic && triggerHaptic(); setIsAddModalOpen(true); }} />
                    ) : filteredCustomers.length === 0 ? (
                        <EmptyState icon={Search} title="Sin resultados"
                            description={`No encontramos ningún cliente con el término "${searchTerm}".`}
                            secondaryActionLabel="Limpiar Búsqueda"
                            onSecondaryAction={() => { setSearchTerm(''); triggerHaptic && triggerHaptic(); }} />
                    ) : (
                        filteredCustomers.map(customer => (
                            <SwipeableItem key={customer.id}
                                onDelete={isAdmin ? () => handleDeleteCustomerRequest(customer) : undefined}
                                triggerHaptic={triggerHaptic}>
                                <CustomerCard
                                    customer={customer} bcvRate={bcvRate} tasaCop={tasaCop} copEnabled={copEnabled}
                                    onClick={() => { setSelectedCustomer(customer); toggleHistory(customer.id); }}
                                    onDelete={isAdmin ? () => handleDeleteCustomerRequest(customer) : undefined}
                                />
                            </SwipeableItem>
                        ))
                    )}
                </div>
            </div>

            {/* Modales */}
            {isAddModalOpen && (
                <AddCustomerModal onClose={() => setIsAddModalOpen(false)}
                    onSave={async (newC) => {
                        await saveCustomers([...customers, newC]);
                        auditLog('CLIENTE', 'CLIENTE_CREADO', `Cliente "${newC.name}" creado`);
                        setIsAddModalOpen(false);
                    }} />
            )}

            <TransactionModal
                transactionModal={transactionModal} setTransactionModal={setTransactionModal}
                transactionAmount={transactionAmount} setTransactionAmount={setTransactionAmount}
                currencyMode={currencyMode} setCurrencyMode={setCurrencyMode}
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                activePaymentMethods={activePaymentMethods} bcvRate={bcvRate}
                tasaCop={tasaCop} copEnabled={copEnabled} handleTransaction={handleTransaction}
            />

            <CustomerDetailSheet
                customer={selectedCustomer} isOpen={!!selectedCustomer} isAdmin={isAdmin}
                onClose={() => { setSelectedCustomer(null); setHistoryData([]); }}
                onAjustar={() => { setTransactionModal({ isOpen: true, type: 'ABONO', customer: selectedCustomer }); setSelectedCustomer(null); }}
                onReset={() => { setResetBalanceCustomer(selectedCustomer); setSelectedCustomer(null); }}
                onEdit={() => { setEditingCustomer(selectedCustomer); setSelectedCustomer(null); }}
                onDelete={() => {
                    const deuda = selectedCustomer?.deuda || 0;
                    const saldo = selectedCustomer?.saldoFavor || 0;
                    if (deuda > 0.005) { showToast(`No se puede eliminar: ${selectedCustomer.name} tiene una deuda de $${deuda.toFixed(2)} pendiente.`, 'error'); return; }
                    if (saldo > 0.005) { showToast(`No se puede eliminar: ${selectedCustomer.name} tiene un saldo a favor de $${saldo.toFixed(2)}.`, 'error'); return; }
                    setDeleteCustomerTarget(selectedCustomer);
                    setSelectedCustomer(null);
                }}
                bcvRate={bcvRate} sales={historyData}
            />

            <ConfirmModal isOpen={!!resetBalanceCustomer} onClose={() => setResetBalanceCustomer(null)}
                onConfirm={confirmResetBalance} title="Reiniciar saldo del cliente"
                message={resetBalanceCustomer ? `¿Estás seguro de reiniciar la deuda y saldo a favor a $0.00 para ${resetBalanceCustomer.name}?\n\nEsta acción es permanente y no se puede deshacer.` : ''}
                confirmText="Sí, reiniciar" variant="danger" />

            <ConfirmModal isOpen={!!deleteCustomerTarget} onClose={() => setDeleteCustomerTarget(null)}
                onConfirm={async () => {
                    await saveCustomers(customers.filter(c => c.id !== deleteCustomerTarget.id));
                    showToast(`Cliente ${deleteCustomerTarget.name} eliminado`, 'success');
                    auditLog('CLIENTE', 'CLIENTE_ELIMINADO', `Cliente "${deleteCustomerTarget.name}" eliminado`);
                    setDeleteCustomerTarget(null);
                }}
                title="Eliminar cliente"
                message={deleteCustomerTarget ? `¿Eliminar a ${deleteCustomerTarget.name}? Esta acción no se puede deshacer.` : ''}
                confirmText="Sí, eliminar" variant="danger" />

            {editingCustomer && (
                <EditCustomerModal customer={editingCustomer} onClose={() => setEditingCustomer(null)}
                    onSave={async (updated) => {
                        await saveCustomers(customers.map(c => c.id === updated.id ? updated : c));
                        setEditingCustomer(null);
                        showToast('Cliente actualizado', 'success');
                        auditLog('CLIENTE', 'CLIENTE_EDITADO', `Cliente ${updated.nombre || updated.name} actualizado`, { clienteId: updated.id });
                    }} />
            )}
        </div>
    );
}
