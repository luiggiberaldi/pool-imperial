import { jsPDF } from 'jspdf';
import { capitalizeName } from './calculatorUtils';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

// Re-exports for backward compatibility
export { printThermalTicket } from './thermalTicketGenerator';
export { generatePartialSessionTicketPDF } from './tableTicketGenerator';

/**
 * Genera un ticket PDF estilo recibo térmico 80mm.
 * Cada dato ocupa su propia línea — nada se solapa.
 */
export async function generateTicketPDF(sale, _bcvRate) {
    const WIDTH = 58;
    const M = 3;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    const itemCount = sale.items?.length || 0;
    const paymentCount = sale.payments?.length || 0;
    const hasFiado = sale.fiadoUsd > 0;
    const hasChange = (sale.changeUsd > 0);

    // Altura MUY generosa para que nunca se corte
    const H = 80 + (itemCount * 12) + (paymentCount * 6) + (hasFiado ? 14 : 0) + (hasChange ? 18 : 0);

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H] });

    // Paleta
    const INK = [33, 37, 41];
    const BODY = [73, 80, 87];
    const MUTED = [134, 142, 150];
    const GREEN = [16, 124, 65];
    const RULE = [206, 212, 218];
    const RED = [220, 53, 69];

    let y = 8;

    // ── Helper: línea punteada ──
    const dash = (yy) => {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(M, yy, RIGHT, yy);
        doc.setLineDashPattern([], 0);
    };

    // ════════════════════════════════════
    //  LOGO
    // ════════════════════════════════════
    try {
        const img = new Image();
        img.src = '/logo-ticket.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const targetW = 50;
        const ratio = img.width / img.height;
        const logoH = targetW / ratio;
        doc.addImage(img, 'PNG', CX - targetW / 2, y, targetW, logoH);
        y += logoH + 4;
    } catch (_) { y += 2; }

    dash(y); y += 5;

    // ════════════════════════════════════
    //  INFO DEL TICKET (cada dato en su línea)
    // ════════════════════════════════════
    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const d = new Date(sale.timestamp);
    const fecha = d.toLocaleDateString('es-CO');
    const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('N°:', M, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${saleNum}`, M + 8, y);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${fecha}  ${hora}`, RIGHT, y, { align: 'right' });
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Cliente:', M, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BODY);
    doc.text(sale.customerName || 'Consumidor Final', M + 14, y);
    y += 6;

    if (sale.tableName) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        doc.text('Mesa:', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text(sale.tableName, M + 14, y);
        y += 6;
    }

    if (sale.customerDocument) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        doc.text('C.I/RIF:', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text(sale.customerDocument, M + 14, y);
        y += 6;
    }

    const staffName = capitalizeName(sale.meseroNombre || sale.vendedorNombre);
    if (staffName && staffName !== 'Sistema') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        doc.text('Atendido:', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text(staffName, M + 14, y);
        y += 6;
    }

    dash(y); y += 5;

    // ════════════════════════════════════
    //  ENCABEZADO DE PRODUCTOS
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('CANT', M, y);
    doc.text('DESCRIPCIÓN', M + 12, y);
    doc.text('IMPORTE', RIGHT, y, { align: 'right' });
    y += 5;

    // ════════════════════════════════════
    //  PRODUCTOS
    // ════════════════════════════════════
    if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
            const qty = item.isWeight ? item.qty.toFixed(2) : String(item.qty);
            const unit = item.isWeight ? ' Kg' : ' u';
            const sub = (item.priceUsd || 0) * item.qty;
            const name = item.name.length > 20 ? item.name.substring(0, 20) + '…' : item.name;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...INK);
            doc.text(`${qty}${unit}`, M, y);
            doc.text(name, M + 12, y);
            doc.setFont('helvetica', 'bold');
            doc.text(formatCOP(sub), RIGHT, y, { align: 'right' });
            y += 4;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(formatCOP(item.priceUsd) + ' c/u', M + 12, y);
            y += 6;
        });
    }

    y += 2;
    dash(y); y += 7;

    y += 3;

    // ════════════════════════════════════
    //  TOTAL
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    if (sale.discountAmountUsd > 0) {
        doc.setTextColor(...BODY);
        doc.text('SUBTOTAL:', M, y);
        const subtotal = sale.cartSubtotalUsd || ((sale.totalCop || sale.totalUsd || 0) + (sale.discountAmountUsd || 0));
        doc.text(formatCOP(subtotal), RIGHT, y, { align: 'right' });
        y += 5;
        doc.setTextColor(...RED);
        const discountLabel = sale.discountType === 'percentage' ? `DESCUENTO (${sale.discountValue}%):` : 'DESCUENTO:';
        doc.text(discountLabel, M, y);
        doc.text('-' + formatCOP(sale.discountAmountUsd), RIGHT, y, { align: 'right' });
        y += 7;
    }

    const hasIva = (sale.ivaRate || 0) > 0;
    if (hasIva) {
        const baseBeforeIva = (sale.totalCop || sale.totalUsd || 0) - (sale.ivaAmount || 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Base Gravable:', M, y);
        doc.text(formatCOP(baseBeforeIva), RIGHT, y, { align: 'right' });
        y += 4.5;

        doc.text(`IVA (${sale.ivaRate}%):`, M, y);
        doc.text(formatCOP(sale.ivaAmount || 0), RIGHT, y, { align: 'right' });
        y += 5.5;
    }

    doc.setTextColor(...BODY);
    doc.text('TOTAL A PAGAR', CX, y, { align: 'center' });
    y += 8;

    doc.setFontSize(16);
    doc.setTextColor(...GREEN);
    const totalDisplay = sale.totalCop || sale.totalUsd || 0;
    doc.text(formatCOP(totalDisplay), CX, y, { align: 'center' });
    y += 10;

    dash(y); y += 7;

    // ════════════════════════════════════
    //  PAGOS REALIZADOS
    // ════════════════════════════════════
    const showPayments = (sale.payments && sale.payments.length > 0) || hasFiado;
    if (showPayments) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text('PAGOS REALIZADOS', M, y);
        y += 5;

        if (sale.payments && sale.payments.length > 0) {
            sale.payments.forEach(p => {
                // En Pool Imperial todos los pagos son COP
                const val = formatCOP(p.amountUsd || p.amountCOP || 0);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(...BODY);
                doc.text(p.methodLabel || 'Pago', M, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...INK);
                doc.text(val, RIGHT, y, { align: 'right' });
                y += 5;
            });
        }

        if (hasFiado) {
            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...RED);
            doc.text('Deuda pendiente:', M, y);
            doc.text(formatCOP(sale.fiadoUsd || 0), RIGHT, y, { align: 'right' });
            y += 6;
        }

        y += 2;
        dash(y); y += 7;
    }

    // ════════════════════════════════════
    //  VUELTO ENTREGADO
    // ════════════════════════════════════
    if (sale.changeUsd > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text('VUELTO ENTREGADO', M, y);
        y += 5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Efectivo COP', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREEN);
        doc.text(formatCOP(sale.changeUsd), RIGHT, y, { align: 'right' });
        y += 5;

        y += 2;
        dash(y); y += 7;
    }

    // ════════════════════════════════════
    //  PIE
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('¡Gracias por tu compra!', CX, y, { align: 'center' });
    y += 6;

    // ── DESCARGAR / COMPARTIR ──
    const filename = 'ticket_' + saleNum + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Ticket #' + saleNum, files: [file] })
            .catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}

/**
 * GENERADOR DE ETIQUETAS "ONE-CLICK"
 * Genera el documento PDF 58mm y dispara la impresión térmica directa.
 */
export const generarEtiquetas = async (productos) => {
    const { default: jsPDF } = await import('jspdf');

    if (!productos || productos.length === 0) return;

    const width = 58;
    const height = 40;
    const orientation = 'landscape';
    const marginX = 2;
    const marginY = 2;

    const doc = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [width, height]
    });

    productos.forEach((p, index) => {
        if (index > 0) doc.addPage([width, height], orientation);

        const printableWidth = width - (marginX * 2);
        const centerX = width / 2;
        let safeY = marginY + 2;

        // --- 1. TÍTULO DEL PRODUCTO ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);

        const titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth - 2);
        const safeLines = titleLines.slice(0, 2);
        doc.text(safeLines, centerX, safeY, { align: "center", baseline: "top" });

        const titleHeight = safeLines.length * (11 * 0.3527 * 1.2);
        safeY += titleHeight + 2;

        // --- 2. PRECIO EN COP ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(26);

        const priceCOP = p.priceUsd || p.priceUsdt || 0;
        const textCOP = formatCOP(priceCOP);

        doc.text(textCOP, centerX, safeY, { align: "center", baseline: "top" });
        safeY += (26 * 0.3527 * 0.8) + 2;

        // --- 4. FOOTER (Fecha y Unidad) ---
        const footerY = height - marginY - 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80);

        const fechaStr = new Date().toLocaleDateString();
        const infoExtra = p.barcode || (p.unit ? p.unit.toUpperCase() : 'UND');

        doc.text(`${infoExtra}  |  ${fechaStr}`, centerX, footerY, { align: "center", baseline: "bottom" });
    });

    // Auto-impresión
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error("Error printing from iframe:", e);
            window.open(blobUrl, '_blank');
        }
    };
};
