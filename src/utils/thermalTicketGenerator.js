import { capitalizeName } from './calculatorUtils';
import { printReceiptEscPos, getWebSerialConfig } from '../services/webSerialPrinter';
import { showToast } from '../components/Toast';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Imprime un ticket de venta en COP.
 * - Impresora del sistema: va directo a window.print()
 * - Impresora térmica configurada: ESC/POS directo, sin diálogo
 */
export async function printThermalTicket(sale, bcvRate) {
    const cfg = getWebSerialConfig();

    // Impresora del sistema → diálogo del sistema
    if (cfg.printerType === 'system') {
        _printThermalHTML(sale, bcvRate);
        return;
    }

    // Impresora térmica → ESC/POS directo
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
    const cssBodyWidth = '48mm';
    const cssLogoW = '44mm';
    const fDisclaimer = '7.5px';
    const fTiny = '9px';     // Secundaria (detalles, NIT, c/u)
    const fSmall = '10px';   // Info general (fechas, nro)
    const fBase = '11px';    // Primaria (Items, label totales)
    const fTitle = '14px';   // Nombre negocio
    const fTotalU = '22px';  // Total COP
    const hasFiado = (sale.fiadoUsd || 0) > 0;

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
        const unit = item.isWeight ? 'Kg' : 'u';
        const sub = item.priceUsd * item.qty; // priceUsd almacena COP
        const name = item.name.length > 22 ? item.name.substring(0, 22) + '...' : item.name;
        return `
            <tr>
                <td style="text-align:left;font-size:${fBase};padding:2px 0;">${qty}${unit}</td>
                <td style="text-align:left;font-size:${fBase};padding:2px 0;line-height:1.2;">${name}</td>
                <td style="text-align:right;font-size:${fBase};font-weight:bold;padding:2px 0;">${formatCOP(sub)}</td>
            </tr>
            <tr>
                <td></td>
                <td colspan="2" style="font-size:${fTiny};color:#555;padding:0 0 4px;">${formatCOP(item.priceUsd)} c/u</td>
            </tr>`;
    }).join('');

    // Generar filas de pagos
    const paymentsHtml = (sale.payments || []).map(p => {
        // En Pool Imperial, todos los pagos y montos están en COP
        const amount = p.amountUsd || 0; // Almacenado como amountUsd por compatibilidad
        return `
            <tr>
                <td style="font-size:11px;padding:2px 0;">${p.methodLabel || 'Pago'}</td>
                <td style="font-size:11px;font-weight:bold;text-align:right;padding:2px 0;">${formatCOP(amount)}</td>
            </tr>`;
    }).join('');

    const fiadoHtml = hasFiado ? `
        <div style="margin-top:6px;padding:4px 0;border-top:1px dashed #ccc;">
            <table style="width:100%"><tr>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;">Por pagar (Fiado):</td>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;text-align:right;">${formatCOP(sale.fiadoUsd)}</td>
            </tr></table>
        </div>` : '';

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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: Arial, Helvetica, sans-serif;
        width: ${cssBodyWidth};
        max-width: ${cssBodyWidth};
        margin: 0 auto;
        padding: 4mm 2mm;
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
        border-top: 1px dashed #555;
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
        <img src="/logo-ticket.png" alt="Logo" style="max-width:${cssLogoW};max-height:16mm;" onerror="this.style.display='none'">
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

    <!-- Productos Header -->
    <table style="margin-bottom:4px;">
        <tr style="font-size:${fTiny};color:#000;font-weight:bold;">
            <td style="text-align:left;">CANT</td>
            <td style="text-align:left;">DESCRIPCION</td>
            <td style="text-align:right;">IMPORTE</td>
        </tr>
    </table>

    <!-- Productos -->
    <table>${itemsHtml}</table>

    <hr class="dash">

    <!-- Total -->
    <div style="margin:8px 0;">
        ${sale.discountAmountUsd > 0 ? `
        <table style="margin-bottom:6px; font-size:${fTiny}; border-bottom: 1px dashed #ccc; padding-bottom: 4px;">
            <tr>
                <td style="text-align:left; color:#000; font-weight:bold;">SUBTOTAL:</td>
                <td style="text-align:right; color:#000; font-weight:bold;">${formatCOP(sale.cartSubtotalUsd || (sale.totalUsd + sale.discountAmountUsd))}</td>
            </tr>
            <tr>
                <td style="text-align:left; color:#dc3545; font-weight:bold;">${sale.discountType === 'percentage' ? `DESCUENTO (${sale.discountValue}%):` : 'DESCUENTO:'}</td>
                <td style="text-align:right; color:#dc3545; font-weight:bold;">-${formatCOP(sale.discountAmountUsd)}</td>
            </tr>
        </table>
        ` : ''}
        <div class="center bold" style="font-size:${fSmall};color:#000;margin-bottom:4px;">TOTAL A PAGAR</div>
        <div class="total-usd">${formatCOP(sale.totalUsd || 0)}</div>
    </div>

    <hr class="dash">

    <!-- Pagos -->
    ${(sale.payments && sale.payments.length > 0) || hasFiado ? `
    <div style="margin:4px 0;">
        <div style="font-size:${fTiny};color:#000;font-weight:bold;margin-bottom:4px;">PAGOS REALIZADOS</div>
        <table>${paymentsHtml}</table>
        ${fiadoHtml}
    </div>
    <hr class="dash">
    ` : ''}

    <!-- Pie -->
    <div class="center bold" style="font-size:${fBase};margin:8px 0 4px;">Gracias por tu compra!</div>
    <div class="center" style="font-size:${fDisclaimer};color:#000;margin-top:4px;line-height:1.4;">Este documento no constituye factura fiscal.<br>Comprobante de control interno sin validez tributaria.</div>
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
