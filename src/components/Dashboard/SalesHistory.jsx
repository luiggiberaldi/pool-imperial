import React, { useState } from 'react';
import { Clock, Trash2, Receipt } from 'lucide-react';
import TransactionRow from '../Reports/TransactionRow';
import EmptyState from '../EmptyState';

export default function SalesHistory({
    sales: _sales,
    recentSales,
    bcvRate,
    totalSalesCount,
    onVoidSale,
    onShareWhatsApp,
    onDownloadPDF,
    onOpenDeleteModal,
    onRequestClientForTicket,
    onRecycleSale,
    onPrintTicket,
    isAdmin
}) {
    const [expandedSaleId, setExpandedSaleId] = useState(null);

    if (recentSales.length === 0) {
        return (
            <div className="mb-20 mt-4">
                <EmptyState
                    icon={Receipt}
                    title="Aún no hay ventas"
                    description="Las ventas recientes aparecerán aquí una vez que comiences a facturar."
                />
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mb-20">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Clock size={12} /> Últimas 7 Ventas
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{totalSalesCount} histórico</span>
                    {isAdmin && (
                        <button
                            onClick={onOpenDeleteModal}
                            className="text-slate-300 hover:text-red-500 transition-colors bg-slate-50 hover:bg-red-50 p-1.5 rounded-lg"
                            title="Borrar historial"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-3">
                {recentSales.map(s => (
                    <TransactionRow
                        key={s.id}
                        sale={s}
                        bcvRate={bcvRate}
                        isExpanded={expandedSaleId === s.id}
                        onToggle={() => setExpandedSaleId(expandedSaleId === s.id ? null : s.id)}
                        onVoidSale={onVoidSale}
                        onShareWhatsApp={onShareWhatsApp}
                        onDownloadPDF={onDownloadPDF}
                        onRequestClientForTicket={onRequestClientForTicket}
                        onRecycleSale={onRecycleSale}
                        onPrintTicket={onPrintTicket}
                        isAdmin={isAdmin}
                    />
                ))}
            </div>
        </div>
    );
}
