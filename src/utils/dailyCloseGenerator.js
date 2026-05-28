import { jsPDF } from 'jspdf';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Genera un PDF de Cierre del Día con reporte detallado.
 * Formato: 80mm ancho (estilo recibo) para compartir fácilmente por WhatsApp.
 */
export async function generateDailyClosePDF({
    sales,
    allSales,
    paymentBreakdown,
    topProducts,
    todayTotalCOP,     // Total en pesos colombianos
    todayProfit,
    todayItemsSold,
    reconData,         // Datos del cuadre físico
    apertura,          // { openingCOP, sellerName }
    // Alias de compatibilidad
    todayTotalUsd,
    bcvRate,
    todayTotalBs,
}) {
    const WIDTH = 58;
    const M = 4;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    // Calcular altura dinámica
    const paymentRows = Object.keys(paymentBreakdown).length;
    const topProdRows = topProducts.length;
    const saleRows = allSales.length;
    // Calculate dynamic base height. Increase to 45mm per sale to fit detailed change rows
    const H = 200
        + (paymentRows * 7)
        + (topProdRows * 10)
        + (saleRows * 45);

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H] });

    // ── Paleta ──
    const INK = [33, 37, 41];
    const BODY = [73, 80, 87];
    const MUTED = [134, 142, 150];
    const GREEN = [16, 124, 65];
    const RULE = [206, 212, 218];
    const RED = [220, 53, 69];
    const BLUE = [37, 99, 235];

    let y = 6;

    // ── Helper: línea punteada ──
    const dash = (yy) => {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(M, yy, RIGHT, yy);
        doc.setLineDashPattern([], 0);
    };

    // ── Helper: sección header ──
    const sectionTitle = (text, yy) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...BLUE);
        doc.text(text, M, yy);
        return yy + 5;
    };

    // ════════════════════════════════════
    //  LOGO
    // ════════════════════════════════════
    try {
        const img = new Image();
        img.src = '/logo-ticket.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const targetW = 40;
        const ratio = img.width / img.height;
        const logoH = targetW / ratio;
        doc.addImage(img, 'PNG', CX - targetW / 2, y, targetW, logoH);
        y += logoH + 3;
    } catch (_) { y += 2; }

    // ════════════════════════════════════
    //  TÍTULO: CIERRE DEL DÍA
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text('CIERRE DEL DÍA', CX, y, { align: 'center' });
    y += 5;

    const now = new Date();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(now.toLocaleDateString('es-CO', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    }), CX, y, { align: 'center' });
    y += 4;
    doc.text('Emitido: ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }), CX, y, { align: 'center' });
    y += 5;

    dash(y); y += 6;

    // ════════════════════════════════════
    //  RESUMEN GENERAL
    // ════════════════════════════════════
    y = sectionTitle('RESUMEN GENERAL', y);

    const totalCOP = todayTotalCOP ?? todayTotalUsd ?? 0;

    const statsRows = [
        ['Ventas realizadas', `${sales.length}`],
        ['Artículos vendidos', `${todayItemsSold}`],
        ['Ingresos brutos', formatCOP(totalCOP)],
        ['Ganancia estimada', formatCOP(todayProfit || 0)],
    ];

    statsRows.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text(label, M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(value, RIGHT, y, { align: 'right' });
        y += 5;
    });

    y += 2;
    dash(y); y += 6;

    // ════════════════════════════════════
    //  DESGLOSE POR MÉTODO DE PAGO
    // ════════════════════════════════════
    if (paymentRows > 0) {
        y = sectionTitle('PAGOS POR MÉTODO', y);

        Object.entries(paymentBreakdown).forEach(([methodId, data]) => {
            const label = toTitleCase(getPaymentLabel(methodId, data.label));
            // En Pool Imperial todos los montos son COP
            const val = formatCOP(data.total);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(label, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(val, RIGHT, y, { align: 'right' });
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  RECONCILIACIÓN DE CAJA (CUADRE)
    // ════════════════════════════════════
    if (reconData) {
        y = sectionTitle('CUADRE DE CAJA FISICA', y);

        const openingCOP = apertura?.openingCOP || apertura?.openingUsd || 0;
        const reconRows = [
            ['Fondo inicial', formatCOP(openingCOP)],
            ['Declarado', formatCOP(reconData.declaredCOP || reconData.declaredUsd || 0)],
            ['Diferencia', formatCOP(reconData.diffCOP || reconData.diffUsd || 0)]
        ];

        reconRows.forEach(([label, value], i) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(label, M, y);

            doc.setFont('helvetica', 'bold');
            if (i === 2) {
                const rawDiff = reconData.diffCOP || reconData.diffUsd || 0;
                if (Math.abs(rawDiff) <= 500) doc.setTextColor(...MUTED);
                else if (rawDiff < 0) doc.setTextColor(...RED);
                else doc.setTextColor(...GREEN);
            } else {
                doc.setTextColor(...INK);
            }
            doc.text(value, RIGHT, y, { align: 'right' });
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  APERTURA DE CAJA
    // ════════════════════════════════════
    if (apertura && (apertura.openingCOP > 0 || apertura.openingUsd > 0)) {
        y = sectionTitle('FONDO INICIAL (APERTURA)', y);

        const aperturaRows = [];
        const openingAmount = apertura.openingCOP || apertura.openingUsd || 0;
        if (openingAmount > 0) aperturaRows.push(['Efectivo COP inicial', formatCOP(openingAmount)]);
        if (apertura.sellerName) aperturaRows.push(['Cajero apertura', apertura.sellerName]);

        aperturaRows.forEach(([label, value]) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(label, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(value, RIGHT, y, { align: 'right' });
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  TOP PRODUCTOS
    // ════════════════════════════════════
    if (topProdRows > 0) {
        y = sectionTitle('PRODUCTOS MÁS VENDIDOS', y);

        topProducts.forEach((p, i) => {
            const rank = `${i + 1}.`;
            const name = p.name.length > 22 ? p.name.substring(0, 22) + '…' : p.name;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...INK);
            doc.text(rank, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...BODY);
            doc.text(name, M + 5, y);
            y += 4;

            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(`${p.qty} vendidos · ${formatCOP(p.revenue)}`, M + 5, y);
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  DETALLE DE VENTAS
    // ════════════════════════════════════
    y = sectionTitle('DETALLE DE VENTAS', y);

    allSales.forEach((s) => {
        const d = new Date(s.timestamp);
        const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const isCanceled = s.status === 'ANULADA';
        const cliente = s.customerName || 'Consumidor Final';

        // Hora + Cliente + Total
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        if (isCanceled) { doc.setTextColor(...RED); } else { doc.setTextColor(...INK); }
        doc.text(`${hora}`, M, y);
        doc.setFont('helvetica', 'bold');
        if (isCanceled) { doc.setTextColor(...RED); } else { doc.setTextColor(...BODY); }
        const clienteStr = cliente.length > 18 ? cliente.substring(0, 18) + '…' : cliente;
        doc.text(clienteStr, M + 12, y);

        doc.setFont('helvetica', 'bold');
        if (isCanceled) { doc.setTextColor(...RED); } else { doc.setTextColor(...GREEN); }
        const totalStr = isCanceled ? 'ANULADA' : formatCOP(s.totalCop || s.totalUsd || 0);
        doc.text(totalStr, RIGHT, y, { align: 'right' });
        y += 4;

        // Items resumidos
        if (s.items && s.items.length > 0 && !isCanceled) {
            s.items.forEach(item => {
                const qty = item.isWeight ? `${item.qty.toFixed(2)}kg` : `${item.qty}u`;
                const name = item.name.length > 22 ? item.name.substring(0, 22) + '…' : item.name;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(...MUTED);
                doc.text(`  ${qty} ${name}`, M, y);
                doc.text(`$${(item.priceUsd * item.qty).toFixed(2)}`, RIGHT, y, { align: 'right' });
                y += 3.5;
            });

            // Show discount line if applied
            if (s.discountAmountUsd && s.discountAmountUsd > 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(6);
                doc.setTextColor(...RED);
                doc.text(`  Descuento aplicado`, M, y);
                doc.text(`-$${s.discountAmountUsd.toFixed(2)}`, RIGHT, y, { align: 'right' });
                y += 3.5;
            }
        }

        // Método de pago detallado
        if (!isCanceled && s.payments && s.payments.length > 0) {
            s.payments.forEach(p => {
                const label = toTitleCase(p.methodLabel || getPaymentLabel(p.methodId) || 'Pago');
                // En Pool Imperial todos los pagos son COP
                const val = formatCOP(p.amountUsd !== undefined ? p.amountUsd : p.amount);
                doc.setFontSize(6);
                doc.setTextColor(...MUTED);
                doc.text(`  Recibido: ${label} (${val})`, M, y);
                y += 3.5;
            });
        } else if (!isCanceled && s.paymentMethod) {
            // Legacy fallback
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(`  Pago: ${getPaymentLabel(s.paymentMethod)}`, M, y);
            y += 3.5;
        }

        // Vuelto detallado (si aplica)
        if (!isCanceled && s.changeUsd && s.changeUsd > 0) {
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(`  Vuelto Entregado: ${formatCOP(s.changeUsd)}`, M, y);
            y += 3.5;
        }

        // Referencia total COP
        if (!isCanceled) {
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(`Total: ${formatCOP(s.totalCop || s.totalUsd || 0)}`, RIGHT, y, { align: 'right' });
            y += 3.5;
        }

        y += 3;
    });

    y += 2;
    dash(y); y += 6;

    // ════════════════════════════════════
    //  PIE
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Pool Imperial', CX, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text('Reporte generado automáticamente · Sin valor fiscal', CX, y, { align: 'center' });

    // ── DESCARGAR / COMPARTIR ──
    const getLocalISODate = (d = new Date()) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const dateStr = getLocalISODate(now);
    const filename = `cierre_${dateStr}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    // En PC (desktop) siempre descarga directo; en móvil usa Share API
    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: `Cierre del Día ${dateStr}`, files: [file] })
            .catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
