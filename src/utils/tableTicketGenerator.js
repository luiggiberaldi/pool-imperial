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

/**
 * Genera e imprime una pre-cuenta para mesa de pool.
 * - Si hay impresora térmica ESC/POS configurada: imprime directo via WebSerial
 *   SIN abrir el cajón de dinero (el cajón solo debe abrirse en ventas exitosas).
 * - Sin impresora térmica: genera PDF via jsPDF + iframe o impresión de ventana directa.
 */
export async function generatePartialSessionTicketPDF({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config, hoursOffset = 0, roundsOffset = 0, products = [] }) {
    // Impresión exclusiva a través de diálogo del sistema (HTML / PDF)

    const seats = session?.seats || [];
    const isMultiClient = seats.length > 1;

    const WIDTH = 58;

    // Calcular datos de pagos previos
    const isPina = session.game_mode === 'PINA';
    const pinaCount = isPina ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
    const hasPinas = isPina || pinaCount > 0;
    const totalHours = Number(session.hours_paid) || 0;
    const hasHours = totalHours > 0;
    const hasPaidBefore = roundsOffset > 0 || hoursOffset > 0;

    // Seat-level charges
    const seatHasPinas = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));

    // ── Generar HTML para impresión directa ────────────────────────────────
    const lines = [];
    const push = (html) => lines.push(html);

    push(`<div class="title">PRE-CUENTA MESA</div>`);
    push(`<div class="subtitle">${table.name.toUpperCase()}</div>`);
    push(`<hr>`);
    const d = new Date();
    push(`<div class="small">Fecha: ${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO')}</div>`);
    if (session?.client_name) push(`<div class="bold">Cliente: ${session.client_name}</div>`);
    if (session?.notes) push(`<div class="note">Nota: ${session.notes.substring(0, 60)}</div>`);
    push(`<hr>`);

    if (isMultiClient) {
        const breakdown = calculateFullTableBreakdown(session, seats, elapsed, config, currentItems, null, null, table.type === 'NORMAL', hoursOffset, roundsOffset, table.type);
        if (breakdown) {
            if (breakdown.sharedTotal > 0) {
                push(`<div class="bold accent">COMPARTIDO</div>`);
                if (hasPinas) {
                    const pp = config?.pricePina || 0;
                    push(`<div class="row"><span>${pinaCount} jugada${pinaCount !== 1 ? 's' : ''} x ${formatCOP(pp)}</span><span>${formatCOP(pinaCount * pp)}</span></div>`);
                }
                if (hasHours) {
                    const ph = config?.pricePerHour || 0;
                    push(`<div class="row"><span>${formatHoursPaid(totalHours)} x ${formatCOP(ph)}</span><span>${formatCOP(totalHours * ph)}</span></div>`);
                }
                breakdown.sharedItems.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(`<div class="row"><span>${i.qty}x ${(i.product_name || '').substring(0, 16)}</span><span>${formatCOP(t)}</span></div>`);
                });
                push(`<div class="muted small">Total compartido: ${formatCOP(breakdown.sharedTotal)} (÷${seats.filter(s => !s.paid).length})</div>`);
                push(`<hr>`);
            }
            breakdown.seats.forEach((sb) => {
                const seatLabel = sb.seat.label || `Cliente ${seats.indexOf(sb.seat) + 1}`;
                push(`<div class="row"><span class="bold accent">${seatLabel.toUpperCase()}</span>${sb.seat.paid ? '<span class="muted">PAGADO</span>' : ''}</div>`);
                if (sb.timeCost.total > 0) {
                    if (sb.timeCost.hasPinas) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'pina') || [];
                        const pp = config?.pricePina || 0;
                        push(`<div class="row"><span>${tc.length} jugada${tc.length !== 1 ? 's' : ''} x ${formatCOP(pp)}</span><span>${formatCOP(sb.timeCost.pinaCost)}</span></div>`);
                    }
                    if (sb.timeCost.hasHours) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'hora') || [];
                        const totalH = tc.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                        const ph = config?.pricePerHour || 0;
                        push(`<div class="row"><span>${formatHoursPaid(totalH)} x ${formatCOP(ph)}</span><span>${formatCOP(sb.timeCost.hourCost)}</span></div>`);
                    }
                }
                sb.items.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(`<div class="row"><span>${i.qty}x ${(i.product_name || '').substring(0, 16)}</span><span>${formatCOP(t)}</span></div>`);
                });
                if (sb.sharedPortion > 0 && !sb.seat.paid) {
                    push(`<div class="row muted small"><span>Parte compartida</span><span>${formatCOP(sb.sharedPortion)}</span></div>`);
                }
                push(`<div class="row bold"><span>Subtotal:</span><span>${formatCOP(sb.subtotal)}</span></div>`);
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
            push(`<div class="bold">Partidas (La Jugada)</div>`);
            push(`<div class="row"><span>${totalPinas} jugada${totalPinas !== 1 ? 's' : ''} x ${formatCOP(pricePerPina)}</span><span>${formatCOP(fullCost)}</span></div>`);
            if (roundsOffset > 0) {
                push(`<div class="row muted"><span>Pagado (${roundsOffset} jugada${roundsOffset !== 1 ? 's' : ''})</span><span>-${formatCOP(paidCost)}</span></div>`);
            }
        }

        // HORAS
        if (hasHours || seatHasHours) {
            const pricePerHour = config?.pricePerHour || 0;
            const seatHoursTotal = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (Number(tc.amount) || 0), 0), 0);
            const combinedHours = totalHours + seatHoursTotal;
            const fullCost = round2(combinedHours * pricePerHour);
            const paidCost = round2(hoursOffset * pricePerHour);
            push(`<div class="bold">Tiempo de Mesa</div>`);
            push(`<div class="row"><span>${formatHoursPaid(combinedHours)} x ${formatCOP(pricePerHour)}</span><span>${formatCOP(fullCost)}</span></div>`);
            if (hoursOffset > 0) {
                push(`<div class="row muted"><span>Pagado (${formatHoursPaid(hoursOffset)})</span><span>-${formatCOP(paidCost)}</span></div>`);
            }
        }

        // CONSUMO
        if (currentItems.length > 0) {
            push(`<div class="bold">Consumo Bar</div>`);
            currentItems.forEach(i => {
                const t = i.qty * i.unit_price_usd;
                push(`<div class="row"><span>${i.qty}x ${i.product_name.substring(0, 16)}</span><span>${formatCOP(t)}</span></div>`);
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
        push(`<div class="row small"><span>Base Gravable:</span><span>${formatCOP(baseBeforeTaxes)}</span></div>`);
        Object.entries(taxBreakdown).forEach(([taxKey, taxVal]) => {
            if (taxVal > 0) {
                const config = useTablesStore.getState().config;
                const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                push(`<div class="row small"><span>${taxLabel}:</span><span>${formatCOP(taxVal)}</span></div>`);
            }
        });
        push(`<hr>`);
    }

    const totalLabel = hasPaidBefore ? "TOTAL PENDIENTE:" : "TOTAL ESTIMADO:";
    push(`<table class="total-table"><tr><td>${totalLabel}</td><td>${formatCOP(grandTotal)}</td></tr></table>`);

    push(`<div class="center disclaimer">*** NO ES RECIBO DE PAGO ***</div>`);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 58mm auto; margin: 2mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 54mm; max-width: 54mm; min-width: 54mm; margin: 0 auto; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #212529; padding: 2mm 1mm; font-weight: 900; }
.title { text-align: center; font-weight: bold; font-size: 11pt; }
.subtitle { text-align: center; font-weight: bold; font-size: 9pt; margin-bottom: 2mm; }
hr { border: none; border-top: 1px dashed #999; margin: 1.5mm 0; }
.row { display: flex; justify-content: space-between; align-items: baseline; line-height: 1.5; gap: 2mm; flex-wrap: nowrap; }
.row span:first-child { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row span:last-child { white-space: nowrap; text-align: right; }
.bold { font-weight: bold; }
.small { font-size: 7pt; }
.note { font-size: 7pt; }
.muted { color: #555; }
.accent { color: #1d4e89; }
.center { text-align: center; }
.total-table { width: 100%; border-collapse: collapse; margin-top: 1mm; }
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
