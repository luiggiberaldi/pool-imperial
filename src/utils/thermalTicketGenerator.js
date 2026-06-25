import { capitalizeName } from './calculatorUtils';
import { printReceiptEscPos, getWebSerialConfig, printDailyCloseEscPos } from '../services/webSerialPrinter';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { showToast } from '../components/Toast';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';

const formatCOP = (val) => {
    const rawVal = Math.round(val || 0);
    const absVal = Math.abs(rawVal).toLocaleString('es-CO');
    return rawVal < 0 ? `-$${absVal}` : `$${absVal}`;
};

/**
 * Imprime un ticket de venta en COP.
 * - Impresora del sistema: va directo a window.print()
 * - Impresora térmica configurada: ESC/POS directo, sin diálogo
 */
export async function printThermalTicket(sale, bcvRate) {
    const cfg = getWebSerialConfig();

    // Impresora del sistema → diálogo del sistema (HTML / PDF)
    if (cfg.printerType === 'system') {
        _printThermalHTML(sale, bcvRate);
        return;
    }

    // Impresora térmica → ESC/POS directo, sin diálogo (largo exacto + corte)
    try {
        const printed = await printReceiptEscPos(sale, bcvRate);
        if (printed) return;
        // printReceiptEscPos retornó false → no hay puerto autorizado
        showToast('Sin impresora conectada. Ve a Configuración → Impresora y pulsa Detectar.', 'error');
    } catch (err) {
        showToast(`Error de impresora: ${err.message}`, 'error');
        console.error('[Ticket] ESC/POS error:', err);
    }
}

function _printThermalHTML(sale, _bcvRate) {
    // ── CONFIGURACIÓN DE TAMAÑOS (58mm) ──
    const cssPageSize = '58mm auto';
    const cssBodyWidth = '46mm';
    const cssLogoW = '40mm';
    const fDisclaimer = '7.5px';
    const fTiny = '9px';     // Secundaria (detalles, NIT, c/u)
    const fSmall = '10px';   // Info general (fechas, nro)
    const fBase = '11px';    // Primaria (Items, label totales)
    const fTitle = '14px';   // Nombre negocio
    const fTotalU = '22px';  // Total COP
    const hasFiado = (sale.fiadoUsd || 0) > 0;
    const priorAbonoPayments = (sale.payments || []).filter(p => p.isAbonoPrevio === true);
    const hasPriorAbonos = priorAbonoPayments.length > 0;
    const priorAbonoTotal = hasPriorAbonos
        ? priorAbonoPayments.reduce((s, p) => s + (p.amountUsd || 0), 0)
        : 0;
    const totalDisplay = sale.totalCop || sale.totalUsd || 0;

    // ── OBTENER CONFIGURACIÓN DEL NEGOCIO ──
    const settings = {
        name: localStorage.getItem('business_name') || 'Pool Imperial',
        rif: localStorage.getItem('business_rif') || '', // NIT en Colombia
        address: localStorage.getItem('business_address') || '',
        phone: localStorage.getItem('business_phone') || '',
        instagram: localStorage.getItem('business_instagram') || ''
    };

    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const d = new Date(sale.timestamp);
    const fecha = d.toLocaleDateString('es-CO');
    const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    // Generar filas de productos (todos en COP)
    const itemsHtml = (sale.items || []).map(item => {
        const qty = item.isWeight ? item.qty.toFixed(2) : String(item.qty);
        const unit = item.isWeight ? ' Kg' : ' u';
        const sub = item.priceUsd * item.qty; // priceUsd almacena COP
        const name = item.name;
        const displayName = name.length > 26 ? name.substring(0, 26) + '...' : name;
        return `
            <tr>
                <td style="text-align:left;font-size:${fBase};padding:2px 0;vertical-align:top;word-wrap:break-word;">${qty}${unit}</td>
                <td style="text-align:left;font-size:${fBase};padding:2px 0 2px 6px;line-height:1.2;vertical-align:top;word-wrap:break-word;">${displayName}</td>
                <td style="text-align:right;font-size:${fBase};font-weight:bold;padding:2px 0;vertical-align:top;white-space:nowrap;">${formatCOP(sub)}</td>
            </tr>
            <tr>
                <td></td>
                <td colspan="2" style="font-size:${fTiny};color:#555;padding:0 0 4px 6px;vertical-align:top;">${formatCOP(item.priceUsd)} c/u</td>
            </tr>`;
    }).join('');

    // Generar filas de pagos
    const paymentsHtml = (sale.payments || []).map(p => {
        const isUsd = p.amountOriginalCurrency === 'USD';
        const formatUsdVal = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
        const amountStr = isUsd 
            ? `${formatUsdVal(p.amountOriginal)} USD` 
            : `${formatCOP(p.amountUsd || p.amountCOP || 0)} COP`;
        const labelStyle = p.isAbonoPrevio ? 'color:#dc3545;' : '';
        return `
            <tr>
                <td style="font-size:11px;padding:2px 0;${labelStyle}">${p.methodLabel || 'Pago'}</td>
                <td style="font-size:11px;font-weight:bold;text-align:right;padding:2px 0;${labelStyle}">${amountStr}</td>
            </tr>`;
    }).join('');

    const hasChange = (sale.changeUsd || 0) > 0;
    const changeHtml = hasChange ? `
        <div style="margin-top:6px;padding:4px 0;border-top:1px dashed #ccc;">
            <table style="width:100%"><tr>
                <td style="color:#107c41;font-weight:bold;font-size:11px;">Vuelto:</td>
                <td style="color:#107c41;font-weight:bold;font-size:11px;text-align:right;">${formatCOP(sale.changeUsd)}</td>
            </tr></table>
        </div>` : '';

    const fiadoHtml = hasFiado ? `
        <div style="margin-top:6px;padding:4px 0;border-top:1px dashed #ccc;">
            <table style="width:100%"><tr>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;">Por pagar (Fiado):</td>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;text-align:right;">${formatCOP(sale.fiadoUsd)}</td>
            </tr></table>
        </div>` : '';

    // Generar bloque de totales con desglose de IVA y otros impuestos dinámico
    const hasTaxes = (sale.ivaAmount || 0) > 0;
    const baseBeforeTaxes = sale.totalUsd - (sale.ivaAmount || 0);

    let taxesHtml = '';
    if (hasTaxes) {
        if (sale.taxBreakdown && Object.keys(sale.taxBreakdown).length > 0) {
            taxesHtml = `
            <tr>
                <td style="text-align:left; padding:2px 0; color:#555;">Base Gravable:</td>
                <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(baseBeforeTaxes)}</td>
            </tr>`;
            Object.entries(sale.taxBreakdown).forEach(([taxKey, taxVal]) => {
                if (taxVal > 0) {
                    const config = useTablesStore.getState().config;
                    const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                    taxesHtml += `
                    <tr>
                        <td style="text-align:left; padding:2px 0; color:#555;">${taxLabel}:</td>
                        <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(taxVal)}</td>
                    </tr>`;
                }
            });
        } else {
            // Fallback retrocompatible para ventas antiguas
            taxesHtml = `
            <tr>
                <td style="text-align:left; padding:2px 0; color:#555;">Base Gravable:</td>
                <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(baseBeforeTaxes)}</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:2px 0; color:#555;">IVA (${sale.ivaRate || 19}%):</td>
                <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(sale.ivaAmount || 0)}</td>
            </tr>`;
        }
    }

    const totalsBreakdownHtml = `
        <table style="width:100%; font-size:${fSmall}; margin-bottom:6px; border-collapse:collapse;">
            ${sale.discountAmountUsd > 0 ? `
            <tr>
                <td style="text-align:left; padding:2px 0; color:#555;">Subtotal Carrito:</td>
                <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(sale.cartSubtotalUsd || (sale.totalUsd + sale.discountAmountUsd))}</td>
            </tr>
            <tr>
                <td style="text-align:left; padding:2px 0; color:#dc3545;">${sale.discountType === 'percentage' ? `Descuento (${sale.discountValue}%):` : 'Descuento:'}</td>
                <td style="text-align:right; padding:2px 0; color:#dc3545; font-weight:bold;">-${formatCOP(sale.discountAmountUsd)}</td>
            </tr>
            ` : ''}
            
            ${taxesHtml}
        </table>
    `;

    // Totales consolidando abonos previos si existen
    let totalsBlockHtml = '';
    if (hasPriorAbonos) {
        const consumoBruto = sale.totalCop || sale.totalUsd || 0;
        const netoPagado = Math.max(0, consumoBruto - priorAbonoTotal);
        totalsBlockHtml = `
            <table style="width:100%; font-size:${fSmall}; margin-bottom:6px; border-collapse:collapse;">
                <tr>
                    <td style="text-align:left; padding:2px 0; color:#555;">TOTAL CONSUMO:</td>
                    <td style="text-align:right; padding:2px 0; font-weight:bold;">${formatCOP(consumoBruto)}</td>
                </tr>
                <tr>
                    <td style="text-align:left; padding:2px 0; color:#dc3545;">ABONOS PREVIOS:</td>
                    <td style="text-align:right; padding:2px 0; color:#dc3545; font-weight:bold;">-${formatCOP(priorAbonoTotal)}</td>
                </tr>
            </table>
            <div class="center bold" style="font-size:${fSmall};color:#000;margin-bottom:4px;">NETO PAGADO EN CIERRE</div>
            <div class="total-usd">${formatCOP(netoPagado)}</div>
        `;
    } else {
        totalsBlockHtml = `
            <div class="center bold" style="font-size:${fSmall};color:#000;margin-bottom:4px;">TOTAL A PAGAR</div>
            <div class="total-usd">${formatCOP(totalDisplay)}</div>
        `;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket #${saleNum}</title>
<style>
    @page {
        size: ${cssPageSize};
        margin: 0;
    }
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-weight: 900 !important;
        color: #000 !important;
    }
    body {
        font-family: Arial, Helvetica, sans-serif;
        width: ${cssBodyWidth};
        max-width: ${cssBodyWidth};
        margin: 0 auto;
        padding: 4mm 1.5mm;
        color: #000;
        background: #fff;
        font-weight: 900;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .dash {
        border: none;
        border-top: 1.5px solid #000;
        margin: 3px 0;
    }
    .total-usd {
        font-size: ${fTotalU};
        font-weight: 900;
        color: #107c41;
        text-align: center;
        margin: 4px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td:last-child, th:last-child { white-space: nowrap !important; }
    @media print {
        body { width: ${cssBodyWidth}; max-width: ${cssBodyWidth}; }
    }
    @media screen {
        body {
            border: 1px solid #ccc;
            margin-top: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
    }
</style>
</head>
<body>
    <!-- Logo -->
    <div class="center" style="margin-bottom:6px;">
        <img src="/logo-ticket.png" alt="Logo" style="max-width:${cssLogoW};max-height:22mm;" onerror="this.style.display='none'">
    </div>

    <!-- Info del Negocio -->
    <div class="center" style="margin-bottom:6px;line-height:1.2;">
        ${settings.name ? `<div class="bold" style="font-size:${fTitle};text-transform:uppercase;">${settings.name}</div>` : ''}
        ${settings.rif ? `<div style="font-size:${fTiny};">NIT: ${settings.rif}</div>` : ''}
        ${settings.address ? `<div style="font-size:${fTiny};">${settings.address}</div>` : ''}
        ${settings.phone ? `<div style="font-size:${fTiny};">Tel: ${settings.phone}</div>` : ''}
        ${settings.instagram ? `<div style="font-size:${fTiny};">Ig: ${settings.instagram}</div>` : ''}
    </div>

    <hr class="dash">

    <!-- Info -->
    <table>
        <tr>
            <td style="font-size:${fSmall};font-weight:bold;">N: #${saleNum}</td>
            <td style="font-size:${fTiny};color:#000;text-align:right;">${fecha} ${hora}</td>
        </tr>
    </table>
    <div style="font-size:${fSmall};margin:3px 0 2px;">
        <span style="font-weight:bold;">Cliente:</span> ${capitalizeName(sale.customerName) || 'Consumidor Final'}
    </div>
    ${sale.tableName ? `<div style="font-size:${fSmall};margin:2px 0;"><span style="font-weight:bold;">Mesa:</span> ${sale.tableName}</div>` : ''}
    ${sale.customerDocument ? `<div style="font-size:${fTiny};color:#000;">NIT/C.C.: ${sale.customerDocument}</div>` : ''}
    ${(sale.meseroNombre || sale.vendedorNombre) && (sale.meseroNombre || sale.vendedorNombre) !== 'Sistema' ? `<div style="font-size:${fTiny};color:#000;"><span style="font-weight:bold;">Atendido:</span> ${capitalizeName(sale.meseroNombre || sale.vendedorNombre)}</div>` : ''}

    <hr class="dash">

    <!-- Productos -->
    <table style="width:100%; border-collapse:collapse; margin-bottom:4px;">
        <thead>
            <tr style="font-size:${fTiny};color:#000;font-weight:bold;border-bottom:1px solid #000;">
                <th style="text-align:left;width:12%;padding:2px 0;font-weight:bold;">CANT</th>
                <th style="text-align:left;width:53%;padding:2px 0 2px 6px;font-weight:bold;">DESCRIPCION</th>
                <th style="text-align:right;width:35%;padding:2px 0;font-weight:bold;">IMPORTE</th>
            </tr>
        </thead>
        <tbody>
            ${itemsHtml}
        </tbody>
    </table>

    <hr class="dash">

    <!-- Total -->
    <div style="margin:8px 0;">
        ${totalsBreakdownHtml}
        ${totalsBlockHtml}
    </div>

    <hr class="dash">

    <!-- Pagos -->
    ${(sale.payments && sale.payments.length > 0) || hasFiado || hasChange ? `
    <div style="margin:4px 0;">
        <div style="font-size:${fTiny};color:#000;font-weight:bold;margin-bottom:4px;">PAGOS REALIZADOS</div>
        <table>${paymentsHtml}</table>
        ${changeHtml}
        ${fiadoHtml}
    </div>
    <hr class="dash">
    ` : ''}

    <!-- Pie -->
    <div class="center bold" style="font-size:${fBase};margin:8px 0 4px;">Gracias por tu compra!</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        // Fallback: iframe oculto
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:58mm;height:auto;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        iframe.onload = () => {
            setTimeout(() => {
                iframe.contentWindow.print();
                setTimeout(() => document.body.removeChild(iframe), 2000);
            }, 300);
        };
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    let printed = false;
    printWindow.onload = () => {
        setTimeout(() => {
            if (!printed) {
                printed = true;
                printWindow.onafterprint = () => printWindow.close();
                printWindow.print();
            }
        }, 400);
    };

    setTimeout(() => {
        if (!printed) {
            printed = true;
            try {
                printWindow.onafterprint = () => printWindow.close();
                printWindow.print();
            } catch(_) {}
        }
    }, 1500);
}

export async function printThermalDailyClose({
    sales = [],
    allSales = [],
    adjustments = [],
    paymentBreakdown = {},
    topProducts = [],
    todayTotalCOP = 0,
    todayProfit = 0,
    todayItemsSold = 0,
    reconData = null,
    apertura = null,
    totalTax = 0,
    taxBreakdown = {},
    cierreId = null
}) {
    const cfg = getWebSerialConfig();

    // Si la impresora NO es del sistema, intentar imprimir por ESC/POS nativo
    if (cfg.printerType !== 'system') {
        try {
            const printed = await printDailyCloseEscPos({
                sales,
                allSales,
                adjustments,
                paymentBreakdown,
                topProducts,
                todayTotalCOP,
                todayProfit,
                todayItemsSold,
                reconData,
                apertura,
                totalTax,
                taxBreakdown,
                cierreId
            });
            if (printed) return;
        } catch (err) {
            console.error('[Cierre ESC/POS] Error al imprimir, fallback a HTML:', err);
        }
    }

    const settings = {
        name: localStorage.getItem('business_name') || 'Pool Imperial',
        rif: localStorage.getItem('business_rif') || '',
        address: localStorage.getItem('business_address') || '',
        phone: localStorage.getItem('business_phone') || '',
    };

    const now = new Date(cierreId || Date.now());
    const fecha = now.toLocaleDateString('es-CO');
    const hora = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const totalCOP = todayTotalCOP || 0;
    const netCOP = totalCOP - totalTax;

    // Las ventas anuladas no se muestran ni se contabilizan en el cierre
    const visibleSales = allSales.filter(s => s.status !== 'ANULADA');

    const totalUSD = visibleSales
        .filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA')
        .reduce((sum, s) => sum + ((s.totalCop || s.totalUsd || 0) / (s.rate || 4150)), 0);

    // Propinas por personal
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

    // Resumen General HTML
    const resumenGeneralHtml = `
        <div class="section-title">Resumen General</div>
        <table>
            <tr><td>Ventas realizadas:</td><td style="text-align:right;font-weight:bold;">${sales.length}</td></tr>
            <tr><td>Articulos vendidos:</td><td style="text-align:right;font-weight:bold;">${todayItemsSold}</td></tr>
            <tr><td>Ingresos Brutos COP:</td><td style="text-align:right;font-weight:bold;">${formatCOP(totalCOP)}</td></tr>
            <tr><td>Ingresos Netos COP:</td><td style="text-align:right;font-weight:bold;">${formatCOP(netCOP)}</td></tr>
            <tr><td>Ingresos USD equiv.:</td><td style="text-align:right;font-weight:bold;">$ ${totalUSD.toFixed(2)} USD</td></tr>
            <tr><td>Ganancia estimada:</td><td style="text-align:right;font-weight:bold;">${formatCOP(todayProfit)}</td></tr>
        </table>
    `;

    // Pagos por Método HTML
    let pagosMetodoHtml = '';
    const paymentEntries = Object.entries(paymentBreakdown || {}).filter(([, d]) => d.total > 0);
    if (paymentEntries.length > 0) {
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

        pagosMetodoHtml = `
            <div class="section-title">Pagos por Metodo</div>
            <table>
                ${paymentEntries.map(([methodId, d]) => {
                    const label = toTitleCase(getPaymentLabel(methodId, d.label));
                    const count = countMap[methodId] || 0;
                    const countLabel = count > 0 ? ` (${count} ${count === 1 ? 'pago' : 'pagos'})` : '';
                    const isUsd = d.currency === 'USD';
                    const val = isUsd ? `$ ${d.total.toFixed(2)}` : formatCOP(d.total);
                    return `<tr><td>${label}${countLabel}:</td><td style="text-align:right;font-weight:bold;">${val}</td></tr>`;
                }).join('')}
            </table>
        `;
    }

    // Impuestos HTML
    let impuestosHtml = '';
    if (totalTax > 0) {
        impuestosHtml = `
            <div class="section-title">Impuestos Recaudados</div>
            <table>
                <tr><td>Total Impuestos:</td><td style="text-align:right;font-weight:bold;">${formatCOP(totalTax)}</td></tr>
                ${Object.entries(taxBreakdown || {}).map(([key, val]) => {
                    if (val <= 0) return '';
                    const config = useTablesStore.getState().config;
                    const label = key === 'iva_19' ? `IVA ${config?.taxRateIva ?? 19}%` : key === 'impoconsumo_8' ? `Impoconsumo ${config?.taxRateImpoconsumo ?? 8}%` : key;
                    return `<tr><td style="padding-left: 6px; color: #555;">${label}:</td><td style="text-align:right;font-weight:bold;">${formatCOP(val)}</td></tr>`;
                }).join('')}
            </table>
        `;
    }

    // Propinas HTML
    let propinasHtml = '';
    if (tipsUserRows > 0) {
        propinasHtml = `
            <div class="section-title">Propinas por Personal</div>
            <table>
                ${Object.entries(tipsByUser).map(([user, total]) => `
                    <tr><td>${user}:</td><td style="text-align:right;font-weight:bold;">${formatCOP(total)}</td></tr>
                `).join('')}
                <tr style="border-top:1px dashed #555;font-weight:bold;"><td>Total Propinas:</td><td style="text-align:right;color:#2563eb;">${formatCOP(totalTips)}</td></tr>
            </table>
        `;
    }

    // Cuadre HTML
    let cuadreHtml = '';
    if (reconData) {
        const openingCOP = apertura?.openingCOP || apertura?.openingUsd || 0;
        const openingUSD = apertura?.openingBs || 0;

        const expectedCOP = (paymentBreakdown['efectivo']?.total || 0) + (paymentBreakdown['efectivo_cop']?.total || 0) + (paymentBreakdown['_vuelto_cop']?.total || 0) + openingCOP;
        const declaredCOP = reconData.declaredCop || reconData.declaredCOP || 0;
        const diffCOP = declaredCOP - expectedCOP;

        const expectedUSD = (paymentBreakdown['efectivo_usd']?.total || 0) + openingUSD;
        const declaredUSD = reconData.declaredUsd || reconData.declaredUSD || 0;
        const diffUSD = declaredUSD - expectedUSD;

        const getDiffStyle = (val) => val >= 0 ? 'color:#107c41;' : 'color:#dc3545;';

        cuadreHtml = `
            <div class="section-title">Cuadre de Caja</div>
            <table>
                <tr><td>Fondo inicial COP:</td><td style="text-align:right;">${formatCOP(openingCOP)}</td></tr>
                <tr><td>COP Esperado:</td><td style="text-align:right;">${formatCOP(expectedCOP)}</td></tr>
                <tr><td>COP Declarado:</td><td style="text-align:right;font-weight:bold;">${formatCOP(declaredCOP)}</td></tr>
                <tr style="font-weight:bold;${getDiffStyle(diffCOP)}"><td>COP Diferencia:</td><td style="text-align:right;">${diffCOP >= 0 ? '+' : ''}${formatCOP(diffCOP)}</td></tr>
                
                <tr><td style="padding-top:4px;">Fondo inicial USD:</td><td style="text-align:right;padding-top:4px;">$ ${openingUSD.toFixed(2)}</td></tr>
                <tr><td>USD Esperado:</td><td style="text-align:right;">$ ${expectedUSD.toFixed(2)}</td></tr>
                <tr><td>USD Declarado:</td><td style="text-align:right;font-weight:bold;">$ ${declaredUSD.toFixed(2)}</td></tr>
                <tr style="font-weight:bold;${getDiffStyle(diffUSD)}"><td>USD Diferencia:</td><td style="text-align:right;">${diffUSD >= 0 ? '+' : ''}$ ${diffUSD.toFixed(2)}</td></tr>
            </table>
        `;
    }

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

    // Movimientos de Productos HTML
    let prodMovementsHtml = '';
    if (prodMovements.length > 0) {
        prodMovementsHtml = `
            <div class="section-title">Movimientos de Productos</div>
            <table style="font-size: 10px;">
                <tr style="border-bottom: 1px dashed #555;font-weight:bold;">
                    <td>Producto</td><td style="text-align:right;">Ent</td><td style="text-align:right;">Sal</td>
                </tr>
                ${prodMovements.map(m => `
                    <tr>
                         <td>${m.name.length > 18 ? m.name.substring(0, 18) + '…' : m.name}</td>
                         <td style="text-align:right;color:${m.entrada > 0 ? '#107c41' : '#555'};font-weight:bold;">${m.entrada > 0 ? '+' + m.entrada : '-'}</td>
                         <td style="text-align:right;color:${m.salida > 0 ? '#dc3545' : '#555'};font-weight:bold;">${m.salida > 0 ? '-' + m.salida : '-'}</td>
                    </tr>
                `).join('')}
            </table>
        `;
    }

    // Articles Sold HTML
    let topProductsHtml = '';
    if (topProducts && topProducts.length > 0) {
        topProductsHtml = `
            <div class="section-title">Articulos Vendidos</div>
            <table style="font-size: 10px;">
                <tr style="border-bottom: 1px dashed #555;font-weight:bold;">
                    <td>Cant</td><td>Producto</td><td style="text-align:right;">Ingreso</td>
                </tr>
                ${topProducts.map(p => `
                    <tr>
                         <td>${p.qty}u</td>
                         <td>${p.name.length > 18 ? p.name.substring(0, 18) + '…' : p.name}</td>
                         <td style="text-align:right;font-weight:bold;">${formatCOP(p.revenue)}</td>
                    </tr>
                `).join('')}
            </table>
        `;
    }

    // Sales History HTML
    let salesHistoryHtml = '';
    if (visibleSales.length > 0) {
        salesHistoryHtml = `
            <div class="section-title">Historial de Ventas</div>
            <table style="font-size: 9px; line-height: 1.1;">
                <tr style="border-bottom: 1px dashed #555;font-weight:bold;">
                    <td>Ref</td><td>Atend.</td><td style="text-align:right;">Total</td>
                </tr>
                ${visibleSales.map(s => {
                    const ref = String(s.saleNumber || 0).padStart(4, '0');
                    const staff = (s.meseroNombre || s.vendedorNombre || 'Sistema').substring(0, 8);
                    const amountStr = formatCOP(s.totalCop || s.totalUsd);
                    return `
                        <tr>
                            <td>#${ref}</td>
                            <td>${staff}</td>
                            <td style="text-align:right;font-weight:bold;">${amountStr}</td>
                        </tr>
                    `;
                }).join('')}
            </table>
        `;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Cierre de Caja</title>
<style>
    @page {
        size: 58mm auto;
        margin: 0;
    }
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-weight: 900 !important;
        color: #000 !important;
    }
    body {
        font-family: Arial, Helvetica, sans-serif;
        width: 46mm;
        max-width: 46mm;
        margin: 0 auto;
        padding: 4mm 1.5mm;
        color: #000;
        background: #fff;
        font-weight: 900;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        line-height: 1.3;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .dash {
        border: none;
        border-top: 1.5px solid #000;
        margin: 4px 0;
    }
    .section-title {
        font-size: 9.5px;
        font-weight: bold;
        color: #000;
        margin: 8px 0 3px;
        text-transform: uppercase;
        border-bottom: 1.5px solid #000;
        padding-bottom: 1px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    td { font-size: 10px; padding: 1.5px 0; vertical-align: top; }
    td:last-child, th:last-child { white-space: nowrap !important; }
</style>
</head>
<body>
    <!-- Logo -->
    <div class="center" style="margin-bottom:6px;">
        <img src="/logo-ticket.png" alt="Logo" style="max-width:42mm;max-height:22mm;" onerror="this.style.display='none'">
    </div>

    <!-- Info del Negocio -->
    <div class="center" style="margin-bottom:6px;line-height:1.2;">
        ${settings.name ? `<div class="bold" style="font-size:13px;text-transform:uppercase;">${settings.name}</div>` : ''}
        ${settings.rif ? `<div style="font-size:9px;">NIT: ${settings.rif}</div>` : ''}
        ${settings.address ? `<div style="font-size:9px;">${settings.address}</div>` : ''}
        ${settings.phone ? `<div style="font-size:9px;">Tel: ${settings.phone}</div>` : ''}
    </div>

    <div class="center bold" style="font-size:12px;margin:8px 0 4px;">CIERRE DE CAJA</div>
    <div class="center" style="font-size:9.5px;color:#555;">${fecha} ${hora}</div>

    <hr class="dash">

    ${resumenGeneralHtml}
    <hr class="dash">
    
    ${pagosMetodoHtml}
    ${pagosMetodoHtml ? '<hr class="dash">' : ''}

    ${impuestosHtml}
    ${impuestosHtml ? '<hr class="dash">' : ''}

    ${propinasHtml}
    ${propinasHtml ? '<hr class="dash">' : ''}

    ${cuadreHtml}
    ${cuadreHtml ? '<hr class="dash">' : ''}

    ${prodMovementsHtml}
    ${prodMovementsHtml ? '<hr class="dash">' : ''}

    ${topProductsHtml}
    ${topProductsHtml ? '<hr class="dash">' : ''}

    ${salesHistoryHtml}
    <hr class="dash">

    <!-- Pie -->
    <div class="center bold" style="font-size:11px;margin:8px 0 4px;">Pool Imperial</div>
    <div class="center" style="font-size:8px;color:#555;font-weight:normal;">Reporte generado automáticamente · Sin valor fiscal</div>
    <div style="height: 35px;"></div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:58mm;height:auto;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        iframe.onload = () => {
            setTimeout(() => {
                iframe.contentWindow.print();
                setTimeout(() => document.body.removeChild(iframe), 2000);
            }, 300);
        };
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    let printed = false;
    printWindow.onload = () => {
        setTimeout(() => {
            if (!printed) {
                printed = true;
                printWindow.onafterprint = () => printWindow.close();
                printWindow.print();
            }
        }, 400);
    };

    setTimeout(() => {
        if (!printed) {
            printed = true;
            try {
                printWindow.onafterprint = () => printWindow.close();
                printWindow.print();
            } catch(_) {}
        }
    }, 1500);
}
