import { printPreCuentaEscPos, getWebSerialConfig } from '../services/webSerialPrinter';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { calculateSessionCostBreakdown, formatHoursPaid, calculateFullTableBreakdown, buildTableSyntheticCart } from './tableBillingEngine';
import { round2 } from './dinero';
import { FinancialEngine } from '../core/FinancialEngine';

const formatCOP = (val) => {
    const rawVal = Math.round(val || 0);
    const absVal = Math.abs(rawVal).toLocaleString('es-CO');
    return rawVal < 0 ? `-$ ${absVal}` : `$ ${absVal}`;
};

/** Helper: genera una fila de 2 columnas como tabla para evitar wrapping a 58mm */
const itemRow = (label, price, extraClass = '') =>
    `<table class="item-row${extraClass ? ' ' + extraClass : ''}"><tr><td class="item-label">${label}</td><td class="item-price">${price}</td></tr></table>`;

/**
 * Genera e imprime una pre-cuenta para mesa de pool.
 * - Sin impresora térmica: genera PDF via ventana directa anclada a 58mm.
 */
export async function generatePartialSessionTicketPDF({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config, hoursOffset = 0, roundsOffset = 0, products = [] }) {
    // Impresión exclusiva a través de diálogo del sistema (HTML / PDF)

    const seats = session?.seats || [];
    const isMultiClient = seats.length > 1;

    // Parse abono payload
    const isAbono = session?.notes && session.notes.includes('|||ABONO:');
    const isAbonoMonto = session?.notes && session.notes.includes('|||ABONO_MONTO:');
    const isAnyAbono = isAbono || isAbonoMonto;

    let abonoItems = [];
    let abonoMonto = null;

    if (isAbono) {
        try {
            abonoItems = JSON.parse(session.notes.split('|||ABONO:')[1].split('|||')[0].trim());
        } catch (_) {}
    } else if (isAbonoMonto) {
        try {
            abonoMonto = JSON.parse(session.notes.split('|||ABONO_MONTO:')[1].split('|||')[0].trim());
        } catch (_) {}
    }

    const itemsToPrint = isAbono ? abonoItems : currentItems;
    const finalGrandTotal = isAbono 
        ? round2(abonoItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0))
        : (isAbonoMonto ? (abonoMonto?.amount || 0) : grandTotal);

    // Parse abono history
    let historialAbonos = [];
    if (session?.notes && session.notes.includes('|||HISTORIAL_ABONOS:')) {
        try {
            const histStr = session.notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim();
            historialAbonos = JSON.parse(histStr);
        } catch (_) {}
    }

    const displayNotes = session?.notes 
        ? session.notes.split('|||')[0].trim()
        : '';

    // Calcular datos de pagos previos
    const isPina = session.game_mode === 'PINA';
    const pinaCount = isPina ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
    const hasPinas = isPina || pinaCount > 0;
    const totalHours = Number(session.hours_paid) || 0;
    const hasHours = totalHours > 0;
    const hasPaidBefore = roundsOffset > 0 || hoursOffset > 0 || historialAbonos.length > 0;

    // Seat-level charges
    const seatHasPinas = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));

    // ── Generar HTML para impresión directa ────────────────────────────────
    const lines = [];
    const push = (html) => lines.push(html);

    push(`<div class="title">${isAnyAbono ? 'PRE-CUENTA DE ABONO' : 'PRE-CUENTA MESA'}</div>`);
    push(`<div class="subtitle">${table.name.toUpperCase()}</div>`);
    push(`<hr>`);
    const d = new Date();
    push(`<div class="small">Fecha: ${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO')}</div>`);
    if (session?.client_name) push(`<div class="bold">Cliente: ${session.client_name}</div>`);
    if (displayNotes) push(`<div class="note">Nota: ${displayNotes.substring(0, 60)}</div>`);
    push(`<hr>`);

    if (isAbono) {
        push(`<div class="section-title">Abono Solicitado</div>`);
        itemsToPrint.forEach(i => {
            const t = i.qty * i.unit_price_usd;
            push(itemRow(`${i.qty}x ${i.product_name.substring(0, 18)}`, formatCOP(t)));
        });
    } else if (isAbonoMonto) {
        push(`<div class="section-title">Abono Solicitado</div>`);
        push(itemRow(`Abono por Monto Libre`, formatCOP(abonoMonto?.amount || 0)));
    } else if (isMultiClient) {
        const breakdown = calculateFullTableBreakdown(session, seats, elapsed, config, currentItems, null, null, table.type === 'NORMAL', hoursOffset, roundsOffset, table.type);
        if (breakdown) {
            if (breakdown.sharedTotal > 0) {
                push(`<div class="section-title accent">COMPARTIDO</div>`);
                if (hasPinas) {
                    const pp = config?.pricePina || 0;
                    push(itemRow(`${pinaCount} jugada${pinaCount !== 1 ? 's' : ''} x ${formatCOP(pp)}`, formatCOP(pinaCount * pp)));
                }
                if (hasHours) {
                    const ph = config?.pricePerHour || 0;
                    push(itemRow(`${formatHoursPaid(totalHours)} x ${formatCOP(ph)}`, formatCOP(totalHours * ph)));
                }
                breakdown.sharedItems.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(itemRow(`${i.qty}x ${(i.product_name || '').substring(0, 18)}`, formatCOP(t)));
                });
                push(`<div class="muted small">Total compartido: ${formatCOP(breakdown.sharedTotal)} (÷${seats.filter(s => !s.paid).length})</div>`);
                push(`<hr>`);
            }
            breakdown.seats.forEach((sb) => {
                const seatLabel = sb.seat.label || `Cliente ${seats.indexOf(sb.seat) + 1}`;
                push(itemRow(`<span class="bold accent">${seatLabel.toUpperCase()}</span>`, sb.seat.paid ? `<span class="muted">PAGADO</span>` : ''));
                if (sb.timeCost.total > 0) {
                    if (sb.timeCost.hasPinas) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'pina') || [];
                        const pp = config?.pricePina || 0;
                        push(itemRow(`${tc.length} jugada${tc.length !== 1 ? 's' : ''} x ${formatCOP(pp)}`, formatCOP(sb.timeCost.pinaCost)));
                    }
                    if (sb.timeCost.hasHours) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'hora') || [];
                        const totalH = tc.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                        const ph = config?.pricePerHour || 0;
                        push(itemRow(`${formatHoursPaid(totalH)} x ${formatCOP(ph)}`, formatCOP(sb.timeCost.hourCost)));
                    }
                }
                sb.items.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(itemRow(`${i.qty}x ${(i.product_name || '').substring(0, 18)}`, formatCOP(t)));
                });
                if (sb.sharedPortion > 0 && !sb.seat.paid) {
                    push(itemRow('Parte compartida', formatCOP(sb.sharedPortion), 'muted small'));
                }
                push(itemRow('Subtotal:', formatCOP(sb.subtotal), 'bold'));
                push(`<hr>`);
            });
        }
    } else {
        // PIÑAS
        if (hasPinas || seatHasPinas) {
            const pricePerPina = config?.pricePina || 0;
            const seatPinas = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
            const totalPinas = pinaCount + seatPinas;
            const fullCost = round2(totalPinas * pricePerPina);
            const paidCost = round2(roundsOffset * pricePerPina);
            push(`<div class="section-title">Partidas (La Jugada)</div>`);
            push(itemRow(`${totalPinas} jugada${totalPinas !== 1 ? 's' : ''} x ${formatCOP(pricePerPina)}`, formatCOP(fullCost)));
            if (roundsOffset > 0) {
                push(itemRow(`Pagado (${roundsOffset} jugada${roundsOffset !== 1 ? 's' : ''})`, `-${formatCOP(paidCost)}`, 'muted'));
            }
        }

        // HORAS
        if (hasHours || seatHasHours) {
            const pricePerHour = config?.pricePerHour || 0;
            const seatHoursTotal = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (Number(tc.amount) || 0), 0), 0);
            const combinedHours = totalHours + seatHoursTotal;
            const fullCost = round2(combinedHours * pricePerHour);
            const paidCost = round2(hoursOffset * pricePerHour);
            push(`<div class="section-title">Tiempo de Mesa</div>`);
            push(itemRow(`${formatHoursPaid(combinedHours)} x ${formatCOP(pricePerHour)}`, formatCOP(fullCost)));
            if (hoursOffset > 0) {
                push(itemRow(`Pagado (${formatHoursPaid(hoursOffset)})`, `-${formatCOP(paidCost)}`, 'muted'));
            }
        }

        // CONSUMO
        if (currentItems.length > 0) {
            push(`<div class="section-title">Consumo Bar</div>`);
            currentItems.forEach(i => {
                const t = i.qty * i.unit_price_usd;
                push(itemRow(`${i.qty}x ${i.product_name.substring(0, 18)}`, formatCOP(t)));
            });
        }
    }

    let baseBeforeTaxes = grandTotal;
    let totalTax = 0;
    let taxBreakdown = {};

    try {
        const { syntheticCart } = buildTableSyntheticCart(
            { table, session, elapsed, currentItems, grandTotal, paidHoursOffsets: { [session?.id]: hoursOffset }, paidRoundsOffsets: { [session?.id]: roundsOffset } },
            config,
            products || []
        );
        const totals = FinancialEngine.buildCartTotals(syntheticCart, { active: false }, 1, 1);
        totalTax = totals.totalTax;
        baseBeforeTaxes = grandTotal - totalTax;
        taxBreakdown = totals.taxBreakdown;
    } catch (e) {
        console.error('[generatePartialSessionTicketPDF] Error building synthetic cart taxes:', e);
    }

    push(`<hr>`);
    if (totalTax > 0) {
        push(itemRow('Base Gravable:', formatCOP(baseBeforeTaxes), 'small'));
        Object.entries(taxBreakdown).forEach(([taxKey, taxVal]) => {
            if (taxVal > 0) {
                const config = useTablesStore.getState().config;
                const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                push(itemRow(`${taxLabel}:`, formatCOP(taxVal), 'small'));
            }
        });
        push(`<hr>`);
    }

    const totalLabel = isAbono ? 'TOTAL ABONO:' : (hasPaidBefore ? 'TOTAL PENDIENTE:' : 'TOTAL ESTIMADO:');
    push(`<table class="total-table"><tr><td>${totalLabel}</td><td>${formatCOP(isAbono ? finalGrandTotal : grandTotal)}</td></tr></table>`);

    if (historialAbonos.length > 0) {
        push(`<hr>`);
        push(`<div class="section-title center accent">=== HISTORIAL DE ABONOS ===</div>`);
        historialAbonos.forEach((item, index) => {
            let formattedDate = '';
            try {
                const dateObj = new Date(item.date);
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const year = dateObj.getFullYear();
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
            } catch (_) {
                formattedDate = item.date || '';
            }
            push(itemRow(`${index + 1}. ${item.method} (${formattedDate})`, formatCOP(item.amount), 'small'));
        });
        const totalAbonosSum = historialAbonos.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        push(itemRow('Total Abonado:', formatCOP(totalAbonosSum), 'bold'));
    }

    push(`<div class="center disclaimer">*** NO ES RECIBO DE PAGO ***</div>`);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 58mm auto; margin: 2mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 54mm; max-width: 54mm; min-width: 54mm; margin: 0 auto; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #212529; padding: 2mm 1mm; font-weight: 700; }
.title { text-align: center; font-weight: bold; font-size: 11pt; }
.subtitle { text-align: center; font-weight: bold; font-size: 9pt; margin-bottom: 2mm; }
hr { border: none; border-top: 1px dashed #999; margin: 1.5mm 0; }
.section-title { font-weight: bold; margin-top: 1mm; }
.bold { font-weight: bold; }
.small { font-size: 7pt; }
.note { font-size: 7pt; }
.muted { color: #555; }
.accent { color: #1d4e89; }
.center { text-align: center; }
.item-row { width: 100%; border-collapse: collapse; margin: 0; }
.item-row td { font-size: 8pt; vertical-align: top; padding: 1px 0; }
.item-row td.item-label { width: 65%; white-space: normal; word-break: break-word; }
.item-row td.item-price { width: 35%; text-align: right; white-space: nowrap; font-weight: bold; }
.item-row.bold td { font-weight: bold; }
.item-row.muted td { color: #555; }
.item-row.small td { font-size: 7pt; }
.total-table { width: 100%; border-collapse: collapse; margin-top: 1.5mm; }
.total-table td { font-size: 9pt; font-weight: bold; vertical-align: middle; white-space: nowrap; }
.total-table td:first-child { width: 55%; }
.total-table td:last-child { text-align: right; width: 45%; }
.disclaimer { margin-top: 3mm; font-size: 7pt; text-align: center; }
@media screen { html, body { width: 54mm; max-width: 54mm; } }
@media print { @page { size: 58mm auto; margin: 2mm; } html, body { width: 54mm; max-width: 54mm; } }
</style></head><body>${lines.join('')}</body></html>`;

    // 58mm a 96dpi ≈ 219px de contenido + ~20px de chrome del navegador = 240px
    const printWindow = window.open('', '_blank', 'width=240,height=650,resizable=no,scrollbars=yes');
    if (!printWindow) {
        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => iframe.remove(), 5000);
        }, 300);
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
