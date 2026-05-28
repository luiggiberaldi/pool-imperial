// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Builds a WhatsApp-ready receipt URL for sharing a sale in Colombia.
 * @param {object} receipt - The sale/receipt object (all price/total fields represent COP)
 * @returns {string} WhatsApp URL with pre-filled message
 */
export function buildReceiptWhatsAppUrl(receipt) {
    const r = receipt;
    const fecha = new Date(r.timestamp).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const saleNum = r.saleNumber ? String(r.saleNumber).padStart(7, '0') : (r.id?.slice(-6).toUpperCase() ?? '------');
    const sep = '================================';
    const sep2 = '--------------------------------';

    // Items (all pricing fields are COP in Pool Imperial)
    const itemsLines = (r.items ?? []).map(item => {
        const qty = item.isWeight
            ? `${parseFloat(item.qty).toFixed(2)} kg`
            : `${item.qty} und`;
        const sub = item.priceUsd * item.qty; // priceUsd contains COP
        return `- ${item.name}\n  ${qty} x ${formatCOP(item.priceUsd)} = ${formatCOP(sub)}`;
    }).join('\n');

    // Pagos
    const paymentsLines = (r.payments ?? []).map(p => {
        return `  ${p.methodLabel}: ${formatCOP(p.amountUsd)}`;
    }).join('\n');

    // Totales
    const totalCopStr = formatCOP(r.totalUsd || 0);

    // Vuelto
    const changeLines = r.changeUsd > 1
        ? `\nCAMBIO: ${formatCOP(r.changeUsd)}`
        : '';

    // Fiado
    const fiadoLine = r.fiadoUsd > 1
        ? `\nPOR PAGAR (Fiado): ${formatCOP(r.fiadoUsd)}`
        : '';

    // Cliente
    let clienteStrContent = '';
    if (r.customerName && r.customerName !== 'Consumidor Final') {
        clienteStrContent += `Cliente: ${r.customerName}\n`;
        if (r.customerDocument) {
            clienteStrContent += `NIT/C.C.: ${r.customerDocument}\n`;
        }
    }
    const clienteLine = clienteStrContent;

    const bName = localStorage.getItem('business_name') || 'Pool Imperial';
    const bRif = localStorage.getItem('business_rif'); // NIT in Colombia

    let headerBlocks = [];
    headerBlocks.push(`*${bName.toUpperCase()}*`);
    if (bRif) headerBlocks.push(`NIT: ${bRif}`);
    headerBlocks.push(sep2);
    headerBlocks.push(`COMPROBANTE DE VENTA`);

    const text = [
        ...headerBlocks,
        sep2,
        `Orden: #${saleNum}`,
        `${clienteLine}Fecha: ${fecha}`,
        sep,
        ``,
        `DETALLE DE PRODUCTOS:`,
        itemsLines,
        ``,
        sep,
        `TOTAL A PAGAR: ${totalCopStr}`,
        paymentsLines ? `\nPAGOS:\n${paymentsLines}` : '',
        changeLines,
        fiadoLine,
        sep,
        `¡Gracias por su compra!`,
        ``,
        `_Este documento no constituye factura fiscal. Comprobante de control interno._`,
        `Pool Imperial - Sistema POS`,
    ].filter(Boolean).join('\n');

    const formatColombiaPhone = (phone) => {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith('57')) return digits;
        if (digits.startsWith('0')) return '57' + digits.slice(1);
        return '57' + digits;
    };

    const phone = formatColombiaPhone(r.customerPhone);
    return phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
