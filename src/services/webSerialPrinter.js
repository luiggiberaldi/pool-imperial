/**
 * webSerialPrinter.js
 * Servicio de integración nativa con impresoras térmicas USB/Serial mediante Web Serial API.
 * Incluye auto-detección de modelo por VID/PID.
 *
 * ESC/POS Comandos Básicos
 * Init: [27, 64]
 * Open Drawer: [27, 112, 0, 50, 250]
 */

import { capitalizeName } from '../utils/calculatorUtils';
import { lookupPrinter } from './printerDatabase';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { formatHoursPaid, formatElapsedTime, calculateFullTableBreakdown, buildTableSyntheticCart } from '../utils/tableBillingEngine';
import { round2 } from '../utils/dinero';
import { FinancialEngine } from '../core/FinancialEngine';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';

const formatCOP = (val) => {
    const rawVal = Math.round(val || 0);
    const absVal = Math.abs(rawVal).toLocaleString('es-CO');
    return rawVal < 0 ? `-$${absVal}` : `$${absVal}`;
};

let activePort = null;
let _cachedPort = null;

// ── Config ────────────────────────────────────────────────────────────────────

export function getWebSerialConfig() {
    try {
        const saved = localStorage.getItem('web_serial_config');
        const defaults = { autoOpenDrawer: false, baudRate: 9600, printerType: 'system', printerBrand: 'Impresora del Sistema', printerModel: 'Driver del Sistema', paperWidth: 58 };
        if (!saved) return defaults;
        const parsed = JSON.parse(saved);
        // Si no hay tipo guardado, forzar sistema
        if (!parsed.printerType) return { ...defaults, ...parsed, printerType: 'system', printerBrand: 'Impresora del Sistema', printerModel: 'Driver del Sistema' };
        return { ...defaults, ...parsed };
    } catch {
        return { autoOpenDrawer: false, baudRate: 9600, printerType: 'system', printerBrand: 'Impresora del Sistema', printerModel: 'Driver del Sistema', paperWidth: 58 };
    }
}

export function saveWebSerialConfig(cfg) {
    localStorage.setItem('web_serial_config', JSON.stringify(cfg));
}

export function clearPrinterConfig() {
    const cfg = getWebSerialConfig();
    saveWebSerialConfig({ ...cfg, printerType: null, printerBrand: null, printerModel: null });
    activePort = null;
    _cachedPort = null;
}

// ── Port management ───────────────────────────────────────────────────────────

export async function requestPrinterPort() {
    if (!('serial' in navigator)) {
        throw new Error('Web Serial API NO soportada. Usa Chrome o Edge.');
    }
    try {
        const port = await navigator.serial.requestPort();
        activePort = port;
        _cachedPort = port;
        return port;
    } catch (err) {
        if (err.name === 'NotFoundError') throw new Error('Cancelaste la selección del puerto.');
        throw err;
    }
}

export async function getConnectedPrinter() {
    if (!('serial' in navigator)) return null;
    // Reutilizar el puerto cacheado si ya fue autorizado en esta sesión
    if (activePort) return activePort;
    if (_cachedPort) {
        activePort = _cachedPort;
        return activePort;
    }
    try {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
            activePort = ports[0];
            _cachedPort = ports[0];
            return activePort;
        }
        return null;
    } catch (err) {
        console.error('Error recuperando puertos', err);
        return null;
    }
}

// ── Auto-detección ────────────────────────────────────────────────────────────

/**
 * Detecta la impresora conectada leyendo el VID/PID del puerto USB.
 * Si ya hay puertos autorizados, los usa directamente.
 * Si no, abre el picker del navegador para que el usuario elija.
 *
 * Retorna el objeto de config detectado y lo guarda automáticamente.
 */
export async function detectAndAutoConfig() {
    if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada. Usa Chrome o Edge.');
    }

    // 1. Ver si ya hay puertos autorizados
    let port = null;
    const existingPorts = await navigator.serial.getPorts();
    if (existingPorts.length > 0) {
        port = existingPorts[0];
    } else {
        // 2. Pedir al usuario que elija un puerto
        port = await navigator.serial.requestPort();
    }

    if (!port) throw new Error('No se seleccionó ningún puerto.');
    activePort = port;
    _cachedPort = port;

    // 3. Leer VID/PID
    const info = port.getInfo();
    const { usbVendorId, usbProductId } = info;

    // 4. Buscar en la base de datos
    const match = lookupPrinter(usbVendorId, usbProductId);

    // 5. Construir config
    const currentCfg = getWebSerialConfig();
    let detected;

    if (match) {
        detected = {
            ...currentCfg,
            baudRate:     match.baudRate  || currentCfg.baudRate,
            paperWidth:   match.paperWidth || currentCfg.paperWidth,
            printerType:  match.type,
            printerBrand: match.brand,
            printerModel: match.model,
            printerNote:  match.note || null,
            usbVendorId:  usbVendorId ? `0x${usbVendorId.toString(16).toUpperCase().padStart(4,'0')}` : null,
            usbProductId: usbProductId ? `0x${usbProductId.toString(16).toUpperCase().padStart(4,'0')}` : null,
        };
    } else if (!usbVendorId) {
        // Sin datos USB → puerto COM físico, adaptador USB-Serial genérico (CH340, PL2303, CP210x)
        // o impresora con firmware que no expone VID/PID vía WebSerial.
        // El usuario YA seleccionó el puerto → es un dispositivo serial. Tratar como térmica genérica
        // para imprimir directo via ESC/POS sin diálogo del sistema.
        detected = {
            ...currentCfg,
            baudRate:     currentCfg.baudRate || 9600,
            paperWidth:   currentCfg.paperWidth || 58,
            printerType:  'thermal_serial',
            printerBrand: 'Térmica',
            printerModel: 'Puerto serial (sin VID/PID)',
            noVidPid: true,
            usbVendorId:  null,
            usbProductId: null,
        };
    } else {
        // Tiene VID/PID pero no está en la base de datos → asumir térmica serial
        detected = {
            ...currentCfg,
            printerType:  'thermal_serial',
            printerBrand: 'Desconocida',
            printerModel: `VID:0x${usbVendorId.toString(16).toUpperCase()} PID:${usbProductId ? '0x' + usbProductId.toString(16).toUpperCase() : 'N/A'}`,
            usbVendorId:  `0x${usbVendorId.toString(16).toUpperCase().padStart(4,'0')}`,
            usbProductId: usbProductId ? `0x${usbProductId.toString(16).toUpperCase().padStart(4,'0')}` : null,
        };
    }

    saveWebSerialConfig(detected);
    return detected;
}

// ── ESC/POS commands ──────────────────────────────────────────────────────────

export async function sendEscPosCommand(commandArray) {
    const cfg  = getWebSerialConfig();
    const baud = cfg.baudRate || 9600;

    console.log('[ESC/POS] ▶ sendEscPosCommand', commandArray.length, 'bytes | baud:', baud);

    // Recuperar o reutilizar puerto activo o cacheado
    if (!activePort) {
        if (_cachedPort) {
            console.log('[ESC/POS] Reutilizando _cachedPort de la memoria');
            activePort = _cachedPort;
        } else {
            console.log('[ESC/POS] activePort=null y _cachedPort=null → buscando puertos autorizados...');
            const ports = await navigator.serial.getPorts();
            console.log('[ESC/POS] getPorts():', ports.length, 'puerto(s)');
            if (ports.length === 0) {
                throw new Error('Sin puerto autorizado. Pulsa "Detectar impresora" para reconectar.');
            }
            activePort = ports[0];
            _cachedPort = ports[0];
            console.log('[ESC/POS] Puerto asignado y guardado en cache:', JSON.stringify(activePort.getInfo()));
        }
    } else {
        console.log('[ESC/POS] Reutilizando activePort:', JSON.stringify(activePort.getInfo()));
    }

    const port = activePort;

    // Cerrar si quedó abierto de una sesión anterior
    if (port.readable || port.writable) {
        console.log('[ESC/POS] Puerto estaba abierto → cerrando antes de reabrir...');
        try {
            if (port.readable?.locked === false) port.readable.cancel().catch(() => {});
            await port.close();
            console.log('[ESC/POS] Puerto cerrado OK');
        } catch (e) {
            console.warn('[ESC/POS] Error cerrando:', e.message);
        }
        await new Promise(r => setTimeout(r, 80));
    }

    // Abrir
    console.log('[ESC/POS] Abriendo puerto baud=' + baud + '...');
    await port.open({ baudRate: baud, bufferSize: 8192 });
    console.log('[ESC/POS] Puerto abierto ✓');

    // Escribir
    const writer = port.writable.getWriter();
    try {
        console.log('[ESC/POS] Escribiendo', commandArray.length, 'bytes...');
        await writer.write(new Uint8Array(commandArray));
        console.log('[ESC/POS] Escritura ✓');
    } finally {
        writer.releaseLock();
    }

    // Esperar que el adaptador USB-serial vacíe su buffer UART
    console.log('[ESC/POS] Esperando flush (200ms)...');
    await new Promise(r => setTimeout(r, 200));

    try {
        await port.close();
        console.log('[ESC/POS] Puerto cerrado ✓ → impresión completada');
    } catch (e) {
        console.warn('[ESC/POS] Error cerrando tras escritura:', e.message);
    }

    return true;
}

export async function openCashDrawerWebSerial() {
    // ESC p m t1 t2 — 27=ESC 112=p m=drawer t1=on t2=off
    // Enviar pulso a AMBOS pines del cajón por compatibilidad:
    //   Pin 0 (drawer 1): usado por la mayoría de impresoras
    //   Pin 1 (drawer 2): usado por algunas cajas registradoras / FC-588
    return await sendEscPosCommand([
        27, 112, 0, 50, 250,   // drawer pin 0
        27, 112, 1, 50, 250,   // drawer pin 1
    ]);
}

/**
 * Imprime la pre-cuenta de mesa via ESC/POS directo (SIN abrir cajón).
 * Se usa en lugar del PDF+iframe para evitar que la impresora térmica
 * abra el cajón al recibir un trabajo de impresión del sistema.
 */
export async function printPreCuentaEscPos({ table, session, elapsed, timeCost, currentItems, grandTotal, tasaUSD, config, hoursOffset = 0, roundsOffset = 0, products = [] }) {
    const port = await getConnectedPrinter();
    if (!port) return false;

    const cfg = getWebSerialConfig();
    const W = cfg.paperWidth >= 80 ? 42 : 32;
    const WS = cfg.paperWidth >= 80 ? 56 : 42;

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
        console.error('[printPreCuentaEscPos] Error building synthetic cart taxes:', e);
    }

    const p = escposEncoder().init();

    p.align(1).bold(true).doubleHeight(true).text('PRE-CUENTA MESA').newline();
    p.doubleHeight(false).text(table.name.toUpperCase()).newline();
    p.newline();

    const d = new Date();
    p.bold(true).align(0).text(`Fecha: ${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO')}`).newline();
    if (session?.client_name) {
        p.bold(true).text(`Cliente: ${session.client_name}`).bold(true).newline();
    }
    const cleanNotes = (session?.notes || '').split('|||')[0].trim();
    if (cleanNotes) {
        p.text(`Nota: ${cleanNotes.substring(0, W - 6)}`).newline();
    }
    p.line('-', W);

    const retiredPaidShared = (() => {
        if (!session?.notes || !session.notes.includes('|||RETIRED_PAID_SHARED:')) return 0;
        const parts = session.notes.split('|||RETIRED_PAID_SHARED:')[1];
        if (!parts) return 0;
        const val = parseFloat(parts.split('|||')[0].trim());
        return isNaN(val) ? 0 : val;
    })();

    const seats = session?.seats || [];
    const isMultiClient = seats.length > 1;

    const isPina = session.game_mode === 'PINA';
    const pinaCount = isPina ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
    const hasPinas = isPina || pinaCount > 0;
    const totalHours = Number(session.hours_paid) || 0;
    const hasHours = totalHours > 0;
    const hasPaidBefore = roundsOffset > 0 || hoursOffset > 0 || retiredPaidShared > 0;

    if (isMultiClient) {
        // ═══ MULTI-CLIENT BREAKDOWN ═══
        const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
        const breakdown = calculateFullTableBreakdown(session, seats, elapsed, config, currentItems, null, null, table.type === 'NORMAL', hoursOffset, roundsOffset, table.type);

        if (breakdown) {
            // Shared section
            if (breakdown.sharedTotal > 0) {
                p.bold(true).text('--- COMPARTIDO ---').bold(true).newline();

                if (hasPinas) {
                    const pp = config?.pricePina || 0;
                    const pinaCost = round2(pinaCount * pp);
                    p.row(`${pinaCount} pina${pinaCount !== 1 ? 's' : ''} x ${formatCOP(pp)}`, `${formatCOP(pinaCost)}`, W);
                }
                if (hasHours) {
                    const ph = config?.pricePerHour || 0;
                    const hourCost = round2(totalHours * ph);
                    p.row(`${formatHoursPaid(totalHours)} x ${formatCOP(ph)}`, `${formatCOP(hourCost)}`, W);
                }
                const isLibreShared = table.type === 'POOL' && session.game_mode === 'NORMAL' && totalHours === 0 && !seatHasHours;
                if (isLibreShared && elapsed > 0) {
                    const ph = config?.pricePerHour || 0;
                    const billableMinutes = Math.max(0, elapsed - (hoursOffset * 60));
                    const billableHours = billableMinutes / 60;
                    p.row(`${formatElapsedTime(elapsed)} x ${formatCOP(ph)}`, `${formatCOP(billableHours * ph)}`, W);
                }
                if (breakdown.sharedItems.length > 0) {
                    breakdown.sharedItems.forEach(i => {
                        const t = i.qty * i.unit_price_usd;
                        p.row(`${i.qty}x ${(i.product_name || '').substring(0, Math.floor(W * 0.55))}`, `${formatCOP(t)}`, W);
                    });
                }
                const unpaid = seats.filter(s => !s.paid).length;
                if (breakdown.retiredPaidShared > 0) {
                    p.row('Pagado por retirados', `-${formatCOP(breakdown.retiredPaidShared)}`, W);
                    p.text(`Total restante: ${formatCOP(breakdown.remainingSharedTotal)} (/${unpaid})`).newline();
                } else {
                    p.text(`Total: ${formatCOP(breakdown.sharedTotal)} (/${unpaid})`).newline();
                }
                p.line('-', W);
            }

            // Per-seat sections
            breakdown.seats.forEach((sb) => {
                const label = sb.seat.label || `Cliente ${seats.indexOf(sb.seat) + 1}`;
                p.bold(true).text(`--- ${label.toUpperCase()} ---`).bold(true).newline();

                if (sb.seat.paid) {
                    p.text('** PAGADO **').newline();
                }

                if (sb.timeCost.total > 0) {
                    if (sb.timeCost.hasPinas) {
                        const tc = (sb.seat.timeCharges || []).filter(tc => tc.type === 'pina');
                        const pp = config?.pricePina || 0;
                        p.row(`${tc.length} pina${tc.length !== 1 ? 's' : ''} x ${formatCOP(pp)}`, `${formatCOP(sb.timeCost.pinaCost)}`, W);
                    }
                    if (sb.timeCost.hasHours) {
                        const tc = (sb.seat.timeCharges || []).filter(tc => tc.type === 'hora');
                        const totalH = tc.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                        const ph = config?.pricePerHour || 0;
                        p.row(`${formatHoursPaid(totalH)} x ${formatCOP(ph)}`, `${formatCOP(sb.timeCost.hourCost)}`, W);
                    }
                }

                if (sb.items.length > 0) {
                    sb.items.forEach(i => {
                        const t = i.qty * i.unit_price_usd;
                        p.row(`${i.qty}x ${(i.product_name || '').substring(0, Math.floor(W * 0.55))}`, `${formatCOP(t)}`, W);
                    });
                }

                if (sb.sharedPortion > 0 && !sb.seat.paid) {
                    p.row('Parte compartida', `${formatCOP(sb.sharedPortion)}`, W);
                }

                p.bold(true).row('Subtotal:', `${formatCOP(sb.subtotal)}`, W).bold(true);
                p.line('-', W);
            });
        }
    } else {
        // ═══ SINGLE CLIENT / LEGACY ═══
        const seatHasPinas = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
        const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));

        if (hasPinas || seatHasPinas) {
            const pricePerPina = config?.pricePina || 0;
            const seatPinas = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
            const totalPinas = pinaCount + seatPinas;
            const fullCost = round2(totalPinas * pricePerPina);
            const paidCost = round2(roundsOffset * pricePerPina);

            p.bold(true).text('Partidas (La Pina)').newline().bold(true);
            p.row(`${totalPinas} pina${totalPinas !== 1 ? 's' : ''} x ${formatCOP(pricePerPina)}`, `${formatCOP(fullCost)}`, W);

            if (roundsOffset > 0) {
                p.row(`Pagado (${roundsOffset} pina${roundsOffset !== 1 ? 's' : ''})`, `-${formatCOP(paidCost)}`, W);
            }
            p.newline();
        }

        const isLibre = table.type === 'POOL' && session.game_mode === 'NORMAL' && totalHours === 0 && !seatHasHours;
        if (hasHours || seatHasHours || (isLibre && elapsed > 0)) {
            const pricePerHour = config?.pricePerHour || 0;
            p.bold(true).text('Tiempo de Mesa').newline().bold(true);
            if (isLibre) {
                const billableMinutes = Math.max(0, elapsed - (hoursOffset * 60));
                const billableHours = billableMinutes / 60;
                const fullCost = round2(billableHours * pricePerHour);
                const paidCost = round2(hoursOffset * pricePerHour);
                p.row(`${formatElapsedTime(elapsed)} x ${formatCOP(pricePerHour)}`, `${formatCOP(fullCost)}`, W);
                if (hoursOffset > 0) {
                    p.row(`Pagado (${formatElapsedTime(hoursOffset * 60)})`, `-${formatCOP(paidCost)}`, W);
                }
            } else {
                const seatHoursTotal = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (Number(tc.amount) || 0), 0), 0);
                const combinedHours = totalHours + seatHoursTotal;
                const fullCost = round2(combinedHours * pricePerHour);
                const paidCost = round2(hoursOffset * pricePerHour);
                p.row(`${formatHoursPaid(combinedHours)} x ${formatCOP(pricePerHour)}`, `${formatCOP(fullCost)}`, W);
                if (hoursOffset > 0) {
                    p.row(`Pagado (${formatHoursPaid(hoursOffset)})`, `-${formatCOP(paidCost)}`, W);
                }
            }
            p.newline();
        }

        if (currentItems && currentItems.length > 0) {
            p.bold(true).text('Consumo Bar').newline().bold(true);
            currentItems.forEach(i => {
                const t = i.qty * i.unit_price_usd;
                const name = (i.product_name || '').substring(0, Math.floor(W * 0.55));
                p.row(`${i.qty}x ${name}`, `${formatCOP(t)}`, W);
            });
            p.newline();
        }
    }

    p.line('=', W);

    if (totalTax > 0) {
        p.smallFont(true).row('Base Gravable:', formatCOP(baseBeforeTaxes), WS);
        Object.entries(taxBreakdown).forEach(([taxKey, taxVal]) => {
            if (taxVal > 0) {
                const config = useTablesStore.getState().config;
                const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                p.smallFont(true).row(`${taxLabel}:`, formatCOP(taxVal), WS);
            }
        });
        p.smallFont(false).line('-', W);
    }

    if (!isMultiClient && retiredPaidShared > 0) {
        p.row('Pagado por retirados', `-${formatCOP(retiredPaidShared)}`, W);
        p.line('-', W);
    }

    p.align(1).bold(true).text(hasPaidBefore ? 'TOTAL PENDIENTE:' : 'TOTAL ESTIMADO:').newline();
    p.text(`${formatCOP(grandTotal)}`).newline();
    if (tasaUSD && tasaUSD > 1) {
        const formatUsdVal = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
        p.align(0).bold(false).row(`Tasa: ${formatCOP(tasaUSD)}`, `≈ ${formatUsdVal(grandTotal / tasaUSD)}`, W);
    }
    p.newline();
    p.align(1).text('*** NO ES RECIBO DE PAGO ***').newline();
    p.feed(4).cut();

    await sendEscPosCommand(Array.from(p.build()));
    return true;
}

export async function printTestWebSerial() {
    const lines = [
        '================================',
        '     IMPRESORA CONECTADA        ',
        '================================',
        ' COL-POS / Termica 58mm        ',
        ' ESC/POS via Web Serial API    ',
        ' Baud: 9600  Papel: 58mm       ',
        '--------------------------------',
        ' 1234567890123456789012345678901',
        ' ^-- 32 caracteres por linea  --',
        '================================',
        '',
        '',
        '',
    ];
    const encoder = new TextEncoder();
    const payload = [27, 64]; // ESC @ init
    for (const line of lines) {
        payload.push(...Array.from(encoder.encode(line + '\n')));
    }
    payload.push(29, 86, 66, 0); // cut
    return await sendEscPosCommand(payload);
}

// ── ESC/POS Ticket Printing ───────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

function escposEncoder() {
    const chunks = [];
    const encoder = new TextEncoder();
    const api = {
        init()           { chunks.push(new Uint8Array([ESC, 0x40])); return api; },
        align(a)         { chunks.push(new Uint8Array([ESC, 0x61, a])); return api; },
        bold(on)         { chunks.push(new Uint8Array([ESC, 0x45, on ? 1 : 0])); return api; },
        smallFont(on)    { chunks.push(new Uint8Array([ESC, 0x4D, on ? 1 : 0])); return api; }, // ESC M — Font B (9x17): 42 chars/línea en 58mm
        doubleHeight(on) { chunks.push(new Uint8Array([GS,  0x21, on ? 0x10 : 0x00])); return api; },
        bigText(on)      { chunks.push(new Uint8Array([GS,  0x21, on ? 0x11 : 0x00])); return api; },
        text(str)        { chunks.push(encoder.encode(str)); return api; },
        newline(n = 1)   { for (let i = 0; i < n; i++) chunks.push(new Uint8Array([LF])); return api; },
        line(char = '-', len = 32) {
            chunks.push(encoder.encode(char.repeat(len)));
            chunks.push(new Uint8Array([LF]));
            return api;
        },
        row(left, right, width = 32) {
            // Si el contenido total desborda, recortar 'left' para preservar 'right'
            const maxLeft = width - right.length - 1;
            const safeLeft = left.length > maxLeft ? left.substring(0, maxLeft - 1) + '…' : left;
            const space = Math.max(1, width - safeLeft.length - right.length);
            chunks.push(encoder.encode(safeLeft + ' '.repeat(space) + right));
            chunks.push(new Uint8Array([LF]));
            return api;
        },
        cut()  { chunks.push(new Uint8Array([GS, 0x56, 0x42, 0x00])); return api; },
        feed(n = 4) { chunks.push(new Uint8Array([ESC, 0x64, n])); return api; },
        build() {
            const total = chunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) { result.set(c, offset); offset += c.length; }
            return result;
        }
    };
    return api;
}

/**
 * Imprime un ticket de venta directamente via ESC/POS (sin diálogo del navegador).
 * Retorna true si se imprimió, false si no hay impresora conectada.
 */
export async function printReceiptEscPos(sale, bcvRate) {
    const port = await getConnectedPrinter();
    if (!port) return false;

    const settings = {
        name:  localStorage.getItem('business_name')  || 'Pool Imperial',
        rif:   localStorage.getItem('business_rif')   || '',
        phone: localStorage.getItem('business_phone') || '',
    };

    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const cfg     = getWebSerialConfig();
    const W       = cfg.paperWidth >= 80 ? 42 : 32; // chars por línea (font normal)
    const WS      = cfg.paperWidth >= 80 ? 56 : 42; // chars por línea (font pequeña)

    const p = escposEncoder().init();

    // Header
    p.align(1).bold(true).doubleHeight(true).text(settings.name).newline();
    p.doubleHeight(false);
    if (settings.rif)   p.bold(true).text('NIT: ' + settings.rif).newline();
    if (settings.phone) p.text('Tel: ' + settings.phone).newline();
    p.newline();

    // Nro venta + fecha
    p.bold(true).text('Venta #' + saleNum).newline();
    p.bold(true).text(new Date(sale.timestamp).toLocaleString('es-CO')).newline();

    if (sale.tableName) {
        p.bold(true).text('Mesa: ' + sale.tableName).newline();
        p.bold(true);
    }
    p.text('Cliente: ' + (capitalizeName(sale.customerName) || 'Consumidor Final')).newline();
    if (sale.meseroNombre) p.text('Atendido: ' + capitalizeName(sale.meseroNombre)).newline();

    p.align(0).line('=', W);

    // Items — font pequeña (42 chars/línea en 58mm) para aprovechar mejor el espacio
    (sale.items || []).forEach(item => {
        const qty      = item.isWeight ? item.qty.toFixed(3) + 'Kg' : item.qty + 'u';
        const unitStr  = formatCOP(item.priceUsd);
        const subtotal = formatCOP(item.priceUsd * item.qty);
        const detail   = '  ' + qty + ' x ' + unitStr;
        // Nombre: font normal, negrita, truncado a W chars
        const name = item.name.length > W ? item.name.substring(0, W - 1) + '…' : item.name;
        p.bold(true).text(name).newline();
        // Detalle: font pequeña para aprovechar los 42 chars
        p.bold(true).smallFont(true).row(detail, subtotal, WS);
        p.smallFont(false);
    });

    p.line('=', W);

    if (sale.discountAmountUsd > 0) {
        const subtotal = sale.cartSubtotalUsd || (sale.totalUsd + sale.discountAmountUsd);
        p.smallFont(true).row('Subtotal:', formatCOP(subtotal), WS);
        const discountLabel = sale.discountType === 'percentage' ? `Descuento (${sale.discountValue}%):` : 'Descuento:';
        p.smallFont(true).row(discountLabel, '-' + formatCOP(sale.discountAmountUsd), WS);
        p.smallFont(false).line('-', W);
    }

    if (sale.ivaAmount > 0) {
        const base = sale.totalUsd - (sale.ivaAmount || 0);
        p.smallFont(true).row('Base Gravable:', formatCOP(base), WS);
        if (sale.taxBreakdown && Object.keys(sale.taxBreakdown).length > 0) {
            Object.entries(sale.taxBreakdown).forEach(([taxKey, taxVal]) => {
                if (taxVal > 0) {
                    const config = useTablesStore.getState().config;
                    const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                    p.smallFont(true).row(`${taxLabel}:`, formatCOP(taxVal), WS);
                }
            });
        } else {
            p.smallFont(true).row(`IVA (${sale.ivaRate || 19}%):`, formatCOP(sale.ivaAmount || 0), WS);
        }
        p.smallFont(false).line('-', W);
    }

    const priorAbonoPayments = (sale.payments || []).filter(p => p.isAbonoPrevio === true);
    const hasPriorAbonos = priorAbonoPayments.length > 0;
    const priorAbonoTotal = hasPriorAbonos
        ? priorAbonoPayments.reduce((s, p) => s + (p.amountUsd || 0), 0)
        : 0;

    // Totales
    if (hasPriorAbonos) {
        const consumoBruto = sale.totalUsd || 0;
        const netoPagado = Math.max(0, consumoBruto - priorAbonoTotal);
        p.align(0).bold(true);
        p.row('TOTAL CONSUMO:', formatCOP(consumoBruto), W);
        p.row('ABONOS PREVIOS:', '-' + formatCOP(priorAbonoTotal), W);
        p.newline();
        p.align(1).text('NETO PAGADO EN CIERRE').newline();
        p.bigText(true).text(formatCOP(netoPagado)).newline();
    } else {
        p.align(1).bigText(true).bold(true);
        p.text(formatCOP(sale.totalUsd || 0)).newline();
    }
    p.bigText(false).bold(true);
    if (sale.rate > 1) {
        const formatUsdVal = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
        p.align(0).row(`Tasa: ${formatCOP(sale.rate)}`, `≈ ${formatUsdVal((sale.totalUsd || 0) / sale.rate)}`, W);
    }
    p.newline();

    // Pagos
    p.align(0);
    if (sale.payments?.length > 0) {
        sale.payments.forEach(pm => {
            const label = pm.methodLabel || pm.methodId || 'Pago';
            const isUsd = pm.amountOriginalCurrency === 'USD';
            const formatUsdVal = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
            const amt   = isUsd 
                ? formatUsdVal(pm.amountOriginal) 
                : formatCOP(pm.amountInput || pm.amountUsd);
            p.row(label, amt, W);
        });
    }

    if (sale.changeUsd > 0) {
        p.line('-', W);
        p.bold(true).row('Vuelto:', formatCOP(sale.changeUsd), W);
        p.bold(true);
    }
    if (sale.fiadoUsd > 0) {
        p.line('-', W);
        p.bold(true).row('Fiado:', formatCOP(sale.fiadoUsd), W);
        p.bold(true);
    }

    p.line('-', W);
    p.newline();
    p.align(1).bold(true).text('Gracias por tu compra!').newline();
    p.bold(true).text('Comprobante de control interno').newline();

    p.feed(4).cut();

    await sendEscPosCommand(Array.from(p.build()));
    return true;
}

export async function printDailyCloseEscPos({
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
    cierreId = null,
    cierreNum = null
}) {
    const port = await getConnectedPrinter();
    if (!port) return false;

    const settings = {
        name:    localStorage.getItem('business_name')  || 'Pool Imperial',
        rif:     localStorage.getItem('business_rif')   || '',
        address: localStorage.getItem('business_address') || '',
        phone:   localStorage.getItem('business_phone') || '',
    };

    const cfg = getWebSerialConfig();
    const W   = cfg.paperWidth >= 80 ? 42 : 32;
    const WS  = cfg.paperWidth >= 80 ? 56 : 42;

    const now = new Date(cierreId || Date.now());
    const fecha = now.toLocaleDateString('es-CO');
    const hora = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const totalCOP = todayTotalCOP || 0;
    const netCOP = totalCOP - totalTax;

    const visibleSales = allSales.filter(s => s.status !== 'ANULADA');

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

    const p = escposEncoder().init();

    // Logo o nombre del negocio
    p.align(1).bold(true).doubleHeight(true).text(settings.name.toUpperCase()).newline();
    p.doubleHeight(false).bold(false);
    if (settings.rif) p.text('NIT: ' + settings.rif).newline();
    if (settings.address) p.text(settings.address).newline();
    if (settings.phone) p.text('Tel: ' + settings.phone).newline();
    p.newline();

    p.bold(true).text(`CIERRE DE CAJA #${cierreNum || ''}`).newline();
    p.bold(false).text(`${fecha} ${hora}`).newline();
    p.line('-', W);

    // ── Resumen General ──
    const activeSalesCount = sales.filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA').length;
    let totalEgresosProveedores = 0;
    sales.forEach(s => {
        if (s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja !== false) {
            totalEgresosProveedores += Math.abs(s.totalCop || s.totalUsd || 0);
        }
    });

    const openingCOP = apertura?.openingCOP || apertura?.openingUsd || apertura?.totalUsd || 0;
    p.align(1).bold(true).text('RESUMEN GENERAL').newline().bold(false).align(0);
    p.row('Ventas realizadas:', String(activeSalesCount), W);
    p.row('Articulos vendidos:', String(todayItemsSold), W);
    if (openingCOP > 0) {
        p.row('Fondo de Apertura:', formatCOP(openingCOP), W);
    }
    p.row('Ingresos Brutos COP:', formatCOP(totalCOP), W);
    p.row('Ingresos Netos COP:', formatCOP(netCOP), W);
    if (totalEgresosProveedores > 0) {
        p.row('Egresos Proveedores:', '-' + formatCOP(totalEgresosProveedores), W);
    }
    if (totalServicioVoluntario > 0) {
        p.row('Servicio Voluntario:', formatCOP(totalServicioVoluntario), W);
    }
    p.row('Ganancia estimada:', formatCOP(todayProfit), W);
    p.line('-', W);

    // Contar transacciones por methodId desde allSales
    const countMap = {};
    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        if (s.payments && s.payments.length > 0) {
            s.payments.forEach(pay => {
                if (pay.isAbonoPrevio) return;
                countMap[pay.methodId] = (countMap[pay.methodId] || 0) + 1;
            });
        } else if (s.paymentMethod) {
            countMap[s.paymentMethod] = (countMap[s.paymentMethod] || 0) + 1;
        }
    });

    // ── Pagos por Método ──
    const paymentEntries = Object.entries(paymentBreakdown || {}).filter(([, d]) => d.total > 0);
    if (paymentEntries.length > 0) {
        p.align(1).bold(true).text('PAGOS POR METODO').newline().bold(false).align(0);
        paymentEntries.forEach(([methodId, d]) => {
            const label = toTitleCase(getPaymentLabel(methodId, d.label));
            const count = countMap[methodId] || 0;
            const countLabel = count > 0 ? ` (${count} ${count === 1 ? 'pago' : 'pagos'})` : '';
            const labelWithCount = `${label}${countLabel}`;
            const isUsd = d.currency === 'USD';
            const val = isUsd ? `$ ${d.total.toFixed(2)}` : formatCOP(d.total);
            p.row(labelWithCount, val, W);
        });
        p.line('-', W);
    }

    // ── Impuestos ──
    if (totalTax > 0) {
        p.align(1).bold(true).text('IMPUESTOS RECAUDADOS').newline().bold(false).align(0);
        p.row('Total Impuestos:', formatCOP(totalTax), W);
        Object.entries(taxBreakdown || {}).forEach(([key, val]) => {
            if (val <= 0) return;
            const config = useTablesStore.getState().config;
            const label = key === 'iva_19' ? `IVA ${config?.taxRateIva ?? 19}%` : key === 'impoconsumo_8' ? `Impoconsumo ${config?.taxRateImpoconsumo ?? 8}%` : key;
            p.smallFont(true).row('  ' + label + ':', formatCOP(val), WS);
            p.smallFont(false);
        });
        p.line('-', W);
    }

    // ── Propinas ──
    const tipsUserRows = Object.keys(tipsByUser).length;
    if (tipsUserRows > 0) {
        p.align(1).bold(true).text('PROPINAS POR PERSONAL').newline().bold(false).align(0);
        Object.entries(tipsByUser).forEach(([user, total]) => {
            p.row(user + ':', formatCOP(total), W);
        });
        p.bold(true).row('Total Propinas:', formatCOP(totalTips), W).bold(false);
        p.line('-', W);
    }

    // ── Cuadre de caja ──
    if (reconData) {
        const openingCOP = apertura?.openingCOP || apertura?.openingUsd || 0;
        const openingUSD = apertura?.openingBs || 0;

        const expectedCOP = (paymentBreakdown['efectivo']?.total || 0) + (paymentBreakdown['efectivo_cop']?.total || 0) + (paymentBreakdown['_vuelto_cop']?.total || 0) + openingCOP;
        const declaredCOP = reconData.declaredCop || reconData.declaredCOP || 0;
        const diffCOP = declaredCOP - expectedCOP;

        const expectedUSD = (paymentBreakdown['efectivo_usd']?.total || 0) + openingUSD;
        const declaredUSD = reconData.declaredUsd || reconData.declaredUSD || 0;
        const diffUSD = declaredUSD - expectedUSD;

        p.align(1).bold(true).text('CUADRE DE CAJA').newline().bold(false).align(0);
        p.row('Fondo inicial COP:', formatCOP(openingCOP), W);
        p.row('COP Esperado:', formatCOP(expectedCOP), W);
        p.row('COP Declarado:', formatCOP(declaredCOP), W);
        p.row('COP Diferencia:', (diffCOP >= 0 ? '+' : '') + formatCOP(diffCOP), W);
        p.newline();
        p.row('Fondo inicial USD:', `$ ${openingUSD.toFixed(2)}`, W);
        p.row('USD Esperado:', `$ ${expectedUSD.toFixed(2)}`, W);
        p.row('USD Declarado:', `$ ${declaredUSD.toFixed(2)}`, W);
        p.row('USD Diferencia:', (diffUSD >= 0 ? '+' : '') + `$ ${diffUSD.toFixed(2)}`, W);
        p.line('-', W);
    }

    // ── Movimientos de Productos ──
    if (prodMovements && prodMovements.length > 0) {
        p.align(1).bold(true).text('MOVIMIENTOS DE PRODUCTOS').newline().bold(false).align(0);
        prodMovements.forEach((m) => {
            const cleanLabel = m.name.length > WS - 15 ? m.name.substring(0, WS - 17) + '…' : m.name;
            const entStr = m.entrada > 0 ? `+${m.entrada}` : '-';
            const salStr = m.salida > 0 ? `-${m.salida}` : '-';
            const movStr = `E:${entStr} S:${salStr}`;
            p.smallFont(true).row(cleanLabel, movStr, WS);
            p.smallFont(false);
        });
        p.line('-', W);
    }

    // ── Artículos Vendidos ──
    if (topProducts && topProducts.length > 0) {
        p.align(1).bold(true).text('ARTICULOS VENDIDOS').newline().bold(false).align(0);
        topProducts.forEach((prod) => {
            const label = prod.name;
            const cleanLabel = label.length > W - 10 ? label.substring(0, W - 12) + '…' : label;
            p.smallFont(true).row(`${prod.qty}u ${cleanLabel}`, formatCOP(prod.revenue), WS);
            p.smallFont(false);
        });
        p.line('-', W);
    }

    // ── Historial de Ventas ──
    if (visibleSales.length > 0) {
        p.align(1).bold(true).text('HISTORIAL DE VENTAS').newline().bold(false).align(0);
        visibleSales.forEach(s => {
            const ref = String(s.saleNumber || 0).padStart(4, '0');
            const staff = (s.meseroNombre || s.vendedorNombre || 'Sistema').substring(0, 8);
            const amountStr = formatCOP(s.totalCop || s.totalUsd);
            p.smallFont(true).row(`#${ref} ${staff}`, amountStr, WS);
            p.smallFont(false);
        });
        p.line('-', W);
    }

    // Pie
    p.align(1).bold(true).text('Pool Imperial').newline();
    p.bold(false).text('Reporte generado automaticamente').newline();
    p.text('Sin valor fiscal').newline();
    p.feed(4).cut();

    await sendEscPosCommand(Array.from(p.build()));
    return true;
}
