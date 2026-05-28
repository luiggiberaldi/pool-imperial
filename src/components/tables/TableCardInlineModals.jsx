import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { Modal } from '../Modal';
import { TargetIcon } from './TargetIcon';
import { OrderPanel } from './OrderPanel';
import { CustomerSheet } from './CustomerSheet';
import { OpenWizardModal } from './OpenWizardModal';
import { EditSessionModal } from './EditSessionModal';
import { TotalDetailsModal } from './TotalDetailsModal';
import { AttributionModal } from './AttributionModal';

export default function TableCardInlineModals({
    table, session, elapsed, timeCost, seatTimeCost, totalConsumption, consumptionBs, grandTotal,
    costBreakdown, config, tasaUSD, currentItems, currentUser,
    hasPinas, isMixedMode, hasHoursActive, hasLimit,
    isProcessingCharge,
    // Cancel modal
    showCancelModal, setShowCancelModal, handleCancelTable,
    // Adjust modal
    showAdjustModal, setShowAdjustModal, adjustMins, setAdjustMins, submitAdjustTime,
    requestAttribution,
    // Piña confirm modal
    showPinaConfirm, setShowPinaConfirm, handleStartPina,
    // Open wizard
    showOpenModal, setShowOpenModal, wizardStep, setWizardStep,
    sessionSeats, setSessionSeats, seatValidationError, setSeatValidationError,
    pendingOpen, modePina, setModePina, modeHora, setModeHora,
    selectedHours, setSelectedHours, initialChargeTarget, setInitialChargeTarget,
    handleWizardFinish,
    // Edit session
    showEditMetaModal, setShowEditMetaModal,
    editSeats, setEditSeats, editClientId, setEditClientId,
    editClientName, setEditClientName, editGuestCount, editNotes, setEditNotes,
    allCustomers, updateSessionMetadata, updateSessionSeats,
    // Attribution
    showAttributeModal, setShowAttributeModal, pendingCharge, setPendingCharge,
    handleAttributeCharge,
    // Order panel
    showOrderPanel, setShowOrderPanel,
    // Total details
    showTotalDetails, setShowTotalDetails,
    // Customer sheets
    showCustomerSheet, setShowCustomerSheet,
    searchingSeatIndex, setSearchingSeatIndex, sessionClientId, setSessionClientId,
    showEditCustomerSheet, setShowEditCustomerSheet,
    searchingEditSeatIndex, setSearchingEditSeatIndex, editClientIdSetter,
    handleCreateCustomer,
}) {
    return (
        <>
        {/* Modal de Anular Mesa (Exclusivo Admin) */}
        <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="Anular Mesa">
            <div className="flex flex-col gap-4 py-2">
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-sm">¿Estás completamente seguro?</h4>
                        <p className="text-sm opacity-90 mt-1 leading-relaxed">
                            Esta acción eliminará el tiempo de la mesa y <strong className="font-black">descartará {currentItems.length} producto(s)</strong> de la orden.
                            No se registrará ninguna venta en el sistema (ideal para mesas abiertas por error).
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleCancelTable}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                >
                    <X size={18} /> Confirmar Anulación
                </button>
            </div>
        </Modal>

        {/* ═══ WIZARD: Abrir Mesa ═══ */}
        <OpenWizardModal
            isOpen={showOpenModal}
            onClose={() => setShowOpenModal(false)}
            wizardStep={wizardStep}
            setWizardStep={setWizardStep}
            sessionSeats={sessionSeats}
            onSeatsChange={setSessionSeats}
            seatValidationError={seatValidationError}
            setSeatValidationError={setSeatValidationError}
            onSearchCustomerForSeat={(idx) => { setSearchingSeatIndex(idx); setShowCustomerSheet(true); }}
            pendingOpen={pendingOpen}
            modePina={modePina}
            setModePina={setModePina}
            modeHora={modeHora}
            setModeHora={setModeHora}
            selectedHours={selectedHours}
            setSelectedHours={setSelectedHours}
            initialChargeTarget={initialChargeTarget}
            setInitialChargeTarget={setInitialChargeTarget}
            config={config}
            tableName={table.name}
            onFinish={handleWizardFinish}
        />

        {/* Modal Editar nombre y personas de sesión activa */}
        <EditSessionModal
            isOpen={showEditMetaModal}
            onClose={() => setShowEditMetaModal(false)}
            editSeats={editSeats}
            setEditSeats={setEditSeats}
            editClientId={editClientId}
            setEditClientId={setEditClientId}
            editClientName={editClientName}
            setEditClientName={setEditClientName}
            editGuestCount={editGuestCount}
            editNotes={editNotes}
            setEditNotes={setEditNotes}
            allCustomers={allCustomers}
            onSearchCustomerForSeat={(idx) => { setSearchingEditSeatIndex(idx); setShowEditCustomerSheet(true); }}
            onOpenCustomerSheet={() => setShowEditCustomerSheet(true)}
            isPoolTable={table.type !== 'NORMAL'}
            sessionId={session?.id}
            updateSessionMetadata={updateSessionMetadata}
            updateSessionSeats={updateSessionSeats}
        />

        {/* Modal Modificar Tiempo / Partidas */}
        <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Ajustar Tiempo">
            <div className="flex flex-col gap-4 py-2">
                {/* Sección Piñas — solo visible en modo PINA puro */}
                {(hasPinas && !isMixedMode) && (
                    <button
                        disabled={isProcessingCharge}
                        onClick={async () => {
                            const seats = session?.seats || [];
                            const activeSeats = seats.filter(s => !s.paid);
                            if (activeSeats.length > 0) {
                                setShowAdjustModal(false);
                                requestAttribution({ type: 'pina' });
                            } else {
                                await useTablesStore.getState().addRoundToSession(session.id);
                                setShowAdjustModal(false);
                            }
                        }}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-black py-4 rounded-xl border border-amber-500/20 shadow-sm flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <TargetIcon size={20} /> + 1 Piña
                    </button>
                )}

                {/* Sección Agregar Tiempo — siempre visible */}
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agregar Tiempo</span>
                    <div className="grid grid-cols-2 gap-2">
                        {[0.5, 1, 2, 3].map(h => (
                            <button key={h} disabled={isProcessingCharge} onClick={async () => {
                                const seats = session?.seats || [];
                                const activeSeats = seats.filter(s => !s.paid);
                                if (activeSeats.length > 0) {
                                    setShowAdjustModal(false);
                                    requestAttribution({ type: 'hora', hoursValue: h });
                                } else {
                                    await useTablesStore.getState().addHoursToSession(session.id, h);
                                    setShowAdjustModal(false);
                                    const { showToast } = await import('../Toast');
                                    showToast(`${h === 0.5 ? '30 min' : h + 'h'} agregadas`, 'success');
                                }
                            }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl disabled:opacity-50 disabled:pointer-events-none">
                                + {h === 0.5 ? '30 Min' : h === 1 ? '1 Hora' : `${h} Horas`}
                            </button>
                        ))}
                    </div>
                    {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') && (
                        <>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Restar</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -0.5); setShowAdjustModal(false); const { showToast } = await import('../Toast'); showToast('30 min restados', 'success'); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 30 Min</button>
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -1); setShowAdjustModal(false); const { showToast } = await import('../Toast'); showToast('1h restada', 'success'); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 1 Hora</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Modal>

        {/* Modal: Atribución de tiempo a cliente */}
        <AttributionModal
            isOpen={showAttributeModal}
            onClose={() => { if (!isProcessingCharge) { setShowAttributeModal(false); setPendingCharge(null); } }}
            pendingCharge={pendingCharge}
            isProcessingCharge={isProcessingCharge}
            seats={session?.seats}
            onAttributeCharge={handleAttributeCharge}
        />

        {/* Portals: rendered in document.body to escape card's CSS transform context */}
        {showOrderPanel && createPortal(
            <div className="fixed inset-0 z-[100] overflow-hidden flex">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOrderPanel(false)} />
                <div className="relative ml-auto h-full">
                    <OrderPanel session={session} table={table} onClose={() => setShowOrderPanel(false)} />
                </div>
            </div>,
            document.body
        )}


        {/* Modal de Detalle de Gastos */}
        <TotalDetailsModal
            isOpen={showTotalDetails}
            onClose={() => setShowTotalDetails(false)}
            table={table}
            session={session}
            elapsed={elapsed}
            timeCost={timeCost}
            totalConsumption={totalConsumption}
            consumptionBs={consumptionBs}
            grandTotal={grandTotal}
            costBreakdown={costBreakdown}
            config={config}
            tasaUSD={tasaUSD}
            currentItems={currentItems}
            seatTimeCost={seatTimeCost}
        />

        {/* Confirmación Piña — solo para MESERO */}
        <Modal isOpen={showPinaConfirm} onClose={() => setShowPinaConfirm(false)} title="Confirmar Piña">
            <div className="flex flex-col gap-4 py-2">
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <span className="text-3xl">🎱</span>
                    <div>
                        <p className="font-black text-slate-800 text-sm">{table.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Se abrirá en modo <strong>Piña</strong> (precio fijo por partida).</p>
                    </div>
                </div>
                <p className="text-xs text-slate-500 text-center">¿Confirmas que quieres abrir esta mesa en modo Piña?</p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowPinaConfirm(false)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => { setShowPinaConfirm(false); handleStartPina(); }}
                        className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                    >
                        Sí, abrir Piña
                    </button>
                </div>
            </div>
        </Modal>

        {/* CustomerSheet para Abrir Mesa (y buscar cliente por seat) */}
        {showCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={searchingSeatIndex !== null ? sessionSeats[searchingSeatIndex]?.customerId : sessionClientId}
                onSelect={id => {
                    if (searchingSeatIndex !== null) {
                        const customer = allCustomers.find(c => c.id === id);
                        const updated = sessionSeats.map((s, i) =>
                            i === searchingSeatIndex
                                ? { ...s, customerId: id, label: s.label || customer?.name || '' }
                                : s
                        );
                        setSessionSeats(updated);
                        setSearchingSeatIndex(null);
                    } else {
                        setSessionClientId(id);
                    }
                }}
                onClose={() => { setShowCustomerSheet(false); setSearchingSeatIndex(null); }}
                onCreateCustomer={handleCreateCustomer}
            />
        )}

        {/* CustomerSheet para Editar Mesa */}
        {showEditCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={searchingEditSeatIndex !== null ? editSeats[searchingEditSeatIndex]?.customerId : editClientId}
                onSelect={id => {
                    if (searchingEditSeatIndex !== null) {
                        const customer = allCustomers.find(c => c.id === id);
                        const updated = editSeats.map((s, i) =>
                            i === searchingEditSeatIndex
                                ? { ...s, customerId: id, label: s.label || customer?.name || '' }
                                : s
                        );
                        setEditSeats(updated);
                        setSearchingEditSeatIndex(null);
                    } else {
                        setEditClientId(id);
                        setEditClientName(allCustomers.find(c => c.id === id)?.name || '');
                    }
                }}
                onClose={() => { setShowEditCustomerSheet(false); setSearchingEditSeatIndex(null); }}
                onCreateCustomer={handleCreateCustomer}
            />
        )}
        </>
    );
}
