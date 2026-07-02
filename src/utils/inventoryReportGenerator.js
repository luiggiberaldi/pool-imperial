import { jsPDF } from 'jspdf';
import { capitalizeName } from './calculatorUtils';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Genera un PDF (A4) del reporte de inventario actual (filtrado o completo).
 *
 * @param {Array} products      Lista de productos a reportar (filtrados o completos)
 * @param {Array} categories    Lista de categorías registradas en el sistema
 * @param {Object} meta         { search, activeCategoryLabel, businessName }
 */
export function generateInventoryReportPDF(products = [], categories = [], meta = {}) {
    const {
        search = '',
        activeCategoryLabel = 'Todos',
        businessName = localStorage.getItem('business_name') || 'Pool Imperial',
    } = meta;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 14;
    const RIGHT = PW - M;

    const INK = [33, 37, 41];
    const MUTED = [120, 128, 138];
    const RULE = [210, 215, 222];
    const RED = [220, 38, 38];
    const HEADBG = [238, 240, 245];

    // --- Cálculos de Totales ---
    const totalProductsCount = products.length;
    const totalStockSum = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const lowStockCount = products.filter(p => {
        const limit = p.lowStockAlert !== undefined ? p.lowStockAlert : 5;
        return (p.stock || 0) <= limit;
    }).length;

    const totalCostValuation = products.reduce((acc, p) => acc + (p.stock || 0) * (p.costUsd || 0), 0);
    const totalRetailValuation = products.reduce((acc, p) => acc + (p.stock || 0) * (p.priceUsdt || 0), 0);
    const potentialProfit = totalRetailValuation - totalCostValuation;

    const averageMargin = (() => {
        let count = 0;
        let sum = 0;
        products.forEach(p => {
            if (p.costUsd > 0) {
                sum += ((p.priceUsdt - p.costUsd) / p.costUsd) * 100;
                count++;
            }
        });
        return count > 0 ? sum / count : 0;
    })();

    let y = M;

    // ── Encabezado ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Reporte de Inventario', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(businessName, RIGHT, y, { align: 'right' });
    y += 7;

    // ── Filtros aplicados ──
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const filtros = [];
    filtros.push(`Categoría: ${activeCategoryLabel}`);
    if (search && search.trim()) filtros.push(`Búsqueda: "${search.trim()}"`);
    const generado = new Date().toLocaleString('es-CO');
    doc.text(filtros.join('   ·   '), M, y);
    y += 5;
    doc.text(`Generado: ${generado}`, M, y);
    y += 8;

    // ── Tarjetas Resumen (KPIs) ──
    const gap = 4;
    const boxWidth = (RIGHT - M - gap * 2) / 3;
    const boxHeight = 22;

    // Caja 1: Resumen General
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('RESUMEN GENERAL', M + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Productos únicos:', M + 3, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalProductsCount), M + 32, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text('Stock total:', M + 3, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalStockSum), M + 32, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.text('Bajo stock:', M + 3, y + 18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED);
    doc.text(String(lowStockCount), M + 32, y + 18);

    // Caja 2: Valorización
    const x2 = M + boxWidth + gap;
    doc.setFillColor(248, 250, 252);
    doc.setTextColor(...INK);
    doc.roundedRect(x2, y, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('VALORIZACIÓN', x2 + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Total a Costo:', x2 + 3, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCOP(totalCostValuation), x2 + 24, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text('Total a Venta:', x2 + 3, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 124, 65);
    doc.text(formatCOP(totalRetailValuation), x2 + 24, y + 15);

    // Caja 3: Rendimiento
    const x3 = x2 + boxWidth + gap;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x3, y, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('RENDIMIENTO ESTIMADO', x3 + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Margen Prom.:', x3 + 3, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${averageMargin.toFixed(1)}%`, x3 + 28, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text('Ganancia Pot.:', x3 + 3, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text(formatCOP(potentialProfit), x3 + 28, y + 15);

    y += boxHeight + 10;

    // ── Encabezado de tabla ──
    const COLS = {
        num: M + 2,
        product: M + 8,
        category: M + 65,
        cost: M + 97,
        price: M + 116,
        stock: M + 130,
        totalCost: M + 160,
        totalRetail: RIGHT,
    };

    const drawTableHeader = () => {
        doc.setFillColor(...HEADBG);
        doc.rect(M, y - 4, PW - M * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text('N°', COLS.num, y);
        doc.text('PRODUCTO', COLS.product, y);
        doc.text('CATEGORÍA', COLS.category, y);
        doc.text('COSTO', COLS.cost, y, { align: 'right' });
        doc.text('PRECIO', COLS.price, y, { align: 'right' });
        doc.text('STOCK', COLS.stock, y, { align: 'right' });
        doc.text('VAL. COSTO', COLS.totalCost, y, { align: 'right' });
        doc.text('VAL. VENTA', COLS.totalRetail, y, { align: 'right' });
        y += 7;
    };

    drawTableHeader();

    const trunc = (str, n) => {
        const s = String(str || '');
        return s.length > n ? s.substring(0, n - 1) + '…' : s;
    };

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    products.forEach((p, i) => {
        if (y > PH - 18) {
            doc.addPage();
            y = M;
            drawTableHeader();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
        }

        const num = String(i + 1);
        const name = p.name + (p.isCombo ? ' (Combo)' : '');
        const catInfo = categories.find(c => c.id === p.category);
        const categoryLabel = catInfo ? catInfo.label : capitalizeName(p.category || 'Otros');

        const cost = p.costUsd || 0;
        const price = p.priceUsdt || 0;
        const stockVal = p.stock ?? 0;
        const valCost = cost * stockVal;
        const valRetail = price * stockVal;

        const limit = p.lowStockAlert !== undefined ? p.lowStockAlert : 5;
        const isLowStock = stockVal <= limit;

        // Fondo alternativo para filas
        if (i % 2 === 1) {
            doc.setFillColor(248, 249, 251);
            doc.rect(M, y - 4.2, PW - M * 2, 6.2, 'F');
        }

        doc.setTextColor(...INK);
        doc.text(num, COLS.num, y);
        doc.text(trunc(name, 35), COLS.product, y);
        doc.text(trunc(categoryLabel, 18), COLS.category, y);
        doc.text(cost > 0 ? formatCOP(cost) : '-', COLS.cost, y, { align: 'right' });
        doc.text(formatCOP(price), COLS.price, y, { align: 'right' });

        if (isLowStock) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...RED);
        }
        doc.text(String(stockVal), COLS.stock, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...INK);

        doc.text(valCost > 0 ? formatCOP(valCost) : '-', COLS.totalCost, y, { align: 'right' });
        doc.text(formatCOP(valRetail), COLS.totalRetail, y, { align: 'right' });

        y += 6.2;
    });

    // ── Resumen Final del Catálogo ──
    if (y > PH - 20) { doc.addPage(); y = M; }
    doc.setDrawColor(...RULE);
    doc.line(M, y, RIGHT, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('TOTALES DE INVENTARIO VALORIZADO:', M, y);
    
    doc.setFont('helvetica', 'bold');
    doc.text(formatCOP(totalCostValuation), COLS.totalCost, y, { align: 'right' });
    doc.text(formatCOP(totalRetailValuation), COLS.totalRetail, y, { align: 'right' });

    // ── Descargar / compartir en móvil ──
    const safe = (search && search.trim() ? '_' + search.trim().replace(/[^a-z0-9]/gi, '') : '');
    const filename = `reporte_inventario${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Reporte de Inventario', files: [file] }).catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
