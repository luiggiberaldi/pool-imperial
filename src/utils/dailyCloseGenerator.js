import { jsPDF } from 'jspdf';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';
import { useTablesStore } from '../hooks/store/useTablesStore';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

// Formatea un número como dólares: $ 12.50
const formatUsd = (val) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
}).format(val || 0);

/**
 * Genera un PDF de Cierre del Día con reporte detallado.
 * Formato: 80mm ancho (estilo recibo) para compartir fácilmente por WhatsApp.
 */
export async function generateDailyClosePDF({
    sales,
    allSales,
    adjustments = [],
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
    totalTax = 0,
    taxBreakdown = {},
    cierreNum,
}) {
    const WIDTH = 58;
    const M = 3;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    // Las ventas anuladas no se muestran ni se contabilizan en el reporte de cierre
    const visibleSales = allSales.filter(s => s.status !== 'ANULADA');

    // Calcular propinas agrupadas por usuario (meseroNombre || vendedorNombre || 'Sistema')
    const tipsByUser = {};
    let totalTips = 0;
    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            if (item.isTip || (item.name && item.name.toLowerCase().includes('propina'))) {
                const user = s.meseroNombre || s.vendedorNombre || 'Sistema';
                const amt = (item.priceUsd || 0) * (item.qty || 1);
                if (amt > 0) {
                    tipsByUser[user] = (tipsByUser[user] || 0) + amt;
                    totalTips += amt;
                }
            }
        });
    });
    const tipsUserRows = Object.keys(tipsByUser).length;

    const prodMovements = (() => {
        const movements = {};
        
        // Process adjustments
        (adjustments || []).forEach(adj => {
            if (adj.status === 'ANULADA') return;
            (adj.items || []).forEach(item => {
                const prodId = item.id;
                if (!movements[prodId]) {
                    movements[prodId] = { name: item.name || 'Producto', entrada: 0, salida: 0 };
                }
                if (adj.tipo === 'AJUSTE_ENTRADA') {
                    movements[prodId].entrada += item.qty;
                } else if (adj.tipo === 'AJUSTE_SALIDA') {
                    movements[prodId].salida += item.qty;
                }
            });
        });

        // Process sales (which are outgoing/salidas)
        allSales.forEach(sale => {
            if (sale.status === 'ANULADA') return;
            (sale.items || []).forEach(item => {
                const nameLower = (item.name || '').toLowerCase();
                if (item.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) return;
                const prodId = item.id;
                if (!movements[prodId]) {
                    movements[prodId] = { name: item.name || 'Producto', entrada: 0, salida: 0 };
                }
                movements[prodId].salida += item.qty;
            });
        });

        return Object.entries(movements)
            .map(([id, data]) => ({ id, ...data }))
            .filter(m => m.entrada > 0 || m.salida > 0)
            .sort((a, b) => (b.salida + b.entrada) - (a.salida + a.entrada));
    })();
    const prodMovementRows = prodMovements.length;

    // Calcular altura dinámica
    const paymentRows = Object.keys(paymentBreakdown).length;
    const topProdRows = topProducts.length;
    const saleRows = visibleSales.length;
    const taxRows = Object.keys(taxBreakdown || {}).filter(k => taxBreakdown[k] > 0).length;
    // Calculate dynamic base height. Increase to 45mm per sale to fit detailed change rows
    const H = 200
        + (paymentRows * 7)
        + (topProdRows * 10)
        + (saleRows * 45)
        + (totalTax > 0 ? 12 + (taxRows * 5) : 0)
        + (tipsUserRows > 0 ? 12 + (tipsUserRows * 5) : 0)
        + (prodMovementRows > 0 ? 12 + (prodMovementRows * 7) : 0);

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
    doc.text(`CIERRE DE CAJA #${cierreNum || ''}`, CX, y, { align: 'center' });
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
    const netCOP = totalCOP - totalTax;

    let totalServicioVoluntario = 0;
    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            const nameLower = (item.name || '').toLowerCase();
            if (nameLower.includes('servicio voluntario')) {
                totalServicioVoluntario += (item.priceUsd || item.price || 0) * (item.qty || 1);
            }
        });
    });

    const activeSalesCount = sales.filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA').length;
    let totalEgresosProveedores = 0;
    sales.forEach(s => {
        if (s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja !== false) {
            totalEgresosProveedores += Math.abs(s.totalCop || s.totalUsd || 0);
        }
    });

    const openingCOP = apertura?.openingCOP || apertura?.openingUsd || apertura?.totalUsd || 0;
    const statsRows = [
        ['Ventas realizadas', `${activeSalesCount}`],
        ['Artículos vendidos', `${todayItemsSold}`],
    ];
    if (openingCOP > 0) {
        statsRows.push(['Fondo de Apertura', formatCOP(openingCOP)]);
    }
    statsRows.push(
        ['Ingresos Brutos COP', formatCOP(totalCOP)],
        ['Ingresos Netos COP', formatCOP(netCOP)]
    );
    if (totalEgresosProveedores > 0) {
        statsRows.push(['Egresos Proveedores', `-${formatCOP(totalEgresosProveedores)}`]);
    }
    statsRows.push(
        ['Ganancia estimada', formatCOP(todayProfit || 0)]
    );
    if (totalServicioVoluntario > 0) {
        statsRows.push(['Servicio Voluntario', formatCOP(totalServicioVoluntario)]);
    }

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
        y = sectionTitle('PAGOS POR METODO', y);

        // Contar transacciones por methodId desde allSales
        const countMap = {};
        allSales.forEach(s => {
            if (s.status === 'ANULADA') return;
            if (s.payments && s.payments.length > 0) {
                s.payments.forEach(p => {
                    if (p.isAbonoPrevio) return;
                    countMap[p.methodId] = (countMap[p.methodId] || 0) + 1;
                });
            } else if (s.paymentMethod) {
                countMap[s.paymentMethod] = (countMap[s.paymentMethod] || 0) + 1;
            }
        });

        Object.entries(paymentBreakdown).forEach(([methodId, data]) => {
            const label = toTitleCase(getPaymentLabel(methodId, data.label));
            const count = countMap[methodId] || 0;
            const countLabel = count > 0 ? ` (${count} ${count === 1 ? 'pago' : 'pagos'})` : '';
            const labelWithCount = `${label}${countLabel}`;
            const isUsd = data.currency === 'USD';
            const val = isUsd ? formatUsd(data.total) : formatCOP(data.total);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(labelWithCount, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(val, RIGHT, y, { align: 'right' });
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  DESGLOSE DE IMPUESTOS RECAUDADOS
    // ════════════════════════════════════
    if (totalTax > 0) {
        y = sectionTitle('IMPUESTOS RECAUDADOS', y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text('Total Impuestos Recaudados', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(formatCOP(totalTax), RIGHT, y, { align: 'right' });
        y += 5;

        Object.entries(taxBreakdown || {}).forEach(([key, val]) => {
            if (val <= 0) return;
            const config = useTablesStore.getState().config;
            const label = key === 'iva_19' ? `IVA ${config?.taxRateIva ?? 19}%` : key === 'impoconsumo_8' ? `Impoconsumo ${config?.taxRateImpoconsumo ?? 8}%` : key;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(`  ${label}`, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(formatCOP(val), RIGHT, y, { align: 'right' });
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  PROPINAS POR PERSONAL
    // ════════════════════════════════════
    if (tipsUserRows > 0) {
        y = sectionTitle('PROPINAS POR PERSONAL', y);

        Object.entries(tipsByUser).forEach(([user, total]) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(user, M, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(formatCOP(total), RIGHT, y, { align: 'right' });
            y += 5;
        });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text('Total Propinas', M, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLUE);
        doc.text(formatCOP(totalTips), RIGHT, y, { align: 'right' });
        y += 5;

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  RECONCILIACIÓN DE CAJA (CUADRE)
    // ════════════════════════════════════
    if (reconData) {
        y = sectionTitle('CUADRE DE CAJA FISICA', y);

        const openingCOP = apertura?.openingCOP || apertura?.openingUsd || 0;
        const openingUSD = apertura?.openingBs || 0;

        const expectedCOP = (paymentBreakdown['efectivo']?.total || 0) + (paymentBreakdown['efectivo_cop']?.total || 0) + (paymentBreakdown['_vuelto_cop']?.total || 0) + openingCOP;
        const declaredCOP = reconData.declaredCop || reconData.declaredCOP || 0;
        const diffCOP = declaredCOP - expectedCOP;

        const expectedUSD = (paymentBreakdown['efectivo_usd']?.total || 0) + openingUSD;
        const declaredUSD = reconData.declaredUsd || reconData.declaredUSD || 0;
        const diffUSD = declaredUSD - expectedUSD;

        const reconRows = [
            ['Fondo inicial COP', formatCOP(openingCOP)],
            ['COP Esperado', formatCOP(expectedCOP)],
            ['COP Declarado', formatCOP(declaredCOP)],
            ['COP Diferencia', formatCOP(diffCOP)],
            ['Fondo inicial USD', formatUsd(openingUSD)],
            ['USD Esperado', formatUsd(expectedUSD)],
            ['USD Declarado', formatUsd(declaredUSD)],
            ['USD Diferencia', formatUsd(diffUSD)]
        ];

        reconRows.forEach(([label, value]) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(label, M, y);

            doc.setFont('helvetica', 'bold');
            if (label.includes('Diferencia')) {
                const isCop = label.includes('COP');
                const rawDiff = isCop ? diffCOP : diffUSD;
                const tolerance = isCop ? 500 : 0.05;
                if (Math.abs(rawDiff) <= tolerance) doc.setTextColor(...MUTED);
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
    if (apertura && (apertura.openingCOP > 0 || apertura.openingUsd > 0 || apertura.openingBs > 0)) {
        y = sectionTitle('FONDO INICIAL (APERTURA)', y);

        const aperturaRows = [];
        const openingAmount = apertura.openingCOP || apertura.openingUsd || 0;
        const openingUSD = apertura.openingBs || 0;
        
        if (openingAmount > 0) aperturaRows.push(['Efectivo COP inicial', formatCOP(openingAmount)]);
        if (openingUSD > 0) aperturaRows.push(['Efectivo USD inicial', formatUsd(openingUSD)]);
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
    //  MOVIMIENTOS DE PRODUCTOS
    // ════════════════════════════════════
    if (prodMovementRows > 0) {
        y = sectionTitle('MOVIMIENTOS DE PRODUCTOS', y);

        // Header for movements table
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text('Producto', M, y);
        doc.text('Entrada', RIGHT - 15, y, { align: 'right' });
        doc.text('Salida', RIGHT, y, { align: 'right' });
        y += 3.5;

        prodMovements.forEach((m) => {
            const name = m.name.length > 20 ? m.name.substring(0, 20) + '…' : m.name;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(name, M, y);

            doc.setFont('helvetica', 'bold');
            if (m.entrada > 0) {
                doc.setTextColor(...GREEN);
                doc.text(`+${m.entrada}`, RIGHT - 15, y, { align: 'right' });
            } else {
                doc.setTextColor(...MUTED);
                doc.text('-', RIGHT - 15, y, { align: 'right' });
            }

            if (m.salida > 0) {
                doc.setTextColor(...RED);
                doc.text(`-${m.salida}`, RIGHT, y, { align: 'right' });
            } else {
                doc.setTextColor(...MUTED);
                doc.text('-', RIGHT, y, { align: 'right' });
            }
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  ARTÍCULOS VENDIDOS
    // ════════════════════════════════════
    if (topProdRows > 0) {
        y = sectionTitle('ARTÍCULOS VENDIDOS', y);

        topProducts.forEach((p) => {
            const name = p.name.length > 26 ? p.name.substring(0, 26) + '…' : p.name;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(name, M, y);
            y += 4;

            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text(`${p.qty} vendidos · ${formatCOP(p.revenue)}`, M, y);
            y += 5;
        });

        y += 2;
        dash(y); y += 6;
    }

    // ════════════════════════════════════
    //  DETALLE DE VENTAS
    // ════════════════════════════════════
    y = sectionTitle('DETALLE DE VENTAS', y);

    visibleSales.forEach((s) => {
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
                const isUsd = p.amountOriginalCurrency === 'USD';
                const val = isUsd 
                    ? `${formatUsd(p.amountOriginal)} USD` 
                    : `${formatCOP(p.amountUsd !== undefined ? p.amountUsd : p.amount)} COP`;
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
