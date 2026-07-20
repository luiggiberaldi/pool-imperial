import { jsPDF } from 'jspdf';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { FinancialEngine } from '../core/FinancialEngine';
import { formatGameHours, computeGameStats, computeIncomeBreakdown, isNonProductSaleItem } from './calculatorUtils';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

// Formatea un número como dólares: $ 12.50
const formatUsd = (val) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
}).format(val || 0);

/**
 * Genera un PDF de Cierre del Día con reporte detallado en formato HOJA CARTA.
 * Ideal para visualización en PC, impresión estándar y archivado administrativo.
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
    shouldPrint = false,
}) {
    // Configuración de página Carta (Letter): 215.9 x 279.4 mm
    const WIDTH = 215.9;
    const HEIGHT = 279.4;
    const M = 15; // Margen de 15mm
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

    // Modificador para forzar negrita si se requiere impresión
    if (shouldPrint) {
        const originalSetFont = doc.setFont;
        doc.setFont = function(family, style) {
            return originalSetFont.call(doc, family, 'bold');
        };
    }

    // Paleta de Colores Corporativos (Pool Imperial Premium)
    const INK = [30, 41, 59];       // Slate 800 (texto principal)
    const BODY = [71, 85, 105];     // Slate 600 (texto secundario)
    const MUTED = [148, 163, 184];  // Slate 400 (borde / gris)
    const GREEN = [22, 101, 52];     // Emerald 800 (ganancia / total)
    const RULE = [226, 232, 240];    // Slate 200 (líneas divisoras)
    const RED = [185, 28, 28];       // Red 700 (anuladas / egresos)
    const BLUE = [29, 78, 216];      // Blue 700 (acentos / títulos)
    const BG_LIGHT = [248, 250, 252]; // Slate 50 (fondo de tarjetas)

    let y = M;
    let pageCount = 1;

    // Helper: Salto de página inteligente
    const checkPageBreak = (neededHeight) => {
        if (y + neededHeight > HEIGHT - M) {
            doc.addPage();
            pageCount++;
            y = M + 8;
            
            // Dibujar encabezado secundario de página
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(`POOL IMPERIAL  ·  REPORTE DE CIERRE DE CAJA #${cierreNum || ''}`, M, M - 5);
            doc.text(`Página ${pageCount}`, RIGHT, M - 5, { align: 'right' });
            
            doc.setDrawColor(...RULE);
            doc.setLineWidth(0.3);
            doc.line(M, M - 3, RIGHT, M - 3);
        }
    };

    // Helper: Dibujar línea divisora horizontal
    const drawDivider = (yy) => {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.4);
        doc.line(M, yy, RIGHT, yy);
    };

    // Helper: Sección título
    const drawSectionTitle = (text) => {
        checkPageBreak(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BLUE);
        doc.text(text.toUpperCase(), M, y);
        y += 4;
        doc.setDrawColor(...BLUE);
        doc.setLineWidth(0.8);
        doc.line(M, y, M + 25, y);
        y += 6;
    };

    // Las ventas anuladas no se muestran ni se contabilizan en el cierre
    const visibleSales = allSales.filter(s => s.status !== 'ANULADA');

    // ════════════════════════════════════
    //  ENCABEZADO DE LA EMPRESA (PÁGINA 1)
    // ════════════════════════════════════
    try {
        const img = new Image();
        img.src = '/logo-ticket.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        doc.addImage(img, 'PNG', M, y, 42, 22);
    } catch (_) {
        // Fallback si el logo no carga: texto elegante
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...INK);
        doc.text('POOL IMPERIAL', M, y + 10);
    }

    // Info del Negocio (Alineado a la derecha)
    const now = new Date();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(`CIERRE DE CAJA #${cierreNum || ''}`, RIGHT, y + 5, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BODY);
    
    const formattedDate = now.toLocaleDateString('es-CO', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    
    doc.text(`Fecha de Emisión: ${formattedDate}`, RIGHT, y + 10, { align: 'right' });
    doc.text(`Hora: ${formattedTime}`, RIGHT, y + 14, { align: 'right' });
    doc.text('Estatus: Procesado y Concluido', RIGHT, y + 18, { align: 'right' });
    
    y += 26;
    drawDivider(y);
    y += 8;

    // ════════════════════════════════════
    //  1. TARJETAS DE RESUMEN METRICAS (Grid 3 columnas)
    // ════════════════════════════════════
    drawSectionTitle('Resumen General de Caja');

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

    // Dimensiones de tarjetas
    const colWidth = (WIDTH - M * 2 - 8) / 3; // ~59mm c/u
    const cardHeight = 22;

    const drawCard = (x, label, value, subtext, isHighlight = false) => {
        // Fondo
        doc.setFillColor(...(isHighlight ? [239, 246, 255] : BG_LIGHT));
        doc.roundedRect(x, y, colWidth, cardHeight, 2, 2, 'F');
        // Borde fino
        doc.setDrawColor(...(isHighlight ? [191, 219, 254] : RULE));
        doc.setLineWidth(0.2);
        doc.roundedRect(x, y, colWidth, cardHeight, 2, 2, 'D');

        // Textos
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...(isHighlight ? BLUE : BODY));
        doc.text(label.toUpperCase(), x + 4, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...(isHighlight ? BLUE : INK));
        doc.text(value, x + 4, y + 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...BODY);
        doc.text(subtext || '', x + 4, y + 18);
    };

    // Dibujar las 3 tarjetas principales
    drawCard(M, 'Ingresos Totales', formatCOP(totalCOP), `Ingreso Neto (sin IVA): ${formatCOP(netCOP)}`, true);
    drawCard(M + colWidth + 4, 'Actividad de Caja', `${activeSalesCount} Ventas`, `${todayItemsSold} Artículos vendidos`);
    drawCard(M + (colWidth + 4) * 2, 'Resultado Financiero', formatCOP(todayProfit), `Ganancia de Bodega estimada`);

    y += cardHeight + 6;

    // Fila 2 de Tarjetas si hay fondos o egresos
    if (openingCOP > 0 || totalEgresosProveedores > 0 || totalServicioVoluntario > 0) {
        drawCard(M, 'Fondo de Apertura', formatCOP(openingCOP), `Efectivo base en caja`);
        drawCard(M + colWidth + 4, 'Egresos Proveedores', `-${formatCOP(totalEgresosProveedores)}`, `Salida de efectivo registrada`);
        drawCard(M + (colWidth + 4) * 2, 'Servicio Voluntario', formatCOP(totalServicioVoluntario), `Total propinas acumuladas`);
        y += cardHeight + 8;
    } else {
        y += 2;
    }

    drawDivider(y);
    y += 8;

    // ════════════════════════════════════
    //  2. DESGLOSE DE PAGOS Y CUADRE DE CAJA (LADO A LADO)
    // ════════════════════════════════════
    // Calcular desglose de propinas por método de pago
    const tipBreakdownByMethod = {};
    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        const saleTip = (s.items || []).filter(item => 
            item.isTip || (item.name && item.name.toLowerCase().includes('propina')) || (item.name && item.name.toLowerCase().includes('servicio voluntario'))
        ).reduce((sum, item) => sum + (item.priceUsd || 0) * (item.qty || 1), 0);

        if (saleTip <= 0) return;

        if (s.payments && s.payments.length > 0) {
            const netTotal = FinancialEngine.calculateSaleNetTotal(s) || 1;
            if (s.fiadoUsd && s.fiadoUsd > 0) {
                const ratio = s.fiadoUsd / netTotal;
                const tipPart = saleTip * ratio;
                tipBreakdownByMethod['fiado'] = (tipBreakdownByMethod['fiado'] || 0) + tipPart;
            }
            s.payments.forEach(p => {
                if (p.isAbonoPrevio) return;
                const payAmt = p.amountUsd || 0;
                const ratio = payAmt / netTotal;
                const tipPart = saleTip * ratio;
                tipBreakdownByMethod[p.methodId] = (tipBreakdownByMethod[p.methodId] || 0) + tipPart;
            });
        } else {
            const method = s.tipo === 'VENTA_FIADA' ? 'fiado' : (s.paymentMethod || 'efectivo');
            tipBreakdownByMethod[method] = (tipBreakdownByMethod[method] || 0) + saleTip;
        }
    });

    const halfWidth = (WIDTH - M * 2 - 10) / 2; // ~87mm

    // Altura aproximada requerida para esta sección
    let paymentHeight = 15;
    Object.entries(paymentBreakdown || {}).forEach(([methodId, data]) => {
        if (data.total <= 0) return;
        paymentHeight += (tipBreakdownByMethod[methodId] > 0) ? 7.5 : 6;
    });

    let reconHeight = 25; // Base height for COP + USD cash
    if (reconData) {
        const otherPaymentEntries = Object.entries(paymentBreakdown || {}).filter(([methodId, data]) => {
            return data.total > 0 && 
                   !['efectivo', 'efectivo_cop', 'efectivo_usd', '_vuelto_cop', 'vuelto_cop', 'vuelto_usd'].includes(methodId) &&
                   !data.currency?.startsWith('VUELTO');
        });
        reconHeight += otherPaymentEntries.length * 20; // 20mm per other payment method cuadre (3 rows + spacing)
    }

    const section2Height = Math.max(paymentHeight, reconHeight, 60);
    checkPageBreak(section2Height);

    // Guardamos la coordenada Y para dibujar las dos columnas de forma simétrica
    const startY = y;

    // --- Columna Izquierda: Pagos por Método ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    doc.text('PAGOS POR METODO', M, y);
    y += 5;

    // Contar transacciones por método
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

    // Tabla de métodos
    doc.setFillColor(...BG_LIGHT);
    doc.rect(M, y, halfWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text('Método', M + 3, y + 4.2);
    doc.text('Total', M + halfWidth - 3, y + 4.2, { align: 'right' });
    y += 6;

    Object.entries(paymentBreakdown || {}).forEach(([methodId, data]) => {
        if (data.total <= 0) return;
        const label = toTitleCase(getPaymentLabel(methodId, data.label));
        const count = countMap[methodId] || 0;
        const countLabel = count > 0 ? ` (${count} op)` : '';
        const isUsd = data.currency === 'USD';
        const val = isUsd ? formatUsd(data.total) : formatCOP(data.total);

        const tipAmt = tipBreakdownByMethod[methodId] || 0;
        const baseAmt = Math.max(0, data.total - tipAmt);

        if (tipAmt > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(`${label}${countLabel}`, M + 3, y + 3);
            
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(val, M + halfWidth - 3, y + 3, { align: 'right' });
            
            y += 3.8;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            const tipValLabel = isUsd ? formatUsd(tipAmt) : formatCOP(tipAmt);
            const baseValLabel = isUsd ? formatUsd(baseAmt) : formatCOP(baseAmt);
            doc.text(`(Venta: ${baseValLabel}  ·  Propina: ${tipValLabel})`, M + 6, y + 2.5);
            y += 3.2;
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(`${label}${countLabel}`, M + 3, y + 4.2);
            
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(val, M + halfWidth - 3, y + 4.2, { align: 'right' });
            y += 6;
        }
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M, y, M + halfWidth, y);
    });

    // Impuestos Recaudados (Debajo de métodos de pago)
    if (totalTax > 0) {
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        doc.text('IMPUESTOS RECAUDADOS', M, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text('Total IVA e Impoconsumo', M + 3, y + 4.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(formatCOP(totalTax), M + halfWidth - 3, y + 4.2, { align: 'right' });
        doc.line(M, y + 6, M + halfWidth, y + 6);
        y += 6;
    }

    // --- Columna Derecha: Cuadre de Caja (Reconciliación) ---
    y = startY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    doc.text('CUADRE DE CAJA FISICA', M + halfWidth + 10, y);
    y += 5;

    if (reconData) {
        const expectedCOP = (paymentBreakdown['efectivo']?.total || 0) + (paymentBreakdown['efectivo_cop']?.total || 0) + (paymentBreakdown['_vuelto_cop']?.total || 0) + openingCOP;
        const declaredCOP = reconData.declaredCop || reconData.declaredCOP || 0;
        const diffCOP = declaredCOP - expectedCOP;

        const expectedUSD = (paymentBreakdown['efectivo_usd']?.total || 0);
        const declaredUSD = reconData.declaredUsd || reconData.declaredUSD || 0;
        const diffUSD = declaredUSD - expectedUSD;

        const drawReconRow = (label, val, isDiff = false, isCop = true, specificDiffVal = null) => {
            doc.setFont('helvetica', isDiff ? 'bold' : 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(label, M + halfWidth + 13, y + 4.2);

            doc.setFont('helvetica', 'bold');
            if (isDiff) {
                const diffVal = specificDiffVal !== null ? specificDiffVal : (isCop ? diffCOP : diffUSD);
                if (Math.abs(diffVal) <= (isCop ? 500 : 0.05)) doc.setTextColor(...BODY);
                else if (diffVal < 0) doc.setTextColor(...RED);
                else doc.setTextColor(...GREEN);
            } else {
                doc.setTextColor(...INK);
            }
            doc.text(val, M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
            
            doc.setDrawColor(...RULE);
            doc.setLineWidth(0.2);
            doc.line(M + halfWidth + 10, y + 6, M + halfWidth * 2 + 10, y + 6);
            y += 6;
        };

        drawReconRow('COP Esperado (Base + Efectivo)', formatCOP(expectedCOP));
        drawReconRow('COP Declarado Físico', formatCOP(declaredCOP));
        drawReconRow('COP Diferencia', (diffCOP >= 0 ? '+' : '') + formatCOP(diffCOP), true, true);
        
        if (expectedUSD > 0 || declaredUSD > 0) {
            y += 2;
            drawReconRow('USD Esperado', formatUsd(expectedUSD));
            drawReconRow('USD Declarado', formatUsd(declaredUSD));
            drawReconRow('USD Diferencia', (diffUSD >= 0 ? '+' : '') + formatUsd(diffUSD), true, false);
        }

        // Draw other payment methods
        const declaredOthers = reconData.declaredOthers || {};
        const otherPaymentEntries = Object.entries(paymentBreakdown || {}).filter(([methodId, data]) => {
            return data.total > 0 && 
                   !['efectivo', 'efectivo_cop', 'efectivo_usd', '_vuelto_cop', 'vuelto_cop', 'vuelto_usd'].includes(methodId) &&
                   !data.currency?.startsWith('VUELTO');
        });

        otherPaymentEntries.forEach(([methodId, data]) => {
            const expected = data.total;
            const declared = parseFloat(declaredOthers[methodId]) || 0;
            const diff = declared - expected;
            const isUsd = data.currency === 'USD';
            const label = toTitleCase(getPaymentLabel(methodId, data.label));
            
            y += 2;
            drawReconRow(`${label} Esperado`, isUsd ? formatUsd(expected) : formatCOP(expected));
            drawReconRow(`${label} Declarado`, isUsd ? formatUsd(declared) : formatCOP(declared));
            drawReconRow(`${label} Diferencia`, (diff >= 0 ? '+' : '') + (isUsd ? formatUsd(diff) : formatCOP(diff)), true, !isUsd, diff);
        });
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('No se realizó cuadre físico al cerrar caja.', M + halfWidth + 13, y + 10);
    }

    // Regresar cursor Y al punto más bajo de ambas columnas
    y = Math.max(y, startY + section2Height);
    y += 4;
    drawDivider(y);
    y += 8;

    // ════════════════════════════════════
    //  2.5. DESGLOSE GENERAL DE INGRESOS (COMPOSICIÓN DEL TOTAL)
    // ════════════════════════════════════
    const breakdownData = computeIncomeBreakdown(allSales);

    const incomeBreakdownHeight = 36;
    checkPageBreak(incomeBreakdownHeight);

    drawSectionTitle('Desglose General de Ingresos (Composición del Total)');

    doc.setFillColor(...BG_LIGHT);
    doc.roundedRect(M, y, WIDTH - M * 2, 30, 2, 2, 'F');
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, WIDTH - M * 2, 30, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text('Concepto / Categoría', M + 4, y + 5);
    doc.text('Explicación / Detalle', M + 65, y + 5);
    doc.text('Monto COP', RIGHT - 4, y + 5, { align: 'right' });

    doc.setDrawColor(...RULE);
    doc.line(M + 2, y + 7, RIGHT - 2, y + 7);

    let rowY = y + 11;

    // Fila 1: Productos Fisicos (Contado)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...BODY);
    doc.text('Productos Físicos (Contado)', M + 4, rowY);
    doc.setFont('helvetica', 'normal');
    doc.text('Bebidas, pasabocas y cigarrillos cobrados de contado', M + 65, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(formatCOP(breakdownData.productosContado), RIGHT - 4, rowY, { align: 'right' });
    rowY += 4.5;

    // Fila 2: Tiempo de Mesa
    if (breakdownData.tiempoMesas > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text('Tiempo de Mesa / Juego', M + 4, rowY);
        doc.setFont('helvetica', 'normal');
        doc.text('Alquiler de mesas de pool, horas y partidas cobradas', M + 65, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLUE);
        doc.text(`+${formatCOP(breakdownData.tiempoMesas)}`, RIGHT - 4, rowY, { align: 'right' });
        rowY += 4.5;
    }

    // Fila 3: Servicio Voluntario
    if (breakdownData.propinas > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text('Servicio Voluntario (Propina)', M + 4, rowY);
        doc.setFont('helvetica', 'normal');
        doc.text('Propinas registradas para el personal de servicio', M + 65, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREEN);
        doc.text(`+${formatCOP(breakdownData.propinas)}`, RIGHT - 4, rowY, { align: 'right' });
        rowY += 4.5;
    }

    // Fila 4: Abonos en Efectivo
    if (breakdownData.abonosEfectivo > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text('Abonos Recibidos en Efectivo', M + 4, rowY);
        doc.setFont('helvetica', 'normal');
        doc.text('Abonos libres ingresados a caja durante el turno', M + 65, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(`+${formatCOP(breakdownData.abonosEfectivo)}`, RIGHT - 4, rowY, { align: 'right' });
        rowY += 4.5;
    }

    // Fila 5: Ventas Fiadas
    if (breakdownData.ventasFiadas > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BODY);
        doc.text('Venta Fiada (Crédito)', M + 4, rowY);
        doc.setFont('helvetica', 'normal');
        doc.text('Saldo por cobrar a clientes registrado en este turno', M + 65, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...RED);
        doc.text(`+${formatCOP(breakdownData.ventasFiadas)}`, RIGHT - 4, rowY, { align: 'right' });
        rowY += 4.5;
    }

    doc.setDrawColor(...RULE);
    doc.line(M + 2, rowY - 1.5, RIGHT - 2, rowY - 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLUE);
    doc.text('TOTAL INGRESO BRUTO CIERRE', M + 4, rowY + 2);
    doc.text(formatCOP(totalCOP), RIGHT - 4, rowY + 2, { align: 'right' });

    y += 36;
    drawDivider(y);
    y += 8;

    // ════════════════════════════════════
    //  3. MOVIMIENTOS E INVENTARIO (LADO A LADO)
    // ════════════════════════════════════
    const topProdRows = topProducts.length;
    
    const prodMovements = (() => {
        const movements = {};
        
        // Process adjustments
        (adjustments || []).forEach(adj => {
            if (adj.status === 'ANULADA') return;
            (adj.items || []).forEach(item => {
                if (isNonProductSaleItem(item)) return;

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

        // Process sales (salidas) — exclude synthetic items from inventory movements
        allSales.forEach(sale => {
            if (sale.status === 'ANULADA') return;
            (sale.items || []).forEach(item => {
                if (isNonProductSaleItem(item)) return;

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
    const section3Height = Math.max(prodMovementRows, topProdRows) * 6 + 20;
    
    checkPageBreak(section3Height);
    const startY3 = y;

    // --- Columna Izquierda: Movimientos de Inventario ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    doc.text('MOVIMIENTOS DE PRODUCTOS', M, y);
    y += 5;

    doc.setFillColor(...BG_LIGHT);
    doc.rect(M, y, halfWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    doc.text('Producto', M + 2, y + 4.2);
    doc.text('Entrada', M + halfWidth - 18, y + 4.2, { align: 'right' });
    doc.text('Salida', M + halfWidth - 2, y + 4.2, { align: 'right' });
    y += 6;

    prodMovements.forEach((m) => {
        const name = m.name.length > 22 ? m.name.substring(0, 22) + '…' : m.name;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text(name, M + 2, y + 4.2);

        // Entrada (+)
        if (m.entrada > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GREEN);
            doc.text(`+${m.entrada}`, M + halfWidth - 18, y + 4.2, { align: 'right' });
        } else {
            doc.setTextColor(...MUTED);
            doc.text('-', M + halfWidth - 18, y + 4.2, { align: 'right' });
        }

        // Salida (-)
        if (m.salida > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...RED);
            doc.text(`-${m.salida}`, M + halfWidth - 2, y + 4.2, { align: 'right' });
        } else {
            doc.setTextColor(...MUTED);
            doc.text('-', M + halfWidth - 2, y + 4.2, { align: 'right' });
        }
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M, y + 6, M + halfWidth, y + 6);
        y += 6;
    });

    // --- Columna Derecha: Más Vendidos ---
    y = startY3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    doc.text('TOP PRODUCTOS VENDIDOS', M + halfWidth + 10, y);
    y += 5;

    doc.setFillColor(...BG_LIGHT);
    doc.rect(M + halfWidth + 10, y, halfWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    doc.text('Cant', M + halfWidth + 12, y + 4.2);
    doc.text('Producto', M + halfWidth + 22, y + 4.2);
    doc.text('Ingresos COP', M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
    y += 6;

    topProducts.forEach((p) => {
        const name = p.name.length > 20 ? p.name.substring(0, 20) + '…' : p.name;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BODY);
        doc.text(`${p.qty}u`, M + halfWidth + 12, y + 4.2);
        doc.text(name, M + halfWidth + 22, y + 4.2);
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(formatCOP(p.revenue), M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M + halfWidth + 10, y + 6, M + halfWidth * 2 + 10, y + 6);
        y += 6;
    });

    y = Math.max(y, startY3 + section3Height);
    y += 4;
    drawDivider(y);
    // --- Sección: Actividad de Juego (Horas y Partidas) ---
    const gameStats = computeGameStats(visibleSales);

    if (gameStats.totalHours > 0 || gameStats.totalRounds > 0 || gameStats.hoursRevenue > 0 || gameStats.roundsRevenue > 0 || gameStats.totalRevenue > 0) {
        const sectionGameHeight = 25;
        checkPageBreak(sectionGameHeight);
        const startYGame = y;

        // --- Columna Izquierda: Tiempo de Juego ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        doc.text('ACTIVIDAD DE TIEMPO (MESAS)', M, y);
        y += 5;

        doc.setFillColor(...BG_LIGHT);
        doc.rect(M, y, halfWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...INK);
        doc.text('Concepto', M + 2, y + 4.2);
        doc.text('Valor', M + halfWidth - 2, y + 4.2, { align: 'right' });
        y += 6;

        // Fila 1: Horas facturadas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Horas Facturadas (Cobro)', M + 2, y + 4.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(`${formatGameHours(gameStats.totalHours)}`, M + halfWidth - 2, y + 4.2, { align: 'right' });
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M, y + 6, M + halfWidth, y + 6);
        y += 6;

        // Fila 2: Recaudo por tiempo
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Recaudo por Tiempo', M + 2, y + 4.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREEN);
        doc.text(formatCOP(gameStats.hoursRevenue), M + halfWidth - 2, y + 4.2, { align: 'right' });
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M, y + 6, M + halfWidth, y + 6);
        y += 6;

        // --- Columna Derecha: Actividad de Jugadas ---
        y = startYGame;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        doc.text('ACTIVIDAD DE JUGADAS', M + halfWidth + 10, y);
        y += 5;

        doc.setFillColor(...BG_LIGHT);
        doc.rect(M + halfWidth + 10, y, halfWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...INK);
        doc.text('Concepto', M + halfWidth + 12, y + 4.2);
        doc.text('Valor', M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
        y += 6;

        // Fila 1: Jugadas facturadas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Jugadas Facturadas', M + halfWidth + 12, y + 4.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(`${gameStats.totalRounds} u`, M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M + halfWidth + 10, y + 6, M + halfWidth * 2 + 10, y + 6);
        y += 6;

        // Fila 2: Recaudo por partidas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        doc.text('Recaudo por Partidas', M + halfWidth + 12, y + 4.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREEN);
        doc.text(formatCOP(gameStats.roundsRevenue), M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
        
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M + halfWidth + 10, y + 6, M + halfWidth * 2 + 10, y + 6);
        y += 6;

        y = Math.max(y, startYGame + sectionGameHeight);
        y += 4;
        drawDivider(y);
        y += 8;
    }

    // --- Sección: Propinas del Personal ---
    const detailedTips = [];
    const tipsByUser = {};
    let totalTipsAmt = 0;

    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            const nameLower = (item.name || '').toLowerCase();
            if (item.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario')) {
                const user = s.meseroNombre || s.vendedorNombre || 'Sistema';
                const amt = (item.priceUsd || 0) * (item.qty || 1);
                if (amt > 0) {
                    tipsByUser[user] = (tipsByUser[user] || 0) + amt;
                    totalTipsAmt += amt;
                    detailedTips.push({
                        saleRef: `#${s.saleNumber || s.sale_number || s.id.substring(0, 6).toUpperCase()}`,
                        client: s.customerName || 'Consumidor Final',
                        user: user,
                        amount: amt,
                        time: new Date(s.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                    });
                }
            }
        });
    });

    const tipsUserRows = Object.keys(tipsByUser).length;
    const tipsDetailRows = detailedTips.length;

    if (totalTipsAmt > 0) {
        const sectionTipsHeight = Math.max(tipsUserRows, tipsDetailRows) * 6 + 20;
        checkPageBreak(sectionTipsHeight);
        const startYTips = y;

        // --- Columna Izquierda: Resumen de Propinas ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        doc.text('RESUMEN DE PROPINAS POR PERSONAL', M, y);
        y += 5;

        doc.setFillColor(...BG_LIGHT);
        doc.rect(M, y, halfWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...INK);
        doc.text('Mesero / Cajero', M + 2, y + 4.2);
        doc.text('Total Propina', M + halfWidth - 2, y + 4.2, { align: 'right' });
        y += 6;

        Object.entries(tipsByUser).forEach(([user, amt]) => {
            const userName = user.length > 22 ? user.substring(0, 20) + '…' : user;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(toTitleCase(userName || ''), M + 2, y + 4.2);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GREEN);
            doc.text(formatCOP(amt), M + halfWidth - 2, y + 4.2, { align: 'right' });

            doc.setDrawColor(...RULE);
            doc.setLineWidth(0.2);
            doc.line(M, y + 6, M + halfWidth, y + 6);
            y += 6;
        });

        // --- Columna Derecha: Detalle de Propinas por Venta ---
        y = startYTips;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        doc.text('DETALLE DE PROPINAS POR VENTA', M + halfWidth + 10, y);
        y += 5;

        doc.setFillColor(...BG_LIGHT);
        doc.rect(M + halfWidth + 10, y, halfWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...INK);
        doc.text('Ref / Hora', M + halfWidth + 12, y + 4.2);
        doc.text('Cliente', M + halfWidth + 33, y + 4.2);
        doc.text('Mesero', M + halfWidth + 56, y + 4.2);
        doc.text('Propina', M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });
        y += 6;

        detailedTips.forEach((dt) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...BODY);
            doc.text(`${dt.saleRef} (${dt.time})`, M + halfWidth + 12, y + 4.2);
            
            const clientStr = dt.client.length > 10 ? dt.client.substring(0, 8) + '…' : dt.client;
            doc.text(toTitleCase(clientStr || ''), M + halfWidth + 33, y + 4.2);

            const userStr = dt.user.length > 10 ? dt.user.substring(0, 8) + '…' : dt.user;
            doc.text(toTitleCase(userStr || ''), M + halfWidth + 56, y + 4.2);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INK);
            doc.text(formatCOP(dt.amount), M + halfWidth * 2 + 7, y + 4.2, { align: 'right' });

            doc.setDrawColor(...RULE);
            doc.setLineWidth(0.2);
            doc.line(M + halfWidth + 10, y + 6, M + halfWidth * 2 + 10, y + 6);
            y += 6;
        });

        y = Math.max(y, startYTips + sectionTipsHeight);
        y += 4;
        drawDivider(y);
        y += 8;
    }

    // ════════════════════════════════════
    //  4. HISTORIAL DETALLADO DE VENTAS
    // ════════════════════════════════════
    drawSectionTitle('Historial Detallado de Ventas');

    // Tabla de Ventas principal
    doc.setFillColor(...BG_LIGHT);
    doc.rect(M, y, WIDTH - M * 2, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Hora / Ref', M + 2, y + 5.5);
    doc.text('Cliente', M + 26, y + 5.5);
    doc.text('Artículos Detalle', M + 58, y + 5.5);
    doc.text('Transacción / Pago', M + 115, y + 5.5);
    doc.text('Total Venta', RIGHT - 2, y + 5.5, { align: 'right' });
    
    y += 8;

    visibleSales.forEach((s) => {
        const d = new Date(s.timestamp);
        const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const ref = `#${s.saleNumber || s.sale_number || ''}`;
        const isCanceled = s.status === 'ANULADA';
        const cliente = s.customerName || 'Consumidor Final';

        const grossItemsTotal = (s.items || []).reduce((sum, item) => sum + (Number(item.priceUsd) || Number(item.price) || 0) * (Number(item.qty) || 1), 0);
        const netSaleTotal = isCanceled ? 0 : FinancialEngine.calculateSaleNetTotal(s);
        const isFiadoSale = s.tipo === 'VENTA_FIADA' || (s.fiadoUsd && s.fiadoUsd > 0);
        const fiadoAmount = s.fiadoUsd || (s.tipo === 'VENTA_FIADA' ? netSaleTotal : 0);

        // Estimar líneas totales de ítems de forma dinámica
        let dynamicItemsLines = 0;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        (s.items || []).forEach(item => {
            const lines = doc.splitTextToSize(item.name || '', 54);
            dynamicItemsLines += Math.max(lines.length, 1);
        });

        const numPayments = (s.payments || []).length + (isFiadoSale ? 2 : 0);
        
        // Estimar altura necesaria para esta fila
        const itemsHeight = Math.max(dynamicItemsLines, 1) * 4;
        const payHeight = Math.max(numPayments, 1) * 4.2;
        const rowHeight = Math.max(itemsHeight, payHeight) + 8;

        checkPageBreak(rowHeight);

        // Fondo alternado para legibilidad corporativa
        doc.setFillColor(254, 254, 255);
        doc.rect(M, y, WIDTH - M * 2, rowHeight, 'F');

        // Hora y Ref
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...INK);
        doc.text(hora, M + 2, y + 5.5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BLUE);
        doc.text(ref, M + 2, y + 9.5);

        // Cliente
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BODY);
        const clienteStr = cliente.length > 18 ? cliente.substring(0, 16) + '…' : cliente;
        doc.text(clienteStr, M + 26, y + 5.5);

        // Lista de Artículos (Detalle completo dinámico sin cortar)
        let itemY = y + 5.5;
        if (s.items && s.items.length > 0) {
            s.items.forEach(item => {
                const qty = item.isWeight ? `${item.qty.toFixed(2)}kg` : `${item.qty}u`;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(...INK);
                doc.text(qty, M + 56, itemY);
                
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...BODY);
                const nameLines = doc.splitTextToSize(item.name || '', 54);
                nameLines.forEach((lineText, idx) => {
                    doc.text(lineText, M + 64, itemY + (idx * 3.5));
                });
                
                itemY += nameLines.length * 3.5 + 0.8;
            });
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.5);
            doc.text('Sin productos', M + 56, itemY);
        }

        // Métodos de Pago y Desglose de Transacción
        let payY = y + 5.5;

        if (isFiadoSale && grossItemsTotal > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...BODY);
            doc.text(`Cuenta Total: ${formatCOP(grossItemsTotal)}`, M + 120, payY);
            payY += 4;
        }

        if (s.payments && s.payments.length > 0) {
            s.payments.forEach(p => {
                const label = toTitleCase(p.methodLabel || getPaymentLabel(p.methodId) || 'Pago');
                const isUsd = p.amountOriginalCurrency === 'USD';
                const val = isUsd 
                    ? `$ ${formatUsd(p.amountOriginal)} USD` 
                    : formatCOP(p.amountUsd !== undefined ? p.amountUsd : p.amount);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor(...BODY);
                const prefix = isFiadoSale ? 'Abono ' : '';
                doc.text(`${prefix}${label}: ${val}`, M + 120, payY);
                payY += 4;
            });
        } else if (s.paymentMethod) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...BODY);
            doc.text(`Pago: ${getPaymentLabel(s.paymentMethod)}`, M + 120, payY);
            payY += 4;
        }

        if (isFiadoSale && fiadoAmount > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(...RED);
            doc.text(`Saldo Fiado: ${formatCOP(fiadoAmount)}`, M + 120, payY);
            payY += 4;
        }

        // Cambio si aplica
        if (s.changeUsd && s.changeUsd > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...RED);
            doc.text(`Cambio: ${formatCOP(s.changeUsd)}`, M + 120, payY);
            payY += 4;
        }

        // Monto Total Venta (Extremo Derecho): Verde si es cobro real ingresado a caja; Rojo si es Saldo Fiado o Anulada
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...((isCanceled || isFiadoSale) ? RED : GREEN));
        const totalStr = isCanceled ? 'ANULADA' : formatCOP(netSaleTotal);
        doc.text(totalStr, RIGHT - 2, y + 6.5, { align: 'right' });

        y += rowHeight;

        // Línea divisora sutil entre filas
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(M, y, RIGHT, y);
    });

    y += 10;
    
    // ════════════════════════════════════
    //  PIE DE PÁGINA FINAL
    // ════════════════════════════════════
    checkPageBreak(25);
    
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.5);
    doc.line(M, y, RIGHT, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Pool Imperial Bar', CX, y, { align: 'center' });
    y += 4.5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BODY);
    doc.text('Reporte administrativo interno de control de caja diario. Sin valor fiscal.', CX, y, { align: 'center' });
    y += 3.5;
    doc.text(`Generado el ${now.toLocaleString('es-CO')} · ID de Cierre: ${cierreNum || 'N/A'}`, CX, y, { align: 'center' });

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

    // En PC (desktop) descarga directo; en móvil usa la API de Compartir
    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: `Cierre del Día ${dateStr}`, files: [file] })
            .catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
