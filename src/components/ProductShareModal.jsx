import React, { useState } from 'react';
import { Modal } from './Modal';
import { Share2 } from 'lucide-react';
import { formatCop } from '../utils/calculatorUtils';

export const ProductShareModal = ({ isOpen, onClose, product, accounts }) => {
    const [selectedAccountId, setSelectedAccountId] = useState(() =>
        accounts?.length > 0 ? accounts[0].id : ''
    );

    // Auto-select first account when modal opens
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (prevIsOpen !== isOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen && accounts?.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accounts[0].id);
        }
    }

    if (!product) return null;

    const generateMessage = () => {
        const lines = [];
        lines.push(`*${product.name.toUpperCase()}*`);
        lines.push('');

        lines.push(`PRECIO: ${formatCop(product.priceUsdt)}`);
        lines.push('');

        if (selectedAccountId && accounts) {
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc) {
                const d = acc.data || acc;

                lines.push(`DATOS DE PAGO:`);
                lines.push(`*${acc.alias || 'Cuenta'}*`);

                if (acc.type === 'pago_movil') {
                    lines.push(`Banco: ${d.bankName || d.bank || 'Banco'}`);
                    lines.push(`Tel: ${d.phone}`);
                    lines.push(`C.C./NIT: ${d.docId || d.id}`);
                } else if (acc.type === 'transfer' || acc.type === 'transferencia') {
                    lines.push(`Banco: ${d.bankName || d.bank || ''}`);
                    lines.push(`Cuenta: ${d.accountNumber}`);
                    lines.push(`Titular: ${d.holder}`);
                    lines.push(`NIT/C.C.: ${d.docId || d.id}`);
                } else if (acc.type === 'binance') {
                    lines.push(`Email: ${d.email}`);
                    if (d.payId) lines.push(`ID: ${d.payId}`);
                }
            }
        }

        return lines.join('\n');
    };

    const handleShare = async () => {
        const text = generateMessage();

        const dataURLtoFile = (dataurl, filename) => {
            let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            return new File([u8arr], filename, { type: mime });
        };

        try {
            if (navigator.share && product.image) {
                const imageFile = dataURLtoFile(product.image, `${product.name.replace(/\s+/g, '_')}.webp`);

                if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
                    await navigator.share({
                        text: text,
                        files: [imageFile],
                    });
                    return;
                }
            }
        } catch (error) {
            console.error("Error sharing with image:", error);
        }

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Cotización Flash">
            <div className="space-y-6">

                {/* Account Selector */}
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Cuenta Receptora</label>
                    {!accounts || accounts.length === 0 ? (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-500 text-center">
                            No tienes cuentas guardadas aún.
                        </div>
                    ) : (
                        <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-sm font-medium text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 border border-slate-200 dark:border-slate-700"
                        >
                            <option value="">-- Sin datos bancarios --</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.type === 'pago_movil' ? '📱' : acc.type === 'binance' ? '🟡' : '🏦'} {acc.alias}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Preview */}
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-[10px] text-slate-400 mb-1 uppercase font-bold">Vista Previa Mensaje:</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {generateMessage()}
                    </p>
                </div>

                {/* Action button */}
                <button
                    onClick={handleShare}
                    className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-2xl font-black uppercase tracking-wider shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <Share2 size={20} /> Enviar WhatsApp
                </button>

            </div>
        </Modal>
    );
};
